/**
 * Conditional Step Execution Logic for SEO Pipeline
 *
 * Analyzes PreResearchResult from Step 0.5 and determines which pipeline
 * steps can be skipped based on cached data freshness and availability.
 *
 * Skip Logic:
 * - Step 1 (Keyword Research): Skip if cached AND fresh (>= 0.3)
 * - Step 2.5 (Competitor Analysis): Skip if >= 3 domains cached AND fresh
 * - Step 3.5 (SERP Analysis): Skip if cached AND fresh
 * - Step 4 (Research): Never fully skip, but supplement from cache
 *
 * @module seo/lib/conditional-step-executor
 */

import type {
  PreResearchResult,
  KeywordResearchEntry,
  CompetitorIntelligenceEntry,
  SERPPatternEntry,
} from './ruvector/schemas';

// =============================================
// Step Execution Plan Interfaces
// =============================================

/**
 * Step execution decision
 */
export interface StepDecision {
  /** Whether to skip this step */
  skip: boolean;

  /** Reason for skip/run decision */
  reason: string;

  /** Cached data if available (depends on step type) */
  cachedData?: unknown;
}

/**
 * Step 1 (Keyword Research) decision
 */
export interface Step1Decision extends StepDecision {
  cachedData?: KeywordResearchEntry;
}

/**
 * Step 2.5 (Competitor Analysis) decision
 */
export interface Step2_5Decision extends StepDecision {
  cachedData?: CompetitorIntelligenceEntry[];
}

/**
 * Step 3.5 (SERP Analysis) decision
 */
export interface Step3_5Decision extends StepDecision {
  cachedData?: SERPPatternEntry;
}

/**
 * Step 4 (Research) decision
 */
export interface Step4Decision {
  /** Never fully skip research */
  skip: false;

  /** Reason explaining supplemental approach */
  reason: string;

  /** Whether to supplement from cache */
  supplementFromCache: boolean;
}

/**
 * Complete execution plan for all pipeline steps
 */
export interface StepExecutionPlan {
  /** Step 1: Keyword Research */
  step1_keyword_research: Step1Decision;

  /** Step 2.5: Competitor Analysis */
  step2_5_competitor_analysis: Step2_5Decision;

  /** Step 3.5: SERP Analysis */
  step3_5_serp_analysis: Step3_5Decision;

  /** Step 4: Research (never fully skipped) */
  step4_research: Step4Decision;

  /** Overall summary */
  summary: {
    /** Total steps that can be skipped */
    stepsSkipped: number;

    /** Total steps to execute */
    stepsToExecute: number;

    /** Estimated cost savings */
    estimatedSavings: string;

    /** Estimated time savings */
    estimatedTimeSavings: string;
  };
}

// =============================================
// Conditional Step Executor
// =============================================

/**
 * Configuration for step execution decisions
 */
export interface StepExecutorConfig {
  /** Freshness threshold for cached data (default 0.3) */
  freshnessThreshold?: number;

  /** Minimum competitor domains required for skip (default 3) */
  minCompetitorDomainsForSkip?: number;

  /** Whether to be aggressive with skipping (default false) */
  aggressiveSkipping?: boolean;
}

/**
 * Conditional Step Executor
 *
 * Analyzes pre-research results and creates an execution plan
 * that determines which steps can be safely skipped.
 */
export class ConditionalStepExecutor {
  private config: Required<StepExecutorConfig>;

  constructor(config: StepExecutorConfig = {}) {
    this.config = {
      freshnessThreshold: config.freshnessThreshold ?? 0.3,
      minCompetitorDomainsForSkip: config.minCompetitorDomainsForSkip ?? 3,
      aggressiveSkipping: config.aggressiveSkipping ?? false,
    };
  }

