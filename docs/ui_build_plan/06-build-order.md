# 06 — Build order

Seven phases. Each has a definition of done that can be checked, not judged. Do
not start a phase until the previous one's checks pass.

Throughout: `python3 -m pytest tests/ -q` stays green. If it goes red, stop and
fix it before writing another line of UI.

---

## Phase 0 — Groundwork

1. Create `api/` and `web/` skeletons and `requirements-api.txt`
   (`fastapi`, `uvicorn[standard]`, `httpx`).
2. `api/main.py` with `GET /api/health` → `{"ok": true}`.
3. `npx create-next-app@latest web --ts --app --tailwind --eslint`.
4. Add `saves/`, `web/node_modules`, `web/.next`, `.env.local` to `.gitignore`.

**Done when:** uvicorn serves `/api/health` on 127.0.0.1:8000, `npm run dev`
serves a page on :3000, and the engine tests still pass.

---

## Phase 1 — Read-only API

Sessions, DTOs, and every `GET`. No mutations yet except `game/new` and
`game/continue`.

1. `api/session.py` — store, cookie dependency, `save_path_for()` slug guard.
2. `api/dto.py` — `money`, `player_dto`, `report_dto`, `event_dto`,
   `game_state_dto`.
3. Routers: `meta`, `game` (new/load/get/continue/save/inbox), `scouting` (GET),
   `clients` (GET list + detail), `agency` (hq, finances, leagues).
4. `api/tests/test_api_leaks.py` — Task B7 from
   [03-backend-tasks.md](03-backend-tasks.md#task-b7--leak-tests).

**Done when:**
* `POST /api/game/new {"seed": 42}` then 30 × `POST /api/game/continue` runs
  without error and returns sensible events.
* The leak test passes: no `"ability"`, `"potential"`, `"threshold"`, `"seed"`
  or `"hidden_bias"` key in any GET response body.
* A hand-check of `GET /api/scouting` shows ability only as `ability_low` /
  `ability_high` with a `confidence` label.

---

## Phase 2 — The loop, end to end, ugly

The smallest thing that is playable: header, inbox, Continue. No styling beyond
Tailwind defaults.

1. `lib/api.ts`, `lib/types.ts`, `lib/actions.ts`.
2. `app/layout.tsx` with the header bar and nav.
3. `app/page.tsx` — inbox, `continue-button.tsx`, week-summary panel.
4. `app/new-game/page.tsx` and the `session_not_found` → `/new-game` redirect.

**Done when:** you can start a game in the browser, press Continue twenty times,
watch weeks pass, see events arrive, reload the page and find the state intact.

This is the phase that proves the architecture. If anything about sessions,
cookies or revalidation is wrong, it will be obvious here and cheap to fix.

---

## Phase 3 — Mutating API + scouting screen

The first real decisions.

1. Mutating routes: `scouting/assign`, `focus`, `candidates`, `hire`, `dismiss`;
   `clients/{id}/seek|stop-seeking|release`; `hq/upgrade`. Each uses the shared
   `apply()` helper.
2. `app/scouting/page.tsx` — regions, scouts, reports tables.
3. `range-bar.tsx` — the ability/potential range component.
4. Assign-scout and hire-scout modals.
5. `app/headquarters/page.tsx`.

**Done when:** you can assign a scout to a region, run ten weeks, watch reports
appear and their range bars visibly narrow, and hire a second scout once the HQ
allows it. Refusals ("Your headquarters supports 1 scout(s)") render as amber
toasts, not error pages.

---

## Phase 4 — Negotiations

The hard phase. Budget for it accordingly.

1. `api/negotiations.py` — handle store, eviction on tick and on timeout.
2. Routes: open signing / renewal / deal, `assess`, `propose`, `accept-counter`,
   `abandon`, with server-side completion on accept.
3. `negotiation-dialog.tsx` + `commission-haggle.tsx` + `package-haggle.tsx`.
4. Wire **Sign** on the scouting reports table and **Negotiate** on interest
   cards.

**Done when all of these hold:**
* Signing a player through the UI produces the same world mutation as the CLI:
  `world.clients[id]` created, reputation gained, `CLIENT_SIGNED` event.
* Opening a signing negotiation and then walking away sets
  `player.signing_cooldown_until` — and reopening it is refused with "He walked
  out of your last approach."
* Reloading the page mid-negotiation loses the negotiation *and* the attempt.
  The player cannot re-roll a walk-away.
* Pressing Continue with a dialog open evicts the negotiation cleanly.
* `assess_move` output is visible before a package can be submitted.
* The leak test passes against every negotiation response.

---

## Phase 5 — Remaining screens

1. `app/clients/page.tsx` and `app/clients/[id]/page.tsx`, with `trust-meter.tsx`.
2. `app/finances/page.tsx` with the runway warning.
3. `app/leagues/page.tsx`.
4. Game-over screen and the `409 game_over` redirect.
5. Inbox deep-links from `event.data`.

**Done when:** a full season can be played entirely in the browser — scout, sign,
manage, negotiate a transfer in a window, take the commission — without touching
the CLI.

---

## Phase 6 — Parity, polish, hardening

1. `api/tests/test_api_parity.py` — Task B8. Same seed, same scripted decisions
   through the API and through `engine.actions`; assert
   `persistence.to_dict(world)` matches.
2. Visual pass against [04-frontend-foundation.md](04-frontend-foundation.md#visual-language).
3. Loading and error states: skeletons on Server Component suspense boundaries,
   a toast system for `ActionResult` messages, disabled buttons during
   in-flight mutations.
4. Keyboard: `C` for Continue, `1`–`6` for nav, `Esc` to close dialogs. The CLI's
   muscle memory is worth preserving.
5. Update `docs/how-to-run.md` with a "Play in the browser" section.

**Done when:** the parity test passes, and a cold reader can go from `git clone`
to a game in the browser using only the docs.

---

## Things that will go wrong

Recorded so the next agent doesn't rediscover them:

* **Serialising `World` directly.** It is one line and it destroys the game. The
  leak test exists for exactly this moment of laziness.
* **Storing the negotiation in the browser.** It holds a hidden threshold and a
  seeded RNG. Every attempt to make it client-side either leaks the threshold or
  makes walk-aways re-rollable.
* **Recomputing money formatting in TypeScript.** `format_money` carries the
  game's voice ("£1.45M", "£420"). Send the string.
* **Running uvicorn with more than one worker.** Sessions vanish at random and
  the bug looks like a cookie problem for a day and a half.
* **Caching a `GET`.** Next.js's default fetch caching will happily serve last
  week's world. `cache: "no-store"` everywhere, from the start.
* **Letting the client name its own scout candidate or agreed percentage.**
  Indices and server-side completion only.

---

## Out of scope for v1 of the UI

Matching the engine's own deferred list — do not build UI for things the engine
does not do: the Upgrades screen (properties, vehicles), loan deals, multiple
countries, continental competition, real squads, split club/player reputation.
Multiplayer, accounts and hosting are also out; this is a local single-player
app and the architecture above assumes it.
