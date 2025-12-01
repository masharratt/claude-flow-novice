import { task, tasks, runs, batch } from "@trigger.dev/sdk/v3";
import type { ArchitectureAnalysis } from "./cfn-architecture-decomposer.js";
import type { SecurityAnalysis } from "./cfn-security-decomposer.js";
import type { PerformanceAnalysis } from "./cfn-performance-decomposer.js";
import type { TestingAnalysis } from "./cfn-testing-decomposer.js";

// Type definitions for the unified decomposition plan
export interface UnifiedMicroTask {
  id: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  rationale: string;
  perspectives: Array<{
    perspective: "architecture" | "security" | "performance" | "testing";
    rationale: string;
    threatVectors?: string[];
    metrics?: string[];
    testTypes?: string[];
  }>;
  dependencies: string[];
  estimatedEffort: "small" | "medium" | "large";
}

export interface ExecutionPhase {
  phase: number;
  parallelTasks: string[]; // Task IDs that can run in parallel
  sequentialDependencies: string[]; // Task IDs that must run first
}

export interface DecompositionPlan {
  taskId: string;
  originalTask: string;
  microTasks: UnifiedMicroTask[];
  swarmAnalysis: {
    architectureRecommendations: string[];
    securityRecommendations: string[];
    securityRiskLevel: "critical" | "high" | "medium" | "low";
    performanceRecommendations: string[];
    testingRecommendations: string[];
    coverageGoal: number;
  };
  executionPhases: ExecutionPhase[];
  totalEstimatedTasks: number;
}

export interface DecompositionAggregatorPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
}

