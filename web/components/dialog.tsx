"use client";

// A minimal modal dialog — the only primitives the plan asks for, hand-rolled
// in the shadcn style rather than adopting a component library wholesale.
// Esc closes; a click on the backdrop closes.

import { useEffect, type ReactNode } from "react";

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[85vh] overflow-y-auto rounded border border-line bg-panel shadow-2xl shadow-black/60 ${
          wide ? "w-full max-w-2xl" : "w-full max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 py-0.5 text-dim hover:bg-panel-2 hover:text-fg"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-3">{children}</div>
      </div>
    </div>
  );
}
