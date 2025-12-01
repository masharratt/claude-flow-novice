/**
 * RuVector Learning Hooks - Phase 4 Task 4.1
 *
 * Async data capture hooks for decomposition, validation, and error recovery.
 * Integrates with Phase 2 (Decomposition Swarm), Phase 3 (Async Validators),
 * and cfn-validator-error-recovery.ts to build learning feedback loops.
 *
 * Key Principles:
 * - Non-blocking async writes (fire-and-forget pattern)
 * - <10ms overhead on critical paths
 * - Graceful degradation if RuVector unavailable
 * - Linked data: decomposition → validation → errors
 * - CRITICAL: All external API calls validated with Zod schemas (sec-1.5)
 * - Network errors handled gracefully with timeouts and error typing
 *
 * Collections Written:
 * - decomposition_history: Task decompositions with quality metrics
 * - error_library: Error patterns from validation failures
 *
 * Reference: Phase 4 RuVector Learning Systems Integration
 */

import { z } from 'zod';
import { getCollection, COLLECTIONS } from './ruvector-init.js';
import type {
  DecompositionHistoryEntry,
  ErrorLibraryEntry,
} from './ruvector-schemas.js';
import type { DecompositionPlan } from '../trigger/cfn-decomposition-aggregator.js';
import type { OrchestratorResult } from '../trigger/cfn-async-validator-orchestrator.js';
import type { RetryAttempt } from '../trigger/cfn-validator-error-recovery.js';

// =============================================
// sec-1.5: API Response Validation Schemas
// =============================================

/**
 * Typed error classes for API failures
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public schemaError?: z.ZodError) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Generic API response schema for responses that may or may not have errors
 */
