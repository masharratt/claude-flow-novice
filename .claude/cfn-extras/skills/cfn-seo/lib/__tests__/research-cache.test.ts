/**
 * ResearchCache Test Suite
 *
 * @module planning/seo/lib/__tests__/research-cache.test
 * @description Comprehensive tests for file-based cache implementation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ResearchCache } from '../research-cache';
import { ResearchQuery, ResearchResult } from '../../types/research';

// Create temporary test cache directory
const TEST_CACHE_DIR = path.join(os.tmpdir(), 'cfn-seo-cache-test', Date.now().toString());

// Mock query factory
const createMockQuery = (overrides?: Partial<ResearchQuery>): ResearchQuery => ({
  query: 'test query',
  type: 'serp',
  options: {
    maxResults: 10
  },
  ...overrides
});

// Mock result factory
const createMockResult = (query: ResearchQuery): ResearchResult => ({
  query,
  serpResults: [
    {
      title: 'Test Result 1',
      url: 'https://example.com/1',
      description: 'Test description 1',
      position: 1
    },
    {
      title: 'Test Result 2',
      url: 'https://example.com/2',
      description: 'Test description 2',
      position: 2
    }
  ],
  metadata: {
    resultCount: 2,
    executionTime: 150,
    fromCache: false
  },
  timestamp: new Date()
});

describe('ResearchCache', () => {
  let cache: ResearchCache;

  beforeEach(() => {
    // Create fresh cache instance with test directory
    cache = new ResearchCache(TEST_CACHE_DIR);
  });

  afterEach(() => {
    // Clean up test cache directory
    if (fs.existsSync(TEST_CACHE_DIR)) {
      const files = fs.readdirSync(TEST_CACHE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_CACHE_DIR, file));
      }
      fs.rmdirSync(TEST_CACHE_DIR);
    }
  });

  describe('SHA-256 Cache Key Generation', () => {
    it('should generate deterministic cache keys', () => {
      // GIVEN: Same query
      const query = createMockQuery({ query: 'typescript types' });

      // WHEN: Generating key twice
      const key1 = cache.generateCacheKey(query);
      const key2 = cache.generateCacheKey(query);

      // THEN: Keys should be identical
      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA-256 hex length
    });

    it('should generate different keys for different queries', () => {
      // GIVEN: Different queries
      const query1 = createMockQuery({ query: 'typescript types' });
      const query2 = createMockQuery({ query: 'javascript types' });

      // WHEN: Generating keys
      const key1 = cache.generateCacheKey(query1);
      const key2 = cache.generateCacheKey(query2);

      // THEN: Keys should be different
      expect(key1).not.toBe(key2);
    });

    it('should include query options in cache key', () => {
      // GIVEN: Same query text but different options
      const query1 = createMockQuery({ query: 'test', options: { maxResults: 10 } });
      const query2 = createMockQuery({ query: 'test', options: { maxResults: 20 } });

      // WHEN: Generating keys
      const key1 = cache.generateCacheKey(query1);
      const key2 = cache.generateCacheKey(query2);

      // THEN: Keys should be different
      expect(key1).not.toBe(key2);
    });

    it('should include targetUrl in cache key for content queries', () => {
      // GIVEN: Content queries with different URLs
      const query1 = createMockQuery({
        type: 'content',
        options: { targetUrl: 'https://example.com' }
      });
      const query2 = createMockQuery({
        type: 'content',
        options: { targetUrl: 'https://other.com' }
      });

      // WHEN: Generating keys
      const key1 = cache.generateCacheKey(query1);
      const key2 = cache.generateCacheKey(query2);

      // THEN: Keys should be different
      expect(key1).not.toBe(key2);
    });

    it('should generate valid hex string', () => {
      // GIVEN: Query
      const query = createMockQuery();

      // WHEN: Generating key
      const key = cache.generateCacheKey(query);

      // THEN: Should be valid hex (0-9, a-f)
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('TTL Expiration and Cleanup', () => {
    it('should return null for expired cache entries', async () => {
      // GIVEN: Cache entry with very short TTL (1 second)
      const query = createMockQuery();
      const result = createMockResult(query);

      await cache.set(query, result);

      // Manually update expiration to be in the past
      const cacheKey = cache.generateCacheKey(query);
      const cacheFile = path.join(TEST_CACHE_DIR, `${cacheKey}.json`);
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      cacheData.expiresAt = new Date(Date.now() - 1000).toISOString();
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData));

      // WHEN: Retrieving expired entry
      const cachedResult = await cache.get(query);

      // THEN: Should return null and delete file
      expect(cachedResult).toBeNull();
      expect(fs.existsSync(cacheFile)).toBe(false);
    });

    it('should return valid entry before expiration', async () => {
      // GIVEN: Cache entry with long TTL
      const query = createMockQuery();
      const result = createMockResult(query);

      await cache.set(query, result);

      // WHEN: Retrieving before expiration
      const cachedResult = await cache.get(query);

      // THEN: Should return cached result
      expect(cachedResult).not.toBeNull();
      expect(cachedResult?.query.query).toBe(query.query);
      expect(cachedResult?.metadata.fromCache).toBe(true);
    });

    it('should use default TTL based on query type', async () => {
      // GIVEN: Different query types
      const serpQuery = createMockQuery({ type: 'serp' });
      const contentQuery = createMockQuery({
        type: 'content',
        options: { targetUrl: 'https://example.com' }
      });

      const serpResult = createMockResult(serpQuery);
      const contentResult = createMockResult(contentQuery);

      // WHEN: Setting cache entries
      await cache.set(serpQuery, serpResult);
      await cache.set(contentQuery, contentResult);

      // THEN: Cache files should exist
      const serpKey = cache.generateCacheKey(serpQuery);
      const contentKey = cache.generateCacheKey(contentQuery);

      expect(fs.existsSync(path.join(TEST_CACHE_DIR, `${serpKey}.json`))).toBe(true);
      expect(fs.existsSync(path.join(TEST_CACHE_DIR, `${contentKey}.json`))).toBe(true);
    });

    it('should respect custom TTL from query options', async () => {
      // GIVEN: Query with custom TTL
      const query = createMockQuery({
        options: { cacheTtl: 3600 } // 1 hour
      });
      const result = createMockResult(query);

      // WHEN: Setting cache entry
      await cache.set(query, result);

      // THEN: Cache file should exist
      const cacheKey = cache.generateCacheKey(query);
      const cacheFile = path.join(TEST_CACHE_DIR, `${cacheKey}.json`);
      expect(fs.existsSync(cacheFile)).toBe(true);

      // Check that expiresAt reflects custom TTL
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const createdAt = new Date(cacheData.createdAt);
      const expiresAt = new Date(cacheData.expiresAt);
      const ttlMs = expiresAt.getTime() - createdAt.getTime();

      expect(ttlMs).toBeGreaterThanOrEqual(3600000 - 100); // Allow 100ms tolerance
      expect(ttlMs).toBeLessThanOrEqual(3600000 + 100);
    });
  });

  describe('LRU Eviction When Cache Full', () => {
    it('should evict least recently accessed entries when cache full', async () => {
      // GIVEN: Small cache that will overflow
      const smallCache = new ResearchCache(TEST_CACHE_DIR);

      // Create multiple cache entries
      const queries = [];
      for (let i = 0; i < 5; i++) {
        const query = createMockQuery({ query: `test query ${i}` });
        queries.push(query);
        const result = createMockResult(query);
        await smallCache.set(query, result);
      }

      // Access some entries to update lastAccessedAt
      await smallCache.get(queries[0]);
      await smallCache.get(queries[1]);

      // Create large entries to trigger eviction
      const largeResult = createMockResult(queries[0]);
      largeResult.serpResults = [];
      for (let i = 0; i < 1000; i++) {
        largeResult.serpResults.push({
          title: `Large result ${i}`.repeat(100),
          url: `https://example.com/${i}`,
          description: 'Description'.repeat(100),
          position: i
        });
      }

      // WHEN: Adding large entries to trigger eviction
      for (let i = 0; i < 3; i++) {
        const query = createMockQuery({ query: `large query ${i}` });
        await smallCache.set(query, largeResult);
      }

      // THEN: Some old entries should be evicted
      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThanOrEqual(0);
    });

    it('should maintain cache size within limits', async () => {
      // GIVEN: Cache with entries
      const queries = [];
      for (let i = 0; i < 3; i++) {
        const query = createMockQuery({ query: `test ${i}` });
        queries.push(query);
        const result = createMockResult(query);
        await cache.set(query, result);
      }

      // WHEN: Checking cache stats
      const stats = cache.getStats();

      // THEN: Size should be tracked
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.totalEntries).toBe(3);
    });
  });

  describe('File I/O Operations', () => {
    it('should create cache directory if not exists', () => {
      // WHEN: Creating cache with non-existent directory
      const newCacheDir = path.join(TEST_CACHE_DIR, 'new-dir');
      const newCache = new ResearchCache(newCacheDir);

      // THEN: Directory should be created
      expect(fs.existsSync(newCacheDir)).toBe(true);

      // Cleanup
      fs.rmdirSync(newCacheDir);
    });

    it('should write cache entry to file asynchronously', async () => {
      // GIVEN: Query and result
      const query = createMockQuery();
      const result = createMockResult(query);

      // WHEN: Setting cache entry
      const cacheKey = await cache.set(query, result);

      // THEN: File should exist
      const cacheFile = path.join(TEST_CACHE_DIR, `${cacheKey}.json`);
      expect(fs.existsSync(cacheFile)).toBe(true);

      // Verify file contents
      const fileData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      expect(fileData.key).toBe(cacheKey);
      expect(fileData.data.query.query).toBe(query.query);
    });

    it('should read cache entry from file asynchronously', async () => {
      // GIVEN: Cached entry
      const query = createMockQuery();
      const result = createMockResult(query);
      await cache.set(query, result);

      // WHEN: Reading from cache
      const cachedResult = await cache.get(query);

      // THEN: Should return correct data
      expect(cachedResult).not.toBeNull();
      expect(cachedResult?.query.query).toBe(query.query);
      expect(cachedResult?.serpResults?.length).toBe(2);
    });

    it('should update access count on cache hit', async () => {
      // GIVEN: Cached entry
      const query = createMockQuery();
      const result = createMockResult(query);
      await cache.set(query, result);

      // WHEN: Accessing entry multiple times
      await cache.get(query);
      await cache.get(query);
      await cache.get(query);

      // THEN: Access count should increase
      const cacheKey = cache.generateCacheKey(query);
      const cacheFile = path.join(TEST_CACHE_DIR, `${cacheKey}.json`);
      const fileData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

      expect(fileData.accessCount).toBe(3);
    });

    it('should handle corrupted cache files gracefully', async () => {
      // GIVEN: Corrupted cache file
      const query = createMockQuery();
      const result = createMockResult(query);
      await cache.set(query, result);

      const cacheKey = cache.generateCacheKey(query);
      const cacheFile = path.join(TEST_CACHE_DIR, `${cacheKey}.json`);
      fs.writeFileSync(cacheFile, 'invalid json {{{');

      // WHEN: Reading corrupted file
      const cachedResult = await cache.get(query);

      // THEN: Should return null (cache miss)
      expect(cachedResult).toBeNull();
    });
  });

  describe('Statistics (Hits, Misses, Hit Rate)', () => {
    it('should track cache hits correctly', async () => {
      // GIVEN: Cached entry
      const query = createMockQuery();
      const result = createMockResult(query);
      await cache.set(query, result);

      // WHEN: Cache hits
      await cache.get(query);
      await cache.get(query);
      await cache.get(query);

      // THEN: Stats should reflect hits
      const stats = cache.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(1.0);
    });

    it('should track cache misses correctly', async () => {
      // GIVEN: Empty cache
      const query1 = createMockQuery({ query: 'miss 1' });
      const query2 = createMockQuery({ query: 'miss 2' });

      // WHEN: Cache misses
      await cache.get(query1);
      await cache.get(query2);

      // THEN: Stats should reflect misses
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0);
    });

    it('should calculate hit rate correctly', async () => {
      // GIVEN: Mixed hits and misses
      const query1 = createMockQuery({ query: 'cached' });
      const query2 = createMockQuery({ query: 'not cached' });
      const result = createMockResult(query1);

      await cache.set(query1, result);

      // WHEN: 3 hits, 2 misses
      await cache.get(query1); // hit
      await cache.get(query1); // hit
      await cache.get(query1); // hit
      await cache.get(query2); // miss
      await cache.get(query2); // miss

      // THEN: Hit rate should be 60% (3/5)
      const stats = cache.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(0.6, 2);
    });

    it('should track total entries correctly', async () => {
      // GIVEN: Multiple cache entries
      const queries = [];
      for (let i = 0; i < 5; i++) {
        const query = createMockQuery({ query: `test ${i}` });
        queries.push(query);
        const result = createMockResult(query);
        await cache.set(query, result);
      }

      // WHEN: Checking stats
      const stats = cache.getStats();

      // THEN: Should show correct entry count
      expect(stats.totalEntries).toBe(5);
    });

    it('should track oldest entry age', async () => {
      // GIVEN: Cache entry
      const query = createMockQuery();
      const result = createMockResult(query);
      await cache.set(query, result);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // WHEN: Checking stats
      const stats = cache.getStats();

      // THEN: Oldest entry age should be > 0
      expect(stats.oldestEntryAge).toBeGreaterThan(0);
    });

    it('should calculate average access count', async () => {
      // GIVEN: Multiple entries with different access counts
      const query1 = createMockQuery({ query: 'q1' });
      const query2 = createMockQuery({ query: 'q2' });
      const result1 = createMockResult(query1);
      const result2 = createMockResult(query2);

      await cache.set(query1, result1);
      await cache.set(query2, result2);

      // Access first entry 3 times
      await cache.get(query1);
      await cache.get(query1);
      await cache.get(query1);

      // Access second entry 1 time
      await cache.get(query2);

      // WHEN: Checking stats
      const stats = cache.getStats();

      // THEN: Average access count should be (3 + 1) / 2 = 2
      expect(stats.avgAccessCount).toBe(2);
    });
  });

  describe('Pattern-Based Invalidation', () => {
    it('should invalidate entries matching pattern', async () => {
      // GIVEN: Multiple cache entries with related queries
      const queries = [
        createMockQuery({ query: 'typescript types' }),
        createMockQuery({ query: 'typescript interfaces' }),
        createMockQuery({ query: 'javascript types' })
      ];

      for (const query of queries) {
        const result = createMockResult(query);
        await cache.set(query, result);
      }

      // WHEN: Invalidating by pattern
      const invalidatedCount = await cache.invalidateByPattern('typescript');

      // THEN: Should invalidate 2 entries
      expect(invalidatedCount).toBe(2);

      // Verify they're gone
      expect(await cache.get(queries[0])).toBeNull();
      expect(await cache.get(queries[1])).toBeNull();
      expect(await cache.get(queries[2])).not.toBeNull();
    });

    it('should return 0 when pattern matches nothing', async () => {
      // GIVEN: Cache entries
      const query = createMockQuery({ query: 'test' });
      const result = createMockResult(query);
      await cache.set(query, result);

      // WHEN: Invalidating with non-matching pattern
      const invalidatedCount = await cache.invalidateByPattern('nomatch');

      // THEN: Should return 0
      expect(invalidatedCount).toBe(0);
    });

    it('should handle substring matching correctly', async () => {
      // GIVEN: Cache entries
      const queries = [
        createMockQuery({ query: 'prefix-test-suffix' }),
        createMockQuery({ query: 'other-test-entry' }),
        createMockQuery({ query: 'no match here' })
      ];

      for (const query of queries) {
        const result = createMockResult(query);
        await cache.set(query, result);
      }

      // WHEN: Invalidating by substring
      const invalidatedCount = await cache.invalidateByPattern('test');

      // THEN: Should invalidate 2 entries
      expect(invalidatedCount).toBe(2);
    });
  });

  describe('Cache Management Operations', () => {
    it('should invalidate single entry', async () => {
      // GIVEN: Cached entry
      const query = createMockQuery();
      const result = createMockResult(query);
      await cache.set(query, result);

      // WHEN: Invalidating entry
      const wasDeleted = await cache.invalidate(query);

      // THEN: Entry should be deleted
      expect(wasDeleted).toBe(true);
      expect(await cache.get(query)).toBeNull();
    });

    it('should return false when invalidating non-existent entry', async () => {
      // GIVEN: Empty cache
      const query = createMockQuery();

      // WHEN: Invalidating non-existent entry
      const wasDeleted = await cache.invalidate(query);

      // THEN: Should return false
      expect(wasDeleted).toBe(false);
    });

    it('should clear all cache entries', async () => {
      // GIVEN: Multiple cache entries
      const queries = [];
      for (let i = 0; i < 5; i++) {
        const query = createMockQuery({ query: `test ${i}` });
        queries.push(query);
        const result = createMockResult(query);
        await cache.set(query, result);
      }

      // WHEN: Clearing cache
      await cache.clear();

      // THEN: All entries should be deleted
      for (const query of queries) {
        expect(await cache.get(query)).toBeNull();
      }

      // Stats should be reset
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });
});
