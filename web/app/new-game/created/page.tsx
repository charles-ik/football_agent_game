// The one-time seed confirmation, deliberately on its own route: the
// newGame Server Action sets the session cookie, which makes Next
// auto-refresh whatever route invoked it — showing this on /new-game itself
// would trip straight into that page's "already playing? go to /" redirect
// before the player ever saw the seed. This route carries no such guard.

import Link from "next/link";
import { redirect } from "next/navigation";

export default async function GameCreatedPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string }>;
}) {
  const { seed } = await searchParams;
  const parsedSeed = seed ? Number.parseInt(seed, 10) : NaN;
  if (Number.isNaN(parsedSeed)) redirect("/new-game");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <div className="rounded border border-good/40 bg-panel p-5">
        <h2 className="mb-2 text-sm font-semibold text-good">The agency is open.</h2>
        <p className="mb-1 text-sm text-dim">
          World seed <span className="num font-semibold text-fg">{parsedSeed}</span> — note it
          down. Same seed, same world, if you ever want to replay it.
        </p>
        <Link
          href="/"
          className="mt-4 block w-full rounded bg-accent px-4 py-2 text-center font-semibold text-ink hover:bg-accent/90"
        >
          Start week 1
        </Link>
      </div>
    </main>
  );
}
