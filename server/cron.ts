import { CronJob } from 'cron';
import { isTradingDay } from './services/polygon.js';
import { scrapeOptionSamurai } from './services/scraper.js';
import {
  saveScanResults,
  scanExistsForDate,
  deleteScanDataForDate,
  createPortfoliosFromScan,
  updateAllPortfolioPnl,
} from './services/portfolio.js';
import { getTodayET } from './utils/dates.js';

/**
 * Enabled strategies and their configuration.
 * This mirrors the frontend strategies.ts config.
 */
const ENABLED_STRATEGIES = [
  { scanName: 'bi-weekly income all', tradesPerPortfolio: 5 },
  { scanName: 'Yearly income all', tradesPerPortfolio: 2 },
];

/**
 * Get today's date string (YYYY-MM-DD) in Eastern Time.
 */
function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Run the full Monday workflow for a single strategy.
 * Calls service functions directly (no HTTP, bypasses auth middleware).
 */
async function runWorkflowForStrategy(strategy: { scanName: string; tradesPerPortfolio: number }) {
  const today = getTodayET();

  // Overwrite if scan already exists for today
  const exists = await scanExistsForDate(today, strategy.scanName);
  if (exists) {
    console.log(`[Cron] Overwriting existing scan data for ${today} (${strategy.scanName})`);
    await deleteScanDataForDate(today, strategy.scanName);
  }

  // Step 1: Run scan
  console.log(`[Cron] Running scan "${strategy.scanName}"...`);
  const results = await scrapeOptionSamurai(strategy.scanName);
  const scanCount = await saveScanResults(results, strategy.scanName, today);
  console.log(`[Cron] Saved ${scanCount} scan results`);

  // Step 2: Create portfolios
  console.log(`[Cron] Creating portfolios (${strategy.tradesPerPortfolio} trades each)...`);
  const portfolios = await createPortfoliosFromScan(today, strategy.scanName, strategy.tradesPerPortfolio);
  const created = [portfolios.topReturn, portfolios.topProbability].filter(Boolean).length;
  console.log(`[Cron] Created ${created} portfolios`);
}

/**
 * Run the scan workflow for all enabled strategies.
 */
async function runScanWorkflow() {
  console.log('[Cron] Scan workflow starting for all strategies...');
  for (const strategy of ENABLED_STRATEGIES) {
    try {
      console.log(`[Cron] Running workflow for "${strategy.scanName}"...`);
      await runWorkflowForStrategy(strategy);
      console.log(`[Cron] ${strategy.scanName} complete`);
    } catch (error: any) {
      console.error(`[Cron] ${strategy.scanName} error:`, error.message);
    }
  }
  console.log('[Cron] Scan workflow complete for all strategies');
}

/**
 * Monday 10:00 AM ET: Run scan workflow.
 *
 * Uses the `cron` package (kelektiv) which relies on Luxon for timezone
 * handling, so DST transitions are handled correctly — 10:00 AM ET stays
 * 10:00 AM whether the clock is in EST or EDT.
 *
 * If Monday is a market holiday, the scan is automatically rescheduled
 * to fire at 10:00 AM ET on the next trading day (Tue–Fri).
 */
const mondayScanJob = CronJob.from({
  cronTime: '0 10 * * 1',
  onTick: async () => {
    const today = todayET();
    const trading = await isTradingDay(today);

    if (trading) {
      await runScanWorkflow();
      return;
    }

    // Monday is a holiday — schedule a one-shot job for the next trading day
    console.log(`[Cron] Monday ${today} is a market holiday, looking for next trading day...`);
    for (let offset = 1; offset <= 4; offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const candidate = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (await isTradingDay(candidate)) {
        console.log(`[Cron] Rescheduling scan to ${candidate} (${['Tue','Wed','Thu','Fri'][offset - 1]}) at 10:00 AM ET`);
        const makeup = CronJob.from({
          cronTime: '0 10 * * *',
          onTick: async () => {
            const nowDate = todayET();
            if (nowDate === candidate) {
              await runScanWorkflow();
              makeup.stop();
            }
          },
          timeZone: 'America/New_York',
          start: true,
        });
        return;
      }
    }
    console.warn('[Cron] Could not find a trading day this week');
  },
  timeZone: 'America/New_York',
  start: false,
});

/**
 * Daily 5:15 PM ET Mon-Fri: Update P&L for all active portfolios.
 * Calls updateAllPortfolioPnl() directly (no HTTP, bypasses auth middleware).
 */
const dailyPnlJob = CronJob.from({
  cronTime: '15 17 * * 1-5',
  onTick: async () => {
    console.log('[Cron] Daily P&L update starting...');
    try {
      await updateAllPortfolioPnl();
      console.log('[Cron] P&L update complete');
    } catch (error: any) {
      console.error('[Cron] Daily P&L update error:', error.message);
    }
  },
  timeZone: 'America/New_York',
  start: false,
});

export function startCronJobs() {
  console.log('[Cron] Starting cron jobs...');
  console.log(`[Cron]   Weekly scan:  Monday 10:00 AM ET (${ENABLED_STRATEGIES.length} strategies, auto-reschedules on holidays)`);
  console.log('[Cron]   Daily P&L:   5:15 PM ET Mon-Fri');
  mondayScanJob.start();
  dailyPnlJob.start();
}

export function stopCronJobs() {
  mondayScanJob.stop();
  dailyPnlJob.stop();
}
