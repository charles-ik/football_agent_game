"use client";

// Scout management: regions with assignments, the staff list, the weekly
// hiring market, and the reports table with its Sign buttons.

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ActionButton } from "@/components/action-button";
import { Dialog } from "@/components/dialog";
import { Money } from "@/components/money";
import { RangeBar } from "@/components/range-bar";
import {
  NegotiationDialog,
  type NegotiationRequest,
} from "@/components/negotiation/negotiation-dialog";
import { useToast } from "@/components/toaster";
import { assignScout, dismissScout, focusScout, hireScout } from "@/lib/actions";
import type { ScoutCandidate, ScoutDTO, ScoutingReportRow, ScoutingState } from "@/lib/types";

export function ScoutManager({
  scouting,
  candidates,
}: {
  scouting: ScoutingState;
  candidates: ScoutCandidate[];
}) {
  const [assigning, setAssigning] = useState<ScoutDTO | null>(null);
  const [focusing, setFocusing] = useState<ScoutDTO | null>(null);
  const [hiring, setHiring] = useState(false);

  return (
    <>
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Regions</h2>
        <div className="overflow-x-auto rounded border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-3 py-2 font-medium">Region</th>
                <th className="px-2 py-2 font-medium">Stars</th>
                <th className="px-2 py-2 font-medium">Typical standard</th>
                <th className="px-2 py-2 font-medium">Cost /wk</th>
                <th className="px-2 py-2 font-medium">Scouts</th>
                <th className="px-2 py-2 font-medium">Reports</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {scouting.regions.map((region) => (
                <tr key={region.id}>
                  <td className="px-3 py-1.5">{region.name}</td>
                  <td className="num px-2 py-1.5 text-dim">{region.star_rating.toFixed(1)}</td>
                  <td className="num px-2 py-1.5 text-dim">~{Math.round(region.expected_ability)}</td>
                  <td className="px-2 py-1.5"><Money value={region.scouting_cost} /></td>
                  <td className="num px-2 py-1.5 text-dim">{region.scouts_assigned}</td>
                  <td className="num px-2 py-1.5 text-dim">{region.report_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-dim">Scouts</h2>
          <button
            onClick={() => setHiring(true)}
            className="rounded border border-line px-2.5 py-1 text-xs text-fg hover:bg-panel-2"
          >
            Hire a scout
          </button>
        </div>
        <div className="overflow-x-auto rounded border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Quality</th>
                <th className="px-2 py-2 font-medium">Wage</th>
                <th className="px-2 py-2 font-medium">Region</th>
                <th className="px-2 py-2 font-medium">Brief</th>
                <th className="px-2 py-2 font-medium">Watching</th>
                <th className="px-2 py-2 font-medium">Precision</th>
                <th className="px-2 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {scouting.scouts.map((scout) => (
                <tr key={scout.id}>
                  <td className="px-3 py-1.5 font-medium">{scout.name}</td>
                  <td className="num px-2 py-1.5 text-dim">{Math.round(scout.quality)}</td>
                  <td className="px-2 py-1.5"><Money value={scout.wage} /></td>
                  <td className="px-2 py-1.5 text-dim">{scout.region_name ?? "—"}</td>
                  <td className="px-2 py-1.5 text-xs text-dim">
                    {[scout.brief_position, scout.brief_max_age && `u${scout.brief_max_age}`]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-dim">{scout.focus_player_name ?? "—"}</td>
                  <td className="num px-2 py-1.5 text-dim">{scout.precision.toFixed(2)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setAssigning(scout)}
                        className="rounded border border-line px-2 py-1 text-xs hover:bg-panel-2"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => setFocusing(scout)}
                        disabled={!scout.region_id}
                        title={scout.region_id ? "" : "Assign him to a region first"}
                        className="rounded border border-line px-2 py-1 text-xs hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Focus
                      </button>
                      <ActionButton
                        action={() => dismissScout(scout.id)}
                        confirm={`Let ${scout.name} go?`}
                        className="px-2 py-1 text-xs"
                      >
                        Dismiss
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AssignDialog scout={assigning} scouting={scouting} onClose={() => setAssigning(null)} />
      <FocusDialog scout={focusing} scouting={scouting} onClose={() => setFocusing(null)} />
      <HireDialog open={hiring} candidates={candidates} onClose={() => setHiring(false)} />
    </>
  );
}

function AssignDialog({
  scout,
  scouting,
  onClose,
}: {
  scout: ScoutDTO | null;
  scouting: ScoutingState;
  onClose: () => void;
}) {
  const { toastResult } = useToast();
  const router = useRouter();
  const [regionId, setRegionId] = useState("east");
  const [position, setPosition] = useState("");
  const [maxAge, setMaxAge] = useState("");

  const submit = async () => {
    const age = maxAge.trim() === "" ? null : Number.parseInt(maxAge, 10);
    const result = await assignScout(
      scout!.id,
      regionId,
      position || null,
      age !== null && !Number.isNaN(age) ? age : null,
    );
    toastResult(result);
    router.refresh();
    onClose();
  };

  return (
    <Dialog open={scout !== null} onClose={onClose} title={scout ? `Assign ${scout.name}` : ""}>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-dim">Region</span>
          <select
            value={regionId}
            onChange={(event) => setRegionId(event.target.value)}
            className="w-full rounded border border-line bg-panel-2 px-2 py-1.5 outline-none focus:border-accent"
          >
            {scouting.regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name} — ★{region.star_rating.toFixed(1)}, {region.scouting_cost.text}/wk
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3">
          <label className="block flex-1 text-sm">
            <span className="mb-1 block text-dim">Brief: position (optional)</span>
            <select
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              className="w-full rounded border border-line bg-panel-2 px-2 py-1.5 outline-none focus:border-accent"
            >
              <option value="">Any</option>
              {["GK", "DF", "MF", "FW"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="block flex-1 text-sm">
            <span className="mb-1 block text-dim">Brief: max age (optional)</span>
            <input
              value={maxAge}
              onChange={(event) => setMaxAge(event.target.value)}
              inputMode="numeric"
              placeholder="e.g. 23"
              className="w-full rounded border border-line bg-panel-2 px-2 py-1.5 outline-none focus:border-accent"
            />
          </label>
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <button
            onClick={async () => {
              const result = await assignScout(scout!.id, null, null, null);
              toastResult(result);
              router.refresh();
              onClose();
            }}
            className="text-xs text-faint underline-offset-2 hover:text-bad hover:underline"
          >
            Unassign
          </button>
          <button
            onClick={submit}
            className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-ink hover:bg-accent/90"
          >
            Send him
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function FocusDialog({
  scout,
  scouting,
  onClose,
}: {
  scout: ScoutDTO | null;
  scouting: ScoutingState;
  onClose: () => void;
}) {
  const { toastResult } = useToast();
  const router = useRouter();
  const reportsInRegion = scouting.reports.filter(
    (row) => scout?.region_id && row.report.region_id === scout.region_id,
  );

  const pick = async (playerId: number | null) => {
    const result = await focusScout(scout!.id, playerId);
    toastResult(result);
    router.refresh();
    onClose();
  };

  return (
    <Dialog open={scout !== null} onClose={onClose} title={scout ? `${scout.name} — focus` : ""}>
      <p className="mb-3 text-xs text-dim">
        Park him on one player. Fewer discoveries, far faster narrowing.
      </p>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {reportsInRegion.length === 0 && (
          <p className="text-sm text-faint">No reports in his region yet.</p>
        )}
        {reportsInRegion.map((row) => (
          <button
            key={row.player.id}
            onClick={() => pick(row.player.id)}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-panel-2"
          >
            <span>
              {row.player.name}{" "}
              <span className="text-faint">
                {row.player.age} · {row.player.position}
              </span>
            </span>
            <span className="num text-xs text-dim">
              {Math.round(row.report.ability_low)}–{Math.round(row.report.ability_high)}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => pick(null)}
          className="rounded border border-line px-3 py-1.5 text-sm text-dim hover:bg-panel-2"
        >
          Back to general duty
        </button>
      </div>
    </Dialog>
  );
}

function HireDialog({
  open,
  candidates,
  onClose,
}: {
  open: boolean;
  candidates: ScoutCandidate[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="This week's market">
      <p className="mb-3 text-xs text-dim">
        Three candidates, stable until the week turns. Better scouts cost more; what you are
        buying is precision.
      </p>
      <div className="space-y-2">
        {candidates.map((candidate) => (
          <div
            key={candidate.index}
            className="flex items-center gap-3 rounded border border-line bg-panel-2 px-3 py-2"
          >
            <div className="flex-1">
              <div className="text-sm font-medium">{candidate.name}</div>
              <div className="num text-xs text-dim">
                quality {Math.round(candidate.quality)} · <Money value={candidate.wage} />
                /wk · fee <Money value={candidate.signing_fee} />
              </div>
            </div>
            <ActionButton action={() => hireScout(candidate.index)} className="px-2 py-1 text-xs">
              Hire
            </ActionButton>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function ReportsTable({ reports }: { reports: ScoutingReportRow[] }) {
  const [request, setRequest] = useState<NegotiationRequest | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">Age</th>
              <th className="px-2 py-2 font-medium">Pos</th>
              <th className="px-2 py-2 font-medium">Club</th>
              <th className="px-2 py-2 font-medium">Ability</th>
              <th className="px-2 py-2 font-medium">Potential</th>
              <th className="px-2 py-2 font-medium">Watched</th>
              <th className="px-2 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {reports.map((row) => (
              <tr key={row.player.id}>
                <td className="px-3 py-1.5 font-medium">
                  {row.player.name}
                  {row.player.represented_by && (
                    <span
                      className="ml-2 rounded border border-line px-1 py-0.5 text-[10px] text-faint"
                      title={`Represented by ${row.player.represented_by}`}
                    >
                      {row.player.represented_by}
                    </span>
                  )}
                </td>
                <td className="num px-2 py-1.5 text-dim">{row.player.age}</td>
                <td className="px-2 py-1.5 text-dim">{row.player.position}</td>
                <td className="px-2 py-1.5 text-dim">{row.player.club_name}</td>
                <td className="px-2 py-1.5">
                  <RangeBar
                    low={row.report.ability_low}
                    high={row.report.ability_high}
                    confidence={row.report.confidence}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <RangeBar
                    low={row.report.potential_low}
                    high={row.report.potential_high}
                    showLabel={false}
                  />
                </td>
                <td className="num px-2 py-1.5 text-dim">{row.report.weeks_watched}w</td>
                <td className="px-2 py-1.5">
                  {row.can_approach ? (
                    <button
                      onClick={() => setRequest({ kind: "signing", playerId: row.player.id })}
                      className="rounded bg-accent px-2.5 py-1 text-xs font-semibold text-ink hover:bg-accent/90"
                    >
                      Sign
                    </button>
                  ) : (
                    <span className="block max-w-56 text-[11px] leading-tight text-faint">
                      {row.approach_blocked_reason}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NegotiationDialog request={request} onClose={() => setRequest(null)} />
    </>
  );
}