// Main aggregator task
export const cfnDecompositionAggregatorTask = task({
  id: "cfn-decomposition-aggregator",
  retry: { maxAttempts: 1 },

  run: async (payload: DecompositionAggregatorPayload): Promise<DecompositionPlan> => {
    const startTime = Date.now();

    console.log(`[decomposition-aggregator] Starting 4-way swarm decomposition`);
    console.log(`  Task: ${payload.taskDescription.substring(0, 80)}...`);

    try {
      // 1. Trigger all 4 decomposers in parallel
      const taskNames = [
        "cfn-architecture-decomposer",
        "cfn-security-decomposer",
        "cfn-performance-decomposer",
        "cfn-testing-decomposer",
      ];

      console.log(`[decomposition-aggregator] Triggering ${taskNames.length} decomposers in parallel...`);

      const batchHandles = await Promise.all(
        taskNames.map((name) =>
          tasks.trigger(name, {
            taskId: payload.taskId,
            taskDescription: payload.taskDescription,
            workDir: payload.workDir,
          })
        )
      );

      console.log(`[decomposition-aggregator] Spawned 4 decomposers, waiting for results...`);

      // 2. Poll each run for completion
      const results = await Promise.all(
        batchHandles.map((handle) =>
          runs.poll(handle.id, { pollIntervalMs: 1000 })
        )
      );

      // 3. Extract outputs from poll results
      const analyses = results.map((r) => r.output) as Array<
        ArchitectureAnalysis | SecurityAnalysis | PerformanceAnalysis | TestingAnalysis
      >;

      console.log(`[decomposition-aggregator] All 4 decomposers completed`);
      console.log(`  Architecture: ${(analyses.find((a) => a.perspective === "architecture") as ArchitectureAnalysis)?.microTasks.length ?? 0} tasks`);
      console.log(`  Security: ${(analyses.find((a) => a.perspective === "security") as SecurityAnalysis)?.microTasks.length ?? 0} tasks`);
      console.log(`  Performance: ${(analyses.find((a) => a.perspective === "performance") as PerformanceAnalysis)?.microTasks.length ?? 0} tasks`);
      console.log(`  Testing: ${(analyses.find((a) => a.perspective === "testing") as TestingAnalysis)?.microTasks.length ?? 0} tasks`);

      // 4. Merge micro-tasks (deduplication)
      const allMicroTasks = analyses.flatMap((analysis) =>
        analysis.microTasks.map((task) => ({
          perspective: analysis.perspective,
          task,
        }))
      );

      const unifiedTasks = mergeAndDeduplicate(allMicroTasks);

      console.log(`[decomposition-aggregator] Merged into ${unifiedTasks.length} unified tasks`);

      // 5. Create execution phases
      const phases = createExecutionPhases(unifiedTasks);

      // 6. Aggregate recommendations
      const archAnalysis = analyses.find((a) => a.perspective === "architecture") as ArchitectureAnalysis | undefined;
      const secAnalysis = analyses.find((a) => a.perspective === "security") as SecurityAnalysis | undefined;
      const perfAnalysis = analyses.find((a) => a.perspective === "performance") as PerformanceAnalysis | undefined;
      const testAnalysis = analyses.find((a) => a.perspective === "testing") as TestingAnalysis | undefined;

      const plan: DecompositionPlan = {
        taskId: payload.taskId,
        originalTask: payload.taskDescription,
        microTasks: unifiedTasks,
        swarmAnalysis: {
          architectureRecommendations: archAnalysis?.recommendations ?? [],
          securityRecommendations: secAnalysis?.securityRecommendations ?? [],
          securityRiskLevel: secAnalysis?.riskLevel ?? "low",
          performanceRecommendations: perfAnalysis?.performanceRecommendations ?? [],
          testingRecommendations: testAnalysis?.testingRecommendations ?? [],
          coverageGoal: testAnalysis?.coverageGoal ?? 80,
        },
        executionPhases: phases,
        totalEstimatedTasks: unifiedTasks.length,
      };

      const duration = Date.now() - startTime;
      console.log(`[decomposition-aggregator] ✓ Success`);
      console.log(`  Total micro-tasks: ${plan.totalEstimatedTasks}`);
      console.log(`  Execution phases: ${phases.length}`);
      console.log(`  Security risk: ${secAnalysis?.riskLevel ?? "low"}`);
      console.log(`  Time: ${duration}ms`);

      return plan;
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[decomposition-aggregator] ✗ Error: ${errorMsg}`);

      // Return empty plan on error
      return {
        taskId: payload.taskId,
        originalTask: payload.taskDescription,
        microTasks: [],
        swarmAnalysis: {
          architectureRecommendations: [],
          securityRecommendations: [],
          securityRiskLevel: "low",
          performanceRecommendations: [],
          testingRecommendations: [],
          coverageGoal: 80,
        },
        executionPhases: [],
        totalEstimatedTasks: 0,
      };
    }
  },
});

// Helper functions

function mergeAndDeduplicate(
  allTasks: Array<{ perspective: string; task: any }>
): UnifiedMicroTask[] {
  const merged: Map<string, UnifiedMicroTask> = new Map();

  for (const { perspective, task } of allTasks) {
    // Simple deduplication: normalize title for comparison
    const normalizedTitle = task.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-");

    if (merged.has(normalizedTitle)) {
      // Add perspective to existing task
      const existing = merged.get(normalizedTitle)!;

      // Check if this perspective already exists
      const perspectiveExists = existing.perspectives.some(
        (p) => p.perspective === perspective
      );

      if (!perspectiveExists) {
        existing.perspectives.push({
          perspective: perspective as any,
          rationale: task.rationale,
          threatVectors: (task as any).threatVectors,
          metrics: (task as any).metrics,
          testTypes: (task as any).testTypes,
        });

        // Upgrade priority if this perspective has higher priority
        const priorityOrder: Record<string, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        };
        if (
          priorityOrder[task.priority] > priorityOrder[existing.priority]
        ) {
          existing.priority = task.priority;
        }

        // Merge dependencies (unique)
        const newDeps = task.dependencies || [];
        existing.dependencies = Array.from(
          new Set([...existing.dependencies, ...newDeps])
        );
      }
    } else {
      // Create new merged task
      merged.set(normalizedTitle, {
        id: `merged-${merged.size + 1}`,
        title: task.title,
        description: task.description,
        priority: task.priority,
        rationale: task.rationale,
        perspectives: [
          {
            perspective: perspective as any,
            rationale: task.rationale,
            threatVectors: (task as any).threatVectors,
            metrics: (task as any).metrics,
            testTypes: (task as any).testTypes,
          },
        ],
        dependencies: task.dependencies || [],
        estimatedEffort: estimateEffort(task.description),
      });
    }
  }

  // Sort by priority (critical > high > medium > low)
  return Array.from(merged.values()).sort((a, b) => {
    const priorityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

function estimateEffort(description: string): "small" | "medium" | "large" {
  // Heuristic: longer descriptions = more effort
  if (description.length < 100) return "small";
  if (description.length < 200) return "medium";
  return "large";
}

function createExecutionPhases(tasks: UnifiedMicroTask[]): ExecutionPhase[] {
  const phases: ExecutionPhase[] = [];
  const processed = new Set<string>();

  // Simple phase creation: group tasks by dependency level
  while (processed.size < tasks.length) {
    const phase: ExecutionPhase = {
      phase: phases.length + 1,
      parallelTasks: [],
      sequentialDependencies: [],
    };

    // Find tasks whose dependencies are all processed
    for (const task of tasks) {
      if (processed.has(task.id)) continue;

      // Check if all dependencies are processed
      const depsProcessed = task.dependencies.every((dep) =>
        processed.has(dep)
      );

      if (depsProcessed) {
        phase.parallelTasks.push(task.id);
      }
    }

    // Fallback: if no tasks can be added, add first unprocessed task
    if (phase.parallelTasks.length === 0) {
      for (const task of tasks) {
        if (!processed.has(task.id)) {
          phase.parallelTasks.push(task.id);
          break;
        }
      }
    }

    // Mark tasks as processed
    phase.parallelTasks.forEach((id) => processed.add(id));

    // Add sequential dependencies (tasks processed in previous phases)
    const prevPhasesTasks = phases.flatMap((p) => p.parallelTasks);
    phase.sequentialDependencies = prevPhasesTasks.filter((id) =>
      phase.parallelTasks.some((taskId) => {
        const task = tasks.find((t) => t.id === taskId);
        return task?.dependencies.includes(id);
      })
    );

    phases.push(phase);
  }

  return phases;
}
