/**
 * Portfolio service -- scan-result persistence, portfolio creation, and P&L
 * tracking.
 *
 * CONVENTIONS:
 *   - Money is stored in the database as **cents** (integer).
 *   - Percentages are stored as **basis points** (integer, x10000).
 *   - The scraper returns **raw float values** (dollars, percent numbers like
 *     13.57 for 13.57%). This service converts them before DB insertion.
 *   - Same-day overwrites: if portfolios already exist for a scanDate they
 *     are deleted and recreated.
 */

import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  optionScanResults,
  optionPortfolios,
  optionPortfolioTrades,
  optionPortfolioValueHistory,
  type NewOptionScanResult,
} from '../db/schema.js';
import {
  parseStrike,
  getTodayET,
  isExpired,
  sleep,
  toCents,
  fromCents,
  toBasisPoints,
  fromBasisPoints,
} from '../utils/dates.js';
import {
  getCreditPutSpreadValue,
  getStockClosePrice,
  getCurrentStockPrice,
  calculateExpiredPnL,
  checkMarketOpen,
} from './polygon.js';
import type { ScanResultRow } from '../../shared/types.js';

const RATE_LIMIT_DELAY = 200;

// Initial capital: $100,000 in cents
const INITIAL_CAPITAL_CENTS = 10_000_000;

// Filtering thresholds (in stored units -- basis points)
const MIN_RETURN_BP = 200;   // 2.00 %
const MIN_PROB_BP = 8_000;   // 80.00 %

const CONTRACTS_PER_TRADE = 4;
const DEFAULT_TRADES_PER_PORTFOLIO = 5;

// ============================================================================
// Scan-result CRUD
// ============================================================================

/**
 * Save scan results to the database.
 *
 * The scraper returns raw float values (dollars, percentages as plain numbers
 * like 13.57 for 13.57%). This function converts them to cents / basis points
 * before insertion.
 *
 * Max Profit and Max Loss from the scraper are per-share dollar values.
 * We multiply by 100 to get per-contract, then convert to cents.
 */
export async function saveScanResults(
  results: ScanResultRow[],
  scanName: string,
  scanDate: string,
): Promise<number> {
  if (results.length === 0) return 0;

  const rows: NewOptionScanResult[] = results.map(r => {
    // Normalise the strike string so higher is always first (sell/buy)
    let strikeStr = r.strike;
    if (r.strike) {
      try {
        const { sellStrike, buyStrike } = parseStrike(r.strike);
        strikeStr = `${sellStrike}/${buyStrike}`;
      } catch {}
    }

    // Max Profit / Max Loss from scraper are per-share dollars.
    // Multiply by 100 for per-contract, then convert to cents.
    const maxProfitPerContract = r.maxProfit * 100;
    const maxLossPerContract = r.maxLoss * 100;

    return {
      ticker: r.ticker,
      companyName: r.companyName || null,
      price: toCents(r.price),
      priceChange: toCents(r.priceChange),
      ivRank: toBasisPoints(r.ivRank / 100),         // e.g. 45.2 -> 0.452 -> 4520 bp
      ivPercentile: toBasisPoints(r.ivPercentile / 100),
      strike: strikeStr,
      moneyness: toBasisPoints(r.moneyness / 100),
      expDate: r.expDate,
      daysToExp: r.daysToExp,
      totalOptVol: r.totalOptVol,
      probMaxProfit: toBasisPoints(r.probMaxProfit / 100),  // 81.31 -> 0.8131 -> 8131 bp
      maxProfit: toCents(maxProfitPerContract),              // cents per contract
      maxLoss: toCents(maxLossPerContract),                  // cents per contract
      returnPercent: toBasisPoints(r.returnPercent / 100),   // 13.57 -> 0.1357 -> 1357 bp
      scanName,
      scanDate,
    };
  });

  const inserted = await db.insert(optionScanResults).values(rows).returning();
  return inserted.length;
}

