"""GET /api/meta — the curated balance allowlist.

The player is *meant* to see calendar facts, HQ tiers and the commission
floor/ceiling. The negotiation-tuning block (walk-away, irritation, hidden
bias, thresholds) must never cross the wire — with it and the seed, every
counterparty's limit is computable. This is an allowlist, never the file.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from football_agent.engine.balance import load_balance
from football_agent.engine.models import Position, Trait
from football_agent.engine.world import hq_levels

from .. import dto

router = APIRouter(tags=["meta"])


@router.get("/meta")
def meta() -> Dict[str, Any]:
    balance = load_balance()
    return {
        "commission": {
            "min_pct": balance.f("commission.min_pct"),
            "max_pct": balance.f("commission.max_pct"),
        },
        "calendar": {
            "weeks_per_season": balance.i("calendar.weeks_per_season"),
            "windows": balance.l("calendar.windows"),
            "window_names": balance.d("calendar.window_names", {}),
        },
        "hq_levels": [dto.hq_level_dto(level) for level in hq_levels(balance)],
        "positions": [p.value for p in Position],
        "traits": [t.value for t in Trait],
    }
