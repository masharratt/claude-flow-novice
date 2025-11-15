/**
 * Database Service Type Definitions
 *
 * Provides type-safe interfaces for database operations across Redis, SQLite, and PostgreSQL.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 */

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  type: 'redis' | 'sqlite' | 'postgres';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  connectionString?: string;
  poolSize?: number;
  timeout?: number;
}

/**
 * Query filter for read operations
 */
export interface QueryFilter<T = any> {
  field: keyof T;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'between';
  value: any;
}

/**
 * Query options for list operations
 */
export interface QueryOptions<T = any> {
  filters?: QueryFilter<T>[];
  limit?: number;
  offset?: number;
  orderBy?: keyof T;
  order?: 'asc' | 'desc';
}

/**
 * Transaction context
 */
export interface TransactionContext {
  id: string;
  databases: Array<'redis' | 'sqlite' | 'postgres'>;
  startTime: Date;
  status: 'pending' | 'committed' | 'rolled_back';
}

/**
 * Database operation result
 */
export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: DatabaseError;
  rowsAffected?: number;
  insertId?: string | number;
}

/**
 * Database error with context
 */
export interface DatabaseError {
  code: DatabaseErrorCode | string; // DatabaseErrorCode for known errors, string for custom errors
  message: string;
  originalError?: Error;
  query?: string;
  context?: Record<string, any>;
}

/**
 * Database error codes
 */
export enum DatabaseErrorCode {
  CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  QUERY_FAILED = 'DB_QUERY_FAILED',
  TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  VALIDATION_FAILED = 'DB_VALIDATION_FAILED',
  NOT_FOUND = 'DB_NOT_FOUND',
  DUPLICATE_KEY = 'DB_DUPLICATE_KEY',
  TIMEOUT = 'DB_TIMEOUT',
  CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',
  UNKNOWN_ERROR = 'DB_UNKNOWN_ERROR',
}

/**
 * Correlation key for cross-database lookups
 */
export interface CorrelationKey {
  type: 'task' | 'agent' | 'skill' | 'execution';
  id: string;
  entity?: string;
  subtype?: string;
}

/**
 * Cross-database query result
 */
export interface CrossDatabaseResult<T = any> {
  correlationKey: string;
  redis?: T;
  sqlite?: T;
  postgres?: T;
  timestamp: Date;
}

/**
 * Database adapter interface
 *
 * All database implementations must implement this interface
 */
export interface IDatabaseAdapter {
  /**
   * Get database type
   */
  getType(): 'redis' | 'sqlite' | 'postgres';

  /**
   * Connect to database
   */
  connect(): Promise<void>;

  /**
   * Disconnect from database
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * Get single record by key/id
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * List records with optional filtering
   */
  list<T = any>(table: string, options?: QueryOptions<T>): Promise<T[]>;

  /**
   * Query records with custom filter
   */
  query<T = any>(table: string, filters: QueryFilter<T>[]): Promise<T[]>;

  /**
   * Insert single record
   */
  insert<T = any>(table: string, data: T): Promise<OperationResult<T>>;

  /**
   * Insert multiple records atomically
   */
  insertMany<T = any>(table: string, data: T[]): Promise<OperationResult<T[]>>;

  /**
   * Update record by key/id
   */
  update<T = any>(table: string, key: string, data: Partial<T>): Promise<OperationResult<T>>;

  /**
   * Delete record by key/id
   */
  delete(table: string, key: string): Promise<OperationResult<void>>;

  /**
   * Execute raw query (use with caution)
   */
  raw<T = any>(query: string, params?: any[]): Promise<T>;

  /**
   * Begin transaction
   */
  beginTransaction(): Promise<TransactionContext>;

  /**
   * Commit transaction
   */
  commitTransaction(context: TransactionContext): Promise<void>;

  /**
   * Rollback transaction
   */
  rollbackTransaction(context: TransactionContext): Promise<void>;
}

/**
 * Database service interface
 *
 * Provides unified access to all database adapters
 */
export interface IDatabaseService {
  /**
   * Get adapter for specific database
   */
  getAdapter(type: 'redis' | 'sqlite' | 'postgres'): IDatabaseAdapter;

  /**
   * Get record by correlation key across all databases
   */
  getByCorrelationKey<T = any>(key: CorrelationKey): Promise<CrossDatabaseResult<T>>;

  /**
   * Execute cross-database transaction
   */
  executeTransaction<T = any>(
    operations: Array<{
      database: 'redis' | 'sqlite' | 'postgres';
      operation: (adapter: IDatabaseAdapter) => Promise<T>;
    }>
  ): Promise<T[]>;

  /**
   * Build correlation key
   */
  buildCorrelationKey(key: CorrelationKey): string;

  /**
   * Parse correlation key
   */
  parseCorrelationKey(key: string): CorrelationKey | null;
}

/**
 * Connection pool interface
 */
export interface IConnectionPool {
  /**
   * Acquire connection from pool
   */
  acquire(): Promise<any>;

  /**
   * Release connection back to pool
   */
  release(connection: any): void;

  /**
   * Get pool statistics
   */
  getStats(): {
    total: number;
    available: number;
    waiting: number;
  };

  /**
   * Close all connections
   */
  close(): Promise<void>;
}
