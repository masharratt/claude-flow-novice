/**
 * DatabaseHandoff.ts - Standard database handoff patterns with cross-database correlation
 *
 * Features:
 * - Cross-database correlation via task_id
 * - Transaction management (begin/commit/rollback)
 * - Query builder with standard correlation
 * - Connection pooling (PostgreSQL, SQLite)
 * - Automatic retry on transient failures
 */

import { Pool as PgPool, PoolClient, QueryResult } from 'pg';
import sqlite3 from 'sqlite3';
import { Database as SqliteDB } from 'sqlite';
import { StandardAdapter, Logger, JSONLogger } from './StandardAdapter';

/**
 * Standard handoff record structure
 */
export interface HandoffRecord {
  /** Unique handoff ID */
  handoff_id: string;
  /** Task correlation ID */
  task_id: string;
  /** Source agent ID */
  source_agent_id: string;
  /** Target agent ID (if known) */
  target_agent_id?: string;
  /** Handoff status: pending, in_progress, completed, failed */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** Handoff payload (JSON) */
  payload: Record<string, unknown>;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  created_at: Date;
  /** Update timestamp */
  updated_at: Date;
  /** Completion timestamp */
  completed_at?: Date;
}

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  type: 'postgresql' | 'sqlite';
  /** PostgreSQL connection config */
  pg?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max_connections?: number;
  };
  /** SQLite connection config */
  sqlite?: {
    filepath: string;
    mode?: number;
  };
}

/**
 * Transaction context for safe rollback
 */
interface TransactionContext {
  client?: PoolClient;
  in_transaction: boolean;
}

/**
 * DatabaseHandoff - Reference implementation for cross-database correlation
 *
 * @example
 * ```typescript
 * // PostgreSQL example
 * const pgHandoff = new DatabaseHandoff({
 *   type: 'postgresql',
 *   pg: {
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'cfn_db',
 *     user: 'cfn_user',
 *     password: 'secret',
 *   },
 * }, {
 *   task_id: 'task-123',
 *   agent_id: 'agent-456',
 * });
 *
 * await pgHandoff.initialize();
 *
 * // Create handoff with automatic correlation
 * const handoff = await pgHandoff.createHandoff({
 *   source_agent_id: 'agent-456',
 *   target_agent_id: 'agent-789',
 *   payload: { data: 'example' },
 * });
 *
 * // Query by task_id (cross-database correlation)
 * const handoffs = await pgHandoff.getHandoffsByTaskId('task-123');
 *
 * // Transaction example
 * await pgHandoff.withTransaction(async (tx) => {
 *   await tx.query('INSERT INTO tasks ...');
 *   await tx.query('UPDATE agents ...');
 *   // Automatic commit on success, rollback on error
 * });
 * ```
 */
export class DatabaseHandoff {
  private config: DatabaseConfig;
  private adapter: StandardAdapter;
  private logger: Logger;

  // Connection pools
  private pg_pool?: PgPool;
  private sqlite_db?: SqliteDB;

  // Initialization state
  private initialized = false;

  constructor(
    config: DatabaseConfig,
    context: { task_id: string; agent_id?: string; logger?: Logger }
  ) {
    this.config = config;
    this.logger = context.logger || new JSONLogger();
    this.adapter = new StandardAdapter({
      task_id: context.task_id,
      agent_id: context.agent_id,
      logger: this.logger,
    });
  }

