// Scouting — where the game's central bet is made: you are always signing on
// incomplete information, and everything on this screen is about buying
// certainty before you have to commit.

import { EmptyState, PanelSection, ScreenHeader } from "@/components/ui";
import { getCandidates, getMeta, getScouting } from "@/lib/api";

import { ReportsTable, ScoutManager } from "./scouting-panels";

export default async function ScoutingPage() {
  const [scouting, candidates, meta] = await Promise.all([
    getScouting(),
    getCandidates(),
    getMeta(),
  ]);

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Scouting"
        note="Reports are ranges, never numbers. A better scout, a bigger reputation and more weeks watched all narrow the range — so growth buys precision, and signing is always a bet."
      />
      <div className="space-y-4">
        <ScoutManager scouting={scouting} candidates={candidates} positions={meta.positions} />
        <PanelSection
          title="Reports"
          note="Sorted by potential. Watch a player for longer and his bars visibly tighten."
          bodyClassName="p-0"
        >
          {scouting.reports.length === 0 ? (
            <EmptyState
              title="No reports yet."
              hint="Assign a scout to a region and press Continue. Names start arriving within a few weeks."
              className="border-0"
            />
          ) : (
            <ReportsTable reports={scouting.reports} />
          )}
        </PanelSection>
      </div>
    </div>
  );
}
