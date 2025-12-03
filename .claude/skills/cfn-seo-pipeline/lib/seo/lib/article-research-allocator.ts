/**
 * Article Research Allocator
 *
 * Allocates cluster research context to individual articles based on relevance.
 * Takes comprehensive RuVector intelligence and distributes it optimally across
 * articles in a content cluster, ensuring each article gets the most relevant
 * experts, statistics, patterns, and competitor insights.
 *
 * Phase 3 Sprint 1 Task 3: SEO RuVector Intelligence Integration
 *
 * @module seo/lib/article-research-allocator
 */

import type {
  ExpertSourceEntry,
  StatisticEntry,
  ContentPatternEntry,
  CompetitorIntelligenceEntry,
  SERPPatternEntry,
  KeywordResearchEntry,
} from './ruvector/schemas';

// =============================================
// Interfaces
// =============================================

/**
 * Research allocated to a specific article
 */
export interface ArticleResearchAllocation {
  /** Article ID */
  articleId: string;

  /** Article title */
  articleTitle: string;

  /** Target keyword for the article */
  targetKeyword: string;

  /** Allocated keyword research (subset relevant to this article) */
  keywords: AllocatedKeywords;

  /** Allocated expert sources */
  experts: AllocatedExpert[];

  /** Allocated statistics */
  statistics: AllocatedStatistic[];

  /** Allocated content patterns */
  patterns: AllocatedPattern[];

  /** Competitor insights relevant to this article */
  competitorInsights: AllocatedCompetitorInsight[];

  /** SERP guidance for this article */
  serpGuidance: AllocatedSERPGuidance;

  /** Allocation metrics */
  metrics: AllocationMetrics;
}

export interface AllocatedKeywords {
  primary: string;
  secondary: string[];
  longTail: string[];
  peopleAlsoAsk: string[];
}

export interface AllocatedExpert {
  name: string;
  credentials: string;
  relevanceScore: number;
  selectedQuotes: Array<{
    text: string;
    context: string;
  }>;
  suggestedUsage: string;
}

export interface AllocatedStatistic {
  statistic: string;
  value: number;
  unit: string;
  source: string;
  relevanceScore: number;
  suggestedPlacement: 'intro' | 'body' | 'conclusion' | 'anywhere';
}

export interface AllocatedPattern {
  patternId: string;
  patternType: string;
  description: string;
  confidence: number;
  applicationHint: string;
}

export interface AllocatedCompetitorInsight {
  domain: string;
  insight: string;
  actionable: boolean;
  relevanceScore: number;
}

export interface AllocatedSERPGuidance {
  targetFeatures: string[];
  contentLength: { min: number; max: number; optimal: number };
  structureRecommendations: string[];
  opportunityScore: number;
}

export interface AllocationMetrics {
  /** Total research items allocated */
  totalItemsAllocated: number;
  /** Expert count */
  expertsAllocated: number;
  /** Statistics count */
  statisticsAllocated: number;
  /** Patterns count */
  patternsAllocated: number;
  /** Research coverage score (0.0-1.0) */
  coverageScore: number;
  /** Relevance score for allocations (0.0-1.0) */
  averageRelevance: number;
}

/**
 * Cluster research context from RuVector
 */
export interface ClusterResearchContext {
  /** Cluster identifier */
  clusterId: string;

  /** Main cluster keyword */
  clusterKeyword: string;

  /** Niche/topic area */
  niche: string;

  /** Keyword research data */
  keywordResearch?: KeywordResearchEntry;

  /** Expert sources from RuVector */
  expertSources: ExpertSourceEntry[];

  /** Statistics from RuVector */
  statistics: StatisticEntry[];

  /** Content patterns from RuVector */
  contentPatterns: ContentPatternEntry[];

  /** Competitor intelligence */
  competitorIntelligence: CompetitorIntelligenceEntry[];

  /** SERP patterns */
  serpPatterns?: SERPPatternEntry;
}

/**
 * Allocator configuration
 */
export interface AllocatorConfig {
  /** Minimum relevance score to include item (default: 0.3) */
  minRelevanceScore?: number;

  /** Maximum experts per article (default: 5) */
  maxExpertsPerArticle?: number;

