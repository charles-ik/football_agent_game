// Shared UI primitives.
//
// Before these existed, every screen hand-rolled its own panel, its own table
// header and its own badge, which is why no two screens quite matched. The
// point of this file is that a panel is a panel everywhere, so density,
// spacing and colour stay consistent without anyone having to remember the
// class strings.

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Join class names, dropping anything falsy. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------
 * Surfaces
 * ---------------------------------------------------------------------- */

export function Panel({
  children,
  className = "",
  tone = "default",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  /** `action` marks a panel that is asking something of the player. */
  tone?: "default" | "action" | "bad" | "warn";
  as?: "div" | "section" | "article" | "aside";
}) {
  const border =
    tone === "action"
      ? "border-accent/35"
      : tone === "bad"
        ? "border-bad/35"
        : tone === "warn"
          ? "border-warn/35"
          : "border-line";
  return (
    <As
      className={cn(
        "min-w-0 rounded-[10px] border bg-panel shadow-[0_1px_0_0_rgb(255_255_255/0.02)_inset]",
        border,
        className,
      )}
    >
      {children}
    </As>
  );
}

/** A panel with a titled header strip. Actions sit on the right of the strip. */
export function PanelSection({
  title,
  note,
  actions,
  children,
  tone = "default",
  className = "",
  bodyClassName = "p-4",
}: {
  title: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: "default" | "action" | "bad" | "warn";
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Panel tone={tone} className={cn("overflow-hidden", className)} as="section">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-panel-2/60 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="t-section">{title}</h2>
          {note && <p className="t-note mt-0.5">{note}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </Panel>
  );
}

/** The screen-level heading. One per route. */
export function ScreenHeader({
  title,
  note,
  actions,
}: {
  title: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="t-title">{title}</h1>
        {note && <p className="t-note mt-1 max-w-prose">{note}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Data display
 * ---------------------------------------------------------------------- */

/**
 * A headline figure. `tone` colours the value, not the label — the label is
 * always quiet so a row of these scans as numbers first.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "accent";
  className?: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : tone === "accent"
            ? "text-accent"
            : "text-fg";
  return (
    <Panel className={cn("px-4 py-3", className)}>
      <div className="t-label">{label}</div>
      <div className={cn("num mt-1.5 break-words text-xl font-semibold leading-tight", toneClass)}>{value}</div>
      {sub && <div className="t-note mt-1.5">{sub}</div>}
    </Panel>
  );
}

/** A small labelled badge. Colour always travels with a word. */
export function Badge({
  children,
  tone = "neutral",
  title,
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "good" | "warn" | "bad";
  title?: string;
  className?: string;
}) {
  const styles = {
    neutral: "border-line bg-panel-2 text-dim",
    accent: "border-accent/40 bg-accent/10 text-accent",
    good: "border-good/35 bg-good/10 text-good",
    warn: "border-warn/35 bg-warn/10 text-warn",
    bad: "border-bad/35 bg-bad/10 text-bad",
  }[tone];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[17px] leading-tight",
        styles,
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A definition row inside a detail panel. Label left, value right-aligned so a
 * stack of them forms a readable column of figures.
 */
export function Field({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-line/50 py-1.5 last:border-0",
        className,
      )}
    >
      <dt className="shrink-0 text-xs text-dim">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Tables
 *
 * Kept as real <table> markup — this is tabular data and screen readers
 * should be told so. The shared pieces exist only to keep row height,
 * alignment and header treatment identical everywhere.
 * ---------------------------------------------------------------------- */

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
  ...rest
}: ComponentProps<"th"> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "t-label whitespace-nowrap border-b border-line bg-panel-2/60 px-3 py-2",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
  ...rest
}: ComponentProps<"td"> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "border-b border-line/40 px-3 py-2.5 align-middle",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/* -------------------------------------------------------------------------
 * States
 * ---------------------------------------------------------------------- */

/**
 * An empty state always says what is missing *and* what to do about it. A bare
 * "nothing here" leaves a new player stuck on a black screen with no next move.
 */
export function EmptyState({
  title,
  hint,
  action,
  className = "",
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[10px] border border-dashed border-line px-6 py-12 text-center",
        className,
      )}
    >
      <p className="text-sm text-dim">{title}</p>
      {hint && <p className="t-note mt-1 max-w-sm">{hint}</p>}
      {action && (
        <Link
          href={action.href}
          className={cn(buttonClass.secondary, "mt-4")}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** A skeleton block for loading states. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-panel-2", className)} />;
}

/* -------------------------------------------------------------------------
 * Form controls
 *
 * Shared class strings rather than wrapper components: these are used inside
 * dialogs alongside plain labels, and a component per input would add
 * indirection without removing any real duplication.
 * ---------------------------------------------------------------------- */

export const inputClass =
  "min-w-0 max-w-full w-full rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent focus:bg-panel-3";

export const buttonClass = {
  primary:
    "min-h-10 rounded-lg border border-accent bg-accent px-4 py-2 text-base font-semibold text-ink shadow-[0_3px_0_0_var(--color-accent-deep),0_8px_18px_rgb(0_0_0/0.22)] transition-[background-color,border-color,color,box-shadow] hover:bg-[#e2d29a] hover:shadow-[0_4px_0_0_var(--color-accent-deep),0_10px_22px_rgb(0_0_0/0.3)] active:shadow-[0_1px_0_0_var(--color-accent-deep)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:transform-none",
  secondary:
    "min-h-10 rounded-lg border border-accent/65 bg-accent/15 px-4 py-2 text-base font-semibold text-accent shadow-[0_2px_0_0_rgb(0_0_0/0.35),0_6px_14px_rgb(0_0_0/0.16)] transition-[background-color,border-color,color,box-shadow] hover:border-accent hover:bg-accent/25 hover:text-fg active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:transform-none",
  ghost:
    "min-h-10 rounded-lg border border-line-strong bg-panel-2/75 px-3 py-2 text-base font-medium text-dim shadow-[0_2px_0_0_rgb(0_0_0/0.25)] transition-[background-color,border-color,color,box-shadow] hover:border-accent/60 hover:bg-panel-3 hover:text-fg active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:transform-none",
  danger:
    "min-h-10 rounded-lg border border-bad/70 bg-bad/10 px-4 py-2 text-base font-semibold text-bad shadow-[0_2px_0_0_rgb(0_0_0/0.3)] transition-[background-color,border-color,color,box-shadow] hover:border-bad hover:bg-bad/20 hover:text-fg active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:transform-none",
};
