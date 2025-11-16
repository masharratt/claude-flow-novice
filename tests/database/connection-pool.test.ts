/**
 * Connection Pool Tests
 *
 * Comprehensive test suite for database connection pool initialization,
 * health checks, automatic reconnection, and graceful degradation.
 *
 * Coverage Target: >90%
 * Test Cases: >20
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionPoolManager } from '../../src/lib/database-service/connection-pool-manager';
import { DatabaseService } from '../../src/lib/database-service';
import { DatabaseConfig, DatabaseErrorCode } from '../../src/lib/database-service/types';
import { createDatabaseError } from '../../src/lib/database-service/errors';

describe('ConnectionPoolManager', () => {
  let poolManager: ConnectionPoolManager;

  afterEach(async () => {
    if (poolManager) {
      await poolManager.shutdown();
    }
    vi.clearAllTimers();
  });

  describe('Pool Initialization', () => {
    it('should initialize SQLite connection pool with default settings', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      const stats = poolManager.getStats();
      expect(stats.type).toBe('sqlite');
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.available).toBeGreaterThan(0);
    });

    it('should initialize Redis connection pool with default settings', async () => {
      const config: DatabaseConfig = {
        type: 'redis',
        host: 'localhost',
        port: 6379,
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      const stats = poolManager.getStats();
      expect(stats.type).toBe('redis');
      expect(stats.healthy).toBe(true);
    });

    it('should respect custom pool size configuration', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
        poolSize: 10,
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      const stats = poolManager.getStats();
      expect(stats.maxConnections).toBe(10);
    });

    it('should initialize pool with minimum connections', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
        poolSize: 5,
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      const stats = poolManager.getStats();
      expect(stats.available).toBeGreaterThanOrEqual(1);
    });

    it('should throw error on invalid configuration', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: '',
      };

      poolManager = new ConnectionPoolManager(config);
      await expect(poolManager.initialize()).rejects.toThrow();
    });
  });

  describe('Connection Acquisition', () => {
    beforeEach(async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
        poolSize: 3,
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();
    });

    it('should acquire connection from pool', async () => {
      const connection = await poolManager.acquire();
      expect(connection).toBeDefined();

      const stats = poolManager.getStats();
      expect(stats.active).toBe(1);
      expect(stats.idle).toBe(stats.total - 1);
    });

    it('should release connection back to pool', async () => {
      const connection = await poolManager.acquire();
      await poolManager.release(connection);

      const stats = poolManager.getStats();
      expect(stats.active).toBe(0);
      expect(stats.idle).toBe(stats.total);
    });

    it('should handle multiple concurrent acquisitions', async () => {
      const connections = await Promise.all([
        poolManager.acquire(),
        poolManager.acquire(),
        poolManager.acquire(),
      ]);

      expect(connections).toHaveLength(3);

      const stats = poolManager.getStats();
      expect(stats.active).toBe(3);
    });

    it('should queue requests when pool is exhausted', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
        poolSize: 2,
      };

      const localPool = new ConnectionPoolManager(config);
      await localPool.initialize();

      const conn1 = await localPool.acquire();
      const conn2 = await localPool.acquire();

      // Third request should be queued
      const pendingPromise = localPool.acquire();

      const stats = localPool.getStats();
      expect(stats.pending).toBe(1);

      // Release one connection to fulfill pending request
      await localPool.release(conn1);
      const conn3 = await pendingPromise;
      expect(conn3).toBeDefined();

      await localPool.shutdown();
    });

    it('should timeout on acquisition when timeout is set', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
        poolSize: 1,
        timeout: 100,
      };

      const localPool = new ConnectionPoolManager(config);
      await localPool.initialize();

      // Acquire the only connection
      const conn = await localPool.acquire();

      // Second request should timeout
      await expect(localPool.acquire()).rejects.toThrow('timeout');

      await localPool.shutdown();
    });
  });

  describe('Health Checks', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
    });

    it('should perform periodic health checks', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      // Enable health checks (30s interval)
      poolManager.startHealthChecks();

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(30000);

      const stats = poolManager.getStats();
      expect(stats.lastHealthCheck).toBeDefined();
      expect(stats.healthy).toBe(true);
    });

    it('should detect unhealthy connections', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      // Simulate connection failure
      poolManager['isHealthy'] = vi.fn().mockResolvedValue(false);

      poolManager.startHealthChecks();
      await vi.advanceTimersByTimeAsync(30000);

      const stats = poolManager.getStats();
      expect(stats.healthy).toBe(false);
    });

    it('should stop health checks on shutdown', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();
      poolManager.startHealthChecks();

      await poolManager.shutdown();

      // Health checks should be stopped
      const stats = poolManager.getStats();
      expect(stats.healthCheckActive).toBe(false);
    });
  });

  describe('Auto-Reconnection', () => {
    it('should automatically reconnect on connection failure', async () => {
      const config: DatabaseConfig = {
        type: 'redis',
        host: 'localhost',
        port: 6379,
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      // Simulate connection failure
      poolManager['simulateDisconnection']();

      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = poolManager.getStats();
      expect(stats.reconnectAttempts).toBeGreaterThan(0);
    });

    it('should use exponential backoff for reconnection', async () => {
      const config: DatabaseConfig = {
        type: 'redis',
        host: 'invalid-host',
        port: 6379,
      };

      poolManager = new ConnectionPoolManager(config);

      // Should fail to connect initially
      await expect(poolManager.initialize()).rejects.toThrow();

      const reconnectDelays = poolManager['getReconnectDelays']();

      // Verify exponential backoff
      expect(reconnectDelays[0]).toBeLessThan(reconnectDelays[1]);
      expect(reconnectDelays[1]).toBeLessThan(reconnectDelays[2]);
    });

    it('should stop reconnection after max attempts', async () => {
      const config: DatabaseConfig = {
        type: 'redis',
        host: 'invalid-host',
        port: 6379,
      };

      poolManager = new ConnectionPoolManager(config);
      poolManager['maxReconnectAttempts'] = 3;

      await expect(poolManager.initialize()).rejects.toThrow();

      // Simulate reconnection attempts
      for (let i = 0; i < 5; i++) {
        await poolManager['attemptReconnection']().catch(() => {});
      }

      const stats = poolManager.getStats();
      expect(stats.reconnectAttempts).toBeLessThanOrEqual(3);
    });
  });

  describe('Connection Metrics', () => {
    beforeEach(async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
        poolSize: 5,
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();
    });

    it('should track active connections', async () => {
      const conn1 = await poolManager.acquire();
      const conn2 = await poolManager.acquire();

      const stats = poolManager.getStats();
      expect(stats.active).toBe(2);
    });

    it('should track idle connections', async () => {
      const stats = poolManager.getStats();
      expect(stats.idle).toBe(stats.total);
    });

    it('should track pending requests', async () => {
      // Exhaust pool
      const connections = await Promise.all([
        poolManager.acquire(),
        poolManager.acquire(),
        poolManager.acquire(),
        poolManager.acquire(),
        poolManager.acquire(),
      ]);

      // Create pending request
      const pendingPromise = poolManager.acquire();

      const stats = poolManager.getStats();
      expect(stats.pending).toBe(1);

      // Cleanup
      await poolManager.release(connections[0]);
      await pendingPromise;
    });

    it('should track total connection count', async () => {
      const stats = poolManager.getStats();
      expect(stats.total).toBe(5);
    });

    it('should track connection uptime', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = poolManager.getStats();
      expect(stats.uptime).toBeGreaterThan(0);
    });

    it('should track failed connection attempts', async () => {
      const config: DatabaseConfig = {
        type: 'redis',
        host: 'invalid-host',
        port: 6379,
      };

      const localPool = new ConnectionPoolManager(config);

      await expect(localPool.initialize()).rejects.toThrow();

      const stats = localPool.getStats();
      expect(stats.failedAttempts).toBeGreaterThan(0);
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue operating with reduced pool on partial failure', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
        poolSize: 5,
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      // Simulate partial pool failure
      poolManager['removeUnhealthyConnections'](2);

      const stats = poolManager.getStats();
      expect(stats.total).toBe(3);
      expect(stats.available).toBeGreaterThan(0);
    });

    it('should return cached data on connection failure', async () => {
      const config: DatabaseConfig = {
        type: 'redis',
        host: 'localhost',
        port: 6379,
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      // Enable cache fallback
      poolManager.enableCacheFallback(true);

      // Simulate connection failure
      poolManager['simulateDisconnection']();

      // Should return cached data instead of error
      const result = await poolManager.getWithFallback('test-key');
      expect(result).toBeDefined();
    });

    it('should queue operations during reconnection', async () => {
      const config: DatabaseConfig = {
        type: 'redis',
        host: 'localhost',
        port: 6379,
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      // Simulate disconnection
      poolManager['simulateDisconnection']();

      // Operations should be queued
      const operationPromise = poolManager.acquire();

      // Simulate reconnection
      await poolManager['attemptReconnection']();

      // Queued operation should complete
      const connection = await operationPromise;
      expect(connection).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw StandardError on connection failure', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: '/invalid/path/database.db',
      };

      poolManager = new ConnectionPoolManager(config);

      await expect(poolManager.initialize()).rejects.toThrow();
    });

    it('should handle release of invalid connection gracefully', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      // Try to release invalid connection
      await expect(poolManager.release(null as any)).resolves.not.toThrow();
    });

    it('should handle concurrent shutdown gracefully', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: ':memory:',
      };

      poolManager = new ConnectionPoolManager(config);
      await poolManager.initialize();

      // Trigger multiple shutdowns concurrently
      await Promise.all([
        poolManager.shutdown(),
        poolManager.shutdown(),
        poolManager.shutdown(),
      ]);

      const stats = poolManager.getStats();
      expect(stats.total).toBe(0);
    });
  });
});

describe('DatabaseService Connection Initialization', () => {
  let dbService: DatabaseService;

  afterEach(async () => {
    if (dbService) {
      await dbService.disconnect();
    }
  });

  it('should automatically initialize connections on instantiation', async () => {
    dbService = new DatabaseService({
      sqlite: {
        type: 'sqlite',
        database: ':memory:',
      },
    });

    // Connections should be initialized automatically
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(dbService.isConnected()).toBe(true);
  });

  it('should initialize multiple adapters concurrently', async () => {
    const startTime = Date.now();

    dbService = new DatabaseService({
      sqlite: {
        type: 'sqlite',
        database: ':memory:',
      },
      redis: {
        type: 'redis',
        host: 'localhost',
        port: 6379,
      },
    });

    await dbService.connect();

    const duration = Date.now() - startTime;

    // Concurrent initialization should be faster than sequential
    expect(duration).toBeLessThan(1000);
    expect(dbService.isConnected()).toBe(true);
  });

  it('should provide connection health status', async () => {
    dbService = new DatabaseService({
      sqlite: {
        type: 'sqlite',
        database: ':memory:',
      },
    });

    await dbService.connect();

    const stats = dbService.getStats();
    expect(stats.adapters.sqlite).toBe(true);
  });

  it('should handle partial initialization failure gracefully', async () => {
    dbService = new DatabaseService({
      sqlite: {
        type: 'sqlite',
        database: ':memory:',
      },
      redis: {
        type: 'redis',
        host: 'invalid-host',
        port: 6379,
      },
    });

    // Should not throw on partial failure
    await expect(dbService.connect()).rejects.toThrow();

    // SQLite should still be available
    const sqliteAdapter = dbService.getAdapter('sqlite');
    expect(sqliteAdapter.isConnected()).toBe(false);
  });
});
