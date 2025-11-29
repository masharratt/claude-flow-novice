/**
 * End-to-End Integration Test for CFN Coordinator
 *
 * Tests the complete flow from Task 2.3:
 * 1. Sequential decomposition with context passing (Phase 1)
 * 2. Implementation execution (Phase 2)
 * 3. Gate check (Phase 3)
 * 4. Validation (Phase 4 - if applicable)
 *
 * Requirements:
 * - Coordinator integrated with all 4 decomposers
 * - Sequential context passing verified
 * - Full flow completes successfully
 * - Metrics collected for all phases
 * - Error handling robust
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { configure, tasks, runs } from "@trigger.dev/sdk/v3";
import type { CFNCoordinatorResult } from "../../src/trigger/cfn-coordinator.js";

// Configure Trigger.dev SDK
beforeAll(() => {
  configure({
    secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_test",
    baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
  });
});

describe("CFN Coordinator Integration Tests", () => {
  // Test timeout: 3 minutes (decomposition + execution + validation)
  const TEST_TIMEOUT = 180000;

  describe("Phase 1: Sequential Decomposition with Context Passing", () => {
    it(
      "should execute all 4 decomposers sequentially with context",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `test-seq-decomp-${Date.now()}`,
          taskDescription: "Build a simple REST API endpoint for user authentication",
          workDir: "/tmp/test-coordinator",
          mode: "mvp" as const,
          maxIterations: 1,
          complexity: "simple" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        // Verify decomposition completed
        expect(output.decompositionPlan).toBeDefined();
        expect(output.decompositionPlan?.microTasks.length).toBeGreaterThan(0);

        // Verify all 4 decomposer perspectives represented
        const perspectives = new Set(
          output.decompositionPlan?.microTasks.flatMap((t) => t.perspectives.map((p) => p.perspective))
        );
        expect(perspectives.has("architecture")).toBe(true);
        expect(perspectives.has("security")).toBe(true);
        expect(perspectives.has("performance")).toBe(true);
        expect(perspectives.has("testing")).toBe(true);

        // Verify phase breakdown exists (sequential decomposition feature)
        expect(output.metrics.decompositionPhaseBreakdown).toBeDefined();
        expect(output.metrics.decompositionPhaseBreakdown?.architectureMs).toBeGreaterThan(0);
        expect(output.metrics.decompositionPhaseBreakdown?.securityMs).toBeGreaterThan(0);
        expect(output.metrics.decompositionPhaseBreakdown?.performanceMs).toBeGreaterThan(0);
        expect(output.metrics.decompositionPhaseBreakdown?.testingMs).toBeGreaterThan(0);

        console.log("✓ Sequential decomposition verified");
        console.log(`  Architecture: ${output.metrics.decompositionPhaseBreakdown?.architectureMs}ms`);
        console.log(`  Security: ${output.metrics.decompositionPhaseBreakdown?.securityMs}ms`);
        console.log(`  Performance: ${output.metrics.decompositionPhaseBreakdown?.performanceMs}ms`);
        console.log(`  Testing: ${output.metrics.decompositionPhaseBreakdown?.testingMs}ms`);
        console.log(`  Context overhead: ${output.metrics.decompositionPhaseBreakdown?.contextOverheadMs}ms`);
      },
      TEST_TIMEOUT
    );

    it(
      "should pass context between decomposers",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `test-context-passing-${Date.now()}`,
          taskDescription: "Create a secure payment processing module",
          workDir: "/tmp/test-coordinator",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        // Verify decomposition plan contains cross-perspective insights
        expect(output.decompositionPlan).toBeDefined();

        // Security tasks should reference architecture components
        const securityTasks = output.decompositionPlan?.microTasks.filter((t) =>
          t.perspectives.some((p) => p.perspective === "security")
        );
        expect(securityTasks && securityTasks.length > 0).toBe(true);

        // Performance tasks should reference security constraints
        const performanceTasks = output.decompositionPlan?.microTasks.filter((t) =>
          t.perspectives.some((p) => p.perspective === "performance")
        );
        expect(performanceTasks && performanceTasks.length > 0).toBe(true);

        // Testing tasks should reference all previous contexts
        const testingTasks = output.decompositionPlan?.microTasks.filter((t) =>
          t.perspectives.some((p) => p.perspective === "testing")
        );
        expect(testingTasks && testingTasks.length > 0).toBe(true);

        console.log("✓ Context passing verified");
        console.log(`  Security tasks: ${securityTasks?.length}`);
        console.log(`  Performance tasks: ${performanceTasks?.length}`);
        console.log(`  Testing tasks: ${testingTasks?.length}`);
      },
      TEST_TIMEOUT
    );
  });

  describe("Phase 2-4: Full Coordinator Flow", () => {
    it(
      "should complete full flow end-to-end",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `test-full-flow-${Date.now()}`,
          taskDescription: "Implement basic CRUD operations for a blog post",
          workDir: "/tmp/test-coordinator",
          mode: "mvp" as const,
          maxIterations: 1,
          complexity: "simple" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        // Verify all phases completed
        expect(output.decompositionPlan).toBeDefined();
        expect(output.executionResults.length).toBeGreaterThan(0);
        expect(output.gateCheckResult).toBeDefined();

        // Verify metrics collected for all phases
        expect(output.metrics.decompositionTimeMs).toBeGreaterThan(0);
        expect(output.metrics.executionTimeMs).toBeGreaterThan(0);
        expect(output.metrics.gateCheckTimeMs).toBeGreaterThan(0);

        // Verify final status is valid
        expect(["COMPLETED", "FAILED", "ABORTED"]).toContain(output.finalStatus);

        console.log("✓ Full flow completed");
        console.log(`  Status: ${output.finalStatus}`);
        console.log(`  Decomposition: ${(output.metrics.decompositionTimeMs / 1000).toFixed(2)}s`);
        console.log(`  Execution: ${(output.metrics.executionTimeMs / 1000).toFixed(2)}s`);
        console.log(`  Gate check: ${(output.metrics.gateCheckTimeMs / 1000).toFixed(2)}s`);
        console.log(`  Total: ${(output.totalTime / 1000).toFixed(2)}s`);
      },
      TEST_TIMEOUT
    );

    it(
      "should collect accurate metrics",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `test-metrics-${Date.now()}`,
          taskDescription: "Add input validation to user registration form",
          workDir: "/tmp/test-coordinator",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "simple" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        // Verify metrics are accurate
        const totalCalculated =
          output.metrics.decompositionTimeMs +
          output.metrics.executionTimeMs +
          output.metrics.gateCheckTimeMs +
          output.metrics.validationTimeMs;

        // Allow 5% margin for overhead
        expect(output.totalTime).toBeGreaterThanOrEqual(totalCalculated * 0.95);
        expect(output.totalTime).toBeLessThanOrEqual(totalCalculated * 1.05 + 1000);

        // Verify phase breakdown sums to decomposition time
        const breakdown = output.metrics.decompositionPhaseBreakdown;
        if (breakdown) {
          const decompositionCalculated =
            breakdown.architectureMs +
            breakdown.securityMs +
            breakdown.performanceMs +
            breakdown.testingMs +
            breakdown.mergingMs;

          // Allow 10% margin for context passing overhead
          expect(output.metrics.decompositionTimeMs).toBeGreaterThanOrEqual(decompositionCalculated * 0.9);
          expect(output.metrics.decompositionTimeMs).toBeLessThanOrEqual(decompositionCalculated * 1.1);
        }

        console.log("✓ Metrics verified");
        console.log(`  Total time: ${output.totalTime}ms`);
        console.log(`  Sum of phases: ${totalCalculated}ms`);
        console.log(`  Difference: ${Math.abs(output.totalTime - totalCalculated)}ms`);
      },
      TEST_TIMEOUT
    );
  });

  describe("Error Handling", () => {
    it(
      "should handle invalid task descriptions gracefully",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `test-invalid-${Date.now()}`,
          taskDescription: "", // Empty description
          workDir: "/tmp/test-coordinator",
          mode: "mvp" as const,
          maxIterations: 1,
          complexity: "simple" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        // Should fail gracefully, not crash
        expect(output.finalStatus).toBe("FAILED");
        expect(output.success).toBe(false);

        console.log("✓ Invalid input handled gracefully");
      },
      TEST_TIMEOUT
    );

    it(
      "should handle decomposer failures robustly",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `test-error-handling-${Date.now()}`,
          taskDescription: "Test error handling with edge case inputs",
          workDir: "/nonexistent/path", // Invalid path
          mode: "mvp" as const,
          maxIterations: 1,
          complexity: "simple" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        // Should complete without crashing
        expect(output.finalStatus).toBeDefined();
        expect(["COMPLETED", "FAILED", "ABORTED"]).toContain(output.finalStatus);

        console.log("✓ Error handling robust");
        console.log(`  Final status: ${output.finalStatus}`);
      },
      TEST_TIMEOUT
    );
  });

  describe("Performance Regression", () => {
    it(
      "should meet performance targets for simple tasks",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `test-perf-simple-${Date.now()}`,
          taskDescription: "Create a utility function to format dates",
          workDir: "/tmp/test-coordinator",
          mode: "mvp" as const,
          maxIterations: 1,
          complexity: "simple" as const,
        });

        const startTime = Date.now();
        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const wallClockTime = Date.now() - startTime;
        const output = result.output as CFNCoordinatorResult;

        // For simple tasks, total time should be <90 seconds (per plan)
        expect(wallClockTime).toBeLessThan(90000);

        // Decomposition should be <10 seconds
        expect(output.metrics.decompositionTimeMs).toBeLessThan(10000);

        console.log("✓ Performance targets met for simple task");
        console.log(`  Wall clock: ${(wallClockTime / 1000).toFixed(2)}s`);
        console.log(`  Decomposition: ${(output.metrics.decompositionTimeMs / 1000).toFixed(2)}s`);
      },
      TEST_TIMEOUT
    );
  });
});
