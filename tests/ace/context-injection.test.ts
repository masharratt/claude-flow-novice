/**
 * Context Injection Test Suite
 * Comprehensive test coverage for dynamic context injection using Proxy patterns
 *
 * @version 1.0.0
 * @description Tests for P1 HIGH PRIORITY - Context Injection Component
 *
 * Coverage:
 * - Dynamic context injection via Proxy
 * - Context override mechanisms
 * - Property access interception
 * - Property mutation tracking
 * - Context-aware method execution
 * - Reflection integration
 * - Edge cases and error handling
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ContextInjector } from '../../src/ace/context-injection.js';

// Mock ACE components
jest.mock('../../src/ace/ace-reflector.js', () => ({
  ACEReflector: jest.fn().mockImplementation(() => ({
    reflect: jest.fn().mockResolvedValue({
      id: 'test-reflection',
      timestamp: Date.now(),
      complexity: 5.0,
      context: { reflected: true, originalProp: 'value' },
      insights: ['insight1'],
    }),
    initialize: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../src/ace/ace-curator.js', () => ({
  ACECurator: jest.fn().mockImplementation(() => ({
    mergeContexts: jest.fn().mockResolvedValue({ merged: true }),
  })),
}));

jest.mock('../../src/ace/ace-generator.js', () => ({
  ACEGenerator: jest.fn().mockImplementation(() => ({
    generateContext: jest.fn().mockResolvedValue({ generated: true, adaptive: true }),
  })),
}));

describe('Context Injection - Basic Injection', () => {
  let injector: ContextInjector;

  beforeEach(() => {
    injector = new ContextInjector();
  });

  describe('Simple Context Injection', () => {
    test('should inject context into target object', async () => {
      const target = { original: 'value' };
      const contextOverrides = { injected: 'context' };

      const result = await injector.injectContext(target, contextOverrides);

      expect(result.original).toBe('value');
      expect(result.injected).toBe('context');
    });

    test('should inject context without overrides', async () => {
      const target = { original: 'value', prop: 'test' };

      const result = await injector.injectContext(target);

      expect(result.original).toBe('value');
      expect(result.prop).toBe('test');
    });

    test('should handle empty target', async () => {
      const target = {};
      const contextOverrides = { added: 'property' };

      const result = await injector.injectContext(target, contextOverrides);

      expect(result.added).toBe('property');
    });

    test('should handle empty overrides', async () => {
      const target = { existing: 'value' };
      const contextOverrides = {};

      const result = await injector.injectContext(target, contextOverrides);

      expect(result.existing).toBe('value');
    });
  });

  describe('Context Override Priority', () => {
    test('should prioritize context overrides over target properties', async () => {
      const target = { prop: 'original' };
      const contextOverrides = { prop: 'override' };

      const result = await injector.injectContext(target, contextOverrides);

      expect(result.prop).toBe('override');
    });

    test('should allow multiple overrides', async () => {
      const target = { a: 1, b: 2, c: 3 };
      const contextOverrides = { a: 10, b: 20 };

      const result = await injector.injectContext(target, contextOverrides);

      expect(result.a).toBe(10);
      expect(result.b).toBe(20);
      expect(result.c).toBe(3);
    });

    test('should handle undefined overrides', async () => {
      const target = { prop: 'value' };
      const contextOverrides = { prop: undefined };

      const result = await injector.injectContext(target, contextOverrides);

      expect(result.prop).toBeUndefined();
    });

    test('should handle null overrides', async () => {
      const target = { prop: 'value' };
      const contextOverrides = { prop: null };

      const result = await injector.injectContext(target, contextOverrides);

      expect(result.prop).toBeNull();
    });
  });
});

describe('Context Injection - Proxy Behavior', () => {
  let injector: ContextInjector;

  beforeEach(() => {
    injector = new ContextInjector();
  });

  describe('Property Access', () => {
    test('should intercept property access via Proxy', async () => {
      const target = { original: 'value' };
      const contextOverrides = { intercepted: 'property' };

      const result = await injector.injectContext(target, contextOverrides);

      expect(result.intercepted).toBe('property');
      expect(result.original).toBe('value');
    });

    test('should return undefined for non-existent properties', async () => {
      const target = { existing: 'value' };

      const result = await injector.injectContext(target);

      expect(result.nonExistent).toBeUndefined();
    });

    test('should handle nested property access', async () => {
      const target = { nested: { prop: 'value' } };

      const result = await injector.injectContext(target);

      expect(result.nested.prop).toBe('value');
    });
  });

  describe('Property Mutation', () => {
    test('should allow property mutation', async () => {
      const target = { mutable: 'initial' };

      const result = await injector.injectContext(target);
      result.mutable = 'modified';

      expect(result.mutable).toBe('modified');
    });

    test('should track property mutations via reflection', async () => {
      const target = { tracked: 'initial' };

      const result = await injector.injectContext(target);
      result.tracked = 'updated';

      // Reflection happens automatically via Proxy set trap
      expect(result.tracked).toBe('updated');
    });

    test('should allow adding new properties', async () => {
      const target: any = { existing: 'value' };

      const result = await injector.injectContext(target);
      result.newProp = 'added';

      expect(result.newProp).toBe('added');
      expect(result.existing).toBe('value');
    });

    test('should handle deletion of properties', async () => {
      const target: any = { deletable: 'value' };

      const result = await injector.injectContext(target);
      delete result.deletable;

      expect(result.deletable).toBeUndefined();
    });
  });
});

describe('Context Injection - Method Execution', () => {
  let injector: ContextInjector;

  beforeEach(() => {
    injector = new ContextInjector();
  });

  describe('Context-Aware Execution', () => {
    test('should execute method with injected context', async () => {
      const method = (target: any) => Promise.resolve(target.value * 2);
      const target = { value: 10 };
      const contextOverrides = { value: 20 };

      const result = await injector.executeWithContext(method, target, contextOverrides);

      expect(result).toBe(40); // Uses injected value of 20
    });

    test('should execute method without context overrides', async () => {
      const method = (target: any) => Promise.resolve(target.name.toUpperCase());
      const target = { name: 'test' };

      const result = await injector.executeWithContext(method, target);

      expect(result).toBe('TEST');
    });

    test('should handle async method execution', async () => {
      const method = async (target: any) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return target.async;
      };
      const target = { async: 'result' };

      const result = await injector.executeWithContext(method, target);

      expect(result).toBe('result');
    });

    test('should propagate errors from method execution', async () => {
      const method = (target: any) => {
        throw new Error('Method error');
      };
      const target = { value: 'test' };

      await expect(injector.executeWithContext(method, target)).rejects.toThrow('Method error');
    });

    test('should handle method returning undefined', async () => {
      const method = (target: any) => Promise.resolve(undefined);
      const target = { value: 'test' };

      const result = await injector.executeWithContext(method, target);

      expect(result).toBeUndefined();
    });
  });

  describe('Complex Method Execution', () => {
    test('should execute method accessing multiple properties', async () => {
      const method = (target: any) =>
        Promise.resolve(`${target.first} ${target.last}`);
      const target = { first: 'John', last: 'Doe' };
      const contextOverrides = { last: 'Smith' };

      const result = await injector.executeWithContext(method, target, contextOverrides);

      expect(result).toBe('John Smith');
    });

    test('should execute method with object manipulation', async () => {
      const method = (target: any) => {
        const copy = { ...target };
        copy.modified = true;
        return Promise.resolve(copy);
      };
      const target = { original: 'value' };

      const result = await injector.executeWithContext(method, target);

      expect(result.original).toBe('value');
      expect(result.modified).toBe(true);
    });
  });
});

describe('Context Injection - Type Handling', () => {
  let injector: ContextInjector;

  beforeEach(() => {
    injector = new ContextInjector();
  });

  test('should handle numeric properties', async () => {
    const target = { count: 42, ratio: 0.75 };
    const contextOverrides = { count: 100 };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result.count).toBe(100);
    expect(result.ratio).toBe(0.75);
  });

  test('should handle boolean properties', async () => {
    const target = { enabled: true, visible: false };
    const contextOverrides = { visible: true };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result.enabled).toBe(true);
    expect(result.visible).toBe(true);
  });

  test('should handle array properties', async () => {
    const target = { items: [1, 2, 3] };
    const contextOverrides = { items: [4, 5, 6] };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result.items).toEqual([4, 5, 6]);
  });

  test('should handle object properties', async () => {
    const target = { nested: { a: 1, b: 2 } };
    const contextOverrides = { nested: { a: 10, c: 3 } };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result.nested.a).toBe(10);
    expect(result.nested.c).toBe(3);
  });

  test('should handle function properties', async () => {
    const targetFunc = () => 'original';
    const overrideFunc = () => 'override';
    const target = { fn: targetFunc };
    const contextOverrides = { fn: overrideFunc };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result.fn()).toBe('override');
  });

  test('should handle Date properties', async () => {
    const date1 = new Date('2024-01-01');
    const date2 = new Date('2024-12-31');
    const target = { created: date1 };
    const contextOverrides = { created: date2 };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result.created).toBe(date2);
  });

  test('should handle RegExp properties', async () => {
    const regex1 = /test1/;
    const regex2 = /test2/;
    const target = { pattern: regex1 };
    const contextOverrides = { pattern: regex2 };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result.pattern).toBe(regex2);
  });
});

describe('Context Injection - Edge Cases', () => {
  let injector: ContextInjector;

  beforeEach(() => {
    injector = new ContextInjector();
  });

  test('should handle target with Symbol properties', async () => {
    const sym = Symbol('test');
    const target: any = { [sym]: 'symbol value' };

    const result = await injector.injectContext(target);

    expect(result[sym]).toBe('symbol value');
  });

  test('should handle target with prototype chain', async () => {
    class Base {
      baseMethod() {
        return 'base';
      }
    }
    class Derived extends Base {
      derivedMethod() {
        return 'derived';
      }
    }
    const target = new Derived();

    const result = await injector.injectContext(target);

    expect(result.baseMethod()).toBe('base');
    expect(result.derivedMethod()).toBe('derived');
  });

  test('should handle target with getter/setter', async () => {
    const target = {
      _value: 'initial',
      get value() {
        return this._value;
      },
      set value(v: string) {
        this._value = v;
      },
    };

    const result = await injector.injectContext(target);

    expect(result.value).toBe('initial');
    result.value = 'modified';
    expect(result.value).toBe('modified');
  });

  test('should handle frozen target', async () => {
    const target = Object.freeze({ frozen: 'value' });
    const contextOverrides = { frozen: 'override' };

    const result = await injector.injectContext(target, contextOverrides);

    // Override should work via Proxy
    expect(result.frozen).toBe('override');
  });

  test('should handle sealed target', async () => {
    const target = Object.seal({ sealed: 'value' });
    const contextOverrides = { sealed: 'override' };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result.sealed).toBe('override');
  });

  test('should handle very large target object', async () => {
    const largeTarget = Object.fromEntries(
      Array.from({ length: 1000 }, (_, i) => [`key${i}`, `value${i}`])
    );
    const contextOverrides = { key500: 'override' };

    const result = await injector.injectContext(largeTarget, contextOverrides);

    expect(result.key0).toBe('value0');
    expect(result.key500).toBe('override');
    expect(result.key999).toBe('value999');
  });

  test('should handle circular references in target', async () => {
    const target: any = { prop: 'value' };
    target.self = target;

    const result = await injector.injectContext(target);

    expect(result.prop).toBe('value');
    expect(result.self.prop).toBe('value');
  });

  test('should handle null target gracefully', async () => {
    const target = null as any;

    await expect(injector.injectContext(target)).rejects.toBeDefined();
  });

  test('should handle undefined target gracefully', async () => {
    const target = undefined as any;

    await expect(injector.injectContext(target)).rejects.toBeDefined();
  });

  test('should handle target with numeric keys', async () => {
    const target: any = { 0: 'zero', 1: 'one', 2: 'two' };
    const contextOverrides = { 1: 'ONE' };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result[0]).toBe('zero');
    expect(result[1]).toBe('ONE');
    expect(result[2]).toBe('two');
  });
});

describe('Context Injection - Reflection Integration', () => {
  let injector: ContextInjector;

  beforeEach(() => {
    injector = new ContextInjector();
  });

  test('should integrate with ACE Reflector during injection', async () => {
    const target = { task: 'integration test' };
    const contextOverrides = { adaptive: true };

    const result = await injector.injectContext(target, contextOverrides);

    expect(result).toBeDefined();
    expect(result.adaptive).toBe(true);
  });

  test('should integrate with ACE Generator for context adaptation', async () => {
    const target = { original: 'value' };

    const result = await injector.injectContext(target);

    // Generator produces adaptive context
    expect(result).toBeDefined();
  });

  test('should track property changes via reflection', async () => {
    const target: any = { tracked: 'initial' };

    const result = await injector.injectContext(target);
    result.tracked = 'modified';

    // Reflection should be triggered on set
    expect(result.tracked).toBe('modified');
  });
});

describe('Context Injection - Performance', () => {
  let injector: ContextInjector;

  beforeEach(() => {
    injector = new ContextInjector();
  });

  test('should handle rapid property access', async () => {
    const target = { value: 'test' };

    const result = await injector.injectContext(target);

    // Access property many times
    for (let i = 0; i < 1000; i++) {
      expect(result.value).toBe('test');
    }
  });

  test('should handle rapid property mutation', async () => {
    const target: any = { counter: 0 };

    const result = await injector.injectContext(target);

    // Mutate property many times
    for (let i = 0; i < 100; i++) {
      result.counter = i;
    }

    expect(result.counter).toBe(99);
  });
});
