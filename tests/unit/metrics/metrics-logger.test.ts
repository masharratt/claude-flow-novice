/**
 * Metrics Logger Service Tests
 *
 * Comprehensive test suite for unified metrics logging.
 * Part of Task 2.3: Unified Metrics and Execution Logging
 *
 * Coverage:
 * - Single metric logging
 * - Batch logging
 * - Idempotency (duplicate prevention)
 * - Atomic dual writes
 * - Query interface
 * - Cost accuracy
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { DatabaseService } from '../src/lib/database-service';
import { MetricsLogger, ExecutionMetrics, MetricsFilter } from '../src/services/metrics-logger';
import {
  createIdempotentKey,
  hasBeenWritten,
  validateCostAccuracy,
  roundCost,
} from '../src/lib/idempotent-write';
import * as fs from 'fs';
import * as path from 'path';
import { TestCleanupManager, withTimeout } from './utils/cleanup';

/**
 * Test configuration
 */
const TEST_DB_DIR = path.join(__dirname, '../.test-data');
const TEST_SQLITE_PATH = path.join(TEST_DB_DIR, 'test-metrics.db');

/**
 * Setup test database
 */
async function setupTestDatabase(): Promise<DatabaseService> {
  // Create test directory
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }

  // Remove existing test database
  if (fs.existsSync(TEST_SQLITE_PATH)) {
    fs.unlinkSync(TEST_SQLITE_PATH);
  }

  // Create database service
  const dbService = new DatabaseService({
    sqlite: {
      type: 'sqlite',
      database: TEST_SQLITE_PATH,
    },
    postgres: {
      type: 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'cfn_test',
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
    },
  });

  await dbService.connect();

  // Run migrations
  const migrationSQL = fs.readFileSync(
    path.join(__dirname, '../src/db/migrations/up/003-unify-metrics-schema.sql'),
    'utf-8'
  );

  const sqliteAdapter = dbService.getAdapter('sqlite');
  const postgresAdapter = dbService.getAdapter('postgres');

  // Execute migration on both databases
  await sqliteAdapter.execute(migrationSQL);
  await postgresAdapter.execute(migrationSQL);

  return dbService;
}

/**
 * Cleanup test database
 */
async function cleanupTestDatabase(dbService: DatabaseService): Promise<void> {
  if (dbService) {
    try {
      // Force close all connections with proper timeout handle cleanup
      await withTimeout(dbService.disconnect(), 2000);
    } catch (e) {
      // Ignore disconnect errors and timeout errors
    }
  }

  // Wait for file handles to be released
  await new Promise(resolve => setTimeout(resolve, 100));

  if (fs.existsSync(TEST_SQLITE_PATH)) {
    try {
      fs.unlinkSync(TEST_SQLITE_PATH);
    } catch (e) {
      // Ignore file deletion errors
    }
  }
}

/**
 * Create sample metrics
 */
function createSampleMetrics(overrides?: Partial<ExecutionMetrics>): ExecutionMetrics {
  return {
    timestamp: new Date(),
    agent_id: 'test-agent-001',
    skill_id: 'test-skill',
    task_id: 'task-123',
    duration_ms: 1500,
    tokens_used: 1000,
    cost_usd: 0.015,
    status: 'success',
    ...overrides,
  };
}

jest.setTimeout(30000);

