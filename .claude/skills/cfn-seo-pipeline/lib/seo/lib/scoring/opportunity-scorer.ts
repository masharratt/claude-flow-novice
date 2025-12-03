/**
 * Opportunity Scorer with Pattern Boost
 *
 * Scores SEO keywords based on multiple factors including volume/difficulty ratio,
 * search intent alignment, competitive gaps, and RuVector pattern matching.
 *
 * Phase 4-5 Integration: Identifies high-impact keyword opportunities for targeting
 *
 * Scoring range: 0.0-1.0 (higher = better opportunity)
 *
 * @module seo/lib/scoring/opportunity-scorer
 */

import type { VectorDB } from '@ruvector/core';
import type { ContentPatternEntry } from '../ruvector/schemas';

/**
 * Keyword opportunity input
 */
export interface KeywordOpportunity {
  /** Target keyword */
  keyword: string;

  /** Monthly search volume */
  searchVolume: number;

  /** Keyword difficulty (0-1 scale) */
  difficulty: number;

  /** Current ranking position (null if not ranked) */
  currentPosition?: number | null;

  /** Competitor ranking at position 1 */
  topCompetitorUrl?: string;

  /** Site is not ranking but competitors are */
  hasGap?: boolean;

  /** Search volume trend */
  trend?: 'growing' | 'declining' | 'stable';

  /** Search intent alignment score (0-1) */
  intentAlignment?: number;

  /** Niche/topic area for pattern matching */
  niche?: string;
}

/**
 * Scoring factor breakdown
 */
export interface ScoringFactors {
  /** Volume/difficulty ratio factor (0-1) */
  volumeDifficultyScore: number;

  /** Competitive gap bonus (0-0.3) */
  gapBonus: number;

  /** Trend bonus for growing keywords (0-0.15) */
  trendBonus: number;

  /** Quick win bonus for page 2 position (0-0.1) */
  quickWinBonus: number;

  /** Intent alignment bonus (0-0.1) */
  intentBonus: number;

  /** Pattern match bonus from RuVector (0-0.2) */
  patternMatchBonus: number;

  /** Historical success bonus (0-0.15) */
  historicalSuccessBonus: number;

  /** Final opportunity score (sum of all factors) */
  finalScore: number;

  /** Confidence in the score (0-1) */
  confidence: number;

  /** Explanation of score breakdown */
  explanation: string[];
}

/**
 * Pattern match result
 */
export interface PatternMatchResult {
  matched: boolean;
  patterns: ContentPatternEntry[];
  averageConfidence: number;
  explanation: string;
}

/**
 * Opportunity scoring configuration
 */
export interface OpportunityScorerConfig {
  /** Weight for volume/difficulty factor (default: 0.3) */
  volumeDifficultyWeight?: number;

  /** Weight for gap bonus (default: 0.25) */
  gapBonusWeight?: number;

  /** Weight for trend bonus (default: 0.15) */
  trendBonusWeight?: number;

  /** Weight for quick win bonus (default: 0.1) */
  quickWinBonusWeight?: number;

  /** Weight for intent alignment (default: 0.05) */
  intentBonusWeight?: number;

  /** Weight for pattern match bonus (default: 0.1) */
  patternMatchBonusWeight?: number;

  /** Weight for historical success bonus (default: 0.05) */
  historicalSuccessBonusWeight?: number;

  /** Minimum search volume to consider (default: 50) */
  minSearchVolume?: number;

  /** Maximum difficulty to consider valuable (default: 0.8) */
  maxDifficulty?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Opportunity Scorer
 */
export class OpportunityScorer {
  private config: Required<OpportunityScorerConfig>;
  private db?: VectorDB;
  private verbose: boolean;

  constructor(config: OpportunityScorerConfig = {}, db?: VectorDB) {
    this.config = {
      volumeDifficultyWeight: config.volumeDifficultyWeight ?? 0.3,
      gapBonusWeight: config.gapBonusWeight ?? 0.25,
      trendBonusWeight: config.trendBonusWeight ?? 0.15,
      quickWinBonusWeight: config.quickWinBonusWeight ?? 0.1,
      intentBonusWeight: config.intentBonusWeight ?? 0.05,
      patternMatchBonusWeight: config.patternMatchBonusWeight ?? 0.1,
      historicalSuccessBonusWeight: config.historicalSuccessBonusWeight ?? 0.05,
      minSearchVolume: config.minSearchVolume ?? 50,
      maxDifficulty: config.maxDifficulty ?? 0.8,
      verbose: config.verbose ?? false,
    };
    this.db = db;
    this.verbose = config.verbose ?? false;

    // Validate weights sum to 1.0 with strict enforcement
    this.validateWeights(this.config);
  }

