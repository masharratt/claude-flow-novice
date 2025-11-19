/**
 * Mode-Aware Redis Client
 * 
 * Redis client that automatically stubs operations in Task Mode
 * and executes normally in CLI Mode.
 * 
 * CRITICAL ANTI-PATTERN PREVENTION (per audit):
 * - Task Mode: All Redis operations gracefully no-op with warnings
 * - CLI Mode: Full Redis coordination available
 * 
 * This prevents the audit finding: "22 agent profiles with unconditional redis-cli"
 */

import Redis from 'ioredis';
import type {
  RedisConfig,
  Logger,
  ModeDetection,
  ExecutionMode
} from './types';
import { CoordinationError, CoordinationErrorType } from './types';
import { detectMode, ConsoleLogger } from './mode-detector';

/**
 * Mode-aware Redis coordinator
 * 
 * Automatically detects Task Mode vs CLI Mode and stubs Redis operations
 * when appropriate. Prevents failures from undefined TASK_ID/AGENT_ID.
 */
export class RedisCoordinator {
  private client: Redis | null = null;
  private modeDetection: ModeDetection | null = null;
  private logger: Logger;
  
  constructor(
    private config: Partial<RedisConfig> = {},
    logger?: Logger
  ) {
    this.logger = logger || new ConsoleLogger('[CFN-Redis]');
  }
  
