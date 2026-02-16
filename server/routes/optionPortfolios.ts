import { Router } from 'express';
import {
  getAllPortfolios,
  getPortfoliosByDate,
  getPortfolioWithTrades,
  updateAllPortfolioPnl,
  updatePortfolioPnl,
  getPortfolioHistory,
  getPortfolioComparison,
  getAllTrades,
} from '../services/portfolio.js';

const router = Router();

/**
 * GET /api/option-portfolios/comparison
 * Performance comparison data for all portfolios (grouped by type).
 * Optional ?scanName= filter.
 * NOTE: Must be defined BEFORE /:id to avoid Express matching "comparison" as an id.
 */
router.get('/comparison', async (req, res) => {
  try {
    const scanName = req.query.scanName as string | undefined;
    const data = await getPortfolioComparison(scanName);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/option-portfolios/trades
 * All trades across all portfolios.
 * Optional ?scanName= filter.
 */
router.get('/trades', async (req, res) => {
  try {
    const scanName = req.query.scanName as string | undefined;
    const trades = await getAllTrades(scanName);
    res.json(trades);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/option-portfolios
 * List all portfolios. Optional ?date= and ?scanName= filter.
 */
router.get('/', async (req, res) => {
  try {
    const { date, scanName } = req.query;
    const sn = typeof scanName === 'string' ? scanName : undefined;
    if (date && typeof date === 'string') {
      const portfolios = await getPortfoliosByDate(date, sn);
      return res.json(portfolios);
    }
    const portfolios = await getAllPortfolios(sn);
    res.json(portfolios);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/option-portfolios/:id
 * Portfolio detail with trades.
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid portfolio ID' });
    }

    const portfolio = await getPortfolioWithTrades(id);
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    res.json(portfolio);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/option-portfolios/update-pnl
 * Update P&L for all active portfolios.
 */
router.post('/update-pnl', async (_req, res) => {
  try {
    console.log('[API] Updating all portfolio P&L...');
    await updateAllPortfolioPnl();
    res.json({ success: true, message: 'P&L updated for all active portfolios' });
  } catch (error: any) {
    console.error('[API] P&L update error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/option-portfolios/:id/update-pnl
 * Update P&L for a single portfolio (manual update button).
 */
router.post('/:id/update-pnl', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid portfolio ID' });
    }

    console.log(`[API] Updating P&L for portfolio #${id}...`);
    await updatePortfolioPnl(id);
    res.json({ success: true, message: `P&L updated for portfolio #${id}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/option-portfolios/:id/history
 * Value history for charts.
 */
router.get('/:id/history', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid portfolio ID' });
    }

    const history = await getPortfolioHistory(id);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
