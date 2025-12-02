/**
 * Performance Feedback System - SEO Intelligence Integration Phase 5 Sprint 2
 *
 * @module planning/seo/lib/performance-feedback
 * @description Updates pattern confidence scores based on real-world content performance
 *              Implements feedback loop for continuous pattern learning
 * @version 1.0.0
 */

import Redis from 'ioredis';
import {
  ContentPerformance,
  ContentPerformanceMetrics,
  AppliedPatternReference,
  PerformanceTrackerError,
  sanitizeContentId,
  normalizeTimestamp,
} from './performance-tracker';
import { updateConfidenceFromOutcome, ConfidenceUpdate } from './confidence-scoring';
import type { AlgorithmUpdate } from '../types/algorithm-risk';

/**
 * Performance-based confidence adjustment rules
 */
export interface ConfidenceAdjustmentRules {
  /** Boost for top 10 ranking */
  top10Boost: number;

  /** Boost for top 20 ranking */
  top20Boost: number;

  /** Penalty for ranking drop >10 positions */
  rankingDropPenalty: number;

  /** Penalty for ranking drop >20 positions */
  severeRankingDropPenalty: number;

  /** Minimum impressions required for adjustment */
  minImpressionsThreshold: number;

  /** Minimum time window for short-term adjustments (days) */
  minShortTermDays: number;

  /** Minimum time window for long-term adjustments (days) */
  minLongTermDays: number;
}

/**
 * Default confidence adjustment rules
 */
export const DEFAULT_ADJUSTMENT_RULES: ConfidenceAdjustmentRules = {
  top10Boost: 0.20,
  top20Boost: 0.10,
  rankingDropPenalty: -0.15,
  severeRankingDropPenalty: -0.25,
  minImpressionsThreshold: 100,
  minShortTermDays: 15,
  minLongTermDays: 60,
};

/**
 * Feedback result for single pattern update
 */
export interface PatternFeedbackResult {
  /** Pattern ID */
  patternId: string;

  /** Pattern name */
  patternName: string;

  /** Previous confidence */
  previousConfidence: number;

  /** New confidence after feedback */
  newConfidence: number;

  /** Confidence delta */
  delta: number;

  /** Reason for adjustment */
  reason: string;

  /** Content ID that triggered feedback */
  contentId: string;

  /** Metrics used for feedback */
  metrics: ContentPerformanceMetrics;

  /** Feedback timestamp */
  feedbackAt: string;
}

/**
 * Aggregate feedback result across multiple patterns
 */
export interface AggregateFeedbackResult {
  /** Content ID */
  contentId: string;

  /** Number of patterns updated */
  patternsUpdated: number;

  /** Individual pattern feedback results */
  patternResults: ReadonlyArray<PatternFeedbackResult>;

  /** Total confidence boost/penalty applied */
  totalConfidenceDelta: number;

  /** Feedback timestamp */
  feedbackAt: string;

  /** Success status */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * Algorithm update correlation detection result
 */
export interface AlgorithmCorrelation {
  /** Pattern ID affected */
  patternId: string;

  /** Pattern name */
  patternName: string;

  /** Algorithm update that may have caused failure */
  algorithmUpdate: AlgorithmUpdate;

  /** Content pieces affected */
  affectedContentIds: ReadonlyArray<string>;

  /** Average ranking drop across affected content */
  averageRankingDrop: number;

  /** Correlation confidence (0.0-1.0) */
  correlationConfidence: number;

  /** Detection timestamp */
  detectedAt: string;

