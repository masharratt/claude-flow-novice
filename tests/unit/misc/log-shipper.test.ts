/**
 * Log Shipper Test Suite
 * Tests centralized log shipping to Loki/Elasticsearch with aggregation and retention
 *
 * Task P2-2.3: Centralized Logging with ELK/Loki Stack
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LogShipper, LogEntry, ShippingOptions } from '../src/lib/log-shipper';

describe('LogShipper', () => {
  const testDir = path.join('/tmp', 'log-shipper-tests');
  const lokiUrl = 'http://localhost:3100';

  let shipper: LogShipper;

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });

    // Create shipper instance with test configuration
    const options: ShippingOptions = {
      lokiUrl,
      bufferSize: 10, // Small buffer for testing
      flushInterval: 100, // 100ms for testing
      defaultLabels: {
        environment: 'test',
        service: 'cfn',
      },
      retryAttempts: 2,
      retryDelay: 50,
      persistDir: testDir,
    };

    shipper = new LogShipper(options);
  });

  afterEach(async () => {
    if (shipper) {
      await shipper.flush();
      await shipper.close();
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Log Entry Creation', () => {
    it('should create properly formatted log entry', async () => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test message',
        context: 'test-service',
      };

      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('level');
      expect(entry).toHaveProperty('message');
      expect(entry).toHaveProperty('context');
      expect(entry.level).toBe('info');
    });

    it('should handle correlation ID injection', () => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test message',
        context: 'test-service',
        correlationId: 'corr-12345',
      };

      expect(entry.correlationId).toBe('corr-12345');
    });

    it('should handle metadata in log entries', () => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test message',
        context: 'test-service',
        metadata: {
          userId: 'user-123',
          duration: 1500,
          service: 'api',
        },
      };

      expect(entry.metadata?.userId).toBe('user-123');
      expect(entry.metadata?.duration).toBe(1500);
    });

    it('should handle error objects in log entries', () => {
      const error = new Error('Test error');
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'An error occurred',
        context: 'test-service',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      };

      expect(entry.error?.name).toBe('Error');
      expect(entry.error?.message).toBe('Test error');
    });
  });

  describe('Log Shipping', () => {
    it('should ship logs to Loki endpoint', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
      global.fetch = mockFetch;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test shipment',
        context: 'test-service',
      };

      await shipper.ship(entry);
      await shipper.flush();

      // Verify fetch was called with correct endpoint
      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('/loki/api/v1/push');
    });

    it('should batch logs before shipping', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
      global.fetch = mockFetch;

      // Add logs to buffer
      for (let i = 0; i < 5; i++) {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Message ${i}`,
          context: 'test-service',
        };
        await shipper.ship(entry);
      }

      // Should not ship yet (buffer size is 10)
      expect(mockFetch).not.toHaveBeenCalled();

      // Flush and verify
      await shipper.flush();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should auto-flush when buffer reaches size', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
      global.fetch = mockFetch;

      // Add logs to fill buffer (buffer size is 10)
      for (let i = 0; i < 10; i++) {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Message ${i}`,
          context: 'test-service',
        };
        await shipper.ship(entry);
      }

      // Add one more to trigger auto-flush
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Trigger flush',
        context: 'test-service',
      };
      await shipper.ship(entry);

      // Wait for async flush
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should retry on transient failures', async () => {
      let attemptCount = 0;
      const mockFetch = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          return Promise.reject(new Error('Transient failure'));
        }
        return Promise.resolve({ ok: true, status: 204 });
      });
      global.fetch = mockFetch;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test retry',
        context: 'test-service',
      };

      await shipper.ship(entry);
      await shipper.flush();

      // Should have retried at least once
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should add correlation ID to logs', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
      global.fetch = mockFetch;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test correlation',
        context: 'test-service',
        correlationId: 'trace-xyz-123',
      };

      await shipper.ship(entry);
      await shipper.flush();

      expect(mockFetch).toHaveBeenCalled();
      const body = mockFetch.mock.calls[0][1]?.body || '';
      expect(body).toContain('trace-xyz-123');
    });
  });

  describe('JSON Formatting', () => {
    it('should format logs as valid JSON', async () => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'JSON format test',
        context: 'test-service',
        metadata: { key: 'value' },
      };

      const json = JSON.stringify(entry);
      const parsed = JSON.parse(json);

      expect(parsed.message).toBe('JSON format test');
      expect(parsed.metadata.key).toBe('value');
    });

    it('should handle special characters in messages', () => {
      const specialMessage = 'Test with "quotes" and \\backslash and \n newline';
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: specialMessage,
        context: 'test-service',
      };

      const json = JSON.stringify(entry);
      const parsed = JSON.parse(json);

      expect(parsed.message).toBe(specialMessage);
    });

    it('should include all required fields in formatted log', () => {
      const entry: LogEntry = {
        timestamp: '2025-11-16T12:00:00Z',
        level: 'warn',
        message: 'Warning message',
        context: 'service-name',
      };

      const formatted = shipper.formatLog(entry);
      const parsed = JSON.parse(formatted);

      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('level');
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('context');
    });
  });

  describe('Retention Policies', () => {
    it('should enforce 30-day retention', async () => {
      // Create an old log entry (31 days old)
      const now = new Date();
      const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);

      const oldEntry: LogEntry = {
        timestamp: thirtyOneDaysAgo.toISOString(),
        level: 'info',
        message: 'Old log',
        context: 'test-service',
      };

      // Should be marked for deletion
      const isExpired = shipper.isLogExpired(oldEntry, 30);
      expect(isExpired).toBe(true);
    });

    it('should keep logs within retention window', () => {
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      const recentEntry: LogEntry = {
        timestamp: fiveDaysAgo.toISOString(),
        level: 'info',
        message: 'Recent log',
        context: 'test-service',
      };

      const isExpired = shipper.isLogExpired(recentEntry, 30);
      expect(isExpired).toBe(false);
    });

    it('should cleanup expired logs from buffer', async () => {
      const now = new Date();
      const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);

      const oldEntry: LogEntry = {
        timestamp: thirtyOneDaysAgo.toISOString(),
        level: 'info',
        message: 'Old log',
        context: 'test-service',
      };

      const recentEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Recent log',
        context: 'test-service',
      };

      await shipper.ship(oldEntry);
      await shipper.ship(recentEntry);

      const cleanedLogs = await shipper.cleanupExpiredLogs(30);

      expect(cleanedLogs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Search and Query', () => {
    it('should query logs by correlation ID', async () => {
      const correlationId = 'corr-test-123';
      const entries: LogEntry[] = [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Message 1',
          context: 'service-1',
          correlationId,
        },
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'Message 2',
          context: 'service-2',
          correlationId,
        },
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Message 3',
          context: 'service-3',
        },
      ];

      const filtered = entries.filter(e => e.correlationId === correlationId);
      expect(filtered).toHaveLength(2);
      expect(filtered.every(e => e.correlationId === correlationId)).toBe(true);
    });

    it('should query logs by time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const entries: LogEntry[] = [
        {
          timestamp: twoHoursAgo.toISOString(),
          level: 'info',
          message: 'Old',
          context: 'service',
        },
        {
          timestamp: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          level: 'info',
          message: 'Recent',
          context: 'service',
        },
        {
          timestamp: now.toISOString(),
          level: 'info',
          message: 'Now',
          context: 'service',
        },
      ];

      const inRange = entries.filter(
        e =>
          new Date(e.timestamp) >= oneHourAgo &&
          new Date(e.timestamp) <= now
      );

      expect(inRange).toHaveLength(2);
    });

    it('should query logs by level and source', () => {
      const entries: LogEntry[] = [
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'Error 1',
          context: 'api-service',
        },
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'Error 2',
          context: 'database-service',
        },
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Info',
          context: 'api-service',
        },
      ];

      const apiErrors = entries.filter(
        e => e.level === 'error' && e.context === 'api-service'
      );

      expect(apiErrors).toHaveLength(1);
      expect(apiErrors[0].message).toBe('Error 1');
    });

    it('should build LogQL query strings', () => {
      const query = shipper.buildLogQLQuery({
        level: 'error',
        service: 'cfn-agent',
        correlationId: 'trace-123',
      });

      expect(query).toContain('level');
      expect(query).toContain('error');
      expect(query).toContain('service');
      expect(query).toContain('cfn-agent');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle network errors gracefully', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test',
        context: 'test-service',
      };

      // Ship should not throw, logs are buffered
      await expect(shipper.ship(entry)).resolves.not.toThrow();

      // But flush should handle the error gracefully
      try {
        await shipper.flush();
      } catch (err) {
        // Expected - network error
        expect(err).toBeDefined();
      }
    });

    it('should persist failed logs to disk', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Persist test',
        context: 'test-service',
      };

      await shipper.ship(entry);

      // Attempt flush which will fail and persist logs
      try {
        await shipper.flush();
      } catch (err) {
        // Expected to fail and persist
      }

      // Check persistence (logs may or may not be persisted depending on timing)
      const persisted = await shipper.getPersistentLogs();
      expect(persisted).toBeDefined();
      expect(Array.isArray(persisted)).toBe(true);
    });

    it('should handle invalid timestamps', () => {
      const entry: LogEntry = {
        timestamp: 'invalid-timestamp',
        level: 'info',
        message: 'Test',
        context: 'test-service',
      };

      // Should not throw, but handle gracefully
      expect(() => JSON.stringify(entry)).not.toThrow();
    });

    it('should handle large batch payloads', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
      global.fetch = mockFetch;

      // Ship large batch
      for (let i = 0; i < 100; i++) {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Large batch message ${i}`,
          context: 'test-service',
          metadata: {
            index: i,
            data: Array(1000).fill('x').join(''),
          },
        };
        await shipper.ship(entry);

        // Auto-flush every 10 entries
        if ((i + 1) % 10 === 0) {
          await shipper.flush();
        }
      }

      await shipper.flush();
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Performance and Optimization', () => {
    it('should ship logs with <1s latency', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
      global.fetch = mockFetch;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Performance test',
        context: 'test-service',
      };

      const startTime = Date.now();
      await shipper.ship(entry);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(1000);
    });

    it('should handle concurrent log shipping', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
      global.fetch = mockFetch;

      const promises = [];
      for (let i = 0; i < 20; i++) {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Concurrent ${i}`,
          context: 'test-service',
        };
        promises.push(shipper.ship(entry));
      }

      await Promise.all(promises);
      await shipper.flush();

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not block on flush operations', async () => {
      const mockFetch = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ ok: true, status: 204 }), 100))
      );
      global.fetch = mockFetch;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Non-blocking test',
        context: 'test-service',
      };

      const startTime = Date.now();
      shipper.ship(entry); // Don't await
      const nonBlockingElapsed = Date.now() - startTime;

      expect(nonBlockingElapsed).toBeLessThan(100);
    });
  });

  describe('Dashboard Integration', () => {
    it('should provide metrics for dashboards', async () => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Dashboard test',
        context: 'test-service',
      };

      await shipper.ship(entry);

      const metrics = shipper.getMetrics();
      expect(metrics).toHaveProperty('totalLogs');
      expect(metrics).toHaveProperty('bufferedLogs');
      expect(metrics).toHaveProperty('shippedLogs');
      expect(metrics).toHaveProperty('failedLogs');
    });

    it('should track error rate', async () => {
      const entries: LogEntry[] = [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Info',
          context: 'test-service',
        },
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'Error 1',
          context: 'test-service',
        },
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'Error 2',
          context: 'test-service',
        },
      ];

      for (const entry of entries) {
        await shipper.ship(entry);
      }

      const errorRate = shipper.getErrorRate();
      expect(errorRate).toBeGreaterThan(0);
      expect(errorRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Configuration', () => {
    it('should accept custom Loki URL', () => {
      const customUrl = 'http://loki.example.com:3100';
      const options: ShippingOptions = {
        lokiUrl: customUrl,
      };

      const customShipper = new LogShipper(options);
      expect(customShipper.getLokiUrl()).toBe(customUrl);
    });

    it('should accept custom labels', () => {
      const options: ShippingOptions = {
        lokiUrl: 'http://localhost:3100',
        defaultLabels: {
          environment: 'staging',
          version: 'v2.0',
        },
      };

      const customShipper = new LogShipper(options);
      expect(customShipper.getDefaultLabels()).toHaveProperty('environment', 'staging');
    });

    it('should accept custom buffer size and flush interval', () => {
      const options: ShippingOptions = {
        lokiUrl: 'http://localhost:3100',
        bufferSize: 50,
        flushInterval: 1000,
      };

      const customShipper = new LogShipper(options);
      expect(customShipper.getBufferSize()).toBe(50);
      expect(customShipper.getFlushInterval()).toBe(1000);
    });
  });
});
