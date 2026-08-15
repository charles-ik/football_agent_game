"""Balance config loader.

All tunables live in ``data/balance.json``. Access is via dotted paths so a
missing key fails loudly with the path that was missing, rather than silently
producing a ``None`` that becomes a nonsense number three systems later.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class Balance:
    def __init__(self, values: Dict[str, Any]):
        self._values = values

    def get(self, path: str, default: Any = "__raise__") -> Any:
        node: Any = self._values
        for part in path.split("."):
            if not isinstance(node, dict) or part not in node:
                if default == "__raise__":
                    raise KeyError(f"balance.json is missing '{path}'")
                return default
            node = node[part]
        return node

    def f(self, path: str, default: Any = "__raise__") -> float:
        return float(self.get(path, default))

    def i(self, path: str, default: Any = "__raise__") -> int:
        return int(self.get(path, default))

    def d(self, path: str, default: Any = "__raise__") -> Dict[str, Any]:
        return dict(self.get(path, default))

    def l(self, path: str, default: Any = "__raise__") -> List[Any]:
        return list(self.get(path, default))

    def as_dict(self) -> Dict[str, Any]:
        return self._values


_cache: Dict[str, Balance] = {}


def load_balance(path: Path | None = None) -> Balance:
    key = str(path or DATA_DIR / "balance.json")
    if key not in _cache:
        with open(key, "r", encoding="utf-8") as handle:
            _cache[key] = Balance(json.load(handle))
    return _cache[key]


def load_data(filename: str) -> Any:
    with open(DATA_DIR / filename, "r", encoding="utf-8") as handle:
        return json.load(handle)


def clear_cache() -> None:
    _cache.clear()
