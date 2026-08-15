# 03 — Backend tasks (FastAPI)

Target layout:

```
api/
  __init__.py
  main.py           # app, CORS, exception handlers
  session.py        # Session, SessionStore, cookie plumbing
  dto.py            # hand-written engine -> wire mappers
  negotiations.py   # NegotiationStore + handles
  routers/
    meta.py  game.py  scouting.py  clients.py  negotiations.py  agency.py
tests/
  test_api_contract.py
  test_api_leaks.py
  test_api_parity.py
requirements-api.txt   # fastapi, uvicorn, pydantic, httpx (tests)
```

Add `fastapi`, `uvicorn[standard]`, `httpx` to a **separate**
`requirements-api.txt`. The engine's zero-dependency property is deliberate and
`requirements.txt` should not grow a web framework.

---

## Task B1 — Session store

`api/session.py`:

```python
@dataclass
class Session:
    id: str
    world: World
    balance: Balance
    save_path: Path
    inbox: list[Event] = field(default_factory=list)
    negotiations: dict[str, NegotiationHandle] = field(default_factory=dict)
    last_seen: float = 0.0
```

* `SessionStore` is a module-level dict. Ids from `secrets.token_urlsafe(24)`.
* Cookie `fa_session`: `httponly=True`, `samesite="lax"`, `secure` only when not
  on localhost. Nothing but the id goes in it.
* A `get_session` FastAPI dependency resolves the cookie or raises
  `404 session_not_found`.
* Evict sessions untouched for 24h.

**Slot names are user input.** One helper, used everywhere:

```python
SLOT_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")

def save_path_for(slot: str) -> Path:
    if not SLOT_RE.match(slot):
        raise HTTPException(400, "bad_slot")
    return Path("saves") / f"{slot}.json"
```

Do not build the path any other way. String-concatenating an unvalidated slot
into a filesystem path is a traversal vulnerability, and `..%2f` is the first
thing anyone tries.

## Task B2 — DTO layer

`api/dto.py`, hand-written functions only:

```python
def money(amount: float) -> dict:
    return {"amount": round(float(amount), 2), "text": format_money(amount)}

def player_dto(world: World, player: Player) -> dict: ...
def report_dto(report: ScoutingReport, balance: Balance) -> dict: ...
def event_dto(event: Event) -> dict: ...
def game_state_dto(session: Session) -> dict: ...
```

Rules, enforced by review and by the leak test:

* `player_dto` builds its dict from an explicit field list. No `asdict`, no
  `vars()`, no `**player.__dict__`, no `serde.encode`.
* `report_dto` includes `confidence` from
  `systems.scouting.confidence(report, balance)`, the same label the CLI shows.
* Money always goes through `money()`.
* Enums serialise as their `.value`.

## Task B3 — Game router

`POST /api/game/new`, `/load`, `GET /api/game`, `POST /api/game/continue`,
`/save`, `GET /api/game/inbox`.

`continue` reproduces `Game.do_continue` exactly:

```python
events = tick(session.world, session.balance)
session.negotiations.clear()          # nothing survives a week boundary
session.inbox = [
    e for e in session.inbox
    if e.severity is Severity.ACTION and e.week >= session.world.week - 4
]
session.inbox.extend(events)
session.inbox = session.inbox[-120:]
persistence.save(session.world, session.save_path)
```

Add a dependency that returns `409 game_over` for every mutating route when
`world.game_over` is true. `GET /api/game` must still work so the UI can render
the game-over screen with `game_over_reason`.

## Task B4 — Scouting, clients, agency routers

Thin. Each handler: resolve session → call the `actions` function → map
`ActionResult` → append `result.events` to `session.inbox` → autosave where the
CLI autosaves → return.

One shared helper so the inbox never gets forgotten:

```python
def apply(session: Session, result: ActionResult) -> dict:
    session.inbox.extend(result.events)
    session.inbox = session.inbox[-120:]
    return {"ok": result.ok, "message": result.message,
            "events": [event_dto(e) for e in result.events]}
```

