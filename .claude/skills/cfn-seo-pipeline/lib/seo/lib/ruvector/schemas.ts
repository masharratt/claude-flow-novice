/**
 * SEO Intelligence RuVector Schema Definitions
 *
 * Defines TypeScript interfaces for 6 SEO-focused RuVector collections:
 * 1. ExpertSourceEntry - Expert sources with authority scores (evergreen)
 * 2. StatisticEntry - Statistics with citations (evergreen with decay)
 * 3. KeywordResearchEntry - Keyword research cache (topic-specific, 3-month TTL)
 * 4. CompetitorIntelligenceEntry - Competitor analysis (topic-specific, 6-month TTL)
 * 5. SERPPatternEntry - SERP analysis patterns (fast-changing, 2-4 week TTL)
 * 6. ContentPatternEntry - Successful content patterns (learning-based, confidence-adjusted)
 *
 * Cost Savings Target: 80%+ reduction through research reuse
 * Time Savings Target: 75%+ reduction for content clusters
 *
 * Reference: .claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/DESIGN.md
 *
 * @module seo/lib/ruvector/schemas
 */

// =============================================
// Collection Names
// =============================================

/**
 * SEO RuVector collection names
 */
export const SEO_COLLECTIONS = {
  EXPERT_SOURCES: 'seo_expert_sources',
  STATISTICS: 'seo_statistics',
  KEYWORD_RESEARCH: 'seo_keyword_research',
  COMPETITOR_INTELLIGENCE: 'seo_competitor_intelligence',
  SERP_PATTERNS: 'seo_serp_patterns',
  CONTENT_PATTERNS: 'seo_content_patterns',
} as const;

export type SEOCollectionName = (typeof SEO_COLLECTIONS)[keyof typeof SEO_COLLECTIONS];

// =============================================
// Collection 1: Expert Sources (Evergreen)
// =============================================

/**
 * Expert quote with context and topic tags
 */
export interface ExpertQuote {
  /** The actual quote text */
  text: string;

  /** Context in which the quote was made */
  context: string;

  /** Topics this quote relates to */
  topicTags: string[];

  /** Date the quote was added */
  addedDate: Date;
}

/**
 * Expert source reference
 */
export interface ExpertSourceRef {
  /** URL where expert info was found */
  url: string;

  /** Type of source (website, book, interview, etc.) */
  type: 'website' | 'book' | 'interview' | 'research_paper' | 'social_media' | 'podcast' | 'other';
}

/**
 * Expert Source Entry
 *
 * Stores expert sources found during research for reuse across articles.
 * TTL: Never expires (authority_score adjusts based on performance)
 *
 * Embedding Text: "{name} - {credentials}. Topics: {topics}. Key insight: {best_quote}"
 *
 * Use cases:
 * - Find experts for quotes in new articles
 * - Track which experts perform well (authority score)
 * - Build institutional knowledge of domain experts
 */
export interface ExpertSourceEntry {
  /**
   * Unique identifier
   * Format: "{name_normalized}:{primary_domain}"
   */
  id: string;

  /**
   * Vector embedding source text
   */
  text: string;

  /**
   * Structured metadata
   */
  metadata: {
    // Expert identification
    /** Expert's full name */
    name: string;

    /** Credentials (degrees, titles, affiliations) */
    credentials: string;

    /** Primary expertise domain */
    primaryDomain: string;

    /** Topics this expert covers */
    topics: string[];

    // Authority and performance
    /** Authority score (0.0-1.0), adjusted based on article performance */
    authorityScore: number;

    /** Quotes from this expert */
    quotes: ExpertQuote[];

    /** Sources where expert info was found */
    sources: ExpertSourceRef[];

    // Usage tracking
    /** Date first discovered */
    firstSeen: Date;

    /** Date last updated */
    lastUpdated: Date;

    /** Number of times used in articles */
    useCount: number;

    /** Article IDs that used this expert */
    articleIds: string[];

    // Niche hierarchy
    /** Niche this expert belongs to */
    niche: string;

    /** Parent niche for cross-niche queries */
    parentNiche?: string;
  };
}

// =============================================
// Collection 2: Statistics (Evergreen with Decay)
// =============================================

