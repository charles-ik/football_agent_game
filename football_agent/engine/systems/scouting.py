"""Scouting — uncertainty is the mechanic.

A report is never a number. It is a *range*, and the range narrows the longer a
scout watches, the better the scout is, the bigger your agency's reputation, and
the more scouts you have in that region. So scale buys **precision**, which is a
far better thing to sell than raw numbers, and signing is always a bet.

The midpoint of a fresh report is deliberately biased — the true value sits at a
random point inside the band, not in the middle of it. A wide report you read as
"probably 77" can be a 68.
"""

from __future__ import annotations

import random
from typing import List, Optional

from ..balance import Balance
from ..events import SCOUT_DISCOVERY, SCOUT_IDLE, SCOUT_NARROWED, Event, Severity, ev
from ..models import Player, Region, ScoutingReport, Scout, World
from ..world import hq_level


def expected_ability(balance: Balance, region: Region) -> float:
    """The typical standard of player a region produces.

    Exposed because it is the information an agent genuinely has — everyone knows
    the Capital is full of better players. It is what lets you judge whether a
    region's talent is within reach of your reputation, or whether you'd be paying
    to watch players who won't take your call.
    """
    return balance.f("scouting.region_ability_mode_base") + region.star_rating * balance.f(
        "scouting.region_ability_star_factor"
    )


def precision(world: World, balance: Balance, scout: Scout) -> float:
    """0..~1 — how fast this scout resolves uncertainty in his region."""
    rate = balance.f("scouting.narrow_per_week_base")
    rate += scout.quality * balance.f("scouting.narrow_quality_factor")
    rate += world.agency.reputation * balance.f("scouting.narrow_reputation_factor")

    if scout.region_id:
        others = max(0, len(world.scouts_in_region(scout.region_id)) - 1)
        rate += others * balance.f("scouting.narrow_region_scout_factor")

    rate += hq_level(balance, world.agency.hq_level).precision_bonus * balance.f(
        "scouting.narrow_hq_precision_factor"
    )
    return min(0.6, rate)


def discovery_chance(world: World, balance: Balance, scout: Scout) -> float:
    if not scout.region_id or scout.region_id not in world.regions:
        return 0.0
    region = world.regions[scout.region_id]
    chance = balance.f("scouting.base_discovery_chance")
    chance += scout.quality * balance.f("scouting.quality_discovery_factor")
    chance += region.star_rating * balance.f("scouting.star_discovery_factor")
    if scout.focus_player_id is not None:
        chance *= 0.35  # watching one man means finding fewer others
    return min(0.9, chance)


