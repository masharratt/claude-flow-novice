/**
 * Context Lookup Tests
 *
 * Comprehensive test suite for context retrieval and validation.
 * Tests single/batch lookup, validation logic, error handling, and caching.
 *
 * Test Coverage:
 * - Single context lookup
 * - Batch context lookup
 * - Context validation
 * - Iteration-specific retrieval
 * - Latest context retrieval
 * - Phase-specific retrieval
 * - Missing context handling
 * - Malformed data handling
 * - Cache functionality
 * - Error recovery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextLookup, createContextLookup, type LookupResult } from '../src/helpers/context-lookup';
import type { BroadcastContext } from '../src/helpers/context-injector';

/**
 * Mock Redis Coordinator
 */
class MockRedisCoordinator {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

/**
 * Mock Logger - tracks log calls for testing
 */
class MockLogger {
  logs: Array<{ level: string; message: string; data?: unknown }> = [];

  debug(message: string, data?: unknown): void {
    this.logs.push({ level: 'debug', message, data });
  }

  info(message: string, data?: unknown): void {
    this.logs.push({ level: 'info', message, data });
  }

  warn(message: string, data?: unknown): void {
    this.logs.push({ level: 'warn', message, data });
  }

  error(message: string, error?: unknown): void {
    this.logs.push({ level: 'error', message, data: error });
  }

  clear(): void {
    this.logs = [];
  }

