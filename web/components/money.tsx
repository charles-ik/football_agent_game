// Money renders the API's preformatted text — format_money's voice ("£1.45M",
// "£420") is part of the game and is never reimplemented here.

import type { Money as MoneyValue } from "@/lib/types";

export function Money({
  value,
  signed = false,
  className = "",
}: {
  value: MoneyValue | null | undefined;
  /** When true, negative amounts render red and positive green. */
  signed?: boolean;
  className?: string;
}) {
  if (!value) return <span className={`num text-faint ${className}`}>—</span>;
  let tone = "";
  if (signed) {
    tone = value.amount < 0 ? "text-bad" : value.amount > 0 ? "text-good" : "text-dim";
  }
  return <span className={`num ${tone} ${className}`}>{value.text}</span>;
}

/** Percentages ship as fractions; rendering one is display formatting only. */
export function Pct({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`num ${className}`}>{(value * 100).toFixed(1)}%</span>;
}
