// Leagues — one table per league, rows highlighted where you have a client.
// Context, not decision-making; kept plain.

import { getLeagues } from "@/lib/api";

export default async function LeaguesPage() {
  const leagues = await getLeagues();

  return (
    <div className="space-y-6">
      {leagues.map((league) => (
        <section key={league.id}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">
            {league.name}
            <span className="ml-2 text-faint">tier {league.tier}</span>
          </h2>
          <div className="overflow-x-auto rounded border border-line bg-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Club</th>
                  <th className="px-2 py-2 text-right font-medium">P</th>
                  <th className="px-2 py-2 text-right font-medium">W</th>
                  <th className="px-2 py-2 text-right font-medium">D</th>
                  <th className="px-2 py-2 text-right font-medium">L</th>
                  <th className="px-2 py-2 text-right font-medium">GF</th>
                  <th className="px-2 py-2 text-right font-medium">GA</th>
                  <th className="px-2 py-2 text-right font-medium">GD</th>
                  <th className="px-2 py-2 text-right font-medium">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {league.table.map((row) => (
                  <tr
                    key={row.club_id}
                    className={row.has_client ? "bg-accent/5 text-fg" : "text-dim"}
                  >
                    <td className="num px-3 py-1.5">{row.position}</td>
                    <td className="px-2 py-1.5">
                      {row.club_name}
                      {row.has_client && (
                        <span className="ml-2 rounded border border-accent/40 px-1 py-0.5 text-[10px] text-accent">
                          your client
                        </span>
                      )}
                    </td>
                    <td className="num px-2 py-1.5 text-right">{row.played}</td>
                    <td className="num px-2 py-1.5 text-right">{row.won}</td>
                    <td className="num px-2 py-1.5 text-right">{row.drawn}</td>
                    <td className="num px-2 py-1.5 text-right">{row.lost}</td>
                    <td className="num px-2 py-1.5 text-right">{row.goals_for}</td>
                    <td className="num px-2 py-1.5 text-right">{row.goals_against}</td>
                    <td className="num px-2 py-1.5 text-right">
                      {row.goal_difference >= 0 ? "+" : ""}
                      {row.goal_difference}
                    </td>
                    <td className="num px-2 py-1.5 text-right font-semibold">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
