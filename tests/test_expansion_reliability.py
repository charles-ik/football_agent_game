from football_agent.engine import persistence
from api.session import store, saves_dir


def test_week_retry_is_durable_and_stale_revision_rejected(api_game):
    before = api_game.get('/api/game').json()
    headers = {'idempotency-key': 'one-week', 'if-match': str(before['revision'])}
    first = api_game.post('/api/game/continue', headers=headers)
    assert first.status_code == 200
    assert api_game.post('/api/game/continue', headers=headers).json() == first.json()
    assert api_game.get('/api/game').json()['calendar']['week'] == before['calendar']['week'] + 1
    stale = api_game.post('/api/game/continue', headers={'if-match': str(before['revision'])})
    assert stale.status_code == 409
    store.clear()
    api_game.post('/api/game/load', json={'slot': 'autosave'})
    assert api_game.post('/api/game/continue', headers=headers).json() == first.json()


def test_upgrade_quote_is_charge_and_persists_without_tick(api_game):
    before = api_game.get('/api/game').json()['agency']['cash']['amount']
    quote = api_game.get('/api/hq').json()['upgrade_cost']['amount']
    response = api_game.post('/api/hq/upgrade').json()
    assert response['ok']
    saved = persistence.load(saves_dir() / 'autosave.json')
    assert saved.agency.cash == before - quote
    assert saved.agency.hq_level == 2


def test_new_same_seed_replaces_old_session(api_game):
    api_game.post('/api/game/continue')
    old_sid = next(iter(store._sessions))
    result = api_game.post('/api/game/new', json={'seed':42, 'name':'Fresh start'}).json()
    assert result['state']['agency']['name'] == 'Fresh start'
    assert old_sid not in store._sessions
    assert len(store._sessions) == 1
    saved = persistence.load(saves_dir()/'autosave.json')
    assert saved.week == result['state']['calendar']['week']


def test_v1_migration_retains_economy_and_neutral_expansion(api_game):
    world = next(iter(store._sessions.values())).world
    payload = persistence.to_dict(world)
    payload['schema_version'] = 1
    for key in ['agency_development','career_state','market_state','revision','mutation_receipts','recent_events']:
        payload['world'].pop(key)
    old_cash = payload['world']['agency']['cash']
    loaded = persistence.from_dict(payload)
    assert loaded.agency.cash == old_cash
    assert loaded.agency_development.staff == []
    assert loaded.market_state.loans == {}
    assert loaded.career_state.promises == {}


def test_save_failure_rolls_back_action(api_game, monkeypatch):
    before = api_game.get('/api/game').json()
    def fail(*args):
        raise OSError('test disk failure')
    monkeypatch.setattr(persistence, 'save', fail)
    response = api_game.post('/api/hq/upgrade')
    assert response.status_code == 503
    assert api_game.get('/api/game').json() == before


def test_timeline_not_duplicated_by_continue(api_game):
    api_game.post('/api/game/continue')
    careers = api_game.get('/api/careers').json()
    for client in careers['clients']:
        entries = [(e['week'],e['kind'],e['message']) for e in client['timeline']]
        assert len(entries) == len(set(entries))


def test_released_client_archived_before_next_week(api_game):
    pid = api_game.get('/api/clients').json()[0]['player']['id']
    assert api_game.post(f'/api/clients/{pid}/release').json()['ok']
    alumni = api_game.get('/api/careers').json()['alumni']
    assert any(p['player_id'] == pid for p in alumni)
    saved = persistence.load(saves_dir()/'autosave.json')
    assert pid in saved.career_state.alumni


def test_shortlist_read_model_matches_persisted_selection(api_game):
    pid = api_game.get('/api/scouting').json()['reports'][0]['player']['id']
    before = api_game.get('/api/management').json()
    assert before['shortlisted_players'] == []
    assert api_game.post('/api/management/action', json={'operation':'shortlist','payload':{'player_id':pid}}).json()['ok']
    assert api_game.get('/api/management').json()['shortlisted_players'] == [pid]
    assert persistence.load(saves_dir()/'autosave.json').agency_development.shortlisted_players == [pid]
