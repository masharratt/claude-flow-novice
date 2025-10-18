/**
 * Production-Ready Redis Client with Security Hardening and Connection Pooling
 */

import { createClient, createCluster } from 'redis';
import crypto from 'crypto';
import { EventEmitter } from 'events';

/**
 * Security configuration for production Redis connections
 */
const SECURITY_CONFIG = {
  // Rate limiting (requests per minute per client)
  rateLimit: {
    windowMs: 60000, // 1 minute
    maxRequests: 1000,
    skipSuccessfulRequests: false
  },

  // Input sanitization
  allowedKeyPatterns: [
    /^[a-zA-Z0-9:_\-\.]+$/, // Standard swarm keys
    /^swarm:[a-zA-Z0-9_\-\.]+$/, // Swarm-specific keys
    /^memory:[a-zA-Z0-9_\-\.]+$/, // Memory keys
    /^metrics:[a-zA-Z0-9_\-\.]+$/ // Metrics keys
  ],

  maxKeyLength: 256,
  maxValueSize: 10 * 1024 * 1024, // 10MB

  // Audit logging
  auditEnabled: true,
  auditLogRetention: 30 * 24 * 60 * 60 * 1000, // 30 days

  // Security headers
  tlsCiphers: [
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-RSA-AES256-SHA384'
  ],

  tlsMinVersion: 'TLSv1.2'
};

/**
 * Enhanced connection pool configuration for high-performance scenarios
 */
const POOL_CONFIG = {
  minConnections: 5,
  maxConnections: 20,
  acquireTimeoutMillis: 10000,
  createTimeoutMillis: 10000,
  destroyTimeoutMillis: 3000,
  idleTimeoutMillis: 15000,
  reapIntervalMillis: 500,
  createRetryIntervalMillis: 100,
  healthCheckInterval: 3000,
  maxWaitingClients: 200,
  // Performance optimizations
  enablePipelining: true,
  pipelineBatchSize: 100,
  pipelineFlushInterval: 5, // ms
  compressionThreshold: 1024, // bytes
  lazyConnect: true,
  retryAttempts: 3,
  retryDelay: 500, // ms
  // Connection optimization
  tcpKeepAlive: true,
  noDelay: true,
  maxRetriesPerRequest: 3
};

/**
 * Enhanced Redis Client with security and pooling
 */
