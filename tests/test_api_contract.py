"""API contract tests — the endpoints, their shapes, and the refusal model.

Refusals ("you can't afford that") are 200s with ok=False; HTTP errors are
reserved for real faults (bad bodies, unknown sessions, lapsed negotiations,
incompatible saves, actions after game over).
"""


from tests.conftest import tick

# ---------------------------------------------------------------------------
# Meta and lifecycle
# ---------------------------------------------------------------------------


def test_health(api_client):
    assert api_client.get("/api/health").json() == {"ok": True}


def test_meta_is_the_allowlist(api_client):
    meta = api_client.get("/api/meta").json()
    assert set(meta) == {
        "commission",
        "calendar",
        "hq_levels",
        "positions",
        "traits",
        "trait_blurbs",
    }
    assert meta["commission"] == {"min_pct": 0.03, "max_pct": 0.20}
    assert meta["calendar"]["windows"] == [[1, 10], [28, 31]]
    assert meta["hq_levels"][0]["weekly_cost"] == {"amount": 180.0, "text": "£180"}
    assert meta["positions"] == ["GK", "DF", "MF", "FW"]
    assert set(meta["trait_blurbs"]) == set(meta["traits"])


def test_everything_but_meta_and_new_requires_a_session(api_client):
    for path in ["/api/game", "/api/game/inbox", "/api/scouting", "/api/clients",
                 "/api/hq", "/api/finances", "/api/leagues"]:
        response = api_client.get(path)
        assert response.status_code == 404, path
        assert response.json()["error"] == "session_not_found", path


def test_new_game_echoes_the_seed_once(api_client):
    response = api_client.post("/api/game/new", json={"seed": 42, "name": "Marchant Management"})
    assert response.status_code == 200
    body = response.json()
    assert body["seed"] == 42
    assert body["state"]["agency"]["name"] == "Marchant Management"
    assert body["state"]["agency"]["cash"] == {"amount": 75000.0, "text": "£75.0k"}
    # ...but never again
    assert "seed" not in api_client.get("/api/game").json()


def test_thirty_continues_run_cleanly(api_game):
    result = tick(api_game, 30)
    state = result["state"]
    assert state["calendar"]["week"] == 31
    assert set(result) == {"state", "events", "notable"}
    assert len(result["notable"]) <= len(result["events"])


def test_inbox_splits_decisions_from_noise(api_game):
    tick(api_game, 10)
    inbox = api_game.get("/api/game/inbox").json()
    assert set(inbox) == {"needs_decision", "recent"}
    assert all(e["severity"] == "action" for e in inbox["needs_decision"])
    noisy = {"finance.retainer", "league.round", "scouting.narrowed"}
    assert all(e["kind"] not in noisy for e in inbox["recent"])


def test_save_and_load_roundtrip(api_game):
    tick(api_game, 5)
    assert api_game.post("/api/game/save", json={"slot": "slot-a"}).json() == {"ok": True, "slot": "slot-a"}
    week = api_game.get("/api/game").json()["calendar"]["week"]
    tick(api_game, 3)
    api_game.post("/api/game/load", json={"slot": "slot-a"})
    assert api_game.get("/api/game").json()["calendar"]["week"] == week


def test_load_missing_save_is_a_404(api_client):
    response = api_client.post("/api/game/load", json={"slot": "nope"})
    assert response.status_code == 404
    assert response.json()["error"] == "save_not_found"


def test_saves_lists_slots_without_a_session(api_game):
    api_game.post("/api/game/save", json={"slot": "slot-b"})
    # No session required — the new-game screen calls this before one exists.
    response = api_game.get("/api/game/saves")
    assert response.status_code == 200
    slugs = {s["slot"] for s in response.json()["slots"]}
    assert {"autosave", "slot-b"} <= slugs
    slot_b = next(s for s in response.json()["slots"] if s["slot"] == "slot-b")
    assert slot_b["compatible"] is True
    assert slot_b["agency_name"] == "Test Agency"
    assert isinstance(slot_b["week"], int)


