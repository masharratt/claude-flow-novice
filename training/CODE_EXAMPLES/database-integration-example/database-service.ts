import sqlite3 from 'sqlite3';
import pg from 'pg';
import { StandardError, ErrorCode } from '../../../src/lib/errors';

interface DatabaseConfig {
  sqlite?: {
    path: string;
  };
  postgres?: {
    host: string;
    port?: number;
    database: string;
    user?: string;
    password?: string;
    poolSize?: number;
    idleTimeout?: number;
  };
}

interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export class DatabaseService {
  private sqliteDb?: sqlite3.Database;
  private pgPool?: pg.Pool;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize database connections
   */
  async initialize(): Promise<void> {
    if (this.config.sqlite) {
      this.sqliteDb = new sqlite3.Database(
        this.config.sqlite.path,
        (err) => {
          if (err) {
            throw new StandardError(
              'Failed to connect to SQLite database',
              ErrorCode.DATABASE_CONNECTION_FAILED,
              { path: this.config.sqlite?.path },
              err
            );
          }
        }
      );
    }

    if (this.config.postgres) {
      this.pgPool = new pg.Pool({
        host: this.config.postgres.host,
        port: this.config.postgres.port || 5432,
        database: this.config.postgres.database,
        user: this.config.postgres.user || 'postgres',
        password: this.config.postgres.password,
        max: this.config.postgres.poolSize || 20,
        idleTimeoutMillis: this.config.postgres.idleTimeout || 30000,
      });

      // Test connection
      try {
        const client = await this.pgPool.connect();
        client.release();
      } catch (err) {
        throw new StandardError(
          'Failed to connect to PostgreSQL database',
          ErrorCode.DATABASE_CONNECTION_FAILED,
          {
            host: this.config.postgres.host,
            database: this.config.postgres.database
          },
          err
        );
      }
    }
  }

  /**
   * Execute a query on the specified database
   */
  async query<T = any>(
    database: 'sqlite' | 'postgres',
    sql: string,
    params: any[] = []
  ): Promise<T[]> {
    const start = Date.now();

    try {
      if (database === 'sqlite') {
        return await this.querySQLite<T>(sql, params);
      } else {
        return await this.queryPostgres<T>(sql, params);
      }
    } catch (error) {
      const duration = Date.now() - start;

      throw new StandardError(
        'Database query failed',
        ErrorCode.DATABASE_QUERY_FAILED,
        {
          database,
          sql: sql.substring(0, 100), // Truncate for logging
          paramCount: params.length,
          duration
        },
        error
      );
    }
  }

  /**
   * Execute operations within a transaction
   */
  async transaction<T>(
    database: 'sqlite' | 'postgres',
    callback: (db: DatabaseService) => Promise<T>
  ): Promise<T> {
    if (database === 'postgres') {
      return await this.transactionPostgres(callback);
    } else {
      return await this.transactionSQLite(callback);
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<{
    sqlite: boolean;
    postgres: boolean;
  }> {
    const health = {
      sqlite: false,
      postgres: false
    };

    if (this.sqliteDb) {
      try {
        await this.querySQLite('SELECT 1');
        health.sqlite = true;
      } catch (error) {
        health.sqlite = false;
      }
    }

    if (this.pgPool) {
      try {
        await this.queryPostgres('SELECT 1');
        health.postgres = true;
      } catch (error) {
        health.postgres = false;
      }
    }

    return health;
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    const closeOperations: Promise<void>[] = [];

    if (this.sqliteDb) {
      closeOperations.push(
        new Promise((resolve, reject) => {
          this.sqliteDb!.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        })
      );
    }

    if (this.pgPool) {
      closeOperations.push(this.pgPool.end());
    }

    try {
      await Promise.all(closeOperations);
    } catch (error) {
      throw new StandardError(
        'Failed to close database connections',
        ErrorCode.DATABASE_ERROR,
        {},
        error
      );
    }
  }

  // Private methods

  private async querySQLite<T>(sql: string, params: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.sqliteDb) {
        reject(new Error('SQLite database not initialized'));
        return;
      }

      this.sqliteDb.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  private async queryPostgres<T>(sql: string, params: any[]): Promise<T[]> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    const result = await this.pgPool.query(sql, params);
    return result.rows as T[];
  }

  private async transactionPostgres<T>(
    callback: (db: DatabaseService) => Promise<T>
  ): Promise<T> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    const client = await this.pgPool.connect();

    try {
      await client.query('BEGIN');

      // Create a temporary DatabaseService that uses this client
      const txDb = new DatabaseService(this.config);
      txDb.pgPool = { query: client.query.bind(client) } as any;

      const result = await callback(txDb);

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');

      throw new StandardError(
        'Transaction failed and was rolled back',
        ErrorCode.DATABASE_TRANSACTION_FAILED,
        { database: 'postgres' },
        error
      );
    } finally {
      client.release();
    }
  }

  private async transactionSQLite<T>(
    callback: (db: DatabaseService) => Promise<T>
  ): Promise<T> {
    if (!this.sqliteDb) {
      throw new Error('SQLite database not initialized');
    }

    return new Promise(async (resolve, reject) => {
      this.sqliteDb!.run('BEGIN TRANSACTION', async (err) => {
        if (err) {
          reject(new StandardError(
            'Failed to begin transaction',
            ErrorCode.DATABASE_TRANSACTION_FAILED,
            { database: 'sqlite' },
            err
          ));
          return;
        }

        try {
          const result = await callback(this);

          this.sqliteDb!.run('COMMIT', (commitErr) => {
            if (commitErr) {
              reject(new StandardError(
                'Failed to commit transaction',
                ErrorCode.DATABASE_TRANSACTION_FAILED,
                { database: 'sqlite' },
                commitErr
              ));
            } else {
              resolve(result);
            }
          });
        } catch (error) {
          this.sqliteDb!.run('ROLLBACK', (rollbackErr) => {
            if (rollbackErr) {
              reject(new StandardError(
                'Transaction failed and rollback also failed',
                ErrorCode.DATABASE_TRANSACTION_FAILED,
                { database: 'sqlite' },
                rollbackErr
              ));
            } else {
              reject(new StandardError(
                'Transaction failed and was rolled back',
                ErrorCode.DATABASE_TRANSACTION_FAILED,
                { database: 'sqlite' },
                error
              ));
            }
          });
        }
      });
    });
  }
}
