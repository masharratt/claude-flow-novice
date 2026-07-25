/**
 * Metrics API Routes
 *
 * GET /api/metrics - Get system-wide metrics
 */

import { Router } from 'express';
import { transparencyService } from '../../services/transparency-service.js';

const router = Router();

/**
 * GET /api/metrics
 *
 * Returns system-wide metrics
 * Aggregation: Last 5 minutes average
 * Caching: 10 second cache
 */
router.get('/', async (req, res, next) => {
  try {
    const metrics = await transparencyService.getSystemMetrics();

    // Set cache headers
    res.set('Cache-Control', 'public, max-age=10');

    res.json({ data: metrics });
  } catch (error) {
    next(error);
  }
});

export default router;
