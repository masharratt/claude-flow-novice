/**
 * Content Performance Tracker - SEO Intelligence Integration Phase 5 Sprint 2
 *
 * @module planning/seo/lib/performance-tracker
 * @description Tracks content performance metrics from GSC/GA4 and correlates with applied patterns
 *              Provides structure for real GSC/GA4 API integration (currently mock-ready)
 * @version 1.0.0
 */

/**
 * Time window for performance analysis
 */
export type PerformanceTimeWindow = 'initial' | 'short-term' | 'long-term';

/**
 * Performance metric source
 */
export type MetricSource = 'gsc' | 'ga4' | 'manual' | 'synthetic';

/**
 * Ranking position change direction
 */
export type RankingTrend = 'up' | 'down' | 'stable' | 'new' | 'lost';

/**
 * Content performance metrics for a specific time window
 */
export interface ContentPerformanceMetrics {
  /** Average ranking position (1-100+) */
  averageRanking: number;

  /** Peak ranking position */
  peakRanking: number;

  /** Ranking change since previous period */
  rankingDelta: number;

  /** Ranking trend direction */
  rankingTrend: RankingTrend;

  /** Total impressions */
  impressions: number;

  /** Total clicks */
  clicks: number;

  /** Click-through rate (0.0-1.0) */
  ctr: number;

  /** Conversion count (if tracked) */
  conversions?: number;

  /** Conversion rate (0.0-1.0) */
  conversionRate?: number;

  /** Average time on page (seconds) */
  avgTimeOnPage?: number;

  /** Bounce rate (0.0-1.0) */
  bounceRate?: number;

  /** Pages per session */
  pagesPerSession?: number;

  /** Measurement start date */
  periodStart: string;

  /** Measurement end date */
  periodEnd: string;

  /** Time window type */
  timeWindow: PerformanceTimeWindow;

  /** Data source */
  source: MetricSource;
}

/**
 * Applied pattern reference for performance correlation
 */
export interface AppliedPatternReference {
  /** Pattern ID */
  patternId: string;

  /** Pattern name */
  patternName: string;

  /** Pattern type */
  patternType: 'content' | 'technical' | 'algorithm';

  /** Application date */
  appliedAt: string;

  /** Pattern confidence at time of application */
  confidenceAtApplication: number;

  /** Specific changes made (brief description) */
  changesDescription: string;
}

/**
 * Complete content performance record
 */
export interface ContentPerformance {
  /** Content ID (unique identifier) */
  contentId: string;

  /** Content URL */
  url: string;

  /** Primary target keyword */
  targetKeyword: string;

  /** Content title */
  title: string;

  /** Content publish/update date */
  publishedAt: string;

  /** Initial period metrics (0-14 days) */
  initialMetrics: ContentPerformanceMetrics;

  /** Short-term metrics (15-60 days) */
  shortTermMetrics?: ContentPerformanceMetrics;

  /** Long-term metrics (60+ days) */
  longTermMetrics?: ContentPerformanceMetrics;

  /** Patterns applied to this content */
  appliedPatterns: ReadonlyArray<AppliedPatternReference>;

  /** Last updated timestamp */
  lastUpdated: string;

  /** Content lifecycle stage */
  contentStage: 'new' | 'indexed' | 'ranking' | 'established' | 'declining';

  /** Performance notes/annotations */
  notes?: string;
}

/**
 * GSC API query parameters structure
 * Mirrors Google Search Console API for real integration
 */
export interface GSCQueryParams {
  /** Site URL */
  siteUrl: string;

  /** Start date (YYYY-MM-DD) */
  startDate: string;

  /** End date (YYYY-MM-DD) */
  endDate: string;

  /** Dimensions to group by */
  dimensions?: ('query' | 'page' | 'country' | 'device' | 'date')[];

  /** URL filter (exact, prefix, regex) */
  urlFilter?: string;

  /** Query filter */
  queryFilter?: string;

  /** Row limit */
  rowLimit?: number;

  /** Start row (pagination) */
  startRow?: number;
}

/**
 * GSC API response row structure
 */
export interface GSCResponseRow {
  /** Keys matching requested dimensions */
  keys: string[];

  /** Click count */
  clicks: number;

  /** Impression count */
  impressions: number;

  /** Click-through rate */
  ctr: number;

  /** Average position */
  position: number;
}

/**
 * GSC API response structure
 */
export interface GSCResponse {
  /** Response rows */
  rows: GSCResponseRow[];

  /** Response type indicator */
  responseAggregationType?: 'auto' | 'byPage' | 'byProperty';
}