  /** Recommended action */
  recommendedAction: 'monitor' | 'investigate' | 'deprecate';
}

/**
 * Performance feedback error
 */
export class PerformanceFeedbackError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'FEEDBACK_FAILED'
      | 'CORRELATION_FAILED'
      | 'VALIDATION_FAILED'
      | 'STORAGE_FAILED',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'PerformanceFeedbackError';
    Object.setPrototypeOf(this, PerformanceFeedbackError.prototype);
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for ConfidenceAdjustmentRules
 */
export function isValidAdjustmentRules(value: unknown): value is ConfidenceAdjustmentRules {
  if (typeof value !== 'object' || value === null) return false;

  const rules = value as any;

  return (
    typeof rules.top10Boost === 'number' &&
    typeof rules.top20Boost === 'number' &&
    typeof rules.rankingDropPenalty === 'number' &&
    typeof rules.severeRankingDropPenalty === 'number' &&
    typeof rules.minImpressionsThreshold === 'number' &&
    typeof rules.minShortTermDays === 'number' &&
    typeof rules.minLongTermDays === 'number'
  );
}

/**
 * Type guard for PatternFeedbackResult
 */
export function isValidPatternFeedbackResult(value: unknown): value is PatternFeedbackResult {
  if (typeof value !== 'object' || value === null) return false;

  const result = value as any;

  return (
    typeof result.patternId === 'string' &&
    typeof result.patternName === 'string' &&
    typeof result.previousConfidence === 'number' &&
    typeof result.newConfidence === 'number' &&
    typeof result.delta === 'number' &&
    typeof result.reason === 'string' &&
    typeof result.contentId === 'string' &&
    typeof result.feedbackAt === 'string'
  );
}

// ============================================================================
// CORE FEEDBACK FUNCTIONS
// ============================================================================

/**
 * Process performance feedback for content and update pattern confidences
 *
 * Analyzes content performance and applies confidence adjustments to all patterns
 * used in that content based on ranking outcomes.
 *
 * Rules:
 * - Top 10 ranking: +0.20 confidence
 * - Top 20 ranking: +0.10 confidence
 * - Ranking drop >10 positions: -0.15 confidence
 * - Ranking drop >20 positions: -0.25 confidence
 * - Requires minimum impressions threshold
 *
 * @param contentPerformance - Content performance data
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix (default: 'pattern:local')
 * @param rules - Confidence adjustment rules (optional)
 * @returns Aggregate feedback result
 */
export async function processPerformanceFeedback(
  contentPerformance: ContentPerformance,
  redis: Redis,
  store: string = 'pattern:local',
  rules: ConfidenceAdjustmentRules = DEFAULT_ADJUSTMENT_RULES
): Promise<AggregateFeedbackResult> {
  try {
    // Input validation
    const contentId = sanitizeContentId(contentPerformance.contentId);

    if (contentPerformance.appliedPatterns.length === 0) {
      return {
        contentId,
        patternsUpdated: 0,
        patternResults: [],
        totalConfidenceDelta: 0,
        feedbackAt: normalizeTimestamp(new Date()),
        success: true,
      };
    }

    // Determine which metrics to use based on content age
    const metrics = selectMetricsForFeedback(contentPerformance, rules);

    if (!metrics) {
      return {
        contentId,
        patternsUpdated: 0,
        patternResults: [],
        totalConfidenceDelta: 0,
        feedbackAt: normalizeTimestamp(new Date()),
        success: true,
        error: 'Insufficient data for feedback',
      };
    }

    // Check minimum impressions threshold
    if (metrics.impressions < rules.minImpressionsThreshold) {
      return {
        contentId,
        patternsUpdated: 0,
        patternResults: [],
        totalConfidenceDelta: 0,
        feedbackAt: normalizeTimestamp(new Date()),
        success: true,
        error: `Impressions ${metrics.impressions} below threshold ${rules.minImpressionsThreshold}`,
      };
    }

    // Process each applied pattern
    const patternResults: PatternFeedbackResult[] = [];
    let totalDelta = 0;

    for (const appliedPattern of contentPerformance.appliedPatterns) {
      try {
        const feedbackResult = await updatePatternFromPerformance(
          appliedPattern,
          metrics,
          contentId,
          redis,
          store,
          rules
        );

        if (feedbackResult) {
          patternResults.push(feedbackResult);
          totalDelta += feedbackResult.delta;
        }
      } catch (error) {
        console.error(`Failed to process feedback for pattern ${appliedPattern.patternId}:`, error);
        // Continue processing other patterns
      }
    }

    // Store feedback history
    await storeFeedbackHistory(contentId, patternResults, redis);

    return {
      contentId,
      patternsUpdated: patternResults.length,
      patternResults,
      totalConfidenceDelta: totalDelta,
      feedbackAt: normalizeTimestamp(new Date()),
      success: true,
    };
  } catch (error) {
    throw new PerformanceFeedbackError(
      `Failed to process performance feedback for content ${contentPerformance.contentId}`,
      'FEEDBACK_FAILED',
      error
    );
  }
}

/**
 * Select appropriate metrics for feedback based on content age
 *
 * @param contentPerformance - Content performance data
 * @param rules - Adjustment rules
 * @returns Selected metrics or null if insufficient data
 */
function selectMetricsForFeedback(
  contentPerformance: ContentPerformance,
  rules: ConfidenceAdjustmentRules
): ContentPerformanceMetrics | null {
  const publishDate = new Date(contentPerformance.publishedAt);
  const now = new Date();
  const daysSincePublish = Math.floor((now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24));

  // Prefer long-term metrics if available
  if (contentPerformance.longTermMetrics && daysSincePublish >= rules.minLongTermDays) {
    return contentPerformance.longTermMetrics;
  }

  // Use short-term metrics if available
  if (contentPerformance.shortTermMetrics && daysSincePublish >= rules.minShortTermDays) {
    return contentPerformance.shortTermMetrics;
  }

  // Use initial metrics only if minimum short-term period has passed
  if (daysSincePublish >= rules.minShortTermDays) {
    return contentPerformance.initialMetrics;
  }

  // Too early for feedback
  return null;
}

/**
 * Update single pattern confidence based on performance metrics
 *
 * @param appliedPattern - Applied pattern reference
 * @param metrics - Performance metrics
 * @param contentId - Content ID
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix
 * @param rules - Confidence adjustment rules
 * @returns Pattern feedback result or null if no update needed
 */
async function updatePatternFromPerformance(
  appliedPattern: AppliedPatternReference,
  metrics: ContentPerformanceMetrics,
  contentId: string,
  redis: Redis,
  store: string,
  rules: ConfidenceAdjustmentRules
): Promise<PatternFeedbackResult | null> {
  // SECURITY: Validate metrics bounds before processing
  // Ranking: 1-100, Impressions: 0-1M, Clicks: 0-1M
  if (
    metrics.averageRanking < 1 ||
    metrics.averageRanking > 100 ||
    metrics.impressions < 0 ||
    metrics.impressions > 1_000_000 ||
    metrics.clicks < 0 ||
    metrics.clicks > 1_000_000
  ) {
    throw new PerformanceFeedbackError(
      `Metrics out of bounds: ranking=${metrics.averageRanking}, impressions=${metrics.impressions}, clicks=${metrics.clicks}`,
      'VALIDATION_FAILED'
    );
  }

  // Validate pattern ID format
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(appliedPattern.patternId)) {
    throw new PerformanceFeedbackError(
      `Invalid pattern ID format: ${appliedPattern.patternId}`,
      'VALIDATION_FAILED'
    );
  }

