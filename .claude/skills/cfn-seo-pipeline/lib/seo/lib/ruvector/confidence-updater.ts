/**
 * SEO Intelligence RuVector Confidence Updater
 *
 * Processes GSC/GA4 performance data to update confidence scores:
 * - Pattern confidence (how well content patterns perform)
 * - Expert authority scores (which experts correlate with success)
 * - Statistic credibility scores (which statistics perform well)
 *
 * Part of Phase 4 Sprint 1 - RuVector Intelligence Integration
 *
 * @module seo/lib/ruvector/confidence-updater
 */

import type { SEOQueryManager } from './queries';
import type { ContentPatternEntry, ExpertSourceEntry, StatisticEntry } from './schemas';

// =============================================
// Performance Data Interface
// =============================================

/**
 * Performance metrics from GSC/GA4
 */
export interface PerformanceData {
  /** Content/article ID */
  contentId: string;

  /** URL of the content */
  url: string;

  /** Date range for metrics */
  dateRange: {
    start: Date;
    end: Date;
  };

  /** GSC metrics */
  gsc: {
    impressions: number;
    clicks: number;
    ctr: number;
    averagePosition: number;
    positionTrend: 'improving' | 'stable' | 'declining';
  };

  /** GA4 metrics */
  ga4: {
    sessions: number;
    avgSessionDuration: number;
    bounceRate: number;
    engagementRate: number;
    conversions: number;
  };

  /** Days since publication */
  daysSincePublish: number;

  /** Content stage */
  stage: 'initial' | 'short-term' | 'long-term';
}

// =============================================
// Confidence Update Results
// =============================================

/**
 * Individual confidence update
 */
export interface ConfidenceUpdate {
  type: 'pattern' | 'expert' | 'statistic';
  id: string;
  name: string;
  previousScore: number;
  newScore: number;
  delta: number;
  reason: string;
}

/**
 * Result of confidence update operation
 */
export interface ConfidenceUpdateResult {
  /** Patterns updated */
  patternsUpdated: number;

  /** Experts updated */
  expertsUpdated: number;

  /** Statistics updated */
  statisticsUpdated: number;

  /** Total confidence delta (absolute sum) */
  totalConfidenceDelta: number;

  /** Individual updates */
  updates: ConfidenceUpdate[];

  /** Execution time (ms) */
  executionTime: number;
}

// =============================================
// Configuration
// =============================================

/**
 * Configuration for ConfidenceUpdater
 */
export interface ConfidenceUpdaterConfig {
  /** SEO Query Manager */
  seoQueryManager: SEOQueryManager;

  /** Performance thresholds */
  thresholds?: {
    /** CTR threshold for "good" (default: 0.03) */
    goodCTR: number;
    /** Position threshold for "good" (default: 10) */
    goodPosition: number;
    /** Engagement rate threshold (default: 0.5) */
    goodEngagement: number;
    /** Bounce rate threshold (default: 0.7) */
    badBounce: number;
  };

  /** Confidence adjustment amounts */
  adjustments?: {
    /** Boost for good performance (default: 0.05) */
    goodPerformanceBoost: number;
    /** Reduction for poor performance (default: -0.08) */
    poorPerformanceReduction: number;
    /** Max confidence score (default: 0.95) */
    maxConfidence: number;
    /** Min confidence score (default: 0.10) */
    minConfidence: number;
  };

  /** Enable verbose logging */
  verbose?: boolean;
}

// =============================================
// Default Configuration Values
// =============================================

const DEFAULT_THRESHOLDS = {
  goodCTR: 0.03,
  goodPosition: 10,
  goodEngagement: 0.5,
  badBounce: 0.7,
};

const DEFAULT_ADJUSTMENTS = {
  goodPerformanceBoost: 0.05,
  poorPerformanceReduction: -0.08,
  maxConfidence: 0.95,
  minConfidence: 0.10,
};

// =============================================
// ConfidenceUpdater Class
// =============================================

