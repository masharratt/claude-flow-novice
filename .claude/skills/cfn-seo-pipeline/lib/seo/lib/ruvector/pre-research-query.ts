/**
 * Pre-Research Intelligence Gatherer
 *
 * Performs comprehensive intelligence gathering before research steps to determine:
 * - What research can be skipped (cached and fresh)
 * - What cached data is available (even if stale)
 * - What research is needed
 * - Estimated cost/time savings
 *
 * This implements Step 0.5 (Pre-Research Cache Check) in the SEO pipeline.
 *
 * @module seo/lib/ruvector/pre-research-query
 */

import type { SEOQueryManager } from './queries';
import type {
  KeywordResearchEntry,
  CompetitorIntelligenceEntry,
  SERPPatternEntry,
  ExpertSourceEntry,
  StatisticEntry,
  ContentPatternEntry,
} from './schemas';

/**
 * Cache status for a collection
 */
export type CacheStatus = 'fresh' | 'stale' | 'missing';

/**
 * Pre-research query request
 */
export interface PreResearchQuery {
  /** Target keyword */
  keyword: string;

  /** Niche/topic area */
  niche: string;

  /** Optional cluster ID for cluster-wide intelligence */
  clusterId?: string;

  /** Competitor domains to check (optional) */
  competitorDomains?: string[];

  /** Freshness threshold (default 0.3 = 70% through TTL) */
  freshnessThreshold?: number;

  /** Minimum expert count to consider cache useful */
  minExpertCount?: number;

  /** Minimum statistic count to consider cache useful */
  minStatisticCount?: number;

  /** Minimum pattern count to consider cache useful */
  minPatternCount?: number;
}

/**
 * Research needs flags
 */
export interface ResearchNeeded {
  /** Need to perform keyword research */
  keywordResearch: boolean;

  /** Need to perform competitor analysis */
  competitorAnalysis: boolean;

  /** Need to perform SERP analysis */
  serpAnalysis: boolean;

  /** Need to find more expert sources */
  expertSources: boolean;

  /** Need to find more statistics */
  statistics: boolean;

  /** Need to extract more patterns */
  patterns: boolean;
}

/**
 * Combined cached intelligence data
 */
export interface CachedIntelligence {
  /** Cached keyword research (may be stale) */
  keywordResearch?: KeywordResearchEntry;

  /** Cached competitor intelligence (may be stale) */
  competitorIntelligence: CompetitorIntelligenceEntry[];

  /** Cached SERP patterns (may be stale) */
  serpPatterns?: SERPPatternEntry;

  /** Available expert sources */
  expertSources: ExpertSourceEntry[];

  /** Available statistics */
  statistics: StatisticEntry[];

  /** Available content patterns */
  contentPatterns: ContentPatternEntry[];
}

/**
 * Pre-research intelligence result
 */
export interface PreResearchResult {
  /** Target keyword */
  keyword: string;

  /** Niche/topic area */
  niche: string;

  /** Cluster ID if provided */
  clusterId?: string;

  /** Cache status for each collection */
  cacheStatus: {
    keywordResearch: CacheStatus;
    competitorIntelligence: CacheStatus;
    serpPatterns: CacheStatus;
    expertSources: CacheStatus;
    statistics: CacheStatus;
    contentPatterns: CacheStatus;
  };

  /** Flags indicating what research is needed */
  researchNeeded: ResearchNeeded;

  /** Combined cached data from all collections */
  cachedData: CachedIntelligence;

  /** Estimated cost and time savings */
  estimatedSavings: string;

  /** Detailed breakdown of what can be skipped */
  summary: {
    stepsToSkip: string[];
    stepsRequired: string[];
    confidenceLevel: 'high' | 'medium' | 'low';
  };
}

/**
 * Cost estimates per research step (in USD)
 */
const RESEARCH_STEP_COSTS = {
  keywordResearch: 5, // API calls to keyword tools
  competitorAnalysis: 10, // Crawling + analysis
  serpAnalysis: 3, // SERP API calls
} as const;

/**
 * Time estimates per research step (in minutes)
 */
const RESEARCH_STEP_TIME = {
  keywordResearch: 15,
  competitorAnalysis: 30,
  serpAnalysis: 10,
} as const;

/**
 * Pre-Research Intelligence Gatherer
 *
 * Queries all SEO RuVector collections to determine what research can be skipped
 * and what cached intelligence is available.
 */
export class PreResearchIntelligenceGatherer {
  constructor(private queryManager: SEOQueryManager) {}

