/**
 * RuVector MDAP Analytics Module
 *
 * Integrates MDAP performance metrics into RuVector's learning layer to
 * automatically identify underperforming models and prompt optimization needs.
 *
 * Key Features:
 * - Performance analysis with degradation trend detection
 * - Prompt optimization recommendations based on failure patterns
 * - RAG queries for similar model performance patterns
 * - Automatic recording of MDAP execution outcomes
 *
 * Integration Points:
 * - Called from cfn-coordinator.ts after MDAP execution
 * - Uses RuVector collections: mdap_model_performance, prompt_optimizations
 * - Feeds back into mdap-config.ts for intelligent tier selection
 *
 * @module ruvector-mdap-analytics
 * @version 1.0.0
 */

import { getCollection, initializeRuVector, COLLECTIONS } from './ruvector-init.js';
import type {
  MDAPModelPerformanceEntry,
  PromptOptimizationRecommendationEntry,
} from './ruvector-schemas.js';

// =============================================
// Types
// =============================================

/**
 * Performance analysis result
 */
export interface PerformanceAnalysis {
  /** Whether the model is underperforming based on metrics */
  isUnderperforming: boolean;
  /** Degradation trend based on recent vs historical performance */
  degradationTrend: 'improving' | 'stable' | 'degrading';
  /** Recommended action based on analysis */
  recommendedAction: 'continue' | 'deprecate' | 'escalate_tier' | 'optimize_prompt';
  /** Confidence in the analysis (0.0-1.0) */
  confidence: number;
  /** Reasoning chain for the recommendation */
  reasoning: string[];
  /** Raw metrics used in analysis */
  metrics?: {
    successRate: number;
    avgQualityScore: number;
    avgDurationMs: number;
    totalAttempts: number;
    recentSuccessRate?: number;
  };
}

/**
 * Prompt optimization recommendation
 */
