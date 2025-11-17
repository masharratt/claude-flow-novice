/**
 * Metrics Logger Service
 *
 * Unified metrics and execution logging with dual database writes (PostgreSQL + SQLite).
 * Part of Task 2.3: Unified Metrics and Execution Logging
 *
 * Features:
 * - Atomic dual writes to PostgreSQL and SQLite
 * - Idempotent writes (retries don't create duplicates)
 * - Batch logging support
 * - Cost tracking ($0.001 precision)
 * - Token counting
 * - Query interface for metrics analysis
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../lib/database-service.js';
import { IDatabaseAdapter, QueryOptions, OperationResult } from '../lib/database-service/types.js';
import {
  createIdempotentKey,
  hasBeenWritten,
  markWritten,
  batchCheckWritten,
  batchMarkWritten,
  validateCostAccuracy,
  roundCost,
} from '../lib/idempotent-write.js';
import { createLogger } from '../lib/logging.js';
import { StandardError, ErrorCode } from '../lib/errors.js';

const logger = createLogger('metrics-logger');

/**
 * Execution metrics interface
 */
export interface ExecutionMetrics {
  id?: string;
  timestamp: Date;
  agent_id: string;
  skill_id?: string;
  task_id: string;
  duration_ms: number;
  tokens_used: number;
  cost_usd: number;
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  error_message?: string;
  metadata?: Record<string, any>;
}

/**
 * Metrics filter for querying
 */
export interface MetricsFilter {
  agent_id?: string;
  skill_id?: string;
  task_id?: string;
  status?: 'success' | 'failure' | 'timeout' | 'cancelled';
  start_date?: Date;
  end_date?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Metrics aggregation result
 */
export interface MetricsAggregation {
  agent_id: string;
  total_executions: number;
  total_cost_usd: number;
  total_tokens: number;
  avg_duration_ms: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
}

/**
 * Metrics Logger Service Configuration
 */
export interface MetricsLoggerConfig {
  dbService: DatabaseService;
  batchSize?: number;
  flushIntervalMs?: number;
}

/**
 * Metrics Logger Service
 */
export class MetricsLogger {
  private dbService: DatabaseService;
  private sqliteAdapter: IDatabaseAdapter;
  private postgresAdapter: IDatabaseAdapter;
  private batchSize: number;
  private flushIntervalMs: number;
  private batchQueue: ExecutionMetrics[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: MetricsLoggerConfig) {
    this.dbService = config.dbService;
    this.batchSize = config.batchSize || 100;
    this.flushIntervalMs = config.flushIntervalMs || 5000; // 5 seconds

    // Get database adapters
    this.sqliteAdapter = this.dbService.getAdapter('sqlite');
    this.postgresAdapter = this.dbService.getAdapter('postgres');

    logger.info('MetricsLogger initialized', {
      batch_size: this.batchSize,
      flush_interval_ms: this.flushIntervalMs,
    });
  }

