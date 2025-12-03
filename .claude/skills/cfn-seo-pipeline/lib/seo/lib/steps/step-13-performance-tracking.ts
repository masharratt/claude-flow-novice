/**
 * Step 13: Performance Tracking & Feedback Loop
 * SEO Intelligence Integration Phase 5 Sprint 2
 *
 * @module planning/seo/lib/steps/step-13-performance-tracking
 * @description Orchestrates performance tracking, feedback processing, and algorithm correlation
 *              Integrates with GSC/GA4 (mock-ready structure) and updates pattern confidences
 * @version 1.0.0
 */

import Redis from 'ioredis';
import {
  ContentPerformance,
  ContentPerformanceMetrics,
  AppliedPatternReference,
  GSCQueryParams,
  GSCResponse,
  GA4QueryParams,
  GA4Response,
  PerformanceTrackerError,
  calculateTimeWindow,
  calculateRankingTrend,
  determineContentStage,
  buildGSCQuery,
  buildGA4Query,
  parseGSCResponse,
  parseGA4Response,
  mergePerformanceMetrics,
  sanitizeContentId,
  normalizeTimestamp,
  isValidContentPerformance,
} from '../performance-tracker';
import {
  processPerformanceFeedback,
  batchProcessPerformanceFeedback,
  detectAlgorithmUpdateCorrelation,
  AggregateFeedbackResult,
  AlgorithmCorrelation,
  ConfidenceAdjustmentRules,
  DEFAULT_ADJUSTMENT_RULES,
  PerformanceFeedbackError,
} from '../performance-feedback';
import { loadRiskDatabase } from '../algorithm-risk-scoring';
import {
  ConfidenceUpdater,
  ConfidenceUpdaterConfig,
  ConfidenceUpdateResult,
  PerformanceData,
} from '../ruvector/confidence-updater';
import type { SEOQueryManager } from '../ruvector/queries';

/**
 * Step 13 execution options
 */
export interface Step13Options {
  /** GSC Property ID (for real API) */
  gscPropertyId?: string;

  /** GA4 Property ID (for real API) */
  ga4PropertyId?: string;

  /** Use mock data instead of real API calls */
  useMockData?: boolean;

  /** Confidence adjustment rules */
  adjustmentRules?: ConfidenceAdjustmentRules;

  /** Enable algorithm correlation detection */
  detectAlgorithmCorrelation?: boolean;

  /** Algorithm correlation lookback days */
  correlationLookbackDays?: number;

  /** Pattern store key prefix */
  patternStore?: string;

  /** Verbose logging */
  verbose?: boolean;

  /** SEO Query Manager for RuVector operations */
  seoQueryManager?: SEOQueryManager;

  /** Enable RuVector confidence updates */
  enableRuVectorUpdates?: boolean;

  /** Confidence updater configuration */
  confidenceUpdaterConfig?: Partial<ConfidenceUpdaterConfig>;
}

/**
 * Step 13 execution result
 */
export interface Step13Result {
  /** Success status */
  success: boolean;

  /** Content pieces processed */
  contentProcessed: number;

  /** Patterns updated via feedback */
  patternsUpdated: number;

  /** Total confidence delta across all patterns */
  totalConfidenceDelta: number;

  /** Aggregate feedback results */
  feedbackResults: ReadonlyArray<AggregateFeedbackResult>;

  /** Algorithm correlations detected */
  algorithmCorrelations: ReadonlyArray<AlgorithmCorrelation>;

  /** Execution timestamp */
  executedAt: string;

  /** Execution duration (ms) */
  durationMs: number;

  /** Error message if failed */
  error?: string;

  /** Warnings or notes */
  warnings?: string[];

  /** RuVector confidence update results */
  ruVectorUpdates?: {
    patternsUpdated: number;
    expertsUpdated: number;
    statisticsUpdated: number;
    totalConfidenceDelta: number;
    individualUpdates: Array<{
      type: 'pattern' | 'expert' | 'statistic';
      id: string;
      name: string;
      delta: number;
      reason: string;
    }>;
  };
}

/**
 * Step 13 execution error
 */
export class Step13Error extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'EXECUTION_FAILED'
      | 'API_ERROR'
      | 'VALIDATION_FAILED'
      | 'STORAGE_FAILED',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'Step13Error';
    Object.setPrototypeOf(this, Step13Error.prototype);
  }
}

// ============================================================================
// MOCK DATA GENERATORS (for testing without real API)
// ============================================================================