/**
 * Delete existing scan results AND any portfolios for a given date (same-day
 * overwrite support).
 */
export async function deleteScanDataForDate(scanDate: string, scanName?: string): Promise<void> {
  // Delete portfolios first (trades + history cascade via FK)
  const portfolioConditions = [eq(optionPortfolios.scanDate, scanDate)];
  if (scanName) portfolioConditions.push(eq(optionPortfolios.scanName, scanName));
  await db.delete(optionPortfolios).where(and(...portfolioConditions));

  // Delete scan results
  const scanConditions = [eq(optionScanResults.scanDate, scanDate)];
  if (scanName) scanConditions.push(eq(optionScanResults.scanName, scanName));
  await db.delete(optionScanResults).where(and(...scanConditions));
}

/**
 * Check whether scan results exist for a given date + scan name.
 */
export async function scanExistsForDate(
  scanDate: string,
  scanName: string,
): Promise<boolean> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(optionScanResults)
    .where(
      and(
        eq(optionScanResults.scanDate, scanDate),
        eq(optionScanResults.scanName, scanName),
      ),
    );
  return (rows[0]?.count ?? 0) > 0;
}

/**
 * Check if any scan exists within the last N days.
 */
export async function scanExistsInLastNDays(days: number): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(optionScanResults)
    .where(
      sql`${optionScanResults.scanDate} >= CURRENT_DATE - ${days}::integer`,
    );
  return (result[0]?.count ?? 0) > 0;
}

/**
 * Return all scan dates with result counts.
 * Optionally filter by scanName.
 */
export async function getScanDates(scanName?: string) {
  const query = db
    .select({
      scanDate: optionScanResults.scanDate,
      scanName: optionScanResults.scanName,
      resultCount: sql<number>`count(*)`,
    })
    .from(optionScanResults);

  if (scanName) {
    return query
      .where(eq(optionScanResults.scanName, scanName))
      .groupBy(optionScanResults.scanDate, optionScanResults.scanName)
      .orderBy(desc(optionScanResults.scanDate));
  }

  return query
    .groupBy(optionScanResults.scanDate, optionScanResults.scanName)
    .orderBy(desc(optionScanResults.scanDate));
}

/**
 * Get scan results for a specific date, converting stored integers back to
 * human-readable dollars / percentages for the API response.
 * Optionally filter by scanName.
 */
export async function getScanResultsByDate(scanDate: string, scanName?: string) {
  const conditions = [eq(optionScanResults.scanDate, scanDate)];
  if (scanName) {
    conditions.push(eq(optionScanResults.scanName, scanName));
  }

  const rows = await db
    .select()
    .from(optionScanResults)
    .where(and(...conditions))
    .orderBy(desc(optionScanResults.returnPercent));

  return rows.map(r => ({
    ...r,
    // Convert cents -> dollars for the API consumer
    price: r.price != null ? fromCents(r.price) : null,
    priceChange: r.priceChange != null ? fromCents(r.priceChange) : null,
    maxProfit: r.maxProfit != null ? fromCents(r.maxProfit) : null,
    maxLoss: r.maxLoss != null ? fromCents(r.maxLoss) : null,
    // Convert basis points -> decimal percentage
    ivRank: r.ivRank != null ? fromBasisPoints(r.ivRank) : null,
    ivPercentile: r.ivPercentile != null ? fromBasisPoints(r.ivPercentile) : null,
    probMaxProfit: r.probMaxProfit != null ? fromBasisPoints(r.probMaxProfit) : null,
    returnPercent: r.returnPercent != null ? fromBasisPoints(r.returnPercent) : null,
    moneyness: r.moneyness != null ? fromBasisPoints(r.moneyness) : null,
  }));
}

/**
 * Delete scan data + cascading portfolios for a date.  Returns count of
 * deleted scan rows.
 */
