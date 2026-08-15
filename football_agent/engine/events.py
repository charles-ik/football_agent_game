"""The event log — the engine's real interface.

Every system reports what it did as typed events rather than by printing or by
mutating silently. The CLI renders them, the tests assert on them, the harness
counts them, and a future iOS client would render the identical vocabulary as an
inbox. This is the layer that makes the port a UI job rather than archaeology.

Events carry structured fields plus a human-readable ``message`` for the CLI, and
a ``severity`` so a UI can badge the ones that need action.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any, Dict


class Severity(str, enum.Enum):
    INFO = "info"
    GOOD = "good"
    WARNING = "warning"
    CRITICAL = "critical"
    ACTION = "action"  # needs a decision from the agent


@dataclass
class Event:
    kind: str
    message: str
    week: int = 0
    severity: Severity = Severity.INFO
    data: Dict[str, Any] = field(default_factory=dict)


def ev(kind: str, message: str, week: int, severity: Severity = Severity.INFO, **data: Any) -> Event:
    return Event(kind=kind, message=message, week=week, severity=severity, data=data)


# Event kind constants. Kept as strings so the vocabulary survives a port, but
# named here so typos surface as import errors rather than silent mismatches.
WEEK_ADVANCED = "week.advanced"
SEASON_STARTED = "season.started"
WINDOW_OPENED = "window.opened"
WINDOW_CLOSED = "window.closed"

RETAINER_COLLECTED = "finance.retainer"
COSTS_PAID = "finance.costs"
COMMISSION_EARNED = "finance.commission"
CASH_WARNING = "finance.cash_warning"
FORCED_DOWNSIZE = "finance.downsize"
GAME_OVER = "finance.game_over"

SCOUT_REPORT = "scouting.report"
SCOUT_DISCOVERY = "scouting.discovery"
SCOUT_NARROWED = "scouting.narrowed"
SCOUT_IDLE = "scouting.idle"

CLIENT_SIGNED = "client.signed"
CLIENT_LEFT = "client.left"
CLIENT_POACHED = "client.poached"
CLIENT_TRUST_SHIFT = "client.trust"
CLIENT_INJURED = "client.injured"
CLIENT_RECOVERED = "client.recovered"
CLIENT_DEVELOPED = "client.developed"
CLIENT_RETIRED = "client.retired"
AGENT_CONTRACT_EXPIRING = "client.agent_contract_expiring"
AGENT_CONTRACT_RENEWED = "client.agent_contract_renewed"

INTEREST_RECEIVED = "transfer.interest"
INTEREST_EXPIRED = "transfer.interest_expired"
TRANSFER_COMPLETED = "transfer.completed"
TRANSFER_FAILED = "transfer.failed"
RENEWAL_COMPLETED = "transfer.renewal"
CLUB_CONTRACT_EXPIRING = "transfer.club_contract_expiring"
TRANSFER_LISTED = "transfer.listed"
BECAME_FREE_AGENT = "transfer.free_agent"

RIVAL_SIGNED_TARGET = "rival.signed_target"
RIVAL_POACH_ATTEMPT = "rival.poach_attempt"

MATCH_ROUND = "league.round"
SEASON_ENDED = "league.season_ended"

HQ_UPGRADED = "agency.hq_upgraded"
SCOUT_HIRED = "agency.scout_hired"
SCOUT_FIRED = "agency.scout_fired"
REPUTATION_CHANGED = "agency.reputation"
