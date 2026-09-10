"""Serializable market relationships, loan ownership, and bounded talks."""
from dataclasses import dataclass, field
from typing import Dict, List

@dataclass
class ClubRelationship:
    value: float = 50.0
    history: List[dict] = field(default_factory=list)

@dataclass
class LoanRecord:
    id: int
    player_id: int
    parent_club_id: int
    host_club_id: int
    starts_week: int
    ends_week: int
    wage: float
    contribution_pct: float
    fee: float
    commission: float
    active: bool = True

@dataclass
class LoanTalk:
    id: int
    player_id: int
    parent_club_id: int
    host_club_id: int
    ends_week: int
    expires_week: int
    rounds: int = 0
    contribution_pct: float = 0.0
    fee: float = 0.0
    status: str = "open"

@dataclass
class MarketState:
    relationships: Dict[int, ClubRelationship] = field(default_factory=dict)
    pitches: List[str] = field(default_factory=list)
    loan_attempts: List[str] = field(default_factory=list)
    loans: Dict[int, LoanRecord] = field(default_factory=dict)
    talks: Dict[int, LoanTalk] = field(default_factory=dict)
    rival_warnings: Dict[int, int] = field(default_factory=dict)