  /** Maximum statistics per article (default: 8) */
  maxStatisticsPerArticle?: number;

  /** Maximum patterns per article (default: 5) */
  maxPatternsPerArticle?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Article definition for allocation
 */
export interface ArticleDefinition {
  id: string;
  title: string;
  targetKeyword: string;
  format: string;
  topics: string[];
  searchIntent: 'informational' | 'navigational' | 'transactional' | 'commercial';
  targetPersona?: string;
  wordCount: number;
}

/**
 * Usage report for research segment tracking
 */
export interface UsageReport {
  /** Experts used across articles */
  expertUsage: Map<string, number>;
  /** Statistics used across articles */
  statisticUsage: Map<string, number>;
  /** Patterns used across articles */
  patternUsage: Map<string, number>;
  /** Items never used */
  unusedItems: {
    experts: string[];
    statistics: string[];
    patterns: string[];
  };
  /** Efficiency metrics */
  efficiency: {
    totalResearchItems: number;
    itemsUsed: number;
    utilizationRate: number;
  };
}

// =============================================
// Helper Functions
// =============================================

/**
 * Calculate relevance score between research item and article
 */
function calculateRelevance(
  item: { topics?: string[]; text?: string },
  article: ArticleDefinition
): number {
  let score = 0;

  // Topic overlap (40% weight)
  if (item.topics && item.topics.length > 0) {
    const topicOverlap = item.topics.filter((t) =>
      article.topics.some(
        (at) =>
          at.toLowerCase().includes(t.toLowerCase()) ||
          t.toLowerCase().includes(at.toLowerCase())
      )
    ).length;
    score += (topicOverlap / Math.max(item.topics.length, 1)) * 0.4;
  }

  // Keyword match (30% weight)
  if (item.topics && item.topics.length > 0) {
    const keywordMatch = item.topics.some(
      (t) =>
        article.targetKeyword.toLowerCase().includes(t.toLowerCase()) ||
        t.toLowerCase().includes(article.targetKeyword.toLowerCase())
    );
    if (keywordMatch) score += 0.3;
  }

  // Text relevance (30% weight) - simple keyword presence
  if (item.text) {
    const textLower = item.text.toLowerCase();
    const keywordWords = article.targetKeyword.toLowerCase().split(' ');
    const matchCount = keywordWords.filter((word) => textLower.includes(word)).length;
    score += (matchCount / keywordWords.length) * 0.3;
  }

  return Math.min(score, 1.0);
}

/**
 * Select best quotes from expert based on article relevance
 */
function selectBestQuotes(
  quotes: ExpertSourceEntry['metadata']['quotes'],
  article: ArticleDefinition,
  maxQuotes: number
): Array<{ text: string; context: string }> {
  if (!quotes || quotes.length === 0) {
    return [];
  }

  // Score quotes by topic relevance
  const scoredQuotes = quotes.map((quote) => ({
    quote,
    relevance: calculateRelevance(
      { topics: quote.topicTags, text: quote.text },
      article
    ),
  }));

  // Sort by relevance
  scoredQuotes.sort((a, b) => b.relevance - a.relevance);

  // Take top N quotes
  return scoredQuotes.slice(0, maxQuotes).map((sq) => ({
    text: sq.quote.text,
    context: sq.quote.context,
  }));
}

/**
 * Generate usage hint for expert in article context
 */
function generateUsageHint(
  expert: ExpertSourceEntry,
  article: ArticleDefinition
): string {
  const intent = article.searchIntent;

  if (intent === 'informational') {
    return 'Use as authoritative source in body sections to support key points';
  } else if (intent === 'commercial' || intent === 'transactional') {
    return 'Include expert recommendation to build trust and credibility';
  } else if (intent === 'navigational') {
    return 'Reference expert to establish topical authority';
  }

  return 'Include quote to enhance content credibility';
}

/**
 * Determine optimal placement for statistic in article
 */
function determinePlacement(
  stat: StatisticEntry,
  article: ArticleDefinition
): 'intro' | 'body' | 'conclusion' | 'anywhere' {
  const format = article.format.toLowerCase();

  // Hook statistics work well in intros
  if (stat.metadata.numericValue >= 50 && stat.metadata.unit === 'percent') {
    return 'intro';
  }

  // Supporting stats in body
  if (format.includes('how-to') || format.includes('guide')) {
    return 'body';
  }

  // Summary stats in conclusion
  if (format.includes('comparison') || format.includes('review')) {
    return 'conclusion';
  }

  return 'anywhere';
}

/**
 * Generate pattern application hint
 */
function generatePatternHint(
  pattern: ContentPatternEntry,
  article: ArticleDefinition
): string {
  const patternType = pattern.metadata.type;
  const format = article.format.toLowerCase();

  if (patternType === 'STRUCTURE') {
    return `Apply this ${format} structure pattern for optimal content organization`;
  } else if (patternType === 'ANGLE') {
    return 'Use this angle approach to capture reader interest';
  } else if (patternType === 'VOICE') {
    return 'Apply this voice pattern for better audience connection';
  } else if (patternType === 'HOOK') {
    return 'Use this hook pattern to improve engagement';
  } else if (patternType === 'CTA') {
    return 'Integrate this CTA pattern for better conversion';
  } else if (patternType === 'DEPTH') {
    return 'Apply this depth pattern for comprehensive coverage';
  }

  return 'Apply this pattern to improve content effectiveness';
}

// =============================================
// ArticleResearchAllocator Class
// =============================================

export class ArticleResearchAllocator {
  private config: Required<AllocatorConfig>;

