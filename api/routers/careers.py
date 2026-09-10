"""Client career goals, conversations and alumni."""
from typing import Any, Dict
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from football_agent.engine import careers
from ..session import Session, get_active_session, get_session
from .clients import _result

router = APIRouter(prefix='/careers', tags=['careers'])

class CareerAction(BaseModel):
    operation: str
    payload: Dict[str, Any] = Field(default_factory=dict)

@router.get('')
def get_careers(session: Session = Depends(get_session)):
    return careers.state(session.world, session.balance)

@router.post('/action')
def career_action(body: CareerAction, session: Session = Depends(get_active_session)):
    return _result(session, careers.action(session.world, session.balance, body.operation, body.payload))
