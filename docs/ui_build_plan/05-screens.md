# 05 — Screens

Seven screens, matching the CLI's seven so nothing is invented and nothing is
lost. Each entry lists what it reads, what it shows and what it lets the player
do.

---

## Persistent shell — `app/layout.tsx`

Always visible, on every screen.

**Header bar** (`GET /api/game`):

```
Marchant Management        Season 2, week 34 — Summer window open (closes in 3w)
£75.0k    -£420/wk    Reputation 31 (known)    Clients 4/5    Scouts 1/1    2 need you
```

* Cash and weekly net side by side; net in red when negative. This pairing is
  the game's central pressure and should never be more than a glance away.
* Window state is prominent when open — deals only happen inside it, and a
  player who misses that has lost a season.
* "2 need you" links to the inbox and is the badge on the Continue button.

**Nav**: Inbox · Clients · Scouting · Headquarters · Finances · Leagues.

**Continue** button, bottom-right, always reachable. Calls
`POST /api/game/continue`, then shows the returned `notable` events in a
week-summary panel that dismisses on click. Disable while in flight — a
double-press is two weeks and there is no undo.

---

## 1. Inbox — `/`

The home screen. `GET /api/game/inbox`.

* **Needs a decision** — `severity: "action"` events, at the top, in the accent
  colour. Each row deep-links from `event.data`: `player_id` → client detail,
  `interest_id` → straight into the deal negotiation.
* **Recent** — the notable feed, newest first, grouped by week with a small week
  divider. Severity drives the colour and an icon.
* Empty state: "Nothing to report." Then the Continue button is the only thing
  on screen, which is the correct feeling.

---

## 2. Clients — `/clients`

`GET /api/clients`. A dense table, one row per client:

| Name | Age | Pos | Club | Ability | Role | Wage | Deal ends | Cut | Trust | Flags |

* **Ability** is the `range-bar` component, never a number.
* **Trust** is the meter plus its label; red under 40.
* **Flags** are badges: `injured 6w`, `listed`, `seeking`, `2 interested`,
  `you: 18w` (agent contract running out). `interested` and the agent-contract
  warning use the accent colour — they are the two that cost you money if
  ignored.
* Row click → client detail.
* Empty state points at Scouting: "You have no clients. Scout and sign someone."

---

## 3. Client detail — `/clients/[id]`

`GET /api/clients/{id}`. The screen where most decisions are made.

**Identity panel**: name, age, position, trait, club (with strength and league
position), ability and potential ranges, role, trust, wage and weeks left, your
commission and weeks left on your agreement, market value and the club's asking
price.

Trait deserves emphasis — it is the only thing making clients non-interchangeable
and it predicts how they will take a move. Show it as a labelled badge with a
tooltip carrying the one-line explanation from `models.Trait`.

**Approaches**: the `interests` list. Each card shows the club, its strength,
their wage ceiling and fee ceiling, weeks until it expires, and a primary
**Negotiate** button. When `can_negotiate.ok` is false, disable it and show the
reason verbatim.

The card must carry the warning plainly: **one negotiation per approach, and
naming a number spends it.** In the CLI this is a dim line of text; here it
should be a persistent note on the card, because a mouse makes it far easier to
click something irreversible by accident.

