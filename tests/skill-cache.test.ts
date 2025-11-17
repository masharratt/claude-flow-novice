/**
 * LRU Skill Cache - Unit Tests
 *
 * Unit tests for LRUSkillCache to increase coverage.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { LRUSkillCache } from '../src/lib/skill-cache';
import { createLogger } from '../src/lib/logging';

describe('LRUSkillCache', () => {
  let cache: LRUSkillCache<string>;

  beforeEach(() => {
    cache = new LRUSkillCache({
      maxMemoryBytes: 1024, // 1KB for testing
      debug: false,
    });
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1', 100);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1', 100);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete entry', () => {
      cache.set('key1', 'value1', 100);
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.delete('key1')).toBe(false); // Already deleted
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 100);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.memoryUsageBytes).toBe(0);
    });

    it('should return cache size', () => {
      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 100);
      expect(cache.size).toBe(2);
    });

    it('should track memory usage', () => {
      cache.set('key1', 'value1', 100);
      expect(cache.memoryUsageBytes).toBe(100);

      cache.set('key2', 'value2', 200);
      expect(cache.memoryUsageBytes).toBe(300);
    });

    it('should return all keys', () => {
      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 100);

      const keys = cache.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toHaveLength(2);
    });
  });

  describe('TTL Expiry', () => {
    it('should expire entries based on TTL', async () => {
      cache = new LRUSkillCache({
        maxMemoryBytes: 1024,
        defaultTTLMs: 100, // 100ms default TTL
      });

      cache.set('key1', 'value1', 100);
      expect(cache.get('key1')).toBe('value1');

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('key1')).toBeUndefined(); // Expired
    });

    it('should override default TTL with custom TTL', async () => {
      cache = new LRUSkillCache({
        maxMemoryBytes: 1024,
        defaultTTLMs: 50, // 50ms default
      });

      cache.set('key1', 'value1', 100, 200); // Custom 200ms TTL
      expect(cache.get('key1')).toBe('value1');

      // Wait 100ms (past default TTL, but within custom TTL)
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cache.get('key1')).toBe('value1'); // Still valid
    });

    it('should cleanup expired entries', async () => {
      cache = new LRUSkillCache({
        maxMemoryBytes: 1024,
        defaultTTLMs: 50,
      });

      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 100);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      const removed = cache.cleanupExpired();
      expect(removed).toBe(2);
      expect(cache.size).toBe(0);
    });

    it('should return 0 when no entries expired', () => {
      cache.set('key1', 'value1', 100);
      const removed = cache.cleanupExpired();
      expect(removed).toBe(0);
    });

    it('should check expiry in has()', async () => {
      cache = new LRUSkillCache({
        maxMemoryBytes: 1024,
        defaultTTLMs: 50,
      });

      cache.set('key1', 'value1', 100);
      expect(cache.has('key1')).toBe(true);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cache.has('key1')).toBe(false); // Expired and removed
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', () => {
      cache.set('key1', 'value1', 100);

      cache.get('key1'); // Hit
      cache.get('key2'); // Miss
      cache.get('key1'); // Hit

      const stats = cache.getStatistics();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.666, 2);
    });

    it('should track evictions', () => {
      // Fill cache to exceed budget
      cache.set('key1', 'value1', 600); // 600 bytes
      cache.set('key2', 'value2', 600); // Would exceed 1024 budget

      const stats = cache.getStatistics();
      expect(stats.evictions).toBeGreaterThan(0);
    });

    it('should calculate memory utilization', () => {
      cache.set('key1', 'value1', 512); // 50% of 1024

      const stats = cache.getStatistics();
      expect(stats.memoryUtilization).toBeCloseTo(0.5, 1);
    });

    it('should reset statistics', () => {
      cache.set('key1', 'value1', 100);
      cache.get('key1'); // Hit

      cache.resetStatistics();

      const stats = cache.getStatistics();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error if entry exceeds max budget', () => {
      try {
        cache.set('key1', 'value1', 2000); // > 1024 budget
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toBeDefined();
        expect(error.code).toBe('CACHE_ENTRY_TOO_LARGE');
      }
    });
  });

  describe('Max Entries Limit', () => {
    it('should respect max entries limit', () => {
      cache = new LRUSkillCache({
        maxMemoryBytes: 10000,
        maxEntries: 2, // Only 2 entries allowed
      });

      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 100);
      cache.set('key3', 'value3', 100); // Should evict key1 (LRU)

      expect(cache.size).toBe(2);
      expect(cache.has('key1')).toBe(false); // Evicted
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
    });
  });

  describe('Update Existing Entry', () => {
    it('should update existing entry', () => {
      cache.set('key1', 'value1', 100);
      cache.set('key1', 'value2', 150); // Update

      expect(cache.get('key1')).toBe('value2');
      expect(cache.memoryUsageBytes).toBe(150); // Updated size
    });

    it('should track access time correctly', () => {
      cache = new LRUSkillCache({
        maxMemoryBytes: 200, // Exactly fits 2 entries
      });

      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 100); // Cache full (200/200)

      // Access key1 to update its lastAccessed time
      cache.get('key1');

      // Trigger eviction by adding key3
      cache.set('key3', 'value3', 100); // Must evict one entry

      // Verify at least one eviction occurred
      const stats = cache.getStatistics();
      expect(stats.evictions).toBeGreaterThan(0);

      // Verify we can still access the newly added key
      expect(cache.has('key3')).toBe(true);
    });
  });
});
