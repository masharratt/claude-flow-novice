/**
 * Step 0: Intelligence Pre-load - SEO Intelligence Integration Phase 1 Sprint 4
 *
 * @module planning/seo/lib/steps/step-0-intelligence-preload
 * @description Pre-loads intelligence before main pipeline execution
 */

import {
  PipelineContext,
  IntelligenceQuery,
  Pattern,
  PatternQuery,
  isHighConfidencePattern,
} from '../../types';
import { IntelligenceCurator } from '../intelligence-curator';
import { PatternManager } from '../pattern-manager';
import { RedisContextStore } from '../redis-context-store';
import {
  calculateAggregateRisk,
  evaluateTactic,
  AggregateRiskScore,
  TacticRiskEvaluation,
  RiskLevel,
  Logger,
} from '../algorithm-risk-scoring';

/**
 * Step 0 configuration
 */
export interface Step0Config {
  /** Intelligence curator instance */
  intelligenceCurator: IntelligenceCurator;

  /** Pattern manager instance */
  patternManager: PatternManager;

  /** Redis context store instance */
  redisContextStore: RedisContextStore;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Minimum pattern confidence to load (default: 0.60) */
  minPatternConfidence?: number;

  /** Maximum patterns to load (default: 50) */
  maxPatterns?: number;
}

/**
 * Risk warning from algorithm risk scoring
 */
export interface RiskWarning {
  /** Warning level */
  level: 'critical' | 'high' | 'medium' | 'low';

  /** Warning message */
  message: string;

  /** Recommendation */
  recommendation: string;

  /** Mitigation strategies */
  mitigation: string[];

  /** Tactic ID */
  tacticId?: string;
}

/**
 * Step 0 execution result
 */
export interface Step0Result {
  /** Number of intelligence items loaded */
  intelligenceItemsLoaded: number;

  /** Number of patterns loaded */
  patternsLoaded: number;

  /** Number of high-risk patterns */
  highRiskPatterns: number;

  /** Algorithm risk warnings */
  riskWarnings: RiskWarning[];

  /** Overall risk assessment */
  overallRiskLevel?: RiskLevel;

  /** Execution time (ms) */
  executionTime: number;
}

/**
 * Execute Step 0: Intelligence Pre-load
 *
 * Loads relevant intelligence and patterns before pipeline execution
 *
 * @param context - Pipeline execution context
 * @param config - Step 0 configuration
 * @returns Step 0 execution result
 */
export async function executeStep0(
  context: PipelineContext,
  config: Step0Config
): Promise<Step0Result> {
  const startTime = Date.now();

  if (config.verbose) {
    console.log('[Step 0] Intelligence Pre-load starting...');
    console.log(`[Step 0] Target keyword: ${context.task.targetKeyword}`);
    console.log(`[Step 0] Content type: ${context.task.contentType}`);
  }

  // Build intelligence query
  const intelligenceQuery: IntelligenceQuery = {
    targetKeyword: context.task.targetKeyword,
    competitorDomains: context.task.competitorDomains,
    includeHistorical: true,
    maxAge: 30, // Load intelligence from last 30 days
  };

  // Load intelligence from curator
  const intelligence = await config.intelligenceCurator.loadIntelligence(intelligenceQuery);
  context.intelligence = intelligence;

  if (config.verbose) {
    console.log(`[Step 0] Loaded ${intelligence.metadata.itemsLoaded} intelligence items`);
  }

  // Build pattern query
  const patternQuery: PatternQuery = {
    minConfidence: config.minPatternConfidence || 0.60,
    lifecycle: 'promoted', // Only load promoted patterns
    limit: config.maxPatterns || 50,
  };

  // Load applicable patterns from pattern manager
  const allPatterns = await config.patternManager.queryPatterns(patternQuery);

  // Filter patterns by content type and industry
  const applicablePatterns = allPatterns.filter((pattern) => {
    const contentTypeMatch =
      pattern.metadata.applicability.contentTypes.length === 0 ||
      pattern.metadata.applicability.contentTypes.includes(context.task.contentType);

    const industryMatch =
      !context.task.industry ||
      pattern.metadata.applicability.industries.length === 0 ||
      pattern.metadata.applicability.industries.includes(context.task.industry);

    return contentTypeMatch && industryMatch;
  });

  if (config.verbose) {
    console.log(
      `[Step 0] Loaded ${applicablePatterns.length} applicable patterns (filtered from ${allPatterns.length} total)`
    );
  }

  // Identify high-risk patterns (algorithm type with restrictions)
  const highRiskPatterns = applicablePatterns.filter(
    (pattern) =>
      pattern.type === 'algorithm' &&
      pattern.metadata.applicability.restrictions &&
      pattern.metadata.applicability.restrictions.length > 0
  );

  if (highRiskPatterns.length > 0 && config.verbose) {
    console.warn(`[Step 0] WARNING: ${highRiskPatterns.length} high-risk patterns loaded`);
    highRiskPatterns.forEach((pattern) => {
      console.warn(`  - ${pattern.name}: ${pattern.metadata.applicability.restrictions?.join(', ')}`);
    });
  }

  // Check for algorithm risks in planned tactics
  const riskWarnings = await checkAlgorithmRisks(context.task.plannedTactics || [], config.verbose);

  if (config.verbose && riskWarnings.length > 0) {
    console.log(`[Step 0] ${riskWarnings.length} risk warning(s) detected`);
    riskWarnings.forEach((warning) => {
      const emoji = warning.level === 'critical' ? '🚨' : warning.level === 'high' ? '⚠️' : 'ℹ️';
      console.log(`${emoji} ${warning.message}`);
    });
  }

  // Store context in Redis for downstream pipeline steps
  await config.redisContextStore.storeContext({
    taskId: context.task.taskId,
    targetKeyword: context.task.targetKeyword,
    patterns: applicablePatterns,
    competitive: intelligence.competitive,
    serpPatterns: intelligence.serpPatterns,
    learnings: intelligence.learnings,
    riskWarnings, // Add risk warnings to context
    metadata: {
      loadedAt: new Date(),
      itemsLoaded: intelligence.metadata.itemsLoaded,
      hasFreshData: intelligence.metadata.hasFreshData,
    },
  });

  const executionTime = Date.now() - startTime;

  if (config.verbose) {
    console.log(`[Step 0] Intelligence Pre-load completed in ${executionTime}ms`);
  }

  // Track execution metrics
  context.metrics['step-0-intelligence-preload'] = executionTime;

  // Determine overall risk level
  const criticalCount = riskWarnings.filter(w => w.level === 'critical').length;
  const highCount = riskWarnings.filter(w => w.level === 'high').length;
  let overallRiskLevel: RiskLevel | undefined;

  if (criticalCount > 0) {
    overallRiskLevel = 'critical';
  } else if (highCount > 0) {
    overallRiskLevel = 'high';
  } else if (riskWarnings.length > 0) {
    overallRiskLevel = 'medium';
  }

  return {
    intelligenceItemsLoaded: intelligence.metadata.itemsLoaded,
    patternsLoaded: applicablePatterns.length,
    highRiskPatterns: highRiskPatterns.length,
    riskWarnings,
    overallRiskLevel,
    executionTime,
  };
}