  /**
   * Create execution plan from pre-research result
   *
   * Analyzes cached data and determines skip/run decisions for each step.
   */
  createExecutionPlan(preResearchResult: PreResearchResult): StepExecutionPlan {
    const step1 = this.decideStep1(preResearchResult);
    const step2_5 = this.decideStep2_5(preResearchResult);
    const step3_5 = this.decideStep3_5(preResearchResult);
    const step4 = this.decideStep4(preResearchResult);

    const stepsSkipped = [step1.skip, step2_5.skip, step3_5.skip].filter(Boolean).length;
    const stepsToExecute = 3 - stepsSkipped + 1; // +1 for step 4 (always executed)

    return {
      step1_keyword_research: step1,
      step2_5_competitor_analysis: step2_5,
      step3_5_serp_analysis: step3_5,
      step4_research: step4,
      summary: {
        stepsSkipped,
        stepsToExecute,
        estimatedSavings: this.calculateSavings(stepsSkipped),
        estimatedTimeSavings: this.calculateTimeSavings(stepsSkipped),
      },
    };
  }

  /**
   * Decide whether to skip Step 1 (Keyword Research)
   *
   * Skip if:
   * - Keyword research exists in cache
   * - Freshness score >= threshold
   */
  private decideStep1(preResearchResult: PreResearchResult): Step1Decision {
    const { keywordResearch, skipKeywordResearch } = preResearchResult;

    if (!skipKeywordResearch) {
      return {
        skip: false,
        reason: 'No cached keyword research available or data is stale',
      };
    }

    if (!keywordResearch) {
      return {
        skip: false,
        reason: 'Skip flag set but no cached data found',
      };
    }

    const freshness = keywordResearch.metadata.freshnessScore;
    if (freshness < this.config.freshnessThreshold) {
      return {
        skip: false,
        reason: `Cached data exists but freshness (${freshness.toFixed(2)}) below threshold (${this.config.freshnessThreshold})`,
        cachedData: keywordResearch,
      };
    }

    return {
      skip: true,
      reason: `Fresh cached data available (freshness: ${freshness.toFixed(2)})`,
      cachedData: keywordResearch,
    };
  }

  /**
   * Decide whether to skip Step 2.5 (Competitor Analysis)
   *
   * Skip if:
   * - >= 3 competitor domains have cached intelligence
   * - All cached data is fresh (>= threshold)
   */
  private decideStep2_5(preResearchResult: PreResearchResult): Step2_5Decision {
    const { competitorIntelligence, skipCompetitorAnalysis } = preResearchResult;

    if (!skipCompetitorAnalysis) {
      return {
        skip: false,
        reason: 'Insufficient cached competitor intelligence or data is stale',
      };
    }

    if (competitorIntelligence.length < this.config.minCompetitorDomainsForSkip) {
      return {
        skip: false,
        reason: `Only ${competitorIntelligence.length} cached domains, need >= ${this.config.minCompetitorDomainsForSkip}`,
        cachedData: competitorIntelligence,
      };
    }

    // Check freshness of all cached intelligence
    const staleDomains = competitorIntelligence.filter(
      (intel) => intel.metadata.freshnessScore < this.config.freshnessThreshold
    );

    if (staleDomains.length > 0 && !this.config.aggressiveSkipping) {
      return {
        skip: false,
        reason: `${staleDomains.length} domains have stale data (freshness < ${this.config.freshnessThreshold})`,
        cachedData: competitorIntelligence,
      };
    }

    const avgFreshness =
      competitorIntelligence.reduce((sum, intel) => sum + intel.metadata.freshnessScore, 0) /
      competitorIntelligence.length;

    return {
      skip: true,
      reason: `${competitorIntelligence.length} fresh domains cached (avg freshness: ${avgFreshness.toFixed(2)})`,
      cachedData: competitorIntelligence,
    };
  }

