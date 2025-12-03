/**
 * SEO Onboarding RuVector Collection Schemas
 *
 * Defines TypeScript interfaces for 3 onboarding-specific RuVector collections:
 * 1. SiteProfileEntry - Site analysis results with technical health, industry, domain metadata
 * 2. OnboardingResultsEntry - Complete onboarding phase outputs with timestamps and confidence
 * 3. CrossSitePatternEntry - Successful strategies by industry for pattern reuse
 *
 * Integrates with 6 existing SEO collections:
 * - seo_expert_sources (expert quotes for content)
 * - seo_statistics (statistics for data backing)
 * - seo_keyword_research (keyword research cache)
 * - seo_competitor_intelligence (competitor analysis)
 * - seo_serp_patterns (SERP analysis patterns)
 * - seo_content_patterns (successful content patterns)
 *
 * Key Features:
 * - Freshness scoring and TTL management
 * - Pre-research query helpers (lookup cached intelligence before analysis)
 * - Post-phase storage helpers (cache new findings after phase completion)
 * - Industry/niche-specific pattern matching
 * - Confidence scoring for pattern reuse
 * - RuVector embedding text generation for semantic search
 *
 * Cost Savings: Enable 80%+ reduction in DataForSEO API calls via caching
 *
 * @module seo/lib/ruvector/onboarding-schemas
 */

// =============================================
// Onboarding Collection Names
// =============================================

/**
 * Onboarding-specific RuVector collection names
 */
export const ONBOARDING_COLLECTIONS = {
  SITE_PROFILES: 'seo_site_profiles',
  ONBOARDING_RESULTS: 'seo_onboarding_results',
  CROSS_SITE_PATTERNS: 'seo_cross_site_patterns',
} as const;

export type OnboardingCollectionName = (typeof ONBOARDING_COLLECTIONS)[keyof typeof ONBOARDING_COLLECTIONS];

/**
 * All SEO collection names (existing + onboarding)
 */
export const ALL_SEO_COLLECTIONS = {
  // Existing collections
  EXPERT_SOURCES: 'seo_expert_sources',
  STATISTICS: 'seo_statistics',
  KEYWORD_RESEARCH: 'seo_keyword_research',
  COMPETITOR_INTELLIGENCE: 'seo_competitor_intelligence',
  SERP_PATTERNS: 'seo_serp_patterns',
  CONTENT_PATTERNS: 'seo_content_patterns',
  // Onboarding collections
  SITE_PROFILES: 'seo_site_profiles',
  ONBOARDING_RESULTS: 'seo_onboarding_results',
  CROSS_SITE_PATTERNS: 'seo_cross_site_patterns',
} as const;

export type AllSEOCollectionName = (typeof ALL_SEO_COLLECTIONS)[keyof typeof ALL_SEO_COLLECTIONS];

// =============================================
// Collection 1: Site Profiles
// =============================================

/**
 * Technical health metric for a site
 */
export interface TechnicalHealthMetric {
  /** Metric name (Core Web Vitals, mobile friendliness, etc.) */
  name: string;

  /** Score (0.0-1.0) */
  score: number;

  /** Status (pass, warning, needs_improvement) */
  status: 'pass' | 'warning' | 'needs_improvement';

  /** Details or recommendation */
  details: string;
}

/**
 * Site profile crawl data
 */
export interface SiteProfileCrawlData {
  /** Total pages crawled */
  totalPages: number;

  /** Pages with issues */
  pagesWithIssues: number;

  /** Average page load time (seconds) */
  avgLoadTime: number;

  /** Pages indexed in search console */
  indexedPages: number;

  /** Robots.txt status */
  robotsTxtStatus: 'valid' | 'missing' | 'blocks_crawling';

  /** Mobile friendly score */
  mobileFriendlyScore: number;

  /** Average Core Web Vitals score */
  coreWebVitalsScore: number;
}

/**
 * Site Profile Entry
 *
 * Stores site analysis results for future reference and comparison.
 * TTL: 180 days (technical health changes slowly)
 *
 * Embedding Text: "{domain}. Industry: {industry}. Health: {health_score}. Pages: {total_pages}"
 *
 * Use cases:
 * - Check if site was previously analyzed
 * - Compare technical health across similar sites
 * - Identify recurring technical issues
 */
