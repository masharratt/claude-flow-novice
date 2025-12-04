/**
 * RuVector GNN Error Causality Chain Traversal
 *
 * Implements multi-hop message passing over error causality graphs to predict root causes
 * and trace causality chains through related errors.
 *
 * Key Features:
 * - Multi-hop message passing: Traverse causedBy/causes edges (1-3 hops)
 * - Root cause prediction: Identify source errors in causality chains
 * - Confidence scoring: Calculate confidence based on chain strength
 * - Causality ranking: Order errors by likelihood of being root cause
 *
 * Integration Points:
 * - Uses ErrorLibraryEntry schema with causedBy/causes edges
 * - Called from error resolution workflows to predict root causes
 * - Supports up to 3 hops in causality chain traversal
 *
 * Reference: RuVector Phase 2 - GNN-Enhanced Error Analysis
 */

import { getCollection, COLLECTIONS } from './ruvector-init.js';
import type { ErrorLibraryEntry } from './ruvector-schemas.js';
import { hashString, VectorMath } from './ruvector-gnn-utils.js';
import { GNN_CONSTANTS } from './ruvector-gnn-constants.js';
import { extractErrorLibraryMetadata, extractArrayField, extractNumberField } from './ruvector-gnn-types.js';
import { GNNInputValidator, TraversalGuard } from './ruvector-gnn-validation.js';

// =============================================
// Type Definitions
// =============================================

/**
 * Node in the error causality graph
 */
export interface ErrorCausalityNode {
  errorId: string;
  errorMessage: string;
  errorType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  rootCauseConfidence: number;
}

/**
 * Edge in the error causality graph
 */
export interface ErrorCausalityEdge {
  sourceId: string;
  targetId: string;
  edgeType: 'causedBy' | 'causes';
  confidence: number;
  strength: number; // 0-1 based on co-occurrence frequency
}

/**
 * Multi-hop path through error causality chain
 */
export interface CausalityPath {
  path: ErrorCausalityNode[];
  edges: ErrorCausalityEdge[];
  hopCount: number;
  confidence: number; // Minimum confidence along path
  strength: number; // Average strength along path
}

/**
 * Root cause prediction result
 */
export interface RootCausePrediction {
  rootCause: ErrorCausalityNode;
  confidence: number; // 0.0-1.0
  paths: CausalityPath[]; // Multiple paths to this root cause
  alternativeCauses: ErrorCausalityNode[]; // Other possible root causes
  analysisDetails: {
    hopsTraversed: number;
    nodesExplored: number;
    pathsFound: number;
    avgPathLength: number;
  };
}

/**
 * GNN layer representation for error causality graph
 */
export interface ErrorCausalityGNNLayer {
  nodeEmbeddings: Map<string, Float32Array>; // GNN node embeddings
  messageBuffer: Map<string, number[]>; // Aggregated messages per node
  aggregationMethod: 'mean' | 'max' | 'sum';
}

// =============================================
// Graph Construction
// =============================================

/**
 * Build error causality graph from ErrorLibraryEntry collection
 *
 * Constructs a directed graph where:
 * - Nodes are errors
 * - Edges represent causality relationships (causedBy/causes)
 * - Edge confidence comes from causeConfidence metadata
 *
 * @param limit - Maximum errors to fetch (default: 1000)
 * @returns Promise<{nodes: Map, edges: Map}> - Graph structure
 *
 * @example
 * const graph = await buildErrorCausalityGraph(500);
 * console.log(`Nodes: ${graph.nodes.size}, Edges: ${graph.edges.size}`);
 */