/**
 * GA4 API query parameters structure
 * Mirrors Google Analytics 4 Data API for real integration
 */
export interface GA4QueryParams {
  /** GA4 Property ID */
  propertyId: string;

  /** Date range start */
  startDate: string;

  /** Date range end */
  endDate: string;

  /** Metrics to fetch */
  metrics: string[];

  /** Dimensions to group by */
  dimensions?: string[];

  /** Dimension filter (page path, etc.) */
  dimensionFilter?: Record<string, string>;

  /** Metric filter */
  metricFilter?: Record<string, number>;

  /** Row limit */
  limit?: number;

  /** Offset (pagination) */
  offset?: number;
}

/**
 * GA4 API response row structure
 */
export interface GA4ResponseRow {
  /** Dimension values */
  dimensionValues: Array<{ value: string }>;

  /** Metric values */
  metricValues: Array<{ value: string }>;
}

/**
 * GA4 API response structure
 */
export interface GA4Response {
  /** Response rows */
  rows: GA4ResponseRow[];

  /** Row count */
  rowCount?: number;

  /** Metadata */
  metadata?: {
    currencyCode?: string;
    timeZone?: string;
  };
}

/**
 * Performance tracker error
 */
export class PerformanceTrackerError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'FETCH_FAILED'
      | 'PARSE_FAILED'
      | 'STORAGE_FAILED'
      | 'VALIDATION_FAILED'
      | 'API_ERROR'
      | 'RATE_LIMIT_EXCEEDED',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'PerformanceTrackerError';
    Object.setPrototypeOf(this, PerformanceTrackerError.prototype);
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for PerformanceTimeWindow
 */
export function isValidTimeWindow(value: unknown): value is PerformanceTimeWindow {
  return typeof value === 'string' && ['initial', 'short-term', 'long-term'].includes(value);
}

/**
 * Type guard for MetricSource
 */
export function isValidMetricSource(value: unknown): value is MetricSource {
  return typeof value === 'string' && ['gsc', 'ga4', 'manual', 'synthetic'].includes(value);
}

/**
 * Type guard for RankingTrend
 */
export function isValidRankingTrend(value: unknown): value is RankingTrend {
  return typeof value === 'string' && ['up', 'down', 'stable', 'new', 'lost'].includes(value);
}

/**
 * Type guard for ContentPerformanceMetrics
 */
export function isValidContentPerformanceMetrics(
  value: unknown
): value is ContentPerformanceMetrics {
  if (typeof value !== 'object' || value === null) return false;

  const metrics = value as any;

  return (
    typeof metrics.averageRanking === 'number' &&
    metrics.averageRanking > 0 &&
    typeof metrics.peakRanking === 'number' &&
    metrics.peakRanking > 0 &&
    typeof metrics.rankingDelta === 'number' &&
    isValidRankingTrend(metrics.rankingTrend) &&
    typeof metrics.impressions === 'number' &&
    metrics.impressions >= 0 &&
    typeof metrics.clicks === 'number' &&
    metrics.clicks >= 0 &&
    typeof metrics.ctr === 'number' &&
    metrics.ctr >= 0 &&
    metrics.ctr <= 1 &&
    typeof metrics.periodStart === 'string' &&
    typeof metrics.periodEnd === 'string' &&
    isValidTimeWindow(metrics.timeWindow) &&
    isValidMetricSource(metrics.source)
  );
}

/**
 * Type guard for AppliedPatternReference
 */
export function isValidAppliedPatternReference(
  value: unknown
): value is AppliedPatternReference {
  if (typeof value !== 'object' || value === null) return false;

  const ref = value as any;

  return (
    typeof ref.patternId === 'string' &&
    ref.patternId.length > 0 &&
    typeof ref.patternName === 'string' &&
    typeof ref.patternType === 'string' &&
    ['content', 'technical', 'algorithm'].includes(ref.patternType) &&
    typeof ref.appliedAt === 'string' &&
    typeof ref.confidenceAtApplication === 'number' &&
    ref.confidenceAtApplication >= 0 &&
    ref.confidenceAtApplication <= 1 &&
    typeof ref.changesDescription === 'string'
  );
}

/**
 * Type guard for ContentPerformance
 */
