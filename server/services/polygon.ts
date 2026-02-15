import { buildOptionTicker, sleep } from '../utils/dates.js';

const POLYGON_BASE = 'https://api.polygon.io';
const RATE_LIMIT_DELAY = 200; // ms between API calls

interface OptionSnapshot {
  bid: number;
  ask: number;
  midpoint: number;
  underlyingPrice: number;
}

interface StockPrice {
  close: number;
  open: number;
  high: number;
  low: number;
}

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

/**
 * Get option snapshot data from Polygon.
 */
export async function getOptionSnapshot(
  underlying: string,
  expirationDate: string,
  strike: number,
  putCall: 'P' | 'C' = 'P'
): Promise<OptionSnapshot | null> {
  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) throw new Error('Missing MASSIVE_API_KEY');

  const optionTicker = buildOptionTicker(underlying, expirationDate, putCall, strike);

  try {
    const data = await polygonFetch(
      `${POLYGON_BASE}/v3/snapshot/options/${underlying}/${optionTicker}`,
      apiKey
    );

    if (!data.results) return null;

    const result = data.results;
    const quote = result.last_quote || {};
    const trade = result.last_trade || {};

    const bid = quote.bid || 0;
    const ask = quote.ask || 0;
    const midpoint = bid && ask ? (bid + ask) / 2 : trade.price || 0;

    return {
      bid,
      ask,
      midpoint,
      underlyingPrice: result.underlying_asset?.price || 0,
    };
  } catch (error: any) {
    console.error(`[Polygon] Option snapshot error for ${optionTicker}:`, error.message);
    return null;
  }
}

/**
 * Get the current spread value for a credit put spread.
 * Spread value = (sell put midpoint - buy put midpoint) × 100
 */
export async function getSpreadValue(
  underlying: string,
  expirationDate: string,
  sellStrike: number,
  buyStrike: number
): Promise<{ spreadValue: number; underlyingPrice: number } | null> {
  const sellSnapshot = await getOptionSnapshot(underlying, expirationDate, sellStrike, 'P');
  await sleep(RATE_LIMIT_DELAY);
  const buySnapshot = await getOptionSnapshot(underlying, expirationDate, buyStrike, 'P');

  if (!sellSnapshot || !buySnapshot) return null;

  const spreadValue = (sellSnapshot.midpoint - buySnapshot.midpoint) * 100;

  return {
    spreadValue: Math.max(0, spreadValue), // Spread value shouldn't be negative
    underlyingPrice: sellSnapshot.underlyingPrice || buySnapshot.underlyingPrice,
  };
}

/**
 * Get stock closing price for a given date from Polygon.
 */
export async function getStockPrice(ticker: string, date: string): Promise<StockPrice | null> {
  const apiKey = process.env.MASSIVE_STOCK_API_KEY;
  if (!apiKey) throw new Error('Missing MASSIVE_STOCK_API_KEY');

  // Try daily open-close endpoint first
  try {
    const data = await polygonFetch(
      `${POLYGON_BASE}/v1/open-close/${ticker}/${date}?adjusted=true`,
      apiKey
    );

    if (data.status === 'OK') {
      return {
        close: data.close,
        open: data.open,
        high: data.high,
        low: data.low,
      };
    }
  } catch {
    // Fall through to backup
  }

  // Fallback: aggregate endpoint
  try {
    await sleep(RATE_LIMIT_DELAY);
    const data = await polygonFetch(
      `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/1/day/${date}/${date}?adjusted=true`,
      apiKey
    );

    if (data.results && data.results.length > 0) {
      const bar = data.results[0];
      return {
        close: bar.c,
        open: bar.o,
        high: bar.h,
        low: bar.l,
      };
    }
  } catch {
    // Fall through to snapshot
  }

  // Fallback: real-time snapshot
  try {
    await sleep(RATE_LIMIT_DELAY);
    const data = await polygonFetch(
      `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
      apiKey
    );

    if (data.ticker) {
      const snap = data.ticker;
      return {
        close: snap.lastTrade?.p || snap.day?.c || 0,
        open: snap.day?.o || 0,
        high: snap.day?.h || 0,
        low: snap.day?.l || 0,
      };
    }
  } catch (error: any) {
    console.error(`[Polygon] Stock price error for ${ticker}:`, error.message);
  }

  return null;
}

/**
 * Get real-time stock price from snapshot.
 */
export async function getRealtimeStockPrice(ticker: string): Promise<number | null> {
  const apiKey = process.env.MASSIVE_STOCK_API_KEY;
  if (!apiKey) throw new Error('Missing MASSIVE_STOCK_API_KEY');

  try {
    const data = await polygonFetch(
      `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
      apiKey
    );

    if (data.ticker) {
      return data.ticker.lastTrade?.p || data.ticker.day?.c || null;
    }
  } catch (error: any) {
    console.error(`[Polygon] Realtime price error for ${ticker}:`, error.message);
  }

  return null;
}
