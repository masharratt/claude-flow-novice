/**
 * RuVector GNN Performance Issue Clustering
 *
 * Implements community detection on performance issue co-occurrence graphs to
 * identify groups of performance issues that appear together and predict
 * cluster-wide optimizations.
 *
 * Key Features:
 * - Community detection: Identify issue clusters via modularity optimization
 * - Issue co-occurrence: Track which issues appear together
 * - Cluster analysis: Analyze root causes per cluster
 * - Optimization recommendations: Suggest fixes for entire clusters
 *
 * Integration Points:
 * - Uses PerformancePatternEntry schema with issueCooccurrence
 * - Called from performance validators to identify optimization opportunities
 * - Enables cluster-wide performance improvements
 *
 * Reference: RuVector Phase 2 - GNN-Enhanced Performance Analysis
 */

import { hashString, VectorMath } from './ruvector-gnn-utils.js';
import { getCollection, COLLECTIONS } from './ruvector-init.js';
import type { PerformancePatternEntry } from './ruvector-schemas.js';
import { hashString, VectorMath } from './ruvector-gnn-utils.js';
import { GNN_CONSTANTS } from './ruvector-gnn-constants.js';
import { extractPerformancePatternMetadata } from './ruvector-gnn-types.js';

// =============================================
// Type Definitions
// =============================================

/**
 * Performance issue node
 */
