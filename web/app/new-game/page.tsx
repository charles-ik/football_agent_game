// New game — agency name, optional seed, save slot. The seed is explained in
// one line and shown on the confirmation, so a good world can be replayed.

import { redirect } from "next/navigation";

import { getGameState, getSaves, isApiError } from "@/lib/api";
import { NewGameForm } from "./new-game-form";

export default async function NewGamePage() {
  // Already playing? The game is a single-session local affair; go there.
  try {
    const state = await getGameState();
    if (state.game_over) redirect("/game-over");
    redirect("/");
  } catch (error) {
    if (!isApiError(error, "session_not_found")) throw error;
  }

  const saves = await getSaves();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      <header className="mb-8">
        <p className="t-label mb-2 text-accent">An agency, from nothing</p>
        <h1 className="text-3xl font-semibold tracking-tight">Football Agent</h1>
        <p className="mt-2 max-w-prose text-sm text-dim">
          Scout on incomplete information, sign clients by negotiating your cut, and manage
          their careers — and their trust in you — for a share of every move.
        </p>
        {/* The three rules the game rests on. A new player who does not know
            these loses the first run without understanding why. */}
        <ul className="mt-5 grid gap-2 sm:grid-cols-3">
          <Rule title="Reports are ranges">
            You never see a number, only a band. Better scouts narrow it — signing is always
            a bet.
          </Rule>
          <Rule title="One negotiation each">
            Naming a number spends it. Push too hard and the deal dies for good.
          </Rule>
          <Rule title="Playing time punishes greed">
            Park a client somewhere too good for him and he rots, stops improving, and turns
            on you.
          </Rule>
        </ul>
      </header>
      <NewGameForm saves={saves} />
    </main>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-line bg-panel px-3 py-2.5">
      <p className="text-xs font-semibold text-fg">{title}</p>
      <p className="t-note mt-1">{children}</p>
    </li>
  );
}
