"""Season calendar.

One Continue = one week. Deals can only be struck inside a transfer window,
which is what gives the year a shape and stops every week feeling identical.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from .balance import Balance


def weeks_per_season(balance: Balance) -> int:
    return balance.i("calendar.weeks_per_season")


def season_week(balance: Balance, absolute_week: int) -> int:
    """1-based week within the season."""
    per = weeks_per_season(balance)
    if absolute_week <= 0:
        return 1
    return ((absolute_week - 1) % per) + 1


def season_number(balance: Balance, absolute_week: int) -> int:
    per = weeks_per_season(balance)
    if absolute_week <= 0:
        return 1
    return ((absolute_week - 1) // per) + 1


def windows(balance: Balance) -> List[Tuple[int, int]]:
    return [(int(a), int(b)) for a, b in balance.l("calendar.windows")]


def window_open(balance: Balance, absolute_week: int) -> bool:
    sw = season_week(balance, absolute_week)
    return any(start <= sw <= end for start, end in windows(balance))


def current_window(balance: Balance, absolute_week: int) -> Optional[Tuple[int, int]]:
    sw = season_week(balance, absolute_week)
    for start, end in windows(balance):
        if start <= sw <= end:
            return (start, end)
    return None


def window_name(balance: Balance, absolute_week: int) -> Optional[str]:
    win = current_window(balance, absolute_week)
    if not win:
        return None
    names = balance.d("calendar.window_names", {})
    return names.get(str(win[0]), "Transfer window")


def weeks_until_window_closes(balance: Balance, absolute_week: int) -> Optional[int]:
    win = current_window(balance, absolute_week)
    if not win:
        return None
    return win[1] - season_week(balance, absolute_week)


def weeks_until_next_window(balance: Balance, absolute_week: int) -> int:
    sw = season_week(balance, absolute_week)
    per = weeks_per_season(balance)
    starts = sorted(start for start, _ in windows(balance))
    for start in starts:
        if start > sw:
            return start - sw
    return (per - sw) + starts[0]


def is_match_week(balance: Balance, absolute_week: int) -> bool:
    sw = season_week(balance, absolute_week)
    return balance.i("calendar.match_week_start") <= sw <= balance.i("calendar.match_week_end")


def is_season_start(balance: Balance, absolute_week: int) -> bool:
    return season_week(balance, absolute_week) == 1


def is_season_end(balance: Balance, absolute_week: int) -> bool:
    return season_week(balance, absolute_week) == weeks_per_season(balance)


def describe(balance: Balance, absolute_week: int) -> str:
    sw = season_week(balance, absolute_week)
    season = season_number(balance, absolute_week)
    label = f"Season {season}, week {sw}"
    win = window_name(balance, absolute_week)
    if win:
        remaining = weeks_until_window_closes(balance, absolute_week)
        label += f" — {win} OPEN ({remaining}w left)"
    return label
