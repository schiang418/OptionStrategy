import cron from 'node-cron';

const PORT = parseInt(process.env.PORT || '3000');
const BASE = `http://localhost:${PORT}`;

/**
 * Helper: POST to a local API endpoint (SwingTrade pattern).
 * Using localhost fetch keeps all logic in the route handlers.
 */
async function localPost(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} responded ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Monday 10:00 AM ET: Run full Monday workflow.
 * Calls the API endpoint which handles: market-day check, scan, portfolio creation.
 */
const mondayScanJob = cron.schedule(
  '0 10 * * 1',
  async () => {
    console.log('[Cron] Monday scan workflow starting...');
    try {
      const result = await localPost('/api/option-automation/monday-workflow');
      console.log('[Cron] Monday workflow result:', result.message);
    } catch (error: any) {
      console.error('[Cron] Monday scan error:', error.message);
    }
  },
  { timezone: 'America/New_York' },
);

/**
 * Daily 4:50 PM ET Mon-Fri: Update P&L for all active portfolios.
 * Runs just before the market closes to capture end-of-day prices.
 */
const dailyPnlJob = cron.schedule(
  '50 16 * * 1-5',
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
  console.log('[Cron]   Monday scan: 10:00 AM ET');
  console.log('[Cron]   Daily P&L:   4:50 PM ET Mon-Fri');
  mondayScanJob.start();
  dailyPnlJob.start();
}

export function stopCronJobs() {
  mondayScanJob.stop();
  dailyPnlJob.stop();
}
