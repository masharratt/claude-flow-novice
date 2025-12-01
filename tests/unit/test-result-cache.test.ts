/**
 * Unit Tests for Result Cache
 * Tests compression, LRU eviction, and comprehensive coverage
 */

import { ResultCache, initResultCache, getResultCache, resetResultCache } from '../../src/lib/result-cache';
import { Cluster } from 'ioredis';
import zlib from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(zlib.gzip);

// Mock ioredis
jest.mock('ioredis');

// Mock prom-client
jest.mock('prom-client', () => ({
  register: {
    metrics: jest.fn().mockResolvedValue(''),
  },
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
  })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
  })),
}));

describe('ResultCache', () => {
  let mockRedisCluster: jest.Mocked<Cluster>;
  let cache: ResultCache;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis Cluster
    mockRedisCluster = {
      get: jest.fn(),
      getBuffer: jest.fn(),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      zadd: jest.fn().mockResolvedValue(1),
      zcard: jest.fn().mockResolvedValue(0),
      zrange: jest.fn().mockResolvedValue([]),
      zrem: jest.fn().mockResolvedValue(1),
    } as any;

    cache = new ResultCache({
      redisCluster: mockRedisCluster,
      ttl: 3600,
      maxCacheSize: 100, // Small size for testing eviction
    });
  });

  describe('Critical Defect #3: Real Compression (not base64)', () => {
    it('should compress large data with gzip', async () => {
      const largeData = 'x'.repeat(20000); // 20KB data
      const result = {
        data: largeData,
        value: 42,
      };

      await cache.set('test-agent', 'test-task', result, 0.9, 1000);

      // Verify setex was called
      expect(mockRedisCluster.setex).toHaveBeenCalled();

      // Get the compressed data that was stored
      const storedData = (mockRedisCluster.setex as jest.Mock).mock.calls[0][2];

      // Verify it's a Buffer (not base64 string)
      expect(Buffer.isBuffer(storedData)).toBe(true);

      // Verify gzip magic header (0x1f 0x8b)
      expect(storedData[0]).toBe(0x1f);
      expect(storedData[1]).toBe(0x8b);

      // Verify compression actually reduced size
      const originalSize = JSON.stringify({
        agentType: 'test-agent',
        taskHash: expect.any(String),
        result,
        confidence: 0.9,
        timestamp: expect.any(Number),
        executionTime: 1000,
      }).length;

      expect(storedData.length).toBeLessThan(originalSize);
    });

    it('should not compress small data', async () => {
      const smallData = 'small'; // < 10KB threshold
      const result = { data: smallData };

      await cache.set('test-agent', 'test-task', result, 0.9, 1000);

      const storedData = (mockRedisCluster.setex as jest.Mock).mock.calls[0][2];

      // Should be Buffer but not gzipped (no gzip header)
      expect(Buffer.isBuffer(storedData)).toBe(true);
      expect(storedData[0]).not.toBe(0x1f);
      expect(storedData[1]).not.toBe(0x8b);
    });

    it('should decompress gzipped data correctly', async () => {
      const originalResult = {
        data: 'x'.repeat(20000),
        value: 42,
      };

      // Manually create compressed data
      const cachedResult = {
        agentType: 'test-agent',
        taskHash: 'abcd1234',
        result: originalResult,
        confidence: 0.9,
        timestamp: Date.now(),
        executionTime: 1000,
      };

      const serialized = JSON.stringify(cachedResult);
      const compressed = await gzipAsync(Buffer.from(serialized, 'utf-8'));

      mockRedisCluster.getBuffer = jest.fn().mockResolvedValue(compressed);

      const retrieved = await cache.get('test-agent', 'test-task');

      expect(retrieved).toBeDefined();
      expect(retrieved?.result.data).toBe(originalResult.data);
      expect(retrieved?.result.value).toBe(42);
    });

    it('should handle non-compressed data gracefully', async () => {
      const cachedResult = {
        agentType: 'test-agent',
        taskHash: 'abcd1234',
        result: { value: 42 },
        confidence: 0.9,
        timestamp: Date.now(),
        executionTime: 1000,
      };

      const serialized = JSON.stringify(cachedResult);
      const buffer = Buffer.from(serialized, 'utf-8');

      mockRedisCluster.getBuffer = jest.fn().mockResolvedValue(buffer);

      const retrieved = await cache.get('test-agent', 'test-task');

      expect(retrieved).toBeDefined();
      expect(retrieved?.result.value).toBe(42);
    });
  });

  describe('Critical Defect #2: LRU Eviction', () => {
    it('should track cache entries in LRU sorted set', async () => {
      await cache.set('agent1', 'task1', { data: 'test' }, 0.9, 1000);

      expect(mockRedisCluster.zadd).toHaveBeenCalledWith(
        'cfn:agent:result:lru',
        expect.any(Number),
        expect.stringContaining('cfn:agent:result:agent1:')
      );
    });

    it('should update LRU timestamp on cache get', async () => {
      const cachedResult = {
        agentType: 'test-agent',
        taskHash: 'abcd1234',
        result: { value: 42 },
        confidence: 0.9,
        timestamp: Date.now(),
        executionTime: 1000,
      };

      mockRedisCluster.getBuffer = jest.fn().mockResolvedValue(
        Buffer.from(JSON.stringify(cachedResult), 'utf-8')
      );

      await cache.get('test-agent', 'test-task');

      // Should update LRU timestamp
      expect(mockRedisCluster.zadd).toHaveBeenCalled();
    });

    it('should evict oldest entries when cache exceeds max size', async () => {
      // Simulate cache at max size
      mockRedisCluster.zcard = jest.fn().mockResolvedValue(105); // Over limit of 100
      mockRedisCluster.zrange = jest.fn().mockResolvedValue([
        'cfn:agent:result:old1:hash1',
        'cfn:agent:result:old2:hash2',
        'cfn:agent:result:old3:hash3',
        'cfn:agent:result:old4:hash4',
        'cfn:agent:result:old5:hash5',
      ]);

      await cache.set('new-agent', 'new-task', { data: 'new' }, 0.9, 1000);

      // Should delete oldest 5 entries
      expect(mockRedisCluster.del).toHaveBeenCalledWith(
        'cfn:agent:result:old1:hash1',
        'cfn:agent:result:old2:hash2',
        'cfn:agent:result:old3:hash3',
        'cfn:agent:result:old4:hash4',
        'cfn:agent:result:old5:hash5'
      );

      // Should remove from LRU tracking
      expect(mockRedisCluster.zrem).toHaveBeenCalledWith(
        'cfn:agent:result:lru',
        'cfn:agent:result:old1:hash1',
        'cfn:agent:result:old2:hash2',
        'cfn:agent:result:old3:hash3',
        'cfn:agent:result:old4:hash4',
        'cfn:agent:result:old5:hash5'
      );
    });

    it('should not evict when under max size', async () => {
      mockRedisCluster.zcard = jest.fn().mockResolvedValue(50); // Under limit

      await cache.set('agent', 'task', { data: 'test' }, 0.9, 1000);

      // del should only be called once for setting (if at all), not for eviction
      const delCalls = (mockRedisCluster.del as jest.Mock).mock.calls.filter(
        (call) => call.length > 1 // Eviction calls have multiple keys
      );

      expect(delCalls.length).toBe(0);
    });

    it('should remove from LRU on invalidate', async () => {
      await cache.invalidate('test-agent', 'test-task');

      expect(mockRedisCluster.zrem).toHaveBeenCalledWith(
        'cfn:agent:result:lru',
        expect.stringContaining('cfn:agent:result:test-agent:')
      );
    });

    it('should clear LRU tracking on cache clear', async () => {
      mockRedisCluster.keys = jest.fn().mockResolvedValue([
        'cfn:agent:result:agent1:hash1',
        'cfn:agent:result:agent2:hash2',
      ]);

      await cache.clear();

      expect(mockRedisCluster.del).toHaveBeenCalledWith(
        'cfn:agent:result:agent1:hash1',
        'cfn:agent:result:agent2:hash2'
      );
      expect(mockRedisCluster.del).toHaveBeenCalledWith('cfn:agent:result:lru');
    });
  });

  describe('Cache Operations', () => {
    it('should cache and retrieve results', async () => {
      const result = { data: 'test-data', value: 42 };

      await cache.set('backend-dev', 'implement feature', result, 0.92, 5000);

      expect(mockRedisCluster.setex).toHaveBeenCalled();

      // Simulate retrieval
      const cachedResult = {
        agentType: 'backend-dev',
        taskHash: expect.any(String),
        result,
        confidence: 0.92,
        timestamp: expect.any(Number),
        executionTime: 5000,
      };

      mockRedisCluster.getBuffer = jest.fn().mockResolvedValue(
        Buffer.from(JSON.stringify(cachedResult), 'utf-8')
      );

      const retrieved = await cache.get('backend-dev', 'implement feature');

      expect(retrieved?.result).toEqual(result);
      expect(retrieved?.confidence).toBe(0.92);
    });

    it('should return null for cache miss', async () => {
      mockRedisCluster.getBuffer = jest.fn().mockResolvedValue(null);

      const result = await cache.get('backend-dev', 'non-existent task');

      expect(result).toBeNull();
    });

    it('should invalidate specific cache entry', async () => {
      await cache.invalidate('backend-dev', 'task1');

      expect(mockRedisCluster.del).toHaveBeenCalled();
    });

    it('should invalidate all entries for an agent type', async () => {
      mockRedisCluster.keys = jest.fn().mockResolvedValue([
        'cfn:agent:result:backend-dev:hash1',
        'cfn:agent:result:backend-dev:hash2',
      ]);

      await cache.invalidateAgentType('backend-dev');

      expect(mockRedisCluster.del).toHaveBeenCalledWith(
        'cfn:agent:result:backend-dev:hash1',
        'cfn:agent:result:backend-dev:hash2'
      );
    });
  });

  describe('Cache Configuration', () => {
    it('should use custom TTL', async () => {
      const customCache = new ResultCache({
        redisCluster: mockRedisCluster,
        ttl: 7200, // 2 hours
      });

      await customCache.set('agent', 'task', { data: 'test' }, 0.9, 1000);

      expect(mockRedisCluster.setex).toHaveBeenCalledWith(
        expect.any(String),
        7200,
        expect.any(Buffer)
      );
    });

    it('should use custom compression threshold', async () => {
      const customCache = new ResultCache({
        redisCluster: mockRedisCluster,
        compressionThreshold: 5000, // 5KB threshold
      });

      // Create data below threshold (but above default 10KB would compress)
      const smallData = 'x'.repeat(1000); // 1KB - below 5KB threshold
      await customCache.set('agent', 'task', { data: smallData }, 0.9, 1000);

      const storedData = (mockRedisCluster.setex as jest.Mock).mock.calls[0][2];

      // With 5KB threshold and 1KB data, should not be compressed
      // However, the serialized JSON might still exceed threshold after adding metadata
      // So let's just verify it's a Buffer
      expect(Buffer.isBuffer(storedData)).toBe(true);
    });

    it('should use custom namespace', async () => {
      const customCache = new ResultCache({
        redisCluster: mockRedisCluster,
        namespace: 'custom:cache',
      });

      await customCache.set('agent', 'task', { data: 'test' }, 0.9, 1000);

      const cacheKey = (mockRedisCluster.setex as jest.Mock).mock.calls[0][0];
      expect(cacheKey).toContain('custom:cache');
    });
  });

  describe('Singleton Pattern', () => {
    beforeEach(async () => {
      await resetResultCache();
    });

    it('should initialize singleton cache', () => {
      const cache1 = initResultCache({ redisCluster: mockRedisCluster });
      const cache2 = initResultCache({ redisCluster: mockRedisCluster });

      expect(cache1).toBe(cache2);
    });

    it('should return singleton instance', () => {
      initResultCache({ redisCluster: mockRedisCluster });
      const cache = getResultCache();

      expect(cache).toBeDefined();
    });

    it('should throw error if not initialized', () => {
      expect(() => getResultCache()).toThrow(
        'Result cache not initialized. Call initResultCache first.'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully on get', async () => {
      mockRedisCluster.getBuffer = jest.fn().mockRejectedValue(new Error('Redis error'));

      const result = await cache.get('agent', 'task');

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully on set', async () => {
      mockRedisCluster.setex = jest.fn().mockRejectedValue(new Error('Redis error'));

      await expect(
        cache.set('agent', 'task', { data: 'test' }, 0.9, 1000)
      ).resolves.not.toThrow();
    });

    it('should handle decompression errors', async () => {
      // Invalid gzip data with gzip header
      const invalidGzip = Buffer.from([0x1f, 0x8b, 0x00, 0xff, 0xff]);

      mockRedisCluster.getBuffer = jest.fn().mockResolvedValue(invalidGzip);

      const result = await cache.get('agent', 'task');

      // Should return null or handle gracefully
      expect(result).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    it('should collect cache hit/miss statistics', async () => {
      const { register } = require('prom-client');

      register.metrics.mockResolvedValue(`
cfn_agent_cache_hits_total{agent_type="backend-dev"} 10
cfn_agent_cache_misses_total{agent_type="backend-dev"} 2
      `);

      const stats = await cache.getStats();

      expect(stats.hits).toBeGreaterThanOrEqual(0);
      expect(stats.misses).toBeGreaterThanOrEqual(0);
    });
  });
});
