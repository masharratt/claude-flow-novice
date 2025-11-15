/**
 * PostgreSQL Database Adapter
 *
 * Implements IDatabaseAdapter for PostgreSQL with connection pooling and parameterized queries.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
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
    try {
      this.pool = new Pool({
        connectionString: this.config.connectionString,
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        max: this.config.poolSize || 10,
        idleTimeoutMillis: this.config.timeout || 30000,
        connectionTimeoutMillis: 5000,
      });

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

  async get<T = any>(key: string): Promise<T | null> {
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
      const result = await this.pool!.query<T>(query, [id]);

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

  async list<T = any>(table: string, options?: QueryOptions<T>): Promise<T[]> {
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

      const result = await this.pool!.query<T>(query, params);
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

  async query<T = any>(table: string, filters: QueryFilter<T>[]): Promise<T[]> {
    return this.list(table, { filters });
  }

  async insert<T = any>(table: string, data: T): Promise<OperationResult<T>> {
    this.ensureConnected();

    try {
      const keys = Object.keys(data as any);
      const values = Object.values(data as any);

      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const columns = keys.map(k => this.sanitizeIdentifier(k)).join(', ');

      const query = `INSERT INTO ${this.sanitizeIdentifier(table)} (${columns}) VALUES (${placeholders}) RETURNING *`;

      const result = await this.pool!.query<T>(query, values);

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

  async insertMany<T = any>(table: string, data: T[]): Promise<OperationResult<T[]>> {
    this.ensureConnected();

    const client = await this.pool!.connect();

    try {
      await client.query('BEGIN');

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

      await client.query('COMMIT');

      return createSuccessResult(results, results.length);
    } catch (err) {
      await client.query('ROLLBACK');

      const errorCode = mapPostgresError(err);
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to insert multiple records into table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, count: data.length }
      ));
    } finally {
      client.release();
    }
  }

  async update<T = any>(table: string, key: string, data: Partial<T>): Promise<OperationResult<T>> {
    this.ensureConnected();

    try {
      const keys = Object.keys(data as any);
      const values = Object.values(data as any);

      const setClauses = keys.map((k, i) => `${this.sanitizeIdentifier(k)} = $${i + 1}`).join(', ');

      const query = `UPDATE ${this.sanitizeIdentifier(table)} SET ${setClauses} WHERE id = $${keys.length + 1} RETURNING *`;

      const result = await this.pool!.query<T>(query, [...values, key]);

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

  async delete(table: string, key: string): Promise<OperationResult<void>> {
    this.ensureConnected();

    try {
      const query = `DELETE FROM ${this.sanitizeIdentifier(table)} WHERE id = $1`;

      const result = await this.pool!.query(query, [key]);

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

  async raw<T = any>(query: string, params?: any[]): Promise<T> {
    this.ensureConnected();

    try {
      const result = await this.pool!.query<T>(query, params);
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
      await transaction.client.query('COMMIT');
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
      await transaction.client.query('ROLLBACK');
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
  private getQueryClient(): { client: Pool | PoolClient; isTransaction: boolean } {
    // Check if there's an active transaction for the current context
    // For now, we'll use the pool unless explicitly in a transaction
    // TODO: Add transaction context to method signatures or use async local storage
    return { client: this.pool!, isTransaction: false };
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
        if (!Array.isArray(filter.value) || filter.value.length === 0) {
          throw new Error(`'in' operator requires a non-empty array`);
        }
        const startIndex = params.length + 1;
        const values = filter.value as any[];
        const placeholders = values.map((_, i) => `$${startIndex + i}`).join(', ');
        params.push(...values);
        return `${field} IN (${placeholders})`;
      }
      case 'like': {
        const paramIndex = params.length + 1;
        params.push(`%${filter.value}%`);
        return `${field} LIKE $${paramIndex}`;
      }
      case 'between': {
        if (!Array.isArray(filter.value) || filter.value.length !== 2) {
          throw new Error(`'between' operator requires an array with exactly 2 elements`);
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
