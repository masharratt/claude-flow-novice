/**
 * Cluster Research Context Builder
 *
 * Queries all 6 RuVector collections to build a unified research context
 * for an entire content cluster. Identifies cache hits, research gaps,
 * and calculates estimated savings.
 *
 * Part of Phase 3 Sprint 1: RuVector Intelligence Integration
 *
 * @module seo/lib/cluster-research-context
 */

import type { SEOQueryManager } from './ruvector/queries';
import type {
  KeywordResearchEntry,
  CompetitorIntelligenceEntry,
  SERPPatternEntry,
  ExpertSourceEntry,
  StatisticEntry,
  ContentPatternEntry,
} from './ruvector/schemas';

// =============================================
// Types
// =============================================

/**
 * Cache status for a data source
 */
export type CacheStatus = 'fresh' | 'stale' | 'missing';

/**
 * Research gap that needs to be filled
 */
export interface ResearchGap {
  /** Type of research gap */
  type: 'keyword' | 'competitor' | 'serp' | 'expert' | 'statistic' | 'pattern';

  /** Human-readable description */
  description: string;

  /** Priority level */
  priority: 'high' | 'medium' | 'low';

  /** Estimated cost to fill this gap (USD) */
  estimatedCost: number;
}

/**
 * Estimated savings from cache hits
 */
export interface EstimatedSavings {
  /** Number of API calls saved */
  apiCallsSaved: number;

  /** Time saved in minutes */
  timeSavedMinutes: number;

  /** Cost saved in USD */
  costSavedUSD: number;
}

/**
 * Cached keyword research with freshness info
 */
export interface CachedKeywordResearch {
  /** Keyword research data */
  data: KeywordResearchEntry;

  /** Freshness score (0.0-1.0) */
  freshness: number;

  /** Cache status */
  cacheStatus: CacheStatus;
}

/**
 * Cached competitor intelligence with freshness info
 */
export interface CachedCompetitorIntelligence {
  /** Competitor domain */
  domain: string;

  /** Competitor intelligence data */
  data: CompetitorIntelligenceEntry;

  /** Freshness score (0.0-1.0) */
  freshness: number;

  /** Cache status */
  cacheStatus: CacheStatus;
}

/**
 * Cached SERP patterns with freshness info
 */
export interface CachedSERPPatterns {
  /** SERP pattern data */
  data: SERPPatternEntry;

  /** Freshness score (0.0-1.0) */
  freshness: number;

  /** Cache status */
  cacheStatus: CacheStatus;
}

/**
 * Cache status summary for all collections
 */
export interface CacheStatusSummary {
  /** Keyword research cache status */
  keywordResearch: CacheStatus;

  /** Number of cached competitors */
  competitorCount: number;

  /** SERP patterns cache status */
  serpPatterns: CacheStatus;

  /** Number of available expert sources */
  expertCount: number;

  /** Number of available statistics */
  statisticCount: number;

  /** Number of available content patterns */
  patternCount: number;

  /** Overall cache completeness (0.0-1.0) */
  overallCompleteness: number;
}

/**
 * Unified research context for an entire content cluster
 */
export interface ClusterResearchContext {
  /** Cluster identifier */
  clusterId: string;

  /** Primary topic/keyword for the cluster */
  primaryTopic: string;

  /** Niche category */
  niche: string;

  /** Cached keyword research (if available) */
  keywordResearch?: CachedKeywordResearch;

  /** Cached competitor intelligence (per domain) */
  competitorIntelligence: CachedCompetitorIntelligence[];

  /** Cached SERP patterns */
  serpPatterns?: CachedSERPPatterns;

  /** Available expert sources */
  expertSources: ExpertSourceEntry[];

  /** Available statistics */
  statistics: StatisticEntry[];

  /** Available content patterns */
  contentPatterns: ContentPatternEntry[];

  /** Research gaps that need filling */
  researchGaps: ResearchGap[];

  /** Cache status summary */
  cacheStatus: CacheStatusSummary;

