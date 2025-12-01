/**
 * RuVector RAG Decomposition Learning - Phase 4 Task 4.2
 *
 * RAG (Retrieval-Augmented Generation) query system for finding similar
 * prior decompositions. Uses embedding-based similarity search to suggest
 * baseline decompositions for new tasks.
 *
 * Key Features:
 * - Semantic similarity search (<500ms latency SLA)
 * - Top-K prior decompositions with quality scores
 * - Adaptive prompting for decomposers (use successful priors as baseline)
 * - RAG recall tracking (relevance metrics)
 * - CRITICAL: All external API calls validated with Zod schemas (sec-1.5)
 * - Network errors handled gracefully with timeouts and error typing
 *
 * Integration Points:
 * - Called BEFORE Phase 2 decomposition (in cfn-coordinator.ts)
 * - Feeds prior context to cfn-thinking-decomposer.ts and other decomposers
 * - Tracks whether RAG suggestions improve decomposition quality
 *
 * Reference: Phase 4 RuVector Learning Systems Integration (Task 4.2)
 */

import { z } from 'zod';
import { getCollection, COLLECTIONS } from './ruvector-init.js';
import type { DecompositionHistoryEntry } from './ruvector-schemas.js';
import { measureSLA } from './sla-enforcement.js';

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
 * Search result validation schema
 */
const SearchResultSchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional(),
  vector: z.instanceof(Float32Array).optional(),
});

/**
 * Search response validation schema
 */
const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  totalCount: z.number().optional(),
  error: z.string().optional(),
});

/**
 * Metadata validation schema for decomposition results
 */
const MetadataSchema = z.object({
  taskId: z.string(),
  originalTask: z.string(),
  decompositionApproach: z.string(),
  microTaskCount: z.number(),
  executionPhases: z.number(),
  gateCheckScore: z.number(),
  finalDecision: z.string(),
  securityRiskLevel: z.string(),
  performanceGrade: z.string(),
  successRate: z.number(),
  timesUsed: z.number(),
  totalTimeMs: z.number(),
});

// =============================================
// Types
// =============================================

/**
 * RAG query result for similar decompositions
 */
export interface SimilarDecomposition {
  taskId: string;
  taskDescription: string;
  similarity: number; // 0.0-1.0 (cosine similarity)
  decompositionApproach: string;
  microTaskCount: number;
  executionPhases: number;
  gateCheckScore: number;
  qualityScore: number; // Composite: (gateCheckScore + successRate) / 2
  executionTimeMs: number;
  securityRiskLevel: string;
  performanceGrade: string;
  successRate: number;
  timesUsed: number;
}

/**
 * RAG query options
 */
export interface RagQueryOptions {
  topK?: number; // Number of similar decompositions to return (default: 3)
  minSimilarity?: number; // Minimum similarity threshold (default: 0.75)
  minQualityScore?: number; // Minimum quality score filter (default: 0.80)
  onlySuccessful?: boolean; // Only return PROCEED decisions (default: true)
}

/**
 * RAG query result with metadata
 */
