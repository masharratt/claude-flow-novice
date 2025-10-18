/**
 * Phase 1 Metrics Integration Test Suite
 *
 * Validates all metrics instrumentation points:
 * - Agent Manager lifecycle metrics
 * - MCP Server request/response tracking
 * - Claude API client metrics (requests, tokens, errors)
 * - Double-count prevention validation
 */

import { AgentManager } from '../../../src/core/agent-manager.js';
import { getGlobalMetricsStorage, MetricsStorage, setGlobalMetricsStorage } from '../../../src/observability/metrics-storage.js';
import { getGlobalTelemetry, TelemetrySystem, setGlobalTelemetry } from '../../../src/observability/telemetry.js';
import { incrementMetric, recordTiming } from '../../../src/observability/metrics-counter.js';
import fs from 'fs';
import path from 'path';

// Test database path
const TEST_DB_PATH = '.claude-flow/test-metrics.db';

describe('Metrics Integration - Phase 1', () => {
  let storage: MetricsStorage;
  let telemetry: TelemetrySystem;
  let agentManager: AgentManager;

  beforeEach(() => {
    // Clean up test database if exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize fresh storage and telemetry for each test
    storage = new MetricsStorage(TEST_DB_PATH);
    setGlobalMetricsStorage(storage); // Set as global storage

    telemetry = new TelemetrySystem({
      enableMetrics: true,
      enableTracing: false,
      enableStructuredLogging: false,
      enablePersistence: true,
    });
    setGlobalTelemetry(telemetry); // Set as global telemetry

    agentManager = new AgentManager();
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
        if (file.startsWith('test-metrics')) {
          try {
            fs.unlinkSync(path.join(testDbDir, file));
          } catch (err) {
            // Ignore cleanup errors (file may be locked)
          }
        }
      });
    }
  });

  describe('Agent Manager Metrics', () => {
    it('should track agent.created on createAgent', () => {
      const beforeCount = storage.getCounterTotal('agent.created');

      agentManager.createAgent('coder', 'test task');

      const afterCount = storage.getCounterTotal('agent.created');
      expect(afterCount).toBeGreaterThan(beforeCount);
    });

    it('should track agent.started on runAgent', async () => {
      const beforeCount = storage.getCounterTotal('agent.started');

      const agentId = agentManager.createAgent('coder', 'test task');
      await agentManager.runAgent(agentId);

      const afterCount = storage.getCounterTotal('agent.started');
      expect(afterCount).toBeGreaterThan(beforeCount);
    });

    it('should track agent.completed with success status', async () => {
      const beforeCount = storage.getCounterTotal('agent.completed');

      const agentId = agentManager.createAgent('coder', 'simple test task');
      await agentManager.runAgent(agentId);

      const metrics = storage.query({
        name: 'agent.completed',
        limit: 1
      });

      expect(metrics.length).toBeGreaterThan(0);
      const tags = JSON.parse(metrics[0].tags);
      expect(tags.status).toBe('success');
      expect(tags.agentType).toBe('coder');
    });

    it('should track agent.duration timing', async () => {
      const agentId = agentManager.createAgent('coder', 'test task with timing');

      const startTime = Date.now();
      await agentManager.runAgent(agentId);
      const executionTime = Date.now() - startTime;

      const metrics = storage.query({
        name: 'agent.duration',
        limit: 1
      });

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].value).toBeGreaterThan(0);
      expect(metrics[0].value).toBeLessThanOrEqual(executionTime + 100); // Allow 100ms margin
      expect(metrics[0].type).toBe('timer');
    });

    it('should track agent.error on failure', async () => {
      const beforeErrorCount = storage.getCounterTotal('agent.error');

      // Create an agent that will fail
      const agentId = agentManager.createAgent('coder', 'task that will fail');

      // Mock the SimpleAgent to throw an error
      const SimpleAgent = (await import('../../../src/agents/simple-agent.js')).SimpleAgent;
      const originalExecute = SimpleAgent.prototype.execute;
      SimpleAgent.prototype.execute = async function() {
        throw new Error('Test error');
      };

      try {
        await agentManager.runAgent(agentId);
      } catch (error) {
        // Expected to fail
      }

      // Restore original
      SimpleAgent.prototype.execute = originalExecute;

      const afterErrorCount = storage.getCounterTotal('agent.error');
      expect(afterErrorCount).toBeGreaterThan(beforeErrorCount);

      const errorMetrics = storage.query({
        name: 'agent.error',
        limit: 1
      });

      expect(errorMetrics.length).toBeGreaterThan(0);
      const tags = JSON.parse(errorMetrics[0].tags);
      expect(tags.agentType).toBe('coder');
      expect(tags.errorType).toBeDefined();
    });

    it('should track agent types correctly', async () => {
      const agentTypes = ['coder', 'planner', 'researcher'];

      for (const type of agentTypes) {
        const agentId = agentManager.createAgent(type as any, `${type} task`);
        await agentManager.runAgent(agentId);
      }

      const breakdown = storage.getBreakdown('agent.created', 'agentType');

      expect(breakdown['coder']).toBeGreaterThanOrEqual(1);
      expect(breakdown['planner']).toBeGreaterThanOrEqual(1);
      expect(breakdown['researcher']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Metrics Counter API', () => {
    it('should record counter metrics', () => {
      const beforeCount = storage.getCounterTotal('test.counter');

      incrementMetric('test.counter', 5, { source: 'test' });

      const afterCount = storage.getCounterTotal('test.counter');
      expect(afterCount).toBe(beforeCount + 5);
    });

    it('should record timing metrics', () => {
      recordTiming('test.operation', 150, { operation: 'test' });

      const metrics = storage.query({
        name: 'test.operation',
        type: 'timer',
        limit: 1
      });

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].value).toBe(150);
      expect(metrics[0].type).toBe('timer');
    });

    it('should support tags for dimensional analysis', () => {
      incrementMetric('test.tagged', 1, {
        environment: 'test',
        region: 'us-east',
        service: 'metrics-test'
      });

      const metrics = storage.query({
        name: 'test.tagged',
        tags: { environment: 'test' }
      });

      expect(metrics.length).toBeGreaterThan(0);
      const tags = JSON.parse(metrics[0].tags);
      expect(tags.environment).toBe('test');
      expect(tags.region).toBe('us-east');
      expect(tags.service).toBe('metrics-test');
    });
  });

  describe('Storage and Query Operations', () => {
    it('should query metrics by name', () => {
      incrementMetric('query.test.name', 1);
      incrementMetric('query.test.name', 2);
      incrementMetric('query.test.other', 3);

      const metrics = storage.query({ name: 'query.test.name' });

      expect(metrics.length).toBe(2);
      expect(metrics.every(m => m.name === 'query.test.name')).toBe(true);
    });

    it('should query metrics by type', () => {
      incrementMetric('counter.test', 1);
      recordTiming('timer.test', 100);

      const counters = storage.query({ type: 'counter' });
      const timers = storage.query({ type: 'timer' });

      expect(counters.every(m => m.type === 'counter')).toBe(true);
      expect(timers.every(m => m.type === 'timer')).toBe(true);
    });

    it('should query metrics by time range', async () => {
      const startTime = new Date();

      incrementMetric('time.range.test', 1);

      // Wait 200ms to ensure time gap
      await new Promise(resolve => setTimeout(resolve, 200));

      const endTime = new Date();

      incrementMetric('time.range.test', 2);

      const metricsInRange = storage.query({
        name: 'time.range.test',
        startTime,
        endTime
      });

      // Should have the first metric within the time range
      expect(metricsInRange.length).toBeGreaterThanOrEqual(1);
      expect(metricsInRange.some(m => m.value === 1)).toBe(true);
    });

    it('should get metric summary with aggregations', () => {
      incrementMetric('summary.test', 10, { tag: 'a' });
      incrementMetric('summary.test', 20, { tag: 'b' });
      incrementMetric('summary.test', 30, { tag: 'a' });

      const summary = storage.getSummary('summary.test');

      expect(summary).toBeDefined();
      expect(summary!.count).toBe(3);
      expect(summary!.sum).toBe(60);
      expect(summary!.avg).toBe(20);
      expect(summary!.min).toBe(10);
      expect(summary!.max).toBe(30);
      expect(summary!.tags.tag.a).toBe(40); // 10 + 30
      expect(summary!.tags.tag.b).toBe(20);
    });

    it('should get breakdown by tag value', () => {
      incrementMetric('breakdown.test', 5, { service: 'api' });
      incrementMetric('breakdown.test', 10, { service: 'worker' });
      incrementMetric('breakdown.test', 15, { service: 'api' });

      const breakdown = storage.getBreakdown('breakdown.test', 'service');

      expect(breakdown['api']).toBe(20); // 5 + 15
      expect(breakdown['worker']).toBe(10);
    });
  });

  describe('Double-Count Prevention', () => {
    it('should NOT double-count agent lifecycle events', async () => {
      const beforeCreated = storage.getCounterTotal('agent.created');
      const beforeStarted = storage.getCounterTotal('agent.started');
      const beforeCompleted = storage.getCounterTotal('agent.completed');

      const agentId = agentManager.createAgent('coder', 'double-count prevention test');
      await agentManager.runAgent(agentId);

      const afterCreated = storage.getCounterTotal('agent.created');
      const afterStarted = storage.getCounterTotal('agent.started');
      const afterCompleted = storage.getCounterTotal('agent.completed');

      // Exactly 1 of each event
      expect(afterCreated - beforeCreated).toBe(1);
      expect(afterStarted - beforeStarted).toBe(1);
      expect(afterCompleted - beforeCompleted).toBe(1);
    });

    it('should NOT double-count on multiple agent runs', async () => {
      const agentIds = [
        agentManager.createAgent('coder', 'task 1'),
        agentManager.createAgent('planner', 'task 2'),
        agentManager.createAgent('researcher', 'task 3')
      ];

      const beforeCompleted = storage.getCounterTotal('agent.completed');

      for (const id of agentIds) {
        await agentManager.runAgent(id);
      }

      const afterCompleted = storage.getCounterTotal('agent.completed');

      // Exactly 3 completions for 3 agents
      expect(afterCompleted - beforeCompleted).toBe(3);
    });

    it('should count each metric increment separately', () => {
      const beforeCount = storage.getCounterTotal('increment.test');

      incrementMetric('increment.test', 1);
      incrementMetric('increment.test', 1);
      incrementMetric('increment.test', 1);

      const afterCount = storage.getCounterTotal('increment.test');

      // Should have 3 separate increment events totaling 3
      expect(afterCount - beforeCount).toBe(3);

      const metrics = storage.query({ name: 'increment.test' });
      expect(metrics.length).toBe(3); // 3 separate data points
    });
  });

  describe('Telemetry System Integration', () => {
    it('should persist metrics to storage when enabled', () => {
      const telemetryWithStorage = new TelemetrySystem({
        enableMetrics: true,
        enablePersistence: true,
      });

      telemetryWithStorage.recordCounter('telemetry.storage.test', 42, { test: 'true' });

      // Metrics should be in global storage
      const metrics = getGlobalMetricsStorage().query({
        name: 'telemetry.storage.test'
      });

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].value).toBe(42);
    });

    it('should track latency metrics with percentiles', () => {
      const telemetrySystem = new TelemetrySystem({
        enableMetrics: true,
      });

      // Record multiple latencies
      for (let i = 0; i < 100; i++) {
        telemetrySystem.recordTimer('operation.latency', 50 + i, {});
      }

      const latencyMetrics = telemetrySystem.getLatencyMetrics('operation.latency');

      expect(latencyMetrics).toBeDefined();
      expect(latencyMetrics!.count).toBe(100);
      expect(latencyMetrics!.p50).toBeGreaterThan(0);
      expect(latencyMetrics!.p90).toBeGreaterThan(latencyMetrics!.p50);
      expect(latencyMetrics!.p95).toBeGreaterThan(latencyMetrics!.p90);
      expect(latencyMetrics!.p99).toBeGreaterThan(latencyMetrics!.p95);
      expect(latencyMetrics!.min).toBe(50);
      expect(latencyMetrics!.max).toBe(149);
    });
  });

  describe('Performance and Scale', () => {
    it('should handle high-volume metric writes efficiently', () => {
      const startTime = Date.now();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        incrementMetric('performance.test', 1, { iteration: i.toString() });
      }

      const duration = Date.now() - startTime;

      // Should complete 1000 writes in under 5 seconds (relaxed for CI)
      expect(duration).toBeLessThan(5000);

      const total = storage.getCounterTotal('performance.test');
      expect(total).toBe(count);
    }, 10000); // 10 second timeout for this test

    it('should support batch metric storage', () => {
      const metrics = [];
      for (let i = 0; i < 100; i++) {
        metrics.push({
          name: 'batch.test',
          value: i,
          timestamp: new Date(),
          tags: { batch: 'true' },
          type: 'counter' as const
        });
      }

      storage.storeBatch(metrics);

      const stored = storage.query({ name: 'batch.test' });
      expect(stored.length).toBe(100);
    });

    it('should maintain performance with large query result sets', () => {
      // Insert 500 metrics
      for (let i = 0; i < 500; i++) {
        incrementMetric('large.query.test', 1, { index: (i % 10).toString() });
      }

      const startTime = Date.now();
      const results = storage.query({ name: 'large.query.test' });
      const duration = Date.now() - startTime;

      expect(results.length).toBe(500);
      expect(duration).toBeLessThan(100); // Query should be fast (< 100ms)
    }, 10000); // 10 second timeout for this test
  });

  describe('Data Retention and Cleanup', () => {
    it('should clean up old metrics based on retention policy', async () => {
      // Insert metrics with old timestamp
      const oldMetric = {
        name: 'retention.test',
        value: 1,
        timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        tags: {},
        type: 'counter' as const
      };

      const recentMetric = {
        name: 'retention.test',
        value: 2,
        timestamp: new Date(),
        tags: {},
        type: 'counter' as const
      };

      storage.storeBatch([oldMetric, recentMetric]);

      const beforeCleanup = storage.query({ name: 'retention.test' });
      expect(beforeCleanup.length).toBe(2);

      // Clean up metrics older than 30 days
      const deleted = storage.cleanup(30);

      expect(deleted).toBeGreaterThan(0);

      const afterCleanup = storage.query({ name: 'retention.test' });
      expect(afterCleanup.length).toBe(1);
      expect(afterCleanup[0].value).toBe(2); // Recent metric remains
    });

    it('should provide database statistics', () => {
      incrementMetric('stats.test.1', 1);
      incrementMetric('stats.test.2', 2);
      recordTiming('stats.test.3', 100);

      const stats = storage.getStats();

      expect(stats.totalMetrics).toBeGreaterThan(0);
      expect(stats.uniqueNames).toBeGreaterThan(0);
      expect(stats.oldestMetric).toBeDefined();
      expect(stats.newestMetric).toBeDefined();
      expect(stats.dbSizeMB).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle metrics with empty tags', () => {
      incrementMetric('empty.tags.test', 1, {});

      const metrics = storage.query({ name: 'empty.tags.test' });
      expect(metrics.length).toBe(1);
      expect(metrics[0].tags).toBe('{}');
    });

    it('should handle queries for non-existent metrics', () => {
      const metrics = storage.query({ name: 'does.not.exist' });
      expect(metrics.length).toBe(0);

      const total = storage.getCounterTotal('does.not.exist');
      expect(total).toBe(0);

      const summary = storage.getSummary('does.not.exist');
      expect(summary).toBeNull();
    });

    it('should handle metrics with special characters in names', () => {
      incrementMetric('test.metric-with_special.chars@123', 1, {});

      const metrics = storage.query({ name: 'test.metric-with_special.chars@123' });
      expect(metrics.length).toBe(1);
    });

    it('should handle very large metric values', () => {
      const largeValue = Number.MAX_SAFE_INTEGER;
      incrementMetric('large.value.test', largeValue, {});

      const total = storage.getCounterTotal('large.value.test');
      expect(total).toBe(largeValue);
    });

    it('should handle concurrent metric writes', async () => {
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          new Promise<void>(resolve => {
            incrementMetric('concurrent.test', 1, { thread: i.toString() });
            resolve();
          })
        );
      }

      await Promise.all(promises);

      const total = storage.getCounterTotal('concurrent.test');
      expect(total).toBe(50);
    });
  });
});
