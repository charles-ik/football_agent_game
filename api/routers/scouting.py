"""Scouting routes — regions, scouts, candidates and reports."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from football_agent.engine import actions
from football_agent.engine.models import Position

from .. import dto
from ..session import Session, get_active_session, get_session

router = APIRouter(prefix="/scouting", tags=["scouting"])


def _result(session: Session, result) -> Dict[str, Any]:
    """ActionResult -> wire. Refusals are values: 200 with ok=False."""
    session.inbox.extend(result.events)
    return {
        "ok": result.ok,
        "message": result.message,
        "events": [dto.event_dto(e) for e in result.events],
    }


class AssignRequest(BaseModel):
    scout_id: int
    region_id: Optional[str] = None  # null = unassign
    brief_position: Optional[str] = None
    brief_max_age: Optional[int] = None


class FocusRequest(BaseModel):
    scout_id: int
    player_id: Optional[int] = None  # null clears focus


class HireRequest(BaseModel):
    index: int


class DismissRequest(BaseModel):
    scout_id: int


@router.get("")
def get_scouting(session: Session = Depends(get_session)) -> Dict[str, Any]:
    return dto.scouting_state_dto(session.world, session.balance)


@router.get("/candidates")
def get_candidates(session: Session = Depends(get_session)) -> List[Dict[str, Any]]:
    return dto.scout_candidates_dto(session.world, session.balance)


@router.post("/assign")
def assign_scout(
    body: AssignRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    brief_position = None
    if body.brief_position:
        try:
            brief_position = Position(body.brief_position)
        except ValueError:
            raise HTTPException(400, "bad_request")
    return _result(
        session,
        actions.assign_scout(
            session.world, body.scout_id, body.region_id, brief_position, body.brief_max_age
        ),
    )


@router.post("/focus")
def focus_scout(
    body: FocusRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    return _result(session, actions.focus_scout(session.world, body.scout_id, body.player_id))


@router.post("/hire")
def hire_scout(
    body: HireRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    # The server regenerates this week's candidate list and picks by index —
    # accepting a candidate object from the client would let a browser mint a
    # 95-quality scout.
    candidates = actions.scout_candidates(session.world, session.balance)
    if body.index < 0 or body.index >= len(candidates):
        raise HTTPException(400, "bad_request")
    return _result(session, actions.hire_scout(session.world, candidates[body.index], session.balance))


@router.post("/dismiss")
def dismiss_scout(
    body: DismissRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    return _result(session, actions.fire_scout(session.world, body.scout_id))
