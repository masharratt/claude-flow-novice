/**
 * People Also Ask (PAA) Keyword Collector
 *
 * Collects PAA questions from SERP data.
 * Implements RuVector cache-first architecture with DataForSEO integration.
 *
 * @module seo/lib/discovery/paa-collector
 */

import type { KeywordSource, PAACollectorOptions } from './types';
import type { SEOQueryManager } from '../ruvector/queries';

/**
 * PAA question with metadata
 */
interface PAAQuestion {
  question: string;
  answer?: string;
  expandedQuestions?: string[];
}

/**
 * Classify question type based on starting word
 */
function classifyQuestionType(question: string): 'what' | 'why' | 'how' | 'when' | 'where' | 'who' | 'other' {
  const normalized = question.toLowerCase().trim();

  if (normalized.startsWith('what')) return 'what';
  if (normalized.startsWith('why')) return 'why';
  if (normalized.startsWith('how')) return 'how';
  if (normalized.startsWith('when')) return 'when';
  if (normalized.startsWith('where')) return 'where';
  if (normalized.startsWith('who')) return 'who';

  return 'other';
}

/**
 * Check RuVector cache for PAA questions
 *
 * @param seoQuery - SEO query manager
 * @param keyword - Keyword to check
 * @param niche - Niche area
 * @param cacheTTL - Cache TTL in days
 * @returns Cached PAA questions or null
 */
async function checkPAACache(
  seoQuery: SEOQueryManager | null,
  keyword: string,
  niche: string,
  cacheTTL: number
): Promise<string[] | null> {
  if (!seoQuery) return null;

  try {
    const collections = seoQuery.getCollections();

    // Check keyword research collection for PAA data
    const cached = await collections.keywordResearch.getByKeyword(keyword);

    if (cached && cached.metadata.niche === niche) {
      // Check freshness
      const freshnessThreshold = 1 - (cacheTTL / 90); // Convert TTL to freshness threshold
      const isFresh = await collections.keywordResearch.hasFreshResearch(keyword, freshnessThreshold);

      if (isFresh && cached.metadata.peopleAlsoAsk && cached.metadata.peopleAlsoAsk.length > 0) {
        console.log(
          `[PAA Collector] Cache hit for "${keyword}" (${cached.metadata.peopleAlsoAsk.length} questions)`
        );
        return cached.metadata.peopleAlsoAsk;
      }
    }
  } catch (error) {
    console.warn('[PAA Collector] Cache check failed:', error);
  }

  return null;
}

/**
 * Store PAA questions in RuVector cache
 *
 * @param seoQuery - SEO query manager
 * @param keyword - Keyword
 * @param niche - Niche area
 * @param questions - PAA questions
 */
async function storePAAInCache(
  seoQuery: SEOQueryManager | null,
  keyword: string,
  niche: string,
  questions: string[]
): Promise<void> {
  if (!seoQuery || questions.length === 0) return;

  try {
    const collections = seoQuery.getCollections();

    // Check if keyword research entry exists
    const existing = await collections.keywordResearch.getByKeyword(keyword);

    if (existing) {
      // Update existing entry with PAA data
      // Note: This requires implementing an update method on KeywordResearchCollection
      console.log(`[PAA Collector] Keyword "${keyword}" exists, PAA data should be merged`);
      // TODO: Implement update method for adding PAA to existing entries
    } else {
      // Create new entry with PAA data
      await collections.keywordResearch.add({
        primaryKeyword: keyword,
        niche,
        searchVolume: 0,
        keywordDifficulty: 0,
        cpc: 0,
        searchIntent: 'informational',
        secondaryKeywords: [],
        peopleAlsoAsk: questions,
        relatedSearches: [],
        longTailKeywords: [],
      });

      console.log(`[PAA Collector] Stored ${questions.length} PAA questions for "${keyword}"`);
    }
  } catch (error) {
    console.warn('[PAA Collector] Failed to store PAA in cache:', error);
  }
}

/**
 * Query DataForSEO SERP API for PAA data
 *
 * This is a placeholder implementation. The actual DataForSEO integration
 * will be completed in Sprint 1.3.
 *
 * @param keyword - Keyword to query
 * @returns PAA questions
 */
async function queryDataForSEO(keyword: string): Promise<PAAQuestion[]> {
  // Placeholder: In Sprint 1.3, this will use the DataForSEO wrapper
  console.warn('[PAA Collector] DataForSEO integration not yet implemented (Sprint 1.3)');
  console.warn('[PAA Collector] Returning empty results for now');

  // Mock implementation for testing
  if (process.env.NODE_ENV === 'development') {
    return [
      {
        question: `What is ${keyword}?`,
        expandedQuestions: [`How does ${keyword} work?`, `Why use ${keyword}?`],
      },
      {
        question: `How to use ${keyword}?`,
      },
      {
        question: `Why is ${keyword} important?`,
      },
    ];
  }

  return [];
}

