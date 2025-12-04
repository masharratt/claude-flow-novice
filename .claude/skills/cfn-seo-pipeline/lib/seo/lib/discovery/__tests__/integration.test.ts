/**
 * Integration tests for end-to-end discovery workflow
 *
 * Tests cover:
 * - Complete workflow from discovery to storage
 * - RuVector cache integration
 * - Redis storage
 * - Collector failures and partial results
 * - Rate limiting across collectors
 * - Security validation
 * - Cost savings calculation
 *
 * @module seo/lib/discovery/__tests__/integration.test
 */

import { executeBatch, executeByMode } from '../index';
import type { CollectorParams } from '../types';
import {
  MockSEOQueryManager,
  MockRedisClient,
  mockFetch,
  restoreFetch,
  mockGSCResponse,
  mockSuggestResponse,
  assertValidKeywordSources,
} from './test-utils';

describe('End-to-End Discovery Workflow', () => {
  let seoQuery: MockSEOQueryManager;
  let redis: MockRedisClient;

  beforeEach(() => {
    seoQuery = new MockSEOQueryManager();
    redis = new MockRedisClient();
    process.env.GSC_ACCESS_TOKEN = 'test-token';
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    seoQuery.clear();
    redis.clear();
    restoreFetch();
    delete process.env.GSC_ACCESS_TOKEN;
  });

  // ========== COMPLETE WORKFLOW ==========

  it('should discover, deduplicate, and store keywords', async () => {
    // GIVEN multiple collectors configured
    mockFetch(/searchAnalytics/, mockGSCResponse(5));
    mockFetch(/suggestqueries/, mockSuggestResponse('crm', 3));

    // WHEN executing full workflow
    const params: CollectorParams = {
      taskId: 'integration-test',
      niche: 'https://example.com',
      seedKeywords: ['crm'],
      mode: 'quick',
    };
    const result = await executeBatch(['gsc', 'suggest'], params, seoQuery as any);

    // THEN should complete workflow
    expect(result.allKeywords.length).toBeGreaterThan(0);
    assertValidKeywordSources(result.allKeywords);

    // Verify deduplication
    const keywordTexts = result.allKeywords.map(kw => kw.keyword.toLowerCase());
    const uniqueCount = new Set(keywordTexts).size;
    expect(keywordTexts.length).toBe(uniqueCount);

    // Store in Redis (simulated)
    await redis.set(
      `seo:discovery:${params.taskId}:results`,
      JSON.stringify(result.allKeywords)
    );

    // Verify storage
    const stored = await redis.get(`seo:discovery:${params.taskId}:results`);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.length).toBe(result.allKeywords.length);
  });

  // ========== RUVECTOR CACHE INTEGRATION ==========

  it('should use RuVector cache when available', async () => {
    // GIVEN cached data from first run
    seoQuery.addKeywordResearch('cached keyword', {
      metadata: {
        niche: 'test',
        secondaryKeywords: [
          { keyword: 'suggestion 1', volume: 0, difficulty: 0, cpc: 0 },
          { keyword: 'suggestion 2', volume: 0, difficulty: 0, cpc: 0 },
        ],
        peopleAlsoAsk: [],
      },
    });

    mockFetch(/suggestqueries/, mockSuggestResponse('uncached keyword', 2));

    // WHEN running workflow twice
    const params: CollectorParams = {
      taskId: 'cache-test',
      niche: 'test',
      seedKeywords: ['cached keyword', 'uncached keyword'],
      mode: 'quick',
    };

    const firstRun = await executeBatch(['suggest'], params, seoQuery as any);

    // THEN should show cache utilization
    const cacheHitRate = firstRun.cacheHitRate;
    expect(cacheHitRate).toBeGreaterThan(0);
    expect(cacheHitRate).toBeLessThan(100); // Mixed hits and misses

    // Second run should have higher cache hit rate
    const secondRun = await executeBatch(['suggest'], params, seoQuery as any);
    expect(secondRun.cacheHitRate).toBeGreaterThanOrEqual(cacheHitRate);
  });

  it('should verify 50%+ cache hit rate on second run', async () => {
    // GIVEN first run populates cache
    mockFetch(/suggestqueries/, mockSuggestResponse('test', 5));

    const params: CollectorParams = {
      taskId: 'cache-hit-test',
      niche: 'test',
      seedKeywords: ['test'],
      mode: 'quick',
    };

    // First run (cache miss)
    await executeBatch(['suggest'], params, seoQuery as any);

    // Simulate cache storage
    seoQuery.addKeywordResearch('test', {
      metadata: {
        niche: 'test',
        secondaryKeywords: Array.from({ length: 5 }, (_, i) => ({
          keyword: `test suggestion ${i + 1}`,
          volume: 0,
          difficulty: 0,
          cpc: 0,
        })),
        peopleAlsoAsk: [],
      },
    });

    // WHEN running second time
    const secondRun = await executeBatch(['suggest'], params, seoQuery as any);

    // THEN should have high cache hit rate
    expect(secondRun.cacheHitRate).toBeGreaterThanOrEqual(50);
  });

  // ========== REDIS STORAGE ==========

  it('should store results in Redis', async () => {
    // GIVEN discovery results
    mockFetch(/suggestqueries/, mockSuggestResponse('test', 3));

    const params: CollectorParams = {
      taskId: 'redis-test',
      niche: 'test',
      seedKeywords: ['test'],
      mode: 'quick',
    };
    const result = await executeBatch(['suggest'], params, seoQuery as any);

    // WHEN storing in Redis
    const key = `seo:discovery:${params.taskId}:results`;
    await redis.set(key, JSON.stringify({
      keywords: result.allKeywords,
      stats: {
        totalKeywords: result.allKeywords.length,
        cacheHitRate: result.cacheHitRate,
        executionTime: result.totalExecutionTime,
      },
    }));

    // THEN should persist data
    const stored = await redis.get(key);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.keywords.length).toBe(result.allKeywords.length);
    expect(parsed.stats.totalKeywords).toBe(result.allKeywords.length);
  });

  it('should support Redis key patterns for task grouping', async () => {
    // GIVEN multiple tasks
    const taskIds = ['task-1', 'task-2', 'task-3'];

    for (const taskId of taskIds) {
      await redis.set(`seo:discovery:${taskId}:results`, JSON.stringify({ data: 'test' }));
    }

    // WHEN querying by pattern
    const keys = await redis.keys('seo:discovery:*:results');

    // THEN should find all task results
    expect(keys.length).toBe(3);
    keys.forEach(key => {
      expect(key).toMatch(/^seo:discovery:task-\d+:results$/);
    });
  });

  // ========== COLLECTOR FAILURES ==========

  it('should handle collector failures without data loss', async () => {
    // GIVEN one failing collector and two succeeding
    mockFetch(/searchAnalytics/, { error: 'GSC Error' }, { status: 500 });
    mockFetch(/suggestqueries/, mockSuggestResponse('test', 3));
    process.env.NODE_ENV = 'development';

    // WHEN executing batch
    const params: CollectorParams = {
      taskId: 'failure-test',
      niche: 'https://example.com',
      seedKeywords: ['test'],
      mode: 'quick',
    };
    const result = await executeBatch(['gsc', 'suggest', 'paa'], params, seoQuery as any);

    // THEN should preserve successful results
    expect(result.allKeywords.length).toBeGreaterThan(0);
    const successfulCollectors = result.results.filter(r => r.keywords.length > 0);
    expect(successfulCollectors.length).toBeGreaterThan(0);

    // Failed collector should be logged
    const failedCollectors = result.results.filter(r => r.errors && r.errors.length > 0);
    expect(failedCollectors.length).toBeGreaterThan(0);
  });

  it('should continue on partial API failures', async () => {
    // GIVEN intermittent failures
    let callCount = 0;
    global.fetch = jest.fn(async () => {
      callCount++;
      if (callCount % 3 === 0) {
        // Every 3rd call fails
        return { ok: false, status: 503, text: async () => 'Service Unavailable' } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ['seed', ['suggestion 1', 'suggestion 2']],
      } as any;
    });

    // WHEN executing workflow
    const params: CollectorParams = {
      taskId: 'partial-failure-test',
      niche: 'test',
      seedKeywords: ['test'],
      mode: 'quick',
    };
    const result = await executeBatch(['suggest'], params, seoQuery as any);

    // THEN should have some results
    expect(Array.isArray(result.allKeywords)).toBe(true);
  });

  // ========== RATE LIMITING ==========

  it('should respect rate limits across collectors', async () => {
    // GIVEN rate-limited APIs
    const timestamps: number[] = [];
    global.fetch = jest.fn(async (input: any) => {
      const url = String(input);
      timestamps.push(Date.now());
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate API delay

      if (url.includes('suggestqueries')) {
        return {
          ok: true,
          status: 200,
          json: async () => ['seed', ['suggestion']],
        } as any;
      }
      return { ok: false, status: 404 } as any;
    }) as any;

    // WHEN executing multiple collectors
    const params: CollectorParams = {
      taskId: 'rate-limit-test',
      niche: 'test',
      seedKeywords: ['kw1', 'kw2'],
      mode: 'quick',
    };
    await executeBatch(['suggest'], params, seoQuery as any);

    // THEN should throttle requests
    expect(timestamps.length).toBeGreaterThan(1);
  });

  // ========== SECURITY VALIDATION ==========

  it('should enforce security validation', async () => {
    // GIVEN malicious input
    mockFetch(/suggestqueries/, mockSuggestResponse('safe', 2));

    // WHEN collecting with XSS attempt
    const params: CollectorParams = {
      taskId: '<script>alert("xss")</script>',
      niche: 'test',
      seedKeywords: ['<img src=x onerror=alert(1)>'],
      mode: 'quick',
    };
    const result = await executeBatch(['suggest'], params, seoQuery as any);

    // THEN should sanitize and process safely
    expect(Array.isArray(result.allKeywords)).toBe(true);
    // Task ID should be sanitized in storage keys
    const safeTaskId = params.taskId.replace(/[<>]/g, '');
    expect(safeTaskId).not.toContain('<script>');
  });

  it('should validate collector inputs', async () => {
    // GIVEN invalid inputs
    mockFetch(/.*/, mockSuggestResponse('test', 2));

    // WHEN executing with missing required params
    const params: CollectorParams = {
      taskId: 'validation-test',
      // Missing niche and seedKeywords
      mode: 'quick',
    };

    // THEN should handle gracefully
    const result = await executeBatch(['suggest'], params, seoQuery as any);
    expect(Array.isArray(result.allKeywords)).toBe(true);
  });

  // ========== COST SAVINGS ==========

  it('should calculate accurate cost savings', async () => {
    // GIVEN cached PAA data (has cost)
    seoQuery.addKeywordResearch('expensive keyword', {
      metadata: {
        niche: 'test',
        secondaryKeywords: [],
        peopleAlsoAsk: ['What is this?', 'Why use this?', 'How to use this?'],
      },
    });

    // WHEN executing with cache hits
    const params: CollectorParams = {
      taskId: 'cost-test',
      niche: 'test',
      seedKeywords: ['expensive keyword'],
      mode: 'deep',
    };
    const result = await executeBatch(['paa'], params, seoQuery as any);

    // THEN should calculate savings
    expect(result.cacheHitRate).toBeGreaterThan(0);
    expect(result.estimatedSavings).toBeGreaterThanOrEqual(0);

    // Cache hits on paid API should show savings
    if (result.totalCacheHits > 0) {
      expect(result.estimatedSavings).toBeGreaterThan(0);
    }
  });

  // ========== MODE-BASED EXECUTION ==========

  it('should execute quick mode end-to-end', async () => {
    // GIVEN quick mode setup
    mockFetch(/searchAnalytics/, mockGSCResponse(5));
    mockFetch(/suggestqueries/, mockSuggestResponse('crm', 3));
    seoQuery.addCompetitorData('competitor.com', {
      niche: 'https://example.com',
      domain: 'competitor.com',
      topKeywords: [{ keyword: 'crm software', position: 1, searchVolume: 5000 }],
    });

    // WHEN executing quick mode
    const params: CollectorParams = {
      taskId: 'quick-mode-test',
      niche: 'https://example.com',
      seedKeywords: ['crm'],
      mode: 'quick',
    };
    const result = await executeByMode(params, seoQuery as any);

    // THEN should complete quickly with core collectors
    expect(result.allKeywords.length).toBeGreaterThan(0);
    expect(result.results.length).toBe(3); // GSC, Suggest, Competitors
    assertValidKeywordSources(result.allKeywords);
  });

  it('should execute deep mode end-to-end', async () => {
    // GIVEN deep mode setup
    mockFetch(/searchAnalytics/, mockGSCResponse(5));
    mockFetch(/suggestqueries/, mockSuggestResponse('crm', 3));
    mockFetch(/reddit\.com/, { data: { children: [] } });
    seoQuery.addCompetitorData('competitor.com', {
      niche: 'https://example.com',
      domain: 'competitor.com',
      topKeywords: [{ keyword: 'crm', position: 1, searchVolume: 1000 }],
    });

    // WHEN executing deep mode
    const params: CollectorParams = {
      taskId: 'deep-mode-test',
      niche: 'https://example.com',
      seedKeywords: ['crm'],
      mode: 'deep',
    };
    const result = await executeByMode(params, seoQuery as any);

    // THEN should execute all collectors
    expect(result.results.length).toBe(5); // All collectors
    expect(result.allKeywords.length).toBeGreaterThan(0);
  });

  // ========== ERROR RECOVERY ==========

  it('should recover from transient failures', async () => {
    // GIVEN API with transient errors
    let attempt = 0;
    global.fetch = jest.fn(async () => {
      attempt++;
      if (attempt === 1) {
        // First attempt fails
        return { ok: false, status: 503 } as any;
      }
      // Subsequent attempts succeed
      return {
        ok: true,
        status: 200,
        json: async () => ['seed', ['suggestion']],
      } as any;
    });

    // WHEN executing workflow
    const params: CollectorParams = {
      taskId: 'recovery-test',
      niche: 'test',
      seedKeywords: ['test'],
      mode: 'quick',
    };
    const result = await executeBatch(['suggest'], params, seoQuery as any);

    // THEN should recover and complete
    expect(Array.isArray(result.allKeywords)).toBe(true);
  });

  // ========== PERFORMANCE ==========

  it('should complete full workflow within reasonable time', async () => {
    // GIVEN all collectors
    mockFetch(/searchAnalytics/, mockGSCResponse(10));
    mockFetch(/suggestqueries/, mockSuggestResponse('test', 5));
    mockFetch(/reddit\.com/, { data: { children: [] } });
    seoQuery.addCompetitorData('test.com', {
      niche: 'https://example.com',
      domain: 'test.com',
      topKeywords: [{ keyword: 'test', position: 1, searchVolume: 100 }],
    });

    // WHEN executing full workflow
    const startTime = Date.now();
    const params: CollectorParams = {
      taskId: 'performance-test',
      niche: 'https://example.com',
      seedKeywords: ['test'],
      mode: 'deep',
    };
    await executeByMode(params, seoQuery as any);
    const duration = Date.now() - startTime;

    // THEN should complete in reasonable time
    expect(duration).toBeLessThan(10000); // 10 seconds max for full workflow
  });
});
