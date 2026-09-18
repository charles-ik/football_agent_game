"""World generation.

Everything is generated from a seed and from editable JSON, so a world can be
recreated exactly. That reproducibility is what makes the tuning harness worth
anything: re-run the same seed after a rules change and the difference you see
is the change.
"""

from __future__ import annotations

import random
from typing import Dict, List, Optional

from . import rng as rngmod
from .balance import Balance, load_balance, load_data
from .economy import market_wage, scout_wage
from .models import (
    Agency,
    AgentContract,
    ClientRecord,
    Club,
    ClientRecord as _ClientRecord,  # noqa: F401 (kept for clarity of imports)
    Contract,
    HQLevel,
    League,
    LeagueRecord,
    Player,
    Position,
    Region,
    RivalAgency,
    Scout,
    Trait,
    World,
)

POSITIONS = [Position.GK, Position.DF, Position.MF, Position.FW]
POSITION_WEIGHTS = [0.10, 0.34, 0.34, 0.22]
TRAITS = [Trait.AMBITIOUS, Trait.MERCENARY, Trait.LOYAL, Trait.PROFESSIONAL]
TRAIT_WEIGHTS = [0.30, 0.25, 0.20, 0.25]


def hq_levels(balance: Balance) -> List[HQLevel]:
    return [HQLevel(**row) for row in balance.l("hq_levels")]


def hq_level(balance: Balance, level: int) -> HQLevel:
    levels = hq_levels(balance)
    for item in levels:
        if item.level == level:
            return item
    return levels[-1]


def _person_name(r: random.Random, names: dict, region_id: str) -> str:
    first = r.choice(names["first_names"])
    pool = list(names["surnames_common"])
    pool += names["surnames_by_region"].get(region_id, []) * 2
    return f"{first} {r.choice(pool)}"


def _generate_player(
    r: random.Random,
    balance: Balance,
    names: dict,
    player_id: int,
    region: Region,
    week: int,
) -> Player:
    mode = balance.f("scouting.region_ability_mode_base") + region.star_rating * balance.f(
        "scouting.region_ability_star_factor"
    )
    ability = rngmod.triangular_int(r, 28, 94, mode)
    age = rngmod.triangular_int(r, 16, 34, 24)

    lo, hi = balance.l("scouting.region_potential_bonus")
    youth_room = max(0.0, (26 - age) / 10.0)
    bonus = r.uniform(float(lo), float(hi)) * (0.35 + youth_room)
    potential = min(99.0, ability + bonus if age < 30 else ability + r.uniform(0, 2))

    return Player(
        id=player_id,
        name=_person_name(r, names, region.id),
        age=age,
        position=rngmod.weighted_choice(r, POSITIONS, POSITION_WEIGHTS),
        ability=float(ability),
        potential=float(round(potential, 1)),
        trait=rngmod.weighted_choice(r, TRAITS, TRAIT_WEIGHTS),
        region_id=region.id,
        weeks_at_club=r.randint(0, 120),
    )


def _assign_club(r: random.Random, player: Player, clubs: List[Club]) -> Optional[Club]:
    """Place a player at a club whose strength plausibly matches his ability.

    No squads exist, so this is only about giving each player a believable
    employer, wage and contract — which is all the agent ever sees.
    """
    if player.ability < 38 and r.random() < 0.35:
        return None  # non-league / unattached
    weights = []
    for club in clubs:
        gap = abs(club.strength - player.ability)
        weights.append(max(0.001, 1.0 / (1.0 + gap * gap * 0.05)))
    return rngmod.weighted_choice(r, clubs, weights)


def _refresh_needs(r: random.Random, club: Club) -> None:
    club.needs = {}
    for position in POSITIONS:
        if r.random() < 0.42:
            club.needs[position.value] = round(r.uniform(0.25, 1.0), 2)
    if not club.needs:
        club.needs[r.choice(POSITIONS).value] = round(r.uniform(0.3, 0.7), 2)


def refresh_all_needs(world: World, r: random.Random) -> None:
    for club in world.clubs.values():
        _refresh_needs(r, club)


