/**
 * CFN Validator Error Recovery (Phase 3, Task 3.4)
 *
 * Centralized error recovery strategies for async validators:
 * - Manual timeout using Promise.race()
 * - Exponential backoff retry (100ms, 200ms, 400ms)
 * - Partial failure recovery (continue with 3/5 validators)
 * - Critical validator fallback (escalate failures to gate check)
 *
 * DESIGN RATIONALE:
 * - Manual timeout: Trigger.dev v4 doesn't support explicit timeout in runs.poll()
 * - Retry logic: Handles transient network/API failures
 * - Partial success: Allows progress even with some validator failures
 * - Escalation: Security failures require explicit handling
 */

import { runs } from "@trigger.dev/sdk/v3";
// Phase 4: RuVector Error Learning
import { captureErrorToRuVector } from "../lib/ruvector-learning-hooks.js";
import { suggestRetryStrategy, trackStrategyEffectiveness, strategyToRetryConfig } from "../lib/ruvector-error-pattern-learning.js";
// Phase 5: Adaptive Retry Strategy
import { selectAdaptiveRetryStrategy, toStandardRetryConfig, recordStrategyEffectiveness, type AdaptiveRetryConfig } from "../lib/adaptive-retry-strategy.js";

// =============================================
// Type Definitions
// =============================================

export interface RetryConfig {
  maxAttempts: number;      // Max retry attempts (default: 2, total 3 tries)
  initialBackoffMs: number; // Initial backoff delay (default: 100ms)
  backoffFactor: number;    // Exponential factor (default: 2)
}

export interface TimeoutConfig {
  timeoutMs: number;        // Timeout in milliseconds (default: 300000 = 5 min)
}

