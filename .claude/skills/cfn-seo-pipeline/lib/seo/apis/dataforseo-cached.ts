/**
 * DataForSEO API Wrapper with RuVector Cache Layer
 *
 * Cache-first architecture that queries RuVector before making external API calls.
 * Implements cost-aware batching and freshness checking with 14-day TTL for keywords.
 *
 * Phase 4-5 Integration: SEO keyword metrics and gap analysis with 80%+ cache savings target
 *
 * @module seo/apis/dataforseo-cached
 */

import type { VectorDB } from '@ruvector/core';
import {
  KeywordResearchCollection,
  type KeywordResearchInput,
  SERPPatternsCollection,
  type SERPPatternInput,
} from '../lib/ruvector';
import { SEO_COLLECTIONS } from '../lib/ruvector/schemas';

/**
 * External API response types
 */
export interface DataForSEOKeywordMetrics {
  keyword: string;
  searchVolume: number;
  cpc: number;
  competition: number; // 0-1 scale (difficulty)
  competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  trendData?: Array<{
    date: string;
    value: number;
  }>;
}

/**
 * SERP result from external API
 */
export interface SERPResult {
  position: number;
  url: string;
  title: string;
  description: string;
  type: 'organic' | 'featured_snippet' | 'people_also_ask' | 'knowledge_panel';
  domain: string;
}

/**
 * People Also Ask extraction
 */
export interface PeopleAlsoAskResult {
  question: string;
  answer?: string;
  featured_url?: string;
}

/**
 * Cost tracking result
 */
export interface CostTrackingResult {
  cacheHit: boolean;
  apiCalled: boolean;
  costSaved?: number; // Estimated cost saved in dollars
  totalCostWithoutCache?: number;
  totalCostWithCache?: number;
}

/**
 * Keyword research cache result
 */
export interface KeywordCacheResult {
  cached: boolean;
  stale: boolean;
  data: KeywordResearchInput | null;
  timestamp: Date | null;
  freshnessScore: number; // 0-1 scale
}

/**
 * SERP analysis cache result
 */
export interface SERPCacheResult {
  cached: boolean;
  stale: boolean;
  data: SERPPatternInput | null;
  timestamp: Date | null;
  freshnessScore: number;
}

/**
 * Mock response for testing without real API calls
 */
export interface MockKeywordResponse {
  keyword: string;
  searchVolume: number;
  cpc: number;
  difficulty: number;
}

/**
 * DataForSEO API wrapper with cache layer
 */
export class DataForSEOCached {
  private db: VectorDB;
  private apiKey: string;
  private mockMode: boolean;
  private keywordResearchCollection: KeywordResearchCollection;
  private serpPatternsCollection: SERPPatternsCollection;
  private costTracking: Map<string, CostTrackingResult> = new Map();
  private verbose: boolean;

  /**
   * Initialize DataForSEO cached wrapper
   *
   * @param db - RuVector database instance
   * @param embeddingFn - Embedding function for vectors
   * @param apiKey - DataForSEO API key (optional, enables mock mode if missing)
   * @param verbose - Enable verbose logging
   */
  constructor(
    db: VectorDB,
    embeddingFn: (text: string) => Promise<Float32Array>,
    apiKey?: string,
    verbose: boolean = false,
  ) {
    this.db = db;
    this.apiKey = apiKey || '';
    this.mockMode = !apiKey;
    this.keywordResearchCollection = new KeywordResearchCollection(db, embeddingFn);
    this.serpPatternsCollection = new SERPPatternsCollection(db, embeddingFn);
    this.verbose = verbose;

    if (this.mockMode) {
      this.log('[MOCK MODE] DataForSEO API calls will return synthetic data');
    }
  }