  constructor(config?: AllocatorConfig) {
    this.config = {
      minRelevanceScore: config?.minRelevanceScore ?? 0.3,
      maxExpertsPerArticle: config?.maxExpertsPerArticle ?? 5,
      maxStatisticsPerArticle: config?.maxStatisticsPerArticle ?? 8,
      maxPatternsPerArticle: config?.maxPatternsPerArticle ?? 5,
      verbose: config?.verbose ?? false,
    };
  }

  /**
   * Allocate research to a single article
   */
  allocateForArticle(
    article: ArticleDefinition,
    context: ClusterResearchContext
  ): ArticleResearchAllocation {
    if (this.config.verbose) {
      console.log(`[Allocator] Allocating research for article: "${article.title}"`);
    }

    // Allocate keywords
    const keywords = this.allocateKeywords(article, context);

    // Allocate experts
    const experts = this.allocateExperts(
      article,
      context.expertSources,
      this.config.maxExpertsPerArticle
    );

    // Allocate statistics
    const statistics = this.allocateStatistics(
      article,
      context.statistics,
      this.config.maxStatisticsPerArticle
    );

    // Allocate patterns
    const patterns = this.allocatePatterns(
      article,
      context.contentPatterns,
      this.config.maxPatternsPerArticle
    );

    // Allocate competitor insights
    const competitorInsights = this.allocateCompetitorInsights(
      article,
      context.competitorIntelligence
    );

    // Generate SERP guidance
    const serpGuidance = this.generateSERPGuidance(article, context);

    // Calculate metrics
    const metrics = this.calculateMetrics(
      experts,
      statistics,
      patterns,
      competitorInsights
    );

    if (this.config.verbose) {
      console.log(
        `[Allocator] Allocated ${metrics.totalItemsAllocated} items (${metrics.expertsAllocated} experts, ${metrics.statisticsAllocated} stats, ${metrics.patternsAllocated} patterns)`
      );
    }

    return {
      articleId: article.id,
      articleTitle: article.title,
      targetKeyword: article.targetKeyword,
      keywords,
      experts,
      statistics,
      patterns,
      competitorInsights,
      serpGuidance,
      metrics,
    };
  }

  /**
   * Allocate research to all articles in a cluster
   */
  allocateForCluster(
    articles: ArticleDefinition[],
    context: ClusterResearchContext
  ): Map<string, ArticleResearchAllocation> {
    if (this.config.verbose) {
      console.log(
        `[Allocator] Allocating research for ${articles.length} articles in cluster "${context.clusterId}"`
      );
    }

    const allocations = new Map<string, ArticleResearchAllocation>();

    for (const article of articles) {
      const allocation = this.allocateForArticle(article, context);
      allocations.set(article.id, allocation);
    }

    if (this.config.verbose) {
      const totalItems = Array.from(allocations.values()).reduce(
        (sum, a) => sum + a.metrics.totalItemsAllocated,
        0
      );
      console.log(
        `[Allocator] Cluster allocation complete: ${totalItems} total items distributed`
      );
    }

    return allocations;
  }

