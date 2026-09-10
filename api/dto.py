"""The DTO layer — hand-written engine -> wire mappers.

This module is the game's information barrier. The CLI hides abilities by
never printing them; a browser client hides them only if we never send them.
So: explicit field lists, no ``dataclasses.asdict``, no ``vars()``, no
``serde.encode`` (that function exists for save files, where leaking is fine).

Never in a response body: ``Player.ability``, ``Player.potential``,
``Negotiation.threshold``, the world seed, or the negotiation-tuning block of
balance.json. Ability reaches the wire only as a scouting-report range or an
already-derived label (playing time), exactly as the CLI shows it.
"""

from __future__ import annotations

from typing import Any, Dict, List

from football_agent.engine import actions
from football_agent.engine import calendar as cal
from football_agent.engine import reputation as reputation_module
from football_agent.engine.balance import Balance
from football_agent.engine.decisions import Decision, open_decisions
from football_agent.engine.economy import format_money, market_value
from football_agent.engine.events import Event
from football_agent.engine.models import Interest, Player, Scout, ScoutingReport, World
from football_agent.engine.systems import league as league_system
from football_agent.engine.systems import scouting as scouting_system
from football_agent.engine.systems import trust as trust_system
from football_agent.engine.systems.development import playing_time
from football_agent.engine.systems.finance import weekly_burn
from football_agent.engine.world import hq_level, hq_levels

from .session import Session

# Kinds the history feed never shows. These are either pure chrome (the status
# bar already says which week it is), or per-week bookkeeping that the Finances
# screen presents far better than a repeated one-line entry. Leaving them in
# meant the feed said the same three things every single week, which is how a
# feed teaches you not to read it.
NOISE_KINDS = {
    "finance.retainer",
    "finance.costs",
    "league.round",
    "scouting.narrowed",
    "week.advanced",
    # A standing condition, not news. It is a decision-adjacent warning shown on
    # the dashboard and the Scouting screen for as long as it is true, rather
    # than a fresh line in the log every week it stays true.
    "scouting.idle",
}


def money(amount: float) -> Dict[str, Any]:
    """Money always crosses the wire preformatted — format_money has the game's voice."""
    return {"amount": round(float(amount), 2), "text": format_money(amount)}


def signed_money(amount: float) -> Dict[str, Any]:
    """A preformatted signed amount for deltas shown next to a current value."""
    value = money(amount)
    if value["amount"] > 0:
        value["text"] = f"+{value['text']}"
    return value


def event_dto(event: Event) -> Dict[str, Any]:
    return {
        "kind": event.kind,
        "message": event.message,
        "week": event.week,
        "severity": event.severity.value,
        "data": dict(event.data),
    }


# ---------------------------------------------------------------------------
# Decisions
# ---------------------------------------------------------------------------


def decision_dto(decision: Decision) -> Dict[str, Any]:
    """One open obligation. `href` is computed here so every surface that shows
    a decision — rail, dashboard, nav badge — routes it to the same place."""
    if decision.player_id is not None and decision.interest_id is not None:
        href = f"/clients/{decision.player_id}?negotiate={decision.interest_id}"
    elif decision.player_id is not None:
        href = f"/clients/{decision.player_id}"
    else:
        href = "/"
    return {
        "id": decision.id,
        "kind": decision.kind,
        "severity": decision.severity.value,
        "headline": decision.headline,
        "detail": decision.detail,
        "player_id": decision.player_id,
        "interest_id": decision.interest_id,
        "weeks_left": decision.weeks_left,
        "actionable": decision.actionable,
        "blocked_reason": decision.blocked_reason,
        "href": decision.extra.get("href", href),
        "extra": _decision_extra(decision.extra),
    }


# Money in `extra` crosses the wire preformatted like every other figure, so the
# UI never reimplements format_money's voice.
_MONEY_KEYS = ("max_wage", "current_wage", "wage_delta")


