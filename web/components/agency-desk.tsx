"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Crown, Globe2, Shield, Star, Users } from "lucide-react";
import { Panel, PanelSection, ScreenHeader, StatTile, buttonClass, inputClass } from "@/components/ui";
import { expansionAction } from "@/lib/actions";
import type { ManagementDTO, PortfolioClub, SupportStaffDTO } from "@/lib/management-api";
import type { ClientRow, GameState, HQState } from "@/lib/types";

const money = (value:number) => new Intl.NumberFormat("en-GB", {style:"currency", currency:"GBP", maximumFractionDigits:0}).format(value);
const label = (value:string) => value.replaceAll("_", " ");
const benefits:Record<string,string> = {
  scouting: "Scouting reports narrow 4% faster per level, with more opportunities for discovery.",
  client_services: "Soften negative client trust changes by 4% per level. Total support is capped at 35%.",
  networking: "Improve suitable club pitches by 2.5 percentage points per level.",
};
const specialties:Record<string,string> = {generalist:"A broad portfolio with no specialist bonus.", youth:"Extra scouting precision for players aged 23 and under.", careers:"More protection against negative client trust changes.", deals:"A stronger chance when pitching a suitable client to a club."};
const objectiveNotes:Record<string,string> = {growth:"Grow your net client roster by 2 for +2 reputation.", stability:"Stay solvent for 20 consecutive weeks for +2 reputation.", careers:"Complete 3 client deals for +3 reputation."};
const accents:Record<string,string> = {emerald:"text-emerald-400",blue:"text-blue-400",amber:"text-amber-400",violet:"text-violet-400"};
const emblems = {shield:Shield,star:Star,crown:Crown,globe:Globe2};
type RunAction = (operation:string, payload:Record<string,unknown>, confirmation?:string) => Promise<void>;

