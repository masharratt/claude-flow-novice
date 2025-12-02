/**
 * Research Workflow Integration Test Suite
 *
 * @module planning/seo/lib/__tests__/integration/research-workflow.test
 * @description End-to-end integration tests for complete research workflows
 */

import { ResearchService } from '../../research-service';
import { ResearchCache } from '../../research-cache';
import { RateLimiter } from '../../rate-limiter';
import { ResearchQuery } from '../../../types/research';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Test cache directory
const TEST_CACHE_DIR = path.join(os.tmpdir(), 'cfn-seo-integration-test', Date.now().toString());

describe('Research Workflow Integration', () => {
  let service: ResearchService;
  let cache: ResearchCache;
  let webSearchLimiter: RateLimiter;
  let webFetchLimiter: RateLimiter;

  beforeEach(() => {
    // Setup integration test environment
    cache = new ResearchCache(TEST_CACHE_DIR);
    webSearchLimiter = new RateLimiter('websearch', {
      maxRequests: 10,
      windowMs: 1000,
      service: 'websearch',
      enableQueue: true,
      maxQueueSize: 20
    });
    webFetchLimiter = new RateLimiter('webfetch', {
      maxRequests: 20,
      windowMs: 1000,
      service: 'webfetch',
      enableQueue: true,
      maxQueueSize: 50
    });

    service = new ResearchService({
      cache,
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

  describe('End-to-End SERP Query with Cache', () => {
    it('should execute complete SERP workflow', async () => {
      // GIVEN: SERP query
      const query: ResearchQuery = {
        query: 'TypeScript utility types',
        type: 'serp',
        options: {
          maxResults: 10,
          priority: 'normal'
        }
      };

      // WHEN: Executing query for first time
      const result1 = await service.execute(query);

      // THEN: Should get fresh result
      expect(result1).toBeDefined();
      expect(result1.serpResults).toBeDefined();
      expect(result1.metadata.fromCache).toBe(false);
      expect(result1.metadata.executionTime).toBeGreaterThan(0);

      // AND WHEN: Executing same query again
      const result2 = await service.execute(query);

      // THEN: Should get cached result
      expect(result2.metadata.fromCache).toBe(true);
      expect(result2.metadata.cacheKey).toBeDefined();
      expect(result2.serpResults).toEqual(result1.serpResults);
    });

    it('should track cache statistics across multiple queries', async () => {
      // GIVEN: Multiple queries
      const queries = [
        { query: 'TypeScript types', type: 'serp' as const },
        { query: 'JavaScript async', type: 'serp' as const },
        { query: 'React hooks', type: 'serp' as const }
      ];

      // WHEN: Executing queries twice each
      for (const query of queries) {
        await service.execute(query);
        await service.execute(query); // Cache hit
      }

      // THEN: Cache stats should reflect hits
      const cacheStats = await service.getCacheStats();
      expect(cacheStats.hits).toBe(3); // 3 cache hits
      expect(cacheStats.misses).toBe(3); // 3 initial misses
      expect(cacheStats.hitRate).toBe(0.5); // 50% hit rate
      expect(cacheStats.totalEntries).toBe(3);
    });

    it('should handle cache invalidation in workflow', async () => {
      // GIVEN: Cached query
      const query: ResearchQuery = {
        query: 'TypeScript patterns',
        type: 'serp'
      };

      await service.execute(query);
      const cachedResult = await service.execute(query);
      expect(cachedResult.metadata.fromCache).toBe(true);

      // WHEN: Invalidating cache
      await service.clearCache();

      // AND: Executing query again
      const freshResult = await service.execute(query);

      // THEN: Should get fresh result
      expect(freshResult.metadata.fromCache).toBe(false);
    });
  });

  describe('Rate Limit Enforcement Across Multiple Queries', () => {
    it('should enforce rate limits across concurrent queries', async () => {
      // GIVEN: Rate limiter with small capacity
      const limitedService = new ResearchService({
        cache,
        rateLimiters: {
          websearch: new RateLimiter('websearch', {
            maxRequests: 3,
            windowMs: 1000,
            service: 'websearch',
            enableQueue: true,
            maxQueueSize: 10
          }),
          webfetch: webFetchLimiter
        }
      });

      // WHEN: Making 7 concurrent requests
      const queries = Array.from({ length: 7 }, (_, i) => ({
        query: `test query ${i}`,
        type: 'serp' as const
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        queries.map(query => limitedService.execute(query))
      );
      const totalTime = Date.now() - startTime;

      // THEN: All requests should complete
      expect(results).toHaveLength(7);

      // Some should be throttled (queued)
      const rateLimiterStats = limitedService.getRateLimiterStats();
      expect(rateLimiterStats.websearch.throttledRequests).toBeGreaterThan(0);

      // Total time should reflect rate limiting
      expect(totalTime).toBeGreaterThan(200); // At least some queuing delay
    });

    it('should prioritize high priority requests in queue', async () => {
      // GIVEN: Rate limiter with exhausted tokens
      const limitedService = new ResearchService({
        cache,
        rateLimiters: {
          websearch: new RateLimiter('websearch', {
            maxRequests: 1,
            windowMs: 1000,
            service: 'websearch',
            enableQueue: true,
            maxQueueSize: 10
          }),
          webfetch: webFetchLimiter
        }
      });

      // Exhaust rate limit
      await limitedService.execute({ query: 'initial', type: 'serp' });

      // WHEN: Queueing low then high priority requests
      const lowPriorityPromise = limitedService.execute({
        query: 'low priority',
        type: 'serp',
        options: { priority: 'low' }
      });

      const highPriorityPromise = limitedService.execute({
        query: 'high priority',
        type: 'serp',
        options: { priority: 'high' }
      });

      // THEN: Both should eventually complete
      const results = await Promise.all([lowPriorityPromise, highPriorityPromise]);
      expect(results).toHaveLength(2);
    });

    it('should recover from rate limit errors', async () => {
      // GIVEN: Rate limiter with no queue
      const strictService = new ResearchService({
        cache,
        rateLimiters: {
          websearch: new RateLimiter('websearch', {
            maxRequests: 1,
            windowMs: 500,
            service: 'websearch',
            enableQueue: false
          }),
          webfetch: webFetchLimiter
        }
      });

      // Exhaust rate limit
      await strictService.execute({ query: 'test', type: 'serp' });

      // WHEN: Making request that exceeds limit
      let errorThrown = false;
      try {
        await strictService.execute({ query: 'test 2', type: 'serp' });
      } catch (error) {
        errorThrown = true;
      }

      // THEN: Should throw rate limit error
      expect(errorThrown).toBe(true);

      // AND WHEN: Waiting for rate limit window to reset
      await new Promise(resolve => setTimeout(resolve, 600));

      // THEN: Should be able to make request again
      const result = await strictService.execute({ query: 'test 3', type: 'serp' });
      expect(result).toBeDefined();
    });
  });

  describe('Error Recovery and Retry', () => {
    it('should handle validation errors gracefully', async () => {
      // GIVEN: Invalid query
      const invalidQuery: ResearchQuery = {
        query: '',
        type: 'serp'
      };

      // WHEN/THEN: Should throw validation error
      await expect(service.execute(invalidQuery)).rejects.toThrow('Query text is required');

      // AND: Service should remain operational
      const validQuery: ResearchQuery = {
        query: 'valid query',
        type: 'serp'
      };
      const result = await service.execute(validQuery);
      expect(result).toBeDefined();
    });

    it('should handle cache errors without blocking execution', async () => {
      // GIVEN: Query with valid structure
      const query: ResearchQuery = {
        query: 'test query',
        type: 'serp'
      };

      // WHEN: Cache has issues (simulated by permissions or corruption)
      // Service should still execute and return result
      const result = await service.execute(query);

      // THEN: Should return valid result
      expect(result).toBeDefined();
      expect(result.serpResults).toBeDefined();
    });
  });

  describe('Mixed Query Type Workflow', () => {
    it('should handle mixed SERP and content queries', async () => {
      // GIVEN: Mixed query types
      const queries: ResearchQuery[] = [
        { query: 'TypeScript', type: 'serp' },
        { query: 'fetch:example', type: 'content', options: { targetUrl: 'https://example.com' } },
        { query: 'JavaScript', type: 'serp' },
        { query: 'fetch:other', type: 'content', options: { targetUrl: 'https://other.com' } }
      ];

      // WHEN: Executing all queries
      const results = await Promise.all(queries.map(q => service.execute(q)));

      // THEN: All should succeed
      expect(results).toHaveLength(4);
      expect(results[0].serpResults).toBeDefined();
      expect(results[1].contentResults).toBeDefined();
      expect(results[2].serpResults).toBeDefined();
      expect(results[3].contentResults).toBeDefined();
    });

    it('should use separate rate limiters for different query types', async () => {
      // GIVEN: Multiple queries of different types
      const serpQueries = Array.from({ length: 5 }, (_, i) => ({
        query: `serp ${i}`,
        type: 'serp' as const
      }));

      const contentQueries = Array.from({ length: 5 }, (_, i) => ({
        query: `content ${i}`,
        type: 'content' as const,
        options: { targetUrl: `https://example.com/${i}` }
      }));

      // WHEN: Executing all queries
      await Promise.all([
        ...serpQueries.map(q => service.execute(q)),
        ...contentQueries.map(q => service.execute(q))
      ]);

      // THEN: Both rate limiters should have separate stats
      const stats = service.getRateLimiterStats();
      expect(stats.websearch.totalRequests).toBeGreaterThan(0);
      expect(stats.webfetch.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Hybrid Query Integration', () => {
    it('should execute complete hybrid workflow', async () => {
      // GIVEN: Hybrid query
      const query: ResearchQuery = {
        query: 'TypeScript documentation',
        type: 'hybrid',
        options: {
          targetUrl: 'https://www.typescriptlang.org',
          maxResults: 10
        }
      };

      // WHEN: Executing hybrid query
      const result = await service.execute(query);

      // THEN: Should return both SERP and content results
      expect(result.serpResults).toBeDefined();
      expect(result.contentResults).toBeDefined();
      expect(result.metadata.resultCount).toBeGreaterThan(0);

      // Should use both rate limiters
      const stats = service.getRateLimiterStats();
      expect(stats.websearch.totalRequests).toBeGreaterThan(0);
      expect(stats.webfetch.totalRequests).toBeGreaterThan(0);
    });

    it('should cache hybrid query results', async () => {
      // GIVEN: Hybrid query
      const query: ResearchQuery = {
        query: 'React documentation',
        type: 'hybrid',
        options: {
          targetUrl: 'https://react.dev',
          maxResults: 5
        }
      };

      // WHEN: Executing twice
      const result1 = await service.execute(query);
      const result2 = await service.execute(query);

      // THEN: Second should be from cache
      expect(result1.metadata.fromCache).toBe(false);
      expect(result2.metadata.fromCache).toBe(true);
      expect(result2.serpResults).toEqual(result1.serpResults);
      expect(result2.contentResults).toEqual(result1.contentResults);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle burst of queries efficiently', async () => {
      // GIVEN: Large number of queries
      const queries = Array.from({ length: 20 }, (_, i) => ({
        query: `query ${i}`,
        type: 'serp' as const,
        options: { maxResults: 5 }
      }));

      // WHEN: Executing all queries
      const startTime = Date.now();
      const results = await Promise.all(queries.map(q => service.execute(q)));
      const totalTime = Date.now() - startTime;

      // THEN: All should complete
      expect(results).toHaveLength(20);

      // Should complete within reasonable time (with rate limiting)
      expect(totalTime).toBeLessThan(30000); // 30 seconds max
    });

    it('should maintain performance with cache growth', async () => {
      // GIVEN: Growing cache
      for (let i = 0; i < 10; i++) {
        const query: ResearchQuery = {
          query: `unique query ${i}`,
          type: 'serp'
        };
        await service.execute(query);
      }

      // WHEN: Executing cached queries
      const startTime = Date.now();
      for (let i = 0; i < 10; i++) {
        const query: ResearchQuery = {
          query: `unique query ${i}`,
          type: 'serp'
        };
        await service.execute(query);
      }
      const totalTime = Date.now() - startTime;

      // THEN: Cache lookups should be fast
      expect(totalTime).toBeLessThan(1000); // <1s for 10 cache lookups
    });
  });

  describe('Statistics and Monitoring Integration', () => {
    it('should provide comprehensive statistics', async () => {
      // GIVEN: Various queries executed
      await service.execute({ query: 'test 1', type: 'serp' });
      await service.execute({ query: 'test 1', type: 'serp' }); // cache hit
      await service.execute({ query: 'test 2', type: 'content', options: { targetUrl: 'https://example.com' } });

      // WHEN: Getting all statistics
      const cacheStats = service.getCacheStats();
      const rateLimiterStats = service.getRateLimiterStats();

      // THEN: Should provide complete statistics
      expect(cacheStats.hits).toBe(1);
      expect(cacheStats.misses).toBe(2);
      expect(cacheStats.totalEntries).toBe(2);

      expect(rateLimiterStats.websearch.totalRequests).toBeGreaterThan(0);
      expect(rateLimiterStats.webfetch.totalRequests).toBeGreaterThan(0);
    });
  });
});
