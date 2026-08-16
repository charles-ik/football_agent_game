"use client";

// Shared pieces of the haggle UI: the running echo of hints and counters, the
// terminal outcome panel, and the deliberately small walk-away button.

import { EventList } from "@/components/event-list";
import { Money, Pct } from "@/components/money";
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
    <div className="space-y-1.5">
      {neg.history.slice(-3, -1).map((entry, index) => (
        <div key={index}>
          <OfferLine offer={entry.offer} />
          <p className="text-xs text-faint">
            Round {entry.round}: {entry.hint}
          </p>
        </div>
      ))}
      <div>
        <OfferLine offer={last.offer} />
        <p className={`text-sm ${tone}`}>
          Round {last.round}: {last.hint}
        </p>
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
  const tone =
    neg.status === "accepted"
      ? "border-good/40 text-good"
      : "border-bad/40 text-bad";
  return (
    <div className={`rounded border ${tone} bg-panel-2 px-3 py-3`}>
      {result?.message && <p className="mb-2 text-sm font-semibold">{result.message}</p>}
      {result && result.events.length > 0 && (
        <div className="mb-2 max-h-40 overflow-y-auto">
          <EventList events={result.events} />
        </div>
      )}
      <button
        onClick={onClose}
        className="mt-1 w-full rounded border border-line bg-panel px-3 py-1.5 text-sm text-fg hover:bg-panel"
      >
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
      className="text-xs text-faint underline-offset-2 hover:text-bad hover:underline disabled:opacity-50"
    >
      Walk away
    </button>
  );
}