  /**
   * Get keyword metrics with cache-first lookup
   *
   * 1. Query RuVector keyword_research collection
   * 2. Check freshness (TTL: 14 days)
   * 3. If fresh, return cached data
   * 4. If stale or missing, call external API
   * 5. Store/update in RuVector
   * 6. Track cost savings
   *
   * @param keyword - Target keyword
   * @param niche - Topic niche for context
   * @returns Keyword metrics and cache status
   */
  async getKeywordMetrics(
    keyword: string,
    niche: string,
  ): Promise<{ metrics: DataForSEOKeywordMetrics; cache: KeywordCacheResult; cost: CostTrackingResult }> {
    const cacheKey = `keyword:${keyword.toLowerCase()}`;
    let costTracking: CostTrackingResult = {
      cacheHit: false,
      apiCalled: false,
    };

    try {
      // Step 1: Query RuVector cache
      this.log(`[Cache Lookup] Searching RuVector for keyword: ${keyword}`);
      const cachedResults = await this.keywordResearchCollection.query({
        queryText: keyword,
        limit: 1,
        niche,
        excludeStale: false,
      });

      const cacheResult: KeywordCacheResult = {
        cached: false,
        stale: false,
        data: null,
        timestamp: null,
        freshnessScore: 0,
      };

      // Step 2: Evaluate freshness if found
      if (cachedResults && cachedResults.length > 0) {
        const cached = cachedResults[0];
        cacheResult.cached = true;
        cacheResult.timestamp = new Date(cached.metadata.createdAt);

        // Calculate freshness (14-day TTL for keywords)
        const TTL_DAYS = 14;
        const ageMs = Date.now() - new Date(cached.metadata.createdAt).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        cacheResult.stale = ageDays > TTL_DAYS;
        cacheResult.freshnessScore = Math.max(0, 1 - ageDays / TTL_DAYS);

        // Step 3: Return if fresh
        if (!cacheResult.stale) {
          this.log(`[Cache Hit] Found fresh keyword data (${(cacheResult.freshnessScore * 100).toFixed(1)}% fresh)`);
          costTracking.cacheHit = true;
          costTracking.costSaved = this.estimateAPICost('keyword_research');
          cacheResult.data = {
            primaryKeyword: cached.metadata.primaryKeyword,
            searchVolume: cached.metadata.searchVolume,
            keywordDifficulty: cached.metadata.keywordDifficulty,
            cpc: cached.metadata.cpc,
            searchIntent: cached.metadata.searchIntent,
            secondaryKeywords: cached.metadata.secondaryKeywords,
            longTailKeywords: cached.metadata.longTailKeywords,
            peopleAlsoAsk: cached.metadata.peopleAlsoAsk,
            relatedSearches: cached.metadata.relatedSearches,
            clusterId: cached.metadata.clusterId,
            niche,
          };

          const metrics: DataForSEOKeywordMetrics = {
            keyword: cached.metadata.primaryKeyword,
            searchVolume: cached.metadata.searchVolume,
            cpc: cached.metadata.cpc,
            competition: cached.metadata.keywordDifficulty,
            competitionLevel: this.difficultyToLevel(cached.metadata.keywordDifficulty),
          };

          this.costTracking.set(cacheKey, costTracking);
          return { metrics, cache: cacheResult, cost: costTracking };
        }

        this.log(`[Cache Stale] Keyword data is ${ageDays.toFixed(1)} days old (TTL: ${TTL_DAYS} days), refreshing...`);
      } else {
        this.log(`[Cache Miss] No cached data found for keyword: ${keyword}`);
      }

      // Step 4: Call external API (or mock if testing)
      costTracking.apiCalled = true;
      const apiData = this.mockMode
        ? this.generateMockKeywordData(keyword, niche)
        : await this.callDataForSEOAPI('keyword_metrics', { keyword });

      const metrics: DataForSEOKeywordMetrics = {
        keyword: apiData.keyword,
        searchVolume: apiData.searchVolume,
        cpc: apiData.cpc,
        competition: apiData.difficulty,
        competitionLevel: this.difficultyToLevel(apiData.difficulty),
      };

      // Step 5: Store/update in RuVector
      try {
        const keywordInput: KeywordResearchInput = {
          primaryKeyword: keyword,
          searchVolume: apiData.searchVolume,
          keywordDifficulty: apiData.difficulty,
          cpc: apiData.cpc,
          searchIntent: 'informational', // Default; should be enriched from API
          niche,
        };

        cacheResult.data = keywordInput;
        await this.keywordResearchCollection.add(keywordInput);
        this.log(`[Stored] Cached keyword metrics in RuVector for: ${keyword}`);
      } catch (storageError) {
        this.log(`[Storage Error] Failed to cache keyword data: ${String(storageError)}`);
        // Continue despite storage error; data is still usable
      }

      // Step 6: Track cost savings
      costTracking.totalCostWithoutCache = this.estimateAPICost('keyword_research');
      costTracking.totalCostWithCache = 0; // API cost, no cache benefit this time
      this.costTracking.set(cacheKey, costTracking);

      return { metrics, cache: cacheResult, cost: costTracking };
    } catch (error) {
      this.log(`[Error] getKeywordMetrics failed: ${String(error)}`);
      throw new Error(`Failed to get keyword metrics for "${keyword}": ${String(error)}`);
    }
  }

