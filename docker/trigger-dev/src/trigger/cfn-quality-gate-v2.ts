/**
 * CFN Quality Gate Aggregator v2 (Phase 3, Task 3.3)
 *
 * Calculates overall quality score from 5 async validators and determines
 * PROCEED/ITERATE decision based on mode-specific thresholds.
 *
 * DECISION LOGIC:
 * - MVP mode: gate threshold >= 0.70
 * - Standard mode: gate threshold >= 0.95
 * - Enterprise mode: gate threshold >= 0.98
 *
 * INPUTS:
 * - 5 validator results (security, performance, testing, architecture, code-quality)
 * - Mode (mvp | standard | enterprise)
 * - Iteration number (for tracking)
 *
 * OUTPUTS:
 * - Gate decision: PROCEED (pass) or ITERATE (fail)
 * - Overall quality score (0.0-1.0)
 * - Per-validator breakdown
 * - Recommendations for iteration (if ITERATE)
 *
 * GATE RULES:
 * - Minimum quorum: 3/5 validators must succeed
 * - Score calculation: average of successful validators
 * - If quorum not met: automatic ITERATE
 * - If score < threshold: ITERATE with focus areas
 * - If score >= threshold: PROCEED to Loop 2
 */

import { task } from "@trigger.dev/sdk/v3";
import type { ValidatorResult } from "./cfn-async-validator-orchestrator.js";

// =============================================
// Type Definitions
// =============================================

export interface QualityGatePayload {
  taskId: string;
  iterationNumber: number;
  mode: "mvp" | "standard" | "enterprise";
  validatorResults: ValidatorResult[];
}

export interface GateDecision {
  decision: "PROCEED" | "ITERATE";
  score: number; // Overall quality score (0.0-1.0)
  threshold: number; // Mode-specific threshold
  passed: boolean; // score >= threshold
  reasoning: string[]; // Detailed reasoning for decision
}

export interface ValidatorBreakdown {
  validatorType: string;
  status: "success" | "timeout" | "error";
  score: number;
  weight: number; // Weight in overall calculation
  criticalFindings: number;
  recommendations: string[];
}

export interface QualityGateResult {
  taskId: string;
  iterationNumber: number;
  mode: "mvp" | "standard" | "enterprise";
  timestamp: number;
  gateDecision: GateDecision;
  validatorBreakdown: ValidatorBreakdown[];
  quorumMet: boolean; // >= 3 validators succeeded
  successfulValidators: number;
  totalValidators: number;
  focusAreas: string[]; // Areas to focus on if ITERATE
}

// =============================================
// Mode Thresholds
// =============================================

const MODE_THRESHOLDS: Record<string, number> = {
  mvp: 0.70,
  standard: 0.95,
  enterprise: 0.98,
};

const MINIMUM_QUORUM = 3; // Minimum successful validators

// Validator weights (can be adjusted based on importance)
const VALIDATOR_WEIGHTS: Record<string, number> = {
  security: 1.2, // Higher weight for security
  performance: 1.0,
  testing: 1.1, // Higher weight for test coverage
  architecture: 0.9,
  "code-quality": 0.8,
};

// =============================================
// Main Quality Gate Task
// =============================================

