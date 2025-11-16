/**
 * Health Check System
 *
 * Comprehensive health monitoring for all critical services:
 * - Database connectivity and latency
 * - Redis connectivity and performance
 * - File system availability and disk space
 * - Active agent count and queue depth
 *
 * Provides sub-second health detection (<1s overall response time)
 * and detailed health reports for monitoring integration.
 *
 * Part of Task P2-4.1: Comprehensive Health Checks
 */

import { getDatabaseService } from '../lib/database-service';
import { RedisQueueManager } from '../lib/redis-queue-manager';
import { StandardError, ErrorCode } from '../lib/errors';
import fs from 'fs';
import os from 'os';
import util from 'util';

/**
 * Health status enumeration
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * Individual health check result
 */
export interface HealthCheck {
  /**
   * Service name
   */
  name: string;

  /**
   * Current health status
   */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /**
   * Response latency in milliseconds
   */
  latency: number;

  /**
   * Human-readable health status message
   */
  message?: string;

  /**
   * Timestamp of the health check
   */
  timestamp: Date;

  /**
   * Dependent service health checks (if aggregated)
   */
  dependencies?: HealthCheck[];

  /**
   * Additional metadata about the service
   */
  metadata?: Record<string, any>;
}

/**
 * Detailed health report including all services and metrics
 */
export interface DetailedHealthReport {
  /**
   * Report generation timestamp
   */
  timestamp: Date;

  /**
   * Overall system health status
   */
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';

  /**
   * Total health check latency in milliseconds
   */
  latency: number;

  /**
   * Individual service health checks
   */
  services: {
    database: HealthCheck;
    redis: HealthCheck;
    filesystem: HealthCheck;
    agents: HealthCheck;
  };

  /**
   * Alerts or warnings
   */
  alerts?: string[];
}

/**
 * Health check system configuration
 */
export interface HealthCheckConfig {
  /**
   * Database check timeout in milliseconds (default: 500)
   */
  databaseTimeout?: number;

  /**
   * Redis check timeout in milliseconds (default: 500)
   */
  redisTimeout?: number;

  /**
   * File system check timeout in milliseconds (default: 500)
   */
  filesystemTimeout?: number;

  /**
   * Agents check timeout in milliseconds (default: 500)
   */
  agentsTimeout?: number;

  /**
   * Disk usage warning threshold percentage (default: 80)
   */
  diskUsageWarnThreshold?: number;

  /**
   * Disk usage critical threshold percentage (default: 95)
   */
  diskUsageCriticalThreshold?: number;

  /**
   * Queue depth warning threshold (default: 100)
   */
  queueDepthWarnThreshold?: number;

  /**
   * Queue depth critical threshold (default: 500)
   */
  queueDepthCriticalThreshold?: number;
}

/**
 * Comprehensive health check system
 */
export class HealthCheckSystem {
  private config: Required<HealthCheckConfig>;
  private redisManager: RedisQueueManager | null = null;

  constructor(config?: HealthCheckConfig) {
    this.config = {
      databaseTimeout: config?.databaseTimeout ?? 500,
      redisTimeout: config?.redisTimeout ?? 500,
      filesystemTimeout: config?.filesystemTimeout ?? 500,
      agentsTimeout: config?.agentsTimeout ?? 500,
      diskUsageWarnThreshold: config?.diskUsageWarnThreshold ?? 80,
      diskUsageCriticalThreshold: config?.diskUsageCriticalThreshold ?? 95,
      queueDepthWarnThreshold: config?.queueDepthWarnThreshold ?? 100,
      queueDepthCriticalThreshold: config?.queueDepthCriticalThreshold ?? 500,
    };

    try {
      this.redisManager = new RedisQueueManager();
    } catch (error) {
      // Redis initialization may fail in test environments
      // Will be handled gracefully in checkRedis()
    }
  }