**Actions**: Seek a move · Promise a move (confirm dialog: "If no move lands,
he'll hold it against you") · Stop seeking · Renew your agreement · Release
(confirm).

---

## 4. Scouting — `/scouting`

`GET /api/scouting`. Three stacked sections.

**Regions**: id, name, talent pool (stars + rating), weekly cost, scouts
assigned, reports produced. Make the trade-off legible — cheap regions have
weaker pools, but a low-reputation agent can actually sign those players.

**Scouts**: name, quality, wage, region, brief, who they're watching, precision
as a percentage. An unassigned scout gets a loud red `UNASSIGNED` — he is costing
money and doing nothing.

**Reports**: the table that drives signings, sorted by potential midpoint.

| Name | Age | Pos | Club | Ability | Potential | Watched | Approach? |

* Both ability and potential are range bars. A freshly discovered player has a
  very wide bar; five weeks of watching visibly narrows it. That animation of
  certainty arriving is the scouting loop, and it is the single best thing the
  web UI can do that the CLI cannot.
* **Approach?** shows either a **Sign** button or the blocked reason from
  `can_approach` — "He won't take your call. Needs an agent of reputation 31;
  you're on 12."

**Actions**: Assign scout (modal: scout, region, optional position brief,
optional max age) · Focus on a player · Hire scout (modal listing the three
weekly candidates with quality, wage and signing-on fee) · Dismiss scout.

---

## 5. Negotiation dialog — modal, not a route

Two variants of one component. Both are modal, both block the rest of the UI,
both open with an explicit confirmation step **before** the first number is
named, because that first proposal is the irreversible act.

**Common frame**: subject, round `n of 3`, the guidance band, the running
history of hints and counters, and the current status.

### Commission haggle (signing and renewal)

* Opening panel: who you're talking to, your read on him (both ranges), your
  reputation, the commission band, and "Push too hard and he walks — for weeks."
* Input: a percentage slider bounded by `bounds.min_pct`/`max_pct`, with the
  guide band shaded on the track and the numeric value editable. The shaded band
  is the honest version of what the CLI prints: agents of your standing usually
  command 7–13%, but where *he* sits in it is his business.
* After each proposal: the hint in severity colour, and his counter as a
  percentage with **Accept his X%** and **Push again** side by side. Push again
  must be visually secondary — it is the risky option.
* On the final round, `Push again` disappears and the counter is labelled "Final
  offer".

### Package haggle (club deals)

* Opening panel: the club, their wage and fee ceilings, the selling club's
  asking price, and the one-negotiation warning.
* Contract length is chosen **once, up front**, before any proposal.
* Inputs: wage per week and transfer fee (fee hidden for renewals and free
  agents), each with the club's ceiling shown as a marker and the guide band
  shaded.
* **Before submitting, call `/assess`** and show the verdict inline: "He'll see
  this as you cashing in on him. (trust −12)". This is not optional decoration —
  it is what converts the greedy deal from a trap into a choice, and it must be
  visible in the same glance as the Submit button.
* Counters come back as money, with **Take their terms** / **Push again**.

Outcomes: `accepted` shows the completion `result.message` and the events;
`walked` shows the consequence in red ("Eastvale have withdrawn their interest");
either way, close and `router.refresh()`.

---

## 6. Headquarters — `/headquarters`

`GET /api/hq`. Current level, its caps, precision bonus and weekly cost; then the
next level with the same figures and the upgrade cost. Upgrade behind a confirm
that repeats the warning: *bigger premises mean bigger weekly bills, and
over-expanding before a window is how agencies die.*

Show the projected weekly net after upgrading next to the current one. The
decision is affordability over time, not the sticker price.

---

## 7. Finances — `/finances`

`GET /api/finances`. Cash, weekly net, lifetime commission, lifetime costs. When
the net is negative, the runway line in red: **"At this rate you run out in 7
weeks."** Next to it, weeks until the next window — the two numbers together are
the whole solvency decision.

Then the weekly history table: retainers, commission, scout wages, HQ cost,
region costs, net. A small sparkline of net per week is worth building; a full
charting library is not.

---

## 8. Leagues — `/leagues`

`GET /api/leagues`. One table per league: position, club, played, W/D/L, GF, GA,
GD, points. Highlight rows where you have a client. This screen is context, not
decision-making — keep it plain.

---

## 9. New game and game over

**`/new-game`**: agency name, optional seed, save slot. Explain the seed in one
line ("same seed, same world — useful for comparing runs"). Show the seed on the
confirmation so a good world can be replayed.

**Game over**: full-screen, red-bordered. `game_over_reason`, the season reached,
final reputation, lifetime commission. One button: start again. The engine gives
warnings, then forced downsizing, then this — so the screen should read as the
end of a story, not an error dialog.
