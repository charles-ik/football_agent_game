"""Game lifecycle: new, load, state, continue, save, inbox."""

from __future__ import annotations

import random
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from football_agent.engine import persistence
from football_agent.engine.events import Severity
from football_agent.engine.tick import tick
from football_agent.engine.world import create_world

from .. import dto
from ..negotiations import evict_all as evict_negotiations
from ..session import (
    INBOX_ACTION_KEEP_WEEKS,
    INBOX_LIMIT,
    Session,
    default_balance,
    get_active_session,
    get_session,
    save_path_for,
    saves_dir,
    set_session_cookie,
    store,
)

router = APIRouter(prefix="/game", tags=["game"])


class NewGameRequest(BaseModel):
    seed: Optional[int] = None
    name: str = "Your Agency"
    slot: str = "autosave"


class LoadGameRequest(BaseModel):
    slot: str = "autosave"


class SaveGameRequest(BaseModel):
    slot: str = "autosave"


@router.post("/new")
def new_game(body: NewGameRequest, response: Response) -> Dict[str, Any]:
    save_path = save_path_for(body.slot)
    balance = default_balance()
    seed = body.seed if body.seed is not None else random.randrange(1, 2**31)
    world = create_world(seed, balance, body.name or "Your Agency")
    session = store.create(world, balance, save_path)
    persistence.save(world, save_path)
    set_session_cookie(response, session.id)
    # The seed is echoed exactly once, here, so the player can note it down.
    # It never appears in any other response.
    return {"state": dto.game_state_dto(session), "seed": seed}


@router.post("/load")
def load_game(body: LoadGameRequest, response: Response) -> Dict[str, Any]:
    save_path = save_path_for(body.slot)
    if not persistence.exists(save_path):
        raise HTTPException(404, "save_not_found")
    world = persistence.load(save_path)  # SaveError -> 409 via handler
    session = store.create(world, default_balance(), save_path)
    set_session_cookie(response, session.id)
    return {"state": dto.game_state_dto(session)}


@router.get("/saves")
def list_saves() -> Dict[str, Any]:
    """A plain directory listing — file metadata, not a rule. Lets the client
    pick a slot instead of typing a name blind."""
    directory = saves_dir()
    slots: list[Dict[str, Any]] = []
    if directory.exists():
        for path in sorted(directory.glob("*.json")):
            entry: Dict[str, Any] = {
                "slot": path.stem,
                "modified_at": path.stat().st_mtime,
                "compatible": True,
                "agency_name": None,
                "week": None,
            }
            try:
                world = persistence.load(path)
                entry["agency_name"] = world.agency.name
                entry["week"] = world.week
            except Exception:
                entry["compatible"] = False
            slots.append(entry)
        slots.sort(key=lambda e: e["modified_at"], reverse=True)
    return {"slots": slots}


@router.get("")
def get_game(session: Session = Depends(get_session)) -> Dict[str, Any]:
    return dto.game_state_dto(session)


@router.post("/continue")
def continue_week(session: Session = Depends(get_active_session)) -> Dict[str, Any]:
    """One press = one week. Reproduces the CLI's Continue exactly."""
    events = tick(session.world, session.balance)
    evict_negotiations(session)  # nothing survives a week boundary
    session.inbox = [
        e
        for e in session.inbox
        if e.severity is Severity.ACTION
        and e.week >= session.world.week - INBOX_ACTION_KEEP_WEEKS
    ]
    session.inbox.extend(events)
    session.inbox = session.inbox[-INBOX_LIMIT:]
    persistence.save(session.world, session.save_path)
    return {
        "state": dto.game_state_dto(session),
        "events": [dto.event_dto(e) for e in events],
        "notable": [dto.event_dto(e) for e in events if e.kind not in dto.NOISE_KINDS],
    }


@router.post("/save")
def save_game(
    body: SaveGameRequest, session: Session = Depends(get_session)
) -> Dict[str, Any]:
    # A manual save writes the slot but does not re-target the autosave — the
    # session keeps the slot it was created/loaded with, like the CLI's fixed
    # save path.
    persistence.save(session.world, save_path_for(body.slot))
    return {"ok": True, "slot": body.slot}


@router.get("/inbox")
def get_inbox(limit: int = 40, session: Session = Depends(get_session)) -> Dict[str, Any]:
    events = list(session.inbox)
    needs_decision = [e for e in events if e.severity is Severity.ACTION]
    recent = [e for e in events if e.kind not in dto.NOISE_KINDS]
    return {
        "needs_decision": [dto.event_dto(e) for e in reversed(needs_decision[-limit:])],
        "recent": [dto.event_dto(e) for e in reversed(recent[-limit:])],
    }
