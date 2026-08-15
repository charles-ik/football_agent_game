"""Batch season runner — tune by evidence, not by feel.

Hand-playing gives you five biased seasons per rules change. This runs every
policy across many seeded worlds and writes a CSV, so a change to
``balance.json`` produces a number you can compare against the run before it.

Usage::

    python -m football_agent.harness.runner --seasons 10 --seeds 100
    python -m football_agent.harness.runner --policies greedy,balanced --csv out.csv
"""

from __future__ import annotations

import argparse
import csv
import statistics
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List

from football_agent.engine import calendar as cal
from football_agent.engine.balance import Balance, load_balance
from football_agent.engine.events import (
    CLIENT_LEFT,
    CLIENT_POACHED,
    COMMISSION_EARNED,
    FORCED_DOWNSIZE,
    RIVAL_SIGNED_TARGET,
    TRANSFER_COMPLETED,
)
from football_agent.engine.rng import stream
from football_agent.engine.tick import tick
from football_agent.engine.world import create_world

from .policies import ALL_POLICIES, Policy, build


@dataclass
class SeasonResult:
    policy: str
    seed: int
    seasons: int
    weeks_survived: int
    final_cash: float
    peak_cash: float
    final_reputation: float
    peak_reputation: float
    final_clients: int
    transfers: int
    commission: float
    clients_lost: int
    clients_poached: int
    targets_lost: int
    downsizes: int
    bankrupt: int
    seasons_to_elite: int
    weeks_insolvent: int


def run_one(
    policy_name: str, seed: int, seasons: int, balance: Balance
) -> SeasonResult:
    world = create_world(seed, balance, agency_name=policy_name)
    policy: Policy = build(policy_name)
    weeks = seasons * balance.i("calendar.weeks_per_season")
    elite = balance.f("reputation.elite_threshold")

    counters: Dict[str, int] = {
        "transfers": 0,
        "clients_lost": 0,
        "clients_poached": 0,
        "targets_lost": 0,
        "downsizes": 0,
    }
    commission = 0.0
    peak_cash = world.agency.cash
    peak_rep = world.agency.reputation
    seasons_to_elite = 0
    weeks_insolvent = 0

    for _ in range(weeks):
        if world.game_over:
            break
        r = stream(world.seed, world.week, "policy", policy_name)
        # Actions and the tick both produce events; the harness must read both,
        # because commission and transfers happen inside actions.
        produced = list(policy.play_week(world, balance, r))
        produced.extend(tick(world, balance))

        for event in produced:
            if event.kind == TRANSFER_COMPLETED:
                counters["transfers"] += 1
            elif event.kind == COMMISSION_EARNED:
                commission += float(event.data.get("amount", 0.0))
            elif event.kind == CLIENT_LEFT:
                counters["clients_lost"] += 1
            elif event.kind == CLIENT_POACHED:
                counters["clients_poached"] += 1
            elif event.kind == RIVAL_SIGNED_TARGET:
                counters["targets_lost"] += 1
            elif event.kind == FORCED_DOWNSIZE:
                counters["downsizes"] += 1

        peak_cash = max(peak_cash, world.agency.cash)
        peak_rep = max(peak_rep, world.agency.reputation)
        if world.agency.cash < 0:
            weeks_insolvent += 1
        if seasons_to_elite == 0 and world.agency.reputation >= elite:
            seasons_to_elite = cal.season_number(balance, world.week)

    return SeasonResult(
        policy=policy_name,
        seed=seed,
        seasons=seasons,
        weeks_survived=world.week,
        final_cash=round(world.agency.cash, 2),
        peak_cash=round(peak_cash, 2),
        final_reputation=round(world.agency.reputation, 1),
        peak_reputation=round(peak_rep, 1),
        final_clients=len(world.clients),
        transfers=counters["transfers"],
        commission=round(commission, 2),
        clients_lost=counters["clients_lost"],
        clients_poached=counters["clients_poached"],
        targets_lost=counters["targets_lost"],
        downsizes=counters["downsizes"],
        bankrupt=1 if world.agency.bankrupt else 0,
        seasons_to_elite=seasons_to_elite,
        weeks_insolvent=weeks_insolvent,
    )


def summarise(results: List[SeasonResult]) -> Dict[str, Dict[str, float]]:
    grouped: Dict[str, List[SeasonResult]] = {}
    for result in results:
        grouped.setdefault(result.policy, []).append(result)

    summary = {}
    for policy, rows in grouped.items():
        reached = [r.seasons_to_elite for r in rows if r.seasons_to_elite > 0]
        summary[policy] = {
            "runs": len(rows),
            "median_cash": statistics.median(r.final_cash for r in rows),
            "median_commission": statistics.median(r.commission for r in rows),
            "median_reputation": statistics.median(r.final_reputation for r in rows),
            "median_clients": statistics.median(r.final_clients for r in rows),
            "median_transfers": statistics.median(r.transfers for r in rows),
            "clients_lost_avg": statistics.mean(r.clients_lost + r.clients_poached for r in rows),
            "bankrupt_pct": 100.0 * sum(r.bankrupt for r in rows) / len(rows),
            "elite_pct": 100.0 * len(reached) / len(rows),
            "median_seasons_to_elite": statistics.median(reached) if reached else 0,
        }
    return summary


