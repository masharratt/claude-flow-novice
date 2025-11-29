/**
 * CFN Async Validation Pipeline (Phase 3, Task 3.2)
 *
 * Streaming pipeline that processes validation results as each validator completes,
 * rather than waiting for all validators to finish.
 *
 * STREAMING PATTERN:
 * - Use Promise.race() to process first completed validator
 * - Remove completed validator from pending set
 * - Update progress incrementally (1/5, 2/5, ..., 5/5)
 * - Calculate running quality score as results arrive
 * - Track per-validator latency for performance analysis
 *
 * BENEFITS:
 * - Early feedback (don't wait for slowest validator)
 * - Progress visibility (know which validators are complete)
 * - Better UX (stream results to UI or logs)
 * - Performance insights (identify bottleneck validators)
 */

import { task, tasks, runs } from "@trigger.dev/sdk/v3";
import type { DecompositionPlan } from "./cfn-decomposition-aggregator.js";
import type { ValidatorResult } from "./cfn-async-validator-orchestrator.js";

// =============================================
// Type Definitions
// =============================================

export interface StreamingValidatorProgress {
  validatorType: string;
  completedAt: number;
  latencyMs: number;
  score: number;
  status: "success" | "timeout" | "error";
}

export interface QualityMetrics {
  currentScore: number; // Running average
  completedValidators: number;
  totalValidators: number;
  progressPercentage: number;
  validatorLatencies: Record<string, number>;
}

export interface PipelinePayload {
  taskId: string;
  decompositionPlan: DecompositionPlan;
  implementations: string[];
  tests: string[];
  workDir: string;
}

export interface PipelineResult {
  taskId: string;
  timestamp: number;
  streamingProgress: StreamingValidatorProgress[]; // Results in completion order
  finalMetrics: QualityMetrics;
  validatorResults: ValidatorResult[];
  totalPipelineLatencyMs: number;
  firstValidatorLatencyMs: number; // Time to first result
  lastValidatorLatencyMs: number; // Time to last result
}

// =============================================
// Validator Configuration
// =============================================

const VALIDATOR_CONFIGS = [
  { type: "security", taskName: "cfn-async-security-validator" },
  { type: "performance", taskName: "cfn-async-performance-validator" },
  { type: "testing", taskName: "cfn-async-testing-validator" },
  { type: "architecture", taskName: "cfn-async-architecture-validator" },
  { type: "code-quality", taskName: "cfn-async-code-quality-validator" },
] as const;

// =============================================
// Main Pipeline Task
// =============================================