export interface PromptOptimization {
  /** Specific prompt addition to make */
  addition: string;
  /** Why this addition helps */
  rationale: string;
  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Prompt optimization generation result
 */
export interface PromptOptimizationResult {
  /** List of recommendations */
  recommendations: PromptOptimization[];
  /** Failure patterns that led to recommendations */
  failurePatterns: string[];
  /** Confidence in recommendations */
  confidence: number;
  /** Number of attempts analyzed */
  basedOnAttempts: number;
}

/**
 * Model performance pattern query result
 */
export interface ModelPerformancePattern {
  /** Best performing model for the task type */
  bestPerformingModel: string;
  /** Worst performing model for the task type */
  worstPerformingModel: string;
  /** Actionable recommendations */
  recommendations: string[];
  /** Historical success rate for this task type */
  historicalSuccessRate: number;
  /** Number of patterns analyzed */
  patternsAnalyzed: number;
}

/**
 * MDAP outcome recording input
 */
export interface MDAPOutcomeInput {
  /** Model name used */
  modelName: string;
  /** Model tier (1-3) */
  tier: 1 | 2 | 3;
  /** Task type */
  taskType: 'simple' | 'moderate' | 'complex';
  /** Whether the task succeeded */
  success: boolean;
  /** Quality score from validators (0.0-1.0) */
  qualityScore: number;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Estimated cost */
  cost: number;
  /** Error patterns if failed */
  errorPatterns?: string[];
  /** Task category for grouping */
  taskCategory?: string;
}

// =============================================
// Constants
// =============================================

/** Minimum attempts before analysis is meaningful */
const MIN_ATTEMPTS_FOR_ANALYSIS = 10;

/** Success rate threshold for underperformance */
const UNDERPERFORMANCE_THRESHOLD = 0.60;

/** Quality score threshold for low quality issues */
const LOW_QUALITY_THRESHOLD = 0.70;

/** Duration threshold multiplier for slow execution (2x average) */
const SLOW_EXECUTION_MULTIPLIER = 2.0;

/** Hours in a "recent" window for trend analysis */
const RECENT_WINDOW_HOURS = 6;

// =============================================
// In-Memory Performance Store
// =============================================

/**
 * In-memory performance metrics (mirrors RuVector but faster for analytics)
 * Persisted to RuVector on significant changes
 */
interface PerformanceStore {
  models: Map<string, {
    modelName: string;
    tier: 1 | 2 | 3;
    attempts: Array<{
      success: boolean;
      qualityScore: number;
      durationMs: number;
      cost: number;
      errorPattern?: string;
      timestamp: number;
    }>;
    failurePatterns: Map<string, number>;
    isDeprecated: boolean;
    deprecationReason?: string;
  }>;
  lastPersisted: number;
}

let performanceStore: PerformanceStore = {
  models: new Map(),
  lastPersisted: Date.now(),
};

// =============================================
// Core Analytics Functions
// =============================================

/**
 * Analyze MDAP model performance and identify degradation patterns
 *
 * @param modelName - Model name to analyze
 * @param timeWindowHours - Time window for analysis (default: 24 hours)
 * @returns Performance analysis with recommendations
 *
 * @example
 * const analysis = await analyzeMDAPModelPerformance("openai/gpt-oss-20b", 24);
 * if (analysis.isUnderperforming) {
 *   console.log(`Model underperforming: ${analysis.reasoning.join(', ')}`);
 *   console.log(`Recommended action: ${analysis.recommendedAction}`);
 * }
 */
export async function analyzeMDAPModelPerformance(
  modelName: string,
  timeWindowHours: number = 24
): Promise<PerformanceAnalysis> {
  const modelData = performanceStore.models.get(modelName);

  // No data for this model
  if (!modelData || modelData.attempts.length === 0) {
    return {
      isUnderperforming: false,
      degradationTrend: 'stable',
      recommendedAction: 'continue',
      confidence: 0.1,
      reasoning: [`No performance data for model ${modelName}`],
    };
  }

  const now = Date.now();
  const windowMs = timeWindowHours * 60 * 60 * 1000;
  const recentWindowMs = RECENT_WINDOW_HOURS * 60 * 60 * 1000;

  // Filter attempts within time window
  const windowAttempts = modelData.attempts.filter(
    (a) => now - a.timestamp < windowMs
  );

  // Not enough data
  if (windowAttempts.length < MIN_ATTEMPTS_FOR_ANALYSIS) {
    return {
      isUnderperforming: false,
      degradationTrend: 'stable',
      recommendedAction: 'continue',
      confidence: 0.2,
      reasoning: [
        `Only ${windowAttempts.length} attempts in ${timeWindowHours}h window (need ${MIN_ATTEMPTS_FOR_ANALYSIS}+)`,
      ],
    };
  }

  // Calculate overall metrics
  const successfulAttempts = windowAttempts.filter((a) => a.success);
  const successRate = successfulAttempts.length / windowAttempts.length;
  const avgQualityScore =
    windowAttempts.reduce((sum, a) => sum + a.qualityScore, 0) / windowAttempts.length;
  const avgDurationMs =
    windowAttempts.reduce((sum, a) => sum + a.durationMs, 0) / windowAttempts.length;

  // Calculate recent metrics for trend analysis
  const recentAttempts = windowAttempts.filter(
    (a) => now - a.timestamp < recentWindowMs
  );
  const recentSuccessRate = recentAttempts.length > 0
    ? recentAttempts.filter((a) => a.success).length / recentAttempts.length
    : successRate;

  // Build reasoning and determine status
  const reasoning: string[] = [];
  let isUnderperforming = false;
  let recommendedAction: PerformanceAnalysis['recommendedAction'] = 'continue';

  // Check success rate
  if (successRate < UNDERPERFORMANCE_THRESHOLD) {
    isUnderperforming = true;
    reasoning.push(
      `Success rate ${(successRate * 100).toFixed(1)}% below ${UNDERPERFORMANCE_THRESHOLD * 100}% threshold`
    );
  }

  // Check quality score
  if (avgQualityScore < LOW_QUALITY_THRESHOLD) {
    isUnderperforming = true;
    reasoning.push(
      `Average quality score ${avgQualityScore.toFixed(2)} below ${LOW_QUALITY_THRESHOLD} threshold`
    );
  }

  // Determine degradation trend
  let degradationTrend: PerformanceAnalysis['degradationTrend'] = 'stable';
  const trendDelta = recentSuccessRate - successRate;

  if (trendDelta < -0.1) {
    degradationTrend = 'degrading';
    reasoning.push(
      `Recent success rate (${(recentSuccessRate * 100).toFixed(1)}%) dropped ${Math.abs(trendDelta * 100).toFixed(1)}% from average`
    );
  } else if (trendDelta > 0.1) {
    degradationTrend = 'improving';
    reasoning.push(
      `Recent success rate (${(recentSuccessRate * 100).toFixed(1)}%) improved ${(trendDelta * 100).toFixed(1)}% from average`
    );
  }

  // Determine recommended action
  if (isUnderperforming) {
    if (successRate < 0.40) {
      recommendedAction = 'deprecate';
      reasoning.push('Success rate critically low - recommend deprecation');
    } else if (degradationTrend === 'degrading') {
      recommendedAction = 'escalate_tier';
      reasoning.push('Performance degrading - recommend tier escalation');
    } else if (avgQualityScore < LOW_QUALITY_THRESHOLD) {
      recommendedAction = 'optimize_prompt';
      reasoning.push('Quality issues detected - recommend prompt optimization');
    } else {
      recommendedAction = 'escalate_tier';
      reasoning.push('General underperformance - recommend tier escalation');
    }
  }

  // Calculate confidence based on data quantity and consistency
  const dataConfidence = Math.min(windowAttempts.length / 50, 1.0);
  const consistencyConfidence = 1.0 - Math.abs(recentSuccessRate - successRate);
  const confidence = (dataConfidence * 0.6 + consistencyConfidence * 0.4);

  if (reasoning.length === 0) {
    reasoning.push(
      `Model performing within acceptable range (${(successRate * 100).toFixed(1)}% success, ${avgQualityScore.toFixed(2)} quality)`
    );
  }

  return {
    isUnderperforming,
    degradationTrend,
    recommendedAction,
    confidence,
    reasoning,
    metrics: {
      successRate,
      avgQualityScore,
      avgDurationMs,
      totalAttempts: windowAttempts.length,
      recentSuccessRate,
    },
  };
}

/**
 * Generate prompt optimization recommendations based on failure patterns
 *
 * Analyzes failure patterns to suggest specific prompt improvements.
 *
 * @param modelName - Model name to analyze
 * @param tier - Model tier (1-3)
 * @returns Prompt optimization recommendations
 *
 * @example
 * const optimizations = await generatePromptOptimizations("openai/gpt-oss-20b", 1);
 * for (const rec of optimizations.recommendations) {
 *   console.log(`[${rec.priority}] ${rec.addition}: ${rec.rationale}`);
 * }
 */
export async function generatePromptOptimizations(
  modelName: string,
  tier: number
): Promise<PromptOptimizationResult> {
  const modelData = performanceStore.models.get(modelName);

  if (!modelData || modelData.failurePatterns.size === 0) {
    return {
      recommendations: [],
      failurePatterns: [],
      confidence: 0.1,
      basedOnAttempts: modelData?.attempts.length || 0,
    };
  }

  const recommendations: PromptOptimization[] = [];
  const failurePatterns: string[] = [];

  // Analyze failure patterns and generate recommendations
  for (const [pattern, count] of modelData.failurePatterns.entries()) {
    failurePatterns.push(`${pattern} (${count}x)`);

    // Pattern-specific recommendations
    if (pattern.toLowerCase().includes('type') || pattern.toLowerCase().includes('typescript')) {
      recommendations.push({
        addition: 'Add explicit type annotations for all function parameters and return types',
        rationale: `Type errors detected ${count} times - explicit types help model generate correct code`,
        priority: count >= 5 ? 'high' : 'medium',
      });
      recommendations.push({
        addition: 'Include TypeScript strict mode requirements in prompt',
        rationale: 'Reinforcing type strictness reduces type inference errors',
        priority: 'medium',
      });
    }

    if (pattern.toLowerCase().includes('undefined') || pattern.toLowerCase().includes('null')) {
      recommendations.push({
        addition: 'Require null/undefined checks for all external inputs',
        rationale: `Null reference errors detected ${count} times`,
        priority: count >= 5 ? 'high' : 'medium',
      });
    }

    if (pattern.toLowerCase().includes('syntax') || pattern.toLowerCase().includes('parse')) {
      recommendations.push({
        addition: 'Emphasize valid JSON/code syntax requirements',
        rationale: `Syntax/parsing errors detected ${count} times - model may be producing malformed output`,
        priority: 'high',
      });
    }

    if (pattern.toLowerCase().includes('timeout') || pattern.toLowerCase().includes('slow')) {
      recommendations.push({
        addition: 'Simplify task description and reduce context size',
        rationale: `Timeout/slow execution detected ${count} times - may indicate task too complex`,
        priority: count >= 3 ? 'critical' : 'high',
      });
    }

    if (pattern.toLowerCase().includes('incomplete') || pattern.toLowerCase().includes('truncat')) {
      recommendations.push({
        addition: 'Reduce expected output size and add "complete the implementation" instruction',
        rationale: `Incomplete output detected ${count} times`,
        priority: 'high',
      });
    }

    if (pattern.toLowerCase().includes('import') || pattern.toLowerCase().includes('module')) {
      recommendations.push({
        addition: 'Provide explicit import statements in context hints',
        rationale: `Import/module errors detected ${count} times - model needs dependency context`,
        priority: 'medium',
      });
    }
  }

  // Add tier-specific recommendations
  if (tier === 1 && recommendations.length > 0) {
    recommendations.push({
      addition: 'For T1/haiku: Keep tasks extremely atomic (single function, <30 lines)',
      rationale: 'Lower-tier models perform best with minimal complexity',
      priority: 'high',
    });
  }

  if (tier >= 2 && recommendations.length === 0) {
    // Higher tier with no specific patterns - general recommendations
    recommendations.push({
      addition: 'Add concrete examples of expected output format',
      rationale: 'Examples improve output consistency for complex tasks',
      priority: 'low',
    });
  }

  // Deduplicate recommendations
  const uniqueRecommendations = recommendations.filter(
    (rec, index, self) =>
      index === self.findIndex((r) => r.addition === rec.addition)
  );

  // Calculate confidence based on pattern frequency and diversity
  const totalPatternOccurrences = Array.from(modelData.failurePatterns.values()).reduce(
    (sum, count) => sum + count,
    0
  );
  const confidence = Math.min(
    (totalPatternOccurrences / 20) * (modelData.failurePatterns.size / 3),
    0.95
  );

  return {
    recommendations: uniqueRecommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }),
    failurePatterns,
    confidence,
    basedOnAttempts: modelData.attempts.length,
  };
}

