/**
 * Events History API Routes
 *
 * REST API endpoints for querying historical swarm/agent events
 * Provides advanced filtering and analytics for event store data
 */

import { Router, Request, Response } from 'express';
import { eventStoreService } from '../../services/event-store.js';
import { authenticateApiKey } from '../../middleware/api-key-auth.js';
import { rateLimiter } from '../../middleware/rate-limiter.js';

const router = Router();

// Apply authentication and rate limiting
router.use(authenticateApiKey);
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 500 })); // 500 requests per 15 minutes

/**
 * GET /api/events-history
 * Query historical events with advanced filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      swarmId,
      phaseId,
      agentId,
      eventType,
      startTime,
      endTime,
      limit = 100,
      offset = 0
    } = req.query;

    // Validate pagination parameters
    const parsedLimit = Math.min(Math.max(parseInt(limit as string, 10) || 100, 1), 1000);
    const parsedOffset = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Parse date parameters
    const startDate = startTime ? new Date(startTime as string) : undefined;
    const endDate = endTime ? new Date(endTime as string) : undefined;

    // Validate dates
    if (startDate && isNaN(startDate.getTime())) {
      res.status(400).json({ error: 'Invalid startTime format' });
      return;
    }
    if (endDate && isNaN(endDate.getTime())) {
      res.status(400).json({ error: 'Invalid endTime format' });
      return;
    }

    // Query event store (swarmId maps to phaseId in event store)
    const result = await eventStoreService.queryEvents({
      phaseId: (swarmId || phaseId) as string | undefined,
      agentId: agentId as string | undefined,
      eventType: eventType as string | undefined,
      startDate,
      endDate,
      limit: parsedLimit,
      offset: parsedOffset
    });

    // Calculate query performance
    const queryTime = Date.now() - req.startTime;

    res.json({
      success: true,
      data: result.events,
      pagination: {
        total: result.total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: result.hasMore
      },
      performance: {
        queryTimeMs: queryTime,
        cached: false
      }
    });
  } catch (error) {
    console.error('Failed to query event history:', error);
    res.status(500).json({
      error: 'Failed to query event history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/events-history/swarm/:swarmId
 * Get event timeline for a specific swarm
 */
router.get('/swarm/:swarmId', async (req: Request, res: Response) => {
  try {
    const { swarmId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 1000);

    const result = await eventStoreService.queryEvents({
      phaseId: swarmId,
      limit
    });

    res.json({
      success: true,
      swarmId,
      data: result.events,
      count: result.events.length,
      total: result.total
    });
  } catch (error) {
    console.error('Failed to get swarm timeline:', error);
    res.status(500).json({
      error: 'Failed to get swarm timeline',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/events-history/agent/:agentId
 * Get event history for a specific agent
 */
router.get('/agent/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 1000);

    const result = await eventStoreService.queryEvents({
      agentId,
      limit
    });

    res.json({
      success: true,
      agentId,
      data: result.events,
      count: result.events.length,
      total: result.total
    });
  } catch (error) {
    console.error('Failed to get agent event history:', error);
    res.status(500).json({
      error: 'Failed to get agent event history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/events-history/statistics/swarm/:swarmId
 * Get event statistics and analytics for a swarm
 */
router.get('/statistics/swarm/:swarmId', async (req: Request, res: Response) => {
  try {
    const { swarmId } = req.params;

    // Get all events for the swarm
    const result = await eventStoreService.queryEvents({
      phaseId: swarmId,
      limit: 10000
    });

    // Calculate statistics
    const eventsByType: Record<string, number> = {};
    const agents = new Set<string>();
    const eventsOverTime: { hour: string; count: number }[] = [];

    result.events.forEach(event => {
      // Count by type
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;

      // Count unique agents
      if (event.agentId) {
        agents.add(event.agentId);
      }
    });

    // Group events by hour for timeline
    const eventsByHour: Record<string, number> = {};
    result.events.forEach(event => {
      const hour = new Date(event.timestamp).toISOString().slice(0, 13);
      eventsByHour[hour] = (eventsByHour[hour] || 0) + 1;
    });

    Object.entries(eventsByHour).forEach(([hour, count]) => {
      eventsOverTime.push({ hour, count });
    });

    res.json({
      success: true,
      swarmId,
      statistics: {
        totalEvents: result.total,
        eventsByType,
        agentCount: agents.size,
        startTime: result.events[result.events.length - 1]?.timestamp,
        endTime: result.events[0]?.timestamp,
        eventsOverTime: eventsOverTime.sort((a, b) => a.hour.localeCompare(b.hour))
      }
    });
  } catch (error) {
    console.error('Failed to get swarm statistics:', error);
    res.status(500).json({
      error: 'Failed to get swarm statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/events-history/recent
 * Get most recent events across all swarms
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 500);

    const result = await eventStoreService.queryEvents({ limit });

    res.json({
      success: true,
      data: result.events,
      count: result.events.length
    });
  } catch (error) {
    console.error('Failed to get recent events:', error);
    res.status(500).json({
      error: 'Failed to get recent events',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/events-history/cleanup
 * Trigger manual cleanup of expired events
 */
router.delete('/cleanup', async (req: Request, res: Response) => {
  try {
    const deletedCount = await eventStoreService.cleanupExpiredEvents();

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} expired events`,
      deletedCount
    });
  } catch (error) {
    console.error('Failed to cleanup expired events:', error);
    res.status(500).json({
      error: 'Failed to cleanup expired events',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Middleware to track query start time
router.use((req: Request, res: Response, next) => {
  req.startTime = Date.now();
  next();
});

// Type augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      startTime: number;
    }
  }
}

export default router;