/**
 * Get pattern recommendations for specific pipeline step
 *
 * Filters patterns by category relevant to the step
 *
 * @param context - Pipeline execution context
 * @param stepName - Name of pipeline step
 * @param categories - Pattern categories relevant to step
 * @returns Filtered patterns
 */
export function getPatternsForStep(
  context: PipelineContext,
  stepName: string,
  categories: string[]
): Pattern[] {
  // This would retrieve patterns from Redis context
  // For now, return empty array as placeholder
  return [];
}

/**
 * Check if pattern should be applied based on restrictions
 *
 * @param pattern - Pattern to check
 * @param context - Pipeline execution context
 * @returns True if pattern should be applied
 */
export function shouldApplyPattern(pattern: Pattern, context: PipelineContext): boolean {
  // Check for restrictions
  if (
    pattern.metadata.applicability.restrictions &&
    pattern.metadata.applicability.restrictions.length > 0
  ) {
    // Check if any restriction applies to current context
    const restrictions = pattern.metadata.applicability.restrictions;

    // Example restriction checks
    if (restrictions.includes('no-ecommerce') && context.task.industry === 'ecommerce') {
      return false;
    }

    if (restrictions.includes('no-medical') && context.task.industry === 'medical') {
      return false;
    }

    // Add more restriction checks as needed
  }

  // Check confidence threshold
  if (!isHighConfidencePattern(pattern)) {
    return false; // Only apply high-confidence patterns
  }

  return true;
}

/**
 * Check algorithm risks for planned tactics
 *
 * Evaluates planned tactics against algorithm risk database and returns warnings
 *
 * @param plannedTactics - Array of tactic IDs planned for use
 * @param verbose - Enable verbose logging
 * @returns Array of risk warnings
 */
async function checkAlgorithmRisks(
  plannedTactics: string[],
  verbose?: boolean
): Promise<RiskWarning[]> {
  const warnings: RiskWarning[] = [];

  if (!plannedTactics || plannedTactics.length === 0) {
    return warnings; // No tactics to check
  }

  // Create custom logger based on verbosity
  const logger: Logger = verbose
    ? {
        info: (msg) => console.log(msg),
        warn: (msg) => console.warn(msg),
        error: (msg) => console.error(msg),
      }
    : {
        info: () => {}, // Silent
        warn: () => {}, // Silent
        error: (msg) => console.error(msg), // Always log errors
      };

  try {
    // Calculate aggregate risk for all planned tactics
    const aggregateRisk = await calculateAggregateRisk(plannedTactics, undefined, { logger });

    if (verbose) {
      console.log(`[Step 0] Aggregate risk score: ${aggregateRisk.overallRiskScore.toFixed(2)} (${aggregateRisk.overallRiskLevel})`);
    }

    // Generate warnings for critical and high-risk tactics
    for (const tactic of aggregateRisk.tacticEvaluations) {
      if (tactic.riskLevel === 'critical') {
        warnings.push({
          level: 'critical',
          message: `🚨 CRITICAL RISK: ${tactic.tacticName}`,
          recommendation: 'Avoid this tactic - recent algorithm updates target it heavily',
          mitigation: tactic.mitigation,
          tacticId: tactic.tacticId,
        });
      } else if (tactic.riskLevel === 'high') {
        warnings.push({
          level: 'high',
          message: `⚠️  HIGH RISK: ${tactic.tacticName}`,
          recommendation: 'Use with extreme caution and implement all mitigation strategies',
          mitigation: tactic.mitigation,
          tacticId: tactic.tacticId,
        });
      } else if (tactic.riskLevel === 'medium') {
        warnings.push({
          level: 'medium',
          message: `ℹ️  MEDIUM RISK: ${tactic.tacticName}`,
          recommendation: 'Monitor carefully and follow best practices',
          mitigation: tactic.mitigation,
          tacticId: tactic.tacticId,
        });
      }
    }

    return warnings;
  } catch (error) {
    // Log error but don't fail pipeline execution
    if (verbose) {
      console.error('[Step 0] Failed to check algorithm risks:', error);
    }
    return warnings; // Return empty warnings on error
  }
}
