// Stub: database-service main export
// Created to satisfy test imports

import { DatabaseAdapter, DatabaseConfig, Transaction } from './types';
import { SQLiteAdapter } from './sqlite-adapter';
import { RedisAdapter } from './redis-adapter';
import { PostgresAdapter } from './postgres-adapter';

export { DatabaseAdapter, DatabaseConfig, Transaction };
export { SQLiteAdapter, RedisAdapter, PostgresAdapter };

export class DatabaseService {
  private adapter: DatabaseAdapter;

  constructor(config: DatabaseConfig) {
    switch (config.type) {
      case 'sqlite':
        this.adapter = new SQLiteAdapter(config);
        break;
      case 'redis':
        this.adapter = new RedisAdapter(config);
        break;
      case 'postgres':
        this.adapter = new PostgresAdapter(config);
        break;
      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  async connect(): Promise<void> {
    return this.adapter.connect();
  }

  async disconnect(): Promise<void> {
    return this.adapter.disconnect();
  }

  async beginTransaction(): Promise<Transaction> {
    return this.adapter.beginTransaction();
  }

  async commitTransaction(tx: Transaction): Promise<void> {
    return this.adapter.commitTransaction(tx);
  }

  async rollbackTransaction(tx: Transaction): Promise<void> {
    return this.adapter.rollbackTransaction(tx);
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    return this.adapter.query(sql, params);
  }
}
