from copy import deepcopy
from dataclasses import asdict
import pytest

from football_agent.engine import investments, persistence
from football_agent.engine.balance import load_balance
from football_agent.engine.tick import tick
from football_agent.engine.world import create_world


def test_cash_backed_trades_reconcile_ledger_basis_and_fees():
    balance = load_balance()
    world = create_world(42, balance)
    cash = world.agency.cash
    assert investments.trade(world, balance, 'FLD', 'buy', 10).ok
    assert world.agency.cash == cash - 1005
    assert world.investments.holdings['FLD'].cost_basis == 1005
    assert investments.trade(world, balance, 'FLD', 'sell', 4).ok
    assert world.investments.holdings['FLD'].shares == 6
    assert world.investments.holdings['FLD'].cost_basis == 603
    assert world.investments.realized_gain == -4
    assert investments.trade(world, balance, 'FLD', 'sell', 6).ok
    assert 'FLD' not in world.investments.holdings
    assert world.agency.cash == cash - 10
    assert world.investments.realized_gain == -10
    assert world.finance_history[-1].investment_returns == 995
    assert sum(row.net for row in world.finance_history) == world.agency.cash - cash
    assert world.agency.total_commission == 0
    tick(world, balance)
    assert sum(row.net for row in world.finance_history) == pytest.approx(world.agency.cash - cash)


def test_quotes_use_minimum_fee_and_whole_share_validation_is_atomic():
    balance = load_balance()
    world = create_world(42, balance)
    assert investments.trade_quote(24, 1, 'buy', balance) == (24, 1, 25)
    for symbol, side, shares in [('FLD', 'buy', value) for value in [0, -1, True, 1.5, '10', 1000001]] + [('FLD', 'buy', 1000000), ('FLD', 'sell', 1), ('BAD', 'buy', 1), ('FLD', 'short', 1)]:
        before = deepcopy(asdict(world))
        assert not investments.trade(world, balance, symbol, side, shares).ok
        assert asdict(world) == before
    world.game_over = True
    assert not investments.trade(world, balance, 'FLD', 'buy', 1).ok


def test_prices_move_once_per_week_and_survive_save_without_rerolls():
    balance = load_balance()
    world = create_world(42, balance)
    investments.trade(world, balance, 'ATX', 'buy', 10)
    before = deepcopy(asdict(world))
    assert investments.state(world, balance) == investments.state(world, balance)
    assert asdict(world) == before
    restored = persistence.from_dict(persistence.to_dict(world))
    initial_prices = dict(world.investments.prices)
    tick(world, balance)
    tick(restored, balance)
    assert world.investments.prices != initial_prices
    assert world.investments == restored.investments
    before = deepcopy(asdict(world))
    assert investments.run(world, balance) == []
    assert asdict(world) == before
    assert len(investments.state(world, balance)['stocks'][0]['history']) == 2
    assert world.investments.holdings['ATX'].cost_basis == 241.2


def test_legacy_save_starts_with_empty_portfolio_without_touching_cash():
    balance = load_balance()
    world = create_world(42, balance)
    payload = persistence.to_dict(world)
    payload['world'].pop('investments')
    legacy = persistence.from_dict(payload)
    cash = legacy.agency.cash
    investments.initialize(legacy, balance)
    assert legacy.agency.cash == cash
    assert not legacy.investments.holdings
    assert len(legacy.investments.prices) == 5


def test_trades_use_existing_revision_retry_and_autosave_boundary(api_game):
    client = api_game
    snapshot = client.get('/api/investments').json()
    revision = client.get('/api/game').json()['revision']
    headers = {'if-match': str(revision), 'idempotency-key': 'buy-shares-once'}
    body = {'symbol': 'FLD', 'side': 'buy', 'shares': 10}
    response = client.post('/api/investments/trade', json=body, headers=headers)
    assert response.status_code == 200 and response.json()['ok']
    assert client.post('/api/investments/trade', json=body, headers=headers).json() == response.json()
    after = client.get('/api/investments').json()
    assert after['cash'] == snapshot['cash'] - 1005
    assert after['stocks'][0]['shares'] == 10
    assert client.post('/api/investments/trade', json=body, headers={'if-match': str(revision)}).status_code == 409
    from api.session import saves_dir
    stored = persistence.load(saves_dir() / 'autosave.json')
    assert stored.investments.holdings['FLD'].shares == 10
    for shares in [True, 1.5, '10', None]:
        assert client.post('/api/investments/trade', json={**body, 'shares': shares}).status_code == 400
    assert client.post('/api/investments/trade', json={'symbol': 'FLD', 'side': 'sell', 'shares': 10}).json()['ok']
    ledger = client.get('/api/finances').json()['history'][-1]
    assert ledger['investment_returns']['amount'] == 995
    assert ledger['commission']['amount'] == 0


def test_trade_rolls_back_when_autosave_fails(api_game, monkeypatch):
    before = api_game.get('/api/investments').json()
    def fail_save(*args, **kwargs):
        raise OSError("disk unavailable")
    monkeypatch.setattr(persistence, 'save', fail_save)
    response = api_game.post('/api/investments/trade', json={'symbol': 'FLD', 'side': 'buy', 'shares': 10})
    assert response.status_code == 503
    assert api_game.get('/api/investments').json() == before