export interface PerformanceIssueNode {
  issueId: string;
  issueType: string;
  issues: string[];
  occurrenceCount: number;
  avgImpactScore: number;
  severityLevel: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Co-occurrence relationship between issues
 */
export interface IssueCooccurrenceEdge {
  sourceIssue: string;
  targetIssue: string;
  cooccurrenceCount: number;
  strength: number; // 0-1 normalized
}

/**
 * Performance issue cluster
 */
export interface PerformanceCluster {
  clusterId: string;
  issues: PerformanceIssueNode[];
  edges: IssueCooccurrenceEdge[];
  clusterSize: number;
  modularity: number; // -1 to 1, higher = tighter cluster
  avgSeverity: number;
  commonRootCauses: string[];
  recommendedOptimizations: string[];
  estimatedImprovementPercent: number;
}

/**
 * Cluster analysis result
 */
export interface ClusterAnalysisResult {
  clusters: PerformanceCluster[];
  totalIssues: number;
  totalClusters: number;
  overallModularity: number;
  topClusters: PerformanceCluster[]; // Highest impact clusters
  analysisDetails: {
    nodesAnalyzed: number;
    edgesAnalyzed: number;
    communityDetectionIterations: number;
    clusteringQuality: number; // 0-1
  };
}

/**
 * Root cause analysis for cluster
 */
export interface ClusterRootCauseAnalysis {
  clusterId: string;
  primaryRootCauses: Array<{
    cause: string;
    frequency: number;
    affectedIssues: number;
    confidence: number;
  }>;
  commonPattern: string;
  optimizationStrategy: string;
}

/**
 * GNN layer for community detection
 */
export interface PerformanceGNNLayer {
  nodeEmbeddings: Map<string, Float32Array>;
  communityAssignments: Map<string, number>; // Node -> Community ID
  communityScores: number[]; // Quality score per community
}

// =============================================
// Graph Construction
// =============================================

/**
 * Build performance issue co-occurrence graph from PerformancePatternEntry collection
 *
 * Constructs an undirected graph where:
 * - Nodes are issue types
 * - Edges represent co-occurrence relationships
 * - Edge weights from co-occurrence counts
 *
 * @param limit - Maximum patterns to analyze (default: 500)
 * @returns Promise<{nodes: Map, edges: Map}> - Performance issue graph
 *
 * @example
 * const graph = await buildPerformanceGraph(300);
 * console.log(`Analyzed ${graph.nodes.size} issue types`);
 */
export async function buildPerformanceGraph(
  limit: number = 500
): Promise<{
  nodes: Map<string, PerformanceIssueNode>;
  edges: Map<string, IssueCooccurrenceEdge[]>;
}> {
  const nodes = new Map<string, PerformanceIssueNode>();
  const edges = new Map<string, IssueCooccurrenceEdge[]>();

  try {
    const collection = getCollection(COLLECTIONS.PERFORMANCE_PATTERNS);

    // Fetch performance patterns
    const patterns = await collection.search({
      vector: new Float32Array(GNN_CONSTANTS.EMBEDDING_DIMENSION),
      k: Math.min(limit, GNN_CONSTANTS.MAX_COLLECTION_LIMIT),
    });

    // Build nodes
    for (const pattern of patterns) {
      const result = extractPerformancePatternMetadata(pattern);
      const issueType = result.patternType || 'unknown';

      if (!nodes.has(issueType)) {
        nodes.set(issueType, {
          issueId: issueType,
          issueType,
          issues: [],
          occurrenceCount: result.frequency ?? 0,
          avgImpactScore: calculateImpactScore(result),
          severityLevel: deriveIssueSeverity(result),
        });
      }
    }

    // Build edges from co-occurrence data
    for (const pattern of patterns) {
      const result = extractPerformancePatternMetadata(pattern);
      const sourceIssueType = result.patternType || 'unknown';

      if (!edges.has(sourceIssueType)) {
        edges.set(sourceIssueType, []);
      }

      // Process co-occurrence relationships
      if (metadata.issueCooccurrence && typeof metadata.issueCooccurrence === 'object') {
        for (const [targetIssue, count] of Object.entries(metadata.issueCooccurrence)) {
          if (typeof count !== 'number') continue;

          edges.get(sourceIssueType)!.push({
            sourceIssue: sourceIssueType,
            targetIssue,
            cooccurrenceCount: count,
            strength: Math.min(1, count / 10), // Normalize by max expected cooccurrences
          });
        }
      }
    }

    console.log(
      `[gnn-performance] Built graph: ${nodes.size} issue types, ${Array.from(edges.values()).reduce((sum, e) => sum + e.length, 0)} co-occurrences`
    );

    return { nodes, edges };
  } catch (error) {
    console.error('[gnn-performance] Error building performance graph:', error);
    return { nodes, edges };
  }
}

// =============================================
// Community Detection - GNN Layer
// =============================================

/**
 * Detect communities in performance issue graph
 *
 * Implements Louvain-style community detection:
 * 1. Initialize each node as separate community
 * 2. Iteratively move nodes to maximize modularity
 * 3. Merge and refine communities
 * 4. Return final community structure
 *
 * @param graph - Performance issue graph
 * @param resolution - Community resolution parameter (default: 1.0)
 * @returns GNN layer with community assignments
 *
 * @example
 * const gnn = detectCommunities(graph, 1.0);
 * console.log(`Found ${Math.max(...gnn.communityAssignments.values()) + 1} communities`);
 */
export function detectCommunities(
  graph: {
    nodes: Map<string, PerformanceIssueNode>;
    edges: Map<string, IssueCooccurrenceEdge[]>;
  },
  resolution: number = 1.0
): PerformanceGNNLayer {
  const layer: PerformanceGNNLayer = {
    nodeEmbeddings: new Map(),
    communityAssignments: new Map(),
    communityScores: [],
  };

  const nodeList = Array.from(graph.nodes.keys());
  const n = nodeList.length;

  // Initialize embeddings
  for (const [issueType, node] of Array.from(graph.nodes.entries())) {
    layer.nodeEmbeddings.set(issueType, initializeIssueEmbedding(node));
  }

  // Initialize each node as its own community
  const community = new Map<string, number>();
  for (let i = 0; i < nodeList.length; i++) {
    community.set(nodeList[i], i);
  }

  // Build adjacency list
  const adjacency = new Map<string, Map<string, number>>();
  for (const [source, edgeList] of Array.from(graph.edges.entries())) {
    if (!adjacency.has(source)) {
      adjacency.set(source, new Map());
    }
    for (const edge of edgeList) {
      const current = adjacency.get(source)!.get(edge.targetIssue) || 0;
      adjacency.get(source)!.set(edge.targetIssue, current + edge.strength);
    }
  }

  // Optimization iterations
  const maxIterations = Math.min(10, n);
  let improvement = true;
  let iteration = 0;

  while (improvement && iteration < maxIterations) {
    improvement = false;
    iteration++;

    for (const node of nodeList) {
      const currentCommunity = community.get(node)!;
      let bestCommunity = currentCommunity;
      let bestGain = 0;

      // Try moving to neighboring communities
      const neighborCommunities = new Set<number>();
      neighborCommunities.add(currentCommunity);

      const neighbors = adjacency.get(node) || new Map();
      for (const neighbor of Array.from(neighbors.keys())) {
        neighborCommunities.add(community.get(neighbor)!);
      }

      for (const targetCommunity of Array.from(neighborCommunities)) {
        const gain = calculateModularityGain(node, currentCommunity, targetCommunity, graph, community, resolution);

        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = targetCommunity;
        }
      }

      if (bestCommunity !== currentCommunity) {
        community.set(node, bestCommunity);
        improvement = true;
      }
    }
  }

