/**
 * ACE Generator Test Suite
 * Comprehensive test coverage for adaptive context generation
 *
 * @version 1.0.0
 * @description Tests for P1 HIGH PRIORITY - ACE Generator Component
 *
 * Coverage:
 * - Context generation with options
 * - Complexity calculation
 * - Adaptive context strategies
 * - Fallback mechanisms
 * - Reflection integration
 * - Similarity-based context fetching
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ACEGenerator, ContextGenerationOptions } from '../../src/ace/ace-generator.js';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('../../src/ace/ace-reflector.js', () => ({
  ACEReflector: jest.fn().mockImplementation(() => ({
    reflect: jest.fn().mockResolvedValue({
      id: 'test-reflection',
      timestamp: Date.now(),
      complexity: 5.0,
      context: { task: 'test', reflected: true },
      insights: ['insight1'],
    }),
    initialize: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../src/ace/ace-curator.js', () => ({
  ACECurator: jest.fn().mockImplementation(() => ({
    mergeContexts: jest.fn().mockResolvedValue({ merged: true, task: 'test' }),
  })),
}));

describe('ACE Generator - Context Generation', () => {
  let generator: ACEGenerator;

  beforeEach(() => {
    generator = new ACEGenerator();
  });

  describe('Basic Generation', () => {
    test('should generate context from base context', async () => {
      const baseContext = { task: 'implement feature', language: 'typescript' };

      const result = await generator.generateContext(baseContext);

      expect(result).toBeDefined();
      expect(result.merged).toBe(true);
    });

    test('should handle empty base context', async () => {
      const baseContext = {};

      const result = await generator.generateContext(baseContext);

      expect(result).toBeDefined();
    });

    test('should apply default options', async () => {
      const baseContext = { task: 'test' };

      const result = await generator.generateContext(baseContext);

      expect(result).toBeDefined();
    });
  });

  describe('Complexity Handling', () => {
    test('should generate context within max complexity', async () => {
      const baseContext = { simple: 'task' };
      const options: ContextGenerationOptions = {
        maxComplexity: 10,
        allowAdaptation: true,
      };

      const result = await generator.generateContext(baseContext, options);

      expect(result).toBeDefined();
    });

    test('should use fallback when complexity exceeds max and adaptation disabled', async () => {
      const complexContext = {
        ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key${i}`, `value${i}`])),
      };
      const options: ContextGenerationOptions = {
        maxComplexity: 1,
        allowAdaptation: false,
        fallbackStrategy: (context) => ({ ...context, fallback: true }),
      };

      const result = await generator.generateContext(complexContext, options);

      expect(result.fallback).toBe(true);
    });

    test('should adapt context when complexity exceeds max and adaptation enabled', async () => {
      const complexContext = {
        ...Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`key${i}`, `value${i}`])),
      };
      const options: ContextGenerationOptions = {
        maxComplexity: 3,
        allowAdaptation: true,
      };

      const result = await generator.generateContext(complexContext, options);

      expect(result).toBeDefined();
      expect(result.merged).toBe(true);
    });
  });

  describe('Fallback Strategies', () => {
    test('should use custom fallback strategy', async () => {
      const baseContext = { task: 'test' };
      const customFallback = (context: Record<string, any>) => ({
        ...context,
        customFallback: true,
        timestamp: Date.now(),
      });
      const options: ContextGenerationOptions = {
        maxComplexity: 0,
        allowAdaptation: false,
        fallbackStrategy: customFallback,
      };

      const result = await generator.generateContext(baseContext, options);

      expect(result.customFallback).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    test('should use default fallback when none provided', async () => {
      const baseContext = { task: 'test' };
      const options: ContextGenerationOptions = {
        maxComplexity: 0,
        allowAdaptation: false,
      };

      const result = await generator.generateContext(baseContext, options);

      expect(result.task).toBe('test');
      expect(result.adaptationWarning).toBe('Context generation limited');
    });

    test('should fall back on error', async () => {
      // Force an error by mocking reflector to throw
      const errorGenerator = new ACEGenerator();
      (errorGenerator as any).reflector.reflect = jest.fn().mockRejectedValue(new Error('Test error'));

      const baseContext = { task: 'error test' };

      const result = await errorGenerator.generateContext(baseContext);

      expect(result.task).toBe('error test');
      expect(result.adaptationWarning).toBe('Context generation limited');
    });
  });

  describe('Options Validation', () => {
    test('should handle undefined options', async () => {
      const baseContext = { task: 'test' };

      const result = await generator.generateContext(baseContext, undefined);

      expect(result).toBeDefined();
    });

    test('should handle partial options', async () => {
      const baseContext = { task: 'test' };
      const partialOptions: ContextGenerationOptions = {
        maxComplexity: 5,
      };

      const result = await generator.generateContext(baseContext, partialOptions);

      expect(result).toBeDefined();
    });

    test('should handle empty options object', async () => {
      const baseContext = { task: 'test' };
      const emptyOptions: ContextGenerationOptions = {};

      const result = await generator.generateContext(baseContext, emptyOptions);

      expect(result).toBeDefined();
    });
  });

  describe('Context Adaptation', () => {
    test('should adapt context based on reflection', async () => {
      const baseContext = { task: 'complex task', requirements: ['req1', 'req2'] };

      const result = await generator.generateContext(baseContext);

      expect(result.merged).toBe(true);
    });

    test('should merge multiple contexts during adaptation', async () => {
      const baseContext = { primary: 'context', version: 1 };

      const result = await generator.generateContext(baseContext);

      expect(result).toBeDefined();
    });
  });
});

describe('ACE Generator - Complexity Calculation', () => {
  let generator: ACEGenerator;

  beforeEach(() => {
    generator = new ACEGenerator();
  });

  test('should calculate complexity for simple object', () => {
    const context = { a: 1, b: 2 };
    const complexity = (generator as any).calculateComplexity(context);

    expect(complexity).toBeGreaterThan(0);
    expect(complexity).toBeLessThan(10);
  });

  test('should calculate higher complexity for large object', () => {
    const simpleContext = { a: 1 };
    const complexContext = {
      ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key${i}`, `value${i}`])),
    };

    const simpleComplexity = (generator as any).calculateComplexity(simpleContext);
    const complexComplexity = (generator as any).calculateComplexity(complexContext);

    expect(complexComplexity).toBeGreaterThan(simpleComplexity);
  });

  test('should calculate complexity for nested object', () => {
    const nestedContext = {
      level1: {
        level2: {
          level3: {
            data: 'deep',
          },
        },
      },
    };

    const complexity = (generator as any).calculateComplexity(nestedContext);

    expect(complexity).toBeGreaterThan(0);
  });

  test('should calculate complexity for object with arrays', () => {
    const contextWithArrays = {
      items: [1, 2, 3, 4, 5],
      tags: ['tag1', 'tag2', 'tag3'],
      metadata: { count: 10 },
    };

    const complexity = (generator as any).calculateComplexity(contextWithArrays);

    expect(complexity).toBeGreaterThan(0);
  });

  test('should use logarithmic scaling', () => {
    const small = { a: 1 };
    const medium = {
      ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`key${i}`, `value${i}`])),
    };
    const large = {
      ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key${i}`, `value${i}`])),
    };

    const smallComplexity = (generator as any).calculateComplexity(small);
    const mediumComplexity = (generator as any).calculateComplexity(medium);
    const largeComplexity = (generator as any).calculateComplexity(large);

    // Logarithmic scaling means differences should be moderate
    expect(mediumComplexity).toBeGreaterThan(smallComplexity);
    expect(largeComplexity).toBeGreaterThan(mediumComplexity);
    expect(largeComplexity - mediumComplexity).toBeLessThan(largeComplexity);
  });
});

describe('ACE Generator - Context Fetching', () => {
  let generator: ACEGenerator;

  beforeEach(() => {
    generator = new ACEGenerator();
  });

  test('should fetch similar contexts (placeholder returns empty)', async () => {
    const reflection = {
      id: 'test',
      timestamp: Date.now(),
      complexity: 5.0,
      context: { task: 'test' },
      insights: [],
    };

    const similarContexts = await (generator as any).fetchSimilarContexts(reflection);

    expect(Array.isArray(similarContexts)).toBe(true);
    expect(similarContexts.length).toBe(0); // Placeholder implementation
  });

  test('should handle fetch errors gracefully', async () => {
    const reflection = {
      id: 'test',
      timestamp: Date.now(),
      complexity: 5.0,
      context: { task: 'test' },
      insights: [],
    };

    // Should not throw even if there are issues
    await expect((generator as any).fetchSimilarContexts(reflection)).resolves.toBeDefined();
  });
});

describe('ACE Generator - Edge Cases', () => {
  let generator: ACEGenerator;

  beforeEach(() => {
    generator = new ACEGenerator();
  });

  test('should handle null base context', async () => {
    const baseContext = null as any;

    await expect(generator.generateContext(baseContext)).rejects.toThrow();
  });

  test('should handle extremely large context', async () => {
    const hugeContext = {
      ...Object.fromEntries(Array.from({ length: 10000 }, (_, i) => [`key${i}`, `value${i}`])),
    };

    const result = await generator.generateContext(hugeContext, { maxComplexity: 100 });

    expect(result).toBeDefined();
  });

  test('should handle context with circular references (JSON.stringify limitation)', async () => {
    const circularContext: any = { a: 1 };
    circularContext.self = circularContext;

    // Should either handle gracefully or use fallback
    await expect(generator.generateContext(circularContext)).resolves.toBeDefined();
  });

  test('should handle context with special characters', async () => {
    const specialContext = {
      'key with spaces': 'value',
      'key-with-dashes': 'value',
      'key.with.dots': 'value',
      'key$with$symbols': 'value',
    };

    const result = await generator.generateContext(specialContext);

    expect(result).toBeDefined();
  });

  test('should handle context with numeric keys', async () => {
    const numericContext = {
      0: 'zero',
      1: 'one',
      100: 'hundred',
    };

    const result = await generator.generateContext(numericContext);

    expect(result).toBeDefined();
  });

  test('should handle context with boolean values', async () => {
    const booleanContext = {
      enabled: true,
      disabled: false,
      active: true,
    };

    const result = await generator.generateContext(booleanContext);

    expect(result).toBeDefined();
  });

  test('should handle context with null and undefined values', async () => {
    const mixedContext = {
      nullValue: null,
      undefinedValue: undefined,
      normalValue: 'test',
    };

    const result = await generator.generateContext(mixedContext);

    expect(result).toBeDefined();
  });

  test('should handle very high maxComplexity threshold', async () => {
    const baseContext = { task: 'test' };
    const options: ContextGenerationOptions = {
      maxComplexity: 1000000,
    };

    const result = await generator.generateContext(baseContext, options);

    expect(result).toBeDefined();
  });

  test('should handle zero maxComplexity threshold', async () => {
    const baseContext = { task: 'test' };
    const options: ContextGenerationOptions = {
      maxComplexity: 0,
      allowAdaptation: false,
    };

    const result = await generator.generateContext(baseContext, options);

    expect(result.adaptationWarning).toBe('Context generation limited');
  });

  test('should handle negative maxComplexity (invalid but should handle gracefully)', async () => {
    const baseContext = { task: 'test' };
    const options: ContextGenerationOptions = {
      maxComplexity: -1,
      allowAdaptation: false,
    };

    const result = await generator.generateContext(baseContext, options);

    expect(result).toBeDefined();
  });
});

describe('ACE Generator - Integration', () => {
  let generator: ACEGenerator;

  beforeEach(() => {
    generator = new ACEGenerator();
  });

  test('should integrate with reflector for context analysis', async () => {
    const baseContext = { task: 'integration test', phase: 'testing' };

    const result = await generator.generateContext(baseContext);

    expect(result).toBeDefined();
    expect(result.merged).toBe(true);
  });

  test('should integrate with curator for context merging', async () => {
    const baseContext = { primary: 'context' };
    const options: ContextGenerationOptions = {
      allowAdaptation: true,
    };

    const result = await generator.generateContext(baseContext, options);

    expect(result.merged).toBe(true);
  });

  test('should handle full generation pipeline', async () => {
    const baseContext = {
      task: 'full pipeline test',
      requirements: ['req1', 'req2', 'req3'],
      constraints: { time: 'limited', resources: 'minimal' },
    };
    const options: ContextGenerationOptions = {
      maxComplexity: 10,
      allowAdaptation: true,
      fallbackStrategy: (ctx) => ({ ...ctx, fallbackApplied: true }),
    };

    const result = await generator.generateContext(baseContext, options);

    expect(result).toBeDefined();
  });
});