export const cfnQualityGateV2Task = task({
  id: "cfn-quality-gate-v2",
  retry: { maxAttempts: 1 },

  run: async (payload: QualityGatePayload): Promise<QualityGateResult> => {
    const startTime = Date.now();

    console.log(`[quality-gate-v2] ========== QUALITY GATE AGGREGATION ==========`);
    console.log(`[quality-gate-v2] Task ID: ${payload.taskId}`);
    console.log(`[quality-gate-v2] Iteration: ${payload.iterationNumber}`);
    console.log(`[quality-gate-v2] Mode: ${payload.mode}`);
    console.log(`[quality-gate-v2] Threshold: ${MODE_THRESHOLDS[payload.mode]}`);
    console.log(``);

    // ===== STEP 1: CHECK QUORUM =====
    console.log(`[quality-gate-v2] Step 1: Checking validator quorum...`);

    const successfulValidators = payload.validatorResults.filter(v => v.status === "success");
    const quorumMet = successfulValidators.length >= MINIMUM_QUORUM;

    console.log(`[quality-gate-v2]   Successful: ${successfulValidators.length}/${payload.validatorResults.length}`);
    console.log(`[quality-gate-v2]   Quorum (${MINIMUM_QUORUM}): ${quorumMet ? "✓ MET" : "✗ NOT MET"}`);
    console.log(``);

    // If quorum not met, immediate ITERATE
    if (!quorumMet) {
      return createQuorumFailureResult(payload, successfulValidators.length);
    }

    // ===== STEP 2: CALCULATE WEIGHTED SCORE =====
    console.log(`[quality-gate-v2] Step 2: Calculating weighted quality score...`);

    let totalWeightedScore = 0;
    let totalWeight = 0;

    const validatorBreakdown: ValidatorBreakdown[] = [];

    for (const validator of payload.validatorResults) {
      const weight = VALIDATOR_WEIGHTS[validator.validatorType] ?? 1.0;
      const weightedScore = validator.status === "success"
        ? validator.score * weight
        : 0;

      totalWeightedScore += weightedScore;
      totalWeight += weight;

      const criticalFindings = validator.findings.filter(f =>
        f.toLowerCase().includes("critical") || f.toLowerCase().includes("severe")
      ).length;

      validatorBreakdown.push({
        validatorType: validator.validatorType,
        status: validator.status,
        score: validator.score,
        weight,
        criticalFindings,
        recommendations: validator.recommendations,
      });

      console.log(`[quality-gate-v2]   ${validator.validatorType}: ${validator.score.toFixed(2)} × ${weight} = ${weightedScore.toFixed(2)}`);
    }

    const overallScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

    console.log(`[quality-gate-v2]   Overall score: ${overallScore.toFixed(2)}`);
    console.log(``);

    // ===== STEP 3: DETERMINE GATE DECISION =====
    console.log(`[quality-gate-v2] Step 3: Determining gate decision...`);

    const threshold = MODE_THRESHOLDS[payload.mode];
    const passed = overallScore >= threshold;
    const decision: "PROCEED" | "ITERATE" = passed ? "PROCEED" : "ITERATE";

    console.log(`[quality-gate-v2]   Score: ${overallScore.toFixed(2)}`);
    console.log(`[quality-gate-v2]   Threshold: ${threshold}`);
    console.log(`[quality-gate-v2]   Decision: ${decision}`);
    console.log(``);

    // ===== STEP 4: GENERATE REASONING =====
    const reasoning: string[] = [];

    if (passed) {
      reasoning.push(`Quality score ${overallScore.toFixed(2)} meets ${payload.mode} mode threshold ${threshold}`);
      reasoning.push(`All ${MINIMUM_QUORUM} required validators succeeded`);
      reasoning.push(`Proceeding to Loop 2 validation`);
    } else {
      reasoning.push(`Quality score ${overallScore.toFixed(2)} below ${payload.mode} mode threshold ${threshold}`);
      reasoning.push(`Gap: ${(threshold - overallScore).toFixed(2)} points needed`);

      // Identify failing validators
      const failedValidators = validatorBreakdown.filter(v => v.score < threshold);
      if (failedValidators.length > 0) {
        reasoning.push(`Failing validators: ${failedValidators.map(v => v.validatorType).join(", ")}`);
      }
    }

    // ===== STEP 5: IDENTIFY FOCUS AREAS =====
    const focusAreas: string[] = [];

    if (!passed) {
      // Sort validators by score (lowest first)
      const sortedValidators = [...validatorBreakdown].sort((a, b) => a.score - b.score);

      for (const validator of sortedValidators.slice(0, 3)) {
        if (validator.score < threshold) {
          focusAreas.push(`${validator.validatorType}: score ${validator.score.toFixed(2)}, needs ${(threshold - validator.score).toFixed(2)} improvement`);

          // Add critical findings
          if (validator.criticalFindings > 0) {
            focusAreas.push(`  - ${validator.criticalFindings} critical findings to address`);
          }

          // Add top recommendations
          if (validator.recommendations.length > 0) {
            focusAreas.push(`  - ${validator.recommendations[0]}`);
          }
        }
      }
    }

    console.log(`[quality-gate-v2] Step 4: Focus areas for iteration...`);
    for (const area of focusAreas) {
      console.log(`[quality-gate-v2]   - ${area}`);
    }
    console.log(``);

    // ===== STEP 6: RETURN QUALITY GATE RESULT =====
    const gateResult: QualityGateResult = {
      taskId: payload.taskId,
      iterationNumber: payload.iterationNumber,
      mode: payload.mode,
      timestamp: Date.now(),
      gateDecision: {
        decision,
        score: overallScore,
        threshold,
        passed,
        reasoning,
      },
      validatorBreakdown,
      quorumMet,
      successfulValidators: successfulValidators.length,
      totalValidators: payload.validatorResults.length,
      focusAreas,
    };

    const duration = Date.now() - startTime;

    console.log(`[quality-gate-v2] ========== GATE DECISION: ${decision} ==========`);
    console.log(`[quality-gate-v2] Score: ${overallScore.toFixed(2)} / ${threshold}`);
    console.log(`[quality-gate-v2] Time: ${duration}ms`);
    console.log(``);

    return gateResult;
  },
});

// =============================================
// Helper Functions
// =============================================

/**
 * Create a result when quorum is not met
 */
function createQuorumFailureResult(
  payload: QualityGatePayload,
  successCount: number
): QualityGateResult {
  console.log(`[quality-gate-v2] ✗ Quorum not met, automatic ITERATE`);
  console.log(``);

  const validatorBreakdown: ValidatorBreakdown[] = payload.validatorResults.map(v => ({
    validatorType: v.validatorType,
    status: v.status,
    score: v.score,
    weight: VALIDATOR_WEIGHTS[v.validatorType] ?? 1.0,
    criticalFindings: 0,
    recommendations: v.recommendations,
  }));

  return {
    taskId: payload.taskId,
    iterationNumber: payload.iterationNumber,
    mode: payload.mode,
    timestamp: Date.now(),
    gateDecision: {
      decision: "ITERATE",
      score: 0.0,
      threshold: MODE_THRESHOLDS[payload.mode],
      passed: false,
      reasoning: [
        `Only ${successCount}/${payload.validatorResults.length} validators succeeded`,
        `Minimum quorum of ${MINIMUM_QUORUM} validators not met`,
        `Cannot calculate reliable quality score`,
        `Retrying with full validator suite`,
      ],
    },
    validatorBreakdown,
    quorumMet: false,
    successfulValidators: successCount,
    totalValidators: payload.validatorResults.length,
    focusAreas: [
      "Fix validator failures before calculating quality score",
      "Ensure all validators can complete successfully",
    ],
  };
}