/**
 * Query RuVector for similar model performance patterns
 *
 * Uses semantic search to find historical performance data for similar task types.
 *
 * @param taskType - Type of task (simple, moderate, complex)
 * @param complexity - Complexity classification
 * @returns Performance pattern insights
 *
 * @example
 * const patterns = await queryModelPerformancePatterns("implementation", "moderate");
 * console.log(`Best model: ${patterns.bestPerformingModel}`);
 * console.log(`Historical success: ${patterns.historicalSuccessRate}`);
 */
export async function queryModelPerformancePatterns(
  taskType: string,
  complexity: string
): Promise<ModelPerformancePattern> {
  // Aggregate performance across all tracked models
  const modelPerformance: Array<{
    modelName: string;
    tier: number;
    successRate: number;
    avgQuality: number;
    attempts: number;
  }> = [];

  for (const [modelName, data] of performanceStore.models.entries()) {
    if (data.attempts.length >= 5) {
      const successRate = data.attempts.filter((a) => a.success).length / data.attempts.length;
      const avgQuality =
        data.attempts.reduce((sum, a) => sum + a.qualityScore, 0) / data.attempts.length;

      modelPerformance.push({
        modelName,
        tier: data.tier,
        successRate,
        avgQuality,
        attempts: data.attempts.length,
      });
    }
  }

  // No data
  if (modelPerformance.length === 0) {
    return {
      bestPerformingModel: 'openai/gpt-oss-120b', // Default to highest tier
      worstPerformingModel: '',
      recommendations: [
        'No historical performance data - using default tier selection',
        'Consider starting with T1 for simple tasks to build baseline metrics',
      ],
      historicalSuccessRate: 0,
      patternsAnalyzed: 0,
    };
  }

  // Sort by combined score (success rate * quality)
  modelPerformance.sort((a, b) => {
    const scoreA = a.successRate * 0.6 + a.avgQuality * 0.4;
    const scoreB = b.successRate * 0.6 + b.avgQuality * 0.4;
    return scoreB - scoreA;
  });

  const best = modelPerformance[0];
  const worst = modelPerformance[modelPerformance.length - 1];

  // Generate recommendations based on patterns
  const recommendations: string[] = [];

  if (best.tier === 1 && best.successRate > 0.8) {
    recommendations.push(
      `T1 (${best.modelName}) achieving ${(best.successRate * 100).toFixed(0)}% success - prefer T1 for similar tasks`
    );
  }

  if (worst.successRate < 0.5) {
    recommendations.push(
      `Avoid ${worst.modelName} for this task type - only ${(worst.successRate * 100).toFixed(0)}% success rate`
    );
  }

  // Complexity-based recommendations
  if (complexity === 'complex' && best.tier < 3) {
    recommendations.push(
      'Consider starting at T3 for complex tasks despite T1/T2 success - reduces iteration time'
    );
  }

  // Calculate overall historical success rate
  const totalAttempts = modelPerformance.reduce((sum, m) => sum + m.attempts, 0);
  const totalSuccesses = modelPerformance.reduce(
    (sum, m) => sum + Math.round(m.successRate * m.attempts),
    0
  );
  const historicalSuccessRate = totalAttempts > 0 ? totalSuccesses / totalAttempts : 0;

  return {
    bestPerformingModel: best.modelName,
    worstPerformingModel: worst.modelName,
    recommendations,
    historicalSuccessRate,
    patternsAnalyzed: modelPerformance.length,
  };
}