  /** Estimated research savings */
  estimatedSavings: EstimatedSavings;
}

/**
 * Query parameters for building cluster context
 */
export interface ClusterContextQuery {
  /** Cluster identifier */
  clusterId: string;

  /** Primary topic/keyword */
  primaryTopic: string;

  /** Niche category */
  niche: string;

  /** Parent niche for cross-niche queries */
  parentNiche?: string;

  /** Competitor domains to check */
  competitorDomains?: string[];

  /** Additional keywords to search for (related to primary) */
  relatedKeywords?: string[];

  /** Include cross-niche intelligence */
  includeCrossNiche?: boolean;
}

/**
 * Configuration for ClusterResearchContextBuilder
 */
export interface ClusterContextBuilderConfig {
  /** SEO Query Manager */
  seoQueryManager: SEOQueryManager;

  /** Minimum freshness score to consider "fresh" (default: 0.3) */
  freshnessThreshold?: number;

  /** Maximum experts to load per cluster (default: 20) */
  maxExperts?: number;

  /** Maximum statistics to load per cluster (default: 30) */
  maxStatistics?: number;

  /** Maximum patterns to load per cluster (default: 15) */
  maxPatterns?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

// =============================================
// Helper Functions
// =============================================

/**
 * Calculate cache status based on freshness score
 */
function getCacheStatus(freshnessScore: number, threshold: number): CacheStatus {
  if (freshnessScore === 0) return 'missing';
  if (freshnessScore >= threshold) return 'fresh';
  return 'stale';
}

/**
 * Calculate freshness score from timestamp
 * Returns 1.0 for brand new, decaying over time
 */
function calculateFreshness(timestamp: Date, maxAgeMonths: number): number {
  const now = Date.now();
  const age = now - timestamp.getTime();
  const maxAge = maxAgeMonths * 30 * 24 * 60 * 60 * 1000; // months to ms

  if (age <= 0) return 1.0;
  if (age >= maxAge) return 0.0;

  // Linear decay
  return 1.0 - age / maxAge;
}

/**
 * Identify research gaps based on cluster context
 */
function identifyGaps(context: ClusterResearchContext): ResearchGap[] {
  const gaps: ResearchGap[] = [];

  // Check keyword research
  if (context.cacheStatus.keywordResearch === 'missing') {
    gaps.push({
      type: 'keyword',
      description: 'Keyword research is completely missing',
      priority: 'high',
      estimatedCost: 5.0,
    });
  } else if (context.cacheStatus.keywordResearch === 'stale') {
    gaps.push({
      type: 'keyword',
      description: 'Keyword research is stale and needs refresh',
      priority: 'medium',
      estimatedCost: 3.0,
    });
  }

  // Check competitor intelligence
  const competitorCount = context.cacheStatus.competitorCount;
  if (competitorCount === 0) {
    gaps.push({
      type: 'competitor',
      description: 'No competitor analyses cached',
      priority: 'high',
      estimatedCost: 15.0,
    });
  } else if (competitorCount < 3) {
    gaps.push({
      type: 'competitor',
      description: `Only ${competitorCount} competitor analyses cached (3+ recommended)`,
      priority: 'medium',
      estimatedCost: (3 - competitorCount) * 5.0,
    });
  }

  // Check SERP patterns
  if (context.cacheStatus.serpPatterns === 'missing') {
    gaps.push({
      type: 'serp',
      description: 'SERP pattern analysis is missing',
      priority: 'high',
      estimatedCost: 10.0,
    });
  } else if (context.cacheStatus.serpPatterns === 'stale') {
    gaps.push({
      type: 'serp',
      description: 'SERP patterns are stale (SERP changes frequently)',
      priority: 'high',
      estimatedCost: 8.0,
    });
  }

  // Check expert sources
  if (context.cacheStatus.expertCount === 0) {
    gaps.push({
      type: 'expert',
      description: 'No expert sources found for this niche',
      priority: 'medium',
      estimatedCost: 7.0,
    });
  } else if (context.cacheStatus.expertCount < 3) {
    gaps.push({
      type: 'expert',
      description: `Only ${context.cacheStatus.expertCount} expert sources (5+ recommended)`,
      priority: 'low',
      estimatedCost: 3.0,
    });
  }

  // Check statistics
  if (context.cacheStatus.statisticCount === 0) {
    gaps.push({
      type: 'statistic',
      description: 'No statistics found for this niche',
      priority: 'medium',
      estimatedCost: 5.0,
    });
  } else if (context.cacheStatus.statisticCount < 5) {
    gaps.push({
      type: 'statistic',
      description: `Only ${context.cacheStatus.statisticCount} statistics (10+ recommended)`,
      priority: 'low',
      estimatedCost: 2.0,
    });
  }

  // Check content patterns
  if (context.cacheStatus.patternCount === 0) {
    gaps.push({
      type: 'pattern',
      description: 'No content patterns available for this niche',
      priority: 'low',
      estimatedCost: 0.0, // Patterns come from learning, no direct cost
    });
  }

  return gaps;
}

/**
 * Calculate estimated savings from cache hits
 */
function calculateSavings(context: ClusterResearchContext): EstimatedSavings {
  let apiCallsSaved = 0;
  let timeSavedMinutes = 0;
  let costSavedUSD = 0;

  // Keyword research savings
  if (context.cacheStatus.keywordResearch === 'fresh') {
    apiCallsSaved += 10; // ~10 API calls for keyword research
    timeSavedMinutes += 15; // ~15 minutes of analysis
    costSavedUSD += 5.0; // ~$5 in API costs
  } else if (context.cacheStatus.keywordResearch === 'stale') {
    // Partial savings (can reuse some data)
    apiCallsSaved += 5;
    timeSavedMinutes += 8;
    costSavedUSD += 2.5;
  }

  // Competitor intelligence savings
  const freshCompetitors = context.competitorIntelligence.filter(
    (c) => c.cacheStatus === 'fresh'
  ).length;
  const staleCompetitors = context.competitorIntelligence.filter(
    (c) => c.cacheStatus === 'stale'
  ).length;

  apiCallsSaved += freshCompetitors * 5; // ~5 API calls per competitor
  timeSavedMinutes += freshCompetitors * 10; // ~10 minutes per competitor
  costSavedUSD += freshCompetitors * 3.0; // ~$3 per competitor

  apiCallsSaved += staleCompetitors * 2; // Partial savings
  timeSavedMinutes += staleCompetitors * 5;
  costSavedUSD += staleCompetitors * 1.5;

  // SERP patterns savings
  if (context.cacheStatus.serpPatterns === 'fresh') {
    apiCallsSaved += 20; // ~20 API calls for SERP analysis
    timeSavedMinutes += 20; // ~20 minutes of analysis
    costSavedUSD += 10.0; // ~$10 in API costs
  } else if (context.cacheStatus.serpPatterns === 'stale') {
    apiCallsSaved += 10;
    timeSavedMinutes += 10;
    costSavedUSD += 5.0;
  }

  // Expert sources savings (no direct API cost, but research time)
  const expertCount = context.cacheStatus.expertCount;
  if (expertCount > 0) {
    timeSavedMinutes += Math.min(expertCount * 5, 30); // Up to 30 minutes saved
    costSavedUSD += Math.min(expertCount * 1.0, 10.0); // Manual research time cost
  }

  // Statistics savings (no direct API cost, but research time)
  const statisticCount = context.cacheStatus.statisticCount;
  if (statisticCount > 0) {
    timeSavedMinutes += Math.min(statisticCount * 3, 20); // Up to 20 minutes saved
    costSavedUSD += Math.min(statisticCount * 0.5, 5.0); // Manual research time cost
  }

  // Content patterns savings (learning-based, no direct cost but strategic value)
  const patternCount = context.cacheStatus.patternCount;
  if (patternCount > 0) {
    timeSavedMinutes += Math.min(patternCount * 2, 15); // Up to 15 minutes saved
  }

  return {
    apiCallsSaved,
    timeSavedMinutes,
    costSavedUSD: Math.round(costSavedUSD * 100) / 100, // Round to 2 decimals
  };
}

/**
 * Calculate overall cache completeness (0.0-1.0)
 */
function calculateCompleteness(status: CacheStatusSummary): number {
  let score = 0;
  let weight = 0;

  // Keyword research (weight: 20%)
  if (status.keywordResearch === 'fresh') score += 20;
  else if (status.keywordResearch === 'stale') score += 10;
  weight += 20;

  // Competitor intelligence (weight: 25%)
  const competitorScore = Math.min(status.competitorCount / 3, 1.0) * 25;
  score += competitorScore;
  weight += 25;

  // SERP patterns (weight: 20%)
  if (status.serpPatterns === 'fresh') score += 20;
  else if (status.serpPatterns === 'stale') score += 10;
  weight += 20;

  // Expert sources (weight: 15%)
  const expertScore = Math.min(status.expertCount / 5, 1.0) * 15;
  score += expertScore;
  weight += 15;

  // Statistics (weight: 15%)
  const statisticScore = Math.min(status.statisticCount / 10, 1.0) * 15;
  score += statisticScore;
  weight += 15;

  // Content patterns (weight: 5%)
  const patternScore = Math.min(status.patternCount / 5, 1.0) * 5;
  score += patternScore;
  weight += 5;

  return weight > 0 ? Math.round((score / weight) * 100) / 100 : 0;
}

// =============================================
// Main Class
// =============================================

/**
 * Cluster Research Context Builder
 *
 * Queries all 6 RuVector collections to build a unified research context
 * for an entire content cluster.
 */
export class ClusterResearchContextBuilder {
  private seoQueryManager: SEOQueryManager;
  private freshnessThreshold: number;
  private maxExperts: number;
  private maxStatistics: number;
  private maxPatterns: number;
  private verbose: boolean;

