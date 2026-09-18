import { ScreenHeader } from "@/components/ui";
import { MarketDesk } from "@/components/market-desk";
import { getClients, getGameState } from "@/lib/api";
import { getMarket } from "@/lib/market-api";
import { SceneBanner } from "@/components/scene-banner";
export default async function MarketPage({ searchParams }: {
    searchParams: Promise<{
        club?: string;
    }>;
}) {
    const [market, clients, game, params] = await Promise.all([getMarket(), getClients(), getGameState(), searchParams]);
    return <div className="space-y-5"><ScreenHeader title="The market desk" note="Find the right club, make an introduction, and negotiate a future for your client."/><SceneBanner image="agency-desk" eyebrow={game.calendar.window_open ? "Transfer window open" : "Prepare your next move"} title="The right move changes everything." description="Match ambition with opportunity. A good deal grows your agency and gives your client a place to thrive."/><MarketDesk market={market} clients={clients} revision={game.revision} initialClub={Number(params.club) || undefined}/></div>;
}