/**
 * Statistic Entry
 *
 * Stores statistics and facts with citations for data-backed content.
 * TTL: 6+ months (time_sensitive stats decay faster)
 *
 * Embedding Text: "{statistic}. Topic: {topics}. Source: {source_name}"
 *
 * Use cases:
 * - Find relevant statistics for articles
 * - Track stat credibility and freshness
 * - Provide data-backed content
 */
export interface StatisticEntry {
  /**
   * Unique identifier
   * Format: hash(statistic_normalized)
   */
  id: string;

  /**
   * Vector embedding source text
   */
  text: string;

  /**
   * Structured metadata
   */
  metadata: {
    // Statistic content
    /** Full statistic text (e.g., "73% of families have lost oral traditions") */
    statistic: string;

    /** Numeric value extracted */
    numericValue: number;

    /** Unit of measurement (percent, count, dollars, etc.) */
    unit: string;

    /** Topics this statistic relates to */
    topics: string[];

    // Source information
    /** Name of the source organization/study */
    sourceName: string;

    /** URL to the source */
    sourceUrl: string;

    /** Date the statistic was published */
    publicationDate: Date;

    // Quality metrics
    /** Credibility score (0.0-1.0) */
    credibilityScore: number;

    /** Whether this stat changes over time */
    timeSensitive: boolean;

    // Usage tracking
    /** Date first discovered */
    firstSeen: Date;

    /** Date last verified */
    lastVerified: Date;

    /** Number of times used */
    useCount: number;

    /** Article IDs that used this statistic */
    articleIds: string[];

    // Freshness
    /** Freshness score (1.0 → 0.0 over TTL) */
    freshnessScore: number;

    // Niche hierarchy
    /** Niche this statistic belongs to */
    niche: string;

    /** Parent niche for cross-niche queries */
    parentNiche?: string;
  };
}

// =============================================
// Collection 3: Keyword Research (Topic-specific)
// =============================================

/**
 * Secondary keyword with metrics
 */
export interface SecondaryKeyword {
  keyword: string;
  volume: number;
  difficulty: number;
  cpc: number;
}

/**
 * Search intent type
 */
export type SearchIntent = 'informational' | 'navigational' | 'transactional' | 'commercial';

/**
 * Keyword Research Entry
 *
 * Caches keyword research results for topic clusters.
 * TTL: 3 months (keyword metrics shift over time)
 *
 * Embedding Text: "{primary_keyword}. Related: {secondary_keywords}. Intent: {search_intent}. Questions: {people_also_ask}"
 *
 * Use cases:
 * - Avoid re-researching keywords for related articles
 * - Share keyword data within content clusters
 * - Track keyword freshness
 */
export interface KeywordResearchEntry {
  /**
   * Unique identifier
   * Format: keyword_normalized
   */
  id: string;

  /**
   * Vector embedding source text
   */
  text: string;

  /**
   * Structured metadata
   */
  metadata: {
    // Keyword data
    /** Primary target keyword */
    primaryKeyword: string;

    /** Monthly search volume */
    searchVolume: number;

    /** Keyword difficulty (0-100) */
    keywordDifficulty: number;

    /** Cost per click (USD) */
    cpc: number;

    /** Search intent classification */
    searchIntent: SearchIntent;

    // Related keywords
    /** Secondary/related keywords with metrics */
    secondaryKeywords: SecondaryKeyword[];

    /** Long-tail keyword variations */
    longTailKeywords: string[];

    /** People Also Ask questions */
    peopleAlsoAsk: string[];

    /** Related searches */
    relatedSearches: string[];

    // Cluster association
    /** Cluster ID if part of a cluster */
    clusterId?: string;

    /** Niche/topic area */
    niche: string;

    // Timing
    /** Date created */
    createdAt: Date;

    /** Expiration date (3 months from creation) */
    expiresAt: Date;

    /** Freshness score (1.0 → 0.0 over TTL) */
    freshnessScore: number;
  };
}

// =============================================
// Collection 4: Competitor Intelligence (Topic-specific)
// =============================================

/**
 * Site architecture pattern
 */
export interface ArchitecturePattern {
  /** URL structure pattern (e.g., "/blog/{category}/{slug}") */
  urlStructure: string;

  /** Site hierarchy description */
  hierarchy: string;

