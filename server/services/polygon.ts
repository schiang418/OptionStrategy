/**
 * Polygon.io API service.
 *
 * CONVENTIONS (matching OptionScope / massive.ts):
 *   - MASSIVE_API_KEY       for option endpoints
 *   - MASSIVE_STOCK_API_KEY for stock endpoints
 *   - All returned monetary values are in **cents** (integer).
 *   - 200 ms rate-limiting between API calls.
 */

import { buildOptionTicker, sleep, toCents } from '../utils/dates.js';

const POLYGON_BASE = 'https://api.polygon.io';
const RATE_LIMIT_DELAY = 200; // ms between API calls

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OptionSnapshot {
  bid: number;             // cents per share
  ask: number;             // cents per share
  midpoint: number;        // cents per share
  underlyingPrice: number; // cents
}

export interface SpreadResult {
  spreadValueCents: number;     // cents per contract (per-share mid diff * 100)
  underlyingPriceCents: number; // cents
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function polygonFetch(url: string, apiKey: string): Promise<any> {
  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}apiKey=${apiKey}`;

  const response = await fetch(fullUrl);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Polygon API error (${response.status}): ${text}`);
  }
  return response.json();
}

function getOptionApiKey(): string {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) throw new Error('Missing MASSIVE_API_KEY');
  return key;
}

function getStockApiKey(): string {
  const key = process.env.MASSIVE_STOCK_API_KEY;
  if (!key) throw new Error('Missing MASSIVE_STOCK_API_KEY');
  return key;
}

// Re-export for convenience
export { buildOptionTicker };

// ---------------------------------------------------------------------------
// getOptionSnapshot
// ---------------------------------------------------------------------------

/**
 * Fetch option snapshot from Polygon.
 * All monetary values returned in **cents**.
 *
 * @param underlying    e.g. "AAPL"
 * @param optionTicker  e.g. "O:AAPL260227P00385000"
 */
