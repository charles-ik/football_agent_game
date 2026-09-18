"""World state.

Plain dataclasses, no behaviour beyond cheap derived properties. Rules live in
``engine.systems``; keeping state dumb is what lets systems stay pure and lets
the whole model serialise generically.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

from .events import Event
from .agency_models import AgencyDevelopment
from .career_models import CareerState
from .market_models import MarketState


class Position(str, enum.Enum):
    GK = "GK"
    DF = "DF"
    MF = "MF"
    FW = "FW"


class Trait(str, enum.Enum):
    """What a client actually wants from a move.

    This is the single attribute that stops clients being interchangeable, and
    it is what gives the trust system something to push against.
    """

    AMBITIOUS = "ambitious"      # cares about club strength and playing time
    MERCENARY = "mercenary"      # cares about wages
    LOYAL = "loyal"              # dislikes moving, slow to lose trust
    PROFESSIONAL = "professional"  # cares about playing time, steady


class PlayingTime(str, enum.Enum):
    KEY = "key"
    STARTER = "starter"
    ROTATION = "rotation"
    FRINGE = "fringe"
    RESERVE = "reserve"


PLAYING_TIME_ORDER = [
    PlayingTime.RESERVE,
    PlayingTime.FRINGE,
    PlayingTime.ROTATION,
    PlayingTime.STARTER,
    PlayingTime.KEY,
]


@dataclass
class Contract:
    """A player's contract with a club."""

    wage: float                # per week
    expires_week: int          # absolute week number
    years_signed: int = 3


@dataclass
class AgentContract:
    """The agency's representation contract with a client."""

    commission_pct: float      # share of deal value the agent takes
    expires_week: int
    signed_week: int = 0


@dataclass
class Player:
    id: int
    name: str
    age: int
    position: Position
    ability: float             # true current ability, 1-100
    potential: float           # true ceiling, hidden from the agent
    trait: Trait
    region_id: str
    club_id: Optional[int] = None
    contract: Optional[Contract] = None
    injury_weeks: int = 0
    transfer_listed: bool = False
    seeking_move: bool = False
    retired: bool = False
    weeks_at_club: int = 0
    rival_agency_id: Optional[int] = None  # represented by a rival
    signing_cooldown_until: int = 0        # he won't talk to you again until this week

    @property
    def is_free_agent(self) -> bool:
        return self.club_id is None

    @property
    def is_injured(self) -> bool:
        return self.injury_weeks > 0


@dataclass
class ClientRecord:
    """Agency-side state for a represented player."""

    player_id: int
    agent_contract: AgentContract
    trust: float = 60.0
    signed_week: int = 0
    deals_done: int = 0
    last_playing_time: PlayingTime = PlayingTime.ROTATION
    promised_move: bool = False   # you told him a move was coming

    def tenure_weeks(self, week: int) -> int:
        return max(0, week - self.signed_week)


@dataclass
class Club:
    """Clubs are a rating, a budget and a set of positional needs.

    No squads exist in v1. Needs are what make an offer legible ("they want a
    left-back and have headroom") rather than arbitrary, and they are the seam
    where real squads would later plug in.
    """

    id: int
    name: str
    tier: int
    strength: float            # 1-100, drives results and playing time
    prestige: float            # 1-100, drives how attractive a move looks
    wage_budget: float         # total weekly wage capacity
    wage_committed: float      # currently spent per week
    transfer_budget: float
    needs: Dict[str, float] = field(default_factory=dict)  # position -> urgency 0-1
    region_id: str = ""

    @property
    def wage_headroom(self) -> float:
        return max(0.0, self.wage_budget - self.wage_committed)


@dataclass
class LeagueRecord:
    club_id: int
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0

    @property
    def points(self) -> int:
        return self.won * 3 + self.drawn

    @property
    def goal_difference(self) -> int:
        return self.goals_for - self.goals_against


@dataclass
class League:
    id: int
    name: str
    tier: int
    club_ids: List[int] = field(default_factory=list)
    table: Dict[int, LeagueRecord] = field(default_factory=dict)
    round_index: int = 0


@dataclass
class Region:
    id: str
    name: str
    country: str
    star_rating: float         # quality of the TALENT POOL, not of who you get
    scouting_cost: float       # weekly cost to keep a scout here
    pool_size: int = 40


@dataclass
class Scout:
    id: int
    name: str
    quality: float             # 1-100, drives discovery rate and report precision
    wage: float
    region_id: Optional[str] = None
    brief_position: Optional[Position] = None
    brief_max_age: Optional[int] = None
    focus_player_id: Optional[int] = None  # watching one player narrows faster

    @property
    def assigned(self) -> bool:
        return self.region_id is not None


