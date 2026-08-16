// Scouting — regions, the scouts covering them, the hiring market, and the
// reports table. Ability is always a range bar, never a number.

import { getCandidates, getMeta, getScouting } from "@/lib/api";

import { ReportsTable, ScoutManager } from "./scouting-panels";

export default async function ScoutingPage() {
  const [scouting, candidates, meta] = await Promise.all([
    getScouting(),
    getCandidates(),
    getMeta(),
  ]);

  return (
    <div className="space-y-6">
      <ScoutManager scouting={scouting} candidates={candidates} positions={meta.positions} />
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">
          Reports
        </h2>
        {scouting.reports.length === 0 ? (
          <p className="text-sm text-faint">
            No reports yet. Assign a scout to a region and press Continue.
          </p>
        ) : (
          <ReportsTable reports={scouting.reports} />
        )}
      </section>
    </div>
  );
}
