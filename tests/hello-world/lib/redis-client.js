/**
 * Redis Client Helper
 * Provides connection management and helper methods for coordination
 */

import Redis from 'ioredis';

export class RedisClient {
  constructor(options = {}) {
    this.options = {
      host: options.host || 'localhost',
      port: options.port || 6379,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      ...options
    };

    this.client = null;
    this.subscriber = null;
    this.publisher = null;
  }

  async connect() {
    this.client = new Redis(this.options);
    this.subscriber = new Redis(this.options);
    this.publisher = new Redis(this.options);

    await Promise.all([
      this.client.ping(),
      this.subscriber.ping(),
      this.publisher.ping()
    ]);

    console.log('Redis clients connected successfully');
    return this;
  }

  async disconnect() {
    await Promise.all([
      this.client?.quit(),
      this.subscriber?.quit(),
      this.publisher?.quit()
    ]);

    console.log('Redis clients disconnected');
  }

  // Main client operations
  async get(key) {
    return await this.client.get(key);
  }

  async set(key, value, expirySeconds) {
    if (expirySeconds) {
      return await this.client.setex(key, expirySeconds, value);
    }
    return await this.client.set(key, value);
  }

  async setex(key, seconds, value) {
    return await this.client.setex(key, seconds, value);
  }

  async del(key) {
    return await this.client.del(key);
  }

  async exists(key) {
    return await this.client.exists(key);
  }

  async keys(pattern) {
    return await this.client.keys(pattern);
  }

  // Hash operations
  async hset(key, field, value) {
    return await this.client.hset(key, field, value);
  }

  async hget(key, field) {
    return await this.client.hget(key, field);
  }

  async hgetall(key) {
    return await this.client.hgetall(key);
  }

  async hincrby(key, field, increment) {
    return await this.client.hincrby(key, field, increment);
  }

  async hlen(key) {
    return await this.client.hlen(key);
  }

  async hdel(key, field) {
    return await this.client.hdel(key, field);
  }

  // Set operations
  async sadd(key, member) {
    return await this.client.sadd(key, member);
  }

  async scard(key) {
    return await this.client.scard(key);
  }

  async smembers(key) {
    return await this.client.smembers(key);
  }

  async sismember(key, member) {
    return await this.client.sismember(key, member);
  }

  // List operations
  async rpush(key, value) {
    return await this.client.rpush(key, value);
  }

  async lpush(key, value) {
    return await this.client.lpush(key, value);
  }

  async lpop(key) {
    return await this.client.lpop(key);
  }

  async rpop(key) {
    return await this.client.rpop(key);
  }

  async llen(key) {
    return await this.client.llen(key);
  }

  async lrange(key, start, stop) {
    return await this.client.lrange(key, start, stop);
  }

  // Pub/Sub operations
  async publish(channel, message) {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    return await this.publisher.publish(channel, messageStr);
  }

  async subscribe(channel, handler) {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          const parsed = JSON.parse(message);
          handler(parsed);
        } catch (err) {
          handler(message);
        }
      }
    });
  }

  async unsubscribe(channel) {
    return await this.subscriber.unsubscribe(channel);
  }

  // Utility methods
  async flushTestData(prefix = 'coordination:') {
    const keys = await this.keys(`${prefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
      console.log(`Flushed ${keys.length} keys with prefix ${prefix}`);
    }
    return keys.length;
  }

  async getTimeline(limit = 100) {
    const entries = await this.lrange('coordination:timeline', -limit, -1);
    return entries.map(e => JSON.parse(e));
  }

  async getConflicts() {
    const conflicts = await this.lrange('coordination:conflicts:log', 0, -1);
    return conflicts.map(c => JSON.parse(c));
  }

  async getCoordinatorState(coordinatorId) {
    const state = await this.hgetall(`coordination:coordinator:${coordinatorId}`);
    return state;
  }

  async getClaims() {
    const claimKeys = await this.keys('coordination:claims:claimed:*');
    const claims = await Promise.all(
      claimKeys.map(async key => {
        const value = await this.get(key);
        return { key, value: JSON.parse(value) };
      })
    );
    return claims;
  }

  // Metrics aggregation
  async collectMetrics() {
    const [
      timeline,
      conflicts,
      claims,
      coordinators,
      reviewQueue,
      reviewerPool,
      retryLog
    ] = await Promise.all([
      this.getTimeline(1000),
      this.getConflicts(),
      this.getClaims(),
      this.keys('coordination:coordinator:*'),
      this.llen('coordination:review:queue'),
      this.hgetall('coordination:reviewers:pool'),
      this.lrange('coordination:retries:log', 0, -1)
    ]);

    const coordinatorStates = await Promise.all(
      coordinators.map(async key => {
        const id = key.split(':')[2];
        return await this.getCoordinatorState(id);
      })
    );

    return {
      timeline: {
        total: timeline.length,
        events: timeline
      },
      conflicts: {
        total: conflicts.length,
        details: conflicts
      },
      claims: {
        total: claims.length,
        details: claims
      },
      coordinators: {
        count: coordinators.length,
        states: coordinatorStates
      },
      review: {
        queueDepth: reviewQueue,
        reviewerPoolSize: Object.keys(reviewerPool).length
      },
      retries: {
        total: retryLog.length,
        details: retryLog.map(r => JSON.parse(r))
      }
    };
  }
}

// Helper function to create and connect client
export async function createRedisClient(options = {}) {
  const client = new RedisClient(options);
  await client.connect();
  return client;
}