export async function getOptionSnapshot(
  underlying: string,
  optionTicker: string,
): Promise<OptionSnapshot | null> {
  const apiKey = getOptionApiKey();

  try {
    const data = await polygonFetch(
      `${POLYGON_BASE}/v3/snapshot/options/${underlying}/${optionTicker}`,
      apiKey,
    );

    if (!data.results) return null;

    const result = data.results;
    const quote = result.last_quote || {};
    const trade = result.last_trade || {};

    const bid = quote.bid || 0;
    const ask = quote.ask || 0;
    const midpoint = bid && ask ? (bid + ask) / 2 : trade.price || 0;
    const underlyingPrice = result.underlying_asset?.price || 0;

    return {
      bid: toCents(bid),
      ask: toCents(ask),
      midpoint: toCents(midpoint),
      underlyingPrice: toCents(underlyingPrice),
    };
  } catch (error: any) {
    console.error(
      `[Polygon] Option snapshot error for ${optionTicker}:`,
      error.message,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// getCreditPutSpreadValue
// ---------------------------------------------------------------------------

/**
 * Get the current market value of a credit put spread.
 *
 * @param ticker         underlying symbol
 * @param sellStrike     dollar value (higher strike)
 * @param buyStrike      dollar value (lower strike)
 * @param expirationDate YYYY-MM-DD
 * @returns SpreadResult with values in cents, or null
 */
export async function getCreditPutSpreadValue(
  ticker: string,
  sellStrike: number,
  buyStrike: number,
  expirationDate: string,
): Promise<SpreadResult | null> {
  const sellTicker = buildOptionTicker(ticker, expirationDate, 'P', sellStrike);
  const buyTicker = buildOptionTicker(ticker, expirationDate, 'P', buyStrike);

  const sellSnap = await getOptionSnapshot(ticker, sellTicker);
  await sleep(RATE_LIMIT_DELAY);
  const buySnap = await getOptionSnapshot(ticker, buyTicker);

  if (!sellSnap || !buySnap) return null;

  // Per-contract value: (sellMid - buyMid) * 100 contract multiplier
  // midpoints are already in cents-per-share, so * 100 for per-contract
  const spreadValueCents = Math.max(
    0,
    (sellSnap.midpoint - buySnap.midpoint) * 100,
  );

  return {
    spreadValueCents: Math.round(spreadValueCents),
    underlyingPriceCents:
      sellSnap.underlyingPrice || buySnap.underlyingPrice,
  };
}

// ---------------------------------------------------------------------------
// getStockClosePrice
// ---------------------------------------------------------------------------

/**
 * Get closing stock price for a given date.
 * @returns price in **cents**, or null.
 */
export async function getStockClosePrice(
  ticker: string,
  date: string,
): Promise<number | null> {
  const apiKey = getStockApiKey();

  // Try daily open-close endpoint first
  try {
    const data = await polygonFetch(
      `${POLYGON_BASE}/v1/open-close/${ticker}/${date}?adjusted=true`,
      apiKey,
    );
    if (data.status === 'OK' && data.close) {
      return toCents(data.close);
    }
  } catch {}

  // Fallback: aggregate bars
  try {
    await sleep(RATE_LIMIT_DELAY);
    const data = await polygonFetch(
      `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/1/day/${date}/${date}?adjusted=true`,
      apiKey,
    );
    if (data.results && data.results.length > 0) {
      return toCents(data.results[0].c);
    }
  } catch {}

  // Fallback: real-time snapshot
  try {
    await sleep(RATE_LIMIT_DELAY);
    const data = await polygonFetch(
      `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
      apiKey,
    );
    if (data.ticker) {
      const price =
        data.ticker.lastTrade?.p || data.ticker.day?.c || 0;
      if (price) return toCents(price);
    }
  } catch (error: any) {
    console.error(
      `[Polygon] Stock close price error for ${ticker}:`,
      error.message,
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// getCurrentStockPrice
// ---------------------------------------------------------------------------

/**
 * Get real-time stock price from Polygon snapshot.
 * @returns price in **cents**, or null.
 */
export async function getCurrentStockPrice(
  ticker: string,
): Promise<number | null> {
  const apiKey = getStockApiKey();

  try {
    const data = await polygonFetch(
      `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
      apiKey,
    );

    if (data.ticker) {
      const price =
        data.ticker.lastTrade?.p || data.ticker.day?.c || null;
      if (price) return toCents(price);
    }
  } catch (error: any) {
    console.error(
      `[Polygon] Realtime price error for ${ticker}:`,
      error.message,
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// calculateExpiredPnL
// ---------------------------------------------------------------------------

/**
 * Calculate P&L at expiration for a credit put spread.
 *
 * NOTE: sellStrike and buyStrike are in **dollars** (not cents).
 *       premiumCollected is cents per contract.
 *       stockClosePrice is cents.
 *       Returned pnl is in cents.
 */
export function calculateExpiredPnL(
  sellStrike: number,
  buyStrike: number,
  premiumCollected: number,
  stockClosePrice: number,
  contracts: number,
): { pnl: number; status: 'expired_profit' | 'expired_loss'; isItm: boolean } {
  const sellStrikeCents = toCents(sellStrike);
  const buyStrikeCents = toCents(buyStrike);

  if (stockClosePrice >= sellStrikeCents) {
    // OTM at expiration: keep all premium
    return {
      pnl: premiumCollected * contracts,
      status: 'expired_profit',
      isItm: false,
    };
  }

  if (stockClosePrice <= buyStrikeCents) {
    // Deep ITM: max loss
    const spreadWidthCents = (sellStrikeCents - buyStrikeCents) * 100; // per contract
    const maxLossPerContract = spreadWidthCents - premiumCollected;
    return {
      pnl: -(maxLossPerContract * contracts),
      status: 'expired_loss',
      isItm: true,
    };
  }

  // Between the two strikes: partial loss
  const intrinsicPerShare = sellStrikeCents - stockClosePrice; // cents
  const intrinsicPerContract = intrinsicPerShare * 100;        // cents
  const pnl = (premiumCollected - intrinsicPerContract) * contracts;

  return {
    pnl: Math.round(pnl),
    status: pnl >= 0 ? 'expired_profit' : 'expired_loss',
    isItm: true,
  };
}

// ---------------------------------------------------------------------------
// checkMarketOpen
// ---------------------------------------------------------------------------

/**
 * Check whether the US stock market is currently open via Polygon.
 */
export async function checkMarketOpen(): Promise<boolean> {
  const apiKey = getStockApiKey();

  try {
    const data = await polygonFetch(
      `${POLYGON_BASE}/v1/marketstatus/now`,
      apiKey,
    );
    return data.market === 'open';
  } catch (error: any) {
    console.error('[Polygon] Market status check error:', error.message);
    return false;
  }
}

/**
 * Check if a given date (YYYY-MM-DD) is a trading day.
 * Returns false for weekends and market holidays.
 */
export async function isTradingDay(dateStr: string): Promise<boolean> {
  // Check weekend first
  const d = new Date(dateStr + 'T12:00:00-05:00');
  const day = d.getDay();
  if (day === 0 || day === 6) return false;

  const apiKey = getStockApiKey();
  try {
    const data = await polygonFetch(
      `${POLYGON_BASE}/v1/marketstatus/upcoming`,
      apiKey,
    );
    if (Array.isArray(data)) {
      for (const holiday of data) {
        if (holiday.date === dateStr && holiday.status === 'closed') {
          console.log(`[Polygon] ${dateStr} is a market holiday: ${holiday.name}`);
          return false;
        }
      }
    }
    return true;
  } catch (error: any) {
    console.error('[Polygon] Holiday check failed:', error.message);
    return true; // default to trading day on error
  }
}

/**
 * Find the next trading day from a given date.
 */
export async function getNextTradingDay(fromDate: string): Promise<string> {
  let current = new Date(fromDate + 'T12:00:00-05:00');
  for (let i = 0; i < 7; i++) {
    current.setDate(current.getDate() + 1);
    const dateStr = current.toISOString().slice(0, 10);
    if (await isTradingDay(dateStr)) return dateStr;
    await sleep(100);
  }
  // fallback
  current = new Date(fromDate + 'T12:00:00-05:00');
  current.setDate(current.getDate() + 1);
  return current.toISOString().slice(0, 10);
}