def run(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    week = world.week
    sharpened = 0

    for scout in world.scouts.values():
        if not scout.assigned:
            events.append(
                ev(
                    SCOUT_IDLE,
                    f"{scout.name} is unassigned and costing you money.",
                    week,
                    Severity.ACTION,
                    scout_id=scout.id,
                )
            )
            continue

        rate = precision(world, balance, scout)

        if r.random() < discovery_chance(world, balance, scout):
            found = _discover(world, r, balance, scout)
            if found is not None:
                report = world.reports[found.id]
                events.append(
                    ev(
                        SCOUT_DISCOVERY,
                        f"{scout.name} has flagged {found.name} ({found.age}, "
                        f"{found.position.value}, {world.club_name(found.club_id)}) — "
                        f"ability {report.ability_low:.0f}-{report.ability_high:.0f}, "
                        f"potential {report.potential_low:.0f}-{report.potential_high:.0f}.",
                        week,
                        Severity.ACTION,
                        player_id=found.id,
                        scout_id=scout.id,
                    )
                )

        sharpened += _narrow_region(world, balance, scout, rate)

    if sharpened:
        events.append(
            ev(
                SCOUT_NARROWED,
                f"{sharpened} scouting report(s) sharpened.",
                week,
                Severity.INFO,
                count=sharpened,
            )
        )
    return events


def _discover(world: World, r: random.Random, balance: Balance, scout: Scout) -> Optional[Player]:
    """Turn up one previously unknown, unrepresented player in the scout's region."""
    candidates = [
        p
        for p in world.players.values()
        if p.region_id == scout.region_id
        and not p.retired
        and p.id not in world.reports
        and p.rival_agency_id is None
        and p.id not in world.clients
        and _matches_brief(scout, p)
    ]
    if not candidates:
        return None

    player = r.choice(candidates)
    world.reports[player.id] = _initial_report(world, r, balance, scout, player)
    return player


def _matches_brief(scout: Scout, player: Player) -> bool:
    if scout.brief_position is not None and player.position != scout.brief_position:
        return False
    if scout.brief_max_age is not None and player.age > scout.brief_max_age:
        return False
    return True


def _initial_report(
    world: World, r: random.Random, balance: Balance, scout: Scout, player: Player
) -> ScoutingReport:
    quality_factor = 1.0 - min(0.6, scout.quality / 160.0)
    ability_spread = balance.f("scouting.initial_ability_spread") * quality_factor
    potential_spread = balance.f("scouting.initial_potential_spread") * quality_factor

    ability_low, ability_high = _band(r, player.ability, ability_spread)
    potential_low, potential_high = _band(r, player.potential, potential_spread)

    return ScoutingReport(
        player_id=player.id,
        ability_low=round(max(1.0, ability_low), 1),
        ability_high=round(min(99.0, ability_high), 1),
        potential_low=round(max(1.0, potential_low), 1),
        potential_high=round(min(99.0, potential_high), 1),
        weeks_watched=0,
        first_seen_week=world.week,
        region_id=player.region_id,
        scout_id=scout.id,
    )


def _band(r: random.Random, true_value: float, spread: float) -> tuple:
    """Place the true value at a random point inside the band, not the middle."""
    offset = r.uniform(0.15, 0.85)
    low = true_value - spread * offset
    return (low, low + spread)


def _narrow_region(world: World, balance: Balance, scout: Scout, rate: float) -> int:
    min_ability = balance.f("scouting.min_ability_spread")
    min_potential = balance.f("scouting.min_potential_spread")
    focus_mult = balance.f("scouting.focus_multiplier")
    count = 0

    for report in world.reports.values():
        if report.region_id != scout.region_id:
            continue
        player = world.players.get(report.player_id)
        if player is None or player.retired:
            continue

        effective = rate * (focus_mult if scout.focus_player_id == player.id else 1.0)
        effective = min(0.75, effective)

        before = report.ability_spread
        _converge(report, player, effective, min_ability, min_potential)
        report.weeks_watched += 1
        if report.ability_spread < before - 0.05:
            count += 1

    return count


def _converge(
    report: ScoutingReport,
    player: Player,
    rate: float,
    min_ability: float,
    min_potential: float,
) -> None:
    """Shrink the band toward the truth, keeping the true value contained."""
    report.ability_low = player.ability - (player.ability - report.ability_low) * (1 - rate)
    report.ability_high = player.ability + (report.ability_high - player.ability) * (1 - rate)
    report.potential_low = player.potential - (player.potential - report.potential_low) * (1 - rate)
    report.potential_high = player.potential + (report.potential_high - player.potential) * (1 - rate)

    # Development can push the truth outside a stale band; re-open it if so.
    report.ability_low = min(report.ability_low, player.ability - min_ability / 2)
    report.ability_high = max(report.ability_high, player.ability + min_ability / 2)
    report.potential_low = min(report.potential_low, player.potential - min_potential / 2)
    report.potential_high = max(report.potential_high, player.potential + min_potential / 2)

    report.ability_low = round(max(1.0, report.ability_low), 1)
    report.ability_high = round(min(99.0, report.ability_high), 1)
    report.potential_low = round(max(1.0, report.potential_low), 1)
    report.potential_high = round(min(99.0, report.potential_high), 1)


def confidence(report: ScoutingReport, balance: Balance) -> str:
    spread = report.ability_spread
    if spread <= balance.f("scouting.min_ability_spread") + 1.5:
        return "certain"
    if spread <= 8:
        return "confident"
    if spread <= 18:
        return "rough idea"
    return "guesswork"
