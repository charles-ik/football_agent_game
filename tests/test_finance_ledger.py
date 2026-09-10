"""The ledger reconciles action cash flows and one weekly operating settlement."""
import random

import pytest

from football_agent.engine import actions, agency_management, market
from football_agent.engine.balance import load_balance
from football_agent.engine.models import Interest
from football_agent.engine.persistence import from_dict, to_dict
from football_agent.engine.systems import finance, transfers
from football_agent.engine.tick import tick
from football_agent.engine.world import create_world
from tests.test_market import setup_world, loan


def test_transfer_commission_and_weekly_settlement_reconcile():
    world, balance = setup_world()
    interest = Interest(99, 1, 3, world.week, world.week + 2, 1500, 0, is_renewal=True)
    before = world.agency.cash
    transfers.complete_deal(world, balance, interest, wage=1200, fee=0, years=3)
    ledger = world.finance_history[-1]
    commission = world.agency.cash - before
    assert commission > 0
    assert ledger.income == pytest.approx(commission)
    assert ledger.net == pytest.approx(commission)
    finance.run(world, random.Random(1), balance)
    assert len(world.finance_history) == 1
    assert world.agency.cash - before == pytest.approx(ledger.net)
    assert world.agency.total_commission == pytest.approx(commission)
    settled = world.agency.cash
    assert finance.run(world, random.Random(1), balance) == []
    assert world.agency.cash == settled


def test_loan_commission_appears_once_and_survives_save():
    world, balance = setup_world()
    before = world.agency.cash
    talk_id, _ = loan(world, balance)
    ledger = world.finance_history[-1]
    assert ledger.commission == pytest.approx(world.agency.cash - before)
    assert ledger.commission == pytest.approx(world.agency.total_commission)
    assert not market.action(world, balance, 'loan_accept', {'talk_id': talk_id}).ok
    assert from_dict(to_dict(world)).finance_history[-1].commission == ledger.commission
    finance.run(world, random.Random(1), balance)
    assert world.agency.cash - before == pytest.approx(ledger.net)


def test_investments_reconcile_without_recharging_on_tick():
    balance = load_balance()
    world = create_world(42, balance)
    world.agency.cash = 500000
    starting_cash = world.agency.cash
    starting_costs = world.agency.total_costs
    assert actions.upgrade_hq(world, balance).ok
    assert actions.hire_scout(world, actions.scout_candidates(world, balance)[0], balance).ok
    candidate = world.agency_development.candidates[0]
    assert agency_management.action(world, balance, 'hire', {'candidate_id': candidate.id}).ok
    assert agency_management.action(world, balance, 'upgrade_department', {'department': 'scouting'}).ok
    investment = starting_cash - world.agency.cash
    row = world.finance_history[-1]
    assert row.investments == pytest.approx(investment)
    assert row.net == pytest.approx(-investment)
    assert world.agency.total_costs - starting_costs == pytest.approx(investment)
    tick(world, balance)
    assert world.finance_history[0].investments == investment
    assert world.finance_history[-1].investments == 0
    assert world.agency.cash - starting_cash == pytest.approx(sum(ledger.net for ledger in world.finance_history))
    assert world.agency.total_costs - starting_costs == pytest.approx(sum(ledger.expenditure for ledger in world.finance_history))


def test_purchase_after_settlement_updates_current_row_only():
    balance = load_balance()
    world = create_world(42, balance)
    world.agency.cash = 500000
    before = world.agency.cash
    finance.run(world, random.Random(1), balance)
    assert actions.upgrade_hq(world, balance).ok
    assert len(world.finance_history) == 1
    assert world.agency.cash - before == pytest.approx(world.finance_history[0].net)
    saved = from_dict(to_dict(world))
    settled = saved.agency.cash
    finance.run(saved, random.Random(1), balance)
    assert saved.agency.cash == settled


def test_same_week_replay_does_not_repeat_insolvency_penalties():
    balance = load_balance()
    world = create_world(42, balance)
    world.agency.cash = -100000
    finance.run(world, random.Random(1), balance)
    assert world.agency.weeks_insolvent == 1
    cash = world.agency.cash
    for _ in range(balance.i('finance.insolvency_game_over_weeks') + 2):
        assert finance.run(world, random.Random(1), balance) == []
    assert world.agency.weeks_insolvent == 1
    assert world.agency.cash == cash
    assert not world.game_over


def test_old_settled_ledger_is_not_recharged_on_load():
    balance = load_balance()
    world = create_world(42, balance)
    finance.run(world, random.Random(1), balance)
    payload = to_dict(world)
    for row in payload['world']['finance_history']:
        row.pop('operating_posted')
        row.pop('investments')
    old = from_dict(payload)
    cash = old.agency.cash
    assert finance.run(old, random.Random(1), balance) == []
    assert old.agency.cash == cash
