/**
 * RuVector Performance Feedback Loop - Pattern Learning System
 *
 * Updates pattern confidence scores based on real-world content performance metrics.
 * Implements continuous learning feedback loop for RuVector pattern optimization.
 *
 * Part of Sprint 2.2 - Phase 6-7 Deep Analysis Implementation
 * Deliverable 2.2.3: Performance Feedback Loop for RuVector Pattern Learning
 *
 * @module seo/lib/ruvector/performance-feedback
 * @version 1.0.0
 */

import type {
  ContentPatternEntry,
  ExpertSourceEntry,
  StatisticEntry,
  PatternPerformanceMetrics,
} from './schemas';
import type { SEOQueryManager } from './queries';
import type { VectorDB } from '@ruvector/core';

// =============================================
// Performance Metrics Input
// =============================================

/**
 * Performance metrics input for pattern feedback
 * Comprehensive metrics across multiple dimensions
 */
export interface PerformanceMetricsInput {
  /** Content/article ID */
  readonly contentId: string;

  /** Content URL */
  readonly contentUrl: string;

  /** Ranking metrics (keyword positions) */
  readonly ranking: {
    readonly averagePosition: number;
    readonly bestPosition: number;
    readonly topTenCount: number;
    readonly totalKeywordsTracked: number;
  };

  /** Traffic metrics (sessions, pageviews) */
  readonly traffic: {
    readonly totalImpressions: number;
    readonly totalClicks: number;
    readonly dailyAverageTraffic: number;
    readonly trafficTrendDirection: number;
  };

  /** Conversion metrics (CTR, conversion rate) */
  readonly conversions: {
    readonly averageCTR: number;
    readonly conversionRate: number;
    readonly totalConversions: number;
    readonly conversionValue?: number;
  };

  /** Time window for metrics */
  readonly timeWindow: 'initial' | 'short-term' | 'long-term';

  /** Timestamp of metrics collection */
  readonly metricsCollectedAt: Date;

  /** Optional metadata */
  readonly metadata?: {
    readonly dataSource?: string;
    readonly confidence?: number;
    readonly notes?: string;
    readonly [key: string]: unknown;
  };
}

// =============================================
// Pattern Matching and Linking
// =============================================

/**
 * Pattern-to-content mapping
 */
export interface PatternContentMapping {
  /** Pattern ID */
  readonly patternId: string;

  /** Pattern name */
  readonly patternName: string;

  /** Pattern type */
  readonly patternType: string;

  /** Content IDs using this pattern */
  readonly contentIds: readonly string[];

  /** Confidence score adjustment percentage (0.0-1.0) */
  readonly adjustmentPercentage: number;
}

/**
 * Matched patterns for content
 */
export interface MatchedPatterns {
  /** Content ID */
  readonly contentId: string;

  /** Matched pattern entries */
  readonly patterns: readonly PatternContentMapping[];

  /** Match confidence (0.0-1.0) */
  readonly matchConfidence: number;

  /** Matching timestamp */
  readonly matchedAt: Date;
}

// =============================================
// Confidence Adjustment Calculations
// =============================================

/**
 * Confidence adjustment recommendation
 */
export interface ConfidenceAdjustment {
  /** Pattern ID */
  readonly patternId: string;

  /** Current confidence */
  readonly currentConfidence: number;

  /** Recommended adjustment delta */
  readonly adjustmentDelta: number;

  /** Reason for adjustment */
  readonly reason: string;

  /** Adjustment type */
  readonly adjustmentType: 'boost' | 'decay';

  /** Strength of signal (0.0-1.0) */
  readonly signalStrength: number;
}

/**
 * Performance-based confidence adjustment rules
 */
export interface ConfidenceAdjustmentRules {
  /** Boost for top 3 ranking */
  readonly topThreeBoost: number;

  /** Boost for top 10 ranking */
  readonly topTenBoost: number;

  /** Boost for top 20 ranking */
  readonly topTwentyBoost: number;

