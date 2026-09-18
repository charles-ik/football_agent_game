import { InvestmentDesk } from "@/components/investment-desk";
import { SceneBanner } from "@/components/scene-banner";
import { ScreenHeader } from "@/components/ui";
import { getGameState } from "@/lib/api";
import { getInvestments } from "@/lib/investment-api";

export default async function InvestmentsPage() {
  const [investments, game] = await Promise.all([getInvestments(), getGameState()]);
  return <div className="space-y-5">
    <ScreenHeader title="The stock exchange" note="Put agency cash to work in a fictional market. Prices change each game week; your football business still needs cash to run." />
    <SceneBanner image="investment-city" eyebrow="Beyond the touchline" title="Build something that lasts." description="Back a business, grow a portfolio, and decide when to bring your money back into the agency." />
    <InvestmentDesk market={investments} revision={game.revision}/>
  </div>;
}
