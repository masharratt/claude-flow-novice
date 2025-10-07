/**
 * Events API Routes
 *
 * REST API endpoints for agent lifecycle events and event streaming
 *
 * @module web/api/routes/events
 */

import { Router, Request, Response } from 'express';
import type { ITransparencySystem } from '../../coordination/shared/transparency/interfaces/transparency-system.js';
import type { AgentLifecycleEvent } from '../../coordination/shared/transparency/interfaces/transparency-system.js';
import type { Logger } from '../../../core/logger.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validationMiddleware, commonSchemas } from '../middleware/validation.js';

/**
 * Create events routes
 */
export function eventsRoutes(
  transparencySystem: ITransparencySystem,
  logger: Logger
): Router {
  const router = Router();

  /**
   * GET /api/v1/events
   * Get recent agent lifecycle events
   */
  router.get('/',
    validationMiddleware({
      query: {
        ...commonSchemas.pagination,
        ...commonSchemas.eventTypeFilter,
        ...commonSchemas.dateRange,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          default: 100,
          description: 'Maximum number of events to return'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { limit = 100, eventType, startDate, endDate, page = 1, pageSize = 50 } = req.query as any;
      logger.info('Getting recent events', { limit, eventType, startDate, endDate });

      let events: AgentLifecycleEvent[];

      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();
        events = await transparencySystem.getEventsInTimeRange(start, end, limit);
      } else {
        events = await transparencySystem.getRecentEvents(limit, eventType);
      }

      // Apply event type filter if not already applied
      if (eventType && startDate) {
        events = events.filter(event => event.eventType === eventType);
      }

      // Apply pagination
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedEvents = events.slice(startIndex, endIndex);

      res.json({
        data: paginatedEvents,
        pagination: {
          page,
          pageSize,
          total: events.length,
          pages: Math.ceil(events.length / pageSize)
        },
        meta: {
          filters: { eventType, startDate, endDate },
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/events/agent/:agentId
   * Get events for specific agent
   */
  router.get('/agent/:agentId',
    validationMiddleware({
      params: commonSchemas.agentIdParam,
      query: {
        ...commonSchemas.eventTypeFilter,
        ...commonSchemas.pagination,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          default: 50,
          description: 'Maximum number of events to return'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { agentId } = req.params;
      const { limit = 50, eventType, page = 1, pageSize = 20 } = req.query as any;
      logger.info(`Getting events for agent ${agentId}`, { limit, eventType });

      let events = await transparencySystem.getAgentEvents(agentId, limit);

      // Apply event type filter
      if (eventType) {
        events = events.filter(event => event.eventType === eventType);
      }

      // Apply pagination
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedEvents = events.slice(startIndex, endIndex);

      res.json({
        data: paginatedEvents,
        pagination: {
          page,
          pageSize,
          total: events.length,
          pages: Math.ceil(events.length / pageSize)
        },
        meta: {
          agentId,
          filters: { eventType },
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/events/types
   * Get available event types
   */
  router.get('/types',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Getting available event types');

      const eventTypes = [
        {
          type: 'spawned',
          description: 'Agent was created and initialized',
          category: 'lifecycle'
        },
        {
          type: 'paused',
          description: 'Agent execution was paused',
          category: 'state'
        },
        {
          type: 'resumed',
          description: 'Agent execution was resumed',
          category: 'state'
        },
        {
          type: 'terminated',
          description: 'Agent was terminated',
          category: 'lifecycle'
        },
        {
          type: 'checkpoint_created',
          description: 'Agent created a checkpoint',
          category: 'persistence'
        },
        {
          type: 'checkpoint_restored',
          description: 'Agent restored from a checkpoint',
          category: 'persistence'
        },
        {
          type: 'state_changed',
          description: 'Agent state changed',
          category: 'state'
        },
        {
          type: 'task_assigned',
          description: 'Task was assigned to agent',
          category: 'task'
        },
        {
          type: 'task_completed',
          description: 'Agent completed its task',
          category: 'task'
        },
        {
          type: 'error_occurred',
          description: 'Agent encountered an error',
          category: 'error'
        }
      ];

      res.json({
        data: eventTypes,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/events/stats
   * Get event statistics
   */
  router.get('/stats',
    validationMiddleware({
      query: {
        ...commonSchemas.dateRange,
        groupBy: {
          type: 'string',
          enum: ['type', 'agent', 'level', 'hour', 'day'],
          default: 'type',
          description: 'Group statistics by field'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { startDate, endDate, groupBy = 'type' } = req.query as any;
      logger.info('Getting event statistics', { startDate, endDate, groupBy });

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to last 24 hours
      const end = endDate ? new Date(endDate) : new Date();

      const events = await transparencySystem.getEventsInTimeRange(start, end, 10000);
      const stats = calculateEventStats(events, groupBy);

      res.json({
        data: stats,
        meta: {
          dateRange: { startDate: start, endDate: end },
          groupBy,
          totalEvents: events.length,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/events/recent
   * Get most recent events across all agents
   */
  router.get('/recent',
    validationMiddleware({
      query: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Number of recent events to return'
        },
        severity: {
          type: 'string',
          enum: ['info', 'warning', 'error', 'critical'],
          description: 'Filter by severity level'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { limit = 20, severity } = req.query as any;
      logger.info('Getting recent events', { limit, severity });

      let events = await transparencySystem.getRecentEvents(limit * 2); // Get more to filter

      // Filter by severity if specified
      if (severity) {
        events = events.filter(event => getEventSeverity(event) === severity);
      }

      // Sort by timestamp (most recent first) and limit
      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      const limitedEvents = events.slice(0, limit);

      res.json({
        data: limitedEvents,
        meta: {
          limit,
          severity,
          totalEvents: events.length,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/events/errors
   * Get recent error events
   */
  router.get('/errors',
    validationMiddleware({
      query: {
        ...commonSchemas.pagination,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 50,
          description: 'Maximum number of error events to return'
        },
        severity: {
          type: 'string',
          enum: ['error', 'critical'],
          default: 'error',
          description: 'Error severity filter'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { limit = 50, severity = 'error', page = 1, pageSize = 20 } = req.query as any;
      logger.info('Getting error events', { limit, severity });

      const allEvents = await transparencySystem.getRecentEvents(1000);
      const errorEvents = allEvents.filter(event => {
        const eventSeverity = getEventSeverity(event);
        return eventSeverity === 'error' || eventSeverity === 'critical';
      });

      // Sort by timestamp (most recent first)
      errorEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply pagination
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedEvents = errorEvents.slice(startIndex, endIndex);

      res.json({
        data: paginatedEvents,
        pagination: {
          page,
          pageSize,
          total: errorEvents.length,
          pages: Math.ceil(errorEvents.length / pageSize)
        },
        meta: {
          limit,
          severity,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/events/performance
   * Get performance-related events
   */
  router.get('/performance',
    validationMiddleware({
      query: {
        ...commonSchemas.pagination,
        metricType: {
          type: 'string',
          enum: ['token_usage', 'execution_time', 'memory', 'pause_resume'],
          description: 'Performance metric type'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { metricType, page = 1, pageSize = 20 } = req.query as any;
      logger.info('Getting performance events', { metricType });

      const allEvents = await transparencySystem.getRecentEvents(1000);
      const performanceEvents = allEvents.filter(event => {
        return event.eventType === 'checkpoint_created' ||
               event.eventType === 'checkpoint_restored' ||
               event.eventType === 'paused' ||
               event.eventType === 'resumed' ||
               (event.performanceImpact && (
                 event.performanceImpact.duration ||
                 event.performanceImpact.memoryDelta ||
                 event.performanceImpact.tokenCost
               ));
      });

      // Filter by metric type if specified
      let filteredEvents = performanceEvents;
      if (metricType) {
        filteredEvents = performanceEvents.filter(event => {
          switch (metricType) {
            case 'token_usage':
              return event.performanceImpact?.tokenCost;
            case 'execution_time':
              return event.performanceImpact?.duration;
            case 'memory':
              return event.performanceImpact?.memoryDelta;
            case 'pause_resume':
              return event.eventType === 'paused' || event.eventType === 'resumed';
            default:
              return true;
          }
        });
      }

      // Sort by timestamp (most recent first)
      filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply pagination
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

      res.json({
        data: paginatedEvents,
        pagination: {
          page,
          pageSize,
          total: filteredEvents.length,
          pages: Math.ceil(filteredEvents.length / pageSize)
        },
        meta: {
          metricType,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  return router;
}

/**
 * Calculate event statistics grouped by specified field
 */
function calculateEventStats(events: AgentLifecycleEvent[], groupBy: string): any {
  const stats = {
    totalEvents: events.length,
    groups: {} as Record<string, any>,
    timeRange: {
      earliest: events.length > 0 ? events[events.length - 1].timestamp : null,
      latest: events.length > 0 ? events[0].timestamp : null
    }
  };

  switch (groupBy) {
    case 'type':
      events.forEach(event => {
        stats.groups[event.eventType] = (stats.groups[event.eventType] || 0) + 1;
      });
      break;

    case 'agent':
      events.forEach(event => {
        stats.groups[event.agentId] = (stats.groups[event.agentId] || 0) + 1;
      });
      break;

    case 'level':
      events.forEach(event => {
        const level = `Level ${event.level}`;
        stats.groups[level] = (stats.groups[level] || 0) + 1;
      });
      break;

    case 'hour':
      events.forEach(event => {
        const hour = event.timestamp.getHours();
        const hourKey = `${hour.toString().padStart(2, '0')}:00`;
        stats.groups[hourKey] = (stats.groups[hourKey] || 0) + 1;
      });
      break;

    case 'day':
      events.forEach(event => {
        const day = event.timestamp.toLocaleDateString();
        stats.groups[day] = (stats.groups[day] || 0) + 1;
      });
      break;
  }

  return stats;
}

/**
 * Get event severity based on event type and data
 */
function getEventSeverity(event: AgentLifecycleEvent): string {
  switch (event.eventType) {
    case 'error_occurred':
      return event.eventData.errorMessage ? 'critical' : 'error';
    case 'terminated':
      return 'warning';
    case 'spawned':
    case 'task_completed':
      return 'info';
    case 'paused':
    case 'resumed':
    case 'state_changed':
      return 'info';
    case 'checkpoint_created':
    case 'checkpoint_restored':
      return 'info';
    case 'task_assigned':
      return 'info';
    default:
      return 'info';
  }
}