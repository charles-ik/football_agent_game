// Trust is a mood, not a number: the API's label leads, the number is
// secondary, and under 40 the whole thing goes red.

export function TrustMeter({ trust, label }: { trust: number; label: string }) {
  const danger = trust < 40;
  return (
    <div className="flex items-center gap-2" title={`Trust ${Math.round(trust)} — ${label}`}>
      <div className="h-1.5 w-14 rounded bg-panel-2">
        <div
          className={`h-1.5 rounded ${danger ? "bg-bad" : "bg-good"}`}
          style={{ width: `${Math.max(0, Math.min(100, trust))}%` }}
        />
      </div>
      <span className={`text-xs ${danger ? "text-bad" : "text-dim"}`}>
        {label} <span className="num text-faint">{Math.round(trust)}</span>
      </span>
    </div>
  );
}
