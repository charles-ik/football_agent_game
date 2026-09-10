"""Serialize local game operations and persist successful mutations with retry receipts."""
from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import logging

from fastapi import Request
from starlette.responses import JSONResponse, Response

from football_agent.engine import persistence
from .session import COOKIE_NAME, INBOX_LIMIT, store


def install_mutation_boundary(app):
    # Local, single-process game: one lock also makes simultaneous read snapshots
    # consistent with writes. No remote/network work happens inside engine actions.
    lock = asyncio.Lock()

    @app.middleware("http")
    async def durable_actions(request: Request, call_next):
        async with lock:
            session = store.get(request.cookies.get(COOKIE_NAME, ""))
            mutate = request.method == "POST" and session is not None and not request.url.path.endswith("/assess") and request.url.path not in (
                "/api/game/new", "/api/game/load", "/api/game/save"
            )
            if not mutate:
                return await call_next(request)
            body = await request.body()
            fingerprint = hashlib.sha256(request.url.path.encode() + body).hexdigest()
            key = request.headers.get("idempotency-key")
            if key and len(key) > 128:
                return JSONResponse({"error": "bad_request"}, status_code=400)
            receipt = session.world.mutation_receipts.get(key) if key else None
            if receipt and isinstance(receipt.get("body"), dict):
                handle_id = receipt["body"].get("id", "")
                if isinstance(handle_id, str) and handle_id.startswith("neg_") and receipt["body"].get("status") in ("open", "exhausted"):
                    from .negotiations import evict_stale
                    evict_stale(session)
                    if handle_id not in session.negotiations:
                        return JSONResponse({"error": "negotiation_not_found", "message": "Those talks have lapsed. Review the current opportunities."}, status_code=409)
            if receipt:
                if receipt["fingerprint"] != fingerprint:
                    return JSONResponse({"error": "request_key_reused", "message": "That request key belongs to another action."}, status_code=409)
                return JSONResponse(receipt["body"], status_code=receipt["status"])
            expected = request.headers.get("if-match")
            if expected is not None and expected != str(session.world.revision):
                return JSONResponse({"error": "stale_state", "message": "The game changed in another action. Refresh and review before trying again."}, status_code=409)
            before = copy.deepcopy(session.world)
            old_inbox = list(session.inbox)
            response = await call_next(request)
            content = b"".join([chunk async for chunk in response.body_iterator])
            headers = dict(response.headers)
            headers.pop("content-length", None)
            if response.status_code >= 400:
                return Response(content, status_code=response.status_code, headers=headers, media_type=response.media_type)
            payload = json.loads(content)
            if payload.get("ok") is False:
                return JSONResponse(payload, status_code=response.status_code, headers=headers)
            try:
                from football_agent.engine import careers, agency_management
                if request.url.path != "/api/game/continue":
                    for event in session.inbox[len(old_inbox):]:
                        careers.record_event(session.world, event)
                careers.initialize(session.world, session.balance)
                careers.reconcile_departures(session.world)
                agency_management.initialize(session.world, session.balance)
                session.world.revision += 1
                session.world.recent_events = session.inbox[-INBOX_LIMIT:]
                payload["revision"] = session.world.revision
                if isinstance(payload.get("state"), dict):
                    payload["state"]["revision"] = session.world.revision
                if key:
                    session.world.mutation_receipts[key] = {"fingerprint": fingerprint, "status": response.status_code, "body": payload}
                    while len(session.world.mutation_receipts) > 64:
                        del session.world.mutation_receipts[next(iter(session.world.mutation_receipts))]
                persistence.save(session.world, session.save_path)
            except Exception:
                logging.exception("Could not commit game action")
                session.world = before
                session.inbox = old_inbox
                session.negotiations.clear()
                return JSONResponse({"error": "save_failed", "message": "The action could not be saved. It was rolled back; please try again."}, status_code=503)
            return JSONResponse(payload, status_code=response.status_code, headers=headers)