@dataclass
class ScoutingReport:
    """What the agent knows about a player — always a range, never a number."""

    player_id: int
    ability_low: float
    ability_high: float
    potential_low: float
    potential_high: float
    weeks_watched: int = 0
    first_seen_week: int = 0
    region_id: str = ""
    scout_id: Optional[int] = None

    @property
    def ability_mid(self) -> float:
        return (self.ability_low + self.ability_high) / 2

    @property
    def potential_mid(self) -> float:
        return (self.potential_low + self.potential_high) / 2

    @property
    def ability_spread(self) -> float:
        return self.ability_high - self.ability_low


@dataclass
class Interest:
    """A club sniffing around one of your clients. Expires if you dither."""

    id: int
    club_id: int
    player_id: int
    created_week: int
    expires_week: int
    max_wage: float            # what the club could stretch to
    max_fee: float
    urgency: float = 0.5
    is_renewal: bool = False   # current club offering fresh terms
    attempts_used: int = 0     # one negotiation per approach; opening it is a commitment


@dataclass
class RivalAgency:
    """Named, with a reputation score and nothing else underneath.

    Enough to put a clock on your decisions without simulating opponents.
    """

    id: int
    name: str
    reputation: float


@dataclass
class HQLevel:
    level: int
    name: str
    scout_cap: int
    client_cap: int
    precision_bonus: float
    weekly_cost: float
    upgrade_cost: float


@dataclass
class Agency:
    name: str
    cash: float
    reputation: float
    hq_level: int = 1
    weeks_insolvent: int = 0
    total_commission: float = 0.0
    total_costs: float = 0.0
    bankrupt: bool = False


@dataclass
class FinanceWeek:
    week: int
    retainers: float = 0.0
    commission: float = 0.0
    scout_wages: float = 0.0
    hq_cost: float = 0.0
    support_cost: float = 0.0
    region_costs: float = 0.0
    investments: float = 0.0
    investment_returns: float = 0.0
    operating_posted: bool = False

    @property
    def income(self) -> float:
        return self.retainers + self.commission + self.investment_returns

    @property
    def expenditure(self) -> float:
        return self.scout_wages + self.hq_cost + self.region_costs + self.support_cost + self.investments

    @property
    def net(self) -> float:
        return self.income - self.expenditure


@dataclass
class ShareHolding:
    shares: int = 0
    cost_basis: float = 0.0


@dataclass
class InvestmentState:
    last_week: int = -1
    prices: Dict[str, float] = field(default_factory=dict)
    history: List[Dict[str, Any]] = field(default_factory=list)
    holdings: Dict[str, ShareHolding] = field(default_factory=dict)
    trades: List[Dict[str, Any]] = field(default_factory=list)
    realized_gain: float = 0.0


@dataclass
class World:
    seed: int
    revision: int = 0
    recent_events: List[Event] = field(default_factory=list)
    mutation_receipts: Dict[str, Any] = field(default_factory=dict)
    agency_development: AgencyDevelopment = field(default_factory=AgencyDevelopment)
    career_state: CareerState = field(default_factory=CareerState)
    market_state: MarketState = field(default_factory=MarketState)
    investments: InvestmentState = field(default_factory=InvestmentState)
    week: int = 0                     # absolute week, 0 = before the first tick
    season: int = 1
    agency: Agency = None
    players: Dict[int, Player] = field(default_factory=dict)
    clubs: Dict[int, Club] = field(default_factory=dict)
    leagues: Dict[int, League] = field(default_factory=dict)
    regions: Dict[str, Region] = field(default_factory=dict)
    scouts: Dict[int, Scout] = field(default_factory=dict)
    clients: Dict[int, ClientRecord] = field(default_factory=dict)  # by player id
    reports: Dict[int, ScoutingReport] = field(default_factory=dict)
    interests: Dict[int, Interest] = field(default_factory=dict)
    rivals: Dict[int, RivalAgency] = field(default_factory=dict)
    finance_history: List[FinanceWeek] = field(default_factory=list)
    next_id: int = 1
    game_over: bool = False
    game_over_reason: str = ""

    # ---- id allocation -------------------------------------------------
    def allocate_id(self) -> int:
        value = self.next_id
        self.next_id += 1
        return value

    # ---- convenience ---------------------------------------------------
    @property
    def season_week(self) -> int:
        """1-based week within the current season."""
        return ((self.week - 1) % 52) + 1 if self.week > 0 else 1

    def player(self, player_id: int) -> Player:
        return self.players[player_id]

    def club(self, club_id: int) -> Optional[Club]:
        return self.clubs.get(club_id)

    def client_players(self) -> List[Player]:
        return [self.players[pid] for pid in self.clients if pid in self.players]

    def scouts_in_region(self, region_id: str) -> List[Scout]:
        return [s for s in self.scouts.values() if s.region_id == region_id]

    def interests_for(self, player_id: int) -> List[Interest]:
        return [i for i in self.interests.values() if i.player_id == player_id]

    def club_name(self, club_id: Optional[int]) -> str:
        if club_id is None:
            return "Free agent"
        club = self.clubs.get(club_id)
        return club.name if club else "Unknown"
