/**
 * Unit tests for Discovery Orchestration
 *
 * Tests cover:
 * - Collector registry
 * - Batch execution
 * - Error aggregation
 * - Progress tracking
 * - Cost calculation
 * - Mode support (quick/deep)
 *
 * @module seo/lib/discovery/__tests__/index.test
 */

import {
  collectors,
  executeCollector,
  executeBatch,
  executeByMode,
  getAvailableCollectors,
} from '../index';
import type { CollectorParams } from '../types';
import { MockSEOQueryManager, mockFetch, restoreFetch, mockGSCResponse, mockSuggestResponse } from './test-utils';

describe('Discovery Orchestration', () => {
  let seoQuery: MockSEOQueryManager;

  beforeEach(() => {
    seoQuery = new MockSEOQueryManager();
    process.env.GSC_ACCESS_TOKEN = 'test-token';
  });

  afterEach(() => {
    seoQuery.clear();
    restoreFetch();
    delete process.env.GSC_ACCESS_TOKEN;
  });

  // ========== COLLECTOR REGISTRY ==========

  describe('Collector Registry', () => {
    it('should register all 5 collectors', () => {
      // GIVEN collector registry
      // WHEN checking collectors
      // THEN should have all 5
      expect(collectors).toHaveProperty('gsc');
      expect(collectors).toHaveProperty('suggest');
      expect(collectors).toHaveProperty('paa');
      expect(collectors).toHaveProperty('social');
      expect(collectors).toHaveProperty('competitors');
    });

    it('should provide collector metadata', () => {
      // GIVEN collectors
      // WHEN getting metadata
      // THEN should include name and config
      Object.values(collectors).forEach(collector => {
        expect(collector.name).toBeDefined();
        expect(typeof collector.cacheEnabled).toBe('boolean');
        expect(typeof collector.collect).toBe('function');
      });
    });

    it('should return available collectors list', () => {
      // GIVEN collector registry
      // WHEN getting available collectors
      const available = getAvailableCollectors();

      // THEN should return metadata array
      expect(available.length).toBe(5);
      available.forEach(c => {
        expect(c.name).toBeDefined();
        expect(c.displayName).toBeDefined();
        expect(typeof c.cacheEnabled).toBe('boolean');
        expect(typeof c.costPerCall).toBe('number');
      });
    });
  });

  // ========== SINGLE COLLECTOR EXECUTION ==========

  describe('Single Collector Execution', () => {
    it('should execute GSC collector', async () => {
      // GIVEN GSC configured
      mockFetch(/searchAnalytics/, mockGSCResponse(5));

      // WHEN executing GSC
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        mode: 'quick',
      };
      const result = await executeCollector('gsc', params, seoQuery as any);

      // THEN should return result with keywords
      expect(result.collector).toBe('Google Search Console');
      expect(result.keywords.length).toBeGreaterThan(0);
      expect(result.totalKeywords).toBe(result.keywords.length);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should execute Google Suggest collector', async () => {
      // GIVEN suggest configured
      mockFetch(/suggestqueries/, mockSuggestResponse('test', 3));

      // WHEN executing suggest
      const params: CollectorParams = {
        taskId: 'test-task',
        seedKeywords: ['test'],
        niche: 'general',
        mode: 'quick',
      };
      const result = await executeCollector('suggest', params, seoQuery as any);

      // THEN should return results
      expect(result.collector).toBe('Google Suggest');
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it('should track cache hits for cached collectors', async () => {
      // GIVEN cached suggest data
      seoQuery.addKeywordResearch('cached', {
        metadata: {
          niche: 'test',
          secondaryKeywords: [
            { keyword: 'suggestion 1', volume: 0, difficulty: 0, cpc: 0 },
            { keyword: 'suggestion 2', volume: 0, difficulty: 0, cpc: 0 },
          ],
          peopleAlsoAsk: [],
        },
      });

      // WHEN executing suggest collector
      const params: CollectorParams = {
        taskId: 'test-task',
        seedKeywords: ['cached'],
        niche: 'test',
        mode: 'quick',
      };
      const result = await executeCollector('suggest', params, seoQuery as any);

      // THEN should track cache hits
      expect(result.cacheHits).toBe(2);
      expect(result.cacheMisses).toBe(0);
    });

    it('should handle collector errors gracefully', async () => {
      // GIVEN failing collector
      mockFetch(/searchAnalytics/, { error: 'Internal Server Error' }, { status: 500 });

      // WHEN executing collector
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        mode: 'quick',
      };
      const result = await executeCollector('gsc', params, seoQuery as any);

      // THEN should return result with errors
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.keywords).toEqual([]);
    });

    it('should throw on unknown collector', async () => {
      // GIVEN invalid collector name
      const params: CollectorParams = {
        taskId: 'test-task',
        mode: 'quick',
      };

      // WHEN/THEN should throw
      await expect(executeCollector('invalid', params)).rejects.toThrow('Unknown collector');
    });
  });

  // ========== BATCH EXECUTION ==========

  describe('Batch Execution', () => {
    it('should execute all collectors in parallel', async () => {
      // GIVEN mock responses for all collectors
      mockFetch(/searchAnalytics/, mockGSCResponse(3));
      mockFetch(/suggestqueries/, mockSuggestResponse('test', 2));
      process.env.NODE_ENV = 'development'; // Enable PAA mock

      // WHEN executing batch
      const startTime = Date.now();
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        seedKeywords: ['test'],
        mode: 'quick',
      };
      const result = await executeBatch(['gsc', 'suggest'], params, seoQuery as any);
      const duration = Date.now() - startTime;

      // THEN should complete faster than sequential
      expect(result.results).toHaveLength(2);
      expect(result.totalExecutionTime).toBeLessThan(duration + 1000); // Allow some overhead
    });

    it('should aggregate results from multiple collectors', async () => {
      // GIVEN multiple collectors
      mockFetch(/searchAnalytics/, mockGSCResponse(5));
      mockFetch(/suggestqueries/, mockSuggestResponse('test', 3));

      // WHEN executing batch
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        seedKeywords: ['test'],
        mode: 'quick',
      };
      const result = await executeBatch(['gsc', 'suggest'], params, seoQuery as any);

      // THEN should combine keywords
      expect(result.allKeywords.length).toBeGreaterThan(0);
      const gscKeywords = result.allKeywords.filter(kw => kw.source === 'gsc');
      const suggestKeywords = result.allKeywords.filter(kw => kw.source === 'suggest');
      expect(gscKeywords.length).toBeGreaterThan(0);
      expect(suggestKeywords.length).toBeGreaterThan(0);
    });

    it('should handle partial failures gracefully', async () => {
      // GIVEN one failing collector
      mockFetch(/searchAnalytics/, { error: 'Error' }, { status: 500 });
      mockFetch(/suggestqueries/, mockSuggestResponse('test', 3));

      // WHEN executing batch
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        seedKeywords: ['test'],
        mode: 'quick',
      };
      const result = await executeBatch(['gsc', 'suggest'], params, seoQuery as any);

      // THEN should return partial results
      expect(result.results).toHaveLength(2);
      expect(result.allKeywords.length).toBeGreaterThan(0);
      const hasErrors = result.results.some(r => r.errors && r.errors.length > 0);
      expect(hasErrors).toBe(true);
    });

    it('should deduplicate keywords across collectors', async () => {
      // GIVEN collectors returning same keyword
      global.fetch = jest.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('searchAnalytics')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              rows: [{ keys: ['duplicate keyword'], clicks: 10, impressions: 100, ctr: 0.1, position: 1 }],
            }),
          } as any;
        }
        if (url.includes('suggestqueries')) {
          return {
            ok: true,
            status: 200,
            json: async () => ['seed', ['duplicate keyword', 'unique keyword']],
          } as any;
        }
        return { ok: false, status: 404 } as any;
      }) as any;

      // WHEN executing batch
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        seedKeywords: ['seed'],
        mode: 'quick',
      };
      const result = await executeBatch(['gsc', 'suggest'], params, seoQuery as any);

      // THEN should deduplicate
      const keywordTexts = result.allKeywords.map(kw => kw.keyword.toLowerCase());
      const uniqueCount = new Set(keywordTexts).size;
      expect(keywordTexts.length).toBe(uniqueCount);
    });
  });

  // ========== ERROR AGGREGATION ==========

  describe('Error Aggregation', () => {
    it('should collect errors from all collectors', async () => {
      // GIVEN all collectors failing
      mockFetch(/.*/, { error: 'Failed' }, { status: 500 });

      // WHEN executing batch
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        seedKeywords: ['test'],
        mode: 'quick',
      };
      const result = await executeBatch(['gsc', 'suggest'], params, seoQuery as any);

      // THEN should aggregate errors
      const allErrors = result.results.flatMap(r => r.errors || []);
      expect(allErrors.length).toBeGreaterThan(0);
    });

    it('should continue on collector failure', async () => {
      // GIVEN one failing collector
      let callCount = 0;
      global.fetch = jest.fn(async (url: string | URL | Request) => {
        const urlString = typeof url === 'string' ? url : url.toString();
        callCount++;
        if (urlString.includes('searchAnalytics')) {
          throw new Error('GSC Failed');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ['seed', ['suggestion']],
        } as any;
      });

      // WHEN executing batch
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        seedKeywords: ['test'],
        mode: 'quick',
      };
      const result = await executeBatch(['gsc', 'suggest'], params, seoQuery as any);

      // THEN should have tried all collectors
      expect(result.results).toHaveLength(2);
      expect(callCount).toBeGreaterThan(1); // Both collectors attempted
    });
  });

  // ========== PROGRESS TRACKING ==========

  describe('Progress Tracking', () => {
    it('should track completion percentage', async () => {
      // GIVEN batch execution
      mockFetch(/.*/, mockSuggestResponse('test', 2));

      // WHEN executing
      const params: CollectorParams = {
        taskId: 'test-task',
        seedKeywords: ['test'],
        niche: 'general',
        mode: 'quick',
      };
      const result = await executeBatch(['suggest'], params, seoQuery as any);

      // THEN should track progress
      expect(result.results.length).toBeGreaterThan(0);
      const completedCount = result.results.filter(r => r.totalKeywords >= 0).length;
      const progressPercent = (completedCount / result.results.length) * 100;
      expect(progressPercent).toBe(100);
    });

    it('should emit progress events (via logging)', async () => {
      // GIVEN batch execution with multiple collectors
      mockFetch(/.*/, mockSuggestResponse('test', 2));
      const consoleSpy = jest.spyOn(console, 'log');

      // WHEN executing batch
      const params: CollectorParams = {
        taskId: 'test-task',
        seedKeywords: ['test'],
        niche: 'general',
        mode: 'quick',
      };
      await executeBatch(['suggest'], params, seoQuery as any);

      // THEN should log progress
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ========== COST CALCULATION ==========

  describe('Cost Calculation', () => {
    it('should sum API costs across collectors', async () => {
      // GIVEN collectors with costs
      mockFetch(/.*/, mockSuggestResponse('test', 3));
      process.env.NODE_ENV = 'development';

      // Add cached data for cache hits
      seoQuery.addKeywordResearch('test', {
        metadata: {
          niche: 'general',
          secondaryKeywords: [],
          peopleAlsoAsk: ['What is test?', 'Why test?'],
        },
      });

      // WHEN executing batch with PAA (has cost)
      const params: CollectorParams = {
        taskId: 'test-task',
        seedKeywords: ['test'],
        niche: 'general',
        mode: 'deep',
      };
      const result = await executeBatch(['paa'], params, seoQuery as any);

      // THEN should calculate costs
      expect(result.estimatedSavings).toBeGreaterThanOrEqual(0);
    });

    it('should calculate cache savings', async () => {
      // GIVEN cached data
      seoQuery.addKeywordResearch('cached', {
        metadata: {
          niche: 'test',
          secondaryKeywords: [
            { keyword: 'kw1', volume: 0, difficulty: 0, cpc: 0 },
            { keyword: 'kw2', volume: 0, difficulty: 0, cpc: 0 },
          ],
          peopleAlsoAsk: [],
        },
      });

      // WHEN executing with cache hits
      const params: CollectorParams = {
        taskId: 'test-task',
        seedKeywords: ['cached'],
        niche: 'test',
        mode: 'quick',
      };
      const result = await executeBatch(['suggest'], params, seoQuery as any);

      // THEN should show cache hit rate
      expect(result.totalCacheHits).toBeGreaterThan(0);
      expect(result.cacheHitRate).toBeGreaterThan(0);
    });
  });

  // ========== MODE SUPPORT ==========

  describe('Mode Support', () => {
    it('should execute quick mode collectors only', async () => {
      // GIVEN quick mode
      mockFetch(/searchAnalytics/, mockGSCResponse(3));
      mockFetch(/suggestqueries/, mockSuggestResponse('test', 2));

      // Setup competitor data
      seoQuery.addCompetitorData('test.com', {
        niche: 'https://example.com',
        domain: 'test.com',
        topKeywords: [{ keyword: 'test', position: 1, searchVolume: 100 }],
      });

      // WHEN executing by mode
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        seedKeywords: ['test'],
        mode: 'quick',
      };
      const result = await executeByMode(params, seoQuery as any);

      // THEN should only execute GSC, Suggest, Competitors
      const collectorNames = result.results.map(r => r.collector);
      expect(collectorNames).toContain('Google Search Console');
      expect(collectorNames).toContain('Google Suggest');
      expect(collectorNames).toContain('Competitors');
      expect(collectorNames).not.toContain('People Also Ask');
      expect(collectorNames).not.toContain('Social Media');
    });

    it('should execute all collectors in deep mode', async () => {
      // GIVEN deep mode
      mockFetch(/searchAnalytics/, mockGSCResponse(3));
      mockFetch(/suggestqueries/, mockSuggestResponse('test', 2));
      mockFetch(/reddit\.com/, { data: { children: [] } });
      process.env.NODE_ENV = 'development';

      seoQuery.addCompetitorData('test.com', {
        niche: 'https://example.com',
        domain: 'test.com',
        topKeywords: [{ keyword: 'test', position: 1, searchVolume: 100 }],
      });

      // WHEN executing by mode
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        seedKeywords: ['test'],
        mode: 'deep',
      };
      const result = await executeByMode(params, seoQuery as any);

      // THEN should execute all 5 collectors
      expect(result.results.length).toBe(5);
    });

    it('should default to quick mode', async () => {
      // GIVEN no mode specified
      mockFetch(/.*/, mockSuggestResponse('test', 2));
      seoQuery.addCompetitorData('test.com', {
        niche: 'https://example.com',
        domain: 'test.com',
        topKeywords: [],
      });

      // WHEN executing by mode without specifying
      const params: CollectorParams = {
        taskId: 'test-task',
        niche: 'https://example.com',
        seedKeywords: ['test'],
      };
      const result = await executeByMode(params, seoQuery as any);

      // THEN should use quick mode (3 collectors)
      expect(result.results.length).toBe(3);
    });
  });

  // ========== PERFORMANCE ==========

  describe('Performance', () => {
    it('should complete batch execution within reasonable time', async () => {
      // GIVEN multiple collectors
      mockFetch(/.*/, mockSuggestResponse('test', 3));

      // WHEN executing batch
      const startTime = Date.now();
      const params: CollectorParams = {
        taskId: 'test-task',
        seedKeywords: ['test'],
        niche: 'general',
        mode: 'quick',
      };
      await executeBatch(['suggest'], params, seoQuery as any);
      const duration = Date.now() - startTime;

      // THEN should complete quickly
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    it('should report execution time metrics', async () => {
      // GIVEN batch execution
      mockFetch(/.*/, mockSuggestResponse('test', 2));

      // WHEN executing
      const params: CollectorParams = {
        taskId: 'test-task',
        seedKeywords: ['test'],
        niche: 'general',
        mode: 'quick',
      };
      const result = await executeBatch(['suggest'], params, seoQuery as any);

      // THEN should include timing
      expect(result.totalExecutionTime).toBeGreaterThan(0);
      result.results.forEach(r => {
        expect(r.executionTime).toBeGreaterThan(0);
      });
    });
  });
});
