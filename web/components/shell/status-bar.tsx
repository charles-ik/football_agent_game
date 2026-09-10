// The status strip. Everything here is a number you should never have to go
// and look for: cash beside weekly net (the game's central pressure), the
// window state (deals only happen inside it, and missing one costs a season),
// and your standing and capacity.
//
// The old header put six figures and a nav row into two cramped lines of 11px
// text. Here they are grouped, separated and given room, so the eye can find
// one without reading all six.

import { AlertTriangle, CalendarClock, DoorOpen } from "lucide-react";

import { Money } from "@/components/money";
import { cn } from "@/components/ui";
import type { GameState } from "@/lib/types";

export function StatusBar({ state }: { state: GameState }) {
  const { agency, calendar, counts, weekly_net } = state;
  const burning = weekly_net.amount < 0;
  const atClientCap = counts.clients >= counts.client_cap;

  // Runway in weeks. Shown only when it is short enough to be a real threat —
  // "you run out in 1225 weeks" is noise dressed up as a warning.
  const runway =
    burning && weekly_net.amount !== 0
      ? Math.floor(agency.cash.amount / Math.abs(weekly_net.amount))
      : null;
  const runwayCritical = runway !== null && runway <= 26;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-panel/80 px-4 backdrop-blur md:px-5">
      {/* Where you are in the season. */}
      <div className="flex min-w-0 items-center gap-2">
        {calendar.window_open ? (
          <DoorOpen size={15} className="shrink-0 text-accent" aria-hidden />
        ) : (
          <CalendarClock size={15} className="shrink-0 text-faint" aria-hidden />
        )}
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[19px] font-medium">
            Season <span className="num">{calendar.season}</span>
            <span className="text-faint"> · </span>
            week <span className="num">{calendar.season_week}</span>
          </div>
          <div className="truncate text-[17px]">
            {calendar.window_open ? (
              <span className="text-accent">
                {calendar.window_name} open
                {calendar.weeks_until_window_closes !== null && (
                  <span className="num"> · closes in {calendar.weeks_until_window_closes}w</span>
                )}
              </span>
            ) : (
              <span className="num text-faint">
                next window in {calendar.weeks_until_next_window}w
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-4 md:gap-5">
        <Metric label="Cash">
          <Money value={agency.cash} className="text-sm font-semibold" />
        </Metric>

        <Metric label="Weekly net">
          <span className="flex items-center gap-1">
            <Money value={weekly_net} signed className="text-sm font-semibold" />
            {runwayCritical && (
              <AlertTriangle
                size={13}
                className="text-bad"
                aria-hidden
              />
            )}
          </span>
          {runwayCritical && (
            <span className="num sr-only">{runway} weeks of runway</span>
          )}
        </Metric>

        <Metric label="Reputation" className="hidden sm:flex">
          <span className="text-sm">
            <span className="num font-semibold">{agency.reputation}</span>{" "}
            <span className="text-[17px] text-faint">{agency.reputation_label}</span>
          </span>
        </Metric>

        <Metric label="Clients" className="hidden lg:flex">
          <span className={cn("num text-sm font-semibold", atClientCap && "text-warn")}>
            {counts.clients}/{counts.client_cap}
          </span>
        </Metric>

        <Metric label="Scouts" className="hidden lg:flex">
          <span className="num text-sm font-semibold">
            {counts.scouts}/{counts.scout_cap}
          </span>
        </Metric>
      </div>
    </header>
  );
}

function Metric({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-end leading-tight", className)}>
      <span className="t-label">{label}</span>
      <span className="mt-0.5">{children}</span>
    </div>
  );
}
