"""Rendering helpers for the CLI.

Deliberately thin and throwaway: it turns engine events and state into tables.
Every screen reads state and renders events — no rules live here.
"""

from __future__ import annotations

from typing import Iterable, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from football_agent.engine import calendar as cal
from football_agent.engine import reputation as reputation_module
from football_agent.engine.balance import Balance
from football_agent.engine.economy import format_money
from football_agent.engine.events import Event, Severity
from football_agent.engine.models import ScoutingReport, World
from football_agent.engine.systems import league as league_system
from football_agent.engine.systems import scouting as scouting_system
from football_agent.engine.systems import trust as trust_system
from football_agent.engine.systems.development import playing_time
from football_agent.engine.systems.finance import weekly_burn
from football_agent.engine.world import hq_level

console = Console()

SEVERITY_STYLE = {
    Severity.INFO: "dim",
    Severity.GOOD: "bold green",
    Severity.WARNING: "yellow",
    Severity.CRITICAL: "bold red",
    Severity.ACTION: "bold cyan",
}


def header(world: World, balance: Balance, action_count: int = 0) -> Panel:
    burn = weekly_burn(world, balance)
    burn_style = "green" if burn >= 0 else "red"
    level = hq_level(balance, world.agency.hq_level)

    line = Text()
    line.append(f"{world.agency.name}", style="bold")
    line.append("   ")
    line.append(cal.describe(balance, world.week))
    line.append("\n")
    line.append(f"Cash {format_money(world.agency.cash)}", style="bold")
    line.append("   ")
    line.append(f"Net {format_money(burn)}/wk", style=burn_style)
    line.append("   ")
    line.append(f"Reputation {world.agency.reputation:.0f} "
                f"({reputation_module.describe(world.agency.reputation)})")
    line.append("   ")
    line.append(f"Clients {len(world.clients)}/{level.client_cap}")
    line.append("   ")
    line.append(f"Scouts {len(world.scouts)}/{level.scout_cap}")
    if action_count:
        line.append("   ")
        line.append(f"{action_count} need you", style="bold cyan")
    return Panel(line, border_style="blue")


def events_table(events: Iterable[Event], title: str = "Inbox") -> Table:
    table = Table(title=title, expand=True, show_lines=False)
    table.add_column("Wk", width=5, justify="right")
    table.add_column("What happened")
    rows = 0
    for event in events:
        table.add_row(
            str(event.week),
            Text(event.message, style=SEVERITY_STYLE.get(event.severity, "")),
        )
        rows += 1
    if rows == 0:
        table.add_row("", Text("Nothing to report.", style="dim"))
    return table


def report_range(report: Optional[ScoutingReport], balance: Balance) -> str:
    """Reports are ranges, never numbers — this is the whole scouting mechanic."""
    if report is None:
        return "unknown"
    return (
        f"{report.ability_low:.0f}-{report.ability_high:.0f} "
        f"({scouting_system.confidence(report, balance)})"
    )


def clients_table(world: World, balance: Balance) -> Table:
    table = Table(title="Clients", expand=True)
    table.add_column("#", width=3, justify="right")
    table.add_column("Name")
    table.add_column("Age", width=4, justify="right")
    table.add_column("Pos", width=4)
    table.add_column("Club")
    table.add_column("Ability", width=16)
    table.add_column("Role", width=9)
    table.add_column("Wage", width=9, justify="right")
    table.add_column("Deal ends", width=10, justify="right")
    table.add_column("Cut", width=6, justify="right")
    table.add_column("Trust", width=15)
    table.add_column("Flags")

    for index, player in enumerate(sorted(world.client_players(), key=lambda p: -p.ability), 1):
        record = world.clients[player.id]
        club = world.clubs.get(player.club_id) if player.club_id else None
        pt = playing_time(balance, player, club)
        flags = []
        if player.is_injured:
            flags.append(Text(f"injured {player.injury_weeks}w", style="red"))
        if player.transfer_listed:
            flags.append(Text("listed", style="yellow"))
        if player.seeking_move:
            flags.append(Text("seeking", style="cyan"))
        interests = world.interests_for(player.id)
        if interests:
            flags.append(Text(f"{len(interests)} interested", style="bold cyan"))
        agent_left = record.agent_contract.expires_week - world.week
        if agent_left <= 26:
            flags.append(Text(f"you: {agent_left}w", style="bold magenta"))

        contract_left = (
            f"{player.contract.expires_week - world.week}w" if player.contract else "free agent"
        )
        trust_text = Text(
            f"{record.trust:.0f} {trust_system.describe(record.trust)}",
            style=_trust_style(record.trust),
        )
        table.add_row(
            str(index),
            player.name,
            str(player.age),
            player.position.value,
            world.club_name(player.club_id),
            report_range(world.reports.get(player.id), balance),
            pt.value,
            format_money(player.contract.wage) if player.contract else "-",
            contract_left,
            f"{record.agent_contract.commission_pct * 100:.1f}%",
            trust_text,
            Text(" ").join(flags) if flags else "",
        )
    return table


def _trust_style(trust: float) -> str:
    if trust >= 60:
        return "green"
    if trust >= 40:
        return "yellow"
    return "bold red"


