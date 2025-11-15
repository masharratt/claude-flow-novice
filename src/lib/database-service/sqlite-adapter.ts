/**
 * SQLite Database Adapter
 *
 * Implements IDatabaseAdapter for SQLite with prepared statements and connection pooling.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
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
  mapSQLiteError,
} from './errors';

export class SQLiteAdapter implements IDatabaseAdapter {
  private db: Database | null = null;
  private config: DatabaseConfig;
  private connected: boolean = false;
  private transactions: Map<string, TransactionContext> = new Map();

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  getType(): 'sqlite' {
    return 'sqlite';
  }

  async connect(): Promise<void> {
    try {
      const dbPath = this.config.database || this.config.connectionString || ':memory:';

      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
      });

      // Enable foreign keys
      await this.db.run('PRAGMA foreign_keys = ON');

      // Set busy timeout
      await this.db.run(`PRAGMA busy_timeout = ${this.config.timeout || 5000}`);

      this.connected = true;
    } catch (err) {
      throw createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Failed to connect to SQLite',
        err instanceof Error ? err : new Error(String(err)),
        { config: this.config }
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.db !== null;
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

      const query = `SELECT * FROM ${this.sanitizeIdentifier(table)} WHERE id = ?`;
      const result = await this.db!.get<T>(query, [id]);

      return result || null;
    } catch (err) {
      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
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

      const results = await this.db!.all<T[]>(query, params);
      return results;
    } catch (err) {
      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
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

      const placeholders = keys.map(() => '?').join(', ');
      const columns = keys.map(k => this.sanitizeIdentifier(k)).join(', ');

      const query = `INSERT INTO ${this.sanitizeIdentifier(table)} (${columns}) VALUES (${placeholders})`;

      const result = await this.db!.run(query, values);

      return createSuccessResult(data, result.changes, result.lastID);
    } catch (err) {
      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
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

    // Check if we're already in an active transaction (SQLite doesn't support nested transactions)
    const hasActiveTransaction = this.transactions.size > 0;

    try {
      // Only begin transaction if not already in one
      if (!hasActiveTransaction) {
        await this.db!.run('BEGIN TRANSACTION');
      }

      let totalChanges = 0;

      for (const item of data) {
        const keys = Object.keys(item as any);
        const values = Object.values(item as any);

        const placeholders = keys.map(() => '?').join(', ');
        const columns = keys.map(k => this.sanitizeIdentifier(k)).join(', ');

        const query = `INSERT INTO ${this.sanitizeIdentifier(table)} (${columns}) VALUES (${placeholders})`;

        const result = await this.db!.run(query, values);
        totalChanges += result.changes || 0;
      }

      // Only commit if we started the transaction
      if (!hasActiveTransaction) {
        await this.db!.run('COMMIT');
      }

      return createSuccessResult(data, totalChanges);
    } catch (err) {
      // Only rollback if we started the transaction
      if (!hasActiveTransaction) {
        await this.db!.run('ROLLBACK');
      }

      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
      return createFailedResult(createDatabaseError(
        errorCode,
        `Failed to insert multiple records into table: ${table}`,
        err instanceof Error ? err : new Error(String(err)),
        { table, count: data.length }
      ));
    }
  }

  async update<T = any>(table: string, key: string, data: Partial<T>): Promise<OperationResult<T>> {
    this.ensureConnected();

    try {
      const keys = Object.keys(data as any);
      const values = Object.values(data as any);

      const setClauses = keys.map(k => `${this.sanitizeIdentifier(k)} = ?`).join(', ');

      const query = `UPDATE ${this.sanitizeIdentifier(table)} SET ${setClauses} WHERE id = ?`;

      const result = await this.db!.run(query, [...values, key]);

      if (result.changes === 0) {
        return createFailedResult(createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Record not found in table: ${table}`,
          undefined,
          { table, key }
        ));
      }

      // Get updated record
      const updated = await this.get<T>(`${table}:${key}`);

      return createSuccessResult(updated!, result.changes);
    } catch (err) {
      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
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
      const query = `DELETE FROM ${this.sanitizeIdentifier(table)} WHERE id = ?`;

      const result = await this.db!.run(query, [key]);

      if (result.changes === 0) {
        return createFailedResult(createDatabaseError(
          DatabaseErrorCode.NOT_FOUND,
          `Record not found in table: ${table}`,
          undefined,
          { table, key }
        ));
      }

      return createSuccessResult(undefined, result.changes);
    } catch (err) {
      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
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
      // Determine if query is SELECT or modification
      const isSelect = query.trim().toUpperCase().startsWith('SELECT');

      if (isSelect) {
        const results = await this.db!.all<T[]>(query, params);
        return results as T;
      } else {
        const result = await this.db!.run(query, params);
        return result as T;
      }
    } catch (err) {
      const errorCode = mapSQLiteError(err instanceof Error ? err : new Error(String(err)));
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

    const context: TransactionContext = {
      id: `sqlite-tx-${Date.now()}`,
      databases: ['sqlite'],
      startTime: new Date(),
      status: 'pending',
    };

    await this.db!.run('BEGIN TRANSACTION');
    this.transactions.set(context.id, context);

    return context;
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

    try {
      await this.db!.run('COMMIT');
      context.status = 'committed';
    } finally {
      // Always cleanup transaction from map, even if commit fails
      this.transactions.delete(context.id);
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

    try {
      await this.db!.run('ROLLBACK');
      context.status = 'rolled_back';
    } finally {
      // Always cleanup transaction from map, even if rollback fails
      this.transactions.delete(context.id);
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
        const placeholders = (filter.value as any[]).map(() => '?').join(', ');
        params.push(...(filter.value as any[]));
        return `${field} IN (${placeholders})`;
      }
      case 'like': {
        params.push(`%${filter.value}%`);
        return `${field} LIKE ?`;
      }
      case 'between': {
        params.push(filter.value[0], filter.value[1]);
        return `${field} BETWEEN ? AND ?`;
      }
      default:
        return '1=1';
    }
  }
}
