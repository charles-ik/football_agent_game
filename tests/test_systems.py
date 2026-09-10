import random

import pytest

from football_agent.engine import calendar as cal
from football_agent.engine import reputation
from football_agent.engine.balance import load_balance
from football_agent.engine.economy import commission_for, market_value, market_wage
from football_agent.engine.models import Club, Contract, PlayingTime, Trait
from football_agent.engine.systems import finance, trust
from football_agent.engine.systems.development import playing_time
from football_agent.engine.tick import tick
from football_agent.engine.world import create_world


@pytest.fixture
def balance():
    return load_balance()


@pytest.fixture
def world(balance):
    return create_world(4242, balance)


# ---------------------------------------------------------------------------
# Economy
# ---------------------------------------------------------------------------


def test_wages_rise_steeply_with_ability(balance):
    low = market_wage(balance, 45, 2)
    mid = market_wage(balance, 65, 1)
    high = market_wage(balance, 85, 1)
    assert low < mid < high
    assert high > mid * 3


def test_running_down_a_contract_destroys_the_fee(world, balance):
    player = next(p for p in world.players.values() if p.contract)
    player.ability = 70
    player.age = 25

    player.contract = Contract(wage=10000, expires_week=world.week + 200, years_signed=4)
    long_deal = market_value(balance, player, world.week)
    player.contract = Contract(wage=10000, expires_week=world.week + 8, years_signed=4)
    short_deal = market_value(balance, player, world.week)

    assert short_deal < long_deal * 0.5


def test_commission_scales_with_the_deal(balance):
    small = commission_for(balance, 0.10, 200_000, 5_000, 4)
    large = commission_for(balance, 0.10, 4_000_000, 60_000, 4)
    assert large > small * 5


def test_renewals_pay_less_than_transfers(balance):
    transfer = commission_for(balance, 0.10, 0, 20_000, 4, is_renewal=False)
    renewal = commission_for(balance, 0.10, 0, 20_000, 4, is_renewal=True)
    assert renewal < transfer


# ---------------------------------------------------------------------------
# Playing time — the hinge everything turns on
# ---------------------------------------------------------------------------


def _club(strength: float) -> Club:
    return Club(
        id=1, name="Test FC", tier=1, strength=strength, prestige=50,
        wage_budget=100000, wage_committed=0, transfer_budget=100000,
    )


def test_too_big_a_club_puts_a_player_on_the_bench(world, balance):
    player = next(iter(world.players.values()))
    player.ability = 60
    player.injury_weeks = 0
    assert playing_time(balance, player, _club(50)) is PlayingTime.KEY
    assert playing_time(balance, player, _club(80)) is PlayingTime.RESERVE


def test_injury_removes_playing_time(world, balance):
    player = next(iter(world.players.values()))
    player.ability = 60
    player.injury_weeks = 4
    assert playing_time(balance, player, _club(50)) is PlayingTime.RESERVE


# ---------------------------------------------------------------------------
# Trust
# ---------------------------------------------------------------------------


def test_benching_a_client_erodes_trust(world, balance):
    player_id = next(iter(world.clients))
    player = world.players[player_id]
    record = world.clients[player_id]
    # Park him somewhere far too good for him.
    big_club = max(world.clubs.values(), key=lambda c: c.strength)
    player.club_id = big_club.id
    player.ability = big_club.strength * 0.6
    record.trust = 80.0

    for _ in range(30):
        trust.run(world, random.Random(1), balance)
    assert record.trust < 80.0


def test_tenure_and_size_stabilise_trust(world, balance):
    player_id = next(iter(world.clients))
    record = world.clients[player_id]
    fresh = trust.stabiliser(world, balance, record)

    record.signed_week = world.week - 52 * 6  # six seasons together
    long_serving = trust.stabiliser(world, balance, record)
    assert long_serving > fresh


def test_negative_trust_is_damped_but_positive_is_not(world, balance):
    player_id = next(iter(world.clients))
    record = world.clients[player_id]
    record.signed_week = world.week - 52 * 6
    record.trust = 50.0

    applied_down = trust.adjust(world, balance, player_id, -10.0)
    record.trust = 50.0
    applied_up = trust.adjust(world, balance, player_id, 10.0)

    assert abs(applied_down) < abs(applied_up)


