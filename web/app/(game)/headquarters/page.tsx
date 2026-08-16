// Headquarters — the upgrade decision is affordability over time, not the
// sticker price: current caps and weekly cost next to the next level's, with
// the projected weekly net after upgrading beside the current one.

import { ActionButton } from "@/components/action-button";
import { Money } from "@/components/money";
import { upgradeHq } from "@/lib/actions";
import { getHq } from "@/lib/api";
import type { HQLevelDTO } from "@/lib/types";

export default async function HeadquartersPage() {
  const hq = await getHq();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <LevelCard title="Current premises" level={hq.current} />
        {hq.next ? (
          <LevelCard title="Next step up" level={hq.next} highlight />
        ) : (
          <div className="rounded border border-line bg-panel p-4 text-sm text-dim">
            This is as good as it gets.
          </div>
        )}
      </div>

      <div className="rounded border border-line bg-panel p-4">
        <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-dim">
            Weekly net now: <Money value={hq.weekly_net_now} signed className="font-semibold" />
          </span>
          {hq.weekly_net_after && (
            <span className="text-dim">
              After upgrading:{" "}
              <Money value={hq.weekly_net_after} signed className="font-semibold" />
            </span>
          )}
        </div>
        {hq.next ? (
          <ActionButton
            kind="primary"
            action={upgradeHq}
            confirm={`Move into ${hq.next.name} for ${hq.next.upgrade_cost.text}? Bigger premises mean bigger weekly bills, and over-expanding before a window is how agencies die.`}
            disabled={!hq.can_upgrade.ok}
          >
            Upgrade to {hq.next.name} — {hq.next.upgrade_cost.text}
          </ActionButton>
        ) : null}
        {!hq.can_upgrade.ok && hq.next && (
          <p className="mt-2 text-xs text-warn">{hq.can_upgrade.reason}</p>
        )}
        <p className="mt-3 text-xs text-faint">
          Bigger premises mean bigger weekly bills, and over-expanding before a window is how
          agencies die.
        </p>
      </div>
    </div>
  );
}

function LevelCard({
  title,
  level,
  highlight = false,
}: {
  title: string;
  level: HQLevelDTO;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded border bg-panel p-4 ${highlight ? "border-accent/30" : "border-line"}`}>
      <div className="mb-1 text-[11px] uppercase tracking-wider text-faint">{title}</div>
      <h3 className="mb-3 text-base font-semibold">{level.name}</h3>
      <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
        <dt className="text-dim">Scouts</dt>
        <dd className="num text-right">{level.scout_cap}</dd>
        <dt className="text-dim">Clients</dt>
        <dd className="num text-right">{level.client_cap}</dd>
        <dt className="text-dim">Report precision</dt>
        <dd className="num text-right">+{Math.round(level.precision_bonus * 100)}%</dd>
        <dt className="text-dim">Weekly cost</dt>
        <dd className="text-right">
          <Money value={level.weekly_cost} />
        </dd>
        {highlight && level.upgrade_cost.amount > 0 && (
          <>
            <dt className="text-dim">Upgrade cost</dt>
            <dd className="text-right">
              <Money value={level.upgrade_cost} />
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