  /**
   * Track research segment usage across articles
   */
  getUsageReport(
    allocations: Map<string, ArticleResearchAllocation>
  ): UsageReport {
    const expertUsage = new Map<string, number>();
    const statisticUsage = new Map<string, number>();
    const patternUsage = new Map<string, number>();

    // Count usage across all allocations
    const allocationArray = Array.from(allocations.values());
    for (const allocation of allocationArray) {
      for (const expert of allocation.experts) {
        expertUsage.set(expert.name, (expertUsage.get(expert.name) || 0) + 1);
      }
      for (const stat of allocation.statistics) {
        const key = stat.statistic.substring(0, 50);
        statisticUsage.set(key, (statisticUsage.get(key) || 0) + 1);
      }
      for (const pattern of allocation.patterns) {
        patternUsage.set(
          pattern.patternId,
          (patternUsage.get(pattern.patternId) || 0) + 1
        );
      }
    }

    const totalItems = expertUsage.size + statisticUsage.size + patternUsage.size;
    const itemsUsed = totalItems; // All tracked items are used at least once

    return {
      expertUsage,
      statisticUsage,
      patternUsage,
      unusedItems: { experts: [], statistics: [], patterns: [] }, // Would need full context to identify unused
      efficiency: {
        totalResearchItems: totalItems,
        itemsUsed,
        utilizationRate: totalItems > 0 ? itemsUsed / totalItems : 0,
      },
    };
  }

  // =============================================
  // Private Allocation Methods
  // =============================================

  private allocateKeywords(
    article: ArticleDefinition,
    context: ClusterResearchContext
  ): AllocatedKeywords {
    const keywords: AllocatedKeywords = {
      primary: article.targetKeyword,
      secondary: [],
      longTail: [],
      peopleAlsoAsk: [],
    };

    if (!context.keywordResearch) {
      return keywords;
    }

    const kr = context.keywordResearch.metadata;

    // Filter secondary keywords by relevance
    if (kr.secondaryKeywords) {
      keywords.secondary = kr.secondaryKeywords
        .filter((kw) => {
          const relevance = calculateRelevance(
            { text: kw.keyword, topics: [kw.keyword] },
            article
          );
          return relevance >= this.config.minRelevanceScore;
        })
        .slice(0, 10)
        .map((kw) => kw.keyword);
    }

    // Filter long-tail keywords
    if (kr.longTailKeywords) {
      keywords.longTail = kr.longTailKeywords
        .filter((kw) => {
          const relevance = calculateRelevance({ text: kw, topics: [kw] }, article);
          return relevance >= this.config.minRelevanceScore;
        })
        .slice(0, 15);
    }

    // Filter PAA questions
    if (kr.peopleAlsoAsk) {
      keywords.peopleAlsoAsk = kr.peopleAlsoAsk
        .filter((q) => {
          const relevance = calculateRelevance({ text: q, topics: [q] }, article);
          return relevance >= this.config.minRelevanceScore;
        })
        .slice(0, 8);
    }

    return keywords;
  }

  private allocateExperts(
    article: ArticleDefinition,
    experts: ExpertSourceEntry[],
    maxCount: number
  ): AllocatedExpert[] {
    // Score and sort experts by relevance
    const scoredExperts = experts.map((expert) => ({
      expert,
      relevance: calculateRelevance(
        { topics: expert.metadata.topics, text: expert.text },
        article
      ),
    }));

    // Sort by relevance, then by authority score
    scoredExperts.sort((a, b) => {
      if (Math.abs(a.relevance - b.relevance) > 0.1) {
        return b.relevance - a.relevance;
      }
      return b.expert.metadata.authorityScore - a.expert.metadata.authorityScore;
    });

    // Take top N experts above threshold
    return scoredExperts
      .filter((se) => se.relevance >= this.config.minRelevanceScore)
      .slice(0, maxCount)
      .map((se) => ({
        name: se.expert.metadata.name,
        credentials: se.expert.metadata.credentials,
        relevanceScore: se.relevance,
        selectedQuotes: selectBestQuotes(se.expert.metadata.quotes, article, 2),
        suggestedUsage: generateUsageHint(se.expert, article),
      }));
  }

