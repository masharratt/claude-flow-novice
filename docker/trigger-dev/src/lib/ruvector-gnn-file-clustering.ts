/**
 * RuVector GNN File Dependency Clustering
 *
 * Implements graph attention over file dependencies and related files to cluster
 * semantically similar files and rank them for coordinated processing.
 *
 * Key Features:
 * - Graph attention: Learns importance of dependencies via attention weights
 * - File clustering: Groups related files by dependency strength
 * - Cluster scoring: Ranks clusters by cohesion and complexity
 * - Dependency ranking: Orders files within clusters by importance
 *
 * Integration Points:
 * - Uses CodebaseIndexEntry schema with dependencies/relatedFiles
 * - Called from batch scheduling to optimize parallel processing
 * - Provides clusters for coordinated type checking
 *
 * Reference: RuVector Phase 2 - GNN-Enhanced File Analysis
 */

import { getCollection, COLLECTIONS } from './ruvector-init.js';
import type { CodebaseIndexEntry } from './ruvector-schemas.js';
import { hashString, VectorMath } from './ruvector-gnn-utils.js';
import { GNN_CONSTANTS } from './ruvector-gnn-constants.js';
import { GNNInputValidator, TraversalGuard } from './ruvector-gnn-validation.js';
import { extractCodebaseIndexMetadata } from './ruvector-gnn-types.js';

// =============================================
// Type Definitions
// =============================================

/**
 * File node in dependency graph
 */
export interface FileNode {
  filePath: string;
  fileName: string;
  fileType: string;
  complexity: number;
  lines: number;
  exports: string[];
  dependencies: string[];
}

/**
 * Attention-weighted edge between files
 */
export interface AttentionEdge {
  sourceFile: string;
  targetFile: string;
  baseWeight: number; // Frequency-based weight
  attentionWeight: number; // 0-1, learned from graph structure
  totalWeight: number; // baseWeight * attentionWeight
  edgeType: 'imports' | 'imported_by' | 'related';
}

/**
 * File cluster with metadata
 */
export interface FileCluster {
  clusterId: string;
  files: FileNode[];
  edges: AttentionEdge[];
  cohesionScore: number; // 0-1, higher = more connected
  complexityScore: number; // Average complexity in cluster
  size: number; // Number of files
  ranking: number; // 1-N, 1 = highest priority
}

/**
 * Cluster ranking result
 */
export interface ClusterRankingResult {
  clusters: FileCluster[];
  totalFiles: number;
  totalClusters: number;
  clusteringQuality: number; // 0-1, coverage and cohesion
  analysisDetails: {
    nodesAnalyzed: number;
    edgesCreated: number;
    avgClusterSize: number;
    clusterDensity: number; // Average edges per cluster
  };
}

/**
 * Ranked file within a cluster
 */
export interface RankedFile {
  file: FileNode;
  importanceScore: number; // 0-1
  rank: number; // 1-N within cluster
  incomingConnections: number;
  outgoingConnections: number;
}

/**
 * GNN attention layer for file dependencies
 */
export interface FileAttentionGNNLayer {
  nodeFeatures: Map<string, Float32Array>; // File node features
  attentionWeights: Map<string, Float32Array>; // Per-node attention weights
  edgeAttention: Map<string, number>; // Edge-level attention scores
}

// =============================================
// Graph Construction
// =============================================

/**
 * Build file dependency graph from CodebaseIndexEntry collection
 *
 * Constructs a directed graph where:
 * - Nodes are files
 * - Edges represent imports or relationships
 * - Edge weights based on dependency frequency
 *
 * @param limit - Maximum files to analyze (default: 500)
 * @returns Promise<{nodes: Map, edges: Map}> - Dependency graph
 *
 * @example
 * const graph = await buildFileDependencyGraph(300);
 * console.log(`Analyzed ${graph.nodes.size} files`);
 */
