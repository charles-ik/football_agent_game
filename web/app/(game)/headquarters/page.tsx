// Premises — the upgrade decision, framed the way it actually bites.
//
// The sticker price is not the decision; the weekly bill is. An agency that
// upgrades just before a window and then cannot pay its scouts has killed
// itself with an improvement. So the two levels are shown side by side with the
// projected weekly net underneath, and the confirm repeats the warning.

import { ArrowRight, Check } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { Money } from "@/components/money";
import { Panel, PanelSection, ScreenHeader, StatTile, cn } from "@/components/ui";
import { upgradeHq } from "@/lib/actions";
import { getHq } from "@/lib/api";
import type { HQLevelDTO } from "@/lib/types";

export default async function HeadquartersPage() {
  const hq = await getHq();
  const worseAfter =
    hq.weekly_net_after !== null && hq.weekly_net_after !== undefined
      ? hq.weekly_net_after.amount < 0 && hq.weekly_net_now.amount >= 0
      : false;

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Premises"
        note="Bigger premises raise your ceilings — more scouts, more clients, sharper reports — and raise your weekly bill to match."
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Weekly net now" value={<Money value={hq.weekly_net_now} signed />} tone={hq.weekly_net_now.amount < 0 ? "bad" : "good"} />
        <StatTile
          label="Weekly net after upgrading"
          value={hq.weekly_net_after ? <Money value={hq.weekly_net_after} signed /> : "—"}
          tone={
            !hq.weekly_net_after ? "default" : hq.weekly_net_after.amount < 0 ? "bad" : "good"
          }
          sub={worseAfter ? "This upgrade turns a surplus into a loss." : undefined}
        />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <LevelCard title="Current premises" level={hq.current} />

        <div className="hidden self-center text-faint lg:block">
          <ArrowRight size={20} aria-hidden />
        </div>

        {hq.next ? (
          <LevelCard title="Next step up" level={{...hq.next, upgrade_cost: hq.upgrade_cost!}} compareTo={hq.current} highlight />
        ) : (
          <Panel className="px-4 py-6 text-center">
            <p className="text-sm text-dim">This is as good as it gets.</p>
            <p className="t-note mt-1">There is nothing left to move into.</p>
          </Panel>
        )}
      </div>

      {hq.next && (
        <PanelSection title="Move in" tone={hq.can_upgrade.ok ? "action" : "default"}>
          <div className="flex flex-wrap items-center gap-4">
            <ActionButton
              kind="primary"
              action={upgradeHq}
              confirm={`Move into ${hq.next.name} for ${hq.upgrade_cost?.text}? Your weekly bill rises to ${hq.next.weekly_cost.text}. Over-expanding before a window is how agencies die.`}
              disabled={!hq.can_upgrade.ok}
            >
              Upgrade to {hq.next.name} — {hq.upgrade_cost?.text}
            </ActionButton>
            {!hq.can_upgrade.ok && <p className="text-xs text-warn">{hq.can_upgrade.reason}</p>}
          </div>
          <p className="t-note mt-3 max-w-prose">
            The cost that matters is the one that arrives every week, not the one you pay today.
            Check the projected net above against how long it is until the window opens.
          </p>
        </PanelSection>
      )}
    </div>
  );
}

function LevelCard({
  title,
  level,
  compareTo,
  highlight = false,
}: {
  title: string;
  level: HQLevelDTO;
  compareTo?: HQLevelDTO;
  highlight?: boolean;
}) {
  return (
    <Panel tone={highlight ? "action" : "default"} className="overflow-hidden">
      <header className="border-b border-line bg-panel-2/60 px-4 py-2.5">
        <div className="t-label">{title}</div>
        <h3 className="t-section mt-0.5">{level.name}</h3>
      </header>
      <dl className="px-4 py-2">
        <Row
          label="Scouts"
          value={level.scout_cap}
          delta={compareTo && level.scout_cap - compareTo.scout_cap}
        />
        <Row
          label="Clients"
          value={level.client_cap}
          delta={compareTo && level.client_cap - compareTo.client_cap}
        />
        <Row
          label="Report precision"
          value={`+${Math.round(level.precision_bonus * 100)}%`}
          delta={
            compareTo
              ? Math.round((level.precision_bonus - compareTo.precision_bonus) * 100)
              : undefined
          }
          deltaSuffix="%"
        />
        <div className="flex items-baseline justify-between border-b border-line/50 py-1.5 last:border-0">
          <dt className="text-xs text-dim">Weekly cost</dt>
          <dd className="text-sm">
            <Money value={level.weekly_cost} />
            {compareTo && (
              <span className="num ml-1.5 text-[17px] text-warn">
                +{Math.round(level.weekly_cost.amount - compareTo.weekly_cost.amount)}
              </span>
            )}
          </dd>
        </div>
        {highlight && level.upgrade_cost.amount > 0 && (
          <div className="flex items-baseline justify-between py-1.5">
            <dt className="text-xs text-dim">One-off cost</dt>
            <dd className="text-sm font-semibold">
              <Money value={level.upgrade_cost} />
            </dd>
          </div>
        )}
      </dl>
    </Panel>
  );
}

function Row({
  label,
  value,
  delta,
  deltaSuffix = "",
}: {
  label: string;
  value: string | number;
  delta?: number;
  deltaSuffix?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-line/50 py-1.5">
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="num text-sm">
        {value}
        {delta !== undefined && delta > 0 && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[17px] text-good">
            <Check size={10} aria-hidden />+{delta}
            {deltaSuffix}
          </span>
        )}
      </dd>
    </div>
  );
}
