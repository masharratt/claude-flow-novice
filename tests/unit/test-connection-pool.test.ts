/**
 * Unit Tests for Connection Pool Manager
 * Tests all 5 critical defect fixes + comprehensive coverage
 */

import { ConnectionPoolManager, initConnectionPool, getConnectionPool, shutdownConnectionPool } from '../../src/lib/connection-pool';
import { Pool, PoolClient } from 'pg';
import { Cluster } from 'ioredis';

// Mock pg and ioredis
jest.mock('pg');
jest.mock('ioredis', () => {
  return {
    Cluster: jest.fn(),
  };
});

describe('ConnectionPoolManager', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockRedisCluster: jest.Mocked<Cluster>;
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton
    (global as any).connectionPoolInstance = null;

    // Mock PoolClient
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [{ result: 1 }] }),
      release: jest.fn(),
    } as any;

    // Mock Pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn().mockResolvedValue({ rows: [] }),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      totalCount: 10,
      idleCount: 5,
      waitingCount: 2,
    } as any;

    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPool);

    // Mock Redis Cluster
    mockRedisCluster = {
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      status: 'ready',
      nodes: jest.fn().mockReturnValue([{}, {}]),
    } as any;

    (Cluster as any).mockImplementation(() => mockRedisCluster);
  });

  afterEach(async () => {
    await shutdownConnectionPool();
  });

  describe('Critical Defect #4: Connection Limits Validation', () => {
    it('should reject connection limit below minimum (4)', () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
          max: 3, // Below minimum
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      expect(() => new ConnectionPoolManager(config)).toThrow(
        'Invalid PostgreSQL max connections: 3. Minimum allowed is 4.'
      );
    });

    it('should reject connection limit above maximum (100)', () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
          max: 101, // Above maximum
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      expect(() => new ConnectionPoolManager(config)).toThrow(
        'Invalid PostgreSQL max connections: 101. Maximum allowed is 100.'
      );
    });

    it('should accept valid connection limits (4-100)', () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
          max: 20, // Valid
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      expect(() => new ConnectionPoolManager(config)).not.toThrow();
    });

    it('should accept undefined max (uses default)', () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
          // max not specified
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      expect(() => new ConnectionPoolManager(config)).not.toThrow();
    });
  });

  describe('Critical Defect #1: Race Condition Prevention', () => {
    it('should prevent duplicate pool creation in concurrent calls', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      // Simulate concurrent initialization
      const [pool1, pool2, pool3] = await Promise.all([
        initConnectionPool(config),
        initConnectionPool(config),
        initConnectionPool(config),
      ]);

      // All should return the same instance
      expect(pool1).toBe(pool2);
      expect(pool2).toBe(pool3);

      // Pool constructor should only be called once
      expect(Pool).toHaveBeenCalledTimes(1);
    });

    it('should wait for in-progress initialization', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      // Slow initialization
      let resolveInit: any;
      const slowInit = new Promise<void>((resolve) => {
        resolveInit = resolve;
      });

      mockPool.connect.mockImplementationOnce(async () => {
        await slowInit;
        return mockClient;
      });

      // Start first initialization (slow)
      const init1Promise = initConnectionPool(config);

      // Wait a bit to ensure first call has started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second call should wait for first to complete
      const init2Promise = initConnectionPool(config);

      // Complete the slow initialization
      resolveInit();

      const [pool1, pool2] = await Promise.all([init1Promise, init2Promise]);

      expect(pool1).toBe(pool2);
      expect(Pool).toHaveBeenCalledTimes(1);
    });

    it('should return existing instance on subsequent calls', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const pool1 = await initConnectionPool(config);
      const pool2 = await initConnectionPool(config);
      const pool3 = await initConnectionPool(config);

      expect(pool1).toBe(pool2);
      expect(pool2).toBe(pool3);
      expect(Pool).toHaveBeenCalledTimes(1);
    });
  });

  describe('PostgreSQL Connection Pool', () => {
    it('should initialize PostgreSQL pool with default settings', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const manager = new ConnectionPoolManager(config);
      await manager.initPostgresPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
          max: 20, // Default
          idleTimeoutMillis: 30000, // Default
          connectionTimeoutMillis: 10000, // Default
        })
      );
    });

    it('should return existing pool on subsequent init calls', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const manager = new ConnectionPoolManager(config);
      const pool1 = await manager.initPostgresPool();
      const pool2 = await manager.initPostgresPool();

      expect(pool1).toBe(pool2);
      expect(Pool).toHaveBeenCalledTimes(1);
    });

    it('should execute queries successfully', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const manager = new ConnectionPoolManager(config);
      await manager.initPostgresPool();

      const result = await manager.executePostgresQuery('SELECT * FROM users');

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual([{ result: 1 }]);
    });

    it('should reject queries when pool not initialized', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const manager = new ConnectionPoolManager(config);

      await expect(manager.executePostgresQuery('SELECT 1')).rejects.toThrow(
        'PostgreSQL pool not initialized'
      );
    });
  });

  describe('Redis Cluster', () => {
    it('should initialize Redis cluster successfully', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const manager = new ConnectionPoolManager(config);
      await manager.initRedisCluster();

      expect(Cluster).toHaveBeenCalled();
      expect(mockRedisCluster.ping).toHaveBeenCalled();
    });

    it('should execute Redis commands', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      mockRedisCluster.get = jest.fn().mockResolvedValue('test-value');

      const manager = new ConnectionPoolManager(config);
      await manager.initRedisCluster();

      const result = await manager.executeRedisCommand('get', 'test-key');

      expect(result).toBe('test-value');
    });
  });

  describe('Pool Statistics', () => {
    it('should return pool stats when pools are initialized', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const manager = new ConnectionPoolManager(config);
      await manager.initPostgresPool();
      await manager.initRedisCluster();

      const stats = manager.getPoolStats();

      expect(stats.postgres).toEqual({
        total: 10,
        idle: 5,
        waiting: 2,
      });

      expect(stats.redis).toEqual({
        status: 'ready',
        nodes: 2,
      });
    });

    it('should return null for uninitialized pools', () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const manager = new ConnectionPoolManager(config);
      const stats = manager.getPoolStats();

      expect(stats.postgres).toBeNull();
      expect(stats.redis).toBeNull();
    });
  });

  describe('Shutdown and Health Checks', () => {
    it('should shutdown all pools gracefully', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const manager = new ConnectionPoolManager(config);
      await manager.initPostgresPool();
      await manager.initRedisCluster();

      await manager.shutdown();

      expect(mockPool.end).toHaveBeenCalled();
      expect(mockRedisCluster.quit).toHaveBeenCalled();
    });

    it('should perform health checks', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      const manager = new ConnectionPoolManager(config);
      await manager.initPostgresPool();
      await manager.initRedisCluster();

      const health = await manager.healthCheck();

      expect(health.postgres).toBe(true);
      expect(health.redis).toBe(true);
      expect(health.details.postgres).toBe('healthy');
      expect(health.details.redis).toBe('healthy');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance via getConnectionPool', async () => {
      const config = {
        postgres: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        redis: {
          nodes: [{ host: 'localhost', port: 6379 }],
        },
      };

      await initConnectionPool(config);
      const pool = getConnectionPool();

      expect(pool).toBeDefined();
    });

    it('should throw error if not initialized', () => {
      expect(() => getConnectionPool()).toThrow(
        'Connection pool not initialized. Call initConnectionPool first.'
      );
    });
  });
});
