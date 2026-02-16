import { Router } from 'express';
import {
  getScanDates,
  getScanResultsByDate,
  deleteScanData,
} from '../services/portfolio.js';

const router = Router();

/**
 * GET /api/option-scans/dates
 * List all scan dates with result counts.
 * Optional ?scanName= filter.
 */
router.get('/dates', async (req, res) => {
  try {
    const scanName = req.query.scanName as string | undefined;
    const dates = await getScanDates(scanName);
    res.json(dates);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/option-scans/:date
 * Get scan results for a specific date.
 * Values are converted from cents/basis points to dollars/percentages.
 * Optional ?scanName= filter.
 */
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const scanName = req.query.scanName as string | undefined;
    const results = await getScanResultsByDate(date, scanName);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/option-scans/:date
 * Delete scan data and associated portfolios for a date.
 */
router.delete('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const scanName = req.query.scanName as string | undefined;
    const deletedCount = await deleteScanData(date, scanName);
    res.json({ success: true, deletedCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
