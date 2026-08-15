"""League results and tables.

No squads are simulated, so results come from strength-weighted goal draws. The
table exists because you cannot judge an offer without knowing whether the club
making it is 3rd or 18th.
"""

from __future__ import annotations

import math
import random
from typing import List

from ..balance import Balance
from ..events import MATCH_ROUND, SEASON_ENDED, Event, Severity, ev
from ..models import League, LeagueRecord, World


def _poisson(r: random.Random, mean: float) -> int:
    """Knuth's algorithm — keeps the engine dependency-free."""
    mean = max(0.05, mean)
    limit = math.exp(-mean)
    k = 0
    product = 1.0
    while True:
        product *= r.random()
        if product <= limit:
            return k
        k += 1
        if k > 12:
            return k


def run(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    home_adv = balance.f("league.home_advantage")
    goal_base = balance.f("league.goal_base")
    goal_factor = balance.f("league.strength_goal_factor")

    for league in world.leagues.values():
        club_ids = [cid for cid in league.club_ids if cid in world.clubs]
        if len(club_ids) < 2:
            continue
        order = list(club_ids)
        r.shuffle(order)

        for i in range(0, len(order) - 1, 2):
            home = world.clubs[order[i]]
            away = world.clubs[order[i + 1]]
            diff = (home.strength + home_adv) - away.strength
            home_goals = _poisson(r, goal_base + diff * goal_factor)
            away_goals = _poisson(r, goal_base - diff * goal_factor)
            _record(league, home.id, home_goals, away_goals)
            _record(league, away.id, away_goals, home_goals)

        league.round_index += 1

    events.append(
        ev(
            MATCH_ROUND,
            "Results are in.",
            world.week,
            Severity.INFO,
            round_index=next(iter(world.leagues.values())).round_index if world.leagues else 0,
        )
    )
    return events


def _record(league: League, club_id: int, scored: int, conceded: int) -> None:
    entry = league.table.setdefault(club_id, LeagueRecord(club_id=club_id))
    entry.played += 1
    entry.goals_for += scored
    entry.goals_against += conceded
    if scored > conceded:
        entry.won += 1
    elif scored == conceded:
        entry.drawn += 1
    else:
        entry.lost += 1


def standings(world: World, league_id: int) -> List[LeagueRecord]:
    league = world.leagues[league_id]
    rows = [league.table[cid] for cid in league.club_ids if cid in league.table]
    return sorted(rows, key=lambda x: (-x.points, -x.goal_difference, -x.goals_for))


def position_of(world: World, club_id: int) -> int:
    for league in world.leagues.values():
        if club_id in league.club_ids:
            for index, row in enumerate(standings(world, league.id), start=1):
                if row.club_id == club_id:
                    return index
    return 0


def season_rollover(world: World, r: random.Random, balance: Balance) -> List[Event]:
    """Promote, relegate, and wipe the tables."""
    events: List[Event] = []
    tiers = sorted(world.leagues.values(), key=lambda l: l.tier)
    if len(tiers) >= 2:
        up_count = balance.i("league.promotion_places")
        down_count = balance.i("league.relegation_places")
        top, second = tiers[0], tiers[1]

        relegated = [row.club_id for row in standings(world, top.id)[-down_count:]]
        promoted = [row.club_id for row in standings(world, second.id)[:up_count]]

        for club_id in relegated:
            top.club_ids.remove(club_id)
            second.club_ids.append(club_id)
            club = world.clubs[club_id]
            club.tier = second.tier
            club.strength = max(30.0, club.strength - 2.0)
            club.prestige = max(5.0, club.prestige - 3.0)
        for club_id in promoted:
            second.club_ids.remove(club_id)
            top.club_ids.append(club_id)
            club = world.clubs[club_id]
            club.tier = top.tier
            club.strength = min(95.0, club.strength + 2.0)
            club.prestige = min(99.0, club.prestige + 3.0)

        if promoted:
            events.append(
                ev(
                    SEASON_ENDED,
                    "Promoted: "
                    + ", ".join(world.club_name(cid) for cid in promoted)
                    + ". Relegated: "
                    + ", ".join(world.club_name(cid) for cid in relegated)
                    + ".",
                    world.week,
                    Severity.INFO,
                    promoted=promoted,
                    relegated=relegated,
                )
            )

    champions = []
    for league in world.leagues.values():
        rows = standings(world, league.id)
        if rows:
            champions.append(f"{world.club_name(rows[0].club_id)} ({league.name})")
        league.table = {cid: LeagueRecord(club_id=cid) for cid in league.club_ids}
        league.round_index = 0

    if champions:
        events.append(
            ev(
                SEASON_ENDED,
                "Champions: " + "; ".join(champions),
                world.week,
                Severity.INFO,
            )
        )

    # Budgets follow status.
    for club in world.clubs.values():
        from ..economy import market_wage

        club.wage_budget = round(market_wage(balance, club.strength, club.tier) * 18.0, -2)
        club.transfer_budget = round(club.wage_budget * r.uniform(8, 26), -3)
    return events