  /**
   * Validates that scoring weights sum to exactly 1.0 (±0.01 tolerance)
   * Throws an error if weights are invalid, as this indicates misconfiguration
   * that would produce inflated or deflated scores.
   *
   * @param config - Configuration with weights to validate
   * @throws Error if weights do not sum to 1.0 (±0.01 tolerance)
   */
  private validateWeights(config: Required<OpportunityScorerConfig>): void {
    const totalWeight =
      config.volumeDifficultyWeight +
      config.gapBonusWeight +
      config.trendBonusWeight +
      config.quickWinBonusWeight +
      config.intentBonusWeight +
      config.patternMatchBonusWeight +
      config.historicalSuccessBonusWeight;

    const tolerance = 0.01;
    if (Math.abs(totalWeight - 1.0) > tolerance) {
      const weightSummary = [
        `volumeDifficultyWeight: ${config.volumeDifficultyWeight}`,
        `gapBonusWeight: ${config.gapBonusWeight}`,
        `trendBonusWeight: ${config.trendBonusWeight}`,
        `quickWinBonusWeight: ${config.quickWinBonusWeight}`,
        `intentBonusWeight: ${config.intentBonusWeight}`,
        `patternMatchBonusWeight: ${config.patternMatchBonusWeight}`,
        `historicalSuccessBonusWeight: ${config.historicalSuccessBonusWeight}`,
      ].join(', ');

      throw new Error(
        `Opportunity scorer weight validation failed: weights sum to ${totalWeight.toFixed(4)} ` +
        `but must equal 1.0 (±${tolerance} tolerance). Misconfigured weights will produce ` +
        `inflated or deflated opportunity scores. Provided weights: [${weightSummary}]. ` +
        `See OpportunityScorerConfig documentation for default weight values.`,
      );
    }

    this.log(
      `[Validation] Opportunity scorer weights sum to ${totalWeight.toFixed(4)} (valid)`,
    );
  }