  /**
   * Get SERP analysis with cache-first lookup
   *
   * Caches top 10 SERP results, featured snippets, and People Also Ask
   *
   * @param keyword - Target keyword
   * @param niche - Topic niche
   * @returns SERP results and cache status
   */
  async getSERPAnalysis(
    keyword: string,
    niche: string,
  ): Promise<{
    results: SERPResult[];
    peopleAlsoAsk: PeopleAlsoAskResult[];
    cache: SERPCacheResult;
    cost: CostTrackingResult;
  }> {
    const cacheKey = `serp:${keyword.toLowerCase()}`;
    let costTracking: CostTrackingResult = {
      cacheHit: false,
      apiCalled: false,
    };

    try {
      // Query cache
      this.log(`[Cache Lookup] Searching RuVector for SERP analysis: ${keyword}`);
      const cachedResults = await this.serpPatternsCollection.query({
        queryText: keyword,
        limit: 1,
        niche,
        excludeStale: false,
      });

      const cacheResult: SERPCacheResult = {
        cached: false,
        stale: false,
        data: null,
        timestamp: null,
        freshnessScore: 0,
      };

      // Check freshness (SERP patterns have shorter TTL: 7-14 days)
      if (cachedResults && cachedResults.length > 0) {
        const cached = cachedResults[0];
        cacheResult.cached = true;
        cacheResult.timestamp = new Date(cached.metadata.createdAt);

        const TTL_DAYS = 7; // SERP changes more frequently
        const ageMs = Date.now() - new Date(cached.metadata.createdAt).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        cacheResult.stale = ageDays > TTL_DAYS;
        cacheResult.freshnessScore = Math.max(0, 1 - ageDays / TTL_DAYS);

        if (!cacheResult.stale) {
          this.log(`[Cache Hit] Found fresh SERP data (${(cacheResult.freshnessScore * 100).toFixed(1)}% fresh)`);
          costTracking.cacheHit = true;
          costTracking.costSaved = this.estimateAPICost('serp_analysis');

          const results: SERPResult[] = (cached.metadata.topResults || []).map((r: any) => ({
            position: r.position,
            url: r.url,
            title: r.title,
            description: r.description || '',
            type: r.type || 'organic',
            domain: new URL(r.url).hostname,
          }));

          const paa: PeopleAlsoAskResult[] = (cached.metadata.peopleAlsoAsk || []).map((q: string) => ({
            question: q,
          }));

          this.costTracking.set(cacheKey, costTracking);
          return { results, peopleAlsoAsk: paa, cache: cacheResult, cost: costTracking };
        }

        this.log(`[Cache Stale] SERP data is ${ageDays.toFixed(1)} days old, refreshing...`);
      } else {
        this.log(`[Cache Miss] No cached SERP data found for: ${keyword}`);
      }

      // Call API
      costTracking.apiCalled = true;
      const { results, peopleAlsoAsk } = this.mockMode
        ? this.generateMockSERPData(keyword)
        : await this.callDataForSEOAPI('serp_analysis', { keyword });

      // Store in cache
      try {
        const serpInput: SERPPatternInput = {
          keyword,
          topResults: results.map((r) => ({
            position: r.position,
            url: r.url,
            title: r.title,
            description: r.description,
            type: r.type,
          })),
          featuredSnippet: results.find((r) => r.type === 'featured_snippet'),
          peopleAlsoAsk: peopleAlsoAsk.map((p) => p.question),
          niche,
          patternType: 'serp_landscape',
        };

        cacheResult.data = serpInput;
        await this.serpPatternsCollection.add(serpInput);
        this.log(`[Stored] Cached SERP analysis in RuVector for: ${keyword}`);
      } catch (storageError) {
        this.log(`[Storage Error] Failed to cache SERP data: ${String(storageError)}`);
      }

      costTracking.totalCostWithoutCache = this.estimateAPICost('serp_analysis');
      costTracking.totalCostWithCache = 0;
      this.costTracking.set(cacheKey, costTracking);

      return { results, peopleAlsoAsk, cache: cacheResult, cost: costTracking };
    } catch (error) {
      this.log(`[Error] getSERPAnalysis failed: ${String(error)}`);
      throw new Error(`Failed to get SERP analysis for "${keyword}": ${String(error)}`);
    }
  }

  /**
   * Get People Also Ask for a keyword
   *
   * @param keyword - Target keyword
   * @param niche - Topic niche
   * @returns List of related questions
   */
  async getPeopleAlsoAsk(keyword: string, niche: string): Promise<PeopleAlsoAskResult[]> {
    const { peopleAlsoAsk } = await this.getSERPAnalysis(keyword, niche);
    return peopleAlsoAsk;
  }

