"""Game lifecycle: new, load, state, continue, save, inbox."""

from __future__ import annotations

import random
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from football_agent.engine import persistence
from football_agent.engine.tick import tick
from football_agent.engine.world import create_world

from .. import dto
from ..negotiations import evict_all as evict_negotiations
from ..session import (
    INBOX_HISTORY_WEEKS,
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
    emblem: str = "shield"
    accent: str = "emerald"


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
    from football_agent.engine import agency_management, careers, market
    agency_management.initialize(world, balance)
    result = agency_management.action(world, balance, "identity", {"emblem": body.emblem, "accent": body.accent})
    if not result.ok:
        raise HTTPException(400, result.message)
    careers.initialize(world, balance)
    market.initialize(world, balance)
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
    from football_agent.engine import agency_management, careers, market
    balance = default_balance()
    agency_management.initialize(world, balance)
    careers.initialize(world, balance)
    market.initialize(world, balance)
    session = store.create(world, balance, save_path, share_existing=True)
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
    # The inbox is now purely a history feed — "what happened" — because "what
    # still needs me" is derived from world state instead. Previously this line
    # discarded every non-ACTION event at each week boundary, which meant the
    # Recent feed could only ever show the week just gone and the game had no
    # readable memory at all. Keep a rolling window of everything instead.
    session.inbox = list(session.world.recent_events)
    return {
        "state": dto.game_state_dto(session),
        "events": [dto.event_dto(e) for e in events],
        "open_decision_ids": [d["id"] for d in dto.decisions_dto(session.world, session.balance) if d["actionable"]],
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
    recent = [e for e in events if e.kind not in dto.NOISE_KINDS]
    return {
        # Derived from the world as it stands, not from the last four weeks of
        # ACTION events. An item here is an obligation that is still open, so
        # it disappears the moment you resolve it.
        "needs_decision": dto.decisions_dto(session.world, session.balance),
        "recent": [dto.event_dto(e) for e in reversed(recent[-limit:])],
    }


@router.get("/decisions")
def get_decisions(session: Session = Depends(get_session)) -> Dict[str, Any]:
    """Just the open decisions — what the rail, the badges and the dashboard read."""
    decisions = dto.decisions_dto(session.world, session.balance)
    return {
        "decisions": decisions,
        "actionable": sum(1 for d in decisions if d["actionable"]),
    }
