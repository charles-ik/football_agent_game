"""Deterministic support staff, agency identity and seasonal development rules."""
from dataclasses import asdict
from functools import lru_cache

from .agency_models import SupportStaff
from . import calendar as cal
from .balance import load_data
from .events import ev
from .rng import stream


@lru_cache(maxsize=1)
def config():
    return load_data("agency_expansion.json")


def _deals(world):
    return sum(c.deals_done for c in world.clients.values())


def _candidates(world):
    r = stream(world.seed, world.week, "agency.support_candidates")
    cfg = config()["staff"]
    names = load_data("names.json")
    result = []
    for role in ("client_manager", "club_liaison"):
        for _ in range(cfg["candidates_per_role"]):
            quality = r.randint(cfg["quality_min"], cfg["quality_max"])
            wage = cfg["base_wage"] + quality * cfg["quality_wage"]
            result.append(SupportStaff(-(world.week * 10 + len(result) + 1),
                f'{r.choice(names["first_names"])} {r.choice(names["surnames_common"])}',
                role, quality, wage, wage * cfg["hire_weeks"], cfg["portfolio_capacity"]))
    return result


def initialize(world, balance):
    d = world.agency_development
    if not d.initialized:
        d.initialized = True
        d.observed_clients = sorted(world.clients)
        d.observed_deals = _deals(world)
        d.observed_player_deals = {pid: c.deals_done for pid, c in world.clients.items()}
        d.observed_hq = world.agency.hq_level
        _reset_objective(world)
    if d.candidate_week != world.week:
        d.candidates = _candidates(world)
        d.candidate_week = world.week


def _reset_objective(world):
    d = world.agency_development
    d.objective_season = world.season
    d.objective_baseline_clients = len(world.clients)
    d.objective_baseline_deals = _deals(world)
    d.objective_baseline_cash = world.agency.cash
    d.objective_completed = False
    d.objective_deals_earned = 0
    d.stability_weeks = 0


def support_cost(world):
    d = world.agency_development
    return sum(s.wage for s in d.staff) + sum(config()["departments"][k]["weekly_cost"] * v for k, v in d.departments.items())


def client_support(world, pid):
    d = world.agency_development
    staff = max((s.quality / 100 for s in d.staff if s.role == "client_manager" and pid in s.player_ids), default=0)
    return min(config()["staff"]["trust_cap"], staff * config()["staff"]["trust_max"] + department_bonus(world, "client_services") + (config()["specializations"]["careers_trust"] if d.specialization == "careers" else 0))


def department_bonus(world, department):
    return world.agency_development.departments.get(department, 0) * config()["departments"][department]["bonus"]


def scouting_bonus(world, player_age=None):
    d = world.agency_development
    return department_bonus(world, "scouting") + (config()["specializations"]["youth_scouting"] if d.specialization == "youth" and player_age is not None and player_age <= config()["specializations"]["youth_age"] else 0)


def relationship_bonus(world, club_id=None):
    d = world.agency_development
    staff = max((s.quality / 100 for s in d.staff if s.role == "club_liaison" and club_id in s.club_ids), default=0)
    return staff * config()["staff"]["relationship_max"] + department_bonus(world, "networking") + (config()["specializations"]["deals_relationship"] if d.specialization == "deals" else 0)


def _progress(world):
    d = world.agency_development
    return max(0, {"growth": len(world.clients) - d.objective_baseline_clients,
        "careers": d.objective_deals_earned,
        "stability": d.stability_weeks}[d.objective])


