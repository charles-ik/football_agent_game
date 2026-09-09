// The dashboard — the state of your agency in one screen.
//
// This replaced the old Inbox page, which duplicated what the week rail now
// shows permanently. The rail is the raw chronological view; this is the
// interpreted one, and it exists because nothing in the game previously told
// you *what to worry about*. You had to visit six screens to discover you were
// about to lose a client.
//
// So it is organised by pressure, not by data type: money and how long it
// lasts, the clients who are in trouble, the scouting money you are spending,
// and the deadlines that bite.

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, TrendingDown, UserX } from "lucide-react";

import { DecisionList } from "@/components/decision-list";
import { Money } from "@/components/money";
import { RangeBar } from "@/components/range-bar";
import { SeasonTimeline } from "@/components/season-timeline";
import { TrustMeter } from "@/components/trust-meter";
import {
  Badge,
  EmptyState,
  Panel,
  PanelSection,
  ScreenHeader,
  StatTile,
  cn,
} from "@/components/ui";
import {
  getClients,
  getFinances,
  getGameState,
  getInbox,
  getMeta,
  getScouting,
} from "@/lib/api";
import type { ClientRow } from "@/lib/types";

/** What is wrong with this client, in the game's own words. Empty means fine. */
function concerns(client: ClientRow): { text: string; tone: "bad" | "warn" }[] {
  const out: { text: string; tone: "bad" | "warn" }[] = [];
  if (client.trust < 40) out.push({ text: "losing faith in you", tone: "bad" });
  else if (client.trust < 55) out.push({ text: "unsettled", tone: "warn" });
  // Playing time is what makes greed punishable: a client parked somewhere too
  // good for him rots, stops improving and turns on you.
  if (client.playing_time === "bench" || client.playing_time === "reserve") {
    out.push({ text: `not playing (${client.playing_time})`, tone: "bad" });
  }
  if (client.flags.injured_weeks > 0) {
    out.push({ text: `injured ${client.flags.injured_weeks}w`, tone: "warn" });
  }
  if (client.flags.transfer_listed) out.push({ text: "transfer-listed", tone: "warn" });
  return out;
}

