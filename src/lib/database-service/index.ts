/**
 * Database Service - Main Entry Point
 *
 * Unified database abstraction layer for Redis, SQLite, and PostgreSQL.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 *
 * @example
 * ```typescript
 * const dbService = new DatabaseService({
 *   redis: { type: 'redis', host: 'localhost', port: 6379 },
 *   sqlite: { type: 'sqlite', database: './data.db' },
 *   postgres: { type: 'postgres', connectionString: 'postgresql://...' }
 * });
 *
 * await dbService.connect();
 *
 * // Get data by correlation key across all databases
 * const data = await dbService.getByCorrelationKey({
 *   type: 'task',
 *   id: 'abc123',
 *   entity: 'agent'
 * });
 * ```
 */

import {
  IDatabaseService,
  IDatabaseAdapter,
  DatabaseConfig,
  CrossDatabaseResult,
  CorrelationKey,
} from './types';
import { RedisAdapter } from './redis-adapter';
import { SQLiteAdapter } from './sqlite-adapter';
import { PostgresAdapter } from './postgres-adapter';
import { TransactionManager } from './transaction-manager';
import {
  buildCorrelationKey,
  parseCorrelationKey,
  buildTaskKey,
  buildAgentKey,
  buildSkillKey,
  buildExecutionKey,
} from './correlation';
import { DatabaseErrorCode, createDatabaseError } from './errors';

export interface DatabaseServiceConfig {
  redis?: DatabaseConfig;
  sqlite?: DatabaseConfig;
  postgres?: DatabaseConfig;
}

export class DatabaseService implements IDatabaseService {
  private adapters: Map<string, IDatabaseAdapter> = new Map();
  private transactionManager: TransactionManager;
  private config: DatabaseServiceConfig;

  constructor(config: DatabaseServiceConfig) {
    this.config = config;
    this.transactionManager = new TransactionManager();

    // Initialize adapters
    if (config.redis) {
      this.adapters.set('redis', new RedisAdapter(config.redis));
    }

    if (config.sqlite) {
      this.adapters.set('sqlite', new SQLiteAdapter(config.sqlite));
    }

    if (config.postgres) {
      this.adapters.set('postgres', new PostgresAdapter(config.postgres));
    }
  }

  /**
   * Connect to all configured databases
   */
  async connect(): Promise<void> {
    const promises = Array.from(this.adapters.values()).map(adapter => adapter.connect());
    await Promise.all(promises);
  }

  /**
   * Disconnect from all databases
   */
  async disconnect(): Promise<void> {
    const promises = Array.from(this.adapters.values()).map(adapter => adapter.disconnect());
    await Promise.all(promises);
  }

  /**
   * Get adapter for specific database
   */
  getAdapter(type: 'redis' | 'sqlite' | 'postgres'): IDatabaseAdapter {
    const adapter = this.adapters.get(type);

    if (!adapter) {
      throw createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        `Database adapter not configured: ${type}`,
        undefined,
        { type }
      );
    }

    return adapter;
  }

  /**
   * Get record by correlation key across all databases
   */
  async getByCorrelationKey<T = any>(key: CorrelationKey): Promise<CrossDatabaseResult<T>> {
    const correlationKeyString = buildCorrelationKey(key);

    const result: CrossDatabaseResult<T> = {
      correlationKey: correlationKeyString,
      timestamp: new Date(),
    };

    // Query each database in parallel
    const promises: Promise<void>[] = [];

    if (this.adapters.has('redis')) {
      promises.push(
        this.adapters.get('redis')!.get<T>(correlationKeyString)
          .then(data => { if (data) result.redis = data; })
          .catch(err => console.warn('Redis lookup failed:', err))
      );
    }

    if (this.adapters.has('sqlite')) {
      promises.push(
        this.adapters.get('sqlite')!.get<T>(correlationKeyString)
          .then(data => { if (data) result.sqlite = data; })
          .catch(err => console.warn('SQLite lookup failed:', err))
      );
    }

    if (this.adapters.has('postgres')) {
      promises.push(
        this.adapters.get('postgres')!.get<T>(correlationKeyString)
          .then(data => { if (data) result.postgres = data; })
          .catch(err => console.warn('PostgreSQL lookup failed:', err))
      );
    }

    await Promise.all(promises);

    return result;
  }

  /**
   * Execute cross-database transaction
   */
  async executeTransaction<T = any>(
    operations: Array<{
      database: 'redis' | 'sqlite' | 'postgres';
      operation: (adapter: IDatabaseAdapter) => Promise<T>;
    }>
  ): Promise<T[]> {
    const adapters = operations.map(op => this.getAdapter(op.database));
    const ops = operations.map(op => op.operation);

    return this.transactionManager.executeTransaction(adapters, ops);
  }

  /**
   * Build correlation key
   */
  buildCorrelationKey(key: CorrelationKey): string {
    return buildCorrelationKey(key);
  }

  /**
   * Parse correlation key
   */
  parseCorrelationKey(key: string): CorrelationKey | null {
    return parseCorrelationKey(key);
  }

  /**
   * Get transaction manager
   */
  getTransactionManager(): TransactionManager {
    return this.transactionManager;
  }

  /**
   * Check if all configured databases are connected
   */
  isConnected(): boolean {
    return Array.from(this.adapters.values()).every(adapter => adapter.isConnected());
  }

  /**
   * Get database statistics
   */
  getStats() {
    return {
      adapters: {
        redis: this.adapters.has('redis') && this.adapters.get('redis')!.isConnected(),
        sqlite: this.adapters.has('sqlite') && this.adapters.get('sqlite')!.isConnected(),
        postgres: this.adapters.has('postgres') && this.adapters.get('postgres')!.isConnected(),
      },
      transactions: {
        active: this.transactionManager.getActiveCount(),
      },
    };
  }
}

// Re-export types and utilities
export * from './types';
export * from './errors';
export * from './correlation';
export { RedisAdapter } from './redis-adapter';
export { SQLiteAdapter } from './sqlite-adapter';
export { PostgresAdapter } from './postgres-adapter';
export { TransactionManager } from './transaction-manager';

// Re-export correlation utilities
export {
  buildTaskKey,
  buildAgentKey,
  buildSkillKey,
  buildExecutionKey,
};
