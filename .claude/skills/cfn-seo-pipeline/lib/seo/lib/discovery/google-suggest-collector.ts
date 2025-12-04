/**
 * Google Autocomplete Suggest Keyword Collector
 *
 * Collects keyword suggestions from Google Autocomplete API.
 * Implements RuVector cache-first architecture for cost savings.
 *
 * @module seo/lib/discovery/google-suggest-collector
 */

import type { KeywordSource, SuggestCollectorOptions } from './types';
import type { SEOQueryManager } from '../ruvector/queries';

/**
 * Google Suggest API response
 */
interface SuggestResponse {
  suggestions: string[];
}

/**
 * Alphabet for suffix expansion
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

/**
 * Generate search variations with letter suffixes
 *
 * @param seed - Seed keyword
 * @returns Array of variations (e.g., "keyword a", "keyword b", ...)
 */
function generateVariations(seed: string): string[] {
  return ALPHABET.map(letter => `${seed} ${letter}`);
}

/**
 * Query Google Autocomplete API
 *
 * @param query - Search query
 * @param language - Language code
 * @param country - Country code
 * @returns Array of suggestions
 */
async function queryGoogleSuggest(
  query: string,
  language = 'en',
  country = 'us'
): Promise<string[]> {
  // Google Autocomplete endpoint (unofficial but widely used)
  const url = new URL('http://suggestqueries.google.com/complete/search');
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('q', query);
  url.searchParams.set('hl', language);
  url.searchParams.set('gl', country);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Suggest API error (${response.status})`);
    }

    const data = await response.json() as [string, string[]];
    return data[1] || []; // Second element contains suggestions
  } catch (error) {
    console.error(`[Suggest Collector] Error querying "${query}":`, error);
    return [];
  }
}

/**
 * Check RuVector cache for keyword research
 *
 * @param seoQuery - SEO query manager
 * @param keyword - Keyword to check
 * @param niche - Niche area
 * @returns Cached suggestions or null
 */
async function checkCache(
  seoQuery: SEOQueryManager | null,
  keyword: string,
  niche: string
): Promise<string[] | null> {
  if (!seoQuery) return null;

  try {
    const collections = seoQuery.getCollections();
    const cached = await collections.keywordResearch.getByKeyword(keyword);

    if (cached && cached.metadata.niche === niche) {
      // Extract secondary keywords as suggestions
      const suggestions = cached.metadata.secondaryKeywords.map(sk => sk.keyword);

      if (suggestions.length > 0) {
        console.log(`[Suggest Collector] Cache hit for "${keyword}" (${suggestions.length} suggestions)`);
        return suggestions;
      }
    }
  } catch (error) {
    console.warn('[Suggest Collector] Cache check failed:', error);
  }

  return null;
}

/**
 * Store suggestions in RuVector cache
 *
 * @param seoQuery - SEO query manager
 * @param keyword - Seed keyword
 * @param niche - Niche area
 * @param suggestions - Suggestions to store
 */
async function storeInCache(
  seoQuery: SEOQueryManager | null,
  keyword: string,
  niche: string,
  suggestions: string[]
): Promise<void> {
  if (!seoQuery || suggestions.length === 0) return;

  try {
    const collections = seoQuery.getCollections();

    // Check if already exists
    const existing = await collections.keywordResearch.getByKeyword(keyword);
    if (existing) {
      console.log(`[Suggest Collector] Keyword "${keyword}" already cached, skipping storage`);
      return;
    }

    // Store as keyword research entry
    await collections.keywordResearch.add({
      primaryKeyword: keyword,
      niche,
      searchVolume: 0, // Unknown from autocomplete
      keywordDifficulty: 0,
      cpc: 0,
      searchIntent: 'informational', // Default assumption
      secondaryKeywords: suggestions.slice(0, 50).map(s => ({
        keyword: s,
        volume: 0,
        difficulty: 0,
        cpc: 0,
      })),
      peopleAlsoAsk: [],
      trendData: {
        currentTrend: 'stable',
        seasonality: false,
      },
    });

    console.log(`[Suggest Collector] Stored ${suggestions.length} suggestions for "${keyword}" in cache`);
  } catch (error) {
    console.warn('[Suggest Collector] Failed to store in cache:', error);
  }
}

/**
 * Deduplicate and normalize keywords
 */
function deduplicateKeywords(keywords: string[]): string[] {
  const normalized = new Set<string>();

  for (const kw of keywords) {
    const normalized_kw = kw.toLowerCase().trim();
    if (normalized_kw.length > 0) {
      normalized.add(normalized_kw);
    }
  }

  return Array.from(normalized);
}

/**
 * Convert suggestions to KeywordSource format
 */
function convertToKeywordSources(
  suggestions: string[],
  taskId: string,
  cacheHit: boolean
): KeywordSource[] {
  return suggestions.map(keyword => ({
    keyword,
    source: 'suggest' as const,
    metadata: {},
    discoveredAt: new Date().toISOString(),
    cacheHit,
  }));
}

/**
 * Collect keywords from Google Autocomplete
 *
 * Cache-first architecture:
 * 1. Check RuVector cache for seed keyword
 * 2. If cache miss, query Google Suggest API
 * 3. Store results in RuVector for future use
 *
 * @param seed - Seed keyword
 * @param options - Collector options
 * @param seoQuery - Optional SEO query manager for caching
 * @returns Array of keyword sources
 */
export async function collectFromGoogleSuggest(
  seed: string,
  options?: SuggestCollectorOptions,
  seoQuery?: SEOQueryManager
): Promise<KeywordSource[]> {
  const taskId = options?.taskId || `suggest-${Date.now()}`;
  const niche = options?.niche || 'general';
  const language = options?.language || 'en';
  const country = options?.country || 'us';
  const limit = options?.limit || 100;
  const cacheFirst = options?.cacheFirst ?? true;

  console.log(`[Suggest Collector] Collecting suggestions for "${seed}"`);

  // Step 1: Check cache if enabled
  if (cacheFirst && seoQuery) {
    const cached = await checkCache(seoQuery, seed, niche);
    if (cached) {
      return convertToKeywordSources(cached.slice(0, limit), taskId, true);
    }
  }

  // Step 2: Query Google Suggest API
  const allSuggestions: string[] = [];

  // Query base seed
  console.log(`[Suggest Collector] Querying base seed "${seed}"`);
  const baseSuggestions = await queryGoogleSuggest(seed, language, country);
  allSuggestions.push(...baseSuggestions);

  // Query variations with letter suffixes
  const variations = generateVariations(seed);

  console.log(`[Suggest Collector] Querying ${variations.length} variations`);

  for (const variation of variations) {
    const suggestions = await queryGoogleSuggest(variation, language, country);
    allSuggestions.push(...suggestions);

    // Rate limiting: small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Deduplicate
  const uniqueSuggestions = deduplicateKeywords(allSuggestions);

  console.log(
    `[Suggest Collector] Found ${uniqueSuggestions.length} unique suggestions (from ${allSuggestions.length} total)`
  );

  // Step 3: Store in cache
  if (seoQuery) {
    await storeInCache(seoQuery, seed, niche, uniqueSuggestions);
  }

  // Step 4: Convert and return
  return convertToKeywordSources(uniqueSuggestions.slice(0, limit), taskId, false);
}

/**
 * Batch collect from multiple seed keywords
 *
 * @param seeds - Array of seed keywords
 * @param options - Collector options
 * @param seoQuery - Optional SEO query manager
 * @returns Combined array of keyword sources
 */
export async function batchCollectFromGoogleSuggest(
  seeds: string[],
  options?: SuggestCollectorOptions,
  seoQuery?: SEOQueryManager
): Promise<KeywordSource[]> {
  console.log(`[Suggest Collector] Batch collecting from ${seeds.length} seeds`);

  const allKeywords: KeywordSource[] = [];

  for (const seed of seeds) {
    const keywords = await collectFromGoogleSuggest(seed, options, seoQuery);
    allKeywords.push(...keywords);

    // Rate limiting between seeds
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Deduplicate across all seeds
  const seen = new Set<string>();
  const deduplicated = allKeywords.filter(kw => {
    const normalized = kw.keyword.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  console.log(
    `[Suggest Collector] Batch complete: ${deduplicated.length} unique keywords (from ${allKeywords.length} total)`
  );

  return deduplicated;
}
