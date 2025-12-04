/**
 * Competitor Keyword Collector
 *
 * Extracts keywords from competitor analysis data stored in RuVector.
 * Uses Phase 3 competitor intelligence from previous analysis.
 *
 * @module seo/lib/discovery/competitor-collector
 */

import type { KeywordSource, CompetitorCollectorOptions } from './types';
import type { SEOQueryManager } from '../ruvector/queries';
import type { CompetitorIntelligenceEntry } from '../ruvector/schemas';

/**
 * Extract top keywords from competitor intelligence
 *
 * @param intelligence - Competitor intelligence entry
 * @param limit - Maximum keywords per competitor
 * @param minSearchVolume - Minimum search volume filter
 * @returns Array of keywords
 */
function extractTopKeywords(
  intelligence: CompetitorIntelligenceEntry,
  limit: number,
  minSearchVolume: number
): Array<{ keyword: string; volume: number; position: number }> {
  const topKeywords = intelligence.metadata.topKeywords || [];

  return topKeywords
    .filter((kw: { keyword: string; position: number; searchVolume: number }) => (kw.searchVolume ?? 0) >= minSearchVolume)
    .slice(0, limit)
    .map((kw: { keyword: string; position: number; searchVolume: number }) => ({
      keyword: kw.keyword,
      volume: kw.searchVolume ?? 0,
      position: kw.position ?? 0,
    }));
}

/**
 * Convert competitor keywords to KeywordSource format
 */
function convertToKeywordSources(
  keywords: Array<{ keyword: string; volume: number; position: number }>,
  domain: string,
  taskId: string
): KeywordSource[] {
  return keywords.map((kw: { keyword: string; volume: number; position: number }) => ({
    keyword: kw.keyword,
    source: 'competitors' as const,
    metadata: {
      competitorDomain: domain,
      searchVolume: kw.volume,
    },
    discoveredAt: new Date().toISOString(),
    cacheHit: true, // Always from cache (RuVector)
  }));
}

/**
 * Query RuVector for competitor intelligence
 *
 * @param seoQuery - SEO query manager
 * @param niche - Niche to filter by
 * @param domains - Optional specific domains
 * @returns Array of competitor intelligence entries
 */
async function getCompetitorIntelligence(
  seoQuery: SEOQueryManager,
  niche: string,
  domains?: string[]
): Promise<CompetitorIntelligenceEntry[]> {
  const collections = seoQuery.getCollections();

  if (domains && domains.length > 0) {
    // Query specific domains
    const intelligence: CompetitorIntelligenceEntry[] = [];

    for (const domain of domains) {
      const entry = await collections.competitorIntelligence.getByDomainAndNiche(domain, niche);
      if (entry) {
        intelligence.push(entry);
      }
    }

    return intelligence;
  } else {
    // Get all intelligence for niche
    return collections.competitorIntelligence.getByNiche(niche);
  }
}

/**
 * Deduplicate keywords across competitors
 *
 * Keeps highest volume version of each keyword.
 */
function deduplicateKeywords(keywords: KeywordSource[]): KeywordSource[] {
  const keywordMap = new Map<string, KeywordSource>();

  for (const kw of keywords) {
    const normalized = kw.keyword.toLowerCase().trim();

    const existing = keywordMap.get(normalized);
    if (!existing) {
      keywordMap.set(normalized, kw);
    } else {
      // Keep version with higher search volume
      const existingVolume = existing.metadata.searchVolume || 0;
      const currentVolume = kw.metadata.searchVolume || 0;

      if (currentVolume > existingVolume) {
        keywordMap.set(normalized, kw);
      }
    }
  }

  return Array.from(keywordMap.values());
}

/**
 * Collect keywords from competitor analysis data
 *
 * Extracts top-ranking keywords from Phase 3 competitor intelligence.
 * All data comes from RuVector cache (no external API calls).
 *
 * @param taskId - Task ID for tracking
 * @param options - Collector options
 * @param seoQuery - SEO query manager (required)
 * @returns Array of competitor keywords
 */
export async function collectFromCompetitors(
  taskId: string,
  options: CompetitorCollectorOptions,
  seoQuery: SEOQueryManager
): Promise<KeywordSource[]> {
  console.log(`[Competitor Collector] Collecting keywords for niche: ${options.niche}`);

  if (!seoQuery) {
    console.error('[Competitor Collector] SEO query manager required');
    return [];
  }

  const limit = options.limit || 50;
  const minSearchVolume = options.minSearchVolume || 0;

  // Get competitor intelligence from RuVector
  const intelligence = await getCompetitorIntelligence(
    seoQuery,
    options.niche,
    options.competitorDomains
  );

  if (intelligence.length === 0) {
    console.warn('[Competitor Collector] No competitor intelligence found for niche');
    console.warn('[Competitor Collector] Run Phase 3 competitor analysis first');
    return [];
  }

  console.log(`[Competitor Collector] Found intelligence for ${intelligence.length} competitors`);

  // Extract keywords from each competitor
  const allKeywords: KeywordSource[] = [];

  for (const entry of intelligence) {
    const keywords = extractTopKeywords(entry, limit, minSearchVolume);

    if (keywords.length === 0) {
      console.warn(`[Competitor Collector] No keywords found for ${entry.metadata.domain}`);
      continue;
    }

    const sources = convertToKeywordSources(keywords, entry.metadata.domain, taskId);
    allKeywords.push(...sources);

    console.log(
      `[Competitor Collector] Extracted ${keywords.length} keywords from ${entry.metadata.domain}`
    );
  }

  // Deduplicate keywords
  const deduplicated = deduplicateKeywords(allKeywords);

  console.log(
    `[Competitor Collector] Found ${deduplicated.length} unique keywords (from ${allKeywords.length} total)`
  );

  // Sort by search volume descending
  deduplicated.sort((a, b) => {
    const volumeA = a.metadata.searchVolume || 0;
    const volumeB = b.metadata.searchVolume || 0;
    return volumeB - volumeA;
  });

  return deduplicated.slice(0, limit);
}

