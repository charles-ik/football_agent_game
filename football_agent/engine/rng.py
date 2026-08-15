"""Deterministic RNG streams.

Randomness is derived, never carried. Every draw comes from a generator seeded
from ``(world_seed, week, system_name, salt)``, so:

* reloading a save cannot change the future, and
* changing one system's code cannot reshuffle another system's results.

That second property is what makes evidence-based tuning possible: re-run the
harness after a rules change and any movement in the numbers is attributable to
the change, not to a reshuffled world.
"""

from __future__ import annotations

import hashlib
import random


def derive_seed(world_seed: int, week: int, system: str, salt: str = "") -> int:
    """Hash the coordinates of a draw into a stable 64-bit seed."""
    key = f"{world_seed}|{week}|{system}|{salt}".encode("utf-8")
    return int.from_bytes(hashlib.blake2b(key, digest_size=8).digest(), "big")


def stream(world_seed: int, week: int, system: str, salt: str = "") -> random.Random:
    """Return an independent generator for one system's draws in one week."""
    return random.Random(derive_seed(world_seed, week, system, salt))


def weighted_choice(rng: random.Random, options, weights):
    """Pick one option by weight. Returns None when there is nothing to pick."""
    options = list(options)
    weights = [max(0.0, float(w)) for w in weights]
    if not options:
        return None
    total = sum(weights)
    if total <= 0:
        return rng.choice(options)
    roll = rng.random() * total
    acc = 0.0
    for option, weight in zip(options, weights):
        acc += weight
        if roll <= acc:
            return option
    return options[-1]


def triangular_int(rng: random.Random, low: int, high: int, mode: float) -> int:
    """Integer draw from a triangular distribution, clamped to ``[low, high]``."""
    if high <= low:
        return low
    value = rng.triangular(low, high, mode)
    return int(max(low, min(high, round(value))))