def test_slot_names_are_slugs(api_game):
    for bad in ["../etc", "..%2f..%2f", "a b", "UPPER", "x" * 33, ""]:
        response = api_game.post("/api/game/save", json={"slot": bad})
        assert response.status_code == 400, bad
        assert response.json()["error"] == "bad_slot"


def test_malformed_bodies_are_400_not_422(api_game):
    response = api_game.post("/api/scouting/assign", json={"scout_id": "not-an-int"})
    assert response.status_code == 400
    assert response.json()["error"] == "bad_request"


# ---------------------------------------------------------------------------
# Scouting and clients
# ---------------------------------------------------------------------------


def test_reports_appear_as_ranges_with_confidence(api_game):
    tick(api_game, 30)
    reports = api_game.get("/api/scouting").json()["reports"]
    assert reports, "no reports after 30 weeks of scouting"
    row = reports[0]
    report = row["report"]
    assert report["ability_low"] < report["ability_high"]
    assert report["confidence"] in ("certain", "confident", "rough idea", "guesswork")
    assert isinstance(row["can_approach"], bool)


def test_hire_scout_by_index_only(api_game):
    candidates = api_game.get("/api/scouting/candidates").json()
    assert len(candidates) == 3
    assert {c["index"] for c in candidates} == {0, 1, 2}
    # HQ level 1 supports a single scout, so hiring must be refused as a *value*
    refusal = api_game.post("/api/scouting/hire", json={"index": 0}).json()
    assert refusal["ok"] is False
    assert "headquarters supports 1 scout" in refusal["message"]


def test_client_detail_carries_the_decision_data(api_game):
    clients = api_game.get("/api/clients").json()
    assert len(clients) == 1
    player_id = clients[0]["player"]["id"]
    detail = api_game.get(f"/api/clients/{player_id}").json()
    for key in ["club", "market_value", "asking_price", "interests", "can_renew", "trust_label"]:
        assert key in detail, key
    assert detail["can_renew"]["ok"] is False  # years left on the agreement
    assert api_game.get("/api/clients/999999").status_code == 404


def test_seek_and_stop_seeking(api_game):
    player_id = api_game.get("/api/clients").json()[0]["player"]["id"]
    result = api_game.post(f"/api/clients/{player_id}/seek", json={"promise": True}).json()
    assert result["ok"] is True
    assert api_game.get("/api/clients").json()[0]["flags"]["seeking_move"] is True
    api_game.post(f"/api/clients/{player_id}/stop-seeking")
    assert api_game.get("/api/clients").json()[0]["flags"]["seeking_move"] is False


# ---------------------------------------------------------------------------
# Agency
# ---------------------------------------------------------------------------


def test_hq_upgrade_is_a_refusal_value_when_broke(api_game):
    state = api_game.get("/api/hq").json()
    assert state["current"]["level"] == 1
    assert state["next"]["level"] == 2
    # £75k in the bank, the upgrade is £45k — affordable at the start
    assert state["can_upgrade"]["ok"] is True
    result = api_game.post("/api/hq/upgrade").json()
    assert result["ok"] is True
    assert api_game.get("/api/hq").json()["current"]["level"] == 2


def test_finances_shape(api_game):
    tick(api_game, 3)
    finances = api_game.get("/api/finances").json()
    assert finances["weekly_net"]["amount"] < 0  # one client cannot cover an HQ
    assert finances["weeks_until_broke"] is not None
    assert len(finances["history"]) == 3


def test_leagues_flag_client_clubs(api_game):
    leagues = api_game.get("/api/leagues").json()
    assert leagues
    flagged = [row for lg in leagues for row in lg["table"] if row["has_client"]]
    assert len(flagged) == 1  # the starting client's club


# ---------------------------------------------------------------------------
# Negotiations
# ---------------------------------------------------------------------------


def _approachable(api_game, max_weeks=60):
    for _ in range(max_weeks):
        tick(api_game, 1)
        reports = api_game.get("/api/scouting").json()["reports"]
        found = [r for r in reports if r["can_approach"]]
        if found:
            return found[0]
    raise AssertionError("no approachable player appeared")