export default async function DashboardPage() {
  const [state, inbox, clients, finances, scouting, meta] = await Promise.all([
    getGameState(),
    getInbox(60),
    getClients(),
    getFinances(),
    getScouting(),
    getMeta(),
  ]);

  const burning = finances.weekly_net.amount < 0;
  // Only a runway you could plausibly hit is worth showing. The old screen
  // announced "you run out in 1225 weeks", which is not a warning, it's noise.
  const runway =
    burning && finances.weeks_until_broke !== null && finances.weeks_until_broke <= 104
      ? finances.weeks_until_broke
      : null;
  const runwayTone = runway === null ? "default" : runway <= 12 ? "bad" : "warn";

  const troubled = clients
    .map((client) => ({ client, issues: concerns(client) }))
    .filter((entry) => entry.issues.length > 0)
    .sort((a, b) => b.issues.length - a.issues.length || a.client.trust - b.client.trust);

  const idleScouts = scouting.scouts.filter((scout) => !scout.region_id);
  const ripening = scouting.reports.filter((row) => row.report.weeks_watched < 6).length;

  // The signing pipeline: who you could actually approach right now, best
  // potential first. Without this the dashboard could tell you everything that
  // was wrong and nothing you could do about it.
  const signable = scouting.reports
    .filter((row) => row.can_approach)
    .sort(
      (a, b) =>
        b.report.potential_low + b.report.potential_high -
        (a.report.potential_low + a.report.potential_high),
    )
    .slice(0, 5);
  const atCap = state.counts.clients >= state.counts.client_cap;

  return (
    <div className="space-y-5">
      <ScreenHeader
        title={state.agency.name}
        note={
          state.calendar.window_open
            ? "The window is open. Deals only happen now — everything else is preparation."
            : `No deals until the window opens in ${state.calendar.weeks_until_next_window} weeks. Use the time to scout and to keep your clients sweet.`
        }
      />

      {/* Money, and how long it lasts. These two together are the whole
          solvency decision, so they sit first and adjacent. */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Cash" value={<Money value={finances.cash} />} />
        <StatTile
          label="Weekly net"
          value={<Money value={finances.weekly_net} signed />}
          tone={burning ? "bad" : "good"}
          sub={burning ? "You are spending more than you earn." : "You are running a surplus."}
        />
        <StatTile
          label="Runway"
          value={runway === null ? "—" : `${runway}w`}
          tone={runwayTone}
          sub={
            runway === null
              ? burning
                ? "Comfortable at this burn rate."
                : "Not burning cash."
              : "Until the money runs out at this rate."
          }
        />
        <StatTile
          label={state.calendar.window_open ? "Window closes in" : "Next window"}
          value={
            state.calendar.window_open
              ? `${state.calendar.weeks_until_window_closes ?? 0}w`
              : `${state.calendar.weeks_until_next_window}w`
          }
          tone={state.calendar.window_open ? "accent" : "default"}
          sub={
            state.calendar.window_open
              ? "Commission can only be earned before it shuts."
              : "No transfers can be completed until then."
          }
        />
      </section>

      {runway !== null && runway <= 12 && (
        <Panel tone="bad" className="flex items-start gap-3 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <div>
            <p className="text-sm font-medium text-bad">
              At this rate you run out in <span className="num">{runway}</span> weeks.
            </p>
            <p className="t-note mt-0.5">
              The next window is in{" "}
              <span className="num">{finances.weeks_until_next_window}</span> weeks. Cut costs, or
              be certain a deal lands before then.
            </p>
          </div>
        </Panel>
      )}

      <Panel className="px-4 py-3.5">
        <SeasonTimeline
          seasonWeek={state.calendar.season_week}
          weeksPerSeason={meta.calendar.weeks_per_season}
          windows={meta.calendar.windows}
          windowNames={meta.calendar.window_names}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Decisions repeat here deliberately: on narrow viewports the week
            rail is hidden, and this is then the only place they appear. */}
        <PanelSection
          title="Needs a decision"
          note="Open obligations. They clear themselves once you act."
          bodyClassName="p-0"
          tone={inbox.needs_decision.length > 0 ? "action" : "default"}
          className="xl:hidden"
        >
          <DecisionList decisions={inbox.needs_decision} />
        </PanelSection>

        <PanelSection
          title="Clients who need looking after"
          note="Trust, playing time and fitness — the three things that cost you a client."
          bodyClassName="p-0"
          actions={
            <Link href="/clients" className="t-note flex items-center gap-1 hover:text-fg">
              All clients <ArrowUpRight size={12} aria-hidden />
            </Link>
          }
        >
          {clients.length === 0 ? (
            <EmptyState
              title="You have no clients."
              hint="An agency with nobody on its books earns nothing. Put a scout in a region and sign the first name that comes back."
              action={{ href: "/scouting", label: "Go scouting" }}
              className="border-0"
            />
          ) : troubled.length === 0 ? (
            <EmptyState
              title="Every client is settled."
              hint="Playing regularly, trusting you, and fit. Nothing to fix today."
              className="border-0"
            />
          ) : (
            <ul className="divide-y divide-line/60">
              {troubled.slice(0, 6).map(({ client, issues }) => (
                <li key={client.player.id}>
                  <Link
                    href={`/clients/${client.player.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel-2"
                  >
                    <UserX
                      size={15}
                      className={cn(
                        "shrink-0",
                        issues.some((i) => i.tone === "bad") ? "text-bad" : "text-warn",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-medium">{client.player.name}</span>
                        <span className="truncate text-xs text-faint">{client.club_name}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {issues.map((issue) => (
                          <Badge key={issue.text} tone={issue.tone}>
                            {issue.text}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <TrustMeter trust={client.trust} label={client.trust_label} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PanelSection>

        <PanelSection
          title="Scouting"
          note="Every scout costs you a wage whether or not he is looking at anything."
          bodyClassName="p-0"
          tone={idleScouts.length > 0 ? "warn" : "default"}
          actions={
            <Link href="/scouting" className="t-note flex items-center gap-1 hover:text-fg">
              Manage <ArrowUpRight size={12} aria-hidden />
            </Link>
          }
        >
          <div className="grid grid-cols-3 divide-x divide-line/60">
            <MiniStat label="Scouts" value={`${scouting.scouts.length}/${state.counts.scout_cap}`} />
            <MiniStat
              label="Idle"
              value={String(idleScouts.length)}
              tone={idleScouts.length > 0 ? "bad" : "default"}
            />
            <MiniStat label="Reports" value={String(scouting.reports.length)} />
          </div>
          {idleScouts.length > 0 ? (
            <p className="border-t border-line px-4 py-2.5 text-xs text-warn">
              {idleScouts.map((s) => s.name).join(", ")}{" "}
              {idleScouts.length === 1 ? "is" : "are"} unassigned and still on the payroll.
            </p>
          ) : (
            <p className="t-note border-t border-line px-4 py-2.5">
              {ripening > 0 ? (
                <>
                  <span className="num">{ripening}</span> report
                  {ripening === 1 ? "" : "s"} still firming up. Every week watched narrows the range.
                </>
              ) : (
                "Every scout is deployed."
              )}
            </p>
          )}
        </PanelSection>

        <PanelSection
          title="Who you could sign"
          note="Scouted, and willing to take your call. Ranked by potential."
          bodyClassName="p-0"
          actions={
            <Link href="/scouting" className="t-note flex items-center gap-1 hover:text-fg">
              Scouting <ArrowUpRight size={12} aria-hidden />
            </Link>
          }
        >
          {atCap ? (
            <EmptyState
              title="Your books are full."
              hint={`${state.counts.clients} of ${state.counts.client_cap} places used. Bigger premises would raise the ceiling — at a bigger weekly bill.`}
              action={{ href: "/headquarters", label: "Look at premises" }}
              className="border-0"
            />
          ) : signable.length === 0 ? (
            <EmptyState
              title="Nobody is within reach yet."
              hint="Either you have no reports, or the players you have found will not take a call from an agent of your standing. Reputation is what fixes that, and reputation comes from doing deals."
              className="border-0"
            />
          ) : (
            <ul className="divide-y divide-line/60">
              {signable.map((row) => (
                <li
                  key={row.player.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{row.player.name}</span>
                      <span className="num shrink-0 text-xs text-faint">
                        {row.player.age} · {row.player.position}
                      </span>
                    </div>
                    <div className="truncate text-xs text-faint">{row.player.club_name}</div>
                  </div>
                  <div className="w-32 shrink-0">
                    <RangeBar
                      low={row.report.potential_low}
                      high={row.report.potential_high}
                      confidence={row.report.confidence}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelSection>

        <PanelSection
          title="What it costs to keep the lights on"
          bodyClassName="p-0"
          actions={
            <Link href="/finances" className="t-note flex items-center gap-1 hover:text-fg">
              Finances <ArrowUpRight size={12} aria-hidden />
            </Link>
          }
        >
          {finances.history.length === 0 ? (
            <p className="t-note px-4 py-3">No weeks have run yet.</p>
          ) : (
            <dl className="px-4 py-1">
              {(() => {
                const week = finances.history[finances.history.length - 1];
                return (
                  <>
                    <CostRow label="Retainers in" value={week.retainers} positive />
                    <CostRow label="Commission in" value={week.commission} positive />
                    <CostRow label="Scout wages" value={week.scout_wages} />
                    <CostRow label="Premises" value={week.hq_cost} />
                    <CostRow label="Regions" value={week.region_costs} />
                    <div className="flex items-baseline justify-between border-t border-line py-2 text-sm font-semibold">
                      <dt>Last week's net</dt>
                      <dd>
                        <Money value={week.net} signed />
                      </dd>
                    </div>
                  </>
                );
              })()}
            </dl>
          )}
        </PanelSection>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "bad";
}) {
  return (
    <div className="px-4 py-3">
      <div className="t-label">{label}</div>
      <div
        className={cn("num mt-1 text-lg font-semibold", tone === "bad" ? "text-bad" : "text-fg")}
      >
        {value}
      </div>
    </div>
  );
}

function CostRow({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: { amount: number; text: string };
  positive?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-line/40 py-1.5 text-sm">
      <dt className="text-dim">{label}</dt>
      <dd className={cn("num", positive ? "text-good" : "text-dim")}>
        {positive ? "" : "−"}
        {value.text.replace("-", "")}
      </dd>
    </div>
  );
}