/**
 * Generate mock GSC response for testing
 *
 * @param contentId - Content ID
 * @param daysSincePublish - Days since content published
 * @returns Mock GSC response
 */
function generateMockGSCResponse(contentId: string, daysSincePublish: number): GSCResponse {
  // Simulate realistic ranking progression
  let avgPosition: number;
  if (daysSincePublish <= 14) {
    avgPosition = 45 + Math.random() * 20; // Initial: 45-65
  } else if (daysSincePublish <= 60) {
    avgPosition = 20 + Math.random() * 15; // Short-term: 20-35
  } else {
    avgPosition = 8 + Math.random() * 10; // Long-term: 8-18
  }

  const impressions = Math.floor(100 + Math.random() * 500 * (daysSincePublish / 30));
  const clicks = Math.floor(impressions * (0.02 + Math.random() * 0.08)); // 2-10% CTR

  return {
    rows: [
      {
        keys: [contentId, 'target keyword', '2024-01-01'],
        clicks,
        impressions,
        ctr: clicks / impressions,
        position: avgPosition,
      },
    ],
  };
}

/**
 * Generate mock GA4 response for testing
 *
 * @param daysSincePublish - Days since content published
 * @returns Mock GA4 response
 */
function generateMockGA4Response(daysSincePublish: number): GA4Response {
  const sessions = Math.floor(50 + Math.random() * 200 * (daysSincePublish / 30));
  const conversions = Math.floor(sessions * (0.01 + Math.random() * 0.04)); // 1-5% conversion rate
  const avgDuration = 120 + Math.random() * 180; // 2-5 minutes
  const bounceRate = 0.3 + Math.random() * 0.3; // 30-60% bounce rate
  const pageViews = sessions * (1.2 + Math.random() * 0.8); // 1.2-2.0 pages/session

  return {
    rows: [
      {
        dimensionValues: [{ value: '/test-page' }, { value: '2024-01-01' }],
        metricValues: [
          { value: avgDuration.toString() }, // averageSessionDuration
          { value: bounceRate.toString() }, // bounceRate
          { value: conversions.toString() }, // conversions
          { value: pageViews.toString() }, // screenPageViews
          { value: sessions.toString() }, // sessions
        ],
      },
    ],
    rowCount: 1,
  };
}

/**
 * Generate mock content performance data for testing
 *
 * @param contentId - Content ID
 * @param appliedPatterns - Patterns applied to content
 * @param daysSincePublish - Days since content published
 * @returns Mock content performance
 */
function generateMockContentPerformance(
  contentId: string,
  appliedPatterns: ReadonlyArray<AppliedPatternReference>,
  daysSincePublish: number
): ContentPerformance {
  const publishDate = new Date();
  publishDate.setDate(publishDate.getDate() - daysSincePublish);

  const timeWindow = calculateTimeWindow(daysSincePublish);

  // Generate mock GSC data
  const gscResponse = generateMockGSCResponse(contentId, daysSincePublish);
  const gscMetrics = parseGSCResponse(
    gscResponse,
    timeWindow,
    new Date(publishDate).toISOString().split('T')[0],
    new Date().toISOString().split('T')[0]
  );

  // Generate mock GA4 data
  const ga4Response = generateMockGA4Response(daysSincePublish);
  const ga4Metrics = parseGA4Response(ga4Response);

  // Merge metrics
  const metrics = mergePerformanceMetrics(gscMetrics, ga4Metrics);

  // Determine content stage
  const contentStage = determineContentStage(metrics, daysSincePublish);

  return {
    contentId,
    url: `https://example.com/content/${contentId}`,
    targetKeyword: 'target keyword',
    title: `Test Content ${contentId}`,
    publishedAt: publishDate.toISOString(),
    initialMetrics: timeWindow === 'initial' ? metrics : gscMetrics,
    shortTermMetrics: timeWindow === 'short-term' ? metrics : undefined,
    longTermMetrics: timeWindow === 'long-term' ? metrics : undefined,
    appliedPatterns,
    lastUpdated: normalizeTimestamp(new Date()),
    contentStage,
  };
}

// ============================================================================
// HELPER FUNCTIONS - DATA CONVERSION
// ============================================================================

/**
 * Convert ContentPerformance to PerformanceData for confidence updater
 *
 * @param content - Content performance record
 * @param metrics - Content performance metrics
 * @returns Performance data formatted for confidence updater
 */