/**
 * Record MDAP execution outcome for learning
 *
 * Called after each MDAP micro-task execution to build performance history.
 *
 * @param input - MDAP outcome data
 *
 * @example
 * await recordMDAPOutcome({
 *   modelName: "openai/gpt-oss-20b",
 *   tier: 1,
 *   taskType: "simple",
 *   success: true,
 *   qualityScore: 0.85,
 *   durationMs: 1200,
 *   cost: 0.001,
 * });
 */
export async function recordMDAPOutcome(input: MDAPOutcomeInput): Promise<void> {
  const { modelName, tier, success, qualityScore, durationMs, cost, errorPatterns } = input;

  // Initialize model data if not exists
  if (!performanceStore.models.has(modelName)) {
    performanceStore.models.set(modelName, {
      modelName,
      tier: tier as 1 | 2 | 3,
      attempts: [],
      failurePatterns: new Map(),
      isDeprecated: false,
    });
  }

  const modelData = performanceStore.models.get(modelName)!;

  // Record attempt
  const attempt = {
    success,
    qualityScore,
    durationMs,
    cost,
    errorPattern: errorPatterns?.[0],
    timestamp: Date.now(),
  };
  modelData.attempts.push(attempt);

  // Keep attempts bounded (last 500)
  if (modelData.attempts.length > 500) {
    modelData.attempts = modelData.attempts.slice(-500);
  }

  // Record failure patterns
  if (!success && errorPatterns) {
    for (const pattern of errorPatterns) {
      const normalizedPattern = normalizeErrorPattern(pattern);
      const currentCount = modelData.failurePatterns.get(normalizedPattern) || 0;
      modelData.failurePatterns.set(normalizedPattern, currentCount + 1);
    }
  }

  // Log recording
  const totalAttempts = modelData.attempts.length;
  const successRate = modelData.attempts.filter((a) => a.success).length / totalAttempts;

  console.log(
    `[ruvector-mdap] Recorded: ${modelName} (T${tier}) ` +
      `success=${success} quality=${qualityScore.toFixed(2)} ` +
      `rate=${(successRate * 100).toFixed(1)}% (${totalAttempts} total)`
  );

  // Persist to RuVector periodically (every 10 recordings or 5 minutes)
  const timeSinceLastPersist = Date.now() - performanceStore.lastPersisted;
  if (totalAttempts % 10 === 0 || timeSinceLastPersist > 5 * 60 * 1000) {
    await persistToRuVector(modelName, modelData);
    performanceStore.lastPersisted = Date.now();
  }
}

