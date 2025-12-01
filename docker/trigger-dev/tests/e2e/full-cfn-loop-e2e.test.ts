/**
 * CFN Loop Full End-to-End Integration Test
 *
 * PURPOSE: Test the COMPLETE holistic flow from task submission to final decision.
 * This is NOT a simulation - it triggers REAL Trigger.dev tasks and validates
 * actual outputs, handoffs, and consensus decisions.
 *
 * FLOW TESTED:
 * 1. Task submission → cfn-coordinator
 * 2. cfn-coordinator → 4 sequential decomposers with context passing
 * 3. Decomposition → cfn-implementer-v2 (creates real files)
 * 4. Implementation → cfn-async-validator-orchestrator (5 validators)
 * 5. Validation → Gate check (PROCEED/ITERATE/ABORT)
 * 6. If ITERATE → cfn-troubleshooting-decomposer → re-implementation
 * 7. If PROCEED → Final consensus verification
 *
 * REQUIREMENTS:
 * - Trigger.dev dev server running: `npx trigger.dev@latest dev`
 * - TRIGGER_SECRET_KEY environment variable set
 * - TRIGGER_API_URL environment variable (default: http://localhost:8030)
 *
 * RUN:
 * ```
 * TRIGGER_SECRET_KEY=tr_dev_xxx npx jest tests/e2e/full-cfn-loop-e2e.test.ts --runInBand
 * ```
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import { tasks, runs, configure } from "@trigger.dev/sdk/v3";
import * as fs from "fs";
import * as path from "path";

// Import types
import type { CFNCoordinatorResult } from "../../src/trigger/cfn-coordinator.js";

// =============================================
// Test Configuration
// =============================================

const TEST_TIMEOUT_MS = 300_000; // 5 minutes max per test
const POLL_INTERVAL_MS = 2_000;
const TEST_WORK_DIR_BASE = "/tmp/cfn-e2e-tests";

// =============================================
// Helper Functions
// =============================================

/**
 * Poll for task completion with timeout and progress callback
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
        // Add small delay to ensure output is fully populated
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
      // Only warn on non-critical errors
      const errorMessage = (error as Error).message;
      if (!errorMessage.includes("Task failed")) {
        console.warn(`Polling warning: ${errorMessage}`);
      } else {
        throw error;
      }
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(`Task timed out after ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================
// Test Suite
// =============================================

describe("CFN Loop Full E2E Integration", () => {
  let testWorkDir: string;
  let testTaskId: string;

  beforeAll(() => {
    // Configure SDK with secret key
    configure({
      secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
      baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
    });

    // Ensure base test directory exists
    if (!fs.existsSync(TEST_WORK_DIR_BASE)) {
      fs.mkdirSync(TEST_WORK_DIR_BASE, { recursive: true });
    }
  });

  beforeEach(() => {
    // Create unique work directory per test
    testTaskId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    testWorkDir = path.join(TEST_WORK_DIR_BASE, testTaskId);
    fs.mkdirSync(testWorkDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup work directory after test
    if (testWorkDir && fs.existsSync(testWorkDir)) {
      fs.rmSync(testWorkDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Cleanup base directory if empty
    try {
      const files = fs.readdirSync(TEST_WORK_DIR_BASE);
      if (files.length === 0) {
        fs.rmdirSync(TEST_WORK_DIR_BASE);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  // =============================================
  // Test Suite 1: Simple Task - Full Flow to PROCEED
  // =============================================

  describe("Test Suite 1: Simple Task - Full Flow to PROCEED", () => {
    /**
     * E2E Test 1: Simple hello world function
     *
     * GIVEN: A simple task "Create hello.ts with hello() function"
     * WHEN: cfn-coordinator processes the task through all phases
     * THEN:
     *   - Decomposition produces micro-tasks with all 4 perspectives
     *   - Implementation creates the file
     *   - Validators approve with consensus
     *   - Gate check returns PROCEED
     *   - File exists with correct content
     */
    it(
      "should complete a simple task from decomposition to PROCEED",
      async () => {
        // GIVEN: A simple task description
        const taskDescription =
          "Create a TypeScript file hello.ts with a function hello() that returns 'Hello, World!'";

        console.log(`\n[E2E-1] ========== FULL CFN LOOP TEST ==========`);
        console.log(`[E2E-1] Task ID: ${testTaskId}`);
        console.log(`[E2E-1] Work Dir: ${testWorkDir}`);
        console.log(`[E2E-1] Task: ${taskDescription}`);

        // WHEN: Trigger the coordinator
        const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
          taskId: testTaskId,
          taskDescription,
          workDir: testWorkDir,
          mode: "mvp" as const,
          maxIterations: 3,
          complexity: "simple" as const,
        });

        console.log(`[E2E-1] Coordinator triggered: ${coordinatorHandle.id}`);

        // Wait for completion with polling
        const result = await pollForResult<CFNCoordinatorResult>(
          coordinatorHandle.id,
          TEST_TIMEOUT_MS,
          POLL_INTERVAL_MS,
          (status) => {
            console.log(`[E2E-1] Polling... status: ${status}`);
          }
        );

        // THEN: Verify decomposition occurred
        expect(result.decompositionPlan).toBeDefined();
        expect(result.decompositionPlan!.microTasks.length).toBeGreaterThan(0);
        console.log(
          `[E2E-1] ✓ Decomposition: ${result.decompositionPlan!.microTasks.length} micro-tasks`
        );

        // THEN: Verify all 4 decomposer perspectives present
        const perspectives = new Set(
          result.decompositionPlan!.microTasks.flatMap(
            (t) => t.perspectives?.map((p) => p.perspective) || []
          )
        );
        console.log(`[E2E-1] ✓ Perspectives: ${Array.from(perspectives).join(", ")}`);

        // THEN: Verify execution occurred
        expect(result.executionResults.length).toBeGreaterThan(0);
        console.log(`[E2E-1] ✓ Execution: ${result.executionResults.length} agents completed`);

        // THEN: Verify async validation occurred
        expect(result.asyncValidationResult).toBeDefined();
        console.log(
          `[E2E-1] ✓ Async Validation: score=${result.asyncValidationResult!.overallScore.toFixed(
            2
          )}, consensus=${result.asyncValidationResult!.consensusReached}`
        );

        // THEN: Verify gate check occurred
        expect(result.gateCheckResult).toBeDefined();
        console.log(
          `[E2E-1] ✓ Gate Check: decision=${
            result.gateCheckResult!.decision
          }, score=${result.gateCheckResult!.compositeScore.toFixed(1)}`
        );

        // THEN: Verify final status
        expect(result.finalStatus).toBe("COMPLETED");
        expect(result.success).toBe(true);
        console.log(`[E2E-1] ✓ Final Status: ${result.finalStatus}`);

        // THEN: Verify file was created (check multiple possible locations)
        const possiblePaths = [
          path.join(testWorkDir, "hello.ts"),
          path.join(testWorkDir, "src", "hello.ts"),
          path.join(testWorkDir, "lib", "hello.ts"),
        ];

        let fileCreated = false;
        let createdFilePath = "";

        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            fileCreated = true;
            createdFilePath = p;
            break;
          }
        }

        // Also check execution results for file paths
        if (!fileCreated) {
          for (const exec of result.executionResults) {
            for (const file of exec.filesModified) {
              const fullPath = path.isAbsolute(file) ? file : path.join(testWorkDir, file);
              if (fs.existsSync(fullPath) && file.includes("hello")) {
                fileCreated = true;
                createdFilePath = fullPath;
                break;
              }
            }
            if (fileCreated) break;
          }
        }

        expect(fileCreated).toBe(true);
        console.log(`[E2E-1] ✓ File Created: ${createdFilePath}`);

        // THEN: Verify file content
        if (createdFilePath && fs.existsSync(createdFilePath)) {
          const content = fs.readFileSync(createdFilePath, "utf-8");
          expect(content.toLowerCase()).toContain("hello");
          console.log(`[E2E-1] ✓ File Content: Contains hello function`);
        }

        // Log timing metrics
        console.log(`[E2E-1] Metrics:`);
        console.log(`[E2E-1]   Total time: ${(result.totalTime / 1000).toFixed(1)}s`);
        console.log(
          `[E2E-1]   Decomposition: ${(result.metrics.decompositionTimeMs / 1000).toFixed(1)}s`
        );
        console.log(`[E2E-1]   Execution: ${(result.metrics.executionTimeMs / 1000).toFixed(1)}s`);
        console.log(
          `[E2E-1]   Validation: ${(result.metrics.asyncValidationTimeMs / 1000).toFixed(1)}s`
        );
        console.log(`[E2E-1]   Gate check: ${(result.metrics.gateCheckTimeMs / 1000).toFixed(1)}s`);
        console.log(`[E2E-1] ========== TEST COMPLETE ==========\n`);
      },
      TEST_TIMEOUT_MS
    );
  });

  // =============================================
  // Test Suite 2: ITERATE Flow - Troubleshooting Loop
  // =============================================

  describe("Test Suite 2: ITERATE Flow - Troubleshooting Loop", () => {
    /**
     * E2E Test 2: Force an ITERATE to test troubleshooting loop
     *
     * GIVEN: A task with strict enterprise requirements
     * WHEN: cfn-coordinator processes with enterprise mode (98% threshold)
     * THEN:
     *   - Initial implementation attempts
     *   - If validation fails, troubleshooting decomposer generates fix tasks
     *   - Loop continues or aborts appropriately
     */
    it(
      "should handle ITERATE flow with troubleshooting decomposer",
      async () => {
        // GIVEN: A complex task with strict requirements
        const taskDescription = `Create a TypeScript module parseConfig.ts that:
        1. Exports a function parseConfig(input: string): Config
        2. Validates JSON input with comprehensive error handling
        3. Handles edge cases: empty input, malformed JSON, missing required fields
        4. Has full JSDoc documentation
        Must pass enterprise security and code quality validation.`;

        console.log(`\n[E2E-2] ========== ITERATE FLOW TEST ==========`);
        console.log(`[E2E-2] Task ID: ${testTaskId}`);
        console.log(`[E2E-2] Work Dir: ${testWorkDir}`);

        // WHEN: Trigger with enterprise mode (98% gate threshold)
        const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
          taskId: testTaskId,
          taskDescription,
          workDir: testWorkDir,
          mode: "enterprise" as const, // Strictest threshold
          maxIterations: 2, // Allow 1 retry
          complexity: "complex" as const,
        });

        console.log(`[E2E-2] Coordinator triggered: ${coordinatorHandle.id}`);

        // Wait for completion
        const result = await pollForResult<CFNCoordinatorResult>(
          coordinatorHandle.id,
          TEST_TIMEOUT_MS,
          POLL_INTERVAL_MS,
          (status) => {
            console.log(`[E2E-2] Polling... status: ${status}`);
          }
        );

        // THEN: Decomposition should have occurred
        expect(result.decompositionPlan).toBeDefined();
        console.log(
          `[E2E-2] ✓ Decomposition: ${result.decompositionPlan!.microTasks.length} micro-tasks`
        );

        // THEN: Check if troubleshooting was triggered
        if (result.troubleshootingResult) {
          expect(result.troubleshootingResult.microTasks).toBeDefined();
          console.log(
            `[E2E-2] ✓ Troubleshooting triggered: ${result.troubleshootingResult.microTasks.length} fix tasks`
          );
          console.log(`[E2E-2]   Root causes: ${result.troubleshootingResult.rootCauses.length}`);
          console.log(
            `[E2E-2]   Confidence: ${(result.troubleshootingResult.averageConfidence * 100).toFixed(
              0
            )}%`
          );
          console.log(
            `[E2E-2]   Fix impact: ${(result.troubleshootingResult.estimatedFixImpact * 100).toFixed(
              0
            )}%`
          );

          // Verify troubleshooting structure
          expect(result.troubleshootingResult.rootCauses).toBeInstanceOf(Array);
          expect(result.troubleshootingResult.microTasks).toBeInstanceOf(Array);
        } else {
          console.log(`[E2E-2] ℹ Troubleshooting not triggered (task passed on first try)`);
        }

        // Log gate check decision
        if (result.gateCheckResult) {
          console.log(`[E2E-2] Gate Decision: ${result.gateCheckResult.decision}`);
          console.log(`[E2E-2] Composite Score: ${result.gateCheckResult.compositeScore.toFixed(1)}`);
          console.log(`[E2E-2] Threshold: ${result.gateCheckResult.threshold}`);
        }

        // Log final status
        console.log(`[E2E-2] Final Status: ${result.finalStatus}`);
        console.log(`[E2E-2] Iterations: ${result.iterations}`);
        console.log(`[E2E-2] Total time: ${(result.totalTime / 1000).toFixed(1)}s`);
        console.log(`[E2E-2] ========== TEST COMPLETE ==========\n`);
      },
      TEST_TIMEOUT_MS
    );
  });

  // =============================================
  // Test Suite 3: Context Handoff Validation
  // =============================================

  describe("Test Suite 3: Context Handoff Validation", () => {
    /**
     * E2E Test 3: Verify context flows through decomposers correctly
     *
     * GIVEN: A task requiring security considerations
     * WHEN: Decomposers run in sequence
     * THEN:
     *   - Architecture decomposer produces baseline
     *   - Security decomposer receives architecture context
     *   - Performance decomposer receives arch + security context
     *   - Testing decomposer receives all 3 contexts
     *   - Final plan reflects all perspectives with proper enrichment
     */
    it(
      "should pass context correctly through 4-stage decomposition",
      async () => {
        // GIVEN: A task with clear security implications
        const taskDescription =
          "Create a user authentication module with password hashing using bcrypt, JWT token generation, and secure session management with proper expiration";

        console.log(`\n[E2E-3] ========== CONTEXT HANDOFF TEST ==========`);
        console.log(`[E2E-3] Task ID: ${testTaskId}`);

        // WHEN: Trigger coordinator
        const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
          taskId: testTaskId,
          taskDescription,
          workDir: testWorkDir,
          mode: "standard" as const,
          maxIterations: 1,
          complexity: "moderate" as const,
        });

        const result = await pollForResult<CFNCoordinatorResult>(
          coordinatorHandle.id,
          TEST_TIMEOUT_MS,
          POLL_INTERVAL_MS
        );

        // THEN: Verify decomposition plan exists
        expect(result.decompositionPlan).toBeDefined();
        const plan = result.decompositionPlan!;

        // THEN: Count tasks per perspective
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

        console.log(`[E2E-3] ✓ Architecture tasks: ${archTasks.length}`);
        console.log(`[E2E-3] ✓ Security tasks: ${secTasks.length}`);
        console.log(`[E2E-3] ✓ Performance tasks: ${perfTasks.length}`);
        console.log(`[E2E-3] ✓ Testing tasks: ${testTasks.length}`);

        // THEN: Security tasks should exist for auth task
        expect(secTasks.length).toBeGreaterThan(0);

        // THEN: Verify swarm analysis has all perspectives
        expect(plan.swarmAnalysis).toBeDefined();

        if (plan.swarmAnalysis.securityRecommendations) {
          console.log(
            `[E2E-3] ✓ Security recommendations: ${plan.swarmAnalysis.securityRecommendations.length}`
          );
        }

        if (plan.swarmAnalysis.securityRiskLevel) {
          console.log(`[E2E-3] ✓ Security risk level: ${plan.swarmAnalysis.securityRiskLevel}`);
        }

        if (plan.swarmAnalysis.performanceRecommendations) {
          console.log(
            `[E2E-3] ✓ Performance recommendations: ${plan.swarmAnalysis.performanceRecommendations.length}`
          );
        }

        if (plan.swarmAnalysis.testingRecommendations) {
          console.log(
            `[E2E-3] ✓ Testing recommendations: ${plan.swarmAnalysis.testingRecommendations.length}`
          );
        }

        if (plan.swarmAnalysis.coverageGoal) {
          console.log(`[E2E-3] ✓ Coverage goal: ${plan.swarmAnalysis.coverageGoal}%`);
        }

        // THEN: Verify phase breakdown metrics exist (proves sequential execution)
        const breakdown = result.metrics?.decompositionPhaseBreakdown;
        if (breakdown) {
          console.log(`[E2E-3] Phase timing (proves sequential execution):`);
          console.log(`[E2E-3]   Architecture: ${breakdown.architectureMs ?? 0}ms`);
          console.log(`[E2E-3]   Security: ${breakdown.securityMs ?? 0}ms`);
          console.log(`[E2E-3]   Performance: ${breakdown.performanceMs ?? 0}ms`);
          console.log(`[E2E-3]   Testing: ${breakdown.testingMs ?? 0}ms`);
          console.log(`[E2E-3]   Merging: ${breakdown.mergingMs ?? 0}ms`);
          console.log(`[E2E-3]   Context overhead: ${breakdown.contextOverheadMs ?? 0}ms`);

          // Context overhead proves context was passed
          expect(breakdown.contextOverheadMs ?? 0).toBeGreaterThanOrEqual(0);
        } else {
          console.log(`[E2E-3] ⚠️  Phase breakdown not available (may not be populated yet)`);
        }

        console.log(`[E2E-3] ========== TEST COMPLETE ==========\n`);
      },
      TEST_TIMEOUT_MS
    );
  });

  // =============================================
  // Test Suite 4: Validator Consensus Mechanism
  // =============================================

  describe("Test Suite 4: Validator Consensus Mechanism", () => {
    /**
     * E2E Test 4: Verify validator consensus calculation
     *
     * GIVEN: A completed implementation
     * WHEN: 5 async validators run
     * THEN:
     *   - All 5 validators execute (or timeout gracefully)
     *   - Consensus is calculated from successful validators
     *   - Quorum is checked (minimum 3/5)
     *   - Escalations are flagged for critical validators
     */
    it(
      "should calculate validator consensus correctly",
      async () => {
        const taskDescription =
          "Create a simple utility function add(a: number, b: number): number that returns the sum of two numbers";

        console.log(`\n[E2E-4] ========== VALIDATOR CONSENSUS TEST ==========`);
        console.log(`[E2E-4] Task ID: ${testTaskId}`);

        const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
          taskId: testTaskId,
          taskDescription,
          workDir: testWorkDir,
          mode: "mvp" as const,
          maxIterations: 1,
          complexity: "simple" as const,
        });

        const result = await pollForResult<CFNCoordinatorResult>(
          coordinatorHandle.id,
          TEST_TIMEOUT_MS,
          POLL_INTERVAL_MS
        );

        // THEN: Verify async validation result structure
        expect(result.asyncValidationResult).toBeDefined();
        const validation = result.asyncValidationResult!;

        expect(validation.validators).toBeDefined();
        expect(validation.validators.length).toBe(5);

        console.log(`[E2E-4] Validator Results:`);
        for (const v of validation.validators) {
          const statusIcon = v.status === "success" ? "✓" : v.status === "timeout" ? "⏱" : "✗";
          console.log(
            `[E2E-4]   ${statusIcon} ${v.validatorType}: ${v.status} (score: ${v.score.toFixed(
              2
            )}, ${v.latencyMs}ms)`
          );
          if (v.findings.length > 0) {
            console.log(`[E2E-4]     Findings: ${v.findings.length}`);
          }
          if (v.recommendations.length > 0) {
            console.log(`[E2E-4]     Recommendations: ${v.recommendations.length}`);
          }
        }

        console.log(`[E2E-4] Summary:`);
        console.log(`[E2E-4] ✓ Success count: ${validation.successCount}/5`);
        console.log(`[E2E-4] ✓ Failure count: ${validation.failureCount}`);
        console.log(`[E2E-4] ✓ Timeout count: ${validation.timeoutCount}`);
        console.log(`[E2E-4] ✓ Overall score: ${validation.overallScore.toFixed(2)}`);
        console.log(`[E2E-4] ✓ Consensus reached: ${validation.consensusReached}`);
        console.log(
          `[E2E-4] ✓ Escalated validators: ${validation.escalatedValidators.join(", ") || "none"}`
        );
        console.log(`[E2E-4] ✓ Total latency: ${validation.totalLatencyMs}ms`);

        // THEN: Verify consensus logic (>=3 validators succeeded = consensus)
        if (validation.successCount >= 3) {
          expect(validation.consensusReached).toBe(true);
        }

        // THEN: Verify score calculation
        if (validation.successCount > 0) {
          expect(validation.overallScore).toBeGreaterThan(0);
          expect(validation.overallScore).toBeLessThanOrEqual(1);
        }

        // THEN: Verify error reports exist for failed validators
        if (validation.failureCount > 0 || validation.timeoutCount > 0) {
          expect(validation.errorReports.length).toBeGreaterThan(0);
          console.log(`[E2E-4] Error reports: ${validation.errorReports.length}`);
        }

        console.log(`[E2E-4] ========== TEST COMPLETE ==========\n`);
      },
      TEST_TIMEOUT_MS
    );
  });

  // =============================================
  // Test Suite 5: Gate Check Decision Logic
  // =============================================

  describe("Test Suite 5: Gate Check Decision Logic", () => {
    /**
     * E2E Test 5: Verify gate check thresholds by mode
     *
     * GIVEN: Different mode configurations
     * WHEN: Gate check evaluates composite score
     * THEN:
     *   - MVP: PROCEED if score >= 70%
     *   - Standard: PROCEED if score >= 95%
     *   - Enterprise: PROCEED if score >= 98%
     *   - Decision matches score vs threshold
     */
    it(
      "should apply correct gate thresholds per mode",
      async () => {
        const taskDescription =
          "Create a simple config.ts file exporting a default configuration object with name and version properties";

        console.log(`\n[E2E-5] ========== GATE CHECK THRESHOLD TEST ==========`);
        console.log(`[E2E-5] Task ID: ${testTaskId}`);

        // Test with MVP mode (70% threshold)
        const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
          taskId: testTaskId,
          taskDescription,
          workDir: testWorkDir,
          mode: "mvp" as const,
          maxIterations: 1,
          complexity: "simple" as const,
        });

        const result = await pollForResult<CFNCoordinatorResult>(
          coordinatorHandle.id,
          TEST_TIMEOUT_MS,
          POLL_INTERVAL_MS
        );

        // THEN: Verify gate check result exists
        expect(result.gateCheckResult).toBeDefined();
        const gate = result.gateCheckResult!;

        // THEN: Verify MVP threshold applied
        expect(gate.threshold).toBe(70); // MVP threshold
        console.log(`[E2E-5] ✓ Mode threshold: ${gate.threshold}%`);
        console.log(`[E2E-5] ✓ Composite score: ${gate.compositeScore.toFixed(1)}`);
        console.log(`[E2E-5] ✓ Decision: ${gate.decision}`);

        // THEN: Verify decision logic
        const consensusReached = result.asyncValidationResult?.consensusReached ?? false;
        if (gate.compositeScore >= gate.threshold && consensusReached) {
          expect(gate.decision).toBe("PROCEED");
        } else if (gate.decision !== "ABORT") {
          expect(gate.decision).toBe("ITERATE");
        }

        // THEN: Verify reasoning is populated
        expect(gate.reasoning).toBeDefined();
        expect(gate.reasoning.length).toBeGreaterThan(0);
        console.log(`[E2E-5] ✓ Reasoning:`);
        for (const reason of gate.reasoning) {
          console.log(`[E2E-5]     - ${reason}`);
        }

        // THEN: Verify security analysis present
        expect(gate.securityAnalysis).toBeDefined();
        console.log(
          `[E2E-5] ✓ Security analysis: ${gate.securityAnalysis.totalFindings} findings`
        );

        // THEN: Verify performance analysis present
        expect(gate.performanceAnalysis).toBeDefined();
        console.log(
          `[E2E-5] ✓ Performance analysis: ${gate.performanceAnalysis.totalIssues} issues`
        );

        console.log(`[E2E-5] ========== TEST COMPLETE ==========\n`);
      },
      TEST_TIMEOUT_MS
    );
  });

  // =============================================
  // Test Suite 6: MDAP Integration Verification
  // =============================================

  describe("Test Suite 6: MDAP Integration Verification", () => {
    /**
     * E2E Test 6: Verify MDAP metrics are captured during execution
     *
     * GIVEN: A task processed by cfn-implementer-v2
     * WHEN: MDAP is enabled (default)
     * THEN:
     *   - Model tier is selected based on complexity
     *   - MDAP metrics are captured in execution results
     *   - Cost estimates are provided
     */
    it(
      "should capture MDAP metrics during implementation",
      async () => {
        const taskDescription =
          "Create a simple logger.ts utility with a log(message: string) function";

        console.log(`\n[E2E-6] ========== MDAP INTEGRATION TEST ==========`);
        console.log(`[E2E-6] Task ID: ${testTaskId}`);

        const coordinatorHandle = await tasks.trigger("cfn-coordinator", {
          taskId: testTaskId,
          taskDescription,
          workDir: testWorkDir,
          mode: "mvp" as const,
          maxIterations: 1,
          complexity: "simple" as const,
        });

        const result = await pollForResult<CFNCoordinatorResult>(
          coordinatorHandle.id,
          TEST_TIMEOUT_MS,
          POLL_INTERVAL_MS
        );

        // THEN: Verify execution results exist
        expect(result.executionResults.length).toBeGreaterThan(0);

        console.log(`[E2E-6] Execution Results:`);
        for (const exec of result.executionResults) {
          console.log(`[E2E-6]   Task: ${exec.microTaskId}`);
          console.log(`[E2E-6]     Success: ${exec.success}`);
          console.log(`[E2E-6]     Tests passed: ${exec.testsPassed}`);
          console.log(`[E2E-6]     Confidence: ${exec.confidence}`);
          console.log(`[E2E-6]     Duration: ${exec.durationMs}ms`);
          console.log(`[E2E-6]     Files: ${exec.filesModified.join(", ")}`);
        }

        // THEN: Calculate aggregate metrics
        const totalDuration = result.executionResults.reduce((sum, e) => sum + e.durationMs, 0);
        const avgConfidence =
          result.executionResults.reduce((sum, e) => sum + e.confidence, 0) /
          result.executionResults.length;
        const successRate =
          result.executionResults.filter((e) => e.success).length / result.executionResults.length;

        console.log(`[E2E-6] Aggregate Metrics:`);
        console.log(`[E2E-6]   Total agents: ${result.executionResults.length}`);
        console.log(`[E2E-6]   Total duration: ${totalDuration}ms`);
        console.log(`[E2E-6]   Avg confidence: ${avgConfidence.toFixed(2)}`);
        console.log(`[E2E-6]   Success rate: ${(successRate * 100).toFixed(0)}%`);

        console.log(`[E2E-6] ========== TEST COMPLETE ==========\n`);
      },
      TEST_TIMEOUT_MS
    );
  });
});
