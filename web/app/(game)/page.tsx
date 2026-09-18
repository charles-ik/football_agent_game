import Link from "next/link";
import { ArrowUpRight, Flag, Trophy, Users } from "lucide-react";
import { SeasonObjective } from "@/components/season-objective";
import { OfficeScene } from "@/components/office-scene";
import { Panel, PanelSection, Badge, StatTile } from "@/components/ui";
import { getGameState, getClients, getInbox, getScouting } from "@/lib/api";
import { getManagement } from "@/lib/management-api";
import { Money } from "@/components/money";
import { EventList } from "@/components/event-list";
import { DecisionList } from "@/components/decision-list";

export default async function OfficePage() {
 const [game,agency,clients,inbox,scouting] = await Promise.all([getGameState(),getManagement(),getClients(),getInbox(),getScouting()]);
 const objective=agency.objective;
 const next = scouting.scouts.some(s=>!s.region_id) ? {title:"Send your scout out",body:"Choose a region and a brief. The first good career starts with a name on your desk.",href:"/scouting"} : scouting.reports.length===0 ? {title:"Let the scouting begin",body:"Advance a week to receive reports. Scout quality and regional coverage shape what you learn.",href:"/scouting"} : game.agency.total_commission.amount===0 ? {title:"Build your first deal",body:"Read your client's situation, compare opportunities and choose a club where they can thrive.",href:"/market"} : {title:"Choose your next investment",body:"Grow your team, improve a department or build the relationships behind the next big move.",href:"/agency"};
 return <div className="space-y-5">
   <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="t-label text-accent">The agency life · Season {game.calendar.season}</p><h1 className="office-title mt-1 text-4xl">Welcome to the office.</h1><p className="mt-2 text-sm text-dim">{game.agency.name} · {game.agency.hq_name}</p></div><Link href="/overview" className="flex items-center gap-1 text-xs text-dim hover:text-fg">Agency overview <ArrowUpRight size={14}/></Link></header>
   <OfficeScene name={game.agency.name} level={game.agency.hq_level} people={agency.staff.length+scouting.scouts.length} milestones={Object.keys(agency.milestones).length}/>
   <section className="grid grid-cols-2 gap-3 2xl:grid-cols-4"><StatTile label="Agency balance" value={<Money value={game.agency.cash}/>}/><StatTile label="Weekly operations" value={<Money value={game.weekly_net} signed/>} tone={game.weekly_net.amount<0?"warn":"good"}/><StatTile label="Careers in your hands" value={`${clients.length} / ${game.counts.client_cap}`}/><StatTile label="Your standing" value={game.agency.reputation_label}/></section>
   <div className="grid gap-4 2xl:grid-cols-2">
    <PanelSection title="Your next chapter" actions={<Flag size={16} className="text-accent"/>}><SeasonObjective objective={objective}/></PanelSection>
    <Link href={next.href}><Panel className="h-full bg-panel-2 p-5 transition hover:border-accent/50"><p className="t-label text-accent">Make your next move</p><h2 className="office-title mt-2 text-2xl">{next.title}</h2><p className="mt-2 text-sm leading-relaxed text-dim">{next.body}</p><ArrowUpRight size={18} className="mt-3 text-accent"/></Panel></Link>
    <PanelSection title="People before paperwork" actions={<Users size={16}/>}>{clients.slice(0,4).map(c=><Link key={c.player.id} href={`/clients/${c.player.id}`} className="flex items-center gap-3 border-b border-line/60 py-3 last:border-0"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-panel-3 font-serif text-lg text-accent">{c.player.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.player.name}</span><span className="text-xs text-dim">{c.club_name} · {c.playing_time}</span></span><Badge tone={c.trust<40?"bad":c.trust<60?"warn":"good"}>{c.trust_label}</Badge></Link>)}{clients.length===0&&<p className="t-note">Your next client is waiting to be discovered. Visit the scouting room.</p>}<Link href="/careers" className="mt-3 inline-block text-xs text-accent">Client goals & conversations ↗</Link></PanelSection>
    <PanelSection title="Around the agency" actions={<Trophy size={16}/>}>{inbox.recent.length?<EventList events={inbox.recent.slice(0,5)}/>:<p className="t-note">Your story begins here. Set a scouting brief and let the first week unfold.</p>}</PanelSection>
    <PanelSection title="This week needs you" className="xl:hidden"><DecisionList decisions={inbox.needs_decision}/></PanelSection>
   </div>
 </div>;
}
