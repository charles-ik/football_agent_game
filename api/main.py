"""The FastAPI app: routers, error mapping, CORS, the health check.

Run it single-process and bound to localhost — sessions and live negotiations
are in-process state:

    python3 -m uvicorn api.main:app --reload --port 8000 --host 127.0.0.1 --workers 1
"""

from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from football_agent.engine import persistence

from .routers import agency, clients, game, meta, negotiations, scouting

WEB_ORIGIN = os.environ.get("FA_WEB_ORIGIN", "http://localhost:3000")


def create_app() -> FastAPI:
    app = FastAPI(title="Football Agent API", docs_url=None, redoc_url=None)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[WEB_ORIGIN],  # exactly one origin; never "*" with credentials
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )

    @app.exception_handler(HTTPException)
    async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
        # Our handlers raise HTTPException(status, "machine_code"); render the
        # contract's {"error": ..., "message": ...} shape.
        code = exc.detail if isinstance(exc.detail, str) else "error"
        return JSONResponse(
            status_code=exc.status_code, content={"error": code, "message": code}
        )

    @app.exception_handler(persistence.SaveError)
    async def save_error_handler(request: Request, exc: persistence.SaveError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"error": "save_incompatible", "message": str(exc)})

    @app.exception_handler(KeyError)
    async def key_error_handler(request: Request, exc: KeyError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"error": "not_found", "message": str(exc)})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"error": "bad_request"})

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    app.include_router(meta.router, prefix="/api")
    app.include_router(game.router, prefix="/api")
    app.include_router(scouting.router, prefix="/api")
    app.include_router(clients.router, prefix="/api")
    app.include_router(negotiations.router, prefix="/api")
    app.include_router(agency.router, prefix="/api")
    return app


app = create_app()
