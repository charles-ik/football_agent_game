"""Market intelligence and temporary moves, with durable bounded negotiations."""
from __future__ import annotations

import math
from dataclasses import asdict, replace
from functools import lru_cache

from . import calendar as cal
from .balance import load_data
from .events import ev, Severity, COMMISSION_EARNED, INTEREST_RECEIVED
from .market_models import ClubRelationship, LoanRecord, LoanTalk, MarketState
from .models import PLAYING_TIME_ORDER
from .rng import stream
from .systems.development import playing_time


@lru_cache(maxsize=1)
def _defaults():
    return load_data("market_balance.json")


def cfg(balance, key):
    return balance.get("market." + key, _defaults()[key])


def initialize(world, balance):
    if not hasattr(world, "market_state") or world.market_state is None:
        world.market_state = MarketState()
    for cid in world.clubs:
        world.market_state.relationships.setdefault(cid, ClubRelationship(cfg(balance, "relationship_initial")))


def active_loan(world, player_id):
    market = getattr(world, "market_state", None)
    return next((loan for loan in market.loans.values() if loan.player_id == player_id and loan.active), None) if market else None


def move_busy(world, player_id):
    market = getattr(world, "market_state", None)
    return bool(active_loan(world, player_id) or (market and any(t.player_id == player_id and t.status in ("open", "agreed") for t in market.talks.values())))


def relationship_change(world, balance, club_id, delta, reason):
    initialize(world, balance)
    rel = world.market_state.relationships.get(club_id)
    if rel is None:
        return
    rel.value = max(0, min(100, rel.value + delta))
    rel.history.append({"week": world.week, "change": delta, "reason": reason, "value": rel.value})
    rel.history[:] = rel.history[-int(cfg(balance, "relationship_history_limit")):]


def _window_key(world, balance, player_id, club_id):
    win = cal.current_window(balance, world.week)
    return f"{cal.season_number(balance, world.week)}:{win[0] if win else 0}:{player_id}:{club_id}"


def _comparison(world, balance, player, club):
    report = world.reports.get(player.id)
    if report is None:
        return {"player_id": player.id, "club_id": club.id, "predicted_playing_time": None, "uncertainty": "Scout this player to estimate playing time."}
    low = playing_time(balance, replace(player, ability=report.ability_low), club)
    high = playing_time(balance, replace(player, ability=report.ability_high), club)
    return {"player_id": player.id, "club_id": club.id,
            "predicted_playing_time": {"low": low.value, "high": high.value},
            "uncertainty": "Estimate from the scouting report; actual minutes may differ."}



def _projection(world, balance, player, club, comparison):
    """Money and goal guidance from published terms and scouting ranges only."""
    from .economy import commission_for
    staying = club.id == player.club_id
    interest = next((i for i in world.interests_for(player.id) if i.club_id == club.id and i.expires_week > world.week), None)
    wage = player.contract.wage if staying and player.contract else None
    commission = 0.0 if staying else None
    note = "No new deal; no transaction commission." if staying else "A club approach is needed to estimate commission."
    if interest and not staying:
        wage = interest.max_wage
        commission = commission_for(balance, world.clients[player.id].agent_contract.commission_pct,
                                    interest.max_fee, interest.max_wage, 3, is_renewal=interest.is_renewal)
        note = "Estimate at the published wage and fee ceilings over 3 years. Final terms may be lower."
    current_club = world.clubs.get(player.club_id)
    projected = comparison['predicted_playing_time']
    current = _comparison(world, balance, player, current_club)['predicted_playing_time'] if current_club else None
    labels = [p.value for p in PLAYING_TIME_ORDER]
    if staying:
        fit = "Keeps his current role, wage and club ties."
    elif player.trait.value == 'mercenary':
        fit = ("Published wage ceiling offers a possible pay rise." if wage > (player.contract.wage if player.contract else 0)
               else "Published wage ceiling offers no pay rise.") if wage is not None else "Wage-focused: wait for a firm approach to judge earnings."
    elif player.trait.value == 'loyal':
        fit = "A move breaks club ties; loyalty favours staying unless the benefits convince him."
    elif projected is None:
        fit = "A scouting report is needed to assess his route to regular football."
    elif current is None or labels.index(projected['low']) > labels.index(current['high']):
        fit = "The report suggests a clearer route to regular football."
    elif labels.index(projected['high']) < labels.index(current['low']):
        fit = "The report suggests less playing time than staying put."
    else:
        fit = "The playing-time ranges overlap; a better role is uncertain."
    if not staying and player.trait.value == 'ambitious' and current_club and club.prestige > current_club.prestige:
        fit += " The club also offers a higher profile."
    return {'estimated_commission': commission, 'commission_note': note, 'wage_ceiling': wage, 'goal_fit': fit}

