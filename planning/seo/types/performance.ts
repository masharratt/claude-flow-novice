/**
 * Performance Tracking System - Type Definitions
 *
 * @module planning/seo/types/performance
 * @description Comprehensive type-safe definitions for content and pattern performance tracking
 *              Enables type-safe evaluation of performance metrics across time windows
 * @version 1.0.0
 * @phase 5
 * @sprint 2
 */

// ============================================================================
// TIME WINDOW TYPES
// ============================================================================

/**
 * Time window classification for performance metrics
 * - initial: First 30 days after content publication
 * - short-term: 1-3 months performance tracking
 * - long-term: 3+ months sustained performance
 */
export type TimeWindow = 'initial' | 'short-term' | 'long-term';

/**
 * Type guard to validate TimeWindow values
 * Ensures type safety at runtime with exhaustive checks
 */
export function isValidTimeWindow(value: unknown): value is TimeWindow {
  return (
    typeof value === 'string' &&
    ['initial', 'short-term', 'long-term'].includes(value)
  );
}

/**
 * Time window boundaries in days
 * Provides mapping between time windows and day ranges
 */
export const TIME_WINDOW_BOUNDARIES = {
  INITIAL: { min: 0, max: 30 },
  SHORT_TERM: { min: 31, max: 90 },
  LONG_TERM: { min: 91, max: Infinity },
} as const;

/**
 * Get time window from days since publication
 * Pure function for deterministic window classification
 */
export function getTimeWindowFromDays(daysSincePublication: number): TimeWindow {
  if (daysSincePublication <= TIME_WINDOW_BOUNDARIES.INITIAL.max) return 'initial';
  if (daysSincePublication <= TIME_WINDOW_BOUNDARIES.SHORT_TERM.max) return 'short-term';
  return 'long-term';
}

// ============================================================================
// PERFORMANCE METRICS TYPES
// ============================================================================

/**
 * Ranking metrics for content performance
 * Immutable after creation (readonly properties)
 */
export interface RankingMetrics {
  /** Current average ranking position (1-100+) */
  readonly averagePosition: number;

  /** Best ranking position achieved */
  readonly bestPosition: number;

  /** Worst ranking position in period */
  readonly worstPosition: number;

  /** Keywords ranked in top 3 */
  readonly topThreeCount: number;

  /** Keywords ranked in top 10 */
  readonly topTenCount: number;

  /** Keywords ranked in top 50 */
  readonly topFiftyCount: number;

  /** Keywords ranked in top 100 */
  readonly topHundredCount: number;

  /** Total keywords being tracked */
  readonly totalKeywordsTracked: number;

  /** Ranking movement trend (positive = improving) */
  readonly trendDirection: number;

  /** Volatility score (0.0-1.0, higher = more volatile) */
  readonly volatilityScore: number;
}

/**
 * Type guard for RankingMetrics
 */
export function isValidRankingMetrics(value: unknown): value is RankingMetrics {
  if (typeof value !== 'object' || value === null) return false;

  const m = value as Record<string, unknown>;

  // Check all required numeric properties exist and are non-negative
  const requiredNumericFields = [
    'averagePosition',
    'bestPosition',
    'worstPosition',
    'topThreeCount',
    'topTenCount',
    'topFiftyCount',
    'topHundredCount',
    'totalKeywordsTracked',
  ];

  for (const field of requiredNumericFields) {
    if (typeof m[field] !== 'number' || m[field] < 0 || !Number.isFinite(m[field])) {
      return false;
    }
  }

  // Check trend direction is a number
  if (typeof m.trendDirection !== 'number' || !Number.isFinite(m.trendDirection)) {
    return false;
  }

  // Check volatility is between 0.0 and 1.0
  if (typeof m.volatilityScore !== 'number' || m.volatilityScore < 0 || m.volatilityScore > 1) {
    return false;
  }

  // Validate position relationships
  if ((m.bestPosition as number) > (m.averagePosition as number)) return false;
  if ((m.averagePosition as number) > (m.worstPosition as number)) return false;

  return true;
}

/**
 * Traffic metrics for content performance
 * Immutable after creation (readonly properties)
 */
export interface TrafficMetrics {
  /** Total organic impressions (estimated from CTR data) */
  readonly totalImpressions: number;