export async function deleteScanData(scanDate: string, scanName?: string): Promise<number> {
  // Portfolios cascade on FK delete
  const portfolioConditions = [eq(optionPortfolios.scanDate, scanDate)];
  if (scanName) portfolioConditions.push(eq(optionPortfolios.scanName, scanName));
  await db.delete(optionPortfolios).where(and(...portfolioConditions));

  const scanConditions = [eq(optionScanResults.scanDate, scanDate)];
  if (scanName) scanConditions.push(eq(optionScanResults.scanName, scanName));
  const deleted = await db
    .delete(optionScanResults)
    .where(and(...scanConditions))
    .returning();
  return deleted.length;
}

// ============================================================================
// Portfolio creation
// ============================================================================

/**
 * Create two portfolios (top_return and top_probability) from a scan date's
 * results following OptionScope's logic.
 *
 * SAME-DAY OVERWRITE: if portfolios already exist for that scanDate, the old
 * ones are deleted first and new ones are created.
 *
 * Returns the IDs of the two created portfolios, or null for a type if no
 * trades qualify.
 */
export async function createPortfoliosFromScan(
  scanDate: string,
  scanName: string = 'bi-weekly income all',
  tradesPerPortfolio: number = DEFAULT_TRADES_PER_PORTFOLIO,
): Promise<{ topReturn: number | null; topProbability: number | null }> {
  // ---- Same-day overwrite: delete any existing portfolios for this date ----
  const existingPortfolios = await db
    .select()
    .from(optionPortfolios)
    .where(
      and(
        eq(optionPortfolios.scanDate, scanDate),
        eq(optionPortfolios.scanName, scanName),
      ),
    );

  if (existingPortfolios.length > 0) {
    console.log(
      `[Portfolio] Deleting ${existingPortfolios.length} existing portfolio(s) for ${scanDate} (same-day overwrite)`,
    );
    await db.delete(optionPortfolios).where(
      and(
        eq(optionPortfolios.scanDate, scanDate),
        eq(optionPortfolios.scanName, scanName),
      ),
    );
  }

  // ---- Fetch scan results (values are in cents / basis points) ----
  const results = await db
    .select()
    .from(optionScanResults)
    .where(
      and(
        eq(optionScanResults.scanDate, scanDate),
        eq(optionScanResults.scanName, scanName),
      ),
    );

  if (results.length === 0) {
    throw new Error(`No scan results found for ${scanDate}`);
  }

  // ---- Filter qualifying trades ----
  // Bi-weekly income: apply minimum thresholds to weed out low-quality trades.
  // Yearly income: skip thresholds and simply pick the top N by ranking.
  const isYearly = scanName.toLowerCase().includes('yearly');

  const qualifying = isYearly
    ? results
    : results.filter(r => {
        const ret = r.returnPercent ?? 0;
        const prob = r.probMaxProfit ?? 0;
        return ret >= MIN_RETURN_BP && prob >= MIN_PROB_BP;
      });

  if (isYearly) {
    console.log(
      `[Portfolio] ${qualifying.length} trades available (yearly — no min thresholds)`,
    );
  } else {
    console.log(
      `[Portfolio] ${qualifying.length} of ${results.length} trades qualify ` +
      `(return >= ${MIN_RETURN_BP} bp, prob >= ${MIN_PROB_BP} bp)`,
    );
  }

  if (qualifying.length === 0) {
    console.log('[Portfolio] No qualifying trades -- skipping portfolio creation');
    return { topReturn: null, topProbability: null };
  }

  // ---- Pick top N for each type (cycle if fewer qualify) ----
  const pickTopN = (
    sorted: typeof qualifying,
  ): typeof qualifying => {
    const picked: typeof qualifying = [];
    for (let i = 0; i < tradesPerPortfolio; i++) {
      picked.push(sorted[i % sorted.length]);
    }
    return picked;
  };

  const byReturn = [...qualifying].sort(
    (a, b) => (b.returnPercent ?? 0) - (a.returnPercent ?? 0),
  );
  const byProb = [...qualifying].sort(
    (a, b) => (b.probMaxProfit ?? 0) - (a.probMaxProfit ?? 0),
  );

  const topReturnTrades = pickTopN(byReturn);
  const topProbTrades = pickTopN(byProb);

  const topReturnId = await createPortfolio(
    'top_return',
    scanDate,
    scanName,
    topReturnTrades,
  );
  const topProbId = await createPortfolio(
    'top_probability',
    scanDate,
    scanName,
    topProbTrades,
  );

  return { topReturn: topReturnId, topProbability: topProbId };
}

