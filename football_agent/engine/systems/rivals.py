"""Rival agencies — a clock on your decisions.

Named agencies with a reputation score and nothing else underneath. They exist
because without them a scouted player waits patiently forever, waiting costs
nothing, and the scouting uncertainty stops mattering. Simulating real opponents
would cost ten times as much for the same pressure.
"""

from __future__ import annotations

import random
from typing import List, Optional

from .. import reputation
from ..balance import Balance
from ..events import (
    CLIENT_POACHED,
    RIVAL_POACH_ATTEMPT,
    RIVAL_SIGNED_TARGET,
    Event,
    Severity,
    ev,
)
from ..models import RivalAgency, World


def run(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    if not world.rivals:
        return events
    events.extend(_snap_up_targets(world, r, balance))
    events.extend(_poach_clients(world, r, balance))
    return events


def _snap_up_targets(world: World, r: random.Random, balance: Balance) -> List[Event]:
    """Players you've scouted but not signed can be taken from under you."""
    events: List[Event] = []
    base = balance.f("rivals.snap_up_base_chance")
    factor = balance.f("rivals.snap_up_quality_factor")

    for report in list(world.reports.values()):
        player = world.players.get(report.player_id)
        if player is None or player.retired:
            continue
        if player.id in world.clients or player.rival_agency_id is not None:
            continue

        chance = base + player.ability * factor
        # The longer he's been on your list, the more visible he becomes.
        cap = balance.f("rivals.snap_up_visibility_cap")
        chance *= min(cap, 1.0 + report.weeks_watched / 40.0)
        if r.random() >= chance:
            continue

        rival = _pick_rival(world, r, player.ability)
        if rival is None:
            continue
        player.rival_agency_id = rival.id
        world.reports.pop(player.id, None)
        events.append(
            ev(
                RIVAL_SIGNED_TARGET,
                f"{rival.name} have signed {player.name}. You were too slow.",
                world.week,
                Severity.WARNING,
                player_id=player.id,
                rival_id=rival.id,
            )
        )
    return events


def _poach_clients(world: World, r: random.Random, balance: Balance) -> List[Event]:
    """Unhappy clients get their heads turned by bigger names."""
    events: List[Event] = []
    threshold = balance.f("rivals.poach_trust_threshold")
    base = balance.f("rivals.poach_base_chance")
    rep_factor = balance.f("rivals.poach_reputation_factor")

    for player_id, record in list(world.clients.items()):
        if record.trust >= threshold:
            continue
        player = world.players.get(player_id)
        if player is None or player.retired:
            continue

        rival = _pick_rival(world, r, player.ability, above=world.agency.reputation)
        if rival is None:
            continue

        gap = max(0.0, rival.reputation - world.agency.reputation)
        chance = (base + gap * rep_factor) * (1.0 - _stabiliser(world, balance, record))
        if r.random() >= chance:
            events.append(
                ev(
                    RIVAL_POACH_ATTEMPT,
                    f"{rival.name} have been sounding out {player.name}. He said no — this time.",
                    world.week,
                    Severity.WARNING,
                    player_id=player_id,
                    rival_id=rival.id,
                )
            )
            continue

        world.clients.pop(player_id, None)
        player.rival_agency_id = rival.id
        penalty = balance.f("reputation.client_loss_penalty")
        reputation.lose(world, balance, penalty)
        events.append(
            ev(
                CLIENT_POACHED,
                f"{player.name} has left you for {rival.name}. Reputation down {penalty:.1f}.",
                world.week,
                Severity.CRITICAL,
                player_id=player_id,
                rival_id=rival.id,
            )
        )
    return events


def _stabiliser(world: World, balance: Balance, record) -> float:
    from .trust import stabiliser

    return stabiliser(world, balance, record)


def _pick_rival(
    world: World, r: random.Random, ability: float, above: Optional[float] = None
) -> Optional[RivalAgency]:
    """Better players attract better agencies."""
    candidates = list(world.rivals.values())
    if above is not None:
        candidates = [c for c in candidates if c.reputation > above]
    if not candidates:
        return None
    weights = [max(0.05, 1.0 - abs(c.reputation - ability) / 100.0) for c in candidates]
    from ..rng import weighted_choice

    return weighted_choice(r, candidates, weights)