export function AgencyDesk({management:m, clients, clubs, game, hq}:{management:ManagementDTO; clients:ClientRow[]; clubs:PortfolioClub[]; game:GameState; hq:HQState}) {
  const router = useRouter();
  const [pending,setPending] = useState(false);
  const busy = useRef(false);
  const [notice,setNotice] = useState<{ok:boolean; message:string}|null>(null);
  const [emblem,setEmblem] = useState(m.identity.emblem);
  const [accent,setAccent] = useState(m.identity.accent);
  const Icon = emblems[emblem as keyof typeof emblems] ?? Shield;
  const run:RunAction = async (operation,payload,confirmation) => {
    if (busy.current || (confirmation && !window.confirm(confirmation))) return;
    busy.current = true; setPending(true); setNotice(null);
    try { const result = await expansionAction("management", operation, payload, game.revision); setNotice({ok:result.ok,message:result.message}); router.refresh(); }
    catch { setNotice({ok:false,message:"The action could not be confirmed. The agency is refreshing; check the latest state before retrying."}); router.refresh(); }
    finally { busy.current=false; setPending(false); }
  };
  const full = m.staff.length >= m.support_slots;
  return <div className="space-y-5">
    <ScreenHeader title="Your agency" note="Build the team behind the talent. Every new role adds a weekly commitment." />
    <Panel className="relative overflow-hidden p-5 sm:p-7"><div className="absolute -right-5 -top-10 rotate-12 text-accent/5" aria-hidden><Shield size={240}/></div><div className="relative flex items-center gap-5"><div className={`rounded-2xl border border-current/30 bg-panel-2 p-4 ${accents[accent] ?? "text-accent"}`}><Icon size={40}/></div><div><p className="t-label">Independent representation · Season {game.calendar.season}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{game.agency.name}</h2><p className="mt-1 text-sm text-dim">{hq.current.name} · {label(m.specialization)}</p></div></div></Panel>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatTile label="Support team" value={`${m.staff.length} / ${m.support_slots}`} sub="One slot per headquarters tier"/><StatTile label="Staff & departments" value={`${money(m.support_weekly_cost)}/wk`}/><StatTile label="Weekly net" value={money(m.finance.weekly_net)} tone={m.finance.weekly_net<0?"warn":"good"}/><StatTile label="Cash runway" value={m.finance.runway_weeks===null?"Self-funding":`${Math.floor(m.finance.runway_weeks)} weeks`} sub="At current costs, before new deals"/></div>
    {notice && <div role={notice.ok?"status":"alert"} className={`rounded-lg border p-3 text-sm ${notice.ok?"border-good/40 text-good":"border-bad/40 text-bad"}`}>{notice.message}</div>}
    <fieldset disabled={pending} className="min-w-0 space-y-5 disabled:opacity-70">
      <legend className="sr-only">Agency management</legend>
      <PanelSection title="The support team" note="Give each specialist a named portfolio. Quality determines how much help they provide.">
        {!m.staff.length ? <div className="flex items-center gap-3 py-4 text-dim"><Users size={28}/><p className="text-sm">You’re handling every conversation yourself. Your first support hire can share the workload.</p></div> : <div className="grid items-start gap-4 xl:grid-cols-2">{m.staff.map(staff=><StaffPortfolio key={`${staff.id}:${staff.player_ids.join(",")}:${staff.club_ids.join(",")}`} staff={staff} clients={clients} clubs={clubs} allStaff={m.staff} run={run}/>)}</div>}
      </PanelSection>
      <PanelSection title="Available this week" note="Candidates remain available until the week advances. The hiring fee is paid once; wages recur.">
        {full && <p className="mb-4 text-sm text-warn">Your support slots are full. Release a staff member or <Link className="underline" href="/headquarters">expand headquarters</Link>.</p>}
        <div className="grid gap-3 sm:grid-cols-2">{m.candidates.map(candidate=><article key={candidate.id} className="rounded-lg border border-line bg-panel-2/50 p-4"><p className="t-label capitalize">{label(candidate.role)}</p><h3 className="mt-1 font-semibold">{candidate.name}</h3><p className="mt-1 text-xs text-dim">Quality {candidate.quality} · Portfolio {candidate.capacity} {candidate.role==="client_manager"?"clients":"clubs"}</p><p className="mt-3 text-sm">{money(candidate.hire_cost)} to hire · {money(candidate.wage)}/week</p><p className="mt-1 text-xs text-dim">After hire: {money(candidate.quote.weekly_net_after)}/week net · {candidate.quote.runway_weeks===null?"costs covered":`${Math.floor(candidate.quote.runway_weeks)} weeks runway`}</p><button className={`${buttonClass.secondary} mt-3`} disabled={full || game.agency.cash.amount<candidate.hire_cost} onClick={()=>void run("hire",{candidate_id:candidate.id})}>Hire {candidate.name.split(" ")[0]}</button>{game.agency.cash.amount<candidate.hire_cost && <p className="mt-2 text-xs text-warn">Need {money(candidate.hire_cost-game.agency.cash.amount)} more cash.</p>}</article>)}</div>
        {!m.candidates.length && <p className="text-sm text-dim">You’ve hired everyone in this week’s pool. New candidates arrive next week.</p>}
      </PanelSection>
      <PanelSection title="Build your departments" note="Each department can develop once per headquarters tier. Upkeep continues every week."><div className="grid gap-4 lg:grid-cols-3">{m.departments.map(dept=><article key={dept.id} className="flex flex-col rounded-lg border border-line p-4"><p className="t-label">Level {dept.level} / {game.agency.hq_level}</p><h3 className="mt-1 font-semibold capitalize">{label(dept.id)}</h3><p className="mt-2 flex-1 text-sm text-dim">{benefits[dept.id]}</p><p className="mt-4 text-sm">Current upkeep {money(dept.weekly_cost)}/week</p><p className="mt-1 text-xs text-dim">Next level: {money(dept.upgrade_cost)} once, then {money(dept.next_weekly_cost)}/week total.</p><p className="mt-1 text-xs text-dim">Agency net after upgrade: {money(dept.quote.weekly_net_after)}/week.</p><div className="mt-3 flex flex-wrap gap-2"><button className={buttonClass.secondary} disabled={!dept.can_upgrade} onClick={()=>void run("upgrade_department",{department:dept.id})}>Upgrade</button><button className={buttonClass.ghost} disabled={dept.level===0} onClick={()=>void run("downgrade_department",{department:dept.id},"Reduce this department by one level? Upkeep and benefits fall; the original upgrade fee is not refunded.")}>Reduce</button></div>{!dept.can_upgrade && <p className="mt-2 text-xs text-warn">{dept.level>=game.agency.hq_level?"Expand headquarters to unlock the next level.":"Not enough cash for this upgrade."}</p>}</article>)}</div></PanelSection>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <PanelSection title="Agency identity"><form className="space-y-3" onSubmit={event=>{event.preventDefault();void run("identity",{emblem,accent});}}><label className="block text-xs text-dim">Emblem<select className={`${inputClass} mt-1 capitalize`} value={emblem} onChange={e=>setEmblem(e.target.value)}>{m.identity.emblems.map(v=><option key={v}>{v}</option>)}</select></label><label className="block text-xs text-dim">Accent<select className={`${inputClass} mt-1 capitalize`} value={accent} onChange={e=>setAccent(e.target.value)}>{m.identity.accents.map(v=><option key={v}>{v}</option>)}</select></label><button className={buttonClass.secondary}>Save identity</button></form></PanelSection>
        <PanelSection title="Specialization" note={`Current focus: ${label(m.specialization)}`}><p className="mb-3 text-sm text-dim">{specialties[m.specialization]}</p><div className="grid grid-cols-2 gap-2">{m.specialization_options.filter(v=>v!==m.specialization).map(v=><button key={v} className={`${buttonClass.secondary} text-left`} disabled={!m.can_specialize} onClick={()=>void run("specialization",{specialization:v})}><span className="capitalize">{v}</span><span className="mt-1 block text-xs font-normal text-dim">{specialties[v]}</span></button>)}</div><p className="mt-3 text-xs text-dim">{m.can_specialize?"Choose your focus. You can change again at a future season boundary.":"Complete your first deal to unlock a focus. After choosing, changes open at the start of a new season."}</p></PanelSection>
      </div>
      <PanelSection title={`Season ${m.objective.season} ambition`} actions={<Link href="/season-review" className="text-xs text-accent underline">Past seasons</Link>}><div className="flex flex-wrap items-end justify-between gap-4"><div><h3 className="text-lg capitalize">{m.objective.id}</h3><p className="mt-1 text-sm text-dim">{objectiveNotes[m.objective.id]}</p><p className="mt-2 text-accent">{m.objective.completed?"Objective achieved":`${m.objective.progress} / ${m.objective.target}`}</p></div><div className="flex flex-wrap gap-2">{Object.keys(objectiveNotes).filter(id=>id!==m.objective.id).map(id=><button key={id} className={`${buttonClass.secondary} capitalize`} disabled={game.calendar.season_week!==1 || m.objective.completed} onClick={()=>void run("objective",{objective:id})}>{id}</button>)}</div></div><p className="mt-3 text-xs text-dim">Objectives can be selected in the first week of each season.</p></PanelSection>
      <PanelSection title="Premises & commitments"><p className="text-sm text-dim">Smaller headquarters lower your weekly bill. Clients, scouts, support staff and department levels must all fit before you move; there is no cash refund.</p><div className="mt-4 flex flex-wrap items-center gap-3"><Link href="/headquarters" className={buttonClass.secondary}>Review headquarters</Link><button className={buttonClass.danger} disabled={game.agency.hq_level<=1} onClick={()=>void run("downsize",{},"Move down one headquarters tier? This reduces your capacity and recurring costs. There is no refund; your current roster and departments must fit.")}>Downsize headquarters</button></div></PanelSection>
    </fieldset>
    {pending && <p role="status" className="text-sm text-dim">Updating the agency…</p>}
  </div>;
}

