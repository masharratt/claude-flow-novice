/**
 * Keyword Discovery Types
 *
 * Type definitions for keyword source collectors with RuVector cache integration.
 *
 * @module seo/lib/discovery/types
 */

/**
 * Keyword source type
 */
export type KeywordSourceType = 'gsc' | 'suggest' | 'paa' | 'social' | 'competitors';

/**
 * Keyword source with attribution and metadata
 */
export interface KeywordSource {
  /** The keyword phrase */
  keyword: string;

  /** Source that discovered this keyword */
  source: KeywordSourceType;

  /** Source-specific metadata */
  metadata: {
    /** GSC impressions (GSC only) */
    impressions?: number;

    /** GSC clicks (GSC only) */
    clicks?: number;

    /** GSC average position (GSC only) */
    position?: number;

    /** Competitor domain (Competitors only) */
    competitorDomain?: string;

    /** Question type (PAA/Social only) */
    questionType?: 'what' | 'why' | 'how' | 'when' | 'where' | 'who' | 'other';

    /** Subreddit name (Social only) */
    subreddit?: string;

    /** Quora topic (Social only) */
    quoraTopic?: string;

    /** Search volume estimate (if available) */
    searchVolume?: number;

    /** Keyword difficulty estimate (if available) */
    difficulty?: number;
  };

  /** When this keyword was discovered */
  discoveredAt: string;

  /** Whether this was a cache hit */
  cacheHit: boolean;
}

/**
 * Collector execution parameters
 */
export interface CollectorParams {
  /** Task ID for tracking */
  taskId: string;

  /** Niche/topic area */
  niche?: string;

  /** Seed keywords for expansion */
  seedKeywords?: string[];

  /** Execution mode */
  mode?: 'quick' | 'deep';

  /** Competitor domains (for competitor collector) */
  competitorDomains?: string[];
}

/**
 * GSC collector options
 */
export interface GSCCollectorOptions {
  /** Task ID */
  taskId: string;

  /** Site URL to query */
  siteUrl: string;

  /** Start date for data (ISO format) */
  startDate?: string;

  /** End date for data (ISO format) */
  endDate?: string;

  /** Minimum impressions threshold */
  minImpressions?: number;

  /** Maximum results to return */
  limit?: number;
}

/**
 * Google Suggest collector options
 */
export interface SuggestCollectorOptions {
  /** Task ID */
  taskId: string;

  /** Niche for caching */
  niche: string;

  /** Language code (default: 'en') */
  language?: string;

  /** Country code (default: 'us') */
  country?: string;

  /** Maximum results per seed */
  limit?: number;

  /** Use cache-first strategy */
  cacheFirst?: boolean;
}

/**
 * PAA collector options
 */
export interface PAACollectorOptions {
  /** Task ID */
  taskId: string;

  /** Niche for caching */
  niche: string;

  /** Maximum PAA questions to retrieve */
  limit?: number;

  /** Use cache-first strategy */
  cacheFirst?: boolean;

  /** Cache TTL in days (default: 30) */
  cacheTTL?: number;
}

/**
 * Social collector options
 */
export interface SocialCollectorOptions {
  /** Task ID */
  taskId: string;

  /** Niche/topic area */
  niche: string;

  /** Subreddits to query */
  subreddits?: string[];

  /** Quora topics to query */
  quoraTopics?: string[];

  /** Minimum upvotes/engagement threshold */
  minEngagement?: number;

  /** Maximum results per source */
  limit?: number;
}

/**
 * Competitor collector options
 */
export interface CompetitorCollectorOptions {
  /** Task ID */
  taskId: string;

  /** Niche for filtering */
  niche: string;

  /** Competitor domains (optional, will use cached if not provided) */
  competitorDomains?: string[];

  /** Maximum keywords per competitor */
  limit?: number;

  /** Minimum search volume */
  minSearchVolume?: number;
}

/**
 * Keyword collector interface
 */
export interface KeywordCollector {
  /** Collector name */
  name: string;

  /** Collect keywords */
  collect: (params: CollectorParams) => Promise<KeywordSource[]>;

  /** Whether caching is enabled */
  cacheEnabled: boolean;

  /** Estimated cost per call (USD) */
  costPerCall?: number;
}

/**
 * Collector execution result
 */
export interface CollectorResult {
  /** Collector name */
  collector: string;

  /** Keywords discovered */
  keywords: KeywordSource[];

  /** Cache hit count */
  cacheHits: number;

  /** Cache miss count */
  cacheMisses: number;

  /** Total keywords returned */
  totalKeywords: number;

  /** Execution time in ms */
  executionTime: number;

  /** Any errors encountered */
  errors?: string[];
}

/**
 * Batch collector execution result
 */
export interface BatchCollectorResult {
  /** Task ID */
  taskId: string;

  /** Individual collector results */
  results: CollectorResult[];

  /** Combined keywords (deduplicated) */
  allKeywords: KeywordSource[];

  /** Total cache hits across all collectors */
  totalCacheHits: number;

  /** Total cache misses across all collectors */
  totalCacheMisses: number;

  /** Cache hit rate percentage */
  cacheHitRate: number;

  /** Total execution time in ms */
  totalExecutionTime: number;

  /** Estimated cost savings from cache */
  estimatedSavings: number;
}
