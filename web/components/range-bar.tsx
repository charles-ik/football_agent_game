// The range bar — the most visually distinctive component in the game.
// Ability 61–74 is drawn as a bar, not text: the uncertainty *is* the
// mechanic. The bar's width is the spread, its position the band, and it is
// labelled with the confidence word from the API. A narrow bar feels earned.

const CONFIDENCE_TONE: Record<string, string> = {
  certain: "bg-good",
  confident: "bg-accent",
  "rough idea": "bg-warn",
  guesswork: "bg-faint",
};

export function RangeBar({
  low,
  high,
  confidence,
  scaleMax = 100,
  showLabel = true,
}: {
  low: number;
  high: number;
  confidence?: string;
  scaleMax?: number;
  showLabel?: boolean;
}) {
  const left = Math.max(0, Math.min(100, (low / scaleMax) * 100));
  const width = Math.max(1.5, Math.min(100 - left, ((high - low) / scaleMax) * 100));
  const tone = CONFIDENCE_TONE[confidence ?? ""] ?? "bg-faint";
  return (
    <div className="min-w-28" title={confidence ? `${low}–${high} — ${confidence}` : `${low}–${high}`}>
      <div className="relative h-2 w-full rounded bg-panel-2">
        <div
          className={`absolute h-2 rounded transition-[left,width] duration-700 ease-out motion-reduce:transition-none ${tone}`}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-0.5 flex justify-between gap-2 text-[11px] leading-tight">
          <span className="num text-dim">
            {Math.round(low)}–{Math.round(high)}
          </span>
          {confidence && <span className="text-faint">{confidence}</span>}
        </div>
      )}
    </div>
  );
}