export interface SiteProfileEntry {
  /**
   * Unique identifier
   * Format: "{domain_normalized}"
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
    // Site identification
    /** Domain being analyzed */
    domain: string;

    /** Normalized domain for queries */
    domainNormalized: string;

    // Site classification
    /** Industry or vertical */
    industry: string;

    /** Estimated site size (small, medium, large, enterprise) */
    siteSize: 'small' | 'medium' | 'large' | 'enterprise';

    /** Target audience/niche */
    niche: string;

    // Technical health
    /** Overall technical health score (0.0-1.0) */
    technicalHealthScore: number;

    /** Detailed technical metrics */
    technicalMetrics: TechnicalHealthMetric[];

    /** Crawl data from analysis */
    crawlData: SiteProfileCrawlData;

    // Content baseline
    /** Total number of pages analyzed */
    totalPages: number;

    /** Average page word count */
    avgWordCount: number;

    /** Percentage of thin content (<300 words) */
    thinContentPercent: number;

    /** Estimated organic traffic (if available) */
    estimatedOrganicTraffic?: number;

    // Authority metrics
    /** Estimated domain authority (0-100) */
    estimatedDA?: number;

    /** Estimated page authority average (0-100) */
    estimatedPA?: number;

    /** Backlink count estimate */
    backlinksCount?: number;

    // Blocked content
    /** Blocking condition score (<0.5 blocks progression) */
    blockingConditionScore: number;

    /** Blocking issues if any */
    blockingIssues: string[];

    // Recommendations
    /** Top priority issues to address */
    topPriorityIssues: string[];

    /** Quick win opportunities */
    quickWins: string[];

    // Usage tracking
    /** Date first analyzed */
    firstAnalyzedAt: Date;

    /** Date last analyzed */
    lastAnalyzedAt: Date;

    /** Number of times analyzed */
    analysisCount: number;

    /** Onboarding run IDs that used this profile */
    onboardingRunIds: string[];

    // Timing
    /** Date created */
    createdAt: Date;

    /** Expiration date (180 days from last update) */
    expiresAt: Date;

    /** Freshness score (1.0 → 0.0 over TTL) */
    freshnessScore: number;
  };
}

// =============================================
// Collection 2: Onboarding Results
// =============================================

/**
 * Individual phase output
 */
export interface PhaseOutput {
  /** Phase number (1-7) */
  phaseNumber: number;

  /** Phase name */
  phaseName: string;

  /** Phase status (completed, failed, skipped) */
  status: 'completed' | 'failed' | 'skipped';

  /** Key findings from phase */
  keyFindings: string[];

  /** Artifacts generated (file paths or keys) */
  artifacts: string[];

  /** Timestamp when phase completed */
  completedAt: Date;

  /** Confidence in results (0.0-1.0) */
  confidence: number;

  /** Notes or issues encountered */
  notes?: string;
}

/**
 * Onboarding Results Entry
 *
 * Stores complete onboarding run outputs and metadata.
 * TTL: 365 days (keeps full history of onboarding runs)
 *
 * Embedding Text: "{domain}. Phases: {phases_completed}/7. Confidence: {overall_confidence}. Industry: {industry}"
 *
 * Use cases:
 * - Track onboarding runs for a site
 * - Compare results across different onboarding runs
 * - Extract patterns from successful onboardings
 * - Historical analysis of site progression
 */
export interface OnboardingResultsEntry {
  /**
   * Unique identifier
   * Format: "{domain_normalized}:{run_date}:{run_id}"
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
    // Onboarding identification
    /** Domain being onboarded */
    domain: string;

    /** Normalized domain for queries */
    domainNormalized: string;

    /** Unique run ID */
    runId: string;

    // Industry and context
    /** Industry/vertical */
    industry: string;

    /** Target niche */
    niche: string;

    /** Provided competitors (if any) */
    providedCompetitors: string[];

    // Phase tracking
    /** All phase outputs (1-7) */
    phaseOutputs: PhaseOutput[];

    /** Number of phases completed */
    phasesCompleted: number;

    /** Overall completion percentage (0-100) */
    completionPercent: number;

    // Results summary
    /** Keywords discovered */
    keywordsDiscovered: number;

    /** Content gaps identified */
    contentGapsIdentified: number;

    /** Competitors analyzed */
    competitorsAnalyzed: number;