export function isValidContentPerformance(value: unknown): value is ContentPerformance {
  if (typeof value !== 'object' || value === null) return false;

  const perf = value as any;

  return (
    typeof perf.contentId === 'string' &&
    perf.contentId.length > 0 &&
    typeof perf.url === 'string' &&
    perf.url.length > 0 &&
    typeof perf.targetKeyword === 'string' &&
    typeof perf.title === 'string' &&
    typeof perf.publishedAt === 'string' &&
    isValidContentPerformanceMetrics(perf.initialMetrics) &&
    Array.isArray(perf.appliedPatterns) &&
    perf.appliedPatterns.every(isValidAppliedPatternReference) &&
    typeof perf.lastUpdated === 'string' &&
    typeof perf.contentStage === 'string' &&
    ['new', 'indexed', 'ranking', 'established', 'declining'].includes(perf.contentStage)
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate time window based on days since publication
 *
 * @param daysSincePublish - Days since content was published
 * @returns Appropriate time window
 */
export function calculateTimeWindow(daysSincePublish: number): PerformanceTimeWindow {
  if (daysSincePublish <= 14) return 'initial';
  if (daysSincePublish <= 60) return 'short-term';
  return 'long-term';
}

/**
 * Calculate ranking trend from position change
 *
 * @param currentPosition - Current ranking position
 * @param previousPosition - Previous ranking position (or null if new)
 * @returns Ranking trend
 */
export function calculateRankingTrend(
  currentPosition: number | null,
  previousPosition: number | null
): RankingTrend {
  if (previousPosition === null) {
    return currentPosition === null ? 'lost' : 'new';
  }

  if (currentPosition === null) {
    return 'lost';
  }

  const delta = previousPosition - currentPosition; // Positive = improvement (lower position number)

  if (Math.abs(delta) <= 2) return 'stable';
  return delta > 0 ? 'up' : 'down';
}

/**
 * Determine content lifecycle stage based on metrics
 *
 * @param metrics - Current performance metrics
 * @param daysSincePublish - Days since content published
 * @returns Content lifecycle stage
 */
export function determineContentStage(
  metrics: ContentPerformanceMetrics,
  daysSincePublish: number
): ContentPerformance['contentStage'] {
  // New: 0-7 days, minimal data
  if (daysSincePublish <= 7 || metrics.impressions < 100) {
    return 'new';
  }

  // Indexed: 8-14 days, some impressions but low clicks
  if (daysSincePublish <= 14 || (metrics.impressions > 0 && metrics.clicks < 10)) {
    return 'indexed';
  }

  // Ranking: 15-60 days, gaining traction
  if (daysSincePublish <= 60 && metrics.averageRanking <= 50) {
    return 'ranking';
  }

  // Established: 60+ days, stable rankings
  if (daysSincePublish > 60 && metrics.rankingTrend !== 'down' && metrics.averageRanking <= 30) {
    return 'established';
  }

  // Declining: negative trend or poor rankings after initial period
  if (metrics.rankingTrend === 'down' || metrics.averageRanking > 50) {
    return 'declining';
  }

  return 'established';
}

/**
 * Normalize timestamp to ISO 8601 format
 *
 * @param timestamp - Timestamp to normalize
 * @returns ISO 8601 timestamp
 */
export function normalizeTimestamp(timestamp: Date | string | number): string {
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp');
    }

    return date.toISOString();
  } catch (error) {
    throw new PerformanceTrackerError(
      `Failed to normalize timestamp: ${timestamp}`,
      'VALIDATION_FAILED',
      error
    );
  }
}

/**
 * Validate URL format
 *
 * @param url - URL to validate
 * @returns True if valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize content ID (prevent injection)
 *
 * @param contentId - Content ID to sanitize
 * @returns Sanitized content ID
 */