export interface RagQueryResult {
  query: string;
  results: SimilarDecomposition[];
  totalFound: number;
  avgSimilarity: number;
  avgQualityScore: number;
  queryTimeMs: number;
  hasHighConfidencePrior: boolean; // At least one result with qualityScore > 0.90
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
// Task 4.2.1: RAG Similarity Search
// =============================================

/**
 * Find similar prior decompositions using RAG query
 *
 * Searches decomposition_history collection for semantically similar tasks.
 * Returns top-K results with similarity scores, quality metrics, and timing.
 *
 * SECURITY (sec-1.5): All RuVector API responses validated with Zod schemas.
 * Network errors handled gracefully with 10s timeout and SLA monitoring.
 *
 * @param taskDescription - New task description to match
 * @param options - Query options (topK, filters, thresholds)
 * @returns Promise<RagQueryResult> - Similar decompositions with metadata
 *
 * @example
 * const ragResult = await findSimilarDecompositions(
 *   "Create a REST API endpoint for user authentication",
 *   { topK: 3, minSimilarity: 0.75, onlySuccessful: true }
 * );
 *
 * if (ragResult.hasHighConfidencePrior) {
 *   console.log(`Found high-confidence prior: ${ragResult.results[0].taskId}`);
 *   // Feed to decomposer as baseline
 * }
 */
export async function findSimilarDecompositions(
  taskDescription: string,
  options: RagQueryOptions = {}
): Promise<RagQueryResult> {
  const startTime = Date.now();

  const {
    topK = 3,
    minSimilarity = 0.75,
    minQualityScore = 0.80,
    onlySuccessful = true,
  } = options;

  try {
    const collection = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);

    // Generate embedding for new task (RuVector handles this via text field)
    // For now, use placeholder embedding (real embedding via Cerebras in production)
    const queryEmbedding = await generateEmbedding(taskDescription);

    // Query RuVector with SLA tracking and validation (sec-1.5)
    const { result: searchResults, slaCheck } = await measureSLA(
      'phase4_rag_search',
      async () => {
        return await safeApiCall(
          async () => {
            const response = await collection.search({
              vector: queryEmbedding,
              k: topK * 2, // Fetch more to allow for filtering
              filter: {
                // Filter by quality and success
                gateCheckScore: { $gte: minQualityScore },
                ...(onlySuccessful && { finalDecision: 'PROCEED' }),
              },
            });

            // Validate the response
            return validateApiResponse(response, SearchResponseSchema, 'RuVector search');
          },
          10000, // 10 second timeout
          'RuVector decomposition search'
        );
      }
    );

    // Log query performance metrics
    console.log(
      `[rag-perf] RAG search completed: ${slaCheck.elapsed}ms | SLA: ${slaCheck.target}ms | Compliant: ${slaCheck.compliant ? '✓' : '✗'} | Results: ${searchResults.results.length}`
    );

    // Convert to SimilarDecomposition format with metadata validation
    const results: SimilarDecomposition[] = searchResults.results
      .filter((r) => r.score >= minSimilarity && r.metadata)
      .slice(0, topK)
      .map((r) => {
        // Validate metadata before accessing
        const validatedMetadata = validateApiResponse(
          r.metadata,
          MetadataSchema,
          'RuVector decomposition metadata'
        );

        return {
          taskId: validatedMetadata.taskId,
          taskDescription: validatedMetadata.originalTask,
          similarity: r.score,
          decompositionApproach: validatedMetadata.decompositionApproach,
          microTaskCount: validatedMetadata.microTaskCount,
          executionPhases: validatedMetadata.executionPhases,
          gateCheckScore: validatedMetadata.gateCheckScore,
          qualityScore: calculateQualityScore(validatedMetadata),
          executionTimeMs: validatedMetadata.totalTimeMs,
          securityRiskLevel: validatedMetadata.securityRiskLevel,
          performanceGrade: validatedMetadata.performanceGrade,
          successRate: validatedMetadata.successRate,
          timesUsed: validatedMetadata.timesUsed,
        };
      });

    const queryTimeMs = slaCheck.elapsed;

    // Calculate aggregate metrics
    const avgSimilarity =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
        : 0;
    const avgQualityScore =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length
        : 0;
    const hasHighConfidencePrior = results.some((r) => r.qualityScore > 0.9);

    // Log summary with quality metrics
    console.log(
      `[rag] ✓ Found ${results.length}/${searchResults.results.length} similar decompositions (query: ${queryTimeMs}ms, avg_similarity: ${avgSimilarity.toFixed(2)}, avg_quality: ${avgQualityScore.toFixed(2)})`
    );
    if (hasHighConfidencePrior) {
      console.log(
        `[rag]   High-confidence prior available: ${results[0].taskId} (quality: ${results[0].qualityScore.toFixed(2)})`
      );
    }

    // Log SLA compliance warning if needed
    if (!slaCheck.compliant) {
      console.warn(
        `[rag] ⚠️ RAG query SLA violation: ${queryTimeMs}ms > ${slaCheck.target}ms`
      );
    }

    return {
      query: taskDescription,
      results,
      totalFound: results.length,
      avgSimilarity,
      avgQualityScore,
      queryTimeMs,
      hasHighConfidencePrior,
    };
  } catch (error) {
    // Log detailed error information for security audit trail
    if (error instanceof ValidationError) {
      console.error(
        `[rag] Failed to query decompositions: Schema validation error: ${error.message}`
      );
    } else if (error instanceof NetworkError) {
      console.error(
        `[rag] Failed to query decompositions: Network error: ${error.message}`
      );
    } else if (error instanceof ApiError) {
      console.error(
        `[rag] Failed to query decompositions: API error (${error.statusCode}): ${error.message}`
      );
    } else {
      console.error(
        `[rag] Failed to query decompositions: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Return empty result on error (graceful degradation)
    return {
      query: taskDescription,
      results: [],
      totalFound: 0,
      avgSimilarity: 0,
      avgQualityScore: 0,
      queryTimeMs: Date.now() - startTime,
      hasHighConfidencePrior: false,
    };
  }
}

// =============================================
// Task 4.2.2: Adaptive Prompting with RAG
// =============================================

/**
 * Generate adaptive prompt for decomposer with RAG context
 *
 * If high-confidence prior decomposition exists, generate a prompt that
 * instructs the decomposer to use it as a baseline and refine for new context.
 *
 * @param taskDescription - New task description
 * @param ragResult - RAG query result with similar decompositions
 * @returns string - Enhanced prompt with RAG context
 *
 * @example
 * const ragResult = await findSimilarDecompositions(taskDescription);
 * const enhancedPrompt = generateAdaptivePrompt(taskDescription, ragResult);
 * // Feed to cfn-thinking-decomposer.ts
 */
export function generateAdaptivePrompt(
  taskDescription: string,
  ragResult: RagQueryResult
): string {
  // Base prompt (no RAG context)
  if (!ragResult.hasHighConfidencePrior || ragResult.results.length === 0) {
    return taskDescription; // Use original prompt
  }

  // Enhanced prompt with RAG baseline
  const priorDecomposition = ragResult.results[0];

  const adaptivePrompt = `
# Task Description
${taskDescription}

# Prior Successful Decomposition (Baseline)
A similar task was successfully completed with the following approach:

**Task**: ${priorDecomposition.taskDescription}
**Approach**: ${priorDecomposition.decompositionApproach}
**Micro-tasks**: ${priorDecomposition.microTaskCount}
**Execution Phases**: ${priorDecomposition.executionPhases}
**Quality Score**: ${priorDecomposition.qualityScore.toFixed(2)} (gate: ${priorDecomposition.gateCheckScore.toFixed(2)})
**Similarity**: ${(priorDecomposition.similarity * 100).toFixed(0)}%

# Adaptive Instructions
Given the successful prior decomposition above:
1. Use it as a baseline for the new task
2. Identify differences in requirements, constraints, or context
3. Refine the approach to address new task specifics
4. Maintain the same decomposition quality (micro-task granularity, phase structure)
5. If the new task is simpler, reduce scope; if more complex, add phases

# Additional Context
- Security Risk: ${priorDecomposition.securityRiskLevel}
- Performance: ${priorDecomposition.performanceGrade}
- Execution Time: ${(priorDecomposition.executionTimeMs / 1000).toFixed(1)}s
- Times Reused: ${priorDecomposition.timesUsed} (success rate: ${(priorDecomposition.successRate * 100).toFixed(0)}%)
`;

  return adaptivePrompt.trim();
}

// =============================================
// Task 4.2.3: RAG Recall Tracking
// =============================================

/**
 * Track RAG recall: How often RAG results were relevant to task
 *
 * Called after decomposition completes. Compares final decomposition quality
 * to RAG baseline suggestion. Updates RuVector metadata for learning feedback.
 *
 * SECURITY (sec-1.5): All RuVector API responses validated with Zod schemas.
 * Network errors handled gracefully with 10s timeout.
 *
 * @param taskId - Task ID of completed decomposition
 * @param ragResult - RAG query result used for baseline
 * @param finalGateCheckScore - Final gate check score after decomposition
 * @returns Promise<void> - Fire-and-forget
 */
export async function trackRagRecall(
  taskId: string,
  ragResult: RagQueryResult,
  finalGateCheckScore: number
): Promise<void> {
  const startTime = Date.now();

  try {
    if (!ragResult.hasHighConfidencePrior) {
      console.log('[rag-perf] Skipping RAG recall tracking: no high-confidence prior');
      return; // No baseline to track
    }

    const priorDecomposition = ragResult.results[0];

    // Did RAG improve decomposition quality?
    const improvementOverBaseline =
      finalGateCheckScore - priorDecomposition.gateCheckScore;

    // Update prior decomposition metadata with validation (sec-1.5)
    const collection = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);

    const currentTimesUsed = priorDecomposition.timesUsed;
    const currentSuccessRate = priorDecomposition.successRate;

    const newTimesUsed = currentTimesUsed + 1;
    const newSuccessRate =
      (currentSuccessRate * currentTimesUsed + (finalGateCheckScore >= 0.95 ? 1 : 0)) /
      newTimesUsed;

    // Update with SLA tracking and error handling (sec-1.5)
    const { result: updateResult, slaCheck } = await measureSLA(
      'phase4_rag_recall_update',
      async () => {
        return await safeApiCall(
          async () => {
            const response = await collection.update(priorDecomposition.taskId, {
              metadata: {
                timesUsed: newTimesUsed,
                successRate: newSuccessRate,
                lastUsed: Date.now(),
              },
            });

            // Validate the response
            return validateApiResponse(response, z.object({
              id: z.string().optional(),
              success: z.boolean().optional(),
              error: z.string().optional(),
            }), 'RuVector RAG recall update');
          },
          10000, // 10 second timeout
          'RuVector RAG recall update'
        );
      }
    );

    // Log performance metrics
    console.log(
      `[rag-perf] RAG recall update completed: ${slaCheck.elapsed}ms | SLA: ${slaCheck.target}ms | Compliant: ${slaCheck.compliant ? '✓' : '✗'}`
    );
    console.log(
      `[rag] ✓ RAG recall tracked: ${priorDecomposition.taskId} (improvement: ${improvementOverBaseline >= 0 ? '+' : ''}${improvementOverBaseline.toFixed(2)}, times_used: ${newTimesUsed}, success_rate: ${(newSuccessRate * 100).toFixed(1)}%)`
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      console.warn(
        `[rag] Failed to track RAG recall: Schema validation error: ${error.message}`
      );
    } else if (error instanceof NetworkError) {
      console.warn(
        `[rag] Failed to track RAG recall: Network error: ${error.message}`
      );
    } else if (error instanceof ApiError) {
      console.warn(
        `[rag] Failed to track RAG recall: API error (${error.statusCode}): ${error.message}`
      );
    } else {
      console.warn(
        `[rag] Failed to track RAG recall: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// =============================================
// Helper Functions
// =============================================

/**
 * Calculate composite quality score from metadata
 */
function calculateQualityScore(metadata: any): number {
  const gateScore = metadata.gateCheckScore ?? 0;
  const successRate = metadata.successRate ?? 0;
  return (gateScore + successRate) / 2;
}

/**
 * Generate embedding for task description
 *
 * In production: Use Cerebras embeddings via cerebras-provider.ts
 * For now: Mock with random embedding for testing
 *
 * @param text - Text to embed
 * @returns Promise<Float32Array> - 1536-dimensional embedding
 */
async function generateEmbedding(text: string): Promise<Float32Array> {
  // TODO: Integrate with Cerebras embeddings (Task 4.2 enhancement)
  // For now, return mock embedding based on text hash
  const hash = simpleHash(text);
  const embedding = new Float32Array(1536);

  for (let i = 0; i < 1536; i++) {
    embedding[i] = Math.sin((hash + i) * 0.01); // Deterministic mock
  }

  return embedding;
}

/**
 * Simple string hash for mock embeddings
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
