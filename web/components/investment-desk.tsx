"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, TrendingUp } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { Badge, PanelSection, StatTile, Table, Td, Th, buttonClass, inputClass } from "@/components/ui";
import { tradeShares } from "@/lib/actions";
import type { InvestmentDTO, StockDTO } from "@/lib/investment-api";

const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (value: number) => currency.format(value);
const gain = (value: number) => `${value >= 0 ? "+" : ""}${money(value)}`;

export function investmentQuote(price: number, shares: number, side: "buy" | "sell", feePct: number, minimumFee: number) {
  const gross = Math.round(price * 100) * shares;
  const fee = Math.max(Math.round(minimumFee * 100), Math.round(gross * feePct));
  return { fee: fee / 100, total: (side === "buy" ? gross + fee : gross - fee) / 100 };
}

export function InvestmentDesk({ market, revision }: { market: InvestmentDTO; revision: number }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(market.stocks[0].symbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("10");
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const stock = market.stocks.find(item => item.symbol === symbol)!;
  const shares = Number(quantity);
  const validQuantity = Number.isSafeInteger(shares) && shares > 0 && shares <= market.max_trade_shares;
  const quote = investmentQuote(stock.price, validQuantity ? shares : 0, side, market.fee_pct, market.minimum_fee);
  const cashAfter = market.cash + (side === "buy" ? -quote.total : quote.total);
  const validTrade = validQuantity && (side === "buy" ? cashAfter >= 0 : shares <= stock.shares && quote.total > 0);
  const runwayAfter = market.weekly_net < 0 ? Math.max(0, Math.floor(cashAfter / -market.weekly_net)) : null;
  const holdings = market.stocks.filter(item => item.shares > 0);

  async function execute() {
    if (busy.current || !validTrade) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await tradeShares(symbol, side, shares, revision);
      setNotice({ ok: result.ok, message: result.message });
      setReview(false);
      router.refresh();
    } catch {
      setNotice({ ok: false, message: "The trade could not be confirmed. Review the refreshed portfolio before trying again." });
      setReview(false);
      router.refresh();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <div className="space-y-5">
    <section className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
      <StatTile label="Available cash" value={money(market.cash)} sub="Shared with your agency"/>
      <StatTile label="Portfolio value" value={money(market.portfolio_value)} sub="Before selling fees"/>
      <StatTile label="Unrealized gain" value={gain(market.unrealized_gain)} tone={market.unrealized_gain >= 0 ? "good" : "warn"} sub="Includes buy fees; excludes selling fees"/>
      <StatTile label="Cash + investments" value={money(market.net_worth)} sub="Shares must be sold to fund wages"/>
    </section>
    {notice && <p role={notice.ok ? "status" : "alert"} className={`rounded-lg border p-4 text-sm ${notice.ok ? "border-good/40 text-good" : "border-bad/40 text-bad"}`}>{notice.message}</p>}
    <PanelSection title="Your portfolio" note={holdings.length ? "Select a holding to review its price or sell shares." : "Your first investment starts here. Choose a business from the market below."} actions={<TrendingUp size={18} className="text-accent"/>}>
      {holdings.length > 0 && <div className="divide-y divide-line">{holdings.map(item => <button key={item.symbol} className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left hover:text-accent" onClick={() => { setSymbol(item.symbol); setSide("sell"); setQuantity(String(item.shares)); }}>
        <span><span className="block font-semibold">{item.name}</span><span className="t-note">{item.shares.toLocaleString()} shares · {money(item.cost_basis)} cost basis</span></span><span className="text-right"><span className="num block text-sm">{money(item.value)}</span><span className={`num text-xs ${item.unrealized_gain >= 0 ? "text-good" : "text-warn"}`}>{gain(item.unrealized_gain)}</span></span>
      </button>)}</div>}
      <p className="mt-2 text-sm text-dim">Realized gain after fees: <span className="num">{gain(market.realized_gain)}</span></p>
    </PanelSection>
    <div className="grid items-start gap-4 2xl:grid-cols-2">
      <PanelSection title="Market watch" note={`Week ${market.week} · prices hold until you advance the game`}>
        <div className="space-y-2">{market.stocks.map(item => <button key={item.symbol} onClick={() => { setSymbol(item.symbol); setNotice(null); }} aria-pressed={symbol === item.symbol} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${symbol === item.symbol ? "border-accent bg-accent/10" : "border-line hover:bg-panel-2"}`}>
          <span className="num grid size-11 shrink-0 place-items-center rounded-lg bg-panel-3 text-xs text-accent">{item.symbol}</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.name}</span><span className="text-xs text-dim">{item.sector}</span></span>
          <span className="shrink-0 text-right"><span className="num block text-sm">{money(item.price)}</span><span className={`num text-xs ${item.change_pct >= 0 ? "text-good" : "text-warn"}`}>{item.change_pct >= 0 ? "+" : ""}{item.change_pct.toFixed(2)}%</span></span>
        </button>)}</div>
        <p className="t-note mt-4">Fictional companies and simulated prices. No real money, live quotes, dividends or borrowing.</p>
      </PanelSection>
      <PanelSection title={stock.name} note={`${stock.symbol} · ${stock.sector}`} actions={<Badge tone={stock.risk === "Higher" ? "warn" : "neutral"}>{stock.risk} volatility</Badge>}>
        <p className="text-sm text-dim">{stock.description}</p>
        <PriceChart stock={stock}/>
        <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); if (validTrade) setReview(true); }}>
          <fieldset disabled={pending} className="min-w-0 space-y-4"><legend className="sr-only">Trade {stock.symbol}</legend>
            <div className="grid grid-cols-2 gap-2">{(["buy", "sell"] as const).map(value => <button key={value} type="button" aria-pressed={side === value} onClick={() => setSide(value)} className={side === value ? buttonClass.primary : buttonClass.secondary}>{value === "buy" ? "Buy shares" : "Sell shares"}</button>)}</div>
            <label className="block text-sm" htmlFor="share-quantity">Number of shares <span className="text-xs text-dim">· You own {stock.shares}</span></label>
            <input id="share-quantity" type="number" min="1" max={side === "sell" ? Math.max(1, stock.shares) : market.max_trade_shares} step="1" required inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} className={inputClass}/>
            <dl className="space-y-2 rounded-lg bg-panel-2 p-3 text-sm">
              <div className="flex justify-between gap-3"><dt>Trading fee</dt><dd className="num">{validQuantity ? money(quote.fee) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt>{side === "buy" ? "Total cost" : "Cash returned"}</dt><dd className="num">{validQuantity ? money(quote.total) : "—"}</dd></div>
              <div className="flex justify-between gap-3 border-t border-line pt-2"><dt>Cash after trade</dt><dd className={`num ${cashAfter < 0 ? "text-bad" : "text-fg"}`}>{validQuantity ? money(cashAfter) : "—"}</dd></div>
            </dl>
            {validQuantity && validTrade && <p className={`text-xs ${cashAfter < 0 || (runwayAfter !== null && runwayAfter < 13) ? "text-warn" : "text-dim"}`}>{cashAfter < 0 ? "Your cash balance would still be overdrawn." : runwayAfter === null ? "Current weekly retainers cover your recurring costs." : `${runwayAfter} weeks of cash runway after this trade, at current commitments.`}</p>}
            {!validTrade && <p className="text-xs text-warn">{!validQuantity ? "Enter a positive whole-share quantity." : side === "buy" ? "Not enough agency cash for these shares and fees." : shares > stock.shares ? "You cannot sell more shares than you own." : "The sale must cover the minimum trading fee."}</p>}
            <button disabled={pending || !validTrade} className={`${buttonClass.primary} w-full`}>Review {side === "buy" ? "purchase" : "sale"}</button>
          </fieldset>
        </form>
        <p className="t-note mt-3">{market.fee_pct * 100}% per trade, minimum {money(market.minimum_fee)}. Prices can fall. Invested cash cannot pay wages until you sell.</p>
        <Link href="/finances" className="mt-3 inline-block text-sm text-accent hover:underline">Review your agency budget ↗</Link>
      </PanelSection>
    </div>
    <PanelSection title="Trade history" note="Sale proceeds appear separately from football commission in your finance ledger.">
      {!market.trades.length ? <p className="t-note">Your completed trades will appear here.</p> : <Table><thead><tr>{["Week", "Trade", "Shares", "Price", "Fee", "Cash movement"].map(label => <Th key={label}>{label}</Th>)}</tr></thead><tbody>{market.trades.map((trade, index) => <tr key={`${trade.week}:${index}`}><Td className="num">{trade.week}</Td><Td><span className="inline-flex items-center gap-1 whitespace-nowrap">{trade.side === "buy" ? <ArrowUpRight size={14}/> : <ArrowDownLeft size={14}/>} {trade.side === "buy" ? "Bought" : "Sold"} {trade.symbol}</span></Td><Td className="num">{trade.shares}</Td><Td className="num">{money(trade.price)}</Td><Td className="num">{money(trade.fee)}</Td><Td className="num">{gain(trade.side === "buy" ? -trade.total : trade.total)}</Td></tr>)}</tbody></Table>}
      {market.trades.length > 0 && <p className="t-note mt-3">Showing the latest {market.trades.length} trades. Lifetime realized gain includes earlier trades.</p>}
    </PanelSection>
    <Dialog open={review} onClose={() => { if (!pending) setReview(false); }} title="Review your trade">
      <p className="office-title text-2xl">{side === "buy" ? "Buy" : "Sell"} {shares.toLocaleString()} {symbol} shares</p>
      <p className="mt-3 text-sm text-dim">{money(stock.price)} per share · {money(quote.fee)} fee</p>
      <p className="mt-3 text-sm">{side === "buy" ? "Pay" : "Receive"} <strong className="num">{money(quote.total)}</strong></p>
      <p className="mt-2 text-sm">Agency cash afterwards: <strong className="num">{money(cashAfter)}</strong></p>
      <p className="t-note mt-3">This trade uses your agency’s in-game cash and saves immediately. {side === "buy" ? "Share prices may fall before you sell." : "The proceeds are available for agency costs immediately."}</p>
      <div className="mt-5 flex flex-wrap gap-3"><button className={buttonClass.primary} disabled={pending || !validTrade} onClick={() => void execute()}>{pending ? "Trading…" : `Confirm ${side === "buy" ? "purchase" : "sale"}`}</button><button disabled={pending} className={buttonClass.ghost} onClick={() => setReview(false)}>Keep managing</button></div>
    </Dialog>
  </div>;
}

function PriceChart({ stock }: { stock: StockDTO }) {
  if (stock.history.length < 2) return <p className="my-5 rounded-lg border border-dashed border-line p-4 text-xs text-dim">Opening price: {money(stock.price)}. Advance a week to see the first market movement.</p>;
  const prices = stock.history.map(point => point.price);
  const min = Math.min(...prices);
  const range = Math.max(...prices) - min || 1;
  const points = prices.map((price, index) => `${5 + index / (prices.length - 1) * 290},${75 - (price - min) / range * 65}`).join(" ");
  return <figure className="mt-5"><svg viewBox="0 0 300 85" className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={`${stock.name} price history, week ${stock.history[0].week} to ${stock.history.at(-1)!.week}, ${money(prices[0])} to ${money(stock.price)}`}><path d="M5 78H295" stroke="var(--color-line)"/><polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg><figcaption className="flex justify-between text-xs text-dim"><span>Week {stock.history[0].week} · {money(prices[0])}</span><span>Week {stock.history.at(-1)!.week} · {money(stock.price)}</span></figcaption></figure>;
}