  /**
   * Decide whether to skip Step 3.5 (SERP Analysis)
   *
   * Skip if:
   * - SERP patterns exist in cache
   * - Freshness score >= threshold
   */
  private decideStep3_5(preResearchResult: PreResearchResult): Step3_5Decision {
    const { serpPatterns, skipSERPAnalysis } = preResearchResult;

    if (!skipSERPAnalysis) {
      return {
        skip: false,
        reason: 'No cached SERP patterns available or data is stale',
      };
    }

    if (!serpPatterns) {
      return {
        skip: false,
        reason: 'Skip flag set but no cached data found',
      };
    }

    const freshness = serpPatterns.metadata.freshnessScore;
    if (freshness < this.config.freshnessThreshold) {
      return {
        skip: false,
        reason: `Cached data exists but freshness (${freshness.toFixed(2)}) below threshold (${this.config.freshnessThreshold})`,
        cachedData: serpPatterns,
      };
    }

    return {
      skip: true,
      reason: `Fresh cached SERP data available (freshness: ${freshness.toFixed(2)})`,
      cachedData: serpPatterns,
    };
  }

  /**
   * Decide Step 4 (Research) approach
   *
   * Step 4 is NEVER fully skipped, but can supplement from cache.
   */
  private decideStep4(preResearchResult: PreResearchResult): Step4Decision {
    const { expertSources, statistics, contentPatterns } = preResearchResult;

    const hasCachedData =
      expertSources.length > 0 || statistics.length > 0 || contentPatterns.length > 0;

    if (!hasCachedData) {
      return {
        skip: false,
        reason: 'No cached research data available, executing full research',
        supplementFromCache: false,
      };
    }

    const cacheBreakdown = [
      expertSources.length > 0 ? `${expertSources.length} experts` : null,
      statistics.length > 0 ? `${statistics.length} statistics` : null,
      contentPatterns.length > 0 ? `${contentPatterns.length} patterns` : null,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      skip: false,
      reason: `Executing research with cache supplementation (${cacheBreakdown})`,
      supplementFromCache: true,
    };
  }

  /**
   * Calculate estimated cost savings
   */
  private calculateSavings(stepsSkipped: number): string {
    // Base costs per step (rough estimates)
    const stepCosts: Record<string, number> = {
      step1: 5, // $5 for keyword research API calls
      step2_5: 10, // $10 for competitor crawling
      step3_5: 3, // $3 for SERP API
    };

    const stepNames = ['step1', 'step2_5', 'step3_5'];
    let totalSaved = 0;

    if (stepsSkipped >= 1) totalSaved += stepCosts.step1;
    if (stepsSkipped >= 2) totalSaved += stepCosts.step2_5;
    if (stepsSkipped >= 3) totalSaved += stepCosts.step3_5;

    if (totalSaved === 0) {
      return '$0 (no steps skipped)';
    }

    const percentSaved = Math.round((stepsSkipped / 3) * 100);
    return `~$${totalSaved} (${percentSaved}% of research costs)`;
  }

  /**
   * Calculate estimated time savings
   */
  private calculateTimeSavings(stepsSkipped: number): string {
    // Base time per step (rough estimates in minutes)
    const stepTimes: Record<string, number> = {
      step1: 10, // 10 minutes for keyword research
      step2_5: 20, // 20 minutes for competitor analysis
      step3_5: 5, // 5 minutes for SERP analysis
    };

    let totalSaved = 0;

    if (stepsSkipped >= 1) totalSaved += stepTimes.step1;
    if (stepsSkipped >= 2) totalSaved += stepTimes.step2_5;
    if (stepsSkipped >= 3) totalSaved += stepTimes.step3_5;

    if (totalSaved === 0) {
      return '0 minutes (no steps skipped)';
    }

    const percentSaved = Math.round((stepsSkipped / 3) * 100);
    return `~${totalSaved} minutes (${percentSaved}% of research time)`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StepExecutorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<StepExecutorConfig> {
    return { ...this.config };
  }
}

// =============================================
// Utility Functions
// =============================================

/**
 * Create a default step executor with standard settings
 */
export function createStandardStepExecutor(): ConditionalStepExecutor {
  return new ConditionalStepExecutor({
    freshnessThreshold: 0.3,
    minCompetitorDomainsForSkip: 3,
    aggressiveSkipping: false,
  });
}

/**
 * Create an aggressive step executor that skips more readily
 */
export function createAggressiveStepExecutor(): ConditionalStepExecutor {
  return new ConditionalStepExecutor({
    freshnessThreshold: 0.2, // Lower threshold
    minCompetitorDomainsForSkip: 2, // Fewer domains required
    aggressiveSkipping: true,
  });
}

/**
 * Create a conservative step executor that skips less readily
 */
export function createConservativeStepExecutor(): ConditionalStepExecutor {
  return new ConditionalStepExecutor({
    freshnessThreshold: 0.5, // Higher threshold
    minCompetitorDomainsForSkip: 5, // More domains required
    aggressiveSkipping: false,
  });
}

/**
 * Validate execution plan
 *
 * Ensures the execution plan makes logical sense.
 */
export function validateExecutionPlan(plan: StepExecutionPlan): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Step 4 should never be skipped
  if (plan.step4_research.skip) {
    errors.push('Step 4 (Research) should never be fully skipped');
  }

