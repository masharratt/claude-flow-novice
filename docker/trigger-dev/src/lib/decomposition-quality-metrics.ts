/**
 * Decomposition Quality Metrics - Sequential vs Parallel Comparison
 *
 * Measures the quality improvement from sequential context refinement
 * compared to a hypothetical parallel approach.
 *
 * Key metrics:
 * 1. Micro-task count (12-16 target for sequential)
 * 2. Coverage score (all 4 perspectives integrated?)
 * 3. Constraint completeness (each task has arch+sec+perf+test info?)
 * 4. Deduplication effectiveness (% reduction vs parallel)
 *
 * @module decomposition-quality-metrics
 * @version 1.0.0
 */

import type { RefinedMicroTask, MergedDecomposition } from "./decomposition-merger.js";
import type { ExecutionPlan } from "./execution-phase-planner.js";

// =============================================
// Type Definitions
// =============================================

export interface QualityReport {
  // Task metrics
  taskCount: number;
  targetRange: { min: number; max: number };
  withinTarget: boolean;

  // Coverage metrics
  coverageScore: number; // 0.0-1.0 (all perspectives represented?)
  perspectiveCoverage: {
    architecture: number; // % of tasks with architecture constraints
    security: number; // % of tasks with security constraints
    performance: number; // % of tasks with performance constraints
    testing: number; // % of tasks with testing constraints
  };

  // Constraint completeness
  constraintCompleteness: number; // % of tasks with all 4 constraint types
  avgConstraintsPerTask: number;

  // Deduplication effectiveness
  deduplicationMetrics: {
    sequentialTaskCount: number;
    estimatedParallelTaskCount: number; // If we had done parallel
    reductionPercentage: number; // % reduction from parallel
    duplicatesAvoided: number;
  };

  // Quality score (0.0-1.0)
  overallQualityScore: number;

  // Comparison to parallel approach
  comparisonToParallel: {
    betterTaskCount: boolean; // Fewer tasks than parallel?
    betterCoverage: boolean; // Better constraint integration?
    betterCompleteness: boolean; // More complete tasks?
    overallBetter: boolean; // Sequential > Parallel?
  };
}

export interface ExecutionQualityMetrics {
  // Execution plan metrics
  phaseCount: number;
  estimatedDuration: number; // Minutes
  parallelismScore: number; // 0.0-1.0
  criticalPathLength: number; // Number of tasks

  // Dependency metrics
  avgDependenciesPerTask: number;
  maxDependenciesPerTask: number;
  tasksWithNoDependencies: number;

  // Efficiency metrics
  maxParallelTasks: number;
  avgParallelTasksPerPhase: number;
}

// =============================================
// Main Quality Analysis
// =============================================

/**
 * Analyze decomposition quality and compare to hypothetical parallel approach.
 */
export function analyzeDecompositionQuality(
  mergedDecomposition: MergedDecomposition,
  executionPlan: ExecutionPlan,
  originalDecompositionCounts: {
    architecture: number;
    security: number;
    performance: number;
    testing: number;
  }
): QualityReport {
  console.log("[quality-metrics] Analyzing decomposition quality");

  const tasks = mergedDecomposition.microTasks;

  // Task count metrics
  const taskCount = tasks.length;
  const targetRange = { min: 12, max: 16 };
  const withinTarget = taskCount >= targetRange.min && taskCount <= targetRange.max;

  console.log(`  Task count: ${taskCount} (target: ${targetRange.min}-${targetRange.max})`);

  // Coverage metrics
  const perspectiveCoverage = calculatePerspectiveCoverage(tasks);
  const coverageScore = calculateCoverageScore(perspectiveCoverage);

  console.log(`  Coverage score: ${(coverageScore * 100).toFixed(1)}%`);

  // Constraint completeness
  const constraintCompleteness = mergedDecomposition.metrics.constraintCompleteness;
  const avgConstraintsPerTask = mergedDecomposition.metrics.avgConstraintsPerTask;

  console.log(
    `  Constraint completeness: ${(constraintCompleteness * 100).toFixed(1)}%`
  );

  // Deduplication effectiveness
  const deduplicationMetrics = calculateDeduplicationMetrics(
    taskCount,
    originalDecompositionCounts
  );

  console.log(
    `  Deduplication: ${deduplicationMetrics.reductionPercentage.toFixed(1)}% reduction`
  );

  // Overall quality score
  const overallQualityScore = calculateOverallQualityScore({
    taskCount,
    targetRange,
    coverageScore,
    constraintCompleteness,
    deduplicationMetrics,
  });

  console.log(`  Overall quality score: ${(overallQualityScore * 100).toFixed(1)}%`);

  // Comparison to parallel
  const comparisonToParallel = compareToParallelApproach(
    taskCount,
    deduplicationMetrics.estimatedParallelTaskCount,
    coverageScore,
    constraintCompleteness
  );

  const report: QualityReport = {
    taskCount,
    targetRange,
    withinTarget,
    coverageScore,
    perspectiveCoverage,
    constraintCompleteness,
    avgConstraintsPerTask,
    deduplicationMetrics,
    overallQualityScore,
    comparisonToParallel,
  };

  console.log("[quality-metrics] Analysis complete");
  console.log(
    `  Sequential approach is ${comparisonToParallel.overallBetter ? "BETTER" : "NOT BETTER"} than parallel`
  );

  return report;
}