  /**
   * Check database health
   * Verifies connectivity and measures response latency
   */
  async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const db = getDatabaseService();

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database check timeout')), this.config.databaseTimeout)
      );

      // Race between actual check and timeout
      await Promise.race([
        (async () => {
          // Simple connectivity check using a lightweight query
          await db.query('SELECT 1');
        })(),
        timeoutPromise,
      ]);

      const latency = Date.now() - startTime;

      return {
        name: 'database',
        status: HealthStatus.HEALTHY,
        latency,
        message: 'Database connected and responding',
        timestamp: new Date(),
        metadata: {
          responseTime: latency,
          type: 'postgresql',
        },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown database error';

      return {
        name: 'database',
        status: latency > this.config.databaseTimeout
          ? HealthStatus.UNHEALTHY
          : HealthStatus.UNHEALTHY,
        latency,
        message: `Database check failed: ${message}`,
        timestamp: new Date(),
        metadata: {
          error: message,
          timeout: latency > this.config.databaseTimeout,
        },
      };
    }
  }

  /**
   * Check Redis health
   * Verifies connectivity and measures ping response time
   */
  async checkRedis(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      if (!this.redisManager) {
        throw new Error('Redis manager not initialized');
      }

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis check timeout')), this.config.redisTimeout)
      );

      // Race between actual check and timeout
      await Promise.race([
        this.redisManager.ping(),
        timeoutPromise,
      ]);

      const latency = Date.now() - startTime;

      // Get additional metrics
      let metadata: Record<string, any> = { responseTime: latency };

      try {
        const stats = await this.redisManager.getStats();
        metadata = { ...metadata, ...stats };
      } catch {
        // If stats fail, just continue with basic response time
      }

      return {
        name: 'redis',
        status: HealthStatus.HEALTHY,
        latency,
        message: 'Redis responding to PING',
        timestamp: new Date(),
        metadata,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Redis error';

      const status =
        message.includes('timeout') || latency > this.config.redisTimeout
          ? HealthStatus.UNHEALTHY
          : HealthStatus.UNHEALTHY;

      return {
        name: 'redis',
        status,
        latency,
        message: `Redis check failed: ${message}`,
        timestamp: new Date(),
        metadata: {
          error: message,
          timeout: latency > this.config.redisTimeout,
        },
      };
    }
  }

  /**
   * Check file system health
   * Verifies disk space and write permissions
   */
  async checkFileSystem(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Filesystem check timeout')), this.config.filesystemTimeout)
      );

      // Race between actual check and timeout
      const result = await Promise.race([
        this.getFileSystemMetrics(),
        timeoutPromise,
      ]) as FileSystemMetrics;

      const latency = Date.now() - startTime;

      // Determine health status based on disk usage
      let status: 'healthy' | 'degraded' | 'unhealthy' = HealthStatus.HEALTHY;
      let message = 'File system healthy';

      if (result.diskUsagePercent > this.config.diskUsageCriticalThreshold) {
        status = HealthStatus.UNHEALTHY;
        message = `Critical disk usage: ${result.diskUsagePercent.toFixed(1)}%`;
      } else if (result.diskUsagePercent > this.config.diskUsageWarnThreshold) {
        status = HealthStatus.DEGRADED;
        message = `Degraded disk usage: ${result.diskUsagePercent.toFixed(1)}%`;
      }

      if (!result.writePermission) {
        status = HealthStatus.UNHEALTHY;
        message = 'Write permission denied on temp directory';
      }

      return {
        name: 'filesystem',
        status,
        latency,
        message,
        timestamp: new Date(),
        metadata: {
          diskUsagePercent: result.diskUsagePercent,
          writePermission: result.writePermission,
          freeSpaceMB: result.freeSpaceMB,
          totalSpaceMB: result.totalSpaceMB,
        },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown filesystem error';

      return {
        name: 'filesystem',
        status: HealthStatus.UNHEALTHY,
        latency,
        message: `File system check failed: ${message}`,
        timestamp: new Date(),
        metadata: {
          error: message,
        },
      };
    }
  }

  /**
   * Check agent health
   * Verifies active agent count and queue depth
   */
  async checkAgents(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Agents check timeout')), this.config.agentsTimeout)
      );

      // Race between actual check and timeout
      const metrics = await Promise.race([
        this.getAgentMetrics(),
        timeoutPromise,
      ]) as AgentMetrics;

      const latency = Date.now() - startTime;

      // Determine health status based on queue depth
      let status: 'healthy' | 'degraded' | 'unhealthy' = HealthStatus.HEALTHY;
      let message = `${metrics.activeAgentCount} agents active`;

      if (metrics.queueDepth > this.config.queueDepthCriticalThreshold) {
        status = HealthStatus.UNHEALTHY;
        message = `Critical queue depth: ${metrics.queueDepth} tasks`;
      } else if (metrics.queueDepth > this.config.queueDepthWarnThreshold) {
        status = HealthStatus.DEGRADED;
        message = `High queue depth: ${metrics.queueDepth} tasks`;
      }

      return {
        name: 'agents',
        status,
        latency,
        message,
        timestamp: new Date(),
        metadata: {
          activeAgentCount: metrics.activeAgentCount,
          queueDepth: metrics.queueDepth,
        },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown agent error';

      return {
        name: 'agents',
        status: HealthStatus.UNHEALTHY,
        latency,
        message: `Agent check failed: ${message}`,
        timestamp: new Date(),
        metadata: {
          error: message,
        },
      };
    }
  }

  /**
   * Get overall system health
   * Aggregates all service health checks
   */
  async getOverallHealth(): Promise<HealthCheck> {
    const overallStartTime = Date.now();

    const [database, redis, filesystem, agents] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkFileSystem(),
      this.checkAgents(),
    ]);

    const dependencies = [database, redis, filesystem, agents];

    // Determine overall status
    // UNHEALTHY if any service is unhealthy
    // DEGRADED if any service is degraded
    // HEALTHY if all services are healthy
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = HealthStatus.HEALTHY;
    const unhealthyServices = dependencies.filter((d) => d.status === HealthStatus.UNHEALTHY);
    const degradedServices = dependencies.filter((d) => d.status === HealthStatus.DEGRADED);

    if (unhealthyServices.length > 0) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (degradedServices.length > 0) {
      overallStatus = HealthStatus.DEGRADED;
    }

    const latency = Date.now() - overallStartTime;
    const statusMessage =
      unhealthyServices.length > 0
        ? `${unhealthyServices.length} service(s) unhealthy`
        : degradedServices.length > 0
          ? `${degradedServices.length} service(s) degraded`
          : 'All services healthy';

    return {
      name: 'overall',
      status: overallStatus,
      latency,
      message: statusMessage,
      timestamp: new Date(),
      dependencies,
    };
  }

  /**
   * Get detailed health report
   * Includes all services and aggregated metrics
   */
  async getDetailedHealthReport(): Promise<DetailedHealthReport> {
    const reportStartTime = Date.now();

    const overall = await this.getOverallHealth();

    const report: DetailedHealthReport = {
      timestamp: new Date(),
      overallStatus: overall.status as 'healthy' | 'degraded' | 'unhealthy',
      latency: Date.now() - reportStartTime,
      services: {
        database: overall.dependencies![0],
        redis: overall.dependencies![1],
        filesystem: overall.dependencies![2],
        agents: overall.dependencies![3],
      },
      alerts: [],
    };

    // Build alerts
    if (report.overallStatus === HealthStatus.UNHEALTHY) {
      const unhealthy = overall.dependencies!.filter((d) => d.status === HealthStatus.UNHEALTHY);
      report.alerts = unhealthy.map((s) => `${s.name}: ${s.message}`);
    }

    if (report.overallStatus === HealthStatus.DEGRADED) {
      const degraded = overall.dependencies!.filter((d) => d.status === HealthStatus.DEGRADED);
      report.alerts = degraded.map((s) => `${s.name}: ${s.message}`);
    }

    return report;
  }

  /**
   * Get file system metrics
   * Private helper for filesystem check
   */
  private async getFileSystemMetrics(): Promise<FileSystemMetrics> {
    return new Promise((resolve, reject) => {
      // Get disk usage statistics
      const tempDir = os.tmpdir();
      const stat = fs.statSync(tempDir);

      // Use statvfs to get disk space information
      fs.statfs(tempDir, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        const totalBlocks = stats.blocks;
        const availableBlocks = stats.bavail;
        const blockSize = stats.bsize;

        const totalSpaceMB = (totalBlocks * blockSize) / (1024 * 1024);
        const availableSpaceMB = (availableBlocks * blockSize) / (1024 * 1024);
        const usedSpaceMB = totalSpaceMB - availableSpaceMB;
        const diskUsagePercent = (usedSpaceMB / totalSpaceMB) * 100;

        // Check write permission by attempting to create a temp file
        const testFile = `${tempDir}/.health-check-test-${Date.now()}`;
        let writePermission = false;

        try {
          fs.writeFileSync(testFile, 'health-check-test');
          fs.unlinkSync(testFile);
          writePermission = true;
        } catch {
          writePermission = false;
        }

        resolve({
          totalSpaceMB,
          availableSpaceMB,
          usedSpaceMB,
          diskUsagePercent,
          writePermission,
          freeSpaceMB: availableSpaceMB,
        });
      });
    });
  }

  /**
   * Get agent metrics
   * Private helper for agent check
   */
  private async getAgentMetrics(): Promise<AgentMetrics> {
    // Get active agent count from Redis queue
    let activeAgentCount = 0;
    let queueDepth = 0;

    try {
      if (this.redisManager) {
        const stats = await this.redisManager.getStats();
        activeAgentCount = stats.activeCount || 0;
        queueDepth = stats.pendingCount || 0;
      }
    } catch {
      // If Redis is unavailable, return default metrics
      activeAgentCount = 0;
      queueDepth = 0;
    }

    return {
      activeAgentCount,
      queueDepth,
    };
  }
}

/**
 * File system metrics helper interface
 */
interface FileSystemMetrics {
  totalSpaceMB: number;
  availableSpaceMB: number;
  usedSpaceMB: number;
  diskUsagePercent: number;
  writePermission: boolean;
  freeSpaceMB: number;
}

/**
 * Agent metrics helper interface
 */
interface AgentMetrics {
  activeAgentCount: number;
  queueDepth: number;
}

// Export types for use in API endpoints
export { FileSystemMetrics, AgentMetrics };
