/**
 * Step 12: Learning Capture - SEO Intelligence Integration Phase 1 Sprint 4
 *
 * @module planning/seo/lib/steps/step-12-learning-capture
 * @description Captures learning after content generation and updates pattern confidence
 */

import {
  PipelineContext,
  LearningCapture,
  PatternApplication,
  PatternEvidence,
  Pattern,
} from '../../types';
import { IntelligenceCurator } from '../intelligence-curator';
import { PatternManager } from '../pattern-manager';
import { RedisContextStore } from '../redis-context-store';

/**
 * Step 12 configuration
 */
export interface Step12Config {
  /** Intelligence curator instance */
  intelligenceCurator: IntelligenceCurator;

  /** Pattern manager instance */
  patternManager: PatternManager;

  /** Redis context store instance */
  redisContextStore: RedisContextStore;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Confidence delta for successful applications (default: 0.05) */
  successConfidenceDelta?: number;

  /** Confidence delta for failed applications (default: -0.10) */
  failureConfidenceDelta?: number;

  /** Archive threshold (default: 0.40) */
  archiveThreshold?: number;

  /** Promotion threshold (default: 0.80) */
  promotionThreshold?: number;
}

/**
 * Step 12 execution result
 */
export interface Step12Result {
  /** Number of learnings captured */
  learningsCaptured: number;

  /** Number of patterns updated */
  patternsUpdated: number;

  /** Number of patterns promoted */
  patternsPromoted: number;

  /** Number of patterns archived */
  patternsArchived: number;

  /** Execution time (ms) */
  executionTime: number;
}

/**
 * Execute Step 12: Learning Capture
 *
 * Captures learning from pipeline execution and updates pattern confidence
 *
 * @param context - Pipeline execution context
 * @param config - Step 12 configuration
 * @param outcome - Overall pipeline outcome
 * @returns Step 12 execution result
 */
export async function executeStep12(
  context: PipelineContext,
  config: Step12Config,
  outcome: 'success' | 'failure'
): Promise<Step12Result> {
  const startTime = Date.now();

  if (config.verbose) {
    console.log('[Step 12] Learning Capture starting...');
    console.log(`[Step 12] Pipeline outcome: ${outcome}`);
    console.log(`[Step 12] Pattern applications: ${context.patternApplications.length}`);
  }

  let learningsCaptured = 0;
  let patternsUpdated = 0;
  let patternsPromoted = 0;
  let patternsArchived = 0;

  // Capture overall learning
  const lessons: string[] = [];
  const recommendations: string[] = [];

  // Analyze pattern applications
  const applicationsByPattern = groupApplicationsByPattern(context.patternApplications);

  for (const [patternId, applications] of Object.entries(applicationsByPattern)) {
    const successCount = applications.filter((app) => app.outcome === 'success').length;
    const failureCount = applications.filter((app) => app.outcome === 'failure').length;
    const totalCount = applications.length;

    if (totalCount > 0) {
      const successRate = successCount / totalCount;

      // Create pattern evidence
      const evidence: PatternEvidence = {
        source: `task-${context.task.taskId}`,
        outcome: outcome,
        metrics: calculateAggregateMetrics(applications),
        capturedAt: new Date(),
        notes: `Applied ${totalCount} times: ${successCount} successes, ${failureCount} failures`,
        domain: context.task.competitorDomains?.[0],
        contentType: context.task.contentType,
      };

      // Update pattern confidence
      const confidenceDelta =
        outcome === 'success'
          ? (config.successConfidenceDelta || 0.05) * successRate
          : (config.failureConfidenceDelta || -0.1);

      try {
        const updateResult = config.patternManager.updateConfidence(
          patternId,
          evidence
        );

        patternsUpdated++;

        if (config.verbose) {
          console.log(
            `[Step 12] Updated pattern ${patternId}: confidence ${updateResult.previousConfidence.toFixed(2)} -> ${updateResult.newConfidence.toFixed(2)}`
          );
        }

        // Check for promotion
        if (
          updateResult.newConfidence >= (config.promotionThreshold || 0.8) &&
          updateResult.lifecycleChanged
        ) {
          patternsPromoted++;
          lessons.push(
            `Pattern "${patternId}" promoted to production (confidence: ${updateResult.newConfidence.toFixed(2)})`
          );
        }

        // Check for archival
        if (updateResult.newConfidence < (config.archiveThreshold || 0.4)) {
          const archived = config.patternManager.archivePattern(
            patternId,
            `Low confidence after task ${context.task.taskId}: ${updateResult.newConfidence.toFixed(2)}`
          );
          if (archived) {
            patternsArchived++;
            lessons.push(
              `Pattern "${patternId}" archived due to low confidence (${updateResult.newConfidence.toFixed(2)})`
            );
          }
        }
      } catch (error) {
        if (config.verbose) {
          console.error(`[Step 12] Error updating pattern ${patternId}:`, error);
        }
      }
    }
  }

  // Generate recommendations based on outcomes
  if (outcome === 'success') {
    const topPatterns = findTopPerformingPatterns(context.patternApplications);
    topPatterns.forEach((patternId) => {
      recommendations.push(`Continue using pattern "${patternId}" - high success rate`);
    });
  } else {
    const poorPatterns = findPoorPerformingPatterns(context.patternApplications);
    poorPatterns.forEach((patternId) => {
      recommendations.push(`Avoid pattern "${patternId}" - low success rate`);
    });
  }

  // Capture learning via Intelligence Curator
  const learning: LearningCapture = {
    outcome,
    topic: context.task.targetKeyword,
    context: {
      targetKeyword: context.task.targetKeyword,
      approach: context.task.contentType,
      metrics: context.metrics,
    },
    lessons,
    recommendations,
    capturedAt: new Date(),
  };

  await config.intelligenceCurator.captureLearning(learning);
  learningsCaptured++;

  if (config.verbose) {
    console.log('[Step 12] Learning captured:');
    console.log(`  - Lessons: ${lessons.length}`);
    console.log(`  - Recommendations: ${recommendations.length}`);
  }

  // Clean up Redis context
  await config.redisContextStore.deleteContext(context.task.taskId);

  const executionTime = Date.now() - startTime;

  if (config.verbose) {
    console.log(`[Step 12] Learning Capture completed in ${executionTime}ms`);
    console.log(`[Step 12] Summary:`);
    console.log(`  - Learnings captured: ${learningsCaptured}`);
    console.log(`  - Patterns updated: ${patternsUpdated}`);
    console.log(`  - Patterns promoted: ${patternsPromoted}`);
    console.log(`  - Patterns archived: ${patternsArchived}`);
  }

  // Track execution metrics
  context.metrics['step-12-learning-capture'] = executionTime;

  return {
    learningsCaptured,
    patternsUpdated,
    patternsPromoted,
    patternsArchived,
    executionTime,
  };
}