  // Renumber communities
  const communityMap = new Map<number, number>();
  let nextId = 0;

  for (const [node, comm] of Array.from(community.entries())) {
    if (!communityMap.has(comm)) {
      communityMap.set(comm, nextId++);
    }
    layer.communityAssignments.set(node, communityMap.get(comm)!);
  }

  // Calculate community quality scores
  const numCommunities = nextId;
  for (let i = 0; i < numCommunities; i++) {
    const nodesInCommunity = Array.from(layer.communityAssignments.entries())
      .filter(([_, c]) => c === i)
      .map(([n, _]) => n);

    const score = calculateCommunityModularity(nodesInCommunity, graph, resolution);
    layer.communityScores.push(score);
  }

  return layer;
}

// =============================================
// Cluster Analysis
// =============================================

/**
 * Analyze performance issue clusters
 *
 * Takes community assignments and produces detailed cluster analysis:
 * - Cluster composition
 * - Root cause identification
 * - Optimization recommendations
 * - Impact estimation
 *
 * @param graph - Performance issue graph
 * @param gnn - Community detection results
 * @returns Comprehensive cluster analysis
 *
 * @example
 * const analysis = analyzePerformanceClusters(graph, gnn);
 * console.log(`Found ${analysis.clusters.length} clusters`);
 * for (const cluster of analysis.clusters) {
 *   console.log(`Cluster ${cluster.clusterId}: ${cluster.issues.length} issues`);
 * }
 */
export function analyzePerformanceClusters(
  graph: {
    nodes: Map<string, PerformanceIssueNode>;
    edges: Map<string, IssueCooccurrenceEdge[]>;
  },
  gnn: PerformanceGNNLayer
): ClusterAnalysisResult {
  const communityGroups = new Map<number, string[]>();

  // Group nodes by community
  for (const [node, community] of Array.from(gnn.communityAssignments.entries())) {
    if (!communityGroups.has(community)) {
      communityGroups.set(community, []);
    }
    communityGroups.get(community)!.push(node);
  }

  // Create cluster objects
  const clusters: PerformanceCluster[] = [];

  for (const [communityId, nodes] of Array.from(communityGroups.entries())) {
    const issues = nodes.map((n) => graph.nodes.get(n)!).filter(Boolean);

    // Collect edges within cluster
    const clusterEdges: IssueCooccurrenceEdge[] = [];
    for (const node of nodes) {
      const nodeEdges = graph.edges.get(node) || [];
      for (const edge of nodeEdges) {
        if (nodes.includes(edge.targetIssue)) {
          clusterEdges.push(edge);
        }
      }
    }

    // Calculate modularity
    const modularity = gnn.communityScores[communityId] || 0;

    // Find common root causes
    const rootCauses = findCommonRootCauses(issues);

    // Generate optimization recommendations
    const optimizations = generateOptimizations(issues, rootCauses);

    // Estimate improvement
    const improvement = estimateImprovement(issues, optimizations);

    clusters.push({
      clusterId: `perf-cluster-${communityId}`,
      issues,
      edges: clusterEdges,
      clusterSize: issues.length,
      modularity,
      avgSeverity: issues.reduce((sum, i) => sum + severityToNumber(i.severityLevel), 0) / issues.length,
      commonRootCauses: rootCauses,
      recommendedOptimizations: optimizations,
      estimatedImprovementPercent: improvement,
    });
  }

  // Sort by impact
  clusters.sort((a, b) => b.avgSeverity * b.clusterSize - (a.avgSeverity * a.clusterSize));

  const overallModularity = clusters.length > 0 ?
    clusters.reduce((sum, c) => sum + c.modularity, 0) / clusters.length : 0;

  const clusteringQuality = (overallModularity + 1) / 2; // Normalize -1..1 to 0..1

  return {
    clusters,
    totalIssues: graph.nodes.size,
    totalClusters: clusters.length,
    overallModularity,
    topClusters: clusters.slice(0, 3),
    analysisDetails: {
      nodesAnalyzed: graph.nodes.size,
      edgesAnalyzed: Array.from(graph.edges.values()).reduce((sum, e) => sum + e.length, 0),
      communityDetectionIterations: Math.min(10, graph.nodes.size),
      clusteringQuality,
    },
  };
}

