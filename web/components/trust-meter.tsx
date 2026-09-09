// Trust is a mood, not a number: the engine's label leads and the figure is
// secondary. Under 40 the whole thing goes red, because that is the band where
// a client starts refusing what you ask of him.
//
// The bar is banded rather than continuous — trust is read as "which of these
// is he in", not "what is his exact score", and segments make that comparison
// possible across a column of clients at a glance.

export function TrustMeter({
  trust,
  label,
  size = "md",
}: {
  trust: number;
  label: string;
  size?: "md" | "lg";
}) {
  const danger = trust < 40;
  const shaky = !danger && trust < 60;
  const clamped = Math.max(0, Math.min(100, trust));
  const fill = danger ? "bg-bad" : shaky ? "bg-warn" : "bg-good";
  const text = danger ? "text-bad" : "text-dim";

  return (
    <div
      className="flex items-center gap-2"
      title={`Trust ${Math.round(trust)} — ${label}`}
    >
      <div
        className={`relative overflow-hidden rounded-full border border-line/70 bg-panel-2 ${
          size === "lg" ? "h-2.5 w-32" : "h-1.5 w-16"
        }`}
        role="img"
        aria-label={`Trust ${Math.round(trust)} out of 100, ${label}`}
      >
        {/* The 40 line: the point below which he starts saying no. */}
        <span
          aria-hidden
          className="absolute top-0 z-10 h-full w-px bg-line-strong"
          style={{ left: "40%" }}
        />
        <div
          data-trust-fill=""
          className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${fill}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className={`text-xs ${text}`}>
        {label} <span className="num text-faint">{Math.round(trust)}</span>
      </span>
    </div>
  );
}