  // Fetch current pattern confidence
  const currentConfidenceStr = await redis.hget(
    `${store}:${appliedPattern.patternId}`,
    'confidence'
  );
  const previousConfidence = parseFloat(currentConfidenceStr || '0.5');

  // Determine outcome and impact based on ranking
  let outcome: 'success' | 'failure' | 'partial';
  let impact: number;
  let reason: string;
  let confidenceDelta = 0;

  // Top 10 ranking: strong success
  if (metrics.averageRanking <= 10) {
    outcome = 'success';
    impact = 1.0;
    confidenceDelta = rules.top10Boost;
    reason = `Top 10 ranking (position ${metrics.averageRanking})`;
  }
  // Top 20 ranking: moderate success
  else if (metrics.averageRanking <= 20) {
    outcome = 'success';
    impact = 0.7;
    confidenceDelta = rules.top20Boost;
    reason = `Top 20 ranking (position ${metrics.averageRanking})`;
  }
  // Severe ranking drop: failure
  else if (metrics.rankingDelta < -20) {
    outcome = 'failure';
    impact = 1.0;
    confidenceDelta = rules.severeRankingDropPenalty;
    reason = `Severe ranking drop (${metrics.rankingDelta} positions)`;
  }
  // Moderate ranking drop: failure
  else if (metrics.rankingDelta < -10) {
    outcome = 'failure';
    impact = 0.7;
    confidenceDelta = rules.rankingDropPenalty;
    reason = `Ranking drop (${metrics.rankingDelta} positions)`;
  }
  // Stable or improving but not top 20: partial success
  else if (metrics.rankingTrend === 'up' || metrics.rankingTrend === 'stable') {
    outcome = 'partial';
    impact = 0.5;
    confidenceDelta = 0.05; // Small boost for stability
    reason = `Stable ranking at position ${metrics.averageRanking}`;
  }
  // No significant change
  else {
    return null; // Skip update
  }

