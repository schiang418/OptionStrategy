import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  optionScanResults,
  optionPortfolios,
  optionPortfolioTrades,
  optionPortfolioValueHistory,
  type NewOptionScanResult,
  type NewOptionPortfolio,
  type NewOptionPortfolioTrade,
} from '../db/schema.js';
import { parseStrike, getTodayET, isExpired } from '../utils/dates.js';
import { getSpreadValue, getStockPrice, getRealtimeStockPrice } from './polygon.js';
import { sleep } from '../utils/dates.js';
import type { ScanResultRow } from '../../shared/types.js';

const RATE_LIMIT_DELAY = 200;

/**
 * Save scan results to the database. Returns the count of inserted rows.
 */
export async function saveScanResults(
  results: ScanResultRow[],
  scanName: string,
  scanDate: string
): Promise<number> {
  if (results.length === 0) return 0;

  const rows: NewOptionScanResult[] = results.map(r => ({
    ticker: r.ticker,
    companyName: r.companyName,
    price: r.price,
    priceChange: r.priceChange,
    ivRank: r.ivRank,
    ivPercentile: r.ivPercentile,
    strike: r.strike,
    moneyness: r.moneyness,
    expDate: r.expDate,
    daysToExp: r.daysToExp,
    totalOptVol: r.totalOptVol,
    probMaxProfit: r.probMaxProfit,
    maxProfit: r.maxProfit,
    maxLoss: r.maxLoss,
    returnPercent: r.returnPercent,
    scanName,
    scanDate,
  }));

  const inserted = await db.insert(optionScanResults).values(rows).returning();
  return inserted.length;
}

/**
 * Check if scan results already exist for a given date and scan name.
 */
export async function scanExistsForDate(scanDate: string, scanName: string): Promise<boolean> {
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(optionScanResults)
    .where(
      and(
        eq(optionScanResults.scanDate, scanDate),
        eq(optionScanResults.scanName, scanName)
      )
    );
  return (existing[0]?.count ?? 0) > 0;
}

/**
 * Get all scan dates with result counts.
 */
export async function getScanDates() {
  return db
    .select({
      scanDate: optionScanResults.scanDate,
      scanName: optionScanResults.scanName,
      resultCount: sql<number>`count(*)`,
    })
    .from(optionScanResults)
    .groupBy(optionScanResults.scanDate, optionScanResults.scanName)
    .orderBy(desc(optionScanResults.scanDate));
}

/**
 * Get scan results for a specific date.
 */
export async function getScanResultsByDate(scanDate: string) {
  return db
    .select()
    .from(optionScanResults)
    .where(eq(optionScanResults.scanDate, scanDate))
    .orderBy(desc(optionScanResults.returnPercent));
}

/**
 * Delete scan results and associated portfolios for a date.
 */
export async function deleteScanData(scanDate: string) {
  // Delete portfolios (trades and history cascade)
  await db.delete(optionPortfolios).where(eq(optionPortfolios.scanDate, scanDate));
  // Delete scan results
  const deleted = await db
    .delete(optionScanResults)
    .where(eq(optionScanResults.scanDate, scanDate))
    .returning();
  return deleted.length;
}

/**
 * Create portfolios from scan results.
 * Creates two portfolios: top_return and top_probability.
 */
export async function createPortfoliosFromScan(
  scanDate: string,
  scanName: string = 'bi-weekly income all'
): Promise<{ topReturn: number; topProbability: number }> {
  // Check if portfolios already exist for this scan date
  const existing = await db
    .select()
    .from(optionPortfolios)
    .where(
      and(
        eq(optionPortfolios.scanDate, scanDate),
        eq(optionPortfolios.scanName, scanName)
      )
    );

  if (existing.length > 0) {
    console.log(`[Portfolio] Portfolios already exist for ${scanDate}, skipping creation`);
    return { topReturn: 0, topProbability: 0 };
  }

  // Get scan results
  const results = await db
    .select()
    .from(optionScanResults)
    .where(
      and(
        eq(optionScanResults.scanDate, scanDate),
        eq(optionScanResults.scanName, scanName)
      )
    );

  if (results.length === 0) {
    throw new Error(`No scan results found for ${scanDate}`);
  }

  // Sort and pick top 5 for each portfolio type
  const byReturn = [...results]
    .sort((a, b) => (b.returnPercent ?? 0) - (a.returnPercent ?? 0))
    .slice(0, 5);

  const byProbability = [...results]
    .sort((a, b) => (b.probMaxProfit ?? 0) - (a.probMaxProfit ?? 0))
    .slice(0, 5);

  const topReturnId = await createPortfolio('top_return', scanDate, scanName, byReturn);
  const topProbabilityId = await createPortfolio('top_probability', scanDate, scanName, byProbability);

  return { topReturn: topReturnId, topProbability: topProbabilityId };
}

