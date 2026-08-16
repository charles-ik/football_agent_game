// The game shell: header bar + nav + the Continue button, on every screen.
// This is also the session boundary — no session means /new-game, a finished
// run means /game-over.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ContinueButton } from "@/components/continue-button";
import { navRouteForEvent } from "@/components/event-list";
import { HeaderBar } from "@/components/header-bar";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { getGameState, getInbox, isApiError } from "@/lib/api";

export default async function GameLayout({ children }: { children: ReactNode }) {
  let state;
  try {
    state = await getGameState();
  } catch (error) {
    if (isApiError(error, "session_not_found")) redirect("/new-game");
    throw error;
  }
  if (state.game_over) redirect("/game-over");

  // Per-item nav badges: how many pending decisions live under each section.
  // Sourced from the inbox the header already implies via pending_actions —
  // no new engine rule, just an extra read of an existing endpoint.
  const inbox = await getInbox(60);
  const navCounts: Record<string, number> = {};
  for (const event of inbox.needs_decision) {
    const route = navRouteForEvent(event);
    if (route) navCounts[route] = (navCounts[route] ?? 0) + 1;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <HeaderBar state={state} navCounts={navCounts} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-24">{children}</main>
      <ContinueButton pending={state.pending_actions} />
      <KeyboardShortcuts />
      <RefreshOnFocus />
    </div>
  );
}
