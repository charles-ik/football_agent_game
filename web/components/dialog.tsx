"use client";

// A minimal modal dialog — the only primitives the plan asks for, hand-rolled
// in the shadcn style rather than adopting a component library wholesale.
// Esc closes; a click on the backdrop closes. Focus is trapped inside while
// open and restored to whatever opened it on close — the accessibility floor
// for a modal flow that otherwise strands keyboard and screen-reader users.

import { useEffect, useRef, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
  side = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  side?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const focusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (focusable ?? panelRef.current)?.focus();
    return () => {
      openerRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-40 flex bg-black/70 backdrop-blur-sm ${side ? "justify-end" : "items-center justify-center p-4"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`anim-rise max-h-[85vh] overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl shadow-black/70 outline-none ${
          side ? "h-dvh max-h-dvh w-full rounded-none sm:max-w-2xl" : wide ? "w-full max-w-2xl" : "w-full max-w-md"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel/95 px-4 py-3 backdrop-blur">
          <h2 className="t-section">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className={buttonClass.ghost}
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
