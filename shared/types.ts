/**
 * Shared types between server and client.
 *
 * CONVENTIONS:
 *   - All monetary values are integers in **cents** (dollars × 100).
 *   - All percentage values are integers in **basis points** (decimal × 10000).
 *     e.g. 13.57% → 1357 bp,  81.31% → 8131 bp.
 */

export interface ScanResultRow {
  ticker: string;
  companyName: string;
  price: number;           // cents
  priceChange: number;     // cents
  ivRank: number;          // basis points
  ivPercentile: number;    // basis points
  strike: string;          // "385/380" string
  moneyness: number;       // basis points
  expDate: string;         // YYYY-MM-DD
  daysToExp: number;
  totalOptVol: number;
  probMaxProfit: number;   // basis points (8131 = 81.31%)
  maxProfit: number;       // cents per contract
  maxLoss: number;         // cents per contract
  returnPercent: number;   // basis points (1357 = 13.57%)
}

export interface PortfolioSummary {
  id: number;
  type: 'top_return' | 'top_probability';
  scanDate: string;
  scanName: string;
  status: 'active' | 'closed';
  initialCapital: number;         // cents
  totalPremiumCollected: number;  // cents
  currentValue: number;           // cents
  netPnl: number;                 // cents
  lastUpdated: string | null;
  trades: TradeDetail[];
}

export interface TradeDetail {
  id: number;
  portfolioId: number;
  ticker: string;
  stockPriceAtEntry: number | null;  // cents
  sellStrike: number;                // cents
  buyStrike: number;                 // cents
  expirationDate: string;
  contracts: number;
  premiumCollected: number;          // cents per contract
  spreadWidth: number;               // cents
  maxLossPerContract: number;        // cents
  currentSpreadValue: number | null; // cents per contract
  currentStockPrice: number | null;  // cents
  currentPnl: number | null;        // cents (total, all contracts)
  status: 'open' | 'expired_profit' | 'expired_loss';
  isItm: boolean;
}

export interface ValueHistoryPoint {
  date: string;
  portfolioValue: number;  // cents
  netPnl: number;          // cents
}

export interface ScanDate {
  scanDate: string;
  scanName: string;
  resultCount: number;
}