async function createPortfolio(
  type: 'top_return' | 'top_probability',
  scanDate: string,
  scanName: string,
  scanResults: typeof optionScanResults.$inferSelect[]
): Promise<number> {
  // Create portfolio
  const [portfolio] = await db
    .insert(optionPortfolios)
    .values({
      type,
      scanDate,
      scanName,
      status: 'active',
      initialCapital: 100000,
      totalPremiumCollected: 0,
      currentValue: 100000,
      netPnl: 0,
    })
    .returning();

  let totalPremium = 0;

  // Create trades
  for (const result of scanResults) {
    if (!result.strike || !result.expDate) continue;

    const { sell, buy } = parseStrike(result.strike);
    const contracts = 4;
    const premiumPerContract = result.maxProfit ?? 0;
    const premiumCollected = premiumPerContract * contracts;
    const spreadWidth = sell - buy;
    const maxLossPerContract = (spreadWidth * 100) - premiumPerContract;

    // Try to get stock entry price from Polygon
    let stockPriceAtEntry = result.price;
    try {
      const stockData = await getStockPrice(result.ticker, scanDate);
      if (stockData) {
        stockPriceAtEntry = stockData.close;
      }
      await sleep(RATE_LIMIT_DELAY);
    } catch {
      // Use scan price as fallback
    }

    await db.insert(optionPortfolioTrades).values({
      portfolioId: portfolio.id,
      ticker: result.ticker,
      stockPriceAtEntry,
      sellStrike: sell,
      buyStrike: buy,
      expirationDate: result.expDate,
      contracts,
      premiumCollected,
      spreadWidth,
      maxLossPerContract,
      currentSpreadValue: 0,
      currentStockPrice: stockPriceAtEntry,
      currentPnl: premiumCollected,
      status: 'open',
      isItm: 0,
    });

    totalPremium += premiumCollected;
  }

  // Update portfolio with total premium
  await db
    .update(optionPortfolios)
    .set({
      totalPremiumCollected: totalPremium,
      currentValue: 100000 + totalPremium,
      netPnl: totalPremium,
      updatedAt: new Date(),
    })
    .where(eq(optionPortfolios.id, portfolio.id));

  console.log(`[Portfolio] Created ${type} portfolio #${portfolio.id} with ${scanResults.length} trades, premium: $${totalPremium}`);
  return portfolio.id;
}

/**
 * Get all portfolios.
 */
export async function getAllPortfolios() {
  return db
    .select()
    .from(optionPortfolios)
    .orderBy(desc(optionPortfolios.scanDate));
}

/**
 * Get a portfolio with its trades.
 */
export async function getPortfolioWithTrades(portfolioId: number) {
  const [portfolio] = await db
    .select()
    .from(optionPortfolios)
    .where(eq(optionPortfolios.id, portfolioId));

  if (!portfolio) return null;

  const trades = await db
    .select()
    .from(optionPortfolioTrades)
    .where(eq(optionPortfolioTrades.portfolioId, portfolioId))
    .orderBy(asc(optionPortfolioTrades.expirationDate));

  return { ...portfolio, trades };
}

/**
 * Update P&L for all active portfolios.
 */
export async function updateAllPortfolioPnl(): Promise<void> {
  const activePortfolios = await db
    .select()
    .from(optionPortfolios)
    .where(eq(optionPortfolios.status, 'active'));

  console.log(`[P&L] Updating ${activePortfolios.length} active portfolios...`);

  for (const portfolio of activePortfolios) {
    await updatePortfolioPnl(portfolio.id);
    await sleep(RATE_LIMIT_DELAY);
  }
}

/**
 * Update P&L for a single portfolio.
 */