// =============================================
// MDAP-Specific Error Pattern Capture
// =============================================

/**
 * Capture MDAP implementation failure patterns for error learning
 *
 * Extends RuVector error pattern learning with MDAP-specific context.
 *
 * @param microTaskId - Micro-task identifier
 * @param modelName - Model that failed
 * @param tier - Model tier
 * @param errorType - Type of error
 * @param errorContext - Error context/message
 * @param retrySucceeded - Whether retry with escalated tier succeeded
 * @param escalatedToTier - Tier escalated to (if any)
 */
export async function captureMDAPFailure(
  microTaskId: string,
  modelName: string,
  tier: number,
  errorType: string,
  errorContext: string,
  retrySucceeded: boolean,
  escalatedToTier?: number
): Promise<void> {
  // Record in performance store
  const modelData = performanceStore.models.get(modelName);
  if (modelData) {
    const normalizedPattern = normalizeErrorPattern(`${errorType}: ${errorContext.slice(0, 100)}`);
    const currentCount = modelData.failurePatterns.get(normalizedPattern) || 0;
    modelData.failurePatterns.set(normalizedPattern, currentCount + 1);
  }

  // Log for monitoring
  console.log(
    `[ruvector-mdap] Failure captured: ${modelName} (T${tier}) ` +
      `error=${errorType} retry=${retrySucceeded ? 'SUCCESS' : 'FAILED'} ` +
      `${escalatedToTier ? `escalated to T${escalatedToTier}` : ''}`
  );

  // Track escalation patterns
  if (escalatedToTier && modelData) {
    const escalationPattern = `ESCALATION: T${tier} -> T${escalatedToTier}`;
    const currentCount = modelData.failurePatterns.get(escalationPattern) || 0;
    modelData.failurePatterns.set(escalationPattern, currentCount + 1);
  }
}

