"use client";

// The left rail. Navigation is permanent and vertical rather than a row of
// links above the content, because it has to carry per-section counts and a
// horizontal strip has nowhere to put them without becoming noise.
//
// The number keys from the CLI are preserved and shown, since anyone who
// played the terminal version already has them in their fingers.

import { useState } from "react";
import { Dialog } from "@/components/dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Building2,
  LayoutDashboard,
  Search,
  Trophy,
  Users,
  Handshake,
  Heart,
  Shield, Star, Crown, Globe2, MoreHorizontal,
} from "lucide-react";

import { cn } from "@/components/ui";

export const NAV = [
  { href: "/", label: "Office", key: "1", Icon: LayoutDashboard },
  { href: "/clients", label: "Clients", key: "2", Icon: Users },
  { href: "/scouting", label: "Scouting", key: "3", Icon: Search },
  { href: "/agency", label: "Agency", key: "4", Icon: Building2 },
  { href: "/finances", label: "Finances", key: "5", Icon: Banknote },
  { href: "/world", label: "World", key: "6", Icon: Trophy },
  { href: "/market", label: "Market", key: "7", Icon: Handshake },
  { href: "/careers", label: "Careers", key: "8", Icon: Heart },
] as const;

export function NavRail({
  counts,
  agencyName,
  emblem = "shield",
}: {
  counts: Record<string, number>;
  agencyName: string;
  emblem?: string;
}) {
  const pathname = usePathname();
  const Emblem = ({shield:Shield,star:Star,crown:Crown,globe:Globe2} as Record<string,typeof Shield>)[emblem] ?? Shield;

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-line bg-panel/60 backdrop-blur md:flex md:w-[68px] xl:w-[212px]"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded bg-accent/15 text-[19px] font-bold text-accent"
        >
          <Emblem size={17}/>
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
                    className="num absolute right-1.5 top-1.5 rounded-full bg-accent px-1.5 text-[16px] font-bold leading-4 text-ink xl:static"
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
                  className="hidden rounded border border-line bg-panel-2 px-1 font-mono text-[16px] leading-4 text-faint xl:block"
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
  const [more,setMore] = useState(false);
  const main = NAV.filter(item => ["/", "/clients", "/market"].includes(item.href));
  return <>
    <nav aria-label="Sections" className="fixed bottom-[108px] left-0 right-0 z-20 grid grid-cols-4 border-t border-line bg-panel/95 px-2 py-1 backdrop-blur md:hidden">
      {main.map(({href,label,Icon})=><Link key={href} href={href} aria-current={pathname===href?"page":undefined} className={cn("flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs",pathname===href?"bg-panel-3 text-accent":"text-dim")}><Icon size={17}/>{label}{(counts[href]??0)>0&&<span className="sr-only">{counts[href]} open decisions</span>}</Link>)}
      <button onClick={()=>setMore(true)} className="flex flex-col items-center gap-1 rounded-lg border border-accent/50 bg-accent/10 px-2 py-2 text-xs font-semibold text-accent shadow-sm"><MoreHorizontal size={17}/>More</button>
    </nav>
    <Dialog open={more} onClose={()=>setMore(false)} title="Around the agency">
      <div className="grid grid-cols-2 gap-2">{NAV.map(({href,label,Icon})=><Link key={href} href={href} onClick={()=>setMore(false)} className="flex items-center gap-2 rounded-lg border border-line p-4 text-sm"><Icon size={17}/>{label}</Link>)}</div>
      <Link href="/season-review" onClick={()=>setMore(false)} className="mt-3 block p-3 text-sm text-accent">Season review & milestones ↗</Link>
    </Dialog>
  </>;
}
