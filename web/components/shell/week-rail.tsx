// The right rail — "this week". It is always on screen, on every route, for
// one reason: the Continue button is irreversible, and pressing it while a club
// is waiting on an answer should never be something you do without seeing that
// club.
//
// Two stacked sections, then Continue anchored at the foot. Decisions first
// because they have deadlines; the feed below them is memory, not obligation.

import { DecisionList } from "@/components/decision-list";
import { ContinueButton } from "@/components/continue-button";
import { EventList } from "@/components/event-list";
import type { Decision, EventDTO } from "@/lib/types";

export function WeekRail({
  decisions,
  recent,
  pending,
}: {
  decisions: Decision[];
  recent: EventDTO[];
  pending: number;
}) {
  return (
    <aside
      aria-label="This week"
      className="sticky top-0 hidden h-screen w-[340px] shrink-0 flex-col border-l border-line bg-panel/40 xl:flex"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="t-label">Needs a decision</h2>
        {decisions.length > 0 && (
          <span className="num rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
            {decisions.length}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <DecisionList decisions={decisions} compact />

        <div className="border-t border-line px-4 pb-4 pt-3">
          <h2 className="t-label mb-2">Recently</h2>
          {recent.length === 0 ? (
            <p className="t-note">Nothing to report yet.</p>
          ) : (
            <EventList events={recent.slice(0, 40)} grouped />
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-panel/80 p-3">
        <ContinueButton pending={pending} variant="rail" />
      </div>
    </aside>
  );
}
