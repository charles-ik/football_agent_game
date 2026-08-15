# 02 — API contract

Base path `/api`. All responses are JSON. All mutating endpoints are `POST`.
Every response carries the current session cookie; every endpoint except
`/api/meta` and `/api/game/new` requires one.

## Conventions

**Refusals are values, not errors.** `engine/actions.py` returns
`ActionResult(ok=False, message=...)` for "you can't afford that". Mirror it:

```jsonc
// 200 OK — the action was understood and legitimately refused
{ "ok": false, "message": "Upgrade costs £45.0k; you have £12.3k.", "events": [] }
```

Reserve HTTP errors for real faults:

| Code | `error` | When |
| --- | --- | --- |
| 400 | `bad_request` | Malformed body |
| 404 | `session_not_found` | Unknown/expired session cookie |
| 404 | `negotiation_not_found` | Expired or already-resolved negotiation |
| 409 | `save_incompatible` | `persistence.SaveError` |
| 409 | `game_over` | Any action attempted after `world.game_over` |

**Money** is sent as a raw number plus a preformatted string, so the UI never
reimplements `economy.format_money`:

```json
{ "amount": 45000.0, "text": "£45.0k" }
```

Call this shape `Money` throughout. It is worth the verbosity: `format_money`
has the game's voice in it.

**Events** are the engine's real interface. Send them through intact:

```json
{ "kind": "transfer.interest", "message": "Northbridge United want Danny Vale.",
  "week": 34, "severity": "action", "data": { "player_id": 41, "club_id": 7 } }
```

`severity` is one of `info | good | warning | critical | action`. The UI badges
`action` and `critical`; `data` carries the ids it needs to deep-link.

---

## Meta