def scouts_table(world: World, balance: Balance) -> Table:
    table = Table(title="Scouts", expand=True)
    table.add_column("#", width=3, justify="right")
    table.add_column("Name")
    table.add_column("Quality", width=8, justify="right")
    table.add_column("Wage", width=9, justify="right")
    table.add_column("Region")
    table.add_column("Brief")
    table.add_column("Watching")
    table.add_column("Precision", width=10, justify="right")

    for index, scout in enumerate(world.scouts.values(), 1):
        brief = []
        if scout.brief_position:
            brief.append(scout.brief_position.value)
        if scout.brief_max_age:
            brief.append(f"U{scout.brief_max_age}")
        focus = world.players[scout.focus_player_id].name if scout.focus_player_id else "-"
        region = world.regions[scout.region_id].name if scout.region_id else Text("UNASSIGNED", style="bold red")
        table.add_row(
            str(index),
            scout.name,
            f"{scout.quality:.0f}",
            format_money(scout.wage),
            region,
            ", ".join(brief) or "-",
            focus,
            f"{scouting_system.precision(world, balance, scout) * 100:.0f}%",
        )
    return table


def regions_table(world: World, balance: Balance) -> Table:
    table = Table(title="Regions", expand=True)
    table.add_column("Id", width=10)
    table.add_column("Region")
    table.add_column("Talent pool", width=12)
    table.add_column("Cost/wk", width=9, justify="right")
    table.add_column("Scouts", width=7, justify="right")
    table.add_column("Reports", width=8, justify="right")

    for region in world.regions.values():
        stars = "*" * int(round(region.star_rating))
        reports = sum(1 for r in world.reports.values() if r.region_id == region.id)
        table.add_row(
            region.id,
            region.name,
            f"{stars} {region.star_rating:.1f}",
            format_money(region.scouting_cost),
            str(len(world.scouts_in_region(region.id))),
            str(reports),
        )
    return table


def reports_table(world: World, balance: Balance, limit: int = 25) -> Table:
    table = Table(title="Scouting reports", expand=True)
    table.add_column("#", width=3, justify="right")
    table.add_column("Name")
    table.add_column("Age", width=4, justify="right")
    table.add_column("Pos", width=4)
    table.add_column("Club")
    table.add_column("Ability", width=18)
    table.add_column("Potential", width=14)
    table.add_column("Watched", width=8, justify="right")
    table.add_column("Approach?")

    from football_agent.engine import actions as A

    rows = [
        (report, world.players[report.player_id])
        for report in world.reports.values()
        if report.player_id in world.players and report.player_id not in world.clients
    ]
    rows.sort(key=lambda pair: -pair[0].potential_mid)

    for index, (report, player) in enumerate(rows[:limit], 1):
        ok, reason = A.can_approach(world, balance, player.id)
        table.add_row(
            str(index),
            player.name,
            str(player.age),
            player.position.value,
            world.club_name(player.club_id),
            report_range(report, balance),
            f"{report.potential_low:.0f}-{report.potential_high:.0f}",
            f"{report.weeks_watched}w",
            Text("yes", style="bold green") if ok else Text(reason[:38], style="dim"),
        )
    if not rows:
        table.add_row("", Text("No reports yet — assign a scout to a region.", style="dim"), "", "", "", "", "", "", "")
    return table


def finance_table(world: World, balance: Balance, weeks: int = 12) -> Table:
    table = Table(title=f"Finances — last {weeks} weeks", expand=True)
    table.add_column("Wk", width=5, justify="right")
    table.add_column("Retainers", justify="right")
    table.add_column("HQ", justify="right")
    table.add_column("Scouts", justify="right")
    table.add_column("Regions", justify="right")
    table.add_column("Net", justify="right")

    for row in world.finance_history[-weeks:]:
        table.add_row(
            str(row.week),
            format_money(row.retainers),
            format_money(-row.hq_cost),
            format_money(-row.scout_wages),
            format_money(-row.region_costs),
            Text(format_money(row.net), style="green" if row.net >= 0 else "red"),
        )
    return table


def league_table(world: World, league_id: int, highlight: Optional[List[int]] = None) -> Table:
    league = world.leagues[league_id]
    table = Table(title=league.name, expand=True)
    table.add_column("Pos", width=4, justify="right")
    table.add_column("Club")
    table.add_column("P", width=4, justify="right")
    table.add_column("W", width=4, justify="right")
    table.add_column("D", width=4, justify="right")
    table.add_column("L", width=4, justify="right")
    table.add_column("GD", width=5, justify="right")
    table.add_column("Pts", width=5, justify="right")
    table.add_column("Str", width=5, justify="right")

    highlight = highlight or []
    for position, row in enumerate(league_system.standings(world, league_id), 1):
        club = world.clubs[row.club_id]
        style = "bold cyan" if row.club_id in highlight else ""
        table.add_row(
            str(position),
            Text(club.name, style=style),
            str(row.played),
            str(row.won),
            str(row.drawn),
            str(row.lost),
            f"{row.goal_difference:+d}",
            str(row.points),
            f"{club.strength:.0f}",
            style=style,
        )
    return table


def interests_table(world: World, balance: Balance, player_id: int) -> Table:
    from football_agent.engine import actions as A

    table = Table(title="Approaches on the table", expand=True)
    table.add_column("#", width=3, justify="right")
    table.add_column("Club")
    table.add_column("Tier", width=5, justify="right")
    table.add_column("Pos", width=5, justify="right")
    table.add_column("Max wage", justify="right")
    table.add_column("Max fee", justify="right")
    table.add_column("Expires", width=8, justify="right")
    table.add_column("Type")

    for index, interest in enumerate(world.interests_for(player_id), 1):
        club = world.clubs[interest.club_id]
        table.add_row(
            str(index),
            club.name,
            str(club.tier),
            str(league_system.position_of(world, club.id) or "-"),
            format_money(interest.max_wage),
            format_money(interest.max_fee),
            f"{interest.expires_week - world.week}w",
            "renewal" if interest.is_renewal else ("spent" if interest.attempts_used else "new"),
        )
    return table


def rule(text: str = "") -> None:
    console.rule(text)
