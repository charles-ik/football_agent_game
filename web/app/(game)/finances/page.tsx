// Finances — cash, weekly net, lifetime commission and costs; the runway line
// in red when the net is negative, next to the weeks until the next window.
// Those two numbers together are the whole solvency decision.

import { Money } from "@/components/money";
import { getFinances } from "@/lib/api";

export default async function FinancesPage() {
  const finances = await getFinances();
  const negative = finances.weekly_net.amount < 0;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Cash" value={<Money value={finances.cash} signed />} />
        <Stat label="Weekly net" value={<Money value={finances.weekly_net} signed />} />
        <Stat label="Lifetime commission" value={<Money value={finances.total_commission} />} />
        <Stat label="Lifetime costs" value={<Money value={finances.total_costs} />} />
      </section>

      <section className="rounded border border-line bg-panel p-4 text-sm">
        {negative && finances.weeks_until_broke !== null && (
          <p className="mb-1 font-semibold text-bad">
            At this rate you run out in {finances.weeks_until_broke} weeks.
          </p>
        )}
        <p className="text-dim">
          Next window in{" "}
          <span className="num text-fg">{finances.weeks_until_next_window}</span> weeks.
        </p>
        {finances.history.length > 4 && <NetSparkline nets={finances.history.map((w) => w.net.amount)} />}
      </section>

      <section className="overflow-x-auto rounded border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
              <th className="px-3 py-2 font-medium">Week</th>
              <th className="px-2 py-2 text-right font-medium">Retainers</th>
              <th className="px-2 py-2 text-right font-medium">Commission</th>
              <th className="px-2 py-2 text-right font-medium">Scouts</th>
              <th className="px-2 py-2 text-right font-medium">HQ</th>
              <th className="px-2 py-2 text-right font-medium">Regions</th>
              <th className="px-2 py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {[...finances.history].reverse().map((week) => (
              <tr key={week.week}>
                <td className="num px-3 py-1.5 text-dim">{week.week}</td>
                <td className="px-2 py-1.5 text-right"><Money value={week.retainers} /></td>
                <td className="px-2 py-1.5 text-right"><Money value={week.commission} /></td>
                <td className="px-2 py-1.5 text-right"><Money value={week.scout_wages} /></td>
                <td className="px-2 py-1.5 text-right"><Money value={week.hq_cost} /></td>
                <td className="px-2 py-1.5 text-right"><Money value={week.region_costs} /></td>
                <td className="px-2 py-1.5 text-right"><Money value={week.net} signed /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-line bg-panel px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-faint">{label}</div>
      <div className="num text-lg font-semibold">{value}</div>
    </div>
  );
}

/** A hand-rolled sparkline of net per week — a charting library is not worth it. */
function NetSparkline({ nets }: { nets: number[] }) {
  const width = 320;
  const height = 40;
  const max = Math.max(...nets.map(Math.abs), 1);
  const step = width / Math.max(nets.length - 1, 1);
  const points = nets
    .map((net, i) => `${(i * step).toFixed(1)},${(height / 2 - (net / max) * (height / 2 - 2)).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      className="mt-3"
      role="img"
      aria-label="Weekly net sparkline"
    >
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-line)" />
      <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
    </svg>
  );
}
