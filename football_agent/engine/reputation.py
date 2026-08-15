"""Reputation.

A single global number in v1, deliberately behind an accessor so it can later
split into club-reputation and player-reputation without a refactor. It gates
your commission ceiling, whether clubs take your call, which players will sign
with you, and how well you hold on to clients.

Gains fall away as you climb, which is what stretches the arc: getting from
nobody to competent is quick, from competent to elite is a career.
"""

from __future__ import annotations

from .balance import Balance
from .models import World


def gain(world: World, balance: Balance, amount: float) -> float:
    """Add reputation with diminishing returns. Returns the amount actually added."""
    if amount <= 0:
        return 0.0
    ceiling = balance.f("reputation.max")
    falloff = balance.f("reputation.gain_falloff_exponent")
    headroom = max(0.0, 1.0 - world.agency.reputation / ceiling)
    effective = amount * (headroom ** falloff)
    before = world.agency.reputation
    world.agency.reputation = min(ceiling, before + effective)
    return world.agency.reputation - before


def lose(world: World, balance: Balance, amount: float) -> float:
    """Losses are not damped — falling is always easier than climbing."""
    floor = balance.f("reputation.min")
    before = world.agency.reputation
    world.agency.reputation = max(floor, before - abs(amount))
    return before - world.agency.reputation


def is_elite(world: World, balance: Balance) -> bool:
    return world.agency.reputation >= balance.f("reputation.elite_threshold")


def describe(reputation: float) -> str:
    if reputation >= 85:
        return "a household name"
    if reputation >= 70:
        return "well connected"
    if reputation >= 50:
        return "respected"
    if reputation >= 30:
        return "known in the lower leagues"
    if reputation >= 15:
        return "a jobbing agent"
    return "a nobody"