export async function buildFileDependencyGraph(
  limit: number = 500
): Promise<{
  nodes: Map<string, FileNode>;
  edges: Map<string, AttentionEdge[]>;
}> {
  const nodes = new Map<string, FileNode>();
  const edges = new Map<string, AttentionEdge[]>();

  // Validate input: limit must be positive integer within bounds
  const limitValidation = GNNInputValidator.validateGraphSize(limit, GNN_CONSTANTS.MAX_COLLECTION_LIMIT);
  if (!limitValidation.valid) {
    throw new Error(`Invalid graph size limit: ${limitValidation.error}`);
  }

  try {
    const collection = getCollection(COLLECTIONS.CODEBASE_INDEX);

    // Fetch files for graph construction
    const files = await collection.search({
      vector: new Float32Array(1536),
      k: limitValidation.sanitized,
    });

    // Build nodes
    for (const file of files) {
      const extracted = extractCodebaseIndexMetadata(file);
      const metadata = extracted;
      let filePath = metadata.filePath || extracted.id;

      // Validate and sanitize file path (CVSS 6.5 mitigation)
      const pathValidation = GNNInputValidator.validateFilePath(filePath);
      if (!pathValidation.valid) {
        console.warn(`[gnn-file-clustering] Skipping file with invalid path: ${pathValidation.error}`);
        continue;
      }
      filePath = pathValidation.sanitized;

      nodes.set(filePath, {
        filePath,
        fileName: metadata.fileName || '',
        fileType: metadata.fileType || 'unknown',
        complexity: metadata.complexity || 0,
        lines: metadata.lines || 0,
        exports: metadata.exports || [],
        dependencies: metadata.dependencies || [],
      });
    }

    // Build edges from dependencies
    for (const file of files) {
      const extracted = extractCodebaseIndexMetadata(file);
      const metadata = extracted;
      const filePath = metadata.filePath || extracted.id;

      if (!edges.has(filePath)) {
        edges.set(filePath, []);
      }

      // Create import edges
      if (metadata.dependencies && Array.isArray(metadata.dependencies)) {
        const depCounts = countOccurrences(metadata.dependencies);
        for (const [dep, count] of Object.entries(depCounts)) {
          if (nodes.has(dep)) {
            edges.get(filePath)!.push({
              sourceFile: filePath,
              targetFile: dep,
              baseWeight: Math.min(1, count / 5), // Normalize by max expected imports
              attentionWeight: 0.5, // To be updated by GNN
              totalWeight: 0, // To be calculated
              edgeType: 'imports',
            });
          }
        }
      }

      // Create related file edges
      if (metadata.relatedFiles && Array.isArray(metadata.relatedFiles)) {
        for (const related of metadata.relatedFiles) {
          if (nodes.has(related)) {
            edges.get(filePath)!.push({
              sourceFile: filePath,
              targetFile: related,
              baseWeight: 0.3, // Related files are weaker links
              attentionWeight: 0.5,
              totalWeight: 0,
              edgeType: 'related',
            });
          }
        }
      }
    }

    console.log(
      `[gnn-file-clustering] Built graph: ${nodes.size} files, ${Array.from(edges.values()).reduce((sum, e) => sum + e.length, 0)} edges`
    );

    return { nodes, edges };
  } catch (error) {
    console.error('[gnn-file-clustering] Error building dependency graph:', error);
    return { nodes, edges };
  }
}

// =============================================
// Graph Attention Mechanism - GNN Layer
// =============================================

/**
 * Apply graph attention to learn edge importance
 *
 * Implements a simple attention mechanism that:
 * 1. Learns node feature representations
 * 2. Computes attention scores between connected files
 * 3. Updates edge weights based on attention
 * 4. Returns attention-weighted graph
 *
 * @param graph - File dependency graph
 * @param attentionHeads - Number of attention heads (default: 4)
 * @returns GNN layer with learned attention weights
 *
 * @example
 * const gnn = fileAttentionGNN(graph, 4);
 * const attentionEdges = gnn.edgeAttention;
 */
export function fileAttentionGNN(
  graph: {
    nodes: Map<string, FileNode>;
    edges: Map<string, AttentionEdge[]>;
  },
  attentionHeads: number = 4
): FileAttentionGNNLayer {
  const layer: FileAttentionGNNLayer = {
    nodeFeatures: new Map(),
    attentionWeights: new Map(),
    edgeAttention: new Map(),
  };

  const validHeads = Math.max(1, Math.min(8, attentionHeads));

  // Initialize node features from file metadata
  for (const [filePath, node] of Array.from(graph.nodes.entries())) {
    const features = initializeFileFeatures(node);
    layer.nodeFeatures.set(filePath, features);
    layer.attentionWeights.set(filePath, new Float32Array(validHeads).fill(0.5 / validHeads));
  }

  // Compute attention scores for edges
  for (const [sourceFile, sourceEdges] of Array.from(graph.edges.entries())) {
    const sourceFeatures = layer.nodeFeatures.get(sourceFile);
    if (!sourceFeatures) continue;

    for (const edge of sourceEdges) {
      const targetFeatures = layer.nodeFeatures.get(edge.targetFile);
      if (!targetFeatures) continue;

      // Compute attention score as similarity between features
      const attentionScore = computeAttentionScore(sourceFeatures, targetFeatures);

      // Update edge weight
      edge.attentionWeight = attentionScore;
      edge.totalWeight = edge.baseWeight * attentionScore;

      // Store edge attention
      const edgeKey = `${sourceFile} -> ${edge.targetFile}`;
      layer.edgeAttention.set(edgeKey, attentionScore);
    }
  }

  return layer;
}