export class SecureRedisClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      // Security defaults
      enableTLS: process.env.NODE_ENV === 'production',
      requireAuth: true,
      auditLogging: true,

      // Connection defaults
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      database: parseInt(process.env.REDIS_DB) || 0,

      // Pool defaults
      pooling: true,
      ...config
    };

    this.pool = null;
    this.rateLimitMap = new Map();
    this.auditLog = [];
    this.healthStatus = {
      status: 'initializing',
      lastCheck: null,
      responseTime: null,
      errorCount: 0
    };

    // Performance monitoring
    this.performanceMetrics = new PerformanceMetrics();
    this.pipelineManager = new PipelineManager(this.config);
    this.compressionEngine = new CompressionEngine(this.config);

    this.securityValidator = new SecurityValidator();
    this.connectionPool = new ConnectionPool(this.config);
    this.auditLogger = new AuditLogger();

    this.initialize();
  }

  async initialize() {
    try {
      if (this.config.pooling) {
        await this.connectionPool.initialize();
      }

      this.startHealthChecks();
      this.startRateLimitCleanup();

      this.healthStatus.status = 'ready';
      this.emit('ready');

      if (this.config.auditLogging) {
        await this.auditLogger.log({
          event: 'CLIENT_INITIALIZED',
          config: this.sanitizeConfig(this.config),
          timestamp: Date.now()
        });
      }
    } catch (error) {
      this.healthStatus.status = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Sanitize configuration for audit logging
   */
  sanitizeConfig(config) {
    const sanitized = { ...config };
    delete sanitized.password;
    return sanitized;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    setInterval(async () => {
      try {
        const client = await this.connectionPool.acquire();
        const startTime = Date.now();
        await client.ping();
        const responseTime = Date.now() - startTime;

        this.healthStatus = {
          status: 'healthy',
          lastCheck: Date.now(),
          responseTime,
          errorCount: 0
        };

        this.connectionPool.release(client);
        this.emit('health-check', this.healthStatus);
      } catch (error) {
        this.healthStatus.errorCount++;
        this.healthStatus.status = 'unhealthy';
        this.healthStatus.lastCheck = Date.now();

        this.emit('health-error', error);

        if (this.config.auditLogging) {
          await this.auditLogger.log({
            event: 'HEALTH_CHECK_FAILED',
            error: error.message,
            timestamp: Date.now()
          });
        }
      }
    }, POOL_CONFIG.healthCheckInterval);
  }

  /**
   * Clean up rate limiting entries
   */
  startRateLimitCleanup() {
    setInterval(() => {
      const now = Date.now();
      const windowStart = now - SECURITY_CONFIG.rateLimit.windowMs;

      for (const [clientId, requests] of this.rateLimitMap.entries()) {
        const validRequests = requests.filter(time => time > windowStart);
        if (validRequests.length === 0) {
          this.rateLimitMap.delete(clientId);
        } else {
          this.rateLimitMap.set(clientId, validRequests);
        }
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Check rate limit for a client
   */
  checkRateLimit(clientId = 'default') {
    const now = Date.now();
    const windowStart = now - SECURITY_CONFIG.rateLimit.windowMs;

    if (!this.rateLimitMap.has(clientId)) {
      this.rateLimitMap.set(clientId, []);
    }

    const requests = this.rateLimitMap.get(clientId);
    const validRequests = requests.filter(time => time > windowStart);

    if (validRequests.length >= SECURITY_CONFIG.rateLimit.maxRequests) {
      throw new Error('Rate limit exceeded');
    }

    validRequests.push(now);
    this.rateLimitMap.set(clientId, validRequests);
  }

  /**
   * Execute Redis command with security checks and performance monitoring
   */
  async executeCommand(command, ...args) {
    const startTime = Date.now();
    let client;
    let bytesTransferred = 0;
    let compressionSavings = 0;

    try {
      // Rate limiting
      this.checkRateLimit();

      // Security validation
      this.securityValidator.validateCommand(command, args);

      // Acquire connection from pool
      client = await this.connectionPool.acquire();
      this.performanceMetrics.recordConnectionEvent('poolHits');

      // Apply compression for large values
      if (['set', 'setEx'].includes(command) && args.length > 1) {
        const compressionResult = await this.compressionEngine.compress(args[1]);
        if (compressionResult.compressed) {
          args[1] = compressionResult.data;
          compressionSavings = compressionResult.originalSize - compressionResult.compressedSize;
        }
        bytesTransferred = compressionResult.data.length;
      }

      // Execute command
      let result = await client[command](...args);

      // Apply decompression for get operations
      if (command === 'get' && result && Buffer.isBuffer(result)) {
        try {
          result = await this.compressionEngine.decompress(result);
          bytesTransferred = Buffer.byteLength(JSON.stringify(result));
        } catch (error) {
          // If decompression fails, treat as regular data
          result = result.toString();
        }
      }

      // Record success metrics
      const responseTime = Date.now() - startTime;
      this.performanceMetrics.recordOperation(command, responseTime, true, bytesTransferred, compressionSavings);

      // Audit logging
      if (this.config.auditLogging) {
        await this.auditLogger.log({
          event: 'COMMAND_EXECUTED',
          command,
          args: this.sanitizeArgs(args),
          success: true,
          responseTime,
          bytesTransferred,
          compressionSavings,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (error) {
      // Record failure metrics
      const responseTime = Date.now() - startTime;
      this.performanceMetrics.recordOperation(command, responseTime, false, bytesTransferred, compressionSavings);
      this.performanceMetrics.recordError(error, command, { args: this.sanitizeArgs(args) });

      // Audit logging
      if (this.config.auditLogging) {
        await this.auditLogger.log({
          event: 'COMMAND_FAILED',
          command,
          args: this.sanitizeArgs(args),
          error: error.message,
          responseTime,
          timestamp: Date.now()
        });
      }

      throw error;
    } finally {
      if (client) {
        this.connectionPool.release(client);
      }
    }
  }

  /**
   * Sanitize arguments for logging
   */
  sanitizeArgs(args) {
    return args.map(arg => {
      if (typeof arg === 'string' && arg.includes('password')) {
        return '[REDACTED]';
      }
      if (typeof arg === 'object' && arg !== null) {
        return '[OBJECT]';
      }
      return arg;
    });
  }

  /**
   * Record command metrics
   */
  recordMetrics(command, success, responseTime) {
    // This would integrate with a metrics system
    this.emit('metrics', {
      command,
      success,
      responseTime,
      timestamp: Date.now()
    });
  }

  /**
   * Convenience methods for common operations
   */
  async get(key) {
    return this.executeCommand('get', key);
  }

  async set(key, value, options = {}) {
    if (options.ex) {
      return this.executeCommand('setEx', key, options.ex, value);
    }
    return this.executeCommand('set', key, value);
  }

  async setEx(key, seconds, value) {
    return this.executeCommand('setEx', key, seconds, value);
  }

  async del(key) {
    return this.executeCommand('del', key);
  }

  async exists(key) {
    return this.executeCommand('exists', key);
  }

  async hGet(hash, field) {
    return this.executeCommand('hGet', hash, field);
  }

  async hSet(hash, field, value) {
    return this.executeCommand('hSet', hash, field, value);
  }

  async hDel(hash, field) {
    return this.executeCommand('hDel', hash, field);
  }

  async sAdd(set, member) {
    return this.executeCommand('sAdd', set, member);
  }

  async sRem(set, member) {
    return this.executeCommand('sRem', set, member);
  }

  async sMembers(set) {
    return this.executeCommand('sMembers', set);
  }

  async ping() {
    return this.executeCommand('ping');
  }

  /**
   * Execute batch operations with pipeline optimization
   */
  async executeBatch(operations) {
    const startTime = Date.now();
    let client;

    try {
      client = await this.connectionPool.acquire();

      const result = await this.pipelineManager.executeBatch(client, operations);

      this.performanceMetrics.recordPipelineBatch(operations.length, result.latency);

      // Record metrics for each operation
      operations.forEach(op => {
        this.performanceMetrics.recordOperation(op.command, result.latency / operations.length, result.success);
      });

      return result;
    } catch (error) {
      this.performanceMetrics.recordError(error, 'batch', { operationsCount: operations.length });
      throw error;
    } finally {
      if (client) {
        this.connectionPool.release(client);
      }
    }
  }

  /**
   * Batch set operations with compression
   */
  async batchSet(keyValuePairs, ttl = null) {
    const operations = await Promise.all(
      keyValuePairs.map(async ([key, value]) => {
        const compressionResult = await this.compressionEngine.compress(value);
        const processedValue = compressionResult.compressed ? compressionResult.data : value;

        if (ttl) {
          return { command: 'setEx', args: [key, ttl, processedValue] };
        }
        return { command: 'set', args: [key, processedValue] };
      })
    );

    return this.executeBatch(operations);
  }

  /**
   * Batch get operations with decompression
   */
  async batchGet(keys) {
    const operations = keys.map(key => ({ command: 'get', args: [key] }));

    const result = await this.executeBatch(operations);

    if (result.success && result.results) {
      // Decompress results
      const decompressedResults = await Promise.all(
        result.results.map(async (res) => {
          if (res && Buffer.isBuffer(res)) {
            try {
              return await this.compressionEngine.decompress(res);
            } catch (error) {
              return res.toString();
            }
          }
          return res;
        })
      );

      result.results = decompressedResults;
    }

    return result;
  }

  /**
   * Get performance metrics report
   */
  getPerformanceReport() {
    return {
      performance: this.performanceMetrics.getReport(),
      health: this.getHealthStatus(),
      pool: this.connectionPool.getStatus(),
      compression: {
        enabled: this.compressionEngine.compressionEnabled,
        threshold: this.compressionEngine.compressionThreshold
      }
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      ...this.healthStatus,
      poolStatus: this.connectionPool.getStatus(),
      rateLimitStats: this.getRateLimitStats(),
      timestamp: Date.now()
    };
  }

  /**
   * Get rate limiting statistics
   */
  getRateLimitStats() {
    const now = Date.now();
    const windowStart = now - SECURITY_CONFIG.rateLimit.windowMs;

    let totalRequests = 0;
    let activeClients = 0;

    for (const [clientId, requests] of this.rateLimitMap.entries()) {
      const validRequests = requests.filter(time => time > windowStart);
      if (validRequests.length > 0) {
        activeClients++;
        totalRequests += validRequests.length;
      }
    }

    return {
      activeClients,
      totalRequests,
      windowStart,
      windowEnd: now,
      limitPerClient: SECURITY_CONFIG.rateLimit.maxRequests
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      if (this.config.auditLogging) {
        await this.auditLogger.log({
          event: 'CLIENT_SHUTDOWN',
          timestamp: Date.now()
        });
      }

      await this.connectionPool.shutdown();
      this.healthStatus.status = 'shutdown';
      this.emit('shutdown');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}

/**
 * Enhanced Security validator for Redis operations with ACL support
 */
class SecurityValidator {
  constructor() {
    this.aclManager = new ACLManager();
    this.currentRole = 'agent'; // Default role
  }

  setRole(role) {
    this.currentRole = role;
  }

  validateCommand(command, args) {
    // Check ACL permissions first
    this.aclManager.checkPermission(this.currentRole, command, args);

    // Validate key patterns
    if (args.length > 0 && typeof args[0] === 'string') {
      this.validateKey(args[0]);
    }

    // Validate value sizes
    if (args.length > 1 && typeof args[1] === 'string') {
      this.validateValue(args[1]);
    }

    // Command-specific validations
    switch (command) {
      case 'set':
      case 'setEx':
        if (args.length < 2) {
          throw new Error('SET command requires key and value');
        }
        break;

      case 'eval':
        throw new SecurityError('EVAL command not allowed for security reasons', {
          command: 'eval',
          role: this.currentRole
        });

      case 'config':
      case 'shutdown':
      case 'flushdb':
      case 'flushall':
        throw new SecurityError(`${command.toUpperCase()} command not allowed for security reasons`, {
          command: command,
          role: this.currentRole
        });

      case 'auth':
        // Only admin role can change authentication
        if (this.currentRole !== 'admin') {
          throw new SecurityError('Authentication operations require admin privileges', {
            command: 'auth',
            role: this.currentRole
          });
        }
        break;
    }
  }

  validateKey(key) {
    if (typeof key !== 'string') {
      throw new SecurityError('Key must be a string', { key: typeof key });
    }

    if (key.length > SECURITY_CONFIG.maxKeyLength) {
      throw new SecurityError('Key exceeds maximum length', {
        keyLength: key.length,
        maxLength: SECURITY_CONFIG.maxKeyLength
      });
    }

    const isValidPattern = SECURITY_CONFIG.allowedKeyPatterns.some(pattern =>
      pattern.test(key)
    );

    if (!isValidPattern) {
      throw new SecurityError('Key contains invalid characters or pattern', {
        key: key.substring(0, 50) + '...'
      });
    }

    // Check role-based key access
    this.aclManager.checkKeyAccess(this.currentRole, key);
  }

  validateValue(value) {
    if (typeof value === 'string' && value.length > SECURITY_CONFIG.maxValueSize) {
      throw new SecurityError('Value exceeds maximum size', {
        valueSize: value.length,
        maxSize: SECURITY_CONFIG.maxValueSize
      });
    }
  }
}

/**
 * Access Control List (ACL) Manager for Redis operations
 */
class ACLManager {
  constructor() {
    this.roles = this.initializeRoles();
    this.userRoles = new Map(); // Maps user identifiers to roles
    this.sessionRoles = new Map(); // Maps session IDs to roles
  }

  /**
   * Initialize default ACL roles
   */
  initializeRoles() {
    return {
      admin: {
        permissions: ['*'], // All permissions
        keyPatterns: ['*'], // All keys
        commands: ['*'], // All commands
        rateLimit: {
          requestsPerMinute: 10000,
          burstLimit: 1000
        },
        description: 'Full administrative access'
      },

      swarm_coordinator: {
        permissions: [
          'swarm:read', 'swarm:write', 'swarm:delete',
          'memory:read', 'memory:write',
          'metrics:read',
          'session:manage'
        ],
        keyPatterns: [
          'swarm:*',
          'memory:*',
          'metrics:*',
          'session:*'
        ],
        commands: [
          'get', 'set', 'setEx', 'del', 'exists',
          'hGet', 'hSet', 'hDel', 'hGetAll',
          'sAdd', 'sRem', 'sMembers', 'sIsMember',
          'lPush', 'lPop', 'rPush', 'rPop',
          'incr', 'decr', 'incrBy', 'decrBy',
          'ping', 'info', 'expire', 'ttl'
        ],
        rateLimit: {
          requestsPerMinute: 5000,
          burstLimit: 500
        },
        description: 'Swarm coordination access'
      },

      agent: {
        permissions: [
          'memory:read', 'memory:write',
          'swarm:read',
          'task:read', 'task:write'
        ],
        keyPatterns: [
          'memory:*',
          'swarm:*',
          'task:*'
        ],
        commands: [
          'get', 'set', 'setEx',
          'hGet', 'hSet',
          'sAdd', 'sRem', 'sMembers',
          'ping'
        ],
        rateLimit: {
          requestsPerMinute: 1000,
          burstLimit: 100
        },
        description: 'Agent-specific access'
      },

      readonly: {
        permissions: [
          'swarm:read',
          'metrics:read',
          'memory:read'
        ],
        keyPatterns: [
          'swarm:*',
          'metrics:*',
          'memory:*'
        ],
        commands: [
          'get', 'hGet', 'hGetAll',
          'sMembers', 'sIsMember',
          'ping', 'info'
        ],
        rateLimit: {
          requestsPerMinute: 500,
          burstLimit: 50
        },
        description: 'Read-only access'
      },

      api_user: {
        permissions: [
          'api:read', 'api:write',
          'cache:read', 'cache:write'
        ],
        keyPatterns: [
          'api:*',
          'cache:*'
        ],
        commands: [
          'get', 'set', 'setEx', 'del',
          'hGet', 'hSet', 'hDel',
          'ping'
        ],
        rateLimit: {
          requestsPerMinute: 200,
          burstLimit: 20
        },
        description: 'API user access'
      }
    };
  }

  /**
   * Check if role has permission for command
   */
  checkPermission(role, command, args) {
    if (!this.roles[role]) {
      throw new SecurityError('Invalid role', { role });
    }

    const roleConfig = this.roles[role];

    // Check command permissions
    if (!roleConfig.commands.includes('*') && !roleConfig.commands.includes(command)) {
      throw new SecurityError(`Command '${command}' not allowed for role '${role}'`, {
        command,
        role,
        allowedCommands: roleConfig.commands
      });
    }

    // Check rate limiting
    this.checkRateLimit(role);
  }

  /**
   * Check if role has access to key
   */
  checkKeyAccess(role, key) {
    if (!this.roles[role]) {
      throw new SecurityError('Invalid role', { role });
    }

    const roleConfig = this.roles[role];

    // Check key pattern access
    const hasAccess = roleConfig.keyPatterns.some(pattern => {
      if (pattern === '*') return true;

      // Convert glob pattern to regex
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );

      return regex.test(key);
    });

    if (!hasAccess) {
      throw new SecurityError(`Access to key '${key}' not allowed for role '${role}'`, {
        key: key.substring(0, 50) + '...',
        role,
        allowedPatterns: roleConfig.keyPatterns
      });
    }
  }

  /**
   * Check rate limiting for role
   */
  checkRateLimit(role) {
    const roleConfig = this.roles[role];
    if (!roleConfig.rateLimit) return;

    // This would integrate with the rate limiting system
    // For now, just log the check
    console.log(`Rate limit check for role ${role}: ${roleConfig.rateLimit.requestsPerMinute}/min`);
  }

  /**
   * Assign role to user
   */
  assignUserRole(userId, role) {
    if (!this.roles[role]) {
      throw new SecurityError('Invalid role', { role });
    }

    this.userRoles.set(userId, role);
  }

  /**
   * Get role for user
   */
  getUserRole(userId) {
    return this.userRoles.get(userId) || 'readonly'; // Default to readonly
  }

  /**
   * Set role for session
   */
  setSessionRole(sessionId, role) {
    if (!this.roles[role]) {
      throw new SecurityError('Invalid role', { role });
    }

    this.sessionRoles.set(sessionId, role);
  }

  /**
   * Get role for session
   */
  getSessionRole(sessionId) {
    return this.sessionRoles.get(sessionId) || 'readonly'; // Default to readonly
  }

  /**
   * Create custom role
   */
  createRole(name, config) {
    this.roles[name] = {
      permissions: config.permissions || [],
      keyPatterns: config.keyPatterns || ['*'],
      commands: config.commands || ['get', 'set', 'ping'],
      rateLimit: config.rateLimit || { requestsPerMinute: 100, burstLimit: 10 },
      description: config.description || `Custom role: ${name}`
    };
  }

  /**
   * Get role configuration
   */
  getRoleConfig(role) {
    return this.roles[role];
  }

  /**
   * List all roles
   */
  listRoles() {
    return Object.keys(this.roles).map(role => ({
      name: role,
      description: this.roles[role].description,
      permissions: this.roles[role].permissions,
      keyPatterns: this.roles[role].keyPatterns,
      commands: this.roles[role].commands
    }));
  }

  /**
   * Validate role configuration
   */
  validateRoleConfig(config) {
    const errors = [];

    if (!config.name || typeof config.name !== 'string') {
      errors.push('Role name is required and must be a string');
    }

    if (!Array.isArray(config.permissions)) {
      errors.push('Permissions must be an array');
    }

    if (!Array.isArray(config.keyPatterns)) {
      errors.push('Key patterns must be an array');
    }

    if (!Array.isArray(config.commands)) {
      errors.push('Commands must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Security Error class for ACL violations
 */
class SecurityError extends Error {
  constructor(message, metadata = {}) {
    super(message);
    this.name = 'SecurityError';
    this.isSecurity = true;
    this.metadata = metadata;
    this.timestamp = Date.now();
  }
}

/**
 * Connection pool manager
 */
class ConnectionPool {
  constructor(config) {
    this.config = { ...POOL_CONFIG, ...config };
    this.connections = [];
    this.waitingClients = [];
    this.activeConnections = 0;
    this.isShuttingDown = false;
  }

  async initialize() {
    // Create minimum connections
    for (let i = 0; i < this.config.minConnections; i++) {
      await this.createConnection();
    }
  }

  async createConnection() {
    const clientConfig = {
      socket: {
        host: this.config.host,
        port: this.config.port,
        connectTimeout: this.config.createTimeoutMillis,
        keepAlive: this.config.tcpKeepAlive,
        noDelay: this.config.noDelay,
        tls: this.config.enableTLS ? {
          minVersion: SECURITY_CONFIG.tlsMinVersion,
          ciphers: SECURITY_CONFIG.tlsCiphers.join(':'),
          rejectUnauthorized: true
        } : undefined
      },
      password: this.config.password,
      database: this.config.database,
      // Performance optimizations
      lazyConnect: this.config.lazyConnect,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      retryDelayOnFailover: this.config.retryDelay,
      enableOfflineQueue: false
    };

    const client = createClient(clientConfig);

    client.on('error', (err) => {
      console.error('Redis connection error:', err);
      this.handleConnectionError(client, err);
    });

    client.on('ready', () => {
      console.log('Redis connection ready for pool');
    });

    client.on('connect', () => {
      console.log('Redis connection established for pool');
    });

    if (!this.config.lazyConnect) {
      await client.connect();
      await client.ping();
    }

    const connection = {
      client,
      created: Date.now(),
      lastUsed: Date.now(),
      inUse: false,
      healthy: true,
      commandsExecuted: 0,
      totalLatency: 0
    };

    this.connections.push(connection);
    this.activeConnections++;

    return connection;
  }

  async acquire() {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    // Find available connection
    const availableConnection = this.connections.find(conn => !conn.inUse && conn.healthy);

    if (availableConnection) {
      availableConnection.inUse = true;
      availableConnection.lastUsed = Date.now();
      return availableConnection.client;
    }

    // Create new connection if under max
    if (this.activeConnections < this.config.maxConnections) {
      const connection = await this.createConnection();
      connection.inUse = true;
      connection.lastUsed = Date.now();
      return connection.client;
    }

    // Wait for available connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingClients.indexOf({ resolve, reject });
        if (index > -1) {
          this.waitingClients.splice(index, 1);
        }
        reject(new Error('Connection acquire timeout'));
      }, this.config.acquireTimeoutMillis);

      this.waitingClients.push({
        resolve: (client) => {
          clearTimeout(timeout);
          resolve(client);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  release(client) {
    const connection = this.connections.find(conn => conn.client === client);
    if (connection) {
      connection.inUse = false;
      connection.lastUsed = Date.now();

      // Check if there are waiting clients
      if (this.waitingClients.length > 0) {
        const waiting = this.waitingClients.shift();
        connection.inUse = true;
        waiting.resolve(client);
      }
    }
  }

  handleConnectionError(connection, error) {
    connection.healthy = false;
    connection.inUse = false;
    this.activeConnections--;

    // Remove connection and create new one if needed
    const index = this.connections.indexOf(connection);
    if (index > -1) {
      this.connections.splice(index, 1);
    }

    // Attempt to recreate connection
    setTimeout(() => {
      if (!this.isShuttingDown && this.activeConnections < this.config.minConnections) {
        this.createConnection().catch(console.error);
      }
    }, this.config.createRetryIntervalMillis);
  }

  getStatus() {
    return {
      totalConnections: this.connections.length,
      activeConnections: this.activeConnections,
      inUseConnections: this.connections.filter(conn => conn.inUse).length,
      waitingClients: this.waitingClients.length,
      healthyConnections: this.connections.filter(conn => conn.healthy).length
    };
  }

  async shutdown() {
    this.isShuttingDown = true;

    // Close all connections
    const closePromises = this.connections.map(async (connection) => {
      try {
        await connection.client.quit();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    });

    await Promise.all(closePromises);
    this.connections = [];
    this.activeConnections = 0;

    // Reject waiting clients
    this.waitingClients.forEach(waiting => {
      waiting.reject(new Error('Connection pool is shutting down'));
    });
    this.waitingClients = [];
  }
}

/**
 * Audit logger for security events
 */
class AuditLogger {
  constructor() {
    this.logFile = process.env.REDIS_AUDIT_LOG || './logs/redis-audit.log';
  }

  async log(event) {
    try {
      const logEntry = JSON.stringify(event) + '\n';

      // In production, this would write to a secure logging system
      if (process.env.NODE_ENV === 'production') {
        // Write to secure audit log
        await this.writeToSecureLog(logEntry);
      } else {
        // Development logging
        console.log('[AUDIT]', logEntry.trim());
      }
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  async writeToSecureLog(logEntry) {
    // Implement secure logging based on your infrastructure
    // This could be a database, SIEM system, or secure file system
    const fs = require('fs').promises;
    await fs.appendFile(this.logFile, logEntry);
  }
}

/**
 * Performance metrics collector for Redis operations
 */
class PerformanceMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.metrics = {
      operations: {
        total: 0,
        successful: 0,
        failed: 0,
        latencies: [],
        commandCounts: new Map()
      },
      connections: {
        created: 0,
        destroyed: 0,
        reused: 0,
        poolHits: 0,
        poolMisses: 0
      },
      memory: {
        compressionSavings: 0,
        totalBytesTransferred: 0,
        compressionRatio: 0
      },
      pipeline: {
        batchesProcessed: 0,
        totalCommands: 0,
        avgBatchSize: 0
      },
      errors: [],
      startTime: Date.now()
    };
  }

  recordOperation(command, latency, success, bytesTransferred = 0, compressionSavings = 0) {
    this.metrics.operations.total++;
    this.metrics.operations.latencies.push(latency);

    const count = this.metrics.operations.commandCounts.get(command) || 0;
    this.metrics.operations.commandCounts.set(command, count + 1);

    if (success) {
      this.metrics.operations.successful++;
    } else {
      this.metrics.operations.failed++;
    }

    this.metrics.memory.totalBytesTransferred += bytesTransferred;
    this.metrics.memory.compressionSavings += compressionSavings;

    if (compressionSavings > 0 && bytesTransferred > 0) {
      this.metrics.memory.compressionRatio =
        (bytesTransferred - compressionSavings) / bytesTransferred;
    }
  }

  recordConnectionEvent(event) {
    if (this.metrics.connections[event] !== undefined) {
      this.metrics.connections[event]++;
    }
  }

  recordPipelineBatch(batchSize, latency) {
    this.metrics.pipeline.batchesProcessed++;
    this.metrics.pipeline.totalCommands += batchSize;
    this.metrics.pipeline.avgBatchSize =
      this.metrics.pipeline.totalCommands / this.metrics.pipeline.batchesProcessed;
  }

  recordError(error, command, context = {}) {
    this.metrics.errors.push({
      error: error.message,
      command,
      context,
      timestamp: Date.now()
    });
  }

  getReport() {
    const latencies = this.metrics.operations.latencies;
    const totalOps = this.metrics.operations.total;
    const uptime = Date.now() - this.metrics.startTime;

    return {
      summary: {
        uptime: uptime,
        totalOperations: totalOps,
        successRate: totalOps > 0 ? (this.metrics.operations.successful / totalOps) * 100 : 0,
        errorRate: totalOps > 0 ? (this.metrics.operations.failed / totalOps) * 100 : 0,
        throughput: totalOps > 0 ? (totalOps / uptime) * 1000 : 0 // ops per second
      },
      latency: {
        avg: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        p50: this.percentile(latencies, 50),
        p95: this.percentile(latencies, 95),
        p99: this.percentile(latencies, 99),
        max: latencies.length > 0 ? Math.max(...latencies) : 0
      },
      connections: { ...this.metrics.connections },
      memory: { ...this.metrics.memory },
      pipeline: { ...this.metrics.pipeline },
      topCommands: this.getTopCommands(),
      recentErrors: this.metrics.errors.slice(-10)
    };
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getTopCommands() {
    const commands = Array.from(this.metrics.operations.commandCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return commands.map(([command, count]) => ({ command, count }));
  }
}

/**
 * Pipeline manager for batch Redis operations
 */
class PipelineManager {
  constructor(config) {
    this.config = config;
    this.pipelines = new Map();
    this.batchSize = config.pipelineBatchSize || 100;
    this.flushInterval = config.pipelineFlushInterval || 5;
  }

  async executeBatch(client, operations) {
    if (!this.config.enablePipelining || operations.length === 0) {
      return this.executeSequentially(client, operations);
    }

    const pipeline = client.multi();
    const startTime = Date.now();

    try {
      for (const op of operations) {
        pipeline[op.command](...op.args);
      }

      const results = await pipeline.exec();
      const latency = Date.now() - startTime;

      return {
        success: true,
        results,
        latency,
        operationsCount: operations.length
      };
    } catch (error) {
      return {
        success: false,
        error,
        latency: Date.now() - startTime,
        operationsCount: operations.length
      };
    }
  }

  async executeSequentially(client, operations) {
    const startTime = Date.now();
    const results = [];

    try {
      for (const op of operations) {
        const result = await client[op.command](...op.args);
        results.push(result);
      }

      return {
        success: true,
        results,
        latency: Date.now() - startTime,
        operationsCount: operations.length
      };
    } catch (error) {
      return {
        success: false,
        error,
        latency: Date.now() - startTime,
        operationsCount: operations.length
      };
    }
  }
}

/**
 * Compression engine for Redis data
 */
class CompressionEngine {
  constructor(config) {
    this.config = config;
    this.compressionThreshold = config.compressionThreshold || 1024;
    this.compressionEnabled = config.enableCompression !== false;
  }

  async compress(data) {
    if (!this.compressionEnabled) {
      return { compressed: false, data: Buffer.from(JSON.stringify(data)) };
    }

    try {
      const jsonString = JSON.stringify(data);

      if (jsonString.length < this.compressionThreshold) {
        return { compressed: false, data: Buffer.from(jsonString) };
      }

      const { createGzip } = await import('zlib');
      const { promisify } = await import('util');
      const gzip = promisify(createGzip);

      const originalBuffer = Buffer.from(jsonString);
      const compressedBuffer = await gzip(originalBuffer);

      return {
        compressed: true,
        data: compressedBuffer,
        originalSize: originalBuffer.length,
        compressedSize: compressedBuffer.length,
        compressionRatio: compressedBuffer.length / originalBuffer.length
      };
    } catch (error) {
      // Fallback to uncompressed data
      return { compressed: false, data: Buffer.from(JSON.stringify(data)) };
    }
  }

  async decompress(data, metadata = {}) {
    if (!metadata.compressed) {
      return JSON.parse(data.toString());
    }

    try {
      const { createGunzip } = await import('zlib');
      const { promisify } = await import('util');
      const gunzip = promisify(createGunzip);

      const decompressedBuffer = await gunzip(data);
      return JSON.parse(decompressedBuffer.toString());
    } catch (error) {
      throw new Error(`Failed to decompress data: ${error.message}`);
    }
  }
}

export default SecureRedisClient;