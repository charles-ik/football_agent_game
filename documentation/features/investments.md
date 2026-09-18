# The in-game stock exchange

The browser's **Stocks** section (`/investments`, keyboard shortcut `9`) lets the
agent invest agency cash in five fictional listings. It shares the existing
cash account: purchases reduce money available for wages and premises, and sales
return cash immediately. Holdings do not protect an overdrawn agency from the
existing insolvency rules; sell shares before advancing if you need cash.

## Rules and presentation

- Buy and sell whole shares. No borrowing, short selling, dividends or real quotes.
- Every trade costs 0.5%, with a £1 minimum. The fee is rounded to pennies.
- A review dialog shows the share price, fee, final debit/credit and cash left.
  The ticket also shows the remaining runway at current weekly commitments.
- Prices move once per game week, with a shared market movement and independent
  company movement from dedicated seeded RNG streams. Prices hold between ticks;
  reloading and placing trades cannot reroll them. Existing football RNG streams
  are unaffected.
- The portfolio shows market value before selling fees, average-cost accounting,
  unrealized gain including buy fees, and lifetime realized gain after both fees.
  Cash plus portfolio value is marked separately from spendable cash.
- Price history keeps 52 observations; trade history keeps the latest 100 trades.
  Lifetime realized gain and remaining cost basis are retained independently.

`football_agent/data/balance.json` owns the listings, prices, volatility, weekly
drift, fee rules, trade-size limit and retention limits. This is a deliberately
small game simulation: relative volatility creates different choices, while
football deals remain the core agency business. The fund is a simulated listing,
not a calculated basket of the four individual stocks.

## Engine, API and persistence

`engine/investments.py` owns initialization, weekly movement, quotes, validation,
trades and the read model. `InvestmentState` and `ShareHolding` in `models.py` are
persisted by the existing dataclass serializer. Older v1/v2 saves default to an
empty portfolio; initialization uses opening prices at the current game week
without altering agency cash or fabricating past trades.

`GET /api/investments` returns current public prices, history, holdings, fees and
portfolio totals. `POST /api/investments/trade` accepts `symbol`, `side` (`buy` or
`sell`) and a strictly integer `shares` quantity. The engine independently rejects
invalid sizes, unsupported stocks, insufficient cash, overselling and closed
agencies. A sale must cover its fee. No partial trade is executed on refusal.

The existing mutation boundary supplies revision checking, idempotency receipts,
immediate autosaves and rollback on save failure. `tradeShares` sends the screen's
revision; stale trades require a refreshed review. No new external service or
package is required.

Purchases (including fees) enter the finance ledger's `investments` column.
Net sale proceeds enter `investment_returns`, which contributes to ledger income
but never football commission or reputation. Portfolio price movements do not
change cash or the ledger. Lifetime costs include share purchases, as labeled in
the UI. Weekly budget forecasts exclude hypothetical future trades.

## Verification

`tests/test_investments.py` exercises cash/ledger reconciliation, partial-sale
basis, fees, invalid requests, deterministic ticks, save migration, revision
conflicts, duplicate requests and rollback when autosaving fails. `investment-desk.test.tsx` checks penny quotes,
review-before-execution and cash/holding limits. The browser suite buys, reloads,
advances, sells, checks ledger separation and tests the updated pages at 360px.
