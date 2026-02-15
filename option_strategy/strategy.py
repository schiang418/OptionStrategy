"""Options strategy builder and P&L analysis."""

from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class OptionLeg:
    """A single leg of an options strategy.

    Args:
        option_type: 'call' or 'put'.
        strike: Strike price.
        position: 'long' or 'short'.
        premium: Premium paid (long) or received (short).
        quantity: Number of contracts (default 1).
    """
    option_type: str
    strike: float
    position: str
    premium: float
    quantity: int = 1

    def __post_init__(self):
        if self.option_type not in ("call", "put"):
            raise ValueError(f"option_type must be 'call' or 'put', got '{self.option_type}'")
        if self.position not in ("long", "short"):
            raise ValueError(f"position must be 'long' or 'short', got '{self.position}'")
        if self.quantity < 1:
            raise ValueError(f"quantity must be >= 1, got {self.quantity}")

    @property
    def direction(self) -> int:
        """Return +1 for long, -1 for short."""
        return 1 if self.position == "long" else -1

    def payoff_at_expiry(self, spot: float) -> float:
        """Calculate the payoff of this leg at expiration for a given spot price."""
        if self.option_type == "call":
            intrinsic = max(spot - self.strike, 0.0)
        else:
            intrinsic = max(self.strike - spot, 0.0)
        return self.direction * (intrinsic - self.premium) * self.quantity

    def payoff_array(self, spots: np.ndarray) -> np.ndarray:
        """Calculate payoff across an array of spot prices."""
        if self.option_type == "call":
            intrinsic = np.maximum(spots - self.strike, 0.0)
        else:
            intrinsic = np.maximum(self.strike - spots, 0.0)
        return self.direction * (intrinsic - self.premium) * self.quantity


@dataclass
class PnLResult:
    """Result of a P&L analysis."""
    spots: np.ndarray
    pnl: np.ndarray
    max_profit: float
    max_loss: float
    breakevens: list[float]

    def __str__(self) -> str:
        be_str = ", ".join(f"{b:.2f}" for b in self.breakevens)
        return (f"Max Profit: {self.max_profit:.2f}\n"
                f"Max Loss:   {self.max_loss:.2f}\n"
                f"Breakevens: [{be_str}]")


@dataclass
class Strategy:
    """An options strategy composed of one or more legs.

    Args:
        name: Descriptive name for the strategy.
    """
    name: str
    legs: list[OptionLeg] = field(default_factory=list)

    def add_leg(self, leg: OptionLeg) -> None:
        """Add an option leg to the strategy."""
        self.legs.append(leg)

    @property
    def net_premium(self) -> float:
        """Net premium paid (positive) or received (negative)."""
        return sum(leg.direction * leg.premium * leg.quantity for leg in self.legs)

    def pnl_at_expiry(self, spot_range: Optional[tuple[float, float]] = None,
                      num_points: int = 500) -> PnLResult:
        """Calculate P&L at expiration across a range of spot prices.

        Args:
            spot_range: (min_spot, max_spot) range to analyze. If None, auto-calculated.
            num_points: Number of price points to evaluate.
        """
        if not self.legs:
            raise ValueError("Strategy has no legs")

        if spot_range is None:
            strikes = [leg.strike for leg in self.legs]
            center = sum(strikes) / len(strikes)
            spread = max(strikes) - min(strikes)
            margin = max(spread, center * 0.2)
            spot_range = (center - margin, center + margin)

        spots = np.linspace(spot_range[0], spot_range[1], num_points)
        total_pnl = np.zeros_like(spots)

        for leg in self.legs:
            total_pnl += leg.payoff_array(spots)

        max_profit = float(np.max(total_pnl))
        max_loss = float(np.min(total_pnl))

        breakevens = _find_breakevens(spots, total_pnl)

        return PnLResult(
            spots=spots,
            pnl=total_pnl,
            max_profit=max_profit,
            max_loss=max_loss,
            breakevens=breakevens,
        )

    def __str__(self) -> str:
        lines = [f"Strategy: {self.name}"]
        for i, leg in enumerate(self.legs, 1):
            lines.append(
                f"  Leg {i}: {leg.position.upper()} {leg.quantity}x "
                f"{leg.option_type.upper()} @ {leg.strike:.2f} "
                f"(premium: {leg.premium:.2f})"
            )
        lines.append(f"  Net Premium: {self.net_premium:.2f}")
        return "\n".join(lines)


