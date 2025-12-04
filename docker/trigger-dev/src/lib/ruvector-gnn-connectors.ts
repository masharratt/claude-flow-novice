/**
 * RuVector GNN Collection Connectors
 *
 * Provides integration layer between GNN features and existing RuVector collections.
 * Connects GNN layers to semantic search, graph traversal, and relationship learning.
 *
 * Collections Connected:
 * - decomposition_history: Task decomposition graph learning
 * - codebase_index: File dependency graph with GNN-enhanced search
 * - error_library: Error causality chain traversal
 * - security_patterns: Vulnerability co-occurrence graphs
 * - performance_patterns: Issue co-occurrence graphs
 *
 * Reference: docker/trigger-dev/src/lib/ruvector-schemas.ts
 */

import { RuvectorLayer, TensorCompress, differentiableSearch } from '@ruvector/gnn';
import { getCollection, COLLECTIONS } from './ruvector-init';
import type {
  DecompositionHistoryEntry,
  CodebaseIndexEntry,
  ErrorLibraryEntry,
  SecurityPatternEntry,
  PerformancePatternEntry
} from './ruvector-schemas';

/**
 * GNN Configuration for Collection Integration
 */
export interface GNNCollectionConfig {
  /** Input dimension (must match embedding dimension) */
  inputDim: number;
  /** Hidden dimension for GNN layers */
  hiddenDim: number;
  /** Number of attention heads */
  attentionHeads: number;
  /** Dropout rate (0.0-1.0) */
  dropout: number;
  /** Enable tensor compression */
  enableCompression: boolean;
  /** Search temperature for differentiable search */
  searchTemperature: number;
}

/**
 * Default GNN configuration
 * Matches OpenAI ada-002 / text-embedding-3-small dimension (1536)
 */
export const DEFAULT_GNN_CONFIG: GNNCollectionConfig = {
  inputDim: 1536,
  hiddenDim: 768, // Half of input for memory efficiency
  attentionHeads: 8, // Multi-head attention
  dropout: 0.1, // Standard dropout
  enableCompression: true,
  searchTemperature: 1.0 // No temperature scaling by default
};

/**
 * Graph Traversal Result
 * Represents a path through the graph with confidence scores
 */
export interface GraphTraversalResult {
  /** Node IDs in traversal order */
  path: string[];
  /** Confidence scores at each hop (0.0-1.0) */
  confidences: number[];
  /** Final aggregated embedding */
  finalEmbedding: number[];
  /** Total path confidence (product of hop confidences) */
  totalConfidence: number;
}

/**
 * Batch Operation Result
 */
export interface BatchOperationResult<T> {
  /** Successfully processed items */
  successes: Array<{ id: string; data: T }>;
  /** Failed items with error messages */
  failures: Array<{ id: string; error: string }>;
  /** Processing statistics */
  stats: {
    total: number;
    succeeded: number;
    failed: number;
    durationMs: number;
  };
}

/**
 * GNN-Enhanced Collection Connector Base Class
 *
 * Provides common GNN operations for all collection types:
 * - Graph traversal with multi-hop attention
 * - Batch embedding compression
 * - Differentiable semantic search
 */
export abstract class GNNCollectionConnector<T> {
  protected gnnLayer: RuvectorLayer;
  protected compressor: TensorCompress;
  protected config: GNNCollectionConfig;
  protected collectionName: string;

  constructor(collectionName: string, config: Partial<GNNCollectionConfig> = {}) {
    this.collectionName = collectionName;
    this.config = { ...DEFAULT_GNN_CONFIG, ...config };

    // Initialize GNN layer
    this.gnnLayer = new RuvectorLayer(
      this.config.inputDim,
      this.config.hiddenDim,
      this.config.attentionHeads,
      this.config.dropout
    );

    // Initialize compressor if enabled
    if (this.config.enableCompression) {
      this.compressor = new TensorCompress();
    }
  }

  /**
   * Get the underlying RuVector collection
   */
  protected getCollection() {
    return getCollection(this.collectionName);
  }

  /**
   * Abstract method: Extract embedding from entry
   * Must be implemented by subclasses
   */
  protected abstract extractEmbedding(entry: T): number[];

  /**
   * Abstract method: Extract graph neighbors from entry
   * Must be implemented by subclasses
   */
  protected abstract extractNeighbors(entry: T): string[];

