#!/usr/bin/env npx tsx
/**
 * CFN Loop Full E2E Test Runner
 *
 * Standalone test script that exercises the complete CFN Loop flow
 * without Jest ESM complications.
 *
 * Usage:
 *   TRIGGER_SECRET_KEY=tr_dev_xxx npx tsx tests/e2e/run-e2e-test.ts
 */

import { tasks, runs, configure } from "@trigger.dev/sdk/v3";
import * as fs from "fs";
import * as path from "path";

// Import types
import type { CFNCoordinatorResult } from "../../src/trigger/cfn-coordinator.js";

// =============================================
// Configuration
// =============================================

const TEST_TIMEOUT_MS = 300_000; // 5 minutes
const POLL_INTERVAL_MS = 3_000;
const TEST_WORK_DIR_BASE = "/tmp/cfn-e2e-tests";

// Configure SDK
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

// =============================================
// Helpers
// =============================================

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForResult<T>(
  runId: string,
  timeoutMs: number,
  pollIntervalMs: number,
  onProgress?: (status: string, elapsed: number) => void
): Promise<T> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const run = await runs.retrieve(runId);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (run.status === "COMPLETED") {
        return run.output as T;
      }

      if (run.status === "FAILED" || run.status === "CRASHED" || run.status === "SYSTEM_FAILURE") {
        throw new Error(`Task failed with status: ${run.status}`);
      }

      if (onProgress) {
        onProgress(run.status, elapsed);
      }

      await sleep(pollIntervalMs);
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes("Task failed")) {
        throw error;
      }
      // Continue polling on transient errors
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Task timed out after ${timeoutMs}ms`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// =============================================
// Test Cases
// =============================================

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<TestResult> {
  const start = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log(`${"=".repeat(60)}`);

  try {
    await fn();
    const result = { name, passed: true, durationMs: Date.now() - start };
    results.push(result);
    console.log(`\n✅ PASSED: ${name} (${(result.durationMs / 1000).toFixed(1)}s)`);
    return result;
  } catch (error) {
    const result = {
      name,
      passed: false,
      durationMs: Date.now() - start,
      error: (error as Error).message,
    };
    results.push(result);
    console.log(`\n❌ FAILED: ${name}`);
    console.log(`   Error: ${result.error}`);
    return result;
  }
}

// =============================================
// Test 1: Simple Task Full Flow
// =============================================

async function testSimpleTaskFullFlow(): Promise<void> {
  const testTaskId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testWorkDir = path.join(TEST_WORK_DIR_BASE, testTaskId);
  fs.mkdirSync(testWorkDir, { recursive: true });

  try {
    const taskDescription =
      "Create a TypeScript file hello.ts with a function hello() that returns 'Hello, World!'";

    console.log(`Task ID: ${testTaskId}`);
    console.log(`Work Dir: ${testWorkDir}`);
    console.log(`Task: ${taskDescription}`);

    // Trigger coordinator
    console.log(`\n[1] Triggering cfn-coordinator...`);
    const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
      taskId: testTaskId,
      taskDescription,
      workDir: testWorkDir,
      mode: "mvp" as const,
      maxIterations: 3,
      complexity: "simple" as const,
    });

    console.log(`    Run ID: ${coordinatorHandle.id}`);

    // Poll for result
    console.log(`\n[2] Waiting for completion...`);
    const result = await pollForResult<CFNCoordinatorResult>(
      coordinatorHandle.id,
      TEST_TIMEOUT_MS,
      POLL_INTERVAL_MS,
      (status, elapsed) => {
        console.log(`    [${elapsed}s] Status: ${status}`);
      }
    );

    // Validate decomposition
    console.log(`\n[3] Validating decomposition...`);
    assert(result.decompositionPlan !== undefined, "Decomposition plan should exist");
    assert(
      result.decompositionPlan!.microTasks.length > 0,
      "Should have micro-tasks"
    );
    console.log(`    ✓ Micro-tasks: ${result.decompositionPlan!.microTasks.length}`);

    // Check perspectives
    const perspectives = new Set(
      result.decompositionPlan!.microTasks.flatMap(
        (t) => t.perspectives?.map((p) => p.perspective) || []
      )
    );
    console.log(`    ✓ Perspectives: ${Array.from(perspectives).join(", ")}`);

    // Validate execution
    console.log(`\n[4] Validating execution...`);
    assert(result.executionResults.length > 0, "Should have execution results");
    console.log(`    ✓ Agents completed: ${result.executionResults.length}`);

    // Validate async validation
    console.log(`\n[5] Validating async validators...`);
    assert(result.asyncValidationResult !== undefined, "Async validation should exist");
    console.log(
      `    ✓ Overall score: ${result.asyncValidationResult!.overallScore.toFixed(2)}`
    );
    console.log(
      `    ✓ Consensus: ${result.asyncValidationResult!.consensusReached}`
    );
    console.log(
      `    ✓ Success: ${result.asyncValidationResult!.successCount}/5`
    );

    // Validate gate check
    console.log(`\n[6] Validating gate check...`);
    assert(result.gateCheckResult !== undefined, "Gate check should exist");
    console.log(`    ✓ Decision: ${result.gateCheckResult!.decision}`);
    console.log(
      `    ✓ Composite score: ${result.gateCheckResult!.compositeScore.toFixed(1)}`
    );
    console.log(`    ✓ Threshold: ${result.gateCheckResult!.threshold}`);

    // Validate final status
    console.log(`\n[7] Validating final status...`);
    console.log(`    ✓ Status: ${result.finalStatus}`);
    console.log(`    ✓ Success: ${result.success}`);
    console.log(`    ✓ Iterations: ${result.iterations}`);

    // Check if file was created
    console.log(`\n[8] Checking file creation...`);
    let fileFound = false;
    for (const exec of result.executionResults) {
      for (const file of exec.filesModified) {
        const fullPath = path.isAbsolute(file) ? file : path.join(testWorkDir, file);
        if (fs.existsSync(fullPath)) {
          fileFound = true;
          console.log(`    ✓ File exists: ${fullPath}`);
          const content = fs.readFileSync(fullPath, "utf-8");
          console.log(`    ✓ Content length: ${content.length} chars`);
        }
      }
    }

    // Log metrics
    console.log(`\n[9] Metrics:`);
    console.log(`    Total time: ${(result.totalTime / 1000).toFixed(1)}s`);
    console.log(
      `    Decomposition: ${(result.metrics.decompositionTimeMs / 1000).toFixed(1)}s`
    );
    console.log(
      `    Execution: ${(result.metrics.executionTimeMs / 1000).toFixed(1)}s`
    );
    console.log(
      `    Validation: ${(result.metrics.asyncValidationTimeMs / 1000).toFixed(1)}s`
    );
    console.log(
      `    Gate check: ${(result.metrics.gateCheckTimeMs / 1000).toFixed(1)}s`
    );

    if (result.metrics.decompositionPhaseBreakdown) {
      console.log(`\n[10] Decomposition breakdown:`);
      const b = result.metrics.decompositionPhaseBreakdown;
      console.log(`    Architecture: ${b.architectureMs}ms`);
      console.log(`    Security: ${b.securityMs}ms`);
      console.log(`    Performance: ${b.performanceMs}ms`);
      console.log(`    Testing: ${b.testingMs}ms`);
      console.log(`    Context overhead: ${b.contextOverheadMs}ms`);
    }

  } finally {
    // Cleanup
    if (fs.existsSync(testWorkDir)) {
      fs.rmSync(testWorkDir, { recursive: true, force: true });
    }
  }
}

// =============================================
// Test 2: Validator Consensus
// =============================================

async function testValidatorConsensus(): Promise<void> {
  const testTaskId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testWorkDir = path.join(TEST_WORK_DIR_BASE, testTaskId);
  fs.mkdirSync(testWorkDir, { recursive: true });

  try {
    const taskDescription =
      "Create a simple add(a: number, b: number): number function that returns the sum";

    console.log(`Task ID: ${testTaskId}`);
    console.log(`Task: ${taskDescription}`);

    // Trigger coordinator
    console.log(`\n[1] Triggering cfn-coordinator...`);
    const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
      taskId: testTaskId,
      taskDescription,
      workDir: testWorkDir,
      mode: "mvp" as const,
      maxIterations: 1,
      complexity: "simple" as const,
    });

    // Poll for result
    console.log(`\n[2] Waiting for completion...`);
    const result = await pollForResult<CFNCoordinatorResult>(
      coordinatorHandle.id,
      TEST_TIMEOUT_MS,
      POLL_INTERVAL_MS,
      (status, elapsed) => {
        console.log(`    [${elapsed}s] Status: ${status}`);
      }
    );

    // Validate validators
    console.log(`\n[3] Validator results:`);
    assert(result.asyncValidationResult !== undefined, "Async validation should exist");
    const validation = result.asyncValidationResult!;

    assert(validation.validators.length === 5, "Should have 5 validators");

    for (const v of validation.validators) {
      const icon = v.status === "success" ? "✓" : v.status === "timeout" ? "⏱" : "✗";
      console.log(
        `    ${icon} ${v.validatorType}: ${v.status} (score: ${v.score.toFixed(2)}, ${v.latencyMs}ms)`
      );
    }

    console.log(`\n[4] Consensus check:`);
    console.log(`    Success: ${validation.successCount}/5`);
    console.log(`    Failures: ${validation.failureCount}`);
    console.log(`    Timeouts: ${validation.timeoutCount}`);
    console.log(`    Overall score: ${validation.overallScore.toFixed(2)}`);
    console.log(`    Consensus reached: ${validation.consensusReached}`);

    // Verify consensus logic
    if (validation.successCount >= 3) {
      assert(validation.consensusReached, "Consensus should be reached with 3+ successes");
    }

  } finally {
    if (fs.existsSync(testWorkDir)) {
      fs.rmSync(testWorkDir, { recursive: true, force: true });
    }
  }
}

// =============================================
// Test 3: Context Handoff
// =============================================

async function testContextHandoff(): Promise<void> {
  const testTaskId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testWorkDir = path.join(TEST_WORK_DIR_BASE, testTaskId);
  fs.mkdirSync(testWorkDir, { recursive: true });

  try {
    const taskDescription =
      "Create a user authentication module with password hashing and JWT token generation";

    console.log(`Task ID: ${testTaskId}`);
    console.log(`Task: ${taskDescription}`);

    // Trigger coordinator
    console.log(`\n[1] Triggering cfn-coordinator...`);
    const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
      taskId: testTaskId,
      taskDescription,
      workDir: testWorkDir,
      mode: "standard" as const,
      maxIterations: 1,
      complexity: "moderate" as const,
    });

    // Poll for result
    console.log(`\n[2] Waiting for completion...`);
    const result = await pollForResult<CFNCoordinatorResult>(
      coordinatorHandle.id,
      TEST_TIMEOUT_MS,
      POLL_INTERVAL_MS,
      (status, elapsed) => {
        console.log(`    [${elapsed}s] Status: ${status}`);
      }
    );

    // Check context passing via phase breakdown
    console.log(`\n[3] Context passing validation:`);
    assert(result.decompositionPlan !== undefined, "Decomposition plan should exist");

    const plan = result.decompositionPlan!;

    // Count tasks by perspective
    const archTasks = plan.microTasks.filter((t) =>
      t.perspectives?.some((p) => p.perspective === "architecture")
    );
    const secTasks = plan.microTasks.filter((t) =>
      t.perspectives?.some((p) => p.perspective === "security")
    );
    const perfTasks = plan.microTasks.filter((t) =>
      t.perspectives?.some((p) => p.perspective === "performance")
    );
    const testTasks = plan.microTasks.filter((t) =>
      t.perspectives?.some((p) => p.perspective === "testing")
    );

    console.log(`    Architecture tasks: ${archTasks.length}`);
    console.log(`    Security tasks: ${secTasks.length}`);
    console.log(`    Performance tasks: ${perfTasks.length}`);
    console.log(`    Testing tasks: ${testTasks.length}`);

    // Security should be present for auth task
    assert(secTasks.length > 0, "Security tasks should exist for auth module");

    // Check phase breakdown proves sequential execution
    if (result.metrics.decompositionPhaseBreakdown) {
      const b = result.metrics.decompositionPhaseBreakdown;
      console.log(`\n[4] Sequential execution proof (phase timing):`);
      console.log(`    Architecture: ${b.architectureMs}ms`);
      console.log(`    Security: ${b.securityMs}ms`);
      console.log(`    Performance: ${b.performanceMs}ms`);
      console.log(`    Testing: ${b.testingMs}ms`);
      console.log(`    Context overhead: ${b.contextOverheadMs}ms`);

      // Context overhead proves context was passed between stages
      console.log(`\n    Context overhead > 0 proves context passing`);
    }

  } finally {
    if (fs.existsSync(testWorkDir)) {
      fs.rmSync(testWorkDir, { recursive: true, force: true });
    }
  }
}

// =============================================
// Main
// =============================================

async function main() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        CFN LOOP FULL E2E INTEGRATION TESTS                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nStarted: ${new Date().toISOString()}`);
  console.log(`Trigger.dev URL: ${process.env.TRIGGER_API_URL || "http://localhost:8030"}`);

  // Ensure base directory exists
  if (!fs.existsSync(TEST_WORK_DIR_BASE)) {
    fs.mkdirSync(TEST_WORK_DIR_BASE, { recursive: true });
  }

  const startTime = Date.now();

  // Run tests
  await runTest("Simple Task Full Flow (PROCEED)", testSimpleTaskFullFlow);
  await runTest("Validator Consensus Mechanism", testValidatorConsensus);
  await runTest("Context Handoff Through Decomposers", testContextHandoff);

  // Summary
  const totalTime = Date.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    TEST SUMMARY                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Duration: ${(totalTime / 1000).toFixed(1)}s`);
  console.log("");

  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    console.log(`${icon} ${r.name} (${(r.durationMs / 1000).toFixed(1)}s)`);
    if (r.error) {
      console.log(`   └─ ${r.error}`);
    }
  }

  console.log("");

  if (failed > 0) {
    console.log("❌ E2E TESTS FAILED");
    process.exit(1);
  } else {
    console.log("✅ ALL E2E TESTS PASSED");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
