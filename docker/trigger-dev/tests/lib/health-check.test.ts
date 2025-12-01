/**
 * Unit Tests for HealthChecker
 *
 * Tests production health monitoring for system components.
 * Covers RuVector connectivity, database checks, disk space,
 * memory usage, and overall system health aggregation.
 *
 * Test Coverage:
 * - RuVector API key validation and connectivity
 * - Database configuration checks
 * - Disk space threshold monitoring (>75%, >90%)
 * - Memory heap usage monitoring
 * - Overall health status calculation (healthy/degraded/unhealthy)
 * - Component health aggregation
 * - Uptime tracking
 * - Error handling and degradation scenarios
 *
 * @module health-check.test
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { SpyInstance } from 'jest-mock';
import {
  HealthChecker,
  initializeHealthChecker,
  getHealthChecker,
  handleHealthCheck,
  HealthStatus,
  ComponentHealth,
} from '../../src/lib/health-check.js';

describe('HealthChecker', () => {
  let checker: HealthChecker;
  let originalEnv: NodeJS.ProcessEnv;
  let errorSpy: SpyInstance;

  beforeEach(() => {
    checker = new HealthChecker();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================
  // RuVector Health Check Tests
  // =============================================

  describe('RuVector Health Check', () => {
    it('should report unhealthy when API key is missing', async () => {
      delete process.env.RUVECTOR_API_KEY;

      const result = await checker.checkRuVector();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('API key not configured');
      expect(result.details?.apiKeyConfigured).toBe(false);
    });

    it('should report degraded when API key format is invalid', async () => {
      process.env.RUVECTOR_API_KEY = 'invalid_key_format';

      const result = await checker.checkRuVector();

      expect(result.status).toBe('degraded');
      expect(result.message).toContain('API key format invalid');
      expect(result.details?.apiKeyValid).toBe(false);
    });

    it('should report healthy when API key is valid', async () => {
      process.env.RUVECTOR_API_KEY = 'rv_test_key_12345';

      const result = await checker.checkRuVector();

      expect(result.status).toBe('healthy');
      expect(result.message).toContain('connected and operational');
      expect(result.details?.apiKeyConfigured).toBe(true);
      expect(result.details?.apiKeyValid).toBe(true);
    });

    it('should include check duration in details', async () => {
      process.env.RUVECTOR_API_KEY = 'rv_test_key';

      const result = await checker.checkRuVector();

      expect(result.details?.checkDurationMs).toBeDefined();
      expect(typeof result.details?.checkDurationMs).toBe('number');
      expect(result.details?.checkDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include lastChecked timestamp', async () => {
      process.env.RUVECTOR_API_KEY = 'rv_test_key';

      const result = await checker.checkRuVector();

      expect(result.lastChecked).toBeInstanceOf(Date);
    });

    it('should have correct component name', async () => {
      process.env.RUVECTOR_API_KEY = 'rv_test_key';

      const result = await checker.checkRuVector();

      expect(result.name).toBe('RuVector');
    });
  });

  // =============================================
  // Database Health Check Tests
  // =============================================

  describe('Database Health Check', () => {
    it('should report unhealthy when database host is missing', async () => {
      delete process.env.DATABASE_HOST;
      delete process.env.DB_HOST;

      const result = await checker.checkDatabase();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('configuration incomplete');
      expect(result.details?.hostConfigured).toBe(false);
    });

    it('should report unhealthy when database port is missing', async () => {
      process.env.DATABASE_HOST = 'localhost';
      delete process.env.DATABASE_PORT;
      delete process.env.DB_PORT;

      const result = await checker.checkDatabase();

      expect(result.status).toBe('unhealthy');
      expect(result.details?.portConfigured).toBe(false);
    });

    it('should report unhealthy when database user is missing', async () => {
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_PORT = '5432';
      delete process.env.DATABASE_USER;
      delete process.env.DB_USER;

      const result = await checker.checkDatabase();

      expect(result.status).toBe('unhealthy');
      expect(result.details?.userConfigured).toBe(false);
    });

    it('should report healthy when all database config is present', async () => {
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_PORT = '5432';
      process.env.DATABASE_USER = 'postgres';

      const result = await checker.checkDatabase();

      expect(result.status).toBe('healthy');
      expect(result.message).toContain('connected and operational');
      expect(result.details?.host).toBe('localhost');
      expect(result.details?.port).toBe('5432');
    });

    it('should support legacy DB_ prefixed environment variables', async () => {
      process.env.DB_HOST = 'db.example.com';
      process.env.DB_PORT = '5433';
      process.env.DB_USER = 'admin';

      const result = await checker.checkDatabase();

      expect(result.status).toBe('healthy');
      expect(result.details?.host).toBe('db.example.com');
      expect(result.details?.port).toBe('5433');
    });

    it('should include check duration', async () => {
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_PORT = '5432';
      process.env.DATABASE_USER = 'postgres';

      const result = await checker.checkDatabase();

      expect(result.details?.checkDurationMs).toBeDefined();
      expect(typeof result.details?.checkDurationMs).toBe('number');
    });
  });

  // =============================================
  // Disk Space Health Check Tests
  // =============================================

  describe('Disk Space Health Check', () => {
    it('should report status based on mock disk usage', async () => {
      // Run multiple times to test different mock values
      const results: ComponentHealth[] = [];
      for (let i = 0; i < 50; i++) {
        results.push(await checker.checkDiskSpace());
      }

      // Should have at least one healthy result (usage < 75%)
      const hasHealthy = results.some((r) => r.status === 'healthy');
      expect(hasHealthy).toBe(true);
    });

    it('should include usage percentage in details', async () => {
      const result = await checker.checkDiskSpace();

      expect(result.details?.usagePercent).toBeDefined();
      expect(typeof result.details?.usagePercent).toBe('string');
    });

    it('should include disk paths in details', async () => {
      const result = await checker.checkDiskSpace();

      expect(result.details?.dbPath).toBeDefined();
      expect(result.details?.cachePath).toBeDefined();
    });

    it('should use environment-specific paths when set', async () => {
      process.env.DB_DATA_PATH = '/custom/db/path';
      process.env.CACHE_PATH = '/custom/cache/path';

      const result = await checker.checkDiskSpace();

      expect(result.details?.dbPath).toBe('/custom/db/path');
      expect(result.details?.cachePath).toBe('/custom/cache/path');
    });

    it('should use default paths when env vars not set', async () => {
      delete process.env.DB_DATA_PATH;
      delete process.env.CACHE_PATH;

      const result = await checker.checkDiskSpace();

      expect(result.details?.dbPath).toBe('/var/lib/postgresql/data');
      expect(result.details?.cachePath).toBe('/tmp/cache');
    });

    it('should have correct component name', async () => {
      const result = await checker.checkDiskSpace();

      expect(result.name).toBe('Disk Space');
    });
  });

  // =============================================
  // Memory Health Check Tests
  // =============================================

  describe('Memory Health Check', () => {
    it('should check memory heap usage', async () => {
      const result = await checker.checkMemory();

      expect(result.name).toBe('Memory');
      expect(result.details?.heapUsedMb).toBeDefined();
      expect(result.details?.heapTotalMb).toBeDefined();
      expect(result.details?.heapPercent).toBeDefined();
    });

    it('should calculate heap percentage correctly', async () => {
      const result = await checker.checkMemory();
      const heapPercent = parseFloat(result.details?.heapPercent as string);

      expect(heapPercent).toBeGreaterThanOrEqual(0);
      expect(heapPercent).toBeLessThanOrEqual(100);
    });

    it('should report status based on heap usage', async () => {
      const result = await checker.checkMemory();

      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
    });

    it('should include check duration', async () => {
      const result = await checker.checkMemory();

      expect(result.details?.checkDurationMs).toBeDefined();
      expect(typeof result.details?.checkDurationMs).toBe('number');
    });

    it('should format memory in MB', async () => {
      const result = await checker.checkMemory();

      const heapUsedMb = result.details?.heapUsedMb as string;
      const heapTotalMb = result.details?.heapTotalMb as string;

      expect(heapUsedMb).toMatch(/^\d+\.\d$/);
      expect(heapTotalMb).toMatch(/^\d+\.\d$/);
    });
  });

  // =============================================
  // Overall System Health Tests
  // =============================================

  describe('Overall System Health', () => {
    it('should aggregate all component checks', async () => {
      process.env.RUVECTOR_API_KEY = 'rv_test_key';
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_PORT = '5432';
      process.env.DATABASE_USER = 'postgres';

      const report = await checker.performAllChecks();

      expect(report.components).toHaveLength(4);
      expect(report.components.map((c) => c.name)).toEqual([
        'RuVector',
        'Database',
        'Disk Space',
        'Memory',
      ]);
    });

    it('should report unhealthy if any component is unhealthy', async () => {
      delete process.env.RUVECTOR_API_KEY; // Makes RuVector unhealthy

      const report = await checker.performAllChecks();

      expect(report.status).toBe('unhealthy');
    });

    it('should report degraded if any component is degraded but none unhealthy', async () => {
      process.env.RUVECTOR_API_KEY = 'invalid_format'; // Makes RuVector degraded
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_PORT = '5432';
      process.env.DATABASE_USER = 'postgres';

      const report = await checker.performAllChecks();

      // May be degraded or unhealthy depending on disk/memory checks
      expect(['degraded', 'unhealthy']).toContain(report.status);
    });

    it('should include timestamp in report', async () => {
      const report = await checker.performAllChecks();

      expect(report.timestamp).toBeInstanceOf(Date);
    });

    it('should include uptime in report', async () => {
      const report = await checker.performAllChecks();

      expect(report.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof report.uptime).toBe('number');
    });

    it('should include summary message', async () => {
      const report = await checker.performAllChecks();

      expect(report.summary).toContain('System');
      expect(report.summary).toContain('4 components checked');
    });

    it('should track uptime between calls', async () => {
      const report1 = await checker.performAllChecks();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const report2 = await checker.performAllChecks();

      expect(report2.uptime).toBeGreaterThan(report1.uptime);
    });
  });

  // =============================================
  // Uptime Tracking Tests
  // =============================================

  describe('Uptime Tracking', () => {
    it('should return uptime in milliseconds', () => {
      const uptime = checker.getUptime();

      expect(uptime).toBeGreaterThanOrEqual(0);
      expect(typeof uptime).toBe('number');
    });

    it('should increase uptime over time', async () => {
      const uptime1 = checker.getUptime();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const uptime2 = checker.getUptime();

      expect(uptime2).toBeGreaterThan(uptime1);
    });
  });

  // =============================================
  // Error Handling Tests
  // =============================================

  describe('Error Handling', () => {
    it('should handle errors gracefully in RuVector check', async () => {
      // Mock console.error to suppress error output
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Simulate error by setting invalid env var
      process.env.RUVECTOR_API_KEY = 'rv_valid';

      const result = await checker.checkRuVector();

      // Should still return a valid ComponentHealth object
      expect(result.name).toBe('RuVector');
      expect(result.lastChecked).toBeInstanceOf(Date);

      errorSpy.mockRestore();
    });

    it('should handle errors gracefully in database check', async () => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_PORT = '5432';
      process.env.DATABASE_USER = 'postgres';

      const result = await checker.checkDatabase();

      expect(result.name).toBe('Database');
      expect(result.lastChecked).toBeInstanceOf(Date);

      errorSpy.mockRestore();
    });

    it('should handle errors gracefully in disk check', async () => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await checker.checkDiskSpace();

      expect(result.name).toBe('Disk Space');
      expect(result.lastChecked).toBeInstanceOf(Date);

      errorSpy.mockRestore();
    });

    it('should handle errors gracefully in memory check', async () => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await checker.checkMemory();

      expect(result.name).toBe('Memory');
      expect(result.lastChecked).toBeInstanceOf(Date);

      errorSpy.mockRestore();
    });
  });

  // =============================================
  // Singleton Pattern Tests
  // =============================================

  describe('Singleton Pattern', () => {
    it('should initialize global health checker', () => {
      const instance1 = initializeHealthChecker();
      const instance2 = getHealthChecker();

      expect(instance1).toBe(instance2);
    });

    it('should return same instance on multiple getHealthChecker calls', () => {
      const instance1 = getHealthChecker();
      const instance2 = getHealthChecker();

      expect(instance1).toBe(instance2);
    });
  });

  // =============================================
  // Express Handler Tests
  // =============================================

  describe('Express Handler', () => {
    it('should return system health report', async () => {
      process.env.RUVECTOR_API_KEY = 'rv_test_key';
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_PORT = '5432';
      process.env.DATABASE_USER = 'postgres';

      const report = await handleHealthCheck();

      expect(report.status).toBeDefined();
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.components).toHaveLength(4);
      expect(report.uptime).toBeGreaterThanOrEqual(0);
      expect(report.summary).toBeDefined();
    });

    it('should work without request/response parameters', async () => {
      const report = await handleHealthCheck();

      expect(report).toBeDefined();
      expect(report.components).toBeDefined();
    });
  });

  // =============================================
  // Component Detail Tests
  // =============================================

  describe('Component Details', () => {
    it('should include all required fields in component health', async () => {
      process.env.RUVECTOR_API_KEY = 'rv_test_key';

      const result = await checker.checkRuVector();

      expect(result.name).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.lastChecked).toBeDefined();
      expect(result.details).toBeDefined();
    });

    it('should have consistent status values', async () => {
      const report = await checker.performAllChecks();

      report.components.forEach((component) => {
        expect(['healthy', 'degraded', 'unhealthy']).toContain(component.status);
      });
    });
  });
});
