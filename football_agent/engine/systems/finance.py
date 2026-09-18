"""Finance: retainers in, running costs out, and the downsizing spiral.

Commission arrives in lumps and only inside windows, so a hard game-over at zero
cash would be unfair. Instead: warn, then force downsizing (with a reputation
hit), then end the run only on sustained insolvency. Clawing your way back is
meant to be a story.
"""

from __future__ import annotations

import random
from typing import List

from .. import reputation
from ..balance import Balance
from ..economy import format_money, weekly_retainer
from ..events import (
    CASH_WARNING,
    COSTS_PAID,
    FORCED_DOWNSIZE,
    GAME_OVER,
    RETAINER_COLLECTED,
    SCOUT_FIRED,
    Event,
    Severity,
    ev,
)
from ..models import FinanceWeek, World
from ..world import hq_level


def _current_ledger(world: World) -> FinanceWeek:
    """Actions and the weekly settlement share one ledger for each week."""
    ledger = next((row for row in reversed(world.finance_history) if row.week == world.week), None)
    if ledger is None:
        ledger = FinanceWeek(week=world.week)
        world.finance_history.append(ledger)
        world.finance_history[:] = world.finance_history[-260:]
    return ledger


def record_commission(world: World, amount: float) -> None:
    """Record income already credited by a completed transfer or loan."""
    _current_ledger(world).commission += amount


def record_investment(world: World, amount: float) -> None:
    """Record a purchase already deducted from cash, including lifetime costs."""
    _current_ledger(world).investments += amount
    world.agency.total_costs += amount


def record_investment_return(world: World, amount: float) -> None:
    """Record net sale proceeds already credited to cash, never commission."""
    _current_ledger(world).investment_returns += amount


def run(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    week = world.week
    ledger = _current_ledger(world)
    if ledger.operating_posted or any((ledger.retainers, ledger.scout_wages, ledger.hq_cost, ledger.region_costs, ledger.support_cost)):
        # Older saves have running entries but predate the explicit marker.
        ledger.operating_posted = True
        return []

    budget = weekly_budget(world, balance)
    for field, amount in budget.items():
        setattr(ledger, field, amount)

    running_costs = ledger.scout_wages + ledger.hq_cost + ledger.region_costs + ledger.support_cost
    running_net = ledger.retainers - running_costs
    world.agency.cash += running_net
    world.agency.total_costs += running_costs
    ledger.operating_posted = True

    if ledger.retainers > 0:
        events.append(
            ev(
                RETAINER_COLLECTED,
                f"Retainers collected: {format_money(ledger.retainers)}",
                week,
                Severity.INFO,
                amount=ledger.retainers,
            )
        )
    events.append(
        ev(
            COSTS_PAID,
            f"Running costs: {format_money(running_costs)} "
            f"(net {format_money(running_net)})",
            week,
            Severity.INFO,
            amount=running_costs,
            net=running_net,
        )
    )

    events.extend(_check_solvency(world, r, balance))
    return events


def _check_solvency(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    agency = world.agency
    week = world.week

    if agency.cash >= 0:
        if agency.weeks_insolvent > 0:
            agency.weeks_insolvent = 0
        return events

    agency.weeks_insolvent += 1
    warn_at = balance.i("finance.insolvency_warning_weeks")
    downsize_at = balance.i("finance.insolvency_downsize_weeks")
    over_at = balance.i("finance.insolvency_game_over_weeks")

    if agency.weeks_insolvent >= over_at:
        agency.bankrupt = True
        world.game_over = True
        world.game_over_reason = "The agency went under."
        reputation.lose(world, balance, balance.f("reputation.bankruptcy_penalty"))
        events.append(
            ev(
                GAME_OVER,
                f"Insolvent for {agency.weeks_insolvent} weeks. The agency is finished.",
                week,
                Severity.CRITICAL,
                weeks_insolvent=agency.weeks_insolvent,
            )
        )
        return events

    if agency.weeks_insolvent >= downsize_at:
        events.extend(_downsize(world, balance))
        return events

    if agency.weeks_insolvent >= warn_at:
        events.append(
            ev(
                CASH_WARNING,
                f"Cash is {format_money(agency.cash)} and has been negative for "
                f"{agency.weeks_insolvent} weeks. Cut costs or land a deal.",
                week,
                Severity.WARNING,
                cash=agency.cash,
                weeks_insolvent=agency.weeks_insolvent,
            )
        )
    return events


def _downsize(world: World, balance: Balance) -> List[Event]:
    """Forced cuts: the most expensive scout goes, then the HQ is downgraded."""
    events: List[Event] = []
    week = world.week
    agency = world.agency
    hit = balance.f("finance.downsize_reputation_hit")

    if world.agency_development.staff:
        victim = max(world.agency_development.staff, key=lambda member: member.wage)
        world.agency_development.staff.remove(victim)
        reputation.lose(world, balance, hit)
        return [ev(FORCED_DOWNSIZE, f"Could not make payroll: {victim.name} was let go.", week, Severity.CRITICAL)]
    if any(world.agency_development.departments.values()):
        department = max(world.agency_development.departments, key=world.agency_development.departments.get)
        world.agency_development.departments[department] -= 1
        reputation.lose(world, balance, hit)
        return [ev(FORCED_DOWNSIZE, f"Cut back the {department.replace('_', ' ')} department.", week, Severity.CRITICAL)]

    if world.scouts:
        victim = max(world.scouts.values(), key=lambda s: s.wage + _region_cost(world, s))
        del world.scouts[victim.id]
        reputation.lose(world, balance, hit)
        events.append(
            ev(
                SCOUT_FIRED,
                f"Couldn't make payroll — {victim.name} was let go.",
                week,
                Severity.CRITICAL,
                scout_id=victim.id,
            )
        )
        events.append(
            ev(
                FORCED_DOWNSIZE,
                f"Forced downsizing. Reputation down {hit:.0f}.",
                week,
                Severity.CRITICAL,
                reputation_hit=hit,
            )
        )
        return events

    if agency.hq_level > 1:
        agency.hq_level -= 1
        reputation.lose(world, balance, hit)
        level = next(l for l in balance.l("hq_levels") if l["level"] == agency.hq_level)
        events.append(
            ev(
                FORCED_DOWNSIZE,
                f"Downgraded to {level['name']} to stay afloat. Reputation down {hit:.0f}.",
                week,
                Severity.CRITICAL,
                hq_level=agency.hq_level,
            )
        )
        return events

    events.append(
        ev(
            CASH_WARNING,
            "Nothing left to cut. The agency is running on fumes.",
            week,
            Severity.CRITICAL,
            cash=agency.cash,
        )
    )
    return events


def _region_cost(world: World, scout) -> float:
    if scout.region_id and scout.region_id in world.regions:
        return world.regions[scout.region_id].scouting_cost
    return 0.0


def weekly_budget(world: World, balance: Balance) -> dict[str, float]:
    """The same current commitments drive forecasts and weekly settlement."""
    from ..agency_management import support_cost
    return {
        "retainers": sum(weekly_retainer(balance, p.contract.wage) for p in world.client_players() if p.contract),
        "hq_cost": hq_level(balance, world.agency.hq_level).weekly_cost,
        "scout_wages": sum(s.wage for s in world.scouts.values()),
        "region_costs": sum(_region_cost(world, s) for s in world.scouts.values()),
        "support_cost": support_cost(world),
    }


def weekly_burn(world: World, balance: Balance) -> float:
    """Projected net cash movement per week, before deals and purchases."""
    budget = weekly_budget(world, balance)
    return budget["retainers"] - sum(amount for key, amount in budget.items() if key != "retainers")
