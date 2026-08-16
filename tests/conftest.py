"""Shared fixtures for the API tests.

The API's session store and save directory are process-global, so every test
gets a fresh store and a tmp save dir via the FA_SAVES_DIR env var.
"""

import os
import tempfile

import pytest


@pytest.fixture()
def api_client():
    from fastapi.testclient import TestClient

    from api.main import create_app
    from api.session import store

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["FA_SAVES_DIR"] = tmp
        store.clear()
        client = TestClient(create_app())
        yield client
        store.clear()
        os.environ.pop("FA_SAVES_DIR", None)


@pytest.fixture()
def api_game(api_client):
    """A started game with the scout assigned to the cheapest region."""
    api_client.post("/api/game/new", json={"seed": 42, "name": "Test Agency"})
    scouting = api_client.get("/api/scouting").json()
    scout = scouting["scouts"][0]
    api_client.post("/api/scouting/assign", json={"scout_id": scout["id"], "region_id": "east"})
    return api_client


def tick(api_client, weeks=1):
    for _ in range(weeks):
        response = api_client.post("/api/game/continue")
        assert response.status_code == 200, response.text
    return response.json()