  /** Total organic clicks from search */
  readonly totalClicks: number;

  /** Organic traffic change percentage vs previous period */
  readonly changePercentage: number;

  /** Daily average organic traffic */
  readonly dailyAverageTraffic: number;

  /** Peak daily traffic in period */
  readonly peakDailyTraffic: number;

  /** Traffic trend direction (positive = growing) */
  readonly trendDirection: number;

  /** Consistency score (0.0-1.0, higher = more consistent) */
  readonly consistencyScore: number;
}

/**
 * Type guard for TrafficMetrics
 */
export function isValidTrafficMetrics(value: unknown): value is TrafficMetrics {
  if (typeof value !== 'object' || value === null) return false;

  const m = value as Record<string, unknown>;

  const requiredNumericFields = [
    'totalImpressions',
    'totalClicks',
    'changePercentage',
    'dailyAverageTraffic',
    'peakDailyTraffic',
  ];

  for (const field of requiredNumericFields) {
    if (typeof m[field] !== 'number' || m[field] < 0 || !Number.isFinite(m[field])) {
      return false;
    }
  }

  if (typeof m.trendDirection !== 'number' || !Number.isFinite(m.trendDirection)) {
    return false;
  }

  if (typeof m.consistencyScore !== 'number' || m.consistencyScore < 0 || m.consistencyScore > 1) {
    return false;
  }

  return true;
}

/**
 * Click-through rate metrics
 * Immutable after creation (readonly properties)
 */
export interface CTRMetrics {
  /** Average click-through rate (0.0-1.0) */
  readonly averageCTR: number;

  /** Best day CTR in period */
  readonly bestDayCTR: number;

  /** Worst day CTR in period */
  readonly worstDayCTR: number;

  /** CTR change from previous period */
  readonly ctrChange: number;

  /** CTR trend (positive = improving) */
  readonly trendDirection: number;

  /** Industry benchmark CTR for this position range */
  readonly benchmarkCTR: number;

  /** How much above/below benchmark (0.0-1.0 scale) */
  readonly benchmarkDeviation: number;
}

/**
 * Type guard for CTRMetrics
 */
export function isValidCTRMetrics(value: unknown): value is CTRMetrics {
  if (typeof value !== 'object' || value === null) return false;

  const m = value as Record<string, unknown>;

  const requiredCTRFields = [
    'averageCTR',
    'bestDayCTR',
    'worstDayCTR',
    'ctrChange',
    'trendDirection',
    'benchmarkCTR',
    'benchmarkDeviation',
  ];

  for (const field of requiredCTRFields) {
    if (typeof m[field] !== 'number' || !Number.isFinite(m[field])) {
      return false;
    }
  }

  // Validate CTR values are between 0.0 and 1.0
  if (
    typeof m.averageCTR !== 'number' ||
    m.averageCTR < 0 ||
    m.averageCTR > 1
  ) {
    return false;
  }

  if (typeof m.bestDayCTR !== 'number' || m.bestDayCTR < 0 || m.bestDayCTR > 1) {
    return false;
  }

  if (
    typeof m.worstDayCTR !== 'number' ||
    m.worstDayCTR < 0 ||
    m.worstDayCTR > 1
  ) {
    return false;
  }

  return true;
}

/**
 * Conversion metrics
 * Immutable after creation (readonly properties)
 */
export interface ConversionMetrics {
  /** Total conversions attributed to this content */
  readonly totalConversions: number;

  /** Conversion rate (0.0-1.0) */
  readonly conversionRate: number;

  /** Average value per conversion */
  readonly averageConversionValue: number;

  /** Total revenue attributed */
  readonly totalRevenue: number;

  /** Conversion trend (positive = improving) */
  readonly trendDirection: number;

  /** Conversion type (e.g., 'signup', 'purchase', 'contact') */
  readonly conversionType: string;

  /** Attribution window in days */
  readonly attributionWindow: number;
}

/**
 * Type guard for ConversionMetrics
 */