    /** Quick wins identified */
    quickWinsCount: number;

    // Confidence metrics
    /** Overall confidence in results (0.0-1.0) */
    overallConfidence: number;

    /** Confidence breakdown by phase */
    confidenceByPhase: Record<number, number>;

    // Blocking conditions
    /** Whether onboarding was blocked */
    wasBlocked: boolean;

    /** Blocking reason if blocked */
    blockingReason?: string;

    /** Technical health score at start */
    technicalHealthScoreAtStart: number;

    // Cost metrics
    /** API calls made */
    apiCallsMade: number;

    /** API calls cached (reused from RuVector) */
    apiCallsCached: number;

    /** Estimated cost savings */
    estimatedCostSavings: number;

    /** Cache hit rate (0.0-1.0) */
    cacheHitRate: number;

    // Recommendations
    /** Top recommendations for the site */
    topRecommendations: string[];

    /** Roadmap milestones identified */
    roadmapMilestones: string[];

    // Timing
    /** Date onboarding started */
    startedAt: Date;

    /** Date onboarding completed */
    completedAt: Date;

    /** Total duration in minutes */
    durationMinutes: number;

    /** Date created in RuVector */
    createdAt: Date;

    /** Expiration date (365 days from creation) */
    expiresAt: Date;

    /** Freshness score (1.0 → 0.0 over TTL) */
    freshnessScore: number;

    // Metadata
    /** Links to related site profile */
    siteProfileId?: string;

    /** Related pattern extractions */
    relatedPatternIds: string[];
  };
}

// =============================================
// Collection 3: Cross-Site Patterns
// =============================================

/**
 * Pattern type for cross-site learning
 */
export type CrossSitePatternType =
  | 'TECHNICAL_FOUNDATION'
  | 'CONTENT_STRUCTURE'
  | 'COMPETITOR_STRATEGY'
  | 'KEYWORD_CLUSTER'
  | 'BACKLINK_STRATEGY'
  | 'QUICK_WIN'
  | 'ROADMAP_MILESTONE';

/**
 * Industry success metric
 */
export interface IndustrySuccessMetric {
  /** Industry name */
  industry: string;

  /** Number of sites this pattern worked for */
  successCount: number;

  /** Average improvement in metric */
  avgImprovement: number;

  /** Confidence score (0.0-1.0) */
  confidence: number;

  /** Last validation date */
  lastValidatedAt: Date;
}

/**
 * Cross-Site Pattern Entry
 *
 * Stores successful strategies from onboarded sites for reuse on similar sites.
 * TTL: 365 days (patterns remain valid long-term)
 *
 * Embedding Text: "{pattern_type}: {description}. Industries: {industries}. Success: {overall_confidence}"
 *
 * Use cases:
 * - Suggest proven strategies when onboarding new site in same industry
 * - Learn what works across industries
 * - Validate patterns against new data
 * - Extract industry best practices
 */
export interface CrossSitePatternEntry {
  /**
   * Unique identifier
   * Format: "{pattern_type}:{industry}:{pattern_hash}"
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
    patternType: CrossSitePatternType;

    /** Detailed description of the pattern */
    description: string;

    /** Why this pattern works */
    reasoning: string;

    // Implementation details
    /** Steps to implement this pattern */
    implementationSteps: string[];

    /** Resources or tools needed */
    resourcesNeeded: string[];

    /** Estimated effort (hours) */
    estimatedEffort: number;

    /** Expected time to results (days) */
    timeToResults: number;

    // Industry applicability
    /** Primary industries where this works */
    applicableIndustries: string[];

    /** Success metrics by industry */
    industrySuccessMetrics: IndustrySuccessMetric[];

    /** Niches where pattern is most effective */
    targetNiches: string[];

    // Site characteristics
    /** Minimum site size for this pattern */
    minSiteSize: 'small' | 'medium' | 'large' | 'enterprise';

    /** Works for both B2B and B2C */
    worksBothB2BAndB2C: boolean;

    /** Geographic focus (if any) */
    geographicFocus?: string;

    // Performance data
    /** Overall success confidence (0.0-1.0) */
    overallConfidence: number;

    /** Typical outcomes from this pattern */
    typicalOutcomes: string[];

    /** Common pitfalls to avoid */
    commonPitfalls: string[];