  /** Number of category pages */
  categoryPages: number;
}

/**
 * Content strategy pattern
 */
export interface ContentStrategyPattern {
  /** Average word count */
  avgWordCount: number;

  /** Content type (how-to, listicle, guide, etc.) */
  contentType: string;

  /** Publishing frequency */
  publishFrequency: string;

  /** Top content formats */
  topFormats: string[];

  /** Number of pages with this pattern */
  pageCount: number;

  /** Common heading structures */
  headingStructures: string[];
}

/**
 * Hub page information
 */
export interface HubPage {
  /** URL of the hub page */
  url: string;

  /** Topic covered */
  topic: string;

  /** Number of internal links pointing to/from */
  internalLinks: number;
}

/**
 * Content gap opportunity
 */
export interface ContentGap {
  /** Topic that's underserved */
  topic: string;

  /** Priority level */
  priority: 'high' | 'medium' | 'low';

  /** Opportunity description */
  opportunity: string;
}

/**
 * Competitor Intelligence Entry
 *
 * Stores competitor analysis for reuse within a niche.
 * TTL: 6 months (competitor strategies evolve slowly)
 *
 * Embedding Text: "Analysis of {domain} in {niche}. Architecture: {architecture_summary}. Gaps: {top_gaps}"
 *
 * Use cases:
 * - Understand competitor content strategies
 * - Find content gaps to exploit
 * - Learn from competitor architectures
 */
export interface CompetitorIntelligenceEntry {
  /**
   * Unique identifier
   * Format: "{domain}:{niche_normalized}"
   */
  id: string;

  /**
   * Vector embedding source text
   */
  text: string;

  /**
   * Structured metadata
   */
  metadata: {
    // Competitor identification
    /** Domain name */
    domain: string;

    /** Niche/topic area */
    niche: string;

    // Architecture analysis
    /** Site architecture patterns */
    architecturePatterns: ArchitecturePattern[];

    /** Content strategy patterns */
    contentStrategy: ContentStrategyPattern[];

    /** Identified hub pages */
    hubPages: HubPage[];

    /** Internal linking patterns */
    internalLinkingPatterns: string[];

    // Opportunities
    /** Identified content gaps */
    contentGaps: ContentGap[];

    // Top keywords
    /** Top ranking keywords for this competitor */
    topKeywords?: Array<{
      keyword: string;
      position: number;
      searchVolume: number;
    }>;

    // Authority
    /** Estimated domain authority */
    estimatedAuthority: number;

    // Cluster association
    /** Cluster ID if part of a cluster */
    clusterId?: string;

    // Timing
    /** Date created */
    createdAt: Date;

    /** Expiration date (6 months from creation) */
    expiresAt: Date;

    /** Freshness score (1.0 → 0.0 over TTL) */
    freshnessScore: number;
  };
}

// =============================================
// Collection 5: SERP Patterns (Fast-changing)
// =============================================

/**
 * SERP feature with position
 */
export interface SERPFeature {
  /** Feature type (featured_snippet, people_also_ask, video_carousel, etc.) */
  type: string;

  /** Position in SERP (1-10) */
  position: number;
}

/**
 * SERP feature opportunity
 */
export interface SERPFeatureOpportunity {
  /** Feature type */
  type: string;

  /** Why this is an opportunity */
  reason: string;
}

/**
 * Ranking pattern analysis
 */
export interface RankingPattern {
  /** Average content length of top results */
  avgContentLength: number;

  /** Average domain authority of top results */
  avgDomainAuthority: number;

  /** Whether freshness is a ranking signal */
  freshnessSignal: boolean;

  /** Top ranking factors identified */
  topFactors: string[];
}

/**
 * Semantic topic cluster
 */
export interface SemanticCluster {
  /** Topic name */
  topic: string;

  /** Related terms in cluster */
  terms: string[];
}

/**
 * SERP Pattern Entry
 *
 * Stores SERP analysis for keyword optimization.
 * TTL: 2-4 weeks (SERPs change frequently)
 *
 * Embedding Text: "SERP for {keyword}. Features: {features_present}. Top factors: {ranking_factors}"
 *
 * Use cases:
 * - Understand what's currently ranking
 * - Find SERP feature opportunities
 * - Track SERP changes over time
 */
