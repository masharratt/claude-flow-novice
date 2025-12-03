/**
 * SEO Intelligence Unified Query Utilities
 *
 * Provides unified query interface for all SEO RuVector collections.
 * Handles pre-research queries (Step 0.5) and content generation guidance.
 *
 * @module seo/lib/ruvector/queries
 */

import type { VectorDB } from '@ruvector/core';
import {
  SEO_COLLECTIONS,
  SEOCollectionName,
  ExpertSourceEntry,
  StatisticEntry,
  KeywordResearchEntry,
  CompetitorIntelligenceEntry,
  SERPPatternEntry,
  ContentPatternEntry,
  ContentPatternType,
  SearchIntent,
} from './schemas';
import { ExpertSourcesCollection } from './collections/expert-sources';
import { StatisticsCollection } from './collections/statistics';
import { KeywordResearchCollection } from './collections/keyword-research';
import { CompetitorIntelligenceCollection } from './collections/competitor-intelligence';
import { SERPPatternsCollection } from './collections/serp-patterns';
import { ContentPatternsCollection } from './collections/content-patterns';

/**
 * Pre-research query request (Step 0.5)
 */
export interface PreResearchQuery {
  /** Target keyword */
  keyword: string;

  /** Niche/topic area */
  niche: string;

  /** Competitor domains to check */
  competitorDomains?: string[];

  /** Optional cluster ID */
  clusterId?: string;

  /** Freshness threshold (default 0.3) */
  freshnessThreshold?: number;
}

/**
 * Pre-research query result
 */
export interface PreResearchResult {
  /** Whether to skip keyword research step */
  skipKeywordResearch: boolean;

  /** Cached keyword research if available */
  keywordResearch?: KeywordResearchEntry;

  /** Whether to skip competitor analysis step */
  skipCompetitorAnalysis: boolean;

  /** Cached competitor intelligence if available */
  competitorIntelligence: CompetitorIntelligenceEntry[];

  /** Whether to skip SERP analysis step */
  skipSERPAnalysis: boolean;

  /** Cached SERP patterns if available */
  serpPatterns?: SERPPatternEntry;

  /** Available expert sources for this topic */
  expertSources: ExpertSourceEntry[];

  /** Available statistics for this topic */
  statistics: StatisticEntry[];

  /** Content patterns to guide generation */
  contentPatterns: ContentPatternEntry[];

  /** Summary of what can be skipped */
  summary: {
    stepsToSkip: string[];
    estimatedSavings: string;
  };
}

/**
 * Content guidance query request
 */
export interface ContentGuidanceQuery {
  /** Target keyword */
  keyword: string;

  /** Niche/topic area */
  niche: string;

  /** Content format (how-to, listicle, etc.) */
  format?: string;

  /** Number of expert sources needed */
  expertCount?: number;

  /** Number of statistics needed */
  statisticCount?: number;

  /** Pattern types to retrieve */
  patternTypes?: ContentPatternType[];
}

/**
 * Content guidance result
 */
export interface ContentGuidanceResult {
  /** Expert sources to use */
  experts: ExpertSourceEntry[];

  /** Statistics to cite */
  statistics: StatisticEntry[];

  /** Angle patterns to consider */
  anglePatterns: ContentPatternEntry[];

  /** Structure patterns to follow */
  structurePatterns: ContentPatternEntry[];

  /** Voice patterns to adopt */
  voicePatterns: ContentPatternEntry[];

  /** Hook patterns to use */
  hookPatterns: ContentPatternEntry[];

  /** SERP-informed recommendations */
  serpRecommendations?: {
    targetWordCount: number;
    featuredSnippetOpportunity: boolean;
    topRankingFactors: string[];
  };
}

/**
 * Cross-niche query options
 */
export interface CrossNicheQueryOptions {
  /** Primary niche to search */
  primaryNiche: string;

  /** Whether to include parent niche */
  includeParent?: boolean;

  /** Whether to include sibling niches */
  includeSiblings?: boolean;

  /** Similarity threshold for cross-niche (stricter than same-niche) */
  crossNicheSimilarityThreshold?: number;
}

/**
 * Unified SEO Query Manager
 *
 * Provides high-level query operations for SEO intelligence data.
 */