  constructor(config: ClusterContextBuilderConfig) {
    this.seoQueryManager = config.seoQueryManager;
    this.freshnessThreshold = config.freshnessThreshold ?? 0.3;
    this.maxExperts = config.maxExperts ?? 20;
    this.maxStatistics = config.maxStatistics ?? 30;
    this.maxPatterns = config.maxPatterns ?? 15;
    this.verbose = config.verbose ?? false;
  }

  /**
   * Build complete research context for a cluster
   */
  async buildContext(query: ClusterContextQuery): Promise<ClusterResearchContext> {
    this.log(`Building cluster research context for: ${query.clusterId}`);
    this.log(`Primary topic: ${query.primaryTopic}`);
    this.log(`Niche: ${query.niche}`);

    // Initialize context
    const context: ClusterResearchContext = {
      clusterId: query.clusterId,
      primaryTopic: query.primaryTopic,
      niche: query.niche,
      competitorIntelligence: [],
      expertSources: [],
      statistics: [],
      contentPatterns: [],
      researchGaps: [],
      cacheStatus: {
        keywordResearch: 'missing',
        competitorCount: 0,
        serpPatterns: 'missing',
        expertCount: 0,
        statisticCount: 0,
        patternCount: 0,
        overallCompleteness: 0,
      },
      estimatedSavings: {
        apiCallsSaved: 0,
        timeSavedMinutes: 0,
        costSavedUSD: 0,
      },
    };

    // Query all collections in parallel
    const [
      keywordResearch,
      competitorIntelligence,
      serpPatterns,
      expertSources,
      statistics,
      contentPatterns,
    ] = await Promise.all([
      this.queryKeywordResearch(query),
      this.queryCompetitorIntelligence(query),
      this.querySERPPatterns(query),
      this.queryExpertSources(query),
      this.queryStatistics(query),
      this.queryContentPatterns(query),
    ]);

    // Populate context
    context.keywordResearch = keywordResearch ?? undefined;
    context.competitorIntelligence = competitorIntelligence;
    context.serpPatterns = serpPatterns ?? undefined;
    context.expertSources = expertSources;
    context.statistics = statistics;
    context.contentPatterns = contentPatterns;

    // Update cache status
    context.cacheStatus = {
      keywordResearch: keywordResearch?.cacheStatus ?? 'missing',
      competitorCount: competitorIntelligence.length,
      serpPatterns: serpPatterns?.cacheStatus ?? 'missing',
      expertCount: expertSources.length,
      statisticCount: statistics.length,
      patternCount: contentPatterns.length,
      overallCompleteness: 0, // Calculated below
    };

    context.cacheStatus.overallCompleteness = calculateCompleteness(context.cacheStatus);

    // Identify research gaps
    context.researchGaps = identifyGaps(context);

    // Calculate savings
    context.estimatedSavings = calculateSavings(context);

    this.log(`Context built successfully`);
    this.log(`Cache completeness: ${(context.cacheStatus.overallCompleteness * 100).toFixed(1)}%`);
    this.log(`Estimated savings: $${context.estimatedSavings.costSavedUSD.toFixed(2)}`);
    this.log(`Research gaps: ${context.researchGaps.length}`);

    return context;
  }