export interface RetryAttempt {
  attemptNumber: number;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface ValidatorRecoveryResult<T> {
  success: boolean;
  result: T | null;
  timedOut: boolean;
  retriesUsed: number;
  retryHistory: RetryAttempt[];
  totalDurationMs: number;
  escalated: boolean; // True if critical validator failed after retries
}

// =============================================
// Timeout Wrapper
// =============================================

/**
 * Wrap a promise with manual timeout using Promise.race()
 * Returns null if timeout occurs, allowing caller to handle partial success
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  taskName: string = "task"
): Promise<T | null> {
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => {
      console.warn(`[error-recovery] ⚠️ ${taskName} timed out after ${(timeoutMs / 1000).toFixed(0)}s`);
      resolve(null);
    }, timeoutMs)
  );

  return Promise.race([promise, timeoutPromise]);
}

// =============================================
// Exponential Backoff Retry
// =============================================

/**
 * Retry function with exponential backoff
 * Pattern: 100ms, 200ms, 400ms (max 2 retries)
 *
 * @param fn - Async function to retry
 * @param config - Retry configuration
 * @returns Result or null if all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {
    maxAttempts: 2,
    initialBackoffMs: 100,
    backoffFactor: 2,
  }
): Promise<{ result: T | null; retryHistory: RetryAttempt[] }> {
  const retryHistory: RetryAttempt[] = [];
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    const attemptStartTime = Date.now();

    try {
      const result = await fn();

      retryHistory.push({
        attemptNumber: attempt,
        startTimeMs: attemptStartTime,
        endTimeMs: Date.now(),
        durationMs: Date.now() - attemptStartTime,
        success: true,
      });

      return { result, retryHistory };
    } catch (error) {
      lastError = error as Error;
      const attemptEndTime = Date.now();

      retryHistory.push({
        attemptNumber: attempt,
        startTimeMs: attemptStartTime,
        endTimeMs: attemptEndTime,
        durationMs: attemptEndTime - attemptStartTime,
        success: false,
        error: lastError.message,
      });

      // If not last attempt, backoff and retry
      if (attempt < config.maxAttempts) {
        const backoffMs = config.initialBackoffMs * Math.pow(config.backoffFactor, attempt - 1);
        console.warn(
          `[error-recovery] Retry ${attempt}/${config.maxAttempts} in ${backoffMs}ms: ${lastError.message}`
        );
        await sleep(backoffMs);
      } else {
        console.error(
          `[error-recovery] ✗ Failed after ${config.maxAttempts} attempts: ${lastError.message}`
        );
      }
    }
  }

  return { result: null, retryHistory };
}

// =============================================
// Combined Timeout + Retry Wrapper
// =============================================

/**
 * Execute validator with timeout and retry protection
 * Combines manual timeout and exponential backoff retry
 *
 * @param runId - Trigger.dev run ID
 * @param validatorName - Validator name (for logging)
 * @param timeoutConfig - Timeout configuration
 * @param retryConfig - Retry configuration
 * @returns Recovery result with full history
 */
export async function executeValidatorWithRecovery<T>(
  runId: string,
  validatorName: string,
  timeoutConfig: TimeoutConfig = { timeoutMs: 300000 }, // 5 min default
  retryConfig: RetryConfig = { maxAttempts: 2, initialBackoffMs: 100, backoffFactor: 2 }
): Promise<ValidatorRecoveryResult<T>> {
  const totalStartTime = Date.now();

  // Phase 5: Use adaptive retry strategy based on validator type and error patterns
  let adaptiveConfig: AdaptiveRetryConfig | null = null;
  let strategySource = "default";

  try {
    const strategySelection = await selectAdaptiveRetryStrategy({
      validatorName,
      errorType: "EXECUTION", // Initial execution, no error yet
      attemptNumber: 0,
      previousAttempts: 0,
    });
    adaptiveConfig = strategySelection.config;
    strategySource = adaptiveConfig.source;

    // Use adaptive config if available
    if (adaptiveConfig.source === "learned" && adaptiveConfig.confidence > 0.70) {
      retryConfig = toStandardRetryConfig(adaptiveConfig);
      if (adaptiveConfig.timeoutMs) {
        timeoutConfig = { timeoutMs: adaptiveConfig.timeoutMs };
      }
      console.log(`[error-recovery] ✓ Using ${strategySource} retry strategy (confidence: ${(adaptiveConfig.confidence * 100).toFixed(0)}%)`);
    } else {
      console.log(`[error-recovery] Using ${strategySource} retry strategy`);
    }
  } catch (error) {
    console.warn(`[error-recovery] Failed to select adaptive strategy: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`[error-recovery] Starting ${validatorName} with timeout=${timeoutConfig.timeoutMs}ms, retries=${retryConfig.maxAttempts}`);

  // Retry logic wraps the timeout + poll operation
  const { result: pollResult, retryHistory } = await withRetry(async () => {
    // Each retry attempt includes timeout protection
    const result = await withTimeout(
      runs.poll(runId, { pollIntervalMs: 2000 }),
      timeoutConfig.timeoutMs,
      validatorName
    );

    if (result === null) {
      throw new Error(`Timeout after ${timeoutConfig.timeoutMs}ms`);
    }

    if (result.status !== "COMPLETED") {
      throw new Error(`Validator failed with status: ${result.status}`);
    }

    return result;
  }, retryConfig);

  const totalDurationMs = Date.now() - totalStartTime;
  const timedOut = pollResult === null && retryHistory.some(h => h.error?.includes("Timeout"));
  const retriesUsed = retryHistory.length - 1; // First attempt is not a retry

  // Check if this is a critical validator that failed (requires escalation)
  const isCriticalValidator = validatorName.includes("security") || validatorName.includes("architecture");
  const escalated = isCriticalValidator && pollResult === null;

  if (escalated) {
    console.error(
      `[error-recovery] 🚨 CRITICAL: ${validatorName} failed after ${retriesUsed} retries - escalating to gate check`
    );
  }

  // Phase 4: Capture error to RuVector if validation failed (async, non-blocking)
  if (pollResult === null) {
    const errorType = timedOut ? "TIMEOUT" : "VALIDATION_FAILURE";
    const resolution = escalated ? "ESCALATED" : (retriesUsed > 0 ? "SUCCEEDED" : "MANUAL");

    captureErrorToRuVector({
      taskId: runId, // Use run ID as task identifier
      errorType,
      validatorName,
      taskDescription: `Validator execution for ${validatorName}`,
      errorDetail: retryHistory[retryHistory.length - 1]?.error ?? "Unknown error",
      retryHistory,
      resolution,
    }).catch((err) =>
      console.warn(`[learning] Error capture failed: ${err.message}`)
    );
  }

  // Phase 5: Record strategy effectiveness (async, non-blocking)
  if (adaptiveConfig && adaptiveConfig.patternKey) {
    recordStrategyEffectiveness({
      patternKey: adaptiveConfig.patternKey,
      strategy: adaptiveConfig,
      success: pollResult !== null,
      attemptsUsed: retriesUsed + 1, // Include initial attempt
      totalDurationMs,
    }).catch((err) =>
      console.warn(`[adaptive-retry] Strategy effectiveness recording failed: ${err.message}`)
    );
  }

  return {
    success: pollResult !== null,
    result: pollResult?.output as T ?? null,
    timedOut,
    retriesUsed,
    retryHistory,
    totalDurationMs,
    escalated,
  };
}

// =============================================
// Partial Success Handler
// =============================================

/**
 * Determine if partial validator results meet minimum quorum (3/5)
 *
 * @param results - Array of validator recovery results
 * @param minimumQuorum - Minimum successful validators required (default: 3)
 * @returns True if quorum is met, false otherwise
 */
export function meetsPartialSuccessQuorum<T>(
  results: ValidatorRecoveryResult<T>[],
  minimumQuorum: number = 3
): { quorumMet: boolean; successCount: number; failureCount: number; escalatedCount: number } {
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  const escalatedCount = results.filter(r => r.escalated).length;

  const quorumMet = successCount >= minimumQuorum;

  if (!quorumMet) {
    console.warn(
      `[error-recovery] ⚠️ Partial success quorum NOT met: ${successCount}/${results.length} succeeded (min ${minimumQuorum})`
    );
  } else {
    console.log(
      `[error-recovery] ✓ Partial success quorum met: ${successCount}/${results.length} succeeded`
    );
  }

  return { quorumMet, successCount, failureCount, escalatedCount };
}

// =============================================
// Error Report Generator
// =============================================

export interface ErrorReport {
  validatorName: string;
  totalDurationMs: number;
  success: boolean;
  timedOut: boolean;
  retriesUsed: number;
  escalated: boolean;
  retryHistory: RetryAttempt[];
  decisionImpact: "none" | "reduced-confidence" | "gate-failure" | "escalated";
}

/**
 * Generate structured error report for validator failure
 * Includes retry history, timeout info, and decision impact
 */
export function generateErrorReport<T>(
  validatorName: string,
  recoveryResult: ValidatorRecoveryResult<T>,
  partialQuorumMet: boolean
): ErrorReport {
  let decisionImpact: ErrorReport["decisionImpact"] = "none";

  if (!recoveryResult.success) {
    if (recoveryResult.escalated) {
      decisionImpact = "escalated"; // Critical validator failed - escalate to gate check
    } else if (!partialQuorumMet) {
      decisionImpact = "gate-failure"; // Quorum not met - gate check fails
    } else {
      decisionImpact = "reduced-confidence"; // Quorum met but missing validator data
    }
  }

  return {
    validatorName,
    totalDurationMs: recoveryResult.totalDurationMs,
    success: recoveryResult.success,
    timedOut: recoveryResult.timedOut,
    retriesUsed: recoveryResult.retriesUsed,
    escalated: recoveryResult.escalated,
    retryHistory: recoveryResult.retryHistory,
    decisionImpact,
  };
}

/**
 * Log error reports in structured format
 */
export function logErrorReports(reports: ErrorReport[]): void {
  const failedReports = reports.filter(r => !r.success);

  if (failedReports.length === 0) {
    console.log(`[error-recovery] ✓ All validators succeeded - no errors to report`);
    return;
  }

  console.log(`[error-recovery] ========== VALIDATOR ERROR REPORTS ==========`);
  console.log(``);

  for (const report of failedReports) {
    console.log(`[error-recovery] Validator: ${report.validatorName}`);
    console.log(`[error-recovery]   Status: ${report.success ? "✓ SUCCESS" : "✗ FAILED"}`);
    console.log(`[error-recovery]   Timed Out: ${report.timedOut}`);
    console.log(`[error-recovery]   Retries Used: ${report.retriesUsed}`);
    console.log(`[error-recovery]   Escalated: ${report.escalated}`);
    console.log(`[error-recovery]   Total Duration: ${(report.totalDurationMs / 1000).toFixed(2)}s`);
    console.log(`[error-recovery]   Decision Impact: ${report.decisionImpact}`);
    console.log(`[error-recovery]   Retry History:`);

    for (const attempt of report.retryHistory) {
      const status = attempt.success ? "✓" : "✗";
      const error = attempt.error ? ` (${attempt.error})` : "";
      console.log(
        `[error-recovery]     ${status} Attempt ${attempt.attemptNumber}: ${(attempt.durationMs / 1000).toFixed(2)}s${error}`
      );
    }

    console.log(``);
  }

  console.log(`[error-recovery] ========================================`);
}

// =============================================
// Utility Functions
// =============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
