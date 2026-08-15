# 04 — Frontend foundation

## Stack

| Choice | Version | Why |
| --- | --- | --- |
| Next.js, App Router | 15+ | Server Components let the browser hold no game state |
| TypeScript | strict | The DTOs are the contract; type them once |
| Tailwind CSS | v4 | Dense data UI, no CSS file sprawl |
| shadcn/ui | latest | Dialog, Table, Tooltip, Badge only — do not adopt wholesale |
| Zod | 3+ | Validate API responses at the boundary |

Deliberately **not** used: a client state manager (Redux/Zustand), TanStack
Query, a charting library. The server is the single source of truth and every
mutation invalidates everything. Adding a client cache here creates stale-state
bugs for no benefit.

```
web/
  app/
    layout.tsx            # shell: header bar + nav
    page.tsx              # Inbox (the home screen)
    clients/page.tsx
    clients/[id]/page.tsx
    scouting/page.tsx
    headquarters/page.tsx
    finances/page.tsx
    leagues/page.tsx
    new-game/page.tsx
  components/
    header-bar.tsx  continue-button.tsx  event-list.tsx
    range-bar.tsx   money.tsx  trust-meter.tsx
    negotiation/    negotiation-dialog.tsx  commission-haggle.tsx  package-haggle.tsx
  lib/
    api.ts        # server-side fetch wrapper
    types.ts      # DTO types, mirroring 02-api-contract.md
    schemas.ts    # zod schemas
    actions.ts    # "use server" mutations
```

## Data flow

**Reads — Server Components.** Each page is `async` and fetches on the server:

```ts
// lib/api.ts — server-only
import "server-only";
import { cookies } from "next/headers";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:8000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json",
               cookie: (await cookies()).toString(), ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  return res.json() as Promise<T>;
}
```

`cache: "no-store"` everywhere. Every response depends on mutable world state;
there is nothing here worth caching and a stale header bar is a bug report.

**Writes — Server Actions.**

```ts
// lib/actions.ts
"use server";
export async function continueWeek() {
  const res = await api<ContinueResponse>("/api/game/continue", { method: "POST" });
  revalidatePath("/", "layout");
  return res;
}
```

`revalidatePath("/", "layout")` after every mutation. A week tick changes the
header, the inbox, clients, finances and the league table at once; targeted
invalidation is not worth the reasoning cost.

**Negotiations — the one client-side flow.** A haggle is a multi-round
conversation with no page navigation. `negotiation-dialog.tsx` is a Client
Component holding the current `NegotiationDTO` in `useState`, calling Server
Actions for `propose` / `accept-counter` / `abandon` and replacing state with
each response. When the dialog closes, call `router.refresh()` so the rest of the
page picks up the consequences.

**Never** compute a game number in the browser. If the UI wants a value, the API
sends it. The test for whether you have violated this: search `web/` for
arithmetic on money, percentages or weeks. There should be almost none.

## Handling the API's two response shapes

1. **`ActionResultDTO`** — `ok: false` is normal gameplay, not an error. Render
   `message` as a toast in the game's voice (amber for a refusal, green for a
   success). Do not throw, do not show an error boundary.
2. **HTTP errors** — 404 `session_not_found` redirects to `/new-game`; 409
   `game_over` redirects to the game-over screen; 404
   `negotiation_not_found` closes the dialog with "Those talks have lapsed."

## Visual language

The game's voice is dry, terse and a little cold — read the CLI strings before
designing anything. The UI should feel like an operator's console, not a mobile
free-to-play game. Concretely:

* **Dark, near-neutral base.** Deep slate/ink background, off-white text, a
  single cold accent (a signal cyan) for anything that needs a decision, amber
  for warnings, red for critical. Match `Severity` one-to-one — the engine has
  already decided what matters.
* **Tabular numerals everywhere.** Money, weeks, percentages and ability ranges
  all sit in columns; proportional digits make them unreadable.
* **Density over whitespace.** This is a numbers game. Aim for something closer
  to a spreadsheet than a marketing page. Small type, tight rows, generous
  column separation.
* **Ranges get a dedicated component.** `range-bar.tsx` draws ability 61–74 as a
  bar, not text — the uncertainty is the mechanic and it should be the most
  visually distinctive thing on the screen. Widen the bar with the spread, and
  label it with the confidence word from the API. A narrow bar should feel
  earned.
* **Trust and playing time are moods, not numbers.** `trust-meter.tsx` uses the
  API's label with the number secondary.
* **The Continue button is the game.** It is the primary action, always
  reachable, and it should show the pending-decision count so pressing it while
  a club is waiting feels like a choice.

Accessibility floor: every colour-coded state also carries text or an icon; the
severity colours are the only thing distinguishing an inbox row otherwise.

## Environment

```
# web/.env.local
API_BASE=http://127.0.0.1:8000
```

`API_BASE` is read on the server only. Do not prefix it `NEXT_PUBLIC_` — the
browser must never call FastAPI directly, or the session cookie and CORS setup
stop being meaningful.

Dev loop: two terminals, uvicorn on 8000 and `npm run dev` on 3000. Add a root
`Makefile` or `npm run dev:all` (concurrently) once both halves work.