export function isValidConversionMetrics(value: unknown): value is ConversionMetrics {
  if (typeof value !== 'object' || value === null) return false;

  const m = value as Record<string, unknown>;

  const requiredFields = [
    'totalConversions',
    'conversionRate',
    'averageConversionValue',
    'totalRevenue',
    'trendDirection',
    'attributionWindow',
  ];

  for (const field of requiredFields) {
    if (typeof m[field] !== 'number' || m[field] < 0 || !Number.isFinite(m[field])) {
      return false;
    }
  }

  if (typeof m.conversionRate !== 'number' || m.conversionRate > 1) {
    return false;
  }

  if (typeof m.conversionType !== 'string' || m.conversionType.length === 0) {
    return false;
  }

  return true;
}

/**
 * Aggregated performance metrics across all dimensions
 * Immutable after creation (readonly properties)
 */
export interface PerformanceMetrics {
  /** Ranking performance data */
  readonly ranking: RankingMetrics;

  /** Traffic performance data */
  readonly traffic: TrafficMetrics;

  /** CTR performance data */
  readonly ctr: CTRMetrics;

  /** Conversion performance data (optional, may not be tracked) */
  readonly conversions?: Readonly<ConversionMetrics>;

  /** Overall performance score (0.0-1.0) */
  readonly overallScore: number;

  /** Metrics calculation timestamp */
  readonly calculatedAt: string;
}

/**
 * Type guard for PerformanceMetrics
 */
export function isValidPerformanceMetrics(value: unknown): value is PerformanceMetrics {
  if (typeof value !== 'object' || value === null) return false;

  const m = value as Record<string, unknown>;

  // Check required metrics sections
  if (!isValidRankingMetrics(m.ranking)) return false;
  if (!isValidTrafficMetrics(m.traffic)) return false;
  if (!isValidCTRMetrics(m.ctr)) return false;

  // Check optional conversions
  if (m.conversions !== undefined && !isValidConversionMetrics(m.conversions)) {
    return false;
  }

  // Check overall score
  if (typeof m.overallScore !== 'number' || m.overallScore < 0 || m.overallScore > 1) {
    return false;
  }

  // Check timestamp
  if (typeof m.calculatedAt !== 'string') {
    return false;
  }

  // Validate ISO 8601 timestamp
  if (Number.isNaN(Date.parse(m.calculatedAt as string))) {
    return false;
  }

  return true;
}

// ============================================================================
// CONTENT PERFORMANCE TYPES
// ============================================================================

/**
 * Content performance tracking data
 * Represents comprehensive performance metrics for a single piece of content
 * Immutable after creation (readonly properties)
 */
export interface ContentPerformance {
  /** Unique content identifier (URL slug or internal ID) */
  readonly contentId: string;

  /** Content URL */
  readonly contentUrl: string;

  /** Target keyword for this content */
  readonly targetKeyword: string;

  /** Primary topic covered */
  readonly topic: string;

  /** Content type (article, guide, blog, etc.) */
  readonly contentType: string;

  /** Publication date (ISO 8601) */
  readonly publishedAt: string;

  /** Time window for these metrics */
  readonly timeWindow: TimeWindow;

  /** Days since publication */
  readonly daysSincePublication: number;

  /** Performance metrics for this content */
  readonly metrics: PerformanceMetrics;

  /** Primary keywords and their rankings */
  readonly keywordPerformance: ReadonlyArray<Readonly<{
    keyword: string;
    currentPosition: number;
    previousPosition: number;
    impressions: number;
    clicks: number;
  }>>;

  /** Patterns applied to this content */
  readonly appliedPatterns: ReadonlyArray<Readonly<{
    patternId: string;
    patternName: string;
    appliedAt: string;
    impactScore: number;
  }>>;

  /** Algorithm updates that may have impacted this content */
  readonly affectedByUpdates: ReadonlyArray<Readonly<{
    updateId: string;
    updateName: string;
    updateDate: string;
    estimatedImpact: number;
  }>>;

  /** Last time metrics were updated */
  readonly metricsUpdatedAt: string;

  /** Data source (gsc, ga4, analytics) */
  readonly dataSource: string;

  /** Domain where content is hosted */
  readonly domain: string;

  /** Optional metadata for extensibility */
  readonly metadata?: Readonly<{
    /** Internal notes about performance */
    readonly notes?: string;

    /** Custom tags for categorization */
    readonly tags?: ReadonlyArray<string>;

    /** Confidence score in metrics accuracy (0.0-1.0) */
    readonly confidence?: number;

    /** Manual review status */
    readonly reviewStatus?: 'pending' | 'reviewed' | 'flagged';

    /** Additional performance attributes */
    readonly [key: string]: unknown;
  }>;
}

