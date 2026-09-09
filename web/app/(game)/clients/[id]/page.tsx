// Client detail — where most decisions are actually made.
//
// This is the only screen allowed to show derived true-ability figures (market
// value, asking price), because he is already yours and the CLI's detail screen
// showed the same. Ability and potential remain ranges: signing him did not
// make your read on him perfect.

import { notFound } from "next/navigation";
import { Activity, Building2, Shield } from "lucide-react";

import { Money, Pct } from "@/components/money";
import { RangeBar } from "@/components/range-bar";
import { TrustMeter } from "@/components/trust-meter";
import { Badge, Panel, PanelSection, ScreenHeader, StatTile, cn } from "@/components/ui";
import { getClientDetail, getMeta, isApiError } from "@/lib/api";

import { ClientActions, InterestCards } from "./client-panels";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ negotiate?: string }>;
}) {
  const { id } = await params;
  const { negotiate } = await searchParams;
  const playerId = Number.parseInt(id, 10);
  if (Number.isNaN(playerId)) notFound();

  let detail;
  try {
    detail = await getClientDetail(playerId);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const meta = await getMeta();
  const traitBlurbs = meta.trait_blurbs;

  const autoNegotiate = negotiate ? Number.parseInt(negotiate, 10) : null;
  const { player, report } = detail;

  const contractWeeks = detail.club_contract_weeks_left;
  const contractTone =
    contractWeeks === null ? "bad" : contractWeeks <= 26 ? "warn" : "default";
  const agentTone = detail.agent_contract_weeks_left <= 12 ? "warn" : "default";

  return (
    <div className="space-y-5">
      <ScreenHeader
        title={
          <span className="flex flex-wrap items-baseline gap-3">
            {player.name}
            <span className="text-sm font-normal text-dim">
              {player.age} · {player.position}
            </span>
            {/* Trait is the only thing making clients non-interchangeable, and
                it predicts how he will take a move — so it is a first-class
                label, not a footnote. */}
            <Badge tone="accent" title={traitBlurbs[player.trait] ?? ""}>
              {player.trait}
            </Badge>
            {player.injury_weeks > 0 && (
              <Badge tone="bad">injured {player.injury_weeks}w</Badge>
            )}
            {player.transfer_listed && <Badge tone="warn">transfer-listed</Badge>}
            {player.seeking_move && <Badge>seeking a move</Badge>}
          </span>
        }
        note={traitBlurbs[player.trait]}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Wage"
          value={<Money value={detail.wage} />}
          sub={
            contractWeeks === null
              ? "No club — he is a free agent."
              : `${contractWeeks} weeks left on his deal`
          }
          tone={contractTone === "bad" ? "bad" : contractTone === "warn" ? "warn" : "default"}
        />
        <StatTile
          label="Your cut"
          value={<Pct value={detail.commission_pct} />}
          sub={`${detail.agent_contract_weeks_left} weeks left on your agreement`}
          tone={agentTone === "warn" ? "warn" : "default"}
        />
        <StatTile label="Market value" value={<Money value={detail.market_value} />} />
        <StatTile
          label="Asking price"
          value={<Money value={detail.asking_price} />}
          sub="What his club would want to let him go."
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <PanelSection title="Where he is" bodyClassName="p-4">
          <dl className="space-y-0">
            <DetailRow icon={<Building2 size={13} aria-hidden />} label="Club">
              {detail.club ? (
                <span>
                  {detail.club.name}{" "}
                  <span className="num text-faint">
                    · strength {Math.round(detail.club.strength)} ·{" "}
                    {detail.club.league_position}
                    {ordinal(detail.club.league_position)}
                  </span>
                </span>
              ) : (
                <span className="text-bad">Free agent</span>
              )}
            </DetailRow>
            <DetailRow icon={<Activity size={13} aria-hidden />} label="Playing time">
              <span className={ROLE_TONE[detail.playing_time] ?? "text-dim"}>
                {detail.playing_time}
              </span>
            </DetailRow>
            <DetailRow icon={<Shield size={13} aria-hidden />} label="Trust in you">
              <TrustMeter trust={detail.trust} label={detail.trust_label} size="lg" />
            </DetailRow>
          </dl>
          {/* Playing time is the rule that makes greed punishable, so when it
              has gone wrong the screen says so in words, not just a colour. */}
          {(detail.playing_time === "bench" || detail.playing_time === "reserve") && (
            <p className="t-note mt-3 text-warn">
              He is not playing. He will stop developing, and his trust in you will keep sliding
              until that changes — a bigger wage does not compensate for it.
            </p>
          )}
        </PanelSection>

        <PanelSection
          title="Your read on him"
          note="Even your own client is an estimate. More weeks watched, better scouts and a bigger reputation all tighten it."
        >
          {report ? (
            <div className="space-y-4">
              <div>
                <div className="t-label mb-1.5">Ability now</div>
                <RangeBar
                  low={report.ability_low}
                  high={report.ability_high}
                  confidence={report.confidence}
                  size="lg"
                />
              </div>
              <div>
                <div className="t-label mb-1.5">Potential</div>
                <RangeBar
                  low={report.potential_low}
                  high={report.potential_high}
                  confidence={report.confidence}
                  size="lg"
                />
              </div>
            </div>
          ) : (
            <p className="t-note">No scouting report on him.</p>
          )}
        </PanelSection>
      </div>

      <PanelSection
        title="Approaches"
        note="Clubs circling him. Each one is a single, spendable negotiation."
        tone={detail.interests.some((i) => i.can_negotiate.ok) ? "action" : "default"}
        bodyClassName="p-4"
      >
        <InterestCards detail={detail} autoNegotiate={autoNegotiate} />
      </PanelSection>

      <PanelSection title="What you can do about him">
        <ClientActions detail={detail} />
      </PanelSection>
    </div>
  );
}

const ROLE_TONE: Record<string, string> = {
  star: "text-good",
  regular: "text-fg",
  rotation: "text-dim",
  bench: "text-warn",
  reserve: "text-bad",
};

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/50 py-2.5 last:border-0">
      <dt className="flex items-center gap-2 text-xs text-dim">
        <span className="text-faint">{icon}</span>
        {label}
      </dt>
      <dd className={cn("text-right text-sm")}>{children}</dd>
    </div>
  );
}

function ordinal(n: number): string {
  if (n <= 0) return "";
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return suffix[(v - 20) % 10] || suffix[v] || suffix[0];
}
