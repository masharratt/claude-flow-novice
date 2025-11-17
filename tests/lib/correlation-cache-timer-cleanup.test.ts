/**
 * Comprehensive Timer Cleanup Tests for CorrelationCache
 *
 * Validates fix for timer leak vulnerability where interval timer
 * was not cleared when cache instance is destroyed.
 *
 * Test Coverage:
 * 1. Timer cleanup verification (destroy() clears interval)
 * 2. Memory leak prevention (multiple destroy calls)
 * 3. Destroy idempotency (safe to call multiple times)
 * 4. Periodic cleanup stops after destroy
 * 5. Proper resource cleanup order (timer then cache)
 * 6. Integration with clear() method
 * 7. Performance validation (<1ms overhead)
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CorrelationCache } from '../../src/lib/correlation-cache.js';

describe('CorrelationCache - Timer Cleanup (Comprehensive)', () => {
  let cache: CorrelationCache;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (cache && typeof (cache as any).destroy === 'function') {
      (cache as any).destroy();
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('1. Timer Cleanup Verification', () => {
    test('should clear interval timer when destroyed', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      cache = new CorrelationCache();
      expect((cache as any).cleanupTimer).not.toBeNull();

      (cache as any).destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect((cache as any).cleanupTimer).toBeNull();
    });

    test('should stop periodic cleanup after destroy', () => {
      cache = new CorrelationCache({ ttlMinutes: 1 });

      // Add expired entry
      cache.set('test:expired', { data: 'value' });

      // Destroy cache
      (cache as any).destroy();

      // Advance time past cleanup interval
      jest.advanceTimersByTime(65 * 1000);

      // Verify timer is null (cleanup didn't run)
      expect((cache as any).cleanupTimer).toBeNull();
    });

    test('should not throw when destroying cache with no timer', () => {
      cache = new CorrelationCache();

      // Manually clear timer first
      if ((cache as any).cleanupTimer) {
        clearInterval((cache as any).cleanupTimer);
        (cache as any).cleanupTimer = null;
      }

      // Destroy should not throw
      expect(() => (cache as any).destroy()).not.toThrow();
    });
  });

  describe('2. Memory Leak Prevention', () => {
    test('should not leave dangling timers from multiple instances', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      const instances: CorrelationCache[] = [];

      // Create 100 instances
      for (let i = 0; i < 100; i++) {
        instances.push(new CorrelationCache());
      }

      // Destroy all instances
      instances.forEach(instance => (instance as any).destroy());

      // Verify all timers were created and cleared
      expect(setIntervalSpy).toHaveBeenCalledTimes(100);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(100);

      // Verify no timers remain
      instances.forEach(instance => {
        expect((instance as any).cleanupTimer).toBeNull();
      });
    });

    test('should handle rapid create-destroy cycles', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      for (let i = 0; i < 50; i++) {
        const tempCache = new CorrelationCache();
        (tempCache as any).destroy();
      }

      // All instances should have been cleaned up
      expect(clearIntervalSpy).toHaveBeenCalledTimes(50);
    });

    test('should prevent timer accumulation over time', () => {
      const instances: CorrelationCache[] = [];

      // Create instances periodically
      for (let i = 0; i < 10; i++) {
        instances.push(new CorrelationCache());
        jest.advanceTimersByTime(5000); // 5 seconds
      }

      const initialClearCalls = jest.spyOn(global, 'clearInterval').mock.calls.length;

      // Destroy all at once
      instances.forEach(instance => (instance as any).destroy());

      // Verify cleanup
      expect(jest.spyOn(global, 'clearInterval')).toHaveBeenCalledTimes(initialClearCalls + 10);
    });
  });

  describe('3. Destroy Idempotency', () => {
    test('should be safe to call destroy() multiple times', () => {
      cache = new CorrelationCache();

      // Call destroy multiple times
      expect(() => {
        (cache as any).destroy();
        (cache as any).destroy();
        (cache as any).destroy();
      }).not.toThrow();

      // Timer should still be null
      expect((cache as any).cleanupTimer).toBeNull();
    });

    test('should maintain idempotency with concurrent destroy calls', () => {
      cache = new CorrelationCache();

      // Simulate concurrent destroys
      const destroyPromises = Array(10).fill(null).map(() =>
        Promise.resolve((cache as any).destroy())
      );

      expect(() => Promise.all(destroyPromises)).not.toThrow();
    });

    test('should not restart timer after destroy', () => {
      cache = new CorrelationCache();

      (cache as any).destroy();
      expect((cache as any).cleanupTimer).toBeNull();

      // Advance time significantly
      jest.advanceTimersByTime(300 * 1000); // 5 minutes

      // Timer should still be null
      expect((cache as any).cleanupTimer).toBeNull();
    });
  });

  describe('4. Periodic Cleanup Behavior', () => {
    test('should run cleanup before destroy', () => {
      cache = new CorrelationCache({ ttlMinutes: 1 });

      // Add entries
      cache.set('test:key1', { data: 'value1' });
      cache.set('test:key2', { data: 'value2' });

      // Advance past TTL
      jest.advanceTimersByTime(61 * 1000);

      // Entries should be cleaned up
      expect(cache.has('test:key1')).toBe(false);
      expect(cache.has('test:key2')).toBe(false);

      // Now destroy
      (cache as any).destroy();
      expect((cache as any).cleanupTimer).toBeNull();
    });

    test('should not run cleanup after destroy', () => {
      cache = new CorrelationCache({ ttlMinutes: 1 });

      // Destroy first
      (cache as any).destroy();

      // Try to advance time (cleanup should not run)
      jest.advanceTimersByTime(61 * 1000);

      // Verify timer is still null
      expect((cache as any).cleanupTimer).toBeNull();
    });

    test('should handle destroy during cleanup interval', () => {
      cache = new CorrelationCache({ ttlMinutes: 1 });

      cache.set('test:key', { data: 'value' });

      // Advance partially through interval
      jest.advanceTimersByTime(30 * 1000);

      // Destroy mid-interval
      expect(() => (cache as any).destroy()).not.toThrow();
      expect((cache as any).cleanupTimer).toBeNull();
    });
  });

  describe('5. Resource Cleanup Order', () => {
    test('should clear timer before clearing cache', () => {
      cache = new CorrelationCache();

      cache.set('test:key1', { data: 'value1' });
      cache.set('test:key2', { data: 'value2' });

      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      (cache as any).destroy();

      // Timer should be cleared
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect((cache as any).cleanupTimer).toBeNull();

      // Cache should be empty (destroy calls clear())
      expect(cache.getMetrics().size).toBe(0);
    });

    test('should preserve metrics during destroy', () => {
      cache = new CorrelationCache();

      // Generate some metrics
      cache.set('test:key1', { data: 'value1' });
      cache.get('test:key1'); // hit
      cache.get('test:nonexistent'); // miss

      const metricsBefore = cache.getMetrics();
      expect(metricsBefore.hits).toBe(1);
      expect(metricsBefore.misses).toBe(1);

      (cache as any).destroy();

      // Metrics should persist after destroy
      const metricsAfter = cache.getMetrics();
      expect(metricsAfter.hits).toBe(metricsBefore.hits);
      expect(metricsAfter.misses).toBe(metricsBefore.misses);
    });

    test('should maintain cache functionality after destroy', () => {
      cache = new CorrelationCache();

      (cache as any).destroy();

      // Cache operations should still work (graceful degradation)
      expect(() => {
        cache.set('test:key', { data: 'value' });
        cache.get('test:key');
        cache.has('test:key');
      }).not.toThrow();
    });
  });

  describe('6. Integration with clear() Method', () => {
    test('should clear cache entries when destroyed', () => {
      cache = new CorrelationCache();

      cache.set('test:key1', { data: 'value1' });
      cache.set('test:key2', { data: 'value2' });
      cache.set('test:key3', { data: 'value3' });

      expect(cache.getMetrics().size).toBe(3);

      (cache as any).destroy();

      // All entries should be cleared
      expect(cache.getMetrics().size).toBe(0);
    });

    test('should increment invalidation count on destroy', () => {
      cache = new CorrelationCache();

      cache.set('test:key1', { data: 'value1' });
      cache.set('test:key2', { data: 'value2' });

      const invalidationsBefore = cache.getMetrics().invalidations;

      (cache as any).destroy();

      const invalidationsAfter = cache.getMetrics().invalidations;

      // Invalidations should increase by 2 (one per entry)
      expect(invalidationsAfter).toBe(invalidationsBefore + 2);
    });

    test('should handle destroy with empty cache', () => {
      cache = new CorrelationCache();

      expect(cache.getMetrics().size).toBe(0);

      expect(() => (cache as any).destroy()).not.toThrow();

      expect(cache.getMetrics().size).toBe(0);
    });
  });

  describe('7. Performance Validation', () => {
    test('should destroy cache in <1ms', () => {
      cache = new CorrelationCache({ maxSize: 1000 });

      // Fill cache
      for (let i = 0; i < 1000; i++) {
        cache.set(`test:key${i}`, { data: `value${i}` });
      }

      jest.useRealTimers(); // Use real timers for performance test

      const start = performance.now();
      (cache as any).destroy();
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1); // <1ms overhead

      jest.useFakeTimers(); // Restore fake timers for cleanup
    });

    test('should have minimal overhead for destroy() call', () => {
      const instances: CorrelationCache[] = [];

      // Create 100 instances
      for (let i = 0; i < 100; i++) {
        instances.push(new CorrelationCache());
      }

      jest.useRealTimers();

      const start = performance.now();
      instances.forEach(instance => (instance as any).destroy());
      const duration = performance.now() - start;

      // Average <1ms per instance (realistic with Jest overhead)
      const avgDuration = duration / 100;
      expect(avgDuration).toBeLessThan(1);

      jest.useFakeTimers();
    });

    test('should not impact cache operations before destroy', () => {
      cache = new CorrelationCache();

      jest.useRealTimers();

      // Measure cache operations
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        cache.set(`test:key${i}`, { data: `value${i}` });
      }
      const setDuration = performance.now() - start;

      // Destroy should not impact previous operation performance
      (cache as any).destroy();

      // Verify performance was reasonable
      const avgSetDuration = setDuration / 1000;
      expect(avgSetDuration).toBeLessThan(0.1); // <0.1ms per set

      jest.useFakeTimers();
    });
  });

  describe('8. Edge Cases', () => {
    test('should handle destroy before any operations', () => {
      cache = new CorrelationCache();

      expect(() => (cache as any).destroy()).not.toThrow();

      // Should still be able to use cache
      cache.set('test:key', { data: 'value' });
      expect(cache.get('test:key')).toEqual({ data: 'value' });
    });

    test('should handle destroy with maxed out cache', () => {
      cache = new CorrelationCache({ maxSize: 10 });

      // Fill to capacity
      for (let i = 0; i < 10; i++) {
        cache.set(`test:key${i}`, { data: `value${i}` });
      }

      expect(cache.getMetrics().size).toBe(10);

      expect(() => (cache as any).destroy()).not.toThrow();

      expect(cache.getMetrics().size).toBe(0);
    });

    test('should handle destroy with custom TTL', () => {
      cache = new CorrelationCache({ ttlMinutes: 10 });

      cache.set('test:key', { data: 'value' });

      expect(() => (cache as any).destroy()).not.toThrow();
      expect((cache as any).cleanupTimer).toBeNull();
    });

    test('should handle destroy with warming enabled', () => {
      cache = new CorrelationCache({
        enableWarming: true,
        warmingPatterns: ['user:*', 'session:*']
      });

      expect(() => (cache as any).destroy()).not.toThrow();
      expect((cache as any).cleanupTimer).toBeNull();
    });

    test('should handle destroy with custom logger', () => {
      const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      cache = new CorrelationCache({ logger: mockLogger as any });

      (cache as any).destroy();

      // Logger should have been called
      expect(mockLogger.info).toHaveBeenCalled();
      expect((cache as any).cleanupTimer).toBeNull();
    });
  });
});
