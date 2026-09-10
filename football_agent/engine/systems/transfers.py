"""Transfers: club interest, deals, and the commission that pays for everything.

Interest arises from a club's *stated need* plus its wage headroom, so an offer
is legible rather than arbitrary — that legibility is what lets you judge whether
the negotiation mechanics are any good, which is the point of this build.

Deals only happen inside a transfer window. The greedy move is always available
and always costs you trust, which is where the game lives.
"""

from __future__ import annotations

import random
from typing import List, Optional, Tuple

from .. import calendar as cal
from .. import reputation
from ..balance import Balance
from ..economy import commission_for, format_money, market_value, market_wage
from ..events import (
    COMMISSION_EARNED,
    INTEREST_EXPIRED,
    INTEREST_RECEIVED,
    RENEWAL_COMPLETED,
    TRANSFER_COMPLETED,
    TRANSFER_FAILED,
    Event,
    Severity,
    ev,
)
from ..models import Club, Contract, Interest, PLAYING_TIME_ORDER, Player, PlayingTime, Trait, World
from .development import playing_time
from .negotiation import (
    commission_guide,
    Negotiation,
    deal_threshold,
    negotiation_bias,
    package_to_x,
    x_to_package,
)
from . import trust as trust_system


# ---------------------------------------------------------------------------
# Weekly pass
# ---------------------------------------------------------------------------


