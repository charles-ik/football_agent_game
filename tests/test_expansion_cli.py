from football_agent.cli.app import Game
from football_agent.engine import persistence
from football_agent.engine.balance import load_balance
from football_agent.engine.world import create_world
from football_agent.harness.runner import run_one


def test_cli_expansion_uses_engine_validation_and_saves(tmp_path):
    balance = load_balance()
    world = create_world(42, balance)
    path = tmp_path / 'cli.json'
    game = Game(world, balance, path)
    candidate = world.agency_development.candidates[0]
    before = world.agency.cash
    result = game.expansion_action('management', 'hire', {'candidate_id': candidate.id})
    assert result.ok
    restored = persistence.load(path)
    assert restored.agency.cash == before - candidate.hire_cost
    assert len(restored.agency_development.staff) == 1
    assert restored.recent_events[-1].kind == 'agency.hire'
    revision = restored.revision
    assert not game.expansion_action('management', 'hire', {'candidate_id': -999999}).ok
    assert persistence.load(path).revision == revision


def test_cli_agency_menu_dispatches_identity(monkeypatch, tmp_path):
    from rich.prompt import Prompt
    answers = iter(['identity', 'star', 'blue', 'back'])
    monkeypatch.setattr(Prompt, 'ask', lambda *args, **kwargs: next(answers))
    balance = load_balance()
    world = create_world(42, balance)
    game = Game(world, balance, tmp_path / 'cli.json')
    game.screen_agency()
    assert world.agency_development.emblem == 'star'
    assert world.agency_development.accent == 'blue'
    assert persistence.load(game.save_path).agency_development.emblem == 'star'


def test_expansion_policy_results_are_reproducible_and_measured():
    balance = load_balance()
    first = run_one('expansion_clients', 1000, 1, balance)
    assert first == run_one('expansion_clients', 1000, 1, balance)
    assert first.support_spending >= 0
    assert first.objectives_completed >= 0
    assert first.loans_completed >= 0
