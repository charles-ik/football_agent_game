# Changelog

## 2026-09-18 — Finance, progression, stock exchange and visual review

- **Added:** live weekly budget, retainer coverage, and an explicitly conditional cash forecast to the next transfer window.
- **Fixed:** finances now shows when the current transfer window is open and flags overdrawn cash independently of weekly profitability. Forecasts and settlements share one budget calculation.
- **Changed:** seasonal ambitions show configured rewards, requirements and next actions across Office, Agency and the agency record. Unearned milestones now explain their requirements and unlocks.
- **Added:** a fictional stock exchange with five listings, weekly seeded prices, cash-backed buy/sell trades, review dialogs, fees, saved portfolios and realized/unrealized gains. Share sale proceeds are separate from football commission.
- **Added:** five original illustrations across Scouting, Market, Finances, Clients, Careers, Premises, Stocks and new-game screens.
- **Changed:** narrower desktop rails, wrapping status bar, editorial headings, consistent green/gold accents and a permanent agency-record link. The established 20px body scale remains.
- **Fixed:** hover movement no longer destabilizes action buttons; mobile navigation sits below Continue without overlap, and market controls fit narrow screens.

- **Validated:** 143 engine/API tests passed (2 existing skips), 36 UI tests, TypeScript and production build. All 5 browser scenarios passed, including stock trades, save reload, finance reconciliation and 360px layout checks.

## 2026-09-10 — Readability and action clarity

- **Changed:** the browser UI now uses a 20px root type size, six pixels larger than the previous baseline. Small fixed-size captions were raised by the same amount so navigation, tables, status rails, dialogs and supporting text scale together.
- **Changed:** primary, secondary, quiet and destructive controls now have distinct filled surfaces, stronger borders, elevation, hover/pressed feedback and 20px labels. Button-like links and previously text-only actions use the same visual language.
- **Validated:** production build, TypeScript, 25 component tests, and responsive browser checks at desktop, compact and 390px mobile widths.

## 2026-09-10 — Agency tycoon expansion

- **Added:** illustrated office, support staff portfolios, departments, identity, specialization, seasonal objectives and milestones.
- **Added:** client goals, timed promises, contextual conversations, durable career histories and alumni.
- **Added:** club relationships and pitches, rival warnings, safe market comparisons and persistent loan negotiations/lifecycle.
- **Changed:** responsive navigation, global decisions, event advancement, client dossiers and prospect shortlisting.
- **Fixed:** playing-time enum mismatches, inconsistent trust concerns, wrong HQ price, retained scout form values, stale action handling, duplicate histories and same-slot new-game sessions.
- **Changed:** schema-v2 migration, immediate autosaves, revision guards, retry receipts and rollback on save failure.
- **Fixed:** action-week commission and investment accounting, separate support costs, and repeated operating settlement.
- **Validation:** see [implementation and balance notes](features/agency-expansion.md).

# Changelog — the interactive UI overhaul

A full pass over the web interface: visual system, app shell, every screen, and
the model behind the "needs a decision" list. The engine's rules are unchanged;
the one engine addition is a read-only derivation.

## Design system

- **New token foundation** (`web/app/globals.css`): a five-step surface
  elevation ramp, AA-passing text greys, an indigo accent replacing cyan, a
  four-role type scale, and motion tokens that collapse under
  `prefers-reduced-motion`.
- **Self-hosted Geist Sans + Geist Mono** via the `geist` package. Every figure
  is now mono with tabular numerals, so columns of money and ranges align.
- **Shared primitives** (`web/components/ui.tsx`): `Panel`, `PanelSection`,
  `ScreenHeader`, `StatTile`, `Badge`, `Field`, `Table`/`Th`/`Td`, `EmptyState`,
  `Skeleton`, plus shared input and button class strings. Every screen was
  rebuilt on these; previously each hand-rolled its own markup, which is why no
  two quite matched.
- **`lucide-react`** for iconography.

## Shell

- **Three-zone console**: nav rail, full-height content, and a persistent week
  rail carrying open decisions, the feed, and Continue.
  See [ui/app-shell.md](ui/app-shell.md).
- **`/` is now an agency dashboard** rather than the inbox: cash and runway
  beside the window countdown, the season timeline, clients in trouble, the
  scouting pipeline, who you could sign, and last week's costs.
