// Stub: database-service types
// Created to satisfy test imports

export interface DatabaseConfig {
  type: 'sqlite' | 'redis' | 'postgres';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  filename?: string;
}

export interface Transaction {
  id: string;
  status: 'pending' | 'committed' | 'rolled_back';
  metadata?: Record<string, unknown>;
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  beginTransaction(): Promise<Transaction>;
  commitTransaction(tx: Transaction): Promise<void>;
  rollbackTransaction(tx: Transaction): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
}

export interface QueryResult {
  rows: unknown[];
  rowCount: number;
  fields?: unknown[];
}

export class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}
