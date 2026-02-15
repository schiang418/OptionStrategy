"""Black-Scholes option pricing model with Greeks."""

import math
from scipy.stats import norm


class BlackScholes:
    """Black-Scholes option pricing model.

    Args:
        spot: Current price of the underlying asset.
        strike: Strike price of the option.
        expiry_days: Days until expiration.
        volatility: Annualized volatility (e.g., 0.25 for 25%).
        rate: Risk-free interest rate (e.g., 0.05 for 5%).
    """

    def __init__(self, spot: float, strike: float, expiry_days: float,
                 volatility: float, rate: float = 0.05):
        self.spot = spot
        self.strike = strike
        self.expiry_days = expiry_days
        self.volatility = volatility
        self.rate = rate
        self._time_to_expiry = expiry_days / 365.0

    @property
    def time_to_expiry(self) -> float:
        return self._time_to_expiry

    def _d1(self) -> float:
        t = self.time_to_expiry
        if t <= 0:
            return float('inf') if self.spot > self.strike else float('-inf')
        return (math.log(self.spot / self.strike) +
                (self.rate + 0.5 * self.volatility ** 2) * t) / \
               (self.volatility * math.sqrt(t))

    def _d2(self) -> float:
        t = self.time_to_expiry
        if t <= 0:
            return self._d1()
        return self._d1() - self.volatility * math.sqrt(t)

    def call_price(self) -> float:
        """Calculate the theoretical call option price."""
        t = self.time_to_expiry
        if t <= 0:
            return max(self.spot - self.strike, 0.0)
        d1, d2 = self._d1(), self._d2()
        return (self.spot * norm.cdf(d1) -
                self.strike * math.exp(-self.rate * t) * norm.cdf(d2))

    def put_price(self) -> float:
        """Calculate the theoretical put option price."""
        t = self.time_to_expiry
        if t <= 0:
            return max(self.strike - self.spot, 0.0)
        d1, d2 = self._d1(), self._d2()
        return (self.strike * math.exp(-self.rate * t) * norm.cdf(-d2) -
                self.spot * norm.cdf(-d1))

    def price(self, option_type: str) -> float:
        """Calculate option price by type ('call' or 'put')."""
        if option_type == "call":
            return self.call_price()
        elif option_type == "put":
            return self.put_price()
        raise ValueError(f"option_type must be 'call' or 'put', got '{option_type}'")

    def delta(self, option_type: str) -> float:
        """Calculate delta (sensitivity to underlying price)."""
        t = self.time_to_expiry
        if t <= 0:
            if option_type == "call":
                return 1.0 if self.spot > self.strike else 0.0
            return -1.0 if self.spot < self.strike else 0.0
        d1 = self._d1()
        if option_type == "call":
            return norm.cdf(d1)
        elif option_type == "put":
            return norm.cdf(d1) - 1.0
        raise ValueError(f"option_type must be 'call' or 'put', got '{option_type}'")

    def gamma(self) -> float:
        """Calculate gamma (rate of change of delta)."""
        t = self.time_to_expiry
        if t <= 0:
            return 0.0
        d1 = self._d1()
        return norm.pdf(d1) / (self.spot * self.volatility * math.sqrt(t))

    def theta(self, option_type: str) -> float:
        """Calculate theta (time decay per day)."""
        t = self.time_to_expiry
        if t <= 0:
            return 0.0
        d1, d2 = self._d1(), self._d2()
        common = -(self.spot * norm.pdf(d1) * self.volatility) / \
                 (2.0 * math.sqrt(t))
        if option_type == "call":
            annual = common - self.rate * self.strike * \
                     math.exp(-self.rate * t) * norm.cdf(d2)
        elif option_type == "put":
            annual = common + self.rate * self.strike * \
                     math.exp(-self.rate * t) * norm.cdf(-d2)
        else:
            raise ValueError(f"option_type must be 'call' or 'put', got '{option_type}'")
        return annual / 365.0

    def vega(self) -> float:
        """Calculate vega (sensitivity to volatility, per 1% change)."""
        t = self.time_to_expiry
        if t <= 0:
            return 0.0
        d1 = self._d1()
        return self.spot * norm.pdf(d1) * math.sqrt(t) / 100.0

    def rho(self, option_type: str) -> float:
        """Calculate rho (sensitivity to interest rate, per 1% change)."""
        t = self.time_to_expiry
        if t <= 0:
            return 0.0
        d2 = self._d2()
        if option_type == "call":
            return self.strike * t * math.exp(-self.rate * t) * \
                   norm.cdf(d2) / 100.0
        elif option_type == "put":
            return -self.strike * t * math.exp(-self.rate * t) * \
                   norm.cdf(-d2) / 100.0
        raise ValueError(f"option_type must be 'call' or 'put', got '{option_type}'")

    def greeks(self, option_type: str) -> dict:
        """Calculate all Greeks for the given option type."""
        return {
            "delta": self.delta(option_type),
            "gamma": self.gamma(),
            "theta": self.theta(option_type),
            "vega": self.vega(),
            "rho": self.rho(option_type),
        }

    def summary(self, option_type: str) -> dict:
        """Full pricing summary including price and all Greeks."""
        return {
            "price": self.price(option_type),
            **self.greeks(option_type),
        }
