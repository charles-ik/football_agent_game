"use client";

// Package haggle — club deals. Wage and fee inputs with the club's ceilings
// marked and the guide band shaded; the fee hidden for renewals and free
// agents. Before the package can be submitted, /assess shows how the client
// will take it — visible in the same glance as the Submit button, because
// that is what converts the greedy deal from a trap into a choice.

import { useEffect, useState, useTransition } from "react";

import { Money } from "@/components/money";
import { useToast } from "@/components/toaster";
import { buttonClass, cn } from "@/components/ui";
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
      <div className="rounded-lg border border-line bg-panel-2 px-3.5 py-3">
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-fg">{neg.subject}</span>
          <span className="text-xs text-dim">
            for {context.player?.name ?? "your client"} · {context.years ?? 3} years
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="t-label">Wage ceiling</dt>
            <dd className="mt-0.5 text-sm">
              <Money value={bounds.max_wage} className="text-fg" />
              <span className="text-faint">/wk</span>
            </dd>
          </div>
          {!feeHidden && (
            <div>
              <dt className="t-label">Fee ceiling</dt>
              <dd className="mt-0.5 text-sm">
                <Money value={bounds.max_fee} className="text-fg" />
              </dd>
            </div>
          )}
          {!feeHidden && (
            <div>
              <dt className="t-label">Asking price</dt>
              <dd className="mt-0.5 text-sm">
                <Money value={bounds.asking_price} className="text-fg" />
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-xs text-warn">
          One negotiation per approach — naming a number spends it, and a walk-away cannot be
          re-rolled.
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

          {/* The verdict, in the same glance as Submit. This is not decoration:
              it is the thing that turns the greedy deal from a trap into an
              informed choice, so it must never be somewhere you can miss it. */}
          <div
            className={cn(
              "rounded-lg border px-3.5 py-2.5",
              !assessment
                ? "border-line bg-panel-2"
                : assessment.trust_delta < 0
                  ? "border-warn/40 bg-warn/[0.06]"
                  : "border-good/35 bg-good/[0.06]",
            )}
          >
            <div className="t-label mb-1">How he will take it</div>
            {assessment ? (
              <p
                className={cn(
                  "text-sm",
                  assessment.trust_delta < 0 ? "text-warn" : "text-good",
                )}
              >
                {assessment.verdict}{" "}
                <span className="num text-faint">
                  (trust {assessment.trust_delta >= 0 ? "+" : ""}
                  {assessment.trust_delta.toFixed(0)})
                </span>
              </p>
            ) : (
              <p className="text-sm text-faint">Reading his mood…</p>
            )}
          </div>

          {counter && (
            <div
              className={cn(
                "anim-slide-in flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-3",
                finalRound ? "border-warn/40 bg-warn/[0.06]" : "border-line bg-panel-2",
              )}
            >
              <div>
                <div className={cn("t-label", finalRound && "text-warn")}>
                  {finalRound ? "Their final offer" : "They counter"}
                </div>
                <p className="mt-0.5 text-lg font-semibold">
                  <Money value={counter.wage} className="text-fg" />
                  <span className="text-sm text-faint">/wk</span>
                  {!feeHidden && counter.fee.amount > 0 && (
                    <>
                      <span className="text-sm text-faint"> + </span>
                      <Money value={counter.fee} className="text-fg" />
                    </>
                  )}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {!finalRound && (
                  <button
                    onClick={() => run(() => proposePackage(neg.id, wage, fee))}
                    disabled={pending}
                    className={buttonClass.ghost}
                  >
                    Push again
                  </button>
                )}
                <button
                  onClick={() => run(() => acceptCounter(neg.id))}
                  disabled={pending}
                  className={buttonClass.primary}
                >
                  Take their terms
                </button>
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
                className={buttonClass.primary}
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
      <div className="mb-1.5 flex items-center justify-between">
        <span className="t-label">{label}</span>
        <span className="num text-[11px] text-faint">
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
          className="num w-28 rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm outline-none transition-colors focus:border-accent"
          aria-label={label}
        />
        <div className="relative h-2 flex-1 rounded-full border border-line/70 bg-panel-2">
          <div
            className="absolute h-full rounded-full bg-accent/25"
            style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          />
          {floorAt !== null && (
            <div
              className="absolute h-full w-0.5 bg-warn"
              style={{ left: `${floorAt}%` }}
              title="Asking price — below this the selling club says no"
            />
          )}
          <div
            className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-fg transition-[left] duration-150"
            style={{ left: `${marker}%` }}
          />
        </div>
      </div>
    </div>
  );
}
