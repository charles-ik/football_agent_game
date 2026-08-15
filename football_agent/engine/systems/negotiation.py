"""The bounded-haggle negotiation resolver.

One resolver, two uses:

* **Signing** (agent <-> player) — what commission percentage you take.
* **Club deal** (agent <-> club) — wage, fee and contract length.

Both collapse to a single normalised axis ``x`` in [0, 1] where higher is better
for the agent and worse for the counterparty. The counterparty has a hidden
acceptance threshold ``t``; reputation shifts ``t`` in your favour.

The tension is deliberate: each extra round drags their counter closer to their
true limit, but irritation compounds, so pushing late is where deals die. That
walk-away risk is what stops "always propose the maximum" being a solved
strategy — without it the whole mechanic collapses.

Negotiations are transient: they resolve inside a single interaction, so they are
never part of saved world state.
"""

from __future__ import annotations

import enum
import random
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from ..balance import Balance


class Status(str, enum.Enum):
    OPEN = "open"
    ACCEPTED = "accepted"
    WALKED = "walked"        # they walked away
    EXHAUSTED = "exhausted"  # rounds used up; their last counter is on the table
    ABANDONED = "abandoned"  # you walked away


@dataclass
class Response:
    status: Status
    round: int
    hint: str
    counter_x: Optional[float] = None
    agreed_x: Optional[float] = None


@dataclass
class Negotiation:
    """A live haggle over one normalised axis.

    ``threshold`` is hidden from the caller by convention — the CLI and bots only
    ever see hints and counters, never ``t`` itself.
    """

    threshold: float
    rng: random.Random
    balance: Balance
    subject: str = ""
    max_rounds: int = 3
    round: int = 0
    status: Status = Status.OPEN
    last_counter: Optional[float] = None
    agreed_x: Optional[float] = None
    history: List[Response] = field(default_factory=list)
    context_kind: str = ""
    context_id: int = 0
    # Fired once, the first time you actually put a number on the table. This is
    # what makes opening a negotiation a commitment rather than a free probe —
    # without it you could re-roll a walk-away and the risk would be fictional.
    on_first_propose: Optional[Callable[[], None]] = None

    @classmethod
    def create(
        cls,
        threshold: float,
        rng: random.Random,
        balance: Balance,
        subject: str = "",
        context_kind: str = "",
        context_id: int = 0,
        on_first_propose: Optional[Callable[[], None]] = None,
    ) -> "Negotiation":
        return cls(
            threshold=_clamp(threshold),
            rng=rng,
            balance=balance,
            subject=subject,
            max_rounds=balance.i("negotiation.max_rounds"),
            context_kind=context_kind,
            context_id=context_id,
            on_first_propose=on_first_propose,
        )

    # ---- driving the haggle ------------------------------------------
    @property
    def rounds_left(self) -> int:
        return max(0, self.max_rounds - self.round)

    @property
    def is_open(self) -> bool:
        return self.status == Status.OPEN

    def propose(self, x: float) -> Response:
        if self.status != Status.OPEN:
            raise ValueError(f"Negotiation is {self.status.value}, cannot propose.")

        if self.round == 0 and self.on_first_propose is not None:
            self.on_first_propose()

        x = _clamp(x)
        self.round += 1
        overreach = x - self.threshold

        if overreach <= 0:
            self.status = Status.ACCEPTED
            self.agreed_x = x
            return self._record(
                Response(Status.ACCEPTED, self.round, "Agreed. Hands shaken.", agreed_x=x)
            )

        if self._walks(overreach):
            self.status = Status.WALKED
            return self._record(
                Response(
                    Status.WALKED,
                    self.round,
                    "That was too much. They've walked away.",
                    counter_x=self.last_counter,
                )
            )

        self.last_counter = self._counter()
        hint = self._hint(overreach)
        if self.round >= self.max_rounds:
            self.status = Status.EXHAUSTED
            return self._record(
                Response(
                    Status.EXHAUSTED,
                    self.round,
                    hint + " Final offer — take it or leave it.",
                    counter_x=self.last_counter,
                )
            )

        return self._record(Response(Status.OPEN, self.round, hint, counter_x=self.last_counter))

    def accept_counter(self) -> Response:
        """Take what's on the table rather than push again."""
        if self.last_counter is None:
            raise ValueError("No counter-offer to accept.")
        if self.status not in (Status.OPEN, Status.EXHAUSTED):
            raise ValueError(f"Negotiation is {self.status.value}.")
        self.status = Status.ACCEPTED
        self.agreed_x = self.last_counter
        return self._record(
            Response(Status.ACCEPTED, self.round, "You took their terms.", agreed_x=self.agreed_x)
        )

    def abandon(self) -> Response:
        self.status = Status.ABANDONED
        return self._record(Response(Status.ABANDONED, self.round, "You walked away."))

    # ---- internals -----------------------------------------------------
    def _walks(self, overreach: float) -> bool:
        """Risk grows with the square of overreach and compounds each round."""
        limit = self.balance.f("negotiation.walkaway_base")
        if overreach > limit:
            return True
        irritation = self.balance.f("negotiation.irritation_per_round") * self.round
        chance = ((overreach / limit) ** 2) * irritation
        return self.rng.random() < min(0.95, chance)

    def _counter(self) -> float:
        """Their counter converges on their true limit as rounds pass.

        Round 1 they lowball; by the final round they are offering their actual
        threshold. Holding out is worth money — if they don't walk first.
        """
        concession = self.balance.f("negotiation.counter_concession")
        progress = self.round / max(1, self.max_rounds)
        return _clamp(self.threshold * (1.0 - concession * (1.0 - progress)))

    def _hint(self, overreach: float) -> str:
        near, mid, far = self.balance.l("negotiation.hint_bands")
        if overreach <= near:
            return "They're wavering — you're close."
        if overreach <= mid:
            return "Unimpressed, but still talking."
        if overreach <= far:
            return "That got a scoff."
        return "They're visibly angry. One more like that and they're gone."

    def _record(self, response: Response) -> Response:
        self.history.append(response)
        return response


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


