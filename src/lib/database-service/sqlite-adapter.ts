/**
 * SQLite Database Adapter
 *
 * Implements IDatabaseAdapter for SQLite with prepared statements and connection pooling.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 *
 * UPDATED: Now uses ConnectionPoolManager for proper connection pool initialization,
 * health checks, automatic reconnection, and connection metrics.
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
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
  mapSQLiteError,
} from './errors.js';
import { ConnectionPoolManager } from './connection-pool-manager.js';
import { withDatabaseRetry } from '../retry-manager.js';
import { ErrorAggregator } from '../error-aggregator.js';
import { v4 as uuidv4 } from 'uuid';

export class SQLiteAdapter implements IDatabaseAdapter {
  private poolManager: ConnectionPoolManager | null = null;
  private config: DatabaseConfig;
  private connected: boolean = false;
  private transactions: Map<string, TransactionContext> = new Map();
  private errorAggregator?: ErrorAggregator;
  private correlationId: string;

  constructor(config: DatabaseConfig, errorAggregator?: ErrorAggregator) {
    this.config = config;
    this.errorAggregator = errorAggregator;
    this.correlationId = uuidv4();
  }

  getType(): 'sqlite' {
    return 'sqlite';
  }

  /**
   * Track error with error aggregator
   * @private
   */
  private trackError(error: any, operation: string, context?: Record<string, any>): void {
    if (this.errorAggregator) {
      const dbError = error.code ? error : createDatabaseError(
        DatabaseErrorCode.QUERY_FAILED,
        `SQLite ${operation} failed`,
        error instanceof Error ? error : new Error(String(error)),
        context
      );

      this.errorAggregator.addError('sqlite', dbError, {
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
      this.errorAggregator.recordSuccess('sqlite');
    }
  }

  async connect(): Promise<void> {
    // Wrap connection with retry logic for transient failures
    await withDatabaseRetry(async () => {
      try {
        // Initialize connection pool manager
        this.poolManager = new ConnectionPoolManager(this.config);
        await this.poolManager.initialize();

        // Start health checks (ping every 30s)
        this.poolManager.startHealthChecks();

        this.connected = true;
        this.recordSuccess();
      } catch (err) {
        const error = createDatabaseError(
          DatabaseErrorCode.CONNECTION_FAILED,
          'Failed to connect to SQLite',
          err instanceof Error ? err : new Error(String(err)),
          { config: this.config, correlationId: this.correlationId }
        );
        this.trackError(error, 'connect');
        throw error;
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.poolManager) {
      await this.poolManager.shutdown();
      this.poolManager = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.poolManager !== null;
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    return this.poolManager?.getStats();
  }

  async get<T = any>(key: string): Promise<T | null> {
    this.ensureConnected();

    // Wrap with retry logic for transient database failures
    return withDatabaseRetry(async () => {
      const connection = await this.poolManager!.acquire();

      try {
        // Parse correlation key format: table:id or table:id:entity:subtype
        // For SQL adapters, we use only table:id for lookup
        const parts = key.split(':');
        const table = parts[0];
        const id = parts.slice(1).join(':'); // Rejoin remaining parts as ID

        if (!table || !id) {
          throw new Error('Invalid key format. Expected "table:id" or "table:id:entity:subtype"');
        }

        const query = `SELECT * FROM ${this.sanitizeIdentifier(table)} WHERE id = ?`;
        const result = await connection.get<T>(query, [id]);

        this.recordSuccess();
        return result || null;
      } catch (err) {
        const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
        const error = createDatabaseError(
          errorCode,
          `Failed to get record: ${key}`,
          err instanceof Error ? err : new Error(String(err)),
          { key, correlationId: this.correlationId }
        );
        this.trackError(error, 'get', { key });
        throw error;
      } finally {
        await this.poolManager!.release(connection);
      }
    });
  }

  async list<T = any>(table: string, options?: QueryOptions<T>): Promise<T[]> {
    this.ensureConnected();

    // Wrap with retry logic for transient database failures
    return withDatabaseRetry(async () => {
      const connection = await this.poolManager!.acquire();

      try {
        let query = `SELECT * FROM ${this.sanitizeIdentifier(table)}`;
        const params: any[] = [];

        // Apply filters
        if (options?.filters && options.filters.length > 0) {
          const whereClauses = options.filters.map(filter => {
            return this.buildWhereClause(filter, params);
          });
          query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        // Apply ordering
        if (options?.orderBy) {
          const order = options.order || 'asc';
          query += ` ORDER BY ${this.sanitizeIdentifier(String(options.orderBy))} ${order.toUpperCase()}`;
        }

        // Apply limit and offset
        if (options?.limit) {
          query += ` LIMIT ?`;
          params.push(options.limit);
        }

        if (options?.offset) {
          query += ` OFFSET ?`;
          params.push(options.offset);
        }

        const results = await connection.all<T[]>(query, params);
        this.recordSuccess();
        return results;
      } catch (err) {
        const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
        const error = createDatabaseError(
          errorCode,
          `Failed to list records from table: ${table}`,
          err instanceof Error ? err : new Error(String(err)),
          { table, options, correlationId: this.correlationId }
        );
        this.trackError(error, 'list', { table });
        throw error;
      } finally {
        await this.poolManager!.release(connection);
      }
    });
  }

  async query<T = any>(table: string, filters: QueryFilter<T>[]): Promise<T[]> {
    return this.list(table, { filters });
  }

  async insert<T = any>(table: string, data: T): Promise<OperationResult<T>> {
    this.ensureConnected();

    // Wrap with retry logic for transient database failures
    return withDatabaseRetry(async () => {
      const connection = await this.poolManager!.acquire();

      try {
        const keys = Object.keys(data as any);
        const values = Object.values(data as any);

        const placeholders = keys.map(() => '?').join(', ');
        const columns = keys.map(k => this.sanitizeIdentifier(k)).join(', ');

        const query = `INSERT INTO ${this.sanitizeIdentifier(table)} (${columns}) VALUES (${placeholders})`;

        const result = await connection.run(query, values);

        this.recordSuccess();
        return createSuccessResult(data, result.changes, result.lastID);
      } catch (err) {
        const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
        const error = createDatabaseError(
          errorCode,
          `Failed to insert record into table: ${table}`,
          err instanceof Error ? err : new Error(String(err)),
          { table, data, correlationId: this.correlationId }
        );
        this.trackError(error, 'insert', { table });
        return createFailedResult(error);
      } finally {
        await this.poolManager!.release(connection);
      }
    });
  }

  async insertMany<T = any>(table: string, data: T[]): Promise<OperationResult<T[]>> {
    this.ensureConnected();

    const connection = await this.poolManager!.acquire();

    // Check if we're already in an active transaction (SQLite doesn't support nested transactions)
    const hasActiveTransaction = this.transactions.size > 0;

    try {
      // Only begin transaction if not already in one
      if (!hasActiveTransaction) {
        await connection.run('BEGIN TRANSACTION');
      }

      let totalChanges = 0;

      for (const item of data) {
        const keys = Object.keys(item as any);
        const values = Object.values(item as any);

        const placeholders = keys.map(() => '?').join(', ');
        const columns = keys.map(k => this.sanitizeIdentifier(k)).join(', ');

        const query = `INSERT INTO ${this.sanitizeIdentifier(table)} (${columns}) VALUES (${placeholders})`;

        const result = await connection.run(query, values);
        totalChanges += result.changes || 0;
      }

      // Only commit if we started the transaction
      if (!hasActiveTransaction) {
        await connection.run('COMMIT');
      }

      this.recordSuccess();
      return createSuccessResult(data, totalChanges);
    } catch (err) {
      // Only rollback if we started the transaction
      if (!hasActiveTransaction) {
        await connection.run('ROLLBACK');
      }

      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to insert multiple records into table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, count: data.length, correlationId: this.correlationId }
      );
      this.trackError(error, 'insertMany', { table, count: data.length });
      return createFailedResult(error);
    } finally {
      await this.poolManager!.release(connection);
    }
  }

  async update<T = any>(table: string, key: string, data: Partial<T>): Promise<OperationResult<T>> {
    this.ensureConnected();

    const connection = await this.poolManager!.acquire();

    try {
      const keys = Object.keys(data as any);
      const values = Object.values(data as any);

      const setClauses = keys.map(k => `${this.sanitizeIdentifier(k)} = ?`).join(', ');

      const query = `UPDATE ${this.sanitizeIdentifier(table)} SET ${setClauses} WHERE id = ?`;

      const result = await connection.run(query, [...values, key]);

      if (result.changes === 0) {
        const error = createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Record not found in table: ${table}`,
          undefined,
          { table, key, correlationId: this.correlationId }
        );
        this.trackError(error, 'update', { table, key });
        return createFailedResult(error);
      }

      // Get updated record
      const updated = await this.get<T>(`${table}:${key}`);

      this.recordSuccess();
      return createSuccessResult(updated!, result.changes);
    } catch (err) {
      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to update record in table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, key, data, correlationId: this.correlationId }
      );
      this.trackError(error, 'update', { table, key });
      return createFailedResult(error);
    } finally {
      await this.poolManager!.release(connection);
    }
  }

  async delete(table: string, key: string): Promise<OperationResult<void>> {
    this.ensureConnected();

    const connection = await this.poolManager!.acquire();

    try {
      const query = `DELETE FROM ${this.sanitizeIdentifier(table)} WHERE id = ?`;

      const result = await connection.run(query, [key]);

      if (result.changes === 0) {
        const error = createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Record not found in table: ${table}`,
          undefined,
          { table, key, correlationId: this.correlationId }
        );
        this.trackError(error, 'delete', { table, key });
        return createFailedResult(error);
      }

      this.recordSuccess();
      return createSuccessResult(undefined, result.changes);
    } catch (err) {
      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to delete record from table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, key, correlationId: this.correlationId }
      );
      this.trackError(error, 'delete', { table, key });
      return createFailedResult(error);
    } finally {
      await this.poolManager!.release(connection);
    }
  }

  /**
   * Detect query type with comprehensive pattern matching
   * Handles: SELECT, WITH/CTE, EXPLAIN, PRAGMA, comments
   */
  private detectQueryType(query: string): 'read' | 'write' {
    // Remove multi-line comments first (/* */)
    let normalized = query.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove single-line comments (--) line by line
    normalized = normalized
      .split('\n')
      .map(line => line.replace(/--.*$/, ''))
      .join('\n')
      .trim();

    // Read operations: SELECT, WITH (CTEs), EXPLAIN, PRAGMA, SHOW
    const readPatterns = /^(SELECT|WITH|EXPLAIN|PRAGMA|SHOW)/i;
    return readPatterns.test(normalized) ? 'read' : 'write';
  }

  async raw<T = any>(query: string, params?: any[]): Promise<T> {
    this.ensureConnected();

    const connection = await this.poolManager!.acquire();

    try {
      // Determine if query is SELECT or modification using comprehensive detection
      const isSelect = this.detectQueryType(query) === 'read';

      if (isSelect) {
        const results = await connection.all<T[]>(query, params);
        this.recordSuccess();
        return results as T;
      } else {
        const result = await connection.run(query, params);
        this.recordSuccess();
        return result as T;
      }
    } catch (err) {
      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
      const error = createDatabaseError(
        errorCode,
        `Failed to execute raw query`,
        err instanceof Error ? err : new Error(String(err)),
        { query, params, correlationId: this.correlationId }
      );
      this.trackError(error, 'raw', { query });
      throw error;
    } finally {
      await this.poolManager!.release(connection);
    }
  }

  async beginTransaction(): Promise<TransactionContext> {
    this.ensureConnected();

    const connection = await this.poolManager!.acquire();

    const context: TransactionContext = {
      id: `sqlite-tx-${randomUUID()}`,
      databases: ['sqlite'],
      startTime: new Date(),
      status: 'pending',
    };

    await connection.run('BEGIN TRANSACTION');
    this.transactions.set(context.id, { ...context, connection });

    return context;
  }

  async prepareTransaction(context: TransactionContext): Promise<boolean> {
    this.ensureConnected();

    if (!this.transactions.has(context.id)) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Transaction not found',
        undefined,
        { transactionId: context.id }
      );
    }

    try {
      // SQLite doesn't support native two-phase commit
      // We simulate PREPARE by validating the transaction can commit
      // This involves checking for constraint violations and lock conflicts

      const txData = this.transactions.get(context.id) as any;
      const connection = txData.connection;

      // Check if database is locked (would prevent commit)
      await connection.get('PRAGMA lock_status');

      // Validate foreign key constraints
      const violations = await connection.all('PRAGMA foreign_key_check');
      if (violations && violations.length > 0) {
        throw new Error(`Foreign key constraint violations: ${JSON.stringify(violations)}`);
      }

      // If we get here, transaction can be committed
      context.status = 'prepared';
      context.preparedAt = new Date();

      // Update transaction in map
      this.transactions.set(context.id, { ...context, connection });

      return true;
    } catch (err) {
      // Prepare failed - transaction can still be rolled back
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Failed to prepare transaction',
        err instanceof Error ? err : new Error(String(err)),
        { transactionId: context.id }
      );
    }
  }

  async commitTransaction(context: TransactionContext): Promise<void> {
    this.ensureConnected();

    if (!this.transactions.has(context.id)) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Transaction not found',
        undefined,
        { transactionId: context.id }
      );
    }

    const txData = this.transactions.get(context.id) as any;
    const connection = txData.connection;

    try {
      await connection.run('COMMIT');
      context.status = 'committed';
    } finally {
      // Always cleanup transaction from map and release connection
      this.transactions.delete(context.id);
      await this.poolManager!.release(connection);
    }
  }

  async rollbackTransaction(context: TransactionContext): Promise<void> {
    this.ensureConnected();

    if (!this.transactions.has(context.id)) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Transaction not found',
        undefined,
        { transactionId: context.id }
      );
    }

    const txData = this.transactions.get(context.id) as any;
    const connection = txData.connection;

    try {
      await connection.run('ROLLBACK');
      context.status = 'rolled_back';
    } finally {
      // Always cleanup transaction from map and release connection
      this.transactions.delete(context.id);
      await this.poolManager!.release(connection);
    }
  }

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to SQLite',
        undefined,
        { config: this.config }
      );
    }
  }

  private sanitizeIdentifier(identifier: string): string {
    // Remove any characters that aren't alphanumeric or underscore
    return identifier.replace(/[^a-zA-Z0-9_]/g, '');
  }

  private buildWhereClause<T>(filter: QueryFilter<T>, params: any[]): string {
    const field = this.sanitizeIdentifier(String(filter.field));

    switch (filter.operator) {
      case 'eq': {
        params.push(filter.value);
        return `${field} = ?`;
      }
      case 'ne': {
        params.push(filter.value);
        return `${field} != ?`;
      }
      case 'gt': {
        params.push(filter.value);
        return `${field} > ?`;
      }
      case 'gte': {
        params.push(filter.value);
        return `${field} >= ?`;
      }
      case 'lt': {
        params.push(filter.value);
        return `${field} < ?`;
      }
      case 'lte': {
        params.push(filter.value);
        return `${field} <= ?`;
      }
      case 'in': {
        if (!Array.isArray(filter.value)) {
          throw new TypeError(`Field '${String(filter.field)}' with operator 'in' requires an array value`);
        }
        if (filter.value.length === 0) {
          // Empty IN list - return false condition without invalid SQL
          return '1=0';
        }
        const placeholders = filter.value.map(() => '?').join(', ');
        params.push(...filter.value);
        return `${field} IN (${placeholders})`;
      }
      case 'like': {
        params.push(`%${filter.value}%`);
        return `${field} LIKE ?`;
      }
      case 'between': {
        if (!Array.isArray(filter.value)) {
          throw new TypeError(`Field '${String(filter.field)}' with operator 'between' requires an array value`);
        }
        if (filter.value.length !== 2) {
          throw new TypeError(`Field '${String(filter.field)}' with operator 'between' requires exactly 2 elements, got ${filter.value.length}`);
        }
        params.push(filter.value[0], filter.value[1]);
        return `${field} BETWEEN ? AND ?`;
      }
      default:
        return '1=1';
    }
  }
}