export const cfnValidationPipelineTask = task({
  id: "cfn-validation-pipeline",
  retry: { maxAttempts: 1 },

  run: async (payload: PipelinePayload): Promise<PipelineResult> => {
    const pipelineStart = Date.now();

    console.log(`[validation-pipeline] ========== STREAMING VALIDATION PIPELINE ==========`);
    console.log(`[validation-pipeline] Task ID: ${payload.taskId}`);
    console.log(`[validation-pipeline] Streaming ${VALIDATOR_CONFIGS.length} validators...`);
    console.log(``);

    // Prepare implementation and test code
    const implementationCode = payload.implementations.join("\n\n// ===== FILE SEPARATOR =====\n\n");
    const testCode = payload.tests.join("\n\n// ===== FILE SEPARATOR =====\n\n");

    // ===== STEP 1: SPAWN ALL VALIDATORS =====
    console.log(`[validation-pipeline] Step 1: Spawning validators...`);
    const spawnStart = Date.now();

    interface PendingValidator {
      type: string;
      taskName: string;
      promise: Promise<any>;
      startTime: number;
    }

    const pendingValidators: PendingValidator[] = await Promise.all(
      VALIDATOR_CONFIGS.map(async (config) => {
        const startTime = Date.now();
        const handle = await tasks.trigger(config.taskName, {
          taskId: payload.taskId,
          implementation: implementationCode,
          testCode: testCode,
          workDir: payload.workDir,
        });

        return {
          type: config.type,
          taskName: config.taskName,
          promise: runs.poll(handle.id, { pollIntervalMs: 2000 }),
          startTime,
        };
      })
    );

    const spawnDuration = Date.now() - spawnStart;
    console.log(`[validation-pipeline]   ✓ Spawned ${pendingValidators.length} validators in ${spawnDuration}ms`);
    console.log(``);

    // ===== STEP 2: STREAM RESULTS AS THEY COMPLETE =====
    console.log(`[validation-pipeline] Step 2: Streaming results...`);
    console.log(``);

    const streamingProgress: StreamingValidatorProgress[] = [];
    const validatorResults: ValidatorResult[] = [];
    let firstValidatorLatency = 0;

    // Quality metrics (running)
    let totalScore = 0;
    let completedCount = 0;

    // Remaining validators to process
    const remaining = [...pendingValidators];

    while (remaining.length > 0) {
      // Race all remaining validators
      const raceResult = await Promise.race(
        remaining.map(async (validator, index) => {
          try {
            const result = await validator.promise;
            return { result, index, error: null };
          } catch (error) {
            return { result: null, index, error: error as Error };
          }
        })
      );

      // Get the validator that completed
      const completedValidator = remaining[raceResult.index];
      const latency = Date.now() - completedValidator.startTime;

      // Track first validator latency
      if (completedCount === 0) {
        firstValidatorLatency = latency;
      }

      // Process result
      let status: "success" | "timeout" | "error" = "success";
      let score = 0.0;
      let findings: string[] = [];
      let recommendations: string[] = [];
      let errorMsg: string | undefined = undefined;

      if (raceResult.error) {
        status = "error";
        errorMsg = raceResult.error.message;
        console.log(`[validation-pipeline]   ✗ ${completedValidator.type}: ERROR (${latency}ms) - ${errorMsg}`);
      } else if (raceResult.result.status === "COMPLETED" && raceResult.result.output) {
        const output = raceResult.result.output as any;
        score = extractScore(output);
        findings = extractFindings(output);
        recommendations = extractRecommendations(output);

        totalScore += score;
        completedCount++;

        console.log(`[validation-pipeline]   ✓ ${completedValidator.type}: ${score.toFixed(2)} (${latency}ms) [${completedCount}/${VALIDATOR_CONFIGS.length}]`);
      } else {
        status = "timeout";
        console.log(`[validation-pipeline]   ⏱ ${completedValidator.type}: TIMEOUT (${latency}ms)`);
      }

      // Record streaming progress
      streamingProgress.push({
        validatorType: completedValidator.type,
        completedAt: Date.now(),
        latencyMs: latency,
        score,
        status,
      });

      // Record full validator result
      validatorResults.push({
        validatorType: completedValidator.type as any,
        status,
        score,
        findings,
        recommendations,
        latencyMs: latency,
        error: errorMsg,
      });

      // Remove from remaining
      remaining.splice(raceResult.index, 1);

      // Log running metrics
      const currentScore = completedCount > 0 ? totalScore / completedCount : 0;
      const progress = ((streamingProgress.length / VALIDATOR_CONFIGS.length) * 100).toFixed(0);

      console.log(`[validation-pipeline]     Running score: ${currentScore.toFixed(2)} | Progress: ${progress}%`);
      console.log(``);
    }

    const lastValidatorLatency = Date.now() - pipelineStart;

    // ===== STEP 3: CALCULATE FINAL METRICS =====
    console.log(`[validation-pipeline] Step 3: Calculating final metrics...`);

    const finalScore = completedCount > 0 ? totalScore / completedCount : 0;
    const validatorLatencies: Record<string, number> = {};

    for (const progress of streamingProgress) {
      validatorLatencies[progress.validatorType] = progress.latencyMs;
    }

    const finalMetrics: QualityMetrics = {
      currentScore: finalScore,
      completedValidators: completedCount,
      totalValidators: VALIDATOR_CONFIGS.length,
      progressPercentage: 100,
      validatorLatencies,
    };

    console.log(`[validation-pipeline]   Final score: ${finalScore.toFixed(2)}`);
    console.log(`[validation-pipeline]   Completed: ${completedCount}/${VALIDATOR_CONFIGS.length}`);
    console.log(`[validation-pipeline]   First result: ${firstValidatorLatency}ms`);
    console.log(`[validation-pipeline]   Last result: ${lastValidatorLatency}ms`);
    console.log(``);

    // ===== STEP 4: RETURN PIPELINE RESULT =====
    const totalLatency = Date.now() - pipelineStart;

    const pipelineResult: PipelineResult = {
      taskId: payload.taskId,
      timestamp: Date.now(),
      streamingProgress,
      finalMetrics,
      validatorResults,
      totalPipelineLatencyMs: totalLatency,
      firstValidatorLatencyMs: firstValidatorLatency,
      lastValidatorLatencyMs: lastValidatorLatency,
    };

    console.log(`[validation-pipeline] ========== PIPELINE COMPLETE ==========`);
    console.log(`[validation-pipeline] Total time: ${(totalLatency / 1000).toFixed(2)}s`);
    console.log(`[validation-pipeline] Time to first result: ${(firstValidatorLatency / 1000).toFixed(2)}s`);
    console.log(`[validation-pipeline] Final score: ${finalScore.toFixed(2)}`);
    console.log(``);

    return pipelineResult;
  },
});

// =============================================
// Helper Functions
// =============================================

/**
 * Extract score from validator output
 */
function extractScore(output: any): number {
  // Security validator
  if (output.vulnerabilityScore !== undefined) {
    return 1.0 - (output.vulnerabilityScore / 100);
  }

  // Performance validator
  if (output.performanceGrade !== undefined) {
    const gradeMap: Record<string, number> = {
      "A+": 1.0, "A": 0.95, "B+": 0.90, "B": 0.85,
      "C+": 0.75, "C": 0.70, "D": 0.60, "F": 0.40,
    };
    return gradeMap[output.performanceGrade] ?? 0.70;
  }

  // Testing validator
  if (output.coverageScore !== undefined) {
    return output.coverageScore / 100;
  }

  // Architecture validator
  if (output.architectureScore !== undefined) {
    return output.architectureScore / 100;
  }

  // Code quality validator
  if (output.qualityScore !== undefined) {
    return output.qualityScore / 100;
  }

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
