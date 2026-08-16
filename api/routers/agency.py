"""Agency routes — headquarters, finances, leagues."""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from football_agent.engine import actions

from .. import dto
from ..session import Session, get_active_session, get_session

router = APIRouter(tags=["agency"])


@router.get("/hq")
def get_hq(session: Session = Depends(get_session)) -> Dict[str, Any]:
    return dto.hq_dto(session.world, session.balance)


@router.post("/hq/upgrade")
def upgrade_hq(session: Session = Depends(get_active_session)) -> Dict[str, Any]:
    result = actions.upgrade_hq(session.world, session.balance)
    session.inbox.extend(result.events)
    return {
        "ok": result.ok,
        "message": result.message,
        "events": [dto.event_dto(e) for e in result.events],
    }


@router.get("/finances")
def get_finances(session: Session = Depends(get_session)) -> Dict[str, Any]:
    return dto.finances_dto(session.world, session.balance)


@router.get("/leagues")
def get_leagues(session: Session = Depends(get_session)) -> List[Dict[str, Any]]:
    return dto.leagues_dto(session.world)
