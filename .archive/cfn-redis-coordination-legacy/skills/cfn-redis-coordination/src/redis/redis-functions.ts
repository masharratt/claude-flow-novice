/**
 * Redis Helper Functions
 *
 * High-level Redis operations for CFN coordination
 * Replaces: redis-functions.sh common patterns
 */

import { CFNRedisClient } from './redis-client';
import {
  RedisKey,
  TaskId,
  AgentId,
  Namespace,
  validateRedisKey,
} from '../types';

export class RedisOperations {
  constructor(private readonly redis: CFNRedisClient) {}

  /**
   * Build Redis key with namespace
   */
  buildKey(namespace: Namespace, taskId: TaskId, ...parts: string[]): RedisKey {
    const key = [namespace, taskId, ...parts].join(':');
    return validateRedisKey(key);
  }

  /**
   * Set a hash field with TTL
   */
  async hsetWithTTL(
    key: RedisKey,
    field: string,
    value: string,
    ttl: number = 86400
  ): Promise<boolean> {
    const result = await this.redis.execute(async (client) => {
      const pipeline = client.pipeline();
      pipeline.hset(key, field, value);
      pipeline.expire(key, ttl);
      const results = await pipeline.exec();
      return results !== null && results.every(([err]) => err === null);
    }, 'HSET with TTL');

    return result ?? false;
  }

  /**
   * Set multiple hash fields with TTL
   */
  async hmsetWithTTL(
    key: RedisKey,
    fields: Record<string, string>,
    ttl: number = 86400
  ): Promise<boolean> {
    const result = await this.redis.execute(async (client) => {
      const pipeline = client.pipeline();
      for (const [field, value] of Object.entries(fields)) {
        pipeline.hset(key, field, value);
      }
      pipeline.expire(key, ttl);
      const results = await pipeline.exec();
      return results !== null && results.every(([err]) => err === null);
    }, 'HMSET with TTL');

    return result ?? false;
  }

  /**
   * Get all hash fields
   */
  async hgetall(key: RedisKey): Promise<Record<string, string> | null> {
    return await this.redis.execute(
      (client) => client.hgetall(key),
      'HGETALL'
    );
  }

  /**
   * Get a single hash field
   */
  async hget(key: RedisKey, field: string): Promise<string | null> {
    return await this.redis.execute(
      (client) => client.hget(key, field),
      'HGET'
    );
  }

  /**
   * Push to list (LPUSH)
   */
  async lpush(key: RedisKey, ...values: string[]): Promise<number | null> {
    return await this.redis.execute(
      (client) => client.lpush(key, ...values),
      'LPUSH'
    );
  }

  /**
   * Pop from list with timeout (BZPOPMIN for ordered sets, BLPOP for lists)
   */
  async blpop(key: RedisKey, timeout: number): Promise<[string, string] | null> {
    return await this.redis.execute(
      (client) => client.blpop(key, timeout),
      'BLPOP'
    );
  }

  /**
   * Add to set
   */
  async sadd(key: RedisKey, ...members: string[]): Promise<number | null> {
    return await this.redis.execute(
      (client) => client.sadd(key, ...members),
      'SADD'
    );
  }

  /**
   * Get all set members
   */
  async smembers(key: RedisKey): Promise<string[] | null> {
    return await this.redis.execute(
      (client) => client.smembers(key),
      'SMEMBERS'
    );
  }

  /**
   * Check if member exists in set
   */
  async sismember(key: RedisKey, member: string): Promise<boolean> {
    const result = await this.redis.execute(
      (client) => client.sismember(key, member),
      'SISMEMBER'
    );
    return result === 1;
  }

  /**
   * Set key with TTL
   */
  async setex(key: RedisKey, ttl: number, value: string): Promise<boolean> {
    const result = await this.redis.execute(
      (client) => client.setex(key, ttl, value),
      'SETEX'
    );
    return result === 'OK';
  }

  /**
   * Get key value
   */
  async get(key: RedisKey): Promise<string | null> {
    return await this.redis.execute(
      (client) => client.get(key),
      'GET'
    );
  }

  /**
   * Delete keys
   */
  async del(...keys: RedisKey[]): Promise<number | null> {
    return await this.redis.execute(
      (client) => client.del(...keys),
      'DEL'
    );
  }

  /**
   * Check if key exists
   */
  async exists(...keys: RedisKey[]): Promise<number | null> {
    return await this.redis.execute(
      (client) => client.exists(...keys),
      'EXISTS'
    );
  }

  /**
   * Set key expiration
   */
  async expire(key: RedisKey, ttl: number): Promise<boolean> {
    const result = await this.redis.execute(
      (client) => client.expire(key, ttl),
      'EXPIRE'
    );
    return result === 1;
  }

  /**
   * Get keys matching pattern (use sparingly - expensive operation)
   */
  async keys(pattern: string): Promise<string[] | null> {
    return await this.redis.execute(
      (client) => client.keys(pattern),
      'KEYS'
    );
  }

  /**
   * Increment counter
   */
  async incr(key: RedisKey): Promise<number | null> {
    return await this.redis.execute(
      (client) => client.incr(key),
      'INCR'
    );
  }

  /**
   * Decrement counter
   */
  async decr(key: RedisKey): Promise<number | null> {
    return await this.redis.execute(
      (client) => client.decr(key),
      'DECR'
    );
  }

  /**
   * Execute Redis pipeline (batch operations)
   */
  async pipeline(
    operations: (pipeline: any) => void
  ): Promise<boolean> {
    const result = await this.redis.execute(async (client) => {
      const pipeline = client.pipeline();
      operations(pipeline);
      const results = await pipeline.exec();
      return results !== null && results.every(([err]) => err === null);
    }, 'PIPELINE');

    return result ?? false;
  }

  /**
   * Store agent completion signal
   */
  async signalCompletion(
    namespace: Namespace,
    taskId: TaskId,
    agentId: AgentId,
    data?: Record<string, string>
  ): Promise<boolean> {
    const key = this.buildKey(namespace, taskId, agentId, 'done');
    const fields: Record<string, string> = {
      status: 'complete',
      completed_at: new Date().toISOString(),
      ...data,
    };

    return await this.hmsetWithTTL(key, fields);
  }

  /**
   * Check if agent has completed
   */
  async isAgentComplete(
    namespace: Namespace,
    taskId: TaskId,
    agentId: AgentId
  ): Promise<boolean> {
    const key = this.buildKey(namespace, taskId, agentId, 'done');
    const exists = await this.exists(key);
    return (exists ?? 0) > 0;
  }

  /**
   * Get current timestamp in ISO 8601 format
   */
  getCurrentTimestamp(): string {
    return new Date().toISOString();
  }
}

/**
 * Create RedisOperations from client
 */
export function createRedisOperations(client: CFNRedisClient): RedisOperations {
  return new RedisOperations(client);
}
