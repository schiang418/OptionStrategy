import { Router } from 'express';
import {
  getAllPortfolios,
  getPortfolioWithTrades,
  updateAllPortfolioPnl,
  getPortfolioHistory,
} from '../services/portfolio.js';

const router = Router();

/**
 * GET /api/option-portfolios
 * List all portfolios.
 */
router.get('/', async (_req, res) => {
  try {
    const portfolios = await getAllPortfolios();
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
 * Update all active portfolios P&L.
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
