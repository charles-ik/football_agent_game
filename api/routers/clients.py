"""Client routes — the roster, the detail screen, and client management."""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from football_agent.engine import actions

from .. import dto
from ..session import Session, get_active_session, get_session

router = APIRouter(prefix="/clients", tags=["clients"])


class SeekRequest(BaseModel):
    promise: bool = False


def _result(session: Session, result) -> Dict[str, Any]:
    session.inbox.extend(result.events)
    return {
        "ok": result.ok,
        "message": result.message,
        "events": [dto.event_dto(e) for e in result.events],
    }


@router.get("")
def get_clients(session: Session = Depends(get_session)) -> List[Dict[str, Any]]:
    return dto.client_list_dto(session.world, session.balance)


@router.get("/{player_id}")
def get_client(player_id: int, session: Session = Depends(get_session)) -> Dict[str, Any]:
    # KeyError -> 404 via the app-level handler
    detail = dto.client_detail_dto(session.world, session.balance, player_id)
    from ..negotiations import find_open
    for interest in detail["interests"]:
        if find_open(session, "deal", interest["id"]):
            interest["can_negotiate"] = {"ok": True, "reason": "Resume existing talks"}
    return detail


@router.post("/{player_id}/seek")
def seek_move(
    player_id: int, body: SeekRequest, session: Session = Depends(get_active_session)
) -> Dict[str, Any]:
    return _result(
        session, actions.seek_move(session.world, session.balance, player_id, body.promise)
    )


@router.post("/{player_id}/stop-seeking")
def stop_seeking(player_id: int, session: Session = Depends(get_active_session)) -> Dict[str, Any]:
    return _result(session, actions.stop_seeking(session.world, player_id))


@router.post("/{player_id}/release")
def release_client(player_id: int, session: Session = Depends(get_active_session)) -> Dict[str, Any]:
    return _result(session, actions.release_client(session.world, session.balance, player_id))
