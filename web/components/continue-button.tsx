"use client";

// The Continue button is the game: primary, always reachable, badged with the
// pending-decision count so pressing it while a club is waiting feels like a
// choice. Disabled while in flight — a double-press is two weeks and there is
// no undo. The week summary panel dismisses on click.

import { useState, useTransition } from "react";

import { EventList, sortBySeverity } from "@/components/event-list";
import { useToast } from "@/components/toaster";
import { continueWeek } from "@/lib/actions";
import type { EventDTO } from "@/lib/types";

export function ContinueButton({ pending }: { pending: number }) {
  const [inFlight, startTransition] = useTransition();
  const [summary, setSummary] = useState<EventDTO[] | null>(null);
  const { toast } = useToast();

  const press = () => {
    startTransition(async () => {
      try {
        const result = await continueWeek();
        setSummary(result.notable);
      } catch (error) {
        toast(error instanceof Error ? error.message : "Something broke.", "bad");
      }
    });
  };

  return (
    <>
      {summary && summary.length > 0 && (
        <div
          role="region"
          aria-label="Week summary"
          className="fixed bottom-20 right-4 z-30 w-96 rounded border border-line bg-panel p-3 shadow-2xl shadow-black/60"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-faint">
              The week that was
            </span>
            <button
              onClick={() => setSummary(null)}
              className="rounded px-1.5 py-0.5 text-xs text-faint hover:bg-panel-2 hover:text-fg"
            >
              Dismiss
            </button>
          </div>
          <EventList events={sortBySeverity(summary)} />
        </div>
      )}
      <button
        id="continue-button"
        onClick={press}
        disabled={inFlight}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded border border-accent/40 bg-accent px-5 py-2.5 font-semibold text-ink shadow-lg shadow-black/50 transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {inFlight ? "…" : "Continue"}
        {pending > 0 && (
          <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-accent">
            {pending} need{pending === 1 ? "s" : ""} you
          </span>
        )}
        <kbd className="rounded border border-ink/30 px-1 text-[10px]">C</kbd>
      </button>
    </>
  );
}