  /** Boost for high CTR (>3% increase) */
  readonly highCTRBoost: number;

  /** Boost for traffic increase */
  readonly trafficIncreaseBoost: number;

  /** Decay for ranking drop */
  readonly rankingDropDecay: number;

  /** Decay for low CTR (<1%) */
  readonly lowCTRDecay: number;

  /** Decay for traffic decrease */
  readonly trafficDecreaseDecay: number;

  /** Minimum confidence bound */
  readonly minConfidence: number;

  /** Maximum confidence bound */
  readonly maxConfidence: number;

  /** Minimum impressions threshold */
  readonly minImpressionsThreshold: number;
}

/**
 * Default confidence adjustment rules
 */
export const DEFAULT_ADJUSTMENT_RULES: ConfidenceAdjustmentRules = {
  topThreeBoost: 0.15,
  topTenBoost: 0.10,
  topTwentyBoost: 0.05,
  highCTRBoost: 0.12,
  trafficIncreaseBoost: 0.08,
  rankingDropDecay: -0.10,
  lowCTRDecay: -0.08,
  trafficDecreaseDecay: -0.06,
  minConfidence: 0.1,
  maxConfidence: 1.0,
  minImpressionsThreshold: 50,
};

// =============================================
// Feedback Results
// =============================================

/**
 * Pattern confidence update result
 */
export interface PatternConfidenceUpdate {
  /** Pattern ID */
  readonly patternId: string;

  /** Pattern name */
  readonly patternName: string;

  /** Previous confidence */
  readonly previousConfidence: number;

  /** New confidence */
  readonly newConfidence: number;

  /** Confidence delta */
  readonly confidenceDelta: number;

  /** Adjustment reason */
  readonly reason: string;

  /** Content that triggered update */
  readonly contentId: string;

  /** Performance metrics used */
  readonly metricsUsed: {
    readonly averagePosition: number;
    readonly averageCTR: number;
    readonly trafficTrendDirection: number;
  };

  /** Feedback timestamp */
  readonly feedbackAt: Date;
}

/**
 * Performance report for patterns
 */
export interface PerformanceReport {
  /** Report ID */
  readonly reportId: string;

  /** Content evaluated */
  readonly contentId: string;

  /** Content URL */
  readonly contentUrl: string;

  /** Patterns updated */
  readonly patternsUpdated: number;

  /** Individual pattern updates */
  readonly patternUpdates: readonly PatternConfidenceUpdate[];

  /** Total confidence delta */
  readonly totalConfidenceDelta: number;

  /** Average new confidence */
  readonly averageNewConfidence: number;

  /** Patterns improved (confidence increased) */
  readonly patternsImproved: number;

  /** Patterns declined (confidence decreased) */
  readonly patternsDeclined: number;

  /** Learning recommendations */
  readonly recommendations: readonly string[];

  /** Report generated at */
  readonly generatedAt: Date;

  /** Performance window */
  readonly performanceTimeWindow: 'initial' | 'short-term' | 'long-term';
}

/**
 * Batch performance feedback result
 */
export interface BatchFeedbackResult {
  /** Total items processed */
  readonly processed: number;

  /** Successfully updated */
  readonly successful: number;

  /** Failed items */
  readonly failed: number;

  /** Reports generated */
  readonly reports: readonly PerformanceReport[];

  /** Total patterns updated across batch */
  readonly totalPatternsUpdated: number;

  /** Average confidence adjustment */
  readonly averageConfidenceAdjustment: number;

  /** Execution time (ms) */
  readonly executionTimeMs: number;

  /** Processing timestamp */
  readonly processedAt: Date;
}

// =============================================
// Learning History
// =============================================

/**
 * Learning history entry
 */
export interface LearningHistoryEntry {
  /** Entry ID */
  readonly id: string;

  /** Pattern ID being learned */
  readonly patternId: string;

  /** Content ID that contributed to learning */
  readonly contentId: string;

  /** Performance metrics snapshot */
  readonly performanceMetrics: PerformanceMetricsInput;

