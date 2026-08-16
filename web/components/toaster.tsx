"use client";

// A minimal toast system for ActionResult messages — ok renders green, a
// refusal renders amber. This is ephemeral UI chrome, not game state.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Toast = { id: number; message: string; tone: "good" | "warn" | "bad" };

type ToastContextValue = {
  toast: (message: string, tone?: Toast["tone"]) => void;
  toastResult: (result: { ok: boolean; message: string }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside <Toaster>");
  return ctx;
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Toast["tone"] = "good") => {
    if (!message) return;
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      toastResult: (result) => toast(result.message, result.ok ? "good" : "warn"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-96 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded border px-3 py-2 text-sm shadow-lg shadow-black/40 ${
              t.tone === "good"
                ? "border-line bg-panel text-good"
                : t.tone === "warn"
                  ? "border-line bg-panel text-warn"
                  : "border-line bg-panel text-bad"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
