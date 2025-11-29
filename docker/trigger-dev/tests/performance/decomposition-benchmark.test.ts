/**
 * Performance Benchmarking for Sequential Decomposition
 *
 * Tests performance targets from Task 2.4:
 *
 * Decomposition Phase Targets:
 * - Architecture decomposer: <2 seconds (baseline)
 * - Security decomposer: <2.5 seconds (with arch context)
 * - Performance decomposer: <2 seconds (with arch+security)
 * - Testing decomposer: <2 seconds (with all contexts)
 * - Total decomposition: 8.5-10 seconds (all 4 + merging)
 * - Context passing overhead: <1 second total
 *
 * Complete Flow Targets:
 * - Execution phase: ~60 seconds (18+ micro-tasks in parallel)
 * - Gate check: <5 seconds (validate results)
 * - Total task time: <150 seconds (moderate task)
 *
 * Load Test:
 * - 5 VUs for 5 minutes
 * - <1% error rate
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

describe("Decomposition Performance Benchmarks", () => {
  const BENCHMARK_TIMEOUT = 300000; // 5 minutes

  describe("Individual Decomposer Performance", () => {
    it(
      "Benchmark 1: Architecture decomposer <2s",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `bench-arch-${Date.now()}`,
          taskDescription: "Build a microservice for order processing with event sourcing",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        const archTime = output.metrics.decompositionPhaseBreakdown?.architectureMs ?? 0;

        expect(archTime).toBeLessThan(2000);
        console.log(`✓ Architecture: ${(archTime / 1000).toFixed(2)}s < 2.0s`);
      },
      BENCHMARK_TIMEOUT
    );

    it(
      "Benchmark 2: Security decomposer <2.5s (with arch context)",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `bench-sec-${Date.now()}`,
          taskDescription: "Implement OAuth2 authentication with JWT tokens and refresh logic",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        const secTime = output.metrics.decompositionPhaseBreakdown?.securityMs ?? 0;

        expect(secTime).toBeLessThan(2500);
        console.log(`✓ Security: ${(secTime / 1000).toFixed(2)}s < 2.5s`);
      },
      BENCHMARK_TIMEOUT
    );

    it(
      "Benchmark 3: Performance decomposer <2s (with arch+security)",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `bench-perf-${Date.now()}`,
          taskDescription: "Create a caching layer with Redis for high-traffic API endpoints",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        const perfTime = output.metrics.decompositionPhaseBreakdown?.performanceMs ?? 0;

        expect(perfTime).toBeLessThan(2000);
        console.log(`✓ Performance: ${(perfTime / 1000).toFixed(2)}s < 2.0s`);
      },
      BENCHMARK_TIMEOUT
    );

    it(
      "Benchmark 4: Testing decomposer <2s (with all contexts)",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `bench-test-${Date.now()}`,
          taskDescription: "Build comprehensive E2E test suite for checkout flow",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        const testTime = output.metrics.decompositionPhaseBreakdown?.testingMs ?? 0;

        expect(testTime).toBeLessThan(2000);
        console.log(`✓ Testing: ${(testTime / 1000).toFixed(2)}s < 2.0s`);
      },
      BENCHMARK_TIMEOUT
    );
  });

  describe("Total Decomposition Performance", () => {
    it(
      "Benchmark 5: Total decomposition 8.5-10s (all 4 + merging)",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `bench-total-${Date.now()}`,
          taskDescription: "Implement full-stack feature: user profile with avatars, settings, and activity feed",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        const totalDecomp = output.metrics.decompositionTimeMs;

        expect(totalDecomp).toBeGreaterThanOrEqual(8500);
        expect(totalDecomp).toBeLessThanOrEqual(10000);

        console.log(`✓ Total decomposition: ${(totalDecomp / 1000).toFixed(2)}s (8.5-10.0s range)`);
        console.log(`  Architecture: ${(output.metrics.decompositionPhaseBreakdown?.architectureMs ?? 0) / 1000}s`);
        console.log(`  Security: ${(output.metrics.decompositionPhaseBreakdown?.securityMs ?? 0) / 1000}s`);
        console.log(`  Performance: ${(output.metrics.decompositionPhaseBreakdown?.performanceMs ?? 0) / 1000}s`);
        console.log(`  Testing: ${(output.metrics.decompositionPhaseBreakdown?.testingMs ?? 0) / 1000}s`);
        console.log(`  Merging: ${(output.metrics.decompositionPhaseBreakdown?.mergingMs ?? 0) / 1000}s`);
      },
      BENCHMARK_TIMEOUT
    );

    it(
      "Benchmark 6: Context passing overhead <1s total",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `bench-context-${Date.now()}`,
          taskDescription: "Create notification system with email, SMS, and push notification channels",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        const contextOverhead = output.metrics.decompositionPhaseBreakdown?.contextOverheadMs ?? 0;

        expect(contextOverhead).toBeLessThan(1000);
        console.log(`✓ Context overhead: ${(contextOverhead / 1000).toFixed(2)}s < 1.0s`);
      },
      BENCHMARK_TIMEOUT
    );
  });

  describe("Complete Flow Performance", () => {
    it(
      "Benchmark 7: Execution phase ~60s (18+ micro-tasks)",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `bench-exec-${Date.now()}`,
          taskDescription: "Build e-commerce product catalog with search, filters, and recommendations",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        const execTime = output.metrics.executionTimeMs;
        const taskCount = output.executionResults.length;

        // Expect 18+ micro-tasks
        expect(taskCount).toBeGreaterThanOrEqual(18);

        // Execution should be approximately 60 seconds (allow 30-90s range)
        expect(execTime).toBeGreaterThanOrEqual(30000);
        expect(execTime).toBeLessThanOrEqual(90000);

        console.log(`✓ Execution: ${(execTime / 1000).toFixed(2)}s (~60s target)`);
        console.log(`  Micro-tasks: ${taskCount} (18+ target)`);
      },
      BENCHMARK_TIMEOUT
    );

    it(
      "Benchmark 8: Gate check <5s",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `bench-gate-${Date.now()}`,
          taskDescription: "Implement admin dashboard with analytics, user management, and reports",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const output = result.output as CFNCoordinatorResult;

        const gateTime = output.metrics.gateCheckTimeMs;

        expect(gateTime).toBeLessThan(5000);
        console.log(`✓ Gate check: ${(gateTime / 1000).toFixed(2)}s < 5.0s`);
      },
      BENCHMARK_TIMEOUT
    );

    it(
      "Benchmark 9: Total task time <150s (moderate task)",
      async () => {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `bench-total-task-${Date.now()}`,
          taskDescription: "Build real-time chat application with rooms, direct messages, and file sharing",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const startTime = Date.now();
        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        const wallClockTime = Date.now() - startTime;
        const output = result.output as CFNCoordinatorResult;

        expect(wallClockTime).toBeLessThan(150000);

        console.log(`✓ Total task time: ${(wallClockTime / 1000).toFixed(2)}s < 150s`);
        console.log(`  Breakdown:`);
        console.log(`    Decomposition: ${(output.metrics.decompositionTimeMs / 1000).toFixed(2)}s`);
        console.log(`    Execution: ${(output.metrics.executionTimeMs / 1000).toFixed(2)}s`);
        console.log(`    Gate check: ${(output.metrics.gateCheckTimeMs / 1000).toFixed(2)}s`);
        console.log(`    Validation: ${(output.metrics.validationTimeMs / 1000).toFixed(2)}s`);
      },
      BENCHMARK_TIMEOUT
    );
  });

  describe("Load Testing", () => {
    it(
      "Load test: 5 concurrent tasks with <1% error rate",
      async () => {
        console.log("Starting load test: 5 VUs...");

        // Spawn 5 concurrent coordinator tasks
        const handles = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            tasks.trigger("cfn-coordinator", {
              taskId: `load-test-${Date.now()}-vu${i}`,
              taskDescription: `Load test task ${i + 1}: Build a feature-rich dashboard`,
              workDir: "/tmp/bench",
              mode: "mvp" as const,
              maxIterations: 1,
              complexity: "simple" as const,
            })
          )
        );

        console.log(`Spawned ${handles.length} tasks, waiting for completion...`);

        // Poll all tasks to completion
        const results = await Promise.all(
          handles.map((handle) => runs.poll(handle.id, { pollIntervalMs: 2000 }))
        );

        const outputs = results.map((r) => r.output as CFNCoordinatorResult);

        // Calculate error rate
        const failedCount = outputs.filter((o) => o.finalStatus === "FAILED" || o.finalStatus === "ABORTED").length;
        const errorRate = failedCount / outputs.length;

        expect(errorRate).toBeLessThan(0.01); // <1%

        console.log(`✓ Load test complete: ${failedCount}/${outputs.length} failed (${(errorRate * 100).toFixed(2)}% error rate)`);
        console.log(`  Average time: ${(outputs.reduce((sum, o) => sum + o.totalTime, 0) / outputs.length / 1000).toFixed(2)}s`);
      },
      BENCHMARK_TIMEOUT
    );

    it(
      "Stress test: Sustained load for 5 minutes",
      async () => {
        console.log("Starting stress test: 5 minutes of sustained load...");

        const testDuration = 5 * 60 * 1000; // 5 minutes
        const startTime = Date.now();
        let completedTasks = 0;
        let failedTasks = 0;

        // Spawn tasks every 60 seconds for 5 minutes
        while (Date.now() - startTime < testDuration) {
          const handle = await tasks.trigger("cfn-coordinator", {
            taskId: `stress-test-${Date.now()}`,
            taskDescription: "Stress test task: Implement a simple feature",
            workDir: "/tmp/bench",
            mode: "mvp" as const,
            maxIterations: 1,
            complexity: "simple" as const,
          });

          // Don't wait for completion, just track
          runs.poll(handle.id, { pollIntervalMs: 5000 }).then((result) => {
            const output = result.output as CFNCoordinatorResult;
            if (output.finalStatus === "COMPLETED") {
              completedTasks++;
            } else {
              failedTasks++;
            }
          });

          // Wait 60 seconds before spawning next task
          await new Promise((resolve) => setTimeout(resolve, 60000));
        }

        // Wait for all remaining tasks to complete
        await new Promise((resolve) => setTimeout(resolve, 30000));

        const totalTasks = completedTasks + failedTasks;
        const errorRate = failedTasks / totalTasks;

        expect(errorRate).toBeLessThan(0.01);

        console.log(`✓ Stress test complete:`);
        console.log(`  Duration: 5 minutes`);
        console.log(`  Total tasks: ${totalTasks}`);
        console.log(`  Failed: ${failedTasks} (${(errorRate * 100).toFixed(2)}%)`);
      },
      BENCHMARK_TIMEOUT
    );
  });

  describe("Performance Regression Detection", () => {
    it("should detect performance regressions", async () => {
      // Run 3 identical tasks and verify consistency
      const results: CFNCoordinatorResult[] = [];

      for (let i = 0; i < 3; i++) {
        const handle = await tasks.trigger("cfn-coordinator", {
          taskId: `regression-${Date.now()}-${i}`,
          taskDescription: "Build a standard CRUD interface for blog posts",
          workDir: "/tmp/bench",
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
        results.push(result.output as CFNCoordinatorResult);
      }

      // Calculate variance in decomposition time
      const decompTimes = results.map((r) => r.metrics.decompositionTimeMs);
      const avgDecompTime = decompTimes.reduce((sum, t) => sum + t, 0) / decompTimes.length;
      const variance = decompTimes.reduce((sum, t) => sum + Math.pow(t - avgDecompTime, 2), 0) / decompTimes.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / avgDecompTime;

      // Coefficient of variation should be <0.15 (15% variance)
      expect(coefficientOfVariation).toBeLessThan(0.15);

      console.log(`✓ Performance consistency verified:`);
      console.log(`  Avg decomposition: ${(avgDecompTime / 1000).toFixed(2)}s`);
      console.log(`  Std dev: ${(stdDev / 1000).toFixed(2)}s`);
      console.log(`  Coefficient of variation: ${(coefficientOfVariation * 100).toFixed(1)}%`);
    }, BENCHMARK_TIMEOUT * 3);
  });
});