  private allocateStatistics(
    article: ArticleDefinition,
    statistics: StatisticEntry[],
    maxCount: number
  ): AllocatedStatistic[] {
    const scoredStats = statistics.map((stat) => ({
      stat,
      relevance: calculateRelevance(
        { topics: stat.metadata.topics, text: stat.text },
        article
      ),
    }));

    // Sort by relevance, then by credibility
    scoredStats.sort((a, b) => {
      if (Math.abs(a.relevance - b.relevance) > 0.1) {
        return b.relevance - a.relevance;
      }
      return b.stat.metadata.credibilityScore - a.stat.metadata.credibilityScore;
    });

    return scoredStats
      .filter((ss) => ss.relevance >= this.config.minRelevanceScore)
      .slice(0, maxCount)
      .map((ss) => ({
        statistic: ss.stat.metadata.statistic,
        value: ss.stat.metadata.numericValue,
        unit: ss.stat.metadata.unit,
        source: ss.stat.metadata.sourceName,
        relevanceScore: ss.relevance,
        suggestedPlacement: determinePlacement(ss.stat, article),
      }));
  }

  private allocatePatterns(
    article: ArticleDefinition,
    patterns: ContentPatternEntry[],
    maxCount: number
  ): AllocatedPattern[] {
    // Filter patterns by format match if available
    const applicablePatterns = patterns.filter((p) => {
      // If pattern has a specific format, check for match
      if (p.metadata.format) {
        return article.format.toLowerCase().includes(p.metadata.format.toLowerCase()) ||
               p.metadata.format.toLowerCase().includes(article.format.toLowerCase());
      }
      // Include patterns without format restrictions
      return true;
    });

    // Sort by confidence and relevance
    const scored = applicablePatterns.map((p) => ({
      pattern: p,
      relevance: calculateRelevance({ topics: [p.metadata.niche] }, article),
    }));

    scored.sort((a, b) => {
      const confDiff =
        b.pattern.metadata.confidenceScore - a.pattern.metadata.confidenceScore;
      if (Math.abs(confDiff) > 0.1) return confDiff;
      return b.relevance - a.relevance;
    });

    return scored.slice(0, maxCount).map((sp) => ({
      patternId: sp.pattern.id,
      patternType: sp.pattern.metadata.type,
      description: sp.pattern.metadata.description,
      confidence: sp.pattern.metadata.confidenceScore,
      applicationHint: generatePatternHint(sp.pattern, article),
    }));
  }

  private allocateCompetitorInsights(
    article: ArticleDefinition,
    competitors: CompetitorIntelligenceEntry[]
  ): AllocatedCompetitorInsight[] {
    const insights: AllocatedCompetitorInsight[] = [];

    for (const competitor of competitors) {
      // Extract actionable insights from competitor metadata
      const competitorInsights = this.extractInsights(competitor, article);
      insights.push(...competitorInsights);
    }

    // Sort by relevance and actionability
    insights.sort((a, b) => {
      if (a.actionable !== b.actionable) {
        return a.actionable ? -1 : 1; // Actionable first
      }
      return b.relevanceScore - a.relevanceScore;
    });

    return insights.slice(0, 5); // Top 5 insights
  }

  private extractInsights(
    competitor: CompetitorIntelligenceEntry,
    article: ArticleDefinition
  ): AllocatedCompetitorInsight[] {
    const insights: AllocatedCompetitorInsight[] = [];
    const meta = competitor.metadata;

    // Content gaps are actionable insights
    if (meta.contentGaps && meta.contentGaps.length > 0) {
      for (const gap of meta.contentGaps) {
        const relevance = calculateRelevance(
          { text: gap.opportunity, topics: [gap.topic] },
          article
        );
        if (relevance >= this.config.minRelevanceScore) {
          insights.push({
            domain: meta.domain,
            insight: `Content gap: ${gap.opportunity} (${gap.topic})`,
            actionable: true,
            relevanceScore: relevance,
          });
        }
      }
    }

    // Architecture patterns as insights
    if (meta.architecturePatterns && meta.architecturePatterns.length > 0) {
      for (const pattern of meta.architecturePatterns.slice(0, 2)) {
        insights.push({
          domain: meta.domain,
          insight: `Architecture pattern: ${pattern.urlStructure}`,
          actionable: true,
          relevanceScore: 0.6,
        });
      }
    }

    return insights;
  }

