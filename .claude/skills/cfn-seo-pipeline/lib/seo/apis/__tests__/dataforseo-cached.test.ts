/**
 * DataForSEO Cached API Tests
 *
 * Tests cache-first architecture, cost tracking, and RuVector integration.
 *
 * @jest-environment node
 */

import { DataForSEOCached } from '../dataforseo-cached';
import { CostTracker, calculateCacheEfficiency, calculateTimeSavings } from '../cost-tracking';

// Mock the RuVector collections
jest.mock('../../lib/ruvector', () => ({
  KeywordResearchCollection: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue([]),
    add: jest.fn().mockResolvedValue({ id: 'keyword-test-id' }),
  })),
  SERPPatternsCollection: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue([]),
    add: jest.fn().mockResolvedValue({ id: 'serp-test-id' }),
  })),
}));

/**
 * Mock RuVector database
 */
const createMockVectorDB = () => ({
  query: jest.fn().mockResolvedValue([]),
  add: jest.fn().mockResolvedValue({ id: 'test-id' }),
});

/**
 * Mock embedding function
 */
const mockEmbeddingFn = async (text: string) => {
  return new Float32Array(128).fill(0.5); // Dummy embedding
};

describe('DataForSEOCached', () => {
  let api: DataForSEOCached;
  let mockDb: any;

  beforeEach(() => {
    mockDb = createMockVectorDB();
  });

  describe('Initialization', () => {
    it('should create instance with API key', () => {
      api = new DataForSEOCached(mockDb, mockEmbeddingFn, 'test-api-key', false);
      expect(api).toBeDefined();
    });

    it('should enable mock mode without API key', () => {
      api = new DataForSEOCached(mockDb, mockEmbeddingFn, undefined, false);
      expect(api).toBeDefined();
      // Mock mode should be enabled
    });
  });

  describe('Keyword Metrics', () => {
    beforeEach(() => {
      api = new DataForSEOCached(mockDb, mockEmbeddingFn, undefined, false);
    });

    it('should get keyword metrics in mock mode', async () => {
      const { metrics, cache, cost } = await api.getKeywordMetrics('example keyword', 'test');

      expect(metrics).toBeDefined();
      expect(metrics.keyword).toBe('example keyword');
      expect(metrics.searchVolume).toBeGreaterThan(0);
      expect(metrics.cpc).toBeGreaterThan(0);
      expect(metrics.competition).toBeGreaterThanOrEqual(0);
      expect(metrics.competition).toBeLessThanOrEqual(1);
      expect(metrics.competitionLevel).toMatch(/LOW|MEDIUM|HIGH/);
    });

    it('should track cache miss on first call', async () => {
      const { cache, cost } = await api.getKeywordMetrics('test keyword', 'niche');

      expect(cache.cached).toBe(false);
      expect(cost.cacheHit).toBe(false);
      expect(cost.apiCalled).toBe(true);
    });

    it('should generate mock data consistently for same keyword', async () => {
      const call1 = await api.getKeywordMetrics('consistent keyword', 'niche');
      const call2 = await api.getKeywordMetrics('consistent keyword', 'niche');

      expect(call1.metrics.searchVolume).toBe(call2.metrics.searchVolume);
      expect(call1.metrics.cpc).toBe(call2.metrics.cpc);
      expect(call1.metrics.competition).toBe(call2.metrics.competition);
    });

    it('should generate different data for different keywords', async () => {
      const call1 = await api.getKeywordMetrics('keyword1', 'niche');
      const call2 = await api.getKeywordMetrics('keyword2', 'niche');

      expect(call1.metrics.searchVolume).not.toBe(call2.metrics.searchVolume);
    });
  });

  describe('SERP Analysis', () => {
    beforeEach(() => {
      api = new DataForSEOCached(mockDb, mockEmbeddingFn, undefined, false);
    });

    it('should get SERP analysis', async () => {
      const { results, peopleAlsoAsk, cache, cost } = await api.getSERPAnalysis('example keyword', 'test');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // Verify SERP result structure
      const result = results[0];
      expect(result.position).toBeGreaterThan(0);
      expect(result.url).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.type).toMatch(/organic|featured_snippet|people_also_ask|knowledge_panel/);
      expect(result.domain).toBeDefined();
    });

    it('should include People Also Ask questions', async () => {
      const { peopleAlsoAsk } = await api.getSERPAnalysis('example keyword', 'test');

      expect(Array.isArray(peopleAlsoAsk)).toBe(true);
      expect(peopleAlsoAsk.length).toBeGreaterThan(0);
      expect(peopleAlsoAsk[0].question).toBeDefined();
    });

    it('should track SERP cache miss', async () => {
      const { cache, cost } = await api.getSERPAnalysis('test keyword', 'niche');

      expect(cache.cached).toBe(false);
      expect(cost.cacheHit).toBe(false);
      expect(cost.apiCalled).toBe(true);
    });
  });

  describe('People Also Ask', () => {
    beforeEach(() => {
      api = new DataForSEOCached(mockDb, mockEmbeddingFn, undefined, false);
    });

    it('should extract People Also Ask questions', async () => {
      const paa = await api.getPeopleAlsoAsk('example keyword', 'test');

      expect(Array.isArray(paa)).toBe(true);
      expect(paa.length).toBeGreaterThan(0);
      expect(paa[0].question).toBeDefined();
    });
  });

  describe('Cost Tracking', () => {
    beforeEach(() => {
      api = new DataForSEOCached(mockDb, mockEmbeddingFn, undefined, false);
    });

    it('should track total cost summary', async () => {
      // Make multiple calls
      await api.getKeywordMetrics('keyword1', 'niche');
      await api.getKeywordMetrics('keyword2', 'niche');

      const summary = api.getCostSummary();

      expect(summary.totalCalls).toBe(2);
      expect(summary.cacheHits).toBe(0);
      expect(summary.cacheHitRate).toBe(0);
      expect(summary.estimatedCostSaved).toBe(0);
    });

    it('should clear cost tracking', async () => {
      await api.getKeywordMetrics('keyword1', 'niche');

      const before = api.getCostSummary();
      expect(before.totalCalls).toBe(1);

      api.clearCostTracking();

      const after = api.getCostSummary();
      expect(after.totalCalls).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      api = new DataForSEOCached(mockDb, mockEmbeddingFn, undefined, false);
    });

    it('should handle invalid keywords gracefully', async () => {
      const { metrics } = await api.getKeywordMetrics('', 'niche');
      expect(metrics).toBeDefined(); // Still returns data (empty string hash)
    });

    it('should recover from storage errors', async () => {
      const mockDbWithError = {
        ...mockDb,
        add: jest.fn().mockRejectedValue(new Error('Storage failed')),
      };

      const apiWithError = new DataForSEOCached(mockDbWithError, mockEmbeddingFn, undefined, false);

      // Should not throw despite storage error
      const { metrics } = await apiWithError.getKeywordMetrics('test', 'niche');
      expect(metrics).toBeDefined();
    });
  });
});

