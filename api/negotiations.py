"""Live negotiation handles.

A ``Negotiation`` holds a live RNG, a hidden threshold and a callback that
closes over world state — it cannot be serialised, and must not be: the
callback is what enforces one negotiation per approach. So handles live in the
session, keyed by an opaque id, and the client only ever sees the id plus
rendered hints and counters.

Two evictions keep this honest: handles older than ~15 minutes lapse (the CLI
cannot leave a negotiation open while you do something else), and *every* open
handle dies when the week ticks.

Nothing from here ever includes ``threshold`` or the raw normalised ``x`` —
the client sees percentages and money only.
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

from fastapi import HTTPException

from football_agent.engine import actions
from football_agent.engine.balance import Balance
from football_agent.engine.models import World
from football_agent.engine.systems.negotiation import (
    Negotiation,
    Status,
    commission_guide,
    deal_guide,
    pct_from_x,
)

from . import dto
from .session import Session

HANDLE_TTL_SECONDS = 15 * 60


@dataclass
class NegotiationHandle:
    id: str
    kind: str  # "signing" | "renewal" | "deal"
    negotiation: Negotiation
    subject_id: int  # player_id, or interest_id for deals
    years: int = 4  # deals only
    created_at: float = 0.0

    def __post_init__(self) -> None:
        if not self.created_at:
            self.created_at = time.time()


def new_handle(
    session: Session, kind: str, negotiation: Negotiation, subject_id: int, years: int = 4
) -> NegotiationHandle:
    evict_stale(session)
    handle = NegotiationHandle(
        id=f"neg_{secrets.token_urlsafe(9)}",
        kind=kind,
        negotiation=negotiation,
        subject_id=subject_id,
        years=years,
    )
    session.negotiations[handle.id] = handle
    return handle


def get_handle(session: Session, handle_id: str) -> NegotiationHandle:
    evict_stale(session)
    handle = session.negotiations.get(handle_id)
    if handle is None:
        raise HTTPException(404, "negotiation_not_found")
    return handle


def find_open(session: Session, kind: str, subject_id: int) -> Optional[NegotiationHandle]:
    """The live haggle for this subject, if one exists.

    One negotiation per approach is the engine's rule; reopening an in-flight
    haggle resumes it rather than minting a fresh one (which would let a page
    reload re-roll the counter-offers).
    """
    evict_stale(session)
    for handle in session.negotiations.values():
        if (
            handle.kind == kind
            and handle.subject_id == subject_id
            and handle.negotiation.status in (Status.OPEN, Status.EXHAUSTED)
        ):
            return handle
    return None


def evict_stale(session: Session) -> None:
    now = time.time()
    for key in [
        k
        for k, h in session.negotiations.items()
        if now - h.created_at > HANDLE_TTL_SECONDS
    ]:
        session.negotiations.pop(key, None)


def evict_all(session: Session) -> None:
    """Nothing survives a week boundary — the CLI cannot, so neither can the web."""
    session.negotiations.clear()


def drop(session: Session, handle: NegotiationHandle) -> None:
    session.negotiations.pop(handle.id, None)


# ---------------------------------------------------------------------------
# Rendering — percentages and money only, never the normalised axis
# ---------------------------------------------------------------------------


def _counter_dto(world: World, balance: Balance, handle: NegotiationHandle) -> Optional[Dict[str, Any]]:
    x = handle.negotiation.last_counter
    if x is None:
        return None
    if handle.kind == "deal":
        interest = world.interests.get(handle.subject_id)
        if interest is None:
            return None
        wage, fee = actions.package_from_x(balance, interest, x)
        return {"wage": dto.money(wage), "fee": dto.money(fee)}
    return {"pct": round(pct_from_x(balance, x), 4)}


def negotiation_dto(session: Session, handle: NegotiationHandle) -> Dict[str, Any]:
    world, balance = session.world, session.balance
    neg = handle.negotiation
    body: Dict[str, Any] = {
        "id": handle.id,
        "kind": handle.kind,
        "subject": neg.subject,
        "status": neg.status.value,
        "round": neg.round,
        "max_rounds": neg.max_rounds,
        "rounds_left": neg.rounds_left,
        "history": [
            {"round": r.round, "hint": r.hint, "status": r.status.value} for r in neg.history
        ],
        "last_response": (
            {"hint": neg.history[-1].hint, "round": neg.history[-1].round}
            if neg.history
            else None
        ),
        "counter": (
            _counter_dto(world, balance, handle)
            if neg.status in (Status.OPEN, Status.EXHAUSTED)
            else None
        ),
    }

    if handle.kind == "deal":
        interest = world.interests.get(handle.subject_id)
        player = world.players.get(interest.player_id) if interest else None
        club = world.clubs.get(interest.club_id) if interest else None
        guide_lo, guide_hi = deal_guide(balance, world.agency.reputation)
        if interest is not None:
            low_wage, low_fee = actions.package_from_x(balance, interest, guide_lo)
            high_wage, high_fee = actions.package_from_x(balance, interest, guide_hi)
            asking = actions.asking_price(world, balance, player) if player else 0.0
            body.update(
                {
                    "axis": "package",
                    "guide": {
                        "low_wage": dto.money(low_wage),
                        "high_wage": dto.money(high_wage),
                        "low_fee": dto.money(low_fee),
                        "high_fee": dto.money(high_fee),
                    },
                    "bounds": {
                        "max_wage": dto.money(interest.max_wage),
                        "max_fee": dto.money(interest.max_fee),
                        "asking_price": dto.money(asking),
                    },
                    "context": {
                        "player": dto.player_dto(world, player) if player else None,
                        "club": (
                            {
                                "id": club.id,
                                "name": club.name,
                                "strength": club.strength,
                                "prestige": club.prestige,
                            }
                            if club
                            else None
                        ),
                        "is_renewal": interest.is_renewal,
                        "years": handle.years,
                    },
                }
            )
    else:
        player = world.players.get(handle.subject_id)
        guide_lo, guide_hi = commission_guide(
            balance, world.agency.reputation, player.trait.value if player else "professional"
        )
        report = world.reports.get(handle.subject_id)
        body.update(
            {
                "axis": "commission_pct",
                "guide": {"low_pct": round(guide_lo, 4), "high_pct": round(guide_hi, 4)},
                "bounds": {
                    "min_pct": balance.f("commission.min_pct"),
                    "max_pct": balance.f("commission.max_pct"),
                },
                "context": {
                    "player": dto.player_dto(world, player) if player else None,
                    "report": dto.report_dto(report, balance) if report else None,
                    "reputation": round(world.agency.reputation),
                },
            }
        )
    return body
