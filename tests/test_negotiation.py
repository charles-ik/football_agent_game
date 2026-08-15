import random

import pytest

from football_agent.engine.balance import load_balance
from football_agent.engine.systems import negotiation as neg


@pytest.fixture
def balance():
    return load_balance()


def make(threshold, balance, seed=1):
    return neg.Negotiation.create(threshold, random.Random(seed), balance, subject="test")


def test_offer_below_threshold_is_accepted(balance):
    n = make(0.6, balance)
    response = n.propose(0.5)
    assert response.status is neg.Status.ACCEPTED
    assert n.agreed_x == pytest.approx(0.5)


def test_massive_overreach_always_walks(balance):
    for seed in range(20):
        n = make(0.3, balance, seed)
        response = n.propose(1.0)
        assert response.status is neg.Status.WALKED


def test_small_overreach_produces_a_counter(balance):
    n = make(0.6, balance, seed=3)
    response = n.propose(0.63)
    assert response.status is neg.Status.OPEN
    assert response.counter_x is not None
    assert response.counter_x < n.threshold


def test_counters_converge_on_the_true_limit(balance):
    """Holding out is worth money — their counter improves each round."""
    n = make(0.7, balance, seed=99)
    counters = []
    while n.is_open and n.rounds_left > 0:
        response = n.propose(0.72)
        if response.counter_x is None:
            break
        counters.append(response.counter_x)
        if response.status is not neg.Status.OPEN:
            break
    assert len(counters) >= 2
    assert counters == sorted(counters), "counters should improve, not regress"
    assert counters[-1] <= n.threshold + 1e-9


def test_rounds_are_bounded(balance):
    n = make(0.5, balance, seed=7)
    for _ in range(10):
        if not n.is_open:
            break
        n.propose(0.52)
    assert n.status is not neg.Status.OPEN
    assert n.round <= n.max_rounds


def test_accept_counter_closes_the_deal(balance):
    n = make(0.6, balance, seed=11)
    response = n.propose(0.65)
    if response.counter_x is not None and n.status in (neg.Status.OPEN, neg.Status.EXHAUSTED):
        result = n.accept_counter()
        assert result.status is neg.Status.ACCEPTED
        assert n.agreed_x == pytest.approx(response.counter_x)


def test_reputation_raises_the_signing_threshold(balance):
    low = neg.signing_threshold(balance, 10, "professional")
    high = neg.signing_threshold(balance, 90, "professional")
    assert high > low
    assert neg.pct_from_x(balance, high) > neg.pct_from_x(balance, low)


def test_pct_roundtrip(balance):
    for pct in (0.03, 0.08, 0.12, 0.20):
        assert neg.pct_from_x(balance, neg.x_from_pct(balance, pct)) == pytest.approx(pct)


def test_pushing_late_is_riskier_than_pushing_early(balance):
    """Irritation compounds — the same overreach must be more dangerous in round 3."""
    overreach = 0.20
    threshold = 0.5

    def walk_rate(round_to_push):
        walks = 0
        trials = 600
        for seed in range(trials):
            n = make(threshold, balance, seed)
            # Burn earlier rounds with a tiny, safe overreach.
            for _ in range(round_to_push - 1):
                if not n.is_open:
                    break
                n.propose(threshold + 0.005)
            if n.is_open:
                if n.propose(threshold + overreach).status is neg.Status.WALKED:
                    walks += 1
            else:
                walks += 1
        return walks / trials

    assert walk_rate(3) > walk_rate(1)


def test_not_trivially_solvable_always_max(balance):
    """The greedy 'always ask the ceiling' policy must not dominate.

    If this ever passes trivially, the walk-away risk has stopped biting and the
    whole mechanic is decoration.
    """
    threshold = 0.55
    greedy_value = 0.0
    greedy_deals = 0
    for seed in range(400):
        n = make(threshold, balance, seed)
        response = n.propose(1.0)
        if response.status is neg.Status.ACCEPTED:
            greedy_deals += 1
            greedy_value += response.agreed_x

    # Ask just over the (unknown) threshold, then take the counter.
    probe_value = 0.0
    probe_deals = 0
    for seed in range(400):
        n = make(threshold, balance, seed)
        response = n.propose(0.60)
        if response.status is neg.Status.ACCEPTED:
            probe_deals += 1
            probe_value += response.agreed_x
        elif response.counter_x is not None and n.status in (neg.Status.OPEN, neg.Status.EXHAUSTED):
            result = n.accept_counter()
            probe_deals += 1
            probe_value += result.agreed_x

    assert greedy_deals == 0, "asking the ceiling should never land"
    assert probe_deals > 350, "a measured probe should almost always land something"
    assert probe_value > greedy_value
