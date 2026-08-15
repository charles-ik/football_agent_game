# Football Agent — Web UI Build Plan

A plan for building a **Next.js** front end for the existing Python engine in
`football_agent/`.

Read these in order. Each document is self-contained enough to hand to a single
agent as a work package.

| Doc | What it covers |
| --- | --- |
| [01-architecture.md](01-architecture.md) | The shape of the system and the decisions that are already made |
| [02-api-contract.md](02-api-contract.md) | Every endpoint, request and response DTO |
| [03-backend-tasks.md](03-backend-tasks.md) | Building the FastAPI layer over the engine |
| [04-frontend-foundation.md](04-frontend-foundation.md) | Next.js scaffolding, data flow, visual language |
| [05-screens.md](05-screens.md) | Screen-by-screen specification |
| [06-build-order.md](06-build-order.md) | The ordered task list with acceptance criteria |

## The one-paragraph version

The Python engine is the asset and stays untouched. A thin **FastAPI** service
wraps `football_agent.engine.actions` and `tick()` and speaks JSON. A **Next.js**
app is the only thing that gets designed, and it holds **no game rules**. The two
hard parts are (a) live negotiations, which are transient server-side objects
that cannot be serialised into a save file, and (b) hidden information, which the
CLI protects by accident and a browser client will leak unless the API strips it
deliberately.

## Non-negotiable rules for any agent working on this

1. **Do not port the engine to TypeScript.** Not a partial port, not "just the
   formatting helpers". Every number the UI displays comes from the API.
2. **Do not add rules to the API layer.** If a behaviour is not already in
   `engine/actions.py` or a system module, it does not belong in a route handler
   either. Add it to the engine, with a test, or leave it out.
3. **Never send hidden state over the wire.** `Player.ability`,
   `Player.potential`, `Negotiation.threshold`, the world seed and the
   negotiation-tuning block of `balance.json` must never appear in a response
   body. See [01-architecture.md](01-architecture.md#hidden-information-is-a-wire-problem-now).
4. **`python3 -m pytest tests/ -q` must stay green** at every step. If a change
   to the engine is genuinely required, it comes with a test.
5. **The CLI keeps working.** It is the reference implementation and the thing
   the tuning harness drives. Do not delete it, do not refactor it "while you're
   in there".
