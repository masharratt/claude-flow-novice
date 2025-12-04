/**
 * Keyword Discovery Collector Registry
 *
 * Unified interface for all keyword source collectors with cost tracking.
 *
 * @module seo/lib/discovery
 */

import type {
  KeywordCollector,
  CollectorParams,
  KeywordSource,
  CollectorResult,
  BatchCollectorResult,
} from './types';
import type { SEOQueryManager } from '../ruvector/queries';
import { collectFromGSC, isGSCConfigured } from './gsc-collector';
import { collectFromGoogleSuggest } from './google-suggest-collector';
import { collectFromPAA } from './paa-collector';
import { collectFromSocial } from './social-collector';
import { collectFromCompetitors } from './competitor-collector';

/**
 * Collector registry
 *
 * Maps collector names to their implementations with metadata.
 */
export const collectors: Record<string, KeywordCollector> = {
  gsc: {
    name: 'Google Search Console',
    collect: async (params: CollectorParams) => {
      if (!isGSCConfigured()) {
        console.warn('[Collector Registry] GSC not configured, skipping');
        return [];
      }

      if (!params.niche) {
        console.warn('[Collector Registry] GSC requires niche (site URL), skipping');
        return [];
      }

      return collectFromGSC({
        taskId: params.taskId,
        siteUrl: params.niche, // Use niche as site URL
        limit: params.mode === 'quick' ? 50 : 100,
      });
    },
    cacheEnabled: false,
    costPerCall: 0, // Free API
  },

  suggest: {
    name: 'Google Suggest',
    collect: async (params: CollectorParams) => {
      const seeds = params.seedKeywords || [];

      if (seeds.length === 0) {
        console.warn('[Collector Registry] Google Suggest requires seed keywords, skipping');
        return [];
      }

      const allKeywords: KeywordSource[] = [];

      for (const seed of seeds) {
        const keywords = await collectFromGoogleSuggest(seed, {
          taskId: params.taskId,
          niche: params.niche || 'general',
          limit: params.mode === 'quick' ? 50 : 100,
        });
        allKeywords.push(...keywords);
      }

      return allKeywords;
    },
    cacheEnabled: true,
    costPerCall: 0, // Free API
  },

  paa: {
    name: 'People Also Ask',
    collect: async (params: CollectorParams) => {
      const seeds = params.seedKeywords || [];

      if (seeds.length === 0) {
        console.warn('[Collector Registry] PAA requires seed keywords, skipping');
        return [];
      }

      const allKeywords: KeywordSource[] = [];

      for (const seed of seeds) {
        const keywords = await collectFromPAA(seed, {
          taskId: params.taskId,
          niche: params.niche || 'general',
          limit: params.mode === 'quick' ? 10 : 20,
        });
        allKeywords.push(...keywords);
      }

      return allKeywords;
    },
    cacheEnabled: true,
    costPerCall: 0.05, // Estimated DataForSEO cost per query
  },

  social: {
    name: 'Social Media',
    collect: async (params: CollectorParams) => {
      if (!params.niche) {
        console.warn('[Collector Registry] Social collector requires niche, skipping');
        return [];
      }

      // Skip social in quick mode (time-intensive)
      if (params.mode === 'quick') {
        console.log('[Collector Registry] Skipping social in quick mode');
        return [];
      }

      return collectFromSocial(params.niche, {
        taskId: params.taskId,
        niche: params.niche,
        limit: 50,
      });
    },
    cacheEnabled: false,
    costPerCall: 0, // Free API (Reddit)
  },

  competitors: {
    name: 'Competitors',
    collect: async (params: CollectorParams) => {
      if (!params.niche) {
        console.warn('[Collector Registry] Competitor collector requires niche, skipping');
        return [];
      }

      // Requires SEO query manager (passed externally)
      console.warn('[Collector Registry] Competitor collector requires SEOQueryManager');
      return [];
    },
    cacheEnabled: true,
    costPerCall: 0, // Free (uses cached data)
  },
};

/**
 * Execute a single collector
 *
 * @param collectorName - Name of collector to execute
 * @param params - Collector parameters
 * @param seoQuery - Optional SEO query manager for caching
 * @returns Collector result with timing and cache stats
 */
