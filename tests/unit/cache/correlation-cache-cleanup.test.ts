/**
 * Timer Cleanup Tests for CorrelationCache
 *
 * Validates fix for timer leak vulnerability where interval timer
 * was not cleared when cache instance is destroyed.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CorrelationCache } from '../src/lib/correlation-cache.js';

describe('CorrelationCache - Timer Cleanup', () => {
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

  describe('destroy() method', () => {
    test('should have a destroy method', () => {
      cache = new CorrelationCache();
      expect(typeof (cache as any).destroy).toBe('function');
    });

    test('should clear interval timer when destroyed', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      cache = new CorrelationCache();
      (cache as any).destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    test('should handle multiple destroy calls safely', () => {
      cache = new CorrelationCache();

      (cache as any).destroy();
      expect(() => (cache as any).destroy()).not.toThrow();
    });

    test('should prevent cleanup from running after destroy', () => {
      cache = new CorrelationCache();

      // Add an entry
      cache.set('test:key1', { data: 'value' });
      expect(cache.has('test:key1')).toBe(true);

      // Get initial metrics
      const initialSize = cache.getMetrics().size;
      expect(initialSize).toBe(1);

      // Destroy cache (note: destroy() calls clear() which empties the cache)
      (cache as any).destroy();

      // Verify cache was cleared
      expect(cache.getMetrics().size).toBe(0);

      // Advance time past cleanup interval (60 seconds)
      jest.advanceTimersByTime(65 * 1000);

      // Verify cleanup timer is not running by checking interval was cleared
      expect((cache as any).cleanupTimer).toBeNull();
    });
  });

  describe('interval timer behavior', () => {
    test('should create interval timer on construction', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      cache = new CorrelationCache();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60 * 1000
      );
    });

    test('should clean up expired entries via interval', () => {
      cache = new CorrelationCache({ ttlMinutes: 1 });

      // Add entry
      cache.set('test:expires', { data: 'value' });
      expect(cache.has('test:expires')).toBe(true);

      // Advance time past TTL
      jest.advanceTimersByTime(61 * 1000);

      // Entry should be expired
      expect(cache.has('test:expires')).toBe(false);
    });

    test('should run cleanup periodically', () => {
      cache = new CorrelationCache({ ttlMinutes: 1 });

      // Add multiple entries at different times
      cache.set('test:key1', { data: 'value1' });

      jest.advanceTimersByTime(30 * 1000);
      cache.set('test:key2', { data: 'value2' });

      jest.advanceTimersByTime(30 * 1000);
      cache.set('test:key3', { data: 'value3' });

      // Advance to first cleanup (60s total)
      jest.advanceTimersByTime(5 * 1000);

      // key1 should be expired (65s old)
      expect(cache.has('test:key1')).toBe(false);
      // key2 and key3 should still exist
      expect(cache.has('test:key2')).toBe(true);
      expect(cache.has('test:key3')).toBe(true);
    });
  });

  describe('memory leak prevention', () => {
    test('should not leave dangling timers', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      // Create and destroy multiple cache instances
      for (let i = 0; i < 5; i++) {
        const tempCache = new CorrelationCache();
        (tempCache as any).destroy();
      }

      // Should have 5 setInterval calls and 5 clearInterval calls
      expect(setIntervalSpy).toHaveBeenCalledTimes(5);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(5);
    });

    test('should clear interval ID after destroy', () => {
      cache = new CorrelationCache();

      // Interval timer should exist before destroy
      expect((cache as any).cleanupTimer).not.toBeNull();

      (cache as any).destroy();

      // Interval timer should be null after destroy
      expect((cache as any).cleanupTimer).toBeNull();
    });
  });

  describe('integration with existing functionality', () => {
    test('should maintain normal cache operations before destroy', () => {
      cache = new CorrelationCache();

      cache.set('test:key1', { data: 'value1' });
      cache.set('test:key2', { data: 'value2' });

      expect(cache.get('test:key1')).toEqual({ data: 'value1' });
      expect(cache.get('test:key2')).toEqual({ data: 'value2' });

      const metrics = cache.getMetrics();
      expect(metrics.size).toBe(2);
      expect(metrics.hits).toBe(2);
    });

    test('should allow cache operations after destroy (graceful degradation)', () => {
      cache = new CorrelationCache();

      cache.set('test:key1', { data: 'value1' });
      (cache as any).destroy();

      // Cache should still work, just without automatic cleanup
      cache.set('test:key2', { data: 'value2' });
      expect(cache.get('test:key2')).toEqual({ data: 'value2' });
    });

    test('should preserve metrics after destroy', () => {
      cache = new CorrelationCache();

      cache.set('test:key1', { data: 'value1' });
      cache.get('test:key1');
      cache.get('test:nonexistent');

      (cache as any).destroy();

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
    });
  });

  describe('edge cases', () => {
    test('should handle destroy before any cache operations', () => {
      cache = new CorrelationCache();

      expect(() => (cache as any).destroy()).not.toThrow();

      // Should still be able to use cache
      cache.set('test:key', { data: 'value' });
      expect(cache.get('test:key')).toEqual({ data: 'value' });
    });

    test('should handle destroy with empty cache', () => {
      cache = new CorrelationCache();

      (cache as any).destroy();

      const metrics = cache.getMetrics();
      expect(metrics.size).toBe(0);
    });

    test('should handle destroy with full cache', () => {
      cache = new CorrelationCache({ maxSize: 10 });

      // Fill cache
      for (let i = 0; i < 10; i++) {
        cache.set(`test:key${i}`, { data: `value${i}` });
      }

      // Verify cache is full
      expect(cache.getMetrics().size).toBe(10);

      // Destroy should not throw
      expect(() => (cache as any).destroy()).not.toThrow();

      // After destroy, cache is cleared
      expect(cache.getMetrics().size).toBe(0);
    });
  });
});
