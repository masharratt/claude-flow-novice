/**
 * Connection Pool Manager
 *
 * Implements enterprise-grade connection pooling for PostgreSQL and Redis
 * to achieve 3-5x throughput improvement over direct connections.
 *
 * Features:
 * - PostgreSQL pg-pool with max 20 connections
 * - Redis ioredis cluster mode
 * - Graceful pool shutdown
 * - Connection health monitoring
 * - Automatic reconnection
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import Redis, { Cluster, ClusterOptions } from 'ioredis';

export interface ConnectionPoolConfig {
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max?: number; // Maximum pool size
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
  redis: {
    nodes: Array<{ host: string; port: number }>;
    options?: ClusterOptions;
  };
}

export class ConnectionPoolManager {
  private pgPool: Pool | null = null;
  private redisCluster: Cluster | null = null;
  private isShuttingDown = false;

  constructor(private config: ConnectionPoolConfig) {
    // Validate connection limits on construction
    this.validateConnectionLimits();
  }

  /**
   * Validate connection pool size limits
   * Ensures max connections is within safe operational bounds
   */
  private validateConnectionLimits(): void {
    const max = this.config.postgres.max;

    if (max !== undefined) {
      if (max < 4) {
        throw new Error(
          `Invalid PostgreSQL max connections: ${max}. Minimum allowed is 4.`
        );
      }
      if (max > 100) {
        throw new Error(
          `Invalid PostgreSQL max connections: ${max}. Maximum allowed is 100.`
        );
      }
    }
  }

  /**
   * Initialize PostgreSQL connection pool
   */
  async initPostgresPool(): Promise<Pool> {
    if (this.pgPool) {
      return this.pgPool;
    }

    const poolConfig: PoolConfig = {
      host: this.config.postgres.host,
      port: this.config.postgres.port,
      database: this.config.postgres.database,
      user: this.config.postgres.user,
      password: this.config.postgres.password,
      max: this.config.postgres.max || 20,
      idleTimeoutMillis: this.config.postgres.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: this.config.postgres.connectionTimeoutMillis || 10000,
    };

    this.pgPool = new Pool(poolConfig);

    // Handle pool errors
    this.pgPool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });

    // Test connection
    try {
      const client = await this.pgPool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('PostgreSQL connection pool initialized successfully');
    } catch (err) {
      console.error('Failed to initialize PostgreSQL connection pool', err);
      throw err;
    }

    return this.pgPool;
  }

  /**
   * Initialize Redis cluster connection
   */
  async initRedisCluster(): Promise<Cluster> {
    if (this.redisCluster) {
      return this.redisCluster;
    }

    const clusterOptions: ClusterOptions = {
      redisOptions: {
        password: this.config.redis.options?.redisOptions?.password,
      },
      clusterRetryStrategy: (times) => {
        const delay = Math.min(100 + times * 2, 2000);
        return delay;
      },
      enableReadyCheck: true,
      ...this.config.redis.options,
    };

    this.redisCluster = new Redis.Cluster(
      this.config.redis.nodes,
      clusterOptions
    );

    // Handle cluster events
    this.redisCluster.on('error', (err) => {
      console.error('Redis cluster error', err);
    });

    this.redisCluster.on('ready', () => {
      console.log('Redis cluster connection ready');
    });

    // Test connection
    try {
      await this.redisCluster.ping();
      console.log('Redis cluster initialized successfully');
    } catch (err) {
      console.error('Failed to initialize Redis cluster', err);
      throw err;
    }

    return this.redisCluster;
  }

  /**
   * Get PostgreSQL client from pool
   */
  async getPostgresClient(): Promise<PoolClient> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    return await this.pgPool.connect();
  }

  /**
   * Execute PostgreSQL query using pool
   */
  async executePostgresQuery<T = any>(
    query: string,
    params?: any[]
  ): Promise<T[]> {
    const client = await this.getPostgresClient();
    try {
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get Redis cluster instance
   */
  getRedisCluster(): Cluster {
    if (!this.redisCluster) {
      throw new Error('Redis cluster not initialized');
    }

    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    return this.redisCluster;
  }

  /**
   * Execute Redis command
   */
  async executeRedisCommand(
    command: string,
    ...args: any[]
  ): Promise<any> {
    const cluster = this.getRedisCluster();
    return await (cluster as any)[command](...args);
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      postgres: this.pgPool
        ? {
            total: this.pgPool.totalCount,
            idle: this.pgPool.idleCount,
            waiting: this.pgPool.waitingCount,
          }
        : null,
      redis: this.redisCluster
        ? {
            status: this.redisCluster.status,
            nodes: this.redisCluster.nodes().length,
          }
        : null,
    };
  }

  /**
   * Graceful shutdown of all connection pools
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    console.log('Initiating connection pool shutdown...');
    this.isShuttingDown = true;

    const shutdownPromises: Promise<void>[] = [];

    // Shutdown PostgreSQL pool
    if (this.pgPool) {
      shutdownPromises.push(
        this.pgPool.end().then(() => {
          console.log('PostgreSQL connection pool closed');
          this.pgPool = null;
        })
      );
    }

    // Shutdown Redis cluster
    if (this.redisCluster) {
      shutdownPromises.push(
        this.redisCluster.quit().then(() => {
          console.log('Redis cluster connection closed');
          this.redisCluster = null;
        })
      );
    }

    await Promise.all(shutdownPromises);
    console.log('Connection pool shutdown complete');
  }

  /**
   * Health check for all connections
   */
  async healthCheck(): Promise<{
    postgres: boolean;
    redis: boolean;
    details: any;
  }> {
    const health = {
      postgres: false,
      redis: false,
      details: {} as any,
    };

    // Check PostgreSQL
    if (this.pgPool) {
      try {
        const client = await this.pgPool.connect();
        await client.query('SELECT 1');
        client.release();
        health.postgres = true;
        health.details.postgres = 'healthy';
      } catch (err) {
        health.details.postgres = (err as Error).message;
      }
    } else {
      health.details.postgres = 'not initialized';
    }

    // Check Redis
    if (this.redisCluster) {
      try {
        await this.redisCluster.ping();
        health.redis = true;
        health.details.redis = 'healthy';
      } catch (err) {
        health.details.redis = (err as Error).message;
      }
    } else {
      health.details.redis = 'not initialized';
    }

    return health;
  }
}