/**
 * Get keyword gaps from competitors
 *
 * Identifies keywords that competitors rank for but you don't.
 *
 * @param seoQuery - SEO query manager
 * @param niche - Niche area
 * @param yourDomain - Your domain
 * @param limit - Maximum results
 * @returns Array of keyword gap opportunities
 */
export async function getKeywordGaps(
  seoQuery: SEOQueryManager,
  niche: string,
  yourDomain: string,
  limit = 50
): Promise<KeywordSource[]> {
  console.log(`[Competitor Collector] Finding keyword gaps for ${yourDomain} in ${niche}`);

  const collections = seoQuery.getCollections();

  // Get your intelligence
  const yourIntel = await collections.competitorIntelligence.getByDomainAndNiche(yourDomain, niche);

  if (!yourIntel) {
    console.warn('[Competitor Collector] No intelligence found for your domain');
    return [];
  }

  const yourKeywords = new Set(
    (yourIntel.metadata.topKeywords || []).map(kw => kw.keyword.toLowerCase())
  );

  // Get competitor intelligence
  const competitorIntel = await getCompetitorIntelligence(seoQuery, niche);

  const gaps: KeywordSource[] = [];

  for (const competitor of competitorIntel) {
    if (competitor.metadata.domain === yourDomain) continue; // Skip yourself

    const competitorKeywords = extractTopKeywords(competitor, 100, 0);

    for (const kw of competitorKeywords) {
      const normalized = kw.keyword.toLowerCase();

      // If you don't rank for this keyword, it's a gap
      if (!yourKeywords.has(normalized)) {
        gaps.push({
          keyword: kw.keyword,
          source: 'competitors',
          metadata: {
            competitorDomain: competitor.metadata.domain,
            searchVolume: kw.volume,
          },
          discoveredAt: new Date().toISOString(),
          cacheHit: true,
        });
      }
    }
  }

  // Deduplicate and sort by volume
  const deduplicated = deduplicateKeywords(gaps);
  deduplicated.sort((a, b) => {
    const volumeA = a.metadata.searchVolume || 0;
    const volumeB = b.metadata.searchVolume || 0;
    return volumeB - volumeA;
  });

  console.log(`[Competitor Collector] Found ${deduplicated.length} keyword gap opportunities`);

  return deduplicated.slice(0, limit);
}

/**
 * Get competitor overlap analysis
 *
 * Identifies which competitors compete for similar keywords.
 *
 * @param seoQuery - SEO query manager
 * @param niche - Niche area
 * @param domains - Competitor domains to analyze
 * @returns Overlap analysis
 */
export async function getCompetitorOverlap(
  seoQuery: SEOQueryManager,
  niche: string,
  domains: string[]
): Promise<{
  totalKeywords: number;
  sharedKeywords: string[];
  overlapPercentage: number;
  domainCoverage: Record<string, number>;
}> {
  const intelligence = await getCompetitorIntelligence(seoQuery, niche, domains);

  if (intelligence.length === 0) {
    return {
      totalKeywords: 0,
      sharedKeywords: [],
      overlapPercentage: 0,
      domainCoverage: {},
    };
  }

  // Build keyword sets for each domain
  const domainKeywords = new Map<string, Set<string>>();
  const allKeywords = new Set<string>();

  for (const entry of intelligence) {
    const keywords = new Set(
      (entry.metadata.topKeywords || []).map(kw => kw.keyword.toLowerCase())
    );

    domainKeywords.set(entry.metadata.domain, keywords);

    keywords.forEach(kw => allKeywords.add(kw));
  }

  // Find shared keywords (present in all domains)
  const sharedKeywords: string[] = [];

  for (const keyword of allKeywords) {
    const isPresentInAll = Array.from(domainKeywords.values()).every(set => set.has(keyword));

    if (isPresentInAll) {
      sharedKeywords.push(keyword);
    }
  }

  // Calculate domain coverage
  const domainCoverage: Record<string, number> = {};
  for (const [domain, keywords] of domainKeywords.entries()) {
    domainCoverage[domain] = keywords.size;
  }

  // Calculate overlap percentage
  const overlapPercentage =
    allKeywords.size > 0 ? (sharedKeywords.length / allKeywords.size) * 100 : 0;

  return {
    totalKeywords: allKeywords.size,
    sharedKeywords,
    overlapPercentage,
    domainCoverage,
  };
}

/**
 * Get keywords by difficulty tier
 *
 * Groups competitor keywords by difficulty level.
 *
 * @param keywords - Array of keyword sources
 * @returns Keywords grouped by difficulty
 */
export function groupByDifficulty(keywords: KeywordSource[]): {
  easy: KeywordSource[];
  medium: KeywordSource[];
  hard: KeywordSource[];
} {
  const easy: KeywordSource[] = [];
  const medium: KeywordSource[] = [];
  const hard: KeywordSource[] = [];

  for (const kw of keywords) {
    const difficulty = kw.metadata.difficulty || 0;

    if (difficulty < 30) {
      easy.push(kw);
    } else if (difficulty < 60) {
      medium.push(kw);
    } else {
      hard.push(kw);
    }
  }

  return { easy, medium, hard };
}
