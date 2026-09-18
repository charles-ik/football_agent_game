import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";
import { Money } from "@/components/money";
import { SceneBanner } from "@/components/scene-banner";
import { Panel, PanelSection, ScreenHeader, StatTile, Table, Td, Th } from "@/components/ui";
import { getFinances } from "@/lib/api";
import type { FinanceWeekDTO } from "@/lib/types";

export default async function FinancesPage() {
  const finances = await getFinances();
  const { budget, cash, weekly_net, weeks_until_broke: weeks } = finances;
  const burning = weekly_net.amount < 0;
  const insolvent = cash.amount < 0;
  const costs = [
    { label: "Scout wages", value: budget.scout_wages, href: "/scouting" },
    { label: "Scouting regions", value: budget.region_costs, href: "/scouting" },
    { label: "Premises", value: budget.hq_cost, href: "/headquarters" },
    { label: "Staff & departments", value: budget.support_cost, href: "/agency" },
  ];
  const spending = costs.reduce((total, row) => total + row.value.amount, 0);
  const coverage = spending > 0 ? Math.round(budget.retainers.amount / spending * 100) : 100;
  const runway = insolvent ? "Overdrawn" : weeks === null ? "Self-funding" : weeks > 104 ? `${Math.round(weeks / 52)} seasons` : `${weeks} weeks`;
  return <div className="space-y-5">
    <ScreenHeader title="Finances" note="Know what keeps the lights on, what each week costs, and how much room you have for your next move." />
    <SceneBanner image="agency-desk" eyebrow="The business behind the game" title="Make every deal count." description="Retainers build a foundation. Commission funds your ambition. Keep enough in reserve to reach the next opportunity." />
    <section className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
      <StatTile label="Agency balance" value={<Money value={cash} />} tone={insolvent ? "bad" : "default"} />
      <StatTile label="Weekly cash flow" value={<Money value={weekly_net} signed />} tone={burning ? "warn" : "good"} sub="Before commission and investments" />
      <StatTile label="Cash runway" value={runway} tone={insolvent || (weeks !== null && weeks <= 26) ? "bad" : "default"} sub={insolvent ? "Restore a positive balance to recover." : "At today’s income and commitments"} />
      <StatTile label={finances.window_open ? "Window open" : "Next window"} value={finances.window_open ? (finances.weeks_until_window_closes === 0 ? "Final week" : `${finances.weeks_until_window_closes}w left`) : `${finances.weeks_until_next_window} weeks`} tone={finances.window_open ? "accent" : "default"} sub={finances.window_open ? "Review live opportunities before advancing." : "Prepare your client moves now."} />
    </section>
    {insolvent && <Panel tone="bad" className="p-4"><h2 className="text-sm font-semibold text-bad">Your agency is overdrawn</h2><p className="t-note mt-1">Positive weekly income alone does not clear insolvency. Restore your cash balance before further weeks trigger forced cuts or closure.</p><Link href="/agency" className="mt-2 inline-block text-sm text-accent underline">Review your commitments</Link></Panel>}
    <div className="grid items-start gap-4 2xl:grid-cols-2">
      <PanelSection title="Your weekly budget" note="Live commitments, updated whenever you hire, assign or upgrade.">
        <dl>
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3"><dt className="text-sm">Client retainers</dt><dd className="text-good"><Money value={budget.retainers} /></dd></div>
          {costs.map(row => <div key={row.label} className="flex items-center justify-between gap-3 border-b border-line/50 py-3"><dt><Link href={row.href} className="inline-flex items-center gap-1 text-sm text-dim hover:text-accent">{row.label}<ArrowUpRight size={13} /></Link></dt><dd className="text-sm"><Money value={row.value} /></dd></div>)}
          <div className="flex items-center justify-between gap-3 pt-3"><dt className="text-sm font-semibold">Weekly net</dt><dd><Money value={weekly_net} signed /></dd></div>
        </dl>
        <div className="mt-5 rounded-lg bg-panel-2 p-3"><p className="text-sm">Retainers cover <span className="num text-accent">{coverage}%</span> of running costs</p><progress aria-label="Running costs covered by retainers" value={Math.min(coverage,100)} max={100} className="mt-2 h-2 w-full accent-[var(--color-accent)]"/><p className="t-note mt-1">{burning ? "The remainder comes from your cash reserve and completed deals." : "Current retainers cover your recurring commitments."}</p></div>
      </PanelSection>
      <div className="space-y-4">
        <PanelSection title="Plan for the next window" actions={<Wallet size={18} className="text-accent" />}>
          <p className="t-note">Projected cash in {finances.weeks_until_next_window} weeks</p>
          <p className={`num mt-2 text-3xl ${finances.cash_at_next_window.amount < 0 ? "text-bad" : "text-fg"}`}><Money value={finances.cash_at_next_window} /></p>
          <p className="mt-3 text-sm text-dim">{finances.cash_at_next_window.amount < 0 ? "Your current commitments outlast your reserve. Reduce overheads or secure income before then." : "Your current reserve reaches the next opening. Leave room for new wages before you invest."}</p>
          <p className="t-note mt-3">Projection holds today’s retainers and costs constant. Future deals, trades, purchases, departures and forced cuts are excluded.</p>
          <div className="mt-4 flex flex-wrap gap-4"><Link href="/market" className="text-sm text-accent hover:underline">Find a deal ↗</Link><Link href="/agency" className="text-sm text-accent hover:underline">Manage overheads ↗</Link><Link href="/investments" className="text-sm text-accent hover:underline">Invest agency cash ↗</Link></div>
        </PanelSection>
        <PanelSection title="Recent cash movement" note="Completed weeks include commission and investments.">
          {finances.history.length < 2 ? <p className="t-note">Your cash-flow chart starts after two ledger entries. The live budget is available from day one.</p> : <NetChart history={finances.history} />}
          <div className="mt-3 flex gap-4 text-xs text-dim"><span><span className="text-good">↑</span> Cash gained</span><span><span className="text-bad">↓</span> Cash spent</span></div>
        </PanelSection>
      </div>
    </div>
    <section className="grid gap-3 sm:grid-cols-2"><StatTile label="Lifetime commission" value={<Money value={finances.total_commission}/>} tone="good"/><StatTile label="Lifetime costs" value={<Money value={finances.total_costs}/>} sub="Running costs, agency investments and share purchases"/></section>
    <PanelSection title="The ledger" note="Every recorded cash movement. Latest week first." bodyClassName="p-0">
      {!finances.history.length ? <p className="t-note p-4">Your first investment or completed week starts the ledger.</p> : <Table><thead><tr>{["Week","Retainers","Commission","Scouts","Premises","Regions","Support","Investments","Share sales","Net"].map(label=><Th key={label} align="right">{label}</Th>)}</tr></thead><tbody>{[...finances.history].reverse().map(week=><tr key={week.week} className="hover:bg-panel-2"><Td align="right" className="num">{week.week}</Td>{(["retainers","commission","scout_wages","hq_cost","region_costs","support_cost","investments","investment_returns","net"] as const).map(key=><Td key={key} align="right"><Money value={week[key]} signed={key==="net"}/></Td>)}</tr>)}</tbody></Table>}
    </PanelSection>
  </div>;
}

/**
 * A hand-rolled column chart of net per week. A charting library is not worth
 * the bundle for one figure — but bars above and below a zero line say
 * "profitable week / loss-making week" instantly, which a line does not.
 */
function NetChart({ history }: { history: FinanceWeekDTO[] }) {
  const recent = history.slice(-30);
  const max = Math.max(...recent.map((w) => Math.abs(w.net.amount)), 1);
  const width = 100;
  const height = 64;
  const slot = width / recent.length;
  const barWidth = Math.max(slot * 0.62, 0.6);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-20 w-full"
      role="img"
      aria-label={`Net result for the last ${recent.length} weeks`}
    >
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="var(--color-line-strong)"
        strokeWidth={0.4}
      />
      {recent.map((week, index) => {
        const magnitude = (Math.abs(week.net.amount) / max) * (height / 2 - 2);
        const positive = week.net.amount >= 0;
        return (
          <rect
            key={week.week}
            x={index * slot + (slot - barWidth) / 2}
            y={positive ? height / 2 - magnitude : height / 2}
            width={barWidth}
            height={Math.max(magnitude, 0.5)}
            fill={positive ? "var(--color-good)" : "var(--color-bad)"}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}