/**
 * Extract all questions from PAA data including expanded questions
 */
function extractAllQuestions(paaData: PAAQuestion[]): string[] {
  const questions: string[] = [];

  for (const item of paaData) {
    questions.push(item.question);

    if (item.expandedQuestions) {
      questions.push(...item.expandedQuestions);
    }
  }

  return questions;
}

/**
 * Convert PAA questions to KeywordSource format
 */
function convertPAAToKeywordSources(
  questions: string[],
  taskId: string,
  cacheHit: boolean
): KeywordSource[] {
  return questions.map(question => ({
    keyword: question,
    source: 'paa' as const,
    metadata: {
      questionType: classifyQuestionType(question),
    },
    discoveredAt: new Date().toISOString(),
    cacheHit,
  }));
}

/**
 * Collect PAA questions for a keyword
 *
 * Cache-first architecture:
 * 1. Check RuVector cache for existing PAA data
 * 2. If cache miss, query DataForSEO SERP API
 * 3. Store results in RuVector for future use
 *
 * @param keyword - Target keyword
 * @param options - Collector options
 * @param seoQuery - Optional SEO query manager for caching
 * @returns Array of PAA questions as keyword sources
 */
export async function collectFromPAA(
  keyword: string,
  options?: PAACollectorOptions,
  seoQuery?: SEOQueryManager
): Promise<KeywordSource[]> {
  const taskId = options?.taskId || `paa-${Date.now()}`;
  const niche = options?.niche || 'general';
  const limit = options?.limit || 20;
  const cacheFirst = options?.cacheFirst ?? true;
  const cacheTTL = options?.cacheTTL || 30; // 30 days default

  console.log(`[PAA Collector] Collecting PAA questions for "${keyword}"`);

  // Step 1: Check cache if enabled
  if (cacheFirst && seoQuery) {
    const cached = await checkPAACache(seoQuery, keyword, niche, cacheTTL);
    if (cached) {
      return convertPAAToKeywordSources(cached.slice(0, limit), taskId, true);
    }
  }

  // Step 2: Query DataForSEO API (placeholder for Sprint 1.3)
  console.log(`[PAA Collector] Cache miss, querying DataForSEO API`);
  const paaData = await queryDataForSEO(keyword);

  // Extract all questions
  const questions = extractAllQuestions(paaData);

  console.log(`[PAA Collector] Found ${questions.length} PAA questions`);

  // Step 3: Store in cache
  if (seoQuery && questions.length > 0) {
    await storePAAInCache(seoQuery, keyword, niche, questions);
  }

  // Step 4: Convert and return
  return convertPAAToKeywordSources(questions.slice(0, limit), taskId, false);
}

/**
 * Batch collect PAA questions from multiple keywords
 *
 * @param keywords - Array of keywords
 * @param options - Collector options
 * @param seoQuery - Optional SEO query manager
 * @returns Combined array of PAA questions
 */
export async function batchCollectFromPAA(
  keywords: string[],
  options?: PAACollectorOptions,
  seoQuery?: SEOQueryManager
): Promise<KeywordSource[]> {
  console.log(`[PAA Collector] Batch collecting PAA from ${keywords.length} keywords`);

  const allQuestions: KeywordSource[] = [];

  for (const keyword of keywords) {
    try {
      const questions = await collectFromPAA(keyword, options, seoQuery);
      allQuestions.push(...questions);

      // Rate limiting between API calls (only if not cached)
      const cacheHits = questions.filter(q => q.cacheHit).length;
      if (cacheHits < questions.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    } catch (error) {
      console.error(`[PAA Collector] Error collecting for "${keyword}":`, error);
    }
  }

  // Deduplicate questions
  const seen = new Set<string>();
  const deduplicated = allQuestions.filter(kw => {
    const normalized = kw.keyword.toLowerCase().trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  console.log(
    `[PAA Collector] Batch complete: ${deduplicated.length} unique questions (from ${allQuestions.length} total)`
  );

  return deduplicated;
}

/**
 * Get PAA coverage statistics
 *
 * Analyzes question type distribution.
 *
 * @param questions - Array of PAA keyword sources
 * @returns Statistics about question types
 */
export function getPAACoverage(questions: KeywordSource[]): {
  total: number;
  byType: Record<string, number>;
  coverage: Record<string, number>;
} {
  const byType: Record<string, number> = {
    what: 0,
    why: 0,
    how: 0,
    when: 0,
    where: 0,
    who: 0,
    other: 0,
  };

  for (const q of questions) {
    const type = q.metadata.questionType || 'other';
    byType[type] = (byType[type] || 0) + 1;
  }

  const total = questions.length;
  const coverage: Record<string, number> = {};

  for (const [type, count] of Object.entries(byType)) {
    coverage[type] = total > 0 ? count / total : 0;
  }

  return { total, byType, coverage };
}
