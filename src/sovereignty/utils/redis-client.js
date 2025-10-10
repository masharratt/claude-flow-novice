/**
 * Redis Client Utility for Data Sovereignty System
 *
 * Provides enhanced Redis client with connection pooling,
 * error handling, and reconnection logic for sovereignty coordination.
 */

const Redis = require('ioredis');

class RedisClient extends Redis {
  constructor(options = {}) {
    const defaultOptions = {
      host: options.host || 'localhost',
      port: options.port || 6379,
      db: options.db || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000
    };

    super({ ...defaultOptions, ...options });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.on('connect', () => {
      console.log('Redis client connected');
    });

    this.on('ready', () => {
      console.log('Redis client ready');
    });

    this.on('error', (error) => {
      console.error('Redis client error:', error);
    });

    this.on('close', () => {
      console.log('Redis client connection closed');
    });

    this.on('reconnecting', () => {
      console.log('Redis client reconnecting...');
    });
  }

  async healthCheck() {
    try {
      const result = await this.ping();
      return { status: 'healthy', response: result };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}

module.exports = RedisClient;