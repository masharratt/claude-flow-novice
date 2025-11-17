/**
 * Redis Database Adapter
 *
 * Implements IDatabaseAdapter for Redis key-value store.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 *
 * UPDATED: Now uses ConnectionPoolManager for proper connection pool initialization,
 * health checks, automatic reconnection with exponential backoff, and connection metrics.
 *
 * SECURITY: Supports Redis authentication via requirepass with secure password handling
 */

import { createClient, RedisClientType } from 'redis';
import { randomUUID } from 'crypto';
import {
  IDatabaseAdapter,
  DatabaseConfig,
  QueryOptions,
  QueryFilter,
  OperationResult,
  TransactionContext,
} from './types.js';
import {
  DatabaseErrorCode,
  createDatabaseError,
  createSuccessResult,
  createFailedResult,
  mapRedisError,
} from './errors.js';
import { ConnectionPoolManager } from './connection-pool-manager.js';
import { ErrorAggregator } from '../error-aggregator.js';
import { v4 as uuidv4 } from 'uuid';

export class RedisAdapter implements IDatabaseAdapter {
  private poolManager: ConnectionPoolManager | null = null;
  private client: RedisClientType | null = null;
  private config: DatabaseConfig;
  private connected: boolean = false;
  private errorAggregator?: ErrorAggregator;
  private correlationId: string;

  constructor(config: DatabaseConfig, errorAggregator?: ErrorAggregator) {
    this.config = config;
    this.errorAggregator = errorAggregator;
    this.correlationId = uuidv4();
  }

  /**
   * Track error with error aggregator
   * @private
   */
  private trackError(error: any, operation: string, context?: Record<string, any>): void {
    if (this.errorAggregator) {
      const dbError = error.code ? error : createDatabaseError(
        DatabaseErrorCode.QUERY_FAILED,
        `Redis ${operation} failed`,
        error instanceof Error ? error : new Error(String(error)),
        context
      );

      this.errorAggregator.addError('redis', dbError, {
        ...context,
        operation,
        correlationId: this.correlationId,
      });
    }
  }

  /**
   * Record successful operation with error aggregator
   * @private
   */
  private recordSuccess(): void {
    if (this.errorAggregator) {
      this.errorAggregator.recordSuccess('redis');
    }
  }

  getType(): 'redis' {
    return 'redis';
  }

  async connect(): Promise<void> {
    try {
      // Initialize connection pool manager
      this.poolManager = new ConnectionPoolManager(this.config);
      await this.poolManager.initialize();

      // Get the Redis client from pool manager
      this.client = await this.poolManager.acquire();

      // Start health checks (ping every 30s)
      this.poolManager.startHealthChecks();

      this.connected = true;
      this.recordSuccess();
    } catch (err) {
      const error = createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Failed to connect to Redis',
        err instanceof Error ? err : new Error(String(err)),
        { config: this.config, correlationId: this.correlationId }
      );
      this.trackError(error, 'connect');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.poolManager) {
      await this.poolManager.shutdown();
      this.poolManager = null;
      this.client = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.poolManager !== null && this.client !== null;
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    return this.poolManager?.getStats();
  }

