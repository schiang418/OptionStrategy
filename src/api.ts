const BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanDate {
  scanDate: string;
  scanName: string;
  resultCount: number;
}

export interface ScanResult {
  id: number;
  ticker: string;
  companyName: string | null;
  price: number | null;       // dollars (converted from cents on server)
  priceChange: number | null;
  ivRank: number | null;      // decimal (0.452 = 45.2%)
  ivPercentile: number | null;
  strike: string | null;
  moneyness: number | null;
  expDate: string | null;
  daysToExp: number | null;
  totalOptVol: number | null;
  probMaxProfit: number | null; // decimal (0.8131 = 81.31%)
  maxProfit: number | null;     // dollars per contract
  maxLoss: number | null;       // dollars per contract
  returnPercent: number | null; // decimal (0.1357 = 13.57%)
  scanName: string;
  scanDate: string;
}

export interface Portfolio {
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
}

export interface Trade {
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
  portfolioType?: string;
  portfolioScanDate?: string;
}

export interface PortfolioWithTrades extends Portfolio {
  trades: Trade[];
}

export interface ValueHistoryPoint {
  date: string;
  portfolioValue: number;
  netPnl: number;
}

export interface ComparisonPortfolio extends Portfolio {
  snapshots: ValueHistoryPoint[];
}

// ---------------------------------------------------------------------------
// Scan endpoints
// ---------------------------------------------------------------------------

export function fetchScanDates(scanName?: string): Promise<ScanDate[]> {
  const params = scanName ? `?scanName=${encodeURIComponent(scanName)}` : '';
  return fetchJSON(`/option-scans/dates${params}`);
}

export function fetchScanResults(date: string, scanName?: string): Promise<ScanResult[]> {
  const params = scanName ? `?scanName=${encodeURIComponent(scanName)}` : '';
  return fetchJSON(`/option-scans/${date}${params}`);
}

export function deleteScanData(date: string): Promise<{ success: boolean; deletedCount: number }> {
  return fetchJSON(`/option-scans/${date}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Portfolio endpoints
// ---------------------------------------------------------------------------

export function fetchPortfolios(scanName?: string): Promise<Portfolio[]> {
  const params = scanName ? `?scanName=${encodeURIComponent(scanName)}` : '';
  return fetchJSON(`/option-portfolios${params}`);
}

export function fetchPortfoliosByDate(date: string, scanName?: string): Promise<Portfolio[]> {
  const snParam = scanName ? `&scanName=${encodeURIComponent(scanName)}` : '';
  return fetchJSON(`/option-portfolios?date=${date}${snParam}`);
}

export function fetchPortfolioDetail(id: number): Promise<PortfolioWithTrades> {
  return fetchJSON(`/option-portfolios/${id}`);
}

export function fetchPortfolioHistory(id: number): Promise<ValueHistoryPoint[]> {
  return fetchJSON(`/option-portfolios/${id}/history`);
}

export function fetchPortfolioComparison(scanName?: string): Promise<ComparisonPortfolio[]> {
  const params = scanName ? `?scanName=${encodeURIComponent(scanName)}` : '';
  return fetchJSON(`/option-portfolios/comparison${params}`);
}

export function fetchAllTrades(scanName?: string): Promise<Trade[]> {
  const params = scanName ? `?scanName=${encodeURIComponent(scanName)}` : '';
  return fetchJSON(`/option-portfolios/trades${params}`);
}

// ---------------------------------------------------------------------------
// P&L endpoints
// ---------------------------------------------------------------------------

export function updateAllPnl(): Promise<{ success: boolean; message: string }> {
  return fetchJSON('/option-portfolios/update-pnl', { method: 'POST' });
}

export function updatePortfolioPnl(id: number): Promise<{ success: boolean; message: string }> {
  return fetchJSON(`/option-portfolios/${id}/update-pnl`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Automation endpoints
// ---------------------------------------------------------------------------

export function runScan(scanName?: string): Promise<any> {
  return fetchJSON('/option-automation/scan', {
    method: 'POST',
    body: JSON.stringify({ scanName }),
  });
}

export function runMondayWorkflow(
  force?: boolean,
  scanName?: string,
  tradesPerPortfolio?: number,
): Promise<any> {
  return fetchJSON('/option-automation/monday-workflow', {
    method: 'POST',
    body: JSON.stringify({ force, scanName, tradesPerPortfolio }),
  });
}

export function testLogin(): Promise<{ success: boolean; message: string }> {
  return fetchJSON('/option-automation/test-login', { method: 'POST' });
}

export function fetchMarketStatus(): Promise<{ date: string; isTradingDay: boolean }> {
  return fetchJSON('/option-automation/market-status');
}