/**
 * Group pattern applications by pattern ID
 */
function groupApplicationsByPattern(
  applications: PatternApplication[]
): Record<string, PatternApplication[]> {
  const grouped: Record<string, PatternApplication[]> = {};

  for (const app of applications) {
    if (!grouped[app.patternId]) {
      grouped[app.patternId] = [];
    }
    grouped[app.patternId].push(app);
  }

  return grouped;
}

/**
 * Calculate aggregate metrics from pattern applications
 */
function calculateAggregateMetrics(
  applications: PatternApplication[]
): Record<string, number> {
  const metrics: Record<string, number> = {};
  const metricSums: Record<string, number> = {};
  const metricCounts: Record<string, number> = {};

  for (const app of applications) {
    if (app.metrics) {
      for (const [key, value] of Object.entries(app.metrics)) {
        metricSums[key] = (metricSums[key] || 0) + value;
        metricCounts[key] = (metricCounts[key] || 0) + 1;
      }
    }
  }

  // Calculate averages
  for (const key of Object.keys(metricSums)) {
    metrics[key] = metricSums[key] / metricCounts[key];
  }

  return metrics;
}

/**
 * Find top performing patterns (highest success rate)
 */
function findTopPerformingPatterns(applications: PatternApplication[]): string[] {
  const grouped = groupApplicationsByPattern(applications);
  const patternScores: Array<{ patternId: string; successRate: number }> = [];

  for (const [patternId, apps] of Object.entries(grouped)) {
    const successCount = apps.filter((app) => app.outcome === 'success').length;
    const totalCount = apps.length;
    const successRate = totalCount > 0 ? successCount / totalCount : 0;

    patternScores.push({ patternId, successRate });
  }

  // Sort by success rate descending
  patternScores.sort((a, b) => b.successRate - a.successRate);

  // Return top 3
  return patternScores.slice(0, 3).map((score) => score.patternId);
}

/**
 * Find poor performing patterns (lowest success rate)
 */
function findPoorPerformingPatterns(applications: PatternApplication[]): string[] {
  const grouped = groupApplicationsByPattern(applications);
  const patternScores: Array<{ patternId: string; successRate: number }> = [];

  for (const [patternId, apps] of Object.entries(grouped)) {
    const successCount = apps.filter((app) => app.outcome === 'success').length;
    const totalCount = apps.length;
    const successRate = totalCount > 0 ? successCount / totalCount : 0;

    patternScores.push({ patternId, successRate });
  }

  // Sort by success rate ascending
  patternScores.sort((a, b) => a.successRate - b.successRate);

  // Return bottom 3 with success rate < 0.5
  return patternScores
    .filter((score) => score.successRate < 0.5)
    .slice(0, 3)
    .map((score) => score.patternId);
}