### `GET /api/meta`
No session required. The curated balance allowlist (see
[01-architecture.md](01-architecture.md#hidden-information-is-a-wire-problem-now)).

```json
{
  "commission": { "min_pct": 0.03, "max_pct": 0.20 },
  "calendar": { "weeks_per_season": 52, "windows": [[1,10],[28,31]],
                "window_names": { "1": "Summer window", "28": "Winter window" } },
  "hq_levels": [ { "level": 1, "name": "One-room office", "scout_cap": 1,
                   "client_cap": 5, "precision_bonus": 0.0,
                   "weekly_cost": {"amount":180,"text":"£180"},
                   "upgrade_cost": {"amount":45000,"text":"£45.0k"} } ],
  "positions": ["GK","DF","MF","FW"],
  "traits": ["ambitious","mercenary","loyal","professional"]
}
```

---

## Game lifecycle

### `POST /api/game/new`
```jsonc
{ "seed": 42, "name": "Marchant Management", "slot": "autosave" }  // all optional
```
Calls `world.create_world(seed, balance, name)`, creates a session, sets the
cookie, autosaves. Returns `GameState`. The response **may** echo `seed` once so
the player can note it down; it must not appear in any later response.

### `POST /api/game/load`
```jsonc
{ "slot": "autosave" }
```
`persistence.load()`. `409 save_incompatible` on `SaveError`.

### `GET /api/game`
Returns `GameState` — the header bar and everything cheap.

```json
{
  "agency": { "name": "Marchant Management",
              "cash": {"amount": 75000, "text": "£75.0k"},
              "reputation": 12, "reputation_label": "unknown",
              "hq_level": 1, "hq_name": "One-room office",
              "total_commission": {"amount":0,"text":"£0"},
              "total_costs": {"amount":0,"text":"£0"} },
  "calendar": { "week": 34, "season": 1, "season_week": 34,
                "description": "Season 1, week 34",
                "window_open": false, "window_name": null,
                "weeks_until_window_closes": null,
                "weeks_until_next_window": 3,
                "is_match_week": true },
  "counts": { "clients": 4, "client_cap": 5, "scouts": 1, "scout_cap": 1 },
  "weekly_net": { "amount": -420.0, "text": "-£420" },
  "pending_actions": 2,
  "game_over": false,
  "game_over_reason": ""
}
```

Sources: `world.agency`, `reputation.describe()`, `world.hq_level()`,
`calendar.*`, `systems.finance.weekly_burn()`, count of `severity == action`
events in the session inbox.

### `POST /api/game/continue`
The Continue button. Calls `tick(world, balance)`, **evicts all open
negotiations**, trims the inbox the way the CLI does (keep `action` events from
the last 4 weeks, append the new ones), autosaves.

```json
{ "state": { /* GameState */ },
  "events": [ /* everything tick() returned */ ],
  "notable": [ /* events minus finance.retainer, league.round, scouting.narrowed */ ] }
```

### `POST /api/game/save` → `{ "ok": true, "slot": "autosave" }`

### `GET /api/game/inbox?limit=40`
```json
{ "needs_decision": [ /* severity == action */ ], "recent": [ /* notable */ ] }
```

---

## Scouting

### `GET /api/scouting`
```json
{
  "regions": [ { "id": "capital", "name": "The Capital", "country": "…",
                 "star_rating": 4.5, "scouting_cost": {"amount":900,"text":"£900"},
                 "scouts_assigned": 1, "report_count": 12 } ],
  "scouts": [ { "id": 3, "name": "Ray Whitlock", "quality": 44,
                "wage": {"amount":610,"text":"£610"},
                "region_id": "capital", "region_name": "The Capital",
                "brief_position": "DF", "brief_max_age": 23,
                "focus_player_id": null, "focus_player_name": null,
                "precision": 0.41 } ],
  "reports": [ /* ScoutingReportRow, sorted by potential_mid desc */ ]
}
```

`ScoutingReportRow`:

```json
{ "player": { /* PlayerDTO */ },
  "report": { "ability_low": 61, "ability_high": 74,
              "potential_low": 66, "potential_high": 88,
              "confidence": "rough", "weeks_watched": 5,
              "first_seen_week": 29, "region_id": "capital",
              "scout_id": 3 },
  "can_approach": false,
  "approach_blocked_reason": "He won't take your call. Needs an agent of reputation 31; you're on 12." }
```

`can_approach` / reason come verbatim from `actions.can_approach()`. **No
`ability`, no `potential`, no market value on this row.**

### `POST /api/scouting/assign`
```jsonc
{ "scout_id": 3, "region_id": "capital", "brief_position": "DF", "brief_max_age": 23 }
// region_id null = unassign; brief fields optional
```
→ `actions.assign_scout()`.

### `POST /api/scouting/focus`
```jsonc
{ "scout_id": 3, "player_id": 41 }   // player_id null clears focus
```

### `GET /api/scouting/candidates`
`actions.scout_candidates(world, balance)` — three hireable scouts, **stable for
the current week** because they are generated from a seeded stream. Candidates
carry negative ids; return them as `index` (0-based) plus name, quality, weekly
wage and signing-on fee (`wage * finance.scout_hire_cost_multiplier`).

### `POST /api/scouting/hire`
```jsonc
{ "index": 1 }
```
The server regenerates the candidate list for the current week and hires
`candidates[index]`. Do not accept a candidate object from the client — that
would let a browser mint a 95-quality scout.

### `POST /api/scouting/dismiss` → `{ "scout_id": 3 }`

---

## Clients

### `GET /api/clients`
Array of `ClientRow`, sorted by ability descending (server-side; ability itself
is not sent):

```json
{ "player": { /* PlayerDTO */ },
  "report": { /* ScoutingReportDTO or null */ },
  "club_name": "Northbridge United",
  "playing_time": "starter",
  "wage": {"amount":4200,"text":"£4.2k"},
  "club_contract_weeks_left": 61,
  "commission_pct": 0.11,
  "agent_contract_weeks_left": 18,
  "trust": 64, "trust_label": "solid",
  "flags": { "injured_weeks": 0, "transfer_listed": false,
             "seeking_move": true, "interest_count": 2,
             "agent_contract_expiring": true } }
```

### `GET /api/clients/{player_id}`
`ClientRow` plus the detail-screen extras — and this is the one place derived
true-ability numbers are allowed, because he is already yours:

```json
{ "…ClientRow": "…",
  "club": { "id": 7, "name": "Northbridge United", "strength": 62,
            "prestige": 58, "league_position": 4 },
  "market_value": {"amount":1450000,"text":"£1.45M"},
  "asking_price": {"amount":1400000,"text":"£1.40M"},
  "interests": [ /* InterestDTO */ ],
  "can_renew": { "ok": false, "reason": "Too early — 44 weeks still to run." } }
```

`InterestDTO`:

```json
{ "id": 88, "club_id": 12, "club_name": "Eastvale", "club_strength": 71,
  "is_renewal": false, "urgency": 0.7,
  "max_wage": {"amount":9000,"text":"£9.0k"},
  "max_fee": {"amount":2100000,"text":"£2.10M"},
  "expires_in_weeks": 3,
  "can_negotiate": { "ok": true, "reason": "" } }
```

`can_negotiate` from `actions.can_negotiate_interest()`.

### `POST /api/clients/{player_id}/seek` → `{ "promise": false }`
### `POST /api/clients/{player_id}/stop-seeking`
### `POST /api/clients/{player_id}/release`

All three return `ActionResult`.

---

## Negotiations

The stateful part. Three ways in, one way through, completion handled
server-side.

### `POST /api/negotiations/signing` → `{ "player_id": 41 }`
`actions.open_signing_negotiation()`. If it returns `(None, reason)`, respond
`{ "ok": false, "message": reason }`.

### `POST /api/negotiations/renewal` → `{ "player_id": 41 }`
`actions.open_renewal_negotiation()`.

### `POST /api/negotiations/deal` → `{ "interest_id": 88, "years": 4 }`
Check `actions.can_negotiate_interest()` **first**. Store `years` on the handle;
it is needed at completion and the CLI asks for it up front.

All three return a `Negotiation` DTO:

```json
{ "id": "neg_a1b2c3",
  "kind": "signing",            // signing | renewal | deal
  "subject": "Danny Vale",
  "status": "open",             // open | accepted | walked | exhausted | abandoned
  "round": 0, "max_rounds": 3, "rounds_left": 3,
  "axis": "commission_pct",     // commission_pct | package
  "guide": { "low_pct": 0.07, "high_pct": 0.13 },
  "bounds": { "min_pct": 0.03, "max_pct": 0.20 },
  "context": { "player": {…}, "report": {…}, "reputation": 12 },
  "last_response": null,
  "counter": null }
```

For `kind: "deal"` the shape swaps to the package axis:

```json
{ "axis": "package",
  "guide": { "low_wage": {…}, "high_wage": {…}, "low_fee": {…}, "high_fee": {…} },
  "bounds": { "max_wage": {…}, "max_fee": {…}, "asking_price": {…} },
  "context": { "player": {…}, "club": {…}, "is_renewal": false, "years": 4 } }
```

Guides come from `actions.commission_guide()` / `actions.deal_guide()` +
`actions.package_from_x()`. **The `threshold` is never present in any of these.**

### `POST /api/negotiations/{id}/assess` → `{ "wage": 9000 }`
Deal negotiations only. `actions.assess_move()` → how the client will take it,
shown before the package is put to the club.

```json
{ "trust_delta": -7.5, "verdict": "He won't be happy." }
```

### `POST /api/negotiations/{id}/propose`
```jsonc
{ "pct": 0.12 }                      // signing / renewal
{ "wage": 9000, "fee": 2100000 }     // deal
```

Server converts to the normalised axis (`x_from_pct` / `propose_package`) and
calls `Negotiation.propose(x)`. Returns the negotiation DTO with:

```json
{ "status": "open",
  "last_response": { "hint": "Unimpressed, but still talking.", "round": 1 },
  "counter": { "pct": 0.086 } }            // or { "wage": {…}, "fee": {…} }
```

On `status: "accepted"` the server **immediately** completes
(`complete_signing` / `complete_renewal` / `accept_deal`), autosaves, and adds:

```json
{ "result": { "ok": true, "message": "Signed Danny Vale at 12.0% commission.",
              "events": [ … ] } }
```

On `walked` the server calls `actions.close_negotiation()` and returns its
`ActionResult` in the same `result` field.

### `POST /api/negotiations/{id}/accept-counter`
`Negotiation.accept_counter()` then completion, as above.

### `POST /api/negotiations/{id}/abandon`
`Negotiation.abandon()` then `actions.close_negotiation()`.

---

## Agency

### `GET /api/hq`
Current `HQLevel`, the next one, the upgrade cost, and a `can_upgrade` flag with
a reason.

### `POST /api/hq/upgrade` → `actions.upgrade_hq()` → `ActionResult`.

### `GET /api/finances`
```json
{ "cash": {…}, "weekly_net": {…},
  "total_commission": {…}, "total_costs": {…},
  "weeks_until_broke": 7,          // null when net >= 0
  "weeks_until_next_window": 3,
  "history": [ { "week": 33, "retainers": {…}, "commission": {…},
                 "scout_wages": {…}, "hq_cost": {…}, "region_costs": {…},
                 "income": {…}, "expenditure": {…}, "net": {…} } ] }
```

### `GET /api/leagues`
Every league with its sorted table (`systems.league.standings()`), each row
flagged `has_client: true` where one of your clients plays.

---

## Shared DTOs

```ts
type Money = { amount: number; text: string };

type PlayerDTO = {
  id: number; name: string; age: number;
  position: "GK" | "DF" | "MF" | "FW";
  trait: "ambitious" | "mercenary" | "loyal" | "professional";
  region_id: string; club_id: number | null; club_name: string;
  injury_weeks: number; transfer_listed: boolean; seeking_move: boolean;
  retired: boolean;
  contract: { wage: Money; expires_week: number; years_signed: number } | null;
  represented_by: string | null;   // rival agency name, or null
  // NO ability. NO potential. Ever.
};

type ActionResultDTO = {
  ok: boolean; message: string; events: EventDTO[];
};
```