// ---------------------------------------------------------------------------
// Internal: create a single portfolio with its trades
// ---------------------------------------------------------------------------

async function createPortfolio(
  type: 'top_return' | 'top_probability',
  scanDate: string,
  scanName: string,
  scanResults: (typeof optionScanResults.$inferSelect)[],
): Promise<number> {
  const [portfolio] = await db
    .insert(optionPortfolios)
    .values({
      type,
      scanDate,
      scanName,
      status: 'active',
      initialCapital: INITIAL_CAPITAL_CENTS,
      totalPremiumCollected: 0,
      currentValue: INITIAL_CAPITAL_CENTS,
      netPnl: 0,
    })
    .returning();

  let totalPremiumCents = 0;

  for (const result of scanResults) {
    if (!result.strike || !result.expDate) continue;

    // Parse strikes (dollar values) -- higher = sell, lower = buy
    const { sellStrike, buyStrike } = parseStrike(result.strike);

    const contracts = CONTRACTS_PER_TRADE;

    // premiumCollected per contract = maxProfit from scan (already per-contract in cents)
    const premiumPerContractCents = result.maxProfit ?? 0;

    // spreadWidth = (sellStrike - buyStrike) * 100, in cents
    // Strike values are in dollars, difference in dollars, *100 for per-share->per-contract, then toCents
    const spreadWidthCents = toCents((sellStrike - buyStrike) * 100);

    // maxLossPerContract = spreadWidth - premiumCollected, in cents
    const maxLossPerContractCents = spreadWidthCents - premiumPerContractCents;

    // Sell/buy strikes stored in cents
    const sellStrikeCents = toCents(sellStrike);
    const buyStrikeCents = toCents(buyStrike);

    // Try to get stock entry price from Polygon (returns cents)
    let stockPriceAtEntryCents = result.price ?? 0; // already in cents from saveScanResults
    try {
      const closePriceCents = await getStockClosePrice(result.ticker, scanDate);
      if (closePriceCents != null) {
        stockPriceAtEntryCents = closePriceCents;
      }
      await sleep(RATE_LIMIT_DELAY);
    } catch {
      // Use scan price as fallback (already in cents)
    }

    await db.insert(optionPortfolioTrades).values({
      portfolioId: portfolio.id,
      ticker: result.ticker,
      stockPriceAtEntry: stockPriceAtEntryCents,
      sellStrike: sellStrikeCents,
      buyStrike: buyStrikeCents,
      expirationDate: result.expDate,
      contracts,
      premiumCollected: premiumPerContractCents,
      spreadWidth: spreadWidthCents,
      maxLossPerContract: maxLossPerContractCents,
      currentSpreadValue: premiumPerContractCents, // approx: cost to close ≈ premium at entry
      currentStockPrice: stockPriceAtEntryCents,
      currentPnl: 0, // no gain/loss at entry; live P&L computed on next update
      status: 'open',
      isItm: false,
    });

    totalPremiumCents += premiumPerContractCents * contracts;
  }

  // Update portfolio totals
  await db
    .update(optionPortfolios)
    .set({
      totalPremiumCollected: totalPremiumCents,
      currentValue: INITIAL_CAPITAL_CENTS, // P&L starts at 0; updated by live data
      netPnl: 0,
      updatedAt: new Date(),
    })
    .where(eq(optionPortfolios.id, portfolio.id));

  console.log(
    `[Portfolio] Created ${type} portfolio #${portfolio.id} with ${scanResults.length} trades, ` +
    `premium: $${fromCents(totalPremiumCents).toFixed(2)}`,
  );

  // Immediately fetch live spread values so the portfolio doesn't show $0
  try {
    console.log(`[Portfolio] Running initial P&L update for portfolio #${portfolio.id}...`);
    await updatePortfolioPnl(portfolio.id);
  } catch (err: any) {
    console.error(`[Portfolio] Initial P&L update failed for #${portfolio.id}:`, err.message);
  }

  return portfolio.id;
}

