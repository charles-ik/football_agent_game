# UI v1 — Build Record

What was built, the decisions taken, and where to take it next. Written for the
agent who picks this up cold. Read [ui_build_plan/](ui_build_plan/README.md)
first for the *why*; this document is the *what actually exists*.

Status: **complete and verified**. 80 API/engine tests collected (78 passed, 2
skipped — the two skips are pre-existing engine skips), 19 Vitest component
tests, 1 Playwright e2e, `next build` clean, both halves run together with
`make dev`. A follow-up pass ("Potential improvements to the UI" below) added
items 1–13; see that section for what changed and why.

---

## How to run and verify

```bash
python3 -m pip install -r requirements-api.txt
cd web && npm install && cd ..
make dev        # or: make api  +  make web
```

* API on http://127.0.0.1:8000 (`/api/health`), UI on http://localhost:3000.
* `make test` / `python3 -m pytest tests/ -q` — 78 passed, 2 skipped.
* `cd web && npm run build` — must compile clean; every route is dynamic (`ƒ`).
* API tests: `tests/test_api_contract.py` (23), `tests/test_api_leaks.py` (3),
  `tests/test_api_parity.py` (1 — same seed, same decisions via HTTP and via
  `engine.actions`, byte-identical `persistence.to_dict`).
* `cd web && npm test` — Vitest, 19 tests (`range-bar`, `trust-meter`,
  `eventHref`/`navRouteForEvent`). Pinned to vitest@1/vite@5/jsdom@24: this
  environment's Node (20.1) is below the 20.19 that vitest@4/vite@8's
  `rolldown` dependency requires (`node:util`'s `styleText` export). Upgrade
  the pins once the environment's Node is 20.19+ or 22.12+.
* `cd web && npm run test:e2e` — Playwright, one spec
  (`e2e/game-flow.spec.cjs`): new game → assign scout → 10 continues → sign a
  client. `.cjs`, not `.ts`, for both the config and the spec — this
  environment's Playwright (bundled with a TS-transform pipeline) hit the same
  Node-version wall as Vitest when loading `.ts` config/spec files
  (`SyntaxError: Cannot use import statement outside a module`); plain
  CommonJS sidesteps it. Starts both servers itself against an isolated
  `FA_SAVES_DIR`, so it never touches a real save.

---

## Architecture as built

```
┌──────────────────────────┐   HTTP/JSON    ┌────────────────────────┐
│ web/  Next.js 15 (App    │ ─────────────► │ api/  FastAPI          │
│ Router, strict TS,       │ ◄───────────── │  - DTO mapping         │
│ Tailwind v4, zod)        │  server-side   │  - session store       │
│  - Server Components     │  fetch only;   │  - negotiation handles │
│  - Server Actions        │  browser never │  - cookie plumbing     │
│  - one client-side       │  calls FastAPI └───────────┬────────────┘
│    negotiation dialog    │                            │ direct import
└──────────────────────────┘                            ▼
                                            ┌────────────────────────┐
                                            │ football_agent.engine  │
                                            │ (2 functions added,    │
                                            │  otherwise untouched)  │
                                            └────────────────────────┘
```

* The browser holds **no game state** — only an opaque `fa_session` cookie
  (httpOnly, SameSite=Lax). Every read is a Server Component fetch with
  `cache: "no-store"`; every write is a Server Action followed by
  `revalidatePath("/", "layout")`.
* The API is **stateful and single-process** by design: sessions and live
  negotiations are in-memory. `--workers 1` is load-bearing; it binds to
  127.0.0.1; CORS allows exactly `http://localhost:3000` with credentials.
* The engine is the only place rules live. The API adds none; the UI computes
  no game numbers (money arrives preformatted as `{amount, text}`; guides and
  verdicts come from `actions.commission_guide()` / `deal_guide()` /
  `assess_move()`).

## The API surface

Base path `/api`. Refusals are **values** (`200 {ok: false, message}`); HTTP
errors are reserved for real faults and rendered as `{"error": code, "message"}`:

| Code | error | When |
| --- | --- | --- |
| 400 | `bad_request` / `bad_slot` | Malformed body / unsafe save-slot name |
| 404 | `session_not_found` | Unknown/expired cookie |
| 404 | `save_not_found` | Load a slot that doesn't exist |
| 404 | `negotiation_not_found` | Lapsed/resolved negotiation |
| 404 | `not_found` | Unknown player/club id (KeyError handler) |
| 409 | `save_incompatible` | `persistence.SaveError` |
| 409 | `game_over` | Any mutation after the run ends |

Endpoints, all implemented per `ui_build_plan/02-api-contract.md`:

| Route | Notes |
| --- | --- |
| `GET /api/health` | `{"ok": true}` |
| `GET /api/meta` | Curated allowlist only: commission floor/ceiling, calendar, HQ levels, positions, traits, trait blurbs. Never the negotiation block. |
| `POST /api/game/new` | `{seed?, name?, slot?}` → creates session, sets cookie, autosaves. Echoes `seed` **once**, never again. |
| `POST /api/game/load` | `{slot}` → 404 `save_not_found` / 409 `save_incompatible`. |
| `GET /api/game/saves` | No session needed. `{slots: [{slot, modified_at, compatible, agency_name, week}]}` — a directory listing, not a rule; feeds the new-game load picker. |
| `GET /api/game` | `GameState` — header bar data. Works after game over. |
| `POST /api/game/continue` | `tick()`, evicts all negotiations, trims inbox (keep ACTION ≤4w old, cap 120), autosaves. Returns `{state, events, notable}`. |
| `POST /api/game/save` | Writes the slot **without** re-targeting the session's autosave slot. |
| `GET /api/game/inbox?limit=` | `{needs_decision, recent}` — newest first, noise kinds filtered from `recent`. |
| `GET /api/scouting` | Regions (+`expected_ability`), scouts (+precision), report rows sorted by potential mid desc. |
| `POST /api/scouting/assign` / `focus` / `dismiss` | Thin wrappers over `actions`. |
| `GET /api/scouting/candidates` | Three hireable scouts, index-addressed. |
| `POST /api/scouting/hire` | `{index}` — server regenerates the list; the client cannot name a candidate. |
| `GET /api/clients` | Rows sorted by true ability desc, server-side; ability itself never sent. |
| `GET /api/clients/{id}` | Row + club, market value, asking price (allowed: he's yours), interests with `can_negotiate`, `can_renew`. |
| `POST /api/clients/{id}/seek` / `stop-seeking` / `release` | `ActionResult`. |
| `POST /api/negotiations/signing` / `renewal` / `deal` | Open. Refusal → `{ok:false}`. Reopening an in-flight haggle **resumes** it (see Deviations). |
| `POST /api/negotiations/{id}/assess` | Deal only → `{trust_delta, verdict}`. |
| `POST /api/negotiations/{id}/propose` | `{pct}` or `{wage, fee}`. ACCEPTED → completes server-side in the same request + autosave. WALKED/ABANDONED → `close_negotiation()` + autosave. |
| `POST /api/negotiations/{id}/accept-counter` / `abandon` | Same completion/closure rules. |
| `GET /api/hq` · `POST /api/hq/upgrade` | Current/next level, `can_upgrade`, weekly net now vs after. |
| `GET /api/finances` | Cash, net, totals, `weeks_until_broke`, `weeks_until_next_window`, full history. |
| `GET /api/leagues` | Sorted standings, `has_client` flags. |

### Files

```
api/
  main.py          app factory, CORS, exception handlers, /api/health      (70 lines)
  session.py       Session, SessionStore, cookie dep, save_path_for()     (146)
  dto.py           hand-written engine->wire mappers                      (406)
  negotiations.py  NegotiationHandle store, eviction, DTO rendering       (222)
  routers/         meta, game, scouting, clients, negotiations, agency
requirements-api.txt   fastapi, uvicorn[standard], httpx (engine stays zero-dep)
```

## The web app

```
web/
  app/
    layout.tsx              root shell (html/body + <Toaster>)
    globals.css             Tailwind v4 @theme: ink/panel/line/fg/dim + severity palette
    (game)/                 route group behind the session boundary
      layout.tsx            fetches GameState + inbox (for nav badges); redirects: no
                             session -> /new-game, game_over -> /game-over. Header bar +
                             nav + Continue + RefreshOnFocus.
      error.tsx              in-voice error boundary ("The line to the office dropped.")
      page.tsx              Inbox (needs-decision panel + week-grouped feed)
      clients/page.tsx + clients-table.tsx
      clients/[id]/page.tsx + client-panels.tsx + not-found.tsx
      scouting/page.tsx + scouting-panels.tsx (assign/focus/hire dialogs, reports table)
      headquarters/page.tsx
      finances/page.tsx     runway warning + history table + hand-rolled SVG sparkline
      leagues/page.tsx
      loading.tsx           generic skeleton
    new-game/page.tsx + new-game-form.tsx   (outside the shell; save-slot picker)
    new-game/created/page.tsx               (seed confirmation — its own route; see
                                             "A bug the e2e test found and fixed" below)
    game-over/page.tsx                      (outside the shell; full-screen epilogue)
  components/
    header-bar.tsx  continue-button.tsx  event-list.tsx  keyboard-shortcuts.tsx
    range-bar.tsx   money.tsx            trust-meter.tsx toaster.tsx
    dialog.tsx      action-button.tsx    refresh-on-focus.tsx
    negotiation/    negotiation-dialog.tsx  commission-haggle.tsx  package-haggle.tsx  shared.tsx
  lib/
    api.ts        server-only fetch wrapper + typed, zod-parsed read helpers
    actions.ts    "use server" mutations; guard() maps session_not_found/game_over to redirects
    types.ts      DTO types mirroring 02-api-contract.md
    schemas.ts    zod schemas for every response shape
  vitest.config.ts + vitest.setup.ts   component tests (range-bar/trust-meter/event-list)
  playwright.config.cjs + e2e/game-flow.spec.cjs   one end-to-end spec (.cjs — see below)
```

Data flow, exactly as planned: pages are async Server Components; mutations are
Server Actions; the negotiation dialog is the **only** client-side flow (holds
the `NegotiationDTO` in `useState`, calls Server Actions, `router.refresh()` on
close). No client state manager, no query cache, no charting library.

Visual language: dark ink base (`#0b0e13`), off-white text, signal-cyan accent
for anything needing a decision, amber warnings, red critical, green good —
mapped 1:1 from `Severity`. Tabular numerals on all numbers. Range bars draw
ability/potential as bars whose width *is* the spread, tinted by the API's
confidence word. Trust renders label-first with the number secondary, red under
40. The Continue button is fixed bottom-right, badged with the pending-decision
count, disabled in flight, and shows a click-to-dismiss week-summary panel.
Keyboard: `C` continue, `1`–`6` nav, `Esc` closes dialogs (ignored while typing
or while a dialog is open).

## The negotiation flow (the stateful heart)

* Handles live in the session (`NegotiationHandle{id, kind, negotiation,
  subject_id, years, created_at}`), evicted after 15 minutes and on every tick.
* The DTO carries rendered values only: guide band and bounds (pct or Money),
  context, hint history, the counter as pct or money. **Never** `threshold` or
  the normalised `x` — the leak test asserts it.
* `EXHAUSTED` is not terminal: the final counter stays on the table until the
  player takes it or walks. Abandoning an exhausted haggle runs
  `close_negotiation()` (the "EXHAUSTED-declined" case).
* Completion is server-side in the same request: signing -> `complete_signing`,
  renewal -> `complete_renewal`, deal -> `package_from_x` + wage/fee clamped to
  the interest's ceilings (fee forced to 0 for renewals/free agents) ->
  `accept_deal`. A deal the buying club accepts can still fail at the selling
  club's asking price — that `ActionResult(ok=False)` is returned, matching the
  CLI.
* Deal dialog chooses contract length once, up front, before the first proposal.
  The package haggle calls `/assess` (debounced on wage change) and shows the
  verdict in the same glance as Submit.
* Inbox deep-links: `player_id` -> `/clients/{id}`; `interest_id` ->
  `/clients/{player_id}?negotiate={interest_id}`, which auto-opens the deal
  dialog for that approach.

## The information barrier

`tests/test_api_leaks.py` is the guard that protects the game. It walks every
GET route and both negotiation flows asserting these exact quoted keys never
appear: `"ability"`, `"potential"`, `"threshold"`, `"seed"`, `"hidden_bias"`,
`"base_threshold_pct"`, `"counter_x"`, `"agreed_x"`. (`ability_low/high` are
legitimate — the match is on exact keys.) If you are ever tempted to
`dataclasses.asdict(world)`, that test exists for you.

## Engine changes (the only two)

Both are read-only probes extracted so GET endpoints don't duplicate rules,
each with a test in `tests/test_systems.py` asserting it mirrors its mutating
sibling:

* `actions.can_upgrade_hq(world, balance) -> (bool, str)` — used by `GET /api/hq`.
* `actions.can_renew(world, balance, player_id) -> (bool, str)` — used by
  `GET /api/clients/{id}`; `open_renewal_negotiation` now calls it.

## Deviations from the plan (deliberate, with reasons)

1. **Reopening an in-flight negotiation resumes it** instead of the plan's
   "reloading loses the negotiation." Stateless HTTP cannot observe a reload,
   and minting a fresh haggle on reopen would let a player re-roll
   counter-offers. Resume is the stronger guarantee of the plan's actual
   requirement: the attempt is spent on first propose, a walk-away can never be
   re-rolled, and one subject can never have two parallel haggles.
2. **shadcn/ui was not adopted as a dependency.** The plan allowed Dialog,
   Table, Tooltip, Badge only; they are hand-rolled in the shadcn style
   (`components/dialog.tsx`, flag badges, `title`-attribute tooltips) to keep
   the dependency footprint at next/react/tailwind/zod/server-only.
3. **ESLint is not wired** (the plan's `create-next-app` flags included it).
   `tsc --strict` + `next build` gate the TS; ruff gates the Python.
4. **`POST /api/game/save` does not re-target the autosave slot** — the session
   keeps the slot it was created/loaded with, like the CLI's fixed save path.
5. **Loading a missing slot returns 404 `save_not_found`** (the contract didn't
   specify; it's a real fault, not a refusal).
6. **Trait explanations are display copy in the UI** (`clients/[id]/page.tsx`
   `TRAIT_BLURBS`, lifted from the `models.Trait` docstrings), not an API field.
7. Everything else follows the plan: zod at the boundary, no charting library
   (sparkline is hand-rolled SVG), no client cache, single worker.

## Known limitations (as built, by design or by budget)

* **Sessions are in-memory.** Restarting the API drops every session; saves on
  disk are the recovery path (the player re-loads a slot from /new-game).
* **Confirm steps are now styled dialogs** (release client, HQ upgrade, promise
  a move, dismiss scout) — fixed in the UI improvements pass below.
* **Tables are desktop-dense**; small screens get horizontal scroll, nothing more.

---

## Potential improvements to the UI

Ordered by value per effort. Each entry names the seam it lands in. Anything
marked **[engine]** is gated on engine work first — the UI must not grow the
rule itself (see the binding rules at the end).

### Cheap, high value — done

1. **Styled confirm dialogs.** ✅ `components/action-button.tsx`'s `confirm` prop
   now opens a small `Dialog`-based confirm (Cancel/Confirm) instead of
   `window.confirm`. Same call sites (release client, dismiss scout, seek &
   promise, HQ upgrade).
2. **Save-slot picker.** ✅ `GET /api/game/saves` (`api/routers/game.py`) lists
   `saves/*.json` — slot name, mtime, agency name, week, and a `compatible`
   flag from a best-effort `persistence.load`. `app/new-game/new-game-form.tsx`
   turns the load field into a `<select>` fed by it, with a manual-entry
   fallback when the list is empty or the player wants to type a name.
3. **Meta-driven options.** ✅ `GET /api/meta` gained `trait_blurbs` (display
   copy, still an allowlist — no rule crossed the wire). `AssignDialog` in
   `scouting-panels.tsx` takes `positions` from `/api/meta` instead of a
   hardcoded array; `clients/[id]/page.tsx` reads `TRAIT_BLURBS` from there too.
4. **Toast the deep-link miss.** ✅ `client-panels.tsx`'s `InterestCards` effect
   toasts `can_negotiate.reason` (amber) when a `?negotiate=` deep link points
   at an approach that can no longer be negotiated, instead of doing nothing.
5. **Per-route error boundaries.** ✅ `app/(game)/error.tsx` — "The line to the
   office dropped." with a Refresh button, in the game's voice.
6. **Range-bar animation.** ✅ `transition-[left,width]` (with
   `motion-reduce:transition-none`) on the fill bar in `components/range-bar.tsx`.
7. **Rounds as pips.** ✅ `RoundPips` in `negotiation/shared.tsx` — filled dots
   (accent = spent, outline = remaining) plus an `sr-only` "Round X of Y" for
   screen readers; used in both haggle components.

### Medium — done

8. **Focus management and aria-live.** ✅ `components/dialog.tsx` traps Tab
   inside the panel, focuses the first focusable element on open, and restores
   focus to the opener on close. `components/toaster.tsx`'s toast region is
   `role="region" aria-live="polite"`.
9. **Echo your own offers.** ✅ `NegotiationHandle.offers` (`api/negotiations.py`)
   is a `{history_index: rendered_offer}` map — keyed by position, not round
   number, because `accept-counter`/`abandon` reuse the current round's number
   and would otherwise misattribute an offer to the wrong entry. `propose()`
   (`api/routers/negotiations.py`) records the rendered pct or wage/fee
   *before* calling `neg.propose(x)`. `negotiation_dto` attaches it to each
   history entry as `offer` (never `x`); `ProposalEcho` in `negotiation/shared.tsx`
   renders "You proposed …" / "You offered …" above each round's hint.
10. **Nav badges.** ✅ `(game)/layout.tsx` fetches the inbox once alongside game
    state and buckets `needs_decision` events by `navRouteForEvent()`
    (`components/event-list.tsx`) into per-section counts, rendered as small
    badges next to Clients/Scouting in `components/header-bar.tsx`'s nav.
11. **Poll-on-focus freshness.** ✅ `components/refresh-on-focus.tsx` — a bare
    client component calling `router.refresh()` on `visibilitychange`, mounted
    once in `(game)/layout.tsx`.
12. **Week-summary upgrade.** ✅ `sortBySeverity()` (`components/event-list.tsx`)
    reorders the notable-events array critical-first before
    `continue-button.tsx` renders it; rows already deep-link via the existing
    `EventList`/`eventHref()`. The panel is also now a `div` with its own
    "Dismiss" button rather than a `<button>` wrapping interactive `<a>` rows.
13. **Client-side tests.** ✅ Vitest (`web/vitest.config.ts`, pinned to
    vitest@1/vite@5 — this environment's Node is below the 20.19 that
    vitest@4/vite@8's rolldown dependency requires) covers `range-bar`,
    `trust-meter` and `eventHref`/`navRouteForEvent` (19 tests, `npm test`).
    One Playwright e2e (`web/e2e/game-flow.spec.cjs`, `npm run test:e2e`,
    `.cjs` for the same Node-version reason) drives the real stack: new game
    → assign scout → 10 continues → sign a client. It caught a real bug (next
    item).

### A bug the e2e test found and fixed

`newGame()` (`web/lib/actions.ts`) used to `revalidatePath("/", "layout")` and
return `{seed}` for `new-game-form.tsx` to show a "the agency is open, note
your seed" confirmation in place. Setting the session cookie inside a Server
Action makes Next.js auto-refresh whatever route invoked it — so `/new-game`'s
own "already playing? go to `/`" guard fired on that automatic refresh and
redirected away before the confirmation ever rendered (verified with
Playwright: the URL flips from `/new-game` to `/` within ~50ms of the click,
skipping the seed screen entirely; a real single-player would never see their
world's seed). Fixed by having `newGame()` `redirect()` to a dedicated
`/new-game/created?seed=` route instead, which carries no such guard.

### Bigger investments — not done this pass

14. **Responsive pass.** The dense tables assume a desktop. A real small-screen
    layout (cards instead of rows for clients/reports) is a redesign of
    `clients-table.tsx` and the reports table, not a tweak.
15. **Finances visualisation.** The sparkline is deliberately minimal. If more
    is wanted (stacked income/costs per week, runway projection), hand-roll it
    in SVG as now — the plan's "no charting library" stance stands.
16. **Session durability.** Serialising session *metadata* (inbox, save path —
    never live negotiations) would let the API restart without logging anyone
    out. Negotiations still die on restart by design; the client already
    handles `negotiation_not_found` with "Those talks have lapsed."
17. **Onboarding hints.** The CLI teaches by its menus; the web UI assumes you
    read /new-game's blurb. A first-run empty-state tour (Inbox empty -> "Assign
    your scout" with a link) is content work in the existing empty states.

### Explicitly not improvements (do not build)

* UI for engine-deferred features: the Upgrades screen (properties, vehicles),
  loan deals, multiple countries, continental competition, real squads, split
  club/player reputation. Each is recorded in `docs/v1-python-build-plan.md`
  with the reason; they need engine work first. **[engine]**
* Multiplayer, accounts, hosting — the architecture is local single-player by
  design.
* A client state manager or query cache — the server is the single source of
  truth; staleness bugs are the only thing they'd add.
* Recomputing any number in TypeScript (money formatting, guides, verdicts).
  If the UI wants a value, the API sends it.

## Rules that still bind any agent working on this

1. Do not port the engine to TypeScript — not even "just the formatting".
2. Do not add rules to the API layer; add them to the engine, with a test.
3. Never send hidden state over the wire — `test_api_leaks.py` is watching.
4. `python3 -m pytest tests/ -q` stays green at every step.
5. The CLI keeps working; it is the reference implementation.
