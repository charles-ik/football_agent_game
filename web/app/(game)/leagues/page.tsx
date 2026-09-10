// Leagues — context, not decision-making, so it stays plain. The one thing it
// must do well is show where your clients are: a client at a club sliding down
// the table is about to lose his playing time, and that is where trust goes.

import Link from "next/link";

import { PanelSection, ScreenHeader, Table, Td, Th, cn } from "@/components/ui";
import { getClients, getLeagues } from "@/lib/api";

export default async function LeaguesPage() {
  const [leagues, clients] = await Promise.all([getLeagues(), getClients()]);

  // Which of your clients is at which club, so a highlighted row can say who.
  const clientsByClub = new Map<string, string[]>();
  for (const client of clients) {
    const list = clientsByClub.get(client.club_name) ?? [];
    list.push(client.player.name);
    clientsByClub.set(client.club_name, list);
  }

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Leagues"
        note="A club's strength drives your client's playing time, and playing time drives everything else."
      />
      <div className="grid gap-4 2xl:grid-cols-2">
        {leagues.map((league) => (
          <PanelSection
            key={league.id}
            title={league.name}
            note={`Tier ${league.tier}`}
            bodyClassName="p-0"
          >
            <Table>
              <thead>
                <tr>
                  <Th align="right">#</Th>
                  <Th>Club</Th>
                  <Th align="right">P</Th>
                  <Th align="right">W</Th>
                  <Th align="right">D</Th>
                  <Th align="right">L</Th>
                  <Th align="right">GF</Th>
                  <Th align="right">GA</Th>
                  <Th align="right">GD</Th>
                  <Th align="right">Pts</Th>
                </tr>
              </thead>
              <tbody>
                {league.table.map((row) => {
                  const yours = clientsByClub.get(row.club_name);
                  return (
                    <tr
                      key={row.club_id}
                      className={cn(
                        "transition-colors",
                        row.has_client
                          ? "bg-accent/[0.06] text-fg hover:bg-accent/10"
                          : "text-dim hover:bg-panel-2",
                      )}
                    >
                      <Td align="right" className="num text-faint">
                        {row.position}
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          {row.has_client && (
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                            />
                          )}
                          <span className={row.has_client ? "font-medium" : ""}>
                            {row.club_name}
                          </span>
                          {yours && (
                            <span className="truncate text-[17px] text-accent/80">
                              {yours.join(", ")}
                            </span>
                          )}
                        </span>
                      </Td>
                      <Td align="right" className="num">
                        {row.played}
                      </Td>
                      <Td align="right" className="num">
                        {row.won}
                      </Td>
                      <Td align="right" className="num">
                        {row.drawn}
                      </Td>
                      <Td align="right" className="num">
                        {row.lost}
                      </Td>
                      <Td align="right" className="num">
                        {row.goals_for}
                      </Td>
                      <Td align="right" className="num">
                        {row.goals_against}
                      </Td>
                      <Td align="right" className="num">
                        {row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}
                      </Td>
                      <Td align="right" className="num font-semibold text-fg">
                        {row.points}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </PanelSection>
        ))}
      </div>
      {clients.length > 0 && (
        <p className="t-note">
          Rows marked in the accent colour are clubs where you have a client.{" "}
          <Link href="/clients" className="text-accent hover:underline">
            See your roster
          </Link>
          .
        </p>
      )}
    </div>
  );
}