// =============================================
// Execution Quality Metrics
// =============================================

/**
 * Analyze execution plan quality metrics.
 */
export function analyzeExecutionQuality(
  executionPlan: ExecutionPlan,
  tasks: RefinedMicroTask[]
): ExecutionQualityMetrics {
  console.log("[quality-metrics] Analyzing execution plan quality");

  // Dependency metrics
  const allDependencies = tasks.flatMap((t) => t.dependencies);
  const avgDependenciesPerTask = allDependencies.length / tasks.length;
  const maxDependenciesPerTask = Math.max(...tasks.map((t) => t.dependencies.length));
  const tasksWithNoDependencies = tasks.filter((t) => t.dependencies.length === 0).length;

  // Phase metrics
  const avgParallelTasksPerPhase =
    executionPlan.phases.reduce((sum, p) => sum + p.parallelTasks.length, 0) /
    executionPlan.phases.length;

  const metrics: ExecutionQualityMetrics = {
    phaseCount: executionPlan.totalPhases,
    estimatedDuration: executionPlan.totalEstimatedDuration,
    parallelismScore: executionPlan.parallelismScore,
    criticalPathLength: executionPlan.criticalPath.length,
    avgDependenciesPerTask,
    maxDependenciesPerTask,
    tasksWithNoDependencies,
    maxParallelTasks: executionPlan.maxParallelTasks,
    avgParallelTasksPerPhase,
  };

  console.log("[quality-metrics] Execution quality analysis complete");
  console.log(`  Phases: ${metrics.phaseCount}`);
  console.log(`  Estimated duration: ${metrics.estimatedDuration} minutes`);
  console.log(`  Parallelism: ${(metrics.parallelismScore * 100).toFixed(1)}%`);

  return metrics;
}

// =============================================
// Coverage Calculation
// =============================================

function calculatePerspectiveCoverage(tasks: RefinedMicroTask[]): {
  architecture: number;
  security: number;
  performance: number;
  testing: number;
} {
  const totalTasks = tasks.length;

  const withArchitecture = tasks.filter((t) => t.constraints.architecture).length;
  const withSecurity = tasks.filter((t) => t.constraints.security).length;
  const withPerformance = tasks.filter((t) => t.constraints.performance).length;
  const withTesting = tasks.filter((t) => t.constraints.testing).length;

  return {
    architecture: withArchitecture / totalTasks,
    security: withSecurity / totalTasks,
    performance: withPerformance / totalTasks,
    testing: withTesting / totalTasks,
  };
}

function calculateCoverageScore(coverage: {
  architecture: number;
  security: number;
  performance: number;
  testing: number;
}): number {
  // Average coverage across all perspectives
  return (
    (coverage.architecture + coverage.security + coverage.performance + coverage.testing) / 4
  );
}

// =============================================
// Deduplication Metrics
// =============================================

function calculateDeduplicationMetrics(
  sequentialTaskCount: number,
  originalCounts: {
    architecture: number;
    security: number;
    performance: number;
    testing: number;
  }
): QualityReport["deduplicationMetrics"] {
  // Estimate parallel task count (sum of all decomposer outputs)
  const estimatedParallelTaskCount =
    originalCounts.architecture +
    originalCounts.security +
    originalCounts.performance +
    originalCounts.testing;

  // Deduplication effectiveness
  const duplicatesAvoided = estimatedParallelTaskCount - sequentialTaskCount;
  const reductionPercentage =
    estimatedParallelTaskCount > 0
      ? (duplicatesAvoided / estimatedParallelTaskCount) * 100
      : 0;

  return {
    sequentialTaskCount,
    estimatedParallelTaskCount,
    reductionPercentage,
    duplicatesAvoided,
  };
}

// =============================================
// Overall Quality Score
// =============================================