const ApiResponseBaseSchema = z.object({
  status: z.string().optional(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

/**
 * RuVector collection insert/update response schema
 */
const RuVectorResponseSchema = z.object({
  id: z.string().optional(),
  success: z.boolean().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Search response from RuVector (with array of results)
 */
const SearchResultSchema = z.object({
  id: z.string(),
  score: z.number(),
  metadata: z.record(z.unknown()).optional(),
  vector: z.instanceof(Float32Array).optional(),
});

const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  totalCount: z.number().optional(),
  error: z.string().optional(),
});

// =============================================
// Types for Hook Payloads
// =============================================

/**
 * Decomposition capture payload
 * Passed after Phase 2 completion, before Phase 3 validation
 */
export interface DecompositionCapturePayload {
  taskId: string;
  taskDescription: string;
  decompositionPlan: DecompositionPlan;
  executionTimeMs: number;
  gateCheckScore?: number; // Added after Phase 3
}

/**
 * Validation capture payload
 * Passed after Phase 3 gate check
 */
export interface ValidationCapturePayload {
  taskId: string;
  decompositionId: string; // Links to decomposition_history
  orchestratorResult: OrchestratorResult;
  gateDecision: 'PROCEED' | 'ITERATE' | 'ABORT';
}

/**
 * Error capture payload
 * Passed from cfn-validator-error-recovery.ts on failures
 */
export interface ErrorCapturePayload {
  taskId: string;
  errorType: 'TIMEOUT' | 'VALIDATION_FAILURE' | 'MALFORMED_RESPONSE';
  validatorName: string;
  taskDescription: string;
  errorDetail: string;
  retryHistory: RetryAttempt[];
  resolution: 'SUCCEEDED' | 'ESCALATED' | 'MANUAL';
}

// =============================================
// sec-1.5: Validated API Call Helpers
// =============================================

/**
 * Safely parse and validate API responses using Zod schema
 * @param response - Raw response from API
 * @param schema - Zod schema for validation
 * @param operationName - Name of operation for error messages
 * @returns Validated response
 * @throws ValidationError if validation fails
 */
function validateApiResponse<T>(
  response: unknown,
  schema: z.ZodSchema<T>,
  operationName: string
): T {
  const result = schema.safeParse(response);

  if (!result.success) {
    const errorDetails = result.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ');

    throw new ValidationError(
      `Invalid ${operationName} response: ${errorDetails}`,
      result.error
    );
  }

  return result.data;
}

/**
 * Make API call with timeout and error handling (sec-1.5 network resilience)
 * @param operation - Async function that makes the API call
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @param operationName - Name for logging
 * @returns Result of operation or throws typed error
 */
async function safeApiCall<T>(
  operation: () => Promise<T>,
  timeoutMs = 10000,
  operationName = 'API call'
): Promise<T> {
  try {
    // Create abort controller with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await Promise.race([
        operation(),
        new Promise<T>((_, reject) =>
          controller.signal.addEventListener('abort', () => {
            reject(
              new NetworkError(
                `${operationName} timed out after ${timeoutMs}ms`,
                new Error('AbortError')
              )
            );
          })
        ),
      ]);

      clearTimeout(timeoutId);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Categorize error types
    if (error instanceof NetworkError || error instanceof ValidationError || error instanceof ApiError) {
      throw error; // Re-throw typed errors
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new NetworkError(
        `Network request failed for ${operationName}: connectivity issue or fetch unavailable`,
        error
      );
    }

    if (error instanceof Error && error.message.includes('AbortError')) {
      throw new NetworkError(`${operationName} timeout: no response within ${timeoutMs}ms`);
    }

    // Generic error
    throw new ApiError(`${operationName} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// =============================================
// Task 4.1.1: Decomposition Capture Hook
// =============================================

/**
 * Capture decomposition data to RuVector (async, non-blocking)
 *
 * Called after Phase 2 decomposition completes, before Phase 3 validation.
 * Stores decomposition plan with initial quality metrics (final metrics
 * added via updateDecompositionWithValidation after gate check).
 *
 * SECURITY (sec-1.5): All RuVector API responses validated with Zod schemas.
 * Network errors handled gracefully with 10s timeout.
 *
 * @param payload - Decomposition capture data
 * @returns Promise<void> - Fire-and-forget, logs errors but doesn't throw
 *
 * @example
 * // In cfn-coordinator.ts after decomposition aggregator
 * captureDecompositionToRuVector({
 *   taskId: "task-123",
 *   taskDescription: input.prompt,
 *   decompositionPlan: mergedPlan,
 *   executionTimeMs: Date.now() - startTime,
 * }).catch(err => console.warn(`[learning] Decomposition capture failed: ${err.message}`));
 */
export async function captureDecompositionToRuVector(
  payload: DecompositionCapturePayload
): Promise<void> {
  const startTime = Date.now();

  try {
    const collection = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);

    // Generate embedding text (combined for semantic search)
    const embeddingText = `${payload.taskDescription} | Approach: Sequential Context Passing (Phase 2)`;

    // Extract quality metrics from decomposition plan
    const qualityMetrics = {
      taskCount: payload.decompositionPlan.microTasks.length,
      coverageScore: payload.decompositionPlan.swarmAnalysis.coverageGoal / 100,
      constraintCompleteness: 1.0, // Default (swarmAnalysis doesn't have this field)
    };

    // Create entry (validation scores added later via update)
    const entry: DecompositionHistoryEntry = {
      text: embeddingText,
      metadata: {
        taskId: payload.taskId,
        originalTask: payload.taskDescription,
        decompositionApproach: 'Sequential Context Passing (Phase 2)',
        microTaskCount: payload.decompositionPlan.microTasks.length,
        executionPhases: payload.decompositionPlan.executionPhases.length,

        // Initial gate check (unknown until Phase 3)
        gateCheckScore: payload.gateCheckScore ?? 0,
        gateCheckThreshold: 0.95, // Standard mode default
        finalDecision: 'ITERATE', // Updated later

        // Quality metrics from decomposition
        securityRiskLevel: payload.decompositionPlan.swarmAnalysis.securityRiskLevel,
        securityFindings: 0, // Updated after validation
        performanceGrade: 'Unknown',
        performanceScore: 0,

        // Timing
        timestamp: Date.now(),
        decompositionTimeMs: payload.executionTimeMs,
        executionTimeMs: 0, // Implementation time (tracked separately)
        totalTimeMs: payload.executionTimeMs,

        // Reusability (tracked over time)
        successRate: 0,
        timesUsed: 0,
        lastUsed: 0,

        // Tags for searching
        taskCategory: inferTaskCategory(payload.taskDescription),
        complexity: inferComplexity(payload.decompositionPlan),
        technologies: extractTechnologies(payload.taskDescription),
      },
    };

    // Insert into RuVector with validation (sec-1.5)
    // Note: RuVector auto-generates embeddings if text field provided
    const insertResult = await safeApiCall(
      async () => {
        // Mock the actual API call - in production this would be the real RuVector API
        const response = await collection.insert({
          id: payload.taskId,
          vector: new Float32Array(1536), // Placeholder, replaced by RuVector
          metadata: entry.metadata,
        });

        // Validate the response before using it
        return validateApiResponse(response, RuVectorResponseSchema, 'RuVector insert');
      },
      10000, // 10 second timeout
      'RuVector decomposition insert'
    );

    const captureTime = Date.now() - startTime;
    if (captureTime > 10) {
      console.warn(
        `[learning] ⚠️ Decomposition capture took ${captureTime}ms (>10ms threshold)`
      );
    }

    console.log(
      `[learning] ✓ Decomposition captured: ${payload.taskId} (${captureTime}ms)`
    );
  } catch (error) {
    // Non-blocking: log error but don't throw
    if (error instanceof ValidationError) {
      console.warn(
        `[learning] Failed to capture decomposition: Schema validation error: ${error.message}`
      );
    } else if (error instanceof NetworkError) {
      console.warn(
        `[learning] Failed to capture decomposition: Network error: ${error.message}`
      );
    } else if (error instanceof ApiError) {
      console.warn(
        `[learning] Failed to capture decomposition: API error (${error.statusCode}): ${error.message}`
      );
    } else {
      console.warn(
        `[learning] Failed to capture decomposition: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Update decomposition entry with validation results (async, non-blocking)
 *
 * Called after Phase 3 gate check completes.
 * Links validation scores to decomposition for learning feedback.
 *
 * SECURITY (sec-1.5): All RuVector API responses validated with Zod schemas.
 * Network errors handled gracefully with 10s timeout.
 *
 * @param payload - Validation capture data
 * @returns Promise<void> - Fire-and-forget
 */
export async function updateDecompositionWithValidation(
  payload: ValidationCapturePayload
): Promise<void> {
  try {
    const collection = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);

    // Extract validation scores from orchestrator result
    const validationScores = extractValidationScores(payload.orchestratorResult);

    // Update metadata with validation (sec-1.5)
    // RuVector supports partial updates
    const updateResult = await safeApiCall(
      async () => {
        const response = await collection.update(payload.decompositionId, {
          metadata: {
            gateCheckScore: payload.orchestratorResult.overallScore, // OrchestratorResult uses overallScore, not gateCheckScore
            finalDecision: payload.gateDecision,
            securityFindings: validationScores.securityFindings,
            performanceGrade: validationScores.performanceGrade,
            performanceScore: validationScores.performanceScore,
          },
        });

        // Validate the response
        return validateApiResponse(response, RuVectorResponseSchema, 'RuVector update');
      },
      10000, // 10 second timeout
      'RuVector validation update'
    );

    console.log(
      `[learning] ✓ Validation linked to decomposition: ${payload.decompositionId}`
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      console.warn(
        `[learning] Failed to update decomposition: Schema validation error: ${error.message}`
      );
    } else if (error instanceof NetworkError) {
      console.warn(
        `[learning] Failed to update decomposition: Network error: ${error.message}`
      );
    } else if (error instanceof ApiError) {
      console.warn(
        `[learning] Failed to update decomposition: API error (${error.statusCode}): ${error.message}`
      );
    } else {
      console.warn(
        `[learning] Failed to update decomposition with validation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// =============================================
// Task 4.1.2: Error Pattern Capture Hook
// =============================================

/**
 * Capture error pattern to RuVector (async, non-blocking)
 *
 * Called from cfn-validator-error-recovery.ts when validation fails.
 * Stores error type, retry history, and resolution for pattern learning.
 *
 * SECURITY (sec-1.5): All RuVector API responses validated with Zod schemas.
 * Network errors handled gracefully with 10s timeout.
 *
 * @param payload - Error capture data
 * @returns Promise<void> - Fire-and-forget
 *
 * @example
 * // In cfn-validator-error-recovery.ts after retry failure
 * captureErrorToRuVector({
 *   taskId: "task-123",
 *   errorType: "TIMEOUT",
 *   validatorName: "cfn-async-security-validator",
 *   taskDescription: "Security validation of micro-task 3",
 *   errorDetail: "Timed out after 120s",
 *   retryHistory: [...],
 *   resolution: "ESCALATED",
 * }).catch(err => console.warn(`[learning] Error capture failed: ${err.message}`));
 */
export async function captureErrorToRuVector(
  payload: ErrorCapturePayload
): Promise<void> {
  try {
    const collection = getCollection(COLLECTIONS.ERROR_LIBRARY);

    // Generate embedding text for error pattern matching
    const embeddingText = `${payload.errorDetail} | Root Cause: ${payload.errorType} | Validator: ${payload.validatorName}`;

    // Extract retry statistics
    const retryAttempts = payload.retryHistory.length;
    // Note: backoffMs not in RetryAttempt interface (calculated externally)
    const avgBackoffMs = 0; // Placeholder (retry backoff not tracked per attempt)

    // Create error library entry
    const entry: ErrorLibraryEntry = {
      text: embeddingText,
      metadata: {
        errorMessage: payload.errorDetail,
        errorType: payload.errorType,
        errorPattern: generateErrorPattern(payload.errorDetail),

        // Root cause analysis (basic for now, enhanced in Task 4.3)
        rootCause: `Validator ${payload.validatorName} failed with ${payload.errorType}`,
        rootCauseConfidence: 0.7, // Medium confidence (heuristic-based)
        fix: inferFixFromRetryHistory(payload.retryHistory, payload.resolution),
        fixSuccessRate: payload.resolution === 'SUCCEEDED' ? 1.0 : 0.0,
        prevention: `Monitor ${payload.validatorName} timeout thresholds`,

        // Statistics
        timesSeen: 1, // Incremented if pattern matches existing error
        firstSeen: Date.now(),
        lastSeen: Date.now(),

        // Component info
        component: payload.validatorName,
        language: 'TypeScript',
        framework: 'Trigger.dev',

        // Severity (inferred from error type)
        severity: inferSeverity(payload.errorType),
        environments: ['development'], // Inferred from execution context

        // Causality (enhanced in Task 4.3)
        causedBy: [],
        causes: [],
        causeConfidence: 0.5,
      },
    };

    // Insert error with validation (sec-1.5)
    const insertResult = await safeApiCall(
      async () => {
        const response = await collection.insert({
          id: `error-${payload.taskId}-${Date.now()}`,
          vector: new Float32Array(1536), // Placeholder
          metadata: entry.metadata,
        });

        // Validate the response
        return validateApiResponse(response, RuVectorResponseSchema, 'RuVector error insert');
      },
      10000, // 10 second timeout
      'RuVector error pattern insert'
    );

    console.log(`[learning] ✓ Error captured: ${payload.validatorName} (${payload.errorType})`);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.warn(
        `[learning] Failed to capture error: Schema validation error: ${error.message}`
      );
    } else if (error instanceof NetworkError) {
      console.warn(
        `[learning] Failed to capture error: Network error: ${error.message}`
      );
    } else if (error instanceof ApiError) {
      console.warn(
        `[learning] Failed to capture error: API error (${error.statusCode}): ${error.message}`
      );
    } else {
      console.warn(
        `[learning] Failed to capture error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// =============================================
// Helper Functions
// =============================================

/**
 * Infer task category from description
 */
function inferTaskCategory(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes('api') || lower.includes('endpoint'))
    return 'api-endpoint';
  if (lower.includes('database') || lower.includes('migration'))
    return 'database-migration';
  if (lower.includes('ui') || lower.includes('component'))
    return 'ui-component';
  if (lower.includes('test') || lower.includes('validation'))
    return 'testing';
  return 'general';
}

/**
 * Infer complexity from decomposition plan
 */
function inferComplexity(
  plan: DecompositionPlan
): 'simple' | 'moderate' | 'complex' {
  const taskCount = plan.microTasks.length;
  if (taskCount <= 3) return 'simple';
  if (taskCount <= 8) return 'moderate';
  return 'complex';
}

/**
 * Extract technologies from task description
 */
function extractTechnologies(description: string): string[] {
  const technologies: string[] = [];
  const lower = description.toLowerCase();

  const techMap: Record<string, string> = {
    typescript: 'TypeScript',
    python: 'Python',
    rust: 'Rust',
    react: 'React',
    postgres: 'PostgreSQL',
    redis: 'Redis',
    docker: 'Docker',
  };

  for (const [key, value] of Object.entries(techMap)) {
    if (lower.includes(key)) {
      technologies.push(value);
    }
  }

  return technologies;
}

/**
 * Extract validation scores from orchestrator result
 */
function extractValidationScores(result: OrchestratorResult): {
  securityFindings: number;
  performanceGrade: string;
  performanceScore: number;
} {
  // OrchestratorResult has validators array (ValidatorResult[])
  // Extract scores from individual validator results
  const securityValidator = result.validators.find(v => v.validatorType === 'security');
  const performanceValidator = result.validators.find(v => v.validatorType === 'performance');

  return {
    securityFindings: securityValidator?.findings.length ?? 0,
    performanceGrade: performanceValidator?.status === 'success' ? 'A' : 'F',
    performanceScore: result.overallScore * 100, // Convert 0-1 to 0-100
  };
}

/**
 * Generate regex pattern for error matching
 */
function generateErrorPattern(errorMessage: string): string {
  // Escape special regex characters except spaces
  const escaped = errorMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Replace numbers with \d+ for generalization
  const pattern = escaped.replace(/\d+/g, '\\d+');
  return pattern;
}

/**
 * Infer severity from error type
 */
function inferSeverity(
  errorType: 'TIMEOUT' | 'VALIDATION_FAILURE' | 'MALFORMED_RESPONSE'
): 'critical' | 'high' | 'medium' | 'low' {
  switch (errorType) {
    case 'MALFORMED_RESPONSE':
      return 'critical'; // Indicates validator code bug
    case 'VALIDATION_FAILURE':
      return 'high'; // Code quality issue
    case 'TIMEOUT':
      return 'medium'; // Performance issue
    default:
      return 'low';
  }
}

/**
 * Infer fix from retry history
 */
function inferFixFromRetryHistory(
  retryHistory: RetryAttempt[],
  resolution: 'SUCCEEDED' | 'ESCALATED' | 'MANUAL'
): string {
  if (resolution === 'SUCCEEDED') {
    return `Retry with exponential backoff succeeded after ${retryHistory.length} attempts`;
  }
  if (resolution === 'ESCALATED') {
    return `Escalated to gate check after ${retryHistory.length} failed retries`;
  }
  return 'Manual intervention required';
}
