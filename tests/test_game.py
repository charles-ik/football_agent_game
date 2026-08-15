"""End-to-end tests: does a whole game hold together?"""

import random

import pytest

from football_agent.engine import actions as A
from football_agent.engine import calendar as cal
from football_agent.engine.balance import load_balance
from football_agent.engine.events import Severity
from football_agent.engine.models import Position
from football_agent.engine.rng import stream
from football_agent.engine.systems.negotiation import Status
from football_agent.engine.tick import tick
from football_agent.engine.world import create_world
from football_agent.harness.policies import build


@pytest.fixture
def balance():
    return load_balance()


def test_a_full_season_runs_without_error(balance):
    world = create_world(9001, balance)
    for _ in range(balance.i("calendar.weeks_per_season")):
        tick(world, balance)
    assert world.season == 2
    assert world.week == balance.i("calendar.weeks_per_season") + 1


def test_league_tables_fill_up_and_reset(balance):
    world = create_world(9002, balance)
    for _ in range(30):
        tick(world, balance)
    league = world.leagues[1]
    assert any(row.played > 0 for row in league.table.values())

    # Run to the first week of the next season, when the tables are wiped.
    per = balance.i("calendar.weeks_per_season")
    while world.week < per + 1:
        tick(world, balance)
    assert all(row.played == 0 for row in world.leagues[1].table.values())


def test_players_age_and_some_retire(balance):
    world = create_world(9003, balance)
    ages_before = {p.id: p.age for p in world.players.values()}
    for _ in range(balance.i("calendar.weeks_per_season") + 1):
        tick(world, balance)
    aged = [p for p in world.players.values() if p.age > ages_before[p.id]]
    assert aged
    assert any(p.retired for p in world.players.values())


def test_scouting_narrows_a_report_over_time(balance):
    world = create_world(9004, balance)
    scout = next(iter(world.scouts.values()))
    A.assign_scout(world, scout.id, "east")

    for _ in range(12):
        tick(world, balance)
    reports = [r for r in world.reports.values() if r.region_id == "east"]
    assert reports, "a scout in a region should turn up somebody"

    tracked = reports[0]
    spread_before = tracked.ability_spread
    for _ in range(20):
        tick(world, balance)
        if tracked.player_id not in world.reports:
            pytest.skip("a rival signed the tracked player — that's the clock working")
    assert world.reports[tracked.player_id].ability_spread < spread_before


def test_a_report_always_contains_the_truth(balance):
    world = create_world(9005, balance)
    scout = next(iter(world.scouts.values()))
    A.assign_scout(world, scout.id, "north")
    for _ in range(25):
        tick(world, balance)
    checked = 0
    for report in world.reports.values():
        player = world.players[report.player_id]
        assert report.ability_low <= player.ability <= report.ability_high
        checked += 1
    assert checked > 0


def test_deals_are_impossible_outside_a_window(balance):
    world = create_world(9006, balance)
    while cal.window_open(balance, world.week):
        tick(world, balance)
    ok, reason = A.can_deal(world, balance)
    assert not ok
    assert "window" in reason.lower()


def test_signing_a_player_uses_a_client_slot(balance):
    world = create_world(9007, balance)
    scout = next(iter(world.scouts.values()))
    A.assign_scout(world, scout.id, "east")
    for _ in range(20):
        tick(world, balance)

    target = None
    for report in world.reports.values():
        ok, _ = A.can_approach(world, balance, report.player_id)
        if ok:
            target = report.player_id
            break
    if target is None:
        pytest.skip("nobody approachable this seed")

    before = len(world.clients)
    result = A.complete_signing(world, balance, target, 0.08)
    assert result.ok
    assert len(world.clients) == before + 1
    assert result.events[0].severity is Severity.GOOD


