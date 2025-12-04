/**
 * RuVector GNN Implementation Index
 *
 * Central export point for all GNN-enhanced RuVector features.
 * Re-exports types and functions from 5 core modules for convenient access.
 *
 * Usage:
 * ```typescript
 * import {
 *   buildErrorCausalityGraph,
 *   predictRootCause,
 *   buildFileDependencyGraph,
 *   rankFileClusters,
 *   // ... other imports
 * } from './ruvector-gnn-index.js';
 * ```
 */

// =============================================
// Error Causality Chain Traversal
// =============================================

export type {
  ErrorCausalityNode,
  ErrorCausalityEdge,
  CausalityPath,
  RootCausePrediction,
  ErrorCausalityGNNLayer,
} from './ruvector-gnn-error-causality.js';

export {
  buildErrorCausalityGraph,
  messagePassingGNN,
  predictRootCause,
} from './ruvector-gnn-error-causality.js';

// =============================================
// File Dependency Clustering
// =============================================

export type {
  FileNode,
  AttentionEdge,
  FileCluster,
  RankedFile,
  ClusterRankingResult,
  FileAttentionGNNLayer,
} from './ruvector-gnn-file-clustering.js';

export {
  buildFileDependencyGraph,
  fileAttentionGNN,
  clusterFilesByAttention,
  rankFileClusters,
} from './ruvector-gnn-file-clustering.js';

// =============================================
// Vulnerability Co-occurrence Prediction
// =============================================

export type {
  VulnerabilityNode,
  CooccurrenceEdge,
  LinkPrediction,
  VulnerabilityPattern,
  VulnerabilityPredictionResult,
  VulnerabilityGNNLayer,
} from './ruvector-gnn-vulnerability-prediction.js';

export {
  buildVulnerabilityGraph,
  linkPredictionGNN,
  predictVulnerabilities,
  discoverVulnerabilityPatterns,
  analyzeVulnerabilityPredictions,
} from './ruvector-gnn-vulnerability-prediction.js';

// =============================================
// Decomposition Strategy Selection
// =============================================

export type {
  TaskNode,
  TechnologyNode,
  OutcomeNode,
  StrategyEdge,
  DecompositionStrategyRecommendation,
  StrategySelectionResult,
  DecompositionGNNLayer,
} from './ruvector-gnn-decomposition-strategy.js';

export {
  buildDecompositionGraph,
  buildDecompositionGNN,
  recommendDecompositionStrategy,
  extractDecompositionPatterns,
} from './ruvector-gnn-decomposition-strategy.js';

// =============================================
// Performance Issue Clustering
// =============================================

export type {
  PerformanceIssueNode,
  IssueCooccurrenceEdge,
  PerformanceCluster,
  ClusterAnalysisResult,
  ClusterRootCauseAnalysis,
  PerformanceGNNLayer,
} from './ruvector-gnn-performance-clustering.js';

export {
  buildPerformanceGraph,
  detectCommunities,
  analyzePerformanceClusters,
  analyzeClusterRootCauses,
} from './ruvector-gnn-performance-clustering.js';

// =============================================
// Convenience Type Aliases
// =============================================

/**
 * All graph types across modules
 */
export type AnyGraphType =
  | { nodes: Map<string, ErrorCausalityNode>; edges: Map<string, ErrorCausalityEdge[]> }
  | { nodes: Map<string, FileNode>; edges: Map<string, AttentionEdge[]> }
  | { nodes: Map<string, VulnerabilityNode>; edges: Map<string, CooccurrenceEdge[]> }
  | {
      tasks: Map<string, TaskNode>;
      technologies: Map<string, TechnologyNode>;
      outcomes: Map<string, OutcomeNode>;
      edges: StrategyEdge[];
    }
  | { nodes: Map<string, PerformanceIssueNode>; edges: Map<string, IssueCooccurrenceEdge[]> };

/**
 * All GNN layer types across modules
 */
export type AnyGNNLayer =
  | ErrorCausalityGNNLayer
  | FileAttentionGNNLayer
  | VulnerabilityGNNLayer
  | DecompositionGNNLayer
  | PerformanceGNNLayer;

/**
 * All result/recommendation types across modules
 */
