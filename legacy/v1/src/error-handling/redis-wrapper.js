/**
 * Redis Error Handling Wrapper
 *
 * Provides comprehensive error handling and recovery for Redis operations.
 */

import { createClient } from 'redis';
import { ErrorHandler, RedisError, TimeoutError, NetworkError } from './index.js';
import { ValidationSchema, ValidationTypes, ValidationConstraints } from './validation.js';
import { EventEmitter } from 'events';

/**
 * Redis error types
 */
const REDIS_ERROR_TYPES = {
  CONNECTION: 'connection',
  AUTHENTICATION: 'authentication',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  COMMAND: 'command',
  MEMORY: 'memory',
  CONFIGURATION: 'configuration'
};

/**
 * Redis configuration validation schema
 */
const REDIS_CONFIG_SCHEMA = ValidationSchema.create({
  host: new ValidationRule(ValidationTypes.STRING, {
    [ValidationConstraints.REQUIRED]: true,
    [ValidationConstraints.MIN_LENGTH]: 1,
    [ValidationConstraints.MAX_LENGTH]: 253,
    [ValidationConstraints.DEFAULT]: 'localhost'
  }),
  port: new ValidationRule(ValidationTypes.NUMBER, {
    [ValidationConstraints.REQUIRED]: true,
    [ValidationConstraints.MIN_VALUE]: 1,
    [ValidationConstraints.MAX_VALUE]: 65535,
    [ValidationConstraints.INTEGER]: true,
    [ValidationConstraints.DEFAULT]: 6379
  }),
  password: new ValidationRule(ValidationTypes.STRING, {
    [ValidationConstraints.OPTIONAL]: true,
    [ValidationConstraints.MIN_LENGTH]: 8
  }),
  database: new ValidationRule(ValidationTypes.NUMBER, {
    [ValidationConstraints.MIN_VALUE]: 0,
    [ValidationConstraints.MAX_VALUE]: 15,
    [ValidationConstraints.INTEGER]: true,
    [ValidationConstraints.DEFAULT]: 0
  }),
  connectTimeout: new ValidationRule(ValidationTypes.NUMBER, {
    [ValidationConstraints.MIN_VALUE]: 1000,
    [ValidationConstraints.MAX_VALUE]: 60000,
    [ValidationConstraints.INTEGER]: true,
    [ValidationConstraints.DEFAULT]: 10000
  }),
  lazyConnect: new ValidationRule(ValidationTypes.BOOLEAN, {
    [ValidationConstraints.DEFAULT]: true
  }),
  retryDelayOnFailover: new ValidationRule(ValidationTypes.NUMBER, {
    [ValidationConstraints.MIN_VALUE]: 100,
    [ValidationConstraints.MAX_VALUE]: 10000,
    [ValidationConstraints.INTEGER]: true,
    [ValidationConstraints.DEFAULT]: 1000
  }),
  enableReadyCheck: new ValidationRule(ValidationTypes.BOOLEAN, {
    [ValidationConstraints.DEFAULT]: true
  }),
  maxRetriesPerRequest: new ValidationRule(ValidationTypes.NUMBER, {
    [ValidationConstraints.MIN_VALUE]: 0,
    [ValidationConstraints.MAX_VALUE]: 10,
    [ValidationConstraints.INTEGER]: true,
    [ValidationConstraints.DEFAULT]: 3
  })
});

/**
 * Redis Error Handler class
 */
export class RedisErrorHandler extends ErrorHandler {
  constructor() {
    super({
      enableLogging: true,
      enableMetrics: true,
      enableRecovery: true,
      maxRetries: 5
    });

    this.setupRecoveryStrategies();
    this.connectionState = 'disconnected';
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
  }