export interface SERPPatternEntry {
  /**
   * Unique identifier
   * Format: "{keyword_normalized}:{week_bucket}"
   */
  id: string;

  /**
   * Vector embedding source text
   */
  text: string;

  /**
   * Structured metadata
   */
  metadata: {
    // SERP identification
    /** Target keyword */
    keyword: string;

    // SERP features
    /** Features currently present */
    featuresPresent: SERPFeature[];

    /** Feature opportunities */
    featuresOpportunity: SERPFeatureOpportunity[];

    // Ranking analysis
    /** Ranking pattern analysis */
    rankingPatterns: RankingPattern;

    /** Semantic topic clusters */
    semanticClusters: SemanticCluster[];

    /** Top competitor domains */
    topCompetitors: string[];

    // Cluster association
    /** Cluster ID if part of a cluster */
    clusterId?: string;

    // Timing
    /** Date captured */
    capturedAt: Date;

    /** Expiration date (2-4 weeks from capture) */
    expiresAt: Date;

    /** Freshness score (1.0 → 0.0 over TTL) */
    freshnessScore: number;
  };
}

// =============================================
// Collection 6: Content Patterns (Learning-based)
// =============================================

/**
 * Content pattern type
 */
export type ContentPatternType = 'ANGLE' | 'STRUCTURE' | 'VOICE' | 'HOOK' | 'CTA' | 'DEPTH';

/**
 * Performance metrics for a pattern
 */
export interface PatternPerformanceMetrics {
  /** Average ranking position */
  avgPosition: number;

  /** Average click-through rate */
  avgCTR: number;

  /** Average time on page (seconds) */
  avgTimeOnPage: number;
}

/**
 * Content Pattern Entry
 *
 * Stores successful content patterns that can be replicated.
 * TTL: Never expires (confidence adjusts based on feedback)
 *
 * Embedding Text: "{type}: {description}. Niche: {niche}. Success: {confidence_score}"
 *
 * Use cases:
 * - Learn from successful articles
 * - Suggest patterns for new content
 * - Track pattern effectiveness
 */
export interface ContentPatternEntry {
  /**
   * Unique identifier
   * Format: "{type}:{pattern_hash}"
   */
  id: string;

  /**
   * Vector embedding source text
   */
  text: string;

  /**
   * Structured metadata
   */
  metadata: {
    // Pattern identification
    /** Pattern type */
    type: ContentPatternType;

    /** Description of the pattern */
    description: string;

    /** Example from successful article */
    example: string;

    // Context
    /** Niche/topic area */
    niche: string;

    /** Content format (how-to, listicle, etc.) */
    format?: string;

    // Performance
    /** Performance metrics if available */
    performanceMetrics?: PatternPerformanceMetrics;

    // Confidence
    /** Confidence score (0.1-0.99), adjusts based on performance */
    confidenceScore: number;

    // Usage tracking
    /** Article IDs that use this pattern */
    articleIds: string[];

    /** Date created */
    createdAt: Date;

    /** Date last used */
    lastUsed: Date;

    /** Number of times used */
    useCount: number;

    /** Number of articles with good performance */
    successCount: number;
  };
}

// =============================================
// Type Guards
// =============================================

/**
 * Type guard for ExpertSourceEntry
 */
export function isExpertSourceEntry(obj: unknown): obj is ExpertSourceEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'text' in obj &&
    'metadata' in obj &&
    typeof (obj as ExpertSourceEntry).metadata === 'object' &&
    typeof (obj as ExpertSourceEntry).metadata.name === 'string' &&
    typeof (obj as ExpertSourceEntry).metadata.authorityScore === 'number'
  );
}

/**
 * Type guard for StatisticEntry
 */
export function isStatisticEntry(obj: unknown): obj is StatisticEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'text' in obj &&
    'metadata' in obj &&
    typeof (obj as StatisticEntry).metadata === 'object' &&
    typeof (obj as StatisticEntry).metadata.statistic === 'string' &&
    typeof (obj as StatisticEntry).metadata.numericValue === 'number'
  );
}

/**
 * Type guard for KeywordResearchEntry
 */
