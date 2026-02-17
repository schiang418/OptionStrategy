import { CronJob } from 'cron';
import { isTradingDay } from './services/polygon.js';

const PORT = parseInt(process.env.PORT || '3000');
const BASE = `http://localhost:${PORT}`;

/**
 * Enabled strategies and their configuration.
 * This mirrors the frontend strategies.ts config.
 */
const ENABLED_STRATEGIES = [
  { scanName: 'bi-weekly income all', tradesPerPortfolio: 5 },
  { scanName: 'Yearly income all', tradesPerPortfolio: 2 },
];

/**
 * Helper: POST to a local API endpoint with optional JSON body.
 * Using localhost fetch keeps all logic in the route handlers.
 */
async function localPost(path: string, body?: Record<string, any>): Promise<any> {
  const options: RequestInit = { method: 'POST' };
  if (body) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} responded ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Get today's date string (YYYY-MM-DD) in Eastern Time.
 */
function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Run the scan workflow for all enabled strategies.
 */
async function runScanWorkflow() {
  console.log('[Cron] Scan workflow starting for all strategies...');
  for (const strategy of ENABLED_STRATEGIES) {
    try {
      console.log(`[Cron] Running workflow for "${strategy.scanName}"...`);
      const result = await localPost('/api/option-automation/monday-workflow', {
        scanName: strategy.scanName,
        tradesPerPortfolio: strategy.tradesPerPortfolio,
      });
      console.log(`[Cron] ${strategy.scanName} result:`, result.message);
    } catch (error: any) {
      console.error(`[Cron] ${strategy.scanName} error:`, error.message);
    }
  }
  console.log('[Cron] Scan workflow complete for all strategies');
}

/**
 * Monday 9:30 AM ET: Run scan workflow.
 *
 * Uses the `cron` package (kelektiv) which relies on Luxon for timezone
 * handling, so DST transitions are handled correctly — 9:30 AM ET stays
 * 9:30 AM whether the clock is in EST or EDT.
 *
 * If Monday is a market holiday, the scan is automatically rescheduled
 * to fire at 9:30 AM ET on the next trading day (Tue–Fri).
 */
const mondayScanJob = CronJob.from({
  cronTime: '30 9 * * 1',
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
        console.log(`[Cron] Rescheduling scan to ${candidate} (${['Tue','Wed','Thu','Fri'][offset - 1]}) at 9:30 AM ET`);
        const makeup = CronJob.from({
          cronTime: '30 9 * * *',
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
 * Uses live Polygon data for option spreads and stock prices.
 * This updates ALL active portfolios regardless of strategy.
 */
const dailyPnlJob = CronJob.from({
  cronTime: '15 17 * * 1-5',
  onTick: async () => {
    console.log('[Cron] Daily P&L update starting...');
    try {
      const result = await localPost('/api/option-portfolios/update-pnl');
      console.log('[Cron] P&L update result:', result.message);
    } catch (error: any) {
      console.error('[Cron] Daily P&L update error:', error.message);
    }
  },
  timeZone: 'America/New_York',
  start: false,
});

export function startCronJobs() {
  console.log('[Cron] Starting cron jobs...');
  console.log(`[Cron]   Weekly scan:  Monday 9:30 AM ET (${ENABLED_STRATEGIES.length} strategies, auto-reschedules on holidays)`);
  console.log('[Cron]   Daily P&L:   5:15 PM ET Mon-Fri');
  mondayScanJob.start();
  dailyPnlJob.start();
}

export function stopCronJobs() {
  mondayScanJob.stop();
  dailyPnlJob.stop();
}
