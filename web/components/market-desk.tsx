"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Panel, PanelSection, Badge, buttonClass, inputClass } from "@/components/ui";
import { expansionAction } from "@/lib/actions";
import type { MarketDTO } from "@/lib/market-api";
import type { ClientRow } from "@/lib/types";
const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
const button = buttonClass.secondary;
const field = inputClass;
export function MarketDesk({ market, clients, revision, initialClub }: {
    market: MarketDTO;
    clients: ClientRow[];
    revision: number;
    initialClub?: number;
}) {
    const router = useRouter();
    const [pid, setPid] = useState(clients[0]?.player.id ?? 0);
    const [selected, setSelected] = useState<number[]>(initialClub ? [initialClub] : []);
    const [notice, setNotice] = useState("");
    const [query, setQuery] = useState("");
    const [tier, setTier] = useState("all");
    const [page, setPage] = useState(0);
    const [pending, startTransition] = useTransition();
    const client = clients.find(c => c.player.id === pid);
    function act(operation: string, payload: Record<string, unknown>) { startTransition(async () => { try {
        const response = await expansionAction("market", operation, payload, revision);
        setNotice(response.message);
        if (response.ok)
            router.refresh();
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : "The action could not be completed.");
    } }); }
    function role(cid: number) { const estimate = market.comparisons.find(c => c.player_id === pid && c.club_id === cid)?.predicted_playing_time; return estimate ? estimate.low === estimate.high ? estimate.low : `${estimate.low} – ${estimate.high}` : "Report needed"; }
    const busy = market.loans.some(l => l.player_id === pid && l.active) || market.talks.some(t => t.player_id === pid && ["open", "agreed"].includes(t.status));
    if (!client)
        return <Panel className="p-6"><p className="text-sm">Sign a client to begin making introductions.</p><Link className="text-accent text-sm" href="/scouting">Visit scouting →</Link></Panel>;
    const approaches = market.interests.filter(i => i.player_id === pid);
    const clubs = market.clubs.filter(c => c.id !== client.player.club_id && c.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (tier === "all" || c.tier === Number(tier)));
    const pageCount = Math.max(1, Math.ceil(clubs.length / 8));
    const currentPage = Math.min(page, pageCount - 1);
    const visibleClubs = clubs.slice(currentPage * 8, currentPage * 8 + 8);
    const tiers = [...new Set(market.clubs.map(c => c.tier))].sort((a,b) => a-b);
    const staying = market.comparisons.find(c => c.player_id === pid && c.club_id === client.player.club_id);
    return <div className="space-y-5">
    <Panel className="flex flex-wrap items-end justify-between gap-4 p-4"><label className="grid w-full min-w-0 gap-2 text-xs text-dim sm:w-auto">Representing<select className={field} value={pid} onChange={e => { setPid(Number(e.target.value)); setNotice(""); setPage(0); }}>{clients.map(c => <option key={c.player.id} value={c.player.id}>{c.player.name} · {c.player.position}</option>)}</select></label><div className="text-right"><Badge tone={market.window_open ? "good" : "warn"}>{market.window_open ? "Transfer window open" : "Transfer window closed"}</Badge><p className="t-note mt-2">{client.club_name} · {client.wage?.text ?? "No club wage"} per week</p></div></Panel>
    {notice && <p role="status" aria-live="polite" className="rounded border border-accent/30 bg-panel p-3 text-sm">{notice}</p>}
    {market.rival_warnings.some(w => w.player_id === pid) && <Panel tone="warn" className="p-4 text-sm">A rival is courting this client. <Link className="text-accent underline" href={`/clients/${pid}`}>Review his concerns and rebuild trust →</Link></Panel>}
    <PanelSection title="Compare the options" note="Select up to three clubs below. Playing time is estimated from your scouting report."><div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4"><div className="rounded border border-line p-3"><p className="t-label">Stay put</p><h3 className="mt-2 text-sm font-semibold">{client.club_name}</h3><p className="mt-2 text-sm capitalize">{client.player.club_id ? role(client.player.club_id) : "No club football"}</p><p className="t-note mt-2">Current wage: {client.wage?.text ?? "—"}</p><p className="t-note mt-2">Transaction commission: £0</p><p className="mt-3 border-t border-line pt-3 text-xs text-dim">{staying?.goal_fit ?? "No club football until a move is agreed."}</p></div>{selected.filter(id => id !== client.player.club_id).map(id => { const club = market.clubs.find(c => c.id === id); if (!club)
        return null; const projection = market.comparisons.find(c => c.player_id === pid && c.club_id === id); const approach = approaches.find(i => i.club_id === id); return <div key={id} className="rounded border border-accent/30 p-3"><Link className="text-sm font-semibold text-accent" href={`/clubs/${id}`}>{club.name}</Link><p className="mt-2 text-sm capitalize">{role(id)}</p><p className="t-note mt-2">{approach ? `Wage ceiling ${money(approach.max_wage)}/wk · fee ceiling ${money(approach.max_fee)}` : "No firm offer yet"}</p><p className="t-note mt-2">Estimated commission: {projection?.estimated_commission != null ? money(projection.estimated_commission) : "Awaiting terms"}</p><p className="t-note mt-1">{projection?.commission_note}</p><p className="mt-3 border-t border-line pt-3 text-xs text-dim">{projection?.goal_fit}</p><button className={`${buttonClass.ghost} mt-3`} onClick={()=>setSelected(selected.filter(cid=>cid!==id))} aria-label={`Remove ${club.name} from comparison`}>Remove comparison</button></div>; })}</div></PanelSection>
    {approaches.length > 0 && <PanelSection title="Club approaches">{approaches.map(i => <div key={i.id} className="flex flex-wrap justify-between gap-3 border-b border-line py-3 last:border-0"><div><p className="text-sm font-medium">{market.clubs.find(c => c.id === i.club_id)?.name} {i.is_renewal && "· Renewal"}</p><p className="t-note">Up to {money(i.max_wage)}/week · fee to {money(i.max_fee)}</p></div><Link className={button} href={`/clients/${pid}?negotiate=${i.id}`}>Discuss terms →</Link></div>)}</PanelSection>}
    <PanelSection title="Club directory" note="A pitch invites interest. A loan needs parent approval, a suitable host, and agreed financial terms."><div className="mb-4 grid gap-3 sm:grid-cols-[1fr_10rem]"><label className="grid gap-1 text-xs text-dim">Find a club<input type="search" className={field} value={query} placeholder="Club name" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><label className="grid gap-1 text-xs text-dim">League tier<select className={field} value={tier} onChange={e=>{setTier(e.target.value);setPage(0);}}><option value="all">All tiers</option>{tiers.map(value=><option key={value} value={value}>Tier {value}</option>)}</select></label></div><p className="t-note mb-3" role="status">{clubs.length} matching clubs · {selected.length} selected for comparison</p>{clubs.length === 0 && <div className="rounded border border-dashed border-line p-6 text-center"><p className="text-sm">No clubs match these filters.</p><button className={`${buttonClass.secondary} mt-3`} onClick={()=>{setQuery("");setTier("all");setPage(0);}}>Clear filters</button></div>}<div className="grid gap-3 2xl:grid-cols-2">{visibleClubs.map(club => { const comparison = market.comparisons.find(c => c.player_id === pid && c.club_id === club.id); return <article key={club.id} className="rounded border border-line p-4"><div className="flex justify-between gap-3"><div><Link href={`/clubs/${club.id}`} className="text-sm font-semibold hover:text-accent">{club.name} →</Link><p className="t-note mt-1">Tier {club.tier} · Relationship {Math.round(club.relationship)}/100</p></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(club.id)} disabled={!selected.includes(club.id) && selected.length >= 3} onChange={e => setSelected(e.target.checked ? [...selected, club.id] : selected.filter(id => id !== club.id))}/>Compare</label></div><p className="my-3 text-xs text-dim">Needs: {Object.keys(club.needs).join(", ") || "No active needs"} · Wage room {money(club.wage_headroom)}/wk</p><div className="flex flex-wrap gap-2"><button className={button} disabled={pending || !market.window_open || busy || !club.needs[client.player.position] || comparison?.pitch_used || approaches.some(i => i.club_id === club.id)} onClick={() => act("pitch", { player_id: pid, club_id: club.id })}>{comparison?.pitch_used ? "Pitched this window" : "Pitch client"}</button><button className={button} disabled={pending || !market.window_open || busy || !client.player.contract || !club.needs[client.player.position]} onClick={() => act("loan_open", { player_id: pid, club_id: club.id, duration: "half_season" })}>Half-season loan</button><button className={button} disabled={pending || !market.window_open || busy || !client.player.contract || !club.needs[client.player.position]} onClick={() => act("loan_open", { player_id: pid, club_id: club.id, duration: "season" })}>Season loan</button></div></article>; })}</div>{clubs.length > 0 && <nav aria-label="Club directory pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><button className={button} disabled={currentPage === 0} onClick={()=>setPage(currentPage-1)}>Previous clubs</button><span className="text-xs text-dim">Page {currentPage+1} of {pageCount}</span><button className={button} disabled={currentPage+1 >= pageCount} onClick={()=>setPage(currentPage+1)}>Next clubs</button></nav>}</PanelSection>
    <PanelSection title="Loan negotiations" note={`Each pairing has one attempt per window, with up to ${market.loan_terms.max_rounds} proposals.`}><div className="space-y-3">{market.talks.filter(t => t.player_id === pid && ["open", "agreed"].includes(t.status)).map(t => <LoanTerms key={t.id} talk={t} market={market} pending={pending} act={act}/>)}{!market.talks.some(t => t.player_id === pid && ["open", "agreed"].includes(t.status)) && <p className="t-note">No ongoing loan talks. Choose a club above to request approval.</p>}</div></PanelSection>
    <PanelSection title="Loan register">{market.loans.filter(l => l.player_id === pid).length === 0 ? <p className="t-note">No loans for this client.</p> : market.loans.filter(l => l.player_id === pid).map(l => <div key={l.id} className="border-b border-line py-3 last:border-0"><p className="text-sm">{market.clubs.find(c => c.id === l.host_club_id)?.name} · {l.active ? "On loan" : "Returned"}</p><p className="t-note mt-1">Parent: {market.clubs.find(c => c.id === l.parent_club_id)?.name} · returns week {l.ends_week} · host pays {l.contribution_pct}% of wage · fee {money(l.fee)} · commission {money(l.commission)}</p></div>)}</PanelSection>
  </div>;
}
function LoanTerms({ talk, market, pending, act }: {
    talk: MarketDTO["talks"][number];
    market: MarketDTO;
    pending: boolean;
    act: (op: string, payload: Record<string, unknown>) => void;
}) {
    const [pct, setPct] = useState(talk.contribution_pct || 50);
    const [fee, setFee] = useState(talk.fee);
    return <div className="rounded border border-line p-4"><p className="text-sm font-semibold">{market.clubs.find(c => c.id === talk.host_club_id)?.name} · {talk.status === "agreed" ? "Terms agreed" : `Proposal ${talk.rounds + 1} of ${market.loan_terms.max_rounds}`}</p><p className="t-note mt-1">Loan ends week {talk.ends_week}. Talks expire week {talk.expires_week}.</p>{talk.status === "open" ? <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); act("loan_propose", { talk_id: talk.id, contribution_pct: pct, fee }); }}><label className="grid gap-1 text-xs">Host wage contribution (%)<input className={field} type="number" min={market.loan_terms.min_contribution_pct} max={market.loan_terms.max_contribution_pct} step="1" required value={pct} onChange={e => setPct(Number(e.target.value))}/></label><label className="grid gap-1 text-xs">Loan fee (£)<input className={field} type="number" min="0" step="1" required value={fee} onChange={e => setFee(Number(e.target.value))}/></label><button className={button} disabled={pending || !market.window_open}>Propose terms</button></form> : <div className="mt-3"><p className="text-sm mb-3">Host pays {talk.contribution_pct}% of the wage and {money(talk.fee)} in fees.</p><button className={button} disabled={pending || !market.window_open} onClick={() => act("loan_accept", { talk_id: talk.id })}>Complete loan</button></div>}<button className={`${buttonClass.danger} mt-3`} disabled={pending} onClick={() => act("loan_cancel", { talk_id: talk.id })}>End these talks</button></div>;
}