  // If Step 1 is skipped, must have cached data
  if (plan.step1_keyword_research.skip && !plan.step1_keyword_research.cachedData) {
    errors.push('Step 1 marked as skipped but no cached data provided');
  }

  // If Step 2.5 is skipped, must have cached data
  if (plan.step2_5_competitor_analysis.skip && !plan.step2_5_competitor_analysis.cachedData) {
    errors.push('Step 2.5 marked as skipped but no cached data provided');
  }

  // If Step 3.5 is skipped, must have cached data
  if (plan.step3_5_serp_analysis.skip && !plan.step3_5_serp_analysis.cachedData) {
    errors.push('Step 3.5 marked as skipped but no cached data provided');
  }

  // Steps skipped count should match
  const actualSkipped = [
    plan.step1_keyword_research.skip,
    plan.step2_5_competitor_analysis.skip,
    plan.step3_5_serp_analysis.skip,
  ].filter(Boolean).length;

  if (actualSkipped !== plan.summary.stepsSkipped) {
    errors.push(
      `Summary stepsSkipped (${plan.summary.stepsSkipped}) doesn't match actual (${actualSkipped})`
    );
  }

  // Steps to execute should be 4 - stepsSkipped
  const expectedToExecute = 4 - actualSkipped;
  if (plan.summary.stepsToExecute !== expectedToExecute) {
    errors.push(
      `Summary stepsToExecute (${plan.summary.stepsToExecute}) doesn't match expected (${expectedToExecute})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format execution plan for human-readable output
 */
export function formatExecutionPlan(plan: StepExecutionPlan): string {
  const lines: string[] = [
    '=== SEO Pipeline Execution Plan ===',
    '',
    `Step 1 (Keyword Research): ${plan.step1_keyword_research.skip ? 'SKIP' : 'EXECUTE'}`,
    `  Reason: ${plan.step1_keyword_research.reason}`,
    '',
    `Step 2.5 (Competitor Analysis): ${plan.step2_5_competitor_analysis.skip ? 'SKIP' : 'EXECUTE'}`,
    `  Reason: ${plan.step2_5_competitor_analysis.reason}`,
    '',
    `Step 3.5 (SERP Analysis): ${plan.step3_5_serp_analysis.skip ? 'SKIP' : 'EXECUTE'}`,
    `  Reason: ${plan.step3_5_serp_analysis.reason}`,
    '',
    `Step 4 (Research): EXECUTE (supplemental: ${plan.step4_research.supplementFromCache})`,
    `  Reason: ${plan.step4_research.reason}`,
    '',
    '=== Summary ===',
    `Steps Skipped: ${plan.summary.stepsSkipped}/3`,
    `Steps to Execute: ${plan.summary.stepsToExecute}/4`,
    `Estimated Savings: ${plan.summary.estimatedSavings}`,
    `Estimated Time Savings: ${plan.summary.estimatedTimeSavings}`,
  ];

  return lines.join('\n');
}

// =============================================
// Exports
// =============================================

export default ConditionalStepExecutor;
