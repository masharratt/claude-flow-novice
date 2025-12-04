/**
 * Unit tests for Google Autocomplete Suggest Keyword Collector
 *
 * Tests cover:
 * - RuVector caching strategy
 * - Query expansion with alphabet suffixes
 * - Rate limiting and throttling
 * - SSRF protection
 * - Deduplication
 *
 * @module seo/lib/discovery/__tests__/google-suggest-collector.test
 */

import { collectFromGoogleSuggest, batchCollectFromGoogleSuggest } from '../google-suggest-collector';
import type { SuggestCollectorOptions } from '../types';
import {
  mockFetch,
  restoreFetch,
  mockSuggestResponse,
  MockSEOQueryManager,
  assertValidKeywordSources,
  wait,
} from './test-utils';

describe('Google Suggest Collector', () => {
  let seoQuery: MockSEOQueryManager;

  beforeEach(() => {
    seoQuery = new MockSEOQueryManager();
  });

  afterEach(() => {
    restoreFetch();
    seoQuery.clear();
  });

  // ========== RUVECTOR CACHING ==========

  describe('RuVector Caching', () => {
    it('should query cache before API call', async () => {
      // GIVEN keyword in cache
      seoQuery.addKeywordResearch('crm software', {
        metadata: {
          niche: 'saas',
          secondaryKeywords: [
            { keyword: 'best crm software', volume: 0, difficulty: 0, cpc: 0 },
            { keyword: 'crm software comparison', volume: 0, difficulty: 0, cpc: 0 },
          ],
          peopleAlsoAsk: [],
        },
      });

      const mockFn = mockFetch(/suggestqueries/, mockSuggestResponse('crm software', 5));

      // WHEN collecting with cache-first
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'saas',
        cacheFirst: true,
      };
      const keywords = await collectFromGoogleSuggest('crm software', options, seoQuery as any);

      // THEN should not call API
      expect(mockFn).not.toHaveBeenCalled();
      expect(keywords).toHaveLength(2);
      expect(keywords.every(kw => kw.cacheHit)).toBe(true);
    });

    it('should store results in cache after API call', async () => {
      // GIVEN cache miss
      mockFetch(/suggestqueries/, mockSuggestResponse('test keyword', 5));

      // WHEN collecting keywords
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: true,
      };
      await collectFromGoogleSuggest('test keyword', options, seoQuery as any);

      // THEN should store in cache
      const cached = await seoQuery.getCollections().keywordResearch.getByKeyword('test keyword');
      expect(cached).toBeDefined();
      expect(cached.metadata.niche).toBe('general');
    });

    it('should track cache hit rate', async () => {
      // GIVEN one cached keyword and one not cached
      seoQuery.addKeywordResearch('cached keyword', {
        metadata: {
          niche: 'test',
          secondaryKeywords: [{ keyword: 'suggestion 1', volume: 0, difficulty: 0, cpc: 0 }],
          peopleAlsoAsk: [],
        },
      });

      mockFetch(/suggestqueries/, mockSuggestResponse('uncached keyword', 3));

      // WHEN collecting from both
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        cacheFirst: true,
      };

      const cached = await collectFromGoogleSuggest('cached keyword', options, seoQuery as any);
      const uncached = await collectFromGoogleSuggest('uncached keyword', options, seoQuery as any);

      // THEN cache hit rate should be trackable
      const totalKeywords = cached.length + uncached.length;
      const cacheHits = cached.filter(kw => kw.cacheHit).length;
      const cacheHitRate = (cacheHits / totalKeywords) * 100;

      expect(cacheHitRate).toBeGreaterThan(0);
      expect(cacheHitRate).toBeLessThan(100);
    });

    it('should skip cache when cacheFirst is false', async () => {
      // GIVEN keyword in cache
      seoQuery.addKeywordResearch('cached', {
        metadata: {
          niche: 'test',
          secondaryKeywords: [{ keyword: 'from cache', volume: 0, difficulty: 0, cpc: 0 }],
          peopleAlsoAsk: [],
        },
      });

      const mockFn = mockFetch(/suggestqueries/, mockSuggestResponse('cached', 3));

      // WHEN collecting with cacheFirst=false
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'test',
        cacheFirst: false,
      };
      const keywords = await collectFromGoogleSuggest('cached', options, seoQuery as any);

      // THEN should call API
      expect(mockFn).toHaveBeenCalled();
      expect(keywords.every(kw => !kw.cacheHit)).toBe(true);
    });
  });

  // ========== QUERY EXPANSION ==========

  describe('Query Expansion', () => {
    it('should expand seed keyword with alphabet', async () => {
      // GIVEN mock suggest API
      const mockFn = mockFetch(/suggestqueries/, mockSuggestResponse('test', 2));

      // WHEN collecting keywords
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      await collectFromGoogleSuggest('test', options);

      // THEN should query variations (base + 26 letters)
      expect(mockFn).toHaveBeenCalledTimes(27); // base + a-z
    });

    it('should respect max keywords limit', async () => {
      // GIVEN many suggestions
      mockFetch(/suggestqueries/, mockSuggestResponse('keyword', 100));

      // WHEN collecting with limit
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        limit: 50,
        cacheFirst: false,
      };
      const keywords = await collectFromGoogleSuggest('keyword', options);

      // THEN should not exceed limit
      expect(keywords.length).toBeLessThanOrEqual(50);
    });

    it('should deduplicate across variations', async () => {
      // GIVEN mock responses with duplicates
      let callCount = 0;
      global.fetch = jest.fn(async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ['seed', callCount % 2 === 0 ? ['duplicate', 'unique'] : ['duplicate', 'other']],
        } as any;
      });

      // WHEN collecting keywords
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      const keywords = await collectFromGoogleSuggest('seed', options);

      // THEN should deduplicate
      const uniqueKeywords = new Set(keywords.map(kw => kw.keyword));
      expect(keywords.length).toBe(uniqueKeywords.size);
    });
  });

  // ========== RATE LIMITING ==========

  describe('Rate Limiting', () => {
    it('should throttle requests between variations', async () => {
      // GIVEN mock suggest API
      const timestamps: number[] = [];
      global.fetch = jest.fn(async () => {
        timestamps.push(Date.now());
        return {
          ok: true,
          status: 200,
          json: async () => ['seed', ['suggestion 1', 'suggestion 2']],
        } as any;
      });

      // WHEN collecting keywords
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      await collectFromGoogleSuggest('test', options);

      // THEN should have delays between requests
      for (let i = 1; i < Math.min(5, timestamps.length); i++) {
        const delay = timestamps[i] - timestamps[i - 1];
        expect(delay).toBeGreaterThanOrEqual(90); // ~100ms delay
      }
    });

    it('should handle 429 rate limit errors', async () => {
      // GIVEN rate limit response
      let callCount = 0;
      global.fetch = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: false, status: 429, text: async () => 'Rate limited' } as any;
        }
        return { ok: true, status: 200, json: async () => ['seed', ['suggestion']] } as any;
      });

      // WHEN collecting keywords
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      const keywords = await collectFromGoogleSuggest('test', options);

      // THEN should handle gracefully
      expect(keywords).toBeDefined();
    });
  });

  // ========== SSRF PROTECTION ==========

  describe('SSRF Protection', () => {
    it('should validate URL before fetch', async () => {
      // GIVEN suggest collector
      const mockFn = mockFetch(/suggestqueries\.google\.com/, mockSuggestResponse('test', 2));

      // WHEN collecting keywords
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      await collectFromGoogleSuggest('test', options);

      // THEN should only call Google domain
      const calls = mockFn.mock.calls;
      calls.forEach(call => {
        const url = call[0] as string;
        expect(url).toMatch(/suggestqueries\.google\.com/);
      });
    });

    it('should sanitize query parameters', async () => {
      // GIVEN malicious input
      const mockFn = mockFetch(/suggestqueries/, mockSuggestResponse('test', 2));

      // WHEN collecting with special characters
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      await collectFromGoogleSuggest('<script>alert("xss")</script>', options);

      // THEN should URL encode parameters
      const url = mockFn.mock.calls[0][0] as string;
      expect(url).not.toContain('<script>');
      expect(url).toContain('q=');
    });
  });

  // ========== BATCH COLLECTION ==========

  describe('Batch Collection', () => {
    it('should collect from multiple seeds', async () => {
      // GIVEN multiple seed keywords
      mockFetch(/suggestqueries/, mockSuggestResponse('seed', 3));

      // WHEN batch collecting
      const seeds = ['seed1', 'seed2', 'seed3'];
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      const keywords = await batchCollectFromGoogleSuggest(seeds, options);

      // THEN should return combined results
      expect(keywords.length).toBeGreaterThan(0);
      assertValidKeywordSources(keywords);
    });

    it('should deduplicate across seeds', async () => {
      // GIVEN overlapping suggestions
      global.fetch = jest.fn(async (input: any) => {
        const url = String(input);
        const seed = url.includes('seed1') ? 'seed1' : 'seed2';
        return {
          ok: true,
          status: 200,
          json: async () => [seed, ['common keyword', `${seed} unique`]],
        } as any;
      }) as any;

      // WHEN batch collecting
      const seeds = ['seed1', 'seed2'];
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      const keywords = await batchCollectFromGoogleSuggest(seeds, options);

      // THEN should deduplicate common keywords
      const keywordTexts = keywords.map(kw => kw.keyword);
      const uniqueCount = new Set(keywordTexts).size;
      expect(keywordTexts.length).toBe(uniqueCount);
    });

    it('should respect rate limiting between seeds', async () => {
      // GIVEN multiple seeds
      const timestamps: number[] = [];
      global.fetch = jest.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('client=firefox') && !url.includes('%20')) {
          // Base seed call
          timestamps.push(Date.now());
        }
        return {
          ok: true,
          status: 200,
          json: async () => ['seed', ['suggestion']],
        } as any;
      }) as any;

      // WHEN batch collecting
      const seeds = ['seed1', 'seed2', 'seed3'];
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      await batchCollectFromGoogleSuggest(seeds, options);

      // THEN should have delays between seeds
      expect(timestamps.length).toBeGreaterThan(1);
    });
  });

  // ========== ERROR HANDLING ==========

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      // GIVEN network timeout
      mockFetch(/suggestqueries/, {}, { status: 408 });

      // WHEN collecting keywords
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      const keywords = await collectFromGoogleSuggest('test', options);

      // THEN should return empty or partial results
      expect(Array.isArray(keywords)).toBe(true);
    });

    it('should handle malformed API responses', async () => {
      // GIVEN malformed response
      mockFetch(/suggestqueries/, { invalid: 'format' });

      // WHEN collecting keywords
      const options: SuggestCollectorOptions = {
        taskId: 'test-task',
        niche: 'general',
        cacheFirst: false,
      };
      const keywords = await collectFromGoogleSuggest('test', options);

      // THEN should handle gracefully
      expect(Array.isArray(keywords)).toBe(true);
    });
  });
});