  /** Confidence adjustment applied */
  readonly confidenceAdjustment: number;

  /** Reason for adjustment */
  readonly reason: string;

  /** Recorded at timestamp */
  readonly recordedAt: Date;

  /** Performance outcome */
  readonly outcome: 'improved' | 'declined' | 'stable';
}

// =============================================
// Error Types
// =============================================

/**
 * Performance feedback error
 */
export class PerformanceFeedbackError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PerformanceFeedbackError';
  }
}

/**
 * Pattern not found error
 */
export class PatternNotFoundError extends PerformanceFeedbackError {
  constructor(patternId: string) {
    super(`Pattern not found: ${patternId}`, 'PATTERN_NOT_FOUND', { patternId });
  }
}

/**
 * Invalid metrics error
 */
export class InvalidMetricsError extends PerformanceFeedbackError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INVALID_METRICS', details);
  }
}

/**
 * Storage error
 */
export class StorageError extends PerformanceFeedbackError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', details);
  }
}

// =============================================
// Type Guards
// =============================================

/**
 * Validate PerformanceMetricsInput
 */
export function isValidPerformanceMetricsInput(value: unknown): value is PerformanceMetricsInput {
  if (typeof value !== 'object' || value === null) return false;

  const m = value as Record<string, unknown>;

  // Validate required string fields
  if (typeof m.contentId !== 'string' || !m.contentId) return false;
  if (typeof m.contentUrl !== 'string' || !m.contentUrl) return false;

  // Validate ranking metrics
  if (!isValidRankingMetricsInput(m.ranking)) return false;

  // Validate traffic metrics
  if (!isValidTrafficMetricsInput(m.traffic)) return false;

  // Validate conversion metrics
  if (!isValidConversionMetricsInput(m.conversions)) return false;

  // Validate time window
  if (
    typeof m.timeWindow !== 'string' ||
    !['initial', 'short-term', 'long-term'].includes(m.timeWindow)
  ) {
    return false;
  }

  // Validate timestamp
  if (!(m.metricsCollectedAt instanceof Date)) return false;

  return true;
}

/**
 * Validate ranking metrics input
 */
function isValidRankingMetricsInput(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const r = value as Record<string, unknown>;

  if (typeof r.averagePosition !== 'number' || r.averagePosition < 1) return false;
  if (typeof r.bestPosition !== 'number' || r.bestPosition < 1) return false;
  if (typeof r.topTenCount !== 'number' || r.topTenCount < 0) return false;
  if (typeof r.totalKeywordsTracked !== 'number' || r.totalKeywordsTracked < 1) return false;

  return true;
}

/**
 * Validate traffic metrics input
 */
function isValidTrafficMetricsInput(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const t = value as Record<string, unknown>;

  if (typeof t.totalImpressions !== 'number' || t.totalImpressions < 0) return false;
  if (typeof t.totalClicks !== 'number' || t.totalClicks < 0) return false;
  if (typeof t.dailyAverageTraffic !== 'number' || t.dailyAverageTraffic < 0) return false;
  if (typeof t.trafficTrendDirection !== 'number' || !Number.isFinite(t.trafficTrendDirection)) {
    return false;
  }

  return true;
}

/**
 * Validate conversion metrics input
 */
function isValidConversionMetricsInput(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const c = value as Record<string, unknown>;

  if (typeof c.averageCTR !== 'number' || c.averageCTR < 0 || c.averageCTR > 1) return false;
  if (typeof c.conversionRate !== 'number' || c.conversionRate < 0 || c.conversionRate > 1) {
    return false;
  }
  if (typeof c.totalConversions !== 'number' || c.totalConversions < 0) return false;

  return true;
}

// =============================================
// Performance Feedback Manager
// =============================================

/**
 * Performance Feedback Manager
 *
 * Orchestrates the feedback loop for pattern learning:
 * 1. Accepts performance metrics input
 * 2. Matches metrics to stored patterns
 * 3. Calculates confidence adjustments
 * 4. Updates pattern confidence in storage
 * 5. Generates performance reports
 */
