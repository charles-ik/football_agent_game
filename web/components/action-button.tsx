"use client";

// The standard mutation button: runs a Server Action returning an
// ActionResultDTO, toasts the message in the game's voice (amber for a
// refusal, green for a success), and disables itself while in flight. A
// `confirm` prop routes through a small in-voice Dialog rather than the
// browser's native confirm() — same call sites, the game's chrome instead.

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useGameRevision } from "@/components/game-revision";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toaster";
import type { ActionResultDTO } from "@/lib/types";

export function ActionButton({
  action,
  children,
  kind = "secondary",
  className = "",
  confirm,
  disabled = false,
}: {
  action: (revision?: number) => Promise<ActionResultDTO>;
  children: ReactNode;
  kind?: "primary" | "secondary" | "danger";
  className?: string;
  /** If set, a styled confirm step is required before firing. */
  confirm?: string;
  disabled?: boolean;
}) {
  const { toastResult, toast } = useToast();
  const router = useRouter();
  const revision = useGameRevision();
  const inFlight = useRef(false);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const run = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const result = await action(revision);
        toastResult(result);
        router.refresh();
      } catch (error) {
        toast(error instanceof Error ? error.message : "Something broke.", "bad");
        router.refresh();
      } finally { inFlight.current = false; }
    });
  };

  const fire = () => {
    if (confirm) {
      setConfirming(true);
      return;
    }
    run();
  };

  const styles =
    kind === "primary"
      ? "bg-accent text-ink hover:bg-accent/90 font-semibold"
      : kind === "danger"
        ? "border border-bad/50 text-bad hover:bg-bad/10"
        : "border border-line text-fg hover:bg-panel-2";

  return (
    <>
      <button
        onClick={fire}
        disabled={pending || disabled}
        className={`rounded px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
      >
        {pending ? "…" : children}
      </button>
      {confirm && (
        <Dialog open={confirming} onClose={() => setConfirming(false)} title="Are you sure?">
          <p className="mb-4 text-sm text-dim">{confirm}</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="rounded border border-line px-3 py-1.5 text-sm text-fg hover:bg-panel-2"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                run();
              }}
              className={`rounded px-3 py-1.5 text-sm font-semibold ${
                kind === "danger"
                  ? "border border-bad/50 text-bad hover:bg-bad/10"
                  : "bg-accent text-ink hover:bg-accent/90"
              }`}
            >
              Confirm
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
