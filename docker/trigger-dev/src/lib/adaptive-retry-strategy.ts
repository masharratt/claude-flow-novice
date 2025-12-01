/**
 * Adaptive Retry Strategy - Phase 5 Task 5.2
 *
 * Integrates Phase 4 error pattern learning into validator error recovery.
 * Applies learned retry strategies with high probability of success when error
 * patterns are known; falls back to conservative strategies for unknown patterns.
 *
 * KEY FEATURES:
 * - Pattern-based strategy selection
 * - Adaptive retry parameters (attempts, backoff, timeout)
 * - Success tracking for continuous learning
 * - Conservative fallback for unknown patterns
 *
 * CONFIDENCE TARGET: 0.87+
 */

import type { ErrorPattern, RetryStrategy } from "./ruvector-error-pattern-learning.js";
import { analyzeErrorPatterns, suggestRetryStrategy } from "./ruvector-error-pattern-learning.js";
import type { RetryConfig } from "../trigger/cfn-validator-error-recovery.js";

// =============================================
// Type Definitions
// =============================================

export interface AdaptiveRetryConfig extends RetryConfig {
  timeoutMs?: number; // Optional timeout override
  confidence: number; // Confidence in this strategy (0.0-1.0)
  source: "learned" | "conservative" | "custom";
  patternKey?: string; // Error pattern key (if learned)
}

export interface RetryContext {
  validatorName: string;
  errorType: string;
  errorMessage?: string;
  attemptNumber: number;
  previousAttempts: number;
}

export interface StrategySelection {
  config: AdaptiveRetryConfig;
  reasoning: string;
  expectedSuccessRate: number; // 0.0-1.0
}

// =============================================
// Conservative Fallback Strategies
// =============================================

const CONSERVATIVE_STRATEGIES = {
  // Default conservative strategy
  default: {
    maxAttempts: 1,
    initialBackoffMs: 1000,
    backoffFactor: 2,
    timeoutMs: 300000, // 5 minutes
    confidence: 0.50,
    source: "conservative" as const,
  },

  // Timeout-specific conservative strategy
  timeout: {
    maxAttempts: 2,
    initialBackoffMs: 2000,
    backoffFactor: 2,
    timeoutMs: 600000, // 10 minutes (double normal timeout)
    confidence: 0.55,
    source: "conservative" as const,
  },

  // Critical validator conservative strategy (security, architecture)
  critical: {
    maxAttempts: 2,
    initialBackoffMs: 500,
    backoffFactor: 1.5,
    timeoutMs: 300000,
    confidence: 0.60,
    source: "conservative" as const,
  },
};

// =============================================
// Strategy Selection Logic
// =============================================

/**
 * Select adaptive retry strategy based on error context and learned patterns
 *
 * @param context - Retry context (validator name, error type, etc.)
 * @returns StrategySelection with config and reasoning
 */
