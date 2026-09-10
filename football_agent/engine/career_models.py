"""Serializable career state; rules live in careers.py."""
from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class CareerState:
    careers: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    goals: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    promises: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    stories: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    history: Dict[int, List[Dict[str, Any]]] = field(default_factory=dict)
    alumni: Dict[int, Dict[str, Any]] = field(default_factory=dict)