async function updatePortfolioPnl(portfolioId: number): Promise<void> {
  const trades = await db
    .select()
    .from(optionPortfolioTrades)
    .where(eq(optionPortfolioTrades.portfolioId, portfolioId));

  let totalPnl = 0;
  let allClosed = true;

  for (const trade of trades) {
    if (trade.status !== 'open') {
      totalPnl += trade.currentPnl ?? 0;
      continue;
    }

    allClosed = false;

    // Check if expired
    if (isExpired(trade.expirationDate)) {
      await handleExpiration(trade);
      // Re-fetch updated trade
      const [updated] = await db
        .select()
        .from(optionPortfolioTrades)
        .where(eq(optionPortfolioTrades.id, trade.id));
      totalPnl += updated?.currentPnl ?? 0;
      continue;
    }

    // Get current spread value
    try {
      const spreadData = await getSpreadValue(
        trade.ticker,
        trade.expirationDate,
        trade.sellStrike,
        trade.buyStrike
      );

      if (spreadData) {
        const currentPnl = trade.premiumCollected - (spreadData.spreadValue * trade.contracts);
        const isItm = spreadData.underlyingPrice <= trade.sellStrike ? 1 : 0;

        await db
          .update(optionPortfolioTrades)
          .set({
            currentSpreadValue: spreadData.spreadValue,
            currentStockPrice: spreadData.underlyingPrice,
            currentPnl,
            isItm,
            updatedAt: new Date(),
          })
          .where(eq(optionPortfolioTrades.id, trade.id));

        totalPnl += currentPnl;
      } else {
        totalPnl += trade.currentPnl ?? 0;
      }

      await sleep(RATE_LIMIT_DELAY);
    } catch (error: any) {
      console.error(`[P&L] Error updating trade ${trade.id}:`, error.message);
      totalPnl += trade.currentPnl ?? 0;
    }
  }

  // Re-check if all trades are closed
  const openTrades = await db
    .select()
    .from(optionPortfolioTrades)
    .where(
      and(
        eq(optionPortfolioTrades.portfolioId, portfolioId),
        eq(optionPortfolioTrades.status, 'open')
      )
    );
  allClosed = openTrades.length === 0;

  // Update portfolio totals
  const portfolioValue = 100000 + totalPnl;
  await db
    .update(optionPortfolios)
    .set({
      currentValue: portfolioValue,
      netPnl: totalPnl,
      lastUpdated: new Date(),
      status: allClosed ? 'closed' : 'active',
      updatedAt: new Date(),
    })
    .where(eq(optionPortfolios.id, portfolioId));

  // Record value history
  const today = getTodayET();
  await db.insert(optionPortfolioValueHistory).values({
    portfolioId,
    date: today,
    portfolioValue,
    netPnl: totalPnl,
  });

  console.log(`[P&L] Portfolio #${portfolioId}: value=$${portfolioValue.toFixed(2)}, pnl=$${totalPnl.toFixed(2)}`);
}

/**
 * Handle trade expiration logic.
 */
async function handleExpiration(
  trade: typeof optionPortfolioTrades.$inferSelect
): Promise<void> {
  // Get current stock price to determine outcome
  let stockPrice = trade.currentStockPrice;
  try {
    const realtimePrice = await getRealtimeStockPrice(trade.ticker);
    if (realtimePrice) stockPrice = realtimePrice;
  } catch {}

  let pnl: number;
  let status: 'expired_profit' | 'expired_loss';

  if (!stockPrice || stockPrice >= trade.sellStrike) {
    // Stock >= sell strike → max profit (keep all premium)
    pnl = trade.premiumCollected;
    status = 'expired_profit';
  } else if (stockPrice <= trade.buyStrike) {
    // Stock <= buy strike → max loss
    pnl = -(trade.spreadWidth * 100 - trade.premiumCollected / trade.contracts) * trade.contracts;
    status = 'expired_loss';
  } else {
    // Between strikes → partial loss based on intrinsic value
    const intrinsicValue = (trade.sellStrike - stockPrice) * 100;
    pnl = trade.premiumCollected - (intrinsicValue * trade.contracts);
    status = pnl >= 0 ? 'expired_profit' : 'expired_loss';
  }

  await db
    .update(optionPortfolioTrades)
    .set({
      status,
      currentPnl: pnl,
      currentStockPrice: stockPrice,
      currentSpreadValue: 0,
      isItm: 0,
      updatedAt: new Date(),
    })
    .where(eq(optionPortfolioTrades.id, trade.id));

  console.log(`[Expiration] Trade #${trade.id} (${trade.ticker}): ${status}, P&L: $${pnl.toFixed(2)}`);
}

/**
 * Get portfolio value history.
 */
export async function getPortfolioHistory(portfolioId: number) {
  return db
    .select()
    .from(optionPortfolioValueHistory)
    .where(eq(optionPortfolioValueHistory.portfolioId, portfolioId))
    .orderBy(asc(optionPortfolioValueHistory.date));
}