def run(world, r, balance):
    initialize(world, balance)
    d = world.agency_development
    if d.last_run_week == world.week:
        return []
    d.last_run_week = world.week
    events = []
    new_clients = set(world.clients) - set(d.observed_clients)
    deal_clients = {pid for pid, c in world.clients.items() if c.deals_done > d.observed_player_deals.get(pid, 0)}
    earned = sum(world.clients[pid].deals_done - d.observed_player_deals.get(pid, 0) for pid in deal_clients)
    d.objective_deals_earned += earned
    checks = {"first_signing": bool(new_clients), "first_deal": bool(deal_clients),
        "expansion": world.agency.hq_level > d.observed_hq,
        "top_tier": any(world.players[p].club_id in world.clubs and world.clubs[world.players[p].club_id].tier == 1 for p in new_clients)}
    # A newly completed deal can also be the first move into a top-tier club.
    if checks["first_deal"]:
        checks["top_tier"] |= any(world.clubs.get(p.club_id) and world.clubs[p.club_id].tier == 1 for p in (world.players[pid] for pid in deal_clients))
    for key, achieved in checks.items():
        if achieved and key not in d.milestones:
            d.milestones[key] = world.week
            events.append(ev("agency.milestone", f'Milestone: {key.replace("_", " ")}.', world.week, milestone=key))
    for staff in d.staff:
        staff.player_ids = [p for p in staff.player_ids if p in world.clients]
        staff.club_ids = [cid for cid in staff.club_ids if cid in world.clubs]
    if d.objective_season != world.season:
        events.extend(_complete_objective(world))
        review = {"season": d.objective_season, "objective": d.objective, "completed": d.objective_completed, "progress": _progress(world), "target": config()["objectives"][d.objective]["target"]}
        d.reviews.append(review)
        events.append(ev("agency.season_review", f'Season {d.objective_season}: {d.objective} objective {"completed" if d.objective_completed else "unfinished"}.', world.week, **review))
        _reset_objective(world)
    d.stability_weeks = d.stability_weeks + 1 if world.agency.cash >= 0 else 0
    events.extend(_complete_objective(world))
    d.observed_clients = sorted(world.clients)
    d.observed_deals = _deals(world)
    d.observed_player_deals = {pid: c.deals_done for pid, c in world.clients.items()}
    d.observed_hq = world.agency.hq_level
    return events


def _complete_objective(world):
    d = world.agency_development
    objective = config()["objectives"][d.objective]
    if not d.objective_completed and _progress(world) >= objective["target"]:
        d.objective_completed = True
        world.agency.reputation = min(100, world.agency.reputation + objective["reward"])
        return [ev("agency.objective", f'{d.objective.title()} objective completed: +{objective["reward"]} reputation.', world.week)]
    return []


def state(world, balance):
    d = world.agency_development
    cfg = config()
    from .systems.finance import weekly_burn
    net = weekly_burn(world, balance)
    def quote(cost, weekly_cost):
        after = net - weekly_cost
        return {"cash_after": world.agency.cash - cost, "weekly_net_after": after, "runway_weeks": max(0, (world.agency.cash - cost) / -after) if after < 0 else None}
    return {"shortlisted_players": list(d.shortlisted_players), "finance": {"weekly_net": net, "runway_weeks": max(0, world.agency.cash / -net) if net < 0 else None}, "identity": {"emblem": d.emblem, "accent": d.accent, "emblems": cfg["emblems"], "accents": cfg["accents"]},
        "staff": [asdict(s) for s in d.staff], "candidates": [{**asdict(s), "quote": quote(s.hire_cost, s.wage)} for s in (d.candidates if d.candidate_week == world.week else _candidates(world))],
        "support_slots": world.agency.hq_level, "support_weekly_cost": support_cost(world),
        "departments": [{"id": k, "level": d.departments.get(k, 0), "upgrade_cost": v["upgrade_cost"] * (d.departments.get(k, 0) + 1), "weekly_cost": v["weekly_cost"] * d.departments.get(k, 0), "next_weekly_cost": v["weekly_cost"] * (d.departments.get(k, 0) + 1), "quote": quote(v["upgrade_cost"] * (d.departments.get(k, 0) + 1), v["weekly_cost"]), "can_upgrade": d.departments.get(k, 0) < world.agency.hq_level and world.agency.cash >= v["upgrade_cost"] * (d.departments.get(k, 0) + 1)} for k, v in cfg["departments"].items()],
        "specialization": d.specialization, "specialization_options": ["generalist", "youth", "careers", "deals"],
        "can_specialize": (_deals(world) > 0 or world.agency.total_commission > 0) and (d.specialization == "generalist" or cal.season_week(balance, world.week) == 1) and d.specialization_changed_season != world.season,
        "objective": {"id": d.objective, "season": d.objective_season, "progress": _progress(world), "target": cfg["objectives"][d.objective]["target"], "reward": cfg["objectives"][d.objective]["reward"], "completed": d.objective_completed},
        "objective_options": [{"id": key, **value} for key, value in cfg["objectives"].items()],
        "reviews": [dict(x) for x in d.reviews], "milestones": dict(d.milestones)}


