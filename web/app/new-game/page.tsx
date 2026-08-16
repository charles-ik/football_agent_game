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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold tracking-wide">Football Agent</h1>
      <p className="mb-6 text-sm text-dim">
        Build an agency from nothing. Scout on incomplete information, sign clients, take
        your cut.
      </p>
      <NewGameForm saves={saves} />
    </main>
  );
}