    // Source and validation
    /** Site profiles that contributed to this pattern */
    sourceProfileIds: string[];

    /** Onboarding runs that validated this pattern */
    validatingRunIds: string[];

    /** Number of sites this pattern worked for */
    appliedCount: number;

    /** Number of times successfully replicated */
    successCount: number;

    /** Success rate (0.0-1.0) */
    successRate: number;

    // Freshness and updates
    /** Date pattern was first identified */
    identifiedAt: Date;

    /** Date pattern was last validated */
    lastValidatedAt: Date;

    /** Date pattern was created in RuVector */
    createdAt: Date;

    /** Expiration date (365 days from last validation) */
    expiresAt: Date;

    /** Freshness score (1.0 → 0.0 over TTL) */
    freshnessScore: number;

    // Metadata
    /** Related content pattern IDs */
    relatedContentPatternIds: string[];

    /** Related competitor intelligence IDs */
    relatedCompetitorIntelligenceIds: string[];
  };
}

// =============================================
// Type Guards
// =============================================

/**
 * Type guard for SiteProfileEntry
 */
export function isSiteProfileEntry(obj: unknown): obj is SiteProfileEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'text' in obj &&
    'metadata' in obj &&
    typeof (obj as SiteProfileEntry).metadata === 'object' &&
    typeof (obj as SiteProfileEntry).metadata.domain === 'string' &&
    typeof (obj as SiteProfileEntry).metadata.industry === 'string' &&
    typeof (obj as SiteProfileEntry).metadata.technicalHealthScore === 'number'
  );
}

/**
 * Type guard for OnboardingResultsEntry
 */
export function isOnboardingResultsEntry(obj: unknown): obj is OnboardingResultsEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'text' in obj &&
    'metadata' in obj &&
    typeof (obj as OnboardingResultsEntry).metadata === 'object' &&
    typeof (obj as OnboardingResultsEntry).metadata.domain === 'string' &&
    typeof (obj as OnboardingResultsEntry).metadata.runId === 'string' &&
    Array.isArray((obj as OnboardingResultsEntry).metadata.phaseOutputs)
  );
}

/**
 * Type guard for CrossSitePatternEntry
 */
export function isCrossSitePatternEntry(obj: unknown): obj is CrossSitePatternEntry {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'text' in obj &&
    'metadata' in obj &&
    typeof (obj as CrossSitePatternEntry).metadata === 'object' &&
    typeof (obj as CrossSitePatternEntry).metadata.patternType === 'string' &&
    typeof (obj as CrossSitePatternEntry).metadata.overallConfidence === 'number'
  );
}

// =============================================
// Embedding Text Generators
// =============================================

/**
 * Generate embedding text for SiteProfileEntry
 */
export function generateSiteProfileEmbeddingText(entry: SiteProfileEntry['metadata']): string {
  return `${entry.domain}. Industry: ${entry.industry}. Health: ${entry.technicalHealthScore.toFixed(2)}. Pages: ${entry.totalPages}. Niche: ${entry.niche}`;
}

/**
 * Generate embedding text for OnboardingResultsEntry
 */
export function generateOnboardingResultsEmbeddingText(entry: OnboardingResultsEntry['metadata']): string {
  const phasesInfo = `${entry.phasesCompleted}/7 phases`;
  return `${entry.domain}. ${phasesInfo}. Confidence: ${entry.overallConfidence.toFixed(2)}. Industry: ${entry.industry}. Keywords: ${entry.keywordsDiscovered}`;
}

/**
 * Generate embedding text for CrossSitePatternEntry
 */
export function generateCrossSitePatternEmbeddingText(entry: CrossSitePatternEntry['metadata']): string {
  const industriesStr = entry.applicableIndustries.slice(0, 3).join(', ');
  return `${entry.patternType}: ${entry.description}. Industries: ${industriesStr}. Success: ${entry.overallConfidence.toFixed(2)}. Applied: ${entry.appliedCount}`;
}

// =============================================
// TTL and Freshness Management
// =============================================

/**
 * TTL in days for each onboarding collection type
 */
export const ONBOARDING_COLLECTION_TTL_DAYS = {
  [ONBOARDING_COLLECTIONS.SITE_PROFILES]: 180, // 6 months
  [ONBOARDING_COLLECTIONS.ONBOARDING_RESULTS]: 365, // 1 year
  [ONBOARDING_COLLECTIONS.CROSS_SITE_PATTERNS]: 365, // 1 year
} as const;

