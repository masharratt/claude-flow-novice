/**
 * Resources API Routes
 *
 * GET /api/resources - Get resource utilization per agent
 */

import { Router } from 'express';
import { transparencyService } from '../../services/transparency-service.js';
import { validate } from '../../middleware/validation.js';
import { ResourcesQuerySchema } from '../../schemas/validation.js';

const router = Router();

/**
 * GET /api/resources
 *
 * Returns resource utilization per agent
 * Aggregation: Current snapshot
 * Filters: ?threshold=80 (show only agents above threshold)
 */
router.get(
  '/',
  validate({ query: ResourcesQuerySchema }),
  async (req, res, next) => {
    try {
      const { threshold } = req.query as any;

      const resources = await transparencyService.getResourceUtilization(
        threshold
      );

      res.json({ data: resources });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