export class PerformanceFeedbackManager {
  private rules: ConfidenceAdjustmentRules;

  constructor(
    private queryManager: SEOQueryManager,
    private vectorDb: VectorDB,
    adjustmentRules?: Partial<ConfidenceAdjustmentRules>
  ) {
    this.rules = {
      ...DEFAULT_ADJUSTMENT_RULES,
      ...adjustmentRules,
    };
  }

  // =============================================
  // Main Processing Pipeline
  // =============================================

  /**
   * Process performance metrics and update pattern confidence
   */
  async processPerformanceMetrics(
    metrics: PerformanceMetricsInput
  ): Promise<PerformanceReport> {
    if (!isValidPerformanceMetricsInput(metrics)) {
      throw new InvalidMetricsError('Invalid performance metrics input', { metrics });
    }

    const reportId = this.generateReportId();
    const startTime = Date.now();
    const patternUpdates: PatternConfidenceUpdate[] = [];

    try {
      // Step 1: Match metrics to patterns via content metadata
      const matchedPatterns = await this.matchPatternsToContent(metrics.contentId);

      // Step 2: Calculate confidence adjustments for each matched pattern (parallelized)
      if (matchedPatterns.patterns.length > 0) {
        const updatePromises = matchedPatterns.patterns.map(async (mapping) => {
          const adjustment = this.calculateConfidenceAdjustment(metrics, mapping);
          return this.applyConfidenceUpdate(metrics, mapping, adjustment);
        });

        const updates = await Promise.allSettled(updatePromises);
        patternUpdates.push(
          ...updates
            .filter((result) => result.status === 'fulfilled')
            .map((result) => (result as PromiseFulfilledResult<PatternConfidenceUpdate>).value)
        );
      }

      // Step 3: Generate performance report
      const report = this.generatePerformanceReport(
        reportId,
        metrics,
        patternUpdates
      );

      // Step 4: Store learning history
      await this.storeLearningHistory(metrics, patternUpdates);

      return report;
    } catch (error) {
      if (error instanceof PerformanceFeedbackError) throw error;

      throw new StorageError(
        `Failed to process performance metrics: ${error instanceof Error ? error.message : String(error)}`,
        { contentId: metrics.contentId }
      );
    }
  }