  // Apply confidence update using existing confidence scoring system
  const confidenceUpdate: ConfidenceUpdate = await updateConfidenceFromOutcome(
    appliedPattern.patternId,
    outcome,
    impact,
    redis,
    store
  );

  // Record performance-based update metadata
  await redis.hset(`${store}:${appliedPattern.patternId}`, {
    last_performance_feedback: normalizeTimestamp(new Date()),
    last_feedback_content: contentId,
    last_feedback_ranking: metrics.averageRanking.toString(),
  });

  return {
    patternId: appliedPattern.patternId,
    patternName: appliedPattern.patternName,
    previousConfidence,
    newConfidence: confidenceUpdate.newConfidence,
    delta: confidenceUpdate.delta,
    reason,
    contentId,
    metrics,
    feedbackAt: normalizeTimestamp(new Date()),
  };
}

/**
 * Store feedback history for audit trail
 *
 * @param contentId - Content ID
 * @param results - Pattern feedback results
 * @param redis - Redis client instance
 */
async function storeFeedbackHistory(
  contentId: string,
  results: PatternFeedbackResult[],
  redis: Redis
): Promise<void> {
  const historyKey = `content:performance:${contentId}:feedback_history`;

  for (const result of results) {
    await redis.lpush(historyKey, JSON.stringify(result));
  }

  // Keep only last 50 feedback entries per content
  await redis.ltrim(historyKey, 0, 49);
}

// ============================================================================
// ALGORITHM UPDATE CORRELATION
// ============================================================================

/**
 * Detect correlation between pattern failures and algorithm updates
 *
 * Analyzes patterns with recent failures and checks if they coincide with
 * known algorithm updates, suggesting the pattern may be affected by
 * algorithmic changes.
 *
 * @param algorithmUpdates - Known algorithm updates
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix (default: 'pattern:local')
 * @param lookbackDays - Days to look back for failures (default: 30)
 * @returns Array of detected correlations
 */