def _loan_reason(world, balance, player, host):
    if player.retired or player.id not in world.clients:
        return "Choose an active client."
    if not player.contract or player.club_id is None or player.contract.expires_week <= world.week:
        return "Loans require a current parent-club contract."
    if host.id == player.club_id:
        return "Choose another club."
    parent = world.clubs[player.club_id]
    if not player.transfer_listed and not player.seeking_move and player.ability / max(1, parent.strength) > cfg(balance, "loan_parent_max_ratio"):
        return "The parent club wants to keep this player in its squad."
    if host.needs.get(player.position.value, 0) < cfg(balance, "loan_min_need"):
        return "The host has no need at this position."
    if PLAYING_TIME_ORDER.index(playing_time(balance, player, host)) < 2:
        return "The host cannot offer a suitable role."
    return None


def state(world, balance):
    clients = [p for p in world.client_players() if not p.retired]
    clubs = []
    comparisons = []
    for club in world.clubs.values():
        rel = world.market_state.relationships.get(club.id, ClubRelationship(cfg(balance, "relationship_initial")))
        clubs.append({"id": club.id, "name": club.name, "tier": club.tier, "strength": club.strength,
                      "prestige": club.prestige, "needs": dict(club.needs), "wage_headroom": club.wage_headroom,
                      "transfer_budget": club.transfer_budget, "relationship": rel.value, "history": list(rel.history)})
        for player in clients:
            row = _comparison(world, balance, player, club)
            row["pitch_used"] = _window_key(world, balance, player.id, club.id) in world.market_state.pitches
            row.update(_projection(world, balance, player, club, row))
            comparisons.append(row)
    rivals = [{"id": rival.id, "name": rival.name, "reputation": rival.reputation,
               "players": [{"id": p.id, "name": p.name, "position": p.position.value, "club_name": world.club_name(p.club_id)}
                           for p in world.players.values() if p.rival_agency_id == rival.id and not p.retired]}
              for rival in world.rivals.values()]
    return {"window_open": cal.window_open(balance, world.week), "clubs": clubs, "comparisons": comparisons,
            "interests": [{"id": i.id, "player_id": i.player_id, "club_id": i.club_id, "max_wage": i.max_wage, "max_fee": i.max_fee, "is_renewal": i.is_renewal, "expires_week": i.expires_week} for i in world.interests.values()],
            "rivals": rivals, "loans": [asdict(l) for l in world.market_state.loans.values()],
            "talks": [asdict(t) for t in world.market_state.talks.values()],
            "rival_warnings": [{"player_id": pid, "since_week": week} for pid, week in world.market_state.rival_warnings.items()],
            "loan_terms": {"min_contribution_pct": cfg(balance, "loan_min_contribution"), "max_contribution_pct": cfg(balance, "loan_max_contribution"), "max_rounds": cfg(balance, "loan_rounds")}}


def run(world, r, balance):
    initialize(world, balance)
    events = []
    for talk in world.market_state.talks.values():
        player = world.players.get(talk.player_id)
        if talk.status in ("open", "agreed") and (world.week >= talk.expires_week or not cal.window_open(balance, world.week) or talk.player_id not in world.clients or not player or player.retired or player.club_id != talk.parent_club_id):
            talk.status = "expired"
    for loan in world.market_state.loans.values():
        if not loan.active:
            continue
        player = world.players.get(loan.player_id)
        if player and not player.retired and player.contract and world.week < min(loan.ends_week, player.contract.expires_week):
            continue
        share = loan.wage * loan.contribution_pct / 100
        parent = world.clubs.get(loan.parent_club_id)
        host = world.clubs.get(loan.host_club_id)
        if host:
            host.wage_committed = max(0, host.wage_committed - share)
        if parent:
            parent.wage_committed += share
        loan.active = False
        if player:
            player.club_id = loan.parent_club_id
            player.weeks_at_club = 0
            # Let contracts.run remove the restored full wage on natural expiry.
            if player.retired:
                if parent:
                    parent.wage_committed = max(0, parent.wage_committed - loan.wage)
                player.club_id = None
                player.contract = None
            events.append(ev("loan_returned", f"{player.name}'s loan at {world.club_name(loan.host_club_id)} has ended.", world.week, Severity.INFO, player_id=player.id))
    events.extend(_rival_pressure(world, r, balance))
    return events