export async function selectAdaptiveRetryStrategy(
  context: RetryContext
): Promise<StrategySelection> {
  const startTime = Date.now();

  console.log(
    `[adaptive-retry] Selecting strategy for ${context.validatorName}:${context.errorType} (attempt ${context.attemptNumber})`
  );

  // ===== STEP 1: CHECK FOR LEARNED PATTERN =====
  let learnedStrategy: RetryStrategy | null = null;
  let patternKey: string | undefined = undefined;

  try {
    learnedStrategy = await suggestRetryStrategy(context.validatorName, context.errorType);
    patternKey = `${context.validatorName}:${context.errorType}`;

    if (learnedStrategy.confidence > 0.70) {
      // High-confidence learned strategy
      console.log(
        `[adaptive-retry] ✓ Found high-confidence learned strategy (${(learnedStrategy.confidence * 100).toFixed(0)}%)`
      );
      console.log(
        `[adaptive-retry]   Rationale: ${learnedStrategy.rationale.substring(0, 80)}...`
      );

      return {
        config: {
          maxAttempts: learnedStrategy.maxAttempts,
          initialBackoffMs: learnedStrategy.initialBackoffMs,
          backoffFactor: learnedStrategy.backoffFactor,
          timeoutMs: learnedStrategy.timeoutMs,
          confidence: learnedStrategy.confidence,
          source: "learned",
          patternKey,
        },
        reasoning: `Learned strategy from ${learnedStrategy.rationale}`,
        expectedSuccessRate: learnedStrategy.confidence,
      };
    } else if (learnedStrategy.confidence > 0.50) {
      // Medium-confidence learned strategy
      console.log(
        `[adaptive-retry] ⚠ Found medium-confidence learned strategy (${(learnedStrategy.confidence * 100).toFixed(0)}%)`
      );

      // Blend learned strategy with conservative approach
      const blendedConfig = blendStrategies(
        learnedStrategy,
        CONSERVATIVE_STRATEGIES.default
      );

      return {
        config: {
          ...blendedConfig,
          confidence: learnedStrategy.confidence,
          source: "learned",
          patternKey,
        },
        reasoning: `Blended learned strategy (${(learnedStrategy.confidence * 100).toFixed(0)}% confidence) with conservative fallback`,
        expectedSuccessRate: learnedStrategy.confidence * 0.9, // Slightly lower due to blending
      };
    }
  } catch (error) {
    console.warn(
      `[adaptive-retry] Failed to fetch learned strategy: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // ===== STEP 2: SELECT CONSERVATIVE FALLBACK =====
  console.log(`[adaptive-retry] ⚠ No high-confidence learned pattern, using conservative strategy`);

  let conservativeStrategy: AdaptiveRetryConfig;

  if (context.errorType.toLowerCase().includes("timeout")) {
    conservativeStrategy = CONSERVATIVE_STRATEGIES.timeout;
    console.log(`[adaptive-retry]   Using timeout-specific conservative strategy`);
  } else if (
    context.validatorName.includes("security") ||
    context.validatorName.includes("architecture")
  ) {
    conservativeStrategy = CONSERVATIVE_STRATEGIES.critical;
    console.log(`[adaptive-retry]   Using critical validator conservative strategy`);
  } else {
    conservativeStrategy = CONSERVATIVE_STRATEGIES.default;
    console.log(`[adaptive-retry]   Using default conservative strategy`);
  }

  // Adjust based on previous attempt count
  if (context.previousAttempts > 0) {
    // Reduce attempts if already retried
    conservativeStrategy = {
      ...conservativeStrategy,
      maxAttempts: Math.max(1, conservativeStrategy.maxAttempts - context.previousAttempts),
      confidence: conservativeStrategy.confidence * 0.9, // Lower confidence after failures
    };
  }

  const duration = Date.now() - startTime;
  console.log(`[adaptive-retry] Strategy selection took ${duration}ms`);

  return {
    config: conservativeStrategy,
    reasoning: `Conservative fallback (no learned pattern with >50% confidence)`,
    expectedSuccessRate: conservativeStrategy.confidence,
  };
}

/**
 * Blend learned strategy with conservative fallback
 *
 * Uses more conservative values when learned strategy is uncertain
 */
function blendStrategies(
  learned: RetryStrategy,
  conservative: AdaptiveRetryConfig
): Omit<AdaptiveRetryConfig, "confidence" | "source" | "patternKey"> {
  return {
    // Use more conservative max attempts
    maxAttempts: Math.min(learned.maxAttempts, conservative.maxAttempts),

    // Use longer initial backoff (safer)
    initialBackoffMs: Math.max(learned.initialBackoffMs, conservative.initialBackoffMs),

    // Use smaller backoff factor (more predictable)
    backoffFactor: Math.min(learned.backoffFactor, conservative.backoffFactor),

    // Use longer timeout if available
    timeoutMs: learned.timeoutMs ?? conservative.timeoutMs,
  };
}

// =============================================
// Strategy Application Helpers
// =============================================

/**
 * Convert AdaptiveRetryConfig to standard RetryConfig for backwards compatibility
 */
export function toStandardRetryConfig(adaptive: AdaptiveRetryConfig): RetryConfig {
  return {
    maxAttempts: adaptive.maxAttempts,
    initialBackoffMs: adaptive.initialBackoffMs,
    backoffFactor: adaptive.backoffFactor,
  };
}

/**
 * Calculate backoff delay for current attempt
 *
 * @param config - Adaptive retry config
 * @param attemptNumber - Current attempt number (0-based)
 * @returns Backoff delay in milliseconds
 */
export function calculateBackoffDelay(config: AdaptiveRetryConfig, attemptNumber: number): number {
  return config.initialBackoffMs * Math.pow(config.backoffFactor, attemptNumber);
}

/**
 * Check if retry should be attempted based on config
 *
 * @param config - Adaptive retry config
 * @param attemptNumber - Current attempt number (0-based)
 * @returns True if retry should be attempted
 */
export function shouldRetry(config: AdaptiveRetryConfig, attemptNumber: number): boolean {
  return attemptNumber < config.maxAttempts;
}

// =============================================
// Success Tracking
// =============================================

/**
 * Track strategy effectiveness for continuous learning
 *
 * NOTE: This integrates with Phase 4 error pattern learning via RuVector
 */
export interface StrategyEffectiveness {
  patternKey: string;
  strategy: AdaptiveRetryConfig;
  success: boolean;
  attemptsUsed: number;
  totalDurationMs: number;
}

/**
 * Record strategy effectiveness for future learning
 *
 * This data feeds back into the error pattern analysis in Phase 4
 */
export async function recordStrategyEffectiveness(
  effectiveness: StrategyEffectiveness
): Promise<void> {
  console.log(
    `[adaptive-retry] Recording effectiveness: ${effectiveness.patternKey} → ${effectiveness.success ? "SUCCESS" : "FAILED"} (${effectiveness.attemptsUsed} attempts, ${effectiveness.totalDurationMs}ms)`
  );

  // TODO: Integrate with RuVector error library to update pattern success rates
  // This would update the ErrorPattern.successRate based on whether the strategy worked
  // For now, just log - Phase 6 can add persistence
}

// =============================================
// Exports
// =============================================

export {
  CONSERVATIVE_STRATEGIES,
  selectAdaptiveRetryStrategy as default,
};
