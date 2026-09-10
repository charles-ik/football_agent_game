"""Parity test — the strongest guarantee available, and cheap.

Same seed, same scripted decisions, one run through the HTTP API and one
through ``engine.actions`` directly. Afterwards the two worlds must be
byte-identical. If they diverge, the API layer has grown a rule of its own
and needs surgery.
"""



from football_agent.engine import actions as A
from football_agent.engine import persistence
from football_agent.engine.balance import load_balance
from football_agent.engine.tick import tick as engine_tick
from football_agent.engine.world import create_world

from tests.conftest import tick


def test_api_and_engine_agree(api_client):
    seed = 4242

    # -- through the API ------------------------------------------------------
    api_client.post("/api/game/new", json={"seed": seed, "name": "Parity FC"})
    scout_id = api_client.get("/api/scouting").json()["scouts"][0]["id"]
    api_client.post(
        "/api/scouting/assign",
        json={"scout_id": scout_id, "region_id": "east", "brief_position": "MF", "brief_max_age": 24},
    )
    tick(api_client, 20)
    api_client.post("/api/hq/upgrade")
    api_client.post("/api/scouting/hire", json={"index": 1})
    tick(api_client, 10)
    player_id = api_client.get("/api/clients").json()[0]["player"]["id"]
    api_client.post(f"/api/clients/{player_id}/seek", json={"promise": False})
    tick(api_client, 5)

    from api.session import store

    api_world = next(iter(store._sessions.values())).world

    # -- through the engine ----------------------------------------------------
    balance = load_balance()
    world = create_world(seed, balance, "Parity FC")
    scout = next(iter(world.scouts.values()))
    from football_agent.engine.models import Position

    A.assign_scout(world, scout.id, "east", Position.MF, 24)
    for _ in range(20):
        engine_tick(world, balance)
    A.upgrade_hq(world, balance)
    A.hire_scout(world, A.scout_candidates(world, balance)[1], balance)
    for _ in range(10):
        engine_tick(world, balance)
    client_id = next(iter(world.clients))
    A.seek_move(world, balance, client_id, promise=False)
    for _ in range(5):
        engine_tick(world, balance)

    api_state = persistence.to_dict(api_world)
    engine_state = persistence.to_dict(world)
    # Transport revisions/retry receipts and the UI's action-inclusive inbox do
    # not change simulation rules. All career and economic state must match.
    for state in (api_state, engine_state):
        for key in ("revision", "mutation_receipts", "recent_events"):
            state["world"].pop(key)
    assert api_state == engine_state
