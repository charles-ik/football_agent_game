// Server-only fetch wrapper. The browser never talks to FastAPI directly:
// every call goes through here (on the Next.js server), forwarding the
// fa_session cookie both ways.
import "server-only";

import { cookies } from "next/headers";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

type Json = Record<string, unknown> | unknown[] | null;

async function forwardSetCookie(res: Response): Promise<void> {
  // The API sets/refreshes fa_session on responses that create a session.
  // Copy it into the browser's cookie jar (allowed inside Server Actions).
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return;
  const match = /fa_session=([^;]*)/.exec(setCookie);
  if (!match) return;
  const jar = await cookies();
  try {
    jar.set("fa_session", match[1], {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
  } catch {
    // cookies().set is unavailable during Server Component rendering.
    // Reads never rotate the session id, so there is nothing to lose.
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: Json }): Promise<T> {
  const jar = await cookies();
  const { json, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      cookie: jar.toString(),
      ...init?.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : init?.body,
    cache: "no-store", // every response depends on mutable world state
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(res.status, body.error ?? "error", body.message);
  }
  await forwardSetCookie(res);
  return res.json() as Promise<T>;
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return (
    error instanceof ApiError && (code === undefined || error.code === code)
  );
}

// ---------------------------------------------------------------------------
// Typed reads — called from Server Components only
// ---------------------------------------------------------------------------

import {
  candidatesSchema,
  clientDetailSchema,
  clientRowSchema,
  financesSchema,
  gameStateSchema,
  hqSchema,
  inboxSchema,
  leaguesSchema,
  metaSchema,
  scoutingStateSchema,
} from "@/lib/schemas";
import type {
  ClientDetail,
  ClientRow,
  FinancesState,
  GameState,
  HQState,
  InboxResponse,
  LeagueDTO,
  MetaState,
  ScoutCandidate,
  ScoutingState,
} from "@/lib/types";
import { z } from "zod";

export const getGameState = () =>
  api<GameState>("/api/game").then((d) => gameStateSchema.parse(d));

export const getInbox = (limit = 60) =>
  api<InboxResponse>(`/api/game/inbox?limit=${limit}`).then((d) => inboxSchema.parse(d));

export const getScouting = () =>
  api<ScoutingState>("/api/scouting").then((d) => scoutingStateSchema.parse(d));

export const getCandidates = () =>
  api<ScoutCandidate[]>("/api/scouting/candidates").then((d) => candidatesSchema.parse(d));

export const getClients = () =>
  api<ClientRow[]>("/api/clients").then((d) => z.array(clientRowSchema).parse(d));

export const getClientDetail = (id: number) =>
  api<ClientDetail>(`/api/clients/${id}`).then((d) => clientDetailSchema.parse(d));

export const getHq = () => api<HQState>("/api/hq").then((d) => hqSchema.parse(d));

export const getFinances = () =>
  api<FinancesState>("/api/finances").then((d) => financesSchema.parse(d));

export const getLeagues = () =>
  api<LeagueDTO[]>("/api/leagues").then((d) => leaguesSchema.parse(d));

export const getMeta = () => api<MetaState>("/api/meta").then((d) => metaSchema.parse(d));
