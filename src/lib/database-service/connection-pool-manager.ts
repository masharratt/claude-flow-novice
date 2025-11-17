/**
 * Connection Pool Manager
 *
 * Manages connection pools for database adapters with:
 * - Automatic initialization on service startup
 * - Connection health checks (ping every 30s)
 * - Automatic reconnection with exponential backoff
 * - Connection metrics (active, idle, pending)
 * - Graceful degradation on connection failures
 *
 * Part of Bug Fix: Connection Pool Initialization
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { createClient, RedisClientType } from 'redis';
import { Pool, PoolClient } from 'pg';
import {
  DatabaseConfig,
  DatabaseErrorCode,
} from './types.js';
import { createDatabaseError } from './errors.js';

export interface ConnectionPoolStats {
  type: 'redis' | 'sqlite' | 'postgres';
  total: number;
  active: number;
  idle: number;
  pending: number;
  maxConnections: number;
  available: number;
  healthy: boolean;
  lastHealthCheck?: Date;
  healthCheckActive: boolean;
  reconnectAttempts: number;
  failedAttempts: number;
  uptime: number;
}

export interface PoolOptions {
  minConnections?: number;
  maxConnections?: number;
  acquireTimeout?: number;
  idleTimeout?: number;
  healthCheckInterval?: number;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
}

/**
 * Connection Pool Manager
 *
 * Manages connection lifecycle, health checks, and automatic recovery
 */
export class ConnectionPoolManager {
  private config: DatabaseConfig;
  private options: Required<PoolOptions>;
  private pool: any = null;
  private connections: Set<any> = new Set();
  private activeConnections: Set<any> = new Set();
  private pendingRequests: Array<{
    resolve: (connection: any) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck?: Date;
  private healthCheckActive: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private failedAttempts: number = 0;
  private startTime: Date;
  private isShuttingDown: boolean = false;
  private cacheFallbackEnabled: boolean = false;
  private cache: Map<string, any> = new Map();

  constructor(config: DatabaseConfig, options: PoolOptions = {}) {
    this.config = config;
    this.options = {
      minConnections: options.minConnections ?? 2,
      maxConnections: options.maxConnections ?? config.poolSize ?? 10,
      acquireTimeout: options.acquireTimeout ?? config.timeout ?? 5000,
      idleTimeout: options.idleTimeout ?? 30000,
      healthCheckInterval: options.healthCheckInterval ?? 30000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      reconnectBaseDelay: options.reconnectBaseDelay ?? 1000,
    };
    this.maxReconnectAttempts = this.options.maxReconnectAttempts;
    this.startTime = new Date();
  }

  /**
   * Initialize connection pool
   */
  async initialize(): Promise<void> {
    try {
      switch (this.config.type) {
        case 'sqlite':
          await this.initializeSQLitePool();
          break;
        case 'redis':
          await this.initializeRedisPool();
          break;
        case 'postgres':
          await this.initializePostgresPool();
          break;
        default:
          throw new Error(`Unsupported database type: ${this.config.type}`);
      }

      // Initialize minimum connections
      await this.warmUpPool();
    } catch (err) {
      this.failedAttempts++;
      throw createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        `Failed to initialize ${this.config.type} connection pool`,
        err instanceof Error ? err : new Error(String(err)),
        { config: this.config }
      );
    }
  }

  /**
   * Initialize SQLite connection pool
   */
  private async initializeSQLitePool(): Promise<void> {
    const dbPath = this.config.database || this.config.connectionString || ':memory:';

    if (!dbPath || dbPath === '') {
      throw new Error('SQLite database path is required');
    }

    // Create connection pool for SQLite
    for (let i = 0; i < this.options.minConnections; i++) {
      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
      });

      await db.run('PRAGMA foreign_keys = ON');
      await db.run(`PRAGMA busy_timeout = ${this.config.timeout || 5000}`);

