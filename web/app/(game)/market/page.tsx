import { ScreenHeader } from "@/components/ui";
import { MarketDesk } from "@/components/market-desk";
import { getClients, getGameState } from "@/lib/api";
import { getMarket } from "@/lib/market-api";
export default async function MarketPage({ searchParams }: {
    searchParams: Promise<{
        club?: string;
    }>;
}) {
    const [market, clients, game, params] = await Promise.all([getMarket(), getClients(), getGameState(), searchParams]);
    return <div className="space-y-5"><ScreenHeader title="The market desk" note="Find the right club, make an introduction, and negotiate a future for your client."/><MarketDesk market={market} clients={clients} revision={game.revision} initialClub={Number(params.club) || undefined}/></div>;
}