function toPerformanceData(
  content: ContentPerformance,
  metrics: ContentPerformanceMetrics
): PerformanceData {
  // Calculate days since publish
  const publishDate = new Date(content.publishedAt);
  const now = new Date();
  const daysSincePublish = Math.floor((now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24));

  // Map RankingTrend to PerformanceData positionTrend
  const mapTrend = (trend: typeof metrics.rankingTrend): 'improving' | 'stable' | 'declining' => {
    if (trend === 'up') return 'improving';
    if (trend === 'down') return 'declining';
    return 'stable';
  };

  // Determine stage based on content stage
  const mapStage = (stage: typeof content.contentStage): 'initial' | 'short-term' | 'long-term' => {
    if (stage === 'new' || stage === 'indexed') return 'initial';
    if (stage === 'ranking') return 'short-term';
    return 'long-term';
  };

  // Estimate sessions from clicks (rough approximation if GA4 data not available)
  const estimatedSessions = metrics.clicks * 1.2; // Assume some direct traffic

  return {
    contentId: content.contentId,
    url: content.url,
    dateRange: {
      start: new Date(metrics.periodStart),
      end: new Date(metrics.periodEnd),
    },
    gsc: {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      averagePosition: metrics.averageRanking,
      positionTrend: mapTrend(metrics.rankingTrend),
    },
    ga4: {
      sessions: estimatedSessions,
      avgSessionDuration: metrics.avgTimeOnPage || 0,
      bounceRate: metrics.bounceRate || 0.5,
      engagementRate: 1 - (metrics.bounceRate || 0.5),
      conversions: metrics.conversions || 0,
    },
    daysSincePublish,
    stage: mapStage(content.contentStage),
  };
}

// ============================================================================
// CORE STEP 13 EXECUTION
// ============================================================================

/**
 * Execute Step 13: Performance Tracking & Feedback Loop
 *
 * Main orchestration function that:
 * 1. Fetches content performance from GSC/GA4 (or generates mock data)
 * 2. Processes performance feedback to update pattern confidences
 * 3. Detects algorithm update correlations
 * 4. Stores results in Redis
 *
 * @param contentIds - Array of content IDs to process
 * @param redis - Redis client instance
 * @param options - Execution options
 * @returns Step 13 execution result
 */
