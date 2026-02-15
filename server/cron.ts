import cron from 'node-cron';
import { scrapeOptionSamurai } from './services/scraper.js';
import {
  saveScanResults,
  scanExistsForDate,
  createPortfoliosFromScan,
  updateAllPortfolioPnl,
} from './services/portfolio.js';
import { getTodayET } from './utils/dates.js';

/**
 * Monday 9:30 AM ET (UTC 14:30): Run scan workflow
 * Scrape Option Samurai, save results, create portfolios.
 */
const mondayScanJob = cron.schedule('30 14 * * 1', async () => {
  console.log('[Cron] Monday scan workflow starting...');
  const scanName = 'bi-weekly income all';
  const scanDate = getTodayET();

  try {
    // Check idempotency
    const exists = await scanExistsForDate(scanDate, scanName);
    if (exists) {
      console.log(`[Cron] Scan already exists for ${scanDate}, skipping`);
      return;
    }

    // Run scan
    const results = await scrapeOptionSamurai(scanName);
    const count = await saveScanResults(results, scanName, scanDate);
    console.log(`[Cron] Saved ${count} scan results`);

    // Create portfolios
    const portfolios = await createPortfoliosFromScan(scanDate, scanName);
    console.log(`[Cron] Created portfolios:`, portfolios);
  } catch (error: any) {
    console.error('[Cron] Monday scan error:', error.message);
  }
}, {
  timezone: 'America/New_York',
});

/**
 * Daily 5:15 PM ET Mon-Fri (UTC 22:15): Update P&L
 * Get current option spread values and stock prices, check expirations, record value history.
 */
const dailyPnlJob = cron.schedule('15 22 * * 1-5', async () => {
  console.log('[Cron] Daily P&L update starting...');

  try {
    await updateAllPortfolioPnl();
    console.log('[Cron] Daily P&L update complete');
  } catch (error: any) {
    console.error('[Cron] Daily P&L update error:', error.message);
  }
}, {
  timezone: 'America/New_York',
});

export function startCronJobs() {
  console.log('[Cron] Starting cron jobs...');
  console.log('[Cron]   Monday scan: 9:30 AM ET');
  console.log('[Cron]   Daily P&L:   5:15 PM ET Mon-Fri');
  mondayScanJob.start();
  dailyPnlJob.start();
}

export function stopCronJobs() {
  mondayScanJob.stop();
  dailyPnlJob.stop();
}