- **Continue** renders in two positions and responds to a `fa:continue` window
  event rather than an id, so only the visible instance ever fires.
- **Responsive**: icon-only rail at tablet widths, horizontal nav strip on
  mobile, and the clients table collapses to stacked cards under 768px.

## Decisions

Replaced the event-derived "needs a decision" list with
`football_agent/engine/decisions.py`, which derives open obligations from world
state. Items now clear themselves when resolved, carry deadlines, and are ranked.
Scope narrowed to contracts ending, your agreement ending, and live approaches —
with approaches labelled against what the client currently earns. Full reasoning
in [decisions-model.md](decisions-model.md).

New endpoint: `GET /api/game/decisions`.

## Screens

| Screen | What changed |
| --- | --- |
| Dashboard (`/`) | New. Organised by pressure rather than data type. |
| Clients | Sortable table, playing-time colouring, card layout on mobile. |
| Client detail | Stat tiles, trait promoted to a first-class label, approach cards carrying the one-negotiation warning above the button that spends it. |
| Scouting | Star ratings for talent pools, loud `unassigned` badge, sortable reports with hero range bars. |
| Premises | Side-by-side level comparison with deltas, and the projected weekly net. |
| Finances | Honest runway, a net-per-week column chart, lifetime totals. |
| Leagues | Client clubs highlighted and named. |
| Negotiation | Restyled throughout; "Push again" made visually secondary, the trust assessment given its own coloured panel beside Submit. |
| New game | The three rules the game rests on, stated up front. |

## Bugs found and fixed

**The recent feed was destroyed every week.** `POST /api/game/continue` filtered
the inbox down to ACTION events at each week boundary, so every non-action event
older than the current week was discarded. The feed could only ever show the week
just gone, and the game had no readable memory. Retention is now a rolling
12-week window over everything (`INBOX_HISTORY_WEEKS`).

**A hidden-information leak in `client.developed`.** The event carried
`ability=player.ability` — the true, hidden value — in its structured payload.
It went unnoticed because the retention bug purged the event before any test
read it; fixing retention exposed it immediately, and `tests/test_api_leaks.py`
failed. The data field is gone. (The message's own "now rated 63" is intentional
and matches the CLI: derived figures are shown for players who are already your
clients.)

**The runway warning was nonsense.** Finances announced "at this rate you run out
in 1225 weeks" in red — 23 years away, and not a warning at all. A runway is now
only stated in weeks when it is within two seasons, expressed in seasons beyond
that, and only turns red inside 26 weeks.

**The nav key hints read as counts.** Unstyled digits sat where badges go. They
are now bordered key caps, visually distinct from the accent-filled decision
badges.

**Notification spam.** The same three lines — running costs, week advanced, idle
scout — repeated every single week in the feed. Chrome and per-week bookkeeping
kinds are filtered (`NOISE_KINDS`), the idle-scout standing condition moved to
the dashboard and Scouting screen, and consecutive identical messages collapse
into one row with a `×N` count.

**A missing glyph.** The half-star character rendered as tofu in system fonts;
stars are now a clipped overlay.

**Component tests leaked between cases.** Testing Library only auto-cleans with
Vitest globals enabled, which this project does not use, so every render in a
file stacked up in the same document and role-based queries found several
matches. `afterEach(cleanup)` added to `vitest.setup.ts`.

## Tests

- `tests/test_decisions.py` — new; guards that a decision exists exactly as long
  as its condition, including the renewal regression.
- `tests/test_api_contract.py` — updated for the new `needs_decision` shape;
  added a check that the header badge and the decisions endpoint agree.
- `web/components/*.test.tsx` — rewritten to assert geometry and semantics
  rather than styling class names, so a future visual change does not redden
  them spuriously.
- `web/e2e/game-flow.spec.cjs` — updated for the new shell; nav queries scoped
  to the rail landmark since navigation now renders twice.

All green: 87 passed / 2 skipped (pytest), 22 passed (vitest), 2 passed
(playwright).

## Note on scope

The build plan forbids engine changes. That constraint was explicitly lifted for
this work, but two invariants were treated as hard regardless: the test suite
stays green, and hidden state never crosses the wire. Leaking a true ability
solves the scouting loop from devtools, which would remove the game's central
idea.
