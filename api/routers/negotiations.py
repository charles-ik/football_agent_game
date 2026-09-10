"""Negotiation routes — the stateful part.

Three ways in (signing, renewal, deal), one way through (propose / accept the
counter / abandon), and completion happens *server-side in the same request*:
the agreed value is never handed to the browser to be trusted back.

* ACCEPTED  -> complete_signing / complete_renewal / accept_deal, then autosave
* WALKED / ABANDONED / declined EXHAUSTED -> actions.close_negotiation()
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from football_agent.engine import actions, persistence
from football_agent.engine.systems.negotiation import Status, pct_from_x, x_from_pct

from .. import dto
from ..negotiations import (
    NegotiationHandle,
    drop,
    find_open,
    get_handle,
    negotiation_dto,
    new_handle,
)
from ..session import Session, get_active_session

router = APIRouter(prefix="/negotiations", tags=["negotiations"])


class OpenSigningRequest(BaseModel):
    player_id: int


class OpenDealRequest(BaseModel):
    interest_id: int
    years: int = Field(default=3, ge=1, le=10)


class ProposeRequest(BaseModel):
    pct: Optional[float] = None  # signing / renewal
    wage: Optional[float] = None  # deal
    fee: Optional[float] = None  # deal


class AssessRequest(BaseModel):
    wage: float = 0.0


def _refusal(message: str) -> Dict[str, Any]:
    return {"ok": False, "message": message, "events": []}


def _result_body(result) -> Dict[str, Any]:
    return {
        "ok": result.ok,
        "message": result.message,
        "events": [dto.event_dto(e) for e in result.events],
    }


def _complete(session: Session, handle: NegotiationHandle) -> Optional[Dict[str, Any]]:
    """Run completion/consequences for a negotiation that has left OPEN.

    Returns the ActionResult body to attach to the DTO, or None while open.
    """
    world, balance, neg = session.world, session.balance, handle.negotiation

    if neg.status is Status.ACCEPTED:
        if handle.kind == "signing":
            result = actions.complete_signing(
                world, balance, handle.subject_id, pct_from_x(balance, neg.agreed_x)
            )
        elif handle.kind == "renewal":
            result = actions.complete_renewal(
                world, balance, handle.subject_id, pct_from_x(balance, neg.agreed_x)
            )
        else:
            interest = world.interests.get(handle.subject_id)
            if interest is None:
                # The approach vanished mid-haggle (another deal for the same
                # client completed, or it expired). The talks lapse with it.
                drop(session, handle)
                raise HTTPException(404, "negotiation_not_found")
            player = world.players[interest.player_id]
            wage, fee = actions.package_from_x(balance, interest, neg.agreed_x)
            wage = min(wage, interest.max_wage)
            if interest.is_renewal or player.is_free_agent:
                fee = 0.0
            else:
                fee = min(fee, interest.max_fee)
            result = actions.accept_deal(world, balance, interest.id, wage, fee, handle.years)
        session.inbox.extend(result.events)
        drop(session, handle)
        return _result_body(result)

    if neg.status in (Status.WALKED, Status.ABANDONED):
        result = actions.close_negotiation(world, balance, neg)
        session.inbox.extend(result.events)
        drop(session, handle)
        return _result_body(result) if result.message else None

    # EXHAUSTED is not terminal: their last counter is on the table. The handle
    # stays live so the player can take their terms or walk away (an abandoned
    # exhausted negotiation is closed by the abandon path above).
    return None


@router.post("/signing")
def open_signing(
    body: OpenSigningRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    existing = find_open(session, "signing", body.player_id)
    if existing is not None:
        return negotiation_dto(session, existing)  # resume, never re-roll
    negotiation, reason = actions.open_signing_negotiation(
        session.world, session.balance, body.player_id
    )
    if negotiation is None:
        return _refusal(reason)
    handle = new_handle(session, "signing", negotiation, body.player_id)
    return negotiation_dto(session, handle)


@router.post("/renewal")
def open_renewal(
    body: OpenSigningRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    existing = find_open(session, "renewal", body.player_id)
    if existing is not None:
        return negotiation_dto(session, existing)
    negotiation, reason = actions.open_renewal_negotiation(
        session.world, session.balance, body.player_id
    )
    if negotiation is None:
        return _refusal(reason)
    handle = new_handle(session, "renewal", negotiation, body.player_id)
    return negotiation_dto(session, handle)


@router.post("/deal")
def open_deal(
    body: OpenDealRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    existing = find_open(session, "deal", body.interest_id)
    if existing is not None:
        if body.interest_id in session.world.interests:
            return negotiation_dto(session, existing)
        drop(session, existing)  # the approach is gone; the haggle is dead
    # can_negotiate_interest FIRST — it enforces window-open, one attempt per
    # approach and the injury block. Opening the negotiation is the commitment.
    ok, reason = actions.can_negotiate_interest(session.world, session.balance, body.interest_id)
    if not ok:
        return _refusal(reason)
    interest = session.world.interests[body.interest_id]
    negotiation = actions.open_deal_negotiation(session.world, session.balance, interest)
    handle = new_handle(session, "deal", negotiation, interest.id, years=body.years)
    return negotiation_dto(session, handle)


@router.post("/{handle_id}/assess")
def assess_deal(
    handle_id: str, body: AssessRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    """How the client will take this wage, shown *before* the package is put
    to the club — the thing that makes a greedy deal a choice, not a trap."""
    handle = get_handle(session, handle_id)
    if handle.kind != "deal":
        raise HTTPException(400, "bad_request")
    interest = session.world.interests.get(handle.subject_id)
    if interest is None:
        raise HTTPException(404, "negotiation_not_found")
    player = session.world.players[interest.player_id]
    club = session.world.clubs[interest.club_id]
    trust_delta, verdict = actions.assess_move(
        session.world, session.balance, player, club, body.wage
    )
    return {"trust_delta": round(trust_delta, 1), "verdict": verdict}


@router.post("/{handle_id}/propose")
def propose(
    handle_id: str, body: ProposeRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    handle = get_handle(session, handle_id)
    neg = handle.negotiation
    if neg.status is not Status.OPEN:
        return _terminal_dto(session, handle)

    if handle.kind == "deal":
        if body.wage is None:
            raise HTTPException(400, "bad_request")
        interest = session.world.interests.get(handle.subject_id)
        if interest is None:
            # The approach lapsed mid-negotiation (e.g. expiry); treat as gone.
            neg.status = Status.ABANDONED
            return _terminal_dto(session, handle)
        x = actions.propose_package(session.balance, interest, body.wage, body.fee or 0.0)
        offer = {"wage": dto.money(body.wage), "fee": dto.money(body.fee or 0.0)}
    else:
        if body.pct is None:
            raise HTTPException(400, "bad_request")
        x = x_from_pct(session.balance, body.pct)
        offer = {"pct": round(body.pct, 4)}

    # Recorded *before* propose() appends its Response, so the index lines up
    # with the history entry this call is about to create.
    handle.offers[len(neg.history)] = offer
    neg.propose(x)  # on_first_propose fires here — the attempt is now spent
    return _terminal_dto(session, handle)


@router.post("/{handle_id}/accept-counter")
def accept_counter(
    handle_id: str, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    handle = get_handle(session, handle_id)
    neg = handle.negotiation
    if neg.last_counter is None or neg.status not in (Status.OPEN, Status.EXHAUSTED):
        raise HTTPException(400, "bad_request")
    neg.accept_counter()
    return _terminal_dto(session, handle)


@router.post("/{handle_id}/abandon")
def abandon(handle_id: str, session: Session = Depends(get_active_session)) -> Dict[str, Any]:
    handle = get_handle(session, handle_id)
    if handle.negotiation.status is Status.OPEN or handle.negotiation.status is Status.EXHAUSTED:
        handle.negotiation.abandon()
    return _terminal_dto(session, handle)


def _terminal_dto(session: Session, handle: NegotiationHandle) -> Dict[str, Any]:
    body = negotiation_dto(session, handle)
    result = _complete(session, handle)
    if result is not None:
        body["result"] = result
    return body
