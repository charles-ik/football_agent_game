"use client";

// Nothing polls, by design — except the moment the tab regains focus. A
// lunch break away is exactly when the pending-decision count is most likely
// stale (an in-flight window can close, an interest can lapse), so refresh
// the Server Components once when the tab becomes visible again.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  return null;
}
