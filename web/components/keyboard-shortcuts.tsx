"use client";

// The CLI's muscle memory, preserved: C continues, 1–6 navigate, Esc closes
// dialogs (the dialogs own that key themselves). Ignored while typing in a
// field or while a dialog is open.
//
// Continue is triggered by dispatching an event rather than clicking an id,
// because the button renders in two positions depending on viewport width and
// only the visible one should act.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { CONTINUE_EVENT } from "@/components/continue-button";
import { NAV } from "@/components/shell/nav-rail";

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]')) return; // dialogs own their keys

      if (event.key === "c" || event.key === "C") {
        window.dispatchEvent(new CustomEvent(CONTINUE_EVENT));
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      const route = NAV[index]?.href;
      if (route && route !== pathname) router.push(route);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname]);

  return null;
}