  /**
   * Perform multi-hop graph traversal with GNN aggregation
   *
   * @param startNodeId - Starting node identifier
   * @param maxHops - Maximum number of hops (default: 3)
   * @param topK - Number of neighbors to consider at each hop (default: 5)
   * @returns Graph traversal result with aggregated embeddings
   */
  async traverseGraph(
    startNodeId: string,
    maxHops: number = 3,
    topK: number = 5
  ): Promise<GraphTraversalResult> {
    const collection = this.getCollection();
    const path: string[] = [startNodeId];
    const confidences: number[] = [1.0]; // Start node has perfect confidence

    // Fetch start node
    const startNode = await collection.get(startNodeId);
    if (!startNode) {
      throw new Error(`Start node not found: ${startNodeId}`);
    }

    let currentEmbedding = this.extractEmbedding(startNode);
    const visitedNodes = new Set<string>([startNodeId]);

    // Multi-hop traversal
    for (let hop = 0; hop < maxHops; hop++) {
      // Get neighbors of current node
      const currentNode = await collection.get(path[path.length - 1]);
      const neighborIds = this.extractNeighbors(currentNode);

      // Filter out visited nodes
      const unvisitedNeighborIds = neighborIds.filter(id => !visitedNodes.has(id));

      if (unvisitedNeighborIds.length === 0) {
        break; // No more unvisited neighbors
      }

      // Fetch neighbor embeddings
      const neighborEmbeddings: number[][] = [];
      const validNeighborIds: string[] = [];

      for (const neighborId of unvisitedNeighborIds.slice(0, topK)) {
        const neighbor = await collection.get(neighborId);
        if (neighbor) {
          neighborEmbeddings.push(this.extractEmbedding(neighbor));
          validNeighborIds.push(neighborId);
        }
      }

      if (neighborEmbeddings.length === 0) {
        break; // No valid neighbors
      }

      // Use differentiable search to find best neighbor
      const searchResult = differentiableSearch(
        currentEmbedding,
        neighborEmbeddings,
        1, // Top-1 neighbor
        this.config.searchTemperature
      );

      const bestNeighborIdx = searchResult.indices[0];
      const bestNeighborId = validNeighborIds[bestNeighborIdx];
      const hopConfidence = searchResult.weights[0];

      // GNN forward pass: aggregate current node with best neighbor
      const edgeWeights = [1.0 - hopConfidence, hopConfidence]; // Weight current vs neighbor
      currentEmbedding = this.gnnLayer.forward(
        currentEmbedding,
        [currentEmbedding, neighborEmbeddings[bestNeighborIdx]],
        edgeWeights
      );

      // Update path
      path.push(bestNeighborId);
      confidences.push(hopConfidence);
      visitedNodes.add(bestNeighborId);
    }

    // Calculate total confidence (product of hop confidences)
    const totalConfidence = confidences.reduce((acc, conf) => acc * conf, 1.0);

    return {
      path,
      confidences,
      finalEmbedding: currentEmbedding,
      totalConfidence
    };
  }

