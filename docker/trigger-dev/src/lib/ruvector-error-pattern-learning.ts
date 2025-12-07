/**
 * RuVector Error Pattern Learning - Phase 4 Task 4.3
 *
 * Analyzes error_library collection to identify recurring patterns and suggest
 * retry strategies. Learns which validators fail most often, which error types
 * recur, and what fixes work best.
 *
 * Key Features:
 * - Pattern analysis: Group errors by validator + error type
 * - Frequency metrics: Which decomposers/validators fail most often
 * - Retry strategy suggestions: Historical effectiveness of fixes
 * - Pattern effectiveness tracking: Did suggested strategy help?
 *
 * Integration Points:
 * - Called from cfn-validator-error-recovery.ts BEFORE retry
 * - Suggests historical retry strategies based on error pattern
 * - Tracks whether suggested strategy resolves error
 *
 * Reference: Phase 4 RuVector Learning Systems Integration (Task 4.3)
 */

import { getCollection, COLLECTIONS } from './ruvector-init.js';
import type { ErrorLibraryEntry } from './ruvector-schemas.js';
import type { RetryConfig } from '../trigger/cfn-validator-error-recovery.js';

// =============================================
// Types
// =============================================

/**
 * Error pattern analysis result
 */
export interface ErrorPattern {
  key: string; // "validator:errorType" (e.g., "cfn-async-security-validator:TIMEOUT")
  validatorName: string;
  errorType: string;
  frequency: number; // Total occurrences
  frequencyPercent: number; // Percentage of all errors
  avgRetryAttempts: number; // Average retry attempts before resolution
  successRate: number; // Percentage resolved successfully (not escalated)
  suggestedStrategy: RetryStrategy;
  examples: ErrorExample[]; // Up to 3 example error messages
}

/**
 * Suggested retry strategy based on historical data
 */
export interface RetryStrategy {
  maxAttempts: number; // Suggested max retry attempts
  initialBackoffMs: number; // Suggested initial backoff
  backoffFactor: number; // Suggested backoff multiplier
  timeoutMs?: number; // Suggested timeout (if timeout errors)
  confidence: number; // Confidence in suggestion (0.0-1.0)
  rationale: string; // Why this strategy is suggested
}

/**
 * Example error from pattern
 */
export interface ErrorExample {
  taskId: string;
  errorMessage: string;
  resolution: 'SUCCEEDED' | 'ESCALATED' | 'MANUAL';
  retryAttempts: number;
}

/**
 * Error pattern analysis result
 */
export interface ErrorPatternAnalysis {
  patterns: ErrorPattern[];
  totalErrors: number;
  analysisTimeMs: number;
  mostCommonPattern?: ErrorPattern; // Highest frequency pattern
  highestFailureRate?: ErrorPattern; // Lowest success rate
}

// =============================================
// Task 4.3.1: Error Pattern Analysis
// =============================================

/**
 * Analyze error_library collection for recurring patterns
 *
 * Groups errors by validator + error type, calculates frequency, success rate,
 * and suggests retry strategies based on historical effectiveness.
 *
 * @param limit - Max patterns to return (default: 10)
 * @returns Promise<ErrorPatternAnalysis> - Error patterns with suggestions
 *
 * @example
 * const analysis = await analyzeErrorPatterns(10);
 * console.log(`Most common: ${analysis.mostCommonPattern?.key} (${analysis.mostCommonPattern?.frequencyPercent}%)`);
 * console.log(`Highest failure rate: ${analysis.highestFailureRate?.key} (${analysis.highestFailureRate?.successRate}%)`);
 */
