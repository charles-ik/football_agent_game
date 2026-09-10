import { AgencyDesk } from "@/components/agency-desk";
import { getClients, getGameState, getHq } from "@/lib/api";
import { getManagement, getPortfolioClubs } from "@/lib/management-api";

export default async function AgencyPage() {
  const [management, clients, game, hq, clubs] = await Promise.all([getManagement(), getClients(), getGameState(), getHq(), getPortfolioClubs()]);
  return <AgencyDesk management={management} clients={clients} game={game} hq={hq} clubs={clubs} />;
}
