"use client";

// Scout management: regions, the staff you pay every week, the hiring market,
// and the reports that drive every signing.
//
// The reports table is the heart of it. Ability and potential are range bars,
// never numbers, and the bars animate between weeks — watching a player narrow
// from "guesswork, 40–80" to "certain, 62–64" is the scouting loop made
// visible, and it is the one thing this interface can do that the terminal
// could not.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, MapPin, TriangleAlert, UserPlus } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { Dialog } from "@/components/dialog";
import { Money } from "@/components/money";
import { RangeBar } from "@/components/range-bar";
import {
  NegotiationDialog,
  type NegotiationRequest,
} from "@/components/negotiation/negotiation-dialog";
import { useToast } from "@/components/toaster";
import {
  Badge,
  EmptyState,
  PanelSection,
  Table,
  Td,
  Th,
  buttonClass,
  cn,
  inputClass,
} from "@/components/ui";
import { assignScout, dismissScout, focusScout, hireScout } from "@/lib/actions";
import type { ScoutCandidate, ScoutDTO, ScoutingReportRow, ScoutingState } from "@/lib/types";

/** Stars as glyphs. The trade-off — richer pools you cannot yet sign from
 *  versus cheap ones you can — has to be readable without arithmetic.
 *  Drawn as a clipped overlay rather than a half-star character, because the
 *  half-star codepoint is missing from most system fonts and renders as tofu. */