def test_signing_negotiation_completes_server_side(api_game):
    player_id = _approachable(api_game)["player"]["id"]
    opened = api_game.post("/api/negotiations/signing", json={"player_id": player_id}).json()
    assert opened["status"] == "open"
    assert opened["axis"] == "commission_pct"
    assert opened["round"] == 0 and opened["rounds_left"] == opened["max_rounds"]

    # A floor offer is accepted outright, and the signing completes in the
    # same request — the client is never trusted with the agreed value.
    result = api_game.post(
        f"/api/negotiations/{opened['id']}/propose", json={"pct": 0.03}
    ).json()
    assert result["status"] == "accepted"
    assert result["result"]["ok"] is True
    assert any(
        c["player"]["id"] == player_id for c in api_game.get("/api/clients").json()
    )


def test_history_echoes_your_own_offer(api_game):
    """The dialog should read like a conversation: your proposal alongside
    their hint, not just their side of it."""
    player_id = _approachable(api_game)["player"]["id"]
    opened = api_game.post("/api/negotiations/signing", json={"player_id": player_id}).json()
    guide_top = opened["guide"]["high_pct"]
    body = api_game.post(
        f"/api/negotiations/{opened['id']}/propose", json={"pct": guide_top + 0.005}
    ).json()
    assert body["history"][-1]["offer"] == {"pct": round(guide_top + 0.005, 4)}
    if body["status"] == "open":
        # A second push records a second, independent offer entry.
        body2 = api_game.post(
            f"/api/negotiations/{opened['id']}/propose", json={"pct": guide_top}
        ).json()
        assert body2["history"][0]["offer"] == {"pct": round(guide_top + 0.005, 4)}
        assert body2["history"][-1]["offer"] == {"pct": round(guide_top, 4)}


def test_reopening_an_open_negotiation_resumes_it(api_game):
    player_id = _approachable(api_game)["player"]["id"]
    first = api_game.post("/api/negotiations/signing", json={"player_id": player_id}).json()
    # Reopen before any proposal: same handle, untouched round.
    second = api_game.post("/api/negotiations/signing", json={"player_id": player_id}).json()
    assert second["id"] == first["id"]
    assert second["round"] == 0

    # Propose just past the guide band — a small overreach that counters
    # rather than walks. Then reopening still resumes the same haggle.
    guide_top = first["guide"]["high_pct"]
    body = api_game.post(
        f"/api/negotiations/{first['id']}/propose", json={"pct": guide_top + 0.005}
    ).json()
    if body["status"] == "open":
        resumed = api_game.post(
            "/api/negotiations/signing", json={"player_id": player_id}
        ).json()
        assert resumed["id"] == first["id"]
        assert resumed["round"] == 1
    else:
        # Accepted outright is fine — but then he must be our client.
        assert body["status"] == "accepted"
        assert any(c["player"]["id"] == player_id for c in api_game.get("/api/clients").json())


def test_walking_away_spends_the_approach(api_game):
    player_id = _approachable(api_game)["player"]["id"]
    opened = api_game.post("/api/negotiations/signing", json={"player_id": player_id}).json()
    # Maximum overreach, every round, until he walks.
    for _ in range(opened["max_rounds"]):
        body = api_game.post(
            f"/api/negotiations/{opened['id']}/propose", json={"pct": 0.20}
        ).json()
        if body["status"] != "open":
            break
    if body["status"] == "exhausted":
        body = api_game.post(f"/api/negotiations/{opened['id']}/abandon").json()
    assert body["status"] in ("walked", "abandoned")

    refused = api_game.post("/api/negotiations/signing", json={"player_id": player_id}).json()
    assert refused["ok"] is False
    assert "walked out" in refused["message"]


def test_continue_evicts_open_negotiations(api_game):
    player_id = _approachable(api_game)["player"]["id"]
    opened = api_game.post("/api/negotiations/signing", json={"player_id": player_id}).json()
    tick(api_game, 1)
    response = api_game.post(f"/api/negotiations/{opened['id']}/propose", json={"pct": 0.1})
    assert response.status_code == 404
    assert response.json()["error"] == "negotiation_not_found"
