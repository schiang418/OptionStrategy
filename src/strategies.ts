/**
 * Strategy configuration.
 *
 * Each strategy defines a scan type on Option Samurai and how the app
 * should display / manage it. To add a new strategy, just add another
 * entry here and implement the corresponding backend logic.
 */

export interface Strategy {
  id: string;
  name: string;
  shortName: string;
  description: string;
  scanName: string;            // name of the scan on Option Samurai
  color: string;               // accent color for this strategy
  enabled: boolean;            // false = show as "coming soon"
  tradesPerPortfolio: number;  // number of top trades to include per portfolio
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'bi-weekly-income',
    name: 'Bi-Weekly Income',
    shortName: 'Bi-Weekly',
    description: 'Credit put spreads with 2-week expiration for steady income',
    scanName: 'bi-weekly income all',
    color: '#4f8ff7',
    enabled: true,
    tradesPerPortfolio: 5,
  },
  {
    id: 'yearly-income',
    name: 'Yearly Income',
    shortName: 'Yearly',
    description: 'Long-term credit put spreads held until expiration for annual income',
    scanName: 'yearly income all',
    color: '#f59e0b',
    enabled: true,
    tradesPerPortfolio: 2,
  },
  {
    id: 'weekly-income',
    name: 'Weekly Income',
    shortName: 'Weekly',
    description: 'Short-term credit spreads with weekly expiration',
    scanName: 'weekly income all',
    color: '#22c55e',
    enabled: false,
    tradesPerPortfolio: 5,
  },
  {
    id: 'monthly-income',
    name: 'Monthly Income',
    shortName: 'Monthly',
    description: 'Conservative credit spreads with monthly expiration',
    scanName: 'monthly income all',
    color: '#f59e0b',
    enabled: false,
    tradesPerPortfolio: 5,
  },
];

export function getStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find(s => s.id === id);
}

export function getEnabledStrategies(): Strategy[] {
  return STRATEGIES.filter(s => s.enabled);
}

export const DEFAULT_STRATEGY = STRATEGIES[0];
