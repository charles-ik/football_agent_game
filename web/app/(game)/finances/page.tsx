// Finances — solvency, and how long you have.
//
// The runway line is the point of this screen, and it used to be actively
// misleading: it announced "at this rate you run out in 1225 weeks" in red,
// which is 23 years away and not a warning at all. A runway is only news when
// you could plausibly hit it, so it is stated in seasons once it is far off and
// only turns red when it is genuinely close.

import { Money } from "@/components/money";
import { Panel, PanelSection, ScreenHeader, StatTile, Table, Td, Th, cn } from "@/components/ui";
import { getFinances } from "@/lib/api";
import type { FinanceWeekDTO } from "@/lib/types";

export default async function FinancesPage() {
  const finances = await getFinances();
  const burning = finances.weekly_net.amount < 0;
  const weeks = finances.weeks_until_broke;

  // Below a season: alarming. Below two: worth watching. Beyond that it is a
  // fact about the business, not a threat, so it stops shouting.
  const tone = !burning || weeks === null ? "good" : weeks <= 26 ? "bad" : weeks <= 52 ? "warn" : "default";
  const runwayText =
    !burning || weeks === null
      ? "—"
      : weeks <= 104
        ? `${weeks}w`
        : `${Math.round(weeks / 52)} seasons`;

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Finances"
        note="Commission arrives in lumps and only inside a window; costs arrive every single week. The gap between those two facts is the whole game."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Cash" value={<Money value={finances.cash} />} />
        <StatTile
          label="Weekly net"
          value={<Money value={finances.weekly_net} signed />}
          tone={burning ? "bad" : "good"}
        />
        <StatTile
          label="Runway"
          value={runwayText}
          tone={tone === "default" ? "default" : tone}
          sub={
            !burning
              ? "You are earning more than you spend."
              : weeks !== null && weeks <= 104
                ? "At the current burn rate."
                : "Comfortable at the current burn rate."
          }
        />
        <StatTile
          label="Next window"
          value={`${finances.weeks_until_next_window}w`}
          sub="Retainers continue; new deal commission depends on the window."
        />
      </section>

      {burning && weeks !== null && weeks <= 52 && (
        <Panel tone={weeks <= 26 ? "bad" : "warn"} className="px-4 py-3">
          <p className={cn("text-sm font-medium", weeks <= 26 ? "text-bad" : "text-warn")}>
            At this rate you run out in <span className="num">{weeks}</span> weeks, and the next
            window is <span className="num">{finances.weeks_until_next_window}</span> weeks away.
          </p>
          <p className="t-note mt-1">
            {weeks <= finances.weeks_until_next_window
              ? "You will not survive to the next window without cutting costs. Dismiss a scout, pull one out of an expensive region, or accept a smaller deal now."
              : "You will reach the window, but with little margin. One deal has to land."}
          </p>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <PanelSection title="Week by week" bodyClassName="p-0">
          {finances.history.length === 0 ? (
            <p className="t-note px-4 py-4">No weeks have run yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th align="right">Week</Th>
                  <Th align="right">Retainers</Th>
                  <Th align="right">Commission</Th>
                  <Th align="right">Scouts</Th>
                  <Th align="right">Premises</Th>
                  <Th align="right">Regions</Th>
                  <Th align="right">Support team</Th><Th align="right">Investments</Th>
                  <Th align="right">Net</Th>
                </tr>
              </thead>
              <tbody>
                {[...finances.history].reverse().map((week) => (
                  <tr key={week.week} className="transition-colors hover:bg-panel-2">
                    <Td align="right" className="num text-faint">
                      {week.week}
                    </Td>
                    <Td align="right">
                      <Money value={week.retainers} />
                    </Td>
                    <Td align="right">
                      <span className={week.commission.amount > 0 ? "text-good" : ""}>
                        <Money value={week.commission} />
                      </span>
                    </Td>
                    <Td align="right" className="text-dim">
                      <Money value={week.scout_wages} />
                    </Td>
                    <Td align="right" className="text-dim">
                      <Money value={week.hq_cost} />
                    </Td>
                    <Td align="right" className="text-dim">
                      <Money value={week.region_costs} />
                    </Td>
                    <Td align="right"><Money value={week.support_cost}/></Td><Td align="right"><Money value={week.investments}/></Td>
                    <Td align="right" className="font-medium">
                      <Money value={week.net} signed />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </PanelSection>

        <div className="space-y-4">
          <PanelSection title="Net per week" note="Commission spikes; costs are constant.">
            {finances.history.length < 2 ? (
              <p className="t-note">Not enough weeks to plot yet.</p>
            ) : (
              <NetChart history={finances.history} />
            )}
          </PanelSection>

          <PanelSection title="Lifetime">
            <dl className="space-y-1">
              <div className="flex items-baseline justify-between border-b border-line/50 py-1.5">
                <dt className="text-xs text-dim">Commission earned</dt>
                <dd className="text-sm text-good">
                  <Money value={finances.total_commission} />
                </dd>
              </div>
              <div className="flex items-baseline justify-between py-1.5">
                <dt className="text-xs text-dim">Costs paid</dt>
                <dd className="text-sm text-dim">
                  <Money value={finances.total_costs} />
                </dd>
              </div>
            </dl>
          </PanelSection>
        </div>
      </div>
    </div>
  );
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
