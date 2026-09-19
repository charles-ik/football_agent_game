# How to run

Everything here assumes you are in the repository root:

```bash
cd football_agent_game
```

## Requirements

* Python 3.10 or newer (developed against 3.10.9)
* Node.js 18.18 or newer and npm (browser game only)
* The engine itself has **zero dependencies** — it is pure standard library. Only
  the CLI and the tests need anything installed.

```bash
python3 -m pip install -r requirements.txt
```

That installs `rich` (CLI tables) and `pytest` (tests). If you only want to run
the tuning harness or drive the engine from your own code, you can skip it.

---

## Play the game

```bash
python3 -m football_agent.cli.app
```

Options:

| Flag | What it does |
| --- | --- |
| `--new` | Start a fresh game, ignoring any existing save |
| `--seed 1234` | Generate a specific world (same seed = same world, every time) |
| `--save path/to/file.json` | Use a different save file (default `saves/autosave.json`) |
| `--name "Kelly Sports"` | Name your agency |

```bash
# a fresh, reproducible world
python3 -m football_agent.cli.app --new --seed 42 --name "Marchant Management"
```

The game **autosaves after every week and every deal**. Loading is automatic: if
the save file exists it is picked up unless you pass `--new`.

### Getting started in-game

You begin as a nobody: one scout, a five-client limit, one unremarkable
second-tier client, and a running cost you cannot cover from retainers alone. You
must land deals.

1. **Scouting → assign scout.** Send him to a region. Cheap regions have weaker
   talent pools, but a low-reputation agent can actually sign those players —
   good players in The Capital simply won't take your call.
2. **Press `C` to continue** a week at a time. Reports come back as *ranges*, not
   numbers, and narrow the longer a scout watches.
3. **Scouting → sign a player** once someone is in reach. You negotiate your
   commission percentage; the game tells you the band an agent of your standing
   usually commands, but where that individual sits inside it is hidden.
4. **Clients → negotiate** when a club approaches during a transfer window.
   Before you commit, the game shows you how the client will take the move.
5. **Headquarters** raises your scout and client limits — and your weekly bills.

### Things worth knowing

* **Deals only happen inside transfer windows** (season weeks 1–10 and 28–31).
* **You get one negotiation per approach.** The moment you name a number, the
  attempt is spent — a walk-away cannot be re-rolled.
* **Push too hard and they walk.** Risk grows with how far past their limit you
  reach, and compounds each round. Their counter-offer improves the longer you
  hold out, so the choice is always "take this, or push once more".
* **Playing time is derived from ability versus club strength.** Moving a client
  somewhere too good for him means the bench, no development, and collapsing
  trust — which is why the biggest cheque is often the wrong deal.
* **Cash going negative won't end you immediately.** You get warnings, then
  forced downsizing (a scout goes, then your HQ), and only then game over.

---

## Play in the browser

The web UI is a thin Next.js front end over a FastAPI service that wraps the
engine. The engine holds every rule; the browser holds no game state beyond an
opaque session cookie.

```bash
# one-time setup
python3 -m pip install -r requirements-api.txt
cd web && npm install && cd ..

# every session: two terminals, or one `make dev`
make api          # FastAPI on http://127.0.0.1:8000
make web          # Next.js on http://localhost:3000
```

Then open **http://localhost:3000**. Start a new agency (note the seed — same
seed, same world), assign your scout, and press **Continue**. Keyboard: `C`
continues, `1`–`6` switch screens, `Esc` closes dialogs.

### Windows PowerShell

Install Python 3.10 or newer and Node.js 18.18 or newer, then open PowerShell in
the repository root. The commands below use the virtual environment directly,
so PowerShell script activation does not need to be enabled.

One-time setup:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-api.txt
cd web
npm ci
cd ..
```

For each play session, start the API in one PowerShell window from the
repository root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000 --host 127.0.0.1 --workers 1
```

Start the web app in a second PowerShell window:

```powershell
cd web
npm run dev
```

Open **http://localhost:3000**. Keep both PowerShell windows running while you
play.

To play the terminal version instead, run this from the repository root:

```powershell
.\.venv\Scripts\python.exe -m football_agent.cli.app --new --seed 42
```

The rules and numbers are identical to the CLI — the API drives
`engine/actions.py` and nothing else. Two consequences of the architecture
worth knowing:

* The API is single-process by design (`--workers 1` is load-bearing) and
  binds to localhost. Sessions and live negotiations are in-memory.