export async function executeStep13(
  contentIds: ReadonlyArray<string>,
  redis: Redis,
  options: Step13Options = {}
): Promise<Step13Result> {
  const startTime = Date.now();
  const {
    useMockData = true, // Default to mock for development
    adjustmentRules = DEFAULT_ADJUSTMENT_RULES,
    detectAlgorithmCorrelation: enableCorrelation = true,
    correlationLookbackDays = 30,
    patternStore = 'pattern:local',
    verbose = false,
  } = options;

  const warnings: string[] = [];

  try {
    if (verbose) {
      console.log(`[Step 13] Starting performance tracking for ${contentIds.length} content pieces`);
      console.log(`[Step 13] Mode: ${useMockData ? 'MOCK DATA' : 'REAL API'}`);
    }

    // Input validation
    if (contentIds.length === 0) {
      throw new Step13Error('No content IDs provided', 'VALIDATION_FAILED');
    }

    if (contentIds.length > 100) {
      warnings.push(`Processing ${contentIds.length} content pieces may take significant time`);
    }

    // Step 1: Fetch or generate content performance data
    const contentPerformances: ContentPerformance[] = [];

    for (const contentId of contentIds) {
      try {
        const sanitized = sanitizeContentId(contentId);

        // Fetch applied patterns for this content
        const appliedPatterns = await fetchAppliedPatterns(sanitized, redis, patternStore);

        if (appliedPatterns.length === 0) {
          if (verbose) {
            console.log(`[Step 13] Skipping content ${sanitized}: no applied patterns`);
          }
          continue;
        }

        let contentPerformance: ContentPerformance;

        if (useMockData) {
          // Generate mock data
          const daysSincePublish = 45; // Default to short-term window
          contentPerformance = generateMockContentPerformance(
            sanitized,
            appliedPatterns,
            daysSincePublish
          );
        } else {
          // Fetch real data from GSC/GA4
          contentPerformance = await fetchContentPerformance(
            sanitized,
            appliedPatterns,
            redis,
            options
          );
        }

        // Validate content performance
        if (!isValidContentPerformance(contentPerformance)) {
          throw new Step13Error(
            `Invalid content performance data for ${sanitized}`,
            'VALIDATION_FAILED'
          );
        }

        contentPerformances.push(contentPerformance);

        // Store content performance in Redis
        await storeContentPerformance(contentPerformance, redis);
      } catch (error) {
        console.error(`[Step 13] Failed to fetch performance for content ${contentId}:`, error);
        warnings.push(`Failed to fetch performance for content ${contentId}`);
        // Continue processing other content
      }
    }

    if (contentPerformances.length === 0) {
      return {
        success: true,
        contentProcessed: 0,
        patternsUpdated: 0,
        totalConfidenceDelta: 0,
        feedbackResults: [],
        algorithmCorrelations: [],
        executedAt: normalizeTimestamp(new Date()),
        durationMs: Date.now() - startTime,
        warnings: ['No content performance data available for processing'],
      };
    }

    if (verbose) {
      console.log(`[Step 13] Fetched performance for ${contentPerformances.length} content pieces`);
    }

    // Step 2: Process performance feedback (batch)
    const feedbackResults = await batchProcessPerformanceFeedback(
      contentPerformances,
      redis,
      patternStore,
      adjustmentRules
    );

    // Calculate aggregate statistics
    const totalPatternsUpdated = feedbackResults.reduce(
      (sum, r) => sum + r.patternsUpdated,
      0
    );
    const totalConfidenceDelta = feedbackResults.reduce(
      (sum, r) => sum + r.totalConfidenceDelta,
      0
    );

    if (verbose) {
      console.log(`[Step 13] Updated ${totalPatternsUpdated} patterns with confidence delta ${totalConfidenceDelta.toFixed(4)}`);
    }

    // Step 2.5: RuVector confidence updates (if enabled)
    let ruVectorUpdates: Step13Result['ruVectorUpdates'];

    if (options.enableRuVectorUpdates && options.seoQueryManager) {
      if (verbose) {
        console.log('[Step 13] Starting RuVector confidence updates...');
      }

      try {
        const confidenceUpdater = new ConfidenceUpdater({
          seoQueryManager: options.seoQueryManager,
          verbose: options.verbose,
          ...options.confidenceUpdaterConfig,
        });

        // Prepare batch update records
        const updateRecords: Array<{
          performance: PerformanceData;
          usedPatterns: string[];
          usedExperts: string[];
          usedStatistics: string[];
        }> = [];

        for (const content of contentPerformances) {
          // Determine which metrics to use based on content stage
          let metrics: ContentPerformanceMetrics;
          if (content.longTermMetrics) {
            metrics = content.longTermMetrics;
          } else if (content.shortTermMetrics) {
            metrics = content.shortTermMetrics;
          } else {
            metrics = content.initialMetrics;
          }

          const performanceData = toPerformanceData(content, metrics);

          // Extract pattern IDs from applied patterns
          // Note: AppliedPatternReference only has patternId; expert/statistic links
          // would need to be stored separately if needed for confidence updates
          const usedPatterns = content.appliedPatterns?.map((p) => p.patternId) || [];

          // For now, experts and statistics are empty arrays
          // In a future enhancement, these could be extracted from pattern metadata
          const usedExperts: string[] = [];
          const usedStatistics: string[] = [];

          updateRecords.push({
            performance: performanceData,
            usedPatterns,
            usedExperts,
            usedStatistics,
          });
        }

        // Execute batch update
        const updateResult = await confidenceUpdater.batchUpdate(updateRecords);

        ruVectorUpdates = {
          patternsUpdated: updateResult.patternsUpdated,
          expertsUpdated: updateResult.expertsUpdated,
          statisticsUpdated: updateResult.statisticsUpdated,
          totalConfidenceDelta: updateResult.totalConfidenceDelta,
          individualUpdates: updateResult.updates.map((u) => ({
            type: u.type,
            id: u.id,
            name: u.name,
            delta: u.delta,
            reason: u.reason,
          })),
        };

        if (verbose) {
          console.log(`[Step 13] RuVector updates complete:`);
          console.log(`  - Patterns updated: ${ruVectorUpdates.patternsUpdated}`);
          console.log(`  - Experts updated: ${ruVectorUpdates.expertsUpdated}`);
          console.log(`  - Statistics updated: ${ruVectorUpdates.statisticsUpdated}`);
          console.log(
            `  - Total confidence delta: ${ruVectorUpdates.totalConfidenceDelta.toFixed(3)}`
          );
        }
      } catch (error) {
        const errorMsg = `RuVector update failed: ${(error as Error).message}`;
        warnings.push(errorMsg);
        if (options.verbose) {
          console.warn(`[Step 13] WARNING: ${errorMsg}`);
        }
        // Don't fail the step, just log warning
      }
    }

    // Step 3: Detect algorithm update correlations (if enabled)
    let algorithmCorrelations: ReadonlyArray<AlgorithmCorrelation> = [];

    if (enableCorrelation) {
      try {
        // Load algorithm update database
        const riskDatabase = await loadRiskDatabase();

        algorithmCorrelations = await detectAlgorithmUpdateCorrelation(
          riskDatabase.algorithmUpdates,
          redis,
          patternStore,
          correlationLookbackDays
        );

        if (verbose) {
          console.log(`[Step 13] Detected ${algorithmCorrelations.length} algorithm correlations`);

          for (const correlation of algorithmCorrelations) {
            console.log(
              `  - Pattern ${correlation.patternId}: ${correlation.algorithmUpdate.name} ` +
                `(confidence: ${correlation.correlationConfidence.toFixed(2)}, ` +
                `action: ${correlation.recommendedAction})`
            );
          }
        }

        // Store correlations in Redis
        await storeAlgorithmCorrelations(algorithmCorrelations, redis);
      } catch (error) {
        console.error('[Step 13] Failed to detect algorithm correlations:', error);
        warnings.push('Algorithm correlation detection failed');
      }
    }

    const durationMs = Date.now() - startTime;

    if (verbose) {
      console.log(`[Step 13] Execution complete in ${durationMs}ms`);
    }

    // Verbose logging for RuVector updates
    if (verbose && ruVectorUpdates) {
      console.log('\n=== RuVector Confidence Updates ===');
      for (const update of ruVectorUpdates.individualUpdates.slice(0, 10)) {
        const direction = update.delta > 0 ? '↑' : update.delta < 0 ? '↓' : '→';
        console.log(
          `  ${direction} [${update.type}] ${update.name}: ${update.delta.toFixed(3)} (${update.reason})`
        );
      }
      if (ruVectorUpdates.individualUpdates.length > 10) {
        console.log(
          `  ... and ${ruVectorUpdates.individualUpdates.length - 10} more updates`
        );
      }
    }

    return {
      success: true,
      contentProcessed: contentPerformances.length,
      patternsUpdated: totalPatternsUpdated,
      totalConfidenceDelta,
      feedbackResults,
      algorithmCorrelations,
      executedAt: normalizeTimestamp(new Date()),
      durationMs,
      warnings: warnings.length > 0 ? warnings : undefined,
      ruVectorUpdates,
    };
  } catch (error) {
    if (error instanceof Step13Error) {
      throw error;
    }

    throw new Step13Error(
      'Failed to execute Step 13: Performance Tracking',
      'EXECUTION_FAILED',
      error instanceof Error ? error.message : error
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch applied patterns for content from Redis
 *
 * @param contentId - Content ID
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix
 * @returns Array of applied pattern references
 */
async function fetchAppliedPatterns(
  contentId: string,
  redis: Redis,
  store: string
): Promise<AppliedPatternReference[]> {
  try {
    // Fetch from content:performance:{contentId}:applied_patterns
    const appliedKey = `content:performance:${contentId}:applied_patterns`;
    const appliedData = await redis.lrange(appliedKey, 0, -1);

    const patterns: AppliedPatternReference[] = [];

    for (const entry of appliedData) {
      try {
        const pattern = JSON.parse(entry) as AppliedPatternReference;
        patterns.push(pattern);
      } catch {
        // Skip malformed entries
        continue;
      }
    }

    return patterns;
  } catch (error) {
    console.error(`Failed to fetch applied patterns for content ${contentId}:`, error);
    return [];
  }
}

/**
 * Fetch real content performance from GSC/GA4 APIs
 *
 * @param contentId - Content ID
 * @param appliedPatterns - Applied patterns
 * @param redis - Redis client instance
 * @param options - Step 13 options
 * @returns Content performance data
 */
async function fetchContentPerformance(
  contentId: string,
  appliedPatterns: ReadonlyArray<AppliedPatternReference>,
  redis: Redis,
  options: Step13Options
): Promise<ContentPerformance> {
  // Real API integration structure (not implemented in this phase)
  // In production, this would:
  // 1. Call GSC API with buildGSCQuery()
  // 2. Call GA4 API with buildGA4Query()
  // 3. Parse responses with parseGSCResponse() and parseGA4Response()
  // 4. Merge metrics with mergePerformanceMetrics()
  // 5. Determine content stage with determineContentStage()

  throw new Step13Error(
    'Real API integration not implemented - use useMockData: true',
    'API_ERROR'
  );
}

/**
 * Store content performance in Redis
 *
 * @param contentPerformance - Content performance data
 * @param redis - Redis client instance
 */
async function storeContentPerformance(
  contentPerformance: ContentPerformance,
  redis: Redis
): Promise<void> {
  // SECURITY: Sanitize content ID BEFORE constructing Redis keys
  const sanitizedContentId = sanitizeContentId(contentPerformance.contentId);

  // Additional validation: ensure content ID matches expected pattern
  if (!/^[a-zA-Z0-9_-]{3,128}$/.test(sanitizedContentId)) {
    throw new Step13Error(
      `Invalid content ID format after sanitization: ${sanitizedContentId}`,
      'VALIDATION_FAILED'
    );
  }

  const key = `content:performance:${sanitizedContentId}`;

  await redis.hset(key, {
    url: contentPerformance.url,
    target_keyword: contentPerformance.targetKeyword,
    title: contentPerformance.title,
    published_at: contentPerformance.publishedAt,
    initial_metrics: JSON.stringify(contentPerformance.initialMetrics),
    short_term_metrics: contentPerformance.shortTermMetrics
      ? JSON.stringify(contentPerformance.shortTermMetrics)
      : '',
    long_term_metrics: contentPerformance.longTermMetrics
      ? JSON.stringify(contentPerformance.longTermMetrics)
      : '',
    content_stage: contentPerformance.contentStage,
    last_updated: contentPerformance.lastUpdated,
  });

  // Store applied patterns list
  const appliedKey = `content:performance:${sanitizedContentId}:applied_patterns`;
  await redis.del(appliedKey); // Clear existing

  for (const pattern of contentPerformance.appliedPatterns) {
    await redis.rpush(appliedKey, JSON.stringify(pattern));
  }
}

/**
 * Store algorithm correlations in Redis
 *
 * @param correlations - Algorithm correlations
 * @param redis - Redis client instance
 */
async function storeAlgorithmCorrelations(
  correlations: ReadonlyArray<AlgorithmCorrelation>,
  redis: Redis
): Promise<void> {
  const key = 'algorithm:correlations';

  // Clear existing correlations
  await redis.del(key);

  // Store new correlations
  for (const correlation of correlations) {
    await redis.rpush(key, JSON.stringify(correlation));
  }

  // Set expiration (30 days)
  await redis.expire(key, 30 * 24 * 60 * 60);
}

/**
 * Get content performance from Redis
 *
 * @param contentId - Content ID
 * @param redis - Redis client instance
 * @returns Content performance or null if not found
 */
export async function getContentPerformance(
  contentId: string,
  redis: Redis
): Promise<ContentPerformance | null> {
  try {
    const sanitized = sanitizeContentId(contentId);
    const key = `content:performance:${sanitized}`;

    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    // Fetch applied patterns
    const appliedKey = `content:performance:${sanitized}:applied_patterns`;
    const appliedData = await redis.lrange(appliedKey, 0, -1);
    const appliedPatterns = appliedData.map((entry) => JSON.parse(entry));

    return {
      contentId: sanitized,
      url: data.url,
      targetKeyword: data.target_keyword,
      title: data.title,
      publishedAt: data.published_at,
      initialMetrics: JSON.parse(data.initial_metrics),
      shortTermMetrics: data.short_term_metrics ? JSON.parse(data.short_term_metrics) : undefined,
      longTermMetrics: data.long_term_metrics ? JSON.parse(data.long_term_metrics) : undefined,
      appliedPatterns,
      lastUpdated: data.last_updated,
      contentStage: data.content_stage as ContentPerformance['contentStage'],
      notes: data.notes,
    };
  } catch (error) {
    console.error(`Failed to get content performance for ${contentId}:`, error);
    return null;
  }
}

/**
 * Get algorithm correlations from Redis
 *
 * @param redis - Redis client instance
 * @returns Array of algorithm correlations
 */
export async function getAlgorithmCorrelations(
  redis: Redis
): Promise<ReadonlyArray<AlgorithmCorrelation>> {
  try {
    const key = 'algorithm:correlations';
    const data = await redis.lrange(key, 0, -1);

    return data.map((entry) => JSON.parse(entry) as AlgorithmCorrelation);
  } catch (error) {
    console.error('Failed to get algorithm correlations:', error);
    return [];
  }
}