/**
 * Type guard for ContentPerformance with exhaustive property validation
 */
export function isValidContentPerformance(value: unknown): value is ContentPerformance {
  if (typeof value !== 'object' || value === null) return false;

  const cp = value as Record<string, unknown>;

  // Validate string fields
  const stringFields = ['contentId', 'contentUrl', 'targetKeyword', 'topic', 'contentType', 'publishedAt', 'dataSource', 'domain', 'metricsUpdatedAt'];
  for (const field of stringFields) {
    if (typeof cp[field] !== 'string' || (cp[field] as string).length === 0) {
      return false;
    }
  }

  // Validate TimeWindow
  if (!isValidTimeWindow(cp.timeWindow)) return false;

  // Validate numeric fields
  if (typeof cp.daysSincePublication !== 'number' || cp.daysSincePublication < 0) {
    return false;
  }

  // Validate metrics
  if (!isValidPerformanceMetrics(cp.metrics)) return false;

  // Validate arrays
  if (!Array.isArray(cp.keywordPerformance)) return false;
  if (!Array.isArray(cp.appliedPatterns)) return false;
  if (!Array.isArray(cp.affectedByUpdates)) return false;

  // Validate timestamps are valid ISO 8601
  if (Number.isNaN(Date.parse(cp.publishedAt as string))) return false;
  if (Number.isNaN(Date.parse(cp.metricsUpdatedAt as string))) return false;

  // Validate optional metadata
  if (cp.metadata !== undefined && typeof cp.metadata !== 'object') {
    return false;
  }

  return true;
}

// ============================================================================
// ALGORITHM UPDATE IMPACT TYPES
// ============================================================================

/**
 * Impact of a Google algorithm update on content performance
 * Immutable after creation (readonly properties)
 */
export interface AlgorithmUpdateImpact {
  /** Unique update identifier */
  readonly updateId: string;

  /** Update name (e.g., 'Core Update September 2024') */
  readonly updateName: string;

  /** Update announcement date (ISO 8601) */
  readonly announcedAt: string;

  /** Update deployment date (ISO 8601) */
  readonly deployedAt: string;

  /** Content ID that was affected */
  readonly contentId: string;

  /** Target keyword of affected content */
  readonly targetKeyword: string;

  /** Ranking change after update (negative = loss, positive = gain) */
  readonly rankingChange: number;

  /** Previous ranking before update */
  readonly previousRanking: number;

  /** Ranking after update */
  readonly currentRanking: number;

  /** Traffic impact percentage */
  readonly trafficImpactPercentage: number;

  /** Visibility score change */
  readonly visibilityChange: number;

  /** Estimated impact severity (0.0-1.0, higher = more severe) */
  readonly impactSeverity: number;

  /** Whether content recovered from impact */
  readonly hasRecovered: boolean;

  /** Days until recovery (if recovered) */
  readonly daysToRecovery?: number;

  /** Recovery actions taken */
  readonly recoveryActions: ReadonlyArray<string>;

  /** Assessment timestamp */
  readonly assessedAt: string;

  /** Detailed impact notes */
  readonly notes?: string;
}

/**
 * Type guard for AlgorithmUpdateImpact
 */
export function isValidAlgorithmUpdateImpact(value: unknown): value is AlgorithmUpdateImpact {
  if (typeof value !== 'object' || value === null) return false;

  const a = value as Record<string, unknown>;

  // Validate string fields
  const requiredStringFields = ['updateId', 'updateName', 'contentId', 'targetKeyword', 'assessedAt'];
  for (const field of requiredStringFields) {
    if (typeof a[field] !== 'string' || (a[field] as string).length === 0) {
      return false;
    }
  }

  // Validate numeric fields
  const numericFields = [
    'rankingChange',
    'previousRanking',
    'currentRanking',
    'trafficImpactPercentage',
    'visibilityChange',
    'impactSeverity',
  ];
  for (const field of numericFields) {
    if (typeof a[field] !== 'number' || !Number.isFinite(a[field])) {
      return false;
    }
  }

  // Validate severity is 0.0-1.0
  if ((a.impactSeverity as number) < 0 || (a.impactSeverity as number) > 1) {
    return false;
  }

  // Validate boolean field
  if (typeof a.hasRecovered !== 'boolean') return false;

  // Validate optional daysToRecovery
  if (a.daysToRecovery !== undefined && (typeof a.daysToRecovery !== 'number' || a.daysToRecovery < 0)) {
    return false;
  }

  // Validate recovery actions array
  if (!Array.isArray(a.recoveryActions)) return false;

  // Validate timestamps
  if (Number.isNaN(Date.parse(a.announcedAt as string))) return false;
  if (Number.isNaN(Date.parse(a.deployedAt as string))) return false;
  if (Number.isNaN(Date.parse(a.assessedAt as string))) return false;

  return true;
}

