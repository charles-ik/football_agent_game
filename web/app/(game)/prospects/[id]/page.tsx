import {notFound} from "next/navigation";
import Link from "next/link";
import {getScouting,getGameState} from "@/lib/api";
import {getManagement} from "@/lib/management-api";
import {PanelSection,ScreenHeader} from "@/components/ui";
import {RangeBar} from "@/components/range-bar";
import {ProspectActions} from "@/components/prospect-actions";
export default async function ProspectPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;const [scouting,game,agency]=await Promise.all([getScouting(),getGameState(),getManagement()]);
 const row=scouting.reports.find(r=>r.player.id===Number(id));if(!row)notFound();
 return <div className="space-y-5"><Link href="/scouting" className="text-sm text-accent">← Scouting room</Link><ScreenHeader title={row.player.name} note={`${row.player.age} · ${row.player.position} · ${row.player.club_name}`}/><PanelSection title="What your scouts know"><div className="grid gap-6 md:grid-cols-2"><div><p className="t-label mb-2">Current ability</p><RangeBar low={row.report.ability_low} high={row.report.ability_high} confidence={row.report.confidence}/></div><div><p className="t-label mb-2">Potential</p><RangeBar low={row.report.potential_low} high={row.report.potential_high}/></div></div><p className="t-note mt-4">Watched for {row.report.weeks_watched} weeks in {row.report.region_id}. These are estimates. More focused observation narrows the uncertainty.</p></PanelSection><PanelSection title="Make your approach"><p className="mb-4 text-sm text-dim">{row.player.trait} · {row.player.represented_by?`Represented by ${row.player.represented_by}`:"No rival representative"}</p><ProspectActions id={row.player.id} canApproach={row.can_approach} reason={row.approach_blocked_reason} shortlisted={agency.shortlisted_players.includes(row.player.id)} revision={game.revision}/></PanelSection></div>;
}
