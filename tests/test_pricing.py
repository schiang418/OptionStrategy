"""Tests for the Black-Scholes pricing model."""

import math
import pytest
from option_strategy.pricing import BlackScholes


def test_call_price_atm():
    """ATM call should have a reasonable price."""
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    price = bs.call_price()
    assert 2.0 < price < 6.0


def test_put_price_atm():
    """ATM put should have a reasonable price."""
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    price = bs.put_price()
    assert 2.0 < price < 6.0


def test_put_call_parity():
    """Put-call parity: C - P = S - K * e^(-rT)."""
    bs = BlackScholes(spot=100, strike=105, expiry_days=60, volatility=0.30, rate=0.05)
    call = bs.call_price()
    put = bs.put_price()
    t = bs.time_to_expiry
    parity = bs.spot - bs.strike * math.exp(-bs.rate * t)
    assert abs((call - put) - parity) < 1e-8


def test_deep_itm_call():
    """Deep ITM call should be close to intrinsic value."""
    bs = BlackScholes(spot=150, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    price = bs.call_price()
    assert price > 49.0


def test_deep_otm_call():
    """Deep OTM call should be near zero."""
    bs = BlackScholes(spot=50, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    price = bs.call_price()
    assert price < 0.01


def test_expired_call():
    """Expired call should return intrinsic value."""
    bs = BlackScholes(spot=110, strike=100, expiry_days=0, volatility=0.25, rate=0.05)
    assert bs.call_price() == 10.0


def test_expired_put():
    """Expired put should return intrinsic value."""
    bs = BlackScholes(spot=90, strike=100, expiry_days=0, volatility=0.25, rate=0.05)
    assert bs.put_price() == 10.0


def test_delta_call_range():
    """Call delta should be between 0 and 1."""
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    d = bs.delta("call")
    assert 0.0 < d < 1.0


def test_delta_put_range():
    """Put delta should be between -1 and 0."""
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    d = bs.delta("put")
    assert -1.0 < d < 0.0


def test_gamma_positive():
    """Gamma should always be positive."""
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    assert bs.gamma() > 0.0


def test_vega_positive():
    """Vega should always be positive."""
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    assert bs.vega() > 0.0


def test_theta_call_negative():
    """Call theta should generally be negative (time decay)."""
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    assert bs.theta("call") < 0.0


def test_greeks_dict():
    """Greeks should return a dict with all five Greeks."""
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    g = bs.greeks("call")
    assert set(g.keys()) == {"delta", "gamma", "theta", "vega", "rho"}


def test_summary_includes_price():
    """Summary should include price plus all Greeks."""
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    s = bs.summary("call")
    assert "price" in s
    assert len(s) == 6


def test_invalid_option_type():
    bs = BlackScholes(spot=100, strike=100, expiry_days=30, volatility=0.25, rate=0.05)
    with pytest.raises(ValueError):
        bs.price("invalid")
