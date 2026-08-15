"""Money: wages, transfer fees, deal value and commission.

One place for every currency calculation, so the curves can be reasoned about
and tuned together rather than drifting apart across systems.
"""

from __future__ import annotations

from typing import Optional

from .balance import Balance
from .models import Contract, Player


def market_wage(balance: Balance, ability: float, tier: int) -> float:
    """What a player of this ability commands at a club of this tier."""
    base = balance.f("economy.wage_base")
    growth = balance.f("economy.wage_growth")
    pivot = balance.f("economy.wage_pivot")
    tier_mults = balance.d("economy.wage_tier_multiplier")
    mult = float(tier_mults.get(str(tier), 1.0))
    wage = base * (growth ** (ability - pivot)) * mult
    return max(balance.f("economy.wage_min"), round(wage, -1))


def market_value(balance: Balance, player: Player, week: int) -> float:
    """Transfer fee a club would expect to pay.

    Rises steeply with ability, falls with age past the peak, and collapses as
    the contract runs down — which is what makes an expiring deal both your best
    payday and the selling club's biggest problem.
    """
    base = balance.f("economy.fee_base")
    growth = balance.f("economy.fee_growth")
    pivot = balance.f("economy.fee_pivot")
    value = base * (growth ** (player.ability - pivot))

    peak = balance.f("economy.fee_age_peak")
    if player.age > peak:
        penalty = balance.f("economy.fee_age_penalty") * (player.age - peak)
        value *= max(0.15, 1.0 - penalty)
    else:
        value *= 1.0 + 0.02 * (peak - player.age)

    value *= contract_leverage(balance, player.contract, week)
    return round(max(0.0, value), -3)


def contract_leverage(balance: Balance, contract: Optional[Contract], week: int) -> float:
    """0..1 multiplier on fee based on how much contract is left."""
    if contract is None:
        return 0.0
    remaining = max(0, contract.expires_week - week)
    full = balance.f("economy.fee_contract_full_weeks")
    floor = balance.f("economy.fee_contract_min")
    return floor + (1.0 - floor) * min(1.0, remaining / full)


def deal_value(balance: Balance, fee: float, weekly_wage: float, years: int) -> float:
    """The pot the agent's commission is taken from."""
    fee_part = fee * balance.f("commission.fee_weight")
    wage_part = weekly_wage * 52 * max(1, years) * balance.f("commission.wage_weight")
    return fee_part + wage_part


def commission_for(
    balance: Balance,
    commission_pct: float,
    fee: float,
    weekly_wage: float,
    years: int,
    is_renewal: bool = False,
) -> float:
    value = deal_value(balance, fee, weekly_wage, years)
    if is_renewal:
        value *= balance.f("commission.renewal_multiplier")
    return round(value * commission_pct, 2)


def weekly_retainer(balance: Balance, wage: float) -> float:
    return wage * balance.f("finance.retainer_pct_of_wage")


def scout_wage(balance: Balance, quality: float) -> float:
    """Better scouts cost more; the thing you are buying is precision."""
    return round(80 + quality * 4.0, -1)


def format_money(amount: float) -> str:
    sign = "-" if amount < 0 else ""
    amount = abs(amount)
    if amount >= 1_000_000:
        return f"{sign}£{amount / 1_000_000:.2f}M"
    if amount >= 1_000:
        return f"{sign}£{amount / 1_000:.1f}k"
    return f"{sign}£{amount:.0f}"
