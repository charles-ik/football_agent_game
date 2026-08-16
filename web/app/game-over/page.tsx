// Game over — full-screen, red-bordered, reading as the end of a story rather
// than an error dialog. The engine warns, then downsizes, then ends the run;
// by the time anyone sees this, they know why.

import Link from "next/link";
import { redirect } from "next/navigation";

import { Money } from "@/components/money";
import { getGameState, isApiError } from "@/lib/api";

export default async function GameOverPage() {
  let state;
  try {
    state = await getGameState();
  } catch (error) {
    if (isApiError(error, "session_not_found")) redirect("/new-game");
    throw error;
  }
  if (!state.game_over) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg rounded border-2 border-bad/60 bg-panel p-8 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-bad">
          Game over
        </p>
        <h1 className="mb-4 text-xl font-bold">{state.game_over_reason}</h1>
        <dl className="mx-auto mb-6 grid max-w-xs grid-cols-2 gap-y-2 text-sm">
          <dt className="text-left text-dim">Agency</dt>
          <dd className="text-right">{state.agency.name}</dd>
          <dt className="text-left text-dim">Season reached</dt>
          <dd className="num text-right">{state.calendar.season}</dd>
          <dt className="text-left text-dim">Final reputation</dt>
          <dd className="num text-right">
            {state.agency.reputation}{" "}
            <span className="text-faint">({state.agency.reputation_label})</span>
          </dd>
          <dt className="text-left text-dim">Lifetime commission</dt>
          <dd className="num text-right">
            <Money value={state.agency.total_commission} />
          </dd>
        </dl>
        <Link
          href="/new-game"
          className="inline-block rounded bg-accent px-6 py-2 font-semibold text-ink hover:bg-accent/90"
        >
          Start again
        </Link>
      </div>
    </main>
  );
}
