/**
 * Quality Metrics Tests
 *
 * Validates the quality metrics system:
 * 1. Sequential vs parallel comparison
 * 2. Coverage score calculation
 * 3. Constraint completeness
 * 4. Deduplication effectiveness
 * 5. Overall quality score
 *
 * @module quality-metrics.test
 */

import { describe, it, expect } from "@jest/globals";
import {
  analyzeDecompositionQuality,
  analyzeExecutionQuality,
  formatQualityReport,
} from "../../src/lib/decomposition-quality-metrics.js";
import type { MergedDecomposition, RefinedMicroTask } from "../../src/lib/decomposition-merger.js";
import type { ExecutionPlan } from "../../src/lib/execution-phase-planner.js";

describe("Decomposition Quality Metrics", () => {
  // Test Case 1: Task Count Within Target
  it("should score task count highly when within 12-16 range", () => {
    const mergedDecomposition: MergedDecomposition = {
      taskId: "test-001",
      originalTask: "Build feature",
      microTasks: createMockTasks(14), // Within target
      metrics: {
        totalTasks: 14,
        constraintCompleteness: 1.0,
        avgConstraintsPerTask: 4.0,
        refinementDepth: 3.5,
      },
      recommendations: {
        architecture: [],
        security: [],
        performance: [],
        testing: [],
      },
    };

    const executionPlan: ExecutionPlan = {
      phases: [],
      totalPhases: 3,
      totalEstimatedDuration: 45,
      criticalPath: [],
      parallelismScore: 0.8,
      maxParallelTasks: 5,
    };

    const originalCounts = {
      architecture: 10,
      security: 8,
      performance: 6,
      testing: 12,
    };

    const report = analyzeDecompositionQuality(
      mergedDecomposition,
      executionPlan,
      originalCounts
    );

    expect(report.withinTarget).toBe(true);
    expect(report.taskCount).toBe(14);
    expect(report.overallQualityScore).toBeGreaterThan(0.8);
  });

  // Test Case 2: Coverage Score Calculation
  it("should calculate perspective coverage correctly", () => {
    const tasks: RefinedMicroTask[] = [
      createMockTask("task-1", {
        architecture: true,
        security: true,
        performance: true,
        testing: true,
      }),
      createMockTask("task-2", {
        architecture: true,
        security: true,
        performance: false,
        testing: false,
      }),
      createMockTask("task-3", {
        architecture: true,
        security: false,
        performance: false,
        testing: false,
      }),
    ];

    const mergedDecomposition: MergedDecomposition = {
      taskId: "test-002",
      originalTask: "Feature",
      microTasks: tasks,
      metrics: {
        totalTasks: 3,
        constraintCompleteness: 1 / 3, // Only task-1 has all 4
        avgConstraintsPerTask: (4 + 2 + 1) / 3,
        refinementDepth: 2.0,
      },
      recommendations: {
        architecture: [],
        security: [],
        performance: [],
        testing: [],
      },
    };

    const executionPlan: ExecutionPlan = {
      phases: [],
      totalPhases: 1,
      totalEstimatedDuration: 15,
      criticalPath: [],
      parallelismScore: 1.0,
      maxParallelTasks: 3,
    };

    const originalCounts = {
      architecture: 3,
      security: 2,
      performance: 1,
      testing: 1,
    };

    const report = analyzeDecompositionQuality(
      mergedDecomposition,
      executionPlan,
      originalCounts
    );

    // Architecture: 3/3 = 100%
    // Security: 2/3 = 66.7%
    // Performance: 1/3 = 33.3%
    // Testing: 1/3 = 33.3%
    // Coverage score: (100 + 66.7 + 33.3 + 33.3) / 4 = 58.3%
    expect(report.perspectiveCoverage.architecture).toBeCloseTo(1.0, 2);
    expect(report.perspectiveCoverage.security).toBeCloseTo(0.667, 2);
    expect(report.perspectiveCoverage.performance).toBeCloseTo(0.333, 2);
    expect(report.perspectiveCoverage.testing).toBeCloseTo(0.333, 2);
    expect(report.coverageScore).toBeCloseTo(0.583, 2);
  });

  // Test Case 3: Deduplication Effectiveness
  it("should calculate deduplication effectiveness correctly", () => {
    const mergedDecomposition: MergedDecomposition = {
      taskId: "test-003",
      originalTask: "Feature",
      microTasks: createMockTasks(15), // Sequential result
      metrics: {
        totalTasks: 15,
        constraintCompleteness: 0.9,
        avgConstraintsPerTask: 3.6,
        refinementDepth: 3.2,
      },
      recommendations: {
        architecture: [],
        security: [],
        performance: [],
        testing: [],
      },
    };

    const executionPlan: ExecutionPlan = {
      phases: [],
      totalPhases: 4,
      totalEstimatedDuration: 60,
      criticalPath: [],
      parallelismScore: 0.75,
      maxParallelTasks: 6,
    };

    const originalCounts = {
      architecture: 12,
      security: 10,
      performance: 8,
      testing: 14,
    }; // Total: 44 tasks if done in parallel

    const report = analyzeDecompositionQuality(
      mergedDecomposition,
      executionPlan,
      originalCounts
    );

    // Deduplication: (44 - 15) / 44 = 65.9%
    expect(report.deduplicationMetrics.sequentialTaskCount).toBe(15);
    expect(report.deduplicationMetrics.estimatedParallelTaskCount).toBe(44);
    expect(report.deduplicationMetrics.duplicatesAvoided).toBe(29);
    expect(report.deduplicationMetrics.reductionPercentage).toBeCloseTo(65.9, 1);
  });

  // Test Case 4: Sequential > Parallel Comparison
  it("should demonstrate sequential approach is better than parallel", () => {
    const mergedDecomposition: MergedDecomposition = {
      taskId: "test-004",
      originalTask: "Feature",
      microTasks: createMockTasks(14, true), // All tasks fully refined
      metrics: {
        totalTasks: 14,
        constraintCompleteness: 1.0, // 100% completeness
        avgConstraintsPerTask: 4.0,
        refinementDepth: 4.0,
      },
      recommendations: {
        architecture: [],
        security: [],
        performance: [],
        testing: [],
      },
    };

    const executionPlan: ExecutionPlan = {
      phases: [],
      totalPhases: 3,
      totalEstimatedDuration: 45,
      criticalPath: [],
      parallelismScore: 0.8,
      maxParallelTasks: 5,
    };

    const originalCounts = {
      architecture: 10,
      security: 8,
      performance: 7,
      testing: 9,
    }; // Total: 34 tasks if parallel

    const report = analyzeDecompositionQuality(
      mergedDecomposition,
      executionPlan,
      originalCounts
    );

    // Sequential should be better in all metrics:
    // - Task count: 14 < 34 ✓
    // - Coverage: 1.0 > 0.25 (parallel assumption) ✓
    // - Completeness: 1.0 > 0.0 (parallel assumption) ✓
    expect(report.comparisonToParallel.betterTaskCount).toBe(true);
    expect(report.comparisonToParallel.betterCoverage).toBe(true);
    expect(report.comparisonToParallel.betterCompleteness).toBe(true);
    expect(report.comparisonToParallel.overallBetter).toBe(true);
  });

  // Test Case 5: Execution Quality Metrics
  it("should analyze execution plan quality correctly", () => {
    const tasks: RefinedMicroTask[] = [
      createMockTask("task-1", {}, []),
      createMockTask("task-2", {}, ["task-1"]),
      createMockTask("task-3", {}, ["task-1"]),
      createMockTask("task-4", {}, ["task-2", "task-3"]),
    ];

    const executionPlan: ExecutionPlan = {
      phases: [
        {
          phase: 1,
          parallelTasks: ["task-1"],
          dependencies: [],
          estimatedDuration: 15,
          criticalPath: true,
        },
        {
          phase: 2,
          parallelTasks: ["task-2", "task-3"],
          dependencies: ["task-1"],
          estimatedDuration: 15,
          criticalPath: true,
        },
        {
          phase: 3,
          parallelTasks: ["task-4"],
          dependencies: ["task-1", "task-2", "task-3"],
          estimatedDuration: 15,
          criticalPath: true,
        },
      ],
      totalPhases: 3,
      totalEstimatedDuration: 45,
      criticalPath: ["task-1", "task-2", "task-4"],
      parallelismScore: 0.67,
      maxParallelTasks: 2,
    };

    const metrics = analyzeExecutionQuality(executionPlan, tasks);

    expect(metrics.phaseCount).toBe(3);
    expect(metrics.estimatedDuration).toBe(45);
    expect(metrics.parallelismScore).toBeCloseTo(0.67, 2);
    expect(metrics.criticalPathLength).toBe(3);
    expect(metrics.tasksWithNoDependencies).toBe(1); // task-1
    expect(metrics.maxParallelTasks).toBe(2); // task-2, task-3
  });
});

