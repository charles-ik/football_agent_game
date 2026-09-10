"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, ListTodo, FastForward } from "lucide-react";
import { EventList, sortBySeverity } from "@/components/event-list";
import { DecisionList } from "@/components/decision-list";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toaster";
import { buttonClass, cn } from "@/components/ui";
import { continueWeek } from "@/lib/actions";
import type { Decision, EventDTO } from "@/lib/types";

export const CONTINUE_EVENT = "fa:continue";
// The two responsive controls share one synchronous guard, including during resize.
let advancing = false;
export function ContinueButton({ pending, revision, decisions = [], variant = "floating" }: {
  pending: number; revision: number; decisions?: Decision[]; variant?: "floating" | "rail";
}) {
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [review, setReview] = useState(false);
  const [summary, setSummary] = useState<EventDTO[]>([]);
  const [status, setStatus] = useState("");
  const cancel = useRef(false);
  const { toast } = useToast();

  const press = useCallback(async (auto = false) => {
    if (advancing) return;
    advancing = true; cancel.current = false; setBusy(true); setAutomatic(auto);
    let expected = revision;
    const skipped = new Set(decisions.map(d => d.id));
    const events: EventDTO[] = [];
    try {
      for (let n = 0; n < (auto ? 12 : 1); n++) {
        if (cancel.current) break;
        const result = await continueWeek(expected, crypto.randomUUID());
        expected = result.state.revision;
        events.push(...result.notable);
        setSummary([...events]);
        setStatus(`${n + 1} ${n === 0 ? "week" : "weeks"} advanced`);
        if (result.state.game_over || result.open_decision_ids.some(id => !skipped.has(id)) || result.notable.some(e =>
          ["critical", "action", "warning"].includes(e.severity) ||
          ["window.opened", "window.closed", "client.injured", "client.recovered", "season.started"].includes(e.kind)
        )) break;
      }
    } catch (error) { toast(error instanceof Error ? error.message : "The week could not be advanced.", "bad"); }
    finally { advancing = false; setBusy(false); setAutomatic(false); }
  }, [revision, toast, decisions]);

  useEffect(() => {
    const onRequest = () => {
      const el = document.querySelector<HTMLElement>(`[data-continue="${variant}"]`);
      if (el && el.offsetParent !== null && !advancing) void press();
    };
    window.addEventListener(CONTINUE_EVENT, onRequest);
    return () => window.removeEventListener(CONTINUE_EVENT, onRequest);
  }, [press, variant]);
  useEffect(() => {
    const stop = () => {cancel.current = true;};
    window.addEventListener("resize", stop);
    return () => {stop();window.removeEventListener("resize", stop);};
  }, []);

  return <>
    <div className={cn(variant === "rail" ? "space-y-2" : "fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-panel/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur xl:hidden")}>
      <div className="flex items-center gap-2">
        <button onClick={() => setReview(true)} className={cn(buttonClass.secondary, "flex items-center gap-2")} aria-label={`Review ${pending} decisions`}>
          <ListTodo size={16}/><span>{pending} open</span>
        </button>
        <button data-continue={variant} disabled={busy} onClick={() => void press()} className={cn(buttonClass.primary, "flex flex-1 items-center justify-center gap-2 py-3")} aria-label="Continue to next week">
          {busy ? <Loader2 size={16} className="animate-spin"/> : <ArrowRight size={16}/>}{busy ? "Advancing…" : "Continue"}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {automatic ? <button className="text-sm text-warn" onClick={() => {cancel.current = true; setStatus("Stopping after this week…");}}>Stop advancing</button> :
          <button disabled={busy} onClick={() => pending > 0 ? setReview(true) : void press(true)} className="flex items-center gap-1 text-xs text-dim hover:text-fg"><FastForward size={13}/>To next event</button>}
        <span role="status" className="text-xs text-faint">{status || "One turn · one week"}</span>
        {summary.length > 0 && <button onClick={() => setStatus(status === "briefing" ? "" : "briefing")} className="text-xs text-accent">Briefing</button>}
      </div>
    </div>
    <Dialog open={review} onClose={() => setReview(false)} title="This week · your decisions" wide>
      <DecisionList decisions={decisions} onSelect={() => setReview(false)} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={buttonClass.secondary} onClick={() => setReview(false)}>Keep managing</button>
        <button className={buttonClass.primary} onClick={() => void press(true)}>Skip these and advance to next event</button>
      </div>
      <p className="t-note mt-2">Deadlines still apply. Advancement stops at the next important event, or after 12 weeks.</p>
    </Dialog>
    {summary.length > 0 && status === "briefing" && <Dialog open onClose={() => setStatus("")} title="The week that was" wide><EventList events={sortBySeverity(summary)}/></Dialog>}
  </>;
}