Hiring scouts: regenerate with `actions.scout_candidates(world, balance)` and
index into the result. The list is deterministic for the week, so an index is a
stable reference — and unlike accepting a candidate object from the client, it
cannot be forged.

## Task B5 — Negotiation store

`api/negotiations.py`:

```python
@dataclass
class NegotiationHandle:
    id: str
    kind: str                    # "signing" | "renewal" | "deal"
    negotiation: Negotiation
    subject_id: int              # player_id, or interest_id for deals
    years: int = 4               # deals only
    created_at: float = 0.0
```

* `open_*` handlers build the handle, store it on the session, return the DTO.
* `propose` converts the request to `x` and calls `Negotiation.propose(x)`:
  * signing/renewal — `x_from_pct(balance, pct)`; counters render back through
    `pct_from_x`.
  * deal — `actions.propose_package(balance, interest, wage, fee)`; counters
    render back through `actions.package_from_x`.
* On `Status.ACCEPTED`, complete server-side in the same request:
  * signing → `complete_signing(world, balance, player_id, pct_from_x(agreed_x))`
  * renewal → `complete_renewal(...)`
  * deal → `wage, fee = package_from_x(balance, interest, agreed_x)`; force
    `fee = 0.0` when `interest.is_renewal or player.is_free_agent`; then
    `accept_deal(world, balance, interest.id, wage, fee, handle.years)`
* On `WALKED` / `ABANDONED` / declined `EXHAUSTED` → `close_negotiation()`.
* Delete the handle once `status != OPEN` and completion has run. Autosave.
* Evict handles older than 15 minutes; evict all on tick.

**Never** put `negotiation.threshold` or the raw counter `x` in a response. The
client sees rendered percentages and money only. Leaking `x` alongside the
guide band is enough to reverse-engineer the threshold across a few games.

## Task B6 — Error handling and CORS

* Exception handler mapping `persistence.SaveError` → `409 save_incompatible`.
* Handler for `KeyError` on unknown player/club/interest ids → `404`.
* CORS: allow exactly `http://localhost:3000` (configurable via env), credentials
  on. Do not use `allow_origins=["*"]` with `allow_credentials=True` — it is both
  invalid and, if it ever were honoured, a session-theft vector.
* Bind uvicorn to `127.0.0.1`. This is a local single-player service; there is no
  reason for it to listen on `0.0.0.0`.

## Task B7 — Leak tests

`api/tests/test_api_leaks.py` is the test that protects the game's core:

```python
FORBIDDEN = ["ability", "potential", "threshold", "seed", "hidden_bias",
             "base_threshold_pct", "counter_x", "agreed_x"]

def test_no_hidden_fields_anywhere(client, seeded_game):
    for path in ALL_GET_ROUTES:
        body = json.dumps(client.get(path).json())
        for key in FORBIDDEN:
            assert f'"{key}"' not in body, f"{path} leaks {key}"
```

Note `ability_low`/`ability_high` are legitimate, so match on the exact quoted
key `"ability"` rather than a substring of the field name. Add a second test that
walks the negotiation flow end to end and applies the same assertion to every
response.

## Task B8 — Parity test

The strongest guarantee available, and cheap:

```python
def test_api_and_engine_agree():
    # Same seed, same actions, one through the API, one through engine.actions.
    # After N weeks, persistence.to_dict(world) must be identical.
```

Drive both with the same scripted decisions (assign a scout, tick 20 weeks,
hire, tick 10). If they diverge, the API layer has grown a rule and needs
surgery.

## Running it

```bash
python3 -m pip install -r requirements-api.txt
python3 -m uvicorn api.main:app --reload --port 8000 --host 127.0.0.1 --workers 1
```

`--workers 1` is load-bearing: sessions and live negotiations are in-process.