def run(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    events.extend(_expire_interests(world, balance))
    if cal.window_open(balance, world.week):
        events.extend(_generate_interest(world, r, balance))
    return events


def _expire_interests(world: World, balance: Balance) -> List[Event]:
    events: List[Event] = []
    for interest in list(world.interests.values()):
        if world.week < interest.expires_week:
            continue
        world.interests.pop(interest.id, None)
        player = world.players.get(interest.player_id)
        if player is None or player.id not in world.clients:
            continue
        events.append(
            ev(
                INTEREST_EXPIRED,
                f"{world.club_name(interest.club_id)} have moved on from {player.name}.",
                world.week,
                Severity.WARNING,
                player_id=player.id,
                club_id=interest.club_id,
            )
        )

    return events


def _generate_interest(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    max_open = balance.i("transfers.max_open_interests_per_client")
    ttl = balance.i("transfers.interest_ttl_weeks")

    for player_id, record in world.clients.items():
        player = world.players.get(player_id)
        if player is None or player.retired:
            continue
        open_now = world.interests_for(player_id)
        if len(open_now) >= max_open:
            continue
        busy_clubs = {i.club_id for i in open_now}

        for club in _candidate_clubs(world, balance, player):
            if club.id in busy_clubs:
                continue
            if r.random() >= _interest_chance(world, balance, player, club):
                continue
            interest = _build_interest(world, balance, player, club, ttl)
            world.interests[interest.id] = interest
            events.append(
                ev(
                    INTEREST_RECEIVED,
                    f"{club.name} (tier {club.tier}) are interested in {player.name} — "
                    f"up to {format_money(interest.max_wage)}/wk, fee to "
                    f"{format_money(interest.max_fee)}. Expires in {ttl} weeks.",
                    world.week,
                    Severity.ACTION,
                    player_id=player.id,
                    club_id=club.id,
                    interest_id=interest.id,
                )
            )
            break  # one new approach per client per week keeps the inbox readable

        events.extend(_maybe_renewal(world, r, balance, player, ttl))
    return events


def _candidate_clubs(world: World, balance: Balance, player: Player) -> List[Club]:
    gap = balance.f("transfers.min_ability_gap_for_interest")
    # A player who has just moved is left alone for a while. Without this,
    # clubs circle a settled client every few weeks and the transfer market
    # degenerates into a conveyor belt.
    settling = balance.i("transfers.min_weeks_at_club_for_interest")
    if (
        player.club_id is not None
        and player.weeks_at_club < settling
        and not player.transfer_listed
        and not player.seeking_move
    ):
        return []

    out = []
    for club in world.clubs.values():
        if club.id == player.club_id:
            continue
        if player.position.value not in club.needs:
            continue
        if player.ability < club.strength + gap:
            continue
        if club.wage_headroom < market_wage(balance, player.ability, club.tier) * 0.75:
            continue
        out.append(club)
    return out


def _interest_chance(world: World, balance: Balance, player: Player, club: Club) -> float:
    urgency = float(club.needs.get(player.position.value, 0.0))
    chance = balance.f("transfers.interest_base_chance") * (0.4 + urgency)
    chance += player.ability * balance.f("transfers.interest_ability_factor")
    chance += world.agency.reputation * balance.f("transfers.interest_reputation_factor")

    if player.seeking_move:
        chance *= balance.f("transfers.seeking_move_multiplier")
    if player.transfer_listed:
        chance *= balance.f("transfers.transfer_listed_multiplier")
    if player.is_injured:
        chance *= 0.2
    return min(0.6, chance)


def _build_interest(
    world: World, balance: Balance, player: Player, club: Club, ttl: int
) -> Interest:
    ceiling = balance.f("transfers.wage_offer_ceiling_factor")
    max_wage = min(club.wage_headroom, market_wage(balance, player.ability, club.tier) * ceiling)
    value = market_value(balance, player, world.week)
    max_fee = 0.0 if player.is_free_agent else min(club.transfer_budget, value * 1.45)

    return Interest(
        id=world.allocate_id(),
        club_id=club.id,
        player_id=player.id,
        created_week=world.week,
        expires_week=world.week + ttl,
        max_wage=round(max_wage, -1),
        max_fee=round(max_fee, -3),
        urgency=float(club.needs.get(player.position.value, 0.5)),
    )


def _maybe_renewal(
    world: World, r: random.Random, balance: Balance, player: Player, ttl: int
) -> List[Event]:
    """A club will offer fresh terms to a player it relies on."""
    if player.club_id is None or player.contract is None:
        return []
    if any(i.is_renewal for i in world.interests_for(player.id)):
        return []
    remaining = player.contract.expires_week - world.week
    if remaining > 78:
        return []

    club = world.clubs[player.club_id]
    pt = playing_time(balance, player, club)
    if pt not in (PlayingTime.KEY, PlayingTime.STARTER):
        return []
    if r.random() >= balance.f("transfers.renewal_chance_key_player"):
        return []

    ceiling = balance.f("transfers.wage_offer_ceiling_factor")
    headroom = club.wage_headroom + player.contract.wage
    max_wage = min(headroom, market_wage(balance, player.ability, club.tier) * ceiling)
    interest = Interest(
        id=world.allocate_id(),
        club_id=club.id,
        player_id=player.id,
        created_week=world.week,
        expires_week=world.week + ttl,
        max_wage=round(max_wage, -1),
        max_fee=0.0,
        urgency=0.7,
        is_renewal=True,
    )
    world.interests[interest.id] = interest
    return [
        ev(
            INTEREST_RECEIVED,
            f"{club.name} want to open renewal talks over {player.name} — "
            f"up to {format_money(interest.max_wage)}/wk.",
            world.week,
            Severity.ACTION,
            player_id=player.id,
            club_id=club.id,
            interest_id=interest.id,
            renewal=True,
        )
    ]


# ---------------------------------------------------------------------------
# Deal making
# ---------------------------------------------------------------------------


def asking_price(world: World, balance: Balance, player: Player) -> float:
    """What the selling club wants. A floor the buyer's ceiling may not reach."""
    if player.club_id is None:
        return 0.0
    value = market_value(balance, player, world.week)
    if player.transfer_listed:
        value *= 0.72
    return round(value, -3)


def open_deal_negotiation(
    world: World, balance: Balance, interest: Interest, r: Optional[random.Random] = None
) -> Negotiation:
    """Start a haggle with the buying club over the package.

    One negotiation per approach: the first time you name a number the attempt is
    spent, so a walk-away cannot be re-rolled. Without that the risk would be
    fictional and "always ask the ceiling" would be free.
    """
    from ..rng import stream

    generator = r or stream(world.seed, world.week, "negotiation", f"deal-{interest.id}")
    club = world.clubs[interest.club_id]
    bias = negotiation_bias(world.seed, club.id, balance)
    threshold = deal_threshold(balance, world.agency.reputation, bias)
    # Urgent needs make a club more pliable.
    threshold = min(1.0, threshold + (interest.urgency - 0.5) * 0.10)

    def consume() -> None:
        interest.attempts_used += 1

    return Negotiation.create(
        threshold,
        generator,
        balance,
        subject=club.name,
        context_kind="deal",
        context_id=interest.id,
        on_first_propose=consume,
    )


def propose_package(
    balance: Balance, interest: Interest, wage: float, fee: float
) -> float:
    return package_to_x(balance, wage, fee, interest.max_wage, interest.max_fee)


def package_from_x(balance: Balance, interest: Interest, x: float) -> Tuple[float, float]:
    return x_to_package(balance, x, interest.max_wage, interest.max_fee)


def assess_move(
    world: World, balance: Balance, player: Player, club: Club, wage: float
) -> Tuple[float, str]:
    """How the client will feel about this move, before you commit to it.

    Surfacing this is what makes the greedy deal a *choice* rather than a trap.
    """
    old_club = world.clubs.get(player.club_id) if player.club_id else None
    old_wage = player.contract.wage if player.contract else 0.0

    new_pt = playing_time(balance, player, club)
    old_pt = playing_time(balance, player, old_club) if old_club else PlayingTime.RESERVE
    pt_delta = PLAYING_TIME_ORDER.index(new_pt) - PLAYING_TIME_ORDER.index(old_pt)

    wage_ratio = (wage / old_wage) if old_wage > 0 else 1.5
    prestige_delta = (club.prestige - old_club.prestige) if old_club else club.prestige * 0.3

    good = balance.f("trust.good_move_bonus")
    bad = balance.f("trust.bad_move_penalty")
    wage_factor = balance.f("trust.wage_rise_bonus_factor")

    if player.trait is Trait.MERCENARY:
        score = (wage_ratio - 1.0) * wage_factor * 1.6 + pt_delta * 2.0
    elif player.trait is Trait.AMBITIOUS:
        score = prestige_delta * 0.35 + pt_delta * 5.0 + (wage_ratio - 1.0) * wage_factor * 0.4
    elif player.trait is Trait.LOYAL:
        score = pt_delta * 3.0 + (wage_ratio - 1.0) * wage_factor * 0.6 - 6.0
    else:  # PROFESSIONAL
        score = pt_delta * 5.5 + prestige_delta * 0.15 + (wage_ratio - 1.0) * wage_factor * 0.5

    delta = max(-bad, min(good, score))
    if delta >= good * 0.5:
        verdict = "He'll be delighted."
    elif delta > 0:
        verdict = "He can live with it."
    elif delta > -bad * 0.5:
        verdict = "He won't be happy."
    else:
        verdict = "He'll see this as you cashing in on him."
    return (delta, verdict)


def complete_deal(
    world: World,
    balance: Balance,
    interest: Interest,
    wage: float,
    fee: float,
    years: int,
) -> List[Event]:
    """Execute an agreed package. Returns the events it produced."""
    events: List[Event] = []
    from ..market import active_loan
    if active_loan(world, interest.player_id):
        return [ev(TRANSFER_FAILED, "A loaned player cannot move permanently.", world.week, Severity.WARNING)]
    player = world.players[interest.player_id]
    club = world.clubs[interest.club_id]
    record = world.clients.get(player.id)
    week = world.week

    if not interest.is_renewal:
        price = asking_price(world, balance, player)
        if not player.is_free_agent and fee < price:
            return [
                ev(
                    TRANSFER_FAILED,
                    f"{world.club_name(player.club_id)} rejected {format_money(fee)} — "
                    f"they want {format_money(price)} for {player.name}.",
                    week,
                    Severity.WARNING,
                    player_id=player.id,
                    club_id=club.id,
                    asking_price=price,
                )
            ]

    old_club = world.clubs.get(player.club_id) if player.club_id else None
    trust_delta, _ = assess_move(world, balance, player, club, wage)

    # Move the money and the man.
    if old_club and player.contract and not interest.is_renewal:
        old_club.wage_committed = max(0.0, old_club.wage_committed - player.contract.wage)
        old_club.transfer_budget += fee
    if not interest.is_renewal:
        club.transfer_budget = max(0.0, club.transfer_budget - fee)
        club.wage_committed += wage
        club.needs.pop(player.position.value, None)
        player.club_id = club.id
        player.weeks_at_club = 0
    else:
        club.wage_committed += wage - (player.contract.wage if player.contract else 0.0)

    from ..market import relationship_change, cfg
    relationship_change(world, balance, club.id, cfg(balance, "relationship_deal_gain"), "Completed a suitable deal")
    if not interest.is_renewal:
        from ..careers import fulfill_move
        events.extend(fulfill_move(world, balance, player.id))

    player.contract = Contract(wage=wage, expires_week=week + years * 52, years_signed=years)
    player.transfer_listed = False
    player.seeking_move = False

    commission = 0.0
    if record is not None:
        commission = commission_for(
            balance,
            record.agent_contract.commission_pct,
            fee,
            wage,
            years,
            is_renewal=interest.is_renewal,
        )
        world.agency.cash += commission
        world.agency.total_commission += commission
        from .finance import record_commission
        record_commission(world, commission)
        record.deals_done += 1
        record.promised_move = False

        if interest.is_renewal:
            trust_delta += balance.f("trust.renewal_bonus")
        # The greedy deal: taking the most your standing can squeeze, on a move
        # that damages him. Keyed to the guide band rather than a fixed
        # percentage, because a low-reputation agent can never reach a fixed one —
        # and greed at every level should cost the same thing.
        if trust_delta < 0:
            _, guide_high = commission_guide(
                balance, world.agency.reputation, player.trait.value
            )
            if record.agent_contract.commission_pct >= guide_high * 0.9:
                trust_delta -= balance.f("trust.greedy_deal_penalty")
        trust_system.adjust(world, balance, player.id, trust_delta)

        reward = balance.f("transfers.reputation_gain_per_transfer")
        if club.tier == 1:
            reward += balance.f("transfers.reputation_gain_tier1_bonus")
        reputation.gain(world, balance, reward)

    # Clear every other approach for this player.
    for other in [i.id for i in world.interests.values() if i.player_id == player.id]:
        world.interests.pop(other, None)

    if interest.is_renewal:
        events.append(
            ev(
                RENEWAL_COMPLETED,
                f"{player.name} has signed fresh terms at {club.name}: "
                f"{format_money(wage)}/wk for {years} years.",
                week,
                Severity.GOOD,
                player_id=player.id,
                club_id=club.id,
                wage=wage,
                years=years,
            )
        )
    else:
        events.append(
            ev(
                TRANSFER_COMPLETED,
                f"{player.name} joins {club.name} for {format_money(fee)} on "
                f"{format_money(wage)}/wk ({years} years).",
                week,
                Severity.GOOD,
                player_id=player.id,
                club_id=club.id,
                fee=fee,
                wage=wage,
                years=years,
            )
        )

    if commission > 0:
        events.append(
            ev(
                COMMISSION_EARNED,
                f"Commission: {format_money(commission)}.",
                week,
                Severity.GOOD,
                amount=commission,
                player_id=player.id,
            )
        )
    return events
