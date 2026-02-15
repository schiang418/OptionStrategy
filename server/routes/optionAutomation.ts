import { Router } from 'express';
import { scrapeOptionSamurai, testLogin } from '../services/scraper.js';
import {
  saveScanResults,
  scanExistsForDate,
  createPortfoliosFromScan,
} from '../services/portfolio.js';
import { getTodayET } from '../utils/dates.js';

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
 */
router.post('/scan', async (req, res) => {
  try {
    const scanName = (req.body?.scanName as string) || 'bi-weekly income all';
    const scanDate = getTodayET();

    // Check idempotency
    const exists = await scanExistsForDate(scanDate, scanName);
    if (exists) {
      return res.json({
        success: true,
        message: `Scan already exists for ${scanDate}`,
        scanDate,
        alreadyExists: true,
      });
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
 * Full workflow: scan + create portfolios. Manually triggerable any day.
 */
router.post('/monday-workflow', async (req, res) => {
  try {
    const scanName = (req.body?.scanName as string) || 'bi-weekly income all';
    const scanDate = getTodayET();

    console.log(`[API] Running Monday workflow for ${scanDate}...`);

    // Step 1: Run scan (idempotent)
    const exists = await scanExistsForDate(scanDate, scanName);
    let scanCount = 0;

    if (!exists) {
      console.log('[API] Running scan...');
      const results = await scrapeOptionSamurai(scanName);
      scanCount = await saveScanResults(results, scanName, scanDate);
      console.log(`[API] Saved ${scanCount} scan results`);
    } else {
      console.log('[API] Scan already exists, skipping scrape');
    }

    // Step 2: Create portfolios (idempotent)
    console.log('[API] Creating portfolios...');
    const portfolios = await createPortfoliosFromScan(scanDate, scanName);

    res.json({
      success: true,
      message: 'Monday workflow complete',
      scanDate,
      scanResults: exists ? 'already existed' : `${scanCount} saved`,
      portfoliosCreated: portfolios,
    });
  } catch (error: any) {
    console.error('[API] Monday workflow error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