export class SEOQueryManager {
  private expertSources: ExpertSourcesCollection;
  private statistics: StatisticsCollection;
  private keywordResearch: KeywordResearchCollection;
  private competitorIntelligence: CompetitorIntelligenceCollection;
  private serpPatterns: SERPPatternsCollection;
  private contentPatterns: ContentPatternsCollection;

  constructor(
    collections: Map<SEOCollectionName, VectorDB>,
    embeddingFn: (text: string) => Promise<Float32Array>
  ) {
    const getDb = (name: SEOCollectionName): VectorDB => {
      const db = collections.get(name);
      if (!db) throw new Error(`Collection ${name} not found`);
      return db;
    };

    this.expertSources = new ExpertSourcesCollection(
      getDb(SEO_COLLECTIONS.EXPERT_SOURCES),
      embeddingFn
    );
    this.statistics = new StatisticsCollection(getDb(SEO_COLLECTIONS.STATISTICS), embeddingFn);
    this.keywordResearch = new KeywordResearchCollection(
      getDb(SEO_COLLECTIONS.KEYWORD_RESEARCH),
      embeddingFn
    );
    this.competitorIntelligence = new CompetitorIntelligenceCollection(
      getDb(SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE),
      embeddingFn
    );
    this.serpPatterns = new SERPPatternsCollection(
      getDb(SEO_COLLECTIONS.SERP_PATTERNS),
      embeddingFn
    );
    this.contentPatterns = new ContentPatternsCollection(
      getDb(SEO_COLLECTIONS.CONTENT_PATTERNS),
      embeddingFn
    );
  }

  /**
   * Execute pre-research query (Step 0.5)
   *
   * Determines which research steps can be skipped based on cached data.
   */
  async preResearchQuery(query: PreResearchQuery): Promise<PreResearchResult> {
    const freshnessThreshold = query.freshnessThreshold ?? 0.3;
    const stepsToSkip: string[] = [];

    // Check keyword research cache
    const hasFreshKeywordResearch = await this.keywordResearch.hasFreshResearch(
      query.keyword,
      freshnessThreshold
    );
    let cachedKeywordResearch: KeywordResearchEntry | undefined;
    if (hasFreshKeywordResearch) {
      cachedKeywordResearch = (await this.keywordResearch.getByKeyword(query.keyword)) ?? undefined;
      stepsToSkip.push('Step 1 (Keyword Research)');
    }

    // Check competitor intelligence cache
    const cachedCompetitorIntelligence: CompetitorIntelligenceEntry[] = [];
    let skipCompetitorAnalysis = true;

    if (query.competitorDomains && query.competitorDomains.length > 0) {
      for (const domain of query.competitorDomains) {
        const hasFresh = await this.competitorIntelligence.hasFreshIntelligence(
          domain,
          query.niche,
          freshnessThreshold
        );
        if (hasFresh) {
          const cached = await this.competitorIntelligence.getByDomainAndNiche(domain, query.niche);
          if (cached) cachedCompetitorIntelligence.push(cached);
        } else {
          skipCompetitorAnalysis = false;
        }
      }
    } else {
      // No specific domains, check if we have any fresh intelligence for the niche
      const nicheIntelligence = await this.competitorIntelligence.getByNiche(query.niche);
      if (nicheIntelligence.length >= 3) {
        cachedCompetitorIntelligence.push(...nicheIntelligence);
      } else {
        skipCompetitorAnalysis = false;
      }
    }

    if (skipCompetitorAnalysis && cachedCompetitorIntelligence.length > 0) {
      stepsToSkip.push('Step 2.5 (Competitor Analysis)');
    }

    // Check SERP patterns cache
    const hasFreshSERP = await this.serpPatterns.hasFreshPattern(query.keyword, freshnessThreshold);
    let cachedSERPPatterns: SERPPatternEntry | undefined;
    if (hasFreshSERP) {
      cachedSERPPatterns = (await this.serpPatterns.getLatestForKeyword(query.keyword)) ?? undefined;
      stepsToSkip.push('Step 3.5 (SERP Analysis)');
    }

    // Get available expert sources (always available)
    const expertResults = await this.expertSources.search(query.keyword, {
      niche: query.niche,
      includeCrossNiche: true,
      limit: 10,
    });
    const availableExperts = expertResults.map((r) => r.entry);

    // Get available statistics (always available)
    const statResults = await this.statistics.search(query.keyword, {
      niche: query.niche,
      includeCrossNiche: true,
      excludeStale: true,
      limit: 10,
    });
    const availableStats = statResults.map((r) => r.entry);

    // Get relevant content patterns
    const patternResults = await this.contentPatterns.search(query.keyword, {
      niche: query.niche,
      minConfidenceScore: 0.5,
      limit: 10,
    });
    const availablePatterns = patternResults.map((r) => r.entry);

    // Calculate estimated savings
    const estimatedSavings = this.calculateSavings(stepsToSkip);

    return {
      skipKeywordResearch: hasFreshKeywordResearch,
      keywordResearch: cachedKeywordResearch,
      skipCompetitorAnalysis,
      competitorIntelligence: cachedCompetitorIntelligence,
      skipSERPAnalysis: hasFreshSERP,
      serpPatterns: cachedSERPPatterns,
      expertSources: availableExperts,
      statistics: availableStats,
      contentPatterns: availablePatterns,
      summary: {
        stepsToSkip,
        estimatedSavings,
      },
    };
  }

