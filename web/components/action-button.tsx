"use client";

// The standard mutation button: runs a Server Action returning an
// ActionResultDTO, toasts the message in the game's voice (amber for a
// refusal, green for a success), and disables itself while in flight.

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

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
  action: () => Promise<ActionResultDTO>;
  children: ReactNode;
  kind?: "primary" | "secondary" | "danger";
  className?: string;
  /** If set, a one-click confirm step is required before firing. */
  confirm?: string;
  disabled?: boolean;
}) {
  const { toastResult, toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const fire = () => {
    if (confirm && !window.confirm(confirm)) return;
    startTransition(async () => {
      try {
        const result = await action();
        toastResult(result);
        router.refresh();
      } catch (error) {
        toast(error instanceof Error ? error.message : "Something broke.", "bad");
      }
    });
  };

  const styles =
    kind === "primary"
      ? "bg-accent text-ink hover:bg-accent/90 font-semibold"
      : kind === "danger"
        ? "border border-bad/50 text-bad hover:bg-bad/10"
        : "border border-line text-fg hover:bg-panel-2";

  return (
    <button
      onClick={fire}
      disabled={pending || disabled}
      className={`rounded px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {pending ? "…" : children}
    </button>
  );
}