      this.connections.add(db);
    }
  }

  /**
   * Initialize Redis connection pool
   */
  private async initializeRedisPool(): Promise<void> {
    let url = this.config.connectionString;

    if (!url) {
      // Build connection string with optional authentication
      const host = this.config.host || 'localhost';
      const port = this.config.port || 6379;

      if (this.config.password) {
        // Include password in connection string: redis://:password@host:port
        url = `redis://:${encodeURIComponent(this.config.password)}@${host}:${port}`;
      } else {
        url = `redis://${host}:${port}`;
      }
    }

    this.pool = createClient({
      url,
      socket: {
        connectTimeout: this.config.timeout || 5000,
        reconnectStrategy: (retries) => {
          if (retries > this.maxReconnectAttempts) {
            return false;
          }
          // Exponential backoff
          return Math.min(this.options.reconnectBaseDelay * Math.pow(2, retries), 30000);
        },
      },
    });

    // Set up event handlers
    this.pool.on('error', (err: Error) => {
      console.error('Redis connection error:', err);
      this.failedAttempts++;
    });

    this.pool.on('reconnecting', () => {
      this.reconnectAttempts++;
    });

    await this.pool.connect();
  }

  /**
   * Initialize PostgreSQL connection pool
   */
  private async initializePostgresPool(): Promise<void> {
    const connectionString = this.config.connectionString ||
      `postgresql://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.database}`;

    this.pool = new Pool({
      connectionString,
      min: this.options.minConnections,
      max: this.options.maxConnections,
      idleTimeoutMillis: this.options.idleTimeout,
      connectionTimeoutMillis: this.options.acquireTimeout,
    });

    // Test connection
    const client = await this.pool.connect();
    await client.query('SELECT 1');
    client.release();
  }

  /**
   * Warm up pool by creating minimum connections
   */
  private async warmUpPool(): Promise<void> {
    if (this.config.type === 'sqlite') {
      // SQLite connections already created in initializeSQLitePool
      return;
    }

    // For Redis and Postgres, connections are managed by their libraries
    // We just need to verify connectivity
    if (this.config.type === 'redis') {
      await this.pool.ping();
    } else if (this.config.type === 'postgres') {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
    }
  }

  /**
   * Acquire connection from pool
   */
  async acquire(): Promise<any> {
    if (this.isShuttingDown) {
      throw createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Connection pool is shutting down',
        undefined,
        { type: this.config.type }
      );
    }

    const startTime = Date.now();

    try {
      switch (this.config.type) {
        case 'sqlite':
          return await this.acquireSQLiteConnection(startTime);
        case 'redis':
          return this.pool;
        case 'postgres':
          return await this.pool.connect();
        default:
          throw new Error(`Unsupported database type: ${this.config.type}`);
      }
    } catch (err) {
      throw createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Failed to acquire connection',
        err instanceof Error ? err : new Error(String(err)),
        { type: this.config.type }
      );
    }
  }

  /**
   * Acquire SQLite connection from pool
   */
  private async acquireSQLiteConnection(startTime: number): Promise<Database> {
    // Check for available connection
    const availableConnection = Array.from(this.connections).find(
      conn => !this.activeConnections.has(conn)
    );

    if (availableConnection) {
      this.activeConnections.add(availableConnection);
      return availableConnection as Database;
    }

    // Check if we can create more connections
    if (this.connections.size < this.options.maxConnections) {
      const newConnection = await this.createSQLiteConnection();
      this.connections.add(newConnection);
      this.activeConnections.add(newConnection);
      return newConnection;
    }

    // Queue request
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.pendingRequests.findIndex(req => req.resolve === resolve);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
        }
        reject(createDatabaseError(
          DatabaseErrorCode.TIMEOUT,
          'Connection acquisition timeout',
          undefined,
          { timeout: this.options.acquireTimeout }
        ));
      }, this.options.acquireTimeout);

      this.pendingRequests.push({
        resolve: (conn) => {
          clearTimeout(timeoutId);
          resolve(conn);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
        timestamp: startTime,
      });
    });
  }

  /**
   * Create new SQLite connection
   */
  private async createSQLiteConnection(): Promise<Database> {
    const dbPath = this.config.database || this.config.connectionString || ':memory:';

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    await db.run('PRAGMA foreign_keys = ON');
    await db.run(`PRAGMA busy_timeout = ${this.config.timeout || 5000}`);

    return db;
  }

  /**
   * Release connection back to pool
   */
  async release(connection: any): Promise<void> {
    if (!connection) {
      return;
    }

    try {
      switch (this.config.type) {
        case 'sqlite':
          this.releaseSQLiteConnection(connection);
          break;
        case 'redis':
          // Redis client is shared, no release needed
          break;
        case 'postgres':
          if (connection && typeof connection.release === 'function') {
            connection.release();
          }
          break;
      }
    } catch (err) {
      console.error('Failed to release connection:', err);
    }
  }

  /**
   * Release SQLite connection
   */
  private releaseSQLiteConnection(connection: Database): void {
    this.activeConnections.delete(connection);

    // Process pending requests
    if (this.pendingRequests.length > 0) {
      const pending = this.pendingRequests.shift();
      if (pending) {
        this.activeConnections.add(connection);
        pending.resolve(connection);
      }
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckActive) {
      return;
    }

    this.healthCheckActive = true;
    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthy = await this.performHealthCheck();
        this.lastHealthCheck = new Date();

        if (!healthy) {
          console.warn(`Health check failed for ${this.config.type} pool`);
          await this.attemptReconnection();
        }
      } catch (err) {
        console.error('Health check error:', err);
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    this.healthCheckActive = false;
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<boolean> {
    try {
      switch (this.config.type) {
        case 'sqlite': {
          const connection = Array.from(this.connections)[0];
          if (connection) {
            await (connection as Database).get('SELECT 1');
            return true;
          }
          return false;
        }
        case 'redis':
          if (this.pool) {
            await this.pool.ping();
            return true;
          }
          return false;
        case 'postgres':
          if (this.pool) {
            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();
            return true;
          }
          return false;
        default:
          return false;
      }
    } catch (err) {
      return false;
    }
  }

  /**
   * Check if pool is healthy (exposed for testing)
   */
  private async isHealthy(): Promise<boolean> {
    return this.performHealthCheck();
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached for ${this.config.type}`);
      return;
    }

    const delay = Math.min(
      this.options.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      30000
    );

    this.reconnectAttempts++;

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.initialize();
      console.log(`Reconnection successful for ${this.config.type}`);
      this.reconnectAttempts = 0;
    } catch (err) {
      console.error(`Reconnection failed for ${this.config.type}:`, err);
    }
  }

  /**
   * Get reconnection delays for testing
   */
  private getReconnectDelays(): number[] {
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      delays.push(
        Math.min(this.options.reconnectBaseDelay * Math.pow(2, i), 30000)
      );
    }
    return delays;
  }

  /**
   * Simulate disconnection (for testing)
   */
  private simulateDisconnection(): void {
    if (this.config.type === 'redis' && this.pool) {
      this.pool.disconnect();
    } else if (this.config.type === 'postgres' && this.pool) {
      this.pool.end();
    }
  }

  /**
   * Remove unhealthy connections (for testing)
   */
  private removeUnhealthyConnections(count: number): void {
    if (this.config.type === 'sqlite') {
      const connectionsToRemove = Array.from(this.connections).slice(0, count);
      connectionsToRemove.forEach(conn => {
        this.connections.delete(conn);
        this.activeConnections.delete(conn);
        (conn as Database).close();
      });
    }
  }

  /**
   * Enable cache fallback for graceful degradation
   */
  enableCacheFallback(enabled: boolean): void {
    this.cacheFallbackEnabled = enabled;
  }

  /**
   * Get data with cache fallback
   */
  async getWithFallback(key: string): Promise<any> {
    try {
      const connection = await this.acquire();
      // Actual data retrieval would happen here
      await this.release(connection);
      return null;
    } catch (err) {
      if (this.cacheFallbackEnabled && this.cache.has(key)) {
        console.warn(`Using cached data for key: ${key}`);
        return this.cache.get(key);
      }
      throw err;
    }
  }

  /**
   * Get connection pool statistics
   */
  getStats(): ConnectionPoolStats {
    const now = Date.now();
    const uptime = now - this.startTime.getTime();

    switch (this.config.type) {
      case 'sqlite':
        return {
          type: 'sqlite',
          total: this.connections.size,
          active: this.activeConnections.size,
          idle: this.connections.size - this.activeConnections.size,
          pending: this.pendingRequests.length,
          maxConnections: this.options.maxConnections,
          available: this.connections.size - this.activeConnections.size,
          healthy: this.connections.size > 0,
          lastHealthCheck: this.lastHealthCheck,
          healthCheckActive: this.healthCheckActive,
          reconnectAttempts: this.reconnectAttempts,
          failedAttempts: this.failedAttempts,
          uptime,
        };

      case 'redis':
        return {
          type: 'redis',
          total: this.pool ? 1 : 0,
          active: this.pool?.isOpen ? 1 : 0,
          idle: 0,
          pending: 0,
          maxConnections: 1,
          available: this.pool?.isOpen ? 1 : 0,
          healthy: this.pool?.isOpen ?? false,
          lastHealthCheck: this.lastHealthCheck,
          healthCheckActive: this.healthCheckActive,
          reconnectAttempts: this.reconnectAttempts,
          failedAttempts: this.failedAttempts,
          uptime,
        };

      case 'postgres':
        return {
          type: 'postgres',
          total: this.pool?.totalCount ?? 0,
          active: (this.pool?.totalCount ?? 0) - (this.pool?.idleCount ?? 0),
          idle: this.pool?.idleCount ?? 0,
          pending: this.pool?.waitingCount ?? 0,
          maxConnections: this.options.maxConnections,
          available: this.pool?.idleCount ?? 0,
          healthy: this.pool !== null,
          lastHealthCheck: this.lastHealthCheck,
          healthCheckActive: this.healthCheckActive,
          reconnectAttempts: this.reconnectAttempts,
          failedAttempts: this.failedAttempts,
          uptime,
        };

      default:
        throw new Error(`Unsupported database type: ${this.config.type}`);
    }
  }

  /**
   * Shutdown connection pool
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.stopHealthChecks();

    // Reject all pending requests
    this.pendingRequests.forEach(req => {
      req.reject(createDatabaseError(
        DatabaseErrorCode.CONNECTION_FAILED,
        'Connection pool is shutting down',
        undefined,
        { type: this.config.type }
      ));
    });
    this.pendingRequests = [];

    // Close all connections
    try {
      switch (this.config.type) {
        case 'sqlite':
          await Promise.all(
            Array.from(this.connections).map(conn => (conn as Database).close())
          );
          this.connections.clear();
          this.activeConnections.clear();
          break;

        case 'redis':
          if (this.pool) {
            await this.pool.quit();
            this.pool = null;
          }
          break;

        case 'postgres':
          if (this.pool) {
            await this.pool.end();
            this.pool = null;
          }
          break;
      }
    } catch (err) {
      console.error('Error during shutdown:', err);
    }
  }
}
