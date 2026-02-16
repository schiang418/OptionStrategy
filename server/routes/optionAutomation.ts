import { Router } from 'express';
import { scrapeOptionSamurai, testLogin } from '../services/scraper.js';
import {
  saveScanResults,
  scanExistsForDate,
  deleteScanDataForDate,
  createPortfoliosFromScan,
} from '../services/portfolio.js';
import { getTodayET } from '../utils/dates.js';
import { isTradingDay, getNextTradingDay } from '../services/polygon.js';

const router = Router();

/**
 * POST /api/option-automation/test-login
 * Test Option Samurai credentials.
 */
router.post('/test-login', async (_req, res) => {
  try {
    const result = await testLogin();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/option-automation/scan
 * Run Option Samurai scan, save results.
 * Supports same-day overwrite: if overwrite=true, deletes existing data first.
 */
router.post('/scan', async (req, res) => {
  try {
    const scanName = (req.body?.scanName as string) || 'bi-weekly income all';
    const overwrite = req.body?.overwrite === true;
    const scanDate = getTodayET();

    // Same-day overwrite support
    const exists = await scanExistsForDate(scanDate, scanName);
    if (exists && !overwrite) {
      return res.json({
        success: true,
        message: `Scan already exists for ${scanDate}. Use overwrite=true to replace.`,
        scanDate,
        alreadyExists: true,
      });
    }

    if (exists && overwrite) {
      console.log(`[API] Overwriting existing scan data for ${scanDate}`);
      await deleteScanDataForDate(scanDate);
    }

    console.log(`[API] Running scan "${scanName}" for ${scanDate}...`);
    const results = await scrapeOptionSamurai(scanName);

    if (results.length === 0) {
      return res.json({
        success: false,
        message: 'No results found from scan',
        scanDate,
      });
    }

    const count = await saveScanResults(results, scanName, scanDate);

    res.json({
      success: true,
      message: `Saved ${count} scan results`,
      scanDate,
      resultCount: count,
    });
  } catch (error: any) {
    console.error('[API] Scan error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/option-automation/monday-workflow
 * Full Monday workflow: check market open, scan, create portfolios.
 * If Monday is a market holiday, shifts to the next trading day.
 * Also serves as the endpoint for manual trigger.
 */
router.post('/monday-workflow', async (req, res) => {
  try {
    const scanName = (req.body?.scanName as string) || 'bi-weekly income all';
    const force = req.body?.force === true;
    const today = getTodayET();

    console.log(`[API] Monday workflow starting for ${today}...`);

    // Check if today is a trading day (unless forced)
    if (!force) {
      const tradingDay = await isTradingDay(today);
      if (!tradingDay) {
        const nextDay = await getNextTradingDay(today);
        console.log(`[API] ${today} is not a trading day. Next trading day: ${nextDay}`);
        return res.json({
          success: true,
          skipped: true,
          message: `${today} is not a trading day (holiday/weekend). Next trading day: ${nextDay}`,
          nextTradingDay: nextDay,
        });
      }
    }

    // Step 1: Run scan (same-day overwrite)
    const exists = await scanExistsForDate(today, scanName);
    if (exists) {
      console.log(`[API] Overwriting existing scan data for ${today}`);
      await deleteScanDataForDate(today);
    }

    console.log('[API] Running scan...');
    const results = await scrapeOptionSamurai(scanName);
    const scanCount = await saveScanResults(results, scanName, today);
    console.log(`[API] Saved ${scanCount} scan results`);

    // Step 2: Create portfolios
    const tradesPerPortfolio = typeof req.body?.tradesPerPortfolio === 'number'
      ? req.body.tradesPerPortfolio
      : undefined;
    console.log(`[API] Creating portfolios (${tradesPerPortfolio ?? 'default'} trades each)...`);
    const portfolios = await createPortfoliosFromScan(today, scanName, tradesPerPortfolio);

    res.json({
      success: true,
      message: 'Monday workflow complete',
      scanDate: today,
      scanResults: scanCount,
      portfoliosCreated: portfolios,
    });
  } catch (error: any) {
    console.error('[API] Monday workflow error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/option-automation/market-status
 * Check if the market is open today.
 */
router.get('/market-status', async (_req, res) => {
  try {
    const today = getTodayET();
    const isTrading = await isTradingDay(today);
    res.json({
      date: today,
      isTradingDay: isTrading,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
