"""Fictional stock exchange reads and cash-backed trades."""
from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, StrictInt
from football_agent.engine import investments
from .. import dto
from ..session import Session, get_active_session, get_session

router = APIRouter(prefix="/investments", tags=["investments"])


class TradeRequest(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    shares: StrictInt


@router.get("")
def get_investments(session: Session = Depends(get_session)):
    return investments.state(session.world, session.balance)


@router.post("/trade")
def trade(body: TradeRequest, session: Session = Depends(get_active_session)):
    result = investments.trade(session.world, session.balance, body.symbol, body.side, body.shares)
    session.inbox.extend(result.events)
    return {"ok": result.ok, "message": result.message, "events": [dto.event_dto(event) for event in result.events]}
