"""A fictional weekly exchange. Trades use agency cash; quotes never reveal future prices."""
from math import floor

from .actions import ActionResult
from .events import Severity, ev
from .models import ShareHolding
from .rng import stream
from .systems.finance import record_investment, record_investment_return, weekly_burn


def initialize(world, balance):
    market = world.investments
    if market.last_week < 0:
        market.prices = {stock["symbol"]: stock["price"] for stock in balance.l("investments.stocks")}
        market.last_week = world.week
        market.history = [{"week": world.week, "prices": dict(market.prices)}]


def run(world, balance):
    initialize(world, balance)
    market = world.investments
    if market.last_week >= world.week:
        return []
    before = sum(holding.shares * market.prices[symbol] for symbol, holding in market.holdings.items())
    macro = stream(world.seed, world.week, "investments.market").uniform(-1, 1) * balance.f("investments.market_volatility")
    for stock in balance.l("investments.stocks"):
        symbol = stock["symbol"]
        noise = stream(world.seed, world.week, f"investments.{symbol}").uniform(-1, 1) * stock["volatility"]
        market.prices[symbol] = round(max(balance.f("investments.minimum_price"), market.prices[symbol] * (1 + macro + noise + balance.f("investments.weekly_drift"))), 2)
    market.last_week = world.week
    market.history.append({"week": world.week, "prices": dict(market.prices)})
    market.history[:] = market.history[-balance.i("investments.history_weeks"):]
    after = sum(holding.shares * market.prices[symbol] for symbol, holding in market.holdings.items())
    if not before:
        return []
    change = round(after - before, 2)
    return [ev("investments.week", f"Investments: portfolio {'rose' if change >= 0 else 'fell'} £{abs(change):,.2f} to £{after:,.2f}. Cash is unchanged until you sell.", world.week, Severity.INFO, change=change)]


def trade_quote(price, shares, side, balance):
    """Integer pennies keep the review and execution price identical."""
    gross_pence = round(price * 100) * shares
    fee_pence = max(round(balance.f("investments.minimum_fee") * 100), floor(gross_pence * balance.f("investments.fee_pct") + .5))
    return gross_pence / 100, fee_pence / 100, (gross_pence + fee_pence if side == "buy" else gross_pence - fee_pence) / 100


def state(world, balance):
    market = world.investments
    stocks = []
    for stock in balance.l("investments.stocks"):
        symbol = stock["symbol"]
        price = market.prices.get(symbol, stock["price"])
        previous = market.history[-2]["prices"][symbol] if len(market.history) > 1 else price
        holding = market.holdings.get(symbol, ShareHolding())
        value = round(holding.shares * price, 2)
        stocks.append({key: stock[key] for key in ("symbol", "name", "sector", "description", "risk")} | {
            "price": price, "change_pct": round((price / previous - 1) * 100, 2),
            "history": [{"week": point["week"], "price": point["prices"][symbol]} for point in market.history],
            "shares": holding.shares, "cost_basis": holding.cost_basis, "value": value,
            "unrealized_gain": round(value - holding.cost_basis, 2),
        })
    value = round(sum(stock["value"] for stock in stocks), 2)
    return {"week": world.week, "cash": round(world.agency.cash, 2), "weekly_net": round(weekly_burn(world, balance), 2),
        "fee_pct": balance.f("investments.fee_pct"), "minimum_fee": balance.f("investments.minimum_fee"),
        "max_trade_shares": balance.i("investments.max_trade_shares"), "portfolio_value": value,
        "net_worth": round(world.agency.cash + value, 2),
        "unrealized_gain": round(sum(stock["unrealized_gain"] for stock in stocks), 2),
        "realized_gain": market.realized_gain, "stocks": stocks, "trades": list(reversed(market.trades))}


def trade(world, balance, symbol, side, shares):
    if world.game_over or world.agency.bankrupt:
        return ActionResult(False, "This agency has closed.")
    if type(shares) is not int or not 1 <= shares <= balance.i("investments.max_trade_shares"):
        return ActionResult(False, "Choose a positive whole-share quantity within the trade limit.")
    if side not in ("buy", "sell") or not isinstance(symbol, str) or symbol not in {stock["symbol"] for stock in balance.l("investments.stocks")}:
        return ActionResult(False, "Choose a listed stock and buy or sell.")
    initialize(world, balance)
    market = world.investments
    holding = market.holdings.get(symbol, ShareHolding())
    price = market.prices[symbol]
    gross, fee, total = trade_quote(price, shares, side, balance)
    if side == "buy" and total > world.agency.cash:
        return ActionResult(False, "Not enough agency cash to cover these shares and the trading fee.")
    if side == "sell" and shares > holding.shares:
        return ActionResult(False, "You cannot sell more shares than you own.")
    if side == "sell" and total <= 0:
        return ActionResult(False, "The sale must cover the trading fee. Sell a larger holding.")
    if side == "buy":
        holding.shares += shares
        holding.cost_basis = round(holding.cost_basis + total, 2)
        market.holdings[symbol] = holding
        world.agency.cash = round(world.agency.cash - total, 2)
        record_investment(world, total)
    else:
        basis = holding.cost_basis if shares == holding.shares else round(holding.cost_basis * shares / holding.shares, 2)
        holding.shares -= shares
        holding.cost_basis = round(holding.cost_basis - basis, 2)
        market.realized_gain = round(market.realized_gain + total - basis, 2)
        if not holding.shares:
            del market.holdings[symbol]
        world.agency.cash = round(world.agency.cash + total, 2)
        record_investment_return(world, total)
    record = {"week": world.week, "symbol": symbol, "side": side, "shares": shares, "price": price, "fee": fee, "total": total}
    market.trades.append(record)
    market.trades[:] = market.trades[-balance.i("investments.trade_history_limit"):]
    message = f"{'Bought' if side == 'buy' else 'Sold'} {shares:,} {symbol} shares for £{total:,.2f} {'including' if side == 'buy' else 'after'} £{fee:,.2f} fees."
    return ActionResult(True, message, [ev(f"investments.{side}", message, world.week, symbol=symbol, shares=shares, fee=fee, total=total)])
