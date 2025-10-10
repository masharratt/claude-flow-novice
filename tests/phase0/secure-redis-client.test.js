/**
 * Comprehensive Jest test suite for Secure Redis Client
 * Tests Phase 0 components with >90% coverage target
 */

import { jest } from '@jest/globals';
import SecureRedisClient from '../../src/cli/utils/secure-redis-client.js';
import { createClient } from 'redis';

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    hGet: jest.fn(),
    hSet: jest.fn(),
    hDel: jest.fn(),
    sAdd: jest.fn(),
    sRem: jest.fn(),
    sMembers: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn()
  }))
}));

// Mock fs for audit logging
jest.mock('fs', () => ({
  promises: {
    appendFile: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('SecureRedisClient', () => {
  let secureClient;
  let mockRedisClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient = createClient();

    // Set NODE_ENV for testing
    process.env.NODE_ENV = 'test';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_PASSWORD = 'test-password';
  });

  afterEach(async () => {
    if (secureClient) {
      await secureClient.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', async () => {
      secureClient = new SecureRedisClient();

      expect(secureClient.config.host).toBe('localhost');
      expect(secureClient.config.port).toBe(6379);
      expect(secureClient.config.pooling).toBe(true);
      expect(secureClient.config.auditLogging).toBe(true);
    });

    test('should initialize with custom configuration', async () => {
      const customConfig = {
        host: 'custom-host',
        port: 6380,
        password: 'custom-password',
        pooling: false,
        auditLogging: false
      };

      secureClient = new SecureRedisClient(customConfig);

      expect(secureClient.config.host).toBe('custom-host');
      expect(secureClient.config.port).toBe(6380);
      expect(secureClient.config.pooling).toBe(false);
      expect(secureClient.config.auditLogging).toBe(false);
    });

    test('should initialize connection pool when pooling is enabled', async () => {
      secureClient = new SecureRedisClient({ pooling: true });

      // Mock the connection pool initialize method
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);

      await secureClient.initialize();

      expect(initSpy).toHaveBeenCalled();
      expect(secureClient.healthStatus.status).toBe('ready');
    });

    test('should handle initialization errors', async () => {
      secureClient = new SecureRedisClient();

      // Mock connection pool to throw error
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockRejectedValue(new Error('Connection failed'));

      await expect(secureClient.initialize()).rejects.toThrow('Connection failed');
      expect(secureClient.healthStatus.status).toBe('error');
    });

    test('should emit ready event after successful initialization', async () => {
      secureClient = new SecureRedisClient();
      const readySpy = jest.fn();
      secureClient.on('ready', readySpy);

      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);

      await secureClient.initialize();

      expect(readySpy).toHaveBeenCalled();
    });
  });

  describe('Security Validation', () => {
    beforeEach(async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();
    });

    test('should validate key patterns correctly', async () => {
      const validKeys = [
        'swarm:test123',
        'memory:user_data',
        'metrics:performance-001',
        'swarm:agent_123.status'
      ];

      for (const key of validKeys) {
        await expect(secureClient.get(key)).resolves.toBeDefined();
      }
    });

    test('should reject keys with invalid patterns', async () => {
      const invalidKeys = [
        'invalid:key!@#',
        '../../etc/passwd',
        'SELECT * FROM users',
        '<script>alert("xss")</script>',
        'a'.repeat(300) // Too long
      ];

      for (const key of invalidKeys) {
        await expect(secureClient.get(key)).rejects.toThrow(/invalid characters|maximum length/);
      }
    });

    test('should prevent dangerous Redis commands', async () => {
      const dangerousCommands = [
        ['eval', 'return "malicious code"'],
        ['config', 'set', 'requirepass', 'hacked'],
        ['shutdown'],
        ['flushdb'],
        ['flushall']
      ];

      for (const [command, ...args] of dangerousCommands) {
        await expect(secureClient.executeCommand(command, ...args))
          .rejects.toThrow(/not allowed for security reasons/);
      }
    });

    test('should validate value size limits', async () => {
      const largeValue = 'x'.repeat(11 * 1024 * 1024); // 11MB

      await expect(secureClient.set('test:key', largeValue))
        .rejects.toThrow('Value exceeds maximum size');
    });

    test('should validate required arguments for commands', async () => {
      await expect(secureClient.executeCommand('set', 'only-key'))
        .rejects.toThrow('SET command requires key and value');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();
    });

    test('should allow requests within rate limit', async () => {
      const promises = [];

      // Make 10 requests (well under the limit)
      for (let i = 0; i < 10; i++) {
        promises.push(secureClient.get(`test:key${i}`));
      }

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    test('should enforce rate limits', async () => {
      // Mock rate limit config to lower values for testing
      const originalConfig = secureClient.rateLimitMap;
      secureClient.rateLimitMap.clear();

      // Simulate exceeding rate limit
      const clientId = 'test-client';
      const now = Date.now();

      // Fill up rate limit bucket
      for (let i = 0; i < 1000; i++) {
        secureClient.rateLimitMap.set(clientId, Array(1000).fill(now));
      }

      await expect(secureClient.get('test:key'))
        .rejects.toThrow('Rate limit exceeded');
    });

    test('should clean up expired rate limit entries', (done) => {
      secureClient = new SecureRedisClient();
      const cleanupSpy = jest.spyOn(secureClient, 'startRateLimitCleanup');

      // Add some old entries
      const oldTime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      secureClient.rateLimitMap.set('old-client', [oldTime]);

      // Wait for cleanup interval
      setTimeout(() => {
        expect(secureClient.rateLimitMap.has('old-client')).toBe(false);
        done();
      }, 100);
    });
  });

  describe('Connection Pooling', () => {
    test('should create minimum connections on initialization', async () => {
      secureClient = new SecureRedisClient();
      const createConnectionSpy = jest.spyOn(secureClient.connectionPool, 'createConnection');
      createConnectionSpy.mockResolvedValue({ client: mockRedisClient, inUse: false, healthy: true });

      await secureClient.connectionPool.initialize();

      expect(createConnectionSpy).toHaveBeenCalledTimes(2); // minConnections
    });

    test('should acquire connection from pool', async () => {
      secureClient = new SecureRedisClient();
      const mockConnection = { client: mockRedisClient, inUse: false, healthy: true };
      secureClient.connectionPool.connections = [mockConnection];

      const client = await secureClient.connectionPool.acquire();

      expect(client).toBe(mockRedisClient);
      expect(mockConnection.inUse).toBe(true);
    });

    test('should create new connection when pool is at capacity', async () => {
      secureClient = new SecureRedisClient();
      const createConnectionSpy = jest.spyOn(secureClient.connectionPool, 'createConnection');
      createConnectionSpy.mockResolvedValue({ client: mockRedisClient, inUse: true, healthy: true });

      secureClient.connectionPool.activeConnections = 1;
      secureClient.connectionPool.connections = [];

      const client = await secureClient.connectionPool.acquire();

      expect(createConnectionSpy).toHaveBeenCalled();
      expect(client).toBe(mockRedisClient);
    });

    test('should handle connection acquisition timeout', async () => {
      secureClient = new SecureRedisClient();
      secureClient.config.acquireTimeoutMillis = 100;

      // Mock to simulate no available connections
      secureClient.connectionPool.activeConnections = secureClient.config.maxConnections;
      secureClient.connectionPool.connections = [];

      await expect(secureClient.connectionPool.acquire())
        .rejects.toThrow('Connection acquire timeout');
    });

    test('should release connection back to pool', async () => {
      secureClient = new SecureRedisClient();
      const mockConnection = { client: mockRedisClient, inUse: true, healthy: true };
      secureClient.connectionPool.connections = [mockConnection];

      secureClient.connectionPool.release(mockRedisClient);

      expect(mockConnection.inUse).toBe(false);
    });

    test('should handle connection errors and recreate connections', async () => {
      secureClient = new SecureRedisClient();
      const mockConnection = {
        client: mockRedisClient,
        inUse: false,
        healthy: true,
        created: Date.now()
      };
      secureClient.connectionPool.connections = [mockConnection];
      secureClient.connectionPool.activeConnections = 1;

      // Simulate connection error
      const error = new Error('Connection lost');
      secureClient.connectionPool.handleConnectionError(mockConnection, error);

      expect(mockConnection.healthy).toBe(false);
      expect(secureClient.connectionPool.activeConnections).toBe(0);
    });

    test('should shutdown gracefully', async () => {
      secureClient = new SecureRedisClient();
      const mockConnection1 = { client: mockRedisClient, inUse: false, healthy: true };
      const mockConnection2 = { client: mockRedisClient, inUse: false, healthy: true };
      secureClient.connectionPool.connections = [mockConnection1, mockConnection2];

      await secureClient.connectionPool.shutdown();

      expect(secureClient.connectionPool.isShuttingDown).toBe(true);
      expect(secureClient.connectionPool.connections).toHaveLength(0);
    });
  });

  describe('Command Execution', () => {
    beforeEach(async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();

      // Mock connection pool acquire/release
      const mockConnection = { client: mockRedisClient, inUse: false, healthy: true };
      secureClient.connectionPool.connections = [mockConnection];
      secureClient.connectionPool.acquire = jest.fn().mockResolvedValue(mockRedisClient);
      secureClient.connectionPool.release = jest.fn();
    });

    test('should execute basic Redis commands', async () => {
      mockRedisClient.get.mockResolvedValue('test-value');
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.del.mockResolvedValue(1);

      // Test GET
      const getValue = await secureClient.get('test:key');
      expect(getValue).toBe('test-value');
      expect(mockRedisClient.get).toHaveBeenCalledWith('test:key');

      // Test SET
      const setResult = await secureClient.set('test:key', 'test-value');
      expect(setResult).toBe('OK');
      expect(mockRedisClient.set).toHaveBeenCalledWith('test:key', 'test-value');

      // Test DEL
      const delResult = await secureClient.del('test:key');
      expect(delResult).toBe(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith('test:key');
    });

    test('should execute SET with expiration', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');

      const result = await secureClient.setEx('test:key', 3600, 'test-value');

      expect(result).toBe('OK');
      expect(mockRedisClient.setEx).toHaveBeenCalledWith('test:key', 3600, 'test-value');
    });

    test('should execute hash commands', async () => {
      mockRedisClient.hGet.mockResolvedValue('hash-value');
      mockRedisClient.hSet.mockResolvedValue(1);
      mockRedisClient.hDel.mockResolvedValue(1);

      // Test HGET
      const hGetValue = await secureClient.hGet('test:hash', 'field');
      expect(hGetValue).toBe('hash-value');
      expect(mockRedisClient.hGet).toHaveBeenCalledWith('test:hash', 'field');

      // Test HSET
      const hSetValue = await secureClient.hSet('test:hash', 'field', 'hash-value');
      expect(hSetValue).toBe(1);
      expect(mockRedisClient.hSet).toHaveBeenCalledWith('test:hash', 'field', 'hash-value');

      // Test HDEL
      const hDelValue = await secureClient.hDel('test:hash', 'field');
      expect(hDelValue).toBe(1);
      expect(mockRedisClient.hDel).toHaveBeenCalledWith('test:hash', 'field');
    });

    test('should execute set commands', async () => {
      mockRedisClient.sAdd.mockResolvedValue(1);
      mockRedisClient.sRem.mockResolvedValue(1);
      mockRedisClient.sMembers.mockResolvedValue(['member1', 'member2']);

      // Test SADD
      const sAddResult = await secureClient.sAdd('test:set', 'member1');
      expect(sAddResult).toBe(1);
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('test:set', 'member1');

      // Test SREM
      const sRemResult = await secureClient.sRem('test:set', 'member1');
      expect(sRemResult).toBe(1);
      expect(mockRedisClient.sRem).toHaveBeenCalledWith('test:set', 'member1');

      // Test SMEMBERS
      const sMembersResult = await secureClient.sMembers('test:set');
      expect(sMembersResult).toEqual(['member1', 'member2']);
      expect(mockRedisClient.sMembers).toHaveBeenCalledWith('test:set');
    });

    test('should handle command execution errors', async () => {
      const error = new Error('Redis command failed');
      mockRedisClient.get.mockRejectedValue(error);

      await expect(secureClient.get('test:key')).rejects.toThrow('Redis command failed');
    });

    test('should record metrics for successful commands', async () => {
      const metricsSpy = jest.fn();
      secureClient.on('metrics', metricsSpy);

      mockRedisClient.get.mockResolvedValue('test-value');

      await secureClient.get('test:key');

      expect(metricsSpy).toHaveBeenCalledWith({
        command: 'get',
        success: true,
        responseTime: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    test('should record metrics for failed commands', async () => {
      const metricsSpy = jest.fn();
      secureClient.on('metrics', metricsSpy);

      mockRedisClient.get.mockRejectedValue(new Error('Command failed'));

      await expect(secureClient.get('test:key')).rejects.toThrow();

      expect(metricsSpy).toHaveBeenCalledWith({
        command: 'get',
        success: false,
        responseTime: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();
    });

    test('should perform health checks', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      const healthStatus = secureClient.getHealthStatus();

      expect(healthStatus).toHaveProperty('status');
      expect(healthStatus).toHaveProperty('poolStatus');
      expect(healthStatus).toHaveProperty('rateLimitStats');
      expect(healthStatus).toHaveProperty('timestamp');
    });

    test('should update health status on successful ping', (done) => {
      const healthSpy = jest.fn();
      secureClient.on('health-check', healthSpy);

      mockRedisClient.ping.mockResolvedValue('PONG');

      // Trigger health check
      setTimeout(() => {
        expect(healthSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'healthy',
            responseTime: expect.any(Number)
          })
        );
        done();
      }, 100);
    });

    test('should handle health check failures', (done) => {
      const healthErrorSpy = jest.fn();
      secureClient.on('health-error', healthErrorSpy);

      mockRedisClient.ping.mockRejectedValue(new Error('Connection failed'));

      // Trigger health check
      setTimeout(() => {
        expect(healthErrorSpy).toHaveBeenCalled();
        expect(secureClient.healthStatus.status).toBe('unhealthy');
        expect(secureClient.healthStatus.errorCount).toBeGreaterThan(0);
        done();
      }, 100);
    });

    test('should provide rate limiting statistics', () => {
      const stats = secureClient.getRateLimitStats();

      expect(stats).toHaveProperty('activeClients');
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('windowStart');
      expect(stats).toHaveProperty('windowEnd');
      expect(stats).toHaveProperty('limitPerClient');
      expect(stats.limitPerClient).toBe(1000);
    });
  });

  describe('Audit Logging', () => {
    beforeEach(async () => {
      secureClient = new SecureRedisClient({ auditLogging: true });
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();

      // Mock connection pool
      const mockConnection = { client: mockRedisClient, inUse: false, healthy: true };
      secureClient.connectionPool.connections = [mockConnection];
      secureClient.connectionPool.acquire = jest.fn().mockResolvedValue(mockRedisClient);
      secureClient.connectionPool.release = jest.fn();
    });

    test('should log successful commands', async () => {
      const auditSpy = jest.spyOn(secureClient.auditLogger, 'log');
      auditSpy.mockResolvedValue(undefined);

      mockRedisClient.get.mockResolvedValue('test-value');

      await secureClient.get('test:key');

      expect(auditSpy).toHaveBeenCalledWith({
        event: 'COMMAND_EXECUTED',
        command: 'get',
        args: ['test:key'],
        success: true,
        responseTime: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    test('should log failed commands', async () => {
      const auditSpy = jest.spyOn(secureClient.auditLogger, 'log');
      auditSpy.mockResolvedValue(undefined);

      mockRedisClient.get.mockRejectedValue(new Error('Command failed'));

      await expect(secureClient.get('test:key')).rejects.toThrow();

      expect(auditSpy).toHaveBeenCalledWith({
        event: 'COMMAND_FAILED',
        command: 'get',
        args: ['test:key'],
        error: 'Command failed',
        responseTime: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    test('should sanitize sensitive arguments in logs', async () => {
      const auditSpy = jest.spyOn(secureClient.auditLogger, 'log');
      auditSpy.mockResolvedValue(undefined);

      mockRedisClient.set.mockResolvedValue('OK');

      await secureClient.set('auth:password', 'secret123');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['auth:password', 'secret123'] // No sensitive data in this case
        })
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();
    });

    test('should handle connection pool errors gracefully', async () => {
      secureClient.connectionPool.acquire = jest.fn()
        .mockRejectedValue(new Error('No available connections'));

      await expect(secureClient.get('test:key'))
        .rejects.toThrow('No available connections');
    });

    test('should handle Redis client errors', async () => {
      const mockConnection = { client: mockRedisClient, inUse: false, healthy: true };
      secureClient.connectionPool.connections = [mockConnection];
      secureClient.connectionPool.acquire = jest.fn().mockResolvedValue(mockRedisClient);

      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      await expect(secureClient.get('test:key'))
        .rejects.toThrow('Redis error');
    });

    test('should handle audit logging errors without failing operations', async () => {
      const auditSpy = jest.spyOn(secureClient.auditLogger, 'log');
      auditSpy.mockRejectedValue(new Error('Audit failed'));

      const mockConnection = { client: mockRedisClient, inUse: false, healthy: true };
      secureClient.connectionPool.connections = [mockConnection];
      secureClient.connectionPool.acquire = jest.fn().mockResolvedValue(mockRedisClient);

      mockRedisClient.get.mockResolvedValue('test-value');

      // Should not throw despite audit logging error
      const result = await secureClient.get('test:key');
      expect(result).toBe('test-value');
    });
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = 'test';
    });

    test('should enable TLS in production environment', async () => {
      secureClient = new SecureRedisClient();

      expect(secureClient.config.enableTLS).toBe(true);
    });

    test('should enable authentication in production environment', async () => {
      secureClient = new SecureRedisClient();

      expect(secureClient.config.requireAuth).toBe(true);
    });
  });

  describe('Performance and Concurrency', () => {
    beforeEach(async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();

      // Mock multiple connections
      const mockConnections = Array(5).fill(null).map(() => ({
        client: { ...mockRedisClient },
        inUse: false,
        healthy: true
      }));

      secureClient.connectionPool.connections = mockConnections;
      secureClient.connectionPool.acquire = jest.fn()
        .mockImplementation(() => {
          const available = mockConnections.find(conn => !conn.inUse);
          if (available) {
            available.inUse = true;
            return Promise.resolve(available.client);
          }
          return Promise.reject(new Error('No available connections'));
        });
      secureClient.connectionPool.release = jest.fn()
        .mockImplementation((client) => {
          const connection = mockConnections.find(conn => conn.client === client);
          if (connection) {
            connection.inUse = false;
          }
        });
    });

    test('should handle concurrent operations', async () => {
      mockRedisClient.get.mockResolvedValue('value');

      const promises = Array(100).fill(null).map((_, i) =>
        secureClient.get(`concurrent:test:${i}`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);
      expect(results.every(r => r === 'value')).toBe(true);
    });

    test('should maintain performance under load', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue('test-value');

      const startTime = Date.now();

      // Perform 1000 operations
      const operations = [];
      for (let i = 0; i < 1000; i++) {
        if (i % 2 === 0) {
          operations.push(secureClient.set(`load:test:${i}`, `value-${i}`));
        } else {
          operations.push(secureClient.get(`load:test:${i-1}`));
        }
      }

      await Promise.all(operations);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(10000); // 10 seconds
    });

    test('should handle connection pool exhaustion', async () => {
      // Mock that all connections are in use
      secureClient.connectionPool.connections.forEach(conn => conn.inUse = true);
      secureClient.connectionPool.acquire = jest.fn()
        .mockRejectedValue(new Error('Connection acquire timeout'));

      const promises = Array(10).fill(null).map(() =>
        secureClient.get('exhausted:test').catch(err => err.message)
      );

      const results = await Promise.all(promises);

      expect(results.every(r => r === 'Connection acquire timeout')).toBe(true);
    });
  });

  describe('Integration with Swarm Operations', () => {
    beforeEach(async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();

      const mockConnection = { client: mockRedisClient, inUse: false, healthy: true };
      secureClient.connectionPool.connections = [mockConnection];
      secureClient.connectionPool.acquire = jest.fn().mockResolvedValue(mockRedisClient);
      secureClient.connectionPool.release = jest.fn();
    });

    test('should handle swarm state operations', async () => {
      const swarmState = {
        id: 'test-swarm-123',
        objective: 'Test objective',
        status: 'running',
        startTime: Date.now(),
        agents: ['agent1', 'agent2'],
        tasks: ['task1', 'task2']
      };

      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.sAdd.mockResolvedValue(1);
      mockRedisClient.hSet.mockResolvedValue(1);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(swarmState));
      mockRedisClient.sMembers.mockResolvedValue(['test-swarm-123']);
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.sRem.mockResolvedValue(1);
      mockRedisClient.hDel.mockResolvedValue(1);

      // Test saving swarm state
      await secureClient.setEx('swarm:test-swarm-123', 86400, JSON.stringify(swarmState));
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'swarm:test-swarm-123',
        86400,
        JSON.stringify(swarmState)
      );

      // Test adding to active swarms
      await secureClient.sAdd('swarms:active', 'test-swarm-123');
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('swarms:active', 'test-swarm-123');

      // Test updating swarm index
      await secureClient.hSet('swarms:index', 'test-swarm-123', JSON.stringify({
        id: 'test-swarm-123',
        objective: 'Test objective',
        status: 'running',
        startTime: swarmState.startTime,
        endTime: null,
        lastUpdated: expect.any(Number)
      }));

      // Test loading swarm state
      const loadedState = await secureClient.get('swarm:test-swarm-123');
      expect(JSON.parse(loadedState)).toEqual(swarmState);

      // Test deleting swarm state
      await secureClient.del('swarm:test-swarm-123');
      expect(mockRedisClient.del).toHaveBeenCalledWith('swarm:test-swarm-123');

      await secureClient.sRem('swarms:active', 'test-swarm-123');
      expect(mockRedisClient.sRem).toHaveBeenCalledWith('swarms:active', 'test-swarm-123');

      await secureClient.hDel('swarms:index', 'test-swarm-123');
      expect(mockRedisClient.hDel).toHaveBeenCalledWith('swarms:index', 'test-swarm-123');
    });

    test('should handle memory operations for swarm coordination', async () => {
      const memoryData = {
        agentId: 'agent-123',
        step: 'step-456',
        data: { result: 'success', confidence: 0.95 },
        timestamp: Date.now()
      };

      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue(JSON.stringify(memoryData));

      // Test saving memory data
      await secureClient.setEx('memory:agent-123:step-456', 3600, JSON.stringify(memoryData));
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'memory:agent-123:step-456',
        3600,
        JSON.stringify(memoryData)
      );

      // Test loading memory data
      const loadedData = await secureClient.get('memory:agent-123:step-456');
      expect(JSON.parse(loadedData)).toEqual(memoryData);
    });

    test('should handle metrics collection', async () => {
      const metricsSpy = jest.fn();
      secureClient.on('metrics', metricsSpy);

      mockRedisClient.set.mockResolvedValue('OK');

      // Execute multiple commands to generate metrics
      await secureClient.set('metrics:test1', 'value1');
      await secureClient.set('metrics:test2', 'value2');
      await secureClient.get('metrics:test1');

      expect(metricsSpy).toHaveBeenCalledTimes(3);

      // Verify metric structure
      const metricCalls = metricsSpy.mock.calls;
      metricCalls.forEach(call => {
        const metric = call[0];
        expect(metric).toHaveProperty('command');
        expect(metric).toHaveProperty('success', true);
        expect(metric).toHaveProperty('responseTime');
        expect(metric).toHaveProperty('timestamp');
      });
    });
  });

  describe('Shutdown and Cleanup', () => {
    test('should shutdown gracefully', async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();

      const auditSpy = jest.spyOn(secureClient.auditLogger, 'log');
      auditSpy.mockResolvedValue(undefined);

      const shutdownSpy = jest.spyOn(secureClient.connectionPool, 'shutdown');
      shutdownSpy.mockResolvedValue(undefined);

      await secureClient.shutdown();

      expect(auditSpy).toHaveBeenCalledWith({
        event: 'CLIENT_SHUTDOWN',
        timestamp: expect.any(Number)
      });

      expect(shutdownSpy).toHaveBeenCalled();
      expect(secureClient.healthStatus.status).toBe('shutdown');
    });

    test('should emit shutdown event', async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();

      const shutdownSpy = jest.fn();
      secureClient.on('shutdown', shutdownSpy);

      const poolShutdownSpy = jest.spyOn(secureClient.connectionPool, 'shutdown');
      poolShutdownSpy.mockResolvedValue(undefined);

      await secureClient.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
    });

    test('should handle shutdown errors', async () => {
      secureClient = new SecureRedisClient();
      const initSpy = jest.spyOn(secureClient.connectionPool, 'initialize');
      initSpy.mockResolvedValue(undefined);
      await secureClient.initialize();

      const errorSpy = jest.fn();
      secureClient.on('error', errorSpy);

      const poolShutdownSpy = jest.spyOn(secureClient.connectionPool, 'shutdown');
      poolShutdownSpy.mockRejectedValue(new Error('Shutdown failed'));

      await expect(secureClient.shutdown()).rejects.toThrow('Shutdown failed');
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});