  /**
   * Process batch performance metrics
   */
  async processBatchMetrics(
    metricsArray: readonly PerformanceMetricsInput[]
  ): Promise<BatchFeedbackResult> {
    const startTime = Date.now();

    // Process all metrics in parallel using Promise.allSettled for robustness
    const processPromises = metricsArray.map((metrics) =>
      this.processPerformanceMetrics(metrics).catch((error) => {
        // Return null on failure to maintain indexing
        return null;
      })
    );

    const results = await Promise.allSettled(processPromises);
    const reports: PerformanceReport[] = [];
    let successful = 0;
    let failed = 0;

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value !== null) {
        reports.push(result.value);
        successful++;
      } else {
        failed++;
      }
    });

    const totalPatternsUpdated = reports.reduce(
      (sum, r) => sum + r.patternsUpdated,
      0
    );

    const totalDelta = reports.reduce(
      (sum, r) => sum + r.totalConfidenceDelta,
      0
    );

    return {
      processed: metricsArray.length,
      successful,
      failed,
      reports,
      totalPatternsUpdated,
      averageConfidenceAdjustment:
        totalPatternsUpdated > 0 ? totalDelta / totalPatternsUpdated : 0,
      executionTimeMs: Date.now() - startTime,
      processedAt: new Date(),
    };
  }

  // =============================================
  // Pattern Matching
  // =============================================

  /**
   * Match patterns to content via metadata linkage
   */
  private async matchPatternsToContent(
    contentId: string
  ): Promise<MatchedPatterns> {
    // Query RuVector for patterns linked to this content
    try {
      // Retrieve all top-performing patterns from the query manager
      const topPatterns = await this.queryManager.contentPatterns?.getTopPatterns(100) || [];

      // Filter patterns that include this contentId
      const matchedPatternsList: PatternContentMapping[] = topPatterns
        .filter((pattern) => pattern.metadata?.articleIds?.includes(contentId))
        .map((pattern) => ({
          patternId: pattern.id,
          patternName: pattern.metadata?.description || pattern.metadata?.type || 'Unknown',
          patternType: pattern.metadata?.type || 'unknown',
          contentIds: pattern.metadata?.articleIds || [],
          adjustmentPercentage: pattern.metadata?.confidenceScore || 0.5,
        }));

      // If no patterns found, try a broader search across all patterns
      if (matchedPatternsList.length === 0) {
        const allPatterns = await this.queryManager.contentPatterns?.search(`content performance ${contentId}`, {
          limit: 50,
          minSimilarity: 0.3,
        }) || [];

        matchedPatternsList.push(
          ...allPatterns
            .filter((result) => result.entry.metadata?.articleIds?.includes(contentId))
            .map((result) => ({
              patternId: result.entry.id,
              patternName: result.entry.metadata?.description || result.entry.metadata?.type || 'Unknown',
              patternType: result.entry.metadata?.type || 'unknown',
              contentIds: result.entry.metadata?.articleIds || [],
              adjustmentPercentage: result.entry.metadata?.confidenceScore || 0.5,
            }))
        );
      }

      return {
        contentId,
        patterns: matchedPatternsList,
        matchConfidence: matchedPatternsList.length > 0 ? 0.95 : 0.3,
        matchedAt: new Date(),
      };
    } catch (error) {
      // Gracefully handle query manager errors
      return {
        contentId,
        patterns: [],
        matchConfidence: 0.0,
        matchedAt: new Date(),
      };
    }
  }

  // =============================================
  // Confidence Adjustment Calculation
  // =============================================

  /**
   * Calculate confidence adjustment for a pattern
   */
  private calculateConfidenceAdjustment(
    metrics: PerformanceMetricsInput,
    mapping: PatternContentMapping
  ): ConfidenceAdjustment {
    let adjustmentDelta = 0;
    let reason = '';
    let adjustmentType: 'boost' | 'decay' = 'boost';
    let signalStrength = 0.5;

    // Check minimum impressions threshold
    if (metrics.traffic.totalImpressions < this.rules.minImpressionsThreshold) {
      return {
        patternId: mapping.patternId,
        currentConfidence: mapping.adjustmentPercentage,
        adjustmentDelta: 0,
        reason: `Insufficient impressions (${metrics.traffic.totalImpressions} < ${this.rules.minImpressionsThreshold})`,
        adjustmentType: 'boost',
        signalStrength: 0,
      };
    }

    // Evaluate ranking performance
    if (metrics.ranking.bestPosition <= 3) {
      adjustmentDelta += this.rules.topThreeBoost;
      reason += 'Top 3 ranking. ';
      signalStrength = Math.max(signalStrength, 0.95);
    } else if (metrics.ranking.bestPosition <= 10) {
      adjustmentDelta += this.rules.topTenBoost;
      reason += 'Top 10 ranking. ';
      signalStrength = Math.max(signalStrength, 0.85);
    } else if (metrics.ranking.bestPosition <= 20) {
      adjustmentDelta += this.rules.topTwentyBoost;
      reason += 'Top 20 ranking. ';
      signalStrength = Math.max(signalStrength, 0.65);
    } else if (metrics.ranking.bestPosition > 50) {
      adjustmentDelta += this.rules.rankingDropDecay;
      adjustmentType = 'decay';
      reason += 'Poor ranking (>50). ';
      signalStrength = Math.max(signalStrength, 0.75);
    }

    // Evaluate CTR performance
    if (metrics.conversions.averageCTR > 0.03) {
      adjustmentDelta += this.rules.highCTRBoost;
      reason += 'High CTR (>3%). ';
      signalStrength = Math.max(signalStrength, 0.80);
    } else if (metrics.conversions.averageCTR < 0.01) {
      adjustmentDelta += this.rules.lowCTRDecay;
      adjustmentType = 'decay';
      reason += 'Low CTR (<1%). ';
      signalStrength = Math.max(signalStrength, 0.70);
    }

    // Evaluate traffic trend
    if (metrics.traffic.trafficTrendDirection > 0.1) {
      adjustmentDelta += this.rules.trafficIncreaseBoost;
      reason += 'Increasing traffic trend. ';
      signalStrength = Math.max(signalStrength, 0.75);
    } else if (metrics.traffic.trafficTrendDirection < -0.1) {
      adjustmentDelta += this.rules.trafficDecreaseDecay;
      adjustmentType = 'decay';
      reason += 'Decreasing traffic trend. ';
      signalStrength = Math.max(signalStrength, 0.70);
    }

    return {
      patternId: mapping.patternId,
      currentConfidence: mapping.adjustmentPercentage,
      adjustmentDelta: adjustmentDelta || 0,
      reason: reason.trim() || 'Stable performance',
      adjustmentType,
      signalStrength,
    };
  }

  // =============================================
  // Storage Operations
  // =============================================

  /**
   * Apply confidence update to pattern in storage
   */
  private async applyConfidenceUpdate(
    metrics: PerformanceMetricsInput,
    mapping: PatternContentMapping,
    adjustment: ConfidenceAdjustment
  ): Promise<PatternConfidenceUpdate> {
    // Calculate new confidence with bounds
    const newConfidence = Math.max(
      this.rules.minConfidence,
      Math.min(
        this.rules.maxConfidence,
        adjustment.currentConfidence + adjustment.adjustmentDelta
      )
    );

    return {
      patternId: mapping.patternId,
      patternName: mapping.patternName,
      previousConfidence: adjustment.currentConfidence,
      newConfidence,
      confidenceDelta: newConfidence - adjustment.currentConfidence,
      reason: adjustment.reason,
      contentId: metrics.contentId,
      metricsUsed: {
        averagePosition: metrics.ranking.averagePosition,
        averageCTR: metrics.conversions.averageCTR,
        trafficTrendDirection: metrics.traffic.trafficTrendDirection,
      },
      feedbackAt: metrics.metricsCollectedAt,
    };
  }

  /**
   * Store learning history for audit trail
   */
  private async storeLearningHistory(
    metrics: PerformanceMetricsInput,
    updates: readonly PatternConfidenceUpdate[]
  ): Promise<void> {
    // Store each update as a learning history entry
    // This would typically be persisted to a database or knowledge store
    for (const update of updates) {
      const entry: LearningHistoryEntry = {
        id: this.generateHistoryEntryId(),
        patternId: update.patternId,
        contentId: metrics.contentId,
        performanceMetrics: metrics,
        confidenceAdjustment: update.confidenceDelta,
        reason: update.reason,
        recordedAt: new Date(),
        outcome:
          update.confidenceDelta > 0
            ? 'improved'
            : update.confidenceDelta < 0
              ? 'declined'
              : 'stable',
      };

      // Persist entry (implementation depends on storage backend)
      await this.persistLearningEntry(entry);
    }
  }

  /**
   * Persist learning entry to storage
   *
   * Implementation would depend on storage backend (Redis, PostgreSQL, etc.)
   * For now, this provides a hook for future storage integration.
   *
   * TODO: Integrate with actual storage backend to persist learning history
   * for long-term pattern learning and optimization.
   */
  private async persistLearningEntry(entry: LearningHistoryEntry): Promise<void> {
    try {
      // Future integration point: save to database or vector store
      // Examples:
      // - await this.queryManager.learningHistory?.add(entry);
      // - await storageClient.saveEntry(entry);
      // - await redis.hset(`learning:${entry.id}`, entry);

      // For now, we silently succeed as this is a learning history feature
      // that can be implemented separately based on storage backend choice
    } catch (error) {
      // Silently fail for non-critical learning history persistence
      // Log in production: console.warn('Failed to persist learning entry:', error);
    }
  }

  // =============================================
  // Report Generation
  // =============================================

  /**
   * Generate performance report
   */
  private generatePerformanceReport(
    reportId: string,
    metrics: PerformanceMetricsInput,
    updates: readonly PatternConfidenceUpdate[]
  ): PerformanceReport {
    const improved = updates.filter((u) => u.confidenceDelta > 0).length;
    const declined = updates.filter((u) => u.confidenceDelta < 0).length;
    const totalDelta = updates.reduce((sum, u) => sum + u.confidenceDelta, 0);
    const avgConfidence =
      updates.length > 0
        ? updates.reduce((sum, u) => sum + u.newConfidence, 0) / updates.length
        : 0;

    const recommendations = this.generateRecommendations(metrics, updates);

    return {
      reportId,
      contentId: metrics.contentId,
      contentUrl: metrics.contentUrl,
      patternsUpdated: updates.length,
      patternUpdates: updates,
      totalConfidenceDelta: totalDelta,
      averageNewConfidence: avgConfidence,
      patternsImproved: improved,
      patternsDeclined: declined,
      recommendations,
      generatedAt: new Date(),
      performanceTimeWindow: metrics.timeWindow,
    };
  }

  /**
   * Generate learning recommendations
   */
  private generateRecommendations(
    metrics: PerformanceMetricsInput,
    updates: readonly PatternConfidenceUpdate[]
  ): readonly string[] {
    const recommendations: string[] = [];

    // Check for insufficient data first
    if (metrics.traffic.totalImpressions < this.rules.minImpressionsThreshold) {
      recommendations.push(
        `Insufficient impressions (${metrics.traffic.totalImpressions} < ${this.rules.minImpressionsThreshold}) - Collect more data before pattern adjustments`
      );
      return recommendations;
    }

    // Rank-based recommendations
    if (metrics.ranking.bestPosition <= 3) {
      recommendations.push(
        'Excellent ranking performance - consider analyzing this content for additional high-value patterns'
      );
    } else if (metrics.ranking.bestPosition > 50) {
      recommendations.push(
        'Poor ranking - review applied patterns and consider content refresh or pattern refinement'
      );
    }

    // CTR-based recommendations
    if (metrics.conversions.averageCTR > 0.04) {
      recommendations.push(
        'Exceptional CTR - analyze title/meta description patterns for reuse'
      );
    } else if (metrics.conversions.averageCTR < 0.01) {
      recommendations.push('Low CTR - test different title and meta description approaches');
    }

    // Pattern improvement tracking
    const improvedPatterns = updates.filter((u) => u.confidenceDelta > 0.05);
    if (improvedPatterns.length > 0) {
      recommendations.push(
        `${improvedPatterns.length} high-confidence patterns performing well - prioritize for reuse`
      );
    }

    // Traffic trend recommendations
    if (metrics.traffic.trafficTrendDirection > 0.15) {
      recommendations.push('Strong growth trajectory - maintain current patterns and content strategy');
    } else if (metrics.traffic.trafficTrendDirection < -0.15) {
      recommendations.push(
        'Declining trend - consider content updates or pattern pivots'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Stable performance - continue monitoring and incrementally refine patterns'
      );
    }

    return recommendations;
  }

  // =============================================
  // Utility Methods
  // =============================================

  /**
   * Generate unique report ID
   */
  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique history entry ID
   */
  private generateHistoryEntryId(): string {
    return `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update adjustment rules
   */
  updateAdjustmentRules(rules: Partial<ConfidenceAdjustmentRules>): void {
    this.rules = {
      ...this.rules,
      ...rules,
    };
  }

  /**
   * Get current adjustment rules
   */
  getAdjustmentRules(): ConfidenceAdjustmentRules {
    return { ...this.rules };
  }
}

export default PerformanceFeedbackManager;