export async function analyzeErrorPatterns(
  limit: number = 10
): Promise<ErrorPatternAnalysis> {
  const startTime = Date.now();

  try {
    const collection = getCollection(COLLECTIONS.ERROR_LIBRARY);

    // Fetch all errors (up to 1000 for analysis)
    // In production: Use query with aggregation for better performance
    const errors = await collection.search({
      vector: new Float32Array(1536), // Dummy vector (get all errors)
      k: 1000,
    });

    const totalErrors = errors.length;

    if (totalErrors === 0) {
      console.log('[error-learning] No errors in library (yet)');
      return {
        patterns: [],
        totalErrors: 0,
        analysisTimeMs: Date.now() - startTime,
      };
    }

    // Group by validator + error type
    // Type assertion: RuVector search returns objects with metadata
    const groupedErrors = groupBy(
      errors as Array<{ metadata: any }>,
      (e) => `${e.metadata.component}:${e.metadata.errorType}`
    );

    // Calculate statistics for each pattern
    const patterns: ErrorPattern[] = Object.entries(groupedErrors)
      .map(([key, group]) => {
        const [validatorName, errorType] = key.split(':');
        const frequency = group.length;
        const frequencyPercent = (frequency / totalErrors) * 100;

        // Calculate average retry attempts
        const avgRetryAttempts =
          group.reduce(
            (sum, e) => sum + (e.metadata.timesSeen ?? 1),
            0
          ) / group.length;

        // Calculate success rate
        const successCount = group.filter(
          (e) => e.metadata.fixSuccessRate === 1.0
        ).length;
        const successRate = (successCount / group.length) * 100;

        // Suggest retry strategy based on historical data
        const suggestedStrategy = recommendStrategy(group, errorType);

        // Extract example errors (up to 3)
        const examples: ErrorExample[] = group.slice(0, 3).map((e) => ({
          taskId: (e as any).id?.split('-')[1] || 'unknown', // Extract task ID from error ID (if available)
          errorMessage: e.metadata.errorMessage,
          resolution: inferResolution(e.metadata.fixSuccessRate),
          retryAttempts: e.metadata.timesSeen ?? 1,
        }));

        return {
          key,
          validatorName,
          errorType,
          frequency,
          frequencyPercent,
          avgRetryAttempts,
          successRate,
          suggestedStrategy,
          examples,
        };
      })
      .sort((a, b) => b.frequency - a.frequency) // Sort by frequency (descending)
      .slice(0, limit);

    const analysisTimeMs = Date.now() - startTime;

    // Identify most common and highest failure rate patterns
    const mostCommonPattern = patterns[0]; // Highest frequency (already sorted)
    const highestFailureRate = patterns.reduce((min, p) =>
      p.successRate < (min?.successRate ?? 100) ? p : min
    );

    console.log(
      `[error-learning] ✓ Analyzed ${totalErrors} errors → ${patterns.length} patterns (${analysisTimeMs}ms)`
    );
    if (mostCommonPattern) {
      console.log(
        `[error-learning]   Most common: ${mostCommonPattern.key} (${mostCommonPattern.frequency} occurrences, ${mostCommonPattern.frequencyPercent.toFixed(1)}%)`
      );
    }

    return {
      patterns,
      totalErrors,
      analysisTimeMs,
      mostCommonPattern,
      highestFailureRate,
    };
  } catch (error) {
    console.error(
      `[error-learning] Failed to analyze error patterns: ${error instanceof Error ? error.message : String(error)}`
    );

    return {
      patterns: [],
      totalErrors: 0,
      analysisTimeMs: Date.now() - startTime,
    };
  }
}

// =============================================
// Task 4.3.2: Suggest Retry Strategy from Pattern
// =============================================

/**
 * Suggest retry strategy for a specific error pattern
 *
 * Looks up historical error pattern and returns suggested retry configuration.
 * If no pattern found, returns conservative default.
 *
 * @param validatorName - Validator that failed
 * @param errorType - Type of error (TIMEOUT, VALIDATION_FAILURE, MALFORMED_RESPONSE)
 * @returns Promise<RetryStrategy> - Suggested retry config
 *
 * @example
 * const strategy = await suggestRetryStrategy("cfn-async-security-validator", "TIMEOUT");
 * console.log(`Suggested: ${strategy.maxAttempts} attempts, ${strategy.initialBackoffMs}ms backoff`);
 * // Apply to cfn-validator-error-recovery.ts
 */
export async function suggestRetryStrategy(
  validatorName: string,
  errorType: string
): Promise<RetryStrategy> {
  try {
    const analysis = await analyzeErrorPatterns(100); // Analyze all patterns
    const patternKey = `${validatorName}:${errorType}`;
    const pattern = analysis.patterns.find((p) => p.key === patternKey);

    if (pattern) {
      console.log(
        `[error-learning] ✓ Found pattern for ${patternKey} (${pattern.frequency} occurrences, ${pattern.successRate.toFixed(0)}% success)`
      );
      return pattern.suggestedStrategy;
    } else {
      console.log(
        `[error-learning] No pattern found for ${patternKey}, using default strategy`
      );
      return {
        maxAttempts: 2,
        initialBackoffMs: 100,
        backoffFactor: 2,
        confidence: 0.5,
        rationale: 'Default strategy (no historical data)',
      };
    }
  } catch (error) {
    console.warn(
      `[error-learning] Failed to suggest retry strategy: ${error instanceof Error ? error.message : String(error)}`
    );

    // Fallback to conservative default
    return {
      maxAttempts: 2,
      initialBackoffMs: 100,
      backoffFactor: 2,
      confidence: 0.3,
      rationale: 'Fallback strategy (query failed)',
    };
  }
}