function Stars({ rating }: { rating: number }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span
      className="relative inline-block whitespace-nowrap leading-none"
      title={`${rating.toFixed(1)} of 5`}
      role="img"
      aria-label={`Talent pool ${rating.toFixed(1)} out of 5`}
    >
      <span aria-hidden className="text-line-strong">
        ★★★★★
      </span>
      <span
        aria-hidden
        className="absolute left-0 top-0 overflow-hidden text-accent"
        style={{ width: `${pct}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}

export function ScoutManager({
  scouting,
  candidates,
  positions,
}: {
  scouting: ScoutingState;
  candidates: ScoutCandidate[];
  positions: string[];
}) {
  const [assigning, setAssigning] = useState<ScoutDTO | null>(null);
  const [focusing, setFocusing] = useState<ScoutDTO | null>(null);
  const [hiring, setHiring] = useState(false);

  const idle = scouting.scouts.filter((scout) => !scout.region_id);

  return (
    <>
      <PanelSection
        title="Regions"
        note="A cheap region has a weaker pool — but a low-reputation agent can actually sign the players in it."
        bodyClassName="p-0"
      >
        <Table>
          <thead>
            <tr>
              <Th>Region</Th>
              <Th>Talent pool</Th>
              <Th align="right">Typical standard</Th>
              <Th align="right">Cost /wk</Th>
              <Th align="right">Scouts</Th>
              <Th align="right">Reports</Th>
            </tr>
          </thead>
          <tbody>
            {scouting.regions.map((region) => (
              <tr key={region.id} className="transition-colors hover:bg-panel-2">
                <Td className="font-medium">
                  <span className="flex items-center gap-2">
                    <MapPin size={13} className="text-faint" aria-hidden />
                    {region.name}
                  </span>
                </Td>
                <Td>
                  <Stars rating={region.star_rating} />
                </Td>
                <Td align="right" className="num text-dim">
                  ~{Math.round(region.expected_ability)}
                </Td>
                <Td align="right">
                  <Money value={region.scouting_cost} />
                </Td>
                <Td align="right">
                  <span className={cn("num", region.scouts_assigned > 0 ? "text-fg" : "text-faint")}>
                    {region.scouts_assigned}
                  </span>
                </Td>
                <Td align="right" className="num text-dim">
                  {region.report_count}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </PanelSection>

      <PanelSection
        title="Scouts"
        note="Each one is a weekly wage whether or not he is looking at anything."
        tone={idle.length > 0 ? "warn" : "default"}
        bodyClassName="p-0"
        actions={
          <button onClick={() => setHiring(true)} className={buttonClass.secondary}>
            <span className="flex items-center gap-1.5">
              <UserPlus size={13} aria-hidden />
              Hire a scout
            </span>
          </button>
        }
      >
        {scouting.scouts.length === 0 ? (
          <EmptyState
            title="You employ nobody."
            hint="Without a scout you will never see a player, and without players there is nothing to sign."
            className="border-0"
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th align="right">Quality</Th>
                <Th align="right">Wage</Th>
                <Th>Region</Th>
                <Th>Brief</Th>
                <Th>Watching</Th>
                <Th align="right">Precision</Th>
                <Th align="right">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {scouting.scouts.map((scout) => {
                const unassigned = !scout.region_id;
                return (
                  <tr
                    key={scout.id}
                    className={cn("transition-colors hover:bg-panel-2", unassigned && "bg-bad/5")}
                  >
                    <Td className="font-medium">{scout.name}</Td>
                    <Td align="right" className="num text-dim">
                      {Math.round(scout.quality)}
                    </Td>
                    <Td align="right">
                      <Money value={scout.wage} />
                    </Td>
                    <Td>
                      {unassigned ? (
                        <Badge tone="bad">
                          <TriangleAlert size={11} aria-hidden />
                          unassigned
                        </Badge>
                      ) : (
                        <span className="text-dim">{scout.region_name}</span>
                      )}
                    </Td>
                    <Td className="text-xs text-dim">
                      {[scout.brief_position, scout.brief_max_age && `u${scout.brief_max_age}`]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </Td>
                    <Td className="text-xs text-dim">
                      {scout.focus_player_name ? (
                        <span className="flex items-center gap-1 text-accent">
                          <Eye size={11} aria-hidden />
                          {scout.focus_player_name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td align="right" className="num text-dim">
                      {Math.round(scout.precision * 100)}%
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setAssigning(scout)}
                          className={cn(buttonClass.secondary, "px-2 py-1 text-xs")}
                        >
                          Assign
                        </button>
                        <button
                          onClick={() => setFocusing(scout)}
                          disabled={!scout.region_id}
                          title={scout.region_id ? "" : "Assign him to a region first"}
                          className={cn(buttonClass.secondary, "px-2 py-1 text-xs")}
                        >
                          Focus
                        </button>
                        <ActionButton
                          action={() => dismissScout(scout.id)}
                          confirm={`Let ${scout.name} go? You stop paying him this week, and you lose whatever he was building up in his region.`}
                          className="px-2 py-1 text-xs"
                        >
                          Dismiss
                        </ActionButton>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </PanelSection>

      <AssignDialog
        scout={assigning}
        scouting={scouting}
        positions={positions}
        onClose={() => setAssigning(null)}
      />
      <FocusDialog scout={focusing} scouting={scouting} onClose={() => setFocusing(null)} />
      <HireDialog open={hiring} candidates={candidates} onClose={() => setHiring(false)} />
    </>
  );
}

function AssignDialog({
  scout,
  scouting,
  positions,
  onClose,
}: {
  scout: ScoutDTO | null;
  scouting: ScoutingState;
  positions: string[];
  onClose: () => void;
}) {
  const { toastResult } = useToast();
  const router = useRouter();
  const [regionId, setRegionId] = useState(scouting.regions[0]?.id ?? "east");
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
          <span className="t-label mb-1.5 block">Region</span>
          <select
            value={regionId}
            onChange={(event) => setRegionId(event.target.value)}
            className={inputClass}
          >
            {scouting.regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name} — {region.star_rating.toFixed(1)}★, {region.scouting_cost.text}/wk
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-3">
          <label className="block flex-1 text-sm">
            <span className="t-label mb-1.5 block">Position brief</span>
            <select
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              className={inputClass}
            >
              <option value="">Any</option>
              {positions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 text-sm">
            <span className="t-label mb-1.5 block">Max age</span>
            <input
              value={maxAge}
              onChange={(event) => setMaxAge(event.target.value)}
              inputMode="numeric"
              placeholder="any"
              className={inputClass}
            />
          </label>
        </div>
        <p className="t-note">
          A narrow brief finds fewer players but wastes fewer weeks on ones you would never sign.
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={async () => {
              const result = await assignScout(scout!.id, null, null, null);
              toastResult(result);
              router.refresh();
              onClose();
            }}
            className="text-xs text-faint underline-offset-2 transition-colors hover:text-bad hover:underline"
          >
            Pull him off everything
          </button>
          <button onClick={submit} className={buttonClass.primary}>
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
      <p className="t-note mb-3">
        Park him on one player. Fewer discoveries, far faster narrowing — this is how you turn a
        maybe into a certainty before the window opens.
      </p>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {reportsInRegion.length === 0 && (
          <p className="text-sm text-faint">No reports in his region yet.</p>
        )}
        {reportsInRegion.map((row) => (
          <button
            key={row.player.id}
            onClick={() => pick(row.player.id)}
            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-panel-2"
          >
            <span className="min-w-0 flex-1 truncate">
              {row.player.name}{" "}
              <span className="text-faint">
                {row.player.age} · {row.player.position}
              </span>
            </span>
            <span className="w-28 shrink-0">
              <RangeBar
                low={row.report.ability_low}
                high={row.report.ability_high}
                confidence={row.report.confidence}
                showLabel={false}
              />
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={() => pick(null)} className={buttonClass.secondary}>
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
      <p className="t-note mb-3">
        Three candidates, stable until the week turns. A better scout costs more; what you are
        buying is precision, not players.
      </p>
      <div className="space-y-2">
        {candidates.map((candidate) => (
          <div
            key={candidate.index}
            className="flex items-center gap-3 rounded-md border border-line bg-panel-2 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{candidate.name}</div>
              <div className="mt-0.5 text-xs text-dim">
                <span className="num">quality {Math.round(candidate.quality)}</span>
                <span className="text-faint"> · </span>
                <Money value={candidate.wage} />
                /wk
                <span className="text-faint"> · </span>
                fee <Money value={candidate.signing_fee} />
              </div>
            </div>
            <ActionButton action={() => hireScout(candidate.index)} kind="primary" className="text-xs">
              Hire
            </ActionButton>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

type ReportSort = "potential" | "ability" | "age" | "watched";

export function ReportsTable({ reports }: { reports: ScoutingReportRow[] }) {
  const [request, setRequest] = useState<NegotiationRequest | null>(null);
  const [sort, setSort] = useState<{ key: ReportSort; desc: boolean }>({
    key: "potential",
    desc: true,
  });

  const rows = useMemo(() => {
    const value = (row: ScoutingReportRow) => {
      switch (sort.key) {
        case "potential":
          return (row.report.potential_low + row.report.potential_high) / 2;
        case "ability":
          return (row.report.ability_low + row.report.ability_high) / 2;
        case "age":
          return row.player.age;
        case "watched":
          return row.report.weeks_watched;
      }
    };
    return [...reports].sort((a, b) => (sort.desc ? value(b) - value(a) : value(a) - value(b)));
  }, [reports, sort]);

  const toggle = (key: ReportSort) =>
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: true }));

  const header = (key: ReportSort, label: string) => (
    <button
      onClick={() => toggle(key)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-fg",
        sort.key === key && "text-fg",
      )}
    >
      {label}
      {sort.key === key &&
        (sort.desc ? <ArrowDown size={11} aria-hidden /> : <ArrowUp size={11} aria-hidden />)}
    </button>
  );

  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th align="right">{header("age", "Age")}</Th>
            <Th>Pos</Th>
            <Th>Club</Th>
            <Th className="min-w-40">{header("ability", "Ability")}</Th>
            <Th className="min-w-40">{header("potential", "Potential")}</Th>
            <Th align="right">{header("watched", "Watched")}</Th>
            <Th align="right">{""}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.player.id} className="transition-colors hover:bg-panel-2">
              <Td className="font-medium">
                <span className="flex items-center gap-2">
                  {row.player.name}
                  {row.player.represented_by && (
                    <Badge title={`Represented by ${row.player.represented_by}`}>
                      {row.player.represented_by}
                    </Badge>
                  )}
                </span>
              </Td>
              <Td align="right" className="num text-dim">
                {row.player.age}
              </Td>
              <Td className="text-dim">{row.player.position}</Td>
              <Td className="text-dim">{row.player.club_name}</Td>
              <Td>
                <RangeBar
                  low={row.report.ability_low}
                  high={row.report.ability_high}
                  confidence={row.report.confidence}
                />
              </Td>
              <Td>
                <RangeBar
                  low={row.report.potential_low}
                  high={row.report.potential_high}
                  showLabel={false}
                />
              </Td>
              <Td align="right" className="num text-dim">
                {row.report.weeks_watched}w
              </Td>
              <Td align="right">
                {row.can_approach ? (
                  <button
                    onClick={() => setRequest({ kind: "signing", playerId: row.player.id })}
                    className={cn(buttonClass.primary, "px-2.5 py-1 text-xs")}
                  >
                    Approach
                  </button>
                ) : (
                  <span className="block max-w-56 text-right text-[11px] leading-tight text-faint">
                    {row.approach_blocked_reason}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <NegotiationDialog request={request} onClose={() => setRequest(null)} />
    </>
  );
}