  /**
   * Batch process embeddings with optional compression
   *
   * @param entries - Array of entries to process
   * @param accessFrequencies - Access frequency for each entry (for compression)
   * @returns Batch operation result
   */
  async batchProcessEmbeddings(
    entries: Array<{ id: string; data: T }>,
    accessFrequencies?: number[]
  ): Promise<BatchOperationResult<{ embedding: number[] | string; compressed: boolean }>> {
    const startTime = Date.now();
    const successes: Array<{ id: string; data: any }> = [];
    const failures: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < entries.length; i++) {
      const { id, data } = entries[i];
      try {
        const embedding = this.extractEmbedding(data);
        const accessFreq = accessFrequencies?.[i] ?? 0.5; // Default: medium frequency

        // Compress if enabled and access frequency is low
        if (this.config.enableCompression && accessFreq < 0.8) {
          const compressed = this.compressor.compress(embedding, accessFreq);
          successes.push({ id, data: { embedding: compressed, compressed: true } });
        } else {
          successes.push({ id, data: { embedding, compressed: false } });
        }
      } catch (error) {
        failures.push({
          id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      successes,
      failures,
      stats: {
        total: entries.length,
        succeeded: successes.length,
        failed: failures.length,
        durationMs
      }
    };
  }

  /**
   * Enhanced semantic search using GNN-refined embeddings
   *
   * @param query - Query embedding
   * @param candidateIds - Candidate node IDs to search
   * @param topK - Number of results to return
   * @returns Top-K results with soft attention weights
   */
  async enhancedSearch(
    query: number[],
    candidateIds: string[],
    topK: number = 10
  ): Promise<{ ids: string[]; weights: number[] }> {
    const collection = this.getCollection();
    const candidateEmbeddings: number[][] = [];
    const validIds: string[] = [];

    // Fetch candidate embeddings
    for (const id of candidateIds) {
      const entry = await collection.get(id);
      if (entry) {
        candidateEmbeddings.push(this.extractEmbedding(entry));
        validIds.push(id);
      }
    }

    if (candidateEmbeddings.length === 0) {
      return { ids: [], weights: [] };
    }

    // Use differentiable search for soft attention weights
    const result = differentiableSearch(
      query,
      candidateEmbeddings,
      Math.min(topK, validIds.length),
      this.config.searchTemperature
    );

    return {
      ids: result.indices.map(idx => validIds[idx]),
      weights: result.weights
    };
  }
}

/**
 * Decomposition History GNN Connector
 *
 * Graph structure: Tasks connected by similar decomposition approaches
 * Node: DecompositionHistoryEntry
 * Edges: Tasks in same category with similar complexity
 */
export class DecompositionHistoryConnector extends GNNCollectionConnector<DecompositionHistoryEntry> {
  constructor(config?: Partial<GNNCollectionConfig>) {
    super(COLLECTIONS.DECOMPOSITION_HISTORY, config);
  }

  protected extractEmbedding(entry: DecompositionHistoryEntry): number[] {
    // In practice, this would come from the vector DB
    // For now, return a placeholder
    throw new Error('Embedding extraction requires vector DB integration');
  }

  protected extractNeighbors(entry: DecompositionHistoryEntry): string[] {
    // Neighbors are tasks with same category and similar complexity
    return []; // Placeholder - would query DB for similar tasks
  }

  /**
   * Find similar decomposition patterns for a new task
   *
   * @param taskDescription - New task description
   * @param taskCategory - Task category
   * @param complexity - Task complexity level
   * @param topK - Number of similar patterns to return
   * @returns Similar decomposition patterns with confidence scores
   */
  async findSimilarDecompositions(
    taskDescription: string,
    taskCategory: string,
    complexity: 'simple' | 'moderate' | 'complex',
    topK: number = 5
  ): Promise<{ taskIds: string[]; confidences: number[]; patterns: string[] }> {
    // Implementation would:
    // 1. Embed taskDescription
    // 2. Query collection for same category + complexity
    // 3. Use enhancedSearch to find top-K matches
    // 4. Extract decomposition patterns from results

    throw new Error('Not implemented - requires embedding service');
  }
}

/**
 * Codebase Index GNN Connector
 *
 * Graph structure: Files connected by import/export dependencies
 * Node: CodebaseIndexEntry
 * Edges: Import/export relationships
 */
export class CodebaseIndexConnector extends GNNCollectionConnector<CodebaseIndexEntry> {
  constructor(config?: Partial<GNNCollectionConfig>) {
    super(COLLECTIONS.CODEBASE_INDEX, config);
  }

  protected extractEmbedding(entry: CodebaseIndexEntry): number[] {
    throw new Error('Embedding extraction requires vector DB integration');
  }

  protected extractNeighbors(entry: CodebaseIndexEntry): string[] {
    // Neighbors are files that this file imports or exports to
    return entry.metadata.relatedFiles;
  }

  /**
   * Find all files in dependency chain
   *
   * @param filePath - Starting file path
   * @param maxDepth - Maximum dependency depth
   * @returns Dependency chain with confidence scores
   */
  async getDependencyChain(
    filePath: string,
    maxDepth: number = 5
  ): Promise<GraphTraversalResult> {
    return this.traverseGraph(filePath, maxDepth);
  }
}

/**
 * Error Library GNN Connector
 *
 * Graph structure: Errors connected by causality relationships
 * Node: ErrorLibraryEntry
 * Edges: causedBy / causes relationships
 */
export class ErrorLibraryConnector extends GNNCollectionConnector<ErrorLibraryEntry> {
  constructor(config?: Partial<GNNCollectionConfig>) {
    super(COLLECTIONS.ERROR_LIBRARY, config);
  }

  protected extractEmbedding(entry: ErrorLibraryEntry): number[] {
    throw new Error('Embedding extraction requires vector DB integration');
  }

  protected extractNeighbors(entry: ErrorLibraryEntry): string[] {
    // Neighbors are errors that this error causes or is caused by
    return [...entry.metadata.causedBy, ...entry.metadata.causes];
  }

  /**
   * Trace error causality chain
   *
   * @param errorId - Starting error ID
   * @param direction - Trace upstream (causedBy) or downstream (causes)
   * @param maxHops - Maximum hops in chain
   * @returns Causality chain with confidence scores
   */
  async traceErrorCausality(
    errorId: string,
    direction: 'upstream' | 'downstream' = 'upstream',
    maxHops: number = 5
  ): Promise<GraphTraversalResult> {
    // Would need to filter neighbors by direction
    return this.traverseGraph(errorId, maxHops);
  }
}

/**
 * Security Pattern GNN Connector
 *
 * Graph structure: Security patterns connected by vulnerability co-occurrence
 * Node: SecurityPatternEntry
 * Edges: Vulnerability co-occurrence relationships
 */
export class SecurityPatternConnector extends GNNCollectionConnector<SecurityPatternEntry> {
  constructor(config?: Partial<GNNCollectionConfig>) {
    super(COLLECTIONS.SECURITY_PATTERNS, config);
  }

  protected extractEmbedding(entry: SecurityPatternEntry): number[] {
    throw new Error('Embedding extraction requires vector DB integration');
  }

  protected extractNeighbors(entry: SecurityPatternEntry): string[] {
    // Neighbors are patterns with high co-occurrence scores
    return Object.keys(entry.metadata.vulnerabilityCooccurrence);
  }

  /**
   * Find related security vulnerabilities
   *
   * @param patternName - Starting security pattern
   * @param minCooccurrence - Minimum co-occurrence count threshold
   * @param maxRelated - Maximum related patterns to return
   * @returns Related vulnerability patterns with confidence
   */
  async findRelatedVulnerabilities(
    patternName: string,
    minCooccurrence: number = 2,
    maxRelated: number = 10
  ): Promise<GraphTraversalResult> {
    // Would filter neighbors by co-occurrence threshold
    return this.traverseGraph(patternName, 2, maxRelated);
  }
}

/**
 * Performance Pattern GNN Connector
 *
 * Graph structure: Performance patterns connected by issue co-occurrence
 * Node: PerformancePatternEntry
 * Edges: Issue co-occurrence relationships
 */
export class PerformancePatternConnector extends GNNCollectionConnector<PerformancePatternEntry> {
  constructor(config?: Partial<GNNCollectionConfig>) {
    super(COLLECTIONS.PERFORMANCE_PATTERNS, config);
  }

  protected extractEmbedding(entry: PerformancePatternEntry): number[] {
    throw new Error('Embedding extraction requires vector DB integration');
  }

  protected extractNeighbors(entry: PerformancePatternEntry): string[] {
    // Neighbors are patterns with high co-occurrence scores
    return Object.keys(entry.metadata.issueCooccurrence);
  }

  /**
   * Find related performance issues
   *
   * @param patternName - Starting performance pattern
   * @param minCooccurrence - Minimum co-occurrence count threshold
   * @param maxRelated - Maximum related patterns to return
   * @returns Related performance patterns with confidence
   */
  async findRelatedPerformanceIssues(
    patternName: string,
    minCooccurrence: number = 2,
    maxRelated: number = 10
  ): Promise<GraphTraversalResult> {
    // Would filter neighbors by co-occurrence threshold
    return this.traverseGraph(patternName, 2, maxRelated);
  }
}

/**
 * Factory function to create appropriate connector for collection
 */
export function createGNNConnector(
  collectionName: string,
  config?: Partial<GNNCollectionConfig>
): GNNCollectionConnector<any> {
  switch (collectionName) {
    case COLLECTIONS.DECOMPOSITION_HISTORY:
      return new DecompositionHistoryConnector(config);
    case COLLECTIONS.CODEBASE_INDEX:
      return new CodebaseIndexConnector(config);
    case COLLECTIONS.ERROR_LIBRARY:
      return new ErrorLibraryConnector(config);
    case COLLECTIONS.SECURITY_PATTERNS:
      return new SecurityPatternConnector(config);
    case COLLECTIONS.PERFORMANCE_PATTERNS:
      return new PerformancePatternConnector(config);
    default:
      throw new Error(`Unknown collection: ${collectionName}`);
  }
}