// ============================================================================
// Portfolio queries
// ============================================================================

export async function getAllPortfolios(scanName?: string) {
  if (scanName) {
    return db
      .select()
      .from(optionPortfolios)
      .where(eq(optionPortfolios.scanName, scanName))
      .orderBy(desc(optionPortfolios.scanDate));
  }
  return db
    .select()
    .from(optionPortfolios)
    .orderBy(desc(optionPortfolios.scanDate));
}

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

// ============================================================================
// P&L updates
// ============================================================================

/**
 * Update P&L for **all** active portfolios using live Polygon data.
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

  let totalPnlCents = 0;

  for (const trade of trades) {
    // Already closed -- just accumulate its final P&L
    if (trade.status !== 'open') {
      totalPnlCents += trade.currentPnl ?? 0;
      continue;
    }

    // ---- Check expiration ----
    if (isExpired(trade.expirationDate)) {
      await handleExpiration(trade);
      const [updated] = await db
        .select()
        .from(optionPortfolioTrades)
        .where(eq(optionPortfolioTrades.id, trade.id));
      totalPnlCents += updated?.currentPnl ?? 0;
      continue;
    }

    // ---- Live spread value ----
    try {
      // Strikes stored in cents -- Polygon needs dollars
      const sellStrikeDollars = fromCents(trade.sellStrike);
      const buyStrikeDollars = fromCents(trade.buyStrike);

      const spreadData = await getCreditPutSpreadValue(
        trade.ticker,
        sellStrikeDollars,
        buyStrikeDollars,
        trade.expirationDate,
      );

      if (spreadData) {
        // currentPnl = (premiumCollected - spreadValue) * contracts  (all in cents)
        const currentPnlCents =
          (trade.premiumCollected - spreadData.spreadValueCents) * trade.contracts;

        // Use underlying price from Polygon; fall back to stored prices if unavailable (0)
        const stockPriceCents = spreadData.underlyingPriceCents
          || trade.currentStockPrice
          || trade.stockPriceAtEntry
          || 0;
        const isItm = stockPriceCents > 0
          ? stockPriceCents < trade.sellStrike
          : (trade.isItm ?? false); // keep existing if no price at all

        await db
          .update(optionPortfolioTrades)
          .set({
            currentSpreadValue: spreadData.spreadValueCents,
            currentStockPrice: spreadData.underlyingPriceCents || trade.currentStockPrice,
            currentPnl: currentPnlCents,
            isItm,
            updatedAt: new Date(),
          })
          .where(eq(optionPortfolioTrades.id, trade.id));

        totalPnlCents += currentPnlCents;
      } else {
        console.warn(
          `[P&L] No spread data for trade #${trade.id} (${trade.ticker} ${trade.expirationDate}), keeping existing values`,
        );
        totalPnlCents += trade.currentPnl ?? 0;
      }

      await sleep(RATE_LIMIT_DELAY);
    } catch (error: any) {
      console.error(`[P&L] Error updating trade ${trade.id}:`, error.message);
      totalPnlCents += trade.currentPnl ?? 0;
    }
  }

  // Re-check if all trades are closed
  const openTrades = await db
    .select()
    .from(optionPortfolioTrades)
    .where(
      and(
        eq(optionPortfolioTrades.portfolioId, portfolioId),
        eq(optionPortfolioTrades.status, 'open'),
      ),
    );
  const allClosed = openTrades.length === 0;

  // Update portfolio totals
  const portfolioValueCents = INITIAL_CAPITAL_CENTS + totalPnlCents;
  await db
    .update(optionPortfolios)
    .set({
      currentValue: portfolioValueCents,
      netPnl: totalPnlCents,
      lastUpdated: new Date(),
      status: allClosed ? 'closed' : 'active',
      updatedAt: new Date(),
    })
    .where(eq(optionPortfolios.id, portfolioId));

  // Record value history snapshot (upsert — same-day overwrite)
  const today = getTodayET();
  await upsertValueHistory(portfolioId, today, portfolioValueCents, totalPnlCents);

  console.log(
    `[P&L] Portfolio #${portfolioId}: value=$${fromCents(portfolioValueCents).toFixed(2)}, ` +
    `pnl=$${fromCents(totalPnlCents).toFixed(2)}`,
  );
}

// ---------------------------------------------------------------------------
// Expiration handler
// ---------------------------------------------------------------------------

async function handleExpiration(
  trade: typeof optionPortfolioTrades.$inferSelect,
): Promise<void> {
  // Get stock closing / current price (in cents) with multiple fallbacks
  let stockPriceCents = 0;
  try {
    const realtimePrice = await getCurrentStockPrice(trade.ticker);
    if (realtimePrice != null && realtimePrice > 0) stockPriceCents = realtimePrice;
  } catch {}

  // Fallback: try close price on expiration date
  if (stockPriceCents === 0) {
    try {
      await sleep(RATE_LIMIT_DELAY);
      const closePrice = await getStockClosePrice(trade.ticker, trade.expirationDate);
      if (closePrice != null && closePrice > 0) stockPriceCents = closePrice;
    } catch {}
  }

  // Fallback: use stored current stock price or entry price
  if (stockPriceCents === 0) {
    stockPriceCents = trade.currentStockPrice ?? trade.stockPriceAtEntry ?? 0;
  }

  if (stockPriceCents === 0) {
    console.warn(
      `[Expiration] No stock price available for trade #${trade.id} (${trade.ticker}), skipping expiration`,
    );
    return;
  }

  // calculateExpiredPnL takes strikes in DOLLARS, premium in cents, stock in cents
  const sellStrikeDollars = fromCents(trade.sellStrike);
  const buyStrikeDollars = fromCents(trade.buyStrike);

  const { pnl, status, isItm } = calculateExpiredPnL(
    sellStrikeDollars,
    buyStrikeDollars,
    trade.premiumCollected, // cents per contract
    stockPriceCents,        // cents
    trade.contracts,
  );

  await db
    .update(optionPortfolioTrades)
    .set({
      status,
      currentPnl: pnl,
      currentStockPrice: stockPriceCents,
      currentSpreadValue: 0,
      isItm,
      updatedAt: new Date(),
    })
    .where(eq(optionPortfolioTrades.id, trade.id));

  console.log(
    `[Expiration] Trade #${trade.id} (${trade.ticker}): ${status}, ` +
    `P&L: $${fromCents(pnl).toFixed(2)}, stock=$${fromCents(stockPriceCents).toFixed(2)}`,
  );
}

// ============================================================================
// History
// ============================================================================

export async function getPortfolioHistory(portfolioId: number) {
  return db
    .select()
    .from(optionPortfolioValueHistory)
    .where(eq(optionPortfolioValueHistory.portfolioId, portfolioId))
    .orderBy(asc(optionPortfolioValueHistory.date));
}

// ============================================================================
// Snapshot upsert (same-day overwrite from SwingTrade pattern)
// ============================================================================

async function upsertValueHistory(
  portfolioId: number,
  date: string,
  portfolioValue: number,
  netPnl: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(optionPortfolioValueHistory)
    .where(
      and(
        eq(optionPortfolioValueHistory.portfolioId, portfolioId),
        eq(optionPortfolioValueHistory.date, date),
      ),
    );

  if (existing) {
    await db
      .update(optionPortfolioValueHistory)
      .set({ portfolioValue, netPnl })
      .where(eq(optionPortfolioValueHistory.id, existing.id));
  } else {
    await db.insert(optionPortfolioValueHistory).values({
      portfolioId,
      date,
      portfolioValue,
      netPnl,
    });
  }
}

// ============================================================================
// Additional queries
// ============================================================================

/**
 * Get portfolios for a specific scan date.
 * Optionally filter by scanName.
 */