// =============================================
// Helper Functions
// =============================================

function createMockTasks(count: number, fullyRefined: boolean = true): RefinedMicroTask[] {
  const tasks: RefinedMicroTask[] = [];

  for (let i = 0; i < count; i++) {
    tasks.push(
      createMockTask(`task-${i + 1}`, {
        architecture: fullyRefined,
        security: fullyRefined,
        performance: fullyRefined,
        testing: fullyRefined,
      })
    );
  }

  return tasks;
}

function createMockTask(
  id: string,
  constraints: {
    architecture?: boolean;
    security?: boolean;
    performance?: boolean;
    testing?: boolean;
  },
  dependencies: string[] = []
): RefinedMicroTask {
  const task: RefinedMicroTask = {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    priority: "medium",
    constraints: {},
    dependencies,
    estimatedEffort: "medium",
    refinementHistory: [
      {
        stage: "architecture",
        change: "Initial task",
        timestamp: Date.now(),
      },
    ],
  };

  if (constraints.architecture) {
    task.constraints.architecture = {
      perspective: "architecture",
      description: "Architecture constraint",
      rationale: "Architecture reason",
    };
  }

  if (constraints.security) {
    task.constraints.security = {
      perspective: "security",
      description: "Security constraint",
      rationale: "Security reason",
    };
    task.refinementHistory.push({
      stage: "security",
      change: "Added security",
      timestamp: Date.now(),
    });
  }

  if (constraints.performance) {
    task.constraints.performance = {
      perspective: "performance",
      description: "Performance constraint",
      rationale: "Performance reason",
    };
    task.refinementHistory.push({
      stage: "performance",
      change: "Added performance",
      timestamp: Date.now(),
    });
  }

  if (constraints.testing) {
    task.constraints.testing = {
      perspective: "testing",
      description: "Testing constraint",
      rationale: "Testing reason",
    };
    task.refinementHistory.push({
      stage: "testing",
      change: "Added testing",
      timestamp: Date.now(),
    });
  }

  return task;
}
