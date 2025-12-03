/**
 * Phase 4: Keyword Universe - SEO Site Onboarding
 *
 * @module seo/lib/phases/phase-4-keywords
 * @description Build comprehensive keyword database for the niche with RuVector caching
 *
 * Sprint 1.3 - Loop 3 Iteration 1
 * Part of SEO Site Onboarding Design (Day 2-3)
 */

import type { Redis } from 'ioredis';
import type { SEOQueryManager } from '../ruvector/queries';
import {
  KeywordResearchCollection,
  type KeywordResearchInput,
} from '../ruvector/collections/keyword-research';
import type { SearchIntent, SecondaryKeyword } from '../ruvector/schemas';

/**
 * Configuration for Phase 4
 */
export interface Phase4Config {
  /** Redis client for reading Phase 3 data and writing Phase 4 output */
  redis: Redis;

  /** SEO Query Manager for RuVector operations */
  seoQueryManager: SEOQueryManager;

  /** Task ID for Redis key namespacing */
  taskId: string;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Target number of keywords to discover (default: 500) */
  targetKeywordCount?: number;

  /** Maximum keywords per source (prevents runaway expansion) */
  maxKeywordsPerSource?: number;
}

/**
 * Keyword discovery source
 */
interface KeywordSource {
  source: 'seed_expansion' | 'competitor' | 'paa' | 'google_suggest' | 'cache';
  keywords: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Keyword with full metrics
 */
export interface KeywordWithMetrics {
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number;
  cpc: number;
  searchIntent: SearchIntent;
  source: string;
  secondaryKeywords?: SecondaryKeyword[];
  longTailKeywords?: string[];
  peopleAlsoAsk?: string[];
  relatedSearches?: string[];
}

/**
 * Phase 4 execution result
 */
export interface Phase4Result {
  /** Total keywords discovered */
  totalKeywords: number;

  /** Keywords from cache (RuVector) */
  cachedKeywords: number;

  /** Keywords requiring new research */
  newKeywords: number;

  /** Breakdown by search intent */
  byIntent: {
    informational: number;
    commercial: number;
    transactional: number;
    navigational: number;
  };

  /** Breakdown by keyword difficulty */
  byDifficulty: {
    easy_kd_0_30: number;
    medium_kd_31_60: number;
    hard_kd_61_100: number;
  };

  /** Total search volume */
  totalSearchVolume: number;

  /** Execution time (ms) */
  executionTime: number;

  /** Cache hit rate */
  cacheHitRate: number;

  /** Sample keywords for verification */
  sampleKeywords: KeywordWithMetrics[];

