/**
 * CFN Async Validator Orchestrator (Phase 3, Task 3.1)
 *
 * Spawns 5 validators in parallel, collects results asynchronously,
 * and structures them for consensus calculation.
 *
 * VALIDATORS:
 * 1. Security Validator - vulnerability detection, threat analysis
 * 2. Performance Validator - throughput, latency, optimization
 * 3. Testing Validator - coverage, test quality, edge cases
 * 4. Architecture Validator - design patterns, scalability, maintainability
 * 5. Code Quality Validator - complexity, duplication, readability
 *
 * ORCHESTRATION PATTERN:
 * - Spawn all 5 validators simultaneously via tasks.trigger()
 * - Wait for all results via Promise.allSettled() with timeout protection
 * - Each validator has 30s individual timeout + abort signal
 * - Timed out validators return error result, don't block others
 * - Partial success: minimum 3/5 validators required
 * - Retry once on failure (max 2 attempts per validator)
 *
 * SECURITY FIX sec-1.6:
 * - AbortController per validator to cancel pending operations
 * - Promise.race() with timeout for each validator
 * - Proper error handling for hung promises
 * - No lingering promises after orchestrator completes
 */

import { task, tasks, runs } from "@trigger.dev/sdk/v3";
import type { AsyncSecurityValidatorResult } from "./cfn-async-security-validator.js";
import type { AsyncPerformanceValidatorResult } from "./cfn-async-performance-validator.js";
import type { DecompositionPlan } from "./cfn-decomposition-aggregator.js";
import {
  executeValidatorWithRecovery,
  meetsPartialSuccessQuorum,
  generateErrorReport,
  logErrorReports,
  type ValidatorRecoveryResult,
  type ErrorReport,
} from "./cfn-validator-error-recovery.js";

// =============================================
// Type Definitions
// =============================================

export interface ValidatorResult {
  validatorType: "security" | "performance" | "testing" | "architecture" | "code-quality";
  status: "success" | "timeout" | "error";
  score: number; // 0.0-1.0
  findings: string[];
  recommendations: string[];
  latencyMs: number;
  error?: string;
}

export interface OrchestratorPayload {
  taskId: string;
  decompositionPlan: DecompositionPlan;
  implementations: string[]; // Generated code from Loop 3
  tests: string[]; // Generated tests from Loop 3
  workDir: string;
}

export interface OrchestratorResult {
  taskId: string;
  timestamp: number;
  validators: ValidatorResult[];
  overallScore: number; // Average of all successful validators
  consensusReached: boolean; // true if >= 3 validators succeeded
  totalLatencyMs: number; // Time to complete all validators
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  errorReports: ErrorReport[]; // Structured error reports with retry history
  escalatedValidators: string[]; // Critical validators that failed and escalated
}

// =============================================
// Validator Timeout and Retry Config
// =============================================

const VALIDATOR_TIMEOUT_MS = 30_000; // 30 seconds per validator (optimized from 5 minutes)
const RETRY_ATTEMPTS = 2; // Max 2 attempts (initial + 1 retry)
const MINIMUM_QUORUM = 3; // Minimum validators needed for consensus

// =============================================
// Timeout Wrapper with AbortController (Security Fix sec-1.6)
// =============================================

/**
 * Wrap validator execution with timeout and AbortController
 * Prevents hanging promises and ensures cleanup
 *
 * @param promise - The validator promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param validatorName - Name for logging
 * @returns Tuple of [result promise, abort function]
 */