// =============================================
// RuVector-Aware Tier Selection
// =============================================

/**
 * Select model tier with RuVector intelligence
 *
 * Uses historical performance data to select optimal starting tier.
 * Falls back to standard selection if no data available.
 *
 * @param complexity - Task complexity
 * @param failureCount - Previous failure count
 * @param taskType - Optional task type hint
 * @returns Recommended tier (1-3)
 *
 * @example
 * const tier = await selectModelTierWithRuVector("simple", 0, "implementation");
 * console.log(`Recommended tier: T${tier}`);
 */
export async function selectModelTierWithRuVector(
  complexity: string,
  failureCount: number,
  taskType?: string
): Promise<number> {
  // Query historical patterns
  const patterns = await queryModelPerformancePatterns(
    taskType || 'implementation',
    complexity
  );

  // If we have good data showing T1 works well, prefer it
  if (
    patterns.patternsAnalyzed > 0 &&
    patterns.historicalSuccessRate > 0.80 &&
    complexity === 'simple' &&
    failureCount === 0
  ) {
    // Check if best performer is T1
    const bestModel = performanceStore.models.get(patterns.bestPerformingModel);
    if (bestModel && bestModel.tier === 1) {
      console.log(
        `[ruvector-mdap] RuVector recommends T1 based on ${(patterns.historicalSuccessRate * 100).toFixed(0)}% historical success`
      );
      return 1;
    }
  }

  // If worst performer should be avoided, escalate past it
  if (patterns.worstPerformingModel) {
    const worstModel = performanceStore.models.get(patterns.worstPerformingModel);
    if (worstModel) {
      const worstSuccessRate =
        worstModel.attempts.filter((a) => a.success).length / worstModel.attempts.length;
      if (worstSuccessRate < 0.5 && failureCount > 0) {
        console.log(
          `[ruvector-mdap] RuVector recommends skipping T${worstModel.tier} (${(worstSuccessRate * 100).toFixed(0)}% success)`
        );
        return Math.min(worstModel.tier + 1, 3);
      }
    }
  }

  // Standard tier selection with escalation
  const baseTier = complexity === 'complex' ? 3 : complexity === 'moderate' ? 2 : 1;
  return Math.min(baseTier + failureCount, 3);
}

