# OptionStrategy

A Python library for options strategy analysis, pricing, and P&L visualization.

## Features

- **Black-Scholes option pricing** with Greeks (delta, gamma, theta, vega, rho)
- **Strategy builder** supporting common strategies:
  - Single calls/puts (long and short)
  - Vertical spreads (bull call, bear put, etc.)
  - Straddles and strangles
  - Iron condors and butterflies
  - Custom multi-leg strategies
- **P&L analysis** at expiration and before expiration
- **Command-line interface** for quick analysis

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Command Line

```bash
# Analyze a bull call spread
python -m option_strategy --strategy bull_call_spread \
    --spot 100 --strikes 95 110 --expiry 30 \
    --volatility 0.25 --rate 0.05

# Analyze a single call option
python -m option_strategy --strategy long_call \
    --spot 100 --strikes 105 --expiry 45 \
    --volatility 0.30 --rate 0.05
```

### Python API

```python
from option_strategy.pricing import BlackScholes
from option_strategy.strategy import Strategy, OptionLeg

# Price a single option
bs = BlackScholes(spot=100, strike=105, expiry_days=30, volatility=0.25, rate=0.05)
print(f"Call price: {bs.call_price():.2f}")
print(f"Delta: {bs.delta('call'):.4f}")

# Build a bull call spread
strategy = Strategy("Bull Call Spread")
strategy.add_leg(OptionLeg("call", strike=95, position="long", premium=8.50))
strategy.add_leg(OptionLeg("call", strike=110, position="short", premium=2.30))

# Analyze P&L
pnl = strategy.pnl_at_expiry(spot_range=(80, 130))
print(f"Max profit: {pnl.max_profit:.2f}")
print(f"Max loss: {pnl.max_loss:.2f}")
print(f"Breakeven: {pnl.breakevens}")
```

## Running Tests

```bash
python -m pytest tests/
```
