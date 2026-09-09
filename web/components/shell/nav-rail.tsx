"use client";

// The left rail. Navigation is permanent and vertical rather than a row of
// links above the content, because it has to carry per-section counts and a
// horizontal strip has nowhere to put them without becoming noise.
//
// The number keys from the CLI are preserved and shown, since anyone who
// played the terminal version already has them in their fingers.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Building2,
  LayoutDashboard,
  Search,
  Trophy,
  Users,
} from "lucide-react";

import { cn } from "@/components/ui";

export const NAV = [
  { href: "/", label: "Dashboard", key: "1", Icon: LayoutDashboard },
  { href: "/clients", label: "Clients", key: "2", Icon: Users },
  { href: "/scouting", label: "Scouting", key: "3", Icon: Search },
  { href: "/headquarters", label: "Premises", key: "4", Icon: Building2 },
  { href: "/finances", label: "Finances", key: "5", Icon: Banknote },
  { href: "/leagues", label: "Leagues", key: "6", Icon: Trophy },
] as const;

export function NavRail({
  counts,
  agencyName,
}: {
  counts: Record<string, number>;
  agencyName: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-line bg-panel/60 backdrop-blur md:flex md:w-[68px] xl:w-[212px]"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded bg-accent/15 text-[13px] font-bold text-accent"
        >
          {agencyName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden truncate text-sm font-semibold tracking-tight xl:block">
          {agencyName}
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV.map(({ href, label, key, Icon }) => {
          // `/clients/12` should still light up Clients.
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const count = counts[href] ?? 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-panel-3 font-medium text-fg"
                    : "text-dim hover:bg-panel-2 hover:text-fg",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent"
                  />
                )}
                <Icon size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
                <span className="hidden flex-1 truncate xl:block">{label}</span>
                {count > 0 && (
                  <span
                    className="num absolute right-1.5 top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-ink xl:static"
                    aria-label={`${count} awaiting you`}
                  >
                    {count}
                  </span>
                )}
                {/* The CLI's number keys. Drawn as a key cap so it can never be
                    mistaken for a count — an unstyled digit sitting where a
                    badge goes reads as "5 things need you". */}
                <kbd
                  aria-hidden
                  className="hidden rounded border border-line bg-panel-2 px-1 font-mono text-[10px] leading-4 text-faint xl:block"
                >
                  {key}
                </kbd>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The same navigation as a horizontal strip, for viewports too narrow for a rail. */
export function NavStrip({ counts }: { counts: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sections"
      className="flex gap-1 overflow-x-auto border-b border-line bg-panel/80 px-2 py-1.5 backdrop-blur md:hidden"
    >
      {NAV.map(({ href, label, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const count = counts[href] ?? 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
              active ? "bg-panel-3 font-medium text-fg" : "text-dim hover:bg-panel-2",
            )}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden />
            {label}
            {count > 0 && (
              <span className="num rounded-full bg-accent px-1.5 text-[10px] font-bold text-ink">
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
