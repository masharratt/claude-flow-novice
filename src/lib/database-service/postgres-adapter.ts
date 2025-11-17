/**
 * PostgreSQL Database Adapter
 *
 * Implements IDatabaseAdapter for PostgreSQL with connection pooling and parameterized queries.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 *
 * SECURITY: Requires password authentication and uses parameterized queries for SQL injection prevention
 */

import { Pool, PoolClient, QueryResult } from 'pg';
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
  mapPostgresError,
} from './errors';
import { withDatabaseRetry } from '../retry-manager';

export class PostgresAdapter implements IDatabaseAdapter {
  private pool: Pool | null = null;
  private config: DatabaseConfig;
  private connected: boolean = false;
  private transactions: Map<string, { context: TransactionContext; client: PoolClient }> = new Map();

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  getType(): 'postgres' {
    return 'postgres';
  }

  async connect(): Promise<void> {
    // SECURITY: Validate password is provided for authentication
    if (!this.config.password && !this.config.connectionString) {
      throw createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'PostgreSQL password is required. Set POSTGRES_PASSWORD environment variable.',
        undefined,
        { reason: 'missing_authentication' }
      );
    }

    // Wrap connection with retry logic for transient failures
    await withDatabaseRetry(async () => {
      try {
        const poolConfig: any = {
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          user: this.config.username,
          password: this.config.password,
          max: this.config.poolSize || 10,
          idleTimeoutMillis: this.config.timeout || 30000,
          connectionTimeoutMillis: 5000,
        };

        // Use connectionString if provided, otherwise build from components
        if (this.config.connectionString) {
          poolConfig.connectionString = this.config.connectionString;
        }

        this.pool = new Pool(poolConfig);

        // Test connection
        const client = await this.pool.connect();
        client.release();

        this.connected = true;
      } catch (err) {
        throw createDatabaseError(
          DatabaseErrorCode.CONNECTION_FAILED,
          'Failed to connect to PostgreSQL',
          err instanceof Error ? err : new Error(String(err)),
          { config: this.config }
        );
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.pool !== null;
  }

  async get<T = any>(key: string, transactionId?: string): Promise<T | null> {
    this.ensureConnected();

    try {
      // Parse correlation key format: table:id or table:id:entity:subtype
      // For SQL adapters, we use only table:id for lookup
      const parts = key.split(':');
      const table = parts[0];
      const id = parts.slice(1).join(':'); // Rejoin remaining parts as ID

      if (!table || !id) {
        throw new Error('Invalid key format. Expected "table:id" or "table:id:entity:subtype"');
      }

      const query = `SELECT * FROM ${this.sanitizeIdentifier(table)} WHERE id = $1`;
      const client = this.getQueryClient(transactionId);
      const result = await client.query<T>(query, [id]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      const errorCode = mapPostgresError(err);
      throw createDatabaseError(
        errorCode,
        `Failed to get record: ${key}`,
        err instanceof Error ? err : new Error(String(err)),
        { key }
      );
    }
  }

  async list<T = any>(table: string, options?: QueryOptions<T>, transactionId?: string): Promise<T[]> {
    this.ensureConnected();

    try {
      let query = `SELECT * FROM ${this.sanitizeIdentifier(table)}`;
      const params: any[] = [];
      let paramIndex = 1;

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
        query += ` LIMIT $${paramIndex++}`;
        params.push(options.limit);
      }

      if (options?.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(options.offset);
      }

      const client = this.getQueryClient(transactionId);
      const result = await client.query<T>(query, params);
      return result.rows;
    } catch (err) {
      const errorCode = mapPostgresError(err);
      throw createDatabaseError(
        errorCode,
        `Failed to list records from table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, options }
      );
    }
  }

  async query<T = any>(table: string, filters: QueryFilter<T>[], transactionId?: string): Promise<T[]> {
    return this.list(table, { filters }, transactionId);
  }

  async insert<T = any>(table: string, data: T, transactionId?: string): Promise<OperationResult<T>> {
    this.ensureConnected();

    try {
      const keys = Object.keys(data as any);
      const values = Object.values(data as any);

      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const columns = keys.map(k => this.sanitizeIdentifier(k)).join(', ');

      const query = `INSERT INTO ${this.sanitizeIdentifier(table)} (${columns}) VALUES (${placeholders}) RETURNING *`;

      const client = this.getQueryClient(transactionId);
      const result = await client.query<T>(query, values);

      return createSuccessResult(result.rows[0], result.rowCount || 0, result.rows[0] ? (result.rows[0] as any).id : undefined);
    } catch (err) {
      const errorCode = mapPostgresError(err);
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to insert record into table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, data }
      ));
    }
  }

  async insertMany<T = any>(table: string, data: T[], transactionId?: string): Promise<OperationResult<T[]>> {
    this.ensureConnected();

    // Check if we're already in a transaction
    const hasActiveTransaction = transactionId && this.transactions.has(transactionId);
    const client = hasActiveTransaction ? this.getQueryClient(transactionId) as PoolClient : await this.pool!.connect();

    try {
      // Only begin transaction if not already in one
      if (!hasActiveTransaction) {
        await client.query('BEGIN');
      }

      const results: T[] = [];

      for (const item of data) {
        const keys = Object.keys(item as any);
        const values = Object.values(item as any);

        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const columns = keys.map(k => this.sanitizeIdentifier(k)).join(', ');

        const query = `INSERT INTO ${this.sanitizeIdentifier(table)} (${columns}) VALUES (${placeholders}) RETURNING *`;

        const result = await client.query<T>(query, values);
        results.push(result.rows[0]);
      }

      // Only commit if we started the transaction
      if (!hasActiveTransaction) {
        await client.query('COMMIT');
      }

      return createSuccessResult(results, results.length);
    } catch (err) {
      // Only rollback if we started the transaction
      if (!hasActiveTransaction) {
        await client.query('ROLLBACK');
      }

      const errorCode = mapPostgresError(err);
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to insert multiple records into table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, count: data.length }
      ));
    } finally {
      // Only release client if we acquired it (not using existing transaction client)
      if (!hasActiveTransaction) {
        client.release();
      }
    }
  }

  async update<T = any>(table: string, key: string, data: Partial<T>, transactionId?: string): Promise<OperationResult<T>> {
    this.ensureConnected();

    try {
      const keys = Object.keys(data as any);
      const values = Object.values(data as any);

      const setClauses = keys.map((k, i) => `${this.sanitizeIdentifier(k)} = $${i + 1}`).join(', ');

      const query = `UPDATE ${this.sanitizeIdentifier(table)} SET ${setClauses} WHERE id = $${keys.length + 1} RETURNING *`;

      const client = this.getQueryClient(transactionId);
      const result = await client.query<T>(query, [...values, key]);

      if (result.rowCount === 0) {
        return createFailedResult(createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Record not found in table: ${table}`,
          undefined,
          { table, key }
        ));
      }

      return createSuccessResult(result.rows[0], result.rowCount || 0);
    } catch (err) {
      const errorCode = mapPostgresError(err);
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to update record in table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, key, data }
      ));
    }
  }

  async delete(table: string, key: string, transactionId?: string): Promise<OperationResult<void>> {
    this.ensureConnected();

    try {
      const query = `DELETE FROM ${this.sanitizeIdentifier(table)} WHERE id = $1`;

      const client = this.getQueryClient(transactionId);
      const result = await client.query(query, [key]);

      if (result.rowCount === 0) {
        return createFailedResult(createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Record not found in table: ${table}`,
          undefined,
          { table, key }
        ));
      }

      return createSuccessResult(undefined, result.rowCount || 0);
    } catch (err) {
      const errorCode = mapPostgresError(err);
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to delete record from table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, key }
      ));
    }
  }

  async raw<T = any>(query: string, params?: any[], transactionId?: string): Promise<T> {
    this.ensureConnected();

    try {
      const client = this.getQueryClient(transactionId);
      const result = await client.query<T>(query, params);
      return result.rows as T;
    } catch (err) {
      const errorCode = mapPostgresError(err);
      throw createDatabaseError(
        errorCode,
        `Failed to execute raw query`,
        err instanceof Error ? err : new Error(String(err)),
        { query, params }
      );
    }
  }

  async beginTransaction(): Promise<TransactionContext> {
    this.ensureConnected();

    const client = await this.pool!.connect();

    const context: TransactionContext = {
      id: `postgres-tx-${Date.now()}`,
      databases: ['postgres'],
      startTime: new Date(),
      status: 'pending',
    };

    await client.query('BEGIN');
    this.transactions.set(context.id, { context, client });

    return context;
  }

  async prepareTransaction(context: TransactionContext): Promise<boolean> {
    const transaction = this.transactions.get(context.id);

    if (!transaction) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Transaction not found',
        undefined,
        { transactionId: context.id }
      );
    }

    try {
      // PostgreSQL supports PREPARE TRANSACTION for two-phase commit
      // Note: This requires max_prepared_transactions > 0 in postgresql.conf
      await transaction.client.query(`PREPARE TRANSACTION '${context.id}'`);
      context.status = 'prepared';
      context.preparedAt = new Date();
      return true;
    } catch (err) {
      // If prepare fails, the transaction is still active and can be rolled back
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Failed to prepare transaction',
        err instanceof Error ? err : new Error(String(err)),
        { transactionId: context.id }
      );
    }
  }

  async commitTransaction(context: TransactionContext): Promise<void> {
    const transaction = this.transactions.get(context.id);

    if (!transaction) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Transaction not found',
        undefined,
        { transactionId: context.id }
      );
    }

    try {
      // If transaction was prepared, use COMMIT PREPARED
      if (context.status === 'prepared') {
        await transaction.client.query(`COMMIT PREPARED '${context.id}'`);
      } else {
        await transaction.client.query('COMMIT');
      }
      context.status = 'committed';
    } finally {
      transaction.client.release();
      this.transactions.delete(context.id);
    }
  }

  async rollbackTransaction(context: TransactionContext): Promise<void> {
    const transaction = this.transactions.get(context.id);

    if (!transaction) {
      throw createDatabaseError(
        DatabaseErrorCode.TRANSACTION_FAILED,
        'Transaction not found',
        undefined,
        { transactionId: context.id }
      );
    }

    try {
      // If transaction was prepared, use ROLLBACK PREPARED
      if (context.status === 'prepared') {
        await transaction.client.query(`ROLLBACK PREPARED '${context.id}'`);
      } else {
        await transaction.client.query('ROLLBACK');
      }
      context.status = 'rolled_back';
    } finally {
      transaction.client.release();
      this.transactions.delete(context.id);
    }
  }

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Not connected to PostgreSQL',
        undefined,
        { config: this.config }
      );
    }
  }

  private sanitizeIdentifier(identifier: string): string {
    // Remove any characters that aren't alphanumeric or underscore
    return identifier.replace(/[^a-zA-Z0-9_]/g, '');
  }

  /**
   * Get client for query execution (transaction client if available, otherwise pool)
   */
  private getQueryClient(transactionId?: string): Pool | PoolClient {
    if (transactionId) {
      const transaction = this.transactions.get(transactionId);
      if (transaction) {
        return transaction.client;
      }
    }
    return this.pool!;
  }

  private buildWhereClause<T>(filter: QueryFilter<T>, params: any[]): string {
    const field = this.sanitizeIdentifier(String(filter.field));

    switch (filter.operator) {
      case 'eq': {
        const paramIndex = params.length + 1;
        params.push(filter.value);
        return `${field} = $${paramIndex}`;
      }
      case 'ne': {
        const paramIndex = params.length + 1;
        params.push(filter.value);
        return `${field} != $${paramIndex}`;
      }
      case 'gt': {
        const paramIndex = params.length + 1;
        params.push(filter.value);
        return `${field} > $${paramIndex}`;
      }
      case 'gte': {
        const paramIndex = params.length + 1;
        params.push(filter.value);
        return `${field} >= $${paramIndex}`;
      }
      case 'lt': {
        const paramIndex = params.length + 1;
        params.push(filter.value);
        return `${field} < $${paramIndex}`;
      }
      case 'lte': {
        const paramIndex = params.length + 1;
        params.push(filter.value);
        return `${field} <= $${paramIndex}`;
      }
      case 'in': {
        if (!Array.isArray(filter.value)) {
          throw new TypeError(`Field '${String(filter.field)}' with operator 'in' requires an array value`);
        }
        if (filter.value.length === 0) {
          // Empty IN list - return false condition without invalid SQL
          return '1=0';
        }
        const startIndex = params.length + 1;
        const placeholders = filter.value.map((_, i) => `$${startIndex + i}`).join(', ');
        params.push(...filter.value);
        return `${field} IN (${placeholders})`;
      }
      case 'like': {
        const paramIndex = params.length + 1;
        params.push(`%${filter.value}%`);
        return `${field} LIKE $${paramIndex}`;
      }
      case 'between': {
        if (!Array.isArray(filter.value)) {
          throw new TypeError(`Field '${String(filter.field)}' with operator 'between' requires an array value`);
        }
        if (filter.value.length !== 2) {
          throw new TypeError(`Field '${String(filter.field)}' with operator 'between' requires exactly 2 elements, got ${filter.value.length}`);
        }
        const paramIndex = params.length + 1;
        params.push(filter.value[0], filter.value[1]);
        return `${field} BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      }
      default:
        return '1=1';
    }
  }
}
