/**
 * Agent API Routes
 *
 * GET /api/agents/hierarchy - Get agent hierarchy
 * GET /api/agents/:id/status - Get agent status
 * POST /api/agents/:id/intervene - Trigger agent intervention
 */

import { Router } from 'express';
import { transparencyService } from '../../services/transparency-service.js';
import { validate } from '../../middleware/validation.js';
import {
  AgentHierarchyQuerySchema,
  AgentIdParamSchema,
  InterventionRequestSchema,
} from '../../schemas/validation.js';
import { APIError } from '../../middleware/error-handler.js';
import { interventionRateLimiter } from '../../middleware/rate-limiter.js';
import { requireAdmin } from '../../middleware/rbac.js';
import { authenticateJWT } from '../../middleware/authentication.js';

const router = Router();

/**
 * GET /api/agents/hierarchy
 *
 * Returns complete agent hierarchy tree with optional filters
 * Caching: 30 second cache
 */
router.get(
  '/hierarchy',
  validate({ query: AgentHierarchyQuerySchema }),
  async (req, res, next) => {
    try {
      const { status, type } = req.query as any;

      const hierarchy = await transparencyService.getAgentHierarchy({
        status,
        type,
      });

      // Set cache headers
      res.set('Cache-Control', 'public, max-age=30');

      res.json({ data: hierarchy });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/agents/:id/status
 *
 * Returns individual agent status with metrics
 * Real-time: Updated every 5 seconds
 */
router.get(
  '/:id/status',
  validate({ params: AgentIdParamSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const status = await transparencyService.getAgentStatus(id);

      // Set no-cache headers for real-time data
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

      res.json({ data: status });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        next(new APIError(404, 'AGENT_NOT_FOUND', `Agent ${req.params.id} not found`));
      } else {
        next(error);
      }
    }
  }
);

/**
 * POST /api/agents/:id/intervene
 *
 * Triggers agent intervention (pause, resume, terminate, restart)
 * Rate limiting: 10 req/min per IP
 * Authentication: Required (Admin only - MED-003 fix)
 */
router.post(
  '/:id/intervene',
  authenticateJWT,
  requireAdmin,
  interventionRateLimiter,
  validate({
    params: AgentIdParamSchema,
    body: InterventionRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { action, reason } = req.body;

      // MED-003 Fix: Authentication now enforced via authenticateJWT and requireAdmin middleware
      // Only admin users can trigger agent interventions

      const result = await transparencyService.interventeAgent(id, action, reason);

      res.json({
        success: result.success,
        message: result.message,
        agentId: id,
        action,
        triggeredBy: req.user?.userId, // Audit trail
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        next(new APIError(404, 'AGENT_NOT_FOUND', `Agent ${req.params.id} not found`));
      } else {
        next(error);
      }
    }
  }
);

export default router;
