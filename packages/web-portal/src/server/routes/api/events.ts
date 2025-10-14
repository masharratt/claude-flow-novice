/**
 * Events API Routes
 * 
 * REST API endpoints for the Event Store Service
 * Integrates with the EventStoreController for event management
 */

import { Router } from 'express';
import { eventStoreController } from '../../services/event-store.integration.js';
import { authenticateApiKey } from '../../middleware/api-key-auth.js';
import { rateLimiter } from '../../middleware/rate-limiter.js';
import { validateRequest } from '../../middleware/validation.js';

const router = Router();

// Apply authentication and rate limiting to all routes
router.use(authenticateApiKey);
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 1000 })); // 1000 requests per 15 minutes

/**
 * POST /api/events
 * Store a single event
 */
router.post('/', validateRequest({
  body: {
    type: 'object',
    required: ['phaseId', 'agentId', 'eventType', 'payload'],
    properties: {
      timestamp: { type: 'string', format: 'date-time' },
      phaseId: { type: 'string', minLength: 1 },
      agentId: { type: 'string', minLength: 1 },
      eventType: { type: 'string', minLength: 1 },
      payload: { type: 'object' },
      metadata: { type: 'object' }
    }
  }
}), eventStoreController.storeEvent);

/**
 * POST /api/events/batch
 * Store multiple events in batch
 */
router.post('/batch', validateRequest({
  body: {
    type: 'object',
    required: ['events'],
    properties: {
      events: {
        type: 'array',
        minItems: 1,
        maxItems: 1000,
        items: {
          type: 'object',
          required: ['phaseId', 'agentId', 'eventType', 'payload'],
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            phaseId: { type: 'string', minLength: 1 },
            agentId: { type: 'string', minLength: 1 },
            eventType: { type: 'string', minLength: 1 },
            payload: { type: 'object' },
            metadata: { type: 'object' }
          }
        }
      }
    }
  }
}), eventStoreController.storeEvents);

/**
 * GET /api/events
 * Query events with filters
 */
router.get('/', validateRequest({
  query: {
    type: 'object',
    properties: {
      phaseId: { type: 'string' },
      agentId: { type: 'string' },
      eventType: { type: 'string' },
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      limit: { type: 'integer', minimum: 1, maximum: 1000 },
      offset: { type: 'integer', minimum: 0 }
    }
  }
}), eventStoreController.queryEvents);

/**
 * GET /api/events/phase/:phaseId
 * Get events by phase ID
 */
router.get('/phase/:phaseId', validateRequest({
  params: {
    type: 'object',
    required: ['phaseId'],
    properties: {
      phaseId: { type: 'string', minLength: 1 }
    }
  },
  query: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 1000 }
    }
  }
}), eventStoreController.getEventsByPhase);

/**
 * GET /api/events/agent/:agentId
 * Get events by agent ID
 */
router.get('/agent/:agentId', validateRequest({
  params: {
    type: 'object',
    required: ['agentId'],
    properties: {
      agentId: { type: 'string', minLength: 1 }
    }
  },
  query: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 1000 }
    }
  }
}), eventStoreController.getEventsByAgent);

/**
 * GET /api/events/stats
 * Get event store statistics
 */
router.get('/stats', eventStoreController.getStatistics);

/**
 * DELETE /api/events/:eventId
 * Delete an event by ID
 */
router.delete('/:eventId', validateRequest({
  params: {
    type: 'object',
    required: ['eventId'],
    properties: {
      eventId: { type: 'string', minLength: 1 }
    }
  }
}), eventStoreController.deleteEvent);

export default router;