  /**
   * Get content guidance for article generation
   *
   * Provides experts, statistics, and patterns for content generation.
   */
  async getContentGuidance(query: ContentGuidanceQuery): Promise<ContentGuidanceResult> {
    const expertCount = query.expertCount ?? 3;
    const statisticCount = query.statisticCount ?? 5;

    // Get experts
    const expertResults = await this.expertSources.search(query.keyword, {
      niche: query.niche,
      includeCrossNiche: true,
      minAuthorityScore: 0.5,
      limit: expertCount,
    });

    // Get statistics
    const statResults = await this.statistics.search(query.keyword, {
      niche: query.niche,
      includeCrossNiche: true,
      excludeStale: true,
      minCredibilityScore: 0.6,
      limit: statisticCount,
    });

    // Get patterns by type
    const anglePatterns = await this.contentPatterns.getByType('ANGLE', {
      niche: query.niche,
      minConfidenceScore: 0.5,
    });

    const structurePatterns = await this.contentPatterns.getByType('STRUCTURE', {
      niche: query.niche,
      minConfidenceScore: 0.5,
    });

    const voicePatterns = await this.contentPatterns.getByType('VOICE', {
      niche: query.niche,
      minConfidenceScore: 0.5,
    });

    const hookPatterns = await this.contentPatterns.getByType('HOOK', {
      niche: query.niche,
      minConfidenceScore: 0.5,
    });

    // Get SERP recommendations if available
    let serpRecommendations: ContentGuidanceResult['serpRecommendations'];
    const serpPattern = await this.serpPatterns.getLatestForKeyword(query.keyword);
    if (serpPattern) {
      serpRecommendations = {
        targetWordCount: serpPattern.metadata.rankingPatterns.avgContentLength,
        featuredSnippetOpportunity: serpPattern.metadata.featuresOpportunity.some(
          (f) => f.type.toLowerCase() === 'featured_snippet'
        ),
        topRankingFactors: serpPattern.metadata.rankingPatterns.topFactors,
      };
    }

    return {
      experts: expertResults.map((r) => r.entry),
      statistics: statResults.map((r) => r.entry),
      anglePatterns: anglePatterns.slice(0, 3),
      structurePatterns: structurePatterns.slice(0, 3),
      voicePatterns: voicePatterns.slice(0, 3),
      hookPatterns: hookPatterns.slice(0, 3),
      serpRecommendations,
    };
  }

