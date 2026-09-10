"""Scripted agent policies for the tuning harness.

These are not AI opponents — they are *instruments*. Running cautious, greedy and
reckless agents over many seeded seasons turns "is the commission curve right?"
into a question with an answer.

The one that matters most is :class:`GreedyPolicy`. If greed wins every time, the
trust system isn't biting hard enough and the central tension of the game is
decoration.

Every policy drives the game exclusively through ``engine.actions``, so a bot
season exercises exactly the rules a played season does.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from football_agent.engine import actions as A
from football_agent.engine import calendar as cal
from football_agent.engine.balance import Balance
from football_agent.engine.economy import market_value
from football_agent.engine.models import World
from football_agent.engine.systems.finance import weekly_burn
from football_agent.engine.events import Event
from football_agent.engine.systems.negotiation import Status, pct_from_x, x_from_pct
from football_agent.engine.world import hq_level


@dataclass
class PolicyStats:
    deals_closed: int = 0
    deals_failed: int = 0
    walkaways: int = 0
    signings: int = 0
    signings_failed: int = 0
    renewals: int = 0
    upgrades: int = 0
    scouts_hired: int = 0


@dataclass
class Policy:
    """Base behaviour. Subclasses change the dials, not the shape."""

    name: str = "base"

    # Where to aim inside the *guide band* the engine publishes for your
    # reputation. 0.0 = the safe low end, 1.0 = the top of the band, >1.0 = above
    # what an agent of your standing can normally command. Higher = more
    # walk-aways, which is exactly the trade the mechanic is meant to pose.
    commission_ask: float = 0.55
    commission_push_again: bool = False   # keep haggling after a counter?
    deal_ask: float = 0.60
    deal_push_again: bool = False

    # Money discipline.
    cash_buffer_weeks: float = 20.0       # weeks of burn to keep in reserve
    expand_eagerly: bool = False
    ignore_trust: bool = False            # take the money regardless of the client

    stats: PolicyStats = field(default_factory=PolicyStats)
    events: List[Event] = field(default_factory=list)

    # ---- main entry point ---------------------------------------------
    def play_week(self, world: World, balance: Balance, r: random.Random) -> List[Event]:
        """Take this week's decisions. Returns the events they produced.

        The harness needs these: commission and transfers happen inside actions,
        not inside the tick, so a runner that only reads tick output sees nothing.
        """
        self.events = []
        self._manage_scouts(world, balance, r)
        self._expand(world, balance)
        self._sign_targets(world, balance, r)
        self._renew_agent_contracts(world, balance, r)
        if cal.window_open(balance, world.week):
            self._do_deals(world, balance, r)
        return self.events

    def _do(self, result) -> bool:
        self.events.extend(result.events)
        return result.ok

    # ---- what an agent of this standing can ask -------------------------
    def _commission_ask_pct(self, balance: Balance, reputation: float, trait: str) -> float:
        low, high = A.commission_guide(balance, reputation, trait)
        return low + self.commission_ask * (high - low)

    def _deal_ask_x(self, balance: Balance, reputation: float) -> float:
        low, high = A.deal_guide(balance, reputation)
        return low + self.deal_ask * (high - low)

    # ---- money discipline ----------------------------------------------
    def _reserve(self, world: World, balance: Balance) -> float:
        burn = weekly_burn(world, balance)
        return max(0.0, -burn) * self.cash_buffer_weeks

    def _can_afford(self, world: World, balance: Balance, cost: float) -> bool:
        return world.agency.cash - cost >= self._reserve(world, balance)

    # ---- scouting --------------------------------------------------------
    def _manage_scouts(self, world: World, balance: Balance, r: random.Random) -> None:
        from football_agent.engine.systems.scouting import expected_ability

        target = self._pick_region(world, balance)
        for scout in world.scouts.values():
            if not scout.assigned:
                if target is not None:
                    self._do(A.assign_scout(world, scout.id, target.id))
                continue
            # As reputation grows, better regions come into range. Move up.
            current = world.regions.get(scout.region_id)
            if (
                target is not None
                and current is not None
                and expected_ability(balance, target) > expected_ability(balance, current) + 4
            ):
                self._do(A.assign_scout(world, scout.id, target.id))

    def _pick_region(self, world: World, balance: Balance):
        """Best region whose talent your reputation can actually sign.

        Sending a nobody to scout the Capital burns money watching players who
        won't take his call. Reputation, not star rating, decides where to look.
        """
        from football_agent.engine.systems.scouting import expected_ability

        regions = sorted(world.regions.values(), key=lambda x: -x.star_rating)
        pivot = balance.f("signing.approach_ability_pivot")
        factor = balance.f("signing.approach_rep_factor")
        reach = world.agency.reputation / factor + pivot + 8.0  # a little ambition

        affordable = [
            region
            for region in regions
            if self._can_afford(world, balance, region.scouting_cost * 12)
        ] or regions[-1:]

        in_reach = [r for r in affordable if expected_ability(balance, r) <= reach]
        if in_reach:
            return in_reach[0]
        # Nothing in reach — take the cheapest, where the weakest players are.
        return min(affordable, key=lambda r: expected_ability(balance, r))

    def _expand(self, world: World, balance: Balance) -> None:
        level = hq_level(balance, world.agency.hq_level)

        if len(world.scouts) < level.scout_cap:
            candidates = A.scout_candidates(world, balance)
            best = max(candidates, key=lambda c: c.quality)
            fee = best.wage * balance.f("finance.scout_hire_cost_multiplier")
            # With no scouts you discover nobody, so you can never recover. Always
            # replace the last scout if the cash is physically there.
            desperate = not world.scouts and world.agency.cash > fee * 3
            if desperate or self.expand_eagerly or self._can_afford(
                world, balance, fee + best.wage * 26
            ):
                if self._do(A.hire_scout(world, best, balance)):
                    self.stats.scouts_hired += 1

        crowded = len(world.clients) >= level.client_cap - 1
        if self.expand_eagerly or crowded:
            if self.expand_eagerly or self._can_afford(world, balance, level.upgrade_cost):
                if self._do(A.upgrade_hq(world, balance)):
                    self.stats.upgrades += 1

    # ---- signing ---------------------------------------------------------
    def _sign_targets(self, world: World, balance: Balance, r: random.Random) -> None:
        if len(world.clients) >= A.client_cap(world, balance):
            return
        candidates = []
        for report in world.reports.values():
            if report.player_id in world.clients:
                continue
            ok, _ = A.can_approach(world, balance, report.player_id)
            if not ok:
                continue
            candidates.append(report)
        if not candidates:
            return

        candidates.sort(key=lambda rep: -(rep.potential_mid + rep.ability_mid))
        for report in candidates[:2]:
            negotiation, reason = A.open_signing_negotiation(world, balance, report.player_id, r)
            if negotiation is None:
                continue
            player = world.players[report.player_id]
            pct = self._haggle_pct(negotiation, balance, player.trait.value, world)
            if pct is None:
                self.stats.signings_failed += 1
                self._do(A.close_negotiation(world, balance, negotiation))
                continue
            if self._do(A.complete_signing(world, balance, report.player_id, pct)):
                self.stats.signings += 1
            else:
                self.stats.signings_failed += 1
            if len(world.clients) >= A.client_cap(world, balance):
                return

    def _renew_agent_contracts(self, world: World, balance: Balance, r: random.Random) -> None:
        for player_id, record in list(world.clients.items()):
            if record.agent_contract.expires_week - world.week > 20:
                continue
            negotiation, reason = A.open_renewal_negotiation(world, balance, player_id, r)
            if negotiation is None:
                continue
            trait = world.players[player_id].trait.value
            pct = self._haggle_pct(negotiation, balance, trait, world)
            if pct is None:
                self._do(A.close_negotiation(world, balance, negotiation))
                continue
            if self._do(A.complete_renewal(world, balance, player_id, pct)):
                self.stats.renewals += 1

    def _haggle_pct(self, negotiation, balance: Balance, trait: str, world) -> Optional[float]:
        ask = self._commission_ask_pct(balance, world.agency.reputation, trait)
        response = negotiation.propose(x_from_pct(balance, ask))

        while True:
            if response.status is Status.ACCEPTED:
                return pct_from_x(balance, response.agreed_x)
            if response.status is Status.WALKED:
                self.stats.walkaways += 1
                return None
            if response.counter_x is None:
                return None
            if self.commission_push_again and negotiation.is_open:
                response = negotiation.propose(x_from_pct(balance, ask * 1.12))
                continue
            return pct_from_x(balance, negotiation.accept_counter().agreed_x)

    # ---- deals -----------------------------------------------------------
    def _do_deals(self, world: World, balance: Balance, r: random.Random) -> None:
        for player_id in list(world.clients):
            player = world.players.get(player_id)
            if player is None or player.retired or player.is_injured:
                continue
            interests = [
                i
                for i in world.interests_for(player_id)
                if A.can_negotiate_interest(world, balance, i.id)[0]
            ]
            if not interests:
                continue

            interest = max(interests, key=lambda i: i.max_wage)
            club = world.clubs[interest.club_id]

            min_x = self._minimum_x(world, balance, interest, player)
            if min_x is None:
                continue

            target_x = max(self._deal_ask_x(balance, world.agency.reputation), min_x)
            wage, _ = A.package_from_x(balance, interest, target_x)
            if not self.ignore_trust:
                delta, _ = A.assess_move(world, balance, player, club, wage)
                if delta < -6.0 and not interest.is_renewal:
                    continue  # this move would damage him; leave it

            self._negotiate_deal(world, balance, interest, min_x, target_x, r)

    def _minimum_x(self, world, balance, interest, player) -> Optional[float]:
        """Lowest package that clears the selling club's asking price."""
        if interest.is_renewal or player.is_free_agent:
            return 0.0
        asking = A.asking_price(world, balance, player)
        ceiling = interest.max_fee * balance.f("transfers.wage_offer_ceiling_factor")
        if ceiling <= 0:
            return None
        needed = asking / ceiling
        return needed if needed <= 1.0 else None

    def _negotiate_deal(self, world, balance, interest, min_x, target_x, r) -> None:
        negotiation = A.open_deal_negotiation(world, balance, interest, r)
        ask = target_x
        response = negotiation.propose(ask)

        agreed = None
        while True:
            if response.status is Status.ACCEPTED:
                agreed = response.agreed_x
                break
            if response.status is Status.WALKED:
                self.stats.walkaways += 1
                break
            if response.counter_x is None:
                break
            if self.deal_push_again and negotiation.is_open:
                response = negotiation.propose(min(1.0, ask * 1.08))
                continue
            if response.counter_x < min_x:
                break  # their best still doesn't clear the asking price
            agreed = negotiation.accept_counter().agreed_x
            break

        if agreed is None:
            self.stats.deals_failed += 1
            self._do(A.close_negotiation(world, balance, negotiation))
            return

        wage, fee = A.package_from_x(balance, interest, agreed)
        player = world.players[interest.player_id]
        if interest.is_renewal or player.is_free_agent:
            fee = 0.0
        if self._do(A.accept_deal(world, balance, interest.id, wage, fee, 4)):
            self.stats.deals_closed += 1
        else:
            self.stats.deals_failed += 1


