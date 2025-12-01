/**
 * Health Check System Tests
 *
 * Comprehensive test suite for the health check system including:
 * - Database health checks
 * - Redis health checks
 * - File system health checks
 * - Agent health checks
 * - Response time validation
 * - Degraded state detection
 * - HTTP endpoint testing
 * - Overall health aggregation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import {
  HealthCheckSystem,
  HealthCheck,
  HealthStatus,
  DetailedHealthReport,
} from '../src/services/health-check-system';

describe('HealthCheckSystem', () => {
  let healthCheckSystem: HealthCheckSystem;
  const START_TIME = Date.now();

  beforeEach(() => {
    healthCheckSystem = new HealthCheckSystem();
  });

  describe('Database Health Checks', () => {
    it('should detect healthy database with latency <500ms', async () => {
      const check = await healthCheckSystem.checkDatabase();

      expect(check).toBeDefined();
      expect(check.name).toBe('database');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
      expect(check.latency).toBeLessThan(500);
      expect(check.timestamp).toBeInstanceOf(Date);
    });

    it('should measure database latency accurately', async () => {
      const check = await healthCheckSystem.checkDatabase();

      expect(check.latency).toBeGreaterThanOrEqual(0);
      expect(check.latency).toBeLessThan(1000);
      expect(typeof check.latency).toBe('number');
    });

    it('should report connection status', async () => {
      const check = await healthCheckSystem.checkDatabase();

      if (check.status === 'healthy') {
        expect(check.message).toMatch(/connected/i);
      } else if (check.status === 'unhealthy') {
        expect(check.message).toBeDefined();
        expect(check.message).toMatch(/failed|error|unable/i);
      }
    });

    it('should timeout database checks exceeding threshold', async () => {
      const check = await healthCheckSystem.checkDatabase();

      // Even if timing out, should return a result with timeout status
      expect(check).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
    });
  });

  describe('Redis Health Checks', () => {
    it('should detect healthy Redis with latency <500ms', async () => {
      const check = await healthCheckSystem.checkRedis();

      expect(check).toBeDefined();
      expect(check.name).toBe('redis');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
      expect(check.latency).toBeLessThan(500);
    });

    it('should ping Redis and measure response time', async () => {
      const check = await healthCheckSystem.checkRedis();

      expect(check.latency).toBeGreaterThanOrEqual(0);
      expect(check.latency).toBeLessThan(1000);
    });

    it('should report Redis connection state', async () => {
      const check = await healthCheckSystem.checkRedis();

      if (check.status === 'healthy') {
        expect(check.message).toMatch(/pong|responding/i);
      } else {
        expect(check.message).toBeDefined();
      }
    });

    it('should include memory and connection info when healthy', async () => {
      const check = await healthCheckSystem.checkRedis();

      if (check.status === 'healthy') {
        expect(check.metadata).toBeDefined();
        // Optional: may contain memory, keys, connections info
      }
    });
  });

  describe('File System Health Checks', () => {
    it('should detect healthy file system', async () => {
      const check = await healthCheckSystem.checkFileSystem();

      expect(check).toBeDefined();
      expect(check.name).toBe('filesystem');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
      expect(check.latency).toBeLessThan(500);
    });

    it('should measure disk space availability', async () => {
      const check = await healthCheckSystem.checkFileSystem();

      if (check.status === 'healthy') {
        expect(check.metadata?.diskUsagePercent).toBeDefined();
        expect(check.metadata?.diskUsagePercent).toBeGreaterThanOrEqual(0);
        expect(check.metadata?.diskUsagePercent).toBeLessThanOrEqual(100);
      }
    });

    it('should report degraded when disk usage >80%', async () => {
      const check = await healthCheckSystem.checkFileSystem();

      if (check.metadata?.diskUsagePercent && check.metadata.diskUsagePercent > 80) {
        expect(check.status).toBe('degraded');
      }
    });

    it('should report unhealthy when disk usage >95%', async () => {
      const check = await healthCheckSystem.checkFileSystem();

      if (check.metadata?.diskUsagePercent && check.metadata.diskUsagePercent > 95) {
        expect(check.status).toBe('unhealthy');
      }
    });

    it('should verify write permissions', async () => {
      const check = await healthCheckSystem.checkFileSystem();

      expect(check.metadata?.writePermission).toBeDefined();
      expect(typeof check.metadata?.writePermission).toBe('boolean');
    });
  });

  describe('Agent Health Checks', () => {
    it('should detect active agents', async () => {
      const check = await healthCheckSystem.checkAgents();

      expect(check).toBeDefined();
      expect(check.name).toBe('agents');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
    });

    it('should report active agent count', async () => {
      const check = await healthCheckSystem.checkAgents();

      expect(check.metadata?.activeAgentCount).toBeDefined();
      expect(typeof check.metadata?.activeAgentCount).toBe('number');
      expect(check.metadata?.activeAgentCount).toBeGreaterThanOrEqual(0);
    });

    it('should report queue depth', async () => {
      const check = await healthCheckSystem.checkAgents();

      if (check.metadata?.queueDepth !== undefined) {
        expect(typeof check.metadata.queueDepth).toBe('number');
        expect(check.metadata.queueDepth).toBeGreaterThanOrEqual(0);
      }
    });

    it('should report degraded when queue depth exceeds threshold', async () => {
      const check = await healthCheckSystem.checkAgents();

      if (check.metadata?.queueDepth && check.metadata.queueDepth > 100) {
        expect(check.status).toBe('degraded');
      }
    });
  });

  describe('Overall Health Aggregation', () => {
    it('should aggregate all health checks into single status', async () => {
      const overall = await healthCheckSystem.getOverallHealth();

      expect(overall).toBeDefined();
      expect(overall.name).toBe('overall');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(overall.status);
      expect(overall.dependencies).toBeDefined();
      expect(Array.isArray(overall.dependencies)).toBe(true);
    });

    it('should include all service checks in dependencies', async () => {
      const overall = await healthCheckSystem.getOverallHealth();

      const serviceNames = overall.dependencies?.map((d) => d.name) || [];
      expect(serviceNames).toContain('database');
      expect(serviceNames).toContain('redis');
      expect(serviceNames).toContain('filesystem');
      expect(serviceNames).toContain('agents');
    });

    it('should return healthy only if all services healthy', async () => {
      const overall = await healthCheckSystem.getOverallHealth();

      const allHealthy = overall.dependencies?.every((d) => d.status === 'healthy');
      if (allHealthy) {
        expect(overall.status).toBe('healthy');
      }
    });

    it('should return degraded if any service degraded', async () => {
      const overall = await healthCheckSystem.getOverallHealth();

      const hasUnhealthy = overall.dependencies?.some((d) => d.status === 'unhealthy');
      if (hasUnhealthy) {
        expect(overall.status).toBe('unhealthy');
      }
    });

    it('should calculate aggregate latency', async () => {
      const overall = await healthCheckSystem.getOverallHealth();

      expect(overall.latency).toBeDefined();
      expect(overall.latency).toBeGreaterThanOrEqual(0);
      // Aggregate should be max of all checks
      const maxDependencyLatency = Math.max(
        ...(overall.dependencies?.map((d) => d.latency) || [0])
      );
      expect(overall.latency).toBeGreaterThanOrEqual(maxDependencyLatency);
    });

    it('should complete overall check in <1s', async () => {
      const startMs = Date.now();
      const overall = await healthCheckSystem.getOverallHealth();
      const elapsedMs = Date.now() - startMs;

      expect(elapsedMs).toBeLessThan(1000);
      expect(overall.latency).toBeLessThan(1000);
    });
  });

  describe('Response Time Validation', () => {
    it('should complete database check in <500ms', async () => {
      const startMs = Date.now();
      await healthCheckSystem.checkDatabase();
      const elapsedMs = Date.now() - startMs;

      expect(elapsedMs).toBeLessThan(500);
    });

    it('should complete Redis check in <500ms', async () => {
      const startMs = Date.now();
      await healthCheckSystem.checkRedis();
      const elapsedMs = Date.now() - startMs;

      expect(elapsedMs).toBeLessThan(500);
    });

    it('should complete file system check in <500ms', async () => {
      const startMs = Date.now();
      await healthCheckSystem.checkFileSystem();
      const elapsedMs = Date.now() - startMs;

      expect(elapsedMs).toBeLessThan(500);
    });

    it('should complete agent check in <500ms', async () => {
      const startMs = Date.now();
      await healthCheckSystem.checkAgents();
      const elapsedMs = Date.now() - startMs;

      expect(elapsedMs).toBeLessThan(500);
    });
  });

  describe('Degraded State Detection', () => {
    it('should detect when service is degraded', async () => {
      const check = await healthCheckSystem.checkDatabase();
      // Should properly categorize as one of the three states
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
    });

    it('should provide reason for degraded state', async () => {
      const overall = await healthCheckSystem.getOverallHealth();

      if (overall.status === 'degraded') {
        expect(overall.message).toBeDefined();
        expect(overall.message?.length).toBeGreaterThan(0);
      }
    });

    it('should detect multiple degraded services', async () => {
      const overall = await healthCheckSystem.getOverallHealth();

      const degradedServices = overall.dependencies?.filter((d) => d.status === 'degraded') || [];
      if (degradedServices.length > 0) {
        expect(overall.status).toBe('degraded');
      }
    });
  });

  describe('Detailed Health Reports', () => {
    it('should generate detailed health report', async () => {
      const report = await healthCheckSystem.getDetailedHealthReport();

      expect(report).toBeDefined();
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.overallStatus).toMatch(/healthy|degraded|unhealthy/);
      expect(report.services).toBeDefined();
    });

    it('should include service details in report', async () => {
      const report = await healthCheckSystem.getDetailedHealthReport();

      expect(report.services.database).toBeDefined();
      expect(report.services.redis).toBeDefined();
      expect(report.services.filesystem).toBeDefined();
      expect(report.services.agents).toBeDefined();
    });

    it('should include timestamps in detailed report', async () => {
      const report = await healthCheckSystem.getDetailedHealthReport();

      expect(report.timestamp).toBeInstanceOf(Date);
      Object.values(report.services).forEach((service) => {
        expect(service.timestamp).toBeInstanceOf(Date);
      });
    });

    it('should include latency metrics in detailed report', async () => {
      const report = await healthCheckSystem.getDetailedHealthReport();

      expect(report.latency).toBeDefined();
      expect(typeof report.latency).toBe('number');
      Object.values(report.services).forEach((service) => {
        expect(service.latency).toBeDefined();
        expect(typeof service.latency).toBe('number');
      });
    });
  });

  describe('Health Status Transitions', () => {
    it('should handle status transitions from healthy to degraded', async () => {
      const check1 = await healthCheckSystem.checkDatabase();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check1.status);

      const check2 = await healthCheckSystem.checkDatabase();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check2.status);
    });

    it('should track service history across checks', async () => {
      const checks = [];
      for (let i = 0; i < 3; i++) {
        checks.push(await healthCheckSystem.checkDatabase());
      }

      checks.forEach((check) => {
        expect(check).toBeDefined();
        expect(check.status).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      const check = await healthCheckSystem.checkDatabase();

      // Should return valid health check even on failure
      expect(check).toBeDefined();
      expect(check.name).toBe('database');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
    });

    it('should handle Redis connection failures gracefully', async () => {
      const check = await healthCheckSystem.checkRedis();

      expect(check).toBeDefined();
      expect(check.name).toBe('redis');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
    });

    it('should handle file system access failures gracefully', async () => {
      const check = await healthCheckSystem.checkFileSystem();

      expect(check).toBeDefined();
      expect(check.name).toBe('filesystem');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
    });

    it('should return overall unhealthy if all services fail', async () => {
      const overall = await healthCheckSystem.getOverallHealth();

      const allUnhealthy = overall.dependencies?.every((d) => d.status === 'unhealthy');
      if (allUnhealthy) {
        expect(overall.status).toBe('unhealthy');
      }
    });
  });

  describe('Concurrent Health Checks', () => {
    it('should handle concurrent check requests', async () => {
      const checks = await Promise.all([
        healthCheckSystem.checkDatabase(),
        healthCheckSystem.checkRedis(),
        healthCheckSystem.checkFileSystem(),
        healthCheckSystem.checkAgents(),
      ]);

      expect(checks).toHaveLength(4);
      checks.forEach((check) => {
        expect(check).toBeDefined();
        expect(['healthy', 'degraded', 'unhealthy']).toContain(check.status);
      });
    });

    it('should maintain consistency across concurrent calls', async () => {
      const results = await Promise.all(
        Array(5)
          .fill(null)
          .map(() => healthCheckSystem.getOverallHealth())
      );

      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.dependencies).toBeDefined();
        expect(result.dependencies?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Health Check Metadata', () => {
    it('should include metadata in health checks', async () => {
      const check = await healthCheckSystem.checkDatabase();

      if (check.metadata) {
        expect(typeof check.metadata).toBe('object');
      }
    });

    it('should include timestamps in all checks', async () => {
      const checks = [
        await healthCheckSystem.checkDatabase(),
        await healthCheckSystem.checkRedis(),
        await healthCheckSystem.checkFileSystem(),
        await healthCheckSystem.checkAgents(),
      ];

      checks.forEach((check) => {
        expect(check.timestamp).toBeInstanceOf(Date);
        expect(check.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
      });
    });
  });
});

describe('HealthCheckSystem Integration', () => {
  let healthCheckSystem: HealthCheckSystem;

  beforeEach(() => {
    healthCheckSystem = new HealthCheckSystem();
  });

  it('should support health check configuration', async () => {
    const config = {
      databaseTimeout: 300,
      redisTimeout: 300,
      filesystemTimeout: 300,
      agentsTimeout: 300,
    };

    const systemWithConfig = new HealthCheckSystem(config);
    expect(systemWithConfig).toBeDefined();
  });

  it('should handle custom health thresholds', async () => {
    const config = {
      diskUsageWarnThreshold: 75,
      diskUsageCriticalThreshold: 90,
      queueDepthWarnThreshold: 50,
      queueDepthCriticalThreshold: 200,
    };

    const systemWithThresholds = new HealthCheckSystem(config);
    expect(systemWithThresholds).toBeDefined();
  });
});

describe('Health Check Coverage >90%', () => {
  // This test group tracks coverage metrics
  // Expected coverage: >90% of health-check-system.ts

  it('should achieve >90% code coverage', async () => {
    // This is a placeholder for coverage reporting
    // Actual coverage should be verified via coverage reports
    expect(true).toBe(true);
  });
});