def print_summary(summary: Dict[str, Dict[str, float]]) -> None:
    from football_agent.engine.economy import format_money

    headers = [
        "policy",
        "runs",
        "med cash",
        "med commission",
        "med rep",
        "clients",
        "transfers",
        "lost/run",
        "bankrupt%",
        "elite%",
        "seasons->elite",
    ]
    widths = [10, 5, 12, 15, 8, 8, 10, 9, 10, 7, 14]
    print("  ".join(h.ljust(w) for h, w in zip(headers, widths)))
    print("-" * (sum(widths) + 2 * len(widths)))

    order = sorted(summary, key=lambda p: -summary[p]["median_commission"])
    for policy in order:
        row = summary[policy]
        cells = [
            policy,
            f"{row['runs']:.0f}",
            format_money(row["median_cash"]),
            format_money(row["median_commission"]),
            f"{row['median_reputation']:.0f}",
            f"{row['median_clients']:.0f}",
            f"{row['median_transfers']:.0f}",
            f"{row['clients_lost_avg']:.1f}",
            f"{row['bankrupt_pct']:.0f}%",
            f"{row['elite_pct']:.0f}%",
            f"{row['median_seasons_to_elite']:.0f}" if row["median_seasons_to_elite"] else "-",
        ]
        print("  ".join(c.ljust(w) for c, w in zip(cells, widths)))

    print()
    if not order or "greedy" not in summary:
        return

    greedy = summary["greedy"]
    others = [summary[p] for p in summary if p not in ("greedy", "passive")]
    if not others:
        return
    best_other_commission = max(o["median_commission"] for o in others)
    best_other_rep = max(o["median_reputation"] for o in others)
    best_other_bankrupt = min(o["bankrupt_pct"] for o in others)

    # Greed is allowed to earn well — that is what makes it tempting. It is only
    # "dominant" if it earns the most *and* isn't paying for it anywhere else.
    pays_in_standing = greedy["median_reputation"] < best_other_rep
    pays_in_survival = greedy["bankrupt_pct"] > best_other_bankrupt
    out_earns = greedy["median_commission"] >= best_other_commission

    if out_earns and not (pays_in_standing or pays_in_survival):
        print(
            "WARNING: greed out-earns everything and pays no price. The trust "
            "system is not biting — raise trust.greedy_deal_penalty or "
            "trust.bad_move_penalty and re-run."
        )
    elif out_earns:
        print(
            f"Greed earns the most but pays for it "
            f"(reputation {greedy['median_reputation']:.0f} vs {best_other_rep:.0f}, "
            f"bankruptcy {greedy['bankrupt_pct']:.0f}% vs {best_other_bankrupt:.0f}%). "
            "Tempting but wrong — the intended shape."
        )
    else:
        print(f"Top earner: {order[0]}. Greed is not dominant.")


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Batch-run bot seasons and report the numbers")
    parser.add_argument("--seasons", type=int, default=10, help="Seasons per run")
    parser.add_argument("--seeds", type=int, default=25, help="Number of seeded worlds")
    parser.add_argument("--start-seed", type=int, default=1000)
    parser.add_argument(
        "--policies",
        default=",".join(ALL_POLICIES),
        help=f"Comma-separated subset of: {', '.join(ALL_POLICIES)}",
    )
    parser.add_argument("--csv", type=Path, default=None, help="Write per-run rows to this CSV")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    balance = load_balance()
    policies = [p.strip() for p in args.policies.split(",") if p.strip()]
    results: List[SeasonResult] = []

    total = len(policies) * args.seeds
    done = 0
    for policy in policies:
        for offset in range(args.seeds):
            results.append(run_one(policy, args.start_seed + offset, args.seasons, balance))
            done += 1
            if not args.quiet:
                print(f"\r{done}/{total} runs", end="", file=sys.stderr, flush=True)
    if not args.quiet:
        print(file=sys.stderr)

    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with open(args.csv, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(asdict(results[0])))
            writer.writeheader()
            for result in results:
                writer.writerow(asdict(result))
        print(f"Wrote {len(results)} rows to {args.csv}")

    print_summary(summarise(results))
    return 0


if __name__ == "__main__":
    sys.exit(main())