  /**
   * Check if cluster has sufficient cached research
   * Returns completeness score (0.0-1.0)
   */
  async checkCacheCompleteness(clusterId: string, niche: string): Promise<number> {
    const query: ClusterContextQuery = {
      clusterId,
      primaryTopic: '', // Not needed for completeness check
      niche,
    };

    const context = await this.buildContext(query);
    return context.cacheStatus.overallCompleteness;
  }

  /**
   * Get research gaps for a cluster
   */
  async getResearchGaps(clusterId: string, niche: string): Promise<ResearchGap[]> {
    const query: ClusterContextQuery = {
      clusterId,
      primaryTopic: '', // Not needed for gap analysis
      niche,
    };

    const context = await this.buildContext(query);
    return context.researchGaps;
  }

  // =============================================
  // Private Query Methods
  // =============================================

  /**
   * Query keyword research collection
   */
  private async queryKeywordResearch(
    query: ClusterContextQuery
  ): Promise<CachedKeywordResearch | null> {
    try {
      this.log(`Querying keyword research for: ${query.primaryTopic}`);

      // Use SEOQueryManager to check for cached keyword research
      const preResearch = await this.seoQueryManager.preResearchQuery({
        keyword: query.primaryTopic,
        niche: query.niche,
        clusterId: query.clusterId,
        freshnessThreshold: this.freshnessThreshold,
      });

      if (!preResearch.keywordResearch) {
        this.log(`No keyword research found`);
        return null;
      }

      const data = preResearch.keywordResearch;
      const freshness = calculateFreshness(new Date(data.metadata.createdAt), 3); // 3-month TTL
      const cacheStatus = getCacheStatus(freshness, this.freshnessThreshold);

      this.log(`Keyword research found (${cacheStatus}, freshness: ${freshness.toFixed(2)})`);

      return {
        data,
        freshness,
        cacheStatus,
      };
    } catch (error) {
      this.log(`Error querying keyword research: ${error}`);
      return null;
    }
  }