export async function buildErrorCausalityGraph(
  limit: number = GNN_CONSTANTS.DEFAULT_COLLECTION_LIMIT
): Promise<{
  nodes: Map<string, ErrorCausalityNode>;
  edges: Map<string, ErrorCausalityEdge[]>;
}> {
  const nodes = new Map<string, ErrorCausalityNode>();
  const edges = new Map<string, ErrorCausalityEdge[]>();

  // Validate input: limit must be positive integer within bounds
  const limitValidation = GNNInputValidator.validateGraphSize(limit, GNN_CONSTANTS.MAX_COLLECTION_LIMIT);
  if (!limitValidation.valid) {
    throw new Error(`Invalid graph size limit: ${limitValidation.error}`);
  }

  try {
    const collection = getCollection(COLLECTIONS.ERROR_LIBRARY);

    // Fetch all errors for graph construction
    const errors = await collection.search({
      vector: new Float32Array(GNN_CONSTANTS.EMBEDDING_DIMENSION),
      k: Math.min(limitValidation.sanitized, GNN_CONSTANTS.MAX_COLLECTION_LIMIT),
    });

    // Build nodes and edges
    for (const error of errors) {
      const result = extractErrorLibraryMetadata(error);
      let errorId = result.id;

      // Validate and sanitize error ID
      const idValidation = GNNInputValidator.validateNodeId(errorId);
      if (!idValidation.valid) {
        console.warn(`[gnn-error-causality] Skipping error with invalid ID: ${idValidation.error}`);
        continue;
      }
      errorId = idValidation.sanitized;

      // Create node
      if (!nodes.has(errorId)) {
        nodes.set(errorId, {
          errorId,
          errorMessage: result.errorMessage,
          errorType: result.errorType,
          severity: result.severity,
          rootCauseConfidence: result.rootCauseConfidence,
        });
      }

      // Create edges for causedBy relationships
      const causedByIds = result.causedBy ?? [];
      if (causedByIds.length > 0) {
        if (!edges.has(errorId)) {
          edges.set(errorId, []);
        }
        for (const causedById of causedByIds) {
          edges.get(errorId)!.push({
            sourceId: causedById,
            targetId: errorId,
            edgeType: 'causedBy',
            confidence: result.causeConfidence ?? GNN_CONSTANTS.DEFAULT_CONFIDENCE_THRESHOLD,
            strength: calculateEdgeStrength(result.timesSeen ?? 0),
          });
        }
      }

      // Create edges for causes relationships
      const causesIds = result.causes ?? [];
      if (causesIds.length > 0) {
        if (!edges.has(errorId)) {
          edges.set(errorId, []);
        }
        for (const causesId of causesIds) {
          edges.get(errorId)!.push({
            sourceId: errorId,
            targetId: causesId,
            edgeType: 'causes',
            confidence: result.causeConfidence ?? GNN_CONSTANTS.DEFAULT_CONFIDENCE_THRESHOLD,
            strength: calculateEdgeStrength(result.timesSeen ?? 0),
          });
        }
      }
    }

    console.log(
      `[gnn-error-causality] Built graph: ${nodes.size} nodes, ${Array.from(edges.values()).reduce((sum, e) => sum + e.length, 0)} edges`
    );

    return { nodes, edges };
  } catch (error) {
    console.error('[gnn-error-causality] Error building causality graph:', error);
    return { nodes, edges };
  }
}

// =============================================
// Message Passing - GNN Layer
// =============================================

/**
 * Multi-hop message passing through error causality graph
 *
 * Implements a simple GNN layer that:
 * 1. Initializes node embeddings from error metadata
 * 2. Performs K message passing iterations (hops)
 * 3. Aggregates messages from neighboring nodes
 * 4. Updates node representations based on messages
 *
 * @param graph - Error causality graph structure
 * @param hops - Number of message passing iterations (1-3, default: 2)
 * @returns GNN layer with updated node embeddings
 *
 * @example
 * const gnn = await messagePassingGNN(graph, 2);
 * const rootCauseEmbedding = gnn.nodeEmbeddings.get(errorId);
 */
export function messagePassingGNN(
  graph: {
    nodes: Map<string, ErrorCausalityNode>;
    edges: Map<string, ErrorCausalityEdge[]>;
  },
  hops: number = GNN_CONSTANTS.DEFAULT_MESSAGE_PASSING_HOPS
): ErrorCausalityGNNLayer {
  const layer: ErrorCausalityGNNLayer = {
    nodeEmbeddings: new Map(),
    messageBuffer: new Map(),
    aggregationMethod: 'mean',
  };

  // Clamp hops to reasonable range
  const validHops = Math.max(
    GNN_CONSTANTS.ROOT_CAUSE_MINIMUM_HOPS,
    Math.min(GNN_CONSTANTS.MAX_MESSAGE_PASSING_HOPS, hops)
  );

  // Initialize node embeddings from error features
  for (const [nodeId, node] of Array.from(graph.nodes.entries())) {
    const embedding = initializeNodeEmbedding(node);
    layer.nodeEmbeddings.set(nodeId, embedding);
    layer.messageBuffer.set(nodeId, Array(embedding.length).fill(0));
  }

  // Perform message passing iterations
  for (let hop = 0; hop < validHops; hop++) {
    const newMessageBuffer = new Map<string, number[]>();

    // For each node, aggregate messages from neighbors
    for (const [nodeId, embedding] of Array.from(layer.nodeEmbeddings.entries())) {
      const messages: number[][] = [];

      // Collect messages from causedBy edges (incoming)
      const incomingEdges = graph.edges.get(nodeId) || [];
      for (const edge of incomingEdges) {
        if (edge.edgeType === 'causedBy') {
          const neighborEmbedding = layer.nodeEmbeddings.get(edge.sourceId);
          if (neighborEmbedding) {
            const weightedMessage = VectorMath.scalarMultiply(neighborEmbedding, edge.confidence);
            messages.push(Array.from(weightedMessage));
          }
        }
      }

      // Aggregate messages
      let aggregated: number[];
      if (messages.length === 0) {
        aggregated = Array(embedding.length).fill(0);
      } else if (layer.aggregationMethod === 'mean') {
        aggregated = VectorMath.meanAggregation(messages);
      } else if (layer.aggregationMethod === 'max') {
        aggregated = maxAggregation(messages);
      } else {
        aggregated = sumAggregation(messages);
      }

      newMessageBuffer.set(nodeId, aggregated);
    }

    // Update embeddings with messages (simple update rule)
    for (const [nodeId, messages] of Array.from(newMessageBuffer.entries())) {
      const currentEmbedding = layer.nodeEmbeddings.get(nodeId)!;
      const updated = VectorMath.addVectors(
        currentEmbedding,
        new Float32Array(messages),
        GNN_CONSTANTS.EMBEDDING_UPDATE_WEIGHT
      );
      layer.nodeEmbeddings.set(nodeId, updated);
    }
  }

  return layer;
}

