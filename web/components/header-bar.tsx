// The header bar — always visible, a glance away from the central pressure:
// cash next to weekly net, the window state, and the pending-decision count.

import Link from "next/link";

import { Money } from "@/components/money";
import type { GameState } from "@/lib/types";

const NAV = [
  { href: "/", label: "Inbox", key: "1" },
  { href: "/clients", label: "Clients", key: "2" },
  { href: "/scouting", label: "Scouting", key: "3" },
  { href: "/headquarters", label: "Headquarters", key: "4" },
  { href: "/finances", label: "Finances", key: "5" },
  { href: "/leagues", label: "Leagues", key: "6" },
];

export function HeaderBar({
  state,
  navCounts,
}: {
  state: GameState;
  navCounts: Record<string, number>;
}) {
  const { agency, calendar, counts, weekly_net, pending_actions } = state;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2">
        <span className="text-sm font-bold tracking-wide">{agency.name}</span>
        <span className="text-xs text-dim">
          {calendar.description}
          {calendar.window_open && calendar.weeks_until_window_closes !== null && (
            <span className="ml-1 rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">
              window open
            </span>
          )}
          {!calendar.window_open && (
            <span className="ml-1 text-faint">
              (next window in {calendar.weeks_until_next_window}w)
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span>
            <Money value={agency.cash} className="font-semibold" />{" "}
            <Money value={weekly_net} signed className="text-dim" />
            <span className="text-faint">/wk</span>
          </span>
          <span className="text-dim" title={agency.reputation_label}>
            Rep <span className="num text-fg">{agency.reputation}</span>{" "}
            <span className="text-faint">({agency.reputation_label})</span>
          </span>
          <span className="num text-dim" title="Clients / cap">
            Clients{" "}
            <span className={counts.clients >= counts.client_cap ? "text-warn" : "text-fg"}>
              {counts.clients}/{counts.client_cap}
            </span>
          </span>
          <span className="num text-dim" title="Scouts / cap">
            Scouts{" "}
            <span className="text-fg">
              {counts.scouts}/{counts.scout_cap}
            </span>
          </span>
          {pending_actions > 0 && (
            <Link
              href="/"
              className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent hover:bg-accent/25"
            >
              {pending_actions} need{pending_actions === 1 ? "s" : ""} you
            </Link>
          )}
        </div>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-1.5" aria-label="Main">
        {NAV.map((item) => {
          const count = navCounts[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-dim hover:bg-panel-2 hover:text-fg"
            >
              <span className="mr-1 text-faint">{item.key}</span>
              {item.label}
              {count > 0 && (
                <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[16px] font-semibold text-accent">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
