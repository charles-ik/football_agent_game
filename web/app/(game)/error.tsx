"use client";

// Per-route error boundary, in the game's voice — dry, terse, no apology —
// instead of Next's default overlay. Catches render/data faults thrown by a
// page inside the (game) shell; the header, nav and Continue button (owned by
// the layout) survive because a layout's own errors do not trip its segment's
// error boundary.

import { useEffect } from "react";

export default function GameError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-semibold text-bad">The line to the office dropped.</p>
      <p className="max-w-sm text-xs text-dim">
        Something broke rendering this screen. Nothing was lost — try again.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-accent/90"
      >
        Refresh
      </button>
    </div>
  );
}