export async function getPortfoliosByDate(scanDate: string, scanName?: string) {
  const conditions = [eq(optionPortfolios.scanDate, scanDate)];
  if (scanName) {
    conditions.push(eq(optionPortfolios.scanName, scanName));
  }
  return db
    .select()
    .from(optionPortfolios)
    .where(and(...conditions))
    .orderBy(asc(optionPortfolios.type));
}

/**
 * Get all portfolios with value history for performance comparison.
 * Used by the comparison chart to show Top Return vs Top Probability over time.
 * Optionally filter by scanName.
 */
export async function getPortfolioComparison(scanName?: string) {
  const allPortfolios = scanName
    ? await db
        .select()
        .from(optionPortfolios)
        .where(eq(optionPortfolios.scanName, scanName))
        .orderBy(asc(optionPortfolios.scanDate))
    : await db
        .select()
        .from(optionPortfolios)
        .orderBy(asc(optionPortfolios.scanDate));

  const allSnapshots = await db
    .select()
    .from(optionPortfolioValueHistory)
    .orderBy(asc(optionPortfolioValueHistory.date));

  // Group snapshots by portfolio
  const snapshotsByPortfolio: Record<
    number,
    { date: string; portfolioValue: number; netPnl: number }[]
  > = {};
  for (const s of allSnapshots) {
    if (!snapshotsByPortfolio[s.portfolioId]) {
      snapshotsByPortfolio[s.portfolioId] = [];
    }
    snapshotsByPortfolio[s.portfolioId].push({
      date: s.date,
      portfolioValue: s.portfolioValue,
      netPnl: s.netPnl,
    });
  }

  return allPortfolios.map(p => ({
    id: p.id,
    type: p.type,
    scanDate: p.scanDate,
    scanName: p.scanName,
    status: p.status,
    initialCapital: p.initialCapital,
    currentValue: p.currentValue,
    netPnl: p.netPnl,
    totalPremiumCollected: p.totalPremiumCollected,
    snapshots: snapshotsByPortfolio[p.id] || [],
  }));
}

/**
 * Get all trades across all portfolios for the AllTrades table.
 * Optionally filter by scanName.
 */
export async function getAllTrades(scanName?: string) {
  const trades = await db
    .select()
    .from(optionPortfolioTrades)
    .orderBy(desc(optionPortfolioTrades.expirationDate));

  // Get portfolio info for each trade
  const portfolioIds = [...new Set(trades.map(t => t.portfolioId))];
  const portfolioMap: Record<number, typeof optionPortfolios.$inferSelect> = {};

  for (const id of portfolioIds) {
    const [p] = await db.select().from(optionPortfolios).where(eq(optionPortfolios.id, id));
    if (p) portfolioMap[id] = p;
  }

  let result = trades.map(t => ({
    ...t,
    portfolioType: portfolioMap[t.portfolioId]?.type,
    portfolioScanDate: portfolioMap[t.portfolioId]?.scanDate,
    portfolioScanName: portfolioMap[t.portfolioId]?.scanName,
  }));

  // Filter by scanName if provided
  if (scanName) {
    result = result.filter(t => t.portfolioScanName === scanName);
  }

  return result;
}

/**
 * Update P&L for a single portfolio (public, for manual update button).
 */
export { updatePortfolioPnl };