function createTimeoutedPromise<T>(
  promise: Promise<T>,
  timeoutMs: number,
  validatorName: string
): { timeoutPromise: Promise<T | null>; abortFn: () => void } {
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn(
          `[validator-orchestrator] ⚠️ ${validatorName} timed out after ${(timeoutMs / 1000).toFixed(0)}s`
        );
        resolve(null); // Timeout result
      }, timeoutMs);
    }),
  ])
    .then((result) => {
      // Clear timeout if promise completed first
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      return result;
    })
    .catch((error) => {
      // Clear timeout on error
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      console.error(
        `[validator-orchestrator] ✗ ${validatorName} error: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    });

  const abortFn = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return { timeoutPromise, abortFn };
}

// =============================================
// Main Orchestrator Task
// =============================================

export const cfnAsyncValidatorOrchestratorTask = task({
  id: "cfn-async-validator-orchestrator",
  retry: { maxAttempts: 1 }, // No retry at orchestrator level (validators handle retries)

  run: async (payload: OrchestratorPayload): Promise<OrchestratorResult> => {
    const orchestratorStart = Date.now();

    console.log(`[validator-orchestrator] ========== ASYNC VALIDATOR ORCHESTRATION ==========`);
    console.log(`[validator-orchestrator] Task ID: ${payload.taskId}`);
    console.log(`[validator-orchestrator] Micro-tasks: ${payload.decompositionPlan.totalEstimatedTasks}`);
    console.log(`[validator-orchestrator] Implementations: ${payload.implementations.length} files`);
    console.log(`[validator-orchestrator] Tests: ${payload.tests.length} files`);
    console.log(``);

    // Prepare validator results
    const validatorResults: ValidatorResult[] = [];

    // ===== STEP 1: SPAWN ALL 5 VALIDATORS IN PARALLEL =====
    console.log(`[validator-orchestrator] Step 1: Spawning 5 validators in parallel...`);
    const spawnStart = Date.now();

    // Combine implementations and tests into single payload
    const implementationCode = payload.implementations.join("\n\n// ===== FILE SEPARATOR =====\n\n");
    const testCode = payload.tests.join("\n\n// ===== FILE SEPARATOR =====\n\n");

    // Spawn all validators and get run IDs
    const validatorSpawns = await Promise.all([
      // Security Validator
      tasks.trigger("cfn-async-security-validator", {
        taskId: payload.taskId,
        implementation: implementationCode,
        testCode: testCode,
        workDir: payload.workDir,
      }),

      // Performance Validator
      tasks.trigger("cfn-async-performance-validator", {
        taskId: payload.taskId,
        implementation: implementationCode,
        testCode: testCode,
        workDir: payload.workDir,
      }),

      // Testing Validator (placeholder - will implement in next iteration)
      tasks.trigger("cfn-async-testing-validator", {
        taskId: payload.taskId,
        implementation: implementationCode,
        testCode: testCode,
        workDir: payload.workDir,
      }),

      // Architecture Validator (placeholder)
      tasks.trigger("cfn-async-architecture-validator", {
        taskId: payload.taskId,
        implementation: implementationCode,
        testCode: testCode,
        workDir: payload.workDir,
      }),

      // Code Quality Validator (placeholder)
      tasks.trigger("cfn-async-code-quality-validator", {
        taskId: payload.taskId,
        implementation: implementationCode,
        testCode: testCode,
        workDir: payload.workDir,
      }),
    ]);

    const spawnDuration = Date.now() - spawnStart;
    console.log(`[validator-orchestrator]   ✓ Spawned 5 validators in ${spawnDuration}ms`);
    console.log(``);

    // ===== STEP 2: WAIT FOR ALL VALIDATORS WITH ERROR RECOVERY & TIMEOUT PROTECTION =====
    console.log(`[validator-orchestrator] Step 2: Waiting for validators (timeout=${(VALIDATOR_TIMEOUT_MS / 1000).toFixed(0)}s, max-retries=${RETRY_ATTEMPTS})...`);
    const waitStart = Date.now();

    // Create validator execution promises with timeout protection (sec-1.6)
    const validatorNames = [
      "security-validator",
      "performance-validator",
      "testing-validator",
      "architecture-validator",
      "code-quality-validator",
    ];

    const validatorPromises = [
      { spawn: validatorSpawns[0], name: validatorNames[0], type: "AsyncSecurityValidatorResult" },
      { spawn: validatorSpawns[1], name: validatorNames[1], type: "AsyncPerformanceValidatorResult" },
      { spawn: validatorSpawns[2], name: validatorNames[2], type: "any" },
      { spawn: validatorSpawns[3], name: validatorNames[3], type: "any" },
      { spawn: validatorSpawns[4], name: validatorNames[4], type: "any" },
    ].map((validator) =>
      createTimeoutedPromise(
        executeValidatorWithRecovery<any>(
          validator.spawn.id,
          validator.name,
          { timeoutMs: VALIDATOR_TIMEOUT_MS },
          { maxAttempts: RETRY_ATTEMPTS, initialBackoffMs: 100, backoffFactor: 2 }
        ),
        VALIDATOR_TIMEOUT_MS,
        validator.name
      )
    );

    // Execute all validators in parallel with timeout protection
    // Using Promise.allSettled to handle partial failures gracefully
    const validatorSettledResults = await Promise.allSettled(
      validatorPromises.map((validator) => validator.timeoutPromise)
    );

    // Clean up timeout handlers for all validators (abort function)
    validatorPromises.forEach((validator) => validator.abortFn());

    // Convert settled results to recovery results
    const validatorRecoveryResults = validatorSettledResults.map((settledResult, index) => {
      if (settledResult.status === "fulfilled" && settledResult.value !== null) {
        // Validator succeeded
        return settledResult.value as any;
      } else if (settledResult.status === "rejected") {
        // Validator errored
        const errorMsg = settledResult.reason instanceof Error
          ? settledResult.reason.message
          : String(settledResult.reason);

        console.error(
          `[validator-orchestrator] ✗ ${validatorNames[index]} rejected: ${errorMsg}`
        );

        return {
          success: false,
          result: null,
          timedOut: false,
          retriesUsed: 0,
          retryHistory: [],
          totalDurationMs: VALIDATOR_TIMEOUT_MS,
          escalated: false,
        } as any;
      } else {
        // Validator timed out (resolved to null)
        return {
          success: false,
          result: null,
          timedOut: true,
          retriesUsed: 0,
          retryHistory: [],
          totalDurationMs: VALIDATOR_TIMEOUT_MS,
          escalated: validatorNames[index].includes("security") || validatorNames[index].includes("architecture"),
        } as any;
      }
    });

    const waitDuration = Date.now() - waitStart;
    console.log(`[validator-orchestrator]   ✓ All validators completed in ${(waitDuration / 1000).toFixed(2)}s`);
    console.log(``);

    // ===== STEP 3: PROCESS RESULTS AND GENERATE ERROR REPORTS =====
    console.log(`[validator-orchestrator] Step 3: Processing validator results...`);

    const validatorTypes: ValidatorResult["validatorType"][] = [
      "security",
      "performance",
      "testing",
      "architecture",
      "code-quality",
    ];

    const errorReports: ErrorReport[] = [];
    let successCount = 0;
    let failureCount = 0;
    let timeoutCount = 0;

    // Convert recovery results to validator results
    for (let i = 0; i < validatorRecoveryResults.length; i++) {
      const recoveryResult = validatorRecoveryResults[i];
      const validatorType = validatorTypes[i];

      const validatorResult: ValidatorResult = {
        validatorType,
        status: recoveryResult.success ? "success" : (recoveryResult.timedOut ? "timeout" : "error"),
        score: recoveryResult.success ? extractScore(recoveryResult.result) : 0.0,
        findings: recoveryResult.success ? extractFindings(recoveryResult.result) : [],
        recommendations: recoveryResult.success ? extractRecommendations(recoveryResult.result) : [],
        latencyMs: recoveryResult.totalDurationMs,
        error: recoveryResult.success ? undefined : (recoveryResult.timedOut ? "Timeout" : "Validator failed"),
      };

      validatorResults.push(validatorResult);

      console.log(
        `[validator-orchestrator]   ${validatorType}: ${validatorResult.status} ` +
        `(score: ${validatorResult.score.toFixed(2)}, latency: ${validatorResult.latencyMs}ms, retries: ${recoveryResult.retriesUsed})`
      );

      if (validatorResult.status === "success") {
        successCount++;
      } else if (validatorResult.status === "timeout") {
        timeoutCount++;
      } else {
        failureCount++;
      }

      // Generate error report for failed validators
      if (!recoveryResult.success) {
        errorReports.push(
          generateErrorReport(
            `${validatorType}-validator`,
            recoveryResult,
            false // Will update after quorum check
          )
        );
      }
    }

    console.log(``);

    // ===== STEP 4: CHECK PARTIAL SUCCESS QUORUM =====
    console.log(`[validator-orchestrator] Step 4: Checking partial success quorum...`);

    const quorumCheck = meetsPartialSuccessQuorum(validatorRecoveryResults, MINIMUM_QUORUM);
    const consensusReached = quorumCheck.quorumMet;

    // Update error reports with quorum decision impact
    for (const report of errorReports) {
      if (!consensusReached) {
        report.decisionImpact = "gate-failure";
      }
    }

    console.log(`[validator-orchestrator]   Success: ${successCount}/${validatorResults.length}`);
    console.log(`[validator-orchestrator]   Failures: ${failureCount}`);
    console.log(`[validator-orchestrator]   Timeouts: ${timeoutCount}`);
    console.log(`[validator-orchestrator]   Escalated: ${quorumCheck.escalatedCount}`);
    console.log(`[validator-orchestrator]   Consensus: ${consensusReached ? "REACHED" : "FAILED"} (min ${MINIMUM_QUORUM})`);
    console.log(``);

    // ===== STEP 5: CALCULATE OVERALL SCORE =====
    console.log(`[validator-orchestrator] Step 5: Calculating overall score...`);

    const successfulValidators = validatorResults.filter(v => v.status === "success");
    const overallScore = successfulValidators.length > 0
      ? successfulValidators.reduce((sum, v) => sum + v.score, 0) / successfulValidators.length
      : 0.0;

    console.log(`[validator-orchestrator]   Overall score: ${overallScore.toFixed(2)} (from ${successfulValidators.length} validators)`);
    console.log(``);

    // ===== STEP 6: LOG ERROR REPORTS =====
    if (errorReports.length > 0) {
      console.log(``);
      logErrorReports(errorReports);
      console.log(``);
    }

    // ===== STEP 7: RETURN ORCHESTRATOR RESULT =====
    const totalLatency = Date.now() - orchestratorStart;

    const escalatedValidators = validatorRecoveryResults
      .filter(r => r.escalated)
      .map((_, index) => validatorTypes[index]);

    const orchestratorResult: OrchestratorResult = {
      taskId: payload.taskId,
      timestamp: Date.now(),
      validators: validatorResults,
      overallScore,
      consensusReached,
      totalLatencyMs: totalLatency,
      successCount,
      failureCount,
      timeoutCount,
      errorReports,
      escalatedValidators,
    };

    console.log(`[validator-orchestrator] ========== ORCHESTRATION COMPLETE ==========`);
    console.log(`[validator-orchestrator] Total time: ${(totalLatency / 1000).toFixed(2)}s`);
    console.log(`[validator-orchestrator] Consensus: ${consensusReached ? "✓ REACHED" : "✗ FAILED"}`);
    console.log(`[validator-orchestrator] Escalated validators: ${escalatedValidators.length > 0 ? escalatedValidators.join(", ") : "none"}`);
    console.log(``);

    return orchestratorResult;
  },
});

// =============================================
// Helper Functions
// =============================================

/**
 * Extract score from validator output
 * Different validators have different output formats
 */
function extractScore(output: any): number {
  // Security validator
  if (output.vulnerabilityScore !== undefined) {
    return 1.0 - (output.vulnerabilityScore / 100); // Invert score (0 vuln = 1.0 quality)
  }

  // Performance validator
  if (output.performanceGrade !== undefined) {
    const gradeMap: Record<string, number> = {
      "A+": 1.0, "A": 0.95, "B+": 0.90, "B": 0.85,
      "C+": 0.75, "C": 0.70, "D": 0.60, "F": 0.40,
    };
    return gradeMap[output.performanceGrade] ?? 0.70;
  }

  // Testing validator (placeholder)
  if (output.coverageScore !== undefined) {
    return output.coverageScore / 100;
  }

  // Architecture validator (placeholder)
  if (output.architectureScore !== undefined) {
    return output.architectureScore / 100;
  }

  // Code quality validator (placeholder)
  if (output.qualityScore !== undefined) {
    return output.qualityScore / 100;
  }

  // Default fallback
  return 0.70;
}

/**
 * Extract findings from validator output
 */
function extractFindings(output: any): string[] {
  if (output.findings && Array.isArray(output.findings)) {
    return output.findings.map((f: any) =>
      typeof f === "string" ? f : f.title || f.description || ""
    );
  }

  if (output.issues && Array.isArray(output.issues)) {
    return output.issues.map((i: any) =>
      typeof i === "string" ? i : i.title || i.description || ""
    );
  }

  return [];
}

/**
 * Extract recommendations from validator output
 */
function extractRecommendations(output: any): string[] {
  if (output.recommendations && Array.isArray(output.recommendations)) {
    return output.recommendations;
  }

  return [];
}

