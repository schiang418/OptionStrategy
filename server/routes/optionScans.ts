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
 */
router.get('/dates', async (_req, res) => {
  try {
    const dates = await getScanDates();
    res.json(dates);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/option-scans/:date
 * Get scan results for a specific date.
 */
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const results = await getScanResultsByDate(date);
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
    const deletedCount = await deleteScanData(date);
    res.json({ success: true, deletedCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
