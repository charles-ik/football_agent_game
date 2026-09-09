"""Development, playing time, injuries and ageing.

Playing time is *derived* from ability versus club strength — no squads needed.
It is the hinge the whole game turns on: it drives development, it drives trust,
and it is what makes moving a client somewhere too big for the wages an actual
mistake rather than a free win.
"""

from __future__ import annotations

import random
from typing import List, Optional

from ..balance import Balance
from ..events import (
    CLIENT_DEVELOPED,
    CLIENT_INJURED,
    CLIENT_RECOVERED,
    CLIENT_RETIRED,
    Event,
    Severity,
    ev,
)
from ..models import Club, PlayingTime, Player, World


def playing_time(balance: Balance, player: Player, club: Optional[Club]) -> PlayingTime:
    """Where a player sits in the pecking order at his club."""
    if club is None or player.is_injured:
        return PlayingTime.RESERVE
    ratio = player.ability / max(1.0, club.strength)
    thresholds = balance.d("playing_time.thresholds")
    if ratio >= float(thresholds["key"]):
        return PlayingTime.KEY
    if ratio >= float(thresholds["starter"]):
        return PlayingTime.STARTER
    if ratio >= float(thresholds["rotation"]):
        return PlayingTime.ROTATION
    if ratio >= float(thresholds["fringe"]):
        return PlayingTime.FRINGE
    return PlayingTime.RESERVE


def expected_playing_time(balance: Balance, player: Player) -> PlayingTime:
    """What this player believes he is owed, given his personality."""
    mapping = balance.d("playing_time.expected_by_trait")
    return PlayingTime(mapping.get(player.trait.value, "rotation"))


def run(world: World, r: random.Random, balance: Balance) -> List[Event]:
    """Weekly development pass over every player in the world."""
    events: List[Event] = []
    week = world.week
    injury_chance = balance.f("development.injury_chance_per_week")
    inj_lo, inj_hi = balance.l("development.injury_weeks_range")

    for player in world.players.values():
        if player.retired:
            continue
        is_client = player.id in world.clients
        club = world.clubs.get(player.club_id) if player.club_id else None

        if player.injury_weeks > 0:
            player.injury_weeks -= 1
            if player.injury_weeks == 0 and is_client:
                events.append(
                    ev(
                        CLIENT_RECOVERED,
                        f"{player.name} is fit again.",
                        week,
                        Severity.GOOD,
                        player_id=player.id,
                    )
                )
        elif r.random() < injury_chance:
            weeks = int(max(1, r.triangular(float(inj_lo), float(inj_hi), float(inj_lo) + 3)))
            player.injury_weeks = weeks
            if is_client:
                events.append(
                    ev(
                        CLIENT_INJURED,
                        f"{player.name} is out for around {weeks} weeks.",
                        week,
                        Severity.WARNING,
                        player_id=player.id,
                        weeks=weeks,
                    )
                )

        before = player.ability
        _apply_growth(balance, player, club, r)
        player.weeks_at_club += 1

        if is_client and int(player.ability) > int(before) and player.ability > before:
            events.append(
                ev(
                    CLIENT_DEVELOPED,
                    f"{player.name} has kicked on — now rated {player.ability:.0f}.",
                    week,
                    Severity.GOOD,
                    player_id=player.id,
                )
            )

    return events


def _apply_growth(balance: Balance, player: Player, club: Optional[Club], r: random.Random) -> None:
    peak = balance.f("development.peak_age")
    decline_age = balance.f("development.decline_age")
    pt = playing_time(balance, player, club)
    pt_mult = float(balance.d("development.playing_time_multiplier")[pt.value])

    if player.age >= decline_age:
        severity = 1.0 + (player.age - decline_age) * 0.25
        # Regular football slows the decline; the bench accelerates it.
        cushion = 0.55 if pt in (PlayingTime.KEY, PlayingTime.STARTER) else 1.0
        player.ability = max(20.0, player.ability - balance.f("development.decline_rate") * severity * cushion)
        return

    age_factor = 1.0 if player.age <= peak else max(0.0, 1.0 - (player.age - peak) / 4.0)
    gap = max(0.0, player.potential - player.ability)
    growth = balance.f("development.growth_rate") * pt_mult * age_factor * min(2.5, gap / 10.0)

    if player.is_injured:
        growth *= 1.0 - balance.f("development.injury_growth_penalty")
    growth *= r.uniform(0.6, 1.4)

    player.ability = max(20.0, min(99.0, player.ability + growth))


def season_rollover(world: World, r: random.Random, balance: Balance) -> List[Event]:
    """Age everyone a year and retire the ones who are done."""
    events: List[Event] = []
    week = world.week
    retire_age = balance.f("development.retire_age")
    per_year = balance.f("development.retire_chance_per_year_over")

    for player in list(world.players.values()):
        if player.retired:
            continue
        player.age += 1
        over = player.age - retire_age
        chance = 0.0
        if over >= -3:
            chance = max(0.0, per_year * (over + 3) / 3.0)
        if player.ability < 45 and player.age > 30:
            chance += 0.15
        if chance > 0 and r.random() < chance:
            _retire(world, player)
            if player.id in world.clients or player.id in world.reports:
                events.append(
                    ev(
                        CLIENT_RETIRED,
                        f"{player.name} has retired at {player.age}.",
                        week,
                        Severity.WARNING,
                        player_id=player.id,
                    )
                )
    return events


def _retire(world: World, player: Player) -> None:
    player.retired = True
    if player.club_id is not None and player.contract:
        club = world.clubs.get(player.club_id)
        if club:
            club.wage_committed = max(0.0, club.wage_committed - player.contract.wage)
    player.club_id = None
    player.contract = None
    world.clients.pop(player.id, None)
    world.reports.pop(player.id, None)
    for interest_id in [i.id for i in world.interests.values() if i.player_id == player.id]:
        world.interests.pop(interest_id, None)