  private generateSERPGuidance(
    article: ArticleDefinition,
    context: ClusterResearchContext
  ): AllocatedSERPGuidance {
    const guidance: AllocatedSERPGuidance = {
      targetFeatures: [],
      contentLength: { min: 1000, max: 3000, optimal: 2000 },
      structureRecommendations: [],
      opportunityScore: 0.5,
    };

    if (!context.serpPatterns) {
      return guidance;
    }

    const serp = context.serpPatterns.metadata;

    // Target SERP features based on what's present
    if (serp.featuresPresent && serp.featuresPresent.length > 0) {
      const featureTypes = serp.featuresPresent.map(f => f.type);
      if (featureTypes.some(t => t.includes('snippet'))) {
        guidance.targetFeatures.push('Featured Snippet');
      }
      if (featureTypes.some(t => t.includes('people') || t.includes('ask'))) {
        guidance.targetFeatures.push('People Also Ask');
      }
      if (featureTypes.some(t => t.includes('video'))) {
        guidance.targetFeatures.push('Video');
      }
    }

    // Feature opportunities
    if (serp.featuresOpportunity && serp.featuresOpportunity.length > 0) {
      for (const opp of serp.featuresOpportunity.slice(0, 3)) {
        if (!guidance.targetFeatures.includes(opp.type)) {
          guidance.targetFeatures.push(opp.type);
        }
      }
    }

    // Content length based on ranking patterns
    if (serp.rankingPatterns && serp.rankingPatterns.avgContentLength > 0) {
      const avg = serp.rankingPatterns.avgContentLength;
      guidance.contentLength = {
        min: Math.round(avg * 0.8),
        max: Math.round(avg * 1.2),
        optimal: avg,
      };
    }

    // Structure recommendations based on semantic clusters
    guidance.structureRecommendations.push(
      'Include H2 sections for main topics',
      'Use H3 for subtopics and details'
    );

    if (serp.semanticClusters && serp.semanticClusters.length > 0) {
      guidance.structureRecommendations.push(
        'Add FAQ section for semantic coverage'
      );
    }

    // Opportunity score - calculate from features and gaps
    const featureScore = serp.featuresOpportunity.length * 0.2;
    guidance.opportunityScore = Math.min(featureScore + 0.3, 1.0);

    return guidance;
  }

  private calculateMetrics(
    experts: AllocatedExpert[],
    statistics: AllocatedStatistic[],
    patterns: AllocatedPattern[],
    competitorInsights: AllocatedCompetitorInsight[]
  ): AllocationMetrics {
    const expertsAllocated = experts.length;
    const statisticsAllocated = statistics.length;
    const patternsAllocated = patterns.length;
    const totalItemsAllocated =
      expertsAllocated +
      statisticsAllocated +
      patternsAllocated +
      competitorInsights.length;

    // Calculate average relevance
    const relevanceScores: number[] = [
      ...experts.map((e) => e.relevanceScore),
      ...statistics.map((s) => s.relevanceScore),
      ...competitorInsights.map((c) => c.relevanceScore),
    ];

    const averageRelevance =
      relevanceScores.length > 0
        ? relevanceScores.reduce((sum, r) => sum + r, 0) / relevanceScores.length
        : 0;

    // Coverage score based on allocation completeness
    let coverageScore = 0;
    if (expertsAllocated > 0) coverageScore += 0.3;
    if (statisticsAllocated > 0) coverageScore += 0.3;
    if (patternsAllocated > 0) coverageScore += 0.2;
    if (competitorInsights.length > 0) coverageScore += 0.2;

    return {
      totalItemsAllocated,
      expertsAllocated,
      statisticsAllocated,
      patternsAllocated,
      coverageScore,
      averageRelevance,
    };
  }
}