  /**
   * Gather intelligence before research steps
   *
   * @param query - Pre-research query parameters
   * @returns Comprehensive intelligence about cached data and research needs
   */
  async gatherIntelligence(query: PreResearchQuery): Promise<PreResearchResult> {
    const freshnessThreshold = query.freshnessThreshold ?? 0.3;
    const minExpertCount = query.minExpertCount ?? 3;
    const minStatisticCount = query.minStatisticCount ?? 5;
    const minPatternCount = query.minPatternCount ?? 3;

    // Query all collections in parallel
    const [
      keywordResearchStatus,
      competitorIntelligenceStatus,
      serpPatternStatus,
      expertSourcesData,
      statisticsData,
      contentPatternsData,
    ] = await Promise.all([
      this.checkKeywordResearchCache(query.keyword, freshnessThreshold),
      this.checkCompetitorIntelligenceCache(
        query.niche,
        query.competitorDomains,
        freshnessThreshold
      ),
      this.checkSERPPatternCache(query.keyword, freshnessThreshold),
      this.getExpertSources(query.keyword, query.niche, minExpertCount),
      this.getStatistics(query.keyword, query.niche, minStatisticCount),
      this.getContentPatterns(query.keyword, query.niche, minPatternCount),
    ]);

    // Determine cache status for each collection
    const cacheStatus = {
      keywordResearch: keywordResearchStatus.status,
      competitorIntelligence: competitorIntelligenceStatus.status,
      serpPatterns: serpPatternStatus.status,
      expertSources: expertSourcesData.status,
      statistics: statisticsData.status,
      contentPatterns: contentPatternsData.status,
    };

    // Determine what research is needed
    const researchNeeded: ResearchNeeded = {
      keywordResearch: cacheStatus.keywordResearch !== 'fresh',
      competitorAnalysis: cacheStatus.competitorIntelligence !== 'fresh',
      serpAnalysis: cacheStatus.serpPatterns !== 'fresh',
      expertSources: cacheStatus.expertSources === 'missing',
      statistics: cacheStatus.statistics === 'missing',
      patterns: cacheStatus.contentPatterns === 'missing',
    };

    // Combine cached data
    const cachedData: CachedIntelligence = {
      keywordResearch: keywordResearchStatus.data,
      competitorIntelligence: competitorIntelligenceStatus.data,
      serpPatterns: serpPatternStatus.data,
      expertSources: expertSourcesData.data,
      statistics: statisticsData.data,
      contentPatterns: contentPatternsData.data,
    };

    // Calculate savings
    const { estimatedSavings, stepsToSkip, stepsRequired, confidenceLevel } =
      this.calculateSavingsAndSteps(researchNeeded, cacheStatus);

    return {
      keyword: query.keyword,
      niche: query.niche,
      clusterId: query.clusterId,
      cacheStatus,
      researchNeeded,
      cachedData,
      estimatedSavings,
      summary: {
        stepsToSkip,
        stepsRequired,
        confidenceLevel,
      },
    };
  }

  /**
   * Check keyword research cache status
   */
  private async checkKeywordResearchCache(
    keyword: string,
    freshnessThreshold: number
  ): Promise<{ status: CacheStatus; data?: KeywordResearchEntry }> {
    const collections = this.queryManager.getCollections();

    const hasFresh = await collections.keywordResearch.hasFreshResearch(
      keyword,
      freshnessThreshold
    );

    if (hasFresh) {
      const data = await collections.keywordResearch.getByKeyword(keyword);
      return { status: 'fresh', data: data ?? undefined };
    }

    // Check for stale data
    const staleData = await collections.keywordResearch.getByKeyword(keyword);
    if (staleData) {
      return { status: 'stale', data: staleData };
    }

    return { status: 'missing' };
  }

