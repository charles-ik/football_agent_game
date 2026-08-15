# 01 — Architecture

## Decision: wrap the engine, don't reimplement it

```
┌──────────────────────┐   HTTP/JSON   ┌────────────────────────┐
│  Next.js (App Router)│ ────────────► │  FastAPI  (api/)       │
│  - Server Components │ ◄──────────── │  - DTO mapping         │
│  - Server Actions    │               │  - session store       │
│  - one client-side   │               │  - negotiation handles │
│    negotiation modal │               └───────────┬────────────┘
└──────────────────────┘                           │ direct import
                                                   ▼
                                       ┌────────────────────────┐
                                       │ football_agent.engine  │
                                       │  actions / tick / …    │
                                       │  (unchanged)           │
                                       └────────────────────────┘
```

Why FastAPI and not a TypeScript rewrite of the rules:

* The engine's value is the **tuned numbers** in `data/balance.json` and the
  systems that consume them. A parallel TS implementation would drift within a
  week and silently invalidate the tuning harness.
* `engine/actions.py` already exists as a UI-agnostic action surface — the CLI
  and the five harness bots both drive the game through it. The web UI becomes a
  third caller of the same functions, not a new code path.
* The engine has zero third-party dependencies, so the API service is a `pip
  install fastapi uvicorn` away from working.

**New directory:** `api/` at the repository root, a sibling of `football_agent/`
and `web/`. It imports `football_agent` as a normal package.

```
football_agent_game/
  football_agent/     # engine + CLI, unchanged
  api/                # NEW — FastAPI service
  web/                # NEW — Next.js app
  docs/ui_build_plan/
```

## The two genuinely hard problems

### 1. Negotiations are transient and unserialisable

`engine/systems/negotiation.py` says it plainly: *"Negotiations are transient:
they resolve inside a single interaction, so they are never part of saved world
state."* A `Negotiation` holds a live `random.Random`, a hidden `threshold`, and
an `on_first_propose` callback that closes over world state. It cannot be JSON
round-tripped, and it must not be, because the callback is what enforces *one
negotiation per approach*.

**Therefore:** the API holds live `Negotiation` objects in an in-process
dictionary keyed by an opaque `negotiation_id`, alongside the `World` they belong
to. The client only ever sees the id and the rendered hints and counters.

Consequences the implementing agent must accept:

* The API service is **stateful and single-process**. Do not add a second worker
  (`--workers 1`). Do not put it behind a load balancer. This is a single-player
  local game; that is fine.
* Restarting the API mid-negotiation loses that negotiation. Correct behaviour:
  the client gets `404 negotiation_not_found` and the UI tells the player the
  talks lapsed. The cooldown/attempt penalty has already been written into the
  world by `on_first_propose`, so nothing can be re-rolled for free.
* Negotiations expire. Evict any negotiation older than ~15 minutes, and evict
  **all** open negotiations when the week ticks — the CLI cannot have a
  negotiation open across a `Continue`, so neither can the web UI.

### 2. Hidden information is a wire problem now

The whole game rests on three things being unknown to the player:

| Hidden thing | Where it lives |
| --- | --- |
| A player's true `ability` and `potential` | `models.Player` |
| A counterparty's acceptance `threshold` and hidden `bias` | `Negotiation.threshold`, `negotiation.negotiation_bias()` |
| The tuning constants that would let you compute the above | `data/balance.json` |

In the CLI these are safe because nothing prints them. In a browser the player
can open the network tab. **Serialising the `World` dataclass straight to JSON
destroys the game.**

Rules:

* Build an explicit **DTO layer** (`api/dto.py`) with hand-written mapping
  functions. Never `dataclasses.asdict(world)`, never reuse
  `engine/serde.py:encode` for responses — that function exists for save files,
  where leaking is fine.
* `PlayerDTO` exposes `id, name, age, position, trait, region_id, club_id,
  club_name, injury_weeks, transfer_listed, seeking_move, retired, contract,
  represented_by`. It **never** exposes `ability` or `potential`.
* Ability reaches the client only as a `ScoutingReportDTO` range
  (`ability_low/high`, `potential_low/high`, plus the `confidence` label from
  `scouting.confidence()`), or as an already-derived label such as
  `PlayingTime` — both of which the CLI shows today.
* `market_value()` and `asking_price()` are derived from true ability, so they
  are only returned for **players who are already your clients**, exactly as the
  CLI does in its client-detail screen. Never on a scouting report row.
* `world.seed` never leaves the server after world creation. With the seed and
  `balance.json` a player could compute `negotiation_bias()` for every
  counterparty in the game.
* `GET /api/meta` returns a **curated allowlist** of balance values, never the
  file. Safe: `calendar.*`, `hq_levels`, `commission.min_pct`,
  `commission.max_pct`. Forbidden: the whole `negotiation` block,
  `signing.base_threshold_pct`, `signing.reputation_bonus_pct`,
  `signing.trait_threshold_mod`, `transfers.wage_offer_ceiling_factor`.
* The guidance bands the player is *supposed* to see come from
  `actions.commission_guide()` and `actions.deal_guide()`. Call those; do not
  reconstruct a band client-side.

Add a test that asserts these: see
[03-backend-tasks.md](03-backend-tasks.md#task-b7--leak-tests).

## Sessions, saves and paths

* A session = `{ world, balance, save_path, inbox, negotiations }`, held in
  `api/session.py`.
* The browser gets an `fa_session` **httpOnly, SameSite=Lax** cookie holding an
  opaque session id. No game state in the cookie.
* Save slots are addressed by name and written to `saves/<slot>.json`. The slot
  name is user input, so **slugify it** (`^[a-z0-9-]{1,32}$`, reject otherwise)
  before it touches a path. Naive concatenation here is a path traversal bug.
* Autosave on the same triggers as the CLI: after every tick and after every
  completed deal or signing.
* `persistence.SaveError` (schema mismatch) must surface as a clean
  `409 save_incompatible`, not a 500.

## Where the rules must not migrate to

The CLI contains a little orchestration that looks like UI but is actually rule
sequencing, and the web UI must reproduce it *by calling the same functions in
the same order*, not by inventing its own:

* Opening a deal negotiation → `actions.can_negotiate_interest()` **first**; it
  is what enforces window-open, one-attempt-per-approach and the injury block.
* A negotiation that ends in `WALKED`, `ABANDONED` or `EXHAUSTED`-declined →
  `actions.close_negotiation()`. This is what withdraws club interest and sets
  signing cooldowns. Skipping it silently breaks the consequence model.
* A negotiation that ends `ACCEPTED` → `complete_signing()` /
  `complete_renewal()` / `accept_deal()` immediately, server-side. Do not hand
  the agreed value back to the browser and trust it to call completion.
* `assess_move()` is shown *before* the package is put to the club. It is the
  thing that makes a greedy deal a choice rather than a trap; do not drop it.
