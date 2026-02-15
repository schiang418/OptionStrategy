export interface ScanResultRow {
  ticker: string;
  companyName: string;
  price: number;
  priceChange: number;
  ivRank: number;
  ivPercentile: number;
  strike: string;
  moneyness: number;
  expDate: string;
  daysToExp: number;
  totalOptVol: number;
  probMaxProfit: number;
  maxProfit: number;
  maxLoss: number;
  returnPercent: number;
}

export interface PortfolioSummary {
  id: number;
  type: 'top_return' | 'top_probability';
  scanDate: string;
  scanName: string;
  status: 'active' | 'closed';
  initialCapital: number;
  totalPremiumCollected: number;
  currentValue: number;
  netPnl: number;
  lastUpdated: string | null;
  trades: TradeDetail[];
}

export interface TradeDetail {
  id: number;
  portfolioId: number;
  ticker: string;
  stockPriceAtEntry: number | null;
  sellStrike: number;
  buyStrike: number;
  expirationDate: string;
  contracts: number;
  premiumCollected: number;
  spreadWidth: number;
  maxLossPerContract: number;
  currentSpreadValue: number | null;
  currentStockPrice: number | null;
  currentPnl: number | null;
  status: 'open' | 'expired_profit' | 'expired_loss';
  isItm: boolean;
}

export interface ValueHistoryPoint {
  date: string;
  portfolioValue: number;
  netPnl: number;
}

export interface ScanDate {
  scanDate: string;
  scanName: string;
  resultCount: number;
}