  getLogs(level?: string): typeof this.logs {
    return level ? this.logs.filter((log) => log.level === level) : this.logs;
  }
}

/**
 * Create valid test context
 */
function createValidContext(overrides?: Partial<BroadcastContext>): BroadcastContext {
  return {
    taskId: 'task-123',
    iteration: 1,
    phase: 'loop3',
    mode: 'standard', // ExecutionMode: 'mvp' | 'standard' | 'enterprise'
    timestamp: new Date().toISOString(),
    contextVersion: '1.0.0',
    agentIds: ['agent-1', 'agent-2'],
    successCriteria: {
      criteria: ['Feature A implemented', 'Tests pass'],
      testPassRate: 0.95,
      consensusThreshold: 0.90
    },
    taskDescription: 'Implement feature A',
    ...overrides
  };
}

describe('ContextLookup', () => {
  let redis: MockRedisCoordinator;
  let logger: MockLogger;
  let lookup: ContextLookup;

  beforeEach(() => {
    redis = new MockRedisCoordinator();
    logger = new MockLogger();
    lookup = new ContextLookup(redis as any, logger as any, true);
  });

  afterEach(() => {
    redis.clear();
    logger.clear();
  });

  describe('lookupContext', () => {
    it('should retrieve context from Redis by task ID', async () => {
      const context = createValidContext();
      const redisKey = 'cfn_loop:task-123:context';

      await redis.set(redisKey, JSON.stringify(context));

      const result = await lookup.lookupContext('task-123');

      expect(result.found).toBe(true);
      expect(result.source).toBe('redis');
      expect(result.cached).toBe(false);
      expect(result.context.taskId).toBe('task-123');
      expect(result.context.iteration).toBe(1);
    });

    it('should retrieve iteration-specific context', async () => {
      const context = createValidContext({ iteration: 2 });
      const redisKey = 'cfn_loop:task-123:context:iteration:2';

      await redis.set(redisKey, JSON.stringify(context));

      const result = await lookup.lookupContext('task-123', 2);

      expect(result.found).toBe(true);
      expect(result.context.iteration).toBe(2);
    });

    it('should return not found when context does not exist', async () => {
      const result = await lookup.lookupContext('nonexistent-task');

      expect(result.found).toBe(false);
      expect(result.source).toBe('redis');
      expect(result.cached).toBe(false);
    });

    it('should return not found for malformed JSON', async () => {
      const redisKey = 'cfn_loop:task-123:context';
      await redis.set(redisKey, 'invalid json');

      const result = await lookup.lookupContext('task-123');

      expect(result.found).toBe(false);
    });

    it('should return not found for invalid context structure', async () => {
      const redisKey = 'cfn_loop:task-123:context';
      const invalidContext = { taskId: 'task-123' }; // Missing required fields

      await redis.set(redisKey, JSON.stringify(invalidContext));

      const result = await lookup.lookupContext('task-123');

      expect(result.found).toBe(false);
    });

    it('should use cache on subsequent calls', async () => {
      const context = createValidContext();
      const redisKey = 'cfn_loop:task-123:context';

      await redis.set(redisKey, JSON.stringify(context));

      // First call - from Redis
      const result1 = await lookup.lookupContext('task-123');
      expect(result1.source).toBe('redis');
      expect(result1.cached).toBe(false);

      // Second call - from cache
      const result2 = await lookup.lookupContext('task-123');
      expect(result2.source).toBe('cache');
      expect(result2.cached).toBe(true);

      // Both should have same context
      expect(result1.context).toEqual(result2.context);
    });

    it('should not use cache when disabled', async () => {
      lookup = new ContextLookup(redis, logger, false);
      const context = createValidContext();
      const redisKey = 'cfn_loop:task-123:context';

      await redis.set(redisKey, JSON.stringify(context));

      // Both calls should be from Redis
      const result1 = await lookup.lookupContext('task-123');
      expect(result1.source).toBe('redis');

      const result2 = await lookup.lookupContext('task-123');
      expect(result2.source).toBe('redis');
    });

    it('should throw error on Redis connection failure', async () => {
      const brokenRedis = {
        get: async () => {
          throw new Error('Redis connection failed');
        }
      };

      const brokenLookup = new ContextLookup(
        brokenRedis as any,
        logger as any,
        true
      );

      await expect(brokenLookup.lookupContext('task-123')).rejects.toThrow(
        'Failed to lookup context'
      );
    });
  });

  describe('lookupMultipleContexts', () => {
    it('should retrieve multiple contexts in batch', async () => {
      const context1 = createValidContext({ taskId: 'task-1' });
      const context2 = createValidContext({ taskId: 'task-2' });
      const context3 = createValidContext({ taskId: 'task-3' });

      await redis.set('cfn_loop:task-1:context', JSON.stringify(context1));
      await redis.set('cfn_loop:task-2:context', JSON.stringify(context2));
      await redis.set('cfn_loop:task-3:context', JSON.stringify(context3));

      const result = await lookup.lookupMultipleContexts([
        'task-1',
        'task-2',
        'task-3'
      ]);

      expect(result.total).toBe(3);
      expect(result.found).toBe(3);
      expect(result.missing).toHaveLength(0);
      expect(result.contexts.size).toBe(3);
      expect(result.contexts.get('task-1')).toEqual(context1);
      expect(result.contexts.get('task-2')).toEqual(context2);
      expect(result.contexts.get('task-3')).toEqual(context3);
    });

    it('should handle partially missing contexts', async () => {
      const context1 = createValidContext({ taskId: 'task-1' });

      await redis.set('cfn_loop:task-1:context', JSON.stringify(context1));
      // task-2 and task-3 not stored

      const result = await lookup.lookupMultipleContexts([
        'task-1',
        'task-2',
        'task-3'
      ]);

      expect(result.total).toBe(3);
      expect(result.found).toBe(1);
      expect(result.missing).toHaveLength(2);
      expect(result.missing).toContain('task-2');
      expect(result.missing).toContain('task-3');
    });

    it('should handle all missing contexts', async () => {
      const result = await lookup.lookupMultipleContexts([
        'task-1',
        'task-2',
        'task-3'
      ]);

      expect(result.total).toBe(3);
      expect(result.found).toBe(0);
      expect(result.missing).toHaveLength(3);
      expect(result.contexts.size).toBe(0);
    });

    it('should handle empty task ID array', async () => {
      const result = await lookup.lookupMultipleContexts([]);

      expect(result.total).toBe(0);
      expect(result.found).toBe(0);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('getLatestContext', () => {
    it('should retrieve latest context', async () => {
      const context = createValidContext({ iteration: 3 });
      const redisKey = 'cfn_loop:task-123:context:latest';

      await redis.set(redisKey, JSON.stringify(context));

      const result = await lookup.getLatestContext('task-123');

      expect(result).toBeDefined();
      expect(result?.taskId).toBe('task-123');
      expect(result?.iteration).toBe(3);
    });

    it('should return undefined when latest context not found', async () => {
      const result = await lookup.getLatestContext('nonexistent-task');

      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid latest context', async () => {
      const redisKey = 'cfn_loop:task-123:context:latest';
      await redis.set(redisKey, JSON.stringify({ taskId: 'task-123' }));

      const result = await lookup.getLatestContext('task-123');

      expect(result).toBeUndefined();
    });
  });

  describe('getContextByPhase', () => {
    it('should retrieve context by phase', async () => {
      const context = createValidContext({ phase: 'loop2' });
      const redisKey = 'cfn_loop:task-123:context:phase:loop2';

      await redis.set(redisKey, JSON.stringify(context));

      const result = await lookup.getContextByPhase('task-123', 'loop2');

      expect(result).toBeDefined();
      expect(result?.phase).toBe('loop2');
    });

    it('should return undefined when phase context not found', async () => {
      const result = await lookup.getContextByPhase('task-123', 'product-owner');

      expect(result).toBeUndefined();
    });

    it('should return undefined for all phases', async () => {
      const phases: Array<'loop3' | 'loop2' | 'product-owner' | 'iteration-prep'> = [
        'loop3',
        'loop2',
        'product-owner',
        'iteration-prep'
      ];

      for (const phase of phases) {
        const result = await lookup.getContextByPhase('task-123', phase);
        expect(result).toBeUndefined();
      }
    });
  });

  describe('validateContextStructure', () => {
    it('should validate correct context structure', () => {
      const context = createValidContext();

      const isValid = lookup.validateContextStructure(context);

      expect(isValid).toBe(true);
    });

    it('should reject null context', () => {
      const isValid = lookup.validateContextStructure(null);

      expect(isValid).toBe(false);
    });

    it('should reject non-object context', () => {
      const isValid = lookup.validateContextStructure('not an object');

      expect(isValid).toBe(false);
    });

    it('should reject context missing required fields', () => {
      const invalidContext = { taskId: 'task-123' }; // Missing other required fields

      const isValid = lookup.validateContextStructure(invalidContext);

      expect(isValid).toBe(false);
    });

    it('should reject context with invalid taskId type', () => {
      const invalid = createValidContext({ taskId: 123 as any });

      const isValid = lookup.validateContextStructure(invalid);

      expect(isValid).toBe(false);
    });

    it('should reject context with invalid iteration type', () => {
      const invalid = createValidContext({ iteration: '1' as any });

      const isValid = lookup.validateContextStructure(invalid);

      expect(isValid).toBe(false);
    });

    it('should reject context with zero iteration', () => {
      const invalid = createValidContext({ iteration: 0 });

      const isValid = lookup.validateContextStructure(invalid);

      expect(isValid).toBe(false);
    });

    it('should reject context with negative iteration', () => {
      const invalid = createValidContext({ iteration: -1 });

      const isValid = lookup.validateContextStructure(invalid);

      expect(isValid).toBe(false);
    });

    it('should reject context with invalid phase', () => {
      const invalid = createValidContext({ phase: 'invalid-phase' as any });

      const isValid = lookup.validateContextStructure(invalid);

      expect(isValid).toBe(false);
    });

    it('should reject context with invalid mode', () => {
      const invalid = createValidContext({ mode: 'invalid-mode' as any });

      const isValid = lookup.validateContextStructure(invalid);

      expect(isValid).toBe(false);
    });

    it('should reject context with invalid timestamp type', () => {
      const invalid = createValidContext({ timestamp: 123 as any });

      const isValid = lookup.validateContextStructure(invalid);

      expect(isValid).toBe(false);
    });

    it('should reject context with invalid contextVersion type', () => {
      const invalid = createValidContext({ contextVersion: 1.0 as any });

      const isValid = lookup.validateContextStructure(invalid);

      expect(isValid).toBe(false);
    });

    it('should allow all valid phases', () => {
      const phases: Array<'loop3' | 'loop2' | 'product-owner' | 'iteration-prep'> = [
        'loop3',
        'loop2',
        'product-owner',
        'iteration-prep'
      ];

      for (const phase of phases) {
        const context = createValidContext({ phase });
        const isValid = lookup.validateContextStructure(context);
        expect(isValid).toBe(true);
      }
    });

    it('should allow all valid modes', () => {
      const modes: Array<'mvp' | 'standard' | 'enterprise'> = ['mvp', 'standard', 'enterprise'];

      for (const mode of modes) {
        const context = createValidContext({ mode });
        const isValid = lookup.validateContextStructure(context);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('isContextComplete', () => {
    it('should validate complete context', () => {
      const context = createValidContext();

      const isComplete = lookup.isContextComplete(context);

      expect(isComplete).toBe(true);
    });

    it('should validate with custom required fields', () => {
      const context = createValidContext();

      const isComplete = lookup.isContextComplete(context, {
        requiredFields: ['taskId', 'iteration', 'phase'],
        optionalFields: []
      });

      expect(isComplete).toBe(true);
    });

    it('should reject missing required fields', () => {
      const context = createValidContext();
      delete context.iteration;

      const isComplete = lookup.isContextComplete(context, {
        requiredFields: ['iteration'],
        optionalFields: []
      });

      expect(isComplete).toBe(false);
    });

    it('should handle optional fields', () => {
      const context = createValidContext();
      delete context.successCriteria;

      const isComplete = lookup.isContextComplete(context, {
        requiredFields: [],
        optionalFields: ['successCriteria']
      });

      // Should return true even with missing optional field
      expect(isComplete).toBe(true);
    });
  });

  describe('cache management', () => {
    it('should clear specific cache entry', async () => {
      const context = createValidContext();
      const redisKey = 'cfn_loop:task-123:context';

      await redis.set(redisKey, JSON.stringify(context));

      // Populate cache
      await lookup.lookupContext('task-123');

      const stats1 = lookup.getCacheStats();
      expect(stats1.size).toBe(1);

      // Clear cache
      lookup.clearCache('task-123');

      const stats2 = lookup.getCacheStats();
      expect(stats2.size).toBe(0);
    });

    it('should clear all cache', async () => {
      const context1 = createValidContext({ taskId: 'task-1' });
      const context2 = createValidContext({ taskId: 'task-2' });

      await redis.set('cfn_loop:task-1:context', JSON.stringify(context1));
      await redis.set('cfn_loop:task-2:context', JSON.stringify(context2));

      // Populate cache
      await lookup.lookupContext('task-1');
      await lookup.lookupContext('task-2');

      const stats1 = lookup.getCacheStats();
      expect(stats1.size).toBe(2);

      // Clear all cache
      lookup.clearCache();

      const stats2 = lookup.getCacheStats();
      expect(stats2.size).toBe(0);
    });

    it('should return cache statistics', () => {
      const stats = lookup.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('ttlMs');
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBeGreaterThan(0);
      expect(stats.ttlMs).toBeGreaterThan(0);
    });
  });

  describe('factory function', () => {
    it('should create context lookup instance', () => {
      const instance = createContextLookup(redis as any, logger as any, true);

      expect(instance).toBeInstanceOf(ContextLookup);
    });

    it('should enable cache by default', async () => {
      const instance = createContextLookup(redis as any, logger as any);
      const context = createValidContext();
      const redisKey = 'cfn_loop:task-123:context';

      await redis.set(redisKey, JSON.stringify(context));

      // First call
      const result1 = await instance.lookupContext('task-123');
      expect(result1.source).toBe('redis');

      // Second call should be from cache
      const result2 = await instance.lookupContext('task-123');
      expect(result2.source).toBe('cache');
    });

    it('should allow disabling cache', async () => {
      const instance = createContextLookup(redis as any, logger as any, false);
      const context = createValidContext();
      const redisKey = 'cfn_loop:task-123:context';

      await redis.set(redisKey, JSON.stringify(context));

      // Both calls should be from Redis
      const result1 = await instance.lookupContext('task-123');
      expect(result1.source).toBe('redis');

      const result2 = await instance.lookupContext('task-123');
      expect(result2.source).toBe('redis');
    });
  });

  describe('error handling', () => {
    it('should handle gracefully when context lookup fails', async () => {
      const brokenRedis = {
        get: async () => {
          throw new Error('Connection timeout');
        }
      };

      const brokenLookup = new ContextLookup(
        brokenRedis as any,
        logger as any,
        true
      );

      await expect(brokenLookup.lookupContext('task-123')).rejects.toThrow();
      expect(logger.getLogs('error')).toHaveLength(1);
    });

    it('should log warnings for missing contexts', async () => {
      await lookup.lookupContext('nonexistent');

      const warnLogs = logger.getLogs('warn');
      expect(warnLogs.length).toBeGreaterThan(0);
      expect(warnLogs[0].message).toContain('not found');
    });

    it('should log debug messages for cache hits', async () => {
      const context = createValidContext();
      const redisKey = 'cfn_loop:task-123:context';

      await redis.set(redisKey, JSON.stringify(context));

      // Populate cache
      await lookup.lookupContext('task-123');
      logger.clear();

      // Cache hit
      await lookup.lookupContext('task-123');

      const debugLogs = logger.getLogs('debug');
      const cacheHitLog = debugLogs.find((log) => log.message.includes('cache hit'));
      expect(cacheHitLog).toBeDefined();
    });
  });
});
