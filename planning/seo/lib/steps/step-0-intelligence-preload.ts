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
 * Step 0 execution result
 */
export interface Step0Result {
  /** Number of intelligence items loaded */
  intelligenceItemsLoaded: number;

  /** Number of patterns loaded */
  patternsLoaded: number;

  /** Number of high-risk patterns */
  highRiskPatterns: number;

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

  // Store context in Redis for downstream pipeline steps
  await config.redisContextStore.storeContext({
    taskId: context.task.taskId,
    targetKeyword: context.task.targetKeyword,
    patterns: applicablePatterns,
    competitive: intelligence.competitive,
    serpPatterns: intelligence.serpPatterns,
    learnings: intelligence.learnings,
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

  return {
    intelligenceItemsLoaded: intelligence.metadata.itemsLoaded,
    patternsLoaded: applicablePatterns.length,
    highRiskPatterns: highRiskPatterns.length,
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