  /**
   * Log single execution metrics
   *
   * @param metrics - Execution metrics to log
   */
  async logExecution(metrics: ExecutionMetrics): Promise<void> {
    try {
      // Validate and normalize metrics
      const normalizedMetrics = this.normalizeMetrics(metrics);

      // Generate idempotency key
      const idempotencyKey = createIdempotentKey(normalizedMetrics);

      // Check if already written to both databases
      const [sqliteWritten, postgresWritten] = await Promise.all([
        hasBeenWritten(idempotencyKey, this.sqliteAdapter),
        hasBeenWritten(idempotencyKey, this.postgresAdapter),
      ]);

      if (sqliteWritten && postgresWritten) {
        logger.debug('Metrics already logged (idempotent)', {
          idempotency_key: idempotencyKey.substring(0, 16) + '...',
          metrics_id: normalizedMetrics.id,
        });
        return; // Already written, skip
      }

      // Atomic write to both databases
      await this.dbService.executeTransaction([
        {
          database: 'sqlite',
          operation: async (adapter) => {
            if (!sqliteWritten) {
              await adapter.insert('execution_metrics', normalizedMetrics);
              await markWritten(idempotencyKey, adapter, normalizedMetrics.id);
            }
          },
        },
        {
          database: 'postgres',
          operation: async (adapter) => {
            if (!postgresWritten) {
              await adapter.insert('execution_metrics', normalizedMetrics);
              await markWritten(idempotencyKey, adapter, normalizedMetrics.id);
            }
          },
        },
      ]);

      logger.info('Metrics logged successfully', {
        metrics_id: normalizedMetrics.id,
        agent_id: normalizedMetrics.agent_id,
        task_id: normalizedMetrics.task_id,
        duration_ms: normalizedMetrics.duration_ms,
        cost_usd: normalizedMetrics.cost_usd,
        status: normalizedMetrics.status,
      });
    } catch (error) {
      logger.error('Failed to log metrics', {
        agent_id: metrics.agent_id,
        task_id: metrics.task_id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new StandardError(
        ErrorCode.DATABASE_ERROR,
        'Failed to log execution metrics',
        { metrics, error }
      );
    }
  }

  /**
   * Log batch of execution metrics (atomic)
   *
   * @param metricsList - Array of execution metrics
   */
  async logBatch(metricsList: ExecutionMetrics[]): Promise<void> {
    try {
      if (metricsList.length === 0) {
        logger.debug('Empty batch, skipping');
        return;
      }

      // Normalize all metrics
      const normalizedMetrics = metricsList.map(m => this.normalizeMetrics(m));

      // Deduplicate based on idempotency keys
      const uniqueMetrics = await this.deduplicateBatch(normalizedMetrics);

      if (uniqueMetrics.length === 0) {
        logger.debug('All metrics already logged (idempotent)', {
          original_count: metricsList.length,
        });
        return;
      }

      // Prepare idempotency key entries
      const idempotencyEntries = uniqueMetrics.map(m => ({
        key: createIdempotentKey(m),
        metricsId: m.id,
      }));

      // Batch write to both databases (atomic)
      await this.dbService.executeTransaction([
        {
          database: 'sqlite',
          operation: async (adapter) => {
            await adapter.insertMany('execution_metrics', uniqueMetrics);
            await batchMarkWritten(idempotencyEntries, adapter);
          },
        },
        {
          database: 'postgres',
          operation: async (adapter) => {
            await adapter.insertMany('execution_metrics', uniqueMetrics);
            await batchMarkWritten(idempotencyEntries, adapter);
          },
        },
      ]);

      logger.info('Batch metrics logged successfully', {
        total_metrics: metricsList.length,
        unique_metrics: uniqueMetrics.length,
        duplicates_skipped: metricsList.length - uniqueMetrics.length,
      });
    } catch (error) {
      logger.error('Failed to log batch metrics', {
        batch_size: metricsList.length,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new StandardError(
        ErrorCode.DATABASE_ERROR,
        'Failed to log batch metrics',
        { metricsList, error }
      );
    }
  }

  /**
   * Query metrics with filters
   *
   * @param filters - Query filters
   * @returns Array of execution metrics
   */
  async queryMetrics(filters: MetricsFilter): Promise<ExecutionMetrics[]> {
    try {
      const queryOptions: QueryOptions<ExecutionMetrics> = {
        filters: [],
        limit: filters.limit || 100,
        offset: filters.offset || 0,
        orderBy: 'timestamp' as keyof ExecutionMetrics,
        order: 'desc',
      };

      // Add filters
      if (filters.agent_id) {
        queryOptions.filters?.push({
          field: 'agent_id' as keyof ExecutionMetrics,
          operator: 'eq',
          value: filters.agent_id,
        });
      }

      if (filters.skill_id) {
        queryOptions.filters?.push({
          field: 'skill_id' as keyof ExecutionMetrics,
          operator: 'eq',
          value: filters.skill_id,
        });
      }

      if (filters.task_id) {
        queryOptions.filters?.push({
          field: 'task_id' as keyof ExecutionMetrics,
          operator: 'eq',
          value: filters.task_id,
        });
      }

      if (filters.status) {
        queryOptions.filters?.push({
          field: 'status' as keyof ExecutionMetrics,
          operator: 'eq',
          value: filters.status,
        });
      }

      if (filters.start_date && filters.end_date) {
        queryOptions.filters?.push({
          field: 'timestamp' as keyof ExecutionMetrics,
          operator: 'between',
          value: [filters.start_date, filters.end_date],
        });
      }

      // Query from SQLite (primary source for metrics)
      const results = await this.sqliteAdapter.list<ExecutionMetrics>(
        'execution_metrics',
        queryOptions
      );

      logger.debug('Metrics query executed', {
        filters,
        result_count: results.length,
      });

      return results;
    } catch (error) {
      logger.error('Failed to query metrics', {
        filters,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new StandardError(
        ErrorCode.DATABASE_ERROR,
        'Failed to query metrics',
        { filters, error }
      );
    }
  }

  /**
   * Get aggregated metrics by agent
   *
   * @param startDate - Start date for aggregation
   * @param endDate - End date for aggregation
   * @returns Array of aggregated metrics
   */
  async getAggregatedMetrics(
    startDate?: Date,
    endDate?: Date
  ): Promise<MetricsAggregation[]> {
    try {
      // Query all metrics in date range
      const filters: MetricsFilter = {
        start_date: startDate,
        end_date: endDate,
        limit: 10000, // Large limit for aggregation
      };

      const metrics = await this.queryMetrics(filters);

      // Aggregate by agent_id
      const aggregationMap = new Map<string, MetricsAggregation>();

      metrics.forEach(m => {
        if (!aggregationMap.has(m.agent_id)) {
          aggregationMap.set(m.agent_id, {
            agent_id: m.agent_id,
            total_executions: 0,
            total_cost_usd: 0,
            total_tokens: 0,
            avg_duration_ms: 0,
            success_count: 0,
            failure_count: 0,
            success_rate: 0,
          });
        }

        const agg = aggregationMap.get(m.agent_id)!;
        agg.total_executions++;
        agg.total_cost_usd += m.cost_usd;
        agg.total_tokens += m.tokens_used;
        agg.avg_duration_ms += m.duration_ms;

        if (m.status === 'success') {
          agg.success_count++;
        } else {
          agg.failure_count++;
        }
      });

      // Calculate averages and success rates
      const results: MetricsAggregation[] = [];
      aggregationMap.forEach(agg => {
        agg.avg_duration_ms = Math.round(agg.avg_duration_ms / agg.total_executions);
        agg.success_rate = (agg.success_count / agg.total_executions) * 100;
        agg.total_cost_usd = roundCost(agg.total_cost_usd);
        results.push(agg);
      });

      // Sort by total cost (descending)
      results.sort((a, b) => b.total_cost_usd - a.total_cost_usd);

      logger.info('Aggregated metrics calculated', {
        agent_count: results.length,
        total_executions: results.reduce((sum, agg) => sum + agg.total_executions, 0),
      });

      return results;
    } catch (error) {
      logger.error('Failed to get aggregated metrics', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new StandardError(
        ErrorCode.DATABASE_ERROR,
        'Failed to get aggregated metrics',
        { error }
      );
    }
  }

  /**
   * Add metrics to batch queue
   *
   * @param metrics - Execution metrics to queue
   */
  async queueMetrics(metrics: ExecutionMetrics): Promise<void> {
    this.batchQueue.push(metrics);

    // Flush if batch size reached
    if (this.batchQueue.length >= this.batchSize) {
      await this.flush();
    } else {
      // Start flush timer if not already running
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
      }
    }
  }

  /**
   * Flush batch queue
   */
  async flush(): Promise<void> {
    if (this.batchQueue.length === 0) {
      return;
    }

    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Copy and clear queue
    const batch = [...this.batchQueue];
    this.batchQueue = [];

    // Log batch
    await this.logBatch(batch);
  }

  /**
   * Normalize metrics (add ID, validate, round cost)
   *
   * @param metrics - Raw metrics
   * @returns Normalized metrics
   */
  private normalizeMetrics(metrics: ExecutionMetrics): ExecutionMetrics {
    // Generate ID if not provided
    const id = metrics.id || uuidv4();

    // Validate cost accuracy
    const cost = roundCost(metrics.cost_usd);
    if (!validateCostAccuracy(cost)) {
      logger.warn('Cost accuracy validation failed', {
        original_cost: metrics.cost_usd,
        rounded_cost: cost,
      });
    }

    // Ensure timestamp is Date object
    const timestamp = metrics.timestamp instanceof Date
      ? metrics.timestamp
      : new Date(metrics.timestamp);

    return {
      ...metrics,
      id,
      timestamp,
      cost_usd: cost,
      metadata: metrics.metadata ? JSON.stringify(metrics.metadata) : undefined,
    } as ExecutionMetrics;
  }

  /**
   * Deduplicate batch based on idempotency keys
   *
   * @param metricsList - Batch of metrics
   * @returns Unique metrics (not already written)
   */
  private async deduplicateBatch(
    metricsList: ExecutionMetrics[]
  ): Promise<ExecutionMetrics[]> {
    // Generate idempotency keys
    const keys = metricsList.map(m => createIdempotentKey(m));

    // Check which keys already exist in SQLite
    const sqliteStatus = await batchCheckWritten(keys, this.sqliteAdapter);

    // Check which keys already exist in PostgreSQL
    const postgresStatus = await batchCheckWritten(keys, this.postgresAdapter);

    // Filter out metrics that are already written to BOTH databases
    const uniqueMetrics: ExecutionMetrics[] = [];
    metricsList.forEach((metrics, index) => {
      const key = keys[index];
      const inSQLite = sqliteStatus.get(key) || false;
      const inPostgres = postgresStatus.get(key) || false;

      if (!inSQLite || !inPostgres) {
        // At least one database doesn't have this metric, include it
        uniqueMetrics.push(metrics);
      }
    });

    return uniqueMetrics;
  }

  /**
   * Close and cleanup resources
   */
  async close(): Promise<void> {
    // Flush remaining metrics
    await this.flush();

    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    logger.info('MetricsLogger closed');
  }
}

/**
 * Create MetricsLogger instance
 *
 * @param dbService - Database service
 * @param batchSize - Optional batch size
 * @param flushIntervalMs - Optional flush interval
 * @returns MetricsLogger instance
 */
export function createMetricsLogger(
  dbService: DatabaseService,
  batchSize?: number,
  flushIntervalMs?: number
): MetricsLogger {
  return new MetricsLogger({
    dbService,
    batchSize,
    flushIntervalMs,
  });
}