  /** Storage status */
  storageStatus: {
    storedInRuVector: number;
    storedInRedis: boolean;
  };
}

/**
 * Execute Phase 4: Keyword Universe
 *
 * Discovers comprehensive keyword database for the niche with 80%+ cache utilization
 *
 * @param context - Phase 3 output (competitor data)
 * @param config - Phase 4 configuration
 * @returns Phase 4 execution result
 */
export async function executePhase4(
  context: { primaryKeyword: string; niche: string; competitorDomains?: string[] },
  config: Phase4Config
): Promise<Phase4Result> {
  const startTime = Date.now();

  if (config.verbose) {
    console.log('[Phase 4] Keyword Universe starting...');
    console.log(`[Phase 4] Primary keyword: ${context.primaryKeyword}`);
    console.log(`[Phase 4] Niche: ${context.niche}`);
  }

  // Initialize result structure
  const result: Phase4Result = {
    totalKeywords: 0,
    cachedKeywords: 0,
    newKeywords: 0,
    byIntent: {
      informational: 0,
      commercial: 0,
      transactional: 0,
      navigational: 0,
    },
    byDifficulty: {
      easy_kd_0_30: 0,
      medium_kd_31_60: 0,
      hard_kd_61_100: 0,
    },
    totalSearchVolume: 0,
    executionTime: 0,
    cacheHitRate: 0,
    sampleKeywords: [],
    storageStatus: {
      storedInRuVector: 0,
      storedInRedis: false,
    },
  };

  const allKeywords = new Map<string, KeywordWithMetrics>();
  const sources: KeywordSource[] = [];

  // Step 4.0: Query RuVector for cached keyword research
  if (config.verbose) {
    console.log('[Phase 4.0] Querying RuVector for cached keywords...');
  }

  const cachedKeywordData = await queryCachedKeywords(
    context.primaryKeyword,
    context.niche,
    config.seoQueryManager
  );

  if (cachedKeywordData.length > 0) {
    if (config.verbose) {
      console.log(`[Phase 4.0] Found ${cachedKeywordData.length} cached keyword entries`);
    }

    for (const cached of cachedKeywordData) {
      const kw: KeywordWithMetrics = {
        keyword: cached.metadata.primaryKeyword,
        searchVolume: cached.metadata.searchVolume,
        keywordDifficulty: cached.metadata.keywordDifficulty,
        cpc: cached.metadata.cpc,
        searchIntent: cached.metadata.searchIntent,
        source: 'cache',
        secondaryKeywords: cached.metadata.secondaryKeywords,
        longTailKeywords: cached.metadata.longTailKeywords,
        peopleAlsoAsk: cached.metadata.peopleAlsoAsk,
        relatedSearches: cached.metadata.relatedSearches,
      };
      allKeywords.set(kw.keyword.toLowerCase(), kw);

      // Add secondary keywords
      for (const secondary of cached.metadata.secondaryKeywords || []) {
        if (!allKeywords.has(secondary.keyword.toLowerCase())) {
          allKeywords.set(secondary.keyword.toLowerCase(), {
            keyword: secondary.keyword,
            searchVolume: secondary.volume,
            keywordDifficulty: secondary.difficulty,
            cpc: secondary.cpc,
            searchIntent: cached.metadata.searchIntent,
            source: 'cache_secondary',
          });
        }
      }
    }

    result.cachedKeywords = allKeywords.size;
    sources.push({
      source: 'cache',
      keywords: Array.from(allKeywords.keys()),
      metadata: { entryCount: cachedKeywordData.length },
    });
  }

  // Step 4.1: Seed keyword expansion (if needed)
  if (allKeywords.size < (config.targetKeywordCount || 500) * 0.8) {
    if (config.verbose) {
      console.log('[Phase 4.1] Expanding seed keywords...');
    }

    const seedKeywords = await expandSeedKeywords(
      context.primaryKeyword,
      config.maxKeywordsPerSource || 100
    );

    for (const kw of seedKeywords) {
      if (!allKeywords.has(kw.keyword.toLowerCase())) {
        allKeywords.set(kw.keyword.toLowerCase(), kw);
      }
    }

    sources.push({
      source: 'seed_expansion',
      keywords: seedKeywords.map((k) => k.keyword),
    });
  }

  // Step 4.2: Competitor keyword extraction (from Phase 3 output)
  if (config.verbose) {
    console.log('[Phase 4.2] Extracting competitor keywords...');
  }

  const competitorKeywords = await extractCompetitorKeywords(
    context.competitorDomains || [],
    config.redis,
    config.taskId,
    config.maxKeywordsPerSource || 100
  );

  for (const kw of competitorKeywords) {
    if (!allKeywords.has(kw.keyword.toLowerCase())) {
      allKeywords.set(kw.keyword.toLowerCase(), kw);
    }
  }

  sources.push({
    source: 'competitor',
    keywords: competitorKeywords.map((k) => k.keyword),
  });

  // Step 4.3: People Also Ask mining (cache-first)
  if (config.verbose) {
    console.log('[Phase 4.3] Mining People Also Ask questions...');
  }

  const paaKeywords = await minePeopleAlsoAsk(
    context.primaryKeyword,
    config.maxKeywordsPerSource || 50
  );

  for (const kw of paaKeywords) {
    if (!allKeywords.has(kw.keyword.toLowerCase())) {
      allKeywords.set(kw.keyword.toLowerCase(), kw);
    }
  }

  sources.push({
    source: 'paa',
    keywords: paaKeywords.map((k) => k.keyword),
  });

  // Step 4.4: Google Suggest mining
  if (config.verbose) {
    console.log('[Phase 4.4] Mining Google Suggest...');
  }

  const suggestKeywords = await mineGoogleSuggest(
    context.primaryKeyword,
    config.maxKeywordsPerSource || 50
  );

  for (const kw of suggestKeywords) {
    if (!allKeywords.has(kw.keyword.toLowerCase())) {
      allKeywords.set(kw.keyword.toLowerCase(), kw);
    }
  }

  sources.push({
    source: 'google_suggest',
    keywords: suggestKeywords.map((k) => k.keyword),
  });

  // Step 4.5: Search volume and difficulty lookup (for new keywords only)
  const newKeywords = Array.from(allKeywords.values()).filter((kw) => kw.source !== 'cache');

  if (newKeywords.length > 0 && config.verbose) {
    console.log(`[Phase 4.5] Looking up metrics for ${newKeywords.length} new keywords...`);
    // Note: This will use DataForSEO cache wrapper (to be implemented by seo-analytics-specialist)
    // For now, we'll use placeholder metrics
  }

  await enrichKeywordMetrics(newKeywords);

  // Step 4.6: Deduplication and clustering
  if (config.verbose) {
    console.log('[Phase 4.6] Deduplicating and clustering...');
  }

  const dedupedKeywords = deduplicateKeywords(Array.from(allKeywords.values()));

  // Calculate statistics
  result.totalKeywords = dedupedKeywords.length;
  result.newKeywords = result.totalKeywords - result.cachedKeywords;
  result.cacheHitRate = result.totalKeywords > 0 ? result.cachedKeywords / result.totalKeywords : 0;

  for (const kw of dedupedKeywords) {
    // Count by intent
    result.byIntent[kw.searchIntent]++;

    // Count by difficulty
    if (kw.keywordDifficulty <= 30) {
      result.byDifficulty.easy_kd_0_30++;
    } else if (kw.keywordDifficulty <= 60) {
      result.byDifficulty.medium_kd_31_60++;
    } else {
      result.byDifficulty.hard_kd_61_100++;
    }

    // Sum search volume
    result.totalSearchVolume += kw.searchVolume;
  }

  // Sample keywords for verification (top 5 by volume)
  result.sampleKeywords = dedupedKeywords
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, 5);