export async function detectAlgorithmUpdateCorrelation(
  algorithmUpdates: ReadonlyArray<AlgorithmUpdate>,
  redis: Redis,
  store: string = 'pattern:local',
  lookbackDays: number = 30
): Promise<ReadonlyArray<AlgorithmCorrelation>> {
  try {
    const correlations: AlgorithmCorrelation[] = [];
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

    // SECURITY: Use SCAN cursor instead of KEYS to avoid blocking Redis server
    const patternKeys: string[] = [];
    let cursor = '0';
    const MAX_KEYS = 10000; // Safety limit

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${store}:*`,
        'COUNT',
        100
      );
      cursor = nextCursor;

      // Filter out non-pattern keys
      for (const key of keys) {
        if (
          !key.includes(':feedback_history') &&
          !key.includes(':applications') &&
          !key.includes(':history')
        ) {
          patternKeys.push(key);

          // Safety limit check
          if (patternKeys.length >= MAX_KEYS) {
            console.warn(
              `[detectAlgorithmUpdateCorrelation] Reached MAX_KEYS limit (${MAX_KEYS}), stopping scan`
            );
            cursor = '0'; // Break loop
            break;
          }
        }
      }
    } while (cursor !== '0');

    for (const key of patternKeys) {
      const patternId = key.replace(`${store}:`, '');

      // SECURITY: Validate pattern ID format
      if (!/^[a-zA-Z0-9_-]{3,64}$/.test(patternId)) {
        console.warn(
          `[detectAlgorithmUpdateCorrelation] Invalid pattern ID format: ${patternId}, skipping`
        );
        continue;
      }

      // Get feedback history for pattern
      // SECURITY: Limit LRANGE to prevent unbounded reads (max 1000 entries)
      const feedbackHistoryKey = `${store}:${patternId}:feedback_history`;
      const feedbackHistory = await redis.lrange(feedbackHistoryKey, 0, 999);

      if (feedbackHistory.length === 0) continue;

      // Parse feedback and look for failures
      const recentFailures: Array<{ date: Date; contentId: string; rankingDrop: number }> = [];

      for (const entry of feedbackHistory) {
        try {
          const feedback = JSON.parse(entry);
          const feedbackDate = new Date(feedback.feedbackAt);

          if (feedbackDate < lookbackDate) continue;

          if (feedback.delta < 0) {
            // Negative confidence change = failure
            recentFailures.push({
              date: feedbackDate,
              contentId: feedback.contentId,
              rankingDrop: Math.abs(feedback.metrics.rankingDelta || 0),
            });
          }
        } catch {
          // Skip malformed entries
          continue;
        }
      }

      if (recentFailures.length < 2) continue; // Need multiple failures for correlation

      // Check for algorithm updates near failure dates
      for (const update of algorithmUpdates) {
        const updateDate = new Date(update.date);

        // Count failures within 14 days after algorithm update
        const correlatedFailures = recentFailures.filter((failure) => {
          const daysDiff = Math.floor(
            (failure.date.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysDiff >= 0 && daysDiff <= 14;
        });

        if (correlatedFailures.length >= 2) {
          // Significant correlation detected
          const avgRankingDrop =
            correlatedFailures.reduce((sum, f) => sum + f.rankingDrop, 0) /
            correlatedFailures.length;

          // Calculate correlation confidence
          const correlationConfidence = Math.min(
            1.0,
            (correlatedFailures.length / recentFailures.length) * 0.8 + 0.2
          );

          // Get pattern name
          const patternData = await redis.hgetall(key);
          const patternName = patternData.name || patternId;

          // Determine recommended action
          let recommendedAction: AlgorithmCorrelation['recommendedAction'];
          if (correlationConfidence >= 0.8 && avgRankingDrop > 20) {
            recommendedAction = 'deprecate';
          } else if (correlationConfidence >= 0.6 || avgRankingDrop > 15) {
            recommendedAction = 'investigate';
          } else {
            recommendedAction = 'monitor';
          }

          correlations.push({
            patternId,
            patternName,
            algorithmUpdate: update,
            affectedContentIds: correlatedFailures.map((f) => f.contentId),
            averageRankingDrop: Math.round(avgRankingDrop),
            correlationConfidence,
            detectedAt: normalizeTimestamp(new Date()),
            recommendedAction,
          });
        }
      }
    }

    // Sort by correlation confidence (highest first)
    correlations.sort((a, b) => b.correlationConfidence - a.correlationConfidence);

    return correlations;
  } catch (error) {
    throw new PerformanceFeedbackError(
      'Failed to detect algorithm update correlation',
      'CORRELATION_FAILED',
      error
    );
  }
}

/**
 * Batch process performance feedback for multiple content pieces
 *
 * @param contentPerformances - Array of content performance data
 * @param redis - Redis client instance
 * @param store - Pattern store key prefix (default: 'pattern:local')
 * @param rules - Confidence adjustment rules (optional)
 * @returns Array of aggregate feedback results
 */
export async function batchProcessPerformanceFeedback(
  contentPerformances: ReadonlyArray<ContentPerformance>,
  redis: Redis,
  store: string = 'pattern:local',
  rules: ConfidenceAdjustmentRules = DEFAULT_ADJUSTMENT_RULES
): Promise<ReadonlyArray<AggregateFeedbackResult>> {
  const results: AggregateFeedbackResult[] = [];

  for (const contentPerformance of contentPerformances) {
    try {
      const result = await processPerformanceFeedback(contentPerformance, redis, store, rules);
      results.push(result);
    } catch (error) {
      console.error(
        `Failed to process feedback for content ${contentPerformance.contentId}:`,
        error
      );
      // Add failed result
      results.push({
        contentId: contentPerformance.contentId,
        patternsUpdated: 0,
        patternResults: [],
        totalConfidenceDelta: 0,
        feedbackAt: normalizeTimestamp(new Date()),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
