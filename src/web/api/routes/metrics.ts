/**
 * Metrics API Routes
 *
 * REST API endpoints for transparency system metrics and performance data
 *
 * @module web/api/routes/metrics
 */

import { Router, Request, Response } from 'express';
import type { ITransparencySystem } from '../../coordination/shared/transparency/interfaces/transparency-system.js';
import type { TransparencyMetrics } from '../../coordination/shared/transparency/interfaces/transparency-system.js';
import type { Logger } from '../../../core/logger.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { validationMiddleware, commonSchemas } from '../middleware/validation.js';

/**
 * Create metrics routes
 */
export function metricsRoutes(
  transparencySystem: ITransparencySystem,
  logger: Logger
): Router {
  const router = Router();

  /**
   * GET /api/v1/metrics
   * Get current transparency metrics
   */
  router.get('/',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Getting current transparency metrics');

      const metrics = await transparencySystem.getTransparencyMetrics();

      res.json({
        data: metrics,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/metrics/agent/:agentId
   * Get performance metrics for specific agent
   */
  router.get('/agent/:agentId',
    validationMiddleware({
      params: commonSchemas.agentIdParam
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { agentId } = req.params;
      logger.info(`Getting metrics for agent ${agentId}`);

      try {
        const metrics = await transparencySystem.getAgentPerformanceMetrics(agentId);

        res.json({
          data: metrics,
          meta: {
            agentId,
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
   * GET /api/v1/metrics/tokens
   * Get token usage metrics
   */
  router.get('/tokens',
    validationMiddleware({
      query: {
        ...commonSchemas.dateRange,
        groupBy: {
          type: 'string',
          enum: ['agent', 'type', 'level', 'hour'],
          default: 'agent',
          description: 'Group metrics by field'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { startDate, endDate, groupBy = 'agent' } = req.query as any;
      logger.info('Getting token usage metrics', { startDate, endDate, groupBy });

      const metrics = await transparencySystem.getTransparencyMetrics();
      const hierarchy = await transparencySystem.getAgentHierarchy();

      // Calculate token metrics based on grouping
      const tokenMetrics = calculateTokenMetrics(hierarchy, groupBy);

      res.json({
        data: {
          summary: {
            totalConsumed: metrics.totalTokensConsumed,
            totalSaved: metrics.totalTokensSaved,
            averagePerAgent: hierarchy.length > 0 ? metrics.totalTokensConsumed / hierarchy.length : 0
          },
          breakdown: tokenMetrics
        },
        meta: {
          groupBy,
          dateRange: { startDate, endDate },
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/metrics/performance
   * Get performance metrics
   */
  router.get('/performance',
    validationMiddleware({
      query: {
        metric: {
          type: 'string',
          enum: ['execution_time', 'memory_usage', 'cpu_usage', 'token_rate'],
          description: 'Performance metric to analyze'
        },
        percentile: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          default: 95,
          description: 'Percentile for statistical analysis'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { metric, percentile = 95 } = req.query as any;
      logger.info('Getting performance metrics', { metric, percentile });

      const metrics = await transparencySystem.getTransparencyMetrics();
      const statuses = await transparencySystem.getAllAgentStatuses();

      const performanceMetrics = calculatePerformanceMetrics(statuses, metric, percentile);

      res.json({
        data: performanceMetrics,
        meta: {
          metric,
          percentile,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/metrics/hierarchy
   * Get hierarchy analytics
   */
  router.get('/hierarchy',
    asyncHandler(async (req: Request, res: Response) => {
      logger.info('Getting hierarchy analytics');

      const analytics = await transparencySystem.getHierarchyAnalytics();

      res.json({
        data: analytics,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/metrics/events
   * Get event stream metrics
   */
  router.get('/events',
    validationMiddleware({
      query: {
        ...commonSchemas.dateRange,
        eventType: {
          type: 'string',
          description: 'Filter by specific event type'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { startDate, endDate, eventType } = req.query as any;
      logger.info('Getting event stream metrics', { startDate, endDate, eventType });

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 60 * 60 * 1000); // Default to last hour
      const end = endDate ? new Date(endDate) : new Date();

      const events = await transparencySystem.getEventsInTimeRange(start, end, 10000);
      const eventMetrics = calculateEventMetrics(events, eventType);

      res.json({
        data: eventMetrics,
        meta: {
          dateRange: { startDate: start, endDate: end },
          eventType,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/metrics/efficiency
   * Get efficiency and resource utilization metrics
   */
  router.get('/efficiency',
    validationMiddleware({
      query: {
        timeWindow: {
          type: 'integer',
          minimum: 1,
          maximum: 1440,
          default: 60,
          description: 'Time window in minutes'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { timeWindow = 60 } = req.query as any;
      logger.info('Getting efficiency metrics', { timeWindow });

      const metrics = await transparencySystem.getTransparencyMetrics();
      const statuses = await transparencySystem.getAllAgentStatuses();

      const efficiencyMetrics = calculateEfficiencyMetrics(statuses, metrics, timeWindow);

      res.json({
        data: efficiencyMetrics,
        meta: {
          timeWindowMinutes: timeWindow,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/metrics/trends
   * Get metric trends over time
   */
  router.get('/trends',
    validationMiddleware({
      query: {
        metric: {
          type: 'string',
          enum: ['agent_count', 'token_usage', 'error_rate', 'performance'],
          description: 'Metric to track trends for'
        },
        timeWindow: {
          type: 'integer',
          minimum: 60,
          maximum: 1440,
          default: 360,
          description: 'Time window in minutes'
        },
        interval: {
          type: 'integer',
          minimum: 1,
          maximum: 60,
          default: 10,
          description: 'Interval in minutes for data points'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { metric, timeWindow = 360, interval = 10 } = req.query as any;
      logger.info('Getting metric trends', { metric, timeWindow, interval });

      // For now, return mock trend data
      // In a real implementation, you'd query historical data from a time-series database
      const trendData = generateMockTrendData(metric, timeWindow, interval);

      res.json({
        data: trendData,
        meta: {
          metric,
          timeWindowMinutes: timeWindow,
          intervalMinutes: interval,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  /**
   * GET /api/v1/metrics/alerts
   * Get current performance alerts
   */
  router.get('/alerts',
    validationMiddleware({
      query: {
        severity: {
          type: 'string',
          enum: ['warning', 'critical'],
          description: 'Alert severity filter'
        },
        active: {
          type: 'boolean',
          default: true,
          description: 'Only show active alerts'
        }
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { severity, active = true } = req.query as any;
      logger.info('Getting performance alerts', { severity, active });

      const alerts = await generatePerformanceAlerts(transparencySystem, severity);

      res.json({
        data: alerts,
        meta: {
          severity,
          active,
          count: alerts.length,
          timestamp: new Date().toISOString()
        }
      });
    })
  );

  return router;
}

/**
 * Calculate token usage metrics by grouping
 */
function calculateTokenMetrics(hierarchy: any[], groupBy: string): any {
  const breakdown: Record<string, any> = {};

  hierarchy.forEach(agent => {
    let key: string;

    switch (groupBy) {
      case 'agent':
        key = agent.agentId;
        break;
      case 'type':
        key = agent.type;
        break;
      case 'level':
        key = `Level ${agent.level}`;
        break;
      default:
        key = 'unknown';
    }

    if (!breakdown[key]) {
      breakdown[key] = {
        totalUsed: 0,
        totalBudget: 0,
        count: 0,
        averageUsed: 0,
        utilizationRate: 0
      };
    }

    breakdown[key].totalUsed += agent.tokensUsed;
    breakdown[key].totalBudget += agent.tokenBudget;
    breakdown[key].count++;
  });

  // Calculate averages and utilization rates
  Object.keys(breakdown).forEach(key => {
    const data = breakdown[key];
    data.averageUsed = data.count > 0 ? data.totalUsed / data.count : 0;
    data.utilizationRate = data.totalBudget > 0 ? (data.totalUsed / data.totalBudget) * 100 : 0;
  });

  return breakdown;
}

/**
 * Calculate performance metrics for agents
 */
function calculatePerformanceMetrics(statuses: any[], metric: string, percentile: number): any {
  const values: number[] = [];

  statuses.forEach(status => {
    let value: number;

    switch (metric) {
      case 'execution_time':
        // This would come from agent performance data
        value = Math.random() * 10000; // Mock data
        break;
      case 'memory_usage':
        value = status.memoryUsage;
        break;
      case 'cpu_usage':
        value = status.cpuUsage;
        break;
      case 'token_rate':
        value = status.tokenUsageRate;
        break;
      default:
        value = 0;
    }

    values.push(value);
  });

  values.sort((a, b) => a - b);

  const stats = {
    count: values.length,
    min: values.length > 0 ? values[0] : 0,
    max: values.length > 0 ? values[values.length - 1] : 0,
    mean: values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0,
    median: values.length > 0 ? values[Math.floor(values.length / 2)] : 0,
    percentile: values.length > 0 ? values[Math.floor((values.length * percentile) / 100)] : 0,
    unit: getMetricUnit(metric)
  };

  return stats;
}

/**
 * Calculate event metrics
 */
function calculateEventMetrics(events: any[], eventType?: string): any {
  let filteredEvents = events;

  if (eventType) {
    filteredEvents = events.filter(event => event.eventType === eventType);
  }

  const eventsByType: Record<string, number> = {};
  const eventsByHour: Record<string, number> = {};

  filteredEvents.forEach(event => {
    // Count by type
    eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;

    // Count by hour
    const hour = event.timestamp.getHours();
    const hourKey = `${hour.toString().padStart(2, '0')}:00`;
    eventsByHour[hourKey] = (eventsByHour[hourKey] || 0) + 1;
  });

  return {
    totalEvents: filteredEvents.length,
    eventsByType,
    eventsByHour,
    averageEventsPerHour: Object.values(eventsByHour).reduce((sum, count) => sum + count, 0) / Object.keys(eventsByHour).length
  };
}

/**
 * Calculate efficiency metrics
 */
function calculateEfficiencyMetrics(statuses: any[], metrics: any, timeWindowMinutes: number): any {
  const activeAgents = statuses.filter(status => !status.isPaused && status.state !== 'terminated');
  const pausedAgents = statuses.filter(status => status.isPaused);

  const efficiency = {
    agentEfficiency: {
      total: statuses.length,
      active: activeAgents.length,
      paused: pausedAgents.length,
      efficiencyRate: statuses.length > 0 ? (activeAgents.length / statuses.length) * 100 : 0
    },
    tokenEfficiency: {
      totalConsumed: metrics.totalTokensConsumed,
      totalSaved: metrics.totalTokensSaved,
      savingsRate: metrics.totalTokensConsumed > 0 ? (metrics.totalTokensSaved / metrics.totalTokensConsumed) * 100 : 0
    },
    performanceEfficiency: {
      averageExecutionTime: metrics.averageExecutionTimeMs,
      failureRate: metrics.failureRate,
      dependencyResolutionRate: metrics.dependencyResolutionRate
    },
    resourceUtilization: {
      memoryUtilization: calculateResourceUtilization(statuses, 'memoryUsage'),
      cpuUtilization: calculateResourceUtilization(statuses, 'cpuUsage'),
      tokenUtilization: calculateResourceUtilization(statuses, 'tokensUsed')
    }
  };

  return efficiency;
}

/**
 * Generate mock trend data
 */
function generateMockTrendData(metric: string, timeWindowMinutes: number, intervalMinutes: number): any {
  const dataPoints = [];
  const now = new Date();
  const intervals = Math.floor(timeWindowMinutes / intervalMinutes);

  for (let i = intervals; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
    let value: number;

    switch (metric) {
      case 'agent_count':
        value = 50 + Math.floor(Math.random() * 20);
        break;
      case 'token_usage':
        value = 1000 + Math.floor(Math.random() * 500);
        break;
      case 'error_rate':
        value = Math.random() * 10;
        break;
      case 'performance':
        value = 70 + Math.random() * 30;
        break;
      default:
        value = Math.random() * 100;
    }

    dataPoints.push({
      timestamp: timestamp.toISOString(),
      value
    });
  }

  return {
    metric,
    dataPoints,
    trend: calculateTrend(dataPoints)
  };
}

/**
 * Generate performance alerts
 */
async function generatePerformanceAlerts(transparencySystem: ITransparencySystem, severity?: string): Promise<any[]> {
  const alerts = [];
  const statuses = await transparencySystem.getAllAgentStatuses();
  const metrics = await transparencySystem.getTransparencyMetrics();

  // Check for high token usage
  statuses.forEach(status => {
    if (status.tokenUsageRate > 100) {
      alerts.push({
        id: `high-token-usage-${status.agentId}`,
        agentId: status.agentId,
        type: 'performance',
        severity: 'warning',
        title: 'High Token Usage Rate',
        description: `Agent ${status.agentId} has high token usage rate: ${status.tokenUsageRate.toFixed(2)} tokens/sec`,
        timestamp: new Date().toISOString(),
        value: status.tokenUsageRate,
        threshold: 100
      });
    }

    if (status.memoryUsage > 500 * 1024 * 1024) { // 500MB
      alerts.push({
        id: `high-memory-usage-${status.agentId}`,
        agentId: status.agentId,
        type: 'performance',
        severity: 'critical',
        title: 'High Memory Usage',
        description: `Agent ${status.agentId} has high memory usage: ${(status.memoryUsage / 1024 / 1024).toFixed(2)} MB`,
        timestamp: new Date().toISOString(),
        value: status.memoryUsage,
        threshold: 500 * 1024 * 1024
      });
    }

    if (status.recentErrors && status.recentErrors.length > 5) {
      alerts.push({
        id: `multiple-errors-${status.agentId}`,
        agentId: status.agentId,
        type: 'error',
        severity: 'warning',
        title: 'Multiple Recent Errors',
        description: `Agent ${status.agentId} has ${status.recentErrors.length} recent errors`,
        timestamp: new Date().toISOString(),
        value: status.recentErrors.length,
        threshold: 5
      });
    }
  });

  // Filter by severity if specified
  if (severity) {
    return alerts.filter(alert => alert.severity === severity);
  }

  return alerts;
}

/**
 * Get metric unit
 */
function getMetricUnit(metric: string): string {
  switch (metric) {
    case 'execution_time':
      return 'ms';
    case 'memory_usage':
      return 'bytes';
    case 'cpu_usage':
      return '%';
    case 'token_rate':
      return 'tokens/sec';
    default:
      return 'unknown';
  }
}

/**
 * Calculate resource utilization
 */
function calculateResourceUtilization(statuses: any[], field: string): number {
  if (statuses.length === 0) return 0;

  const total = statuses.reduce((sum, status) => sum + (status[field] || 0), 0);
  return total / statuses.length;
}

/**
 * Calculate trend from data points
 */
function calculateTrend(dataPoints: any[]): string {
  if (dataPoints.length < 2) return 'stable';

  const firstValue = dataPoints[0].value;
  const lastValue = dataPoints[dataPoints.length - 1].value;
  const change = ((lastValue - firstValue) / firstValue) * 100;

  if (change > 5) return 'increasing';
  if (change < -5) return 'decreasing';
  return 'stable';
}