# ---------------------------------------------------------------------------
# Finance and the downsizing spiral
# ---------------------------------------------------------------------------


def test_costs_are_charged_every_week(world, balance):
    before = world.agency.cash
    tick(world, balance)
    assert world.agency.cash < before  # one client's retainer cannot cover an HQ


def test_insolvency_warns_before_it_downsizes(world, balance):
    world.agency.cash = -1.0
    scouts_before = len(world.scouts)
    kinds = []
    for _ in range(3):
        world.week += 1
        kinds.extend(e.kind for e in finance.run(world, random.Random(1), balance))
    assert "finance.cash_warning" in kinds
    assert len(world.scouts) == scouts_before


def test_sustained_insolvency_forces_a_downsize(world, balance):
    world.agency.cash = -50_000.0
    for _ in range(balance.i("finance.insolvency_downsize_weeks") + 1):
        world.week += 1
        finance.run(world, random.Random(1), balance)
    assert world.agency.weeks_insolvent >= balance.i("finance.insolvency_downsize_weeks")
    assert len(world.scouts) == 0 or world.agency.hq_level == 1


def test_the_run_ends_only_after_a_long_insolvency(world, balance):
    world.agency.cash = -200_000.0
    for _ in range(balance.i("finance.insolvency_game_over_weeks") + 2):
        if world.game_over:
            break
        world.week += 1
        finance.run(world, random.Random(1), balance)
    assert world.game_over


# ---------------------------------------------------------------------------
# Reputation
# ---------------------------------------------------------------------------


def test_reputation_gains_shrink_as_you_climb(world, balance):
    world.agency.reputation = 10.0
    early = reputation.gain(world, balance, 5.0)
    world.agency.reputation = 85.0
    late = reputation.gain(world, balance, 5.0)
    assert late < early


def test_reputation_losses_are_not_damped(world, balance):
    world.agency.reputation = 90.0
    assert reputation.lose(world, balance, 5.0) == pytest.approx(5.0)


def test_reputation_is_bounded(world, balance):
    world.agency.reputation = 99.0
    reputation.gain(world, balance, 1000.0)
    assert world.agency.reputation <= balance.f("reputation.max")
    reputation.lose(world, balance, 1000.0)
    assert world.agency.reputation >= balance.f("reputation.min")


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------


def test_windows_open_and_close(balance):
    assert cal.window_open(balance, 1)
    assert not cal.window_open(balance, 20)
    assert cal.window_open(balance, 29)


def test_season_numbering_rolls_over(balance):
    per = balance.i("calendar.weeks_per_season")
    assert cal.season_number(balance, 1) == 1
    assert cal.season_number(balance, per) == 1
    assert cal.season_number(balance, per + 1) == 2
    assert cal.season_week(balance, per + 1) == 1


# ---------------------------------------------------------------------------
# Read-only action probes (the API renders these; they must not mutate)
# ---------------------------------------------------------------------------


def test_can_upgrade_hq_mirror_upgrade_hq(world, balance):
    from football_agent.engine import actions as A

    ok, reason = A.can_upgrade_hq(world, balance)
    assert ok, reason
    cash_before = world.agency.cash
    assert A.upgrade_hq(world, balance).ok
    assert world.agency.cash == cash_before - balance.l("hq_levels")[0]["upgrade_cost"]

    # Refusal path: same message from probe and action.
    world.agency.cash = 0.0
    ok, reason = A.can_upgrade_hq(world, balance)
    assert not ok
    result = A.upgrade_hq(world, balance)
    assert not result.ok
    assert result.message == reason


def test_can_renew_mirror_open_renewal(world, balance):
    from football_agent.engine import actions as A

    player_id = next(iter(world.clients))
    record = world.clients[player_id]

    ok, reason = A.can_renew(world, balance, player_id)
    assert not ok  # years left on the agreement
    assert "weeks" in reason

    record.agent_contract.expires_week = world.week + 10
    record.trust = 80.0
    ok, _ = A.can_renew(world, balance, player_id)
    assert ok

    record.trust = 5.0
    ok, reason = A.can_renew(world, balance, player_id)
    assert not ok
    negotiation, neg_reason = A.open_renewal_negotiation(world, balance, player_id)
    assert negotiation is None
    assert neg_reason == reason

    assert A.can_renew(world, balance, player_id + 99999) == (False, "Not one of your clients.")