export function isKeywordResearchEntry(obj: unknown): obj is KeywordResearchEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'text' in obj &&
    'metadata' in obj &&
    typeof (obj as KeywordResearchEntry).metadata === 'object' &&
    typeof (obj as KeywordResearchEntry).metadata.primaryKeyword === 'string' &&
    typeof (obj as KeywordResearchEntry).metadata.searchVolume === 'number'
  );
}

/**
 * Type guard for CompetitorIntelligenceEntry
 */
export function isCompetitorIntelligenceEntry(obj: unknown): obj is CompetitorIntelligenceEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'text' in obj &&
    'metadata' in obj &&
    typeof (obj as CompetitorIntelligenceEntry).metadata === 'object' &&
    typeof (obj as CompetitorIntelligenceEntry).metadata.domain === 'string' &&
    typeof (obj as CompetitorIntelligenceEntry).metadata.niche === 'string'
  );
}

/**
 * Type guard for SERPPatternEntry
 */
export function isSERPPatternEntry(obj: unknown): obj is SERPPatternEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'text' in obj &&
    'metadata' in obj &&
    typeof (obj as SERPPatternEntry).metadata === 'object' &&
    typeof (obj as SERPPatternEntry).metadata.keyword === 'string' &&
    Array.isArray((obj as SERPPatternEntry).metadata.featuresPresent)
  );
}

/**
 * Type guard for ContentPatternEntry
 */
export function isContentPatternEntry(obj: unknown): obj is ContentPatternEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'text' in obj &&
    'metadata' in obj &&
    typeof (obj as ContentPatternEntry).metadata === 'object' &&
    typeof (obj as ContentPatternEntry).metadata.type === 'string' &&
    typeof (obj as ContentPatternEntry).metadata.confidenceScore === 'number'
  );
}

// =============================================
// Embedding Text Generators
// =============================================

/**
 * Generate embedding text for ExpertSourceEntry
 */
export function generateExpertSourceEmbeddingText(entry: ExpertSourceEntry['metadata']): string {
  const bestQuote = entry.quotes.length > 0 ? entry.quotes[0].text : 'No quotes available';
  return `${entry.name} - ${entry.credentials}. Topics: ${entry.topics.join(', ')}. Key insight: ${bestQuote}`;
}

/**
 * Generate embedding text for StatisticEntry
 */
export function generateStatisticEmbeddingText(entry: StatisticEntry['metadata']): string {
  return `${entry.statistic}. Topic: ${entry.topics.join(', ')}. Source: ${entry.sourceName}`;
}

/**
 * Generate embedding text for KeywordResearchEntry
 */
export function generateKeywordResearchEmbeddingText(entry: KeywordResearchEntry['metadata']): string {
  const secondaryKwds = entry.secondaryKeywords.map((k) => k.keyword).slice(0, 5).join(', ');
  const questions = entry.peopleAlsoAsk.slice(0, 3).join('; ');
  return `${entry.primaryKeyword}. Related: ${secondaryKwds}. Intent: ${entry.searchIntent}. Questions: ${questions}`;
}

/**
 * Generate embedding text for CompetitorIntelligenceEntry
 */
export function generateCompetitorIntelligenceEmbeddingText(
  entry: CompetitorIntelligenceEntry['metadata']
): string {
  const archSummary = entry.architecturePatterns.map((a) => a.urlStructure).slice(0, 2).join(', ');
  const topGaps = entry.contentGaps.slice(0, 3).map((g) => g.topic).join(', ');
  return `Analysis of ${entry.domain} in ${entry.niche}. Architecture: ${archSummary}. Gaps: ${topGaps}`;
}

/**
 * Generate embedding text for SERPPatternEntry
 */
export function generateSERPPatternEmbeddingText(entry: SERPPatternEntry['metadata']): string {
  const features = entry.featuresPresent.map((f) => f.type).join(', ');
  const factors = entry.rankingPatterns.topFactors.slice(0, 3).join(', ');
  return `SERP for ${entry.keyword}. Features: ${features}. Top factors: ${factors}`;
}

/**
 * Generate embedding text for ContentPatternEntry
 */
export function generateContentPatternEmbeddingText(entry: ContentPatternEntry['metadata']): string {
  return `${entry.type}: ${entry.description}. Niche: ${entry.niche}. Success: ${entry.confidenceScore.toFixed(2)}`;
}