  /**
   * Setup Redis-specific recovery strategies
   */
  setupRecoveryStrategies() {
    // Connection error recovery
    this.registerRecoveryStrategy('CONNECTION', async (error, context) => {
      console.log(`🔄 Recovering from Redis connection error...`);

      if (this.connectionAttempts < this.maxConnectionAttempts) {
        this.connectionAttempts++;

        // Exponential backoff for connection attempts
        const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
        console.log(`📡 Retrying Redis connection in ${delay}ms (attempt ${this.connectionAttempts})`);

        await this.delay(delay);

        return {
          action: 'retry_connection',
          attempt: this.connectionAttempts,
          delay,
          suggestions: [
            'Check Redis server status',
            'Verify network connectivity',
            'Validate Redis configuration'
          ]
        };
      }

      throw new Error('Redis connection attempts exhausted');
    });

    // Authentication error recovery
    this.registerRecoveryStrategy('AUTHENTICATION', async (error, context) => {
      console.log(`🔄 Recovering from Redis authentication error...`);

      return {
        action: 'reconfigure_auth',
        suggestions: [
          'Verify Redis password',
          'Check user permissions',
          'Update Redis configuration'
        ]
      };
    });

    // Timeout error recovery
    this.registerRecoveryStrategy('TIMEOUT', async (error, context) => {
      console.log(`🔄 Recovering from Redis timeout error...`);

      // Increase timeout and retry
      const newTimeout = Math.min(
        (context.timeout || 10000) * 1.5,
        60000
      );

      return {
        action: 'increase_timeout',
        timeout: newTimeout,
        suggestions: [
          'Increase connection timeout',
          'Check Redis server load',
          'Consider Redis optimization'
        ]
      };
    });

    // Memory error recovery
    this.registerRecoveryStrategy('MEMORY', async (error, context) => {
      console.log(`🔄 Recovering from Redis memory error...`);

      return {
        action: 'handle_memory_issue',
        suggestions: [
          'Free Redis memory',
          'Check maxmemory policy',
          'Clear expired keys',
          'Monitor Redis memory usage'
        ]
      };
    });

    // Command error recovery
    this.registerRecoveryStrategy('COMMAND', async (error, context) => {
      console.log(`🔄 Recovering from Redis command error...`);

      return {
        action: 'handle_command_error',
        suggestions: [
          'Check command syntax',
          'Verify key existence',
          'Validate data types',
          'Check Redis permissions'
        ]
      };
    });
  }

  /**
   * Classify Redis errors
   */
  classifyRedisError(error) {
    const message = error.message.toLowerCase();
    const code = error.code || '';

    if (code === 'ECONNREFUSED' || message.includes('connection refused')) {
      return REDIS_ERROR_TYPES.CONNECTION;
    }
    if (code === 'ENOTFOUND' || message.includes('getaddrinfo')) {
      return REDIS_ERROR_TYPES.CONNECTION;
    }
    if (code === 'ETIMEDOUT' || message.includes('timeout')) {
      return REDIS_ERROR_TYPES.TIMEOUT;
    }
    if (message.includes('auth') || message.includes('password') || message.includes('authentication')) {
      return REDIS_ERROR_TYPES.AUTHENTICATION;
    }
    if (message.includes('memory') || message.includes('maxmemory')) {
      return REDIS_ERROR_TYPES.MEMORY;
    }
    if (message.includes('command') || message.includes('syntax')) {
      return REDIS_ERROR_TYPES.COMMAND;
    }
    if (code === 'ECONNRESET' || code === 'ENETUNREACH') {
      return REDIS_ERROR_TYPES.NETWORK;
    }

    return REDIS_ERROR_TYPES.CONNECTION; // Default to connection errors
  }