def action(world, balance, operation, payload):
    from .actions import ActionResult
    from .world import hq_level
    initialize(world, balance)
    d = world.agency_development
    cfg = config()
    def fail(message):
        return ActionResult(False, message)
    if not isinstance(payload, dict):
        return fail("Action payload must be an object.")
    if world.game_over or world.agency.bankrupt:
        return fail("This agency has closed.")
    if operation == "shortlist":
        pid = payload.get("player_id")
        if pid not in world.reports:
            return fail("Only a scouted player can be shortlisted.")
        if pid in d.shortlisted_players:
            d.shortlisted_players.remove(pid)
        else:
            d.shortlisted_players.append(pid)
        return ActionResult(True, "Shortlist updated.")
    if operation == "identity":
        emblem, accent = payload.get("emblem", d.emblem), payload.get("accent", d.accent)
        if emblem not in cfg["emblems"] or accent not in cfg["accents"]:
            return fail("Choose an available emblem and accent.")
        d.emblem, d.accent = emblem, accent
    elif operation == "hire":
        candidate = next((s for s in d.candidates if s.id == payload.get("candidate_id")), None)
        if not candidate:
            return fail("That candidate is no longer available.")
        if len(d.staff) >= world.agency.hq_level:
            return fail("Upgrade headquarters or free a support staff slot.")
        if world.agency.cash < candidate.hire_cost:
            return fail("Not enough cash for the hiring fee.")
        world.agency.cash -= candidate.hire_cost
        from .systems.finance import record_investment
        record_investment(world, candidate.hire_cost)
        d.candidates.remove(candidate)
        candidate.id = world.allocate_id()
        d.staff.append(candidate)
    elif operation in ("fire", "assign"):
        staff = next((s for s in d.staff if s.id == payload.get("staff_id")), None)
        if not staff:
            return fail("Support staff member not found.")
        if operation == "fire":
            d.staff.remove(staff)
        else:
            field = "player_ids" if staff.role == "client_manager" else "club_ids"
            ids = payload.get(field, [])
            available = world.clients if staff.role == "client_manager" else world.clubs
            label = "clients" if staff.role == "client_manager" else "clubs"
            if not isinstance(ids, list) or any(type(p) is not int for p in ids) or len(ids) != len(set(ids)) or any(p not in available for p in ids):
                return fail(f"Choose distinct current {label}.")
            if len(ids) > staff.capacity:
                return fail("That portfolio exceeds this staff member's capacity.")
            if any(set(ids) & set(getattr(s, field)) for s in d.staff if s.id != staff.id):
                return fail(f"Each portfolio entry can have only one assigned staff member.")
            setattr(staff, field, list(ids))
    elif operation == "upgrade_department":
        key = payload.get("department")
        if not isinstance(key, str) or key not in cfg["departments"]:
            return fail("Unknown department.")
        level = d.departments.get(key, 0)
        cost = cfg["departments"][key]["upgrade_cost"] * (level + 1)
        if level >= world.agency.hq_level:
            return fail("Upgrade headquarters before developing this department further.")
        if world.agency.cash < cost:
            return fail("Not enough cash for this department upgrade.")
        world.agency.cash -= cost
        from .systems.finance import record_investment
        record_investment(world, cost)
        d.departments[key] = level + 1
    elif operation == "specialization":
        key = payload.get("specialization")
        if key not in ("generalist", "youth", "careers", "deals") or not state(world, balance)["can_specialize"]:
            return fail("Specialization unlocks after a deal; changes are available at a season boundary.")
        d.specialization = key
        d.specialization_changed_season = world.season
    elif operation == "objective":
        key = payload.get("objective")
        if not isinstance(key, str) or key not in cfg["objectives"] or cal.season_week(balance, world.week) != 1 or d.objective_completed:
            return fail("Choose a seasonal objective at the start of the season.")
        d.objective = key
        _reset_objective(world)
    elif operation == "downsize":
        level = world.agency.hq_level - 1
        if level < 1:
            return fail("Already at the smallest headquarters.")
        target = hq_level(balance, level)
        if len(world.scouts) > target.scout_cap or len(world.clients) > target.client_cap or len(d.staff) > level or any(v > level for v in d.departments.values()):
            return fail("Reduce scouts, clients, staff or departments to fit the smaller headquarters.")
        world.agency.hq_level = level
    elif operation == "downgrade_department":
        key = payload.get("department")
        if not isinstance(key, str) or d.departments.get(key, 0) <= 0:
            return fail("That department is already at its base level.")
        d.departments[key] -= 1
    else:
        return fail("Unknown agency action.")
    message = {"hire": "Support staff hired.", "fire": "Support staff released.", "assign": "Client portfolio updated.", "identity": "Agency identity updated.", "upgrade_department": "Department upgraded.", "downgrade_department": "Department reduced.", "specialization": "Specialization updated.", "objective": "Seasonal objective selected.", "downsize": "Moved to smaller headquarters."}[operation]
    return ActionResult(True, message, [ev("agency." + operation, message, world.week)])
