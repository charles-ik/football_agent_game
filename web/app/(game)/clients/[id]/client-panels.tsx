"use client";

// Approaches and the action bar.
//
// Every interest card carries the warning plainly — one negotiation per
// approach, and naming a number spends it. In the terminal that was a dim line
// of text you had to read before typing; with a mouse it is far too easy to
// click something irreversible, so here it is a persistent, coloured note
// sitting directly above the button that does it.

import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";

import { ActionButton } from "@/components/action-button";
import { Money } from "@/components/money";
import {
  NegotiationDialog,
  type NegotiationRequest,
} from "@/components/negotiation/negotiation-dialog";
import { useToast } from "@/components/toaster";
import { Badge, EmptyState, Panel, buttonClass, cn } from "@/components/ui";
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
  const currentWage = detail.wage?.amount ?? 0;

  // Decision deep-links land here: /clients/{id}?negotiate={interest_id} opens
  // the deal dialog straight into that approach. If it can no longer be
  // negotiated, say why rather than silently doing nothing.
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

  if (detail.interests.length === 0) {
    return (
      <EmptyState
        title="No club is circling."
        hint="Interest arrives on its own when he is playing well, or you can force the issue by putting the word out that he wants to move."
        className="border-0 py-8"
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {detail.interests.map((interest) => {
          const delta = interest.max_wage.amount - currentWage;
          const improves = currentWage > 0 && delta > 0;
          const expiringSoon = interest.expires_in_weeks <= 2;
          return (
            <Panel
              key={interest.id}
              tone={interest.can_negotiate.ok ? "action" : "default"}
              className="flex flex-col p-3.5"
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="flex items-baseline gap-2 font-semibold">
                  {interest.club_name}
                  {interest.is_renewal && <Badge>renewal</Badge>}
                </span>
                <span
                  className={cn(
                    "num flex shrink-0 items-center gap-1 text-xs",
                    expiringSoon ? "text-bad" : "text-faint",
                  )}
                >
                  <Clock size={11} aria-hidden />
                  {interest.expires_in_weeks}w left
                </span>
              </div>

              <dl className="mb-3 space-y-1 text-xs">
                <Line label="Club strength">
                  <span className="num">{Math.round(interest.club_strength)}</span>
                </Line>
                <Line label="Wage ceiling">
                  <span className="flex items-baseline gap-1.5">
                    <Money value={interest.max_wage} className="text-fg" />
                    {currentWage > 0 && (
                      <span className={cn("num text-[11px]", improves ? "text-good" : "text-faint")}>
                        {delta >= 0 ? "▲" : "▼"} on his {detail.wage?.text}
                      </span>
                    )}
                  </span>
                </Line>
                {!interest.is_renewal && interest.max_fee.amount > 0 && (
                  <Line label="Fee ceiling">
                    <Money value={interest.max_fee} className="text-fg" />
                  </Line>
                )}
              </dl>

              <p className="mb-3 flex items-start gap-1.5 rounded-md border border-warn/25 bg-warn/[0.06] px-2 py-1.5 text-[11px] leading-snug text-warn">
                <AlertTriangle size={12} className="mt-px shrink-0" aria-hidden />
                One negotiation per approach. Naming a number spends it, and a walk-away cannot be
                re-rolled.
              </p>

              <div className="mt-auto">
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
                    className={cn(buttonClass.primary, "w-full")}
                  >
                    Open talks with {interest.club_name}
                  </button>
                ) : (
                  <p className="text-xs text-faint">{interest.can_negotiate.reason}</p>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
      <NegotiationDialog request={request} onClose={() => setRequest(null)} />
    </>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-dim">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ClientActions({ detail }: { detail: ClientDetail }) {
  const [request, setRequest] = useState<NegotiationRequest | null>(null);
  const playerId = detail.player.id;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {detail.player.seeking_move ? (
          <ActionButton action={() => stopSeeking(playerId)}>Take him off the market</ActionButton>
        ) : (
          <>
            <ActionButton action={() => seekMove(playerId, false)}>Seek a move</ActionButton>
            <ActionButton
              action={() => seekMove(playerId, true)}
              confirm={`Promise ${detail.player.name} a move? It brings clubs in faster — but if nothing lands, he will hold it against you and his trust will fall.`}
            >
              Seek &amp; promise
            </ActionButton>
          </>
        )}
        <button
          onClick={() => setRequest({ kind: "renewal", playerId })}
          disabled={!detail.can_renew.ok}
          title={detail.can_renew.ok ? "" : detail.can_renew.reason}
          className={buttonClass.secondary}
        >
          Re-sign him ({detail.agent_contract_weeks_left}w left)
        </button>
        <ActionButton
          kind="danger"
          action={() => releaseClient(playerId)}
          confirm={`Release ${detail.player.name}? You lose the retainer, you lose any commission he would have brought, and word gets round — there is a reputation cost.`}
        >
          Release him
        </ActionButton>
      </div>
      {!detail.can_renew.ok && <p className="t-note">{detail.can_renew.reason}</p>}
      <NegotiationDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
