"use server";

// Writes. Every mutation goes through the API and then invalidates
// everything — a week tick changes the header, inbox, clients, finances and
// the league table at once, and targeted invalidation is not worth the
// reasoning cost.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import {
  actionResultSchema,
  assessSchema,
  continueSchema,
  negotiationSchema,
  newGameSchema,
  openNegotiationSchema,
} from "@/lib/schemas";
import type {
  ActionResultDTO,
  AssessResponse,
  ContinueResponse,
  NegotiationDTO,
  OpenNegotiationResponse,
} from "@/lib/types";

function refresh(): void {
  revalidatePath("/", "layout");
}

/** Map the two redirect-worthy API faults to their screens. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isApiError(error, "session_not_found")) redirect("/new-game");
    if (isApiError(error, "game_over")) redirect("/game-over");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

export async function newGame(
  name: string,
  seed: number | null,
  slot: string,
): Promise<{ seed: number }> {
  const body: Record<string, unknown> = { name, slot };
  if (seed !== null) body.seed = seed;
  const data = await api<{ seed: number }>("/api/game/new", { method: "POST", json: body });
  const parsed = newGameSchema.parse(data);
  refresh();
  return { seed: parsed.seed };
}

export async function loadGame(slot: string): Promise<void> {
  await guard(() => api("/api/game/load", { method: "POST", json: { slot } }));
  refresh();
}

export async function saveGame(slot: string): Promise<ActionResultDTO> {
  const data = await guard(() =>
    api("/api/game/save", { method: "POST", json: { slot } }),
  );
  refresh();
  return { ok: true, message: `Saved to ${slot}.`, events: [] };
}

export async function continueWeek(): Promise<ContinueResponse> {
  const data = await guard(() => api<ContinueResponse>("/api/game/continue", { method: "POST" }));
  const parsed = continueSchema.parse(data);
  refresh();
  return parsed;
}

// ---------------------------------------------------------------------------
// Scouting
// ---------------------------------------------------------------------------

export async function assignScout(
  scoutId: number,
  regionId: string | null,
  briefPosition: string | null,
  briefMaxAge: number | null,
): Promise<ActionResultDTO> {
  const data = await guard(() =>
    api("/api/scouting/assign", {
      method: "POST",
      json: {
        scout_id: scoutId,
        region_id: regionId,
        brief_position: briefPosition,
        brief_max_age: briefMaxAge,
      },
    }),
  );
  refresh();
  return actionResultSchema.parse(data);
}

export async function focusScout(
  scoutId: number,
  playerId: number | null,
): Promise<ActionResultDTO> {
  const data = await guard(() =>
    api("/api/scouting/focus", { method: "POST", json: { scout_id: scoutId, player_id: playerId } }),
  );
  refresh();
  return actionResultSchema.parse(data);
}

export async function hireScout(index: number): Promise<ActionResultDTO> {
  const data = await guard(() =>
    api("/api/scouting/hire", { method: "POST", json: { index } }),
  );
  refresh();
  return actionResultSchema.parse(data);
}

export async function dismissScout(scoutId: number): Promise<ActionResultDTO> {
  const data = await guard(() =>
    api("/api/scouting/dismiss", { method: "POST", json: { scout_id: scoutId } }),
  );
  refresh();
  return actionResultSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function seekMove(playerId: number, promise: boolean): Promise<ActionResultDTO> {
  const data = await guard(() =>
    api(`/api/clients/${playerId}/seek`, { method: "POST", json: { promise } }),
  );
  refresh();
  return actionResultSchema.parse(data);
}

export async function stopSeeking(playerId: number): Promise<ActionResultDTO> {
  const data = await guard(() =>
    api(`/api/clients/${playerId}/stop-seeking`, { method: "POST" }),
  );
  refresh();
  return actionResultSchema.parse(data);
}

export async function releaseClient(playerId: number): Promise<ActionResultDTO> {
  const data = await guard(() =>
    api(`/api/clients/${playerId}/release`, { method: "POST" }),
  );
  refresh();
  return actionResultSchema.parse(data);
}

export async function upgradeHq(): Promise<ActionResultDTO> {
  const data = await guard(() => api("/api/hq/upgrade", { method: "POST" }));
  refresh();
  return actionResultSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Negotiations — the one client-side flow. No revalidate mid-haggle; the
// dialog holds the negotiation in state and calls router.refresh() on close.
// ---------------------------------------------------------------------------

const LAPSED: ActionResultDTO = {
  ok: false,
  message: "Those talks have lapsed.",
  events: [],
};

async function negotiationCall<T>(path: string, json?: Record<string, unknown>): Promise<T> {
  try {
    return await api<T>(path, { method: "POST", json });
  } catch (error) {
    if (isApiError(error, "session_not_found")) redirect("/new-game");
    if (isApiError(error, "game_over")) redirect("/game-over");
    if (isApiError(error, "negotiation_not_found")) return LAPSED as T;
    throw error;
  }
}

export async function openSigning(playerId: number): Promise<OpenNegotiationResponse> {
  const data = await negotiationCall("/api/negotiations/signing", { player_id: playerId });
  return openNegotiationSchema.parse(data);
}

export async function openRenewal(playerId: number): Promise<OpenNegotiationResponse> {
  const data = await negotiationCall("/api/negotiations/renewal", { player_id: playerId });
  return openNegotiationSchema.parse(data);
}

export async function openDeal(interestId: number, years: number): Promise<OpenNegotiationResponse> {
  const data = await negotiationCall("/api/negotiations/deal", {
    interest_id: interestId,
    years,
  });
  return openNegotiationSchema.parse(data);
}

export async function assessDeal(handleId: string, wage: number): Promise<AssessResponse> {
  const data = await negotiationCall(`/api/negotiations/${handleId}/assess`, { wage });
  return assessSchema.parse(data);
}

export async function proposePct(handleId: string, pct: number): Promise<NegotiationDTO> {
  const data = await negotiationCall(`/api/negotiations/${handleId}/propose`, { pct });
  return negotiationSchema.parse(data);
}

export async function proposePackage(
  handleId: string,
  wage: number,
  fee: number,
): Promise<NegotiationDTO> {
  const data = await negotiationCall(`/api/negotiations/${handleId}/propose`, { wage, fee });
  return negotiationSchema.parse(data);
}

export async function acceptCounter(handleId: string): Promise<NegotiationDTO> {
  const data = await negotiationCall(`/api/negotiations/${handleId}/accept-counter`);
  return negotiationSchema.parse(data);
}

export async function abandonNegotiation(handleId: string): Promise<NegotiationDTO> {
  const data = await negotiationCall(`/api/negotiations/${handleId}/abandon`);
  return negotiationSchema.parse(data);
}