export type AnyRecommendation =
  | RootCausePrediction
  | ClusterRankingResult
  | VulnerabilityPredictionResult
  | StrategySelectionResult
  | ClusterAnalysisResult;

/**
 * Configuration object for any GNN operation
 */
export interface GNNConfig {
  /** Maximum nodes to fetch from collection */
  limit?: number;

  /** Embedding dimension (varies by module) */
  embeddingDim?: number;

  /** Number of hops/iterations for algorithms */
  iterations?: number;

  /** Confidence threshold for predictions */
  threshold?: number;

  /** Resolution parameter (modularity optimization) */
  resolution?: number;
}

// =============================================
// Version Information
// =============================================

/**
 * RuVector GNN Implementation Version
 */
export const GNN_VERSION = '1.0.0' as const;

/**
 * Supported modules
 */
export const GNN_MODULES = [
  'error-causality',
  'file-clustering',
  'vulnerability-prediction',
  'decomposition-strategy',
  'performance-clustering',
] as const;

export type GNNModule = (typeof GNN_MODULES)[number];

// =============================================
// Documentation
// =============================================

/**
 * RuVector GNN Implementation Index
 *
 * This module provides centralized access to 5 GNN-enhanced RuVector features:
 *
 * 1. **Error Causality Chain Traversal** - Predict root causes via message passing
 *    - Functions: buildErrorCausalityGraph, messagePassingGNN, predictRootCause
 *    - Types: ErrorCausalityNode, ErrorCausalityEdge, RootCausePrediction
 *
 * 2. **File Dependency Clustering** - Group files with graph attention
 *    - Functions: buildFileDependencyGraph, fileAttentionGNN, clusterFilesByAttention, rankFileClusters
 *    - Types: FileNode, AttentionEdge, FileCluster
 *
 * 3. **Vulnerability Co-occurrence Prediction** - Predict related vulnerabilities
 *    - Functions: buildVulnerabilityGraph, linkPredictionGNN, predictVulnerabilities
 *    - Types: VulnerabilityNode, CooccurrenceEdge, LinkPrediction
 *
 * 4. **Decomposition Strategy Selection** - Recommend task decomposition approaches
 *    - Functions: buildDecompositionGraph, buildDecompositionGNN, recommendDecompositionStrategy
 *    - Types: TaskNode, TechnologyNode, DecompositionStrategyRecommendation
 *
 * 5. **Performance Issue Clustering** - Find related performance issues
 *    - Functions: buildPerformanceGraph, detectCommunities, analyzePerformanceClusters
 *    - Types: PerformanceIssueNode, IssueCooccurrenceEdge, PerformanceCluster
 *
 * @example
 * ```typescript
 * import { buildErrorCausalityGraph, predictRootCause } from './ruvector-gnn-index.js';
 *
 * const graph = await buildErrorCausalityGraph(500);
 * const prediction = predictRootCause(graph, errorId, 3);
 * console.log(`Root cause: ${prediction.rootCause.errorMessage}`);
 * ```
 *
 * @see /docker/trigger-dev/src/lib/RUVECTOR_GNN_IMPLEMENTATION.md for detailed documentation
 */

// =============================================
// Helper Utilities (Optional)
// =============================================

/**
 * Create default configuration for any GNN operation
 */
export function createDefaultGNNConfig(): GNNConfig {
  return {
    limit: 500,
    embeddingDim: 16,
    iterations: 10,
    threshold: 0.5,
    resolution: 1.0,
  };
}

/**
 * Validate GNN configuration
 */
export function validateGNNConfig(config: Partial<GNNConfig>): boolean {
  if (config.limit !== undefined && (config.limit < 1 || config.limit > 10000)) return false;
  if (config.embeddingDim !== undefined && (config.embeddingDim < 4 || config.embeddingDim > 64)) return false;
  if (config.iterations !== undefined && (config.iterations < 1 || config.iterations > 100)) return false;
  if (config.threshold !== undefined && (config.threshold < 0 || config.threshold > 1)) return false;
  if (config.resolution !== undefined && (config.resolution < 0 || config.resolution > 2)) return false;
  return true;
}

// =============================================
// Shared Utilities
// =============================================

export { hashString, VectorMath } from './ruvector-gnn-utils.js';
