/**
 * Health Check HTTP Endpoints
 *
 * Provides REST API endpoints for health monitoring:
 * - GET /health - Overall system health status
 * - GET /health/ready - Kubernetes readiness probe
 * - GET /health/live - Kubernetes liveness probe
 * - GET /health/detailed - Detailed component-level health report
 *
 * Integrates with monitoring dashboards and Kubernetes orchestration.
 *
 * Part of Task P2-4.1: Comprehensive Health Checks
 */

import express, { Router, Request, Response } from 'express';
import { HealthCheckSystem, HealthCheck, DetailedHealthReport } from '../services/health-check-system';

/**
 * Health endpoint response format
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  latency: number;
  checks?: Record<string, any>;
}

/**
 * Readiness/liveness probe response
 */
export interface ProbeResponse {
  status: 'ready' | 'not-ready' | 'alive' | 'not-alive';
  timestamp: string;
}

/**
 * Health check endpoints router
 */
export class HealthEndpoints {
  private router: Router;
  private healthCheckSystem: HealthCheckSystem;

  constructor(config?: { systemConfig?: Record<string, any> }) {
    this.router = express.Router();
    this.healthCheckSystem = new HealthCheckSystem(config?.systemConfig);
    this.setupRoutes();
  }

  /**
   * Setup all health check routes
   */
  private setupRoutes(): void {
    /**
     * GET /health - Overall system health
     *
     * Returns the current health status of the system including:
     * - Overall status (healthy/degraded/unhealthy)
     * - Response latency
     * - Component health summary
     *
     * Response time: <1s
     * Status codes:
     *   200: System healthy
     *   503: System degraded or unhealthy
     */
    this.router.get('/health', async (req: Request, res: Response) => {
      const startTime = Date.now();

      const overall = await this.healthCheckSystem.getOverallHealth();
      const responseTime = Date.now() - startTime;

      const response: HealthResponse = {
        status: overall.status as 'healthy' | 'degraded' | 'unhealthy',
        timestamp: new Date().toISOString(),
        latency: responseTime,
        checks: {
          database: overall.dependencies?.[0].status,
          redis: overall.dependencies?.[1].status,
          filesystem: overall.dependencies?.[2].status,
          agents: overall.dependencies?.[3].status,
        },
      };

      const statusCode = overall.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);
    });

    /**
     * GET /health/ready - Kubernetes readiness probe
     *
     * Checks if the system is ready to accept traffic.
     * All critical services must be healthy.
     *
     * Response time: <500ms
     * Status codes:
     *   200: Ready to accept traffic
     *   503: Not ready
     */
    this.router.get('/health/ready', async (req: Request, res: Response) => {
      const startTime = Date.now();

      const overall = await this.healthCheckSystem.getOverallHealth();
      const isReady = overall.status === 'healthy';
      const responseTime = Date.now() - startTime;

      const response: ProbeResponse = {
        status: isReady ? 'ready' : 'not-ready',
        timestamp: new Date().toISOString(),
      };

      const statusCode = isReady ? 200 : 503;
      res.status(statusCode).json(response);
    });

    /**
     * GET /health/live - Kubernetes liveness probe
     *
     * Checks if the system is alive and responding.
     * Allows degraded services.
     *
     * Response time: <500ms
     * Status codes:
     *   200: System alive
     *   503: System down/unhealthy
     */
    this.router.get('/health/live', async (req: Request, res: Response) => {
      const startTime = Date.now();

      const overall = await this.healthCheckSystem.getOverallHealth();
      const isAlive = overall.status !== 'unhealthy';
      const responseTime = Date.now() - startTime;

      const response: ProbeResponse = {
        status: isAlive ? 'alive' : 'not-alive',
        timestamp: new Date().toISOString(),
      };

      const statusCode = isAlive ? 200 : 503;
      res.status(statusCode).json(response);
    });

