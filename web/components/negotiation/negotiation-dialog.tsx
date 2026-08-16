"use client";

// The one client-side flow in the app. A haggle is a multi-round conversation
// with no page navigation: the dialog holds the current NegotiationDTO in
// state, calls Server Actions for propose / accept-counter / abandon, and
// replaces state with each response. When it closes, router.refresh() picks
// up the consequences everywhere else.
//
// Nothing here computes a game value — it renders guides, counters, hints and
// outcomes exactly as the API sends them.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toaster";
import {
  abandonNegotiation,
  openDeal,
  openRenewal,
  openSigning,
} from "@/lib/actions";
import { isRefusal, type NegotiationDTO } from "@/lib/types";

import { CommissionHaggle } from "./commission-haggle";
import { PackageHaggle } from "./package-haggle";

export type NegotiationRequest =
  | { kind: "signing" | "renewal"; playerId: number }
  | { kind: "deal"; interestId: number; clubName: string; isRenewal: boolean };

export function NegotiationDialog({
  request,
  onClose,
}: {
  request: NegotiationRequest | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toastResult } = useToast();
  const [neg, setNeg] = useState<NegotiationDTO | null>(null);
  const [busy, setBusy] = useState(false);
  // Deals choose a contract length once, up front, before any proposal.
  const [years, setYears] = useState(3);

  const open = request !== null;

  const close = useCallback(() => {
    setNeg(null);
    setYears(3);
    onClose();
    router.refresh(); // consequences land everywhere
  }, [onClose, router]);

  useEffect(() => {
    if (!request || request.kind === "deal") return;
    let cancelled = false;
    setBusy(true);
    const action =
      request.kind === "signing" ? openSigning(request.playerId) : openRenewal(request.playerId);
    action
      .then((body) => {
        if (cancelled) return;
        if (isRefusal(body)) {
          toastResult({ ok: false, message: body.message });
          close();
          return;
        }
        setNeg(body);
      })
      .catch((error) => {
        if (!cancelled) {
          toastResult({
            ok: false,
            message: error instanceof Error ? error.message : "Something broke.",
          });
          close();
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const startDeal = () => {
    if (!request || request.kind !== "deal") return;
    setBusy(true);
    openDeal(request.interestId, years)
      .then((body) => {
        if (isRefusal(body)) {
          toastResult({ ok: false, message: body.message });
          close();
          return;
        }
        setNeg(body);
      })
      .catch((error) => {
        toastResult({
          ok: false,
          message: error instanceof Error ? error.message : "Something broke.",
        });
        close();
      })
      .finally(() => setBusy(false));
  };

  const title = neg
    ? neg.kind === "deal"
      ? `${neg.subject}`
      : `${neg.kind === "signing" ? "Signing" : "Renewal"} — ${neg.subject}`
    : "Negotiation";

  return (
    <Dialog open={open} onClose={close} title={title} wide>
      {request?.kind === "deal" && !neg && (
        <div>
          <p className="mb-1 text-sm text-dim">
            Contract length for {request.clubName}
            {request.isRenewal ? " (renewal — no fee)" : ""}:
          </p>
          <div className="mb-4 flex gap-2">
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setYears(n)}
                className={`num rounded border px-3 py-1.5 text-sm ${
                  years === n
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line text-dim hover:bg-panel-2"
                }`}
              >
                {n} years
              </button>
            ))}
          </div>
          <p className="mb-4 rounded border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
            One negotiation per approach — naming a number spends it.
          </p>
          <button
            onClick={startDeal}
            disabled={busy}
            className="w-full rounded bg-accent px-4 py-2 font-semibold text-ink hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? "…" : "Open talks"}
          </button>
        </div>
      )}

      {(request?.kind === "signing" || request?.kind === "renewal") && !neg && (
        <p className="text-sm text-dim">{busy ? "Opening talks…" : "Preparing…"}</p>
      )}

      {neg && neg.axis === "commission_pct" && (
        <CommissionHaggle neg={neg} onUpdate={setNeg} onClose={close} />
      )}
      {neg && neg.axis === "package" && <PackageHaggle neg={neg} onUpdate={setNeg} onClose={close} />}
    </Dialog>
  );
}
