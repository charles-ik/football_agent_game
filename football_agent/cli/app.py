"""The CLI game.

A disposable viewer over the engine. Every decision it offers routes through
``engine.actions``, so a played season and a bot season exercise identical rules.
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path
from typing import List, Optional

from rich.panel import Panel
from rich.prompt import Confirm, IntPrompt, Prompt
from rich.text import Text

from football_agent.engine import actions as A
from football_agent.engine import calendar as cal
from football_agent.engine import persistence, agency_management, careers, market
from football_agent.engine.balance import Balance, load_balance
from football_agent.engine.economy import format_money, market_value
from football_agent.engine.events import Event, Severity
from football_agent.engine import reputation as reputation_module
from football_agent.engine.models import Position, World
from football_agent.engine.systems import league as league_system
from football_agent.engine.systems import trust as trust_system
from football_agent.engine.systems.development import playing_time
from football_agent.engine.systems.negotiation import Status, pct_from_x, x_from_pct
from football_agent.engine.tick import tick
from football_agent.engine.world import create_world, hq_level, hq_levels

from . import render
from .render import console

DEFAULT_SAVE = Path("saves/autosave.json")
INBOX_LIMIT = 120


class Game:
    def __init__(self, world: World, balance: Balance, save_path: Path):
        self.world = world
        self.balance = balance
        self.save_path = save_path
        self.inbox: List[Event] = list(world.recent_events)

    # ---- plumbing ------------------------------------------------------
    @property
    def pending_actions(self) -> int:
        return sum(1 for e in self.inbox if e.severity is Severity.ACTION)

    def push(self, events: List[Event]) -> None:
        self.inbox.extend(events)
        self.inbox = self.inbox[-INBOX_LIMIT:]

    def autosave(self) -> None:
        persistence.save(self.world, self.save_path)

    def show_header(self) -> None:
        console.print(render.header(self.world, self.balance, self.pending_actions))

    def report(self, result: A.ActionResult) -> None:
        style = "green" if result.ok else "yellow"
        if result.message:
            console.print(Text(result.message, style=style))
        self.push(result.events)
        careers.initialize(self.world, self.balance)
        for event in result.events:
            careers.record_event(self.world, event)
        self.world.recent_events = self.inbox[-INBOX_LIMIT:]

    # ---- main loop -----------------------------------------------------
    def run(self) -> None:
        console.clear()
        console.print(
            Panel(
                "[bold]Football Agent[/bold]\nBuild an agency from nothing. "
                "Scout on incomplete information, sign clients, take your cut.",
                border_style="green",
            )
        )
        while not self.world.game_over:
            self.show_header()
            console.print(
                "[bold]1[/bold] Inbox  [bold]2[/bold] Clients  [bold]3[/bold] Scouting  "
                "[bold]4[/bold] Headquarters  [bold]5[/bold] Finances  [bold]6[/bold] Clubs  "
                "[bold]A[/bold] Agency  [bold]R[/bold] Careers  [bold]M[/bold] Market  "
                "[bold green]C[/bold green] Continue  [bold]S[/bold] Save  [bold]Q[/bold] Quit"
            )
            choice = Prompt.ask("Choose", default="C").strip().lower()

            if choice == "1":
                self.screen_inbox()
            elif choice == "2":
                self.screen_clients()
            elif choice == "3":
                self.screen_scouting()
            elif choice == "4":
                self.screen_headquarters()
            elif choice == "5":
                self.screen_finances()
            elif choice == "6":
                self.screen_clubs()
            elif choice == "a":
                self.screen_agency()
            elif choice == "r":
                self.screen_careers()
            elif choice == "m":
                self.screen_market()
            elif choice == "c":
                self.do_continue()
            elif choice == "s":
                self.autosave()
                console.print(f"[green]Saved to {self.save_path}[/green]")
            elif choice == "q":
                if Confirm.ask("Save before quitting?", default=True):
                    self.autosave()
                return
            else:
                console.print("[yellow]Unknown option.[/yellow]")

        self.show_game_over()

    def do_continue(self) -> None:
        events = tick(self.world, self.balance)
        self.inbox = [e for e in self.inbox if e.severity is Severity.ACTION and e.week >= self.world.week - 4]
        self.push(events)
        self.autosave()
        console.clear()
        self.show_header()
        console.print(render.events_table(_notable(events), "This week"))

    def show_game_over(self) -> None:
        console.print(
            Panel(
                f"[bold red]{self.world.game_over_reason}[/bold red]\n"
                f"Season {self.world.season}, reputation {self.world.agency.reputation:.0f}, "
                f"lifetime commission {format_money(self.world.agency.total_commission)}.",
                title="Game over",
                border_style="red",
            )
        )

    # ---- screens -------------------------------------------------------
    def screen_inbox(self) -> None:
        console.clear()
        self.show_header()
        actions = [e for e in self.inbox if e.severity is Severity.ACTION]
        if actions:
            console.print(render.events_table(actions, "Needs a decision"))
        console.print(render.events_table(_notable(self.inbox[-40:]), "Recent"))
        Prompt.ask("Enter to go back", default="")

    def screen_clients(self) -> None:
        while True:
            console.clear()
            self.show_header()
            console.print(render.clients_table(self.world, self.balance))
            players = sorted(self.world.client_players(), key=lambda p: -p.ability)
            if not players:
                console.print("[yellow]You have no clients. Scout and sign someone.[/yellow]")
                Prompt.ask("Enter to go back", default="")
                return
            choice = Prompt.ask("Client number to manage, or [b]b[/b] to go back", default="b")
            if choice.strip().lower() == "b":
                return
            index = _to_int(choice)
            if index is None or not 1 <= index <= len(players):
                continue
            self.screen_client_detail(players[index - 1].id)

    def screen_client_detail(self, player_id: int) -> None:
        while True:
            world, balance = self.world, self.balance
            player = world.players.get(player_id)
            record = world.clients.get(player_id)
            if player is None or record is None:
                return

            console.clear()
            self.show_header()
            club = world.clubs.get(player.club_id) if player.club_id else None
            pt = playing_time(balance, player, club)
            report = world.reports.get(player_id)
            lines = [
                f"[bold]{player.name}[/bold]  {player.age}  {player.position.value}  "
                f"{player.trait.value}",
                f"Club: {world.club_name(player.club_id)}"
                + (f" (strength {club.strength:.0f}, {league_system.position_of(world, club.id)}th)" if club else ""),
                f"Ability: {render.report_range(report, balance)}   "
                f"Potential: {report.potential_low:.0f}-{report.potential_high:.0f}" if report else "",
                f"Role: {pt.value}   Trust: {record.trust:.0f} ({trust_system.describe(record.trust)})",
                f"Wage: {format_money(player.contract.wage)}/wk, "
                f"{player.contract.expires_week - world.week}w left" if player.contract else "Free agent",
                f"Your cut: {record.agent_contract.commission_pct * 100:.1f}%   "
                f"Your deal ends in {record.agent_contract.expires_week - world.week}w",
                f"Market value: {format_money(market_value(balance, player, world.week))}   "
                f"Club asking: {format_money(A.asking_price(world, balance, player))}",
            ]
            console.print(Panel("\n".join(l for l in lines if l), border_style="cyan"))
            console.print(render.interests_table(world, balance, player_id))

            console.print(
                "[bold]n[/bold] negotiate an approach  [bold]s[/bold] seek a move  "
                "[bold]p[/bold] promise a move  [bold]x[/bold] stop seeking  "
                "[bold]r[/bold] renew your agreement  [bold]d[/bold] release  [bold]b[/bold] back"
            )
            choice = Prompt.ask("Choose", default="b").strip().lower()

            if choice == "b":
                return
            if choice == "n":
                self.negotiate_deal(player_id)
            elif choice == "s":
                self.report(A.seek_move(world, balance, player_id))
            elif choice == "p":
                console.print("[yellow]If no move lands, he'll hold it against you.[/yellow]")
                if Confirm.ask("Promise him a move?", default=False):
                    self.report(A.seek_move(world, balance, player_id, promise=True))
            elif choice == "x":
                self.report(A.stop_seeking(world, player_id))
            elif choice == "r":
                self.negotiate_agent_contract(player_id)
            elif choice == "d":
                if Confirm.ask(f"Release {player.name}?", default=False):
                    self.report(A.release_client(world, balance, player_id))
                    return

    # ---- negotiation -----------------------------------------------------
    def negotiate_deal(self, player_id: int) -> None:
        world, balance = self.world, self.balance
        interests = world.interests_for(player_id)
        if not interests:
            console.print("[yellow]Nobody has approached him.[/yellow]")
            Prompt.ask("Enter to continue", default="")
            return

        console.print(render.interests_table(world, balance, player_id))
        index = _to_int(Prompt.ask("Approach number", default="1"))
        if index is None or not 1 <= index <= len(interests):
            return
        interest = interests[index - 1]

        ok, reason = A.can_negotiate_interest(world, balance, interest.id)
        if not ok:
            console.print(f"[yellow]{reason}[/yellow]")
            Prompt.ask("Enter to continue", default="")
            return

        player = world.players[player_id]
        club = world.clubs[interest.club_id]
        price = A.asking_price(world, balance, player)
        console.print(
            Panel(
                f"Negotiating with [bold]{club.name}[/bold] over {player.name}.\n"
                f"Their ceiling: {format_money(interest.max_wage)}/wk, fee to {format_money(interest.max_fee)}.\n"
                + (
                    f"{world.club_name(player.club_id)} want at least {format_money(price)}.\n"
                    if not interest.is_renewal and not player.is_free_agent
                    else ""
                )
                + "[dim]You get one negotiation per approach. Naming a number spends it.[/dim]",
                border_style="magenta",
            )
        )

        guide_lo, guide_hi = A.deal_guide(balance, world.agency.reputation)
        lo_wage, lo_fee = A.package_from_x(balance, interest, guide_lo)
        hi_wage, hi_fee = A.package_from_x(balance, interest, guide_hi)
        console.print(
            f"[dim]A club this size will usually go to somewhere between "
            f"{format_money(lo_wage)} and {format_money(hi_wage)}/wk"
            + (
                f" (fee {format_money(lo_fee)}-{format_money(hi_fee)})"
                if not interest.is_renewal and interest.max_fee > 0
                else ""
            )
            + " for an agent of your standing.[/dim]"
        )

        negotiation = A.open_deal_negotiation(world, balance, interest)
        years = IntPrompt.ask("Contract length in years", default=4)
        agreed: Optional[float] = None

        while negotiation.is_open or negotiation.status is Status.EXHAUSTED:
            if negotiation.status is Status.EXHAUSTED:
                break
            console.print(
                f"[dim]Round {negotiation.round + 1} of {negotiation.max_rounds}[/dim]"
            )
            wage = _ask_money("Wage per week", interest.max_wage)
            fee = 0.0 if interest.is_renewal or player.is_free_agent else _ask_money(
                "Transfer fee", max(interest.max_fee, price)
            )

            delta, verdict = A.assess_move(world, balance, player, club, wage)
            console.print(f"[dim]How he'd take it: {verdict} (trust {delta:+.0f})[/dim]")
            if not Confirm.ask("Put it to them?", default=True):
                negotiation.abandon()
                break

            response = negotiation.propose(A.propose_package(balance, interest, wage, fee))
            style = {
                Status.ACCEPTED: "bold green",
                Status.WALKED: "bold red",
            }.get(response.status, "yellow")
            console.print(Text(response.hint, style=style))

            if response.status is Status.ACCEPTED:
                agreed = response.agreed_x
                break
            if response.status is Status.WALKED:
                break
            if response.counter_x is not None:
                c_wage, c_fee = A.package_from_x(balance, interest, response.counter_x)
                console.print(
                    f"[cyan]They counter: {format_money(c_wage)}/wk"
                    + (f", fee {format_money(c_fee)}" if not interest.is_renewal else "")
                    + "[/cyan]"
                )
                if negotiation.status is Status.EXHAUSTED or not Confirm.ask(
                    "Push again?", default=True
                ):
                    if Confirm.ask("Take their offer?", default=True):
                        agreed = negotiation.accept_counter().agreed_x
                    else:
                        negotiation.abandon()
                    break

        if agreed is None and negotiation.status is Status.EXHAUSTED and negotiation.last_counter:
            c_wage, c_fee = A.package_from_x(balance, interest, negotiation.last_counter)
            console.print(
                f"[cyan]Final offer: {format_money(c_wage)}/wk, fee {format_money(c_fee)}[/cyan]"
            )
            if Confirm.ask("Take it?", default=True):
                agreed = negotiation.accept_counter().agreed_x
            else:
                negotiation.abandon()

        if agreed is not None:
            wage, fee = A.package_from_x(balance, interest, agreed)
            if interest.is_renewal or player.is_free_agent:
                fee = 0.0
            self.report(A.accept_deal(world, balance, interest.id, wage, fee, years))
        else:
            self.report(A.close_negotiation(world, balance, negotiation))

        self.autosave()
        Prompt.ask("Enter to continue", default="")

    def negotiate_signing(self, player_id: int) -> None:
        world, balance = self.world, self.balance
        negotiation, reason = A.open_signing_negotiation(world, balance, player_id)
        if negotiation is None:
            console.print(f"[yellow]{reason}[/yellow]")
            Prompt.ask("Enter to continue", default="")
            return

        player = world.players[player_id]
        report = world.reports.get(player_id)
        console.print(
            Panel(
                f"Talking to [bold]{player.name}[/bold] ({player.age}, {player.position.value}, "
                f"{player.trait.value}) about representation.\n"
                f"Your read on him: {render.report_range(report, balance)}, "
                f"potential {report.potential_low:.0f}-{report.potential_high:.0f}.\n"
                f"Your reputation: {world.agency.reputation:.0f}. "
                f"Commission band {balance.f('commission.min_pct') * 100:.0f}%"
                f"-{balance.f('commission.max_pct') * 100:.0f}%.\n"
                "[dim]Push too hard and he walks — for weeks.[/dim]",
                border_style="magenta",
            )
        )
        agreed = self._haggle_percentage(negotiation, player.trait.value)
        if agreed is not None:
            self.report(A.complete_signing(world, balance, player_id, agreed))
        else:
            self.report(A.close_negotiation(world, balance, negotiation))
        self.autosave()
        Prompt.ask("Enter to continue", default="")

    def negotiate_agent_contract(self, player_id: int) -> None:
        world, balance = self.world, self.balance
        negotiation, reason = A.open_renewal_negotiation(world, balance, player_id)
        if negotiation is None:
            console.print(f"[yellow]{reason}[/yellow]")
            Prompt.ask("Enter to continue", default="")
            return
        record = world.clients[player_id]
        console.print(
            Panel(
                f"Renewing with [bold]{world.players[player_id].name}[/bold]. "
                f"Current cut {record.agent_contract.commission_pct * 100:.1f}%. "
                f"Trust {record.trust:.0f}.",
                border_style="magenta",
            )
        )
        agreed = self._haggle_percentage(negotiation, world.players[player_id].trait.value)
        if agreed is not None:
            self.report(A.complete_renewal(world, balance, player_id, agreed))
        else:
            self.report(A.close_negotiation(world, balance, negotiation))
        self.autosave()
        Prompt.ask("Enter to continue", default="")

    def _haggle_percentage(self, negotiation, trait: str = "professional") -> Optional[float]:
        balance = self.balance
        low = balance.f("commission.min_pct") * 100
        high = balance.f("commission.max_pct") * 100
        guide_lo, guide_hi = A.commission_guide(
            balance, self.world.agency.reputation, trait
        )
        console.print(
            f"[dim]Agents of your standing usually command "
            f"{guide_lo * 100:.1f}%-{guide_hi * 100:.1f}%. Where he sits in that band "
            f"is his business, not yours.[/dim]"
        )
        opening = f"{(guide_lo + guide_hi) / 2 * 100:.1f}"

        while negotiation.is_open:
            console.print(f"[dim]Round {negotiation.round + 1} of {negotiation.max_rounds}[/dim]")
            raw = Prompt.ask(f"Your commission % ({low:.0f}-{high:.0f})", default=opening)
            pct = _to_float(raw)
            if pct is None:
                continue
            response = negotiation.propose(x_from_pct(balance, pct / 100.0))
            style = {Status.ACCEPTED: "bold green", Status.WALKED: "bold red"}.get(
                response.status, "yellow"
            )
            console.print(Text(response.hint, style=style))

            if response.status is Status.ACCEPTED:
                return pct_from_x(balance, response.agreed_x)
            if response.status is Status.WALKED:
                return None
            if response.counter_x is not None:
                counter_pct = pct_from_x(balance, response.counter_x) * 100
                console.print(f"[cyan]He'll do {counter_pct:.1f}%.[/cyan]")
                if negotiation.status is Status.EXHAUSTED or not Confirm.ask(
                    "Push again?", default=True
                ):
                    if Confirm.ask(f"Accept {counter_pct:.1f}%?", default=True):
                        return pct_from_x(balance, negotiation.accept_counter().agreed_x)
                    negotiation.abandon()
                    return None
        return None

    # ---- scouting --------------------------------------------------------
    def screen_scouting(self) -> None:
        while True:
            console.clear()
            self.show_header()
            console.print(render.regions_table(self.world, self.balance))
            console.print(render.scouts_table(self.world, self.balance))
            console.print(render.reports_table(self.world, self.balance))
            console.print(
                "[bold]a[/bold] assign scout  [bold]f[/bold] focus scout on a player  "
                "[bold]h[/bold] hire scout  [bold]d[/bold] dismiss scout  "
                "[bold]s[/bold] sign a player  [bold]b[/bold] back"
            )
            choice = Prompt.ask("Choose", default="b").strip().lower()
            if choice == "b":
                return
            if choice == "a":
                self.assign_scout()
            elif choice == "f":
                self.focus_scout()
            elif choice == "h":
                self.hire_scout()
            elif choice == "d":
                self.dismiss_scout()
            elif choice == "s":
                self.sign_from_reports()

    def _pick_scout(self):
        scouts = list(self.world.scouts.values())
        if not scouts:
            console.print("[yellow]You have no scouts.[/yellow]")
            return None
        index = _to_int(Prompt.ask("Scout number", default="1"))
        if index is None or not 1 <= index <= len(scouts):
            return None
        return scouts[index - 1]

    def assign_scout(self) -> None:
        scout = self._pick_scout()
        if scout is None:
            return
        region_id = Prompt.ask(
            "Region id", choices=list(self.world.regions) + ["none"], default="none"
        )
        position = Prompt.ask(
            "Brief position", choices=[p.value for p in Position] + ["any"], default="any"
        )
        max_age = _to_int(Prompt.ask("Max age (blank for any)", default=""))
        self.report(
            A.assign_scout(
                self.world,
                scout.id,
                None if region_id == "none" else region_id,
                None if position == "any" else Position(position),
                max_age,
            )
        )
        self.autosave()

    def focus_scout(self) -> None:
        scout = self._pick_scout()
        if scout is None:
            return
        candidates = [
            r for r in self.world.reports.values() if r.region_id == scout.region_id
        ]
        if not candidates:
            console.print("[yellow]No reports in that region yet.[/yellow]")
            return
        for index, report in enumerate(candidates, 1):
            player = self.world.players[report.player_id]
            console.print(
                f"  {index}. {player.name} — {render.report_range(report, self.balance)}"
            )
        index = _to_int(Prompt.ask("Player number (0 to clear)", default="0"))
        if index == 0:
            self.report(A.focus_scout(self.world, scout.id, None))
        elif index and 1 <= index <= len(candidates):
            self.report(A.focus_scout(self.world, scout.id, candidates[index - 1].player_id))
        self.autosave()

    def hire_scout(self) -> None:
        candidates = A.scout_candidates(self.world, self.balance)
        multiplier = self.balance.f("finance.scout_hire_cost_multiplier")
        for index, candidate in enumerate(candidates, 1):
            console.print(
                f"  {index}. {candidate.name} — quality {candidate.quality:.0f}, "
                f"{format_money(candidate.wage)}/wk, "
                f"fee {format_money(candidate.wage * multiplier)}"
            )
        index = _to_int(Prompt.ask("Hire which? (0 to cancel)", default="0"))
        if index and 1 <= index <= len(candidates):
            self.report(A.hire_scout(self.world, candidates[index - 1], self.balance))
            self.autosave()

    def dismiss_scout(self) -> None:
        scout = self._pick_scout()
        if scout is None:
            return
        if Confirm.ask(f"Dismiss {scout.name}?", default=False):
            self.report(A.fire_scout(self.world, scout.id))
            self.autosave()

    def sign_from_reports(self) -> None:
        rows = [
            (r, self.world.players[r.player_id])
            for r in self.world.reports.values()
            if r.player_id in self.world.players and r.player_id not in self.world.clients
        ]
        rows.sort(key=lambda pair: -pair[0].potential_mid)
        if not rows:
            console.print("[yellow]No reports yet.[/yellow]")
            return
        index = _to_int(Prompt.ask("Player number from the reports table", default="1"))
        if index is None or not 1 <= index <= len(rows):
            return
        self.negotiate_signing(rows[index - 1][1].id)

    def expansion_action(self, area: str, operation: str, payload: dict) -> A.ActionResult:
        """The CLI dispatches the same validated engine actions as the web API."""
        module = {"management": agency_management, "careers": careers, "market": market}[area]
        result = module.action(self.world, self.balance, operation, payload)
        self.report(result)
        if result.ok:
            self.world.revision += 1
            self.autosave()
        return result

    def screen_agency(self) -> None:
        while True:
            data = agency_management.state(self.world, self.balance)
            console.print(Panel(f"Support {len(data['staff'])}/{data['support_slots']} slots · "
                f"{format_money(data['support_weekly_cost'])}/week · {data['specialization']}\n"
                f"Season objective: {data['objective']['id']} {data['objective']['progress']}/{data['objective']['target']}", title="Agency"))
            for staff in data['staff']:
                console.print(f"Staff ID {staff['id']}: {staff['name']} ({staff['role']}) · "
                    f"{format_money(staff['wage'])}/week · capacity {staff['capacity']} · "
                    f"clients {staff['player_ids']} clubs {staff['club_ids']}")
            for candidate in data['candidates']:
                console.print(f"Candidate ID {candidate['id']}: {candidate['name']} ({candidate['role']}) · "
                    f"quality {candidate['quality']} · hire {format_money(candidate['hire_cost'])} · {format_money(candidate['wage'])}/week")
            for dept in data['departments']:
                console.print(f"{dept['id']} level {dept['level']}: upgrade {format_money(dept['upgrade_cost'])}, "
                    f"upkeep {format_money(dept['weekly_cost'])}/week")
            operation = Prompt.ask("Agency action", choices=["hire", "fire", "assign", "upgrade_department", "downgrade_department", "specialization", "objective", "identity", "downsize", "back"], default="back")
            if operation == "back":
                return
            payload = {}
            if operation == "hire":
                payload["candidate_id"] = IntPrompt.ask("Candidate ID")
            elif operation in ("fire", "assign"):
                sid = IntPrompt.ask("Staff ID")
                payload["staff_id"] = sid
                if operation == "assign":
                    staff = next((s for s in data['staff'] if s['id'] == sid), None)
                    if staff is None:
                        console.print("Unknown staff ID.")
                        continue
                    field = 'player_ids' if staff['role'] == 'client_manager' else 'club_ids'
                    entries = self.world.client_players() if field == 'player_ids' else self.world.clubs.values()
                    for entry in entries:
                        console.print(f"{entry.id}: {entry.name}")
                    raw = Prompt.ask("Comma-separated portfolio IDs (blank clears)", default="")
                    try:
                        payload[field] = [int(value.strip()) for value in raw.split(',') if value.strip()]
                    except ValueError:
                        console.print("Enter numeric IDs separated by commas.")
                        continue
                elif not Confirm.ask("Release this staff member and remove their support?", default=False):
                    continue
            elif operation in ("upgrade_department", "downgrade_department"):
                payload["department"] = Prompt.ask("Department", choices=[d['id'] for d in data['departments']])
            elif operation == "specialization":
                payload["specialization"] = Prompt.ask("Focus (unlocks after first deal; later changes at season start)", choices=data['specialization_options'])
            elif operation == "objective":
                payload["objective"] = Prompt.ask("Season objective", choices=["growth", "stability", "careers"])
            elif operation == "identity":
                payload["emblem"] = Prompt.ask("Emblem", choices=data['identity']['emblems'])
                payload["accent"] = Prompt.ask("Accent", choices=data['identity']['accents'])
            elif not Confirm.ask("Downsize one HQ tier? All staff, clients, scouts and departments must fit. No refund.", default=False):
                continue
            self.expansion_action("management", operation, payload)

    def screen_careers(self) -> None:
        while True:
            data = careers.state(self.world, self.balance)
            stories = []
            for client in data['clients']:
                console.print(f"{client['name']} · trust {client['trust']}")
                goal = client['goal']
                if goal:
                    console.print(f"Goal: {goal['title']} · {goal['progress']}/{goal['target']} · deadline week {goal['deadline_week']}")
                for promise in client['promises']:
                    console.print(f"Promised move: {promise['status']} · deadline week {promise['deadline_week']}")
                for story in client['stories']:
                    stories.append(story)
                    console.print(f"{len(stories)}. {story['title']}: {story['body']}")
            index = IntPrompt.ask("Conversation number (0 to return)", default=0)
            if index == 0:
                return
            if not 1 <= index <= len(stories):
                continue
            story = stories[index - 1]
            for option in story['options']:
                console.print(f"{option['id']}: {option['label']} — {option['consequence']}")
            option = Prompt.ask("Response", choices=[o['id'] for o in story['options']])
            self.expansion_action("careers", "respond", {"story_id": story['id'], "option_id": option})

    def screen_market(self) -> None:
        while True:
            data = market.state(self.world, self.balance)
            console.print(Panel("Window open" if data['window_open'] else "Window closed", title="Club network & loans"))
            for club in data['clubs']:
                console.print(f"Club ID {club['id']}: {club['name']} · tier {club['tier']} · relationship {club['relationship']:.0f}")
            for player in self.world.client_players():
                console.print(f"Client ID {player.id}: {player.name} · {self.world.club_name(player.club_id)}")
            for talk in data['talks']:
                console.print(f"Talk ID {talk['id']}: player {talk['player_id']} · {talk['status']} · "
                    f"round {talk['rounds']}/{data['loan_terms']['max_rounds']} · contribution {talk['contribution_pct']}% · fee {format_money(talk['fee'])}")
            for loan in data['loans']:
                if loan['active']:
                    console.print(f"Active loan {loan['id']}: player {loan['player_id']} until week {loan['ends_week']}")
            operation = Prompt.ask("Market action", choices=["pitch", "loan_open", "loan_propose", "loan_accept", "loan_cancel", "back"], default="back")
            if operation == "back":
                return
            payload = {}
            if operation in ("pitch", "loan_open"):
                payload.update(player_id=IntPrompt.ask("Client ID"), club_id=IntPrompt.ask("Destination club ID"))
                if operation == "loan_open":
                    payload['duration'] = Prompt.ask("Duration", choices=["half_season", "season"], default="half_season")
            else:
                payload['talk_id'] = IntPrompt.ask("Talk ID")
                if operation == "loan_propose":
                    payload['contribution_pct'] = _to_float(Prompt.ask("Host wage contribution percentage", default="50"))
                    payload['fee'] = _to_float(Prompt.ask("Loan fee", default="0"))
            self.expansion_action("market", operation, payload)

    # ---- other screens ---------------------------------------------------
    def screen_headquarters(self) -> None:
        console.clear()
        self.show_header()
        current = hq_level(self.balance, self.world.agency.hq_level)
        console.print(
            Panel(
                f"[bold]{current.name}[/bold] (level {current.level})\n"
                f"Scouts {len(self.world.scouts)}/{current.scout_cap}   "
                f"Clients {len(self.world.clients)}/{current.client_cap}\n"
                f"Scouting precision bonus +{current.precision_bonus * 100:.0f}%   "
                f"Running cost {format_money(current.weekly_cost)}/wk",
                border_style="cyan",
            )
        )
        levels = hq_levels(self.balance)
        nxt = next((l for l in levels if l.level == current.level + 1), None)
        if nxt is None:
            console.print("[green]You are at the top.[/green]")
        else:
            console.print(
                f"Next: [bold]{nxt.name}[/bold] — {nxt.scout_cap} scouts, {nxt.client_cap} clients, "
                f"+{nxt.precision_bonus * 100:.0f}% precision, {format_money(nxt.weekly_cost)}/wk.\n"
                f"Upgrade cost: [bold]{format_money(current.upgrade_cost)}[/bold]"
            )
            console.print(
                "[yellow]Bigger premises mean bigger weekly bills. "
                "Over-expanding before a window is how agencies die.[/yellow]"
            )
            if Confirm.ask("Upgrade now?", default=False):
                self.report(A.upgrade_hq(self.world, self.balance))
                self.autosave()
        Prompt.ask("Enter to go back", default="")

    def screen_finances(self) -> None:
        console.clear()
        self.show_header()
        from football_agent.engine.systems.finance import weekly_burn

        burn = weekly_burn(self.world, self.balance)
        weeks_left = int(self.world.agency.cash / -burn) if burn < 0 else None
        summary = (
            f"Cash {format_money(self.world.agency.cash)}   "
            f"Net {format_money(burn)}/wk\n"
            f"Lifetime commission {format_money(self.world.agency.total_commission)}   "
            f"Lifetime costs {format_money(self.world.agency.total_costs)}\n"
        )
        if weeks_left is not None:
            summary += f"[bold red]At this rate you run out in {weeks_left} weeks.[/bold red]\n"
        summary += f"Next window in {cal.weeks_until_next_window(self.balance, self.world.week)} weeks."
        console.print(Panel(summary, border_style="cyan"))
        console.print(render.finance_table(self.world, self.balance))
        Prompt.ask("Enter to go back", default="")

    def screen_clubs(self) -> None:
        console.clear()
        self.show_header()
        client_clubs = [p.club_id for p in self.world.client_players() if p.club_id]
        for league_id in sorted(self.world.leagues):
            console.print(render.league_table(self.world, league_id, client_clubs))
        Prompt.ask("Enter to go back", default="")


def _notable(events: List[Event]) -> List[Event]:
    """Trim the routine bookkeeping out of the weekly report."""
    noise = {"finance.retainer", "league.round", "scouting.narrowed"}
    return [e for e in events if e.kind not in noise]


def _to_int(raw: str) -> Optional[int]:
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return None


def _to_float(raw: str) -> Optional[float]:
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):
        return None


def _ask_money(label: str, suggestion: float) -> float:
    raw = Prompt.ask(f"{label} (their ceiling {format_money(suggestion)})", default=f"{suggestion:.0f}")
    value = _to_float(raw)
    return max(0.0, value if value is not None else suggestion)


def _run(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Football Agent — Python prototype")
    parser.add_argument("--seed", type=int, default=None, help="World seed (default: random)")
    parser.add_argument("--save", type=Path, default=DEFAULT_SAVE, help="Save file path")
    parser.add_argument("--new", action="store_true", help="Start a new game, ignoring any save")
    parser.add_argument("--name", default="Your Agency", help="Agency name")
    args = parser.parse_args(argv)

    balance = load_balance()
    if args.save.exists() and not args.new:
        try:
            world = persistence.load(args.save)
            console.print(f"[green]Loaded save from {args.save}[/green]")
        except persistence.SaveError as error:
            console.print(f"[red]{error}[/red] Starting a new game.")
            world = create_world(args.seed or random.randrange(1, 2**31), balance, args.name)
    else:
        seed = args.seed if args.seed is not None else random.randrange(1, 2**31)
        world = create_world(seed, balance, args.name)
        console.print(f"[green]New world, seed {seed}[/green]")

    Game(world, balance, args.save).run()
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    try:
        return _run(argv)
    except (EOFError, KeyboardInterrupt):
        console.print("\n[yellow]Interrupted. Your last autosave is intact.[/yellow]")
        return 0


if __name__ == "__main__":
    sys.exit(main())