// ============================================================================
// PATTERN PERFORMANCE CORRELATION TYPES
// ============================================================================

/**
 * Correlation between pattern application and performance outcome
 * Immutable after creation (readonly properties)
 */
export interface PatternPerformanceCorrelation {
  /** Pattern ID that was applied */
  readonly patternId: string;

  /** Pattern name */
  readonly patternName: string;

  /** Content ID where pattern was applied */
  readonly contentId: string;

  /** Target keyword */
  readonly targetKeyword: string;

  /** Pattern application date (ISO 8601) */
  readonly appliedAt: string;

  /** Time window after application for analysis */
  readonly timeWindowAnalyzed: TimeWindow;

  /** Ranking improvement attributed to pattern (position change) */
  readonly rankingImprovement: number;

  /** Traffic improvement percentage */
  readonly trafficImprovement: number;

  /** CTR improvement */
  readonly ctrImprovement: number;

  /** Conversion improvement */
  readonly conversionImprovement: number;

  /** Overall impact score (0.0-1.0) */
  readonly overallImpactScore: number;

  /** Confidence in correlation (0.0-1.0) */
  readonly correlationConfidence: number;

  /** Whether improvement is statistically significant */
  readonly isStatisticallySignificant: boolean;

  /** Confounding factors that may have influenced outcome */
  readonly confoundingFactors: ReadonlyArray<string>;

  /** Assessment timestamp */
  readonly assessedAt: string;

  /** Analysis notes */
  readonly notes?: string;
}

/**
 * Type guard for PatternPerformanceCorrelation
 */
export function isValidPatternPerformanceCorrelation(
  value: unknown
): value is PatternPerformanceCorrelation {
  if (typeof value !== 'object' || value === null) return false;

  const p = value as Record<string, unknown>;

  // Validate string fields
  const requiredStringFields = ['patternId', 'patternName', 'contentId', 'targetKeyword', 'appliedAt', 'assessedAt'];
  for (const field of requiredStringFields) {
    if (typeof p[field] !== 'string' || (p[field] as string).length === 0) {
      return false;
    }
  }

  // Validate TimeWindow
  if (!isValidTimeWindow(p.timeWindowAnalyzed)) return false;

  // Validate numeric fields (can be negative for decline)
  const numericFields = [
    'rankingImprovement',
    'trafficImprovement',
    'ctrImprovement',
    'conversionImprovement',
  ];
  for (const field of numericFields) {
    if (typeof p[field] !== 'number' || !Number.isFinite(p[field])) {
      return false;
    }
  }

  // Validate score fields (0.0-1.0)
  if (typeof p.overallImpactScore !== 'number' || p.overallImpactScore < 0 || p.overallImpactScore > 1) {
    return false;
  }

  if (typeof p.correlationConfidence !== 'number' || p.correlationConfidence < 0 || p.correlationConfidence > 1) {
    return false;
  }

  // Validate boolean field
  if (typeof p.isStatisticallySignificant !== 'boolean') return false;

  // Validate arrays
  if (!Array.isArray(p.confoundingFactors)) return false;

  // Validate timestamps
  if (Number.isNaN(Date.parse(p.appliedAt as string))) return false;
  if (Number.isNaN(Date.parse(p.assessedAt as string))) return false;

  return true;
}

// ============================================================================
// PERFORMANCE OUTCOME DISCRIMINATED UNION
// ============================================================================

/**
 * Success outcome from performance tracking
 */
export interface PerformanceSuccess {
  readonly type: 'success';
  readonly contentPerformance: ContentPerformance;
  readonly correlations: ReadonlyArray<PatternPerformanceCorrelation>;
  readonly timestamp: string;
}