def poach_warning(world, balance, player_id):
    """Call before an otherwise successful poach. False grants a response period."""
    initialize(world, balance)
    since = world.market_state.rival_warnings.get(player_id)
    if since is None:
        world.market_state.rival_warnings[player_id] = world.week
        return False
    return world.week - since >= cfg(balance, "rival_warning_weeks")


def action(world, balance, operation, payload):
    from .actions import ActionResult
    initialize(world, balance)
    def fail(message):
        return ActionResult(False, message)
    if world.game_over or world.agency.bankrupt:
        return fail("This game has ended.")
    try:
        return _action(world, balance, operation, payload, ActionResult, fail)
    except (KeyError, TypeError, ValueError, OverflowError):
        return fail("Invalid market action or terms.")


def _action(world, balance, operation, payload, result, fail):
    ms = world.market_state
    if operation == "loan_cancel":
        talk = ms.talks[int(payload["talk_id"])]
        if talk.status not in ("open", "agreed"):
            return fail("These talks are already closed.")
        talk.status = "cancelled"
        return result(True, "Loan talks cancelled.")
    if not cal.window_open(balance, world.week):
        return fail("The transfer window is closed.")
    if operation in ("pitch", "loan_open"):
        player = world.players[int(payload["player_id"])]
        club = world.clubs[int(payload["club_id"])]
        if player.id not in world.clients or player.retired:
            return fail("Choose an active client.")
        if move_busy(world, player.id):
            return fail("This client already has an active loan or loan talks.")
        key = _window_key(world, balance, player.id, club.id)
        if operation == "pitch":
            if key in ms.pitches:
                return fail("Already pitched this client to this club during this window.")
            if club.id == player.club_id or club.needs.get(player.position.value, 0) < cfg(balance, "pitch_min_need"):
                return fail("Choose a club with a suitable positional need.")
            if any(i.club_id == club.id for i in world.interests_for(player.id)):
                return fail("This club has already approached the client.")
            if len(world.interests_for(player.id)) >= balance.i("transfers.max_open_interests_per_client"):
                return fail("Resolve the client's existing approaches first.")
            ms.pitches.append(key)
            from .systems.transfers import _build_interest
            chance = cfg(balance, "pitch_chance") + (ms.relationships[club.id].value - 50) * cfg(balance, "pitch_relationship_factor")
            try:
                from .agency_management import relationship_bonus
                chance += relationship_bonus(world, club.id)
            except ImportError:
                pass
            accepted = stream(world.seed, world.week, "market", key).random() < max(0.05, min(.85, chance))
            interest = _build_interest(world, balance, player, club, balance.i("transfers.interest_ttl_weeks"))
            if accepted and interest.max_wage > 0 and player.ability >= club.strength + balance.f("transfers.min_ability_gap_for_interest"):
                world.interests[interest.id] = interest
                relationship_change(world, balance, club.id, cfg(balance, "relationship_pitch_gain"), "Suitable client pitch")
                event = ev(INTEREST_RECEIVED, f"{club.name} will discuss a move for {player.name}.", world.week, Severity.ACTION, player_id=player.id, club_id=club.id, interest_id=interest.id)
                return result(True, "The club opened an approach. Negotiate the move normally.", [event], {"interest_id": interest.id})
            return result(True, "The club declined this pitch. You can try again next window.")
        reason = _loan_reason(world, balance, player, club)
        if reason:
            return fail(reason)
        if key in ms.loan_attempts:
            return fail("Already opened loan talks for this pairing during this window.")
        if any(i.attempts_used for i in world.interests_for(player.id)):
            return fail("Resolve the client's permanent transfer negotiation first.")
        duration = payload.get("duration", "half_season")
        if duration not in ("half_season", "season"):
            return fail("Choose half_season or season.")
        per = cal.weeks_per_season(balance)
        season_start = (cal.season_number(balance, world.week) - 1) * per
        deadline = season_start + per
        if duration == "half_season" and world.week < season_start + per // 2:
            deadline = season_start + per // 2
        deadline = min(deadline, player.contract.expires_week)
        if deadline <= world.week:
            return fail("The parent contract ends too soon.")
        talk = LoanTalk(world.allocate_id(), player.id, player.club_id, club.id, deadline, world.week + int(cfg(balance, "loan_talk_ttl")))
        ms.loan_attempts.append(key)
        ms.talks[talk.id] = talk
        return result(True, "Parent club approved talks. Propose host wage contribution and loan fee.", payload=asdict(talk))
    talk = ms.talks[int(payload["talk_id"])]
    if talk.status not in ("open", "agreed") or world.week >= talk.expires_week:
        return fail("These loan talks have ended.")
    player = world.players[talk.player_id]
    host = world.clubs[talk.host_club_id]
    parent = world.clubs[talk.parent_club_id]
    if player.id not in world.clients or player.retired or active_loan(world, player.id) or player.club_id != parent.id or not player.contract or player.contract.expires_week <= world.week:
        return fail("This client is no longer available for this loan.")
    if operation == "loan_propose":
        if talk.status == "agreed":
            return fail("Accept or cancel the agreed terms.")
        pct, fee = float(payload["contribution_pct"]), float(payload["fee"])
        if not math.isfinite(pct) or not math.isfinite(fee) or not cfg(balance, "loan_min_contribution") <= pct <= cfg(balance, "loan_max_contribution") or fee < 0:
            return fail("Enter valid wage contribution and a non-negative fee.")
        talk.rounds += 1
        talk.contribution_pct, talk.fee = pct, fee
        share = player.contract.wage * pct / 100
        # Parent expects a modest fee or substantial wage relief; host has a bounded appetite.
        minimum_fee = player.contract.wage * cfg(balance, "loan_fee_wage_weeks") * (1 - pct / 100)
        max_fee = player.contract.wage * max(1, talk.ends_week - world.week) * cfg(balance, "loan_max_fee_wage_factor")
        accepted = share <= host.wage_headroom and minimum_fee <= fee <= min(host.transfer_budget, max_fee)
        if accepted:
            talk.status = "agreed"
            return result(True, "Both clubs agree. Accept to complete this loan.", payload=asdict(talk))
        if talk.rounds >= cfg(balance, "loan_rounds"):
            talk.status = "rejected"
            relationship_change(world, balance, host.id, -cfg(balance, "relationship_failed_loss"), "Loan talks broke down")
        return result(True, "Clubs declined the package. Increase wage relief or adjust the fee within host budgets." if talk.status == "open" else "Loan talks broke down.", payload=asdict(talk))
    if operation != "loan_accept" or talk.status != "agreed":
        return fail("Agree a loan package first.")
    share = player.contract.wage * talk.contribution_pct / 100
    if share > host.wage_headroom or talk.fee > host.transfer_budget:
        return fail("The host no longer has the required budget.")
    if _loan_reason(world, balance, player, host):
        return fail("The clubs no longer approve this loan.")
    ends = min(talk.ends_week, player.contract.expires_week)
    if ends <= world.week:
        return fail("The proposed loan has already ended.")
    commission = (talk.fee + share * (ends - world.week)) * world.clients[player.id].agent_contract.commission_pct * cfg(balance, "loan_commission_factor")
    loan = LoanRecord(world.allocate_id(), player.id, parent.id, host.id, world.week, ends, player.contract.wage, talk.contribution_pct, talk.fee, commission)
    parent.wage_committed = max(0, parent.wage_committed - share)
    host.wage_committed += share
    host.transfer_budget -= talk.fee
    parent.transfer_budget += talk.fee
    player.club_id = host.id
    player.weeks_at_club = 0
    world.agency.cash += commission
    world.agency.total_commission += commission
    from .systems.finance import record_commission
    record_commission(world, commission)
    world.clients[player.id].deals_done += 1
    world.clients[player.id].promised_move = False
    ms.loans[loan.id] = loan
    talk.status = "completed"
    for iid in [i.id for i in world.interests_for(player.id)]:
        world.interests.pop(iid)
    relationship_change(world, balance, parent.id, cfg(balance, "relationship_deal_gain"), "Loan completed")
    relationship_change(world, balance, host.id, cfg(balance, "relationship_deal_gain"), "Loan completed")
    from .careers import fulfill_move
    career_events = fulfill_move(world, balance, player.id)
    return result(True, "Loan completed.", career_events + [ev("loan_completed", f"{player.name} joins {host.name} on loan until week {ends}.", world.week, Severity.GOOD, player_id=player.id), ev(COMMISSION_EARNED, f"Loan commission: £{commission:,.0f}.", world.week, Severity.GOOD, amount=commission, player_id=player.id)], asdict(loan))


