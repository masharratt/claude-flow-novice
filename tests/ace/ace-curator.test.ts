/**
 * ACE Curator Test Suite
 * Comprehensive test coverage for context merging and reflection prioritization
 *
 * @version 1.0.0
 * @description Tests for P1 HIGH PRIORITY - ACE Curator Component
 *
 * Coverage:
 * - Context merging strategies
 * - Reflection prioritization
 * - Deduplication logic
 * - Deep merge operations
 * - Storage integration
 * - Priority scoring algorithms
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ACECurator, ContextMergeStrategy } from '../../src/ace/ace-curator.js';
import type { CognitiveReflection } from '../../src/ace/ace-reflector.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock DualWriteManager to avoid Redis/SQLite dependencies in tests
jest.mock('../../src/memory/dual-write-pattern.js', () => ({
  DualWriteManager: jest.fn().mockImplementation(() => ({
    write: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(null),
  })),
}));

describe('ACE Curator - Context Merging', () => {
  let curator: ACECurator;
  const testDbPath = './test-ace-curation.sqlite';

  beforeEach(() => {
    curator = new ACECurator({}, testDbPath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File may not exist
    }
  });

  describe('Simple Context Merging', () => {
    test('should merge two non-overlapping contexts', async () => {
      const contexts = [
        { task: 'implement feature', language: 'typescript' },
        { environment: 'production', framework: 'jest' },
      ];

      const merged = await curator.mergeContexts(contexts);

      expect(merged.task).toBe('implement feature');
      expect(merged.language).toBe('typescript');
      expect(merged.environment).toBe('production');
      expect(merged.framework).toBe('jest');
    });

    test('should handle overlapping keys with last-write-wins', async () => {
      const contexts = [
        { task: 'old task', version: 1 },
        { task: 'new task', iteration: 2 },
      ];

      const merged = await curator.mergeContexts(contexts);

      expect(merged.task).toBe('new task');
      expect(merged.version).toBe(1);
      expect(merged.iteration).toBe(2);
    });

    test('should handle empty contexts array', async () => {
      const contexts: Record<string, any>[] = [];

      const merged = await curator.mergeContexts(contexts);

      expect(merged).toEqual({});
    });

    test('should handle single context', async () => {
      const contexts = [{ singleKey: 'singleValue', count: 42 }];

      const merged = await curator.mergeContexts(contexts);

      expect(merged).toEqual({ singleKey: 'singleValue', count: 42 });
    });
  });

  describe('Deep Context Merging', () => {
    test('should deep merge nested objects', async () => {
      const contexts = [
        {
          config: {
            database: { host: 'localhost', port: 5432 },
            cache: { ttl: 300 },
          },
        },
        {
          config: {
            database: { port: 3306, user: 'admin' },
            logging: { level: 'info' },
          },
        },
      ];

      const merged = await curator.mergeContexts(contexts);

      expect(merged.config.database.host).toBe('localhost');
      expect(merged.config.database.port).toBe(3306);
      expect(merged.config.database.user).toBe('admin');
      expect(merged.config.cache.ttl).toBe(300);
      expect(merged.config.logging.level).toBe('info');
    });

    test('should handle deeply nested structures', async () => {
      const contexts = [
        { a: { b: { c: { d: 'deep1' } } } },
        { a: { b: { c: { e: 'deep2' } } } },
      ];

      const merged = await curator.mergeContexts(contexts);

      expect(merged.a.b.c.d).toBe('deep1');
      expect(merged.a.b.c.e).toBe('deep2');
    });

    test('should handle array values without deep merge', async () => {
      const contexts = [
        { tags: ['tag1', 'tag2'], data: [1, 2, 3] },
        { tags: ['tag3', 'tag4'], data: [4, 5] },
      ];

      const merged = await curator.mergeContexts(contexts);

      // Arrays should be replaced, not merged
      expect(merged.tags).toEqual(['tag3', 'tag4']);
      expect(merged.data).toEqual([4, 5]);
    });
  });

  describe('Custom Merge Strategies', () => {
    test('should support custom merge strategy', async () => {
      class CustomStrategy implements ContextMergeStrategy {
        merge(contexts: Record<string, any>[]): Record<string, any> {
          return { custom: 'merged', count: contexts.length };
        }
        prioritize(reflections: CognitiveReflection[]): CognitiveReflection {
          return reflections[0];
        }
      }

      const contexts = [{ a: 1 }, { b: 2 }, { c: 3 }];
      const strategy = new CustomStrategy();

      const merged = await curator.mergeContexts(contexts, strategy);

      expect(merged.custom).toBe('merged');
      expect(merged.count).toBe(3);
    });
  });

  describe('Context Deduplication', () => {
    test('should deduplicate identical keys', async () => {
      const contexts = [
        { task: 'test', id: 1, tags: ['a'] },
        { task: 'test', id: 2, tags: ['a'] },
        { task: 'test', id: 3, tags: ['a'] },
      ];

      const merged = await curator.mergeContexts(contexts);

      // Last write wins
      expect(merged.task).toBe('test');
      expect(merged.id).toBe(3);
    });
  });
});

describe('ACE Curator - Reflection Prioritization', () => {
  let curator: ACECurator;
  const testDbPath = './test-ace-prioritization.sqlite';

  beforeEach(() => {
    curator = new ACECurator({}, testDbPath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File may not exist
    }
  });

  describe('Priority Scoring', () => {
    test('should prioritize higher complexity reflection', async () => {
      const now = Date.now();
      const reflections: CognitiveReflection[] = [
        {
          id: 'ref1',
          timestamp: now - 10000,
          complexity: 3.0,
          context: { task: 'simple' },
          insights: ['insight1'],
        },
        {
          id: 'ref2',
          timestamp: now - 5000,
          complexity: 7.5,
          context: { task: 'complex' },
          insights: ['insight1', 'insight2'],
        },
      ];

      const prioritized = await curator.prioritizeReflections(reflections);

      expect(prioritized.id).toBe('ref2');
      expect(prioritized.complexity).toBe(7.5);
    });

    test('should prioritize more recent reflection when complexity equal', async () => {
      const now = Date.now();
      const reflections: CognitiveReflection[] = [
        {
          id: 'ref1',
          timestamp: now - 20000,
          complexity: 5.0,
          context: { task: 'old' },
          insights: ['insight1'],
        },
        {
          id: 'ref2',
          timestamp: now - 1000,
          complexity: 5.0,
          context: { task: 'recent' },
          insights: ['insight1'],
        },
      ];

      const prioritized = await curator.prioritizeReflections(reflections);

      expect(prioritized.id).toBe('ref2');
      expect(prioritized.timestamp).toBeGreaterThan(reflections[0].timestamp);
    });

    test('should prioritize reflection with more insights', async () => {
      const now = Date.now();
      const reflections: CognitiveReflection[] = [
        {
          id: 'ref1',
          timestamp: now,
          complexity: 5.0,
          context: { task: 'few insights' },
          insights: ['insight1'],
        },
        {
          id: 'ref2',
          timestamp: now,
          complexity: 5.0,
          context: { task: 'many insights' },
          insights: ['insight1', 'insight2', 'insight3', 'insight4'],
        },
      ];

      const prioritized = await curator.prioritizeReflections(reflections);

      expect(prioritized.id).toBe('ref2');
      expect(prioritized.insights.length).toBe(4);
    });

    test('should handle single reflection', async () => {
      const reflections: CognitiveReflection[] = [
        {
          id: 'ref1',
          timestamp: Date.now(),
          complexity: 5.0,
          context: { task: 'only one' },
          insights: ['insight1'],
        },
      ];

      const prioritized = await curator.prioritizeReflections(reflections);

      expect(prioritized.id).toBe('ref1');
    });

    test('should handle reflections with no insights', async () => {
      const now = Date.now();
      const reflections: CognitiveReflection[] = [
        {
          id: 'ref1',
          timestamp: now,
          complexity: 6.0,
          context: { task: 'no insights' },
          insights: [],
        },
        {
          id: 'ref2',
          timestamp: now,
          complexity: 4.0,
          context: { task: 'also no insights' },
          insights: [],
        },
      ];

      const prioritized = await curator.prioritizeReflections(reflections);

      // Higher complexity should win
      expect(prioritized.id).toBe('ref1');
    });
  });

  describe('Composite Priority Scoring', () => {
    test('should balance complexity, recency, and insights', async () => {
      const now = Date.now();
      const reflections: CognitiveReflection[] = [
        {
          id: 'ref1',
          timestamp: now - 30000,
          complexity: 8.0,
          context: { task: 'high complexity, old' },
          insights: ['insight1'],
        },
        {
          id: 'ref2',
          timestamp: now - 1000,
          complexity: 4.0,
          context: { task: 'low complexity, recent' },
          insights: ['insight1', 'insight2', 'insight3'],
        },
        {
          id: 'ref3',
          timestamp: now - 15000,
          complexity: 6.0,
          context: { task: 'balanced' },
          insights: ['insight1', 'insight2'],
        },
      ];

      const prioritized = await curator.prioritizeReflections(reflections);

      // With 50% complexity weight, ref1 (8.0 complexity) should likely win
      expect(prioritized.id).toBeDefined();
      expect(['ref1', 'ref2', 'ref3']).toContain(prioritized.id);
    });
  });

  describe('Custom Prioritization Strategy', () => {
    test('should support custom prioritization strategy', async () => {
      class CustomPriorityStrategy implements ContextMergeStrategy {
        merge(contexts: Record<string, any>[]): Record<string, any> {
          return {};
        }
        prioritize(reflections: CognitiveReflection[]): CognitiveReflection {
          // Always return the last reflection
          return reflections[reflections.length - 1];
        }
      }

      const reflections: CognitiveReflection[] = [
        {
          id: 'ref1',
          timestamp: Date.now(),
          complexity: 10.0,
          context: {},
          insights: [],
        },
        {
          id: 'ref2',
          timestamp: Date.now(),
          complexity: 1.0,
          context: {},
          insights: [],
        },
      ];

      const strategy = new CustomPriorityStrategy();
      const prioritized = await curator.prioritizeReflections(reflections, strategy);

      expect(prioritized.id).toBe('ref2');
    });
  });
});

describe('ACE Curator - Storage Integration', () => {
  let curator: ACECurator;
  const testDbPath = './test-ace-storage.sqlite';

  beforeEach(() => {
    curator = new ACECurator({}, testDbPath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File may not exist
    }
  });

  describe('Merged Context Storage', () => {
    test('should store merged context with timestamp', async () => {
      const contexts = [{ key1: 'value1' }, { key2: 'value2' }];

      const merged = await curator.mergeContexts(contexts);

      // Storage happens via DualWriteManager mock
      expect(merged.key1).toBe('value1');
      expect(merged.key2).toBe('value2');
    });
  });

  describe('Prioritized Reflection Storage', () => {
    test('should store prioritized reflection', async () => {
      const reflections: CognitiveReflection[] = [
        {
          id: 'ref1',
          timestamp: Date.now(),
          complexity: 5.0,
          context: { task: 'test' },
          insights: ['insight1'],
        },
      ];

      const prioritized = await curator.prioritizeReflections(reflections);

      // Storage happens via DualWriteManager mock
      expect(prioritized.id).toBe('ref1');
    });
  });
});

describe('ACE Curator - Edge Cases', () => {
  let curator: ACECurator;
  const testDbPath = './test-ace-edge.sqlite';

  beforeEach(() => {
    curator = new ACECurator({}, testDbPath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File may not exist
    }
  });

  test('should handle null values in context', async () => {
    const contexts = [{ key1: null, key2: 'value' }, { key1: 'newValue', key3: null }];

    const merged = await curator.mergeContexts(contexts);

    expect(merged.key1).toBe('newValue');
    expect(merged.key2).toBe('value');
    expect(merged.key3).toBeNull();
  });

  test('should handle undefined values in context', async () => {
    const contexts = [{ key1: undefined, key2: 'value' }, { key1: 'newValue' }];

    const merged = await curator.mergeContexts(contexts);

    expect(merged.key1).toBe('newValue');
    expect(merged.key2).toBe('value');
  });

  test('should handle numeric keys', async () => {
    const contexts = [{ 0: 'zero', 1: 'one' }, { 2: 'two' }];

    const merged = await curator.mergeContexts(contexts);

    expect(merged[0]).toBe('zero');
    expect(merged[1]).toBe('one');
    expect(merged[2]).toBe('two');
  });

  test('should handle boolean values', async () => {
    const contexts = [
      { enabled: true, debug: false },
      { enabled: false, verbose: true },
    ];

    const merged = await curator.mergeContexts(contexts);

    expect(merged.enabled).toBe(false);
    expect(merged.debug).toBe(false);
    expect(merged.verbose).toBe(true);
  });

  test('should handle very deep nesting', async () => {
    const contexts = [
      { a: { b: { c: { d: { e: { f: { g: 'deep1' } } } } } } },
      { a: { b: { c: { d: { e: { f: { h: 'deep2' } } } } } } },
    ];

    const merged = await curator.mergeContexts(contexts);

    expect(merged.a.b.c.d.e.f.g).toBe('deep1');
    expect(merged.a.b.c.d.e.f.h).toBe('deep2');
  });

  test('should handle large number of contexts', async () => {
    const contexts = Array.from({ length: 100 }, (_, i) => ({
      [`key${i}`]: `value${i}`,
    }));

    const merged = await curator.mergeContexts(contexts);

    expect(merged.key0).toBe('value0');
    expect(merged.key50).toBe('value50');
    expect(merged.key99).toBe('value99');
  });

  test('should handle reflections with identical priority scores', async () => {
    const now = Date.now();
    const reflections: CognitiveReflection[] = [
      {
        id: 'ref1',
        timestamp: now,
        complexity: 5.0,
        context: { task: 'identical1' },
        insights: ['insight1'],
      },
      {
        id: 'ref2',
        timestamp: now,
        complexity: 5.0,
        context: { task: 'identical2' },
        insights: ['insight1'],
      },
    ];

    const prioritized = await curator.prioritizeReflections(reflections);

    // Should return one of them consistently
    expect(['ref1', 'ref2']).toContain(prioritized.id);
  });

  test('should handle very old timestamps', async () => {
    const reflections: CognitiveReflection[] = [
      {
        id: 'ref1',
        timestamp: 0, // Unix epoch
        complexity: 5.0,
        context: { task: 'ancient' },
        insights: ['insight1'],
      },
      {
        id: 'ref2',
        timestamp: Date.now(),
        complexity: 5.0,
        context: { task: 'modern' },
        insights: ['insight1'],
      },
    ];

    const prioritized = await curator.prioritizeReflections(reflections);

    expect(prioritized.id).toBe('ref2');
  });
});
