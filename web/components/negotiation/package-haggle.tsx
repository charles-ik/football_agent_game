"use client";

// Package haggle — club deals. Wage and fee inputs with the club's ceilings
// marked and the guide band shaded; the fee hidden for renewals and free
// agents. Before the package can be submitted, /assess shows how the client
// will take it — visible in the same glance as the Submit button, because
// that is what converts the greedy deal from a trap into a choice.

import { useEffect, useState, useTransition } from "react";

import { Money } from "@/components/money";
import { useToast } from "@/components/toaster";
import {
  abandonNegotiation,
  acceptCounter,
  assessDeal,
  proposePackage,
} from "@/lib/actions";
import type { AssessResponse, Money as MoneyValue, NegotiationDTO } from "@/lib/types";

import { NegotiationOutcome, ProposalEcho, RoundPips, WalkAwayButton, isTerminal } from "./shared";

type PackageGuide = { low_wage: MoneyValue; high_wage: MoneyValue; low_fee: MoneyValue; high_fee: MoneyValue };
type PackageBounds = { max_wage: MoneyValue; max_fee: MoneyValue; asking_price: MoneyValue };

export function PackageHaggle({
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
  const guide = neg.guide as PackageGuide;
  const bounds = neg.bounds as PackageBounds;
  const context = neg.context as {
    is_renewal?: boolean;
    years?: number;
    player?: { club_id: number | null; name?: string };
    club?: { name?: string; strength?: number; prestige?: number };
  };
  const isRenewal = Boolean(context.is_renewal);
  const isFreeAgent = context.player?.club_id == null;
  const feeHidden = isRenewal || isFreeAgent;

  const [wage, setWage] = useState<number>(guide.low_wage.amount);
  const [fee, setFee] = useState<number>(guide.low_fee.amount);
  const [assessment, setAssessment] = useState<AssessResponse | null>(null);

  const terminal = isTerminal(neg.status);
  const finalRound = neg.status === "exhausted";
  const counter = neg.counter && "wage" in neg.counter ? neg.counter : null;

  // Assess before submitting: refresh the verdict as the wage changes.
  useEffect(() => {
    if (terminal) return;
    const timer = setTimeout(() => {
      assessDeal(neg.id, wage)
        .then(setAssessment)
        .catch(() => setAssessment(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [wage, neg.id, neg.round, terminal]);

  const run = (fn: () => Promise<NegotiationDTO>) =>
    startTransition(async () => {
      try {
        onUpdate(await fn());
      } catch (error) {
        toast(error instanceof Error ? error.message : "Something broke.", "bad");
      }
    });

  return (
    <div className="space-y-4">
      {/* Opening panel: the club, the ceilings, the asking price, the warning. */}
      <div className="rounded border border-line bg-panel-2 px-3 py-2 text-xs text-dim">
        <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-fg">{neg.subject}</span>
          <span>
            for {context.player?.name ?? "your client"} · {context.years ?? 3} years
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span>
            wage ceiling <Money value={bounds.max_wage} className="text-fg" />/wk
          </span>
          {!feeHidden && (
            <span>
              fee ceiling <Money value={bounds.max_fee} className="text-fg" />
            </span>
          )}
          {!feeHidden && (
            <span>
              asking price <Money value={bounds.asking_price} className="text-fg" />
            </span>
          )}
        </div>
        <p className="mt-2 text-warn">
          One negotiation per approach — naming a number spends it.
        </p>
      </div>

      <ProposalEcho neg={neg} />

      {!terminal && (
        <>
          <div className="space-y-3">
            <PackageInput
              label="Wage / week"
              value={wage}
              onChange={setWage}
              ceiling={bounds.max_wage.amount}
              guideLow={guide.low_wage.amount}
              guideHigh={guide.high_wage.amount}
            />
            {!feeHidden && (
              <PackageInput
                label="Transfer fee"
                value={fee}
                onChange={setFee}
                ceiling={bounds.max_fee.amount}
                guideLow={guide.low_fee.amount}
                guideHigh={guide.high_fee.amount}
                floor={bounds.asking_price.amount}
              />
            )}
          </div>

          {/* The verdict, in the same glance as Submit. */}
          <div className="rounded border border-line bg-panel-2 px-3 py-2 text-sm">
            {assessment ? (
              <span className={assessment.trust_delta < 0 ? "text-warn" : "text-good"}>
                {assessment.verdict}{" "}
                <span className="num text-faint">
                  (trust {assessment.trust_delta >= 0 ? "+" : ""}
                  {assessment.trust_delta.toFixed(0)})
                </span>
              </span>
            ) : (
              <span className="text-faint">Reading his mood…</span>
            )}
          </div>

          {counter && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-panel-2 px-3 py-2 text-sm">
              <span className="text-dim">
                {finalRound ? "Final offer: " : "They counter with "}
                <Money value={counter.wage} className="font-semibold text-fg" />/wk
                {!feeHidden && counter.fee.amount > 0 && (
                  <>
                    {" "}+ <Money value={counter.fee} className="font-semibold text-fg" />
                  </>
                )}
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => run(() => acceptCounter(neg.id))}
                  disabled={pending}
                  className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:bg-accent/90 disabled:opacity-50"
                >
                  Take their terms
                </button>
                {!finalRound && (
                  <button
                    onClick={() => run(() => proposePackage(neg.id, wage, fee))}
                    disabled={pending}
                    className="rounded border border-line px-3 py-1.5 text-sm text-dim hover:bg-panel disabled:opacity-50"
                  >
                    Push again
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-faint">
              <RoundPips round={neg.round} maxRounds={neg.max_rounds} />
            </span>
            <div className="flex items-center gap-3">
              <WalkAwayButton
                disabled={pending}
                onClick={() => run(() => abandonNegotiation(neg.id))}
              />
              <button
                onClick={() => run(() => proposePackage(neg.id, wage, fee))}
                disabled={pending}
                className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-ink hover:bg-accent/90 disabled:opacity-50"
              >
                Submit the package
              </button>
            </div>
          </div>
        </>
      )}

      {terminal && <NegotiationOutcome neg={neg} onClose={onClose} />}
    </div>
  );
}

function PackageInput({
  label,
  value,
  onChange,
  ceiling,
  guideLow,
  guideHigh,
  floor = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  ceiling: number;
  guideLow: number;
  guideHigh: number;
  floor?: number;
}) {
  const max = Math.max(ceiling, 1);
  const marker = Math.max(0, Math.min(100, (value / max) * 100));
  const bandLeft = Math.max(0, Math.min(100, (guideLow / max) * 100));
  const bandWidth = Math.max(0, Math.min(100 - bandLeft, ((guideHigh - guideLow) / max) * 100));
  const floorAt = floor > 0 ? Math.max(0, Math.min(100, (floor / max) * 100)) : null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-dim">
        <span>{label}</span>
        <span className="num text-faint">
          guide {(guideLow / 1000).toFixed(0)}k–{(guideHigh / 1000).toFixed(0)}k · ceiling{" "}
          {(ceiling / 1000).toFixed(0)}k
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={0}
          step={label.startsWith("Wage") ? 10 : 1000}
          value={Math.round(value)}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) onChange(Math.max(0, next));
          }}
          className="num w-28 rounded border border-line bg-panel-2 px-2 py-1 text-sm outline-none focus:border-accent"
          aria-label={label}
        />
        <div className="relative h-2 flex-1 rounded bg-panel-2">
          <div
            className="absolute h-2 rounded bg-accent/25"
            style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          />
          {floorAt !== null && (
            <div
              className="absolute h-2 w-0.5 bg-warn"
              style={{ left: `${floorAt}%` }}
              title="Asking price"
            />
          )}
          <div
            className="absolute h-2 w-0.5 bg-fg"
            style={{ left: `${marker}%` }}
          />
        </div>
      </div>
    </div>
  );
}
