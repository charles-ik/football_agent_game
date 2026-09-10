"""Club intelligence, proactive pitches, and temporary transfer routes."""
from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from football_agent.engine import market
from .. import dto
from ..session import Session, get_session, get_active_session

router = APIRouter(tags=["market"])

class MarketAction(BaseModel):
    operation: str
    payload: Dict[str, Any] = Field(default_factory=dict)

@router.get("/market")
def get_market(session: Session = Depends(get_session)):
    return market.state(session.world, session.balance)

@router.post("/market/action")
def market_action(body: MarketAction, session: Session = Depends(get_active_session)):
    # Existing session negotiations are not world state; reject conflicting moves here.
    if body.operation == "loan_open":
        try:
            pid = int(body.payload.get("player_id"))
        except (ValueError, TypeError):
            pid = None
        for handle in session.negotiations.values():
            interest = session.world.interests.get(handle.subject_id) if handle.kind == "deal" else None
            if interest and interest.player_id == pid and handle.negotiation.status.value in ("open", "accepted") :
                return {"ok": False, "message": "Resolve the client's existing negotiation first.", "events": [], "payload": None}
    result = market.action(session.world, session.balance, body.operation, body.payload)
    session.inbox.extend(result.events)
    return {"ok": result.ok, "message": result.message, "events": [dto.event_dto(e) for e in result.events], "payload": result.payload}
