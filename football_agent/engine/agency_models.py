"""Persisted agency development state; defaults migrate older saves neutrally."""
from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class SupportStaff:
    id: int
    name: str
    role: str
    quality: int
    wage: float
    hire_cost: float
    capacity: int
    player_ids: List[int] = field(default_factory=list)
    club_ids: List[int] = field(default_factory=list)


@dataclass
class AgencyDevelopment:
    shortlisted_players: List[int] = field(default_factory=list)
    initialized: bool = False
    emblem: str = "shield"
    accent: str = "emerald"
    staff: List[SupportStaff] = field(default_factory=list)
    candidates: List[SupportStaff] = field(default_factory=list)
    candidate_week: int = -1
    departments: Dict[str, int] = field(default_factory=dict)
    specialization: str = "generalist"
    specialization_changed_season: int = -1
    objective: str = "growth"
    objective_season: int = 1
    objective_baseline_clients: int = 0
    objective_baseline_deals: int = 0
    objective_baseline_cash: float = 0.0
    objective_completed: bool = False
    stability_weeks: int = 0
    reviews: List[Dict[str, Any]] = field(default_factory=list)
    milestones: Dict[str, int] = field(default_factory=dict)
    observed_clients: List[int] = field(default_factory=list)
    observed_deals: int = 0
    observed_player_deals: Dict[int, int] = field(default_factory=dict)
    objective_deals_earned: int = 0
    observed_hq: int = 1
    last_run_week: int = -1
