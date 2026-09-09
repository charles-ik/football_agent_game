"""Open decisions, derived from the world as it stands right now.

The inbox answers "what happened?". This module answers a different and much
more useful question: **"what is still waiting on me?"**

That distinction matters because the two were previously conflated. The UI's
"needs a decision" list was built by filtering the last four weeks of the event
feed for ``Severity.ACTION`` — a window over history, not a set of open
conditions. Three things went wrong as a result:

* Acting on something never cleared it. Renewing a contract did not retract the
  event announcing that it was expiring, so the prompt sat there for another
  four weeks telling you to do a thing you had already done.
* Announcements sat alongside obligations. "The summer window is open" and "a
  scout is unassigned" are worth knowing, but neither is a decision addressed to
  you about a specific client, and mixing them in drowned the ones that were.
* Nothing could be ranked, because an event has no notion of how close its
  deadline is.

Everything here is a *read* over existing state. No rules are invented, no
thresholds are new — the contract warning window comes from ``balance`` and the
agent-contract notice period from ``systems.contracts``, exactly as the tick
does. A decision exists precisely as long as the condition that created it, so
resolving the condition removes the decision on the next read.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .balance import Balance
from .economy import format_money
from .events import Severity
from .models import World

# How far ahead an agent agreement counts as "running out". Mirrors the notice
# period the tick already warns on, so the list and the feed agree.
from .systems.contracts import AGENT_CONTRACT_NOTICE_WEEKS


@dataclass
class Decision:
    """One open obligation, with everything the UI needs to rank and route it."""

    #: Stable across weeks, so the UI can animate a list without re-keying.
    id: str
    kind: str
    severity: Severity
    headline: str
    detail: str
    player_id: Optional[int] = None
    interest_id: Optional[int] = None
    #: Weeks until this stops being available. ``None`` means no clock.
    weeks_left: Optional[int] = None
    #: True when the player can act on it right now. A blocked decision is
    #: still shown — it has a deadline — but it is visibly not yet actionable.
    actionable: bool = True
    blocked_reason: str = ""
    extra: Dict[str, Any] = field(default_factory=dict)


# Ordering. Severity dominates, then the deadline, because a critical thing
# three weeks out still outranks a routine thing due this week.
_SEVERITY_ORDER = {
    Severity.CRITICAL: 0,
    Severity.ACTION: 1,
    Severity.WARNING: 2,
    Severity.GOOD: 3,
    Severity.INFO: 4,
}

_NO_CLOCK = 9_999


def _sort_key(decision: Decision) -> tuple:
    return (
        _SEVERITY_ORDER.get(decision.severity, 5),
        0 if decision.actionable else 1,
        decision.weeks_left if decision.weeks_left is not None else _NO_CLOCK,
        decision.id,
    )


def open_decisions(world: World, balance: Balance) -> List[Decision]:
    """Every decision currently waiting on the agent, worst and soonest first."""
    if world.game_over:
        return []

    decisions: List[Decision] = []
    for player_id in world.clients:
        decisions.extend(_club_contract(world, balance, player_id))
        decisions.extend(_agent_contract(world, player_id))
        decisions.extend(_approaches(world, balance, player_id))

    decisions.sort(key=_sort_key)
    return decisions


# ---------------------------------------------------------------------------
# His contract with his club
# ---------------------------------------------------------------------------


def _club_contract(world: World, balance: Balance, player_id: int) -> List[Decision]:
    player = world.players[player_id]
    warn_at = balance.i("transfers.contract_expiry_warning_weeks")

    # No contract at all: he is a free agent and every week without a club is a
    # week of lost wages, lost development and falling trust.
    if player.contract is None:
        return [
            Decision(
                id=f"free-agent:{player_id}",
                kind="contract_expired",
                severity=Severity.CRITICAL,
                headline=f"{player.name} has no club",
                detail="He is a free agent. A move now costs nobody a fee — find him one.",
                player_id=player_id,
                weeks_left=0,
            )
        ]

    remaining = player.contract.expires_week - world.week
    # Mid-contract is not a decision. This is the single biggest source of the
    # noise the old list produced: a client with two years left is not asking
    # anything of you, and saying so every week trains you to ignore the list.
    if remaining > warn_at:
        return []

    club_name = world.club_name(player.club_id)
    if remaining <= 0:
        return [
            Decision(
                id=f"expired:{player_id}",
                kind="contract_expired",
                severity=Severity.CRITICAL,
                headline=f"{player.name}'s contract has expired",
                detail=f"He is out of contract at {club_name}. A move now costs nobody a fee.",
                player_id=player_id,
                weeks_left=0,
            )
        ]

    return [
        Decision(
            id=f"expiring:{player_id}",
            kind="contract_expiring",
            severity=Severity.ACTION if remaining <= warn_at // 2 else Severity.WARNING,
            headline=f"{player.name}'s contract is running out",
            detail=(
                f"{remaining} weeks left at {club_name}. Renew his terms or engineer a move "
                "before he has no leverage left."
            ),
            player_id=player_id,
            weeks_left=remaining,
        )
    ]


# ---------------------------------------------------------------------------
# His agreement with you
# ---------------------------------------------------------------------------


def _agent_contract(world: World, player_id: int) -> List[Decision]:
    record = world.clients[player_id]
    player = world.players[player_id]
    remaining = record.agent_contract.expires_week - world.week
    if remaining > AGENT_CONTRACT_NOTICE_WEEKS:
        return []

    if remaining <= 0:
        severity = Severity.CRITICAL
        detail = "Your agreement with him has lapsed. Re-sign him or lose him."
    elif remaining <= 4:
        severity = Severity.CRITICAL
        detail = (
            f"Your cut of everything he does ends in {remaining} weeks. "
            "Re-sign him while he still owes you the courtesy."
        )
    else:
        severity = Severity.ACTION
        detail = f"Your agreement with him expires in {remaining} weeks. Re-sign him."

    return [
        Decision(
            id=f"agent-contract:{player_id}",
            kind="agent_contract_expiring",
            severity=severity,
            headline=f"Your agreement with {player.name} is ending",
            detail=detail,
            player_id=player_id,
            weeks_left=max(0, remaining),
        )
    ]


# ---------------------------------------------------------------------------
# Clubs who want him
# ---------------------------------------------------------------------------


def _approaches(world: World, balance: Balance, player_id: int) -> List[Decision]:
    from . import actions  # local import: actions imports models, not decisions

    player = world.players[player_id]
    current_wage = player.contract.wage if player.contract else 0.0
    out: List[Decision] = []

    for interest in sorted(world.interests_for(player_id), key=lambda i: i.expires_week):
        # One negotiation per approach. Once it has been spent there is nothing
        # left to decide, so it stops being a decision.
        if interest.attempts_used > 0:
            continue
        weeks_left = max(0, interest.expires_week - world.week)
        ok, reason = actions.can_negotiate_interest(world, balance, interest.id)
        club_name = world.clubs[interest.club_id].name

        # The ceiling is what the club could stretch to, not an offer on the
        # table — the wording has to keep that distinction or the player will
        # read it as a promise and feel cheated when the haggle lands lower.
        delta = interest.max_wage - current_wage
        if current_wage > 0:
            movement = (
                f"up {format_money(delta)}" if delta >= 0 else f"down {format_money(abs(delta))}"
            )
            terms = f"up to {format_money(interest.max_wage)}/wk — {movement} on now"
        else:
            terms = f"up to {format_money(interest.max_wage)}/wk"

        if interest.is_renewal:
            headline = f"{club_name} want to keep {player.name}"
        else:
            headline = f"{club_name} want {player.name}"

        out.append(
            Decision(
                id=f"approach:{interest.id}",
                kind="approach",
                severity=Severity.ACTION if ok else Severity.WARNING,
                headline=headline,
                detail=(
                    f"{terms}. Expires in {weeks_left} weeks, and you get one negotiation."
                ),
                player_id=player_id,
                interest_id=interest.id,
                weeks_left=weeks_left,
                actionable=ok,
                blocked_reason="" if ok else reason,
                extra={
                    "is_renewal": interest.is_renewal,
                    "club_name": club_name,
                    "max_wage": interest.max_wage,
                    "current_wage": current_wage,
                    "wage_delta": delta,
                    # Drives the up/down label in the UI without it having to
                    # decide what "better" means.
                    "improves_terms": current_wage > 0 and delta > 0,
                },
            )
        )

    return out