  /**
   * Query competitor intelligence collection
   */
  private async queryCompetitorIntelligence(
    query: ClusterContextQuery
  ): Promise<CachedCompetitorIntelligence[]> {
    try {
      this.log(`Querying competitor intelligence for: ${query.niche}`);

      const preResearch = await this.seoQueryManager.preResearchQuery({
        keyword: query.primaryTopic,
        niche: query.niche,
        competitorDomains: query.competitorDomains,
        clusterId: query.clusterId,
        freshnessThreshold: this.freshnessThreshold,
      });

      const results: CachedCompetitorIntelligence[] = [];

      for (const competitor of preResearch.competitorIntelligence) {
        const freshness = calculateFreshness(new Date(competitor.metadata.createdAt), 6); // 6-month TTL
        const cacheStatus = getCacheStatus(freshness, this.freshnessThreshold);

        results.push({
          domain: competitor.metadata.domain,
          data: competitor,
          freshness,
          cacheStatus,
        });
      }

      this.log(`Found ${results.length} competitor analyses`);

      return results;
    } catch (error) {
      this.log(`Error querying competitor intelligence: ${error}`);
      return [];
    }
  }

  /**
   * Query SERP patterns collection
   */
  private async querySERPPatterns(query: ClusterContextQuery): Promise<CachedSERPPatterns | null> {
    try {
      this.log(`Querying SERP patterns for: ${query.primaryTopic}`);

      const preResearch = await this.seoQueryManager.preResearchQuery({
        keyword: query.primaryTopic,
        niche: query.niche,
        clusterId: query.clusterId,
        freshnessThreshold: this.freshnessThreshold,
      });

      if (!preResearch.serpPatterns) {
        this.log(`No SERP patterns found`);
        return null;
      }

      const data = preResearch.serpPatterns;
      const freshness = calculateFreshness(new Date(data.metadata.capturedAt), 0.5); // 2-week TTL
      const cacheStatus = getCacheStatus(freshness, this.freshnessThreshold);

      this.log(`SERP patterns found (${cacheStatus}, freshness: ${freshness.toFixed(2)})`);

      return {
        data,
        freshness,
        cacheStatus,
      };
    } catch (error) {
      this.log(`Error querying SERP patterns: ${error}`);
      return null;
    }
  }

