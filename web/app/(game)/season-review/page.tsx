import Link from "next/link";
import { Check, Flag, LockKeyhole, Trophy } from "lucide-react";
import { PanelSection, ScreenHeader } from "@/components/ui";
import { SeasonObjective } from "@/components/season-objective";
import { getManagement } from "@/lib/management-api";

const milestones = [
  { id: "first_signing", title: "A name to believe in", detail: "Sign your first new client from a scouting report.", href: "/scouting", action: "Explore your reports" },
  { id: "first_deal", title: "Business is underway", detail: "Complete a client deal. Your first deal unlocks agency specialization.", href: "/market", action: "Find the right move" },
  { id: "expansion", title: "Room for ambition", detail: "Upgrade headquarters to unlock more clients, scouts and support staff.", href: "/headquarters", action: "Review your next premises" },
  { id: "top_tier", title: "On the biggest stage", detail: "Sign a top-tier client or complete a deal that takes a client into the top tier.", href: "/market", action: "Explore the market" },
];

export default async function SeasonReviewPage() {
  const management = await getManagement();
  const earned = Object.keys(management.milestones).length;
  return <div className="space-y-5">
    <ScreenHeader title="The agency record" note="Every agency starts with one person and a phone call. This is the story you’re building." />
    <PanelSection title="Your next chapter" actions={<Flag size={18} className="text-accent"/>}><SeasonObjective objective={management.objective}/></PanelSection>
    <PanelSection title="Milestone wall" note="A path from your first signing to the biggest stage. Milestones are recorded when you advance the week." actions={<span className="num text-sm text-accent">{earned} / {milestones.length}</span>}>
      <div className="grid gap-3 2xl:grid-cols-2">{milestones.map(milestone => {
        const week = management.milestones[milestone.id];
        const achieved = week !== undefined;
        const Icon = achieved ? Trophy : LockKeyhole;
        return <article key={milestone.id} className={`rounded-lg border p-4 ${achieved ? "border-accent/50 bg-accent/5" : "border-line bg-panel-2/40"}`}>
          <div className="flex items-center justify-between gap-2"><Icon size={21} className={achieved ? "text-accent" : "text-faint"}/><span className="t-label">{achieved ? `Achieved · Week ${week}` : "Still to come"}</span></div>
          <h3 className="office-title mt-4 text-2xl">{milestone.title}</h3><p className="mt-2 text-sm text-dim">{milestone.detail}</p>
          {achieved ? <p className="mt-4 flex items-center gap-1 text-xs text-accent"><Check size={14}/> Part of your agency’s story</p> : <Link href={milestone.href} className="mt-4 inline-block text-sm text-accent hover:underline">{milestone.action} ↗</Link>}
        </article>;
      })}</div>
    </PanelSection>
    <PanelSection title="Season reviews" note="Each completed season adds its objective result here.">
      {!management.reviews.length ? <p className="text-sm text-dim">Your first review arrives at the start of the next season. There’s still time to make this one count.</p> : <div className="divide-y divide-line">{[...management.reviews].reverse().map(review => <article key={review.season} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="t-label">Season {review.season}</p><h2 className="mt-1 text-lg capitalize">{review.objective}</h2></div><div className="text-right"><p className={review.completed ? "text-good" : "text-dim"}>{review.completed ? "Objective achieved" : "Objective unfinished"}</p><p className="t-note">{review.progress} / {review.target}</p></div></article>)}</div>}
    </PanelSection>
    <Link href="/agency" className="text-sm text-accent underline underline-offset-4">Manage this season’s objective →</Link>
  </div>;
}