/**
 * Updates confidence scores based on real-world performance data
 */
export class ConfidenceUpdater {
  private config: Required<ConfidenceUpdaterConfig>;

  constructor(config: ConfidenceUpdaterConfig) {
    this.config = {
      seoQueryManager: config.seoQueryManager,
      thresholds: { ...DEFAULT_THRESHOLDS, ...config.thresholds },
      adjustments: { ...DEFAULT_ADJUSTMENTS, ...config.adjustments },
      verbose: config.verbose ?? false,
    };
  }

  // =============================================
  // Public API
  // =============================================

  /**
   * Update confidence scores based on performance data
   */
  async updateFromPerformance(
    performance: PerformanceData,
    usedPatterns: string[],
    usedExperts: string[],
    usedStatistics: string[]
  ): Promise<ConfidenceUpdateResult> {
    const startTime = Date.now();
    const updates: ConfidenceUpdate[] = [];

    this.log(`Processing performance for content ${performance.contentId} (${performance.url})`);

    // Calculate overall performance score
    const performanceScore = this.calculatePerformanceScore(performance);
    this.log(`Performance score: ${(performanceScore * 100).toFixed(1)}%`);

    // Update patterns
    for (const patternId of usedPatterns) {
      const update = await this.updatePatternConfidence(patternId, performanceScore, performance.contentId);
      if (update) {
        updates.push(update);
        this.log(`Pattern ${patternId}: ${update.previousScore.toFixed(3)} → ${update.newScore.toFixed(3)} (${update.reason})`);
      }
    }

    // Update experts
    for (const expertName of usedExperts) {
      const update = await this.updateExpertAuthority(expertName, performanceScore, performance.contentId);
      if (update) {
        updates.push(update);
        this.log(`Expert ${expertName}: ${update.previousScore.toFixed(3)} → ${update.newScore.toFixed(3)} (${update.reason})`);
      }
    }

    // Update statistics
    for (const statisticId of usedStatistics) {
      const update = await this.updateStatisticCredibility(statisticId, performanceScore, performance.contentId);
      if (update) {
        updates.push(update);
        this.log(`Statistic ${statisticId}: ${update.previousScore.toFixed(3)} → ${update.newScore.toFixed(3)} (${update.reason})`);
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      patternsUpdated: updates.filter((u) => u.type === 'pattern').length,
      expertsUpdated: updates.filter((u) => u.type === 'expert').length,
      statisticsUpdated: updates.filter((u) => u.type === 'statistic').length,
      totalConfidenceDelta: updates.reduce((sum, u) => sum + Math.abs(u.delta), 0),
      updates,
      executionTime,
    };
  }

  /**
   * Batch update from multiple performance records
   */
  async batchUpdate(
    records: Array<{
      performance: PerformanceData;
      usedPatterns: string[];
      usedExperts: string[];
      usedStatistics: string[];
    }>
  ): Promise<ConfidenceUpdateResult> {
    const startTime = Date.now();
    const allUpdates: ConfidenceUpdate[] = [];
    let totalPatterns = 0;
    let totalExperts = 0;
    let totalStatistics = 0;

    this.log(`Processing batch of ${records.length} performance records`);

    for (const record of records) {
      const result = await this.updateFromPerformance(
        record.performance,
        record.usedPatterns,
        record.usedExperts,
        record.usedStatistics
      );

      totalPatterns += result.patternsUpdated;
      totalExperts += result.expertsUpdated;
      totalStatistics += result.statisticsUpdated;
      allUpdates.push(...result.updates);
    }

    const executionTime = Date.now() - startTime;

    this.log(`Batch complete: ${totalPatterns} patterns, ${totalExperts} experts, ${totalStatistics} statistics updated in ${executionTime}ms`);

    return {
      patternsUpdated: totalPatterns,
      expertsUpdated: totalExperts,
      statisticsUpdated: totalStatistics,
      totalConfidenceDelta: allUpdates.reduce((sum, u) => sum + Math.abs(u.delta), 0),
      updates: allUpdates,
      executionTime,
    };
  }

  /**
   * Calculate performance score from metrics
   *
   * Returns a normalized score from 0.0 (poor) to 1.0 (excellent)
   * based on GSC and GA4 metrics weighted by content stage.
   */
  calculatePerformanceScore(performance: PerformanceData): number {
    const { gsc, ga4, stage } = performance;

    // Weight by content stage
    // Initial: focus on CTR and engagement (establishing relevance)
    // Short-term: balanced across all metrics
    // Long-term: emphasize position and sustained engagement
    const stageWeights = {
      initial: { position: 0.2, ctr: 0.3, engagement: 0.3, bounce: 0.2 },
      'short-term': { position: 0.3, ctr: 0.25, engagement: 0.25, bounce: 0.2 },
      'long-term': { position: 0.35, ctr: 0.25, engagement: 0.2, bounce: 0.2 },
    };

    const weights = stageWeights[stage];

    // Position score (lower is better, normalize to 0-1)
    // Perfect score at position 1, declining to 0 at position 100
    const positionScore = Math.max(0, 1 - (gsc.averagePosition - 1) / 100);

    // CTR score (higher is better)
    // Perfect score at 10% CTR, linear scaling
    const ctrScore = Math.min(1, gsc.ctr / 0.1);

    // Engagement score (higher is better)
    // Already 0-1 scale
    const engagementScore = Math.min(1, ga4.engagementRate);

    // Bounce score (lower is better, invert)
    // Perfect score at 0% bounce, worst at 100%
    const bounceScore = Math.max(0, 1 - ga4.bounceRate);

    // Apply position trend adjustment
    let trendAdjustment = 0;
    if (gsc.positionTrend === 'improving') {
      trendAdjustment = 0.05; // Bonus for improving
    } else if (gsc.positionTrend === 'declining') {
      trendAdjustment = -0.05; // Penalty for declining
    }

    // Weighted average
    const baseScore =
      weights.position * positionScore +
      weights.ctr * ctrScore +
      weights.engagement * engagementScore +
      weights.bounce * bounceScore;

    // Apply trend adjustment and clamp to [0, 1]
    return Math.max(0, Math.min(1, baseScore + trendAdjustment));
  }

  // =============================================
  // Private Update Methods
  // =============================================

  /**
   * Update pattern confidence based on performance
   */
  private async updatePatternConfidence(
    patternId: string,
    performanceScore: number,
    contentId: string
  ): Promise<ConfidenceUpdate | null> {
    // Get pattern from collection
    const pattern = await this.config.seoQueryManager.contentPatterns.getById(patternId);
    if (!pattern) {
      this.log(`Pattern ${patternId} not found, skipping`);
      return null;
    }

    const previousScore = pattern.metadata.confidence;

    // Calculate delta based on performance
    let delta: number;
    let reason: string;

    if (performanceScore >= 0.7) {
      delta = this.config.adjustments.goodPerformanceBoost;
      reason = `Good performance (${(performanceScore * 100).toFixed(1)}%)`;
    } else if (performanceScore <= 0.3) {
      delta = this.config.adjustments.poorPerformanceReduction;
      reason = `Poor performance (${(performanceScore * 100).toFixed(1)}%)`;
    } else {
      // Moderate performance: small adjustment proportional to deviation from 0.5
      delta = (performanceScore - 0.5) * 0.04; // Max ±0.02
      reason = `Moderate performance (${(performanceScore * 100).toFixed(1)}%)`;
    }

    // Apply bounds
    const newScore = Math.max(
      this.config.adjustments.minConfidence,
      Math.min(this.config.adjustments.maxConfidence, previousScore + delta)
    );

    // Update in collection using existing method
    // The method signature is: updateConfidence(id, performanceScore, consensusScore?)
    // We pass performanceScore directly as it's already calculated
    await this.config.seoQueryManager.contentPatterns.updateConfidence(patternId, performanceScore);

    return {
      type: 'pattern',
      id: patternId,
      name: pattern.metadata.description?.substring(0, 50) || patternId,
      previousScore,
      newScore,
      delta: newScore - previousScore,
      reason,
    };
  }

  /**
   * Update expert authority based on performance
   */
  private async updateExpertAuthority(
    expertName: string,
    performanceScore: number,
    contentId: string
  ): Promise<ConfidenceUpdate | null> {
    // Find expert by name
    const experts = await this.config.seoQueryManager.expertSources.query(expertName, { limit: 1 });
    if (experts.length === 0) {
      this.log(`Expert "${expertName}" not found, skipping`);
      return null;
    }

    const expert = experts[0];
    const previousScore = expert.metadata.authorityScore;

    // Calculate delta (smaller adjustments for experts - they're more stable)
    let delta: number;
    let reason: string;

    if (performanceScore >= 0.7) {
      delta = 0.03; // Smaller boost for experts
      reason = `Content with quote performed well (${(performanceScore * 100).toFixed(1)}%)`;
    } else if (performanceScore <= 0.3) {
      delta = -0.05; // Slightly larger penalty
      reason = `Content with quote performed poorly (${(performanceScore * 100).toFixed(1)}%)`;
    } else {
      // Moderate performance: no change for experts
      delta = 0;
      reason = 'Moderate performance, no authority change';
    }

    if (delta === 0) return null;

    const newScore = Math.max(0.1, Math.min(0.95, previousScore + delta));

    // Update in collection using existing method
    // The method signature is: updateAuthorityScore(id, performanceScore, weight = 0.1)
    // We use a custom weight based on our delta calculation
    const weight = Math.abs(delta) / Math.max(0.01, Math.abs(performanceScore - previousScore));
    await this.config.seoQueryManager.expertSources.updateAuthorityScore(expert.id, performanceScore, weight);

    return {
      type: 'expert',
      id: expert.id,
      name: expert.metadata.name,
      previousScore,
      newScore,
      delta: newScore - previousScore,
      reason,
    };
  }

  /**
   * Update statistic credibility based on performance
   */
  private async updateStatisticCredibility(
    statisticId: string,
    performanceScore: number,
    contentId: string
  ): Promise<ConfidenceUpdate | null> {
    const stat = await this.config.seoQueryManager.statistics.getById(statisticId);
    if (!stat) {
      this.log(`Statistic ${statisticId} not found, skipping`);
      return null;
    }

    const previousScore = stat.metadata.credibilityScore;

    // Calculate delta (very small adjustments for statistics - they're facts)
    let delta: number;
    let reason: string;

    if (performanceScore >= 0.7) {
      delta = 0.02; // Small boost
      reason = `Content using statistic performed well`;
    } else if (performanceScore <= 0.3) {
      delta = -0.03; // Small penalty
      reason = `Content using statistic performed poorly`;
    } else {
      // Moderate performance: no change for statistics
      delta = 0;
      reason = 'Moderate performance, no credibility change';
    }

    if (delta === 0) return null;

    const newScore = Math.max(0.1, Math.min(0.95, previousScore + delta));

    // Update in collection using existing update method
    // The statistics collection has an update() method that accepts partial updates
    await this.config.seoQueryManager.statistics.update(statisticId, {
      credibilityScore: newScore,
      articleIds: [contentId], // Track which articles used this statistic
    });

    return {
      type: 'statistic',
      id: statisticId,
      name: stat.metadata.statistic.substring(0, 50),
      previousScore,
      newScore,
      delta: newScore - previousScore,
      reason,
    };
  }

  // =============================================
  // Utility Methods
  // =============================================

  /**
   * Log message if verbose mode is enabled
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[ConfidenceUpdater] ${message}`);
    }
  }
}

// =============================================
// Exports
// =============================================

export default ConfidenceUpdater;
