/**
 * Health API Routes
 *
 * GET /api/health - System health check
 */

import { Router } from 'express';
import { transparencyService } from '../../services/transparency-service.js';

const router = Router();

/**
 * GET /api/health
 *
 * System health check endpoint
 * No authentication required
 * Used by load balancers
 */
router.get('/', async (req, res, next) => {
  try {
    const health = await transparencyService.getHealthStatus();

    // Return appropriate HTTP status based on health
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    next(error);
  }
});

export default router;