def _rival_pressure(world, r, balance):
    from . import reputation
    from .events import CLIENT_POACHED, RIVAL_POACH_ATTEMPT
    from .systems.rivals import _pick_rival, _stabiliser
    events = []
    warnings = world.market_state.rival_warnings
    threshold = balance.f("rivals.poach_trust_threshold")
    for pid in list(warnings):
        if pid not in world.clients or world.clients[pid].trust >= threshold or world.players[pid].retired:
            warnings.pop(pid)
    for pid, record in list(world.clients.items()):
        player = world.players.get(pid)
        if not player or player.retired or record.trust >= threshold:
            continue
        rival = _pick_rival(world, r, player.ability, above=world.agency.reputation)
        if not rival:
            continue
        if pid not in warnings:
            warnings[pid] = world.week
            events.append(ev(RIVAL_POACH_ATTEMPT, f"{rival.name} are courting {player.name}. Rebuild his trust before he makes a decision.", world.week, Severity.ACTION, player_id=pid, rival_id=rival.id))
            continue
        if not poach_warning(world, balance, pid):
            continue
        gap = max(0, rival.reputation - world.agency.reputation)
        chance = (balance.f("rivals.poach_base_chance") + gap * balance.f("rivals.poach_reputation_factor")) * (1 - _stabiliser(world, balance, record))
        if r.random() >= chance:
            continue
        world.clients.pop(pid)
        warnings.pop(pid)
        player.rival_agency_id = rival.id
        reputation.lose(world, balance, balance.f("reputation.client_loss_penalty"))
        events.append(ev(CLIENT_POACHED, f"{player.name} has left for {rival.name} after their approach.", world.week, Severity.CRITICAL, player_id=pid, rival_id=rival.id))
    return events


