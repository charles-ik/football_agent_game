"use client";

// Commission haggle — signing and renewal. A percentage slider bounded by the
// commission floor/ceiling, with the guide band shaded on the track: the
// honest version of "agents of your standing usually command 7–13%, but where
// *he* sits in it is his business".

import { useState, useTransition } from "react";

import { Pct } from "@/components/money";
import { RangeBar } from "@/components/range-bar";
import { useToast } from "@/components/toaster";
import { buttonClass, cn } from "@/components/ui";
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
        if (error instanceof Error && error.message.startsWith("Those talks have lapsed")) onClose();
        toast(error instanceof Error ? error.message : "Something broke.", "bad");
      }
    });

  const bandLeft = ((guide.low_pct - bounds.min_pct) / (bounds.max_pct - bounds.min_pct)) * 100;
  const bandWidth = ((guide.high_pct - guide.low_pct) / (bounds.max_pct - bounds.min_pct)) * 100;

  return (
    <div className="space-y-4">
      {/* Opening panel: who you're talking to, your read on him, your standing. */}
      <div className="rounded-lg border border-line bg-panel-2 px-3.5 py-3">
        {player && (
          <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-fg">{player.name}</span>
            <span className="text-xs text-dim">
              {player.age} · {player.position} · {player.trait}
            </span>
            <span className="num ml-auto text-xs text-faint">
              your reputation: {reputation}
            </span>
          </div>
        )}
        {report && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="t-label mb-1">Ability</div>
              <RangeBar
                low={report.ability_low}
                high={report.ability_high}
                confidence={report.confidence}
              />
            </div>
            <div>
              <div className="t-label mb-1">Potential</div>
              <RangeBar
                low={report.potential_low}
                high={report.potential_high}
                confidence={report.confidence}
              />
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-warn">
          Push too hard and he walks — and he will not take your call again for weeks.
        </p>
      </div>

      <ProposalEcho neg={neg} />

      {!terminal && (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="t-label">Your cut</span>
              <span className="num text-[11px] text-faint">
                agents of your standing command{" "}
                {(guide.low_pct * 100).toFixed(1)}–{(guide.high_pct * 100).toFixed(1)}% — where he
                sits in that is his business
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
                className="num w-20 rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm outline-none transition-colors focus:border-accent"
                aria-label="Commission percentage value"
              />
              <span className="text-xs text-faint">%</span>
              <button
                onClick={() => run(() => proposePct(neg.id, pct, neg.revision))}
                disabled={pending}
                className={cn(buttonClass.primary, "ml-auto")}
              >
                Propose <Pct value={pct} />
              </button>
            </div>
          </div>

          {counter !== null && (
            <div
              className={cn(
                "anim-slide-in flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-3",
                finalRound ? "border-warn/40 bg-warn/[0.06]" : "border-line bg-panel-2",
              )}
            >
              <div>
                <div className={cn("t-label", finalRound && "text-warn")}>
                  {finalRound ? "His final offer" : "He counters"}
                </div>
                <Pct value={counter} className="mt-0.5 block text-lg font-semibold text-fg" />
              </div>
              <div className="ml-auto flex items-center gap-2">
                {/* Push again is deliberately secondary: it is the option that
                    can end the conversation with nothing. */}
                {!finalRound && (
                  <button
                    onClick={() => run(() => proposePct(neg.id, pct, neg.revision))}
                    disabled={pending}
                    className={buttonClass.ghost}
                  >
                    Push again
                  </button>
                )}
                <button
                  onClick={() => run(() => acceptCounter(neg.id, neg.revision))}
                  disabled={pending}
                  className={buttonClass.primary}
                >
                  Take his {(counter * 100).toFixed(1)}%
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-faint">
            <RoundPips round={neg.round} maxRounds={neg.max_rounds} />
            <WalkAwayButton
              disabled={pending}
              onClick={() => run(() => abandonNegotiation(neg.id, neg.revision))}
            />
          </div>
        </>
      )}

      {terminal && <NegotiationOutcome neg={neg} onClose={onClose} />}
    </div>
  );
}