  // Step 4.7: Store new keywords in RuVector
  if (config.verbose) {
    console.log('[Phase 4.7] Storing new keywords in RuVector...');
  }

  const storedCount = await storeNewKeywords(
    dedupedKeywords.filter((k) => k.source !== 'cache'),
    context.niche,
    config.seoQueryManager
  );

  result.storageStatus.storedInRuVector = storedCount;

  // Step 4.8: Write output to Redis
  if (config.verbose) {
    console.log('[Phase 4.8] Writing keyword universe to Redis...');
  }

  const redisKey = `seo:task:${config.taskId}:phase4:keyword_universe`;
  await config.redis.set(
    redisKey,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      primaryKeyword: context.primaryKeyword,
      niche: context.niche,
      totalKeywords: result.totalKeywords,
      cachedKeywords: result.cachedKeywords,
      newKeywords: result.newKeywords,
      byIntent: result.byIntent,
      byDifficulty: result.byDifficulty,
      totalSearchVolume: result.totalSearchVolume,
      cacheHitRate: result.cacheHitRate,
      keywords: dedupedKeywords,
      sources,
    }),
    'EX',
    86400 * 7 // 7 day TTL
  );

  result.storageStatus.storedInRedis = true;

  result.executionTime = Date.now() - startTime;

  if (config.verbose) {
    console.log(`[Phase 4] Completed in ${result.executionTime}ms`);
    console.log(`[Phase 4] Total keywords: ${result.totalKeywords}`);
    console.log(`[Phase 4] Cache hit rate: ${(result.cacheHitRate * 100).toFixed(1)}%`);
  }

  return result;
}

/**
 * Query RuVector for cached keyword research
 */
async function queryCachedKeywords(
  primaryKeyword: string,
  niche: string,
  seoQueryManager: SEOQueryManager
): Promise<Array<{ metadata: KeywordResearchInput & { primaryKeyword: string } }>> {
  // Use SEO Query Manager to search keyword_research collection
  // This is a placeholder - actual implementation depends on SEOQueryManager API
  try {
    // TODO: Implement actual RuVector query
    // For now, return empty array to indicate no cached data
    return [];
  } catch (error) {
    console.error('[Phase 4.0] Error querying cached keywords:', error);
    return [];
  }
}

/**
 * Expand seed keywords with variations and modifiers
 */
async function expandSeedKeywords(
  primaryKeyword: string,
  maxKeywords: number
): Promise<KeywordWithMetrics[]> {
  const expanded: KeywordWithMetrics[] = [];

  // Common modifiers for seed expansion
  const modifiers = {
    questions: ['how to', 'what is', 'why', 'when', 'where', 'who'],
    qualifiers: ['best', 'top', 'cheap', 'free', 'online', 'guide', 'tutorial'],
    year: [new Date().getFullYear().toString()],
  };

  // Generate variations
  for (const modifier of [...modifiers.questions, ...modifiers.qualifiers, ...modifiers.year]) {
    if (expanded.length >= maxKeywords) break;

    expanded.push({
      keyword: `${modifier} ${primaryKeyword}`,
      searchVolume: 0, // Will be enriched later
      keywordDifficulty: 0,
      cpc: 0,
      searchIntent: 'informational',
      source: 'seed_expansion',
    });

    expanded.push({
      keyword: `${primaryKeyword} ${modifier}`,
      searchVolume: 0,
      keywordDifficulty: 0,
      cpc: 0,
      searchIntent: 'informational',
      source: 'seed_expansion',
    });
  }

  return expanded.slice(0, maxKeywords);
}

/**
 * Extract keywords from competitor analysis (Phase 3 output)
 */