// =============================================
// Root Cause Prediction
// =============================================

/**
 * Predict root causes through multi-hop traversal
 *
 * Uses BFS to traverse causality chains and identify errors that:
 * - Have high rootCauseConfidence
 * - Have no incoming causedBy edges (no upstream causes)
 * - Are reachable within max hops
 *
 * @param graph - Error causality graph
 * @param targetErrorId - Error to find root cause for
 * @param maxHops - Maximum hops to traverse (default: 3)
 * @returns Root cause prediction with confidence and alternative causes
 *
 * @example
 * const prediction = await predictRootCause(graph, errorId, 3);
 * console.log(`Root cause: ${prediction.rootCause.errorMessage}`);
 * console.log(`Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
 */
export function predictRootCause(
  graph: {
    nodes: Map<string, ErrorCausalityNode>;
    edges: Map<string, ErrorCausalityEdge[]>;
  },
  targetErrorId: string,
  maxHops: number = GNN_CONSTANTS.MAX_MESSAGE_PASSING_HOPS
): RootCausePrediction {
  // Validate inputs
  const idValidation = GNNInputValidator.validateNodeId(targetErrorId);
  if (!idValidation.valid) {
    throw new Error(`Invalid target error ID: ${idValidation.error}`);
  }

  const hopsValidation = GNNInputValidator.validateHopCount(maxHops, GNN_CONSTANTS.MAX_MESSAGE_PASSING_HOPS);
  if (!hopsValidation.valid) {
    throw new Error(`Invalid hop count: ${hopsValidation.error}`);
  }

  const gnn = messagePassingGNN(graph, Math.min(hopsValidation.sanitized, GNN_CONSTANTS.MAX_MESSAGE_PASSING_HOPS));

  const paths: CausalityPath[] = [];
  const visited = new Set<string>();
  const queue: Array<{
    nodeId: string;
    path: ErrorCausalityNode[];
    edges: ErrorCausalityEdge[];
    hops: number;
  }> = [];

  // Initialize traversal guard to prevent unbounded recursion (CVSS 7.5 mitigation)
  const guard = new TraversalGuard({
    maxIterations: 10000,
    maxDepth: 100,
    maxQueueSize: 50000,
    timeoutMs: 30000,
  });

  const startNode = graph.nodes.get(idValidation.sanitized);
  if (!startNode) {
    throw new Error(`Error node not found: ${idValidation.sanitized}`);
  }

  queue.push({
    nodeId: idValidation.sanitized,
    path: [startNode],
    edges: [],
    hops: 0,
  });

  const rootCauses: Array<{
    node: ErrorCausalityNode;
    confidence: number;
    pathCount: number;
  }> = [];

  // BFS traversal with guard to prevent DoS via unbounded queue growth (CVSS 7.5)
  while (queue.length > 0) {
    // Check traversal limits before processing next node
    guard.checkIteration();
    guard.checkQueueSize(queue.length);
    const { nodeId, path, edges: pathEdges, hops } = queue.shift()!;

    if (visited.has(nodeId) || hops > maxHops) {
      continue;
    }
    visited.add(nodeId);

    const currentNode = graph.nodes.get(nodeId)!;

    // Check if this is a root cause candidate
    const nodeEdges = graph.edges.get(nodeId) || [];
    const hasUpstreamCauses = nodeEdges.some((e) => e.edgeType === 'causedBy');

    if (!hasUpstreamCauses && currentNode.rootCauseConfidence > GNN_CONSTANTS.DEFAULT_ROOT_CAUSE_CONFIDENCE * 0.6) {
      paths.push({
        path,
        edges: pathEdges,
        hopCount: hops,
        confidence: Math.min(...pathEdges.map((e) => e.confidence || 0.5), 1),
        strength: pathEdges.length > 0 ? sumAggregation([pathEdges.map((e) => e.strength)]).reduce((a, b) => a + b, 0) / pathEdges.length : 0.5,
      });

      const existing = rootCauses.find((rc) => rc.node.errorId === nodeId);
      if (existing) {
        existing.pathCount++;
      } else {
        rootCauses.push({
          node: currentNode,
          confidence: currentNode.rootCauseConfidence,
          pathCount: 1,
        });
      }
    }

    // Continue BFS
    if (hops < maxHops) {
      const nodeEdges = graph.edges.get(nodeId) || [];
      for (const edge of nodeEdges) {
        if (edge.edgeType === 'causedBy' && !visited.has(edge.sourceId)) {
          const nextNode = graph.nodes.get(edge.sourceId);
          if (nextNode) {
            queue.push({
              nodeId: edge.sourceId,
              path: [...path, nextNode],
              edges: [...pathEdges, edge],
              hops: hops + 1,
            });
          }
        }
      }
    }
  }

  // Sort root causes by confidence and path count
  rootCauses.sort((a, b) => {
    const scoreA = a.confidence * Math.log1p(a.pathCount);
    const scoreB = b.confidence * Math.log1p(b.pathCount);
    return scoreB - scoreA;
  });

  const primaryRootCause = rootCauses[0];
  const alternatives = rootCauses.slice(1, 3).map((rc) => rc.node);

  return {
    rootCause: primaryRootCause?.node || startNode,
    confidence: primaryRootCause?.confidence ?? GNN_CONSTANTS.DEFAULT_CONFIDENCE_THRESHOLD,
    paths: paths.filter((p) => p.path[p.path.length - 1].errorId === primaryRootCause?.node.errorId),
    alternativeCauses: alternatives,
    analysisDetails: {
      hopsTraversed: maxHops,
      nodesExplored: visited.size,
      pathsFound: paths.length,
      avgPathLength: paths.length > 0 ? paths.reduce((sum, p) => sum + p.hopCount, 0) / paths.length : 0,
    },
  };
}