describe('Cost Tracking Utilities', () => {
  describe('calculateCacheEfficiency', () => {
    it('should calculate cache efficiency metrics', () => {
      const metrics = calculateCacheEfficiency(100, 60, 0.03);

      expect(metrics.totalApiCalls).toBe(100);
      expect(metrics.cachedApiCalls).toBe(60);
      expect(metrics.cacheHitRate).toBe(60);
      expect(metrics.totalCostWithoutCache).toBe(3);
      expect(metrics.totalCostWithCache).toBe(1.2);
      expect(metrics.totalSaved).toBe(1.8);
      expect(metrics.savingsPercentage).toBeCloseTo(60, 1);
      expect(metrics.costPerKeyword).toBeCloseTo(0.012, 3);
    });

    it('should handle zero cache hits', () => {
      const metrics = calculateCacheEfficiency(100, 0, 0.03);

      expect(metrics.cacheHitRate).toBe(0);
      expect(metrics.totalSaved).toBe(0);
      expect(metrics.savingsPercentage).toBe(0);
    });

    it('should handle perfect cache hit rate', () => {
      const metrics = calculateCacheEfficiency(100, 100, 0.03);

      expect(metrics.cacheHitRate).toBe(100);
      expect(metrics.totalCostWithCache).toBe(0);
      expect(metrics.totalSaved).toBe(3);
      expect(metrics.savingsPercentage).toBe(100);
    });
  });

  describe('calculateTimeSavings', () => {
    it('should calculate time savings correctly', () => {
      const metrics = calculateTimeSavings(100, 60, 1000, 30);

      expect(metrics.totalTimeWithoutCache).toBeCloseTo((100 * 1000) / (1000 * 60), 1);
      expect(metrics.totalTimeWithCache).toBeCloseTo(((40 * 1000) + (60 * 30)) / (1000 * 60), 1);
      expect(metrics.timeSaved).toBeGreaterThan(0);
      expect(metrics.timeSavingsPercentage).toBeGreaterThan(0);
    });

    it('should calculate speedup factor', () => {
      const metrics = calculateTimeSavings(100, 60, 1000, 30);

      const speedup = metrics.avgTimePerApiCall / metrics.avgTimePerCacheHit;
      expect(speedup).toBeCloseTo(33.33, 1); // 1000ms / 30ms
    });
  });

  describe('CostTracker', () => {
    it('should track cost savings over time', () => {
      const tracker = new CostTracker();

      tracker.recordEvent(10, 0.2, 0.5);
      tracker.recordEvent(20, 0.4, 0.6);

      expect(tracker.getTotalSavings()).toBeCloseTo(0.6, 1);
      expect(tracker.getTotalApiCallsAvoided()).toBe(30);
    });

    it('should calculate average cache hit rate', () => {
      const tracker = new CostTracker();

      tracker.recordEvent(10, 0.2, 0.5);
      tracker.recordEvent(10, 0.2, 0.7);

      expect(tracker.getAverageCacheHitRate()).toBeCloseTo(0.6, 1);
    });

    it('should clear tracking history', () => {
      const tracker = new CostTracker();

      tracker.recordEvent(10, 0.2, 0.5);
      expect(tracker.getHistory().length).toBe(1);

      tracker.clear();
      expect(tracker.getHistory().length).toBe(0);
      expect(tracker.getTotalSavings()).toBe(0);
    });
  });
});