// =============================================
// Freshness Calculation
// =============================================

/**
 * TTL in days for each collection type
 */
export const COLLECTION_TTL_DAYS = {
  [SEO_COLLECTIONS.EXPERT_SOURCES]: Infinity, // Never expires
  [SEO_COLLECTIONS.STATISTICS]: 180, // 6 months
  [SEO_COLLECTIONS.KEYWORD_RESEARCH]: 90, // 3 months
  [SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE]: 180, // 6 months
  [SEO_COLLECTIONS.SERP_PATTERNS]: 21, // 3 weeks average
  [SEO_COLLECTIONS.CONTENT_PATTERNS]: Infinity, // Never expires
} as const;

/**
 * Calculate freshness score based on age and TTL
 *
 * @param createdAt - Date entry was created
 * @param ttlDays - Time to live in days
 * @returns Freshness score (1.0 = fresh, 0.0 = expired)
 */
export function calculateFreshnessScore(createdAt: Date, ttlDays: number): number {
  if (ttlDays === Infinity) {
    return 1.0;
  }

  const now = new Date();
  const ageMs = now.getTime() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return Math.max(0, 1 - ageDays / ttlDays);
}

/**
 * Check if an entry is stale based on freshness threshold
 *
 * @param freshnessScore - Current freshness score
 * @param threshold - Minimum acceptable freshness (default 0.3)
 * @returns Whether the entry is considered stale
 */
export function isEntryStale(freshnessScore: number, threshold = 0.3): boolean {
  return freshnessScore < threshold;
}

// =============================================
// ID Generation Helpers
// =============================================

/**
 * Normalize a string for use in IDs
 */
export function normalizeForId(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate ID for ExpertSourceEntry
 */
export function generateExpertSourceId(name: string, primaryDomain: string): string {
  return `${normalizeForId(name)}:${normalizeForId(primaryDomain)}`;
}

/**
 * Generate ID for StatisticEntry
 */
export function generateStatisticId(statistic: string): string {
  const hash = statistic
    .toLowerCase()
    .split('')
    .reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
  return `stat-${Math.abs(hash).toString(16)}`;
}

/**
 * Generate ID for KeywordResearchEntry
 */
export function generateKeywordResearchId(keyword: string): string {
  return normalizeForId(keyword);
}

// =============================================
// Helper: Pre-Research Result (Step 0.5 Output)
// =============================================

/**
 * Pre-research result from Step 0.5
 *
 * Contains cached research data from RuVector that can be used to skip
 * or supplement subsequent research steps.
 */
export interface PreResearchResult {
  /** Cached keyword research data (if available and fresh) */
  keywordResearch?: KeywordResearchEntry;

  /** Whether keyword research step can be skipped */
  skipKeywordResearch: boolean;

  /** Cached competitor intelligence data */
  competitorIntelligence: CompetitorIntelligenceEntry[];

  /** Whether competitor analysis step can be skipped */
  skipCompetitorAnalysis: boolean;

  /** Cached SERP patterns */
  serpPatterns?: SERPPatternEntry;

  /** Whether SERP analysis step can be skipped */
  skipSERPAnalysis: boolean;

  /** Cached expert sources for supplementing research */
  expertSources: ExpertSourceEntry[];

  /** Cached statistics for supplementing research */
  statistics: StatisticEntry[];

  /** Cached content patterns for supplementing research */
  contentPatterns: ContentPatternEntry[];
}

/**
 * Generate ID for CompetitorIntelligenceEntry
 */
export function generateCompetitorIntelligenceId(domain: string, niche: string): string {
  return `${normalizeForId(domain)}:${normalizeForId(niche)}`;
}

/**
 * Generate ID for SERPPatternEntry
 */
export function generateSERPPatternId(keyword: string, capturedAt: Date): string {
  const weekBucket = Math.floor(capturedAt.getTime() / (7 * 24 * 60 * 60 * 1000));
  return `${normalizeForId(keyword)}:${weekBucket}`;
}

/**
 * Generate ID for ContentPatternEntry
 */
export function generateContentPatternId(type: ContentPatternType, description: string): string {
  const hash = description
    .toLowerCase()
    .split('')
    .reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
  return `${type.toLowerCase()}:${Math.abs(hash).toString(16)}`;
}