// =============================================
// Helper Functions
// =============================================

/**
 * Calculate edge strength based on error frequency
 */
function calculateEdgeStrength(timesSeen: number): number {
  // Sigmoid scaling: more occurrences = higher strength
  return Math.min(1, timesSeen / 10);
}

/**
 * Initialize node embedding from error metadata
 */
function initializeNodeEmbedding(node: ErrorCausalityNode): Float32Array {
  // Create 8-dimensional embedding from error features
  const embedding = new Float32Array(8);

  // Dimension 0: Root cause confidence
  embedding[0] = node.rootCauseConfidence;

  // Dimension 1: Severity (0-1)
  const severityMap = { critical: 1.0, high: 0.75, medium: 0.5, low: 0.25 };
  embedding[1] = severityMap[node.severity];

  // Dimensions 2-7: Hash of error type and message (deterministic)
  const hash = hashString(node.errorType + node.errorMessage);
  for (let i = 0; i < 6; i++) {
    embedding[i + 2] = ((hash >> (i * 4)) & 0xf) / 15.0;
  }

  return embedding;
}

/**
 * Simple hash function for string
 */
// Helper functions now imported from ruvector-gnn-utils.js

function maxAggregation(messages: number[][]): number[] {
  if (messages.length === 0) return [];
  const result = new Array(messages[0].length).fill(-Infinity);
  for (const msg of messages) {
    for (let i = 0; i < msg.length; i++) {
      result[i] = Math.max(result[i], msg[i]);
    }
  }
  return result;
}

function sumAggregation(messages: number[][]): number[] {
  if (messages.length === 0) return [];
  const result = new Array(messages[0].length).fill(0);
  for (const msg of messages) {
    for (let i = 0; i < msg.length; i++) {
      result[i] += msg[i];
    }
  }
  return result;
}

// Note: RootCausePrediction, CausalityPath, ErrorCausalityGNNLayer are exported via interface declarations above