class CautiousPolicy(Policy):
    """Never overspends. Asks modestly, takes the first reasonable counter."""

    def __init__(self):
        super().__init__(
            name="cautious",
            commission_ask=0.25,
            commission_push_again=False,
            deal_ask=0.30,
            deal_push_again=False,
            cash_buffer_weeks=35.0,
            expand_eagerly=False,
            ignore_trust=False,
        )


class GreedyPolicy(Policy):
    """Pushes past what its standing justifies, and never asks how the client feels.

    Deliberately kept *viable* rather than absurd: it lands deals, it just lands
    the wrong ones for the client. That makes it a fair test of whether trust
    bites. If greed still tops the table on commission, the penalties are too soft.
    """

    def __init__(self):
        super().__init__(
            name="greedy",
            commission_ask=1.05,
            commission_push_again=True,
            deal_ask=1.10,
            deal_push_again=True,
            cash_buffer_weeks=8.0,
            expand_eagerly=False,
            ignore_trust=True,
        )


class RecklessPolicy(Policy):
    """Over-expands. Buys premises and scouts it cannot service."""

    def __init__(self):
        super().__init__(
            name="reckless",
            commission_ask=0.95,
            commission_push_again=True,
            deal_ask=1.05,
            deal_push_again=False,
            cash_buffer_weeks=0.0,
            expand_eagerly=True,
            ignore_trust=True,
        )


