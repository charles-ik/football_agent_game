// The event feed. Severity drives the colour *and* an icon — colour is never
// the only thing distinguishing a row. Events carrying ids deep-link:
// player_id -> client detail, interest_id -> straight into the deal flow.

import Link from "next/link";

import type { EventDTO, Severity } from "@/lib/types";

const SEVERITY_ICON: Record<Severity, string> = {
  info: "·",
  good: "+",
  warning: "!",
  critical: "×",
  action: "▸",
};

export function eventHref(event: EventDTO): string | null {
  const playerId = event.data.player_id;
  const interestId = event.data.interest_id;
  if (typeof playerId === "number" && typeof interestId === "number") {
    return `/clients/${playerId}?negotiate=${interestId}`;
  }
  if (typeof playerId === "number") return `/clients/${playerId}`;
  if (typeof event.data.scout_id === "number") return "/scouting";
  return null;
}

export function EventRow({ event, showWeek = false }: { event: EventDTO; showWeek?: boolean }) {
  const href = eventHref(event);
  const body = (
    <div className="flex items-baseline gap-2 px-2 py-1">
      <span className={`sev-${event.severity} w-3 shrink-0 text-center`} aria-hidden>
        {SEVERITY_ICON[event.severity]}
      </span>
      {showWeek && <span className="num w-10 shrink-0 text-xs text-faint">w{event.week}</span>}
      <span className={`text-sm sev-${event.severity === "info" ? "info" : event.severity}`}>
        {event.message}
      </span>
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block rounded hover:bg-panel-2">
      {body}
    </Link>
  );
}

export function EventList({
  events,
  grouped = false,
}: {
  events: EventDTO[];
  grouped?: boolean;
}) {
  if (events.length === 0) return null;
  if (!grouped) {
    return (
      <div className="divide-y divide-line/50">
        {events.map((event, index) => (
          <EventRow key={`${event.week}-${index}`} event={event} showWeek />
        ))}
      </div>
    );
  }
  // Grouped by week, newest first, with a small divider.
  const byWeek = new Map<number, EventDTO[]>();
  for (const event of events) {
    const list = byWeek.get(event.week) ?? [];
    list.push(event);
    byWeek.set(event.week, list);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => b - a);
  return (
    <div>
      {weeks.map((week) => (
        <div key={week}>
          <div className="mt-3 border-b border-line px-2 pb-1 text-[11px] uppercase tracking-wider text-faint">
            Week {week}
          </div>
          <div className="divide-y divide-line/50">
            {(byWeek.get(week) ?? []).map((event, index) => (
              <EventRow key={index} event={event} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
