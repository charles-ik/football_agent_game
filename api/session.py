"""Sessions, cookies and save-slot paths.

A session is everything one browser tab's game needs that is *not* the world:
the balance config, the save path, the rolling inbox, and the live negotiation
handles. Sessions live in a module-level dict — the service is single-process
by design (``--workers 1`` is load-bearing), this is a local single-player game.

The browser only ever holds an opaque id in an httpOnly cookie. No game state
travels in the cookie.
"""

from __future__ import annotations

import os
import re
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Dict, List, Optional

from fastapi import Depends, HTTPException, Request, Response

from football_agent.engine.balance import Balance, load_balance
from football_agent.engine.events import Event
from football_agent.engine.models import World

if TYPE_CHECKING:
    from .negotiations import NegotiationHandle

COOKIE_NAME = "fa_session"
SESSION_TTL_SECONDS = 24 * 60 * 60
INBOX_LIMIT = 120
INBOX_ACTION_KEEP_WEEKS = 4

SLOT_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")


def saves_dir() -> Path:
    """Save directory, env-overridable so tests never touch a real save."""
    return Path(os.environ.get("FA_SAVES_DIR", "saves"))


def save_path_for(slot: str) -> Path:
    """The only way a slot name becomes a path. Anything else is a 400."""
    if not SLOT_RE.match(slot or ""):
        raise HTTPException(400, "bad_slot")
    return saves_dir() / f"{slot}.json"


@dataclass
class Session:
    id: str
    world: World
    balance: Balance
    save_path: Path
    inbox: List[Event] = field(default_factory=list)
    negotiations: Dict[str, "NegotiationHandle"] = field(default_factory=dict)
    last_seen: float = 0.0

    def touch(self) -> None:
        self.last_seen = time.time()

    def pending_actions(self) -> int:
        from football_agent.engine.events import Severity

        return sum(1 for e in self.inbox if e.severity is Severity.ACTION)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: Dict[str, Session] = {}

    def create(self, world: World, balance: Balance, save_path: Path) -> Session:
        self._evict_stale()
        session = Session(
            id=secrets.token_urlsafe(24),
            world=world,
            balance=balance,
            save_path=save_path,
        )
        session.touch()
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> Optional[Session]:
        session = self._sessions.get(session_id)
        if session is None:
            return None
        if time.time() - session.last_seen > SESSION_TTL_SECONDS:
            del self._sessions[session_id]
            return None
        return session

    def clear(self) -> None:
        self._sessions.clear()

    def _evict_stale(self) -> None:
        now = time.time()
        for key in [k for k, s in self._sessions.items() if now - s.last_seen > SESSION_TTL_SECONDS]:
            del self._sessions[key]


store = SessionStore()


def cookie_secure() -> bool:
    """Secure cookies only when served off localhost (i.e. never, by default)."""
    return os.environ.get("FA_COOKIE_SECURE", "").lower() in ("1", "true", "yes")


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        session_id,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def get_session(request: Request) -> Session:
    """FastAPI dependency: resolve the session cookie or 404."""
    session_id = request.cookies.get(COOKIE_NAME)
    session = store.get(session_id) if session_id else None
    if session is None:
        raise HTTPException(404, "session_not_found")
    session.touch()
    return session


def get_active_session(session: Session = Depends(get_session)) -> Session:
    """Mutating routes only: the run is over, the world is read-only now."""
    if session.world.game_over:
        raise HTTPException(409, "game_over")
    return session


def default_balance() -> Balance:
    return load_balance()