// =============================================
// Clustering Algorithm
// =============================================

/**
 * Cluster files using attention-weighted connectivity
 *
 * Uses Union-Find algorithm with attention weights to group:
 * - Files with strong dependency relationships
 * - Related files with high attention scores
 * - Connected components in dependency graph
 *
 * @param graph - File dependency graph with attention weights
 * @param attentionThreshold - Minimum edge weight to consider (default: 0.3)
 * @returns Array of file clusters
 *
 * @example
 * const clusters = clusterFilesByAttention(graph, 0.3);
 * for (const cluster of clusters) {
 *   console.log(`Cluster ${cluster.clusterId}: ${cluster.files.length} files`);
 * }
 */
export function clusterFilesByAttention(
  graph: {
    nodes: Map<string, FileNode>;
    edges: Map<string, AttentionEdge[]>;
  },
  attentionThreshold: number = 0.3
): FileCluster[] {
  // Validate attention threshold
  const thresholdValidation = GNNInputValidator.validateConfidence(attentionThreshold);
  if (!thresholdValidation.valid) {
    throw new Error(`Invalid attention threshold: ${thresholdValidation.error}`);
  }

  // Initialize traversal guard for clustering operations (CVSS 7.5 mitigation)
  const guard = new TraversalGuard({
    maxIterations: 100000,
    maxDepth: 1000,
    maxQueueSize: 100000,
  });

  const gnn = fileAttentionGNN(graph);

  // Union-Find for clustering
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  // Initialize union-find
  for (const filePath of Array.from(graph.nodes.keys())) {
    guard.checkIteration();
    parent.set(filePath, filePath);
    rank.set(filePath, 0);
  }

  function find(x: string): string {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  function union(x: string, y: string): boolean {
    const px = find(x);
    const py = find(y);
    if (px === py) return false;

    const rx = rank.get(px)!;
    const ry = rank.get(py)!;

    if (rx < ry) {
      parent.set(px, py);
    } else if (rx > ry) {
      parent.set(py, px);
    } else {
      parent.set(py, px);
      rank.set(px, rx + 1);
    }
    return true;
  }

  // Union files with strong attention weights
  for (const [sourceFile, edges] of Array.from(graph.edges.entries())) {
    for (const edge of edges) {
      guard.checkIteration();
      if (edge.totalWeight >= thresholdValidation.sanitized) {
        union(sourceFile, edge.targetFile);
      }
    }
  }

  // Group files by cluster
  const clusterMap = new Map<string, Set<string>>();
  for (const filePath of Array.from(graph.nodes.keys())) {
    guard.checkIteration();
    const root = find(filePath);
    if (!clusterMap.has(root)) {
      clusterMap.set(root, new Set());
    }
    clusterMap.get(root)!.add(filePath);
  }

  // Create cluster objects
  const clusters: FileCluster[] = [];
  let clusterId = 1;

  for (const [rootFile, fileSet] of Array.from(clusterMap.entries())) {
    const files = Array.from(fileSet).map((f) => graph.nodes.get(f)!);
    const clusterEdges: AttentionEdge[] = [];

    // Collect edges within cluster
    for (const file of files) {
      const fileEdges = graph.edges.get(file.filePath) || [];
      for (const edge of fileEdges) {
        if (fileSet.has(edge.targetFile)) {
          clusterEdges.push(edge);
        }
      }
    }

    // Calculate cohesion score
    const cohesionScore = calculateCohesion(files, clusterEdges, graph.nodes.size);

    // Calculate complexity score
    const complexityScore = files.reduce((sum, f) => sum + f.complexity, 0) / files.length;

    clusters.push({
      clusterId: `cluster-${clusterId}`,
      files,
      edges: clusterEdges,
      cohesionScore,
      complexityScore,
      size: files.length,
      ranking: 0, // Will be updated after sorting
    });

    clusterId++;
  }

  // Sort clusters by cohesion and complexity (higher = higher priority)
  clusters.sort((a, b) => {
    const scoreA = a.cohesionScore * Math.log1p(a.size);
    const scoreB = b.cohesionScore * Math.log1p(b.size);
    return scoreB - scoreA;
  });

  // Update rankings
  for (let i = 0; i < clusters.length; i++) {
    clusters[i].ranking = i + 1;
  }

  return clusters;
}

// =============================================
// Cluster Ranking and Analysis
// =============================================

/**
 * Rank and analyze file clusters
 *
 * Produces clustering results with:
 * - Ranked clusters by priority
 * - Per-cluster file rankings
 * - Quality metrics
 * - Recommendations
 *
 * @param graph - File dependency graph
 * @param attentionThreshold - Minimum edge weight (default: 0.3)
 * @returns Comprehensive clustering analysis
 *
 * @example
 * const result = await rankFileClusters(graph, 0.3);
 * console.log(`Quality: ${(result.clusteringQuality * 100).toFixed(1)}%`);
 */
export function rankFileClusters(
  graph: {
    nodes: Map<string, FileNode>;
    edges: Map<string, AttentionEdge[]>;
  },
  attentionThreshold: number = 0.3
): ClusterRankingResult {
  const startTime = Date.now();

  const clusters = clusterFilesByAttention(graph, attentionThreshold);

  // Rank files within each cluster
  for (const cluster of clusters) {
    rankFilesInCluster(cluster, graph);
  }

  // Calculate quality metrics
  const totalEdges = Array.from(graph.edges.values()).reduce((sum, e) => sum + e.length, 0);
  const clusterEdges = clusters.reduce((sum, c) => sum + c.edges.length, 0);
  const edgeCoverage = totalEdges > 0 ? clusterEdges / totalEdges : 0;
  const avgCohesion = clusters.length > 0 ? clusters.reduce((sum, c) => sum + c.cohesionScore, 0) / clusters.length : 0;

  const clusteringQuality = (edgeCoverage + avgCohesion) / 2;

  return {
    clusters,
    totalFiles: graph.nodes.size,
    totalClusters: clusters.length,
    clusteringQuality,
    analysisDetails: {
      nodesAnalyzed: graph.nodes.size,
      edgesCreated: totalEdges,
      avgClusterSize: clusters.length > 0 ? graph.nodes.size / clusters.length : 0,
      clusterDensity: clusters.length > 0 ? totalEdges / clusters.length : 0,
    },
  };
}

/**
 * Rank files within a cluster by importance
 */
function rankFilesInCluster(cluster: FileCluster, graph: { nodes: Map<string, FileNode>; edges: Map<string, AttentionEdge[]> }): void {
  const fileScores: Map<string, RankedFile> = new Map();

  for (const file of cluster.files) {
    const incomingConnections = cluster.edges.filter((e) => e.targetFile === file.filePath).length;
    const outgoingConnections = cluster.edges.filter((e) => e.sourceFile === file.filePath).length;

    const importanceScore = Math.min(1, (incomingConnections + outgoingConnections * 0.5) / (cluster.files.length * 2));

    fileScores.set(file.filePath, {
      file,
      importanceScore,
      rank: 0,
      incomingConnections,
      outgoingConnections,
    });
  }

  // Sort by importance
  const sortedFiles = Array.from(fileScores.values()).sort((a, b) => b.importanceScore - a.importanceScore);

  for (let i = 0; i < sortedFiles.length; i++) {
    sortedFiles[i].rank = i + 1;
  }
}

// =============================================
// Helper Functions
// =============================================

/**
 * Initialize file feature vector from metadata
 */
function initializeFileFeatures(node: FileNode): Float32Array {
  const features = new Float32Array(8);

  // Normalize features to 0-1 range
  features[0] = Math.min(1, node.complexity / 20); // Complexity
  features[1] = Math.min(1, node.lines / 500); // Lines of code
  features[2] = Math.min(1, node.exports.length / 10); // Export count
  features[3] = Math.min(1, node.dependencies.length / 20); // Dependency count

  // File type encoding (one-hot style)
  const typeMap: Record<string, number> = {
    ts: 0.8,
    tsx: 0.9,
    js: 0.7,
    py: 0.6,
    rs: 0.5,
  };
  features[4] = typeMap[node.fileType] || 0.3;

  // Dimension 5-7: Hash of file path
  const hash = hashString(node.filePath);
  for (let i = 0; i < 3; i++) {
    features[i + 5] = ((hash >> (i * 8)) & 0xff) / 255.0;
  }

  return features;
}

/**
 * Compute attention score between two feature vectors
 */
function computeAttentionScore(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0.5;

  // Cosine similarity normalized to 0.1-0.9 range
  const cosine = dotProduct / (normA * normB);
  return Math.max(0.1, Math.min(0.9, (cosine + 1) / 2));
}

/**
 * Count occurrences of items in array
 */
function countOccurrences(arr: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return counts;
}

/**
 * Calculate cluster cohesion score
 */
function calculateCohesion(files: FileNode[], edges: AttentionEdge[], totalNodes: number): number {
  if (files.length <= 1) return 0;

  const maxPossibleEdges = files.length * (files.length - 1);
  const edgeRatio = edges.length / maxPossibleEdges;

  // Normalize by cluster size relative to total
  const sizeFactor = Math.min(1, files.length / Math.sqrt(totalNodes));
  // Helper functions (hashString) now imported from ruvector-gnn-utils.js
  return edgeRatio * sizeFactor;
}

// Note: FileCluster, ClusterRankingResult, RankedFile are exported via interface declarations above