    /**
     * GET /health/detailed - Detailed health report
     *
     * Returns comprehensive health information including:
     * - Overall system status
     * - Individual service metrics
     * - Response latencies
     * - Disk usage
     * - Queue depth
     * - Active agents
     * - Alerts and warnings
     *
     * Response time: <1s
     * Status codes:
     *   200: Report generated (regardless of health status)
     */
    this.router.get('/health/detailed', async (req: Request, res: Response) => {
      const startTime = Date.now();

      const report = await this.healthCheckSystem.getDetailedHealthReport();
      const responseTime = Date.now() - startTime;

      const response = {
        timestamp: report.timestamp.toISOString(),
        overallStatus: report.overallStatus,
        latency: responseTime,
        totalLatency: report.latency,
        services: {
          database: {
            status: report.services.database.status,
            latency: report.services.database.latency,
            message: report.services.database.message,
            metadata: report.services.database.metadata,
          },
          redis: {
            status: report.services.redis.status,
            latency: report.services.redis.latency,
            message: report.services.redis.message,
            metadata: report.services.redis.metadata,
          },
          filesystem: {
            status: report.services.filesystem.status,
            latency: report.services.filesystem.latency,
            message: report.services.filesystem.message,
            metadata: report.services.filesystem.metadata,
          },
          agents: {
            status: report.services.agents.status,
            latency: report.services.agents.latency,
            message: report.services.agents.message,
            metadata: report.services.agents.metadata,
          },
        },
        alerts: report.alerts || [],
      };

      res.status(200).json(response);
    });

    /**
     * GET /health/database - Database health only
     *
     * Focused check for database connectivity.
     * Useful for targeted monitoring.
     */
    this.router.get('/health/database', async (req: Request, res: Response) => {
      const startTime = Date.now();

      const check = await this.healthCheckSystem.checkDatabase();
      const responseTime = Date.now() - startTime;

      const response = {
        service: 'database',
        status: check.status,
        latency: responseTime,
        message: check.message,
        metadata: check.metadata,
        timestamp: new Date().toISOString(),
      };

      const statusCode = check.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);
    });

    /**
     * GET /health/redis - Redis health only
     *
     * Focused check for Redis connectivity.
     */
    this.router.get('/health/redis', async (req: Request, res: Response) => {
      const startTime = Date.now();

      const check = await this.healthCheckSystem.checkRedis();
      const responseTime = Date.now() - startTime;

      const response = {
        service: 'redis',
        status: check.status,
        latency: responseTime,
        message: check.message,
        metadata: check.metadata,
        timestamp: new Date().toISOString(),
      };

      const statusCode = check.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);
    });

    /**
     * GET /health/filesystem - File system health only
     *
     * Focused check for disk space and permissions.
     */
    this.router.get('/health/filesystem', async (req: Request, res: Response) => {
      const startTime = Date.now();

      const check = await this.healthCheckSystem.checkFileSystem();
      const responseTime = Date.now() - startTime;

      const response = {
        service: 'filesystem',
        status: check.status,
        latency: responseTime,
        message: check.message,
        metadata: check.metadata,
        timestamp: new Date().toISOString(),
      };

      const statusCode = check.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);
    });

    /**
     * GET /health/agents - Agent health only
     *
     * Focused check for active agents and queue depth.
     */
    this.router.get('/health/agents', async (req: Request, res: Response) => {
      const startTime = Date.now();

      const check = await this.healthCheckSystem.checkAgents();
      const responseTime = Date.now() - startTime;

      const response = {
        service: 'agents',
        status: check.status,
        latency: responseTime,
        message: check.message,
        metadata: check.metadata,
        timestamp: new Date().toISOString(),
      };

      const statusCode = check.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);
    });
  }

  /**
   * Get the configured router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Get the health check system instance
   */
  getHealthCheckSystem(): HealthCheckSystem {
    return this.healthCheckSystem;
  }
}

/**
 * Create and configure health check endpoints
 * Usage:
 *   const app = express();
 *   const healthEndpoints = new HealthEndpoints();
 *   app.use('/health', healthEndpoints.getRouter());
 */
export function createHealthEndpoints(config?: { systemConfig?: Record<string, any> }): HealthEndpoints {
  return new HealthEndpoints(config);
}

/**
 * Middleware for adding health check endpoints to an Express app
 * Usage:
 *   const app = express();
 *   app.use(mountHealthEndpoints());
 */
export function mountHealthEndpoints(config?: { systemConfig?: Record<string, any> }): Router {
  const endpoints = new HealthEndpoints(config);
  return endpoints.getRouter();
}

export { HealthCheckSystem };
