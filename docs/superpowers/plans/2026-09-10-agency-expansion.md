# Agency Expansion Implementation Plan

> Execute the approved Football Agent agency expansion using bounded subagents and integration review.

**Goal:** A playable visual agency tycoon with staff, client stories, relationships, loans and relaxed weekly pacing.
**Architecture:** Python owns deterministic rules and persisted state. FastAPI exposes typed read models and actions. Next.js renders an illustrated office and responsive management screens.
**Tech Stack:** Python dataclasses, FastAPI, Next.js 15, React 19, TypeScript, Tailwind, pytest, Vitest, Playwright.
**Spec:** Approved proposed plan in the task conversation, 2026-09-10.

## Constraints
Preserve hidden ability/potential, bounded negotiations, single-player weekly turns, fictional world, old saves, and meaningful financial consequences. No external AI runtime, multiplayer, furniture placement, or full squad simulation.

## Tasks
- [x] Reliability: authoritative HQ quote, typed playing-time states, scout form initialization/error recovery, global decisions, viewport-safe briefing, durable mutations and save migration.
- [x] Agency engine: support staff and workload, departments, specialization, identity, objectives, milestones, downsizing; independently tested.
- [x] Career engine: goals, tracked promises, six contextual storylines, responses/cooldowns, history/alumni, trust explanations; independently tested.
- [x] Market engine: club relationships/pitches, richer rival warnings, comparisons, bounded loan negotiation and complete loan lifecycle; independently tested.
- [x] UI: office illustration, agency, career profiles, market/clubs/world, responsive shell, season review, onboarding, filters and comparisons.
- [x] Integration: fixed-order weekly hooks, durable history, deterministic migration, CLI expansion actions, safe advancement and resume talks.
- [x] Verification: complete Python/UI/build/browser checks, regression fixes, balance harness, documentation and final review.
- [ ] Human validation: five-person usability/fun study and subsequent balance tuning.

## Ownership and interfaces
Agency worker owns agency_models.py, agency_management.py, api/routers/management.py and corresponding tests. Career worker owns career_models.py, careers.py, api/routers/careers.py and corresponding tests. Market worker owns market_models.py, market.py, api/routers/market.py and corresponding tests. Root owns shared models/tick/API registration, existing files and all web UI.
Each worker exposes initialize(world,balance), run(world,r,balance)->list[Event], state(world,balance)->JSON-compatible dict, and action(world,balance,operation,payload)->ActionResult. Router GET returns state and POST /action dispatches validated actions. Root integrates state fields and weekly hooks after worker reports exact model contracts.

## Verification
Run .venv/bin/python -m pytest tests/ -q, web npm test, web npm run build, and real-stack Playwright in isolated saves. Cover weekly retry, old-save load, costs/capacity, one-time story consequences, loans and return accounting, hidden-state leaks and responsive controls.

Completed: 134 Python tests passed, 2 skipped; 25 UI unit tests passed; 3 production-stack browser tests passed with successful production build. A 400-run balance comparison identified spending risk requiring human playtesting. See `documentation/features/agency-expansion.md` for findings and limitations. Implementation remains on `codex/agency-tycoon-expansion` for review.
