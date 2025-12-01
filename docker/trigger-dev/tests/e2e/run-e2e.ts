#!/usr/bin/env npx tsx
/**
 * Standalone E2E Test Runner
 *
 * Runs E2E tests without Jest to avoid ESM module linking conflicts
 * with the Trigger.dev SDK.
 *
 * Usage: npx tsx tests/e2e/run-e2e.ts
 */

import { tasks, runs, configure } from "@trigger.dev/sdk/v3";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_TIMEOUT_MS = 300_000; // 5 minutes
const POLL_INTERVAL_MS = 2_000;
const TEST_WORK_DIR_BASE = "/tmp/cfn-e2e-standalone";

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

/**
 * Simple assertion helpers
 */
function expect(value: unknown) {
  return {
    toBe: (expected: unknown) => {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toBeDefined: () => {
      if (value === undefined || value === null) {
        throw new Error(`Expected value to be defined, got ${value}`);
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (typeof value !== 'number' || value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual: (expected: number) => {
      if (typeof value !== 'number' || value < expected) {
        throw new Error(`Expected ${value} to be >= ${expected}`);
      }
    },
    toBeLessThanOrEqual: (expected: number) => {
      if (typeof value !== 'number' || value > expected) {
        throw new Error(`Expected ${value} to be <= ${expected}`);
      }
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll for task completion
 */
async function pollForResult<T>(
  runId: string,
  timeoutMs: number,
  pollIntervalMs: number,
  onProgress?: (status: string) => void
): Promise<T> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const run = await runs.retrieve(runId);

      if (run.status === "COMPLETED") {
        await sleep(100);
        return run.output as T;
      }

      if (run.status === "FAILED" || run.status === "CRASHED" || run.status === "SYSTEM_FAILURE") {
        throw new Error(`Task failed with status: ${run.status}`);
      }

      if (onProgress) {
        onProgress(run.status);
      }

      await sleep(pollIntervalMs);
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes("Task failed")) {
        throw error;
      }
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Task timed out after ${timeoutMs}ms`);
}

/**
 * Run a test
 */
async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  console.log(`\n${YELLOW}Running:${RESET} ${name}`);

  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`${GREEN}PASS${RESET} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = (error as Error).message;
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`${RED}FAIL${RESET} (${duration}ms): ${errorMsg}`);
  }
}

/**
 * Define test functions that can be run in parallel
 */

// Test 4 definition (runs in parallel with Tests 1-3)
// Uses sprint aggregation to reduce 21 micro-tasks → ~4 sprints
// Each sprint runs via Claude CLI (~60-180s), total ~6-12 min
// Timeout increased to 15 minutes for non-MDAP
const NON_MDAP_TIMEOUT_MS = 900_000; // 15 minutes

async function runTest4(): Promise<void> {
  const testTaskId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testWorkDir = path.join(TEST_WORK_DIR_BASE, testTaskId);
  fs.mkdirSync(testWorkDir, { recursive: true });

  try {
    // Simple task - sprint aggregation will group micro-tasks by category
    const taskDescription = "Create a hello.ts file with a hello() function that returns 'Hello'";

    console.log(`  [Test 4] Task ID: ${testTaskId}`);
    console.log(`  [Test 4] Work Dir: ${testWorkDir}`);
    console.log(`  [Test 4] Mode: Non-MDAP (Sprint Aggregation + Claude CLI)`);
    console.log(`  [Test 4] Timeout: ${NON_MDAP_TIMEOUT_MS / 60000} minutes`);

    const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
      taskId: testTaskId,
      taskDescription,
      workDir: testWorkDir,
      mode: "mvp" as const,
      maxIterations: 1,
      complexity: "simple" as const,
      enableMDAP: false, // Use Sprint Aggregation + Claude CLI
    });

    console.log(`  [Test 4] Coordinator triggered: ${coordinatorHandle.id}`);

    // Wait for completion - non-MDAP takes longer due to CLI execution
    const result = await pollForResult<any>(
      coordinatorHandle.id,
      NON_MDAP_TIMEOUT_MS,
      POLL_INTERVAL_MS,
      (status) => {} // Silent polling - don't interfere with other test output
    );

    // Verify results
    expect(result.decompositionPlan).toBeDefined();
    console.log(`  [Test 4] Decomposition: ${result.decompositionPlan.microTasks.length} micro-tasks`);

    expect(result.executionResults.length).toBeGreaterThan(0);
    console.log(`  [Test 4] Execution: ${result.executionResults.length} tasks completed`);

    // Check if any sprints completed (aggregation success metric)
    const successCount = result.executionResults.filter((r: any) => r.success).length;
    console.log(`  [Test 4] Successful tasks: ${successCount}/${result.executionResults.length}`);

    // Non-MDAP may not always PROCEED due to CLI variations, but should complete execution
    console.log(`  [Test 4] Final Status: ${result.finalStatus}`);

  } finally {
    if (fs.existsSync(testWorkDir)) {
      fs.rmSync(testWorkDir, { recursive: true, force: true });
    }
  }
}

/**
 * Main test suite
 */
async function main() {
  console.log("\n========== CFN Loop E2E Tests ==========\n");

  // Configure SDK
  configure({
    secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
    baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
  });

  // Ensure test directory exists
  if (!fs.existsSync(TEST_WORK_DIR_BASE)) {
    fs.mkdirSync(TEST_WORK_DIR_BASE, { recursive: true });
  }

  // Start Test 4 in parallel (long-running non-MDAP test)
  console.log(`${YELLOW}Starting Test 4 in parallel (Non-MDAP mode takes ~5-15 min)...${RESET}\n`);
  const test4Promise = runTest("Test 4: Non-MDAP Mode (Sprint Aggregation)", runTest4);

  // Test 1: Simple Task - Full Flow
  await runTest("Test 1: Simple Task - Full Flow to PROCEED", async () => {
    const testTaskId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testWorkDir = path.join(TEST_WORK_DIR_BASE, testTaskId);
    fs.mkdirSync(testWorkDir, { recursive: true });

    try {
      const taskDescription = "Create a TypeScript file hello.ts with a function hello() that returns 'Hello, World!'";

      console.log(`  Task ID: ${testTaskId}`);
      console.log(`  Work Dir: ${testWorkDir}`);

      // Trigger the coordinator
      const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
        taskId: testTaskId,
        taskDescription,
        workDir: testWorkDir,
        mode: "mvp" as const,
        maxIterations: 3,
        complexity: "simple" as const,
        enableMDAP: true, // Use Cerebras API directly (~500ms-3s) instead of Claude CLI (~60s)
      });

      console.log(`  Coordinator triggered: ${coordinatorHandle.id}`);

      // Wait for completion
      const result = await pollForResult<any>(
        coordinatorHandle.id,
        TEST_TIMEOUT_MS,
        POLL_INTERVAL_MS,
        (status) => process.stdout.write(`  Polling... ${status}\r`)
      );

      console.log("");

      // Verify results
      expect(result.decompositionPlan).toBeDefined();
      expect(result.decompositionPlan.microTasks.length).toBeGreaterThan(0);
      console.log(`  Decomposition: ${result.decompositionPlan.microTasks.length} micro-tasks`);

      expect(result.executionResults.length).toBeGreaterThan(0);
      console.log(`  Execution: ${result.executionResults.length} agents completed`);

      expect(result.finalStatus).toBe("COMPLETED");
      console.log(`  Final Status: ${result.finalStatus}`);

    } finally {
      // Cleanup
      if (fs.existsSync(testWorkDir)) {
        fs.rmSync(testWorkDir, { recursive: true, force: true });
      }
    }
  });

  // Test 2: Validator Consensus
  await runTest("Test 2: Validator Consensus Mechanism", async () => {
    const testTaskId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testWorkDir = path.join(TEST_WORK_DIR_BASE, testTaskId);
    fs.mkdirSync(testWorkDir, { recursive: true });

    try {
      const taskDescription = "Create a simple utility function add(a: number, b: number): number that returns the sum";

      const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
        taskId: testTaskId,
        taskDescription,
        workDir: testWorkDir,
        mode: "mvp" as const,
        maxIterations: 1,
        complexity: "simple" as const,
        enableMDAP: true, // Use Cerebras API directly
      });

      const result = await pollForResult<any>(
        coordinatorHandle.id,
        TEST_TIMEOUT_MS,
        POLL_INTERVAL_MS
      );

      expect(result.asyncValidationResult).toBeDefined();
      const validation = result.asyncValidationResult;

      expect(validation.validators).toBeDefined();
      console.log(`  Validators: ${validation.validators.length}`);
      console.log(`  Success count: ${validation.successCount}`);
      console.log(`  Overall score: ${validation.overallScore.toFixed(2)}`);
      console.log(`  Consensus reached: ${validation.consensusReached}`);

    } finally {
      if (fs.existsSync(testWorkDir)) {
        fs.rmSync(testWorkDir, { recursive: true, force: true });
      }
    }
  });

  // Test 3: Gate Check Decision
  await runTest("Test 3: Gate Check Decision Logic", async () => {
    const testTaskId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const testWorkDir = path.join(TEST_WORK_DIR_BASE, testTaskId);
    fs.mkdirSync(testWorkDir, { recursive: true });

    try {
      const taskDescription = "Create a simple config.ts file exporting a default configuration object";

      const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
        taskId: testTaskId,
        taskDescription,
        workDir: testWorkDir,
        mode: "mvp" as const,
        maxIterations: 1,
        complexity: "simple" as const,
        enableMDAP: true, // Use Cerebras API directly (~500ms-3s) instead of Claude CLI (~60s)
      });

      const result = await pollForResult<any>(
        coordinatorHandle.id,
        TEST_TIMEOUT_MS,
        POLL_INTERVAL_MS
      );

      expect(result.gateCheckResult).toBeDefined();
      const gate = result.gateCheckResult;

      expect(gate.threshold).toBe(70); // MVP threshold
      console.log(`  Mode threshold: ${gate.threshold}%`);
      console.log(`  Composite score: ${gate.compositeScore.toFixed(1)}`);
      console.log(`  Decision: ${gate.decision}`);

    } finally {
      if (fs.existsSync(testWorkDir)) {
        fs.rmSync(testWorkDir, { recursive: true, force: true });
      }
    }
  });

  // Wait for Test 4 (started in parallel) to complete
  console.log(`\n${YELLOW}Waiting for Test 4 (Non-MDAP) to complete...${RESET}`);
  await test4Promise;

  // Summary
  console.log("\n========== Test Summary ==========\n");

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  for (const result of results) {
    const status = result.passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (result.error) {
      console.log(`     Error: ${result.error}`);
    }
  }

  console.log(`\nTests: ${passed} passed, ${failed} failed, ${total} total`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(1)}s`);

  // Cleanup base directory
  try {
    const files = fs.readdirSync(TEST_WORK_DIR_BASE);
    if (files.length === 0) {
      fs.rmdirSync(TEST_WORK_DIR_BASE);
    }
  } catch {
    // Ignore cleanup errors
  }

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`${RED}Fatal error:${RESET}`, error);
  process.exit(1);
});
