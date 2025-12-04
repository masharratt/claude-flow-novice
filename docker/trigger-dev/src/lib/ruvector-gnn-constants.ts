/**
 * RuVector GNN Constants and Configuration
 *
 * Centralized configuration for all GNN-related magic numbers, tuning parameters,
 * and magic strings. Replaces hard-coded values across GNN implementations.
 *
 * All values are compile-time constants (const assertion) for type safety.
 */

/**
 * Global GNN configuration constants
 * Centralized here to avoid magic numbers across GNN implementations
 */
export const GNN_CONSTANTS = {
  // Embedding configuration
  EMBEDDING_DIMENSION: 1536 as const,
  EMBEDDING_VECTOR_TYPE: 'Float32Array' as const,

  // Message passing configuration
  MAX_MESSAGE_PASSING_HOPS: 3 as const,
  DEFAULT_MESSAGE_PASSING_HOPS: 2 as const,

  // Graph traversal
  MAX_GRAPH_TRAVERSAL_DEPTH: 3 as const,
  DEFAULT_TRAVERSAL_HOPS: 2 as const,

  // Confidence and scoring
  DEFAULT_CONFIDENCE_THRESHOLD: 0.5 as const,
  MAX_CONFIDENCE_THRESHOLD: 1.0 as const,
  MIN_CONFIDENCE_THRESHOLD: 0.0 as const,

  // Weight factors for embedding updates
  EMBEDDING_UPDATE_WEIGHT: 0.5 as const,
  NEIGHBOR_INFLUENCE_WEIGHT: 0.3 as const,

  // Clustering and similarity
  DEFAULT_SIMILARITY_THRESHOLD: 0.7 as const,
  MIN_CLUSTER_SIZE: 2 as const,
  MAX_CLUSTER_SIZE: 100 as const,

  // Performance and optimization
  DEFAULT_COLLECTION_LIMIT: 50 as const,
  MAX_COLLECTION_LIMIT: 1000 as const,
  BATCH_PROCESSING_SIZE: 10 as const,

  // Edge strength calculation
  MIN_EDGE_STRENGTH: 0.0 as const,
  MAX_EDGE_STRENGTH: 1.0 as const,
  BASE_STRENGTH_FACTOR: 0.5 as const,

  // Timeout and scheduling
  DEFAULT_QUERY_TIMEOUT_MS: 30000 as const,
  CACHE_EXPIRY_MS: 3600000 as const, // 1 hour

  // Root cause prediction
  DEFAULT_ROOT_CAUSE_CONFIDENCE: 0.5 as const,
  ROOT_CAUSE_MINIMUM_HOPS: 1 as const,

  // Performance pattern scoring
  PERFORMANCE_METRIC_WEIGHT: 0.6 as const,
  FREQUENCY_WEIGHT: 0.4 as const,

  // Security pattern detection
  VULNERABILITY_CONFIDENCE_MULTIPLIER: 1.2 as const,
  SECURITY_PATTERN_MIN_OCCURRENCES: 2 as const,

  // File clustering
  DEFAULT_FILE_CLUSTER_THRESHOLD: 0.6 as const,
  MAX_FILES_PER_CLUSTER: 50 as const,

  // Learning and optimization
  LEARNING_RATE_BASE: 0.01 as const,
  MOMENTUM_FACTOR: 0.9 as const,

  // Metadata extraction
  DEFAULT_METADATA_LIMIT: 100 as const,
} as const;

/**
 * Type-safe constant assertions
 * Ensures type inference works correctly for const objects
 */
export type GNNConstantsType = typeof GNN_CONSTANTS;

/**
 * Helper function to get embedding dimension
 * Used consistently across all GNN modules
 */
export function getEmbeddingDimension(): number {
  return GNN_CONSTANTS.EMBEDDING_DIMENSION;
}

/**
 * Helper function to create zero-filled embedding vector
 */
export function createZeroEmbedding(): Float32Array {
  return new Float32Array(GNN_CONSTANTS.EMBEDDING_DIMENSION);
}

/**
 * Helper function to validate embedding dimension
 */
export function validateEmbeddingDimension(embedding: Float32Array | number[]): boolean {
  return embedding.length === GNN_CONSTANTS.EMBEDDING_DIMENSION;
}

/**
 * Helper function to calculate edge strength from frequency
 * Used in error causality, performance, and vulnerability prediction
 */
export function calculateEdgeStrengthFromFrequency(frequency: number): number {
  // Linear scaling: frequency -> strength (0.0-1.0)
  // Higher frequency = higher strength
  return Math.min(
    GNN_CONSTANTS.MAX_EDGE_STRENGTH,
    Math.max(
      GNN_CONSTANTS.MIN_EDGE_STRENGTH,
      GNN_CONSTANTS.BASE_STRENGTH_FACTOR * Math.log(frequency + 1) / Math.log(10)
    )
  );
}

/**
 * Helper function to validate confidence score
 */
export function validateConfidenceScore(confidence: number): boolean {
  return (
    confidence >= GNN_CONSTANTS.MIN_CONFIDENCE_THRESHOLD &&
    confidence <= GNN_CONSTANTS.MAX_CONFIDENCE_THRESHOLD
  );
}

/**
 * Helper function to validate traversal depth
 */
export function validateTraversalDepth(depth: number): boolean {
  return depth >= GNN_CONSTANTS.ROOT_CAUSE_MINIMUM_HOPS &&
         depth <= GNN_CONSTANTS.MAX_MESSAGE_PASSING_HOPS;
}

/**
 * Helper function to normalize confidence to valid range
 */
export function normalizeConfidence(value: number): number {
  return Math.max(
    GNN_CONSTANTS.MIN_CONFIDENCE_THRESHOLD,
    Math.min(GNN_CONSTANTS.MAX_CONFIDENCE_THRESHOLD, value)
  );
}

/**
 * Helper function to calculate combined weight
 */
export function calculateCombinedWeight(metric: number, frequency: number): number {
  return (
    (GNN_CONSTANTS.PERFORMANCE_METRIC_WEIGHT * metric) +
    (GNN_CONSTANTS.FREQUENCY_WEIGHT * frequency)
  );
}

/**
 * Query configuration helper
 */
export function getQueryConfig(limit?: number): { limit: number } {
  const finalLimit = limit ?? GNN_CONSTANTS.DEFAULT_COLLECTION_LIMIT;
  return {
    limit: Math.min(finalLimit, GNN_CONSTANTS.MAX_COLLECTION_LIMIT),
  };
}
