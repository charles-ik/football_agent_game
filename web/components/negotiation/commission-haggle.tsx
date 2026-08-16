"use client";

// Commission haggle — signing and renewal. A percentage slider bounded by the
// commission floor/ceiling, with the guide band shaded on the track: the
// honest version of "agents of your standing usually command 7–13%, but where
// *he* sits in it is his business".

import { useState, useTransition } from "react";

import { Pct } from "@/components/money";
import { RangeBar } from "@/components/range-bar";
import { useToast } from "@/components/toaster";
import { abandonNegotiation, acceptCounter, proposePct } from "@/lib/actions";
import type { NegotiationDTO, PlayerDTO, ScoutingReportDTO } from "@/lib/types";

import { NegotiationOutcome, ProposalEcho, RoundPips, WalkAwayButton, isTerminal } from "./shared";

type PctGuide = { low_pct: number; high_pct: number };
type PctBounds = { min_pct: number; max_pct: number };

export function CommissionHaggle({
  neg,
  onUpdate,
  onClose,
}: {
  neg: NegotiationDTO;
  onUpdate: (neg: NegotiationDTO) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const guide = neg.guide as PctGuide;
  const bounds = neg.bounds as PctBounds;
  const player = neg.context.player as PlayerDTO | null;
  const report = neg.context.report as ScoutingReportDTO | null;
  const reputation = neg.context.reputation as number;
  const [pct, setPct] = useState<number>(guide.low_pct);

  const terminal = isTerminal(neg.status);
  const finalRound = neg.status === "exhausted";
  const counter = neg.counter && "pct" in neg.counter ? neg.counter.pct : null;

  const run = (fn: () => Promise<NegotiationDTO>) =>
    startTransition(async () => {
      try {
        onUpdate(await fn());
      } catch (error) {
        toast(error instanceof Error ? error.message : "Something broke.", "bad");
      }
    });

  const bandLeft = ((guide.low_pct - bounds.min_pct) / (bounds.max_pct - bounds.min_pct)) * 100;
  const bandWidth = ((guide.high_pct - guide.low_pct) / (bounds.max_pct - bounds.min_pct)) * 100;

  return (
    <div className="space-y-4">
      {/* Opening panel: who you're talking to, your read on him, your standing. */}
      <div className="rounded border border-line bg-panel-2 px-3 py-2 text-xs text-dim">
        {player && (
          <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-fg">{player.name}</span>
            <span>
              {player.age} · {player.position} · {player.trait}
            </span>
            <span className="text-faint">your reputation: {reputation}</span>
          </div>
        )}
        {report && (
          <div className="flex flex-wrap items-center gap-4">
            <RangeBar
              low={report.ability_low}
              high={report.ability_high}
              confidence={report.confidence}
            />
            <RangeBar
              low={report.potential_low}
              high={report.potential_high}
              confidence={report.confidence}
            />
          </div>
        )}
        <p className="mt-2 text-warn">Push too hard and he walks — for weeks.</p>
      </div>

      <ProposalEcho neg={neg} />

      {!terminal && (
        <>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-dim">
              <span>Your cut</span>
              <span className="num text-faint">
                guide: {(guide.low_pct * 100).toFixed(1)}–{(guide.high_pct * 100).toFixed(1)}%
              </span>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 my-auto h-2 w-full rounded bg-panel-2" />
              <div
                className="pointer-events-none absolute inset-y-0 my-auto h-2 rounded bg-accent/25"
                style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
              />
              <input
                type="range"
                min={bounds.min_pct}
                max={bounds.max_pct}
                step={0.001}
                value={pct}
                onChange={(event) => setPct(Number(event.target.value))}
                className="relative w-full accent-accent"
                aria-label="Commission percentage"
              />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={bounds.min_pct * 100}
                max={bounds.max_pct * 100}
                step={0.1}
                value={Number((pct * 100).toFixed(1))}
                onChange={(event) => {
                  const value = Number(event.target.value) / 100;
                  if (!Number.isNaN(value)) {
                    setPct(Math.min(bounds.max_pct, Math.max(bounds.min_pct, value)));
                  }
                }}
                className="num w-20 rounded border border-line bg-panel-2 px-2 py-1 text-sm outline-none focus:border-accent"
                aria-label="Commission percentage value"
              />
              <span className="text-xs text-faint">%</span>
              <button
                onClick={() => run(() => proposePct(neg.id, pct))}
                disabled={pending}
                className="ml-auto rounded bg-accent px-4 py-1.5 text-sm font-semibold text-ink hover:bg-accent/90 disabled:opacity-50"
              >
                Propose <Pct value={pct} />
              </button>
            </div>
          </div>

          {counter !== null && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-panel-2 px-3 py-2">
              <span className="text-sm text-dim">
                {finalRound ? "Final offer: " : "He counters with "}
                <Pct value={counter} className="font-semibold text-fg" />
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => run(() => acceptCounter(neg.id))}
                  disabled={pending}
                  className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:bg-accent/90 disabled:opacity-50"
                >
                  Accept his {(counter * 100).toFixed(1)}%
                </button>
                {!finalRound && (
                  <button
                    onClick={() => run(() => proposePct(neg.id, pct))}
                    disabled={pending}
                    className="rounded border border-line px-3 py-1.5 text-sm text-dim hover:bg-panel disabled:opacity-50"
                  >
                    Push again
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-faint">
            <RoundPips round={neg.round} maxRounds={neg.max_rounds} />
            <WalkAwayButton
              disabled={pending}
              onClick={() => run(() => abandonNegotiation(neg.id))}
            />
          </div>
        </>
      )}

      {terminal && <NegotiationOutcome neg={neg} onClose={onClose} />}
    </div>
  );
}
