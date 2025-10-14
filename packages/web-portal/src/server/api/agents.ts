/**
 * Agents API
 *
 * Hybrid routing endpoint for worker agents with metadata
 * Supports filtering by status, provider, and confidence range
 * Returns worker metadata: subtask, tokens, cost, duration, provider
 * Rate limiting: 100 requests per 15 minutes per IP
 */

import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { eventStoreService } from '../services/event-store.js';

const router = Router();

// Rate limiter: 100 requests per 15 minutes per IP
const agentsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

/**
 * Zod schema for GET /api/agents/hybrid query parameters
 */
const HybridAgentsQuerySchema = z.object({
  status: z.enum(['active', 'completed', 'failed']).optional(),
  provider: z.enum(['zai', 'anthropic']).optional(),
  confidence_min: z.coerce.number().min(0).max(1).optional(),
  confidence_max: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
}).refine(
  (data) => {
    if (data.confidence_min !== undefined && data.confidence_max !== undefined) {
      return data.confidence_min <= data.confidence_max;
    }
    return true;
  },
  {
    message: "confidence_min must be less than or equal to confidence_max"
  }
);

/**
 * Hybrid worker interface
 */
interface HybridWorker {
  workerId: string;
  agentType: string;
  subtask: string;
  provider: string;
  confidence: number;
  tokens: {
    input: number;
    output: number;
  };
  cost: number;
  duration: number;
  status: string;
  timestamp: Date;
  files_modified: string[];
}

/**
 * GET /api/agents/hybrid
 * 
 * Returns hybrid worker agents with filtering capabilities
 * Query parameters:
 * - status: Filter by agent status (active/completed/failed)
 * - provider: Filter by provider (zai/anthropic)
 * - confidence_min: Minimum confidence score (0.0-1.0)
 * - confidence_max: Maximum confidence score (0.0-1.0)
 * - limit: Items per page (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 * 
 * Response includes worker metadata:
 * - workerId: Unique worker identifier
 * - agentType: Type of agent
 * - subtask: Current or last assigned subtask
 * - provider: AI provider used (zai/anthropic)
 * - confidence: Confidence score (0.0-1.0)
 * - tokens: Input and output token counts
 * - cost: Total cost incurred
 * - duration: Execution duration in milliseconds
 * - status: Current worker status
 * - timestamp: Last activity timestamp
 * - files_modified: List of modified files
 */
router.get(
  '/hybrid',
  agentsRateLimiter, // Apply rate limiting
  async (req, res, next) => {
    try {
      // Validate query parameters using Zod
      const validationResult = HybridAgentsQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: validationResult.error.errors
        });
      }

      const {
        status,
        provider,
        confidence_min,
        confidence_max,
        limit,
        offset
      } = validationResult.data;

      // Query event store with SQL-based filtering for efficiency
      const eventResult = await eventStoreService.queryEvents({
        eventType: 'hybrid_worker_update',
        limit,
        offset,
        payloadFilters: {
          status,
          provider,
          confidence_min,
          confidence_max
        }
      });

      // Transform events into hybrid worker data
      const hybridWorkers: HybridWorker[] = eventResult.events.map(event => {
        const payload = event.payload;
        return {
          workerId: event.agentId,
          agentType: payload.agentType || 'hybrid-worker',
          subtask: payload.subtask || 'Unknown task',
          provider: payload.provider || 'zai',
          confidence: payload.confidence || 0.5,
          tokens: {
            input: payload.tokens?.input || 0,
            output: payload.tokens?.output || 0
          },
          cost: payload.cost || 0,
          duration: payload.duration || 0,
          status: payload.status || 'active',
          timestamp: event.timestamp,
          files_modified: payload.files_modified || []
        };
      });

      const total = eventResult.total;
      const paginatedWorkers = hybridWorkers;

      // Set cache headers for 30 seconds
      res.set('Cache-Control', 'public, max-age=30');

      res.json({
        data: paginatedWorkers,
        meta: {
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
          },
          filters: {
            status: status || null,
            provider: provider || null,
            confidence_min: confidence_min || null,
            confidence_max: confidence_max || null
          },
          statistics: {
            totalWorkers: total,
            activeWorkers: hybridWorkers.filter(w => w.status === 'active').length,
            completedWorkers: hybridWorkers.filter(w => w.status === 'completed').length,
            failedWorkers: hybridWorkers.filter(w => w.status === 'failed').length,
            averageConfidence: hybridWorkers.length > 0 
              ? parseFloat((hybridWorkers.reduce((sum, w) => sum + w.confidence, 0) / hybridWorkers.length).toFixed(2))
              : 0,
            totalTokens: hybridWorkers.reduce((sum, w) => sum + w.tokens.input + w.tokens.output, 0),
            totalCost: parseFloat(hybridWorkers.reduce((sum, w) => sum + w.cost, 0).toFixed(4))
          }
        }
      });
    } catch (error) {
      console.error('Error in GET /api/agents/hybrid:', error);
      res.status(500).json({
        error: 'HYBRID_AGENTS_ERROR',
        message: 'Failed to fetch hybrid agents data'
      });
    }
  }
);

export default router;