def test_client_cap_is_enforced(balance):
    world = create_world(9008, balance)
    cap = A.client_cap(world, balance)
    candidates = [p.id for p in world.players.values() if p.rival_agency_id is None][: cap + 5]
    from football_agent.engine.models import ScoutingReport

    for player_id in candidates:
        world.reports.setdefault(
            player_id,
            ScoutingReport(player_id=player_id, ability_low=1, ability_high=99,
                           potential_low=1, potential_high=99),
        )
        A.complete_signing(world, balance, player_id, 0.08)
    assert len(world.clients) <= cap


def test_one_negotiation_per_approach(balance):
    world = create_world(9009, balance)
    for _ in range(4):
        tick(world, balance)
    interests = list(world.interests.values())
    if not interests:
        pytest.skip("no approach generated this seed")
    interest = interests[0]

    negotiation = A.open_deal_negotiation(world, balance, interest)
    negotiation.propose(1.0)
    ok, reason = A.can_negotiate_interest(world, balance, interest.id)
    assert not ok, "a spent approach must not be re-negotiable — otherwise walk-away risk is fake"


def test_selling_club_blocks_a_lowball(balance):
    world = create_world(9010, balance)
    for _ in range(4):
        tick(world, balance)
    interests = [i for i in world.interests.values() if not i.is_renewal]
    if not interests:
        pytest.skip("no transfer approach this seed")
    interest = interests[0]
    player = world.players[interest.player_id]
    if player.is_free_agent:
        pytest.skip("free agent — no fee to reject")

    events = A.complete_deal(world, balance, interest, wage=interest.max_wage, fee=1.0, years=4)
    assert events[0].kind == "transfer.failed"


def test_bot_policies_play_a_whole_run(balance):
    for name in ("cautious", "balanced", "greedy", "reckless", "passive"):
        world = create_world(9100, balance, agency_name=name)
        policy = build(name)
        for _ in range(120):
            if world.game_over:
                break
            r = stream(world.seed, world.week, "policy", name)
            policy.play_week(world, balance, r)
            tick(world, balance)
        assert world.week > 1


def test_a_competent_bot_grows_the_agency(balance):
    """The arc has to actually work: a sensible agent should end up bigger."""
    grew = 0
    for seed in range(1000, 1006):
        world = create_world(seed, balance, agency_name="cautious")
        policy = build("cautious")
        for _ in range(52 * 6):
            if world.game_over:
                break
            r = stream(world.seed, world.week, "policy", "cautious")
            policy.play_week(world, balance, r)
            tick(world, balance)
        if len(world.clients) > 1 and world.agency.reputation > 20:
            grew += 1
    assert grew >= 4, "a careful agent should usually build something over six seasons"


def test_greed_does_not_dominate(balance):
    """The central tension: taking the biggest cut must cost you.

    Measured on the two things greed actually damages — how your clients feel
    about you, and how long you last. (Raw client-loss counts are a bad measure:
    the greedy agent goes bust before his clients get round to walking out.)

    If this ever fails, the trust system has stopped biting and greed is simply
    the correct strategy, which would hollow the game out.
    """
    import statistics

    outcomes = {}
    for name in ("cautious", "greedy"):
        trusts, reputations, weeks = [], [], []
        for seed in range(2000, 2010):
            world = create_world(seed, balance, agency_name=name)
            policy = build(name)
            for _ in range(52 * 6):
                if world.game_over:
                    break
                r = stream(world.seed, world.week, "policy", name)
                policy.play_week(world, balance, r)
                tick(world, balance)
            trusts.extend(c.trust for c in world.clients.values())
            reputations.append(world.agency.reputation)
            weeks.append(world.week)
        outcomes[name] = (
            statistics.median(trusts) if trusts else 0.0,
            statistics.median(reputations),
            statistics.mean(weeks),
        )

    greedy_trust, greedy_rep, greedy_weeks = outcomes["greedy"]
    careful_trust, careful_rep, careful_weeks = outcomes["cautious"]

    assert greedy_trust < careful_trust, "greed must leave clients less happy"
    assert greedy_rep < careful_rep, "greed must cost you standing"
    assert greedy_weeks < careful_weeks, "greed must shorten the run"
