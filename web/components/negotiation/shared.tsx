"use client";

// Shared pieces of the haggle UI: the running echo of hints and counters, the
// terminal outcome panel, and the deliberately small walk-away button.

import { EventList } from "@/components/event-list";
import { Money, Pct } from "@/components/money";
import { buttonClass, cn } from "@/components/ui";
import type { NegotiationDTO } from "@/lib/types";

export function isTerminal(status: NegotiationDTO["status"]): boolean {
  return status === "accepted" || status === "walked" || status === "abandoned";
}

/** Renders one history entry's own offer, if it made one — a conversation
 * needs both sides on the page, not just theirs. */
function OfferLine({ offer }: { offer: NegotiationDTO["history"][number]["offer"] }) {
  if (!offer) return null;
  if ("pct" in offer) {
    return (
      <p className="text-xs text-faint">
        You proposed <Pct value={offer.pct} />
      </p>
    );
  }
  return (
    <p className="text-xs text-faint">
      You offered <Money value={offer.wage} />/wk
      {offer.fee.amount > 0 && (
        <>
          {" "}
          + <Money value={offer.fee} />
        </>
      )}
    </p>
  );
}

export function ProposalEcho({ neg }: { neg: NegotiationDTO }) {
  if (neg.history.length === 0) return null;
  const last = neg.history[neg.history.length - 1];
  const tone =
    neg.status === "walked"
      ? "text-bad"
      : neg.status === "accepted"
        ? "text-good"
        : neg.status === "exhausted"
          ? "text-warn"
          : "text-dim";
  return (
    <div className="space-y-2 rounded-lg border border-line bg-panel-2/60 px-3 py-2.5">
      {neg.history.slice(-3, -1).map((entry, index) => (
        <div key={index} className="border-l-2 border-line pl-2.5 opacity-70">
          <OfferLine offer={entry.offer} />
          <p className="text-xs text-faint">{entry.hint}</p>
        </div>
      ))}
      <div className="anim-slide-in border-l-2 border-accent/50 pl-2.5">
        <OfferLine offer={last.offer} />
        <p className={`text-sm ${tone}`}>{last.hint}</p>
      </div>
    </div>
  );
}

export function NegotiationOutcome({
  neg,
  onClose,
}: {
  neg: NegotiationDTO;
  onClose: () => void;
}) {
  const result = neg.result;
  const accepted = neg.status === "accepted";
  return (
    <div
      className={cn(
        "anim-rise rounded-lg border px-4 py-3.5",
        accepted ? "border-good/40 bg-good/[0.06]" : "border-bad/40 bg-bad/[0.06]",
      )}
    >
      <p className={cn("t-label mb-1.5", accepted ? "text-good" : "text-bad")}>
        {accepted ? "Done" : neg.status === "walked" ? "They walked" : "Talks over"}
      </p>
      {result?.message && (
        <p className={cn("text-sm font-medium", accepted ? "text-good" : "text-bad")}>
          {result.message}
        </p>
      )}
      {result && result.events.length > 0 && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-line bg-panel p-1">
          <EventList events={result.events} />
        </div>
      )}
      <button onClick={onClose} className={cn(buttonClass.secondary, "mt-3 w-full")}>
        Close
      </button>
    </div>
  );
}

/** Rounds as filled pips — three dots that fill in read faster mid-haggle
 * than "Round 1 of 3" ever will, because the round count is genuinely a
 * countdown to the walk-away risk, not decorative sequencing. */
export function RoundPips({ round, maxRounds }: { round: number; maxRounds: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="sr-only">
        Round {round} of {maxRounds}
      </span>
      <span className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: maxRounds }, (_, index) => (
          <span
            key={index}
            className={`h-1.5 w-1.5 rounded-full ${
              index < round ? "bg-accent" : "border border-line bg-transparent"
            }`}
          />
        ))}
      </span>
      <span className="num text-faint" aria-hidden>
        {round}/{maxRounds}
      </span>
    </span>
  );
}

export function WalkAwayButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={buttonClass.danger}
    >
      Walk away
    </button>
  );
}
