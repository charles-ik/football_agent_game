"use client";

// Approaches and the action bar. Every interest card carries the warning
// plainly — one negotiation per approach, and naming a number spends it —
// because a mouse makes it far too easy to click something irreversible.

import { useEffect, useState } from "react";

import { ActionButton } from "@/components/action-button";
import { Money } from "@/components/money";
import {
  NegotiationDialog,
  type NegotiationRequest,
} from "@/components/negotiation/negotiation-dialog";
import { useToast } from "@/components/toaster";
import { releaseClient, seekMove, stopSeeking } from "@/lib/actions";
import type { ClientDetail } from "@/lib/types";

export function InterestCards({
  detail,
  autoNegotiate,
}: {
  detail: ClientDetail;
  autoNegotiate: number | null;
}) {
  const [request, setRequest] = useState<NegotiationRequest | null>(null);
  const { toast } = useToast();

  // Inbox deep-links land here: /clients/{id}?negotiate={interest_id} opens
  // the deal dialog straight into that approach. If the approach can no
  // longer be negotiated, say why instead of silently doing nothing.
  useEffect(() => {
    if (autoNegotiate === null) return;
    const interest = detail.interests.find((i) => i.id === autoNegotiate);
    if (!interest) return;
    if (interest.can_negotiate.ok) {
      setRequest({
        kind: "deal",
        interestId: interest.id,
        clubName: interest.club_name,
        isRenewal: interest.is_renewal,
      });
    } else {
      toast(interest.can_negotiate.reason, "warn");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNegotiate, detail.interests]);

  return (
    <>
      {detail.interests.length === 0 ? (
        <p className="text-sm text-faint">
          No club is circling. Seek a move, or wait for the window.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {detail.interests.map((interest) => (
            <div key={interest.id} className="rounded border border-line bg-panel p-3">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {interest.club_name}
                  {interest.is_renewal && (
                    <span className="ml-2 rounded border border-line px-1.5 py-0.5 text-[11px] text-dim">
                      renewal
                    </span>
                  )}
                </span>
                <span className="num text-xs text-faint">
                  expires in {interest.expires_in_weeks}w
                </span>
              </div>
              <p className="mb-2 text-xs text-dim">
                strength {Math.round(interest.club_strength)} · up to{" "}
                <Money value={interest.max_wage} className="text-fg" />
                /wk
                {!interest.is_renewal && interest.max_fee.amount > 0 && (
                  <>
                    {" "}
                    · fee to <Money value={interest.max_fee} className="text-fg" />
                  </>
                )}
              </p>
              <p className="mb-2 text-[11px] text-warn/80">
                One negotiation per approach — naming a number spends it.
              </p>
              {interest.can_negotiate.ok ? (
                <button
                  onClick={() =>
                    setRequest({
                      kind: "deal",
                      interestId: interest.id,
                      clubName: interest.club_name,
                      isRenewal: interest.is_renewal,
                    })
                  }
                  className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:bg-accent/90"
                >
                  Negotiate
                </button>
              ) : (
                <p className="text-xs text-faint">{interest.can_negotiate.reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
      <NegotiationDialog request={request} onClose={() => setRequest(null)} />
    </>
  );
}

export function ClientActions({ detail }: { detail: ClientDetail }) {
  const [request, setRequest] = useState<NegotiationRequest | null>(null);
  const playerId = detail.player.id;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {detail.player.seeking_move ? (
        <ActionButton action={() => stopSeeking(playerId)}>Take him off the market</ActionButton>
      ) : (
        <>
          <ActionButton action={() => seekMove(playerId, false)}>Seek a move</ActionButton>
          <ActionButton
            action={() => seekMove(playerId, true)}
            confirm={`Promise ${detail.player.name} a move? If it never lands, he will hold it against you.`}
          >
            Seek &amp; promise
          </ActionButton>
        </>
      )}
      <button
        onClick={() => setRequest({ kind: "renewal", playerId })}
        disabled={!detail.can_renew.ok}
        title={detail.can_renew.ok ? "" : detail.can_renew.reason}
        className="rounded border border-line px-3 py-1.5 text-sm text-fg hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Renew deal ({detail.agent_contract_weeks_left}w left)
      </button>
      {!detail.can_renew.ok && (
        <span className="text-xs text-faint">{detail.can_renew.reason}</span>
      )}
      <ActionButton
        kind="danger"
        action={() => releaseClient(playerId)}
        confirm={`Release ${detail.player.name}? There is a reputation cost.`}
      >
        Release
      </ActionButton>
      <NegotiationDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
