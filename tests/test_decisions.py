"""Open decisions — the list that answers "what is still waiting on me?".

The property under test throughout is the one the old event-derived list could
not hold: **a decision exists exactly as long as its condition does.** Resolve
the condition and the decision is gone on the next read, with no dismissal
step, no expiry window and no way for the list to disagree with the world.
"""

import pytest

from football_agent.engine.balance import load_balance
from football_agent.engine.decisions import open_decisions
from football_agent.engine.events import Severity
from football_agent.engine.models import AgentContract, Contract
from football_agent.engine.systems.contracts import AGENT_CONTRACT_NOTICE_WEEKS
from football_agent.engine.world import create_world


@pytest.fixture
def balance():
    return load_balance()


@pytest.fixture
def world(balance):
    return create_world(4242, balance)


@pytest.fixture
def client_id(world):
    assert world.clients, "the starting world always hands you one client"
    return next(iter(world.clients))


def kinds(world, balance):
    return [d.kind for d in open_decisions(world, balance)]


def find(world, balance, kind):
    return next((d for d in open_decisions(world, balance) if d.kind == kind), None)


# ---------------------------------------------------------------------------
# Silence is the default
# ---------------------------------------------------------------------------


def test_a_client_deep_in_contract_asks_nothing_of_you(world, balance, client_id):
    """The noise this module exists to remove.

    A client with years left on his deal and years left on yours is not a
    decision. Saying so every week is what taught players to ignore the list.
    """
    player = world.players[client_id]
    player.contract = Contract(wage=5000, expires_week=world.week + 200)
    world.clients[client_id].agent_contract = AgentContract(
        commission_pct=0.08, expires_week=world.week + 200
    )
    world.interests.clear()

    assert open_decisions(world, balance) == []


def test_nothing_is_asked_of_you_once_the_run_is_over(world, balance):
    world.game_over = True
    assert open_decisions(world, balance) == []


# ---------------------------------------------------------------------------
# His contract with his club
# ---------------------------------------------------------------------------


def test_the_contract_warning_appears_only_inside_the_warning_window(world, balance, client_id):
    warn_at = balance.i("transfers.contract_expiry_warning_weeks")
    player = world.players[client_id]
    world.interests.clear()
    world.clients[client_id].agent_contract.expires_week = world.week + 500

    player.contract = Contract(wage=5000, expires_week=world.week + warn_at + 1)
    assert "contract_expiring" not in kinds(world, balance)

    player.contract.expires_week = world.week + warn_at
    assert "contract_expiring" in kinds(world, balance)


def test_renewing_his_deal_clears_the_decision(world, balance, client_id):
    """The exact failure of the old list: acting on it changed nothing."""
    warn_at = balance.i("transfers.contract_expiry_warning_weeks")
    player = world.players[client_id]
    world.interests.clear()
    world.clients[client_id].agent_contract.expires_week = world.week + 500
    player.contract = Contract(wage=5000, expires_week=world.week + 2)
    assert find(world, balance, "contract_expiring") or find(world, balance, "contract_expired")

    # He signs fresh terms.
    player.contract.expires_week = world.week + warn_at + 100
    assert not find(world, balance, "contract_expiring")
    assert not find(world, balance, "contract_expired")


def test_a_client_with_no_club_is_critical(world, balance, client_id):
    world.interests.clear()
    world.clients[client_id].agent_contract.expires_week = world.week + 500
    world.players[client_id].contract = None

    decision = find(world, balance, "contract_expired")
    assert decision is not None
    assert decision.severity is Severity.CRITICAL


# ---------------------------------------------------------------------------
# His agreement with you
# ---------------------------------------------------------------------------


def test_your_own_agreement_running_out_is_a_decision(world, balance, client_id):
    player = world.players[client_id]
    player.contract = Contract(wage=5000, expires_week=world.week + 500)
    world.interests.clear()

    record = world.clients[client_id]
    record.agent_contract.expires_week = world.week + AGENT_CONTRACT_NOTICE_WEEKS + 1
    assert "agent_contract_expiring" not in kinds(world, balance)

    record.agent_contract.expires_week = world.week + 3
    decision = find(world, balance, "agent_contract_expiring")
    assert decision is not None
    # Inside a month it is not a nudge any more — that is your income ending.
    assert decision.severity is Severity.CRITICAL


# ---------------------------------------------------------------------------
# Ordering
# ---------------------------------------------------------------------------


def test_worst_and_soonest_first(world, balance, client_id):
    player = world.players[client_id]
    world.interests.clear()
    player.contract = None  # critical
    world.clients[client_id].agent_contract.expires_week = world.week + 10  # action

    ordered = open_decisions(world, balance)
    assert ordered[0].severity is Severity.CRITICAL


def test_every_decision_carries_a_stable_id(world, balance):
    """Stable ids let the UI animate the list without re-keying every week."""
    first = {d.id for d in open_decisions(world, balance)}
    second = {d.id for d in open_decisions(world, balance)}
    assert first == second
