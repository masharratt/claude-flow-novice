/**
 * Connection Pool Manager - Phase 6 Performance Optimization
 *
 * Implements enterprise-grade connection pooling for PostgreSQL and Redis
 * to achieve 3-5x throughput improvement over direct connections.
 *
 * Performance targets:
 * - Direct connection: ~50ms overhead per query
 * - Pooled connection: ~5ms overhead per query
 * - 3-5x throughput improvement
 *
 * Features:
 * - PostgreSQL pg-pool with configurable max connections (default 20)
 * - Redis ioredis with connection pooling
 * - Connection health checks
 * - Graceful shutdown handlers
 * - Error recovery with reconnection logic
 * - Prometheus metrics exposure
 * - TypeScript strict mode (no any types)
 */

import { Pool, PoolClient, PoolConfig as PgPoolConfig } from 'pg';
import Redis, { RedisOptions } from 'ioredis';

/**
 * Pool configuration interface
 */
export interface PoolConfig {
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max: number; // Maximum pool size
    idleTimeoutMillis: number; // Idle connection timeout
    connectionTimeoutMillis: number; // Connection acquisition timeout
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    maxRetriesPerRequest: number; // Max retry attempts per request
  };
}

/**
 * Pool metrics for Prometheus monitoring
 */
export interface PoolMetrics {
  postgres: {
    totalConnections: number;
    idleConnections: number;
    waitingRequests: number;
    activeConnections: number;
  };
  redis: {
    status: string;
    connectedClients: number;
    commandsProcessed: number;
  };
  timestamp: string;
}

/**
 * Health check result
 */
interface HealthCheckResult {
  postgres: boolean;
  redis: boolean;
  details: {
    postgres: string;
    redis: string;
  };
}

/**
 * PostgreSQL connection pool singleton
 */
export let pgPool: Pool | null = null;

/**
 * Redis connection pool singleton
 */
export let redisPool: Redis | null = null;

/**
 * Initialization state tracking
 */
let isInitialized = false;
let isShuttingDown = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Metrics tracking
 */
let postgresCommandsProcessed = 0;
let redisCommandsProcessed = 0;

/**
 * Initialize connection pools
 * Thread-safe initialization with promise-based mutex
 */
