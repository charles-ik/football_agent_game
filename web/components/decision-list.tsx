// The decision list — the single most important surface in the game.
//
// Every item here is an *open obligation*: something the world is currently
// waiting on you for, derived live from state rather than remembered from the
// event feed. That means resolving one makes it vanish, which is what lets the
// list stay short enough to be worth reading.
//
// Ordering comes from the engine (worst and soonest first) and is deliberately
// not re-sorted here — the UI must not have its own opinion about urgency.

import Link from "next/link";

import { Badge, EmptyState, cn } from "@/components/ui";
import type { Decision } from "@/lib/types";

const KIND_LABEL: Record<Decision["kind"], string> = {
  contract_expired: "Out of contract",
  contract_expiring: "Contract ending",
  agent_contract_expiring: "Your agreement",
  approach: "Approach",
};

const SEVERITY_STYLE: Record<string, { border: string; text: string; dot: string }> = {
  critical: { border: "border-l-bad", text: "text-bad", dot: "bg-bad" },
  action: { border: "border-l-accent", text: "text-accent", dot: "bg-accent" },
  warning: { border: "border-l-warn", text: "text-warn", dot: "bg-warn" },
  good: { border: "border-l-good", text: "text-good", dot: "bg-good" },
  info: { border: "border-l-line", text: "text-dim", dot: "bg-dim" },
};

/** How near the deadline is, in words. Weeks alone don't convey pressure. */
function deadline(weeks: number | null): { text: string; tone: "bad" | "warn" | "neutral" } | null {
  if (weeks === null) return null;
  if (weeks <= 0) return { text: "now", tone: "bad" };
  if (weeks === 1) return { text: "1 week left", tone: "bad" };
  if (weeks <= 4) return { text: `${weeks} weeks left`, tone: "warn" };
  return { text: `${weeks} weeks left`, tone: "neutral" };
}

export function DecisionCard({
  decision,
  compact = false,
}: {
  decision: Decision;
  compact?: boolean;
}) {
  const style = SEVERITY_STYLE[decision.severity] ?? SEVERITY_STYLE.info;
  const clock = deadline(decision.weeks_left);
  const delta = decision.extra.wage_delta;
  const improves = decision.extra.improves_terms === true;

  return (
    <Link
      href={decision.href}
      className={cn(
        "group block border-l-2 bg-panel px-3 py-2.5 transition-colors hover:bg-panel-2",
        style.border,
        !decision.actionable && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("t-label", style.text)}>{KIND_LABEL[decision.kind]}</span>
        {clock && (
          <span
            className={cn(
              "num shrink-0 text-[11px]",
              clock.tone === "bad"
                ? "text-bad"
                : clock.tone === "warn"
                  ? "text-warn"
                  : "text-faint",
            )}
          >
            {clock.text}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm font-medium leading-snug text-fg group-hover:text-fg">
        {decision.headline}
      </p>

      {!compact && <p className="t-note mt-1">{decision.detail}</p>}

      {/* Terms are labelled against what he earns now, so a headline wage can
          never be mistaken for an improvement it isn't. */}
      {decision.kind === "approach" && delta && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {decision.extra.max_wage && (
            <Badge tone="neutral" title="The club's ceiling, not an offer on the table">
              <span className="num">{decision.extra.max_wage.text}</span>/wk ceiling
            </Badge>
          )}
          <Badge tone={improves ? "good" : "neutral"}>
            <span className="num">
              {delta.amount >= 0 ? "▲" : "▼"} {delta.text.replace("-", "")}
            </span>{" "}
            {delta.amount >= 0 ? "on now" : "below now"}
          </Badge>
          {decision.extra.is_renewal && <Badge tone="neutral">renewal</Badge>}
        </div>
      )}

      {!decision.actionable && decision.blocked_reason && (
        <p className="t-note mt-1.5 text-warn">{decision.blocked_reason}</p>
      )}
    </Link>
  );
}

export function DecisionList({
  decisions,
  compact = false,
  emptyHint,
}: {
  decisions: Decision[];
  compact?: boolean;
  emptyHint?: string;
}) {
  if (decisions.length === 0) {
    return (
      <EmptyState
        title="Nothing needs you."
        hint={emptyHint ?? "Press Continue and let the week run."}
        className="border-0 py-8"
      />
    );
  }
  return (
    <div className="divide-y divide-line/60">
      {decisions.map((decision) => (
        <DecisionCard key={decision.id} decision={decision} compact={compact} />
      ))}
    </div>
  );
}