def open_decisions(world, balance):
    from .decisions import Decision
    out = []
    for pid, since in world.market_state.rival_warnings.items():
        record = world.clients.get(pid)
        if record and record.trust < balance.f("rivals.poach_trust_threshold"):
            out.append(Decision(f"rival-pressure-{pid}", "market.rival", Severity.ACTION,
                                f"{world.players[pid].name} is being courted by rivals", "Improve his trust before he decides to leave.",
                                player_id=pid, weeks_left=max(0, int(cfg(balance, "rival_warning_weeks")) - (world.week - since)), extra={"href": f"/clients/{pid}"}))
    for talk in world.market_state.talks.values():
        if talk.status in ("open", "agreed") and world.week < talk.expires_week and cal.window_open(balance, world.week):
            out.append(Decision(f"loan-talk-{talk.id}", "market.loan", Severity.ACTION,
                                f"Loan talks for {world.players[talk.player_id].name}", "Propose terms or accept the agreed package.",
                                player_id=talk.player_id, weeks_left=talk.expires_week - world.week, extra={"href": "/market"}))
    return out


def return_loan(world, player_id):
    """Restore parent ownership before an external lifecycle event (e.g. retirement)."""
    loan = active_loan(world, player_id)
    if loan is None:
        return
    share = loan.wage * loan.contribution_pct / 100
    host, parent = world.clubs.get(loan.host_club_id), world.clubs.get(loan.parent_club_id)
    if host:
        host.wage_committed = max(0, host.wage_committed - share)
    if parent:
        parent.wage_committed += share
    loan.active = False
    player = world.players.get(player_id)
    if player:
        player.club_id = loan.parent_club_id
        player.weeks_at_club = 0
