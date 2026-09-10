"""Agency development actions and read models."""
from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from football_agent.engine import agency_management
from .. import dto
from ..session import Session, get_active_session, get_session

router = APIRouter(prefix="/management", tags=["management"])


class ManagementAction(BaseModel):
    operation: str
    payload: dict[str, Any] = Field(default_factory=dict)


@router.get("")
def get_management(session: Session = Depends(get_session)):
    return agency_management.state(session.world, session.balance)


@router.post("/action")
def act(body: ManagementAction, session: Session = Depends(get_active_session)):
    result = agency_management.action(session.world, session.balance, body.operation, body.payload)
    session.inbox.extend(result.events)
    return {"ok": result.ok, "message": result.message, "events": [dto.event_dto(e) for e in result.events]}