def _find_breakevens(spots: np.ndarray, pnl: np.ndarray) -> list[float]:
    """Find approximate breakeven points where P&L crosses zero."""
    breakevens = []
    for i in range(len(pnl) - 1):
        if pnl[i] * pnl[i + 1] < 0:
            # Linear interpolation for the zero crossing
            fraction = abs(pnl[i]) / (abs(pnl[i]) + abs(pnl[i + 1]))
            be = spots[i] + fraction * (spots[i + 1] - spots[i])
            breakevens.append(round(float(be), 2))
    return breakevens


# --- Preset strategy constructors ---

def long_call(spot: float, strike: float, premium: float) -> Strategy:
    """Create a long call strategy."""
    s = Strategy("Long Call")
    s.add_leg(OptionLeg("call", strike, "long", premium))
    return s


def long_put(spot: float, strike: float, premium: float) -> Strategy:
    """Create a long put strategy."""
    s = Strategy("Long Put")
    s.add_leg(OptionLeg("put", strike, "long", premium))
    return s


def bull_call_spread(spot: float, lower_strike: float, upper_strike: float,
                     lower_premium: float, upper_premium: float) -> Strategy:
    """Create a bull call spread (buy lower strike call, sell upper strike call)."""
    s = Strategy("Bull Call Spread")
    s.add_leg(OptionLeg("call", lower_strike, "long", lower_premium))
    s.add_leg(OptionLeg("call", upper_strike, "short", upper_premium))
    return s


def bear_put_spread(spot: float, lower_strike: float, upper_strike: float,
                    lower_premium: float, upper_premium: float) -> Strategy:
    """Create a bear put spread (buy upper strike put, sell lower strike put)."""
    s = Strategy("Bear Put Spread")
    s.add_leg(OptionLeg("put", upper_strike, "long", upper_premium))
    s.add_leg(OptionLeg("put", lower_strike, "short", lower_premium))
    return s


def straddle(spot: float, strike: float,
             call_premium: float, put_premium: float) -> Strategy:
    """Create a long straddle (buy call and put at same strike)."""
    s = Strategy("Long Straddle")
    s.add_leg(OptionLeg("call", strike, "long", call_premium))
    s.add_leg(OptionLeg("put", strike, "long", put_premium))
    return s


def strangle(spot: float, call_strike: float, put_strike: float,
             call_premium: float, put_premium: float) -> Strategy:
    """Create a long strangle (buy OTM call and OTM put)."""
    s = Strategy("Long Strangle")
    s.add_leg(OptionLeg("call", call_strike, "long", call_premium))
    s.add_leg(OptionLeg("put", put_strike, "long", put_premium))
    return s


def iron_condor(spot: float, put_lower: float, put_upper: float,
                call_lower: float, call_upper: float,
                put_lower_prem: float, put_upper_prem: float,
                call_lower_prem: float, call_upper_prem: float) -> Strategy:
    """Create an iron condor.

    Sell the inner strikes (put_upper, call_lower), buy the outer (put_lower, call_upper).
    """
    s = Strategy("Iron Condor")
    s.add_leg(OptionLeg("put", put_lower, "long", put_lower_prem))
    s.add_leg(OptionLeg("put", put_upper, "short", put_upper_prem))
    s.add_leg(OptionLeg("call", call_lower, "short", call_lower_prem))
    s.add_leg(OptionLeg("call", call_upper, "long", call_upper_prem))
    return s


def butterfly_spread(spot: float, lower: float, middle: float, upper: float,
                     lower_prem: float, middle_prem: float,
                     upper_prem: float) -> Strategy:
    """Create a long call butterfly spread."""
    s = Strategy("Butterfly Spread")
    s.add_leg(OptionLeg("call", lower, "long", lower_prem))
    s.add_leg(OptionLeg("call", middle, "short", middle_prem, quantity=2))
    s.add_leg(OptionLeg("call", upper, "long", upper_prem))
    return s