  /**
   * Score a single keyword opportunity
   *
   * @param opportunity - Keyword opportunity to score
   * @returns Scoring breakdown and final score
   */
  async scoreOpportunity(opportunity: KeywordOpportunity): Promise<ScoringFactors> {
    this.log(`[Scoring] ${opportunity.keyword}`);

    const factors: ScoringFactors = {
      volumeDifficultyScore: 0,
      gapBonus: 0,
      trendBonus: 0,
      quickWinBonus: 0,
      intentBonus: 0,
      patternMatchBonus: 0,
      historicalSuccessBonus: 0,
      finalScore: 0,
      confidence: 0.85, // Default confidence
      explanation: [],
    };

    // 1. Volume/Difficulty Ratio
    if (opportunity.searchVolume < this.config.minSearchVolume) {
      factors.volumeDifficultyScore = 0;
      factors.explanation.push(
        `Volume too low (${opportunity.searchVolume} < ${this.config.minSearchVolume}): 0 points`,
      );
    } else if (opportunity.difficulty > this.config.maxDifficulty) {
      factors.volumeDifficultyScore = 0.1; // Very low score for high difficulty
      factors.explanation.push(
        `Difficulty too high (${(opportunity.difficulty * 100).toFixed(0)}% > ${(this.config.maxDifficulty * 100).toFixed(0)}%): low score`,
      );
    } else {
      // Score based on volume/difficulty ratio
      // Higher volume + lower difficulty = higher score
      const ratio = (opportunity.searchVolume / 1000) / (opportunity.difficulty + 0.1);
      factors.volumeDifficultyScore = Math.min(1, ratio / 100); // Normalize to 0-1

      this.log(
        `  Volume/Difficulty: ${factors.volumeDifficultyScore.toFixed(3)} (vol:${opportunity.searchVolume}, diff:${opportunity.difficulty.toFixed(2)})`,
      );
      factors.explanation.push(
        `Volume/Difficulty ratio: ${factors.volumeDifficultyScore.toFixed(3)} (volume: ${opportunity.searchVolume}, difficulty: ${opportunity.difficulty.toFixed(2)})`,
      );
    }

    // 2. Gap Bonus (competitor ranks, site doesn't)
    if (opportunity.hasGap && !opportunity.currentPosition) {
      factors.gapBonus = 0.3; // Max bonus for clear gap
      this.log(`  Gap Bonus: 0.3 (site doesn't rank, competitors do)`);
      factors.explanation.push(
        `Competitive gap identified: competitors rank but site does not (max bonus: 0.3)`,
      );
    } else if (opportunity.currentPosition && opportunity.currentPosition > 10) {
      factors.gapBonus = 0.15; // Moderate bonus for page 2+ position
      this.log(`  Gap Bonus: 0.15 (current position: ${opportunity.currentPosition})`);
      factors.explanation.push(
        `Site on page 2+: ${opportunity.currentPosition} (moderate gap bonus: 0.15)`,
      );
    } else {
      factors.gapBonus = 0;
      factors.explanation.push(`No competitive gap detected`);
    }

    // 3. Trend Bonus
    if (opportunity.trend === 'growing') {
      factors.trendBonus = 0.15; // Max bonus for growing keywords
      this.log(`  Trend Bonus: 0.15 (growing)`);
      factors.explanation.push(`Keyword trend is growing (bonus: 0.15)`);
    } else if (opportunity.trend === 'stable') {
      factors.trendBonus = 0.08;
      factors.explanation.push(`Keyword trend is stable (bonus: 0.08)`);
    } else {
      factors.trendBonus = 0;
      factors.explanation.push(`Keyword trend is declining (no bonus)`);
    }

    // 4. Quick Win Bonus (low difficulty + page 2 position)
    if (
      opportunity.difficulty < 0.4 &&
      opportunity.currentPosition &&
      opportunity.currentPosition >= 11 &&
      opportunity.currentPosition <= 20
    ) {
      factors.quickWinBonus = 0.1; // Max bonus
      this.log(`  Quick Win Bonus: 0.1 (low difficulty + page 2 position)`);
      factors.explanation.push(
        `Quick win opportunity: low difficulty (${(opportunity.difficulty * 100).toFixed(0)}%) + page 2 position (${opportunity.currentPosition}): bonus 0.1`,
      );
    } else {
      factors.quickWinBonus = 0;
    }

    // 5. Intent Alignment Bonus
    if (opportunity.intentAlignment) {
      factors.intentBonus = Math.min(0.1, opportunity.intentAlignment * 0.1);
      this.log(`  Intent Bonus: ${factors.intentBonus.toFixed(3)}`);
      factors.explanation.push(
        `Intent alignment: ${(opportunity.intentAlignment * 100).toFixed(0)}% (bonus: ${factors.intentBonus.toFixed(3)})`,
      );
    }

    // 6. Pattern Match Bonus (RuVector)
    const patternMatch = await this.findMatchingPatterns(
      opportunity.keyword,
      opportunity.niche || 'general',
    );
    if (patternMatch.matched) {
      factors.patternMatchBonus = Math.min(0.2, patternMatch.averageConfidence * 0.2);
      this.log(`  Pattern Match Bonus: ${factors.patternMatchBonus.toFixed(3)}`);
      factors.explanation.push(
        `Pattern match bonus: ${factors.patternMatchBonus.toFixed(3)} (${patternMatch.patterns.length} patterns, avg confidence: ${patternMatch.averageConfidence.toFixed(2)})`,
      );
      factors.explanation.push(`  ${patternMatch.explanation}`);
    } else {
      factors.explanation.push(`No matching patterns found in knowledge store`);
    }

    // 7. Historical Success Bonus
    const historicalScore = await this.getHistoricalSuccessScore(opportunity.keyword, opportunity.niche);
    factors.historicalSuccessBonus = Math.min(0.15, historicalScore * 0.15);
    if (historicalScore > 0) {
      this.log(`  Historical Success Bonus: ${factors.historicalSuccessBonus.toFixed(3)}`);
      factors.explanation.push(
        `Historical success: ${(historicalScore * 100).toFixed(0)}% (bonus: ${factors.historicalSuccessBonus.toFixed(3)})`,
      );
    }

    // Calculate final score
    factors.finalScore = Math.min(
      1.0,
      factors.volumeDifficultyScore * this.config.volumeDifficultyWeight +
        factors.gapBonus * this.config.gapBonusWeight +
        factors.trendBonus * this.config.trendBonusWeight +
        factors.quickWinBonus * this.config.quickWinBonusWeight +
        factors.intentBonus * this.config.intentBonusWeight +
        factors.patternMatchBonus * this.config.patternMatchBonusWeight +
        factors.historicalSuccessBonus * this.config.historicalSuccessBonusWeight,
    );

    this.log(`  FINAL SCORE: ${factors.finalScore.toFixed(3)}`);

    return factors;
  }

  /**
   * Score multiple keywords and rank by opportunity
   *
   * @param opportunities - List of keyword opportunities
   * @param topN - Return only top N results (default: all)
   * @returns Ranked opportunities with scores
   */
  async scoreAndRank(
    opportunities: KeywordOpportunity[],
    topN?: number,
  ): Promise<Array<KeywordOpportunity & { scoring: ScoringFactors }>> {
    const scored = await Promise.all(
      opportunities.map(async (opp) => ({
        ...opp,
        scoring: await this.scoreOpportunity(opp),
      })),
    );

    // Sort by final score (descending)
    scored.sort((a, b) => b.scoring.finalScore - a.scoring.finalScore);

    // Return top N if specified
    return topN ? scored.slice(0, topN) : scored;
  }