  /**
   * Initialize database connection and schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      if (this.config.type === 'postgresql') {
        await this.initializePostgreSQL();
      } else if (this.config.type === 'sqlite') {
        await this.initializeSQLite();
      } else {
        throw new Error(`Unsupported database type: ${this.config.type}`);
      }

      await this.ensureSchema();
      this.initialized = true;

      this.logger.info('Database handoff initialized', {
        task_id: this.adapter.getContext().task_id,
        database_type: this.config.type,
      });
    } catch (error) {
      this.logger.error('Failed to initialize database', {
        task_id: this.adapter.getContext().task_id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a new handoff record
   */
  async createHandoff(params: {
    source_agent_id: string;
    target_agent_id?: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<HandoffRecord> {
    this.ensureInitialized();

    const handoff_id = this.generateHandoffId();
    const { task_id } = this.adapter.getContext();

    const handoff: HandoffRecord = {
      handoff_id,
      task_id,
      source_agent_id: params.source_agent_id,
      target_agent_id: params.target_agent_id,
      status: 'pending',
      payload: params.payload,
      metadata: params.metadata,
      created_at: new Date(),
      updated_at: new Date(),
    };

    return await this.adapter.withRetry(async () => {
      if (this.config.type === 'postgresql') {
        return await this.createHandoffPostgreSQL(handoff);
      } else {
        return await this.createHandoffSQLite(handoff);
      }
    });
  }

  /**
   * Get handoff by ID
   */
  async getHandoff(handoff_id: string): Promise<HandoffRecord | null> {
    this.ensureInitialized();

    return await this.adapter.withRetry(async () => {
      if (this.config.type === 'postgresql') {
        return await this.getHandoffPostgreSQL(handoff_id);
      } else {
        return await this.getHandoffSQLite(handoff_id);
      }
    });
  }

  /**
   * Get all handoffs for a task (cross-database correlation)
   */
  async getHandoffsByTaskId(task_id: string): Promise<HandoffRecord[]> {
    this.ensureInitialized();

    return await this.adapter.withRetry(async () => {
      if (this.config.type === 'postgresql') {
        return await this.getHandoffsByTaskIdPostgreSQL(task_id);
      } else {
        return await this.getHandoffsByTaskIdSQLite(task_id);
      }
    });
  }

  /**
   * Update handoff status
   */
  async updateHandoffStatus(
    handoff_id: string,
    status: HandoffRecord['status'],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.ensureInitialized();

    await this.adapter.withRetry(async () => {
      if (this.config.type === 'postgresql') {
        await this.updateHandoffStatusPostgreSQL(handoff_id, status, metadata);
      } else {
        await this.updateHandoffStatusSQLite(handoff_id, status, metadata);
      }
    });

    this.logger.info('Handoff status updated', {
      handoff_id,
      status,
      task_id: this.adapter.getContext().task_id,
    });
  }

  /**
   * Execute queries within a transaction
   * Automatically commits on success, rolls back on error
   */
  async withTransaction<T>(
    callback: (tx: TransactionClient) => Promise<T>
  ): Promise<T> {
    this.ensureInitialized();

    if (this.config.type === 'postgresql') {
      return await this.withTransactionPostgreSQL(callback);
    } else {
      return await this.withTransactionSQLite(callback);
    }
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    try {
      if (this.pg_pool) {
        await this.pg_pool.end();
        this.logger.info('PostgreSQL connection pool closed');
      }

      if (this.sqlite_db) {
        await this.sqlite_db.close();
        this.logger.info('SQLite connection closed');
      }

      this.initialized = false;
    } catch (error) {
      this.logger.error('Error closing database connections', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // --- PostgreSQL Implementation ---

  private async initializePostgreSQL(): Promise<void> {
    if (!this.config.pg) {
      throw new Error('PostgreSQL configuration missing');
    }

    this.pg_pool = new PgPool({
      host: this.config.pg.host,
      port: this.config.pg.port,
      database: this.config.pg.database,
      user: this.config.pg.user,
      password: this.config.pg.password,
      max: this.config.pg.max_connections || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Test connection
    const client = await this.pg_pool.connect();
    client.release();
  }

  private async createHandoffPostgreSQL(handoff: HandoffRecord): Promise<HandoffRecord> {
    const query = `
      INSERT INTO handoffs (
        handoff_id, task_id, source_agent_id, target_agent_id,
        status, payload, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      handoff.handoff_id,
      handoff.task_id,
      handoff.source_agent_id,
      handoff.target_agent_id || null,
      handoff.status,
      JSON.stringify(handoff.payload),
      handoff.metadata ? JSON.stringify(handoff.metadata) : null,
      handoff.created_at,
      handoff.updated_at,
    ];

    const result = await this.pg_pool!.query(query, values);
    return this.rowToHandoff(result.rows[0]);
  }

  private async getHandoffPostgreSQL(handoff_id: string): Promise<HandoffRecord | null> {
    const query = 'SELECT * FROM handoffs WHERE handoff_id = $1';
    const result = await this.pg_pool!.query(query, [handoff_id]);
    return result.rows.length > 0 ? this.rowToHandoff(result.rows[0]) : null;
  }

  private async getHandoffsByTaskIdPostgreSQL(task_id: string): Promise<HandoffRecord[]> {
    const query = 'SELECT * FROM handoffs WHERE task_id = $1 ORDER BY created_at DESC';
    const result = await this.pg_pool!.query(query, [task_id]);
    return result.rows.map(row => this.rowToHandoff(row));
  }

  private async updateHandoffStatusPostgreSQL(
    handoff_id: string,
    status: HandoffRecord['status'],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const updates: string[] = ['status = $2', 'updated_at = $3'];
    const values: any[] = [handoff_id, status, new Date()];

    if (status === 'completed') {
      updates.push('completed_at = $4');
      values.push(new Date());
    }

    if (metadata) {
      const idx = values.length + 1;
      updates.push(`metadata = $${idx}`);
      values.push(JSON.stringify(metadata));
    }

    const query = `UPDATE handoffs SET ${updates.join(', ')} WHERE handoff_id = $1`;
    await this.pg_pool!.query(query, values);
  }

  private async withTransactionPostgreSQL<T>(
    callback: (tx: TransactionClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pg_pool!.connect();

    try {
      await client.query('BEGIN');
      this.logger.debug('Transaction started (PostgreSQL)');

      const tx = new TransactionClient(client, this.logger);
      const result = await callback(tx);

      await client.query('COMMIT');
      this.logger.debug('Transaction committed (PostgreSQL)');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.warn('Transaction rolled back (PostgreSQL)', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // --- SQLite Implementation ---

  private async initializeSQLite(): Promise<void> {
    if (!this.config.sqlite) {
      throw new Error('SQLite configuration missing');
    }

    const sqlite = await import('sqlite');
    this.sqlite_db = await sqlite.open({
      filename: this.config.sqlite.filepath,
      driver: sqlite3.Database,
    });
  }

  private async createHandoffSQLite(handoff: HandoffRecord): Promise<HandoffRecord> {
    const query = `
      INSERT INTO handoffs (
        handoff_id, task_id, source_agent_id, target_agent_id,
        status, payload, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.sqlite_db!.run(query, [
      handoff.handoff_id,
      handoff.task_id,
      handoff.source_agent_id,
      handoff.target_agent_id || null,
      handoff.status,
      JSON.stringify(handoff.payload),
      handoff.metadata ? JSON.stringify(handoff.metadata) : null,
      handoff.created_at.toISOString(),
      handoff.updated_at.toISOString(),
    ]);

    return handoff;
  }

  private async getHandoffSQLite(handoff_id: string): Promise<HandoffRecord | null> {
    const query = 'SELECT * FROM handoffs WHERE handoff_id = ?';
    const row = await this.sqlite_db!.get(query, [handoff_id]);
    return row ? this.rowToHandoff(row) : null;
  }

  private async getHandoffsByTaskIdSQLite(task_id: string): Promise<HandoffRecord[]> {
    const query = 'SELECT * FROM handoffs WHERE task_id = ? ORDER BY created_at DESC';
    const rows = await this.sqlite_db!.all(query, [task_id]);
    return rows.map(row => this.rowToHandoff(row));
  }

  private async updateHandoffStatusSQLite(
    handoff_id: string,
    status: HandoffRecord['status'],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    let query = 'UPDATE handoffs SET status = ?, updated_at = ?';
    const values: any[] = [status, new Date().toISOString()];

    if (status === 'completed') {
      query += ', completed_at = ?';
      values.push(new Date().toISOString());
    }

    if (metadata) {
      query += ', metadata = ?';
      values.push(JSON.stringify(metadata));
    }

    query += ' WHERE handoff_id = ?';
    values.push(handoff_id);

    await this.sqlite_db!.run(query, values);
  }

  private async withTransactionSQLite<T>(
    callback: (tx: TransactionClient) => Promise<T>
  ): Promise<T> {
    try {
      await this.sqlite_db!.run('BEGIN TRANSACTION');
      this.logger.debug('Transaction started (SQLite)');

      const tx = new TransactionClient(this.sqlite_db!, this.logger);
      const result = await callback(tx);

      await this.sqlite_db!.run('COMMIT');
      this.logger.debug('Transaction committed (SQLite)');

      return result;
    } catch (error) {
      await this.sqlite_db!.run('ROLLBACK');
      this.logger.warn('Transaction rolled back (SQLite)', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // --- Schema Management ---

  private async ensureSchema(): Promise<void> {
    const schema = `
      CREATE TABLE IF NOT EXISTS handoffs (
        handoff_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        source_agent_id TEXT NOT NULL,
        target_agent_id TEXT,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_handoffs_task_id ON handoffs(task_id);
      CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
      CREATE INDEX IF NOT EXISTS idx_handoffs_created_at ON handoffs(created_at);
    `;

    if (this.config.type === 'postgresql') {
      // PostgreSQL schema (adjust types)
      const pgSchema = schema
        .replace(/TEXT/g, 'VARCHAR(255)')
        .replace(/payload VARCHAR\(255\)/g, 'payload JSONB')
        .replace(/metadata VARCHAR\(255\)/g, 'metadata JSONB')
        .replace(/created_at VARCHAR\(255\)/g, 'created_at TIMESTAMP')
        .replace(/updated_at VARCHAR\(255\)/g, 'updated_at TIMESTAMP')
        .replace(/completed_at VARCHAR\(255\)/g, 'completed_at TIMESTAMP');

      const statements = pgSchema.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        await this.pg_pool!.query(stmt);
      }
    } else {
      // SQLite schema
      const statements = schema.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        await this.sqlite_db!.run(stmt);
      }
    }
  }

  // --- Helper Methods ---

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DatabaseHandoff not initialized. Call initialize() first.');
    }
  }

  private generateHandoffId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `handoff-${timestamp}-${random}`;
  }

  private rowToHandoff(row: any): HandoffRecord {
    return {
      handoff_id: row.handoff_id,
      task_id: row.task_id,
      source_agent_id: row.source_agent_id,
      target_agent_id: row.target_agent_id,
      status: row.status,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      metadata: row.metadata
        ? typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata
        : undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }
}

/**
 * Transaction client for safe query execution within transactions
 */
export class TransactionClient {
  constructor(
    private client: PoolClient | SqliteDB,
    private logger: Logger
  ) {}

  async query(sql: string, params?: any[]): Promise<any> {
    this.logger.debug('Executing query in transaction', { sql });

    if ('query' in this.client) {
      // PostgreSQL
      const result = await this.client.query(sql, params);
      return result;
    } else {
      // SQLite
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return await this.client.all(sql, params);
      } else {
        return await this.client.run(sql, params);
      }
    }
  }
}

/**
 * USAGE EXAMPLE - Before (Ad-hoc database access):
 *
 * ```typescript
 * // ❌ No correlation, no transaction safety, manual connection management
 * import { Pool } from 'pg';
 *
 * const pool = new Pool({ ... });
 *
 * async function createTask(data: any) {
 *   const client = await pool.connect();
 *   try {
 *     await client.query('BEGIN');
 *     await client.query('INSERT INTO tasks ...');
 *     await client.query('INSERT INTO task_metadata ...');
 *     await client.query('COMMIT');
 *   } catch (err) {
 *     await client.query('ROLLBACK');
 *     throw err;
 *   } finally {
 *     client.release();
 *   }
 * }
 * ```
 *
 * USAGE EXAMPLE - After (Standardized with correlation):
 *
 * ```typescript
 * // ✅ Automatic correlation, transaction safety, retry logic
 * const handoff = new DatabaseHandoff({
 *   type: 'postgresql',
 *   pg: { host: 'localhost', port: 5432, database: 'cfn', user: 'user', password: 'pass' },
 * }, {
 *   task_id: 'task-123',
 *   agent_id: 'agent-456',
 * });
 *
 * await handoff.initialize();
 *
 * async function createTask(data: any) {
 *   await handoff.withTransaction(async (tx) => {
 *     await tx.query('INSERT INTO tasks (task_id, data) VALUES ($1, $2)', ['task-123', data]);
 *     await tx.query('INSERT INTO task_metadata (task_id, source) VALUES ($1, $2)', ['task-123', 'agent-456']);
 *     // Auto-commit on success, auto-rollback on error
 *   });
 * }
 * ```
 */