/**
 * Failure outcome from performance tracking
 */
export interface PerformanceFailure {
  readonly type: 'failure';
  readonly contentId: string;
  readonly errorMessage: string;
  readonly errorCode: string;
  readonly timestamp: string;
}

/**
 * Partial success outcome (some data retrieved)
 */
export interface PerformancePartial {
  readonly type: 'partial';
  readonly contentPerformance: ContentPerformance;
  readonly correlations: ReadonlyArray<PatternPerformanceCorrelation>;
  readonly warnings: ReadonlyArray<string>;
  readonly timestamp: string;
}

/**
 * Discriminated union of all performance outcomes
 */
export type PerformanceOutcome = PerformanceSuccess | PerformanceFailure | PerformancePartial;

/**
 * Type guard for PerformanceOutcome - discriminator pattern
 */
export function isPerformanceSuccess(outcome: PerformanceOutcome): outcome is PerformanceSuccess {
  return outcome.type === 'success';
}

export function isPerformanceFailure(outcome: PerformanceOutcome): outcome is PerformanceFailure {
  return outcome.type === 'failure';
}

export function isPerformancePartial(outcome: PerformanceOutcome): outcome is PerformancePartial {
  return outcome.type === 'partial';
}

// ============================================================================
// BATCH PERFORMANCE OPERATION TYPES
// ============================================================================

/**
 * Batch performance ingestion request
 */
export interface BatchPerformanceIngestionRequest {
  /** Source of data (gsc, ga4) */
  readonly source: 'gsc' | 'ga4';

  /** Lookback period in days */
  readonly lookbackDays: number;

  /** List of content IDs to ingest (or empty for all) */
  readonly contentIds: ReadonlyArray<string>;

  /** Whether to dry-run without persisting */
  readonly dryRun: boolean;

  /** Optional metadata */
  readonly metadata?: Readonly<{
    readonly requestedBy?: string;
    readonly priority?: 'high' | 'normal' | 'low';
    readonly [key: string]: unknown;
  }>;
}

/**
 * Batch performance ingestion response
 */
export interface BatchPerformanceIngestionResponse {
  /** Total items processed */
  readonly processed: number;

  /** Items successfully ingested */
  readonly successful: number;

  /** Items that failed */
  readonly failed: number;

  /** Performance outcomes for each item */
  readonly outcomes: ReadonlyArray<PerformanceOutcome>;

  /** Execution time in milliseconds */
  readonly executionTimeMs: number;

  /** Response timestamp */
  readonly timestamp: string;
}

/**
 * Type guard for BatchPerformanceIngestionRequest
 */
export function isValidBatchPerformanceIngestionRequest(
  value: unknown
): value is BatchPerformanceIngestionRequest {
  if (typeof value !== 'object' || value === null) return false;

  const r = value as Record<string, unknown>;

  // Validate source
  if (typeof r.source !== 'string' || !['gsc', 'ga4'].includes(r.source)) {
    return false;
  }

  // Validate lookback days
  if (typeof r.lookbackDays !== 'number' || r.lookbackDays < 1 || r.lookbackDays > 730) {
    return false;
  }

  // Validate contentIds array
  if (!Array.isArray(r.contentIds)) return false;

  // Validate dryRun
  if (typeof r.dryRun !== 'boolean') return false;

  return true;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default performance scoring weights
 * Used to calculate overall performance score
 */
export const PERFORMANCE_SCORING_WEIGHTS = {
  RANKING: 0.25,
  TRAFFIC: 0.35,
  CTR: 0.20,
  CONVERSIONS: 0.15,
  CONSISTENCY: 0.05,
} as const;

/**
 * Time window day ranges for categorization
 */
export const TIME_WINDOW_DAYS = {
  INITIAL_MAX: 30,
  SHORT_TERM_MAX: 90,
  LONG_TERM_MIN: 91,
} as const;

/**
 * Default confidence thresholds
 */
export const PERFORMANCE_CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.65,
  LOW: 0.50,
} as const;

/**
 * Algorithm update impact severity thresholds
 */
export const ALGORITHM_IMPACT_SEVERITY_THRESHOLDS = {
  CRITICAL: 0.75,
  HIGH: 0.50,
  MEDIUM: 0.25,
  LOW: 0.0,
} as const;
