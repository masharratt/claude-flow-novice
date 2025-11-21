/**
 * Redis Client Wrapper
 *
 * Provides graceful fallback for Task mode and robust connection management
 * Replaces: redis-cli-wrapper.sh, redis-functions.sh
 *
 * Security:
 * - CWE-400: Connection timeouts and circuit breaker
 * - CWE-78: No shell execution
 * - Input validation via branded types
 */

import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis';
import {
  RedisConfig,
  RedisConnectionError,
  TimeoutError,
  CircuitBreakerOpenError,
} from '../types';

export interface RedisClientOptions extends RedisConfig {
  gracefulFallback?: boolean;  // If true, soft-fail when Redis unavailable (Task mode)
  logger?: Logger;
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

class ConsoleLogger implements Logger {
  info(message: string, ...args: unknown[]): void {
    console.log(`[INFO] ${message}`, ...args);
  }
  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }
  error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }
  debug(message: string, ...args: unknown[]): void {
    if (process.env.DEBUG === 'true') {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
}

type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Redis Client with graceful fallback and circuit breaker
 */
export class CFNRedisClient {
  private client: RedisClient | null = null;
  private readonly options: RedisClientOptions;
  private readonly logger: Logger;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private lastConnectionAttempt: number = 0;
  private circuitBreakerState: CircuitBreakerState = 'CLOSED';
  private circuitBreakerFailures: number = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_RESET_TIMEOUT = 60000; // 1 minute

  constructor(options: RedisClientOptions) {
    this.options = {
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || parseInt(process.env.REDIS_PORT || '6379', 10),
      password: options.password || process.env.REDIS_PASSWORD || process.env.CFN_REDIS_PASSWORD,
      db: options.db || parseInt(process.env.REDIS_DB || '0', 10),
      connectTimeout: options.connectTimeout || 1000,
      commandTimeout: options.commandTimeout || 5000,
      enableOfflineQueue: options.enableOfflineQueue ?? false,
      lazyConnect: options.lazyConnect ?? true,
      gracefulFallback: options.gracefulFallback ?? false,
      retryStrategy: options.retryStrategy || this.defaultRetryStrategy.bind(this),
    };
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Default retry strategy: exponential backoff with max 3 attempts
   */
  private defaultRetryStrategy(times: number): number | null {
    if (times > 3) {
      this.logger.warn('Redis connection failed after 3 attempts');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 3000);
    this.logger.debug(`Redis retry ${times} in ${delay}ms`);
    return delay;
  }

  /**
   * Connect to Redis (lazy connection)
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    if (this.circuitBreakerState === 'OPEN') {
      const now = Date.now();
      if (now - this.lastConnectionAttempt < this.CIRCUIT_BREAKER_RESET_TIMEOUT) {
        throw new CircuitBreakerOpenError(
          'Circuit breaker is OPEN. Redis connection attempts blocked.'
        );
      }
      // Transition to HALF_OPEN to test connection
      this.circuitBreakerState = 'HALF_OPEN';
      this.logger.info('Circuit breaker transitioning to HALF_OPEN');
    }

    this.lastConnectionAttempt = Date.now();
    this.connectionAttempts++;

    try {
      const redisOptions: RedisOptions = {
        host: this.options.host,
        port: this.options.port,
        password: this.options.password,
        db: this.options.db,
        connectTimeout: this.options.connectTimeout,
        commandTimeout: this.options.commandTimeout,
        enableOfflineQueue: this.options.enableOfflineQueue,
        lazyConnect: this.options.lazyConnect,
        retryStrategy: this.options.retryStrategy,
        maxRetriesPerRequest: 1,
      };

      this.client = new Redis(redisOptions);

      // Wait for connection with timeout
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          this.client!.once('ready', () => {
            this.isConnected = true;
            this.circuitBreakerState = 'CLOSED';
            this.circuitBreakerFailures = 0;
            this.logger.info(
              `Redis connected: ${this.options.host}:${this.options.port} (db: ${this.options.db})`
            );
            resolve();
          });
          this.client!.once('error', (err) => {
            reject(err);
          });
        }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), this.options.connectTimeout!)
        ),
      ]);

      // Verify connection with PING
      await this.client.ping();

    } catch (error) {
      this.isConnected = false;
      this.circuitBreakerFailures++;

      if (this.circuitBreakerFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
        this.circuitBreakerState = 'OPEN';
        this.logger.error(
          `Circuit breaker opened after ${this.circuitBreakerFailures} failures`
        );
      }

      if (this.options.gracefulFallback) {
        this.logger.warn('⚠️  Redis unavailable - graceful fallback mode (Task mode)');
        this.logger.info('💡 This is expected in Task mode (Main Chat coordination)');
        this.logger.info('🔧 Agents should output JSON directly instead of Redis coordination');
        return; // Soft fail - don't throw
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RedisConnectionError(
        `Failed to connect to Redis at ${this.options.host}:${this.options.port}: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get the underlying Redis client (throws if not connected)
   */
  getClient(): RedisClient {
    if (!this.client || !this.isConnected) {
      if (this.options.gracefulFallback) {
        throw new Error('Redis not available in graceful fallback mode');
      }
      throw new RedisConnectionError('Redis client is not connected');
    }
    return this.client;
  }

  /**
   * Execute Redis command with timeout and error handling
   */
  async execute<T>(
    operation: (client: RedisClient) => Promise<T>,
    operationName: string = 'command'
  ): Promise<T | null> {
    if (!this.isAvailable()) {
      if (this.options.gracefulFallback) {
        this.logger.debug(`Redis unavailable, skipping: ${operationName}`);
        return null;
      }
      throw new RedisConnectionError('Redis not available');
    }

    try {
      const client = this.getClient();
      const result = await Promise.race([
        operation(client),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new TimeoutError(`Redis ${operationName} timeout`, this.options.commandTimeout!)),
            this.options.commandTimeout
          )
        ),
      ]);

      return result;
    } catch (error) {
      this.logger.error(`Redis ${operationName} failed:`, error);

      if (error instanceof TimeoutError) {
        throw error;
      }

      if (this.options.gracefulFallback) {
        this.logger.warn(`Graceful fallback for failed ${operationName}`);
        return null;
      }

      throw error;
    }
  }

  /**
   * Ping Redis to check connectivity
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.execute(
        (client) => client.ping(),
        'PING'
      );
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      this.logger.info('Redis disconnected');
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    isConnected: boolean;
    connectionAttempts: number;
    circuitBreakerState: CircuitBreakerState;
    circuitBreakerFailures: number;
  } {
    return {
      isConnected: this.isConnected,
      connectionAttempts: this.connectionAttempts,
      circuitBreakerState: this.circuitBreakerState,
      circuitBreakerFailures: this.circuitBreakerFailures,
    };
  }
}

/**
 * Create a CFNRedisClient instance from environment variables
 */
export function createRedisClientFromEnv(gracefulFallback: boolean = false): CFNRedisClient {
  return new CFNRedisClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || process.env.CFN_REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    gracefulFallback,
  });
}
