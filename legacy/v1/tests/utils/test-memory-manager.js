/**
 * Test Memory Manager for Redis-based integration testing
 * Simplified version focusing on test scenarios
 */

export class TestMemoryManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.namespace = 'test';
  }

  async store(namespace, key, value) {
    const fullKey = `${this.namespace}:${namespace}:${key}`;
    const serializedValue = JSON.stringify({
      data: value,
      timestamp: Date.now(),
      type: typeof value
    });

    await this.redis.set(fullKey, serializedValue);
    return true;
  }

  async retrieve(namespace, key) {
    const fullKey = `${this.namespace}:${namespace}:${key}`;
    const value = await this.redis.get(fullKey);

    if (!value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value);
      return parsed.data;
    } catch (error) {
      return value;
    }
  }

  async clear(namespace) {
    const pattern = `${this.namespace}:${namespace}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(keys);
    }

    return keys.length;
  }

  async cleanup() {
    const pattern = `${this.namespace}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(keys);
    }

    console.log(`🧹 Cleaned up ${keys.length} test memory entries`);
  }

  async publish(channel, message) {
    const serializedMessage = JSON.stringify(message);
    await this.redis.publish(channel, serializedMessage);
    return true;
  }

  async subscribe(channel, callback) {
    const subscriber = this.redis.duplicate();
    await subscriber.connect();

    await subscriber.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch (error) {
        callback(message);
      }
    });

    return subscriber;
  }
}