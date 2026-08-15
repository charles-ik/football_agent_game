"""Save/load. Plain JSON, schema-versioned from day one.

The version field exists so an old save fails loudly on a model change rather
than half-loading into a corrupt world.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from .models import World
from .serde import decode, encode

SCHEMA_VERSION = 1


class SaveError(Exception):
    pass


def to_dict(world: World) -> Dict[str, Any]:
    return {"schema_version": SCHEMA_VERSION, "world": encode(world)}


def from_dict(payload: Dict[str, Any]) -> World:
    version = payload.get("schema_version")
    if version != SCHEMA_VERSION:
        raise SaveError(
            f"Save file schema v{version} cannot be loaded by engine schema v{SCHEMA_VERSION}."
        )
    return decode(World, payload["world"])


def save(world: World, path: Path | str) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(to_dict(world), handle, indent=1)
    tmp.replace(path)


def load(path: Path | str) -> World:
    with open(Path(path), "r", encoding="utf-8") as handle:
        return from_dict(json.load(handle))


def exists(path: Path | str) -> bool:
    return Path(path).exists()