  /**
   * Check competitor intelligence cache status
   */
  private async checkCompetitorIntelligenceCache(
    niche: string,
    competitorDomains: string[] | undefined,
    freshnessThreshold: number
  ): Promise<{ status: CacheStatus; data: CompetitorIntelligenceEntry[] }> {
    const collections = this.queryManager.getCollections();
    const cachedIntel: CompetitorIntelligenceEntry[] = [];
    let allFresh = true;
    let anyData = false;

    if (competitorDomains && competitorDomains.length > 0) {
      // Check specific competitors
      for (const domain of competitorDomains) {
        const hasFresh = await collections.competitorIntelligence.hasFreshIntelligence(
          domain,
          niche,
          freshnessThreshold
        );

        const data = await collections.competitorIntelligence.getByDomainAndNiche(domain, niche);
        if (data) {
          cachedIntel.push(data);
          anyData = true;
          if (!hasFresh) allFresh = false;
        } else {
          allFresh = false;
        }
      }
    } else {
      // Get any intelligence for the niche
      const nicheIntel = await collections.competitorIntelligence.getByNiche(niche);
      if (nicheIntel.length > 0) {
        cachedIntel.push(...nicheIntel);
        anyData = true;
        // Check if all are fresh
        for (const intel of nicheIntel) {
          if (intel.metadata.freshnessScore < freshnessThreshold) {
            allFresh = false;
          }
        }
      } else {
        allFresh = false;
      }
    }

    if (!anyData) {
      return { status: 'missing', data: [] };
    }

    return {
      status: allFresh ? 'fresh' : 'stale',
      data: cachedIntel,
    };
  }

  /**
   * Check SERP pattern cache status
   */
  private async checkSERPPatternCache(
    keyword: string,
    freshnessThreshold: number
  ): Promise<{ status: CacheStatus; data?: SERPPatternEntry }> {
    const collections = this.queryManager.getCollections();

    const hasFresh = await collections.serpPatterns.hasFreshPattern(keyword, freshnessThreshold);

    if (hasFresh) {
      const data = await collections.serpPatterns.getLatestForKeyword(keyword);
      return { status: 'fresh', data: data ?? undefined };
    }

    // Check for stale data
    const staleData = await collections.serpPatterns.getLatestForKeyword(keyword);
    if (staleData) {
      return { status: 'stale', data: staleData };
    }

    return { status: 'missing' };
  }

  /**
   * Get expert sources
   */
  private async getExpertSources(
    keyword: string,
    niche: string,
    minCount: number
  ): Promise<{ status: CacheStatus; data: ExpertSourceEntry[] }> {
    const collections = this.queryManager.getCollections();

    const results = await collections.expertSources.search(keyword, {
      niche,
      includeCrossNiche: true,
      minAuthorityScore: 0.5,
      limit: 10,
    });

    const experts = results.map((r) => r.entry);

    if (experts.length === 0) {
      return { status: 'missing', data: [] };
    }

    // Experts are evergreen, so if we have enough, they're fresh
    return {
      status: experts.length >= minCount ? 'fresh' : 'stale',
      data: experts,
    };
  }

  /**
   * Get statistics
   */
  private async getStatistics(
    keyword: string,
    niche: string,
    minCount: number
  ): Promise<{ status: CacheStatus; data: StatisticEntry[] }> {
    const collections = this.queryManager.getCollections();

    const results = await collections.statistics.search(keyword, {
      niche,
      includeCrossNiche: true,
      excludeStale: true, // Only get fresh statistics
      minCredibilityScore: 0.6,
      limit: 15,
    });

    const stats = results.map((r) => r.entry);

    if (stats.length === 0) {
      return { status: 'missing', data: [] };
    }

    return {
      status: stats.length >= minCount ? 'fresh' : 'stale',
      data: stats,
    };
  }

  /**
   * Get content patterns
   */
  private async getContentPatterns(
    keyword: string,
    niche: string,
    minCount: number
  ): Promise<{ status: CacheStatus; data: ContentPatternEntry[] }> {
    const collections = this.queryManager.getCollections();

    const results = await collections.contentPatterns.search(keyword, {
      niche,
      minConfidenceScore: 0.5,
      limit: 10,
    });

    const patterns = results.map((r) => r.entry);

    if (patterns.length === 0) {
      return { status: 'missing', data: [] };
    }

    // Patterns are evergreen, so if we have enough, they're fresh
    return {
      status: patterns.length >= minCount ? 'fresh' : 'stale',
      data: patterns,
    };
  }