* A negotiation left open across a Continue lapses — the attempt is already
  spent, exactly as in the CLI.

## Run the tests

```bash
python3 -m pytest tests/ -q
```

Alongside the engine tests there are three API guards:
`tests/test_api_contract.py` (endpoints and the refusal model),
`tests/test_api_leaks.py` (no ability, potential, threshold or seed key appears
in any response), and `tests/test_api_parity.py` (same seed, same decisions via
HTTP and via `engine.actions`, identical worlds).


Roughly 50 tests covering the negotiation resolver, RNG determinism, save/load
round-tripping, the economy curves, playing time, trust, the insolvency spiral,
and whole-game integration runs.

Two of these are design guards rather than ordinary unit tests:

* `test_not_trivially_solvable_always_max` — asking the ceiling must never land.
* `test_greed_does_not_dominate` — the greedy bot must end with unhappier
  clients, lower reputation and a shorter run than the careful one.

If either starts failing, a rules change has quietly hollowed out the core
tension.

---

## Run the tuning harness

This is how the game gets balanced. Hand-playing gives you a handful of biased
seasons per change; this gives you hundreds.

```bash
python3 -m football_agent.harness.runner --seasons 10 --seeds 30
```

| Flag | What it does |
| --- | --- |
| `--seasons N` | Seasons per run (default 10) |
| `--seeds N` | Number of seeded worlds per policy (default 25) |
| `--start-seed N` | First seed, so runs are comparable across changes |
| `--policies cautious,greedy` | Subset of policies to run |
| `--csv out.csv` | Write every run as a row for your own analysis |
| `--quiet` | Suppress the progress counter |

The five policies are instruments, not opponents:

| Policy | What it tests |
| --- | --- |
| `cautious` | Asks modestly, hoards cash, never overspends |
| `balanced` | The reference line — measured asks, respects the client |
| `greedy` | Pushes past what its standing justifies, ignores client welfare |
| `reckless` | Over-expands into overheads it cannot service |
| `passive` | Does nothing — the control |

Typical output:

```
policy      runs   med cash   med commission   med rep   clients   bankrupt%   elite%
balanced    20     £299.0k    £1.00M           54        6         10%         10%
cautious    20     £140.9k    £622.8k          51        4         5%          10%
greedy      20     £114.8k    £591.5k          21        5         50%         0%
reckless    20     -£5.1k     £137.3k          0         6         95%         0%
passive     20     -£4.2k     £0               0         0         100%        0%
```

The harness prints a verdict on whether greed is dominant. Greed is *allowed* to
earn well — that is what makes it tempting — but it must pay for it in
reputation or survival. If it stops paying, the harness says so.

### Tuning workflow

1. Note the current numbers (`--start-seed 1000 --seeds 30`).
2. Change **one** value in `football_agent/data/balance.json`.
3. Re-run with the identical flags.
4. Compare. Because RNG is derived per system per week, the difference you see is
   attributable to your change rather than to a reshuffled world.

---

## Drive the engine from your own code

The engine is importable and UI-free. This is the surface a future iOS client
would bind to.

```python
from football_agent.engine.balance import load_balance
from football_agent.engine.world import create_world
from football_agent.engine.tick import tick
from football_agent.engine import actions as A

balance = load_balance()
world = create_world(seed=42, balance=balance)

scout = next(iter(world.scouts.values()))
A.assign_scout(world, scout.id, "east")

for _ in range(20):
    for event in tick(world, balance):
        print(event.severity.value, event.message)
```

Every decision the CLI offers is a function in `football_agent.engine.actions`,
and every consequence comes back as a typed event from
`football_agent.engine.events`.

---

## Layout

```
football_agent/
  engine/          pure rules, zero dependencies
    models.py        world state (dumb dataclasses)
    tick.py          the weekly tick — the whole engine surface
    actions.py       everything the agent can do
    events.py        the typed event vocabulary
    rng.py           derived per-system RNG streams
    economy.py       wages, fees, commission
    reputation.py    reputation accessor (splittable later)
    calendar.py      seasons and transfer windows
    persistence.py   schema-versioned JSON saves
    systems/         negotiation, scouting, transfers, trust,
                     development, contracts, finance, rivals, league
  data/            clubs.json, regions.json, names.json, balance.json
  cli/             the disposable rich-based viewer
  harness/         bot policies and the batch runner
tests/
```

`data/balance.json` holds **every** tunable number. The engine hardcodes none of
them, which is also how a future port inherits the tuned values as data rather
than as constants scattered through the source.