function calculateOverallQualityScore(params: {
  taskCount: number;
  targetRange: { min: number; max: number };
  coverageScore: number;
  constraintCompleteness: number;
  deduplicationMetrics: QualityReport["deduplicationMetrics"];
}): number {
  // Component scores (0.0-1.0)

  // Task count score (1.0 if within target, decaying outside)
  let taskCountScore = 1.0;
  if (params.taskCount < params.targetRange.min) {
    taskCountScore = params.taskCount / params.targetRange.min;
  } else if (params.taskCount > params.targetRange.max) {
    taskCountScore = params.targetRange.max / params.taskCount;
  }

  // Coverage score (already 0.0-1.0)
  const coverageScore = params.coverageScore;

  // Completeness score (already 0.0-1.0)
  const completenessScore = params.constraintCompleteness;

  // Deduplication score (higher reduction % = better)
  const deduplicationScore = Math.min(
    params.deduplicationMetrics.reductionPercentage / 100,
    1.0
  );

  // Weighted average
  const weights = {
    taskCount: 0.2,
    coverage: 0.3,
    completeness: 0.3,
    deduplication: 0.2,
  };

  return (
    taskCountScore * weights.taskCount +
    coverageScore * weights.coverage +
    completenessScore * weights.completeness +
    deduplicationScore * weights.deduplication
  );
}

// =============================================
// Parallel Comparison
// =============================================

function compareToParallelApproach(
  sequentialTaskCount: number,
  parallelTaskCount: number,
  sequentialCoverageScore: number,
  sequentialCompleteness: number
): QualityReport["comparisonToParallel"] {
  // Parallel approach assumptions:
  // - Task count = sum of all decomposer outputs (no deduplication)
  // - Coverage score = 0.25 (each task has 1/4 perspectives only)
  // - Completeness = 0.0 (no cross-perspective integration)

  const parallelCoverageScore = 0.25; // Assumption
  const parallelCompleteness = 0.0; // Assumption

  const betterTaskCount = sequentialTaskCount < parallelTaskCount;
  const betterCoverage = sequentialCoverageScore > parallelCoverageScore;
  const betterCompleteness = sequentialCompleteness > parallelCompleteness;

  // Overall: sequential is better if at least 2 out of 3 metrics are better
  const betterCount = [betterTaskCount, betterCoverage, betterCompleteness].filter(
    (b) => b
  ).length;
  const overallBetter = betterCount >= 2;

  return {
    betterTaskCount,
    betterCoverage,
    betterCompleteness,
    overallBetter,
  };
}

// =============================================
// Utility: Format Report for Display
// =============================================

export function formatQualityReport(report: QualityReport): string {
  const lines: string[] = [];

  lines.push("=== Decomposition Quality Report ===");
  lines.push("");

  lines.push("Task Count:");
  lines.push(`  Count: ${report.taskCount}`);
  lines.push(`  Target: ${report.targetRange.min}-${report.targetRange.max}`);
  lines.push(`  Within Target: ${report.withinTarget ? "YES ✓" : "NO ✗"}`);
  lines.push("");

  lines.push("Coverage:");
  lines.push(`  Overall Score: ${(report.coverageScore * 100).toFixed(1)}%`);
  lines.push(
    `  Architecture: ${(report.perspectiveCoverage.architecture * 100).toFixed(1)}%`
  );
  lines.push(`  Security: ${(report.perspectiveCoverage.security * 100).toFixed(1)}%`);
  lines.push(
    `  Performance: ${(report.perspectiveCoverage.performance * 100).toFixed(1)}%`
  );
  lines.push(`  Testing: ${(report.perspectiveCoverage.testing * 100).toFixed(1)}%`);
  lines.push("");

  lines.push("Constraint Completeness:");
  lines.push(`  Completeness: ${(report.constraintCompleteness * 100).toFixed(1)}%`);
  lines.push(`  Avg Constraints/Task: ${report.avgConstraintsPerTask.toFixed(1)}`);
  lines.push("");

  lines.push("Deduplication:");
  lines.push(`  Sequential Tasks: ${report.deduplicationMetrics.sequentialTaskCount}`);
  lines.push(
    `  Est. Parallel Tasks: ${report.deduplicationMetrics.estimatedParallelTaskCount}`
  );
  lines.push(
    `  Reduction: ${report.deduplicationMetrics.reductionPercentage.toFixed(1)}%`
  );
  lines.push(`  Duplicates Avoided: ${report.deduplicationMetrics.duplicatesAvoided}`);
  lines.push("");

  lines.push("Overall Quality Score:");
  lines.push(`  Score: ${(report.overallQualityScore * 100).toFixed(1)}%`);
  lines.push("");

  lines.push("Comparison to Parallel:");
  lines.push(
    `  Better Task Count: ${report.comparisonToParallel.betterTaskCount ? "YES ✓" : "NO ✗"}`
  );
  lines.push(
    `  Better Coverage: ${report.comparisonToParallel.betterCoverage ? "YES ✓" : "NO ✗"}`
  );
  lines.push(
    `  Better Completeness: ${report.comparisonToParallel.betterCompleteness ? "YES ✓" : "NO ✗"}`
  );
  lines.push(
    `  Overall Better: ${report.comparisonToParallel.overallBetter ? "YES ✓" : "NO ✗"}`
  );
  lines.push("");

  return lines.join("\n");
}
