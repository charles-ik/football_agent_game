# Football Agent

A football agent management game. You run an agency: scout talent on incomplete
information, sign clients, and take your cut of their moves.

This is the **Python prototype**, and its job is narrow and deliberate — to find
out whether the core mechanics are any good. The iOS version is a later,
deliberate rewrite. The rules and the tuned numbers are the asset; the terminal
UI is disposable.

```
Scout on incomplete information
  -> sign clients by negotiating your cut
    -> manage their careers and their trust in you
      -> land deals in transfer windows for commission
        -> reinvest in scouts and premises
          -> press Continue
```

## Quick start

```bash
python3 -m pip install -r requirements.txt
python3 -m football_agent.cli.app --new --seed 42
```

Full instructions, including the tuning harness, are in
**[docs/how-to-run.md](docs/how-to-run.md)**.

## The three ideas the game rests on

**Scouting reports are ranges, never numbers.** "Ability 70–85, potential
unclear." The range narrows with your scout's quality, your agency's reputation
and how many scouts you have in that region — so growth buys *precision*, and
signing is always a bet.

**Negotiation is a bounded haggle with real risk.** Up to three rounds against a
hidden acceptance threshold that your reputation shifts in your favour. Their
counter-offer improves the longer you hold out, but irritation compounds, so
pushing late is where deals die. You get one negotiation per approach — naming a
number spends it, so a walk-away cannot be re-rolled.

**Playing time makes greed punishable.** It is derived from a client's ability
against his club's strength, and it drives development, trust and outside
interest. Park a client at a club too good for him because the wages were
better, and he rots, stops improving, and turns on you. Without this, moving
everyone to the richest club would always be correct and half the game's
decisions would evaporate.

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/how-to-run.md](docs/how-to-run.md) | Running the game, the tests and the tuning harness |
| [docs/v1-python-build-plan.md](docs/v1-python-build-plan.md) | The full design, the reasoning behind each decision, and what was deliberately deferred |
| [documentation/](documentation/README.md) | What was actually shipped: the web design system, the app shell, and the decisions model |

## Status

v1 is implemented and playable. ~50 tests pass, including two design guards: the
negotiation must not be trivially solvable, and greed must not dominate.

Deliberately **not** in v1: the Upgrades screen (properties and vehicles), loan
deals, multiple countries, continental competition, real squads with AI-to-AI
transfers, and split club/player reputation. Each is recorded in the build plan
with the reason.
