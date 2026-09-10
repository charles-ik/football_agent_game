import Link from "next/link";
import { notFound } from "next/navigation";
import { PanelSection, ScreenHeader, StatTile, buttonClass } from "@/components/ui";
import { getClients } from "@/lib/api";
import { getMarket } from "@/lib/market-api";
const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
export default async function ClubPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const [{ id }, market, clients] = await Promise.all([params, getMarket(), getClients()]);
    const club = market.clubs.find(c => c.id === Number(id));
    if (!club)
        notFound();
    const relevant = clients.filter(c => c.player.club_id === club.id || Object.keys(club.needs).includes(c.player.position));
    return <div className="space-y-5"><ScreenHeader title={club.name} note={`Tier ${club.tier} · Club strength ${club.strength.toFixed(0)} · Prestige ${club.prestige.toFixed(0)}`} actions={<Link className={buttonClass.secondary} href={`/market?club=${club.id}`}>Open market desk →</Link>}/><section className="grid gap-3 sm:grid-cols-3"><StatTile label="Club relationship" value={`${club.relationship.toFixed(0)} / 100`}/><StatTile label="Weekly wage headroom" value={money(club.wage_headroom)}/><StatTile label="Transfer budget" value={money(club.transfer_budget)}/></section><div className="grid gap-4 lg:grid-cols-2"><PanelSection title="Recruitment needs">{Object.entries(club.needs).length === 0 ? <p className="t-note">No active positional needs.</p> : Object.entries(club.needs).map(([position, urgency]) => <div key={position} className="flex items-center justify-between border-b border-line py-3 last:border-0"><span className="text-sm font-medium">{position}</span><span className="text-xs text-dim">Urgency {Math.round(urgency * 100)}%</span></div>)}</PanelSection><PanelSection title="Relationship history">{club.history.length === 0 ? <p className="t-note">A fresh relationship. Successful introductions and completed deals build confidence.</p> : club.history.slice().reverse().map((entry, index) => <div key={`${entry.week}-${index}`} className="border-b border-line py-3 last:border-0"><p className="text-sm">{entry.reason} <span className={entry.change >= 0 ? "text-good" : "text-warn"}>{entry.change >= 0 ? "+" : ""}{entry.change}</span></p><p className="t-note">Week {entry.week} · relationship {entry.value.toFixed(0)}/100</p></div>)}</PanelSection></div><PanelSection title="Your relevant clients" note="Current players and clients whose position matches a recruitment need.">{relevant.length === 0 ? <p className="t-note">No clients match this club's current needs.</p> : relevant.map(client => { const comparison = market.comparisons.find(c => c.club_id === club.id && c.player_id === client.player.id); const estimate = comparison?.predicted_playing_time; return <div key={client.player.id} className="flex flex-wrap justify-between gap-3 border-b border-line py-3 last:border-0"><Link href={`/clients/${client.player.id}`} className="text-sm hover:text-accent">{client.player.name} · {client.player.position}</Link><span className="text-xs capitalize text-dim">Estimated role: {estimate ? `${estimate.low} – ${estimate.high}` : "Scouting report needed"}</span></div>; })}</PanelSection></div>;
}