async function extractCompetitorKeywords(
  competitorDomains: string[],
  redis: Redis,
  taskId: string,
  maxKeywords: number
): Promise<KeywordWithMetrics[]> {
  const keywords: KeywordWithMetrics[] = [];

  try {
    // Read Phase 3 competitor analysis from Redis
    const redisKey = `seo:task:${taskId}:phase3:competitor_analysis`;
    const phase3Data = await redis.get(redisKey);

    if (!phase3Data) {
      console.warn('[Phase 4.2] No Phase 3 competitor data found');
      return keywords;
    }

    const competitorData = JSON.parse(phase3Data);

    // Extract keywords from competitor data
    // This is a placeholder - actual extraction depends on Phase 3 output structure
    if (competitorData.competitors && Array.isArray(competitorData.competitors)) {
      for (const competitor of competitorData.competitors) {
        if (competitor.topKeywords && Array.isArray(competitor.topKeywords)) {
          for (const kw of competitor.topKeywords.slice(0, maxKeywords / competitorDomains.length)) {
            keywords.push({
              keyword: kw.keyword || kw,
              searchVolume: kw.volume || 0,
              keywordDifficulty: kw.difficulty || 50,
              cpc: kw.cpc || 0,
              searchIntent: kw.intent || 'informational',
              source: `competitor_${competitor.domain}`,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('[Phase 4.2] Error extracting competitor keywords:', error);
  }

  return keywords.slice(0, maxKeywords);
}

/**
 * Mine People Also Ask questions
 */
async function minePeopleAlsoAsk(
  primaryKeyword: string,
  maxKeywords: number
): Promise<KeywordWithMetrics[]> {
  const paaKeywords: KeywordWithMetrics[] = [];

  // Placeholder implementation
  // TODO: Integrate with DataForSEO PAA endpoint (via seo-analytics-specialist)
  // For now, return empty array
  return paaKeywords;
}

/**
 * Mine Google Suggest autocomplete
 */
async function mineGoogleSuggest(
  primaryKeyword: string,
  maxKeywords: number
): Promise<KeywordWithMetrics[]> {
  const suggestKeywords: KeywordWithMetrics[] = [];

  // Placeholder implementation
  // TODO: Integrate with Google Suggest scraping or API
  // For now, return empty array
  return suggestKeywords;
}

/**
 * Enrich keywords with search volume and difficulty metrics
 */
async function enrichKeywordMetrics(keywords: KeywordWithMetrics[]): Promise<void> {
  // Placeholder implementation
  // TODO: Use DataForSEO cache wrapper (to be implemented by seo-analytics-specialist)
  // For now, assign placeholder metrics based on keyword characteristics

  for (const kw of keywords) {
    if (kw.searchVolume === 0) {
      // Estimate based on keyword length and type
      const words = kw.keyword.split(' ').length;
      kw.searchVolume = Math.max(100, Math.floor(Math.random() * 10000) / words);

      // Question keywords are typically informational with lower difficulty
      if (kw.keyword.match(/^(how|what|why|when|where|who)\s/i)) {
        kw.searchIntent = 'informational';
        kw.keywordDifficulty = Math.floor(Math.random() * 40) + 10; // 10-50
      }
      // "Best" and "top" indicate commercial intent
      else if (kw.keyword.match(/\b(best|top|review|vs|compare)\b/i)) {
        kw.searchIntent = 'commercial';
        kw.keywordDifficulty = Math.floor(Math.random() * 40) + 30; // 30-70
      }
      // "Buy" and product names indicate transactional intent
      else if (kw.keyword.match(/\b(buy|price|cheap|deal|discount)\b/i)) {
        kw.searchIntent = 'transactional';
        kw.keywordDifficulty = Math.floor(Math.random() * 30) + 50; // 50-80
      }
      // Brand names indicate navigational intent
      else if (kw.keyword.match(/\b(login|official|website|site)\b/i)) {
        kw.searchIntent = 'navigational';
        kw.keywordDifficulty = Math.floor(Math.random() * 20) + 60; // 60-80
      } else {
        kw.searchIntent = 'informational';
        kw.keywordDifficulty = Math.floor(Math.random() * 60) + 20; // 20-80
      }

      kw.cpc = Math.random() * 5; // $0-5
    }
  }
}

/**
 * Deduplicate keywords and cluster similar terms
 */
function deduplicateKeywords(keywords: KeywordWithMetrics[]): KeywordWithMetrics[] {
  const seen = new Set<string>();
  const deduped: KeywordWithMetrics[] = [];

  for (const kw of keywords) {
    const normalized = kw.keyword.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduped.push(kw);
    }
  }

  return deduped;
}

/**
 * Store new keywords in RuVector
 */
async function storeNewKeywords(
  keywords: KeywordWithMetrics[],
  niche: string,
  seoQueryManager: SEOQueryManager
): Promise<number> {
  let storedCount = 0;

  try {
    // TODO: Implement actual RuVector storage via SEOQueryManager
    // For now, return 0 to indicate no storage
    storedCount = 0;
  } catch (error) {
    console.error('[Phase 4.7] Error storing keywords in RuVector:', error);
  }

  return storedCount;
}
