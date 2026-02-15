"""CLI entry point for OptionStrategy."""

import argparse
import sys

from option_strategy.pricing import BlackScholes
from option_strategy import strategy as strat


STRATEGIES = {
    "long_call": "Long Call",
    "long_put": "Long Put",
    "bull_call_spread": "Bull Call Spread",
    "bear_put_spread": "Bear Put Spread",
    "straddle": "Long Straddle",
    "strangle": "Long Strangle",
    "iron_condor": "Iron Condor",
    "butterfly": "Butterfly Spread",
}


def build_strategy(args) -> strat.Strategy:
    """Build a strategy from CLI arguments using Black-Scholes pricing."""
    bs_models = []
    for strike in args.strikes:
        bs_models.append(BlackScholes(
            spot=args.spot,
            strike=strike,
            expiry_days=args.expiry,
            volatility=args.volatility,
            rate=args.rate,
        ))

    name = args.strategy
    strikes = args.strikes

    if name == "long_call":
        premium = bs_models[0].call_price()
        return strat.long_call(args.spot, strikes[0], premium)

    elif name == "long_put":
        premium = bs_models[0].put_price()
        return strat.long_put(args.spot, strikes[0], premium)

    elif name == "bull_call_spread":
        if len(strikes) < 2:
            print("Error: bull_call_spread requires 2 strikes", file=sys.stderr)
            sys.exit(1)
        p1 = bs_models[0].call_price()
        p2 = bs_models[1].call_price()
        return strat.bull_call_spread(args.spot, strikes[0], strikes[1], p1, p2)

    elif name == "bear_put_spread":
        if len(strikes) < 2:
            print("Error: bear_put_spread requires 2 strikes", file=sys.stderr)
            sys.exit(1)
        p1 = bs_models[0].put_price()
        p2 = bs_models[1].put_price()
        return strat.bear_put_spread(args.spot, strikes[0], strikes[1], p1, p2)

    elif name == "straddle":
        call_prem = bs_models[0].call_price()
        put_prem = bs_models[0].put_price()
        return strat.straddle(args.spot, strikes[0], call_prem, put_prem)

    elif name == "strangle":
        if len(strikes) < 2:
            print("Error: strangle requires 2 strikes", file=sys.stderr)
            sys.exit(1)
        call_prem = bs_models[1].call_price()
        put_prem = bs_models[0].put_price()
        return strat.strangle(args.spot, strikes[1], strikes[0], call_prem, put_prem)

    elif name == "iron_condor":
        if len(strikes) < 4:
            print("Error: iron_condor requires 4 strikes "
                  "(put_lower put_upper call_lower call_upper)", file=sys.stderr)
            sys.exit(1)
        prems = [
            bs_models[0].put_price(),
            bs_models[1].put_price(),
            bs_models[2].call_price(),
            bs_models[3].call_price(),
        ]
        return strat.iron_condor(
            args.spot,
            strikes[0], strikes[1], strikes[2], strikes[3],
            prems[0], prems[1], prems[2], prems[3],
        )

    elif name == "butterfly":
        if len(strikes) < 3:
            print("Error: butterfly requires 3 strikes", file=sys.stderr)
            sys.exit(1)
        prems = [bs.call_price() for bs in bs_models[:3]]
        return strat.butterfly_spread(
            args.spot, strikes[0], strikes[1], strikes[2],
            prems[0], prems[1], prems[2],
        )

    else:
        print(f"Error: unknown strategy '{name}'", file=sys.stderr)
        print(f"Available: {', '.join(STRATEGIES.keys())}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        prog="option_strategy",
        description="Options strategy analysis tool",
    )
    parser.add_argument(
        "--strategy", "-s", required=True,
        choices=list(STRATEGIES.keys()),
        help="Strategy type to analyze",
    )
    parser.add_argument(
        "--spot", type=float, required=True,
        help="Current spot price of the underlying",
    )
    parser.add_argument(
        "--strikes", type=float, nargs="+", required=True,
        help="Strike price(s) for the strategy",
    )
    parser.add_argument(
        "--expiry", type=float, required=True,
        help="Days until expiration",
    )
    parser.add_argument(
        "--volatility", "-v", type=float, default=0.25,
        help="Annualized volatility (default: 0.25)",
    )
    parser.add_argument(
        "--rate", "-r", type=float, default=0.05,
        help="Risk-free interest rate (default: 0.05)",
    )
    parser.add_argument(
        "--greeks", action="store_true",
        help="Show Greeks for each leg",
    )

    args = parser.parse_args()
    strategy = build_strategy(args)

    print("=" * 50)
    print(strategy)
    print("=" * 50)

    pnl = strategy.pnl_at_expiry()
    print(f"\nP&L at Expiry:")
    print(pnl)

    if args.greeks:
        print(f"\nGreeks per leg:")
        for i, leg in enumerate(strategy.legs, 1):
            bs = BlackScholes(args.spot, leg.strike, args.expiry,
                              args.volatility, args.rate)
            greeks = bs.greeks(leg.option_type)
            sign = "+" if leg.position == "long" else "-"
            print(f"  Leg {i} ({sign}{leg.option_type.upper()} @ {leg.strike}):")
            for name, val in greeks.items():
                print(f"    {name:>6}: {val:+.4f}")


if __name__ == "__main__":
    main()
