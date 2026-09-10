"""Market decisions preserve information boundaries and temporary ownership."""
import json
import random

import pytest

from football_agent.engine import market
from football_agent.engine.balance import Balance, load_balance
from football_agent.engine.models import Agency, AgentContract, ClientRecord, Club, Contract, Player, Position, ScoutingReport, Trait, World, RivalAgency
from football_agent.engine.serde import encode, decode
from football_agent.engine.systems import contracts


def setup_world(expiry=70):
    w = World(seed=42, week=2, agency=Agency("Test", 20000, 20))
    w.clubs = {1: Club(1, "Parent", 1, 80, 80, 10000, 1500, 100000, {"FW": .5}),
               2: Club(2, "Host", 3, 45, 40, 10000, 500, 100000, {"FW": .9})}
    w.players[3] = Player(3, "Client", 21, Position.FW, 55, 90, Trait.PROFESSIONAL, "east", 1, Contract(1000, expiry), weeks_at_club=20)
    w.clients[3] = ClientRecord(3, AgentContract(.05, 150), trust=60)
    w.reports[3] = ScoutingReport(3, 45, 65, 60, 95)
    w.next_id = 10
    b = load_balance()
    market.initialize(w, b)
    return w, b


def loan(w, b, duration="half_season"):
    opened = market.action(w, b, "loan_open", {"player_id": 3, "club_id": 2, "duration": duration})
    assert opened.ok, opened.message
    tid = opened.payload["id"]
    proposed = market.action(w, b, "loan_propose", {"talk_id": tid, "contribution_pct": 50, "fee": 1000})
    assert proposed.ok and proposed.payload["status"] == "agreed", proposed.message
    accepted = market.action(w, b, "loan_accept", {"talk_id": tid})
    assert accepted.ok, accepted.message
    return tid, accepted


def test_loan_finance_return_and_one_time_commission():
    w, b = setup_world()
    tid, accepted = loan(w, b)
    assert w.players[3].club_id == 2 and w.players[3].contract.wage == 1000
    assert w.clubs[1].wage_committed == 1000
    assert w.clubs[2].wage_committed == 1000
    assert w.agency.total_commission == pytest.approx((1000 + 500 * 24) * .05 * .25)
    cash = w.agency.cash
    assert not market.action(w, b, "loan_accept", {"talk_id": tid}).ok
    assert w.agency.cash == cash
    w.week = 26
    market.run(w, random.Random(0), b)
    assert w.players[3].club_id == 1
    assert w.clubs[1].wage_committed == 1500
    assert w.clubs[2].wage_committed == 500
    market.run(w, random.Random(0), b)
    assert w.clubs[1].wage_committed == 1500


def test_expiry_capped_and_released_once():
    w, b = setup_world(expiry=10)
    opened = market.action(w, b, "loan_open", {"player_id": 3, "club_id": 2, "duration": "season"})
    tid = opened.payload["id"]
    assert market.action(w, b, "loan_propose", {"talk_id": tid, "contribution_pct": 100, "fee": 0}).ok
    assert market.action(w, b, "loan_accept", {"talk_id": tid}).ok
    assert market.active_loan(w, 3).ends_week == 10
    w.week = 10
    market.run(w, random.Random(0), b)
    contracts.run(w, random.Random(0), b)
    assert w.players[3].is_free_agent
    assert w.clubs[1].wage_committed == 500
    assert w.clubs[2].wage_committed == 500


def test_save_load_loan_and_old_save_defaults():
    w, b = setup_world()
    loan(w, b)
    saved = json.loads(json.dumps(encode(w)))
    restored = decode(World, saved)
    assert market.active_loan(restored, 3).parent_club_id == 1
    restored.week = 26
    market.run(restored, random.Random(0), b)
    assert restored.players[3].club_id == 1
    saved.pop("market_state", None)
    old = decode(World, saved)
    market.initialize(old, b)
    assert old.market_state.loans == {}


def test_comparisons_use_reports_and_no_hidden_fields():
    w, b = setup_world()
    before = market.state(w, b)
    w.players[3].ability = 99
    w.players[3].potential = 99
    assert market.state(w, b) == before
    text = json.dumps(before)
    assert '"ability"' not in text and '"potential"' not in text and '"threshold"' not in text
    del w.reports[3]
    assert market.state(w, b)["comparisons"][0]["predicted_playing_time"] is None


def test_bounded_talks_and_invalid_terms_do_not_consume_rounds():
    w, b = setup_world()
    opened = market.action(w, b, "loan_open", {"player_id": 3, "club_id": 2})
    tid = opened.payload["id"]
    for invalid in (float("nan"), float("inf"), -1):
        assert not market.action(w, b, "loan_propose", {"talk_id": tid, "contribution_pct": invalid, "fee": 0}).ok
    assert w.market_state.talks[tid].rounds == 0
    for _ in range(3):
        assert market.action(w, b, "loan_propose", {"talk_id": tid, "contribution_pct": 25, "fee": 0}).ok
    assert w.market_state.talks[tid].status == "rejected"
    assert not market.action(w, b, "loan_open", {"player_id": 3, "club_id": 2}).ok