  /**
   * Wrap Redis client with error handling
   */
  wrapRedisClient(config) {
    const errorHandler = this;
    let client = null;
    let isConnected = false;

    // Validate configuration
    const validatedConfig = REDIS_CONFIG_SCHEMA.validate(config);
    if (!validatedConfig.valid) {
      throw new RedisError('Invalid Redis configuration', {
        context: { config, errors: validatedConfig.errors },
        suggestions: [
          'Check Redis host and port',
          'Verify authentication credentials',
          'Review connection parameters'
        ]
      });
    }

    const wrappedClient = {
      async connect() {
        if (isConnected) {
          return;
        }

        try {
          console.log(`📡 Connecting to Redis at ${validatedConfig.data.host}:${validatedConfig.data.port}`);

          client = createClient({
            socket: {
              host: validatedConfig.data.host,
              port: validatedConfig.data.port,
              connectTimeout: validatedConfig.data.connectTimeout,
              lazyConnect: validatedConfig.data.lazyConnect
            },
            password: validatedConfig.data.password,
            database: validatedConfig.data.database,
            retryDelayOnFailover: validatedConfig.data.retryDelayOnFailover,
            enableReadyCheck: validatedConfig.data.enableReadyCheck,
            maxRetriesPerRequest: validatedConfig.data.maxRetriesPerRequest
          });

          // Setup error handlers
          client.on('error', async (error) => {
            isConnected = false;
            errorHandler.connectionState = 'disconnected';

            const redisError = new RedisError(`Redis client error: ${error.message}`, {
              type: REDIS_ERROR_TYPES.CONNECTION,
              context: { host: validatedConfig.data.host, port: validatedConfig.data.port },
              cause: error
            });

            await errorHandler.handleError(redisError, { operation: 'client_error' });
          });

          client.on('connect', () => {
            console.log('✅ Redis client connected');
            errorHandler.connectionState = 'connected';
            errorHandler.connectionAttempts = 0;
            isConnected = true;
          });

          client.on('ready', () => {
            console.log('✅ Redis client ready');
            errorHandler.connectionState = 'ready';
          });

          client.on('end', () => {
            console.log('🔌 Redis client disconnected');
            isConnected = false;
            errorHandler.connectionState = 'disconnected';
          });

          client.on('reconnecting', () => {
            console.log('🔄 Redis client reconnecting...');
            errorHandler.connectionState = 'reconnecting';
          });

          // Connect with timeout
          await Promise.race([
            client.connect(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Connection timeout')),
              validatedConfig.data.connectTimeout)
            )
          ]);

          isConnected = true;
          console.log('✅ Successfully connected to Redis');

        } catch (error) {
          const redisError = new RedisError(`Failed to connect to Redis: ${error.message}`, {
            type: this.classifyRedisError(error),
            context: {
              host: validatedConfig.data.host,
              port: validatedConfig.data.port,
              database: validatedConfig.data.database
            },
            cause: error,
            retryable: true
          });

          await errorHandler.handleError(redisError, { operation: 'connect' });
          throw redisError;
        }
      },

      async disconnect() {
        if (client && isConnected) {
          try {
            await client.disconnect();
            isConnected = false;
            console.log('🔌 Disconnected from Redis');
          } catch (error) {
            console.warn('⚠️ Error disconnecting from Redis:', error.message);
          }
        }
      },

      async get(key, options = {}) {
        this.ensureConnected();
        return this.executeCommand('get', [key], options);
      },

      async set(key, value, options = {}) {
        this.ensureConnected();
        return this.executeCommand('set', [key, value], options);
      },

      async del(key, options = {}) {
        this.ensureConnected();
        return this.executeCommand('del', [key], options);
      },

      async exists(key, options = {}) {
        this.ensureConnected();
        return this.executeCommand('exists', [key], options);
      },

      async keys(pattern, options = {}) {
        this.ensureConnected();
        return this.executeCommand('keys', [pattern], options);
      },

      async hget(key, field, options = {}) {
        this.ensureConnected();
        return this.executeCommand('hget', [key, field], options);
      },

      async hset(key, field, value, options = {}) {
        this.ensureConnected();
        return this.executeCommand('hset', [key, field, value], options);
      },

      async hgetall(key, options = {}) {
        this.ensureConnected();
        return this.executeCommand('hgetall', [key], options);
      },

      async expire(key, seconds, options = {}) {
        this.ensureConnected();
        return this.executeCommand('expire', [key, seconds], options);
      },

      async ttl(key, options = {}) {
        this.ensureConnected();
        return this.executeCommand('ttl', [key], options);
      },

      async publish(channel, message, options = {}) {
        this.ensureConnected();
        return this.executeCommand('publish', [channel, message], options);
      },

      async subscribe(channel, callback, options = {}) {
        this.ensureConnected();

        return new Promise((resolve, reject) => {
          const subscriber = client.duplicate();

          subscriber.on('error', (error) => {
            reject(new RedisError(`Subscriber error: ${error.message}`, {
              type: this.classifyRedisError(error),
              cause: error
            }));
          });

          subscriber.subscribe(channel, (message, subscribedChannel) => {
            try {
              callback(message, subscribedChannel);
            } catch (error) {
              console.error('Error in subscription callback:', error);
            }
          });

          subscriber.connect().then(() => {
            resolve(subscriber);
          }).catch(reject);
        });
      },

      async executeCommand(command, args = [], options = {}) {
        this.ensureConnected();

        try {
          const timeout = options.timeout || 30000;

          const result = await Promise.race([
            client[command](...args),
            new Promise((_, reject) =>
              setTimeout(() => reject(new TimeoutError(`Redis command timeout: ${command}`)), timeout)
            )
          ]);

          return result;

        } catch (error) {
          const redisError = new RedisError(`Redis command failed: ${command} - ${error.message}`, {
            type: this.classifyRedisError(error),
            context: { command, args },
            cause: error,
            retryable: this.isRetryableError(error)
          });

          await errorHandler.handleError(redisError, {
            operation: 'command',
            command,
            args
          });

          throw redisError;
        }
      },

      ensureConnected() {
        if (!isConnected || !client) {
          throw new RedisError('Redis client is not connected', {
            type: REDIS_ERROR_TYPES.CONNECTION,
            retryable: true,
            suggestions: ['Call connect() before executing commands']
          });
        }
      },

      isRetryableError(error) {
        const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'];
        const retryableMessages = ['timeout', 'connection', 'network'];

        return retryableCodes.includes(error.code) ||
               retryableMessages.some(msg => error.message.toLowerCase().includes(msg));
      },

      getConnectionInfo() {
        return {
          connected: isConnected,
          state: errorHandler.connectionState,
          host: validatedConfig.data.host,
          port: validatedConfig.data.port,
          database: validatedConfig.data.database,
          connectionAttempts: errorHandler.connectionAttempts
        };
      },

      getStats() {
        if (!client) {
          return null;
        }

        try {
          return {
            connected: isConnected,
            state: errorHandler.connectionState,
            info: client.options || {}
          };
        } catch (error) {
          return {
            connected: false,
            error: error.message
          };
        }
      }
    };