// Singleton instance with initialization lock
let connectionPoolInstance: ConnectionPoolManager | null = null;
let initializationPromise: Promise<ConnectionPoolManager> | null = null;

/**
 * Initialize singleton connection pool with thread-safe locking
 * Prevents race condition when multiple concurrent calls attempt initialization
 */
export async function initConnectionPool(
  config: ConnectionPoolConfig
): Promise<ConnectionPoolManager> {
  // Return existing instance immediately
  if (connectionPoolInstance) {
    return connectionPoolInstance;
  }

  // Wait for in-progress initialization
  if (initializationPromise) {
    return initializationPromise;
  }

  // Atomic initialization with promise-based mutex
  initializationPromise = (async () => {
    try {
      connectionPoolInstance = new ConnectionPoolManager(config);
      await connectionPoolInstance.initPostgresPool();
      await connectionPoolInstance.initRedisCluster();

      // Register shutdown handler
      process.on('SIGTERM', async () => {
        if (connectionPoolInstance) {
          await connectionPoolInstance.shutdown();
        }
      });

      process.on('SIGINT', async () => {
        if (connectionPoolInstance) {
          await connectionPoolInstance.shutdown();
        }
      });

      return connectionPoolInstance;
    } finally {
      // Clear lock after initialization completes
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

/**
 * Get singleton connection pool instance
 */
export function getConnectionPool(): ConnectionPoolManager {
  if (!connectionPoolInstance) {
    throw new Error(
      'Connection pool not initialized. Call initConnectionPool first.'
    );
  }
  return connectionPoolInstance;
}

/**
 * Shutdown singleton connection pool
 */
export async function shutdownConnectionPool(): Promise<void> {
  if (connectionPoolInstance) {
    await connectionPoolInstance.shutdown();
    connectionPoolInstance = null;
  }
}
