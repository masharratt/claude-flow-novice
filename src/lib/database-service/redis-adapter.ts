/**
 * Redis Database Adapter
 *
 * Implements IDatabaseAdapter for Redis key-value store.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 */

import { createClient, RedisClientType } from 'redis';
import {
  IDatabaseAdapter,
  DatabaseConfig,
  QueryOptions,
  QueryFilter,
  OperationResult,
  TransactionContext,
} from './types';
import {
  DatabaseErrorCode,
  createDatabaseError,
  createSuccessResult,
  createFailedResult,
  mapRedisError,
} from './errors';

export class RedisAdapter implements IDatabaseAdapter {
  private client: RedisClientType | null = null;
  private config: DatabaseConfig;
  private connected: boolean = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  getType(): 'redis' {
    return 'redis';
  }

  async connect(): Promise<void> {
    try {
      const url = this.config.connectionString ||
        `redis://${this.config.host || 'localhost'}:${this.config.port || 6379}`;

      this.client = createClient({
        url,
        socket: {
          connectTimeout: this.config.timeout || 5000,
        },
      });

      await this.client.connect();
      this.connected = true;
    } catch (err) {
      const error = createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Failed to connect to Redis',
        err instanceof Error ? err : new Error(String(err)),
        { config: this.config }
      );
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
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
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      throw createDatabaseError(
        errorCode,
        `Failed to get key: ${key}`,
        err instanceof Error ? err : new Error(String(err)),
        { key }
      );
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

      return results.slice(start, end);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      throw createDatabaseError(
        errorCode,
        `Failed to list keys: ${pattern}`,
        err instanceof Error ? err : new Error(String(err)),
        { pattern, options }
      );
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

      return createSuccessResult(data, 1);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to insert key: ${key}`,
        err instanceof Error ? err : new Error(String(err)),
        { key, data }
      ));
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

      return createSuccessResult(data, data.length);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to insert multiple keys with pattern: ${pattern}`,
        err instanceof Error ? err : new Error(String(err)),
        { pattern, count: data.length }
      ));
    }
  }

  async update<T = any>(key: string, data: Partial<T>): Promise<OperationResult<T>> {
    this.ensureConnected();

    try {
      // Get existing data
      const existing = await this.get<T>(key);

      if (existing === null) {
        return createFailedResult(createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          undefined,
          { key }
        ));
      }

      // Merge with updates
      const updated = { ...existing, ...data } as T;
      const value = JSON.stringify(updated);

      await this.client!.set(key, value);

      return createSuccessResult(updated, 1);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to update key: ${key}`,
        err instanceof Error ? err : new Error(String(err)),
        { key, data }
      ));
    }
  }

  async delete(_table: string, key: string): Promise<OperationResult<void>> {
    this.ensureConnected();

    try {
      const count = await this.client!.del(key);

      if (count === 0) {
        return createFailedResult(createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Key not found: ${key}`,
          undefined,
          { key }
        ));
      }

      return createSuccessResult(undefined, count);
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to delete key: ${key}`,
        err instanceof Error ? err : new Error(String(err)),
        { key }
      ));
    }
  }

  async raw<T = any>(command: string, params?: any[]): Promise<T> {
    this.ensureConnected();

    try {
      const result = await this.client!.sendCommand([command, ...(params || [])]);
      return result as T;
    } catch (err) {
      const errorCode = mapRedisError(err instanceof Error ? err : new Error(String(err)));
      throw createDatabaseError(
        errorCode,
        `Failed to execute raw command: ${command}`,
        err instanceof Error ? err : new Error(String(err)),
        { command, params }
      );
    }
  }

  async beginTransaction(): Promise<TransactionContext> {
    return {
      id: `redis-tx-${Date.now()}`,
      databases: ['redis'],
      startTime: new Date(),
      status: 'pending',
    };
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
