"""Tests for the strategy builder and P&L analysis."""

import pytest
from option_strategy.strategy import (
    OptionLeg, Strategy,
    long_call, long_put, bull_call_spread, bear_put_spread,
    straddle, strangle, iron_condor, butterfly_spread,
)


def test_option_leg_invalid_type():
    with pytest.raises(ValueError):
        OptionLeg("future", 100, "long", 5.0)


def test_option_leg_invalid_position():
    with pytest.raises(ValueError):
        OptionLeg("call", 100, "neutral", 5.0)


def test_long_call_payoff():
    leg = OptionLeg("call", 100, "long", 5.0)
    # At spot=110: intrinsic=10, profit=10-5=5
    assert leg.payoff_at_expiry(110) == 5.0
    # At spot=90: intrinsic=0, loss=-5
    assert leg.payoff_at_expiry(90) == -5.0


def test_short_call_payoff():
    leg = OptionLeg("call", 100, "short", 5.0)
    # At spot=110: -1 * (10 - 5) = -5
    assert leg.payoff_at_expiry(110) == -5.0
    # At spot=90: -1 * (0 - 5) = 5
    assert leg.payoff_at_expiry(90) == 5.0


def test_long_put_payoff():
    leg = OptionLeg("put", 100, "long", 4.0)
    # At spot=90: intrinsic=10, profit=10-4=6
    assert leg.payoff_at_expiry(90) == 6.0
    # At spot=110: intrinsic=0, loss=-4
    assert leg.payoff_at_expiry(110) == -4.0


def test_strategy_net_premium():
    s = Strategy("Test")
    s.add_leg(OptionLeg("call", 95, "long", 8.0))   # pay 8
    s.add_leg(OptionLeg("call", 110, "short", 2.0))  # receive 2
    assert s.net_premium == 6.0  # net debit of 6


def test_bull_call_spread_pnl():
    s = bull_call_spread(100, 95, 110, 8.0, 2.0)
    pnl = s.pnl_at_expiry(spot_range=(80, 130))
    # Max profit: (110-95) - net_premium = 15 - 6 = 9
    assert abs(pnl.max_profit - 9.0) < 0.1
    # Max loss: -net_premium = -6
    assert abs(pnl.max_loss - (-6.0)) < 0.1
    # Should have one breakeven
    assert len(pnl.breakevens) == 1


def test_straddle_has_two_breakevens():
    s = straddle(100, 100, 5.0, 5.0)
    pnl = s.pnl_at_expiry(spot_range=(70, 130))
    assert len(pnl.breakevens) == 2


def test_long_call_max_loss():
    s = long_call(100, 105, 3.0)
    pnl = s.pnl_at_expiry(spot_range=(80, 130))
    # Max loss is limited to premium paid
    assert abs(pnl.max_loss - (-3.0)) < 0.1


def test_long_put_max_loss():
    s = long_put(100, 95, 2.5)
    pnl = s.pnl_at_expiry(spot_range=(70, 120))
    assert abs(pnl.max_loss - (-2.5)) < 0.1


def test_iron_condor_max_profit():
    s = iron_condor(100, 85, 90, 110, 115, 0.5, 2.0, 2.0, 0.5)
    pnl = s.pnl_at_expiry(spot_range=(70, 140))
    # Net credit = (2.0 + 2.0) - (0.5 + 0.5) = 3.0
    assert abs(pnl.max_profit - 3.0) < 0.1


def test_strategy_no_legs_raises():
    s = Strategy("Empty")
    with pytest.raises(ValueError):
        s.pnl_at_expiry()


def test_strategy_str():
    s = long_call(100, 105, 3.0)
    text = str(s)
    assert "Long Call" in text
    assert "LONG" in text


def test_pnl_result_str():
    s = long_call(100, 105, 3.0)
    pnl = s.pnl_at_expiry()
    text = str(pnl)
    assert "Max Profit" in text
    assert "Max Loss" in text
    assert "Breakevens" in text
