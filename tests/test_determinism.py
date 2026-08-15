import random

import pytest

from football_agent.engine import persistence
from football_agent.engine.balance import load_balance
from football_agent.engine.rng import derive_seed, stream
from football_agent.engine.tick import tick
from football_agent.engine.world import create_world


@pytest.fixture
def balance():
    return load_balance()


def test_streams_are_reproducible():
    a = stream(42, 7, "scouting").random()
    b = stream(42, 7, "scouting").random()
    assert a == b


def test_streams_are_independent_across_systems():
    """A change in one system's draws must not shift another's."""
    scouting = [stream(42, w, "scouting").random() for w in range(20)]
    transfers = [stream(42, w, "transfers").random() for w in range(20)]
    assert scouting != transfers


def test_streams_differ_by_week_and_seed():
    assert stream(1, 1, "x").random() != stream(1, 2, "x").random()
    assert stream(1, 1, "x").random() != stream(2, 1, "x").random()


def test_derive_seed_is_stable_and_bounded():
    seed = derive_seed(99, 3, "league", "salt")
    assert seed == derive_seed(99, 3, "league", "salt")
    assert 0 <= seed < 2**64


def test_same_seed_produces_identical_worlds(balance):
    a = create_world(2024, balance)
    b = create_world(2024, balance)
    assert len(a.players) == len(b.players)
    assert [p.name for p in a.players.values()] == [p.name for p in b.players.values()]
    assert [p.ability for p in a.players.values()] == [p.ability for p in b.players.values()]


def test_different_seeds_produce_different_worlds(balance):
    a = create_world(1, balance)
    b = create_world(2, balance)
    assert [p.name for p in a.players.values()] != [p.name for p in b.players.values()]


def test_replaying_a_seed_gives_an_identical_season(balance):
    """The property the tuning harness depends on."""

    def run():
        world = create_world(555, balance)
        messages = []
        for _ in range(60):
            messages.extend(e.message for e in tick(world, balance))
        return world, messages

    world_a, messages_a = run()
    world_b, messages_b = run()
    assert messages_a == messages_b
    assert world_a.agency.cash == world_b.agency.cash
    assert world_a.agency.reputation == world_b.agency.reputation


def test_save_and_load_roundtrip(tmp_path, balance):
    world = create_world(31337, balance)
    for _ in range(15):
        tick(world, balance)

    path = tmp_path / "save.json"
    persistence.save(world, path)
    loaded = persistence.load(path)

    assert loaded.week == world.week
    assert loaded.seed == world.seed
    assert loaded.agency.cash == world.agency.cash
    assert len(loaded.players) == len(world.players)
    assert set(loaded.clients) == set(world.clients)
    sample = next(iter(world.players))
    assert loaded.players[sample].name == world.players[sample].name
    assert loaded.players[sample].position is world.players[sample].position


def test_reloading_does_not_change_the_future(tmp_path, balance):
    """Derived RNG means a save/load must be invisible to the simulation."""
    world = create_world(777, balance)
    for _ in range(10):
        tick(world, balance)

    path = tmp_path / "mid.json"
    persistence.save(world, path)
    reloaded = persistence.load(path)

    straight = [e.message for _ in range(20) for e in tick(world, balance)]
    after_reload = [e.message for _ in range(20) for e in tick(reloaded, balance)]
    assert straight == after_reload


def test_old_schema_is_rejected(tmp_path, balance):
    world = create_world(1, balance)
    payload = persistence.to_dict(world)
    payload["schema_version"] = 0
    with pytest.raises(persistence.SaveError):
        persistence.from_dict(payload)