  /**
   * Initialize the Redis client with mode detection
   * 
   * MUST be called before any Redis operations.
   * Detects mode and creates client or stubs accordingly.
   */
  async initialize(): Promise<void> {
    // Detect mode first
    this.modeDetection = await detectMode(this.logger);
    
    // If Task Mode, don't create Redis client at all
    if (this.modeDetection.mode === 'task') {
      this.logger.info('Task Mode: Redis client will be stubbed');
      this.client = null;
      return;
    }
    
    // If CLI Mode but Redis unavailable, stub
    if (!this.modeDetection.redisAvailable) {
      this.logger.warn('CLI Mode but Redis unavailable: Operations will soft-fail');
      this.client = null;
      return;
    }
    
    // CLI Mode with Redis available: Create real client
    const host = this.config.host || process.env.REDIS_HOST || 'localhost';
    const port = this.config.port || parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = this.config.password || process.env.REDIS_PASSWORD || process.env.CFN_REDIS_PASSWORD;
    
    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      db: this.config.db || 0,
      connectTimeout: this.config.connectTimeout || 5000,
      commandTimeout: this.config.commandTimeout || 5000,
      retryStrategy: this.config.retryStrategy || ((times) => {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 100, 2000); // Exponential backoff
      }),
      lazyConnect: false
    });
    
    // Attach error handlers
    this.client.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });
    
    this.client.on('connect', () => {
      this.logger.debug('Redis connected');
    });
    
    this.logger.info('✅ CLI Mode: Redis client initialized');
  }
  
  /**
   * Check if Redis operations are safe to execute
   * 
   * Agent profiles should check this before attempting Redis operations:
   * ```typescript
   * if (coordinator.canUseRedis) {
   *   await coordinator.lpush(...);
   * } else {
   *   // Return results directly to Main Chat
   * }
   * ```
   */
  get canUseRedis(): boolean {
    return this.modeDetection?.canUseRedis ?? false;
  }
  
  /**
   * Get current execution mode
   */
  get mode(): ExecutionMode {
    return this.modeDetection?.mode ?? 'unknown';
  }
  
  /**
   * Get mode detection details
   */
  getModeDetection(): ModeDetection | null {
    return this.modeDetection;
  }
  
  /**
   * Graceful stub for Task Mode
   * 
   * Logs warning and returns immediately without error.
   * Prevents agent failures from undefined variables.
   */
  private gracefulStub<T>(operation: string, defaultValue: T): T {
    if (!this.modeDetection) {
      throw new CoordinationError(
        CoordinationErrorType.INVALID_STATE,
        'Redis coordinator not initialized. Call initialize() first.'
      );
    }
    
    this.logger.warn(`⚠️ Redis operation skipped: ${operation}`);
    this.logger.info(`💡 Reason: ${this.modeDetection.reason}`);
    this.logger.info('🔧 Task Mode agents return results directly to Main Chat');
    
    return defaultValue;
  }
  
  /**
   * Check if client is ready
   */
  private ensureClient(): Redis {
    if (!this.client) {
      if (this.modeDetection?.mode === 'task') {
        throw new CoordinationError(
          CoordinationErrorType.MODE_MISMATCH,
          'Cannot execute Redis operations in Task Mode',
          'task',
          false
        );
      }
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        'Redis client not available. Check initialization and Redis connectivity.',
        this.modeDetection?.mode,
        true
      );
    }
    return this.client;
  }
  
  // ==================== Redis Operations with Graceful Fallback ====================
  
  /**
   * LPUSH: Push to list (left/head)
   * 
   * Gracefully stubs in Task Mode.
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`LPUSH ${key}`, 0);
    }
    
    try {
      const client = this.ensureClient();
      return await client.lpush(key, ...values);
    } catch (error) {
      this.logger.error(`LPUSH failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `LPUSH operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * RPUSH: Push to list (right/tail)
   * 
   * Gracefully stubs in Task Mode.
   */
  async rpush(key: string, ...values: string[]): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`RPUSH ${key}`, 0);
    }
    
    try {
      const client = this.ensureClient();
      return await client.rpush(key, ...values);
    } catch (error) {
      this.logger.error(`RPUSH failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `RPUSH operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * BLPOP: Blocking pop from list (left/head)
   * 
   * CRITICAL: This is the coordination primitive for agent waiting.
   * Gracefully stubs in Task Mode to prevent indefinite blocking.
   * 
   * @param key Key(s) to pop from
   * @param timeout Timeout in seconds
   * @returns [key, value] or null if timeout
   */
  async blpop(...args: Array<string | number>): Promise<[string, string] | null> {
    if (!this.canUseRedis) {
      const keys = args.slice(0, -1).join(',');
      return this.gracefulStub(`BLPOP ${keys}`, null);
    }

    try {
      const client = this.ensureClient();
      // Handle both forms: blpop(key, timeout) and blpop(key1, key2, ..., timeout)
      const result = await (client.blpop as any)(...args);
      return result as [string, string] | null;
    } catch (error) {
      this.logger.error(`BLPOP failed`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `BLPOP operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * HSET: Set hash field
   * 
   * Gracefully stubs in Task Mode.
   */
  async hset(key: string, ...fieldValues: string[]): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`HSET ${key}`, 0);
    }
    
    try {
      const client = this.ensureClient();
      return await client.hset(key, ...fieldValues);
    } catch (error) {
      this.logger.error(`HSET failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `HSET operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * HGET: Get hash field
   * 
   * Gracefully stubs in Task Mode.
   */
  async hget(key: string, field: string): Promise<string | null> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`HGET ${key} ${field}`, null);
    }
    
    try {
      const client = this.ensureClient();
      return await client.hget(key, field);
    } catch (error) {
      this.logger.error(`HGET failed for key: ${key}, field: ${field}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `HGET operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * HGETALL: Get all hash fields
   * 
   * Gracefully stubs in Task Mode.
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`HGETALL ${key}`, {});
    }
    
    try {
      const client = this.ensureClient();
      return await client.hgetall(key);
    } catch (error) {
      this.logger.error(`HGETALL failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `HGETALL operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * SET: Set string value
   * 
   * Gracefully stubs in Task Mode.
   */
  async set(key: string, value: string, expiryMode?: 'EX' | 'PX', time?: number): Promise<string | null> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`SET ${key}`, null);
    }

    try {
      const client = this.ensureClient();
      if (expiryMode && time) {
        const result = await (client.set as any)(key, value, expiryMode, time);
        return result;
      }
      const result = await (client.set as any)(key, value);
      return result;
    } catch (error) {
      this.logger.error(`SET failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `SET operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * GET: Get string value
   * 
   * Gracefully stubs in Task Mode.
   */
  async get(key: string): Promise<string | null> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`GET ${key}`, null);
    }
    
    try {
      const client = this.ensureClient();
      return await client.get(key);
    } catch (error) {
      this.logger.error(`GET failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `GET operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * DEL: Delete key(s)
   * 
   * Gracefully stubs in Task Mode.
   */
  async del(...keys: string[]): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`DEL ${keys.join(',')}`, 0);
    }
    
    try {
      const client = this.ensureClient();
      return await client.del(...keys);
    } catch (error) {
      this.logger.error(`DEL failed for keys: ${keys.join(',')}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `DEL operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * EXPIRE: Set key expiry
   * 
   * Gracefully stubs in Task Mode.
   */
  async expire(key: string, seconds: number): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`EXPIRE ${key} ${seconds}`, 0);
    }
    
    try {
      const client = this.ensureClient();
      return await client.expire(key, seconds);
    } catch (error) {
      this.logger.error(`EXPIRE failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `EXPIRE operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * PING: Test connection
   * 
   * Gracefully stubs in Task Mode.
   */
  async ping(): Promise<string> {
    if (!this.canUseRedis) {
      return this.gracefulStub('PING', 'PONG (stubbed)');
    }
    
    try {
      const client = this.ensureClient();
      return await client.ping();
    } catch (error) {
      this.logger.error('PING failed', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `PING operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }
  
  /**
   * EXISTS: Check if key exists
   *
   * Gracefully stubs in Task Mode.
   */
  async exists(key: string): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`EXISTS ${key}`, 0);
    }

    try {
      const client = this.ensureClient();
      return await client.exists(key);
    } catch (error) {
      this.logger.error(`EXISTS failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `EXISTS operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }

  /**
   * ZADD: Add to sorted set
   *
   * Gracefully stubs in Task Mode.
   */
  async zadd(key: string, ...args: string[]): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`ZADD ${key}`, 0);
    }

    try {
      const client = this.ensureClient();
      return await client.zadd(key, ...args);
    } catch (error) {
      this.logger.error(`ZADD failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `ZADD operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }

  /**
   * ZREVRANGE: Get sorted set in reverse order
   *
   * Gracefully stubs in Task Mode.
   */
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`ZREVRANGE ${key}`, []);
    }

    try {
      const client = this.ensureClient();
      return await client.zrevrange(key, start, stop);
    } catch (error) {
      this.logger.error(`ZREVRANGE failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `ZREVRANGE operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }

  /**
   * ZRANGE: Get sorted set
   *
   * Gracefully stubs in Task Mode.
   */
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`ZRANGE ${key}`, []);
    }

    try {
      const client = this.ensureClient();
      return await client.zrange(key, start, stop);
    } catch (error) {
      this.logger.error(`ZRANGE failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `ZRANGE operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }

  /**
   * ZREM: Remove from sorted set
   *
   * Gracefully stubs in Task Mode.
   */
  async zrem(key: string, member: string): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`ZREM ${key}`, 0);
    }

    try {
      const client = this.ensureClient();
      return await client.zrem(key, member);
    } catch (error) {
      this.logger.error(`ZREM failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `ZREM operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }

  /**
   * SADD: Add to set
   *
   * Gracefully stubs in Task Mode.
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`SADD ${key}`, 0);
    }

    try {
      const client = this.ensureClient();
      return await client.sadd(key, ...members);
    } catch (error) {
      this.logger.error(`SADD failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `SADD operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }

  /**
   * SMEMBERS: Get all set members
   *
   * Gracefully stubs in Task Mode.
   */
  async smembers(key: string): Promise<string[]> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`SMEMBERS ${key}`, []);
    }

    try {
      const client = this.ensureClient();
      return await client.smembers(key);
    } catch (error) {
      this.logger.error(`SMEMBERS failed for key: ${key}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `SMEMBERS operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }

  /**
   * PUBLISH: Publish to channel
   *
   * Gracefully stubs in Task Mode.
   */
  async publish(channel: string, message: string): Promise<number> {
    if (!this.canUseRedis) {
      return this.gracefulStub(`PUBLISH ${channel}`, 0);
    }

    try {
      const client = this.ensureClient();
      return await client.publish(channel, message);
    } catch (error) {
      this.logger.error(`PUBLISH failed for channel: ${channel}`, error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `PUBLISH operation failed: ${(error as Error).message}`,
        this.mode,
        true
      );
    }
  }

  /**
   * Disconnect from Redis
   *
   * Safe to call in Task Mode (no-op).
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.logger.debug('Redis client disconnected');
    }
  }
}
