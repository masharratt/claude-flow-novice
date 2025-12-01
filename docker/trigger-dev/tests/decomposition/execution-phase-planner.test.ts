/**
 * Execution Phase Planner Tests
 *
 * Validates execution phase planning:
 * 1. Dependency graph construction
 * 2. Circular dependency detection
 * 3. Topological sorting
 * 4. Phase grouping by dependency level
 * 5. Critical path identification
 *
 * @module execution-phase-planner.test
 */

import { describe, it, expect } from "@jest/globals";
import { createExecutionPhases } from "../../src/lib/execution-phase-planner.js";
import type { RefinedMicroTask } from "../../src/lib/decomposition-merger.js";

describe("Execution Phase Planner", () => {
  // Test Case 1: Linear Dependencies
  it("should create sequential phases for linear dependencies", () => {
    const tasks: RefinedMicroTask[] = [
      createTask("task-1", [], "small"),
      createTask("task-2", ["task-1"], "medium"),
      createTask("task-3", ["task-2"], "large"),
    ];

    const plan = createExecutionPhases(tasks);

    // Should create 3 phases (one per task)
    expect(plan.phases.length).toBe(3);

    // Phase 1: task-1 (no dependencies)
    expect(plan.phases[0].parallelTasks).toEqual(["task-1"]);
    expect(plan.phases[0].dependencies).toEqual([]);

    // Phase 2: task-2 (depends on task-1)
    expect(plan.phases[1].parallelTasks).toEqual(["task-2"]);
    expect(plan.phases[1].dependencies).toEqual(["task-1"]);

    // Phase 3: task-3 (depends on task-2)
    expect(plan.phases[2].parallelTasks).toEqual(["task-3"]);

    // Critical path should be all 3 tasks
    expect(plan.criticalPath).toEqual(["task-1", "task-2", "task-3"]);

    // Estimated duration: 5 + 15 + 30 = 50 minutes
    expect(plan.totalEstimatedDuration).toBe(50);
  });

  // Test Case 2: Parallel Execution Opportunities
  it("should group independent tasks into parallel phases", () => {
    const tasks: RefinedMicroTask[] = [
      createTask("task-1", [], "small"),
      createTask("task-2", [], "small"),
      createTask("task-3", [], "small"),
      createTask("task-4", ["task-1", "task-2", "task-3"], "medium"),
    ];

    const plan = createExecutionPhases(tasks);

    // Should create 2 phases
    expect(plan.phases.length).toBe(2);

    // Phase 1: tasks 1-3 in parallel
    expect(plan.phases[0].parallelTasks).toHaveLength(3);
    expect(plan.phases[0].parallelTasks).toContain("task-1");
    expect(plan.phases[0].parallelTasks).toContain("task-2");
    expect(plan.phases[0].parallelTasks).toContain("task-3");

    // Phase 2: task-4 (depends on all previous)
    expect(plan.phases[1].parallelTasks).toEqual(["task-4"]);

    // Max parallel tasks: 3
    expect(plan.maxParallelTasks).toBe(3);

    // Estimated duration: max(5,5,5) + 15 = 20 minutes
    expect(plan.totalEstimatedDuration).toBe(20);

    // Parallelism score: avg 2 tasks/phase / 4 total = 0.5
    expect(plan.parallelismScore).toBeGreaterThan(0);
  });

  // Test Case 3: Diamond Dependency Pattern
  it("should handle diamond dependency pattern correctly", () => {
    const tasks: RefinedMicroTask[] = [
      createTask("A", [], "small"),
      createTask("B", ["A"], "small"),
      createTask("C", ["A"], "small"),
      createTask("D", ["B", "C"], "medium"),
    ];

    const plan = createExecutionPhases(tasks);

    // Should create 3 phases
    expect(plan.phases.length).toBe(3);

    // Phase 1: A
    expect(plan.phases[0].parallelTasks).toEqual(["A"]);

    // Phase 2: B and C in parallel
    expect(plan.phases[1].parallelTasks).toHaveLength(2);
    expect(plan.phases[1].parallelTasks).toContain("B");
    expect(plan.phases[1].parallelTasks).toContain("C");

    // Phase 3: D
    expect(plan.phases[2].parallelTasks).toEqual(["D"]);

    // Estimated duration: 5 + max(5,5) + 15 = 25 minutes
    expect(plan.totalEstimatedDuration).toBe(25);
  });

  // Test Case 4: Complex Dependency Graph
  it("should handle complex multi-level dependencies", () => {
    const tasks: RefinedMicroTask[] = [
      // Level 0 (no dependencies)
      createTask("init-1", [], "small"),
      createTask("init-2", [], "small"),

      // Level 1 (depend on level 0)
      createTask("build-1", ["init-1"], "medium"),
      createTask("build-2", ["init-2"], "medium"),
      createTask("build-3", ["init-1", "init-2"], "medium"),

      // Level 2 (depend on level 1)
      createTask("test-1", ["build-1"], "small"),
      createTask("test-2", ["build-2", "build-3"], "small"),

      // Level 3 (depend on level 2)
      createTask("deploy", ["test-1", "test-2"], "large"),
    ];

    const plan = createExecutionPhases(tasks);

    // Should create 4 phases
    expect(plan.phases.length).toBe(4);

    // Phase 1: init-1, init-2
    expect(plan.phases[0].parallelTasks).toHaveLength(2);

    // Phase 2: build-1, build-2, build-3
    expect(plan.phases[1].parallelTasks).toHaveLength(3);

    // Phase 3: test-1, test-2
    expect(plan.phases[2].parallelTasks).toHaveLength(2);

    // Phase 4: deploy
    expect(plan.phases[3].parallelTasks).toEqual(["deploy"]);

    // Max parallel: 3 (build phase)
    expect(plan.maxParallelTasks).toBe(3);
  });

  // Test Case 5: Critical Path Identification
  it("should identify critical path correctly", () => {
    const tasks: RefinedMicroTask[] = [
      // Short path: A -> B (10 minutes)
      createTask("A", [], "small"),
      createTask("B", ["A"], "small"),

      // Long path: C -> D -> E (60 minutes) - CRITICAL PATH
      createTask("C", [], "large"),
      createTask("D", ["C"], "large"),
      createTask("E", ["D"], "large"),

      // Converging task
      createTask("F", ["B", "E"], "small"),
    ];

    const plan = createExecutionPhases(tasks);

    // Critical path should be C -> D -> E -> F (longest path)
    expect(plan.criticalPath).toContain("C");
    expect(plan.criticalPath).toContain("D");
    expect(plan.criticalPath).toContain("E");
    expect(plan.criticalPath).toContain("F");

    // Mark phases on critical path
    const criticalPhases = plan.phases.filter((p) => p.criticalPath);
    expect(criticalPhases.length).toBeGreaterThan(0);
  });

  // Test Case 6: Circular Dependency Detection
  it("should detect and reject circular dependencies", () => {
    const tasks: RefinedMicroTask[] = [
      createTask("task-1", ["task-2"], "small"), // Depends on task-2
      createTask("task-2", ["task-1"], "small"), // Depends on task-1 - CYCLE!
    ];

    // Should throw error for circular dependency
    expect(() => createExecutionPhases(tasks)).toThrow(/circular/i);
  });

  // Test Case 7: Self-Dependency Detection
  it("should handle self-dependency gracefully", () => {
    const tasks: RefinedMicroTask[] = [
      createTask("task-1", ["task-1"], "small"), // Self-dependency - CYCLE!
    ];

    // Should throw error for self-dependency
    expect(() => createExecutionPhases(tasks)).toThrow(/circular/i);
  });

  // Test Case 8: Missing Dependency Reference
  it("should handle missing dependency references gracefully", () => {
    const tasks: RefinedMicroTask[] = [
      createTask("task-1", ["nonexistent"], "small"), // Depends on missing task
    ];

    // Should not throw (warning logged instead)
    const plan = createExecutionPhases(tasks);
    expect(plan.phases.length).toBe(1);
    expect(plan.phases[0].parallelTasks).toEqual(["task-1"]);
  });

  // Test Case 9: Isolated Tasks (No Dependencies)
  it("should group all tasks into one phase when no dependencies exist", () => {
    const tasks: RefinedMicroTask[] = [
      createTask("task-1", [], "small"),
      createTask("task-2", [], "medium"),
      createTask("task-3", [], "large"),
      createTask("task-4", [], "small"),
      createTask("task-5", [], "medium"),
    ];

    const plan = createExecutionPhases(tasks);

    // All tasks should be in phase 1 (parallel)
    expect(plan.phases.length).toBe(1);
    expect(plan.phases[0].parallelTasks).toHaveLength(5);

    // Estimated duration: max(5,15,30,5,15) = 30 minutes
    expect(plan.totalEstimatedDuration).toBe(30);

    // Max parallelism: 5
    expect(plan.maxParallelTasks).toBe(5);

    // Parallelism score: 5/5 = 1.0
    expect(plan.parallelismScore).toBeCloseTo(1.0, 2);
  });

  // Test Case 10: Parallelism Score Calculation
  it("should calculate parallelism score correctly", () => {
    const tasks: RefinedMicroTask[] = [
      // 4 tasks total
      createTask("task-1", [], "small"),
      createTask("task-2", [], "small"),
      createTask("task-3", ["task-1", "task-2"], "small"),
      createTask("task-4", ["task-3"], "small"),
    ];

    const plan = createExecutionPhases(tasks);

    // 3 phases: [task-1, task-2], [task-3], [task-4]
    // Avg tasks per phase: 4/3 ≈ 1.33
    // Parallelism score: 1.33/4 ≈ 0.33
    expect(plan.parallelismScore).toBeGreaterThan(0);
    expect(plan.parallelismScore).toBeLessThanOrEqual(1.0);
  });
});

// =============================================
// Helper Functions
// =============================================

function createTask(
  id: string,
  dependencies: string[],
  effort: "small" | "medium" | "large"
): RefinedMicroTask {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    priority: "medium",
    constraints: {
      architecture: {
        perspective: "architecture",
        description: "Arch constraint",
        rationale: "Reason",
      },
    },
    dependencies,
    estimatedEffort: effort,
    refinementHistory: [
      {
        stage: "architecture",
        change: "Initial task",
        timestamp: Date.now(),
      },
    ],
  };
}
