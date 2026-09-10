import Link from "next/link";
import { PanelSection, ScreenHeader } from "@/components/ui";
import { getManagement } from "@/lib/management-api";

export default async function SeasonReviewPage() {
  const management = await getManagement();
  return <div className="space-y-5">
    <ScreenHeader title="The agency record" note="The seasons, breakthroughs and decisions that built your agency." />
    <PanelSection title="Season reviews" note="Each completed season adds its objective result here.">
      {!management.reviews.length ? <p className="text-sm text-dim">Your first review arrives at the start of the next season. This season’s ambition is {management.objective.id}: {management.objective.progress} / {management.objective.target}.</p> : <div className="divide-y divide-line">{[...management.reviews].reverse().map(review => <article key={review.season} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="t-label">Season {review.season}</p><h2 className="mt-1 text-lg capitalize">{review.objective}</h2></div><div className="text-right"><p className={review.completed ? "text-good" : "text-dim"}>{review.completed ? "Objective achieved" : "Objective unfinished"}</p><p className="t-note">{review.progress} / {review.target}</p></div></article>)}</div>}
    </PanelSection>
    <PanelSection title="Milestone wall">
      {!Object.keys(management.milestones).length ? <p className="text-sm text-dim">Your next signing, completed deal or headquarters expansion can begin the record. New milestones appear here as your agency grows.</p> : <div className="grid gap-3 sm:grid-cols-2">{Object.entries(management.milestones).map(([id,week]) => <article key={id} className="border-l-2 border-accent bg-panel-2 p-4"><p className="t-label">Week {week}</p><h3 className="mt-1 capitalize">{id.replaceAll("_", " ")}</h3></article>)}</div>}
    </PanelSection>
    <Link href="/agency" className="text-sm text-accent underline underline-offset-4">Manage this season’s objective →</Link>
  </div>;
}
