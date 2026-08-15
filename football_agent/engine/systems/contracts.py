"""Contracts — both kinds.

* **Player–club contracts** run down, which is what creates free agency and the
  "sell now or lose him for nothing" squeeze that clubs feel.
* **Agent–client contracts** expire too, and trust is what gates whether he will
  re-sign with you. That is what stops the two timers measuring the same thing:
  the club deal is a market fact, the agent deal is a relationship test.
"""

from __future__ import annotations

import random
from typing import List

from .. import reputation
from ..balance import Balance
from ..events import (
    AGENT_CONTRACT_EXPIRING,
    BECAME_FREE_AGENT,
    CLIENT_LEFT,
    CLUB_CONTRACT_EXPIRING,
    TRANSFER_LISTED,
    Event,
    Severity,
    ev,
)
from ..models import PlayingTime, World
from .development import playing_time

AGENT_CONTRACT_NOTICE_WEEKS = 12
MIN_TRUST_TO_RENEW = 30.0


def run(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    events.extend(_club_contracts(world, r, balance))
    events.extend(_agent_contracts(world, r, balance))
    events.extend(_transfer_listing(world, r, balance))
    return events


def _club_contracts(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    week = world.week
    warn_at = balance.i("transfers.contract_expiry_warning_weeks")

    for player in world.players.values():
        if player.retired or player.contract is None:
            continue
        remaining = player.contract.expires_week - week
        is_client = player.id in world.clients

        if remaining <= 0:
            club = world.clubs.get(player.club_id) if player.club_id else None
            if club:
                club.wage_committed = max(0.0, club.wage_committed - player.contract.wage)
            player.club_id = None
            player.contract = None
            player.weeks_at_club = 0
            player.transfer_listed = False
            if is_client:
                events.append(
                    ev(
                        BECAME_FREE_AGENT,
                        f"{player.name}'s contract has expired — he is a free agent. "
                        "A move now costs nobody a fee.",
                        week,
                        Severity.ACTION,
                        player_id=player.id,
                    )
                )
        elif is_client and remaining == warn_at:
            events.append(
                ev(
                    CLUB_CONTRACT_EXPIRING,
                    f"{player.name} has {remaining} weeks left at "
                    f"{world.club_name(player.club_id)}. Renew or engineer a move.",
                    week,
                    Severity.ACTION,
                    player_id=player.id,
                    weeks_left=remaining,
                )
            )
    return events


def _agent_contracts(world: World, r: random.Random, balance: Balance) -> List[Event]:
    events: List[Event] = []
    week = world.week

    for player_id, record in list(world.clients.items()):
        player = world.players.get(player_id)
        if player is None or player.retired:
            continue
        remaining = record.agent_contract.expires_week - week

        if remaining <= 0:
            world.clients.pop(player_id, None)
            penalty = balance.f("reputation.client_loss_penalty")
            reputation.lose(world, balance, penalty)
            events.append(
                ev(
                    CLIENT_LEFT,
                    f"{player.name}'s representation agreement lapsed. He has moved on.",
                    week,
                    Severity.CRITICAL,
                    player_id=player_id,
                    reason="agent_contract_expired",
                )
            )
        elif remaining == AGENT_CONTRACT_NOTICE_WEEKS or (remaining <= 4 and remaining % 2 == 0):
            willing = record.trust >= MIN_TRUST_TO_RENEW
            events.append(
                ev(
                    AGENT_CONTRACT_EXPIRING,
                    f"Your agreement with {player.name} expires in {remaining} weeks. "
                    + ("He'll talk." if willing else "He won't even take the meeting."),
                    week,
                    Severity.ACTION if willing else Severity.WARNING,
                    player_id=player_id,
                    weeks_left=remaining,
                    willing=willing,
                )
            )
    return events


def _transfer_listing(world: World, r: random.Random, balance: Balance) -> List[Event]:
    """Clubs move on players they don't use.

    A listed client flips the negotiation: now *you* are the one under pressure,
    because his club wants him gone.
    """
    events: List[Event] = []
    chance = balance.f("transfers.transfer_list_chance_fringe")

    for player in world.players.values():
        if player.retired or player.club_id is None or player.transfer_listed:
            continue
        club = world.clubs.get(player.club_id)
        pt = playing_time(balance, player, club)
        if pt not in (PlayingTime.FRINGE, PlayingTime.RESERVE):
            continue
        if player.is_injured or player.weeks_at_club < 12:
            continue
        if r.random() < chance:
            player.transfer_listed = True
            if player.id in world.clients:
                events.append(
                    ev(
                        TRANSFER_LISTED,
                        f"{world.club_name(player.club_id)} have transfer-listed "
                        f"{player.name}. He needs a move.",
                        world.week,
                        Severity.ACTION,
                        player_id=player.id,
                    )
                )
    return events
