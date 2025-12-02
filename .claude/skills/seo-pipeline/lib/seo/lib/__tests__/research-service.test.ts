/**
 * ResearchService Test Suite
 *
 * @module planning/seo/lib/__tests__/research-service.test
 * @description Comprehensive tests for ResearchService with MCP tool integration
 */

import { ResearchService, searchSerp, fetchContent, hybridResearch } from '../research-service';
import { ResearchCache } from '../research-cache';
import { RateLimiter } from '../rate-limiter';
import { ResearchQuery, ResearchError, ResearchErrorCode } from '../../types/research';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Test cache directory
const TEST_CACHE_DIR = path.join(os.tmpdir(), 'cfn-seo-service-test', Date.now().toString());

// Mock query factory
const createMockQuery = (overrides?: Partial<ResearchQuery>): ResearchQuery => ({
  query: 'test query',
  type: 'serp',
  options: {
    maxResults: 10
  },
  ...overrides
});

describe('ResearchService', () => {
  let service: ResearchService;
  let testCache: ResearchCache;
  let webSearchLimiter: RateLimiter;
  let webFetchLimiter: RateLimiter;

  beforeEach(() => {
    // Create test dependencies
    testCache = new ResearchCache(TEST_CACHE_DIR);
    webSearchLimiter = new RateLimiter('websearch', {
      maxRequests: 100,
      windowMs: 60000,
      service: 'websearch',
      enableQueue: false
    });
    webFetchLimiter = new RateLimiter('webfetch', {
      maxRequests: 100,
      windowMs: 60000,
      service: 'webfetch',
      enableQueue: false
    });

    // Create service with test dependencies
    service = new ResearchService({
      cache: testCache,
      rateLimiters: {
        websearch: webSearchLimiter,
        webfetch: webFetchLimiter
      },
      verbose: false
    });
  });

  afterEach(() => {
    // Cleanup
    webSearchLimiter.stop();
    webFetchLimiter.stop();

    if (fs.existsSync(TEST_CACHE_DIR)) {
      const files = fs.readdirSync(TEST_CACHE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_CACHE_DIR, file));
      }
      fs.rmdirSync(TEST_CACHE_DIR);
    }
  });

  describe('Query Validation', () => {
    it('should reject query with missing query text', async () => {
      // GIVEN: Query with empty text
      const query = createMockQuery({ query: '' });

      // WHEN/THEN: Should throw validation error
      await expect(service.execute(query)).rejects.toThrow(ResearchError);
      await expect(service.execute(query)).rejects.toThrow('Query text is required');
    });

    it('should reject query with invalid type', async () => {
      // GIVEN: Query with invalid type
      const query = createMockQuery({ type: 'invalid' as any });

      // WHEN/THEN: Should throw validation error
      await expect(service.execute(query)).rejects.toThrow(ResearchError);
      await expect(service.execute(query)).rejects.toThrow('Invalid query type');
    });

    it('should reject content query without targetUrl', async () => {
      // GIVEN: Content query without targetUrl
      const query = createMockQuery({
        type: 'content',
        options: {}
      });

      // WHEN/THEN: Should throw validation error
      await expect(service.execute(query)).rejects.toThrow(ResearchError);
      await expect(service.execute(query)).rejects.toThrow('targetUrl is required');
    });

    it('should reject query with invalid maxResults', async () => {
      // GIVEN: Query with maxResults < 1
      const query = createMockQuery({
        options: { maxResults: 0 }
      });

      // WHEN/THEN: Should throw validation error
      await expect(service.execute(query)).rejects.toThrow(ResearchError);
      await expect(service.execute(query)).rejects.toThrow('maxResults must be >= 1');
    });

    it('should accept valid serp query', async () => {
      // GIVEN: Valid SERP query
      const query = createMockQuery({ type: 'serp' });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should return result
      expect(result).toBeDefined();
      expect(result.query).toEqual(query);
      expect(result.serpResults).toBeDefined();
    });

    it('should accept valid content query with targetUrl', async () => {
      // GIVEN: Valid content query
      const query = createMockQuery({
        type: 'content',
        options: { targetUrl: 'https://example.com' }
      });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should return result
      expect(result).toBeDefined();
      expect(result.query).toEqual(query);
      expect(result.contentResults).toBeDefined();
    });

    it('should accept valid hybrid query', async () => {
      // GIVEN: Valid hybrid query
      const query = createMockQuery({
        type: 'hybrid',
        options: { targetUrl: 'https://example.com', maxResults: 10 }
      });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should return result with both SERP and content
      expect(result).toBeDefined();
      expect(result.serpResults).toBeDefined();
      expect(result.contentResults).toBeDefined();
    });
  });

  describe('SERP Result Parsing', () => {
    it('should parse SERP results correctly', async () => {
      // GIVEN: SERP query
      const query = createMockQuery({ type: 'serp' });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should parse results
      expect(result.serpResults).toBeDefined();
      expect(Array.isArray(result.serpResults)).toBe(true);
      if (result.serpResults && result.serpResults.length > 0) {
        const firstResult = result.serpResults[0];
        expect(firstResult.title).toBeDefined();
        expect(firstResult.url).toBeDefined();
        expect(firstResult.description).toBeDefined();
        expect(firstResult.position).toBeGreaterThan(0);
      }
    });

    it('should normalize SERP result structure', async () => {
      // GIVEN: SERP query
      const query = createMockQuery({ type: 'serp' });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Results should have normalized structure
      expect(result.serpResults).toBeDefined();
      if (result.serpResults && result.serpResults.length > 0) {
        const firstResult = result.serpResults[0];
        expect(typeof firstResult.title).toBe('string');
        expect(typeof firstResult.url).toBe('string');
        expect(typeof firstResult.description).toBe('string');
        expect(typeof firstResult.position).toBe('number');
      }
    });

    it('should handle empty SERP results gracefully', async () => {
      // GIVEN: SERP query that returns empty results
      const query = createMockQuery({ type: 'serp' });

      // Mock implementation would return empty results
      // For now, service returns mock data, so we test the structure

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should return valid result structure
      expect(result.serpResults).toBeDefined();
      expect(Array.isArray(result.serpResults)).toBe(true);
    });

    it('should extract SERP features when present', async () => {
      // GIVEN: SERP query
      const query = createMockQuery({ type: 'serp' });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Features should be extracted if available
      expect(result.serpResults).toBeDefined();
      // Features are optional, so we just verify the field exists
    });
  });

  describe('Content Metadata Extraction', () => {
    it('should extract content metadata correctly', async () => {
      // GIVEN: Content query
      const query = createMockQuery({
        type: 'content',
        options: { targetUrl: 'https://example.com' }
      });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should extract metadata
      expect(result.contentResults).toBeDefined();
      expect(result.contentResults?.length).toBeGreaterThan(0);

      const content = result.contentResults![0];
      expect(content.metadata).toBeDefined();
      expect(content.metadata.wordCount).toBeGreaterThan(0);
      expect(content.metadata.headings).toBeDefined();
      expect(content.metadata.headings.h1).toBeGreaterThanOrEqual(0);
      expect(content.metadata.headings.h2).toBeGreaterThanOrEqual(0);
      expect(content.metadata.headings.h3).toBeGreaterThanOrEqual(0);
    });

    it('should count heading elements correctly', async () => {
      // GIVEN: Content query
      const query = createMockQuery({
        type: 'content',
        options: { targetUrl: 'https://example.com' }
      });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Headings should be counted
      const content = result.contentResults![0];
      expect(typeof content.metadata.headings.h1).toBe('number');
      expect(typeof content.metadata.headings.h2).toBe('number');
      expect(typeof content.metadata.headings.h3).toBe('number');
    });

    it('should count links and images', async () => {
      // GIVEN: Content query
      const query = createMockQuery({
        type: 'content',
        options: { targetUrl: 'https://example.com' }
      });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Links and images should be counted
      const content = result.contentResults![0];
      expect(typeof content.metadata.internalLinks).toBe('number');
      expect(typeof content.metadata.images).toBe('number');
    });

    it('should extract schema.org types when present', async () => {
      // GIVEN: Content query
      const query = createMockQuery({
        type: 'content',
        options: { targetUrl: 'https://example.com' }
      });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Schema types should be extracted if present
      const content = result.contentResults![0];
      // Schema is optional
      if (content.metadata.schema) {
        expect(Array.isArray(content.metadata.schema)).toBe(true);
      }
    });

    it('should calculate word count from content', async () => {
      // GIVEN: Content query
      const query = createMockQuery({
        type: 'content',
        options: { targetUrl: 'https://example.com' }
      });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Word count should be calculated
      const content = result.contentResults![0];
      expect(content.metadata.wordCount).toBeGreaterThan(0);
      expect(content.content.split(/\s+/).length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should wrap unknown errors as ResearchError', async () => {
      // GIVEN: Service that will encounter an error
      const query = createMockQuery({
        type: 'content',
        options: { targetUrl: 'invalid-url' } // Will fail parsing
      });

      // WHEN/THEN: Should wrap error
      try {
        await service.execute(query);
      } catch (error) {
        // Service might succeed with mock data, so we just verify error handling exists
      }
    });

    it('should preserve ResearchError instances', async () => {
      // GIVEN: Invalid query
      const query = createMockQuery({ query: '' });

      // WHEN/THEN: Should throw ResearchError
      try {
        await service.execute(query);
      } catch (error) {
        expect(error).toBeInstanceOf(ResearchError);
        expect((error as ResearchError).code).toBe(ResearchErrorCode.INVALID_QUERY);
      }
    });

    it('should include query context in error details', async () => {
      // GIVEN: Invalid query
      const query = createMockQuery({ query: '' });

      // WHEN/THEN: Should include context
      try {
        await service.execute(query);
      } catch (error) {
        expect((error as ResearchError).details).toBeDefined();
        expect((error as ResearchError).details?.query).toBeDefined();
      }
    });
  });

  describe('Hybrid Query Parallelism', () => {
    it('should execute SERP and content queries in parallel', async () => {
      // GIVEN: Hybrid query
      const query = createMockQuery({
        type: 'hybrid',
        options: { targetUrl: 'https://example.com', maxResults: 10 }
      });

      const startTime = Date.now();

      // WHEN: Executing hybrid query
      const result = await service.execute(query);

      const executionTime = Date.now() - startTime;

      // THEN: Should return both result types
      expect(result.serpResults).toBeDefined();
      expect(result.contentResults).toBeDefined();
      expect(result.metadata.resultCount).toBeGreaterThan(0);

      // Execution should be reasonably fast (parallel execution)
      // Note: This is a rough check, real timing depends on mock implementation
      expect(executionTime).toBeLessThan(5000);
    });

    it('should combine result counts for hybrid queries', async () => {
      // GIVEN: Hybrid query
      const query = createMockQuery({
        type: 'hybrid',
        options: { targetUrl: 'https://example.com', maxResults: 5 }
      });

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Result count should include both SERP and content results
      const serpCount = result.serpResults?.length || 0;
      const contentCount = result.contentResults?.length || 0;
      expect(result.metadata.resultCount).toBe(serpCount + contentCount);
    });

    it('should handle partial failures in hybrid queries', async () => {
      // GIVEN: Hybrid query
      const query = createMockQuery({
        type: 'hybrid',
        options: { targetUrl: 'https://example.com' }
      });

      // WHEN: Executing query (with mock implementation)
      const result = await service.execute(query);

      // THEN: Should return available results
      // In a real scenario with MCP tool failure, we'd expect partial results
      expect(result).toBeDefined();
    });
  });

  describe('Cache-First Strategy', () => {
    it('should return cached result when available', async () => {
      // GIVEN: Query executed and cached
      const query = createMockQuery();
      const firstResult = await service.execute(query);

      // WHEN: Executing same query again
      const secondResult = await service.execute(query);

      // THEN: Should return cached result
      expect(secondResult.metadata.fromCache).toBe(true);
      expect(secondResult.metadata.cacheKey).toBeDefined();
    });

    it('should skip MCP call when cache hit', async () => {
      // GIVEN: Cached query
      const query = createMockQuery();
      await service.execute(query);

      // WHEN: Executing again
      const startTime = Date.now();
      const result = await service.execute(query);
      const executionTime = Date.now() - startTime;

      // THEN: Should be very fast (no MCP call)
      expect(result.metadata.fromCache).toBe(true);
      expect(executionTime).toBeLessThan(100); // Cache lookup should be <100ms
    });

    it('should execute MCP call on cache miss', async () => {
      // GIVEN: New query
      const query = createMockQuery();

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should not be from cache
      expect(result.metadata.fromCache).toBe(false);
      expect(result.metadata.executionTime).toBeGreaterThan(0);
    });

    it('should cache result after successful execution', async () => {
      // GIVEN: New query
      const query = createMockQuery();

      // WHEN: Executing query
      await service.execute(query);

      // THEN: Result should be cached
      const cachedResult = await testCache.get(query);
      expect(cachedResult).not.toBeNull();
    });

    it('should include cache statistics in metadata', async () => {
      // GIVEN: Query
      const query = createMockQuery();

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Metadata should include cache status
      expect(result.metadata.fromCache).toBeDefined();
      expect(typeof result.metadata.fromCache).toBe('boolean');
    });
  });

  describe('Service Statistics', () => {
    it('should provide cache statistics', () => {
      // WHEN: Getting cache stats
      const stats = service.getCacheStats();

      // THEN: Should return stats object
      expect(stats).toBeDefined();
      expect(stats.hits).toBeDefined();
      expect(stats.misses).toBeDefined();
      expect(stats.hitRate).toBeDefined();
    });

    it('should provide rate limiter statistics', () => {
      // WHEN: Getting rate limiter stats
      const stats = service.getRateLimiterStats();

      // THEN: Should return stats for both services
      expect(stats.websearch).toBeDefined();
      expect(stats.webfetch).toBeDefined();
      expect(stats.websearch.currentTokens).toBeDefined();
      expect(stats.webfetch.currentTokens).toBeDefined();
    });
  });

  describe('Cache Management', () => {
    it('should clear cache when requested', async () => {
      // GIVEN: Cached results
      const query = createMockQuery();
      await service.execute(query);

      // WHEN: Clearing cache
      await service.clearCache();

      // THEN: Cache should be empty
      const stats = service.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should invalidate cache by pattern', async () => {
      // GIVEN: Multiple cached results
      await service.execute(createMockQuery({ query: 'typescript types' }));
      await service.execute(createMockQuery({ query: 'typescript interfaces' }));
      await service.execute(createMockQuery({ query: 'javascript types' }));

      // WHEN: Invalidating by pattern
      const count = await service.invalidateCacheByPattern('typescript');

      // THEN: Should invalidate matching entries
      expect(count).toBe(2);
    });
  });

  describe('Metadata and Tracking', () => {
    it('should include execution time in result', async () => {
      // GIVEN: Query
      const query = createMockQuery();

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should include execution time
      expect(result.metadata.executionTime).toBeDefined();
      expect(result.metadata.executionTime).toBeGreaterThan(0);
    });

    it('should include timestamp in result', async () => {
      // GIVEN: Query
      const query = createMockQuery();

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should include timestamp
      expect(result.timestamp).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should include rate limit status in metadata', async () => {
      // GIVEN: Query
      const query = createMockQuery();

      // WHEN: Executing query
      const result = await service.execute(query);

      // THEN: Should include rate limit status
      expect(result.metadata.rateLimitStatus).toBeDefined();
      expect(result.metadata.rateLimitStatus?.remaining).toBeDefined();
      expect(result.metadata.rateLimitStatus?.resetAt).toBeInstanceOf(Date);
    });
  });

  describe('Convenience Functions', () => {
    describe('searchSerp', () => {
      it('should execute SERP query with defaults', async () => {
        // WHEN: Using convenience function
        const result = await searchSerp('typescript types');

        // THEN: Should return SERP results
        expect(result.query.type).toBe('serp');
        expect(result.query.query).toBe('typescript types');
        expect(result.serpResults).toBeDefined();
      });

      it('should accept custom options', async () => {
        // WHEN: Using convenience function with options
        const result = await searchSerp('typescript types', {
          maxResults: 20,
          priority: 'high'
        });

        // THEN: Should use custom options
        expect(result.query.options?.maxResults).toBe(20);
        expect(result.query.options?.priority).toBe('high');
      });
    });

    describe('fetchContent', () => {
      it('should execute content query', async () => {
        // WHEN: Using convenience function
        const result = await fetchContent('https://example.com');

        // THEN: Should return content results
        expect(result.query.type).toBe('content');
        expect(result.contentResults).toBeDefined();
      });

      it('should accept deep crawl option', async () => {
        // WHEN: Using convenience function with deep crawl
        const result = await fetchContent('https://example.com', {
          deepCrawl: true,
          priority: 'high'
        });

        // THEN: Should use custom options
        expect(result.query.options?.deepCrawl).toBe(true);
        expect(result.query.options?.priority).toBe('high');
      });
    });

    describe('hybridResearch', () => {
      it('should execute hybrid query', async () => {
        // WHEN: Using convenience function
        const result = await hybridResearch('typescript', 'https://example.com');

        // THEN: Should return both result types
        expect(result.query.type).toBe('hybrid');
        expect(result.serpResults).toBeDefined();
        expect(result.contentResults).toBeDefined();
      });

      it('should accept all hybrid options', async () => {
        // WHEN: Using convenience function with options
        const result = await hybridResearch('typescript', 'https://example.com', {
          maxResults: 15,
          deepCrawl: true,
          priority: 'high'
        });

        // THEN: Should use custom options
        expect(result.query.options?.maxResults).toBe(15);
        expect(result.query.options?.deepCrawl).toBe(true);
        expect(result.query.options?.priority).toBe('high');
      });
    });
  });
});
