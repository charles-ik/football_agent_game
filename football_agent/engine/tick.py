"""The weekly tick.

Systems run in a fixed order, each with its own derived RNG stream, each
returning events rather than printing or mutating silently. This is the whole
engine surface: ``tick(world, balance) -> [Event]``.
"""

from __future__ import annotations

from typing import List

from . import calendar as cal
from . import agency_management, careers, market
from . import reputation
from .balance import Balance, load_balance
from .events import (
    SEASON_STARTED,
    WEEK_ADVANCED,
    WINDOW_CLOSED,
    WINDOW_OPENED,
    Event,
    Severity,
    ev,
)
from .models import World
from .rng import stream
from .systems import contracts, development, finance, league, rivals, scouting, transfers, trust
from .world import refresh_all_needs

# Order is deliberate: money first (so insolvency is judged on the week just
# gone), then the world moves, then opportunities appear, then rivals react.
SYSTEM_ORDER = [
    ("finance", finance.run),
    ("development", development.run),
    ("contracts", contracts.run),
    ("trust", trust.run),
    ("scouting", scouting.run),
    ("transfers", transfers.run),
    ("rivals", rivals.run),
]


def tick(world: World, balance: Balance | None = None) -> List[Event]:
    """Advance one week and return everything that happened."""
    balance = balance or load_balance()
    if world.game_over:
        return []

    agency_management.initialize(world, balance)
    careers.initialize(world, balance)
    market.initialize(world, balance)
    previous_week = world.week
    world.week += 1
    world.season = cal.season_number(balance, world.week)

    loan_events = market.run(world, stream(world.seed, world.week, "market"), balance)
    events: List[Event] = [
        ev(
            WEEK_ADVANCED,
            cal.describe(balance, world.week),
            world.week,
            Severity.INFO,
            season=world.season,
            season_week=cal.season_week(balance, world.week),
        )
    ]

    events.extend(loan_events)

    if cal.is_season_start(balance, world.week) and world.week > 1:
        events.extend(_season_rollover(world, balance))

    events.extend(_window_transition(world, balance, previous_week))

    if cal.is_match_week(balance, world.week):
        events.extend(league.run(world, stream(world.seed, world.week, "league"), balance))

    for name, system in SYSTEM_ORDER:
        events.extend(system(world, stream(world.seed, world.week, name), balance))
        if world.game_over:
            break

    for event in events:
        careers.record_event(world, event)
    careers.reconcile_departures(world)
    if not world.game_over:
        events.extend(careers.run(world, stream(world.seed, world.week, "careers"), balance))
        events.extend(agency_management.run(world, stream(world.seed, world.week, "agency"), balance))
    world.recent_events = (world.recent_events + events)[-120:]
    _decay_reputation(world, balance)
    return events


def _season_rollover(world: World, balance: Balance) -> List[Event]:
    r = stream(world.seed, world.week, "season_rollover")
    events: List[Event] = [
        ev(
            SEASON_STARTED,
            f"Season {world.season} begins.",
            world.week,
            Severity.INFO,
            season=world.season,
        )
    ]
    events.extend(league.season_rollover(world, r, balance))
    events.extend(development.season_rollover(world, r, balance))
    refresh_all_needs(world, r)
    return events


def _window_transition(world: World, balance: Balance, previous_week: int) -> List[Event]:
    was_open = cal.window_open(balance, previous_week) if previous_week > 0 else False
    now_open = cal.window_open(balance, world.week)
    if now_open and not was_open:
        refresh_all_needs(world, stream(world.seed, world.week, "club_needs"))
        return [
            ev(
                WINDOW_OPENED,
                f"{cal.window_name(balance, world.week)} is open. Deals can be done.",
                world.week,
                Severity.ACTION,
            )
        ]
    if was_open and not now_open:
        return [
            ev(
                WINDOW_CLOSED,
                "The window has shut. No deals until it reopens.",
                world.week,
                Severity.WARNING,
            )
        ]
    return []


def _decay_reputation(world: World, balance: Balance) -> None:
    """Standing fades if you stop doing deals."""
    reputation.lose(world, balance, balance.f("reputation.weekly_decay"))