describe('MetricsLogger', () => {
  let dbService: DatabaseService;
  let metricsLogger: MetricsLogger;
  const cleanup = new TestCleanupManager();

  beforeEach(async () => {
    dbService = await setupTestDatabase();
    cleanup.trackDatabaseService(dbService);
    metricsLogger = new MetricsLogger({ dbService });
  });

  afterEach(async () => {
    // Close metrics logger first
    if (metricsLogger) {
      try {
        await metricsLogger.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    // Clean up all connections (withTimeout handles timer cleanup internally)
    await cleanup.cleanupAll({
      timeout: 3000,
      suppressErrors: true,
      forceClose: true
    });

    // Clean up test database files
    await cleanupTestDatabase(dbService);
  });

  afterAll(async () => {
    // Final cleanup to ensure no hanging connections
    await cleanup.cleanupAll({
      timeout: 1000,
      suppressErrors: true,
      forceClose: true
    });
  });

  describe('Single Metric Logging', () => {
    it('should log single metric successfully', async () => {
      const metrics = createSampleMetrics();

      await metricsLogger.logExecution(metrics);

      // Verify in SQLite
      const sqliteResults = await metricsLogger.queryMetrics({
        task_id: metrics.task_id,
      });

      expect(sqliteResults).toHaveLength(1);
      expect(sqliteResults[0].agent_id).toBe(metrics.agent_id);
      expect(sqliteResults[0].task_id).toBe(metrics.task_id);
      expect(sqliteResults[0].duration_ms).toBe(metrics.duration_ms);
      expect(sqliteResults[0].tokens_used).toBe(metrics.tokens_used);
      expect(sqliteResults[0].cost_usd).toBe(metrics.cost_usd);
      expect(sqliteResults[0].status).toBe(metrics.status);
    });

    it('should generate ID if not provided', async () => {
      const metrics = createSampleMetrics({ id: undefined });

      await metricsLogger.logExecution(metrics);

      const results = await metricsLogger.queryMetrics({
        task_id: metrics.task_id,
      });

      expect(results[0].id).toBeDefined();
      expect(results[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should round cost to $0.001 precision', async () => {
      const metrics = createSampleMetrics({
        cost_usd: 0.0123456, // More than 3 decimal places
      });

      await metricsLogger.logExecution(metrics);

      const results = await metricsLogger.queryMetrics({
        task_id: metrics.task_id,
      });

      expect(results[0].cost_usd).toBe(0.012); // Rounded to 3 decimals
    });

    it('should log metrics with error message', async () => {
      const metrics = createSampleMetrics({
        status: 'failure',
        error_message: 'Connection timeout',
      });

      await metricsLogger.logExecution(metrics);

      const results = await metricsLogger.queryMetrics({
        task_id: metrics.task_id,
      });

      expect(results[0].status).toBe('failure');
      expect(results[0].error_message).toBe('Connection timeout');
    });

    it('should log metrics with metadata', async () => {
      const metrics = createSampleMetrics({
        metadata: {
          provider: 'zai',
          model: 'glm-4.6',
          context_size: 8192,
        },
      });

      await metricsLogger.logExecution(metrics);

      const results = await metricsLogger.queryMetrics({
        task_id: metrics.task_id,
      });

      expect(results[0].metadata).toBeDefined();
      const metadata = JSON.parse(results[0].metadata as string);
      expect(metadata.provider).toBe('zai');
      expect(metadata.model).toBe('glm-4.6');
    });
  });

  describe('Idempotency', () => {
    it('should prevent duplicate writes', async () => {
      const metrics = createSampleMetrics();

      // Write same metrics twice
      await metricsLogger.logExecution(metrics);
      await metricsLogger.logExecution(metrics);

      const results = await metricsLogger.queryMetrics({
        task_id: metrics.task_id,
      });

      // Should only have one entry
      expect(results).toHaveLength(1);
    });

    it('should allow different metrics with same agent', async () => {
      const metrics1 = createSampleMetrics({
        task_id: 'task-001',
        duration_ms: 1000,
      });

      const metrics2 = createSampleMetrics({
        task_id: 'task-002',
        duration_ms: 2000,
      });

      await metricsLogger.logExecution(metrics1);
      await metricsLogger.logExecution(metrics2);

      const results = await metricsLogger.queryMetrics({
        agent_id: metrics1.agent_id,
      });

      expect(results).toHaveLength(2);
    });

    it('should create consistent idempotency keys', () => {
      const metrics = createSampleMetrics();

      const key1 = createIdempotentKey(metrics);
      const key2 = createIdempotentKey(metrics);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[0-9a-f]{64}$/); // SHA256 hash
    });

    it('should mark metrics as written', async () => {
      const metrics = createSampleMetrics();
      const key = createIdempotentKey(metrics);

      const sqliteAdapter = dbService.getAdapter('sqlite');

      // Should not be written initially
      let written = await hasBeenWritten(key, sqliteAdapter);
      expect(written).toBe(false);

      // Write metrics
      await metricsLogger.logExecution(metrics);

      // Should be marked as written
      written = await hasBeenWritten(key, sqliteAdapter);
      expect(written).toBe(true);
    });
  });

  describe('Batch Logging', () => {
    it('should log batch of metrics', async () => {
      const metricsList: ExecutionMetrics[] = [
        createSampleMetrics({ task_id: 'batch-001', duration_ms: 1000 }),
        createSampleMetrics({ task_id: 'batch-002', duration_ms: 2000 }),
        createSampleMetrics({ task_id: 'batch-003', duration_ms: 3000 }),
      ];

      await metricsLogger.logBatch(metricsList);

      const results = await metricsLogger.queryMetrics({
        agent_id: 'test-agent-001',
      });

      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it('should deduplicate batch entries', async () => {
      const metrics = createSampleMetrics();

      // Batch with duplicates
      const metricsList = [metrics, metrics, metrics];

      await metricsLogger.logBatch(metricsList);

      const results = await metricsLogger.queryMetrics({
        task_id: metrics.task_id,
      });

      // Should only have one entry
      expect(results).toHaveLength(1);
    });

    it('should handle empty batch', async () => {
      await expect(metricsLogger.logBatch([])).resolves.not.toThrow();
    });

    it('should queue and flush metrics', async () => {
      const metrics1 = createSampleMetrics({ task_id: 'queue-001' });
      const metrics2 = createSampleMetrics({ task_id: 'queue-002' });

      await metricsLogger.queueMetrics(metrics1);
      await metricsLogger.queueMetrics(metrics2);

      // Manually flush
      await metricsLogger.flush();

      const results = await metricsLogger.queryMetrics({
        agent_id: 'test-agent-001',
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Atomic Dual Writes', () => {
    it('should write to both SQLite and PostgreSQL', async () => {
      const metrics = createSampleMetrics({ task_id: 'dual-write-001' });

      await metricsLogger.logExecution(metrics);

      // Query SQLite
      const sqliteAdapter = dbService.getAdapter('sqlite');
      const sqliteResults = await sqliteAdapter.list('execution_metrics', {
        filters: [
          {
            field: 'task_id' as keyof ExecutionMetrics,
            operator: 'eq',
            value: metrics.task_id,
          },
        ],
      });

      // Query PostgreSQL
      const postgresAdapter = dbService.getAdapter('postgres');
      const postgresResults = await postgresAdapter.list('execution_metrics', {
        filters: [
          {
            field: 'task_id' as keyof ExecutionMetrics,
            operator: 'eq',
            value: metrics.task_id,
          },
        ],
      });

      expect(sqliteResults).toHaveLength(1);
      expect(postgresResults).toHaveLength(1);
      expect(sqliteResults[0].task_id).toBe(postgresResults[0].task_id);
    });

    it('should maintain consistency across databases', async () => {
      const metricsList: ExecutionMetrics[] = [
        createSampleMetrics({ task_id: 'consistency-001', cost_usd: 0.010 }),
        createSampleMetrics({ task_id: 'consistency-002', cost_usd: 0.020 }),
        createSampleMetrics({ task_id: 'consistency-003', cost_usd: 0.030 }),
      ];

      await metricsLogger.logBatch(metricsList);

      // Get total cost from SQLite
      const sqliteResults = await metricsLogger.queryMetrics({
        agent_id: 'test-agent-001',
        limit: 100,
      });

      const sqliteTotalCost = sqliteResults.reduce((sum, m) => sum + m.cost_usd, 0);

      // Get total cost from PostgreSQL
      const postgresAdapter = dbService.getAdapter('postgres');
      const postgresResults = await postgresAdapter.list('execution_metrics', {
        filters: [
          {
            field: 'agent_id' as keyof ExecutionMetrics,
            operator: 'eq',
            value: 'test-agent-001',
          },
        ],
        limit: 100,
      });

      const postgresTotalCost = postgresResults.reduce(
        (sum: number, m: any) => sum + parseFloat(m.cost_usd),
        0
      );

      expect(Math.abs(sqliteTotalCost - postgresTotalCost)).toBeLessThan(0.001);
    });
  });

  describe('Query Interface', () => {
    beforeEach(async () => {
      // Insert test data
      const testMetrics: ExecutionMetrics[] = [
        createSampleMetrics({
          task_id: 'query-001',
          agent_id: 'agent-alpha',
          skill_id: 'skill-001',
          status: 'success',
          cost_usd: 0.010,
          timestamp: new Date('2025-01-01T10:00:00Z'),
        }),
        createSampleMetrics({
          task_id: 'query-002',
          agent_id: 'agent-alpha',
          skill_id: 'skill-002',
          status: 'failure',
          cost_usd: 0.020,
          timestamp: new Date('2025-01-01T11:00:00Z'),
        }),
        createSampleMetrics({
          task_id: 'query-003',
          agent_id: 'agent-beta',
          skill_id: 'skill-001',
          status: 'success',
          cost_usd: 0.030,
          timestamp: new Date('2025-01-01T12:00:00Z'),
        }),
      ];

      await metricsLogger.logBatch(testMetrics);
    });

    it('should filter by agent_id', async () => {
      const results = await metricsLogger.queryMetrics({
        agent_id: 'agent-alpha',
      });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.agent_id === 'agent-alpha')).toBe(true);
    });

    it('should filter by skill_id', async () => {
      const results = await metricsLogger.queryMetrics({
        skill_id: 'skill-001',
      });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.skill_id === 'skill-001')).toBe(true);
    });

    it('should filter by status', async () => {
      const results = await metricsLogger.queryMetrics({
        status: 'success',
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every(r => r.status === 'success')).toBe(true);
    });

    it('should filter by date range', async () => {
      const results = await metricsLogger.queryMetrics({
        start_date: new Date('2025-01-01T00:00:00Z'),
        end_date: new Date('2025-01-01T11:30:00Z'),
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should apply limit and offset', async () => {
      const page1 = await metricsLogger.queryMetrics({
        agent_id: 'agent-alpha',
        limit: 1,
        offset: 0,
      });

      const page2 = await metricsLogger.queryMetrics({
        agent_id: 'agent-alpha',
        limit: 1,
        offset: 1,
      });

      expect(page1).toHaveLength(1);
      expect(page2).toHaveLength(1);
      expect(page1[0].task_id).not.toBe(page2[0].task_id);
    });

    it('should order by timestamp descending', async () => {
      const results = await metricsLogger.queryMetrics({
        limit: 10,
      });

      for (let i = 1; i < results.length; i++) {
        const prev = new Date(results[i - 1].timestamp);
        const curr = new Date(results[i].timestamp);
        expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
      }
    });
  });

  describe('Aggregation', () => {
    beforeEach(async () => {
      // Insert test data
      const testMetrics: ExecutionMetrics[] = [
        createSampleMetrics({
          task_id: 'agg-001',
          agent_id: 'agent-alpha',
          status: 'success',
          cost_usd: 0.010,
          tokens_used: 1000,
          duration_ms: 1000,
        }),
        createSampleMetrics({
          task_id: 'agg-002',
          agent_id: 'agent-alpha',
          status: 'success',
          cost_usd: 0.020,
          tokens_used: 2000,
          duration_ms: 2000,
        }),
        createSampleMetrics({
          task_id: 'agg-003',
          agent_id: 'agent-alpha',
          status: 'failure',
          cost_usd: 0.015,
          tokens_used: 1500,
          duration_ms: 1500,
        }),
        createSampleMetrics({
          task_id: 'agg-004',
          agent_id: 'agent-beta',
          status: 'success',
          cost_usd: 0.030,
          tokens_used: 3000,
          duration_ms: 3000,
        }),
      ];

      await metricsLogger.logBatch(testMetrics);
    });

    it('should aggregate metrics by agent', async () => {
      const aggregated = await metricsLogger.getAggregatedMetrics();

      const alphaAgg = aggregated.find(a => a.agent_id === 'agent-alpha');
      const betaAgg = aggregated.find(a => a.agent_id === 'agent-beta');

      expect(alphaAgg).toBeDefined();
      expect(alphaAgg!.total_executions).toBe(3);
      expect(alphaAgg!.total_cost_usd).toBe(0.045);
      expect(alphaAgg!.total_tokens).toBe(4500);
      expect(alphaAgg!.success_count).toBe(2);
      expect(alphaAgg!.failure_count).toBe(1);
      expect(alphaAgg!.success_rate).toBeCloseTo(66.67, 1);

      expect(betaAgg).toBeDefined();
      expect(betaAgg!.total_executions).toBe(1);
    });

    it('should calculate average duration', async () => {
      const aggregated = await metricsLogger.getAggregatedMetrics();

      const alphaAgg = aggregated.find(a => a.agent_id === 'agent-alpha');

      expect(alphaAgg).toBeDefined();
      // Average of 1000, 2000, 1500 = 1500
      expect(alphaAgg!.avg_duration_ms).toBe(1500);
    });

    it('should sort by total cost descending', async () => {
      const aggregated = await metricsLogger.getAggregatedMetrics();

      for (let i = 1; i < aggregated.length; i++) {
        expect(aggregated[i - 1].total_cost_usd).toBeGreaterThanOrEqual(
          aggregated[i].total_cost_usd
        );
      }
    });
  });

  describe('Cost Accuracy', () => {
    it('should validate cost accuracy', () => {
      expect(validateCostAccuracy(0.123)).toBe(true);
      expect(validateCostAccuracy(0.1234)).toBe(true); // Within tolerance
      expect(validateCostAccuracy(0.123456)).toBe(false);
    });

    it('should round cost correctly', () => {
      expect(roundCost(0.1234)).toBe(0.123);
      expect(roundCost(0.1235)).toBe(0.124);
      expect(roundCost(0.1)).toBe(0.100);
      expect(roundCost(1.2345)).toBe(1.235);
    });

    it('should maintain cost precision in database', async () => {
      const metrics = createSampleMetrics({
        cost_usd: 0.123456789, // High precision
      });

      await metricsLogger.logExecution(metrics);

      const results = await metricsLogger.queryMetrics({
        task_id: metrics.task_id,
      });

      // Should be rounded to 3 decimals
      expect(results[0].cost_usd).toBe(0.123);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid metrics gracefully', async () => {
      const invalidMetrics = {
        // Missing required fields
        timestamp: new Date(),
      } as ExecutionMetrics;

      await expect(metricsLogger.logExecution(invalidMetrics)).rejects.toThrow();
    });

    it('should handle database connection errors', async () => {
      // Disconnect database
      if (dbService) { try { await dbService.disconnect(); } catch (e) { /* ignore */ } }

      const metrics = createSampleMetrics();

      await expect(metricsLogger.logExecution(metrics)).rejects.toThrow();

      // Reconnect for cleanup
      await dbService.connect();
    });
  });
});
