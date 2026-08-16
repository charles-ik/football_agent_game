"use client";

// The CLI's muscle memory, preserved: C continues, 1–6 navigate, Esc closes
// dialogs (handled by the dialogs themselves). Keys are ignored while typing
// in a field or while a dialog is open.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ROUTES = ["/", "/clients", "/scouting", "/headquarters", "/finances", "/leagues"];

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]')) return; // dialogs own their keys

      if (event.key === "c" || event.key === "C") {
        document.getElementById("continue-button")?.click();
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      if (index >= 0 && index < ROUTES.length && ROUTES[index] !== pathname) {
        router.push(ROUTES[index]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname]);

  return null;
}
