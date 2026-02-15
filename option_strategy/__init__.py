"""OptionStrategy - Options strategy analysis and pricing library."""

from option_strategy.pricing import BlackScholes
from option_strategy.strategy import Strategy, OptionLeg

__version__ = "0.1.0"
__all__ = ["BlackScholes", "Strategy", "OptionLeg"]
