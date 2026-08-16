"use client";

import { useRouter } from "next/navigation";

import { Money, Pct } from "@/components/money";
import { RangeBar } from "@/components/range-bar";
import { TrustMeter } from "@/components/trust-meter";
import type { ClientRow } from "@/lib/types";

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-2 py-2 font-medium">Age</th>
          <th className="px-2 py-2 font-medium">Pos</th>
          <th className="px-2 py-2 font-medium">Club</th>
          <th className="px-2 py-2 font-medium">Ability</th>
          <th className="px-2 py-2 font-medium">Role</th>
          <th className="px-2 py-2 font-medium">Wage</th>
          <th className="px-2 py-2 font-medium">Deal ends</th>
          <th className="px-2 py-2 font-medium">Cut</th>
          <th className="px-2 py-2 font-medium">Trust</th>
          <th className="px-2 py-2 font-medium">Flags</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line/50">
        {clients.map((row) => (
          <tr
            key={row.player.id}
            onClick={() => router.push(`/clients/${row.player.id}`)}
            className="cursor-pointer hover:bg-panel-2"
          >
            <td className="px-3 py-2 font-medium">{row.player.name}</td>
            <td className="num px-2 py-2 text-dim">{row.player.age}</td>
            <td className="px-2 py-2 text-dim">{row.player.position}</td>
            <td className="px-2 py-2 text-dim">{row.club_name}</td>
            <td className="px-2 py-2">
              {row.report ? (
                <RangeBar
                  low={row.report.ability_low}
                  high={row.report.ability_high}
                  confidence={row.report.confidence}
                />
              ) : (
                <span className="text-faint">—</span>
              )}
            </td>
            <td className="px-2 py-2 text-dim">{row.playing_time}</td>
            <td className="px-2 py-2">
              <Money value={row.wage} />
            </td>
            <td className="num px-2 py-2 text-dim">
              {row.club_contract_weeks_left !== null ? `${row.club_contract_weeks_left}w` : "—"}
            </td>
            <td className="px-2 py-2">
              <Pct value={row.commission_pct} />
            </td>
            <td className="px-2 py-2">
              <TrustMeter trust={row.trust} label={row.trust_label} />
            </td>
            <td className="px-2 py-2">
              <span className="flex flex-wrap gap-1">
                {row.flags.injured_weeks > 0 && (
                  <Flag tone="bad">injured {row.flags.injured_weeks}w</Flag>
                )}
                {row.flags.transfer_listed && <Flag>listed</Flag>}
                {row.flags.seeking_move && <Flag>seeking</Flag>}
                {row.flags.interest_count > 0 && (
                  <Flag tone="accent">
                    {row.flags.interest_count} interested
                  </Flag>
                )}
                {row.flags.agent_contract_expiring && (
                  <Flag tone="accent">you: {row.agent_contract_weeks_left}w</Flag>
                )}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Flag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "accent" | "bad";
}) {
  const styles =
    tone === "accent"
      ? "border-accent/40 text-accent"
      : tone === "bad"
        ? "border-bad/40 text-bad"
        : "border-line text-dim";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${styles}`}>{children}</span>
  );
}
