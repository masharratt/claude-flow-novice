/**
 * Events API Routes
 *
 * GET /api/events - Get paginated event history
 */

import { Router } from 'express';
import { transparencyService } from '../../services/transparency-service.js';
import { validate } from '../../middleware/validation.js';
import { EventsQuerySchema } from '../../schemas/validation.js';

const router = Router();

/**
 * GET /api/events
 *
 * Returns paginated event history
 * Query params: page, limit (default 50), type, severity, agentId, startTime, endTime
 * Sorting: Newest first
 * Max limit: 1000 events per request
 */
router.get(
  '/',
  validate({ query: EventsQuerySchema }),
  async (req, res, next) => {
    try {
      const query = req.query as any;

      const result = await transparencyService.getEvents({
        page: query.page || 1,
        limit: query.limit || 50,
        type: query.type,
        severity: query.severity,
        agentId: query.agentId,
        startTime: query.startTime,
        endTime: query.endTime,
      });

      res.json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