// =============================================
// Task 4.3.3: Track Pattern Effectiveness
// =============================================

/**
 * Track whether suggested retry strategy was effective
 *
 * Called after retry attempt completes. Updates error pattern metadata
 * with effectiveness metrics (did the suggested strategy work?).
 *
 * @param validatorName - Validator that failed
 * @param errorType - Type of error
 * @param suggestedStrategy - Strategy that was applied
 * @param wasSuccessful - Whether retry succeeded
 * @returns Promise<void> - Fire-and-forget
 */
export async function trackStrategyEffectiveness(
  validatorName: string,
  errorType: string,
  suggestedStrategy: RetryStrategy,
  wasSuccessful: boolean
): Promise<void> {
  try {
    // TODO: Implement effectiveness tracking in RuVector
    // For now, log the outcome for manual analysis
    console.log(
      `[error-learning] Strategy effectiveness: ${validatorName}:${errorType} → ${wasSuccessful ? 'SUCCESS' : 'FAILURE'} (confidence: ${suggestedStrategy.confidence.toFixed(2)})`
    );

    // Future enhancement: Update error pattern metadata with effectiveness score
    // This requires additional schema fields: strategyEffectiveness, strategyUsageCount
  } catch (error) {
    console.warn(
      `[error-learning] Failed to track strategy effectiveness: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// =============================================
// Helper Functions
// =============================================

/**
 * Group array by key function
 */
function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

/**
 * Infer resolution from fix success rate
 */
function inferResolution(fixSuccessRate: number): 'SUCCEEDED' | 'ESCALATED' | 'MANUAL' {
  if (fixSuccessRate >= 0.8) return 'SUCCEEDED';
  if (fixSuccessRate > 0) return 'ESCALATED';
  return 'MANUAL';
}

/**
 * Recommend retry strategy based on historical error group
 *
 * Analyzes past errors to suggest optimal retry configuration:
 * - Timeouts: Increase timeout, reduce retries
 * - Validation failures: More retries with shorter backoff
 * - Malformed responses: Fewer retries (likely code bug)
 */
function recommendStrategy(
  errorGroup: any[],
  errorType: string
): RetryStrategy {
  const avgRetryAttempts =
    errorGroup.reduce(
      (sum, e) => sum + (e.metadata.timesSeen ?? 1),
      0
    ) / errorGroup.length;

  const successRate =
    errorGroup.filter((e) => e.metadata.fixSuccessRate === 1.0).length /
    errorGroup.length;

  switch (errorType) {
    case 'TIMEOUT':
      // Timeouts: Increase timeout, reduce retries (task likely too complex)
      return {
        maxAttempts: Math.min(Math.ceil(avgRetryAttempts), 2),
        initialBackoffMs: 200,
        backoffFactor: 2,
        timeoutMs: 180000, // 3 minutes (vs default 2 minutes)
        confidence: successRate,
        rationale: `Historical data: ${(successRate * 100).toFixed(0)}% success rate with avg ${avgRetryAttempts.toFixed(1)} retries. Timeouts suggest complex task; increase timeout.`,
      };

    case 'VALIDATION_FAILURE':
      // Validation failures: More retries with shorter backoff (transient issues)
      return {
        maxAttempts: Math.min(Math.ceil(avgRetryAttempts * 1.5), 4),
        initialBackoffMs: 100,
        backoffFactor: 1.5,
        confidence: successRate,
        rationale: `Historical data: ${(successRate * 100).toFixed(0)}% success rate. Validation failures often transient; retry with backoff.`,
      };

    case 'MALFORMED_RESPONSE':
      // Malformed responses: Fewer retries (likely code bug, retries won't help)
      return {
        maxAttempts: 1,
        initialBackoffMs: 100,
        backoffFactor: 2,
        confidence: successRate * 0.5, // Lower confidence (code bug likely)
        rationale: `Historical data: ${(successRate * 100).toFixed(0)}% success rate. Malformed responses suggest validator code bug; escalate quickly.`,
      };

    default:
      // Unknown error type: Conservative default
      return {
        maxAttempts: 2,
        initialBackoffMs: 100,
        backoffFactor: 2,
        confidence: 0.5,
        rationale: 'Unknown error type; using conservative default strategy.',
      };
  }
}

/**
 * Convert RetryStrategy to RetryConfig (cfn-validator-error-recovery.ts format)
 */
export function strategyToRetryConfig(strategy: RetryStrategy): RetryConfig {
  return {
    maxAttempts: strategy.maxAttempts,
    initialBackoffMs: strategy.initialBackoffMs,
    backoffFactor: strategy.backoffFactor,
  };
}

// =============================================
// Task 4.3.4: MDAP-Specific Error Capture
// =============================================

/**
 * MDAP failure record for detailed analysis
 */
export interface MDAPFailureRecord {
  microTaskId: string;
  modelName: string;
  tier: number;
  errorType: string;
  errorContext: string;
  retrySucceeded: boolean;
  escalatedToTier?: number;
  timestamp: number;
}

// In-memory MDAP failure store for quick analysis
const mdapFailureStore: MDAPFailureRecord[] = [];

/**
 * Capture MDAP implementation failure patterns
 *
 * Extends existing error pattern learning with MDAP-specific metadata
 * for tier escalation analysis and model performance tracking.
 *
 * @param microTaskId - Unique micro-task identifier
 * @param modelName - Model that failed (e.g., "openai/gpt-oss-20b")
 * @param tier - Model tier (1-3)
 * @param errorType - Category of error (TIMEOUT, TYPE_ERROR, PARSE_ERROR, etc.)
 * @param errorContext - Error message/context for pattern matching
 * @param retrySucceeded - Whether retry with same/escalated tier succeeded
 * @param escalatedToTier - Tier escalated to (if escalation occurred)
 *
 * @example
 * await captureMDAPFailure(
 *   "micro-task-123",
 *   "openai/gpt-oss-20b",
 *   1,
 *   "TYPE_ERROR",
 *   "Property 'foo' does not exist on type 'Bar'",
 *   false,
 *   2 // Escalated to T2
 * );
 */
export async function captureMDAPFailure(
  microTaskId: string,
  modelName: string,
  tier: number,
  errorType: string,
  errorContext: string,
  retrySucceeded: boolean,
  escalatedToTier?: number
): Promise<void> {
  try {
    // Store in memory for quick analysis
    mdapFailureStore.push({
      microTaskId,
      modelName,
      tier,
      errorType,
      errorContext: errorContext.slice(0, 500), // Truncate for storage
      retrySucceeded,
      escalatedToTier,
      timestamp: Date.now(),
    });

    // Keep store bounded (last 1000 entries)
    if (mdapFailureStore.length > 1000) {
      mdapFailureStore.splice(0, mdapFailureStore.length - 1000);
    }

    // Store in RuVector error_library collection
    const collection = getCollection(COLLECTIONS.ERROR_LIBRARY);

    // Build error pattern key for matching
    const patternKey = `MDAP:${modelName}:${errorType}`;

    // Create embedding text for semantic search
    const embeddingText = `${errorType} | Model: ${modelName} | Tier: ${tier} | Context: ${errorContext.slice(0, 200)}`;

    // Generate simple embedding (in production, use real embedding model)
    const embedding = generateSimpleEmbedding(embeddingText);

    // Insert into RuVector
    await collection.insert({
      id: `mdap-error-${microTaskId}-${Date.now()}`,
      vector: embedding,
      metadata: {
        errorMessage: errorContext.slice(0, 500),
        errorType,
        errorPattern: patternKey,
        rootCause: `MDAP tier ${tier} model ${modelName} failed`,
        rootCauseConfidence: 0.7,
        fix: retrySucceeded
          ? `Retry ${escalatedToTier ? `with tier escalation to T${escalatedToTier}` : 'succeeded'}`
          : 'Requires manual intervention or further escalation',
        fixSuccessRate: retrySucceeded ? 1.0 : 0.0,
        prevention: 'Consider starting at higher tier for similar tasks',
        timesSeen: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        component: `mdap-implementer:${modelName}`,
        language: 'TypeScript',
        framework: 'MDAP',
        severity: escalatedToTier === 3 && !retrySucceeded ? 'high' : 'medium',
        environments: ['development'],
        causedBy: [],
        causes: [],
        causeConfidence: 0.5,
        // MDAP-specific metadata
        mdapModelName: modelName,
        mdapTier: tier,
        mdapEscalatedTo: escalatedToTier,
        mdapRetrySucceeded: retrySucceeded,
      },
    });

    console.log(
      `[error-learning] ✓ Captured MDAP failure: ${modelName} (T${tier}) ` +
        `${errorType} → ${retrySucceeded ? 'RECOVERED' : 'UNRESOLVED'} ` +
        `${escalatedToTier ? `(escalated to T${escalatedToTier})` : ''}`
    );
  } catch (error) {
    console.error(
      `[error-learning] Failed to capture MDAP failure: ${error instanceof Error ? error.message : String(error)}`
    );
    // Non-blocking - continue operation even if capture fails
  }
}

/**
 * Analyze MDAP failure patterns for a specific model
 *
 * @param modelName - Model name to analyze
 * @param timeWindowHours - Time window for analysis (default: 24 hours)
 * @returns Analysis of failure patterns
 */
export async function analyzeMDAPFailurePatterns(
  modelName: string,
  timeWindowHours: number = 24
): Promise<{
  totalFailures: number;
  errorTypeBreakdown: Record<string, number>;
  escalationRate: number;
  recoveryRate: number;
  mostCommonError: string | null;
  recommendations: string[];
}> {
  const now = Date.now();
  const windowMs = timeWindowHours * 60 * 60 * 1000;

  // Filter failures for this model in time window
  const relevantFailures = mdapFailureStore.filter(
    (f) => f.modelName === modelName && now - f.timestamp < windowMs
  );

  if (relevantFailures.length === 0) {
    return {
      totalFailures: 0,
      errorTypeBreakdown: {},
      escalationRate: 0,
      recoveryRate: 0,
      mostCommonError: null,
      recommendations: ['No failure data available for analysis'],
    };
  }

  // Calculate metrics
  const errorTypeBreakdown: Record<string, number> = {};
  let escalations = 0;
  let recoveries = 0;

  for (const failure of relevantFailures) {
    errorTypeBreakdown[failure.errorType] = (errorTypeBreakdown[failure.errorType] || 0) + 1;
    if (failure.escalatedToTier) escalations++;
    if (failure.retrySucceeded) recoveries++;
  }

  const totalFailures = relevantFailures.length;
  const escalationRate = escalations / totalFailures;
  const recoveryRate = recoveries / totalFailures;

  // Find most common error
  let mostCommonError: string | null = null;
  let maxCount = 0;
  for (const [errorType, count] of Object.entries(errorTypeBreakdown)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonError = errorType;
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (escalationRate > 0.5) {
    recommendations.push(
      `High escalation rate (${(escalationRate * 100).toFixed(0)}%) - consider starting at higher tier`
    );
  }

  if (recoveryRate < 0.5) {
    recommendations.push(
      `Low recovery rate (${(recoveryRate * 100).toFixed(0)}%) - review task atomicity and prompt clarity`
    );
  }

  if (mostCommonError) {
    recommendations.push(`Most common error: ${mostCommonError} (${maxCount} occurrences)`);

    if (mostCommonError.includes('TYPE')) {
      recommendations.push('Add explicit type annotations to prompts');
    }
    if (mostCommonError.includes('TIMEOUT')) {
      recommendations.push('Reduce task complexity or increase timeout');
    }
    if (mostCommonError.includes('PARSE')) {
      recommendations.push('Simplify expected output format');
    }
  }

  return {
    totalFailures,
    errorTypeBreakdown,
    escalationRate,
    recoveryRate,
    mostCommonError,
    recommendations,
  };
}

/**
 * Get MDAP failure summary across all models
 */
export async function getMDAPFailureSummary(): Promise<{
  totalFailures: number;
  modelBreakdown: Record<string, number>;
  tierBreakdown: Record<number, number>;
  overallRecoveryRate: number;
}> {
  const modelBreakdown: Record<string, number> = {};
  const tierBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  let recoveries = 0;

  for (const failure of mdapFailureStore) {
    modelBreakdown[failure.modelName] = (modelBreakdown[failure.modelName] || 0) + 1;
    tierBreakdown[failure.tier] = (tierBreakdown[failure.tier] || 0) + 1;
    if (failure.retrySucceeded) recoveries++;
  }

  return {
    totalFailures: mdapFailureStore.length,
    modelBreakdown,
    tierBreakdown,
    overallRecoveryRate: mdapFailureStore.length > 0 ? recoveries / mdapFailureStore.length : 0,
  };
}

/**
 * Generate simple embedding for text (placeholder - use real embedding model in production)
 */
function generateSimpleEmbedding(text: string): Float32Array {
  const embedding = new Float32Array(1536);
  const words = text.toLowerCase().split(/\W+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const index = (word.charCodeAt(j) * (i + 1) * (j + 1)) % 1536;
      embedding[index] += 0.1;
    }
  }

  // Normalize
  let magnitude = 0;
  for (let i = 0; i < embedding.length; i++) {
    magnitude += embedding[i] * embedding[i];
  }
  magnitude = Math.sqrt(magnitude);
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}