  /**
   * Query expert sources collection (semantic search by niche)
   */
  private async queryExpertSources(query: ClusterContextQuery): Promise<ExpertSourceEntry[]> {
    try {
      this.log(`Querying expert sources for niche: ${query.niche}`);

      const preResearch = await this.seoQueryManager.preResearchQuery({
        keyword: query.primaryTopic,
        niche: query.niche,
        clusterId: query.clusterId,
        freshnessThreshold: this.freshnessThreshold,
      });

      const results = preResearch.expertSources.slice(0, this.maxExperts);

      this.log(`Found ${results.length} expert sources`);

      return results;
    } catch (error) {
      this.log(`Error querying expert sources: ${error}`);
      return [];
    }
  }

  /**
   * Query statistics collection (semantic search by niche)
   */
  private async queryStatistics(query: ClusterContextQuery): Promise<StatisticEntry[]> {
    try {
      this.log(`Querying statistics for niche: ${query.niche}`);

      const preResearch = await this.seoQueryManager.preResearchQuery({
        keyword: query.primaryTopic,
        niche: query.niche,
        clusterId: query.clusterId,
        freshnessThreshold: this.freshnessThreshold,
      });

      const results = preResearch.statistics.slice(0, this.maxStatistics);

      this.log(`Found ${results.length} statistics`);

      return results;
    } catch (error) {
      this.log(`Error querying statistics: ${error}`);
      return [];
    }
  }

  /**
   * Query content patterns collection
   */
  private async queryContentPatterns(query: ClusterContextQuery): Promise<ContentPatternEntry[]> {
    try {
      this.log(`Querying content patterns for niche: ${query.niche}`);

      const preResearch = await this.seoQueryManager.preResearchQuery({
        keyword: query.primaryTopic,
        niche: query.niche,
        clusterId: query.clusterId,
        freshnessThreshold: this.freshnessThreshold,
      });

      const results = preResearch.contentPatterns.slice(0, this.maxPatterns);

      this.log(`Found ${results.length} content patterns`);

      return results;
    } catch (error) {
      this.log(`Error querying content patterns: ${error}`);
      return [];
    }
  }

  /**
   * Log message (if verbose enabled)
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(`[ClusterResearchContextBuilder] ${message}`);
    }
  }
}
