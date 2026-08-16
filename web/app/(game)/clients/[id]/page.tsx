// Client detail — the screen where most decisions are made. The only place
// derived true-ability numbers (market value, asking price) are shown,
// because he is already yours.

import { notFound } from "next/navigation";

import { Money, Pct } from "@/components/money";
import { RangeBar } from "@/components/range-bar";
import { TrustMeter } from "@/components/trust-meter";
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

  return (
    <div className="space-y-4">
      {/* Identity panel */}
      <section className="rounded border border-line bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-lg font-bold">{player.name}</h1>
          <span className="text-sm text-dim">
            {player.age} · {player.position}
          </span>
          <span
            className="rounded border border-line px-1.5 py-0.5 text-xs text-dim"
            title={traitBlurbs[player.trait] ?? ""}
          >
            {player.trait}
          </span>
          {player.injury_weeks > 0 && (
            <span className="rounded border border-bad/40 px-1.5 py-0.5 text-xs text-bad">
              injured {player.injury_weeks}w
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
          <Field label="Club">
            {detail.club ? (
              <>
                {detail.club.name}{" "}
                <span className="text-faint">
                  (str {Math.round(detail.club.strength)}, {detail.club.league_position}
                  {ordinal(detail.club.league_position)})
                </span>
              </>
            ) : (
              "Free agent"
            )}
          </Field>
          <Field label="Role">{detail.playing_time}</Field>
          <Field label="Trust">
            <TrustMeter trust={detail.trust} label={detail.trust_label} />
          </Field>
          <Field label="Wage">
            <Money value={detail.wage} />
            <span className="text-faint"> /wk</span>
            {detail.club_contract_weeks_left !== null && (
              <span className="text-faint"> · {detail.club_contract_weeks_left}w left</span>
            )}
          </Field>
          <Field label="Your cut">
            <Pct value={detail.commission_pct} />
            <span className="text-faint"> · {detail.agent_contract_weeks_left}w left</span>
          </Field>
          <Field label="Market value">
            <Money value={detail.market_value} />
          </Field>
          <Field label="Asking price">
            <Money value={detail.asking_price} />
          </Field>
        </div>

        {report && (
          <div className="mt-3 flex flex-wrap gap-8 border-t border-line pt-3">
            <div>
              <div className="mb-0.5 text-[11px] uppercase tracking-wider text-faint">Ability</div>
              <RangeBar
                low={report.ability_low}
                high={report.ability_high}
                confidence={report.confidence}
              />
            </div>
            <div>
              <div className="mb-0.5 text-[11px] uppercase tracking-wider text-faint">
                Potential
              </div>
              <RangeBar
                low={report.potential_low}
                high={report.potential_high}
                confidence={report.confidence}
              />
            </div>
          </div>
        )}
      </section>

      {/* Approaches */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">
          Approaches
        </h2>
        <InterestCards detail={detail} autoNegotiate={autoNegotiate} />
      </section>

      {/* Actions */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Actions</h2>
        <ClientActions detail={detail} />
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mr-2 text-xs text-faint">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function ordinal(n: number): string {
  if (n <= 0) return "";
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return suffix[(v - 20) % 10] || suffix[v] || suffix[0];
}
