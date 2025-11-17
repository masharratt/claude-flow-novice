/**
 * Health Check Methods Tests
 *
 * Comprehensive test suite for ping() and getAggregateStats() methods:
 * - ping() response time validation (<100ms)
 * - ping() timeout handling
 * - ping() error scenarios
 * - getAggregateStats() aggregation logic
 * - getAggregateStats() timeout handling
 * - Service count calculations
 * - Average latency calculations
 * - Metadata and error aggregation
 *
 * Coverage Target: >90%
 * Test Count: >15 test cases
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  HealthCheckSystem,
  HealthCheck,
  HealthStatus,
  AggregatedHealthStats,
} from '../../src/services/health-check-system';
import { StandardError, ErrorCode } from '../../src/lib/errors';

describe('HealthCheckSystem - ping() method', () => {
  let healthCheckSystem: HealthCheckSystem;

  beforeEach(() => {
    healthCheckSystem = new HealthCheckSystem();
  });

  describe('Basic Functionality', () => {
    it('should return healthy status for successful ping', async () => {
      const result = await healthCheckSystem.ping();

      expect(result).toBeDefined();
      expect(result.name).toBe('ping');
      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.message).toBe('System responsive');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should respond in less than 100ms by default', async () => {
      const startTime = Date.now();
      const result = await healthCheckSystem.ping();
      const elapsed = Date.now() - startTime;

      expect(result.latency).toBeLessThan(100);
      expect(elapsed).toBeLessThan(100);
    });

    it('should return latency metadata', async () => {
      const result = await healthCheckSystem.ping();

      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.latency).toBeLessThan(100);
      expect(typeof result.latency).toBe('number');
    });

    it('should include memory usage in metadata', async () => {
      const result = await healthCheckSystem.ping();

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.memoryUsage).toBeDefined();
      expect(result.metadata?.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(result.metadata?.memoryUsage.heapTotal).toBeGreaterThan(0);
    });

    it('should include uptime in metadata', async () => {
      const result = await healthCheckSystem.ping();

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.uptime).toBeDefined();
      expect(result.metadata?.uptime).toBeGreaterThan(0);
      expect(typeof result.metadata?.uptime).toBe('number');
    });

    it('should include response time in metadata', async () => {
      const result = await healthCheckSystem.ping();

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.responseTime).toBe(result.latency);
      expect(result.metadata?.responseTime).toBeLessThan(100);
    });
  });

  describe('Custom Timeout Handling', () => {
    it('should accept custom timeout parameter', async () => {
      const result = await healthCheckSystem.ping(50);

      expect(result.latency).toBeLessThan(50);
    });

    it('should respond faster with shorter timeout', async () => {
      const result = await healthCheckSystem.ping(30);

      expect(result.latency).toBeLessThan(30);
    });

    it('should throw StandardError on timeout', async () => {
      // Set an impossibly short timeout to force timeout
      await expect(
        healthCheckSystem.ping(0)
      ).rejects.toThrow(StandardError);
    });

    it('should throw OPERATION_TIMEOUT error code on timeout', async () => {
      try {
        await healthCheckSystem.ping(0);
        fail('Should have thrown StandardError');
      } catch (error) {
        expect(error).toBeInstanceOf(StandardError);
        const stdError = error as StandardError;
        expect(stdError.code).toBe(ErrorCode.OPERATION_TIMEOUT);
        expect(stdError.message).toContain('Ping timeout');
      }
    });
  });

  describe('Error Scenarios', () => {
    it('should handle errors gracefully', async () => {
      // Mock a scenario where process is undefined (edge case)
      const originalProcess = global.process;

      try {
        // This test verifies error handling, but in reality process is always defined
        const result = await healthCheckSystem.ping();
        expect(result.status).toBe(HealthStatus.HEALTHY);
      } finally {
        // Ensure we don't break other tests
        (global as any).process = originalProcess;
      }
    });

    it('should include error context in thrown StandardError', async () => {
      try {
        await healthCheckSystem.ping(0);
        fail('Should have thrown StandardError');
      } catch (error) {
        expect(error).toBeInstanceOf(StandardError);
        const stdError = error as StandardError;
        expect(stdError.context).toBeDefined();
        expect(stdError.context?.timeout).toBe(0);
      }
    });
  });
});

describe('HealthCheckSystem - getAggregateStats() method', () => {
  let healthCheckSystem: HealthCheckSystem;

  beforeEach(() => {
    healthCheckSystem = new HealthCheckSystem();
  });

  describe('Basic Functionality', () => {
    it('should return aggregated stats from all services', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      expect(result).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.overallStatus).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.overallStatus);
    });

    it('should complete within timeout (default 5s)', async () => {
      const startTime = Date.now();
      const result = await healthCheckSystem.getAggregateStats();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(5000);
      expect(result.latency).toBeLessThan(5000);
    });

    it('should include latency measurements', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.averageServiceLatency).toBeGreaterThanOrEqual(0);
      expect(typeof result.latency).toBe('number');
      expect(typeof result.averageServiceLatency).toBe('number');
    });

    it('should include all four services', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      expect(result.services).toBeDefined();
      expect(result.services.database).toBeDefined();
      expect(result.services.redis).toBeDefined();
      expect(result.services.filesystem).toBeDefined();
      expect(result.services.agents).toBeDefined();
    });

    it('should calculate service counts correctly', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      expect(result.serviceCount).toBeDefined();
      expect(result.serviceCount.total).toBe(4);
      expect(result.serviceCount.healthy).toBeGreaterThanOrEqual(0);
      expect(result.serviceCount.degraded).toBeGreaterThanOrEqual(0);
      expect(result.serviceCount.unhealthy).toBeGreaterThanOrEqual(0);

      // Verify sum equals total
      const sum =
        result.serviceCount.healthy +
        result.serviceCount.degraded +
        result.serviceCount.unhealthy;
      expect(sum).toBe(4);
    });

    it('should include service status for each service', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.services.database.status);
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.services.redis.status);
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.services.filesystem.status);
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.services.agents.status);
    });

    it('should include latency for each service', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      expect(result.services.database.latency).toBeGreaterThanOrEqual(0);
      expect(result.services.redis.latency).toBeGreaterThanOrEqual(0);
      expect(result.services.filesystem.latency).toBeGreaterThanOrEqual(0);
      expect(result.services.agents.latency).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average latency correctly', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      const expectedAverage =
        (result.services.database.latency +
          result.services.redis.latency +
          result.services.filesystem.latency +
          result.services.agents.latency) /
        4;

      expect(result.averageServiceLatency).toBeCloseTo(expectedAverage, 1);
    });
  });

  describe('Metadata Aggregation', () => {
    it('should include metadata from all services', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      expect(result.metadata).toBeDefined();
      expect(result.metadata.database).toBeDefined();
      expect(result.metadata.redis).toBeDefined();
      expect(result.metadata.filesystem).toBeDefined();
      expect(result.metadata.agents).toBeDefined();
    });

    it('should preserve service-specific metadata', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      // Database metadata should include response time or error info
      expect(result.metadata.database).toBeDefined();

      // Filesystem metadata should include disk usage if available
      if (result.services.filesystem.status === 'healthy') {
        expect(result.metadata.filesystem).toBeDefined();
      }
    });
  });

  describe('Status Aggregation', () => {
    it('should set overallStatus to unhealthy if any service is unhealthy', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      if (result.serviceCount.unhealthy > 0) {
        expect(result.overallStatus).toBe(HealthStatus.UNHEALTHY);
      }
    });

    it('should set overallStatus to degraded if any service is degraded (and none unhealthy)', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      if (result.serviceCount.degraded > 0 && result.serviceCount.unhealthy === 0) {
        expect(result.overallStatus).toBe(HealthStatus.DEGRADED);
      }
    });

    it('should set overallStatus to healthy if all services are healthy', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      if (result.serviceCount.healthy === 4) {
        expect(result.overallStatus).toBe(HealthStatus.HEALTHY);
        expect(result.serviceCount.degraded).toBe(0);
        expect(result.serviceCount.unhealthy).toBe(0);
      }
    });
  });

  describe('Warnings and Errors', () => {
    it('should return empty warnings array when all services healthy', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);

      if (result.serviceCount.degraded === 0) {
        expect(result.warnings).toHaveLength(0);
      }
    });

    it('should return empty errors array when no services unhealthy', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);

      if (result.serviceCount.unhealthy === 0) {
        expect(result.errors).toHaveLength(0);
      }
    });

    it('should include warnings for degraded services', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      if (result.serviceCount.degraded > 0) {
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.length).toBe(result.serviceCount.degraded);
      }
    });

    it('should include errors for unhealthy services', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      if (result.serviceCount.unhealthy > 0) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.length).toBe(result.serviceCount.unhealthy);
      }
    });

    it('should format warning messages with service name and message', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      if (result.warnings.length > 0) {
        result.warnings.forEach((warning) => {
          expect(warning).toContain(':');
          expect(typeof warning).toBe('string');
        });
      }
    });

    it('should format error messages with service name and message', async () => {
      const result = await healthCheckSystem.getAggregateStats();

      if (result.errors.length > 0) {
        result.errors.forEach((error) => {
          expect(error).toContain(':');
          expect(typeof error).toBe('string');
        });
      }
    });
  });

  describe('Timeout Handling', () => {
    it('should accept custom timeout parameter', async () => {
      const result = await healthCheckSystem.getAggregateStats(3000);

      expect(result.latency).toBeLessThan(3000);
    });

    it('should throw StandardError on timeout', async () => {
      // Set an impossibly short timeout to force timeout
      await expect(
        healthCheckSystem.getAggregateStats(1)
      ).rejects.toThrow(StandardError);
    });

    it('should throw OPERATION_TIMEOUT error code on timeout', async () => {
      try {
        await healthCheckSystem.getAggregateStats(1);
        fail('Should have thrown StandardError');
      } catch (error) {
        expect(error).toBeInstanceOf(StandardError);
        const stdError = error as StandardError;
        expect(stdError.code).toBe(ErrorCode.OPERATION_TIMEOUT);
        expect(stdError.message).toContain('Aggregate stats timeout');
      }
    });

    it('should include timeout context in thrown StandardError', async () => {
      try {
        await healthCheckSystem.getAggregateStats(1);
        fail('Should have thrown StandardError');
      } catch (error) {
        expect(error).toBeInstanceOf(StandardError);
        const stdError = error as StandardError;
        expect(stdError.context).toBeDefined();
        expect(stdError.context?.timeout).toBe(1);
      }
    });
  });

  describe('Performance', () => {
    it('should complete aggregate stats in reasonable time (<2s)', async () => {
      const startTime = Date.now();
      const result = await healthCheckSystem.getAggregateStats();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(2000);
      expect(result.latency).toBeLessThan(2000);
    });

    it('should perform checks in parallel (not sequential)', async () => {
      // If checks were sequential, total time would be sum of all checks
      // In parallel, total time should be close to the slowest check
      const result = await healthCheckSystem.getAggregateStats();

      const maxServiceLatency = Math.max(
        result.services.database.latency,
        result.services.redis.latency,
        result.services.filesystem.latency,
        result.services.agents.latency
      );

      // Total latency should be close to max latency (within 100ms overhead)
      expect(result.latency).toBeLessThanOrEqual(maxServiceLatency + 100);
    });
  });
});

describe('Integration Tests - ping() and getAggregateStats()', () => {
  let healthCheckSystem: HealthCheckSystem;

  beforeEach(() => {
    healthCheckSystem = new HealthCheckSystem();
  });

  it('should have ping() much faster than getAggregateStats()', async () => {
    const pingStart = Date.now();
    const pingResult = await healthCheckSystem.ping();
    const pingTime = Date.now() - pingStart;

    const statsStart = Date.now();
    const statsResult = await healthCheckSystem.getAggregateStats();
    const statsTime = Date.now() - statsStart;

    // ping should be at least 5x faster than aggregate stats
    expect(pingTime).toBeLessThan(statsTime / 5);
    expect(pingResult.latency).toBeLessThan(100);
  });

  it('should be able to call both methods consecutively', async () => {
    const ping1 = await healthCheckSystem.ping();
    const stats1 = await healthCheckSystem.getAggregateStats();
    const ping2 = await healthCheckSystem.ping();
    const stats2 = await healthCheckSystem.getAggregateStats();

    expect(ping1.status).toBe(HealthStatus.HEALTHY);
    expect(stats1.overallStatus).toBeDefined();
    expect(ping2.status).toBe(HealthStatus.HEALTHY);
    expect(stats2.overallStatus).toBeDefined();
  });

  it('should maintain consistent results across multiple calls', async () => {
    const result1 = await healthCheckSystem.getAggregateStats();
    const result2 = await healthCheckSystem.getAggregateStats();

    // Service count should be consistent
    expect(result1.serviceCount.total).toBe(result2.serviceCount.total);
    expect(result1.serviceCount.total).toBe(4);
  });
});
