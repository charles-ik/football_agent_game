"""Leak tests — the guard that protects the game's core.

The whole game rests on ability, potential, negotiation thresholds, the world
seed and the negotiation-tuning numbers being unknown to the player. The CLI
hides them by never printing them; a browser client hides them only if the API
never sends them. One ``dataclasses.asdict(world)`` in the DTO layer destroys
the game, and this test exists for exactly that moment of laziness.

``ability_low``/``ability_high`` are legitimate (ranges are the scouting
interface), so we match exact quoted keys, not substrings.
"""

import json


from tests.conftest import tick

FORBIDDEN = [
    '"ability"',
    '"potential"',
    '"threshold"',
    '"seed"',
    '"hidden_bias"',
    '"base_threshold_pct"',
    '"counter_x"',
    '"agreed_x"',
]

ALL_GET_ROUTES = [
    "/api/meta",
    "/api/game",
    "/api/game/inbox",
    "/api/scouting",
    "/api/scouting/candidates",
    "/api/clients",
    "/api/hq",
    "/api/finances",
    "/api/leagues",
]


def assert_clean(body: str, where: str) -> None:
    for key in FORBIDDEN:
        assert key not in body, f"{where} leaks {key}"


def test_no_hidden_fields_anywhere(api_game):
    tick(api_game, 20)
    client_id = api_game.get("/api/clients").json()[0]["player"]["id"]
    for path in ALL_GET_ROUTES + [f"/api/clients/{client_id}"]:
        response = api_game.get(path)
        assert response.status_code == 200, path
        assert_clean(json.dumps(response.json()), path)


def test_negotiation_flow_never_leaks(api_game):
    """Walk a signing negotiation end to end, checking every response body."""
    target = None
    for _ in range(60):
        tick(api_game, 1)
        reports = api_game.get("/api/scouting").json()["reports"]
        approachable = [r for r in reports if r["can_approach"]]
        if approachable:
            target = approachable[0]
            break
    assert target is not None, "no approachable player appeared in 60 weeks"

    response = api_game.post("/api/negotiations/signing", json={"player_id": target["player"]["id"]})
    assert_clean(response.text, "negotiations/signing")
    handle = response.json()
    assert "guide" in handle and "threshold" not in json.dumps(handle)

    for _ in range(handle["max_rounds"]):
        response = api_game.post(
            f"/api/negotiations/{handle['id']}/propose", json={"pct": handle["guide"]["high_pct"]}
        )
        assert_clean(response.text, "propose")
        body = response.json()
        if body["status"] != "open":
            break
    if body["status"] in ("open", "exhausted"):
        response = api_game.post(f"/api/negotiations/{handle['id']}/abandon")
        assert_clean(response.text, "abandon")


def test_deal_negotiation_never_leaks(api_game):
    """Drive a client onto the market and check the whole deal flow."""
    client_id = api_game.get("/api/clients").json()[0]["player"]["id"]
    api_game.post(f"/api/clients/{client_id}/seek", json={"promise": False})

    interest = None
    for _ in range(160):
        tick(api_game, 1)
        detail = api_game.get(f"/api/clients/{client_id}").json()
        open_now = [i for i in detail["interests"] if i["can_negotiate"]["ok"]]
        if open_now:
            interest = open_now[0]
            break
    assert interest is not None, "no negotiable interest in 160 weeks"

    response = api_game.post("/api/negotiations/deal", json={"interest_id": interest["id"], "years": 3})
    assert_clean(response.text, "negotiations/deal")
    handle = response.json()

    response = api_game.post(
        f"/api/negotiations/{handle['id']}/assess",
        json={"wage": handle["bounds"]["max_wage"]["amount"]},
    )
    assert_clean(response.text, "assess")

    response = api_game.post(
        f"/api/negotiations/{handle['id']}/propose",
        json={
            "wage": handle["bounds"]["max_wage"]["amount"],
            "fee": handle["bounds"]["max_fee"]["amount"],
        },
    )
    assert_clean(response.text, "deal propose")
    if response.json()["status"] in ("open", "exhausted"):
        response = api_game.post(f"/api/negotiations/{handle['id']}/accept-counter")
        assert_clean(response.text, "deal accept-counter")