class BalancedPolicy(Policy):
    """The reference line: measured asks, respects the client, expands on need."""

    def __init__(self):
        super().__init__(
            name="balanced",
            commission_ask=0.60,
            commission_push_again=False,
            deal_ask=0.65,
            deal_push_again=False,
            cash_buffer_weeks=22.0,
            expand_eagerly=False,
            ignore_trust=False,
        )


class PassivePolicy(Policy):
    """Does nothing but keep a scout employed — the do-nothing control."""

    def __init__(self):
        super().__init__(name="passive")

    def play_week(self, world: World, balance: Balance, r: random.Random) -> List[Event]:
        self.events = []
        self._manage_scouts(world, balance, r)
        return self.events


class ExpansionPolicy(BalancedPolicy):
    """Measured expansion with one management pass per week, using public actions."""

    focus = "growth"

    def __init__(self):
        super().__init__()
        self.name = "expansion_" + self.focus
        self.last_expansion_week = -1

    def play_week(self, world, balance, r):
        from football_agent.engine import agency_management as management, careers, market
        produced = list(super().play_week(world, balance, r))
        self.events = produced
        if self.last_expansion_week == world.week:
            return produced
        self.last_expansion_week = world.week
        d = world.agency_development
        objective = "growth" if self.focus == "growth" else "careers"
        if cal.season_week(balance, world.week) == 1 and d.objective != objective:
            self._do(management.action(world, balance, "objective", {"objective": objective}))
        specialty = {"growth": "youth", "clients": "careers", "deals": "deals"}[self.focus]
        snapshot = management.state(world, balance)
        if snapshot["can_specialize"] and d.specialization != specialty:
            self._do(management.action(world, balance, "specialization", {"specialization": specialty}))
        role = "club_liaison" if self.focus == "deals" else "client_manager"
        if not any(s.role == role for s in d.staff) and len(d.staff) < world.agency.hq_level:
            pool = [c for c in d.candidates if c.role == role]
            if pool:
                candidate = max(pool, key=lambda c: c.quality)
                if self._can_afford(world, balance, candidate.hire_cost + candidate.wage * self.cash_buffer_weeks):
                    self._do(management.action(world, balance, "hire", {"candidate_id": candidate.id}))
        for staff in d.staff:
            if staff.role == "client_manager":
                ids = [pid for pid, record in sorted(world.clients.items(), key=lambda item: item[1].trust)][:staff.capacity]
                if staff.player_ids != ids:
                    self._do(management.action(world, balance, "assign", {"staff_id": staff.id, "player_ids": ids}))
            else:
                clubs = sorted(world.clubs.values(), key=lambda club: -sum(club.needs.get(p.position.value, 0) for p in world.client_players()))
                ids = [club.id for club in clubs[:staff.capacity]]
                if staff.club_ids != ids:
                    self._do(management.action(world, balance, "assign", {"staff_id": staff.id, "club_ids": ids}))
        department = {"growth": "scouting", "clients": "client_services", "deals": "networking"}[self.focus]
        row = next(row for row in management.state(world, balance)["departments"] if row["id"] == department)
        if row["can_upgrade"] and self._can_afford(world, balance, row["upgrade_cost"] + (row["next_weekly_cost"] - row["weekly_cost"]) * self.cash_buffer_weeks):
            self._do(management.action(world, balance, "upgrade_department", {"department": department}))
        if self.focus == "clients":
            for story in list(world.career_state.stories.values()):
                if story['status'] == 'active' and story['player_id'] in world.clients:
                    self._do(careers.action(world, balance, "respond", {"story_id": story['id'], "option_id": "practical"}))
        if cal.window_open(balance, world.week) and self.focus in ("clients", "deals"):
            for player in world.client_players():
                if market.move_busy(world, player.id):
                    continue
                clubs = sorted((c for c in world.clubs.values() if c.id != player.club_id), key=lambda c: -c.needs.get(player.position.value, 0))
                if not clubs:
                    continue
                if self.focus == "deals":
                    self._do(market.action(world, balance, "pitch", {"player_id": player.id, "club_id": clubs[0].id}))
                elif player.contract and player.seeking_move:
                    opened = market.action(world, balance, "loan_open", {"player_id": player.id, "club_id": clubs[0].id, "duration": "half_season"})
                    if self._do(opened):
                        talk_id = opened.payload['id']
                        fee = player.contract.wage * market.cfg(balance, "loan_fee_wage_weeks") * .5
                        proposed = market.action(world, balance, "loan_propose", {"talk_id": talk_id, "contribution_pct": 50, "fee": fee})
                        if self._do(proposed) and world.market_state.talks[talk_id].status == "agreed":
                            self._do(market.action(world, balance, "loan_accept", {"talk_id": talk_id}))
                        else:
                            self._do(market.action(world, balance, "loan_cancel", {"talk_id": talk_id}))
                break  # at most one proactive market action per week
        return self.events


class GrowthExpansionPolicy(ExpansionPolicy):
    focus = "growth"


class ClientExpansionPolicy(ExpansionPolicy):
    focus = "clients"


class DealExpansionPolicy(ExpansionPolicy):
    focus = "deals"


ALL_POLICIES: Dict[str, type] = {
    "cautious": CautiousPolicy,
    "balanced": BalancedPolicy,
    "greedy": GreedyPolicy,
    "reckless": RecklessPolicy,
    "passive": PassivePolicy,
    "expansion_growth": GrowthExpansionPolicy,
    "expansion_clients": ClientExpansionPolicy,
    "expansion_deals": DealExpansionPolicy,
}


def build(name: str) -> Policy:
    if name not in ALL_POLICIES:
        raise KeyError(f"Unknown policy '{name}'. Options: {', '.join(ALL_POLICIES)}")
    return ALL_POLICIES[name]()