export async function executeCollector(
  collectorName: string,
  params: CollectorParams,
  seoQuery?: SEOQueryManager
): Promise<CollectorResult> {
  const collector = collectors[collectorName];

  if (!collector) {
    throw new Error(`Unknown collector: ${collectorName}`);
  }

  console.log(`[Collector Registry] Executing ${collector.name}...`);

  const startTime = Date.now();
  let keywords: KeywordSource[] = [];
  const errors: string[] = [];

  try {
    // Special handling for competitor collector (needs SEO query manager)
    if (collectorName === 'competitors') {
      if (!seoQuery) {
        throw new Error('Competitor collector requires SEOQueryManager');
      }
      keywords = await collectFromCompetitors(params.taskId, {
        taskId: params.taskId,
        niche: params.niche || 'general',
        competitorDomains: params.competitorDomains,
      }, seoQuery);
    } else {
      keywords = await collector.collect(params);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    console.error(`[Collector Registry] ${collector.name} error:`, errorMsg);
  }

  const executionTime = Date.now() - startTime;

  // Calculate cache stats
  const cacheHits = keywords.filter(kw => kw.cacheHit).length;
  const cacheMisses = keywords.length - cacheHits;

  const result: CollectorResult = {
    collector: collector.name,
    keywords,
    cacheHits,
    cacheMisses,
    totalKeywords: keywords.length,
    executionTime,
    errors: errors.length > 0 ? errors : undefined,
  };

  console.log(`[Collector Registry] ${collector.name} complete: ${keywords.length} keywords in ${executionTime}ms`);
  if (collector.cacheEnabled) {
    console.log(`[Collector Registry] Cache hits: ${cacheHits}, misses: ${cacheMisses}`);
  }

  return result;
}

/**
 * Execute multiple collectors in batch
 *
 * @param collectorNames - Array of collector names to execute
 * @param params - Collector parameters
 * @param seoQuery - Optional SEO query manager for caching
 * @returns Batch result with combined keywords and stats
 */
export async function executeBatch(
  collectorNames: string[],
  params: CollectorParams,
  seoQuery?: SEOQueryManager
): Promise<BatchCollectorResult> {
  console.log(`[Collector Registry] Executing batch: ${collectorNames.join(', ')}`);

  const startTime = Date.now();
  const results: CollectorResult[] = [];

  // Execute collectors sequentially (could parallelize if needed)
  for (const name of collectorNames) {
    const result = await executeCollector(name, params, seoQuery);
    results.push(result);
  }

  // Combine and deduplicate keywords
  const allKeywords: KeywordSource[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const kw of result.keywords) {
      const normalized = kw.keyword.toLowerCase().trim();

      if (!seen.has(normalized)) {
        seen.add(normalized);
        allKeywords.push(kw);
      }
    }
  }

  // Calculate aggregate stats
  const totalCacheHits = results.reduce((sum, r) => sum + r.cacheHits, 0);
  const totalCacheMisses = results.reduce((sum, r) => sum + r.cacheMisses, 0);
  const totalCalls = totalCacheHits + totalCacheMisses;
  const cacheHitRate = totalCalls > 0 ? (totalCacheHits / totalCalls) * 100 : 0;

  // Calculate cost savings
  const estimatedSavings = results.reduce((sum, result) => {
    const collector = collectors[collectorNames[results.indexOf(result)]];
    if (!collector?.costPerCall) return sum;

    return sum + (result.cacheHits * collector.costPerCall);
  }, 0);

  const totalExecutionTime = Date.now() - startTime;

  const batchResult: BatchCollectorResult = {
    taskId: params.taskId,
    results,
    allKeywords,
    totalCacheHits,
    totalCacheMisses,
    cacheHitRate,
    totalExecutionTime,
    estimatedSavings,
  };

  console.log(`[Collector Registry] Batch complete: ${allKeywords.length} unique keywords`);
  console.log(`[Collector Registry] Cache hit rate: ${cacheHitRate.toFixed(1)}%`);
  console.log(`[Collector Registry] Estimated savings: $${estimatedSavings.toFixed(2)}`);
  console.log(`[Collector Registry] Total time: ${totalExecutionTime}ms`);

  return batchResult;
}

/**
 * Execute collectors based on mode
 *
 * Quick mode: GSC, Google Suggest, Competitors (cached)
 * Deep mode: All collectors
 *
 * @param params - Collector parameters
 * @param seoQuery - Optional SEO query manager
 * @returns Batch result
 */
export async function executeByMode(
  params: CollectorParams,
  seoQuery?: SEOQueryManager
): Promise<BatchCollectorResult> {
  const mode = params.mode || 'quick';

  let collectorNames: string[];

  if (mode === 'quick') {
    collectorNames = ['gsc', 'suggest', 'competitors'];
    console.log('[Collector Registry] Quick mode: GSC, Suggest, Competitors');
  } else {
    collectorNames = ['gsc', 'suggest', 'paa', 'social', 'competitors'];
    console.log('[Collector Registry] Deep mode: All collectors');
  }

  return executeBatch(collectorNames, params, seoQuery);
}

/**
 * Get available collectors
 *
 * @returns Array of collector names and metadata
 */
export function getAvailableCollectors(): Array<{
  name: string;
  displayName: string;
  cacheEnabled: boolean;
  costPerCall: number;
}> {
  return Object.entries(collectors).map(([name, collector]) => ({
    name,
    displayName: collector.name,
    cacheEnabled: collector.cacheEnabled,
    costPerCall: collector.costPerCall || 0,
  }));
}

/**
 * Export all types and collectors
 */
export * from './types';
export { collectFromGSC, isGSCConfigured, getGSCSites, getTopQueries } from './gsc-collector';
export { collectFromGoogleSuggest, batchCollectFromGoogleSuggest } from './google-suggest-collector';
export { collectFromPAA, batchCollectFromPAA, getPAACoverage } from './paa-collector';
export { collectFromSocial, getTrendingQuestions, analyzeSocialPatterns } from './social-collector';
export {
  collectFromCompetitors,
  getKeywordGaps,
  getCompetitorOverlap,
  groupByDifficulty,
} from './competitor-collector';
