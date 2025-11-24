/**
 * Multi-System Query Engine Test Suite
 *
 * Comprehensive tests for correlation key query layer.
 * Part of Task 3.3: Query Correlation Key Layer
 *
 * Coverage targets:
 * - Single-system queries
 * - Multi-system joins
 * - Cache effectiveness
 * - Priority ordering
 * - Performance (<2s requirement)
 * - Error handling
 * - Target: 90%+ coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseService } from '../src/lib/database-service';
import { MultiSystemQuery, createMultiSystemQuery } from '../src/lib/multi-system-query';
import { CorrelationCache, createCorrelationCache } from '../src/lib/correlation-cache';
import {
  buildCorrelationKey,
  buildWildcardPattern,
  validateCorrelationKey,
  isValidCorrelationKey,
  getEntityTypes,
  buildBatch,
  parseBatch,
  matchesWildcard,
  filterByPattern,
  ENTITY_TYPE_MAP,
} from '../src/lib/database-service/correlation';

// Mock database service
class MockDatabaseService {
  private data: Map<string, any> = new Map();
  private adapters: Map<string, any> = new Map();

  constructor() {
    // Setup mock adapters
    this.adapters.set('redis', this.createMockAdapter('redis'));
    this.adapters.set('sqlite', this.createMockAdapter('sqlite'));
    this.adapters.set('postgres', this.createMockAdapter('postgres'));
  }

  private createMockAdapter(type: string) {
    return {
      get: async (key: string) => {
        return this.data.get(`${type}:${key}`);
      },
      set: async (key: string, value: any) => {
        this.data.set(`${type}:${key}`, value);
      },
      query: vi.fn(),
    };
  }

  getAdapter(type: string) {
    return this.adapters.get(type);
  }

  // Helper to set mock data
  setMockData(system: string, key: string, value: any) {
    this.data.set(`${system}:${key}`, value);
  }

  clearMockData() {
    this.data.clear();
  }
}

describe('Correlation Key Builder', () => {
  describe('buildCorrelationKey', () => {
    it('should build basic correlation key', () => {
      const key = buildCorrelationKey({
        type: 'task',
        id: 'task-123',
      });

      expect(key).toBe('task:task-123');
    });

    it('should build correlation key with entity', () => {
      const key = buildCorrelationKey({
        type: 'task',
        id: 'task-123',
        entity: 'agent',
      });

      expect(key).toBe('task:task-123:agent');
    });

    it('should build correlation key with entity and subtype', () => {
      const key = buildCorrelationKey({
        type: 'task',
        id: 'task-123',
        entity: 'agent',
        subtype: 'backend-developer',
      });

      expect(key).toBe('task:task-123:agent:backend-developer');
    });
  });

  describe('buildWildcardPattern', () => {
    it('should build wildcard pattern with all wildcards', () => {
      const pattern = buildWildcardPattern({
        type: '*',
        id: '*',
      });

      expect(pattern).toBe('*:*');
    });

    it('should build wildcard pattern with specific type', () => {
      const pattern = buildWildcardPattern({
        type: 'task',
        id: '*',
        entity: 'agent',
      });

      expect(pattern).toBe('task:*:agent');
    });

    it('should build wildcard pattern with specific ID', () => {
      const pattern = buildWildcardPattern({
        type: '*',
        id: 'task-123',
      });

      expect(pattern).toBe('*:task-123');
    });
  });

  describe('validateCorrelationKey', () => {
    it('should validate correct correlation key', () => {
      const errors = validateCorrelationKey('task:task-123');
      expect(errors).toHaveLength(0);
    });

    it('should detect invalid format (missing parts)', () => {
      const errors = validateCorrelationKey('task');
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_FORMAT');
    });

    it('should detect invalid type', () => {
      const errors = validateCorrelationKey('invalid:task-123');
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_TYPE');
    });

    it('should detect empty ID', () => {
      const errors = validateCorrelationKey('task:');
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('MISSING_REQUIRED');
    });

    it('should detect invalid entity for type', () => {
      const errors = validateCorrelationKey('task:task-123:invalid-entity');
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_PATTERN');
    });
  });

  describe('isValidCorrelationKey', () => {
    it('should return true for valid key', () => {
      expect(isValidCorrelationKey('task:task-123')).toBe(true);
      expect(isValidCorrelationKey('agent:agent-456')).toBe(true);
      expect(isValidCorrelationKey('skill:skill-789')).toBe(true);
    });

    it('should return false for invalid key', () => {
      expect(isValidCorrelationKey('invalid')).toBe(false);
      expect(isValidCorrelationKey('task')).toBe(false);
      expect(isValidCorrelationKey('task:')).toBe(false);
    });
  });

  describe('getEntityTypes', () => {
    it('should return entity types for task', () => {
      const types = getEntityTypes('task');
      expect(types).toEqual(['agent', 'skill', 'artifact', 'event']);
    });

    it('should return entity types for agent', () => {
      const types = getEntityTypes('agent');
      expect(types).toEqual(['execution', 'result', 'metadata']);
    });

    it('should return entity types for skill', () => {
      const types = getEntityTypes('skill');
      expect(types).toEqual(['invocation', 'result', 'metadata']);
    });
  });

  describe('buildBatch', () => {
    it('should build multiple correlation keys', () => {
      const keys = buildBatch([
        { type: 'task', id: 'task-1', entity: 'agent' },
        { type: 'task', id: 'task-1', entity: 'skill' },
        { type: 'agent', id: 'agent-1' },
      ]);

      expect(keys).toEqual([
        'task:task-1:agent',
        'task:task-1:skill',
        'agent:agent-1',
      ]);
    });
  });

  describe('parseBatch', () => {
    it('should parse multiple correlation keys', () => {
      const keys = parseBatch([
        'task:task-1:agent',
        'task:task-1:skill',
        'invalid',
      ]);

      expect(keys).toHaveLength(2);
      expect(keys[0]).toEqual({ type: 'task', id: 'task-1', entity: 'agent', subtype: undefined });
      expect(keys[1]).toEqual({ type: 'task', id: 'task-1', entity: 'skill', subtype: undefined });
    });
  });

  describe('matchesWildcard', () => {
    it('should match exact type and wildcard ID', () => {
      expect(matchesWildcard('task:task-123:agent', {
        type: 'task',
        id: '*',
        entity: 'agent',
      })).toBe(true);
    });

    it('should match wildcard type and exact ID', () => {
      expect(matchesWildcard('task:task-123', {
        type: '*',
        id: 'task-123',
      })).toBe(true);
    });

    it('should not match different type', () => {
      expect(matchesWildcard('agent:agent-123', {
        type: 'task',
      })).toBe(false);
    });

    it('should not match different entity', () => {
      expect(matchesWildcard('task:task-123:skill', {
        type: 'task',
        id: 'task-123',
        entity: 'agent',
      })).toBe(false);
    });
  });

  describe('filterByPattern', () => {
    it('should filter keys by pattern', () => {
      const keys = [
        'task:task-1:agent',
        'task:task-1:skill',
        'task:task-2:agent',
        'agent:agent-1',
      ];

      const filtered = filterByPattern(keys, {
        type: 'task',
        id: 'task-1',
      });

      expect(filtered).toEqual([
        'task:task-1:agent',
        'task:task-1:skill',
      ]);
    });
  });
});

describe('CorrelationCache', () => {
  let cache: CorrelationCache;

  beforeEach(() => {
    cache = createCorrelationCache({
      maxSize: 10,
      ttlMinutes: 1,
    });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('Basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', { value: 'test' });
      const result = cache.get('key1');

      expect(result).toEqual({ value: 'test' });
    });

    it('should return undefined for missing keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should check key existence', () => {
      cache.set('key1', 'value');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value');
      expect(cache.has('key1')).toBe(true);

      cache.delete('key1');
      expect(cache.has('key1')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when at capacity', () => {
      // Fill cache to capacity
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      // Add one more (should evict key0)
      cache.set('key10', 'value10');

      expect(cache.has('key0')).toBe(false);
      expect(cache.has('key10')).toBe(true);
    });

    it('should update LRU order on access', () => {
      // Fill cache to capacity
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      // Access key0 (move to end)
      cache.get('key0');

      // Add one more (should evict key1, not key0)
      cache.set('key10', 'value10');

      expect(cache.has('key0')).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key10')).toBe(true);
    });
  });

  describe('TTL handling', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value', 0.001); // 0.001 minutes = 60ms

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cache.has('key1')).toBe(false);
    });

    it('should return undefined for expired entries', async () => {
      cache.set('key1', 'value', 0.001);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('Pattern invalidation', () => {
    it('should invalidate keys matching pattern', () => {
      cache.set('task:task-1:agent', 'value1');
      cache.set('task:task-1:skill', 'value2');
      cache.set('task:task-2:agent', 'value3');
      cache.set('agent:agent-1', 'value4');

      const count = cache.invalidatePattern('task:task-1:*');

      expect(count).toBe(2);
      expect(cache.has('task:task-1:agent')).toBe(false);
      expect(cache.has('task:task-1:skill')).toBe(false);
      expect(cache.has('task:task-2:agent')).toBe(true);
      expect(cache.has('agent:agent-1')).toBe(true);
    });
  });

  describe('Metrics tracking', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value');

      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key1'); // hit

      const metrics = cache.getMetrics();

      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(1);
      expect(metrics.hitRatio).toBeCloseTo(0.67, 2);
    });

    it('should track evictions', () => {
      for (let i = 0; i < 11; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      const metrics = cache.getMetrics();
      expect(metrics.evictions).toBe(1);
    });

    it('should track invalidations', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.delete('key1');
      cache.clear();

      const metrics = cache.getMetrics();
      expect(metrics.invalidations).toBe(2); // delete + clear
    });

    it('should reset metrics', () => {
      cache.set('key1', 'value');
      cache.get('key1');
      cache.get('key2');

      cache.resetMetrics();

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });
  });
});

describe('MultiSystemQuery', () => {
  let dbService: MockDatabaseService;
  let cache: CorrelationCache;
  let query: MultiSystemQuery;

  beforeEach(() => {
    dbService = new MockDatabaseService() as any;
    cache = createCorrelationCache({ maxSize: 100 });
    query = createMultiSystemQuery({
      dbService: dbService as any,
      cache,
      enableCache: true,
    });
  });

  afterEach(() => {
    dbService.clearMockData();
    cache.clear();
  });

  describe('Single-system queries', () => {
    it('should query single database', async () => {
      dbService.setMockData('redis', 'task:task-123', { id: 'task-123', name: 'Test Task' });

      const result = await query
        .forTask('task-123')
        .fromSystems(['redis'])
        .execute();

      expect(result.redis).toBeDefined();
      expect(result.merged).toHaveLength(1);
      expect(result.merged[0]).toEqual({ id: 'task-123', name: 'Test Task' });
    });

    it('should handle missing data', async () => {
      const result = await query
        .forTask('nonexistent')
        .fromSystems(['redis'])
        .execute();

      expect(result.redis).toBeUndefined();
      expect(result.merged).toHaveLength(0);
    });
  });

  describe('Multi-system joins', () => {
    it('should query multiple databases in parallel', async () => {
      dbService.setMockData('redis', 'task:task-123', { id: 'task-123', source: 'redis' });
      dbService.setMockData('sqlite', 'task:task-123', { id: 'task-123', source: 'sqlite' });
      dbService.setMockData('postgres', 'task:task-123', { id: 'task-123', source: 'postgres' });

      const result = await query
        .forTask('task-123')
        .fromSystems(['redis', 'sqlite', 'postgres'])
        .execute();

      expect(result.redis).toBeDefined();
      expect(result.sqlite).toBeDefined();
      expect(result.postgres).toBeDefined();
      expect(result.merged).toHaveLength(3);
    });

    it('should deduplicate merged results', async () => {
      // Same data in multiple databases
      const data = { id: 'task-123', name: 'Test' };
      dbService.setMockData('redis', 'task:task-123', data);
      dbService.setMockData('sqlite', 'task:task-123', data);

      const result = await query
        .forTask('task-123')
        .fromSystems(['redis', 'sqlite'])
        .execute();

      // Should deduplicate based on ID
      expect(result.merged).toHaveLength(1);
    });
  });

  describe('Cache integration', () => {
    it('should cache query results', async () => {
      dbService.setMockData('redis', 'task:task-123', { id: 'task-123', name: 'Test' });

      // First query (cache miss)
      const result1 = await query
        .forTask('task-123')
        .fromSystems(['redis'])
        .withCache(true)
        .execute();

      expect(result1.cacheHit).toBe(false);

      // Second query (cache hit)
      const result2 = await query
        .forTask('task-123')
        .fromSystems(['redis'])
        .withCache(true)
        .execute();

      expect(result2.cacheHit).toBe(true);
    });

    it('should respect cache disabled flag', async () => {
      dbService.setMockData('redis', 'task:task-123', { id: 'task-123' });

      await query
        .forTask('task-123')
        .withCache(false)
        .execute();

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });
  });

  describe('Priority ordering', () => {
    it('should use fastest priority (stop on first result)', async () => {
      dbService.setMockData('redis', 'task:task-123', { id: 'task-123', source: 'redis' });
      dbService.setMockData('sqlite', 'task:task-123', { id: 'task-123', source: 'sqlite' });

      const result = await query
        .forTask('task-123')
        .withPriority('fastest')
        .execute();

      // Should only have Redis result (fastest)
      expect(result.redis).toBeDefined();
      expect(result.sqlite).toBeUndefined();
      expect(result.merged).toHaveLength(1);
    });

    it('should use balanced priority (all systems in parallel)', async () => {
      dbService.setMockData('redis', 'task:task-123', { id: 'task-123', source: 'redis' });
      dbService.setMockData('sqlite', 'task:task-123', { id: 'task-123', source: 'sqlite' });

      const result = await query
        .forTask('task-123')
        .withPriority('balanced')
        .execute();

      expect(result.redis).toBeDefined();
      expect(result.sqlite).toBeDefined();
    });
  });

  describe('Performance requirements', () => {
    it('should complete simple queries in <2 seconds', async () => {
      dbService.setMockData('redis', 'task:task-123', { id: 'task-123' });

      const startTime = Date.now();
      const result = await query
        .forTask('task-123')
        .execute();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000);
      expect(result.executionTime).toBeLessThan(2000);
    });

    it('should complete multi-system queries in <2 seconds', async () => {
      dbService.setMockData('redis', 'task:task-123', { id: 'task-123' });
      dbService.setMockData('sqlite', 'task:task-123', { id: 'task-123' });
      dbService.setMockData('postgres', 'task:task-123', { id: 'task-123' });

      const result = await query
        .forTask('task-123')
        .fromSystems(['redis', 'sqlite', 'postgres'])
        .execute();

      expect(result.executionTime).toBeLessThan(2000);
    });
  });

  describe('Error handling', () => {
    it('should handle partial failures gracefully', async () => {
      dbService.setMockData('redis', 'task:task-123', { id: 'task-123', source: 'redis' });

      // Mock SQLite adapter to throw error
      const sqliteAdapter = dbService.getAdapter('sqlite');
      sqliteAdapter.get = vi.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await query
        .forTask('task-123')
        .fromSystems(['redis', 'sqlite'])
        .execute();

      // Should still have Redis data
      expect(result.redis).toBeDefined();
      expect(result.sqlite).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should validate query configuration', async () => {
      const invalidQuery = createMultiSystemQuery({
        dbService: dbService as any,
      });

      await expect(async () => {
        await invalidQuery
          .fromSystems([])
          .execute();
      }).rejects.toThrow();
    });
  });
});