function StaffPortfolio({staff,clients,clubs,allStaff,run}:{staff:SupportStaffDTO;clients:ClientRow[];clubs:PortfolioClub[];allStaff:SupportStaffDTO[];run:RunAction}) {
  const isManager = staff.role==="client_manager";
  const initial = isManager?staff.player_ids:staff.club_ids;
  const [selected,setSelected] = useState(initial);
  const options = isManager?clients.map(c=>({id:c.player.id,name:c.player.name})):clubs;
  const taken = new Set(allStaff.filter(s=>s.id!==staff.id).flatMap(s=>isManager?s.player_ids:s.club_ids));
  return <article className="rounded-lg border border-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="t-label capitalize">{label(staff.role)}</p><h3 className="mt-1 font-semibold">{staff.name}</h3><p className="mt-1 text-xs text-dim">Quality {staff.quality} · {money(staff.wage)}/week</p></div><button className={buttonClass.danger} onClick={()=>void run("fire",{staff_id:staff.id},`Release ${staff.name}? Their portfolio will lose this support and the wage will stop.`)}>Release</button></div><p className="mt-4 text-sm">Portfolio · {selected.length} / {staff.capacity}</p><p className="mt-1 text-xs text-dim">{isManager?"Assigned clients receive protection against negative trust changes.":"Assigned clubs receive stronger suitable-client pitches."}</p><div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded border border-line p-2" role="group" aria-label={`${staff.name}'s portfolio`}>{options.map(option=><label key={option.id} className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm"><input type="checkbox" checked={selected.includes(option.id)} disabled={taken.has(option.id) || (!selected.includes(option.id) && selected.length>=staff.capacity)} onChange={e=>setSelected(e.target.checked?[...selected,option.id]:selected.filter(id=>id!==option.id))}/><span>{option.name}{taken.has(option.id)&&<span className="text-xs text-faint"> · assigned elsewhere</span>}</span></label>)}{!options.length&&<p className="text-xs text-dim">No eligible portfolio entries yet.</p>}</div><button className={`${buttonClass.secondary} mt-3`} onClick={()=>void run("assign",{staff_id:staff.id,[isManager?"player_ids":"club_ids"]:selected})}>Save portfolio</button></article>;
}