  /**
   * Get cost tracking summary
   *
   * @returns Cost analysis with savings breakdown
   */
  getCostSummary(): {
    totalCalls: number;
    cacheHits: number;
    cacheHitRate: number;
    estimatedCostSaved: number;
    totalCostWithoutCache: number;
    totalCostWithCache: number;
  } {
    let cacheHits = 0;
    let totalCalls = 0;
    let estimatedCostSaved = 0;
    let totalCostWithoutCache = 0;
    let totalCostWithCache = 0;

    for (const tracking of this.costTracking.values()) {
      totalCalls++;
      if (tracking.cacheHit) {
        cacheHits++;
        estimatedCostSaved += tracking.costSaved || 0;
      }
      totalCostWithoutCache += tracking.totalCostWithoutCache || 0;
      totalCostWithCache += tracking.totalCostWithCache || 0;
    }

    const cacheHitRate = totalCalls > 0 ? cacheHits / totalCalls : 0;

    return {
      totalCalls,
      cacheHits,
      cacheHitRate,
      estimatedCostSaved,
      totalCostWithoutCache,
      totalCostWithCache,
    };
  }

  /**
   * Clear cost tracking
   */
  clearCostTracking(): void {
    this.costTracking.clear();
  }

  /**
   * Internal: Call DataForSEO external API
   *
   * In production, this would make real HTTP requests to DataForSEO.
   * Returns mock data for testing.
   *
   * @param endpoint - API endpoint type
   * @param params - Request parameters
   * @returns API response
   */
  private async callDataForSEOAPI(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<any> {
    // In production:
    // const response = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${this.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify(params),
    // });
    // return await response.json();

    // For now, return mock data
    if (endpoint === 'keyword_metrics') {
      return this.generateMockKeywordData(params.keyword, 'default');
    } else if (endpoint === 'serp_analysis') {
      return this.generateMockSERPData(params.keyword);
    }

    throw new Error(`Unknown endpoint: ${endpoint}`);
  }

  /**
   * Generate mock keyword data for testing
   */
  private generateMockKeywordData(keyword: string, _niche: string): MockKeywordResponse {
    const hash = keyword.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const volume = Math.floor((hash % 10000) + 100); // 100-10100
    const difficulty = ((hash % 100) / 100) * 0.7 + 0.2; // 0.2-0.9
    const cpc = Math.round((difficulty * 5 + 1) * 100) / 100; // $1-$6

    return {
      keyword,
      searchVolume: volume,
      cpc,
      difficulty,
    };
  }

  /**
   * Generate mock SERP data for testing
   */
  private generateMockSERPData(keyword: string): {
    results: SERPResult[];
    peopleAlsoAsk: PeopleAlsoAskResult[];
  } {
    const results: SERPResult[] = [
      {
        position: 1,
        url: `https://example1.com/${keyword.replace(/\s+/g, '-')}`,
        title: `${keyword} - Complete Guide`,
        description: `Comprehensive guide to ${keyword} with best practices and tips.`,
        type: 'organic',
        domain: 'example1.com',
      },
      {
        position: 2,
        url: `https://wikipedia.org/${keyword.replace(/\s+/g, '_')}`,
        title: keyword,
        description: `${keyword} overview and key concepts explained.`,
        type: 'organic',
        domain: 'wikipedia.org',
      },
      {
        position: 3,
        url: `https://example2.com/${keyword.replace(/\s+/g, '-')}`,
        title: `How to ${keyword}`,
        description: `Step-by-step instructions for ${keyword}.`,
        type: 'featured_snippet',
        domain: 'example2.com',
      },
    ];

    const paa: PeopleAlsoAskResult[] = [
      { question: `What is ${keyword}?` },
      { question: `How does ${keyword} work?` },
      { question: `Why is ${keyword} important?` },
    ];

    return { results, peopleAlsoAsk: paa };
  }

  /**
   * Estimate API cost for a call type
   *
   * Pricing (2024):
   * - Keyword research: $0.02 per call
   * - SERP analysis: $0.05 per call
   */
  private estimateAPICost(type: string): number {
    switch (type) {
      case 'keyword_research':
        return 0.02;
      case 'serp_analysis':
        return 0.05;
      default:
        return 0.03;
    }
  }

  /**
   * Convert difficulty score (0-1) to level
   */
  private difficultyToLevel(difficulty: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (difficulty < 0.4) return 'LOW';
    if (difficulty < 0.7) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Log messages
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }
}

/**
 * Create singleton instance
 */
export function createDataForSEOCached(
  db: VectorDB,
  embeddingFn: (text: string) => Promise<Float32Array>,
  apiKey?: string,
  verbose?: boolean,
): DataForSEOCached {
  return new DataForSEOCached(db, embeddingFn, apiKey, verbose);
}
