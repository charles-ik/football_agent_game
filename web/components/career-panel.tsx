"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Panel, buttonClass } from "@/components/ui";
import { expansionAction } from "@/lib/actions";
import type { ClientCareer } from "@/lib/career-api";

function statusTone(status: string): "good" | "warn" | "neutral" {
  if (status === "completed" || status === "fulfilled") return "good";
  return status === "active" ? "warn" : "neutral";
}

export function CareerPanel({ client, revision }: { client: ClientCareer; revision: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null);
  const goal = client.goal;
  const progress = goal ? Math.max(0, Math.min(100, goal.progress / Math.max(1, goal.target) * 100)) : 0;

  function respond(storyId: string, optionId: string) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await expansionAction("careers", "respond", { story_id: storyId, option_id: optionId }, revision);
        setFeedback({ message: result.message, ok: result.ok });
        router.refresh();
      } catch (error) {
        setFeedback({ message: error instanceof Error ? error.message : "The conversation could not be saved. Please try again.", ok: false });
      }
    });
  }

  return (
    <Panel as="article" className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel-2/60 px-5 py-4">
        <div>
          <p className="t-note mb-1 uppercase tracking-widest">Client dossier · <span className="capitalize">{client.trait}</span></p>
          <h2 className="t-section text-lg"><Link className="hover:text-accent hover:underline" href={`/clients/${client.player_id}`}>{client.name}</Link></h2>
        </div>
        <Badge tone={client.trust >= 60 ? "good" : "warn"}>Trust {Math.round(client.trust)} / 100</Badge>
      </header>
      <div className="space-y-5 p-5">
        {goal ? (
          <section aria-label="Career goal" className="border-l-2 border-accent pl-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="t-note">Career goal</p><h3 className="mt-1 font-medium">{goal.title}</h3></div>
              <Badge tone={statusTone(goal.status)}>{goal.status}</Badge>
            </div>
            <progress className="mt-3 h-2 w-full accent-accent" value={progress} max={100} aria-label={`${goal.title} progress`} />
            <p className="t-note mt-1">{goal.kind === "wages" ? `£${Math.round(goal.progress).toLocaleString()} / £${Math.round(goal.target).toLocaleString()} per week` : `${goal.progress} / ${goal.target}${["playing_time", "loyalty"].includes(goal.kind) ? " weeks" : " milestones"}`} · Due week {goal.deadline_week}</p>
          </section>
        ) : <p className="t-note">A new career goal will be agreed at the next weekly review.</p>}

        {client.promises.length > 0 && <section aria-label="Promises"><h3 className="t-section mb-2">Your word</h3><div className="space-y-2">{client.promises.map((promise) => (
          <div key={promise.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel-2/50 p-3 text-sm">
            <span>Find a move <span className="text-muted">· promised week {promise.created_week}, due week {promise.deadline_week}</span></span>
            <Badge tone={statusTone(promise.status)}>{promise.status}</Badge>
          </div>
        ))}</div></section>}

        {client.stories.length > 0 && <section aria-label="Career conversations" className="space-y-3">{client.stories.map((story) => (
          <div key={story.id} className="rounded-lg border border-accent/30 bg-accent/5 p-4">
            <p className="t-note mb-1">Conversation · week {story.created_week}</p>
            <h3 className="font-medium">{story.title}</h3>
            <p className="mt-2 text-sm text-dim">{story.body}</p>
            <div className="mt-4 grid gap-2">{story.options.map((option) => (
              <div key={option.id} className="rounded border border-line bg-panel p-3">
                <button type="button" disabled={pending} className={`${buttonClass.secondary} max-w-full whitespace-normal text-left`} onClick={() => respond(story.id, option.id)}>{pending ? "Saving…" : option.label}</button>
                <p className="t-note mt-2">{option.consequence}</p>
              </div>
            ))}</div>
          </div>
        ))}</section>}
        {feedback && <p role={feedback.ok ? "status" : "alert"} className={`text-sm ${feedback.ok ? "text-good" : "text-bad"}`}>{feedback.message}</p>}
        {client.trust_explanation.length > 0 && <section aria-label="Trust explanation"><h3 className="t-section mb-2">What shaped the relationship</h3><ul className="space-y-1 text-sm text-dim">{client.trust_explanation.map((reason, index) => <li key={`${index}:${reason}`}>{reason}</li>)}</ul></section>}
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-accent">Career timeline <span className="text-muted">({client.timeline.length})</span></summary>
          <ol className="mt-3 max-h-80 space-y-3 overflow-y-auto pl-1">{[...client.timeline].reverse().map((event, index) => (
            <li key={`${index}:${event.week}:${event.kind}`} className="border-l border-line pl-3 text-sm"><span className="t-note">Week {event.week}</span><p className="mt-0.5 text-dim">{event.message}{event.trust_delta !== 0 && <span className={event.trust_delta > 0 ? "text-good" : "text-warn"}> · Trust {event.trust_delta > 0 ? "+" : ""}{event.trust_delta}</span>}</p></li>
          ))}</ol>
        </details>
      </div>
    </Panel>
  );
}
