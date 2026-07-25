// Redis Configuration

const { createClient } = require('redis');

const redisConfig = {
  // Primary connection settings
  primary: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    username: process.env.REDIS_USERNAME || '',
    password: process.env.REDIS_PASSWORD || '',

    // Connection options
    connectionOptions: {
      // Connection timeout in milliseconds
      connectTimeout: 5000,

      // Retry strategy for connection failures
      retryStrategy: (retries) => {
        if (retries > 3) {
          console.error('Max Redis connection retries exceeded');
          return new Error('Redis connection failed');
        }
        // Exponential backoff
        return Math.min(retries * 100, 3000);
      },

      // Socket connection settings
      socket: {
        keepAlive: true,
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) return new Error('Max reconnect attempts');
          return Math.min(retries * 100, 3000);
        }
      }
    },

    // Logging configuration
    logging: {
      enabled: process.env.REDIS_LOGGING === 'true' || false,
      level: process.env.REDIS_LOG_LEVEL || 'error'
    }
  },

  // Backup/Fallback Redis configurations
  fallback: [
    {
      url: process.env.REDIS_FALLBACK_1 || '',
      username: process.env.REDIS_FALLBACK_USERNAME_1 || '',
      password: process.env.REDIS_FALLBACK_PASSWORD_1 || ''
    }
  ],

  // Redis availability check configuration
  healthCheck: {
    interval: 30000, // Check every 30 seconds
    timeout: 5000,   // 5-second timeout for health checks
    retries: 3       // Number of retries before marking unavailable
  },

  // Optional advanced configurations
  advanced: {
    clusterMode: process.env.REDIS_CLUSTER_MODE === 'true' || false,
    sentinelMode: process.env.REDIS_SENTINEL_MODE === 'true' || false
  }
};

// Async Redis client creation with comprehensive error handling
async function createRedisClient(config = redisConfig.primary) {
  try {
    const client = createClient({
      url: config.url,
      username: config.username,
      password: config.password,
      ...config.connectionOptions
    });

    // Event handlers for robust connection management
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('Redis client connected successfully');
    });

    client.on('reconnecting', () => {
      console.log('Redis client attempting to reconnect');
    });

    await client.connect();

    return client;
  } catch (error) {
    console.error('Failed to create Redis client:', error);
    throw error;
  }
}

// Redis availability check
async function checkRedisAvailability(client) {
  try {
    await client.ping();
    return true;
  } catch (error) {
    console.error('Redis availability check failed:', error);
    return false;
  }
}

module.exports = {
  redisConfig,
  createRedisClient,
  checkRedisAvailability
};