export function sanitizeContentId(contentId: string): string {
  // Only allow alphanumeric, dash, underscore
  return contentId.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Calculate CTR from clicks and impressions
 *
 * @param clicks - Number of clicks
 * @param impressions - Number of impressions
 * @returns CTR (0.0-1.0)
 */
export function calculateCTR(clicks: number, impressions: number): number {
  if (impressions === 0) return 0;
  const ctr = clicks / impressions;
  return Math.max(0, Math.min(1, ctr)); // Clamp to [0, 1]
}

/**
 * Calculate conversion rate
 *
 * @param conversions - Number of conversions
 * @param clicks - Number of clicks
 * @returns Conversion rate (0.0-1.0)
 */
export function calculateConversionRate(conversions: number, clicks: number): number {
  if (clicks === 0) return 0;
  const rate = conversions / clicks;
  return Math.max(0, Math.min(1, rate)); // Clamp to [0, 1]
}

/**
 * Build GSC query for content performance
 *
 * @param url - Content URL
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns GSC query parameters
 */
export function buildGSCQuery(
  url: string,
  startDate: string,
  endDate: string
): GSCQueryParams {
  return {
    siteUrl: new URL(url).origin,
    startDate,
    endDate,
    dimensions: ['page', 'query', 'date'],
    urlFilter: url,
    rowLimit: 1000,
    startRow: 0,
  };
}

/**
 * Build GA4 query for content performance
 *
 * @param pagePath - Page path (without domain)
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns GA4 query parameters
 */
export function buildGA4Query(
  pagePath: string,
  startDate: string,
  endDate: string
): Omit<GA4QueryParams, 'propertyId'> {
  return {
    startDate,
    endDate,
    metrics: [
      'averageSessionDuration',
      'bounceRate',
      'conversions',
      'screenPageViews',
      'sessions',
    ],
    dimensions: ['pagePath', 'date'],
    dimensionFilter: { pagePath },
    limit: 1000,
    offset: 0,
  };
}

/**
 * Parse GSC response into metrics
 *
 * @param response - GSC API response
 * @param timeWindow - Time window for metrics
 * @returns Performance metrics
 */
export function parseGSCResponse(
  response: GSCResponse,
  timeWindow: PerformanceTimeWindow,
  periodStart: string,
  periodEnd: string
): ContentPerformanceMetrics {
  if (!response.rows || response.rows.length === 0) {
    // Return empty metrics
    return {
      averageRanking: 100,
      peakRanking: 100,
      rankingDelta: 0,
      rankingTrend: 'stable',
      impressions: 0,
      clicks: 0,
      ctr: 0,
      periodStart,
      periodEnd,
      timeWindow,
      source: 'gsc',
    };
  }

  // Aggregate metrics across all rows
  const totalClicks = response.rows.reduce((sum, row) => sum + row.clicks, 0);
  const totalImpressions = response.rows.reduce((sum, row) => sum + row.impressions, 0);
  const avgCTR = calculateCTR(totalClicks, totalImpressions);
  const avgPosition =
    response.rows.reduce((sum, row) => sum + row.position, 0) / response.rows.length;
  const peakPosition = Math.min(...response.rows.map((row) => row.position));

  return {
    averageRanking: Math.round(avgPosition),
    peakRanking: Math.round(peakPosition),
    rankingDelta: 0, // Requires historical comparison
    rankingTrend: 'stable', // Requires historical comparison
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr: avgCTR,
    periodStart,
    periodEnd,
    timeWindow,
    source: 'gsc',
  };
}

/**
 * Parse GA4 response into metrics (partial, for conversions/engagement)
 *
 * @param response - GA4 API response
 * @returns Partial metrics (conversions, engagement)
 */
export function parseGA4Response(response: GA4Response): Partial<ContentPerformanceMetrics> {
  if (!response.rows || response.rows.length === 0) {
    return {};
  }

  // GA4 metrics are indexed based on requested metrics order
  // Assuming: averageSessionDuration, bounceRate, conversions, screenPageViews, sessions
  const totalConversions = response.rows.reduce(
    (sum, row) => sum + parseFloat(row.metricValues[2]?.value || '0'),
    0
  );
  const totalSessions = response.rows.reduce(
    (sum, row) => sum + parseFloat(row.metricValues[4]?.value || '0'),
    0
  );
  const avgSessionDuration =
    response.rows.reduce(
      (sum, row) => sum + parseFloat(row.metricValues[0]?.value || '0'),
      0
    ) / response.rows.length;
  const avgBounceRate =
    response.rows.reduce(
      (sum, row) => sum + parseFloat(row.metricValues[1]?.value || '0'),
      0
    ) / response.rows.length;
  const totalPageViews = response.rows.reduce(
    (sum, row) => sum + parseFloat(row.metricValues[3]?.value || '0'),
    0
  );

  return {
    conversions: Math.round(totalConversions),
    conversionRate: totalSessions > 0 ? totalConversions / totalSessions : 0,
    avgTimeOnPage: Math.round(avgSessionDuration),
    bounceRate: avgBounceRate,
    pagesPerSession: totalSessions > 0 ? totalPageViews / totalSessions : 0,
  };
}

/**
 * Merge GSC and GA4 metrics into complete performance metrics
 *
 * @param gscMetrics - Metrics from GSC
 * @param ga4Metrics - Partial metrics from GA4
 * @returns Complete performance metrics
 */
export function mergePerformanceMetrics(
  gscMetrics: ContentPerformanceMetrics,
  ga4Metrics: Partial<ContentPerformanceMetrics>
): ContentPerformanceMetrics {
  return {
    ...gscMetrics,
    ...ga4Metrics,
    // Ensure source reflects merged data
    source: 'gsc' as MetricSource, // Primary source is GSC
  };
}