def create_world(seed: int, balance: Balance | None = None, agency_name: str = "Your Agency") -> World:
    balance = balance or load_balance()
    club_data = load_data("clubs.json")
    region_data = load_data("regions.json")
    names = load_data("names.json")

    world = World(seed=seed, week=1, season=1, agency=Agency(
        name=agency_name,
        cash=balance.f("start.cash"),
        reputation=balance.f("start.reputation"),
        hq_level=balance.i("start.hq_level"),
    ))

    r = rngmod.stream(seed, 0, "worldgen")

    # Regions -----------------------------------------------------------
    for row in region_data["regions"]:
        world.regions[row["id"]] = Region(**row)

    # Leagues and clubs --------------------------------------------------
    for row in club_data["leagues"]:
        world.leagues[row["id"]] = League(id=row["id"], name=row["name"], tier=row["tier"])

    for row in club_data["clubs"]:
        club_id = world.allocate_id()
        strength = float(row["strength"])
        tier = int(row["tier"])
        wage_budget = market_wage(balance, strength, tier) * 18.0
        club = Club(
            id=club_id,
            name=row["name"],
            tier=tier,
            strength=strength,
            prestige=float(row["prestige"]),
            wage_budget=round(wage_budget, -2),
            wage_committed=round(wage_budget * r.uniform(0.62, 0.94), -2),
            transfer_budget=round(wage_budget * r.uniform(8, 26), -3),
            region_id=row["region_id"],
        )
        _refresh_needs(r, club)
        world.clubs[club_id] = club
        league = next(l for l in world.leagues.values() if l.tier == tier)
        league.club_ids.append(club_id)
        league.table[club_id] = LeagueRecord(club_id=club_id)

    all_clubs = list(world.clubs.values())

    # Rival agencies -----------------------------------------------------
    rival_names = list(club_data["rival_agencies"])
    r.shuffle(rival_names)
    for name in rival_names[: balance.i("rivals.count")]:
        rival_id = world.allocate_id()
        world.rivals[rival_id] = RivalAgency(
            id=rival_id, name=name, reputation=round(r.uniform(25, 88), 1)
        )
    rival_ids = list(world.rivals.keys())

    # Players ------------------------------------------------------------
    for region in world.regions.values():
        for _ in range(region.pool_size):
            player_id = world.allocate_id()
            player = _generate_player(r, balance, names, player_id, region, world.week)
            club = _assign_club(r, player, all_clubs)
            if club is not None:
                player.club_id = club.id
                wage = market_wage(balance, player.ability, club.tier) * r.uniform(0.82, 1.2)
                player.contract = Contract(
                    wage=round(wage, -1),
                    expires_week=world.week + r.randint(10, 200),
                    years_signed=r.randint(2, 5),
                )
            # Most decent players already have representation. This is what
            # makes an unrepresented talent worth finding.
            if rival_ids and player.ability > 45 and r.random() < 0.45:
                player.rival_agency_id = r.choice(rival_ids)
            world.players[player_id] = player

    # Starting scout ------------------------------------------------------
    q_lo, q_hi = balance.l("start.starting_scout_quality")
    for _ in range(balance.i("start.starting_scouts")):
        scout_id = world.allocate_id()
        quality = round(r.uniform(float(q_lo), float(q_hi)), 1)
        world.scouts[scout_id] = Scout(
            id=scout_id,
            name=_person_name(r, names, r.choice(list(world.regions))),
            quality=quality,
            wage=scout_wage(balance, quality),
        )

    _give_starting_client(world, balance, r)
    from . import agency_management, careers, market, investments
    agency_management.initialize(world, balance)
    careers.initialize(world, balance)
    market.initialize(world, balance)
    investments.initialize(world, balance)
    return world


def _give_starting_client(world: World, balance: Balance, r: random.Random) -> None:
    """One unremarkable second-tier client, so you start as a nobody with something to lose."""
    lo, hi = balance.l("start.starting_client_ability")
    tier = balance.i("start.starting_client_tier")
    candidates = [
        p
        for p in world.players.values()
        if p.club_id is not None
        and world.clubs[p.club_id].tier == tier
        and float(lo) <= p.ability <= float(hi)
        and p.age <= 27
    ]
    if not candidates:
        candidates = [p for p in world.players.values() if p.club_id is not None]
    player = r.choice(candidates)
    player.rival_agency_id = None
    world.clients[player.id] = ClientRecord(
        player_id=player.id,
        agent_contract=AgentContract(
            commission_pct=balance.f("start.starting_client_commission"),
            expires_week=world.week + balance.i("start.agent_contract_years") * 52,
            signed_week=world.week,
        ),
        trust=balance.f("trust.start"),
        signed_week=world.week,
    )
    # You know your own client well.
    from .models import ScoutingReport

    world.reports[player.id] = ScoutingReport(
        player_id=player.id,
        ability_low=player.ability - 1,
        ability_high=player.ability + 1,
        potential_low=max(player.ability, player.potential - 5),
        potential_high=min(99.0, player.potential + 5),
        weeks_watched=40,
        first_seen_week=world.week,
        region_id=player.region_id,
    )