/**
 * Combined TTL for all SEO collections (existing + onboarding)
 */
export const ALL_SEO_COLLECTION_TTL_DAYS = {
  // Existing collections
  [ALL_SEO_COLLECTIONS.EXPERT_SOURCES]: Infinity, // Never expires
  [ALL_SEO_COLLECTIONS.STATISTICS]: 180, // 6 months
  [ALL_SEO_COLLECTIONS.KEYWORD_RESEARCH]: 90, // 3 months
  [ALL_SEO_COLLECTIONS.COMPETITOR_INTELLIGENCE]: 180, // 6 months
  [ALL_SEO_COLLECTIONS.SERP_PATTERNS]: 21, // 3 weeks
  [ALL_SEO_COLLECTIONS.CONTENT_PATTERNS]: Infinity, // Never expires
  // Onboarding collections
  [ALL_SEO_COLLECTIONS.SITE_PROFILES]: 180, // 6 months
  [ALL_SEO_COLLECTIONS.ONBOARDING_RESULTS]: 365, // 1 year
  [ALL_SEO_COLLECTIONS.CROSS_SITE_PATTERNS]: 365, // 1 year
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
// Redis Key Sanitization (Security)
// =============================================

/**
 * Sanitize user input for safe Redis key construction
 *
 * Prevents command injection attacks via special characters that can
 * alter Redis command syntax. This is critical for any user-supplied
 * input (domain names, user IDs, etc.) used in Redis key construction.
 *
 * CVSS 9.8: Prevents Redis command injection attacks
 *
 * @param input - User-supplied string (e.g., domain, username)
 * @returns Sanitized string safe for Redis key construction
 *
 * @example
 * ```typescript
 * const key = `seo:site:${sanitizeRedisKey('evil.com;CONFIG GET *')}:audit`;
 * // Result: seo:site:evil_com_config_get__audit
 * ```
 */
export function sanitizeRedisKey(input: string): string {
  if (!input || typeof input !== 'string') {
    return '_invalid_';
  }

  // Replace dangerous Redis/shell characters with underscores
  // Dangerous chars: :*?[]{}|<>;"'$&()`\n\r\t and whitespace
  let sanitized = input
    .replace(/[:*?[\]{}|<>;"'$&()`\n\r\t\s]/g, '_')
    .toLowerCase()
    .trim();

  // Collapse multiple consecutive underscores to single underscore
  sanitized = sanitized.replace(/_{2,}/g, '_');

  // Remove leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');

  // Ensure not empty after sanitization
  if (!sanitized) {
    return '_input_';
  }

  return sanitized;
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
 * Generate ID for SiteProfileEntry
 *
 * Sanitizes domain input to prevent injection attacks before ID creation
 */
export function generateSiteProfileId(domain: string): string {
  const sanitized = sanitizeRedisKey(domain);
  return normalizeForId(sanitized);
}

/**
 * Generate ID for OnboardingResultsEntry
 *
 * Sanitizes domain and runId inputs to prevent injection attacks
 */
export function generateOnboardingResultsId(domain: string, runId: string, runDate: Date): string {
  const dateStr = runDate.toISOString().split('T')[0];
  const sanitizedDomain = sanitizeRedisKey(domain);
  const sanitizedRunId = sanitizeRedisKey(runId);
  return `${normalizeForId(sanitizedDomain)}:${dateStr}:${sanitizedRunId}`;
}

/**
 * Generate ID for CrossSitePatternEntry
 *
 * Sanitizes pattern type and industry inputs to prevent injection attacks
 */
export function generateCrossSitePatternId(patternType: CrossSitePatternType, industry: string, description: string): string {
  const sanitizedPatternType = sanitizeRedisKey(patternType);
  const sanitizedIndustry = sanitizeRedisKey(industry);
  const hash = description
    .toLowerCase()
    .split('')
    .reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
  return `${normalizeForId(sanitizedPatternType)}:${normalizeForId(sanitizedIndustry)}:${Math.abs(hash).toString(16)}`;
}

// =============================================
// Query Helpers for Pre-Research Lookups
// =============================================

/**
 * Query parameters for site profile lookup
 */
export interface QuerySiteProfileParams {
  /** Domain to look up */
  domain: string;

  /** Minimum freshness score required (0.0-1.0) */
  minFreshnessScore?: number;

  /** Industry filter (optional) */
  industry?: string;
}

/**
 * Query parameters for onboarding results lookup
 */
export interface QueryOnboardingResultsParams {
  /** Domain to look up */
  domain: string;

  /** Industry filter (optional) */
  industry?: string;

  /** Minimum completion percentage (0-100) */
  minCompletionPercent?: number;

  /** Minimum confidence score (0.0-1.0) */
  minConfidence?: number;

  /** Look only at successful runs */
  successfulOnly?: boolean;
}

/**
 * Query parameters for cross-site pattern lookup
 */
export interface QueryCrossSitePatternParams {
  /** Pattern type filter */
  patternType?: CrossSitePatternType;

  /** Industry filter */
  industry: string;

  /** Minimum confidence score (0.0-1.0) */
  minConfidence?: number;

  /** Minimum success rate (0.0-1.0) */
  minSuccessRate?: number;

  /** Site size requirement */
  siteSizeFilter?: 'small' | 'medium' | 'large' | 'enterprise';

  /** Minimum freshness score (0.0-1.0) */
  minFreshnessScore?: number;
}

/**
 * Helper type for RuVector query results
 */
export interface RuVectorQueryResult<T> {
  /** Matching entries */
  entries: T[];

  /** Total matches found */
  totalMatches: number;

  /** Whether there are more results */
  hasMore: boolean;

  /** Query confidence score */
  queryConfidence: number;
}

/**
 * Helper type for pre-research check result
 */
export interface PreResearchCheckResult {
  /** Whether cached data was found */
  cacheHit: boolean;

  /** Cached entry if found */
  cachedEntry?: SiteProfileEntry | OnboardingResultsEntry;

  /** Recommendation to proceed or reuse */
  recommendation: 'proceed' | 'reuse' | 'update';

  /** Explanation of recommendation */
  explanation: string;
}

/**
 * Build query string for site profile lookup
 *
 * Example usage:
 * ```typescript
 * const queryStr = buildSiteProfileQueryString({
 *   domain: 'example.com',
 *   minFreshnessScore: 0.7,
 *   industry: 'healthcare'
 * });
 * // Use with RuVector semantic search
 * ```
 */
export function buildSiteProfileQueryString(params: QuerySiteProfileParams): string {
  const parts: string[] = [];
  // Sanitize domain to prevent injection attacks in query construction
  parts.push(`domain:${sanitizeRedisKey(params.domain)}`);

  if (params.minFreshnessScore !== undefined) {
    parts.push(`freshness:${params.minFreshnessScore.toFixed(2)}`);
  }

  if (params.industry) {
    // Sanitize industry to prevent injection attacks
    parts.push(`industry:${sanitizeRedisKey(params.industry)}`);
  }

  return parts.join(' ');
}

/**
 * Build query string for onboarding results lookup
 *
 * Example usage:
 * ```typescript
 * const queryStr = buildOnboardingResultsQueryString({
 *   domain: 'example.com',
 *   industry: 'ecommerce',
 *   minConfidence: 0.8
 * });
 * // Use with RuVector semantic search
 * ```
 */
export function buildOnboardingResultsQueryString(params: QueryOnboardingResultsParams): string {
  const parts: string[] = [];
  // Sanitize domain to prevent injection attacks in query construction
  parts.push(`domain:${sanitizeRedisKey(params.domain)}`);

  if (params.industry) {
    // Sanitize industry to prevent injection attacks
    parts.push(`industry:${sanitizeRedisKey(params.industry)}`);
  }

  if (params.minCompletionPercent !== undefined) {
    parts.push(`completion:${params.minCompletionPercent}`);
  }

  if (params.minConfidence !== undefined) {
    parts.push(`confidence:${params.minConfidence.toFixed(2)}`);
  }

  if (params.successfulOnly) {
    parts.push('status:successful');
  }

  return parts.join(' ');
}

/**
 * Build query string for cross-site pattern lookup
 *
 * Example usage:
 * ```typescript
 * const queryStr = buildCrossSitePatternQueryString({
 *   industry: 'saas',
 *   patternType: 'CONTENT_STRUCTURE',
 *   minConfidence: 0.8
 * });
 * // Use with RuVector semantic search
 * ```
 */
export function buildCrossSitePatternQueryString(params: QueryCrossSitePatternParams): string {
  const parts: string[] = [];
  // Sanitize industry to prevent injection attacks
  parts.push(`industry:${sanitizeRedisKey(params.industry)}`);

  if (params.patternType) {
    // Sanitize pattern type to prevent injection attacks
    parts.push(`type:${sanitizeRedisKey(params.patternType)}`);
  }

  if (params.minConfidence !== undefined) {
    parts.push(`confidence:${params.minConfidence.toFixed(2)}`);
  }

  if (params.minSuccessRate !== undefined) {
    parts.push(`successRate:${params.minSuccessRate.toFixed(2)}`);
  }

  if (params.siteSizeFilter) {
    // Sanitize site size filter to prevent injection attacks
    parts.push(`siteSize:${sanitizeRedisKey(params.siteSizeFilter)}`);
  }

  if (params.minFreshnessScore !== undefined) {
    parts.push(`freshness:${params.minFreshnessScore.toFixed(2)}`);
  }

  return parts.join(' ');
}

// =============================================
// Post-Research Storage Helpers
// =============================================

/**
 * Helper to create a SiteProfileEntry from phase outputs
 *
 * Used after Phase 1 (Technical Foundation) completes
 */
export function createSiteProfileEntry(
  domain: string,
  industry: string,
  niche: string,
  phaseOutput: PhaseOutput,
  technicalMetrics: TechnicalHealthMetric[],
  crawlData: SiteProfileCrawlData,
  additionalMetadata: Partial<SiteProfileEntry['metadata']> = {}
): SiteProfileEntry {
  const metadata: SiteProfileEntry['metadata'] = {
    domain,
    domainNormalized: normalizeForId(domain),
    industry,
    siteSize: crawlData.totalPages < 100 ? 'small' : crawlData.totalPages < 1000 ? 'medium' : 'large',
    niche,
    technicalHealthScore: technicalMetrics.reduce((sum, m) => sum + m.score, 0) / (technicalMetrics.length || 1),
    technicalMetrics,
    crawlData,
    totalPages: crawlData.totalPages,
    avgWordCount: 500, // Default, should be calculated
    thinContentPercent: 0, // Should be calculated
    blockingConditionScore: technicalMetrics.some((m) => m.status === 'needs_improvement') ? 0.3 : 0.8,
    blockingIssues: technicalMetrics.filter((m) => m.status === 'needs_improvement').map((m) => m.name),
    topPriorityIssues: technicalMetrics
      .filter((m) => m.status === 'needs_improvement')
      .slice(0, 3)
      .map((m) => m.name),
    quickWins: [],
    firstAnalyzedAt: new Date(),
    lastAnalyzedAt: new Date(),
    analysisCount: 1,
    onboardingRunIds: [],
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
    freshnessScore: 1.0,
    ...additionalMetadata,
  };

  const id = generateSiteProfileId(domain);
  const text = generateSiteProfileEmbeddingText(metadata);

  return {
    id,
    text,
    metadata,
  };
}

/**
 * Helper to create an OnboardingResultsEntry from completed onboarding run
 *
 * Used after onboarding phases 1-7 complete
 */
export function createOnboardingResultsEntry(
  domain: string,
  runId: string,
  industry: string,
  niche: string,
  phaseOutputs: PhaseOutput[],
  additionalMetadata: Partial<OnboardingResultsEntry['metadata']> = {}
): OnboardingResultsEntry {
  const phasesCompleted = phaseOutputs.filter((p) => p.status === 'completed').length;
  const completionPercent = (phasesCompleted / 7) * 100;
  const confidenceScores = phaseOutputs.map((p) => p.confidence);
  const overallConfidence = confidenceScores.reduce((sum, c) => sum + c, 0) / (confidenceScores.length || 1);

  const metadata: OnboardingResultsEntry['metadata'] = {
    domain,
    domainNormalized: normalizeForId(domain),
    runId,
    industry,
    niche,
    providedCompetitors: [],
    phaseOutputs,
    phasesCompleted,
    completionPercent,
    keywordsDiscovered: 0,
    contentGapsIdentified: 0,
    competitorsAnalyzed: 0,
    quickWinsCount: 0,
    overallConfidence,
    confidenceByPhase: phaseOutputs.reduce(
      (acc, p) => {
        acc[p.phaseNumber] = p.confidence;
        return acc;
      },
      {} as Record<number, number>
    ),
    wasBlocked: overallConfidence < 0.5,
    blockingReason: overallConfidence < 0.5 ? 'Low overall confidence' : undefined,
    technicalHealthScoreAtStart: 0.5,
    apiCallsMade: 0,
    apiCallsCached: 0,
    estimatedCostSavings: 0,
    cacheHitRate: 0,
    topRecommendations: [],
    roadmapMilestones: [],
    startedAt: new Date(),
    completedAt: new Date(),
    durationMinutes: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 365 days
    freshnessScore: 1.0,
    relatedPatternIds: [],
    ...additionalMetadata,
  };

  const runDate = new Date();
  const id = generateOnboardingResultsId(domain, runId, runDate);
  const text = generateOnboardingResultsEmbeddingText(metadata);

  return {
    id,
    text,
    metadata,
  };
}

/**
 * Helper to create a CrossSitePatternEntry from validated patterns
 *
 * Used after pattern extraction (Step 12.5) confirms pattern effectiveness
 */
export function createCrossSitePatternEntry(
  patternType: CrossSitePatternType,
  industry: string,
  description: string,
  implementationSteps: string[],
  successMetrics: IndustrySuccessMetric[],
  additionalMetadata: Partial<CrossSitePatternEntry['metadata']> = {}
): CrossSitePatternEntry {
  const overallConfidence =
    successMetrics.length > 0
      ? successMetrics.reduce((sum, m) => sum + m.confidence, 0) / successMetrics.length
      : 0.5;

  const metadata: CrossSitePatternEntry['metadata'] = {
    patternType,
    description,
    reasoning: 'Based on successful implementations across sites',
    implementationSteps,
    resourcesNeeded: [],
    estimatedEffort: 20,
    timeToResults: 30,
    applicableIndustries: [industry],
    industrySuccessMetrics: successMetrics,
    targetNiches: [industry],
    minSiteSize: 'small',
    worksBothB2BAndB2C: true,
    overallConfidence,
    typicalOutcomes: [],
    commonPitfalls: [],
    sourceProfileIds: [],
    validatingRunIds: [],
    appliedCount: 1,
    successCount: 1,
    successRate: 1.0,
    identifiedAt: new Date(),
    lastValidatedAt: new Date(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 365 days
    freshnessScore: 1.0,
    relatedContentPatternIds: [],
    relatedCompetitorIntelligenceIds: [],
    ...additionalMetadata,
  };

  const id = generateCrossSitePatternId(patternType, industry, description);
  const text = generateCrossSitePatternEmbeddingText(metadata);

  return {
    id,
    text,
    metadata,
  };
}

// =============================================
// Exports Summary
// =============================================

/**
 * All exported types and functions for onboarding RuVector integration:
 *
 * Collections:
 * - ONBOARDING_COLLECTIONS
 * - ALL_SEO_COLLECTIONS
 *
 * Interfaces:
 * - SiteProfileEntry, OnboardingResultsEntry, CrossSitePatternEntry
 * - Supporting types (PhaseOutput, TechnicalHealthMetric, etc.)
 *
 * Type Guards:
 * - isSiteProfileEntry(), isOnboardingResultsEntry(), isCrossSitePatternEntry()
 *
 * Embedding Generators:
 * - generateSiteProfileEmbeddingText()
 * - generateOnboardingResultsEmbeddingText()
 * - generateCrossSitePatternEmbeddingText()
 *
 * TTL & Freshness:
 * - ONBOARDING_COLLECTION_TTL_DAYS, ALL_SEO_COLLECTION_TTL_DAYS
 * - calculateFreshnessScore(), isEntryStale()
 *
 * ID Generation:
 * - generateSiteProfileId(), generateOnboardingResultsId(), generateCrossSitePatternId()
 *
 * Query Helpers (Pre-Research):
 * - buildSiteProfileQueryString()
 * - buildOnboardingResultsQueryString()
 * - buildCrossSitePatternQueryString()
 *
 * Storage Helpers (Post-Research):
 * - createSiteProfileEntry(), createOnboardingResultsEntry(), createCrossSitePatternEntry()
 */
