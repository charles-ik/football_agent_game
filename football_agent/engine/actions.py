"""Everything the agent can *do*.

The CLI and the tuning bots drive the game through exactly this module, so a bot
season and a played season exercise identical rules. A future iOS client would
bind its buttons to the same functions.

Every action returns an :class:`ActionResult` — refusals are values, not
exceptions, because "you can't afford that" is normal gameplay.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from . import calendar as cal
from . import reputation
from .balance import Balance, load_balance
from .economy import format_money, market_wage, scout_wage
from .events import (
    AGENT_CONTRACT_RENEWED,
    CLIENT_LEFT,
    CLIENT_SIGNED,
    HQ_UPGRADED,
    SCOUT_FIRED,
    SCOUT_HIRED,
    TRANSFER_FAILED,
    Event,
    Severity,
    ev,
)
from .models import AgentContract, ClientRecord, Interest, Player, Position, Scout, World
from .rng import stream
from .systems import trust as trust_system
from .systems.negotiation import (
    Negotiation,
    commission_guide,
    deal_guide,
    negotiation_bias,
    pct_from_x,
    signing_threshold,
)
from .systems.transfers import (  # re-exported for callers
    asking_price,
    assess_move,
    complete_deal,
    open_deal_negotiation,
    package_from_x,
    propose_package,
)
from .world import hq_level, hq_levels


@dataclass
class ActionResult:
    ok: bool
    message: str
    events: List[Event] = field(default_factory=list)
    payload: Optional[object] = None


def _fail(message: str) -> ActionResult:
    return ActionResult(False, message)


# ---------------------------------------------------------------------------
# Agency
# ---------------------------------------------------------------------------


def client_cap(world: World, balance: Balance) -> int:
    return hq_level(balance, world.agency.hq_level).client_cap


def scout_cap(world: World, balance: Balance) -> int:
    return hq_level(balance, world.agency.hq_level).scout_cap


def can_upgrade_hq(world: World, balance: Balance | None = None) -> Tuple[bool, str]:
    """Whether the HQ upgrade is available, and why not. Read-only."""
    balance = balance or load_balance()
    current = hq_level(balance, world.agency.hq_level)
    levels = hq_levels(balance)
    if world.agency.hq_level >= max(l.level for l in levels):
        return (False, "Your headquarters is already as good as it gets.")
    if current.upgrade_cost > world.agency.cash:
        return (
            False,
            f"Upgrade costs {format_money(current.upgrade_cost)}; "
            f"you have {format_money(world.agency.cash)}.",
        )
    return (True, "")


def upgrade_hq(world: World, balance: Balance | None = None) -> ActionResult:
    balance = balance or load_balance()
    ok, reason = can_upgrade_hq(world, balance)
    if not ok:
        return _fail(reason)
    current = hq_level(balance, world.agency.hq_level)

    world.agency.cash -= current.upgrade_cost
    from .systems.finance import record_investment
    record_investment(world, current.upgrade_cost)
    world.agency.hq_level += 1
    new_level = hq_level(balance, world.agency.hq_level)
    return ActionResult(
        True,
        f"Moved into {new_level.name}. {new_level.scout_cap} scouts, "
        f"{new_level.client_cap} clients, {format_money(new_level.weekly_cost)}/wk.",
        [
            ev(
                HQ_UPGRADED,
                f"Upgraded to {new_level.name}.",
                world.week,
                Severity.GOOD,
                level=new_level.level,
            )
        ],
    )


def scout_candidates(world: World, balance: Balance | None = None, count: int = 3) -> List[Scout]:
    """Three hireable scouts, stable for the current week."""
    balance = balance or load_balance()
    r = stream(world.seed, world.week, "scout_market")
    from .balance import load_data

    names = load_data("names.json")
    from .world import _person_name  # local import keeps world.py the single name source

    out = []
    for index in range(count):
        quality = round(min(95.0, r.uniform(30, 55) + world.agency.reputation * 0.45), 1)
        out.append(
            Scout(
                id=-(index + 1),  # negative ids mark unhired candidates
                name=_person_name(r, names, r.choice(list(world.regions))),
                quality=quality,
                wage=scout_wage(balance, quality),
            )
        )
    return out


def hire_scout(world: World, candidate: Scout, balance: Balance | None = None) -> ActionResult:
    balance = balance or load_balance()
    if len(world.scouts) >= scout_cap(world, balance):
        return _fail(
            f"Your headquarters supports {scout_cap(world, balance)} scout(s). Upgrade first."
        )
    fee = candidate.wage * balance.f("finance.scout_hire_cost_multiplier")
    if fee > world.agency.cash:
        return _fail(f"Signing-on fee is {format_money(fee)}; you can't cover it.")

    world.agency.cash -= fee
    from .systems.finance import record_investment
    record_investment(world, fee)
    scout = Scout(
        id=world.allocate_id(),
        name=candidate.name,
        quality=candidate.quality,
        wage=candidate.wage,
    )
    world.scouts[scout.id] = scout
    return ActionResult(
        True,
        f"Hired {scout.name} (quality {scout.quality:.0f}) for {format_money(fee)} "
        f"plus {format_money(scout.wage)}/wk.",
        [ev(SCOUT_HIRED, f"{scout.name} joins the agency.", world.week, Severity.GOOD, scout_id=scout.id)],
        payload=scout,
    )


def fire_scout(world: World, scout_id: int) -> ActionResult:
    scout = world.scouts.pop(scout_id, None)
    if scout is None:
        return _fail("No such scout.")
    return ActionResult(
        True,
        f"{scout.name} has been let go.",
        [ev(SCOUT_FIRED, f"{scout.name} has left the agency.", world.week, Severity.INFO)],
    )


def assign_scout(
    world: World,
    scout_id: int,
    region_id: Optional[str],
    brief_position: Optional[Position] = None,
    brief_max_age: Optional[int] = None,
) -> ActionResult:
    scout = world.scouts.get(scout_id)
    if scout is None:
        return _fail("No such scout.")
    if region_id is not None and region_id not in world.regions:
        return _fail("No such region.")

    scout.region_id = region_id
    scout.brief_position = brief_position
    scout.brief_max_age = brief_max_age
    scout.focus_player_id = None
    if region_id is None:
        return ActionResult(True, f"{scout.name} is now unassigned.")

    region = world.regions[region_id]
    brief = []
    if brief_position:
        brief.append(brief_position.value)
    if brief_max_age:
        brief.append(f"under {brief_max_age}")
    suffix = f" ({', '.join(brief)})" if brief else ""
    return ActionResult(
        True,
        f"{scout.name} sent to {region.name}{suffix} — "
        f"{format_money(region.scouting_cost)}/wk on top of his wage.",
    )


def focus_scout(world: World, scout_id: int, player_id: Optional[int]) -> ActionResult:
    """Park a scout on one player. Fewer discoveries, far faster narrowing."""
    scout = world.scouts.get(scout_id)
    if scout is None:
        return _fail("No such scout.")
    if player_id is None:
        scout.focus_player_id = None
        return ActionResult(True, f"{scout.name} is back on general duty.")

    report = world.reports.get(player_id)
    if report is None:
        return _fail("You have no report on that player.")
    if report.region_id != scout.region_id:
        return _fail(f"{scout.name} isn't in that region.")

    scout.focus_player_id = player_id
    return ActionResult(
        True, f"{scout.name} will watch {world.players[player_id].name} closely."
    )


# ---------------------------------------------------------------------------
# Signing clients
# ---------------------------------------------------------------------------


def reputation_required(world: World, balance: Balance, player: Player) -> float:
    """How big a name you must be before this player takes your call."""
    pivot = balance.f("signing.approach_ability_pivot")
    factor = balance.f("signing.approach_rep_factor")
    required = max(0.0, (player.ability - pivot) * factor)
    club = world.clubs.get(player.club_id) if player.club_id else None
    if club and club.tier == 1:
        required += balance.f("signing.approach_tier1_bonus")
    return required


def can_approach(
    world: World, balance: Balance, player_id: int, ignore_cooldown: bool = False
) -> Tuple[bool, str]:
    player = world.players.get(player_id)
    if player is None or player.retired:
        return (False, "That player is no longer active.")
    if player_id in world.clients:
        return (False, "He's already your client.")
    if player.rival_agency_id is not None:
        rival = world.rivals.get(player.rival_agency_id)
        return (False, f"He's represented by {rival.name if rival else 'another agency'}.")
    if player_id not in world.reports:
        return (False, "You know nothing about him — scout him first.")
    if not ignore_cooldown and world.week < player.signing_cooldown_until:
        weeks = player.signing_cooldown_until - world.week
        return (False, f"He walked out of your last approach. Try again in {weeks} weeks.")
    if len(world.clients) >= client_cap(world, balance):
        return (False, f"You're at your {client_cap(world, balance)}-client limit. Upgrade your HQ.")

    required = reputation_required(world, balance, player)
    if world.agency.reputation < required:
        return (
            False,
            f"He won't take your call. Needs an agent of reputation "
            f"{required:.0f}; you're on {world.agency.reputation:.0f}.",
        )
    return (True, "")


def open_signing_negotiation(
    world: World, balance: Balance, player_id: int, r: Optional[random.Random] = None
) -> Tuple[Optional[Negotiation], str]:
    """Start a haggle over your commission percentage.

    Naming a number spends your shot: if he walks, he won't talk again for weeks,
    by which time a rival may have him.
    """
    ok, reason = can_approach(world, balance, player_id)
    if not ok:
        return (None, reason)
    player = world.players[player_id]
    generator = r or stream(world.seed, world.week, "negotiation", f"sign-{player_id}")
    bias = negotiation_bias(world.seed, player_id, balance)
    threshold = signing_threshold(balance, world.agency.reputation, player.trait.value, bias)
    cooldown = balance.i("signing.cooldown_weeks")

    def consume() -> None:
        player.signing_cooldown_until = world.week + cooldown

    return (
        Negotiation.create(
            threshold,
            generator,
            balance,
            subject=player.name,
            context_kind="signing",
            context_id=player_id,
            on_first_propose=consume,
        ),
        "",
    )


def close_negotiation(world: World, balance: Balance, negotiation: Negotiation) -> ActionResult:
    """Tidy up after a haggle that produced nothing.

    Purely consequential bookkeeping — the rule that stops re-rolling already
    fired when the first number was named.
    """
    from .systems.negotiation import Status

    if negotiation.status not in (Status.WALKED, Status.ABANDONED, Status.EXHAUSTED):
        return ActionResult(True, "")

    if negotiation.context_kind == "deal":
        interest = world.interests.pop(negotiation.context_id, None)
        if interest is None:
            return ActionResult(True, "")
        player = world.players.get(interest.player_id)
        name = player.name if player else "your client"
        if negotiation.status is Status.WALKED:
            return ActionResult(
                False,
                f"{world.club_name(interest.club_id)} have withdrawn their interest in {name}.",
                [
                    ev(
                        TRANSFER_FAILED,
                        f"{world.club_name(interest.club_id)} walked away from {name}.",
                        world.week,
                        Severity.WARNING,
                        player_id=interest.player_id,
                        club_id=interest.club_id,
                    )
                ],
            )
        return ActionResult(True, f"Talks with {world.club_name(interest.club_id)} are over.")

    if negotiation.context_kind in ("signing", "renewal") and negotiation.status is Status.WALKED:
        player = world.players.get(negotiation.context_id)
        weeks = balance.i("signing.cooldown_weeks")
        if player is not None:
            return ActionResult(
                False, f"{player.name} won't hear from you again for {weeks} weeks."
            )
    return ActionResult(True, "")


def complete_signing(
    world: World, balance: Balance, player_id: int, commission_pct: float
) -> ActionResult:
    # The cooldown was set the moment terms were named, including on the very
    # negotiation being completed here — so it must not block its own success.
    ok, reason = can_approach(world, balance, player_id, ignore_cooldown=True)
    if not ok:
        return _fail(reason)

    player = world.players[player_id]
    player.signing_cooldown_until = 0
    years = balance.i("start.agent_contract_years")
    world.clients[player_id] = ClientRecord(
        player_id=player_id,
        agent_contract=AgentContract(
            commission_pct=commission_pct,
            expires_week=world.week + years * 52,
            signed_week=world.week,
        ),
        trust=balance.f("trust.start"),
        signed_week=world.week,
    )
    reward = balance.f("signing.reputation_gain_per_signing") + player.ability * balance.f(
        "signing.quality_reputation_factor"
    ) / 10.0
    reputation.gain(world, balance, reward)

    return ActionResult(
        True,
        f"Signed {player.name} at {commission_pct * 100:.1f}% commission.",
        [
            ev(
                CLIENT_SIGNED,
                f"{player.name} is now your client ({commission_pct * 100:.1f}%).",
                world.week,
                Severity.GOOD,
                player_id=player_id,
                commission_pct=commission_pct,
            )
        ],
    )


def can_renew(world: World, balance: Balance, player_id: int) -> Tuple[bool, str]:
    """Whether an agent-contract renewal can be opened, and why not. Read-only."""
    record = world.clients.get(player_id)
    if record is None:
        return (False, "Not one of your clients.")
    player = world.players[player_id]
    remaining = record.agent_contract.expires_week - world.week
    if remaining > 26:
        return (False, f"Too early — {remaining} weeks still to run.")

    from .systems.contracts import MIN_TRUST_TO_RENEW

    if record.trust < MIN_TRUST_TO_RENEW:
        return (False, f"{player.name} won't even take the meeting (trust {record.trust:.0f}).")
    return (True, "")


def open_renewal_negotiation(
    world: World, balance: Balance, player_id: int, r: Optional[random.Random] = None
) -> Tuple[Optional[Negotiation], str]:
    """Re-sign an existing client. Trust is the gate."""
    ok, reason = can_renew(world, balance, player_id)
    if not ok:
        return (None, reason)
    player = world.players[player_id]
    record = world.clients[player_id]

    generator = r or stream(world.seed, world.week, "negotiation", f"renew-{player_id}")
    bias = negotiation_bias(world.seed, player_id, balance)
    threshold = signing_threshold(balance, world.agency.reputation, player.trait.value, bias)
    threshold += (record.trust - 60.0) / 100.0 * balance.f("signing.trust_threshold_bonus")
    return (
        Negotiation.create(
            max(0.0, min(1.0, threshold)),
            generator,
            balance,
            subject=player.name,
            context_kind="renewal",
            context_id=player_id,
        ),
        "",
    )


def complete_renewal(
    world: World, balance: Balance, player_id: int, commission_pct: float
) -> ActionResult:
    record = world.clients.get(player_id)
    if record is None:
        return _fail("Not one of your clients.")
    years = balance.i("start.agent_contract_years")
    record.agent_contract = AgentContract(
        commission_pct=commission_pct,
        expires_week=world.week + years * 52,
        signed_week=world.week,
    )
    trust_system.adjust(world, balance, player_id, balance.f("trust.renewal_bonus"))
    player = world.players[player_id]
    return ActionResult(
        True,
        f"Re-signed {player.name} at {commission_pct * 100:.1f}%.",
        [
            ev(
                AGENT_CONTRACT_RENEWED,
                f"{player.name} has re-signed with you ({commission_pct * 100:.1f}%).",
                world.week,
                Severity.GOOD,
                player_id=player_id,
            )
        ],
    )


def release_client(world: World, balance: Balance, player_id: int) -> ActionResult:
    record = world.clients.pop(player_id, None)
    if record is None:
        return _fail("Not one of your clients.")
    player = world.players[player_id]
    penalty = balance.f("reputation.client_loss_penalty") * 0.5
    reputation.lose(world, balance, penalty)
    return ActionResult(
        True,
        f"Released {player.name}.",
        [ev(CLIENT_LEFT, f"You released {player.name}.", world.week, Severity.WARNING,
            player_id=player_id, reason="released")],
    )


# ---------------------------------------------------------------------------
# Managing clients
# ---------------------------------------------------------------------------


def seek_move(world: World, balance: Balance, player_id: int, promise: bool = False) -> ActionResult:
    """Tout a client around. Promising a move raises the stakes if it fails."""
    record = world.clients.get(player_id)
    if record is None:
        return _fail("Not one of your clients.")
    player = world.players[player_id]
    if promise:
        from .careers import promise_move
        if promise_move(world, balance, player_id) is None:
            return _fail("Give this client time before making another promise.")
    player.seeking_move = True
    return ActionResult(
        True,
        f"You're shopping {player.name} around."
        + (" You've told him a move is coming." if promise else ""),
    )


def stop_seeking(world: World, player_id: int) -> ActionResult:
    player = world.players.get(player_id)
    if player is None:
        return _fail("No such player.")
    player.seeking_move = False
    record = world.clients.get(player_id)
    return ActionResult(True, f"{player.name} is off the market. Any existing promise still applies.")


def can_deal(world: World, balance: Balance) -> Tuple[bool, str]:
    if not cal.window_open(balance, world.week):
        weeks = cal.weeks_until_next_window(balance, world.week)
        return (False, f"The window is shut. It reopens in {weeks} weeks.")
    return (True, "")


def can_negotiate_interest(world: World, balance: Balance, interest_id: int) -> Tuple[bool, str]:
    """You get one negotiation per approach. Opening it is the decision."""
    ok, reason = can_deal(world, balance)
    if not ok:
        return (False, reason)
    interest = world.interests.get(interest_id)
    if interest is None:
        return (False, "That approach is no longer on the table.")
    from .market import move_busy
    if move_busy(world, interest.player_id):
        return (False, "This client already has an active loan or loan negotiation.")
    if interest.attempts_used > 0:
        return (False, "You've already had your talks with them over this approach.")
    player = world.players.get(interest.player_id)
    if player is not None and player.is_injured and not interest.is_renewal:
        return (False, f"{player.name} is injured — nobody is signing him this week.")
    return (True, "")


def accept_deal(
    world: World,
    balance: Balance,
    interest_id: int,
    wage: float,
    fee: float,
    years: int,
) -> ActionResult:
    ok, reason = can_deal(world, balance)
    if not ok:
        return _fail(reason)
    interest = world.interests.get(interest_id)
    if interest is None:
        return _fail("That approach is no longer on the table.")

    from .market import move_busy
    if move_busy(world, interest.player_id):
        return _fail("This client already has a loan or loan negotiation.")
    events = complete_deal(world, balance, interest, wage, fee, years)
    failed = any(e.kind == "transfer.failed" for e in events)
    return ActionResult(not failed, events[0].message if events else "Nothing happened.", events)


# Convenience re-exports so callers only need one import.
__all__ = [
    "ActionResult",
    "accept_deal",
    "asking_price",
    "assess_move",
    "assign_scout",
    "can_approach",
    "can_deal",
    "can_negotiate_interest",
    "can_renew",
    "can_upgrade_hq",
    "client_cap",
    "close_negotiation",
    "commission_guide",
    "complete_deal",
    "complete_renewal",
    "complete_signing",
    "deal_guide",
    "fire_scout",
    "focus_scout",
    "hire_scout",
    "open_deal_negotiation",
    "open_renewal_negotiation",
    "open_signing_negotiation",
    "package_from_x",
    "propose_package",
    "release_client",
    "reputation_required",
    "scout_candidates",
    "scout_cap",
    "seek_move",
    "stop_seeking",
    "upgrade_hq",
]