def test_window_and_parent_approval():
    w, b = setup_world()
    w.week = 20
    assert not market.action(w, b, "loan_open", {"player_id": 3, "club_id": 2}).ok
    w.week = 2
    w.players[3].ability = 99
    assert not market.action(w, b, "loan_open", {"player_id": 3, "club_id": 2}).ok


def test_pitch_once_per_pair_window():
    w, b = setup_world()
    first = market.action(w, b, "pitch", {"player_id": 3, "club_id": 2})
    assert first.ok
    assert not market.action(w, b, "pitch", {"player_id": 3, "club_id": 2}).ok
    assert w.players[3].club_id == 1


def test_rival_warning_gives_response_period_and_clears_after_recovery():
    w, b = setup_world()
    w.rivals[8] = RivalAgency(8, "Rival", 95)
    w.clients[3].trust = 5
    events = market.run(w, random.Random(0), b)
    assert 3 in w.clients and 3 in w.market_state.rival_warnings
    assert any(e.kind == "rival.poach_attempt" for e in events)
    w.week += 1
    market.run(w, random.Random(0), b)
    assert 3 in w.clients
    w.clients[3].trust = 80
    market.run(w, random.Random(0), b)
    assert 3 not in w.market_state.rival_warnings


def test_restored_talks_do_not_reset_negotiation_rounds():
    w, b = setup_world()
    opened = market.action(w, b, "loan_open", {"player_id": 3, "club_id": 2})
    tid = opened.payload["id"]
    market.action(w, b, "loan_propose", {"talk_id": tid, "contribution_pct": 25, "fee": 0})
    restored = decode(World, json.loads(json.dumps(encode(w))))
    assert restored.market_state.talks[tid].rounds == 1
    assert market.move_busy(restored, 3)
    assert not market.action(restored, b, "loan_open", {"player_id": 3, "club_id": 2}).ok


def test_return_hook_before_retirement_releases_parent_and_host():
    from football_agent.engine.systems.development import _retire
    w, b = setup_world()
    loan(w, b)
    market.return_loan(w, 3)
    _retire(w, w.players[3])
    assert w.clubs[1].wage_committed == 500
    assert w.clubs[2].wage_committed == 500
    assert not market.active_loan(w, 3)


def test_permanent_completion_cannot_move_a_loaned_client():
    from football_agent.engine.models import Interest
    from football_agent.engine.systems.transfers import complete_deal
    w, b = setup_world()
    loan(w, b)
    before = [w.clubs[1].wage_committed, w.clubs[2].wage_committed, w.agency.cash]
    interest = Interest(99, 1, 3, 2, 4, 10000, 100000)
    complete_deal(w, b, interest, 2000, 100000, 3)
    assert w.players[3].club_id == 2
    assert before == [w.clubs[1].wage_committed, w.clubs[2].wage_committed, w.agency.cash]


def test_loan_fulfills_promise_immediately_and_only_once():
    from football_agent.engine import careers
    w, b = setup_world()
    careers.initialize(w, b)
    promise = careers.promise_move(w, b, 3)
    trust = w.clients[3].trust
    tid, _ = loan(w, b)
    assert promise['status'] == 'fulfilled'
    assert w.clients[3].trust > trust
    after = w.clients[3].trust
    market.action(w, b, "loan_accept", {"talk_id": tid})
    assert w.clients[3].trust == after


def test_market_projections_are_read_only_before_initialization():
    from football_agent.engine.market_models import MarketState
    w, b = setup_world()
    w.market_state = MarketState()
    before = encode(w)
    market.state(w, b)
    market.open_decisions(w, b)
    assert encode(w) == before


def test_comparison_projects_only_known_terms_and_trait_fit():
    from football_agent.engine.models import Interest
    from football_agent.engine.economy import commission_for
    w, b = setup_world()
    unknown = next(row for row in market.state(w, b)['comparisons'] if row['club_id'] == 2)
    assert unknown['estimated_commission'] is None
    assert unknown['wage_ceiling'] is None
    w.interests[99] = Interest(99, 2, 3, 2, 8, 1500, 50000)
    w.players[3].trait = Trait.MERCENARY
    projected = next(row for row in market.state(w, b)['comparisons'] if row['club_id'] == 2)
    assert projected['wage_ceiling'] == 1500
    assert projected['estimated_commission'] == commission_for(b, .05, 50000, 1500, 3)
    assert '3 years' in projected['commission_note']
    assert 'pay rise' in projected['goal_fit']
    before = market.state(w, b)
    w.players[3].ability = 1
    w.players[3].potential = 1
    assert market.state(w, b) == before
