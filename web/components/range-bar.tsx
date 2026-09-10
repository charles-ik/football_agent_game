// The range bar — the most important component in the game.
//
// Ability is never a number here. "61–74, confident" is drawn as a band on a
// track, because the uncertainty *is* the mechanic: the width is your
// ignorance, and watching a player for five weeks visibly narrows it. That
// narrowing is the one thing this interface can do that the terminal could
// not, so the bar animates between values rather than snapping.
//
// Confidence drives the colour, and the colour is always accompanied by the
// confidence word — a player who cannot distinguish green from amber still
// reads "certain" versus "guesswork".

const CONFIDENCE_TONE: Record<string, { fill: string; glow: string; text: string }> = {
  certain: { fill: "bg-good", glow: "shadow-[0_0_10px_-1px_rgb(74_222_128/0.55)]", text: "text-good" },
  confident: { fill: "bg-accent", glow: "shadow-[0_0_10px_-1px_rgb(110_123_255/0.55)]", text: "text-accent" },
  "rough idea": { fill: "bg-warn", glow: "shadow-[0_0_10px_-1px_rgb(240_180_74/0.45)]", text: "text-warn" },
  guesswork: { fill: "bg-faint", glow: "", text: "text-faint" },
};

const FALLBACK = { fill: "bg-faint", glow: "", text: "text-faint" };

export function RangeBar({
  low,
  high,
  confidence,
  scaleMax = 100,
  showLabel = true,
  size = "md",
}: {
  low: number;
  high: number;
  confidence?: string;
  scaleMax?: number;
  showLabel?: boolean;
  /** `lg` is for the detail screens, where the bar is the subject not a cell. */
  size?: "md" | "lg";
}) {
  const left = Math.max(0, Math.min(100, (low / scaleMax) * 100));
  // A perfectly known value still needs to be visible, hence the floor. Without
  // it, "certain" renders as nothing at all, which reads as missing data.
  const width = Math.max(1.5, Math.min(100 - left, ((high - low) / scaleMax) * 100));
  const tone = CONFIDENCE_TONE[confidence ?? ""] ?? FALLBACK;
  const spread = Math.round(high - low);
  const label = confidence ? `${low}–${high} — ${confidence}` : `${low}–${high}`;

  return (
    <div className={size === "lg" ? "min-w-56" : "min-w-32"} title={label}>
      <div
        className={`relative w-full overflow-hidden rounded-full border border-line/70 bg-panel-2 ${
          size === "lg" ? "h-3" : "h-2"
        }`}
        role="img"
        aria-label={`Range ${Math.round(low)} to ${Math.round(high)}${
          confidence ? `, ${confidence}` : ""
        }`}
      >
        {/* Quarter ticks. They give the band something to be read against —
            without them a floating bar carries position but no magnitude. */}
        {[25, 50, 75].map((tick) => (
          <span
            key={tick}
            aria-hidden
            className="absolute top-0 h-full w-px bg-line/80"
            style={{ left: `${tick}%` }}
          />
        ))}
        <div
          data-range-fill=""
          className={`absolute h-2 rounded-full transition-[left,width] duration-700 ease-out motion-reduce:transition-none ${tone.fill} ${tone.glow} ${
            size === "lg" ? "!h-3" : ""
          }`}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex items-baseline justify-between gap-2 text-[17px] leading-tight">
          <span className="num text-fg">
            {Math.round(low)}–{Math.round(high)}
          </span>
          {confidence ? (
            <span className={tone.text}>
              {confidence}
              {spread > 0 && <span className="num ml-1 text-faint">±{Math.round(spread / 2)}</span>}
            </span>
          ) : (
            spread > 0 && <span className="num text-faint">±{Math.round(spread / 2)}</span>
          )}
        </div>
      )}
    </div>
  );
}
