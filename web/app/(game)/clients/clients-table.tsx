"use client";

// The roster. One dense row per client, sortable, because once you are past
// three or four clients the question is always comparative — who is cheapest,
// who is least settled, whose deal runs out first — and a fixed order cannot
// answer all of those.
//
// Ability is a range bar and never a number: he is your client, but your read
// on him is still a read.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Money, Pct } from "@/components/money";
import { RangeBar } from "@/components/range-bar";
import { TrustMeter } from "@/components/trust-meter";
import { Badge, Table, Td, Th, cn } from "@/components/ui";
import type { ClientRow } from "@/lib/types";

type SortKey = "name" | "age" | "wage" | "deal" | "cut" | "trust";

const COLUMNS: { key: SortKey | null; label: string; align?: "right"; className?: string }[] = [
  { key: "name", label: "Name" },
  { key: "age", label: "Age", align: "right" },
  { key: null, label: "Pos" },
  { key: null, label: "Club" },
  { key: null, label: "Ability" },
  { key: null, label: "Role" },
  { key: "wage", label: "Wage", align: "right" },
  { key: "deal", label: "Deal ends", align: "right" },
  { key: "cut", label: "Your cut", align: "right" },
  { key: "trust", label: "Trust" },
  { key: null, label: "Flags" },
];

/** Playing time is the mechanic that makes greed punishable, so a client who
 *  isn't playing must look wrong even in a glanced-at row. */
const ROLE_TONE: Record<string, string> = {
  key: "text-good",
  starter: "text-fg",
  rotation: "text-dim",
  fringe: "text-warn",
  reserve: "text-bad",
};

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);

  const rows = useMemo(() => {
    if (!sort) return clients;
    const value = (row: ClientRow): number | string => {
      switch (sort.key) {
        case "name":
          return row.player.name;
        case "age":
          return row.player.age;
        case "wage":
          return row.wage?.amount ?? 0;
        case "deal":
          return row.club_contract_weeks_left ?? Number.MAX_SAFE_INTEGER;
        case "cut":
          return row.commission_pct;
        case "trust":
          return row.trust;
      }
    };
    return [...clients].sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      const cmp = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return sort.desc ? -cmp : cmp;
    });
  }, [clients, sort]);

  const toggle = (key: SortKey) =>
    setSort((current) =>
      current?.key === key ? { key, desc: !current.desc } : { key, desc: false },
    );

  return (
    <>
      {/* Narrow viewports get a card per client rather than a table that has to
          be scrolled sideways. The columns are the same information, stacked in
          the order you would actually read them. */}
      <ul className="divide-y divide-line/60 md:hidden">
        {rows.map((row) => (
          <li key={row.player.id}>
            <button
              onClick={() => router.push(`/clients/${row.player.id}`)}
              className="w-full px-3.5 py-3 text-left transition-colors hover:bg-panel-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{row.player.name}</span>
                <span className="num shrink-0 text-xs text-faint">
                  {row.player.age} · {row.player.position}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-dim">
                {row.club_name}
                <span className="text-faint"> · </span>
                <span className={ROLE_TONE[row.playing_time] ?? "text-dim"}>
                  {row.playing_time}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <span className="text-dim">
                  Wage <Money value={row.wage} className="text-fg" />
                </span>
                <span className="text-dim">
                  Your cut <Pct value={row.commission_pct} className="text-fg" />
                </span>
                <span className="text-dim">
                  Deal{" "}
                  {row.club_contract_weeks_left === null ? (
                    <span className="text-bad">no club</span>
                  ) : (
                    <span className="num text-fg">{row.club_contract_weeks_left}w</span>
                  )}
                </span>
                <span>
                  <TrustMeter trust={row.trust} label={row.trust_label} />
                </span>
              </div>
              {row.report && (
                <div className="mt-2">
                  <RangeBar
                    low={row.report.ability_low}
                    high={row.report.ability_high}
                    confidence={row.report.confidence}
                  />
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {row.flags.injured_weeks > 0 && (
                  <Badge tone="bad">injured {row.flags.injured_weeks}w</Badge>
                )}
                {row.flags.transfer_listed && <Badge tone="warn">listed</Badge>}
                {row.flags.seeking_move && <Badge>seeking</Badge>}
                {row.flags.interest_count > 0 && (
                  <Badge tone="accent">{row.flags.interest_count} interested</Badge>
                )}
                {row.flags.agent_contract_expiring && (
                  <Badge tone="accent">you: {row.agent_contract_weeks_left}w</Badge>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
    <Table>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <Th key={column.label} align={column.align} className={column.className}>
              {column.key ? (
                <button
                  onClick={() => toggle(column.key!)}
                  className={cn(
                    "inline-flex items-center gap-1 transition-colors hover:text-fg",
                    sort?.key === column.key && "text-fg",
                  )}
                >
                  {column.label}
                  {sort?.key === column.key &&
                    (sort.desc ? (
                      <ArrowDown size={11} aria-hidden />
                    ) : (
                      <ArrowUp size={11} aria-hidden />
                    ))}
                </button>
              ) : (
                column.label
              )}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.player.id}
            onClick={() => router.push(`/clients/${row.player.id}`)}
            className="cursor-pointer transition-colors hover:bg-panel-2"
          >
            <Td className="font-medium">{row.player.name}</Td>
            <Td align="right" className="num text-dim">
              {row.player.age}
            </Td>
            <Td className="text-dim">{row.player.position}</Td>
            <Td className="text-dim">{row.club_name}</Td>
            <Td>
              {row.report ? (
                <RangeBar
                  low={row.report.ability_low}
                  high={row.report.ability_high}
                  confidence={row.report.confidence}
                />
              ) : (
                <span className="text-faint">—</span>
              )}
            </Td>
            <Td className={ROLE_TONE[row.playing_time] ?? "text-dim"}>{row.playing_time}</Td>
            <Td align="right">
              <Money value={row.wage} />
            </Td>
            <Td align="right">
              {row.club_contract_weeks_left === null ? (
                <span className="text-bad">no club</span>
              ) : (
                <span
                  className={cn(
                    "num",
                    row.club_contract_weeks_left <= 26 ? "text-warn" : "text-dim",
                  )}
                >
                  {row.club_contract_weeks_left}w
                </span>
              )}
            </Td>
            <Td align="right">
              <Pct value={row.commission_pct} />
            </Td>
            <Td>
              <TrustMeter trust={row.trust} label={row.trust_label} />
            </Td>
            <Td>
              <span className="flex flex-wrap gap-1">
                {row.flags.injured_weeks > 0 && (
                  <Badge tone="bad">injured {row.flags.injured_weeks}w</Badge>
                )}
                {row.flags.transfer_listed && <Badge tone="warn">listed</Badge>}
                {row.flags.seeking_move && <Badge>seeking</Badge>}
                {row.flags.interest_count > 0 && (
                  <Badge tone="accent">
                    {row.flags.interest_count} interested
                  </Badge>
                )}
                {row.flags.agent_contract_expiring && (
                  <Badge tone="accent" title="Your agreement with him is running out">
                    you: {row.agent_contract_weeks_left}w
                  </Badge>
                )}
              </span>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
      </div>
    </>
  );
}