/**
 * Analyze root causes within a cluster
 */
export function analyzeClusterRootCauses(
  cluster: PerformanceCluster
): ClusterRootCauseAnalysis {
  const causeCounts = new Map<string, number>();
  const causeToIssues = new Map<string, Set<string>>();

  // Count root causes
  for (const issue of cluster.issues) {
    for (const issueDesc of issue.issues) {
      // Extract potential cause from issue description
      const cause = extractRootCause(issueDesc);
      causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1);

      if (!causeToIssues.has(cause)) {
        causeToIssues.set(cause, new Set());
      }
      causeToIssues.get(cause)!.add(issue.issueType);
    }
  }

  // Sort by frequency
  const sortedCauses = Array.from(causeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const primaryRootCauses = sortedCauses.map(([cause, count]) => ({
    cause,
    frequency: count,
    affectedIssues: causeToIssues.get(cause)?.size || 0,
    confidence: Math.min(1, count / cluster.issues.length),
  }));

  const pattern = identifyCommonPattern(cluster.issues);
  const strategy = recommendOptimizationStrategy(cluster, primaryRootCauses);

  return {
    clusterId: cluster.clusterId,
    primaryRootCauses,
    commonPattern: pattern,
    optimizationStrategy: strategy,
  };
}

// =============================================
// Helper Functions
// =============================================

/**
 * Calculate impact score from metadata
 */
function calculateImpactScore(metadata: Partial<PerformancePatternEntry['metadata']>): number {
  const score = (metadata.performanceScore || 50) / 100;
  const criticalWeight = (metadata.criticalIssuesCount || 0) * 0.1;

  return Math.min(1, score + criticalWeight);
}

/**
 * Derive severity from metadata
 */
function deriveIssueSeverity(
  metadata: Partial<PerformancePatternEntry['metadata']>
): 'critical' | 'high' | 'medium' | 'low' {
  const score = metadata.performanceScore || 50;

  if (score < 30) return 'critical';
  if (score < 50) return 'high';
  if (score < 75) return 'medium';
  return 'low';
}

/**
 * Initialize issue embedding
 */
function initializeIssueEmbedding(node: PerformanceIssueNode): Float32Array {
  const embedding = new Float32Array(8);

  embedding[0] = Math.min(1, node.avgImpactScore);
  embedding[1] = severityToNumber(node.severityLevel);
  embedding[2] = Math.min(1, node.occurrenceCount / 50);
  embedding[3] = Math.min(1, node.issues.length / 5);

  const hash = hashString(node.issueType);
  for (let i = 4; i < 8; i++) {
    embedding[i] = ((hash >> (i * 2)) & 0x3) / 3.0;
  }

  return embedding;
}

/**
 * Convert severity to number
 */
function severityToNumber(severity: string): number {
  const map: Record<string, number> = {
    critical: 1.0,
    high: 0.75,
    medium: 0.5,
    low: 0.25,
  };
  return map[severity] || 0.5;
}

/**
 * Calculate modularity gain for moving node
 */
