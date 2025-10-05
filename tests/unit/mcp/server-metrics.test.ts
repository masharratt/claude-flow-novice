/**
 * MCP Server Metrics Instrumentation Test Suite
 *
 * Tests the metrics functions used by mcp/server.ts:
 * - Line 275-278: incrementMetric('api.request.received', ...)
 * - Line 338-341: recordTiming('api.request.duration', ..., {status: 'success'})
 * - Line 350-353: recordTiming('api.request.duration', ..., {status: 'error'})
 * - Line 355-358: incrementMetric('api.error.count', ...)
 *
 * This test suite validates the metrics storage layer that MCP Server uses.
 * Target: 85%+ coverage for metrics tracking functionality.
 */

import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { getGlobalMetricsStorage, MetricsStorage, setGlobalMetricsStorage } from '../../../src/observability/metrics-storage.js';
import { TelemetrySystem, setGlobalTelemetry } from '../../../src/observability/telemetry.js';
import { incrementMetric, recordTiming } from '../../../src/observability/metrics-counter.js';
import fs from 'fs';
import path from 'path';

// Test database path
const TEST_DB_PATH = '.claude-flow/test-mcp-server-metrics.db';

describe('MCP Server - Metrics Instrumentation', () => {
  let storage: MetricsStorage;
  let telemetry: TelemetrySystem;

  beforeEach(() => {
    // Clean up test database if exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize fresh storage and telemetry
    storage = new MetricsStorage(TEST_DB_PATH);
    setGlobalMetricsStorage(storage);

    telemetry = new TelemetrySystem({
      enableMetrics: true,
      enableTracing: false,
      enableStructuredLogging: false,
      enablePersistence: true,
    });
    setGlobalTelemetry(telemetry);
  });

  afterEach(() => {
    // CRITICAL: Close database connections before cleanup
    if (storage) {
      storage.close();
    }

    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Clean up WAL and SHM files (SQLite Write-Ahead Log files)
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }

    // Clean up test db directory
    const testDbDir = path.dirname(TEST_DB_PATH);
    if (fs.existsSync(testDbDir)) {
      const files = fs.readdirSync(testDbDir);
      files.forEach(file => {
        if (file.startsWith('test-mcp-server-metrics')) {
          try {
            fs.unlinkSync(path.join(testDbDir, file));
          } catch (err) {
            // Ignore cleanup errors (file may be locked)
          }
        }
      });
    }
  });

  describe('api.request.received Counter (Line 275-278)', () => {
    it('should track incoming requests with incrementMetric', () => {
      const beforeCount = storage.getCounterTotal('api.request.received');

      // Simulate MCP server line 275-278
      incrementMetric('api.request.received', 1, {
        endpoint: 'tools/invoke',
        clientId: 'test-client-123',
      });

      const afterCount = storage.getCounterTotal('api.request.received');
      expect(afterCount).toBe(beforeCount + 1);
    });

    it('should track request with endpoint tag', () => {
      incrementMetric('api.request.received', 1, {
        endpoint: 'tools/list',
        clientId: 'client-456',
      });

      const metrics = storage.query({
        name: 'api.request.received',
        limit: 1
      });

      expect(metrics.length).toBeGreaterThan(0);
      const tags = JSON.parse(metrics[0].tags);
      expect(tags.endpoint).toBe('tools/list');
      expect(tags.clientId).toBe('client-456');
    });

    it('should increment counter for each request', () => {
      const beforeCount = storage.getCounterTotal('api.request.received');

      // Simulate 3 requests
      incrementMetric('api.request.received', 1, { endpoint: 'method1', clientId: 'c1' });
      incrementMetric('api.request.received', 1, { endpoint: 'method2', clientId: 'c1' });
      incrementMetric('api.request.received', 1, { endpoint: 'method3', clientId: 'c1' });

      const afterCount = storage.getCounterTotal('api.request.received');
      expect(afterCount).toBe(beforeCount + 3);
    });

    it('should support unknown clientId', () => {
      incrementMetric('api.request.received', 1, {
        endpoint: 'test/method',
        clientId: 'unknown',
      });

      const metrics = storage.query({
        name: 'api.request.received',
        tags: { clientId: 'unknown' }
      });

      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('api.request.duration Timer (Success - Line 338-341)', () => {
    it('should track request duration with success status', () => {
      const duration = 150; // ms

      // Simulate MCP server line 338-341
      recordTiming('api.request.duration', duration, {
        endpoint: 'tools/invoke',
        status: 'success',
      });

      const metrics = storage.query({
        name: 'api.request.duration',
        limit: 1
      });

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].type).toBe('timer');
      expect(metrics[0].value).toBe(duration);

      const tags = JSON.parse(metrics[0].tags);
      expect(tags.status).toBe('success');
      expect(tags.endpoint).toBe('tools/invoke');
    });

    it('should record positive duration values', () => {
      const durations = [10, 50, 100, 250, 500];

      durations.forEach(duration => {
        recordTiming('api.request.duration', duration, {
          endpoint: 'test/method',
          status: 'success',
        });
      });

      const metrics = storage.query({
        name: 'api.request.duration',
        tags: { status: 'success' }
      });

      expect(metrics.length).toBe(durations.length);
      metrics.forEach(metric => {
        expect(metric.value).toBeGreaterThan(0);
        expect(durations).toContain(metric.value);
      });
    });

    it('should track duration for multiple successful requests', () => {
      const beforeCount = storage.query({
        name: 'api.request.duration',
        tags: { status: 'success' }
      }).length;

      // Simulate 3 successful requests
      recordTiming('api.request.duration', 100, { endpoint: 'method1', status: 'success' });
      recordTiming('api.request.duration', 150, { endpoint: 'method2', status: 'success' });
      recordTiming('api.request.duration', 200, { endpoint: 'method3', status: 'success' });

      const afterCount = storage.query({
        name: 'api.request.duration',
        tags: { status: 'success' }
      }).length;

      expect(afterCount).toBe(beforeCount + 3);
    });

    it('should calculate duration correctly', () => {
      const startTime = Date.now();
      // Simulate some work
      let sum = 0;
      for (let i = 0; i < 1000000; i++) {
        sum += i;
      }
      const duration = Date.now() - startTime;

      recordTiming('api.request.duration', duration, {
        endpoint: 'test/method',
        status: 'success',
      });

      const metrics = storage.query({
        name: 'api.request.duration',
        limit: 1
      });

      expect(metrics[0].value).toBeGreaterThanOrEqual(0);
      expect(metrics[0].value).toBe(duration);
    });
  });

  describe('api.request.duration Timer (Error - Line 350-353)', () => {
    it('should track request duration with error status', () => {
      const duration = 85; // ms

      // Simulate MCP server line 350-353
      recordTiming('api.request.duration', duration, {
        endpoint: 'nonexistent/method',
        status: 'error',
      });

      const metrics = storage.query({
        name: 'api.request.duration',
        limit: 1
      });

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].type).toBe('timer');
      expect(metrics[0].value).toBe(duration);

      const tags = JSON.parse(metrics[0].tags);
      expect(tags.status).toBe('error');
      expect(tags.endpoint).toBe('nonexistent/method');
    });

    it('should track duration even when request fails', () => {
      const beforeCount = storage.query({
        name: 'api.request.duration',
        tags: { status: 'error' }
      }).length;

      recordTiming('api.request.duration', 120, {
        endpoint: 'failing/method',
        status: 'error',
      });

      const afterCount = storage.query({
        name: 'api.request.duration',
        tags: { status: 'error' }
      }).length;

      expect(afterCount).toBe(beforeCount + 1);
    });

    it('should record error duration for invalid methods', () => {
      const invalidMethods = ['invalid/method1', 'invalid/method2', 'invalid/method3'];

      invalidMethods.forEach((method, index) => {
        recordTiming('api.request.duration', 50 + index * 10, {
          endpoint: method,
          status: 'error',
        });
      });

      const metrics = storage.query({
        name: 'api.request.duration',
        tags: { status: 'error' }
      });

      expect(metrics.length).toBeGreaterThanOrEqual(invalidMethods.length);
    });

    it('should differentiate success and error durations', () => {
      // Record success
      recordTiming('api.request.duration', 100, {
        endpoint: 'test/method',
        status: 'success',
      });

      // Record error
      recordTiming('api.request.duration', 50, {
        endpoint: 'test/method',
        status: 'error',
      });

      const successMetrics = storage.query({
        name: 'api.request.duration',
        tags: { status: 'success' }
      });

      const errorMetrics = storage.query({
        name: 'api.request.duration',
        tags: { status: 'error' }
      });

      expect(successMetrics.length).toBeGreaterThan(0);
      expect(errorMetrics.length).toBeGreaterThan(0);
      expect(successMetrics[0].value).toBe(100);
      expect(errorMetrics[0].value).toBe(50);
    });
  });

  describe('api.error.count Counter (Line 355-358)', () => {
    it('should track error count with incrementMetric', () => {
      const beforeCount = storage.getCounterTotal('api.error.count');

      // Simulate MCP server line 355-358
      incrementMetric('api.error.count', 1, {
        errorType: 'MCPMethodNotFoundError',
        endpoint: 'nonexistent/method',
      });

      const afterCount = storage.getCounterTotal('api.error.count');
      expect(afterCount).toBe(beforeCount + 1);
    });

    it('should track error with errorType tag', () => {
      incrementMetric('api.error.count', 1, {
        errorType: 'ValidationError',
        endpoint: 'invalid/endpoint',
      });

      const metrics = storage.query({
        name: 'api.error.count',
        limit: 1
      });

      expect(metrics.length).toBeGreaterThan(0);
      const tags = JSON.parse(metrics[0].tags);
      expect(tags.errorType).toBe('ValidationError');
      expect(tags.endpoint).toBe('invalid/endpoint');
    });

    it('should increment error counter for each failure', () => {
      const beforeCount = storage.getCounterTotal('api.error.count');

      // Simulate 3 errors
      incrementMetric('api.error.count', 1, { errorType: 'Error1', endpoint: 'method1' });
      incrementMetric('api.error.count', 1, { errorType: 'Error2', endpoint: 'method2' });
      incrementMetric('api.error.count', 1, { errorType: 'Error3', endpoint: 'method3' });

      const afterCount = storage.getCounterTotal('api.error.count');
      expect(afterCount).toBe(beforeCount + 3);
    });

    it('should track different error types', () => {
      const errorTypes = [
        'MCPMethodNotFoundError',
        'MCPErrorClass',
        'ValidationError',
        'TypeError',
        'ReferenceError'
      ];

      errorTypes.forEach(errorType => {
        incrementMetric('api.error.count', 1, {
          errorType,
          endpoint: 'test/method',
        });
      });

      const breakdown = storage.getBreakdown('api.error.count', 'errorType');

      errorTypes.forEach(errorType => {
        expect(breakdown[errorType]).toBeGreaterThanOrEqual(1);
      });
    });

    it('should handle Unknown error type', () => {
      incrementMetric('api.error.count', 1, {
        errorType: 'Unknown',
        endpoint: 'test/method',
      });

      const metrics = storage.query({
        name: 'api.error.count',
        tags: { errorType: 'Unknown' }
      });

      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Metrics Flow Simulation', () => {
    it('should track complete request lifecycle metrics', () => {
      const initialReceived = storage.getCounterTotal('api.request.received');
      const initialDuration = storage.query({ name: 'api.request.duration' }).length;

      // Simulate incoming request (Line 275-278)
      incrementMetric('api.request.received', 1, {
        endpoint: 'tools/invoke',
        clientId: 'test-client',
      });

      // Simulate successful response (Line 338-341)
      recordTiming('api.request.duration', 125, {
        endpoint: 'tools/invoke',
        status: 'success',
      });

      const finalReceived = storage.getCounterTotal('api.request.received');
      const finalDuration = storage.query({ name: 'api.request.duration' }).length;

      expect(finalReceived).toBe(initialReceived + 1);
      expect(finalDuration).toBe(initialDuration + 1);
    });

    it('should track both success and error metrics in same flow', () => {
      // Success request
      incrementMetric('api.request.received', 1, { endpoint: 'success/method', clientId: 'c1' });
      recordTiming('api.request.duration', 100, { endpoint: 'success/method', status: 'success' });

      // Error request
      incrementMetric('api.request.received', 1, { endpoint: 'error/method', clientId: 'c1' });
      recordTiming('api.request.duration', 80, { endpoint: 'error/method', status: 'error' });
      incrementMetric('api.error.count', 1, { errorType: 'TestError', endpoint: 'error/method' });

      // Verify all metrics
      expect(storage.getCounterTotal('api.request.received')).toBeGreaterThanOrEqual(2);

      const successDuration = storage.query({
        name: 'api.request.duration',
        tags: { status: 'success' }
      });

      const errorDuration = storage.query({
        name: 'api.request.duration',
        tags: { status: 'error' }
      });

      const errorCount = storage.getCounterTotal('api.error.count');

      expect(successDuration.length).toBeGreaterThan(0);
      expect(errorDuration.length).toBeGreaterThan(0);
      expect(errorCount).toBeGreaterThan(0);
    });

    it('should maintain timing accuracy in metrics flow', () => {
      const startTime = Date.now();

      incrementMetric('api.request.received', 1, { endpoint: 'test', clientId: 'c1' });

      // Simulate work
      let sum = 0;
      for (let i = 0; i < 100000; i++) {
        sum += i;
      }

      const actualDuration = Date.now() - startTime;
      recordTiming('api.request.duration', actualDuration, { endpoint: 'test', status: 'success' });

      const metrics = storage.query({
        name: 'api.request.duration',
        limit: 1
      });

      expect(metrics[0].value).toBe(actualDuration);
    });
  });

  describe('Metrics Accuracy and Consistency', () => {
    it('should not double-count requests', () => {
      const beforeCount = storage.getCounterTotal('api.request.received');

      incrementMetric('api.request.received', 1, { endpoint: 'test', clientId: 'c1' });

      const afterCount = storage.getCounterTotal('api.request.received');
      expect(afterCount - beforeCount).toBe(1);
    });

    it('should maintain separate counters for different endpoints', () => {
      incrementMetric('api.request.received', 1, { endpoint: 'endpoint1', clientId: 'c1' });
      incrementMetric('api.request.received', 1, { endpoint: 'endpoint2', clientId: 'c1' });
      incrementMetric('api.request.received', 1, { endpoint: 'endpoint1', clientId: 'c1' });

      const endpoint1Count = storage.query({
        name: 'api.request.received',
        tags: { endpoint: 'endpoint1' }
      }).length;

      const endpoint2Count = storage.query({
        name: 'api.request.received',
        tags: { endpoint: 'endpoint2' }
      }).length;

      expect(endpoint1Count).toBe(2);
      expect(endpoint2Count).toBe(1);
    });

    it('should handle concurrent metric writes', async () => {
      const promises = [];

      for (let i = 0; i < 50; i++) {
        promises.push(
          new Promise<void>(resolve => {
            incrementMetric('api.request.received', 1, {
              endpoint: 'concurrent/test',
              clientId: `client-${i}`,
            });
            resolve();
          })
        );
      }

      await Promise.all(promises);

      const total = storage.getCounterTotal('api.request.received');
      expect(total).toBeGreaterThanOrEqual(50);
    });

    it('should preserve metric tags accurately', () => {
      const testTags = {
        endpoint: 'test/method',
        clientId: 'client-123',
        status: 'success',
        customTag: 'value'
      };

      recordTiming('api.request.duration', 100, testTags);

      const metrics = storage.query({
        name: 'api.request.duration',
        limit: 1
      });

      const storedTags = JSON.parse(metrics[0].tags);
      expect(storedTags).toEqual(testTags);
    });
  });

  describe('Performance and Scale', () => {
    it('should handle high-volume metric writes efficiently', () => {
      const startTime = Date.now();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        incrementMetric('api.request.received', 1, {
          endpoint: 'perf/test',
          clientId: `client-${i % 10}`,
        });
      }

      const duration = Date.now() - startTime;

      // Should complete 1000 writes in under 5 seconds
      expect(duration).toBeLessThan(5000);

      const total = storage.getCounterTotal('api.request.received');
      expect(total).toBeGreaterThanOrEqual(count);
    }, 10000); // 10 second timeout

    it('should support metric aggregation by endpoint', () => {
      const endpoints = ['tools/list', 'tools/invoke', 'system/health'];

      endpoints.forEach((endpoint, index) => {
        for (let i = 0; i < (index + 1) * 10; i++) {
          incrementMetric('api.request.received', 1, { endpoint, clientId: 'c1' });
        }
      });

      const breakdown = storage.getBreakdown('api.request.received', 'endpoint');

      expect(breakdown['tools/list']).toBe(10);
      expect(breakdown['tools/invoke']).toBe(20);
      expect(breakdown['system/health']).toBe(30);
    });

    it('should maintain performance with time-series queries', () => {
      const startTime = new Date();

      // Insert 100 metrics
      for (let i = 0; i < 100; i++) {
        incrementMetric('api.request.received', 1, { endpoint: 'test', clientId: 'c1' });
      }

      const endTime = new Date();

      const queryStart = Date.now();
      const metrics = storage.query({
        name: 'api.request.received',
        startTime,
        endTime
      });
      const queryDuration = Date.now() - queryStart;

      expect(metrics.length).toBeGreaterThanOrEqual(100);
      expect(queryDuration).toBeLessThan(100); // Query should be fast
    });
  });
});