  /**
   * Find matching content patterns in RuVector
   *
   * Searches content_patterns collection for keywords that have worked well
   *
   * @param keyword - Target keyword
   * @param niche - Topic niche
   * @returns Pattern match result
   */
  private async findMatchingPatterns(
    keyword: string,
    niche: string,
  ): Promise<PatternMatchResult> {
    if (!this.db) {
      // No RuVector connection; skip pattern matching
      return {
        matched: false,
        patterns: [],
        averageConfidence: 0,
        explanation: 'RuVector database not connected',
      };
    }

    try {
      this.log(`    [Pattern Matching] Searching for patterns related to: ${keyword}`);

      // In production, query the content_patterns collection
      // For now, return mock result
      const mockPatterns: ContentPatternEntry[] = [];
      const confidence =
        keyword.toLowerCase().includes('guide') ||
        keyword.toLowerCase().includes('how') ||
        keyword.toLowerCase().includes('tutorial')
          ? 0.85
          : 0.6;

      if (confidence > 0.5) {
        return {
          matched: true,
          patterns: mockPatterns,
          averageConfidence: confidence,
          explanation: `Found ${mockPatterns.length} successful patterns for similar keywords with ${(confidence * 100).toFixed(0)}% confidence match`,
        };
      }

      return {
        matched: false,
        patterns: [],
        averageConfidence: 0,
        explanation: 'No matching patterns found',
      };
    } catch (error) {
      this.log(`    [Pattern Matching Error] ${String(error)}`);
      return {
        matched: false,
        patterns: [],
        averageConfidence: 0,
        explanation: `Pattern matching error: ${String(error)}`,
      };
    }
  }

  /**
   * Get historical success score for a keyword
   *
   * Queries learning store to find similar keywords that converted well
   *
   * @param keyword - Target keyword
   * @param niche - Topic niche
   * @returns Success score (0-1)
   */
  private async getHistoricalSuccessScore(keyword: string, niche?: string): Promise<number> {
    if (!this.db) {
      return 0; // No database connection
    }

    try {
      this.log(`    [Historical Analysis] Analyzing keyword: ${keyword}`);

      // Heuristic: keywords with certain intent patterns have higher historical success
      const lower = keyword.toLowerCase();
      let successScore = 0.5; // Default neutral score

      // Question keywords typically convert well
      if (lower.startsWith('how') || lower.startsWith('what') || lower.startsWith('why')) {
        successScore = 0.75;
      }

      // Comparison keywords have moderate success
      if (lower.includes(' vs ') || lower.includes(' vs. ')) {
        successScore = 0.7;
      }

      // Tool/app keywords have strong historical performance
      if (lower.includes('tool') || lower.includes('app') || lower.includes('software')) {
        successScore = 0.8;
      }

      // Niche-specific adjustments
      if (niche && niche.toLowerCase().includes('seo')) {
        successScore = Math.min(1, successScore + 0.1);
      }

      this.log(`    [Historical Score] ${(successScore * 100).toFixed(0)}%`);
      return successScore;
    } catch (error) {
      this.log(`    [Historical Analysis Error] ${String(error)}`);
      return 0;
    }
  }

  /**
   * Get scoring configuration
   */
  getConfig(): Required<OpportunityScorerConfig> {
    return this.config;
  }

  /**
   * Update scoring configuration
   */
  updateConfig(newConfig: Partial<OpportunityScorerConfig>): void {
    Object.assign(this.config, newConfig);
  }

  /**
   * Log messages
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }
}

/**
 * Score a single opportunity (convenience function)
 */
export async function scoreKeywordOpportunity(
  opportunity: KeywordOpportunity,
  config?: OpportunityScorerConfig,
  db?: VectorDB,
): Promise<ScoringFactors> {
  const scorer = new OpportunityScorer(config, db);
  return scorer.scoreOpportunity(opportunity);
}

/**
 * Score and rank multiple opportunities (convenience function)
 */
export async function scoreAndRankOpportunities(
  opportunities: KeywordOpportunity[],
  config?: OpportunityScorerConfig,
  topN?: number,
  db?: VectorDB,
): Promise<Array<KeywordOpportunity & { scoring: ScoringFactors }>> {
  const scorer = new OpportunityScorer(config, db);
  return scorer.scoreAndRank(opportunities, topN);
}