  async get<T = any>(key: string): Promise<T | null> {
    this.ensureConnected();

    try {
      const value = await this.client!.get(key);

      if (value === null) {
        return null;
      }

      // Try to parse as JSON, fall back to raw string
      try {
        this.recordSuccess();
        return JSON.parse(value) as T;
      } catch {
        this.recordSuccess();
        return value as unknown as T;
      }
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to get key: ${key}`,
        err instanceof Error ? err : new Error(String(err)),
        { key, correlationId: this.correlationId }
      );
      this.trackError(error, 'get', { key });
      throw error;
    }
  }

  async list<T = any>(pattern: string, options?: QueryOptions<T>): Promise<T[]> {
    this.ensureConnected();

    try {
      const keys = await this.client!.keys(pattern);

      if (keys.length === 0) {
        return [];
      }

      const values = await this.client!.mGet(keys);

      const results = values
        .map((value, index) => {
          if (value === null) {
            return null;
          }

          try {
            return JSON.parse(value) as T;
          } catch {
            return value as unknown as T;
          }
        })
        .filter((v): v is T => v !== null);

      // Apply limit and offset
      const start = options?.offset || 0;
      const end = options?.limit ? start + options.limit : undefined;

      this.recordSuccess();
      return results.slice(start, end);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to list keys: ${pattern}`,
        err instanceof Error ? err : new Error(String(err)),
        { pattern, options, correlationId: this.correlationId }
      );
      this.trackError(error, 'list', { pattern });
      throw error;
    }
  }

  async query<T = any>(pattern: string, filters: QueryFilter<T>[]): Promise<T[]> {
    // For Redis, query is similar to list but with additional filtering
    const results = await this.list<T>(pattern);

    // Apply filters
    return results.filter(item => {
      return filters.every(filter => {
        const value = (item as any)[filter.field];

        switch (filter.operator) {
          case 'eq':
            return value === filter.value;
          case 'ne':
            return value !== filter.value;
          case 'gt':
            return value > filter.value;
          case 'gte':
            return value >= filter.value;
          case 'lt':
            return value < filter.value;
          case 'lte':
            return value <= filter.value;
          case 'in':
            return Array.isArray(filter.value) && filter.value.includes(value);
          case 'like':
            return String(value).includes(String(filter.value));
          default:
            return true;
        }
      });
    });
  }

  async insert<T = any>(key: string, data: T): Promise<OperationResult<T>> {
    this.ensureConnected();

    try {
      const value = typeof data === 'string' ? data : JSON.stringify(data);
      await this.client!.set(key, value);

      this.recordSuccess();
      return createSuccessResult(data, 1);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to insert key: ${key}`,
        err instanceof Error ? err : new Error(String(err)),
        { key, data, correlationId: this.correlationId }
      );
      this.trackError(error, 'insert', { key });
      return createFailedResult(error);
    }
  }

  async insertMany<T = any>(pattern: string, data: T[]): Promise<OperationResult<T[]>> {
    this.ensureConnected();

    try {
      const pipeline = this.client!.multi();

      data.forEach((item, index) => {
        const key = `${pattern}:${index}`;
        const value = typeof item === 'string' ? item : JSON.stringify(item);
        pipeline.set(key, value);
      });

      await pipeline.exec();

      this.recordSuccess();
      return createSuccessResult(data, data.length);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to insert multiple keys with pattern: ${pattern}`,
        err instanceof Error ? err : new Error(String(err)),
        { pattern, count: data.length, correlationId: this.correlationId }
      );
      this.trackError(error, 'insertMany', { pattern, count: data.length });
      return createFailedResult(error);
    }
  }

  async update<T = any>(key: string, data: Partial<T>): Promise<OperationResult<T>> {
    this.ensureConnected();

    try {
      // Get existing data
      const existing = await this.get<T>(key);

      if (existing === null) {
        const error = createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          undefined,
          { key, correlationId: this.correlationId }
        );
        this.trackError(error, 'update', { key });
        return createFailedResult(error);
      }

      // Merge with updates
      const updated = { ...existing, ...data } as T;
      const value = JSON.stringify(updated);

      await this.client!.set(key, value);

      this.recordSuccess();
      return createSuccessResult(updated, 1);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to update key: ${key}`,
        err instanceof Error ? err : new Error(String(err)),
        { key, data, correlationId: this.correlationId }
      );
      this.trackError(error, 'update', { key });
      return createFailedResult(error);
    }
  }

  async delete(_table: string, key: string): Promise<OperationResult<void>> {
    this.ensureConnected();

    try {
      const count = await this.client!.del(key);

      if (count === 0) {
        const error = createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          undefined,
          { key, correlationId: this.correlationId }
        );
        this.trackError(error, 'delete', { key });
        return createFailedResult(error);
      }

      this.recordSuccess();
      return createSuccessResult(undefined, count);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to delete key: ${key}`,
        err instanceof Error ? err : new Error(String(err)),
        { key, correlationId: this.correlationId }
      );
      this.trackError(error, 'delete', { key });
      return createFailedResult(error);
    }
  }

  async raw<T = any>(command: string, params?: any[]): Promise<T> {
    this.ensureConnected();

    try {
      const result = await this.client!.sendCommand([command, ...(params || [])]);
      this.recordSuccess();
      return result as T;
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to execute raw command: ${command}`,
        err instanceof Error ? err : new Error(String(err)),
        { command, params, correlationId: this.correlationId }
      );
      this.trackError(error, 'raw', { command });
      throw error;
    }
  }

  async beginTransaction(): Promise<TransactionContext> {
    return {
      id: `redis-tx-${randomUUID()}`,
      databases: ['redis'],
      startTime: new Date(),
      status: 'pending',
    };
  }

  async prepareTransaction(context: TransactionContext): Promise<boolean> {
    try {
      // Redis doesn't support traditional two-phase commit
      // PREPARE validation: Check if Redis is available and can accept commands
      this.ensureConnected();

      // Test connection and command execution
      await this.client!.ping();

      // Mark as prepared
      context.status = 'prepared';
      context.preparedAt = new Date();

      return true;
    } catch (err) {
      // Prepare failed - typically due to connection issues
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Failed to prepare transaction - Redis unavailable',
        err instanceof Error ? err : new Error(String(err)),
        { transactionId: context.id }
      );
    }
  }

  async commitTransaction(context: TransactionContext): Promise<void> {
    // Redis transactions are handled via MULTI/EXEC
    // This is a placeholder for cross-database transaction support
    context.status = 'committed';
  }

  async rollbackTransaction(context: TransactionContext): Promise<void> {
    // Redis doesn't support traditional rollback
    // This is a placeholder for cross-database transaction support
    context.status = 'rolled_back';
  }

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to Redis',
        undefined,
        { config: this.config }
      );
    }
  }
}
