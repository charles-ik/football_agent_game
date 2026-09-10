// The game shell — three zones, present on every screen.
//
//   ┌──────┬───────────────────────────┬──────────────┐
//   │ nav  │ status bar                │              │
//   │ rail ├───────────────────────────┤  week rail   │
//   │      │ screen content            │  decisions   │
//   │      │                           │  feed        │
//   │      │                           │  [Continue]  │
//   └──────┴───────────────────────────┴──────────────┘
//
// The rails are what make this read as a console rather than a document. They
// also solve a real problem: Continue is irreversible, and with the decisions
// permanently beside it you cannot press past a waiting club without seeing it.
//
// This is also the session boundary — no session means /new-game, a finished
// run means /game-over.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { GameRevision } from "@/components/game-revision";
import { getManagement } from "@/lib/management-api";
import type { CSSProperties } from "react";
import { ContinueButton } from "@/components/continue-button";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { NavRail, NavStrip } from "@/components/shell/nav-rail";
import { StatusBar } from "@/components/shell/status-bar";
import { WeekRail } from "@/components/shell/week-rail";
import { getGameState, getInbox, isApiError } from "@/lib/api";
import type { Decision } from "@/lib/types";

/** Which nav section a decision belongs under, for the rail's badges. */
function sectionFor(decision: Decision): string | null {
  if (decision.href.startsWith("/clients")) return "/clients";
  if (decision.href.startsWith("/scouting")) return "/scouting";
  return null;
}

export default async function GameLayout({ children }: { children: ReactNode }) {
  let state;
  try {
    state = await getGameState();
  } catch (error) {
    if (isApiError(error, "session_not_found")) redirect("/new-game");
    throw error;
  }
  if (state.game_over) redirect("/game-over");

  const [inbox, management] = await Promise.all([getInbox(60), getManagement()]);
  const accentColors: Record<string,string> = {emerald:"#89c6a3",blue:"#91bce4",amber:"#d8bd77",violet:"#beabe1"};
  const decisions = inbox.needs_decision;

  const navCounts: Record<string, number> = {};
  for (const decision of decisions) {
    const section = sectionFor(decision);
    if (section) navCounts[section] = (navCounts[section] ?? 0) + 1;
  }

  return (
    <GameRevision revision={state.revision}><div className="flex min-h-screen" style={{"--color-accent": accentColors[management.identity.accent]} as CSSProperties}>
      <NavRail counts={navCounts} agencyName={state.agency.name} emblem={management.identity.emblem} />

      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBar state={state} />
        <NavStrip counts={navCounts} />
        <main className="min-w-0 flex-1 px-4 py-5 pb-48 md:pb-28 md:px-6 xl:pb-6">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      <WeekRail
        decisions={decisions}
        recent={inbox.recent}
        revision={state.revision}
        pending={state.pending_actions}
      />

      {/* The rail is hidden below xl, so Continue floats there instead. */}
      <ContinueButton revision={state.revision} decisions={decisions} pending={state.pending_actions} variant="floating" />

      <KeyboardShortcuts />
      <RefreshOnFocus />
    </div></GameRevision>
  );
}