function calculateModularityGain(
  node: string,
  fromCommunity: number,
  toCommunity: number,
  graph: { edges: Map<string, IssueCooccurrenceEdge[]> },
  community: Map<string, number>,
  resolution: number
): number {
  if (fromCommunity === toCommunity) return 0;

  let gain = 0;

  const nodeEdges = graph.edges.get(node) || [];
  for (const edge of nodeEdges) {
    const neighborCommunity = community.get(edge.targetIssue);

    if (neighborCommunity === toCommunity) {
      gain += edge.strength;
    } else if (neighborCommunity === fromCommunity) {
      gain -= edge.strength;
    }
  }

  return gain * resolution;
}

/**
 * Calculate community modularity
 */
function calculateCommunityModularity(
  nodes: string[],
  graph: { edges: Map<string, IssueCooccurrenceEdge[]> },
  resolution: number
): number {
  if (nodes.length <= 1) return 0;

  let internalEdges = 0;
  let totalEdges = 0;

  for (const node of nodes) {
    const nodeEdges = graph.edges.get(node) || [];
    for (const edge of nodeEdges) {
      totalEdges += edge.strength;
      if (nodes.includes(edge.targetIssue)) {
        internalEdges += edge.strength;
      }
    }
  }

  if (totalEdges === 0) return 0;

  return (internalEdges / totalEdges) * resolution;
}

/**
 * Find common root causes
 */
function findCommonRootCauses(issues: PerformanceIssueNode[]): string[] {
  const causeMap = new Map<string, number>();

  for (const issue of issues) {
    for (const issueDesc of issue.issues) {
      const cause = extractRootCause(issueDesc);
      causeMap.set(cause, (causeMap.get(cause) || 0) + 1);
    }
  }

  return Array.from(causeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cause]) => cause);
}

/**
 * Extract root cause from issue description
 */
function extractRootCause(issueDesc: string): string {
  // Simple pattern matching
  if (issueDesc.includes('N+1')) return 'N+1 Queries';
  if (issueDesc.includes('memory')) return 'Memory Leak';
  if (issueDesc.includes('CPU') || issueDesc.includes('cpu')) return 'High CPU';
  if (issueDesc.includes('GC')) return 'GC Pressure';
  if (issueDesc.includes('lock')) return 'Lock Contention';

  return 'Unknown';
}

/**
 * Generate optimizations
 */
function generateOptimizations(
  issues: PerformanceIssueNode[],
  rootCauses: string[]
): string[] {
  const recommendations: string[] = [];

  for (const cause of rootCauses) {
    if (cause === 'N+1 Queries') {
      recommendations.push('Add batch loading');
      recommendations.push('Implement caching');
    } else if (cause === 'Memory Leak') {
      recommendations.push('Review cleanup handlers');
      recommendations.push('Add memory profiling');
    } else if (cause === 'High CPU') {
      recommendations.push('Profile hotspots');
      recommendations.push('Reduce algorithmic complexity');
    }
  }

  return recommendations.slice(0, 3);
}

/**
 * Estimate improvement percentage
 */
function estimateImprovement(
  issues: PerformanceIssueNode[],
  optimizations: string[]
): number {
  const avgSeverity = issues.reduce((sum, i) => sum + severityToNumber(i.severityLevel), 0) / issues.length;
  const optimizationCount = optimizations.length;

  return Math.round((avgSeverity * 0.6 + (optimizationCount * 0.1) * 100));
}

/**
 * Identify common pattern
 */
function identifyCommonPattern(issues: PerformanceIssueNode[]): string {
  const issueTypes = new Set(issues.map((i) => i.issueType));

  if (issueTypes.size <= 2) {
    return `${Array.from(issueTypes).join(' + ')} correlation`;
  }

  return 'Multiple issue types co-occur';
}

/**
 * Recommend optimization strategy
 */
function recommendOptimizationStrategy(
  cluster: PerformanceCluster,
  causes: Array<any>
): string {
  if (cluster.avgSeverity > 0.75) {
    return 'Immediate optimization required';
  }

  if (causes[0]?.cause === 'N+1 Queries') {
    return 'Implement query optimization layer';
  }
// Helper functions (hashString) now imported from ruvector-gnn-utils.js
  return Math.abs(hash);
}

// Note: PerformanceCluster, ClusterAnalysisResult, ClusterRootCauseAnalysis are exported via interface declarations above
