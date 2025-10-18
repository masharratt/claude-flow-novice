/**
 * Status API Routes
 *
 * REST API endpoints for agent status monitoring and real-time information
 *
 * @module web/api/routes/status
 */

import { Router, Request, Response } from 'express';
import type { ITransparencySystem } from '../../coordination/shared/transparency/interfaces/transparency-system.js';
import type { AgentStatus } from '../../coordination/shared/transparency/interfaces/transparency-system.js';
import type { Logger } from '../../../core/logger.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validationMiddleware, commonSchemas } from '../middleware/validation.js';

/**
 * Create status routes
 */
export function statusRoutes(
  transparencySystem: ITransparencySystem,
  logger: Logger
): Router {
  const router = Router();

  /**
   * GET /api/v1/status
   * Get all agent statuses
   */
  router.get('/',
    validationMiddleware({
      query: {
        ...commonSchemas.pagination,
        ...commonSchemas.stateFilter
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { page = 1, limit = 20, sort = 'lastHeartbeat', order = 'desc', state } = req.query as any;
      logger.info('Getting all agent statuses', { page, limit, sort, order, state });

      let statuses = await transparencySystem.getAllAgentStatuses();

      // Apply state filter
      if (state) {
        statuses = statuses.filter(status => status.state === state);
      }

      // Apply sorting
      statuses = sortStatuses(statuses, sort as string, order as string);

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedStatuses = statuses.slice(startIndex, endIndex);

      res.json({
        data: paginatedStatuses,
        pagination: {
          page,
          limit,
          total: statuses.length,
          pages: Math.ceil(statuses.length / limit)
        },
        meta: {
          sort,
          order,
          filters: { state },
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/status/agent/:agentId
   * Get specific agent status
   */
  router.get('/agent/:agentId',
    validationMiddleware({
      params: commonSchemas.agentIdParam
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { agentId } = req.params;
      logger.info(`Getting status for agent ${agentId}`);

      try {
        const status = await transparencySystem.getAgentStatus(agentId);

        res.json({
          data: status,
          meta: {
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: `Agent ${agentId} not found`,
          timestamp: new Date().toISOString()
        });
      }
    })
  );

  /**
   * GET /api/v1/status/active
   * Get currently active agents
   */
  router.get('/active',
    validationMiddleware({
      query: commonSchemas.pagination
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { page = 1, limit = 20 } = req.query as any;
      logger.info('Getting active agents');

      const activeAgents = await transparencySystem.getActiveAgents();

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedAgents = activeAgents.slice(startIndex, endIndex);

      res.json({
        data: paginatedAgents,
        pagination: {
          page,
          limit,
          total: activeAgents.length,
          pages: Math.ceil(activeAgents.length / limit)
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/status/paused
   * Get currently paused agents
   */
  router.get('/paused',
    validationMiddleware({
      query: commonSchemas.pagination
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { page = 1, limit = 20 } = req.query as any;
      logger.info('Getting paused agents');

      const pausedAgents = await transparencySystem.getPausedAgents();

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedAgents = pausedAgents.slice(startIndex, endIndex);

      res.json({
        data: paginatedAgents,
        pagination: {
          page,
          limit,
          total: pausedAgents.length,
          pages: Math.ceil(pausedAgents.length / limit)
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/status/summary
   * Get status summary statistics
   */
  router.get('/summary',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Getting status summary');

      const allStatuses = await transparencySystem.getAllAgentStatuses();
      const summary = calculateStatusSummary(allStatuses);

      res.json({
        data: summary,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/status/errors
   * Get agents with recent errors
   */
  router.get('/errors',
    validationMiddleware({
      query: {
        ...commonSchemas.pagination,
        severity: {
          type: 'string',
          enum: ['warning', 'error', 'critical'],
          description: 'Error severity filter'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { page = 1, limit = 20, severity } = req.query as any;
      logger.info('Getting agents with errors', { severity });

      const allStatuses = await transparencySystem.getAllAgentStatuses();
      const agentsWithErrors = allStatuses.filter(status => {
        if (!status.recentErrors || status.recentErrors.length === 0) {
          return false;
        }

        if (severity) {
          return status.recentErrors.some(error => error.severity === severity);
        }

        return true;
      });

      // Sort by most recent error
      agentsWithErrors.sort((a, b) => {
        const aLatestError = a.recentErrors![0];
        const bLatestError = b.recentErrors![0];
        return bLatestError.timestamp.getTime() - aLatestError.timestamp.getTime();
      });

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedAgents = agentsWithErrors.slice(startIndex, endIndex);

      res.json({
        data: paginatedAgents,
        pagination: {
          page,
          limit,
          total: agentsWithErrors.length,
          pages: Math.ceil(agentsWithErrors.length / limit)
        },
        meta: {
          severity,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/status/performance
   * Get performance metrics for all agents
   */
  router.get('/performance',
    validationMiddleware({
      query: {
        ...commonSchemas.pagination,
        sortBy: {
          type: 'string',
          enum: ['tokenUsageRate', 'memoryUsage', 'cpuUsage', 'progress'],
          default: 'tokenUsageRate',
          description: 'Performance metric to sort by'
        },
        threshold: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Performance threshold filter'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { page = 1, limit = 20, sortBy = 'tokenUsageRate', threshold } = req.query as any;
      logger.info('Getting agent performance metrics', { sortBy, threshold });

      const allStatuses = await transparencySystem.getAllAgentStatuses();

      // Apply threshold filter if specified
      let filteredStatuses = allStatuses;
      if (threshold !== undefined) {
        filteredStatuses = allStatuses.filter(status => {
          switch (sortBy) {
            case 'tokenUsageRate':
              return status.tokenUsageRate >= threshold;
            case 'memoryUsage':
              return (status.memoryUsage / (1024 * 1024)) >= threshold; // Convert to MB
            case 'cpuUsage':
              return status.cpuUsage >= threshold;
            case 'progress':
              return status.progress >= threshold;
            default:
              return true;
          }
        });
      }

      // Sort by performance metric
      filteredStatuses.sort((a, b) => {
        const aValue = getPerformanceMetric(a, sortBy);
        const bValue = getPerformanceMetric(b, sortBy);
        return bValue - aValue; // Descending order
      });

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedAgents = filteredStatuses.slice(startIndex, endIndex);

      res.json({
        data: paginatedAgents,
        pagination: {
          page,
          limit,
          total: filteredStatuses.length,
          pages: Math.ceil(filteredStatuses.length / limit)
        },
        meta: {
          sortBy,
          threshold,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/status/heartbeat
   * Get recent heartbeat information
   */
  router.get('/heartbeat',
    validationMiddleware({
      query: {
        staleMinutes: {
          type: 'integer',
          minimum: 1,
          maximum: 60,
          default: 5,
          description: 'Minutes since last heartbeat to consider stale'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { staleMinutes = 5 } = req.query as any;
      logger.info('Getting heartbeat information', { staleMinutes });

      const allStatuses = await transparencySystem.getAllAgentStatuses();
      const now = new Date();
      const staleThreshold = staleMinutes * 60 * 1000; // Convert to milliseconds

      const heartbeatInfo = allStatuses.map(status => {
        const timeSinceLastHeartbeat = now.getTime() - status.lastHeartbeat.getTime();
        const isStale = timeSinceLastHeartbeat > staleThreshold;

        return {
          agentId: status.agentId,
          lastHeartbeat: status.lastHeartbeat,
          timeSinceLastHeartbeatMs: timeSinceLastHeartbeat,
          isStale,
          status: isStale ? 'stale' : 'healthy'
        };
      });

      // Sort by most recent heartbeat
      heartbeatInfo.sort((a, b) => a.timeSinceLastHeartbeatMs - b.timeSinceLastHeartbeatMs);

      res.json({
        data: heartbeatInfo,
        meta: {
          staleThresholdMinutes: staleMinutes,
          totalAgents: allStatuses.length,
          staleAgents: heartbeatInfo.filter(info => info.isStale).length,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  return router;
}

/**
 * Sort agent statuses by specified field
 */
function sortStatuses(statuses: AgentStatus[], sortBy: string, order: string): AgentStatus[] {
  const sorted = [...statuses].sort((a, b) => {
    let aValue: any, bValue: any;

    switch (sortBy) {
      case 'agentId':
        aValue = a.agentId;
        bValue = b.agentId;
        break;
      case 'state':
        aValue = a.state;
        bValue = b.state;
        break;
      case 'activity':
        aValue = a.activity;
        bValue = b.activity;
        break;
      case 'progress':
        aValue = a.progress;
        bValue = b.progress;
        break;
      case 'tokensUsed':
        aValue = a.tokensUsed;
        bValue = b.tokensUsed;
        break;
      case 'tokenUsageRate':
        aValue = a.tokenUsageRate;
        bValue = b.tokenUsageRate;
        break;
      case 'memoryUsage':
        aValue = a.memoryUsage;
        bValue = b.memoryUsage;
        break;
      case 'cpuUsage':
        aValue = a.cpuUsage;
        bValue = b.cpuUsage;
        break;
      case 'lastHeartbeat':
        aValue = a.lastHeartbeat.getTime();
        bValue = b.lastHeartbeat.getTime();
        break;
      default:
        aValue = a.agentId;
        bValue = b.agentId;
    }

    if (typeof aValue === 'string') {
      return order === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return order === 'asc' ? aValue - bValue : bValue - aValue;
  });

  return sorted;
}

/**
 * Calculate status summary statistics
 */
function calculateStatusSummary(statuses: AgentStatus[]): any {
  const summary = {
    totalAgents: statuses.length,
    agentsByState: {} as Record<string, number>,
    agentsByActivity: {} as Record<string, number>,
    totalTokensUsed: 0,
    averageTokenUsageRate: 0,
    totalMemoryUsage: 0,
    averageCpuUsage: 0,
    averageProgress: 0,
    activeAgents: 0,
    pausedAgents: 0,
    agentsWithErrors: 0,
    totalErrors: 0
  };

  let totalTokenUsageRate = 0;
  let totalCpuUsage = 0;
  let totalProgress = 0;

  statuses.forEach(status => {
    // Count by state
    summary.agentsByState[status.state] = (summary.agentsByState[status.state] || 0) + 1;

    // Count by activity
    summary.agentsByActivity[status.activity] = (summary.agentsByActivity[status.activity] || 0) + 1;

    // Token metrics
    summary.totalTokensUsed += status.tokensUsed;
    totalTokenUsageRate += status.tokenUsageRate;

    // Performance metrics
    summary.totalMemoryUsage += status.memoryUsage;
    totalCpuUsage += status.cpuUsage;
    totalProgress += status.progress;

    // Agent status counts
    if (!status.isPaused && status.state !== 'terminated') {
      summary.activeAgents++;
    }
    if (status.isPaused) {
      summary.pausedAgents++;
    }

    // Error metrics
    if (status.recentErrors && status.recentErrors.length > 0) {
      summary.agentsWithErrors++;
      summary.totalErrors += status.recentErrors.length;
    }
  });

  // Calculate averages
  summary.averageTokenUsageRate = statuses.length > 0 ? totalTokenUsageRate / statuses.length : 0;
  summary.averageCpuUsage = statuses.length > 0 ? totalCpuUsage / statuses.length : 0;
  summary.averageProgress = statuses.length > 0 ? totalProgress / statuses.length : 0;

  return summary;
}

/**
 * Get specific performance metric from agent status
 */
function getPerformanceMetric(status: AgentStatus, metric: string): number {
  switch (metric) {
    case 'tokenUsageRate':
      return status.tokenUsageRate;
    case 'memoryUsage':
      return status.memoryUsage;
    case 'cpuUsage':
      return status.cpuUsage;
    case 'progress':
      return status.progress;
    case 'tokensUsed':
      return status.tokensUsed;
    default:
      return 0;
  }
}