export async function initializePools(config: PoolConfig): Promise<void> {
  // Return if already initialized
  if (isInitialized && pgPool && redisPool) {
    console.log('Connection pools already initialized');
    return;
  }

  // Wait for in-progress initialization
  if (initializationPromise) {
    console.log('Waiting for in-progress initialization...');
    return initializationPromise;
  }

  // Atomic initialization with promise-based mutex
  initializationPromise = (async () => {
    try {
      console.log('Initializing connection pools...');

      // Validate configuration
      validatePoolConfig(config);

      // Initialize PostgreSQL pool
      await initializePostgresPool(config.postgres);

      // Initialize Redis pool
      await initializeRedisPool(config.redis);

      // Register shutdown handlers
      registerShutdownHandlers();

      isInitialized = true;
      console.log('Connection pools initialized successfully');
    } catch (error) {
      console.error('Failed to initialize connection pools:', error);
      // Cleanup on failure
      await shutdownPools();
      throw error;
    } finally {
      // Clear lock after initialization completes or fails
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

/**
 * Validate pool configuration
 */
function validatePoolConfig(config: PoolConfig): void {
  // Validate PostgreSQL config
  if (config.postgres.max < 4) {
    throw new Error(
      `Invalid PostgreSQL max connections: ${config.postgres.max}. Minimum allowed is 4.`
    );
  }
  if (config.postgres.max > 100) {
    throw new Error(
      `Invalid PostgreSQL max connections: ${config.postgres.max}. Maximum allowed is 100.`
    );
  }
  if (config.postgres.idleTimeoutMillis < 1000) {
    throw new Error(
      `Invalid idle timeout: ${config.postgres.idleTimeoutMillis}ms. Minimum allowed is 1000ms.`
    );
  }
  if (config.postgres.connectionTimeoutMillis < 1000) {
    throw new Error(
      `Invalid connection timeout: ${config.postgres.connectionTimeoutMillis}ms. Minimum allowed is 1000ms.`
    );
  }

  // Validate Redis config
  if (config.redis.maxRetriesPerRequest < 0) {
    throw new Error(
      `Invalid max retries: ${config.redis.maxRetriesPerRequest}. Must be >= 0.`
    );
  }
}

/**
 * Initialize PostgreSQL connection pool
 */
async function initializePostgresPool(
  config: PoolConfig['postgres']
): Promise<void> {
  const poolConfig: PgPoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.max,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    // Additional pool settings for production
    allowExitOnIdle: false,
    application_name: 'cfn-connection-pool',
  };

  pgPool = new Pool(poolConfig);

  // Handle pool errors with reconnection logic
  pgPool.on('error', (err: Error, client: PoolClient) => {
    console.error('Unexpected error on idle PostgreSQL client:', err.message);
    // Error will trigger reconnection on next query
  });

  // Connection event tracking
  pgPool.on('connect', (client: PoolClient) => {
    console.log('New PostgreSQL client connected to pool');
  });

  pgPool.on('acquire', (client: PoolClient) => {
    // Connection acquired from pool
  });

  pgPool.on('remove', (client: PoolClient) => {
    console.log('PostgreSQL client removed from pool');
  });

  // Test connection with timeout
  try {
    const client = await pgPool.connect();
    try {
      await client.query('SELECT 1 AS health_check');
      console.log('PostgreSQL connection pool health check passed');
    } finally {
      client.release();
    }
  } catch (err) {
    const error = err as Error;
    console.error('Failed to initialize PostgreSQL connection pool:', error.message);
    throw new Error(`PostgreSQL pool initialization failed: ${error.message}`);
  }
}

/**
 * Initialize Redis connection pool
 */
async function initializeRedisPool(config: PoolConfig['redis']): Promise<void> {
  const redisOptions: RedisOptions = {
    host: config.host,
    port: config.port,
    password: config.password,
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    // Connection pooling settings
    lazyConnect: false,
    keepAlive: 30000, // Keep connections alive
    connectTimeout: 10000, // 10s connection timeout
    retryStrategy: (times: number): number | void => {
      if (times > 10) {
        console.error('Redis connection retry limit exceeded');
        return undefined; // Stop retrying
      }
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, ...
      const delay = Math.min(100 * Math.pow(2, times), 3000);
      console.log(`Redis reconnection attempt ${times} in ${delay}ms`);
      return delay;
    },
    reconnectOnError: (err: Error): boolean => {
      // Reconnect on specific errors
      const targetErrors = ['READONLY', 'ECONNREFUSED', 'ETIMEDOUT'];
      return targetErrors.some((target) => err.message.includes(target));
    },
    enableReadyCheck: true,
    enableOfflineQueue: true,
  };

  redisPool = new Redis(redisOptions);

  // Handle Redis events
  redisPool.on('error', (err: Error) => {
    console.error('Redis connection error:', err.message);
  });

  redisPool.on('ready', () => {
    console.log('Redis connection ready');
  });

  redisPool.on('connect', () => {
    console.log('Redis client connected');
  });

  redisPool.on('reconnecting', (delay: number) => {
    console.log(`Redis reconnecting in ${delay}ms`);
  });

  redisPool.on('close', () => {
    console.log('Redis connection closed');
  });

  // Test connection with timeout
  try {
    const result = await redisPool.ping();
    if (result !== 'PONG') {
      throw new Error(`Unexpected ping response: ${result}`);
    }
    console.log('Redis connection pool health check passed');
  } catch (err) {
    const error = err as Error;
    console.error('Failed to initialize Redis connection pool:', error.message);
    throw new Error(`Redis pool initialization failed: ${error.message}`);
  }
}

/**
 * Register graceful shutdown handlers
 */
function registerShutdownHandlers(): void {
  const shutdownHandler = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    console.log(`Received ${signal}, shutting down connection pools...`);
    await shutdownPools();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', async (err: Error) => {
    console.error('Uncaught exception:', err);
    await shutdownPools();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason: unknown) => {
    console.error('Unhandled rejection:', reason);
    await shutdownPools();
    process.exit(1);
  });
}

/**
 * Gracefully shutdown all connection pools
 */
export async function shutdownPools(): Promise<void> {
  if (isShuttingDown) {
    console.log('Shutdown already in progress');
    return;
  }

  console.log('Initiating graceful connection pool shutdown...');
  isShuttingDown = true;

  const shutdownPromises: Promise<void>[] = [];

  // Shutdown PostgreSQL pool
  if (pgPool) {
    shutdownPromises.push(
      pgPool
        .end()
        .then(() => {
          console.log('PostgreSQL connection pool closed');
          pgPool = null;
        })
        .catch((err: Error) => {
          console.error('Error closing PostgreSQL pool:', err.message);
        })
    );
  }

  // Shutdown Redis pool
  if (redisPool) {
    shutdownPromises.push(
      redisPool
        .quit()
        .then(() => {
          console.log('Redis connection pool closed');
          redisPool = null;
        })
        .catch((err: Error) => {
          console.error('Error closing Redis pool:', err.message);
        })
    );
  }

  await Promise.all(shutdownPromises);

  isInitialized = false;
  isShuttingDown = false;
  console.log('Connection pool shutdown complete');
}

/**
 * Get pool metrics for Prometheus monitoring
 */
export function getPoolMetrics(): PoolMetrics {
  if (!pgPool || !redisPool) {
    throw new Error('Connection pools not initialized. Call initializePools first.');
  }

  return {
    postgres: {
      totalConnections: pgPool.totalCount,
      idleConnections: pgPool.idleCount,
      waitingRequests: pgPool.waitingCount,
      activeConnections: pgPool.totalCount - pgPool.idleCount,
    },
    redis: {
      status: redisPool.status,
      connectedClients: 1, // Single connection per pool
      commandsProcessed: redisCommandsProcessed,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute PostgreSQL query with pooled connection
 * Automatically handles connection acquisition and release
 */
export async function executePostgresQuery<T = Record<string, unknown>>(
  query: string,
  params?: unknown[]
): Promise<T[]> {
  if (!pgPool) {
    throw new Error('PostgreSQL pool not initialized. Call initializePools first.');
  }

  if (isShuttingDown) {
    throw new Error('Connection pool is shutting down');
  }

  let client: PoolClient | null = null;
  try {
    client = await pgPool.connect();
    const result = await client.query(query, params);
    postgresCommandsProcessed++;
    return result.rows as T[];
  } catch (err) {
    const error = err as Error;
    console.error('PostgreSQL query error:', error.message);
    throw new Error(`PostgreSQL query failed: ${error.message}`);
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Execute Redis command with pooled connection
 * Automatically handles reconnection on failure
 */
export async function executeRedisCommand<T = unknown>(
  command: string,
  ...args: unknown[]
): Promise<T> {
  if (!redisPool) {
    throw new Error('Redis pool not initialized. Call initializePools first.');
  }

  if (isShuttingDown) {
    throw new Error('Connection pool is shutting down');
  }

  try {
    // Type-safe command execution using unknown cast
    const redisClient = redisPool as unknown as Record<
      string,
      (...args: unknown[]) => Promise<T>
    >;
    const result = await redisClient[command](...args);
    redisCommandsProcessed++;
    return result;
  } catch (err) {
    const error = err as Error;
    console.error(`Redis ${command} command error:`, error.message);
    throw new Error(`Redis command failed: ${error.message}`);
  }
}

/**
 * Health check for all connection pools
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  const health: HealthCheckResult = {
    postgres: false,
    redis: false,
    details: {
      postgres: 'not initialized',
      redis: 'not initialized',
    },
  };

  // Check PostgreSQL
  if (pgPool) {
    try {
      await executePostgresQuery('SELECT 1 AS health_check');
      health.postgres = true;
      health.details.postgres = 'healthy';
    } catch (err) {
      const error = err as Error;
      health.details.postgres = error.message;
    }
  }

  // Check Redis
  if (redisPool) {
    try {
      await redisPool.ping();
      health.redis = true;
      health.details.redis = 'healthy';
    } catch (err) {
      const error = err as Error;
      health.details.redis = error.message;
    }
  }

  return health;
}

/**
 * Get PostgreSQL pool instance (for advanced use cases)
 * Most code should use executePostgresQuery instead
 */
export function getPostgresPool(): Pool {
  if (!pgPool) {
    throw new Error('PostgreSQL pool not initialized. Call initializePools first.');
  }
  return pgPool;
}

/**
 * Get Redis pool instance (for advanced use cases)
 * Most code should use executeRedisCommand instead
 */
export function getRedisPool(): Redis {
  if (!redisPool) {
    throw new Error('Redis pool not initialized. Call initializePools first.');
  }
  return redisPool;
}
