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

import { useGameRevision } from "@/components/game-revision";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toaster";
import { buttonClass, cn } from "@/components/ui";
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
  const revision = useGameRevision();
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
      request.kind === "signing" ? openSigning(request.playerId, revision) : openRenewal(request.playerId, revision);
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
    openDeal(request.interestId, years, revision)
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
    <Dialog open={open} onClose={close} title={title} wide side>
      {/* Contract length is chosen once, up front, before any number is named —
          it is not part of the haggle and must not look like it is. */}
      {request?.kind === "deal" && !neg && (
        <div>
          <p className="t-label mb-2">
            Contract length at {request.clubName}
            {request.isRenewal ? " — renewal, no fee" : ""}
          </p>
          <div className="mb-4 grid grid-cols-4 gap-2">
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setYears(n)}
                aria-pressed={years === n}
                className={cn(
                  "num rounded-md border px-3 py-2 text-sm transition-colors",
                  years === n
                    ? "border-accent bg-accent/15 font-semibold text-accent"
                    : "border-line text-dim hover:bg-panel-2 hover:text-fg",
                )}
              >
                {n} years
              </button>
            ))}
          </div>
          <p className="t-note mb-4">
            Longer deals lock in his wage and your commission, but leave him stuck if he outgrows
            the club.
          </p>
          <p className="mb-4 rounded-lg border border-warn/30 bg-warn/[0.06] px-3 py-2.5 text-xs text-warn">
            This is the last step before the point of no return. You get one negotiation with this
            club over this approach — naming a number spends it, whatever comes back.
          </p>
          <button
            onClick={startDeal}
            disabled={busy}
            className={cn(buttonClass.primary, "w-full py-2")}
          >
            {busy ? "Opening…" : "Open talks"}
          </button>
        </div>
      )}

      {(request?.kind === "signing" || request?.kind === "renewal") && !neg && (
        <p className="text-sm text-dim">{busy ? "Opening talks…" : "Preparing…"}</p>
      )}

      {neg && <p className="t-note mb-3">Closing this panel pauses your talks. They lapse when the week advances or after 15 minutes. Use the approach again to resume; walking away ends the negotiation.</p>}
      {neg && neg.axis === "commission_pct" && (
        <CommissionHaggle neg={neg} onUpdate={setNeg} onClose={close} />
      )}
      {neg && neg.axis === "package" && <PackageHaggle neg={neg} onUpdate={setNeg} onClose={close} />}
    </Dialog>
  );
}
