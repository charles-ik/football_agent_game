"""Career commitments resolve once and survive serialization and departures."""
import random
import pytest
from football_agent.engine import careers
from football_agent.engine.balance import load_balance
from football_agent.engine.events import ev
from football_agent.engine.models import AgentContract, ClientRecord, World
from football_agent.engine.serde import decode, encode
from football_agent.engine.world import create_world


@pytest.fixture
def game():
    b = load_balance()
    w = create_world(901, b)
    p = next(p for p in w.players.values() if p.club_id is not None and not p.retired)
    w.clients[p.id] = ClientRecord(p.id, AgentContract(.1, w.week + 100), trust=60)
    careers.initialize(w, b)
    return w, b, p.id


def test_promise_failure_applies_once_and_cannot_be_reset(game):
    w, b, pid = game
    first = careers.promise_move(w, b, pid)
    w.week += 2
    assert careers.promise_move(w, b, pid) is first
    assert first['created_week'] == w.week - 2
    w.week = first['deadline_week']
    before = w.clients[pid].trust
    careers.run(w, random.Random(1), b)
    assert first['status'] == 'failed'
    assert w.clients[pid].trust < before
    after = w.clients[pid].trust
    careers.run(w, random.Random(1), b)
    assert w.clients[pid].trust == after
    assert careers.promise_move(w, b, pid) is None


def test_promise_success_once(game):
    w, b, pid = game
    promise = careers.promise_move(w, b, pid)
    assert len(careers.fulfill_move(w, b, pid)) == 1
    trust = w.clients[pid].trust
    assert careers.fulfill_move(w, b, pid) == []
    assert w.clients[pid].trust == trust
    assert promise['status'] == 'fulfilled'


def test_story_response_cannot_farm_and_cooldown_blocks_retrigger(game):
    w, b, pid = game
    careers.record_event(w, ev('client.injured', 'An ankle injury.', w.week, player_id=pid))
    careers.run(w, random.Random(1), b)
    story = next(x for x in w.career_state.stories.values() if x['kind'] == 'injury_recovery')
    payload = {'story_id': story['id'], 'option_id': 'honest'}
    assert careers.action(w, b, 'respond', payload).ok
    trust = w.clients[pid].trust
    assert not careers.action(w, b, 'respond', payload).ok
    assert w.clients[pid].trust == trust
    careers.record_event(w, ev('client.recovered', 'Recovered.', w.week, player_id=pid))
    careers.run(w, random.Random(1), b)
    assert not any(x['status'] == 'active' and x['kind'] == 'injury_recovery' for x in w.career_state.stories.values())


def test_alumni_and_promises_survive_save_roundtrip(game):
    w, b, pid = game
    careers.promise_move(w, b, pid)
    careers.record_event(w, ev('client.poached', 'Moved to a rival.', w.week, player_id=pid))
    w.clients.pop(pid)
    careers.run(w, random.Random(1), b)
    restored = decode(World, encode(w))
    alumni = careers.state(restored, b)['alumni']
    assert alumni[0]['player_id'] == pid
    assert alumni[0]['reason'] == 'client.poached'
    assert alumni[0]['timeline']
    assert next(iter(restored.career_state.promises.values()))['status'] == 'closed'


def test_legacy_promise_gets_fresh_deadline(game):
    w, b, pid = game
    w.career_state.careers.clear()
    w.clients[pid].promised_move = True
    w.week = 150
    careers.initialize(w, b)
    promise = next(iter(w.career_state.promises.values()))
    assert promise['created_week'] == 150
    assert promise['deadline_week'] > 150
    assert w.clients[pid].trust == 60


def test_all_six_contexts_and_invalid_responses(game):
    w, b, pid = game
    for kind in careers._STORIES:
        story = careers._open_story(w, b, pid, kind)
        assert story is not None
    active = next(x for x in careers.state(w, b)['clients'] if x['player_id'] == pid)['stories']
    assert len(active) == 6
    assert all(2 <= len(story['options']) <= 3 for story in active)
    assert not careers.action(w, b, 'respond', {'story_id': active[0]['id'], 'option_id': 'invented'}).ok
    assert len(careers.open_decisions(w, b)) == 6


def test_read_projections_do_not_mutate_uninitialized_world(game):
    from football_agent.engine.career_models import CareerState
    w, b, _ = game
    w.career_state = CareerState()
    before = encode(w)
    view = careers.state(w, b)
    assert view['clients']
    assert all(client['goal'] is None for client in view['clients'])
    assert careers.open_decisions(w, b) == []
    assert encode(w) == before