# ---------------------------------------------------------------------------
# Threshold construction
# ---------------------------------------------------------------------------


def negotiation_bias(seed: int, subject_id: int, balance: Balance) -> float:
    """A hidden, stable quirk in one counterparty's threshold.

    Without this, a player's acceptance point is a pure function of your
    reputation and his (visible) personality — computable, and therefore the
    haggle would be solved arithmetic rather than a judgement call. The bias is
    derived from the seed so it stays consistent for that person all game.
    """
    from ..rng import stream

    spread = balance.f("negotiation.hidden_bias")
    return stream(seed, 0, "negotiation_bias", str(subject_id)).uniform(-spread, spread)


def signing_threshold(
    balance: Balance, reputation: float, trait_value: str, bias: float = 0.0
) -> float:
    """How much commission a player will concede, as a fraction of the pct band.

    Reputation is the whole lever here: a nobody scrapes 7%, a household name
    takes 16% of the same deal.
    """
    base = balance.f("signing.base_threshold_pct")
    rep_bonus = balance.f("signing.reputation_bonus_pct") * (reputation / 100.0)
    trait_mod = float(balance.d("signing.trait_threshold_mod").get(trait_value, 0.0))
    pct = base + rep_bonus + trait_mod

    lo = balance.f("commission.min_pct")
    hi = balance.f("commission.max_pct")
    return _clamp((pct - lo) / (hi - lo) + bias)


def commission_guide(balance: Balance, reputation: float, trait_value: str) -> tuple:
    """The band an agent of this standing can *expect* to command, as percentages.

    Shown to the player instead of the hidden threshold. You still have to pick a
    number inside it, and the counterparty's quirk decides whether you were right.
    """
    centre = signing_threshold(balance, reputation, trait_value)
    spread = balance.f("negotiation.hidden_bias")
    return (
        pct_from_x(balance, max(0.0, centre - spread)),
        pct_from_x(balance, min(1.0, centre + spread)),
    )


def pct_from_x(balance: Balance, x: float) -> float:
    lo = balance.f("commission.min_pct")
    hi = balance.f("commission.max_pct")
    return lo + _clamp(x) * (hi - lo)


def x_from_pct(balance: Balance, pct: float) -> float:
    lo = balance.f("commission.min_pct")
    hi = balance.f("commission.max_pct")
    return _clamp((pct - lo) / (hi - lo))


def deal_threshold(balance: Balance, reputation: float, bias: float = 0.0) -> float:
    """A club's tolerance for an aggressive package.

    Exactly meeting their stated ceiling sits at the neutral point; reputation
    moves it either side, which is why big clubs ignore unknown agents. The bias
    is that club's hidden quirk, so the same reputation doesn't always buy the
    same latitude.
    """
    factor = balance.f("transfers.wage_offer_ceiling_factor")
    neutral = 1.0 / factor
    shift = balance.f("negotiation.club_reputation_weight") * ((reputation / 100.0) - 0.5)
    return _clamp(neutral + shift + bias)


def deal_guide(balance: Balance, reputation: float) -> tuple:
    """The package aggression band a club of this size will usually tolerate."""
    centre = deal_threshold(balance, reputation)
    spread = balance.f("negotiation.hidden_bias")
    return (max(0.0, centre - spread), min(1.0, centre + spread))


def package_to_x(balance: Balance, wage: float, fee: float, max_wage: float, max_fee: float) -> float:
    """Collapse a (wage, fee) package into one aggression number."""
    factor = balance.f("transfers.wage_offer_ceiling_factor")
    wage_ceiling = max(1.0, max_wage * factor)
    fee_ceiling = max(1.0, max_fee * factor)
    wage_part = _clamp(wage / wage_ceiling)
    fee_part = _clamp(fee / fee_ceiling)
    if max_fee <= 0:
        return wage_part
    return 0.5 * wage_part + 0.5 * fee_part


def x_to_package(balance: Balance, x: float, max_wage: float, max_fee: float) -> tuple:
    """Inverse of :func:`package_to_x`, splitting an aggression number evenly."""
    factor = balance.f("transfers.wage_offer_ceiling_factor")
    wage_ceiling = max(1.0, max_wage * factor)
    fee_ceiling = max(1.0, max_fee * factor)
    if max_fee <= 0:
        return (round(_clamp(x) * wage_ceiling, -1), 0.0)
    return (round(_clamp(x) * wage_ceiling, -1), round(_clamp(x) * fee_ceiling, -3))
