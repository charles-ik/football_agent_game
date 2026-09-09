// The season at a glance.
//
// The single most expensive mistake in this game is drifting past a transfer
// window: deals can only be struck inside one, commission is the only real
// income, and "next window in 19 weeks" is a number that means nothing until
// you can see how much of the season that is.
//
// So the season is drawn as a bar, the windows as bands on it, and now as a
// marker. It costs one row and removes a whole category of avoidable loss.

import { cn } from "@/components/ui";

export function SeasonTimeline({
  seasonWeek,
  weeksPerSeason,
  windows,
  windowNames,
}: {
  seasonWeek: number;
  weeksPerSeason: number;
  windows: [number, number][];
  windowNames: Record<string, string>;
}) {
  const pct = (week: number) => Math.max(0, Math.min(100, ((week - 1) / weeksPerSeason) * 100));
  const inWindow = windows.some(([start, end]) => seasonWeek >= start && seasonWeek <= end);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="t-label">The season</span>
        <span className="num text-[11px] text-faint">
          week {seasonWeek} of {weeksPerSeason}
        </span>
      </div>

      <div className="relative h-7 w-full overflow-hidden rounded-md border border-line bg-panel-2">
        {windows.map(([start, end]) => (
          <div
            key={start}
            className="absolute top-0 h-full border-x border-accent/30 bg-accent/15"
            style={{ left: `${pct(start)}%`, width: `${pct(end + 1) - pct(start)}%` }}
            title={`${windowNames[String(start)] ?? "Transfer window"}: weeks ${start}–${end}`}
          />
        ))}

        {/* Now. Deliberately the brightest thing on the bar. */}
        <div
          className={cn(
            "absolute top-0 h-full w-0.5",
            inWindow ? "bg-accent" : "bg-fg",
          )}
          style={{ left: `${pct(seasonWeek)}%` }}
        >
          <span className="sr-only">Currently week {seasonWeek}</span>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {windows.map(([start, end]) => (
          <span key={start} className="flex items-center gap-1.5 text-[11px] text-faint">
            <span aria-hidden className="h-2 w-2 rounded-sm bg-accent/40" />
            {windowNames[String(start)] ?? "Window"}
            <span className="num">
              w{start}–{end}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