  /**
   * Get cluster-wide intelligence
   *
   * Retrieves all cached data for a content cluster.
   */
  async getClusterIntelligence(clusterId: string): Promise<{
    keywordResearch: KeywordResearchEntry[];
    competitorIntelligence: CompetitorIntelligenceEntry[];
    serpPatterns: SERPPatternEntry[];
    averageRankingPatterns: ReturnType<SERPPatternsCollection['getAverageRankingPatterns']>;
    contentGaps: Awaited<ReturnType<CompetitorIntelligenceCollection['getAggregatedContentGaps']>>;
  }> {
    const [kwResearch, compIntel, serp, avgRanking] = await Promise.all([
      this.keywordResearch.getByClusterId(clusterId),
      this.competitorIntelligence.getByClusterId(clusterId),
      this.serpPatterns.getByClusterId(clusterId),
      this.serpPatterns.getAverageRankingPatterns(clusterId),
    ]);

    // Get aggregated content gaps from the first competitor's niche
    let contentGaps: Awaited<ReturnType<CompetitorIntelligenceCollection['getAggregatedContentGaps']>> = [];
    if (compIntel.length > 0) {
      contentGaps = await this.competitorIntelligence.getAggregatedContentGaps(
        compIntel[0].metadata.niche
      );
    }

    return {
      keywordResearch: kwResearch,
      competitorIntelligence: compIntel,
      serpPatterns: serp,
      averageRankingPatterns: avgRanking,
      contentGaps,
    };
  }

  /**
   * Search across all collections for a topic
   *
   * Performs semantic search across all SEO intelligence collections.
   */
  async searchAll(
    query: string,
    options: {
      niche?: string;
      limit?: number;
    } = {}
  ): Promise<{
    experts: Array<{ entry: ExpertSourceEntry; similarity: number }>;
    statistics: Array<{ entry: StatisticEntry; similarity: number }>;
    keywordResearch: Array<{ entry: KeywordResearchEntry; similarity: number }>;
    competitorIntelligence: Array<{ entry: CompetitorIntelligenceEntry; similarity: number }>;
    serpPatterns: Array<{ entry: SERPPatternEntry; similarity: number }>;
    contentPatterns: Array<{ entry: ContentPatternEntry; similarity: number }>;
  }> {
    const limit = options.limit ?? 5;

    const [experts, statistics, kwResearch, compIntel, serp, patterns] = await Promise.all([
      this.expertSources.search(query, { niche: options.niche, limit }),
      this.statistics.search(query, { niche: options.niche, limit }),
      this.keywordResearch.search(query, { niche: options.niche, limit }),
      this.competitorIntelligence.search(query, { niche: options.niche, limit }),
      this.serpPatterns.search(query, { limit }),
      this.contentPatterns.search(query, { niche: options.niche, limit }),
    ]);

    return {
      experts,
      statistics,
      keywordResearch: kwResearch,
      competitorIntelligence: compIntel,
      serpPatterns: serp,
      contentPatterns: patterns,
    };
  }

  /**
   * Get featured snippet opportunities
   */
  async getFeaturedSnippetOpportunities(
    clusterId?: string
  ): Promise<Array<{ keyword: string; reason: string }>> {
    return this.serpPatterns.getFeaturedSnippetOpportunities(clusterId);
  }

  /**
   * Get high-performing patterns for a niche
   */
  async getHighPerformingPatterns(
    niche: string,
    limit = 10
  ): Promise<ContentPatternEntry[]> {
    return this.contentPatterns.getHighPerformingPatterns(niche, limit);
  }

  /**
   * Calculate estimated savings from skipping steps
   */
  private calculateSavings(stepsToSkip: string[]): string {
    // Base costs per step (rough estimates)
    const stepCosts: Record<string, number> = {
      'Step 1 (Keyword Research)': 5, // $5 for API calls
      'Step 2.5 (Competitor Analysis)': 10, // $10 for crawling
      'Step 3.5 (SERP Analysis)': 3, // $3 for SERP API
    };

    const totalSaved = stepsToSkip.reduce((sum, step) => sum + (stepCosts[step] || 0), 0);
    const percentSaved = stepsToSkip.length > 0 ? Math.round((stepsToSkip.length / 3) * 100) : 0;

    if (totalSaved === 0) {
      return 'No savings (no cached data available)';
    }

    return `~$${totalSaved} and ~${percentSaved}% research time`;
  }

  /**
   * Get collection managers for direct access
   */
  getCollections() {
    return {
      expertSources: this.expertSources,
      statistics: this.statistics,
      keywordResearch: this.keywordResearch,
      competitorIntelligence: this.competitorIntelligence,
      serpPatterns: this.serpPatterns,
      contentPatterns: this.contentPatterns,
    };
  }
}
