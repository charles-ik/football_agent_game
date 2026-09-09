"use client";

// Continue is the game. One press is one week, it cannot be undone, and it is
// the only control that is reachable from every screen.
//
// It renders in two places depending on the viewport — anchored in the week
// rail on wide screens, floating bottom-right when the rail is hidden — so it
// listens for a window event rather than exposing an id for the keyboard
// handler to click. Two instances can exist in the DOM at once and only one is
// visible; an id-based handler would fire the wrong one.

import { useCallback, useEffect, useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { EventList, sortBySeverity } from "@/components/event-list";
import { useToast } from "@/components/toaster";
import { cn } from "@/components/ui";
import { continueWeek } from "@/lib/actions";
import type { EventDTO } from "@/lib/types";

export const CONTINUE_EVENT = "fa:continue";

export function ContinueButton({
  pending,
  variant = "floating",
}: {
  pending: number;
  variant?: "floating" | "rail";
}) {
  const [inFlight, startTransition] = useTransition();
  const [summary, setSummary] = useState<EventDTO[] | null>(null);
  const { toast } = useToast();

  const press = useCallback(() => {
    startTransition(async () => {
      try {
        const result = await continueWeek();
        setSummary(result.notable);
      } catch (error) {
        toast(error instanceof Error ? error.message : "Something broke.", "bad");
      }
    });
  }, [toast]);

  // Only the visible instance responds, so the hidden one never double-ticks.
  useEffect(() => {
    const onRequest = () => {
      const el = document.querySelector<HTMLElement>(`[data-continue="${variant}"]`);
      if (!el || el.offsetParent === null) return; // hidden by a media query
      if (!inFlight) press();
    };
    window.addEventListener(CONTINUE_EVENT, onRequest);
    return () => window.removeEventListener(CONTINUE_EVENT, onRequest);
  }, [press, inFlight, variant]);

  const button = (
    <button
      data-continue={variant}
      onClick={press}
      disabled={inFlight}
      aria-label={
        pending > 0
          ? `Continue to next week. ${pending} decisions still waiting.`
          : "Continue to next week"
      }
      className={cn(
        "group flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-semibold text-ink shadow-lg shadow-accent/20 transition-all",
        "hover:bg-accent/90 hover:shadow-accent/30 active:scale-[0.99]",
        "disabled:cursor-wait disabled:opacity-60",
        variant === "rail" ? "w-full" : "",
      )}
    >
      {inFlight ? (
        <Loader2 size={16} className="animate-spin" aria-hidden />
      ) : (
        <ArrowRight size={16} aria-hidden />
      )}
      {inFlight ? "Running the week…" : "Continue"}
      <kbd className="rounded border border-ink/25 px-1 text-[10px] font-medium opacity-70">C</kbd>
    </button>
  );

  return (
    <>
      {/* The week just gone. Dismissed by hand rather than on a timer — it is
          the only record of what your press actually caused. */}
      {summary && summary.length > 0 && (
        <div
          role="region"
          aria-label="The week that was"
          className={cn(
            "anim-rise z-40 overflow-hidden rounded-lg border border-line bg-panel shadow-2xl shadow-black/60",
            variant === "rail"
              ? "absolute bottom-[4.5rem] left-3 right-3 max-h-[60vh] overflow-y-auto"
              : "fixed bottom-20 right-4 max-h-[60vh] w-[22rem] overflow-y-auto",
          )}
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-3 py-2">
            <span className="t-label">The week that was</span>
            <button
              onClick={() => setSummary(null)}
              className="rounded px-1.5 py-0.5 text-xs text-faint transition-colors hover:bg-panel-2 hover:text-fg"
            >
              Dismiss
            </button>
          </div>
          <div className="p-1">
            <EventList events={sortBySeverity(summary)} />
          </div>
        </div>
      )}

      {variant === "rail" ? (
        <div className="relative">
          {pending > 0 && (
            <p className="mb-2 text-center text-[11px] text-warn">
              <span className="num">{pending}</span>{" "}
              {pending === 1 ? "decision is" : "decisions are"} still open.
            </p>
          )}
          {button}
        </div>
      ) : (
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 xl:hidden">
          {pending > 0 && (
            <span className="num rounded-full border border-warn/40 bg-panel px-2.5 py-1 text-xs text-warn shadow-lg">
              {pending} open
            </span>
          )}
          {button}
        </div>
      )}
    </>
  );
}