    return wrappedClient;
  }

  /**
   * Delay helper function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create Redis wrapper instance
   */
  static create(config) {
    const handler = new RedisErrorHandler();
    return handler.wrapRedisClient(config);
  }
}

/**
 * Redis connection pool with error handling
 */
export class RedisConnectionPool extends EventEmitter {
  constructor(config, poolSize = 5) {
    super();
    this.config = config;
    this.poolSize = poolSize;
    this.clients = [];
    this.availableClients = [];
    this.busyClients = new Set();
    this.errorHandler = new RedisErrorHandler();
  }

  async initialize() {
    console.log(`🏊 Initializing Redis connection pool (size: ${this.poolSize})`);

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const client = this.errorHandler.wrapRedisClient(this.config);
        await client.connect();

        this.clients.push(client);
        this.availableClients.push(client);

        console.log(`✅ Redis pool client ${i + 1} initialized`);
      } catch (error) {
        console.error(`❌ Failed to initialize Redis pool client ${i + 1}:`, error.message);
      }
    }

    if (this.clients.length === 0) {
      throw new RedisError('Failed to initialize any Redis connections');
    }

    console.log(`✅ Redis connection pool initialized with ${this.clients.length} clients`);
    this.emit('initialized', this.clients.length);
  }

  async getClient() {
    if (this.availableClients.length === 0) {
      if (this.busyClients.size < this.clients.length) {
        // All clients are busy, wait for one to become available
        return new Promise((resolve) => {
          this.once('client_available', resolve);
        });
      } else {
        throw new RedisError('No available Redis connections in pool');
      }
    }

    const client = this.availableClients.pop();
    this.busyClients.add(client);

    return client;
  }

  releaseClient(client) {
    if (this.busyClients.has(client)) {
      this.busyClients.delete(client);
      this.availableClients.push(client);
      this.emit('client_available', client);
    }
  }

  async close() {
    console.log('🔌 Closing Redis connection pool');

    await Promise.all(this.clients.map(async (client, index) => {
      try {
        await client.disconnect();
        console.log(`✅ Redis pool client ${index + 1} disconnected`);
      } catch (error) {
        console.error(`❌ Error disconnecting Redis pool client ${index + 1}:`, error.message);
      }
    }));

    this.clients = [];
    this.availableClients = [];
    this.busyClients.clear();

    console.log('✅ Redis connection pool closed');
    this.emit('closed');
  }

  getPoolStats() {
    return {
      totalClients: this.clients.length,
      availableClients: this.availableClients.length,
      busyClients: this.busyClients.size,
      utilization: (this.busyClients.size / this.clients.length * 100).toFixed(1) + '%'
    };
  }
}

/**
 * Convenience function to create Redis client with error handling
 */
export function createRedisClient(config) {
  return RedisErrorHandler.create(config);
}

/**
 * Convenience function to create Redis connection pool
 */
export function createRedisPool(config, size = 5) {
  return new RedisConnectionPool(config, size);
}

export default {
  RedisErrorHandler,
  RedisConnectionPool,
  createRedisClient,
  createRedisPool,
  REDIS_ERROR_TYPES
};