  /**
   * Calculate estimated savings and determine steps to skip/require
   */
  private calculateSavingsAndSteps(
    researchNeeded: ResearchNeeded,
    cacheStatus: PreResearchResult['cacheStatus']
  ): {
    estimatedSavings: string;
    stepsToSkip: string[];
    stepsRequired: string[];
    confidenceLevel: 'high' | 'medium' | 'low';
  } {
    const stepsToSkip: string[] = [];
    const stepsRequired: string[] = [];
    let totalCostSaved = 0;
    let totalTimeSaved = 0;
    let freshCount = 0;
    let totalCount = 0;

    // Keyword Research
    totalCount++;
    if (!researchNeeded.keywordResearch) {
      stepsToSkip.push('Step 1 (Keyword Research)');
      totalCostSaved += RESEARCH_STEP_COSTS.keywordResearch;
      totalTimeSaved += RESEARCH_STEP_TIME.keywordResearch;
      if (cacheStatus.keywordResearch === 'fresh') freshCount++;
    } else {
      stepsRequired.push('Step 1 (Keyword Research)');
    }

    // Competitor Analysis
    totalCount++;
    if (!researchNeeded.competitorAnalysis) {
      stepsToSkip.push('Step 2.5 (Competitor Analysis)');
      totalCostSaved += RESEARCH_STEP_COSTS.competitorAnalysis;
      totalTimeSaved += RESEARCH_STEP_TIME.competitorAnalysis;
      if (cacheStatus.competitorIntelligence === 'fresh') freshCount++;
    } else {
      stepsRequired.push('Step 2.5 (Competitor Analysis)');
    }

    // SERP Analysis
    totalCount++;
    if (!researchNeeded.serpAnalysis) {
      stepsToSkip.push('Step 3.5 (SERP Analysis)');
      totalCostSaved += RESEARCH_STEP_COSTS.serpAnalysis;
      totalTimeSaved += RESEARCH_STEP_TIME.serpAnalysis;
      if (cacheStatus.serpPatterns === 'fresh') freshCount++;
    } else {
      stepsRequired.push('Step 3.5 (SERP Analysis)');
    }

    // Determine confidence level based on freshness ratio
    const freshnessRatio = totalCount > 0 ? freshCount / totalCount : 0;
    let confidenceLevel: 'high' | 'medium' | 'low';
    if (freshnessRatio >= 0.75) {
      confidenceLevel = 'high';
    } else if (freshnessRatio >= 0.5) {
      confidenceLevel = 'medium';
    } else {
      confidenceLevel = 'low';
    }

    // Format savings
    const percentTimeSaved = stepsToSkip.length > 0
      ? Math.round((totalTimeSaved / (RESEARCH_STEP_TIME.keywordResearch + RESEARCH_STEP_TIME.competitorAnalysis + RESEARCH_STEP_TIME.serpAnalysis)) * 100)
      : 0;

    const estimatedSavings = totalCostSaved > 0
      ? `~$${totalCostSaved} and ~${percentTimeSaved}% time (${totalTimeSaved} min)`
      : 'No savings (all research required)';

    return {
      estimatedSavings,
      stepsToSkip,
      stepsRequired,
      confidenceLevel,
    };
  }

  /**
   * Get a human-readable summary of intelligence status
   */
  getSummaryText(result: PreResearchResult): string {
    const lines: string[] = [];

    lines.push(`Pre-Research Intelligence for "${result.keyword}" in ${result.niche}`);
    lines.push('');

    // Cache status summary
    lines.push('Cache Status:');
    lines.push(`  Keyword Research: ${result.cacheStatus.keywordResearch.toUpperCase()}`);
    lines.push(`  Competitor Intelligence: ${result.cacheStatus.competitorIntelligence.toUpperCase()}`);
    lines.push(`  SERP Patterns: ${result.cacheStatus.serpPatterns.toUpperCase()}`);
    lines.push(`  Expert Sources: ${result.cacheStatus.expertSources.toUpperCase()} (${result.cachedData.expertSources.length} available)`);
    lines.push(`  Statistics: ${result.cacheStatus.statistics.toUpperCase()} (${result.cachedData.statistics.length} available)`);
    lines.push(`  Content Patterns: ${result.cacheStatus.contentPatterns.toUpperCase()} (${result.cachedData.contentPatterns.length} available)`);
    lines.push('');

    // Steps summary
    if (result.summary.stepsToSkip.length > 0) {
      lines.push('Steps to Skip:');
      result.summary.stepsToSkip.forEach(step => lines.push(`  ✓ ${step}`));
      lines.push('');
    }

    if (result.summary.stepsRequired.length > 0) {
      lines.push('Steps Required:');
      result.summary.stepsRequired.forEach(step => lines.push(`  • ${step}`));
      lines.push('');
    }

    // Savings
    lines.push(`Estimated Savings: ${result.estimatedSavings}`);
    lines.push(`Confidence Level: ${result.summary.confidenceLevel.toUpperCase()}`);

    return lines.join('\n');
  }
}
