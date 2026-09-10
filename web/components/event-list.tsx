// The history feed — what happened, in order. It is memory, not obligation:
// anything still waiting on you is a Decision and lives in its own list.
//
// Two rules keep it readable. Severity drives a colour *and* a glyph, so colour
// is never the only signal. And identical messages repeated across consecutive
// weeks collapse into one row with a count, because a standing condition
// restated every week is what turns a feed into wallpaper.

import Link from "next/link";

import { cn } from "@/components/ui";
import type { EventDTO, Severity } from "@/lib/types";

const SEVERITY_ICON: Record<Severity, string> = {
  info: "·",
  good: "+",
  warning: "!",
  critical: "×",
  action: "▸",
};

// Critical first: the week summary reads worst-news-first, not chronologically.
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  action: 1,
  warning: 2,
  good: 3,
  info: 4,
};

/** Stable sort by severity, worst first — used for the week-summary panel. */
export function sortBySeverity(events: EventDTO[]): EventDTO[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.event.severity] - SEVERITY_RANK[b.event.severity] || a.index - b.index,
    )
    .map((entry) => entry.event);
}

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

/** Which nav section an event belongs to, collapsed to a top-level route. */
export function navRouteForEvent(event: EventDTO): string | null {
  const href = eventHref(event);
  if (!href) return null;
  if (href.startsWith("/clients")) return "/clients";
  if (href.startsWith("/scouting")) return "/scouting";
  return null;
}

/**
 * Collapse runs of the same message into a single entry carrying a repeat
 * count and the week range it covered.
 */
export function collapseRepeats(events: EventDTO[]): { event: EventDTO; repeats: number }[] {
  const out: { event: EventDTO; repeats: number }[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    if (last && last.event.message === event.message) last.repeats += 1;
    else out.push({ event, repeats: 1 });
  }
  return out;
}

export function EventRow({
  event,
  showWeek = false,
  repeats = 1,
}: {
  event: EventDTO;
  showWeek?: boolean;
  repeats?: number;
}) {
  const href = eventHref(event);
  const body = (
    <div className="flex items-baseline gap-2 px-2 py-1.5">
      <span
        className={cn("w-3 shrink-0 text-center text-xs", `sev-${event.severity}`)}
        aria-hidden
      >
        {SEVERITY_ICON[event.severity]}
      </span>
      {showWeek && <span className="num w-9 shrink-0 text-[17px] text-faint">w{event.week}</span>}
      <span className={cn("text-[19px] leading-snug", `sev-${event.severity}`)}>
        {event.message}
        {repeats > 1 && (
          <span className="num ml-1.5 rounded bg-panel-3 px-1 text-[16px] text-faint">
            ×{repeats}
          </span>
        )}
      </span>
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block rounded transition-colors hover:bg-panel-2">
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
      <div className="divide-y divide-line/40">
        {collapseRepeats(events).map(({ event, repeats }, index) => (
          <EventRow key={`${event.week}-${index}`} event={event} showWeek repeats={repeats} />
        ))}
      </div>
    );
  }

  // Grouped by week, newest first, with a sticky week divider so you always
  // know which week the rows you are looking at belong to.
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
          <div className="sticky top-0 z-10 border-b border-line bg-panel/95 px-2 py-1 backdrop-blur">
            <span className="t-label">Week {week}</span>
          </div>
          <div className="divide-y divide-line/40">
            {collapseRepeats(byWeek.get(week) ?? []).map(({ event, repeats }, index) => (
              <EventRow key={index} event={event} repeats={repeats} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
