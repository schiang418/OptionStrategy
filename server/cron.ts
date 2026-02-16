import cron from 'node-cron';

const PORT = parseInt(process.env.PORT || '3000');
const BASE = `http://localhost:${PORT}`;

/**
 * Enabled strategies and their configuration.
 * This mirrors the frontend strategies.ts config.
 */
const ENABLED_STRATEGIES = [
  { scanName: 'bi-weekly income all', tradesPerPortfolio: 5 },
  { scanName: 'yearly income all', tradesPerPortfolio: 2 },
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
 * Monday 9:30 AM ET: Run full Monday workflow for all enabled strategies.
 * Calls the API endpoint which handles: market-day check, scan, portfolio creation.
 */
const mondayScanJob = cron.schedule(
  '30 9 * * 1',
  async () => {
    console.log('[Cron] Monday scan workflow starting for all strategies...');
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
    console.log('[Cron] Monday scan workflow complete for all strategies');
  },
  { timezone: 'America/New_York' },
);

/**
 * Daily 5:15 PM ET Mon-Fri: Update P&L for all active portfolios.
 * Uses live Polygon data for option spreads and stock prices.
 * This updates ALL active portfolios regardless of strategy.
 */
const dailyPnlJob = cron.schedule(
  '15 17 * * 1-5',
  async () => {
    console.log('[Cron] Daily P&L update starting...');
    try {
      const result = await localPost('/api/option-portfolios/update-pnl');
      console.log('[Cron] P&L update result:', result.message);
    } catch (error: any) {
      console.error('[Cron] Daily P&L update error:', error.message);
    }
  },
  { timezone: 'America/New_York' },
);

export function startCronJobs() {
  console.log('[Cron] Starting cron jobs...');
  console.log(`[Cron]   Monday scan:  9:30 AM ET (${ENABLED_STRATEGIES.length} strategies)`);
  console.log('[Cron]   Daily P&L:   5:15 PM ET Mon-Fri');
  mondayScanJob.start();
  dailyPnlJob.start();
}

export function stopCronJobs() {
  mondayScanJob.stop();
  dailyPnlJob.stop();
}
