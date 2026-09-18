import { SceneBanner } from "@/components/scene-banner";
import { CareerPanel } from "@/components/career-panel";
import { Badge, EmptyState, Panel, ScreenHeader } from "@/components/ui";
import { getGameState } from "@/lib/api";
import { getCareers } from "@/lib/career-api";

export default async function CareersPage() {
  const [careers, game] = await Promise.all([getCareers(), getGameState()]);
  const conversations = careers.clients.reduce((sum, client) => sum + client.stories.length, 0);
  const promises = careers.clients.reduce((sum, client) => sum + client.promises.filter((promise) => promise.status === "active").length, 0);
  return (
    <div>
      <ScreenHeader title="Careers & commitments" note="Every player has a next chapter. Keep the plan clear, remember what you promised, and build a relationship that lasts." />
      <div className="mb-5"><SceneBanner image="career-tunnel" eyebrow="People behind the performances" title="A career is a shared journey." description="Understand their ambition, protect their trust, and help every player find their next chapter."/></div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Badge>Week {careers.week}</Badge><Badge tone={conversations ? "accent" : "neutral"}>{conversations} open conversations</Badge><Badge tone={promises ? "warn" : "neutral"}>{promises} active promises</Badge>
      </div>
      {careers.clients.length ? <div className="grid items-start gap-5 2xl:grid-cols-2">{careers.clients.map((client) => <CareerPanel key={client.player_id} client={client} revision={game.revision} />)}</div> : <EmptyState title="The next chapter starts with a client." hint="Sign a player to build a career plan and begin their agency story." action={{ href: "/scouting", label: "Find a client" }} />}
      <section className="mt-8" aria-labelledby="alumni-heading">
        <h2 id="alumni-heading" className="t-section mb-3">The alumni book</h2>
        {careers.alumni.length ? <div className="grid gap-3 lg:grid-cols-2">{careers.alumni.map((alumnus) => <Panel key={alumnus.player_id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{alumnus.name}</h3><Badge>Weeks {alumnus.joined_week}–{alumnus.left_week}</Badge></div>
          <p className="t-note mt-2">{alumnus.reason.replaceAll("client.", "").replaceAll("_", " ")} · Final trust {Math.round(alumnus.trust)}</p>
          <details className="mt-3"><summary className="cursor-pointer text-sm">Their time with the agency</summary><ol className="mt-3 max-h-64 space-y-2 overflow-y-auto">{[...alumnus.timeline].reverse().map((event, index) => <li key={`${index}:${event.week}`} className="border-l border-line pl-3 text-sm"><span className="text-muted">Week {event.week}</span><p className="text-dim">{event.message}</p></li>)}</ol></details>
        </Panel>)}</div> : <Panel className="p-5"><p className="t-note">Former clients will stay in this book, together with the history you built.</p></Panel>}
      </section>
    </div>
  );
}