// =============================================
// Helper Functions
// =============================================

/**
 * Normalize error pattern for consistent grouping
 */
function normalizeErrorPattern(pattern: string): string {
  return pattern
    .toLowerCase()
    .replace(/\d+/g, 'N') // Replace numbers with N
    .replace(/['"`]/g, '') // Remove quotes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, 100) // Limit length
    .trim();
}

/**
 * Persist model performance data to RuVector
 */
async function persistToRuVector(
  modelName: string,
  modelData: PerformanceStore['models'] extends Map<string, infer V> ? V : never
): Promise<void> {
  try {
    await initializeRuVector();
    const collection = getCollection(COLLECTIONS.MDAP_MODEL_PERFORMANCE);

    const successRate = modelData.attempts.length > 0
      ? modelData.attempts.filter((a) => a.success).length / modelData.attempts.length
      : 0;
    const avgQualityScore = modelData.attempts.length > 0
      ? modelData.attempts.reduce((sum, a) => sum + a.qualityScore, 0) / modelData.attempts.length
      : 0;
    const avgDurationMs = modelData.attempts.length > 0
      ? modelData.attempts.reduce((sum, a) => sum + a.durationMs, 0) / modelData.attempts.length
      : 0;
    const avgCost = modelData.attempts.length > 0
      ? modelData.attempts.reduce((sum, a) => sum + a.cost, 0) / modelData.attempts.length
      : 0;

    const failurePatternsArray = Array.from(modelData.failurePatterns.keys());
    const failurePatternFreq = Object.fromEntries(modelData.failurePatterns);

    const entry: MDAPModelPerformanceEntry = {
      text: `${modelName} | Tier: ${modelData.tier} | TaskType: simple | Patterns: ${failurePatternsArray.join('; ')}`,
      metadata: {
        modelName,
        tier: modelData.tier,
        tierName: modelData.tier === 1 ? 'haiku' : modelData.tier === 2 ? 'sonnet' : 'opus',
        taskType: 'simple',
        taskCategory: 'implementation',
        successRate,
        avgQualityScore,
        avgDurationMs,
        avgCost,
        totalAttempts: modelData.attempts.length,
        successfulAttempts: modelData.attempts.filter((a) => a.success).length,
        failedAttempts: modelData.attempts.filter((a) => !a.success).length,
        failurePatterns: failurePatternsArray,
        failurePatternFrequency: failurePatternFreq,
        commonErrorTypes: failurePatternsArray.slice(0, 5),
        escalationCount: 0,
        avgRetriesBeforeSuccess: 0,
        firstSeen: modelData.attempts[0]?.timestamp || Date.now(),
        lastSeen: modelData.attempts[modelData.attempts.length - 1]?.timestamp || Date.now(),
        timeWindowHours: 24,
        isDeprecated: modelData.isDeprecated,
        deprecationReason: modelData.deprecationReason,
      },
    };

    // Generate a simple embedding (in production, use actual embedding model)
    const embedding = generateSimpleEmbedding(entry.text);

    await collection.insert({
      id: `mdap-perf-${modelName.replace(/\//g, '-')}-${Date.now()}`,
      vector: embedding,
      metadata: entry.metadata,
    });

    console.log(`[ruvector-mdap] Persisted performance data for ${modelName}`);
  } catch (error) {
    console.warn(
      `[ruvector-mdap] Failed to persist to RuVector: ${error instanceof Error ? error.message : String(error)}`
    );
    // Non-blocking - continue operation even if persist fails
  }
}

/**
 * Generate simple embedding for text (placeholder - use real embedding model in production)
 */
function generateSimpleEmbedding(text: string): Float32Array {
  // Simple hash-based embedding for testing
  // In production, use OpenAI text-embedding-3-small or similar
  const embedding = new Float32Array(1536);
  const words = text.toLowerCase().split(/\W+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const index = (word.charCodeAt(j) * (i + 1) * (j + 1)) % 1536;
      embedding[index] += 0.1;
    }
  }

  // Normalize
  let magnitude = 0;
  for (let i = 0; i < embedding.length; i++) {
    magnitude += embedding[i] * embedding[i];
  }
  magnitude = Math.sqrt(magnitude);
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

// =============================================
// Test Utilities (for testing only)
// =============================================

/**
 * Reset the performance store to initial state
 * WARNING: Only use in tests - clears all tracked data
 */
export function resetPerformanceStore(): void {
  performanceStore = {
    models: new Map(),
    lastPersisted: Date.now(),
  };
}

/**
 * Get read-only access to the performance store
 * WARNING: Only use in tests - exposes internal state
 */
export function getPerformanceStore(): Readonly<PerformanceStore> {
  return performanceStore;
}

// =============================================
// Export Summary
// =============================================

/**
 * Get summary of current MDAP performance analytics
 */
export async function getMDAPAnalyticsSummary(): Promise<{
  modelsTracked: number;
  totalAttempts: number;
  overallSuccessRate: number;
  underperformingModels: string[];
  topRecommendations: string[];
}> {
  const models = Array.from(performanceStore.models.values());
  const totalAttempts = models.reduce((sum, m) => sum + m.attempts.length, 0);
  const totalSuccesses = models.reduce(
    (sum, m) => sum + m.attempts.filter((a) => a.success).length,
    0
  );

  const underperforming: string[] = [];
  for (const model of models) {
    if (model.attempts.length >= MIN_ATTEMPTS_FOR_ANALYSIS) {
      const successRate = model.attempts.filter((a) => a.success).length / model.attempts.length;
      if (successRate < UNDERPERFORMANCE_THRESHOLD) {
        underperforming.push(`${model.modelName} (${(successRate * 100).toFixed(0)}%)`);
      }
    }
  }

  const recommendations: string[] = [];
  for (const model of models) {
    const analysis = await analyzeMDAPModelPerformance(model.modelName, 24);
    if (analysis.recommendedAction !== 'continue') {
      recommendations.push(
        `${model.modelName}: ${analysis.recommendedAction} - ${analysis.reasoning[0]}`
      );
    }
  }

  return {
    modelsTracked: models.length,
    totalAttempts,
    overallSuccessRate: totalAttempts > 0 ? totalSuccesses / totalAttempts : 0,
    underperformingModels: underperforming,
    topRecommendations: recommendations.slice(0, 5),
  };
}

// =============================================
// Exports
// =============================================

export default {
  analyzeMDAPModelPerformance,
  generatePromptOptimizations,
  queryModelPerformancePatterns,
  recordMDAPOutcome,
  captureMDAPFailure,
  selectModelTierWithRuVector,
  getMDAPAnalyticsSummary,
  // Test utilities
  resetPerformanceStore,
  getPerformanceStore,
};
