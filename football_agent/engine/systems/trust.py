"""Client trust — the system that stops clients being inventory.

Trust falls when a client stagnates, when a promised move never lands, and when
you take a deal that served your commission rather than his career. It rises
when you get him playing, paid or promoted. If it bottoms out he walks, and
losing a star costs you income *and* reputation.

Two stabilisers keep the long game worth playing: **tenure** and **agency size**.
A client who has been with you for years, at a big agency, forgives more.
"""

from __future__ import annotations

import random
from typing import List

from .. import reputation
from ..balance import Balance
from ..events import CLIENT_LEFT, CLIENT_TRUST_SHIFT, Event, Severity, ev
from ..models import ClientRecord, PlayingTime, Player, World
from .development import expected_playing_time, playing_time


def stabiliser(world: World, balance: Balance, record: ClientRecord) -> float:
    """0..~0.75 — how much negative trust movement is absorbed."""
    seasons = record.tenure_weeks(world.week) / 52.0
    from_tenure = seasons * balance.f("trust.tenure_stabiliser_per_season")
    from_size = len(world.clients) * balance.f("trust.agency_size_stabiliser")
    from_rep = (world.agency.reputation / 100.0) * 0.15
    return min(0.75, from_tenure + from_size + from_rep)


def adjust(world: World, balance: Balance, player_id: int, delta: float) -> float:
    """Apply a trust change, damped by the stabilisers when negative."""
    record = world.clients.get(player_id)
    if record is None:
        return 0.0
    player = world.players.get(player_id)
    if player is not None:
        delta *= float(balance.d("trust.trait_sensitivity").get(player.trait.value, 1.0))
    if delta < 0:
        delta *= 1.0 - stabiliser(world, balance, record)
    lo = balance.f("trust.min")
    hi = balance.f("trust.max")
    before = record.trust
    record.trust = max(lo, min(hi, record.trust + delta))
    return record.trust - before


def run(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    week = world.week
    weekly = balance.d("trust.weekly_playing_time_delta")

    for player_id, record in list(world.clients.items()):
        player = world.players.get(player_id)
        if player is None or player.retired:
            continue
        club = world.clubs.get(player.club_id) if player.club_id else None
        current = playing_time(balance, player, club)
        record.last_playing_time = current

        delta = float(weekly[current.value])
        if player.is_injured and delta < 0:
            delta *= 0.4  # not your fault, and he knows it

        # Long stints without a move grate on the ambitious.
        if player.weeks_at_club > balance.f("trust.stagnation_weeks"):
            expected = expected_playing_time(balance, player)
            if _rank(current) <= _rank(expected):
                delta -= balance.f("trust.stagnation_penalty")

        if abs(delta) > 1e-9:
            adjust(world, balance, player_id, delta)

        events.extend(_maybe_leave(world, r, balance, player, record))

    return events


def _maybe_leave(
    world: World, r: random.Random, balance: Balance, player: Player, record: ClientRecord
) -> List[Event]:
    threshold = balance.f("trust.leave_threshold")
    if record.trust >= threshold:
        return []

    chance = balance.f("trust.leave_chance_below_threshold")
    chance *= 1.0 - stabiliser(world, balance, record)
    depth = (threshold - record.trust) / max(1.0, threshold)
    chance *= 0.5 + depth

    if r.random() >= chance:
        return [
            ev(
                CLIENT_TRUST_SHIFT,
                f"{player.name} is close to walking out (trust {record.trust:.0f}).",
                world.week,
                Severity.WARNING,
                player_id=player.id,
                trust=record.trust,
            )
        ]

    world.clients.pop(player.id, None)
    penalty = balance.f("reputation.client_loss_penalty")
    reputation.lose(world, balance, penalty)
    return [
        ev(
            CLIENT_LEFT,
            f"{player.name} has terminated his representation agreement. "
            f"Reputation down {penalty:.1f}.",
            world.week,
            Severity.CRITICAL,
            player_id=player.id,
            reason="lost_trust",
        )
    ]


def _rank(value: PlayingTime) -> int:
    from ..models import PLAYING_TIME_ORDER

    return PLAYING_TIME_ORDER.index(value)


def describe(trust: float) -> str:
    if trust >= 80:
        return "devoted"
    if trust >= 60:
        return "content"
    if trust >= 40:
        return "unsettled"
    if trust >= 20:
        return "disillusioned"
    return "ready to walk"