def _decision_extra(extra: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(extra)
    for key in _MONEY_KEYS:
        if key in out:
            out[key] = money(out[key])
    return out


def decisions_dto(world: World, balance: Balance) -> List[Dict[str, Any]]:
    return [decision_dto(d) for d in open_decisions(world, balance)]


def player_dto(world: World, player: Player) -> Dict[str, Any]:
    rival = world.rivals.get(player.rival_agency_id) if player.rival_agency_id else None
    return {
        "id": player.id,
        "name": player.name,
        "age": player.age,
        "position": player.position.value,
        "trait": player.trait.value,
        "region_id": player.region_id,
        "club_id": player.club_id,
        "club_name": world.club_name(player.club_id),
        "injury_weeks": player.injury_weeks,
        "transfer_listed": player.transfer_listed,
        "seeking_move": player.seeking_move,
        "retired": player.retired,
        "contract": (
            {
                "wage": money(player.contract.wage),
                "expires_week": player.contract.expires_week,
                "years_signed": player.contract.years_signed,
            }
            if player.contract
            else None
        ),
        "represented_by": rival.name if rival else None,
        # NO ability. NO potential. Ever.
    }


def report_dto(report: ScoutingReport, balance: Balance) -> Dict[str, Any]:
    return {
        "ability_low": report.ability_low,
        "ability_high": report.ability_high,
        "potential_low": report.potential_low,
        "potential_high": report.potential_high,
        "confidence": scouting_system.confidence(report, balance),
        "weeks_watched": report.weeks_watched,
        "first_seen_week": report.first_seen_week,
        "region_id": report.region_id,
        "scout_id": report.scout_id,
    }


def hq_level_dto(level) -> Dict[str, Any]:
    return {
        "level": level.level,
        "name": level.name,
        "scout_cap": level.scout_cap,
        "client_cap": level.client_cap,
        "precision_bonus": level.precision_bonus,
        "weekly_cost": money(level.weekly_cost),
        "upgrade_cost": money(level.upgrade_cost),
    }


def game_state_dto(session: Session) -> Dict[str, Any]:
    world, balance = session.world, session.balance
    agency = world.agency
    level = hq_level(balance, agency.hq_level)
    # The badge counts *open* decisions, not recent ACTION events. Those two
    # numbers used to disagree constantly: the badge kept counting things you
    # had already dealt with, because an event cannot be un-emitted.
    decisions = open_decisions(world, balance)
    return {
        "agency": {
            "name": agency.name,
            "cash": money(agency.cash),
            "reputation": round(agency.reputation),
            "reputation_label": reputation_module.describe(agency.reputation),
            "hq_level": agency.hq_level,
            "hq_name": level.name,
            "total_commission": money(agency.total_commission),
            "total_costs": money(agency.total_costs),
        },
        "calendar": {
            "week": world.week,
            "season": cal.season_number(balance, world.week),
            "season_week": cal.season_week(balance, world.week),
            "description": cal.describe(balance, world.week),
            "window_open": cal.window_open(balance, world.week),
            "window_name": cal.window_name(balance, world.week),
            "weeks_until_window_closes": cal.weeks_until_window_closes(balance, world.week),
            "weeks_until_next_window": cal.weeks_until_next_window(balance, world.week),
            "is_match_week": cal.is_match_week(balance, world.week),
        },
        "counts": {
            "clients": len(world.clients),
            "client_cap": actions.client_cap(world, balance),
            "scouts": len(world.scouts),
            "scout_cap": actions.scout_cap(world, balance),
        },
        "weekly_net": money(weekly_burn(world, balance)),
        "revision": world.revision,
        "pending_actions": sum(1 for d in decisions if d.actionable),
        "game_over": world.game_over,
        "game_over_reason": world.game_over_reason,
    }


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


def client_concerns(world: World, balance: Balance, player_id: int) -> list:
    record = world.clients[player_id]
    player = world.players[player_id]
    role = playing_time(balance, player, world.clubs.get(player.club_id)).value
    out = []
    if record.trust < 60:
        out.append({"text": trust_system.describe(record.trust), "tone": "bad" if record.trust < 40 else "warn"})
    if role in ("fringe", "reserve"):
        out.append({"text": f"limited playing time ({role})", "tone": "bad"})
    if player.injury_weeks:
        out.append({"text": f"injured {player.injury_weeks}w", "tone": "warn"})
    if player.transfer_listed:
        out.append({"text": "transfer-listed", "tone": "warn"})
    return out


def client_row_dto(world: World, balance: Balance, player_id: int) -> Dict[str, Any]:
    record = world.clients[player_id]
    player = world.players[player_id]
    club = world.clubs.get(player.club_id) if player.club_id else None
    report = world.reports.get(player_id)
    agent_weeks_left = max(0, record.agent_contract.expires_week - world.week)
    return {
        "player": player_dto(world, player),
        "report": report_dto(report, balance) if report else None,
        "club_name": world.club_name(player.club_id),
        "playing_time": playing_time(balance, player, club).value,
        "wage": money(player.contract.wage) if player.contract else None,
        "club_contract_weeks_left": (
            max(0, player.contract.expires_week - world.week) if player.contract else None
        ),
        "commission_pct": record.agent_contract.commission_pct,
        "agent_contract_weeks_left": agent_weeks_left,
        "trust": round(record.trust, 1),
        "trust_label": trust_system.describe(record.trust),
        "concerns": client_concerns(world, balance, player_id),
        "flags": {
            "injured_weeks": player.injury_weeks,
            "transfer_listed": player.transfer_listed,
            "seeking_move": player.seeking_move,
            "interest_count": len(world.interests_for(player_id)),
            "agent_contract_expiring": agent_weeks_left <= 12,
        },
    }


def client_list_dto(world: World, balance: Balance) -> List[Dict[str, Any]]:
    # Sorted by true ability descending, server-side; the number itself is never sent.
    ordered = sorted(world.clients, key=lambda pid: world.players[pid].ability, reverse=True)
    return [client_row_dto(world, balance, pid) for pid in ordered]


def interest_dto(world: World, balance: Balance, interest: Interest) -> Dict[str, Any]:
    club = world.clubs[interest.club_id]
    ok, reason = actions.can_negotiate_interest(world, balance, interest.id)
    return {
        "id": interest.id,
        "club_id": interest.club_id,
        "club_name": club.name,
        "club_strength": club.strength,
        "is_renewal": interest.is_renewal,
        "urgency": interest.urgency,
        "max_wage": money(interest.max_wage),
        "max_fee": money(interest.max_fee),
        "expires_in_weeks": max(0, interest.expires_week - world.week),
        "can_negotiate": {"ok": ok, "reason": reason},
    }


def client_detail_dto(world: World, balance: Balance, player_id: int) -> Dict[str, Any]:
    player = world.players[player_id]
    row = client_row_dto(world, balance, player_id)
    club = world.clubs.get(player.club_id) if player.club_id else None
    ok, reason = actions.can_renew(world, balance, player_id)
    row.update(
        {
            "club": (
                {
                    "id": club.id,
                    "name": club.name,
                    "strength": club.strength,
                    "prestige": club.prestige,
                    "league_position": league_system.position_of(world, club.id),
                }
                if club
                else None
            ),
            # Derived true-ability numbers are allowed here and only here:
            # he is already your client, exactly as the CLI's detail screen.
            "market_value": money(market_value(balance, player, world.week)),
            "asking_price": money(actions.asking_price(world, balance, player)),
            "interests": [
                interest_dto(world, balance, i)
                for i in sorted(world.interests_for(player_id), key=lambda i: i.expires_week)
            ],
            "can_renew": {"ok": ok, "reason": reason},
        }
    )
    return row


# ---------------------------------------------------------------------------
# Scouting
# ---------------------------------------------------------------------------


def scout_dto(world: World, balance: Balance, scout: Scout) -> Dict[str, Any]:
    region = world.regions.get(scout.region_id) if scout.region_id else None
    focus = world.players.get(scout.focus_player_id) if scout.focus_player_id else None
    return {
        "id": scout.id,
        "name": scout.name,
        "quality": scout.quality,
        "wage": money(scout.wage),
        "region_id": scout.region_id,
        "region_name": region.name if region else None,
        "brief_position": scout.brief_position.value if scout.brief_position else None,
        "brief_max_age": scout.brief_max_age,
        "focus_player_id": scout.focus_player_id,
        "focus_player_name": focus.name if focus else None,
        "precision": round(scouting_system.precision(world, balance, scout), 3),
    }


def scouting_state_dto(world: World, balance: Balance) -> Dict[str, Any]:
    regions = []
    for region in sorted(world.regions.values(), key=lambda r: r.star_rating, reverse=True):
        regions.append(
            {
                "id": region.id,
                "name": region.name,
                "country": region.country,
                "star_rating": region.star_rating,
                "scouting_cost": money(region.scouting_cost),
                "expected_ability": round(
                    scouting_system.expected_ability(balance, region), 1
                ),
                "scouts_assigned": len(world.scouts_in_region(region.id)),
                "report_count": sum(
                    1 for rep in world.reports.values() if rep.region_id == region.id
                ),
            }
        )

    reports = []
    for report in world.reports.values():
        player = world.players.get(report.player_id)
        if player is None or player.retired:
            continue
        ok, reason = actions.can_approach(world, balance, player.id)
        reports.append(
            {
                "player": player_dto(world, player),
                "report": report_dto(report, balance),
                "can_approach": ok,
                "approach_blocked_reason": reason,
            }
        )
    reports.sort(
        key=lambda r: (r["report"]["potential_low"] + r["report"]["potential_high"]) / 2,
        reverse=True,
    )

    return {
        "regions": regions,
        "scouts": [scout_dto(world, balance, s) for s in world.scouts.values()],
        "reports": reports,
    }


def scout_candidates_dto(world: World, balance: Balance) -> List[Dict[str, Any]]:
    out = []
    for index, candidate in enumerate(actions.scout_candidates(world, balance)):
        out.append(
            {
                "index": index,
                "name": candidate.name,
                "quality": candidate.quality,
                "wage": money(candidate.wage),
                "signing_fee": money(
                    candidate.wage * balance.f("finance.scout_hire_cost_multiplier")
                ),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Agency
# ---------------------------------------------------------------------------


def hq_dto(world: World, balance: Balance) -> Dict[str, Any]:
    current = hq_level(balance, world.agency.hq_level)
    levels = hq_levels(balance)
    top = max(level.level for level in levels)
    nxt = hq_level(balance, world.agency.hq_level + 1) if world.agency.hq_level < top else None
    ok, reason = actions.can_upgrade_hq(world, balance)
    burn = weekly_burn(world, balance)
    projected = burn - (nxt.weekly_cost - current.weekly_cost) if nxt else None
    return {
        "upgrade_cost": money(current.upgrade_cost) if nxt else None,
        "current": hq_level_dto(current),
        "next": hq_level_dto(nxt) if nxt else None,
        "can_upgrade": {"ok": ok, "reason": reason},
        "weekly_net_now": money(burn),
        "weekly_net_after": money(projected) if projected is not None else None,
    }


def finances_dto(world: World, balance: Balance) -> Dict[str, Any]:
    burn = weekly_burn(world, balance)
    if burn < 0:
        weeks_until_broke = max(0, int(world.agency.cash / -burn))
    else:
        weeks_until_broke = None
    history = [
        {
            "week": entry.week,
            "retainers": money(entry.retainers),
            "commission": money(entry.commission),
            "scout_wages": money(entry.scout_wages),
            "hq_cost": money(entry.hq_cost),
            "support_cost": money(entry.support_cost),
            "investments": money(entry.investments),
            "region_costs": money(entry.region_costs),
            "income": money(entry.income),
            "expenditure": money(entry.expenditure),
            "net": money(entry.net),
        }
        for entry in world.finance_history
    ]
    return {
        "cash": money(world.agency.cash),
        "weekly_net": money(burn),
        "total_commission": money(world.agency.total_commission),
        "total_costs": money(world.agency.total_costs),
        "weeks_until_broke": weeks_until_broke,
        "weeks_until_next_window": cal.weeks_until_next_window(balance, world.week),
        "history": history,
    }


def leagues_dto(world: World) -> List[Dict[str, Any]]:
    client_clubs = {p.club_id for p in world.client_players() if p.club_id is not None}
    out = []
    for league in sorted(world.leagues.values(), key=lambda lg: lg.tier):
        rows = []
        for position, record in enumerate(league_system.standings(world, league.id), start=1):
            club = world.clubs.get(record.club_id)
            rows.append(
                {
                    "position": position,
                    "club_id": record.club_id,
                    "club_name": club.name if club else "Unknown",
                    "played": record.played,
                    "won": record.won,
                    "drawn": record.drawn,
                    "lost": record.lost,
                    "goals_for": record.goals_for,
                    "goals_against": record.goals_against,
                    "goal_difference": record.goal_difference,
                    "points": record.points,
                    "has_client": record.club_id in client_clubs,
                }
            )
        out.append(
            {
                "id": league.id,
                "name": league.name,
                "tier": league.tier,
                "round_index": league.round_index,
                "table": rows,
            }
        )
    return out
