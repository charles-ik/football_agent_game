from copy import deepcopy
from dataclasses import asdict
import random

from football_agent.engine import agency_management as management
from football_agent.engine.balance import load_balance
from football_agent.engine.world import create_world


def setup():
    balance = load_balance()
    world = create_world(42, balance)
    world.agency.cash = 500000
    management.initialize(world, balance)
    return world, balance


def test_read_model_is_pure_and_candidates_are_stable():
    world, balance = setup()
    before = deepcopy(asdict(world))
    assert management.state(world, balance) == management.state(world, balance)
    assert asdict(world) == before

    world.week += 1
    before = deepcopy(asdict(world))
    assert management.state(world, balance)["candidates"] != before["agency_development"]["candidates"]
    assert asdict(world) == before


def test_objective_rewards_and_options_come_from_balance():
    world, balance = setup()
    state = management.state(world, balance)
    expected = management.config()["objectives"]
    assert {row["id"]: {k: row[k] for k in ("target", "reward")} for row in state["objective_options"]} == expected
    assert state["objective"]["reward"] == expected[state["objective"]["id"]]["reward"]


def test_hiring_charges_once_and_enforces_slots():
    world, balance = setup()
    candidate = management.state(world, balance)["candidates"][0]
    cash = world.agency.cash
    assert management.action(world, balance, "hire", {"candidate_id": candidate["id"]}).ok
    assert world.agency.cash == cash - candidate["hire_cost"]
    assert not management.action(world, balance, "hire", {"candidate_id": candidate["id"]}).ok
    next_id = management.state(world, balance)["candidates"][0]["id"]
    assert not management.action(world, balance, "hire", {"candidate_id": next_id}).ok
    assert management.support_cost(world) == candidate["wage"]


def test_assign_validates_and_bonus_requires_portfolio():
    world, balance = setup()
    candidate = management.state(world, balance)["candidates"][0]
    management.action(world, balance, "hire", {"candidate_id": candidate["id"]})
    staff = world.agency_development.staff[0]
    pid = next(iter(world.clients))
    assert management.client_support(world, pid) == 0
    assert not management.action(world, balance, "assign", {"staff_id": staff.id, "player_ids": [pid, pid]}).ok
    assert not management.action(world, balance, "assign", {"staff_id": staff.id, "player_ids": [999999]}).ok
    assert management.action(world, balance, "assign", {"staff_id": staff.id, "player_ids": [pid]}).ok
    assert management.client_support(world, pid) > 0


def test_departments_cost_upkeep_and_prevent_unsafe_downsize():
    world, balance = setup()
    assert management.action(world, balance, "upgrade_department", {"department": "scouting"}).ok
    assert management.support_cost(world) == 120
    assert management.scouting_bonus(world, 20) == .04
    assert not management.action(world, balance, "upgrade_department", {"department": "scouting"}).ok
    world.agency.hq_level = 2
    assert management.action(world, balance, "upgrade_department", {"department": "scouting"}).ok
    assert not management.action(world, balance, "downsize", {}).ok
    assert management.action(world, balance, "downgrade_department", {"department": "scouting"}).ok
    assert management.action(world, balance, "downsize", {}).ok


def test_migration_does_not_fabricate_history_and_reward_is_once():
    world, balance = setup()
    assert not world.agency_development.milestones
    assert not management.run(world, random.Random(1), balance)
    assert not world.agency_development.milestones
    assert management.action(world, balance, "objective", {"objective": "stability"}).ok
    reputation = world.agency.reputation
    for week in range(2, 22):
        world.week = week
        management.run(world, random.Random(1), balance)
    assert world.agency.reputation == reputation + 2
    assert not management.run(world, random.Random(1), balance)
    assert world.agency.reputation == reputation + 2
    world.week, world.season = 53, 2
    management.run(world, random.Random(1), balance)
    assert world.agency_development.reviews[-1]["completed"]


def test_specialization_unlock_and_switch_boundary():
    world, balance = setup()
    assert not management.action(world, balance, "specialization", {"specialization": "youth"}).ok
    world.agency.total_commission = 100
    world.week = 10
    assert management.action(world, balance, "specialization", {"specialization": "youth"}).ok
    assert management.scouting_bonus(world, 20) > management.scouting_bonus(world, 30)
    assert not management.action(world, balance, "specialization", {"specialization": "careers"}).ok
    world.week, world.season = 53, 2
    assert management.action(world, balance, "specialization", {"specialization": "careers"}).ok


def test_liaison_has_named_club_portfolio_and_roundtrips():
    from football_agent.engine.persistence import to_dict, from_dict
    world, balance = setup()
    candidate = next(c for c in management.state(world, balance)["candidates"] if c["role"] == "club_liaison")
    assert management.action(world, balance, "hire", {"candidate_id": candidate["id"]}).ok
    staff = world.agency_development.staff[0]
    clubs = list(world.clubs)
    assert management.relationship_bonus(world, clubs[0]) == 0
    assert not management.action(world, balance, "assign", {"staff_id": staff.id, "club_ids": clubs[:staff.capacity + 1]}).ok
    assert management.action(world, balance, "assign", {"staff_id": staff.id, "club_ids": clubs[:1]}).ok
    assert management.relationship_bonus(world, clubs[0]) > 0
    assert management.relationship_bonus(world, clubs[1]) == 0
    restored = from_dict(to_dict(world))
    assert restored.agency_development == world.agency_development
    assert management.state(restored, balance) == management.state(world, balance)


def test_client_mitigation_is_capped_and_deal_progress_survives_release():
    world, balance = setup()
    d = world.agency_development
    d.departments["client_services"] = 4
    d.specialization = "careers"
    candidate = d.candidates[0]
    management.action(world, balance, "hire", {"candidate_id": candidate.id})
    pid = next(iter(world.clients))
    d.staff[0].player_ids = [pid]
    assert 0 < management.client_support(world, pid) <= .35
    assert management.action(world, balance, "objective", {"objective": "careers"}).ok
    world.clients[pid].deals_done += 1
    world.week += 1
    management.run(world, None, balance)
    assert management.state(world, balance)["objective"]["progress"] == 1
    del world.clients[pid]
    world.week += 1
    management.run(world, None, balance)
    assert management.state(world, balance)["objective"]["progress"] == 1
    assert not d.staff[0].player_ids


def test_last_week_deal_counts_before_season_review():
    world, balance = setup()
    assert management.action(world, balance, "objective", {"objective": "careers"}).ok
    world.clients[next(iter(world.clients))].deals_done = 3
    world.week, world.season = 53, 2
    events = management.run(world, None, balance)
    assert world.agency_development.reviews[-1]["completed"]
    assert sum(e.kind == "agency.objective" for e in events) == 1
    assert management.state(world, balance)["objective"]["progress"] == 0
