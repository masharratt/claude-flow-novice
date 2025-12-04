/**
 * RuVector GNN Decomposition Strategy Selection
 *
 * Implements graph classification on task→technology→outcome graphs to predict
 * optimal decomposition strategies for new tasks based on historical patterns.
 *
 * Key Features:
 * - Graph classification: Predict strategy success from task characteristics
 * - Strategy ranking: Order strategies by predicted success rate
 * - Confidence estimation: Rate confidence in recommendations
 * - Pattern learning: Extract successful decomposition patterns
 *
 * Integration Points:
 * - Uses DecompositionHistoryEntry schema with approach and metrics
 * - Called from task decomposition phase to suggest strategies
 * - Learns from historical task outcomes
 *
 * Reference: RuVector Phase 2 - GNN-Enhanced Decomposition Optimization
 */

import { getCollection, COLLECTIONS } from './ruvector-init.js';
import type { DecompositionHistoryEntry } from './ruvector-schemas.js';
import { hashString, VectorMath } from './ruvector-gnn-utils.js';
import { extractDecompositionHistoryMetadata } from './ruvector-gnn-types.js';

// =============================================
// Type Definitions
// =============================================

/**
 * Task node in decomposition graph
 */
export interface TaskNode {
  taskId: string;
  taskCategory: string;
  originalTask: string;
  complexity: number; // 1-10 scale
  microTaskCount: number;
  executionPhases: number;
  securityRiskLevel: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Technology node (framework, language, tool)
 */
export interface TechnologyNode {
  technologyId: string;
  technologyName: string;
  relatedFrameworks: string[];
  usageCount: number;
}

/**
 * Outcome node (success metrics)
 */
export interface OutcomeNode {
  outcomeName: string;
  gateCheckScore: number;
  finalDecision: 'PROCEED' | 'ITERATE' | 'ABORT';
  performanceScore: number;
  securityFindings: number;
}

/**
 * Graph edge connecting task→technology→outcome
 */
export interface StrategyEdge {
  source: string;
  sourceType: 'task' | 'technology' | 'outcome';
  target: string;
  targetType: 'task' | 'technology' | 'outcome';
  weight: number;
  strategyApproach: string; // e.g., "sequential context passing"
}

/**
 * Recommended decomposition strategy
 */
export interface DecompositionStrategyRecommendation {
  strategy: string;
  successProbability: number; // 0.0-1.0
  confidence: number;
  estimatedMicroTasks: number;
  estimatedPhases: number;
  estimatedDurationMs: number;
  reasoning: string;
  similarPastTasks: Array<{
    taskId: string;
    similarity: number;
    successRate: number;
  }>;
}

/**
 * Strategy selection result
 */
export interface StrategySelectionResult {
  topStrategies: DecompositionStrategyRecommendation[];
  selectedStrategy: DecompositionStrategyRecommendation;
  analysisDetails: {
    tasksAnalyzed: number;
    strategiesConsidered: number;
    similarTasksFound: number;
    modelConfidence: number;
  };
}

/**
 * GNN layer for graph classification
 */
export interface DecompositionGNNLayer {
  nodeEmbeddings: Map<string, Float32Array>;
  graphFeatures: Float32Array;
  classificationLogits: number[];
}

// =============================================
// Graph Construction
// =============================================

/**
 * Build task→technology→outcome graph from DecompositionHistoryEntry collection
 *
 * Constructs a tripartite graph where:
 * - Task nodes: Task characteristics
 * - Technology nodes: Tools and frameworks used
 * - Outcome nodes: Success metrics
 * - Edges: Decomposition strategies connecting them
 *
 * @param limit - Maximum tasks to analyze (default: 500)
 * @returns Promise<graph structure> - Task-technology-outcome graph
 *
 * @example
 * const graph = await buildDecompositionGraph(300);
 * console.log(`Analyzed ${graph.tasks.size} tasks`);
 */
export async function buildDecompositionGraph(
  limit: number = 500
): Promise<{
  tasks: Map<string, TaskNode>;
  technologies: Map<string, TechnologyNode>;
  outcomes: Map<string, OutcomeNode>;
  edges: StrategyEdge[];
}> {
  const tasks = new Map<string, TaskNode>();
  const technologies = new Map<string, TechnologyNode>();
  const outcomes = new Map<string, OutcomeNode>();
  const edges: StrategyEdge[] = [];

  try {
    const collection = getCollection(COLLECTIONS.DECOMPOSITION_HISTORY);

    // Fetch task decomposition history
    const entries = await collection.search({
      vector: new Float32Array(1536),
      k: limit,
    });

    // Build nodes
    for (const entry of entries) {
      const extracted = extractDecompositionHistoryMetadata(entry);
      const metadata = extracted;
      const taskId = metadata.taskId || extracted.id;

      // Create task node
      tasks.set(taskId, {
        taskId,
        taskCategory: metadata.originalTask?.split(' ')[0] || 'unknown',
        originalTask: metadata.originalTask || '',
        complexity: estimateComplexity(metadata),
        microTaskCount: metadata.microTaskCount || 0,
        executionPhases: metadata.executionPhases || 0,
        securityRiskLevel: metadata.securityRiskLevel || 'low',
      });

      // Create outcome node (unique per task)
      const outcomeName = `${taskId}-outcome`;
      outcomes.set(outcomeName, {
        outcomeName,
        gateCheckScore: metadata.gateCheckScore || 0,
        finalDecision: metadata.finalDecision || 'ABORT',
        performanceScore: metadata.performanceScore || 0,
        securityFindings: metadata.securityFindings || 0,
      });

      // Create edges from task to outcome
      edges.push({
        source: taskId,
        sourceType: 'task',
        target: outcomeName,
        targetType: 'outcome',
        weight: metadata.gateCheckScore || 0,
        strategyApproach: metadata.decompositionApproach || 'default',
      });

      // Create technology nodes (extracted from task description)
      const techs = extractTechnologies(metadata.originalTask || '');
      for (const tech of techs) {
        if (!technologies.has(tech)) {
          technologies.set(tech, {
            technologyId: tech,
            technologyName: tech,
            relatedFrameworks: [],
            usageCount: 0,
          });
        }

        const techNode = technologies.get(tech)!;
        techNode.usageCount++;

        // Create edges from task to technology
        edges.push({
          source: taskId,
          sourceType: 'task',
          target: tech,
          targetType: 'technology',
          weight: 1.0,
          strategyApproach: metadata.decompositionApproach || 'default',
        });

        // Create edges from technology to outcome
        edges.push({
          source: tech,
          sourceType: 'technology',
          target: outcomeName,
          targetType: 'outcome',
          weight: metadata.gateCheckScore || 0,
          strategyApproach: metadata.decompositionApproach || 'default',
        });
      }
    }

    console.log(
      `[gnn-decomposition] Built graph: ${tasks.size} tasks, ${technologies.size} technologies, ${outcomes.size} outcomes`
    );

    return { tasks, technologies, outcomes, edges };
  } catch (error) {
    console.error('[gnn-decomposition] Error building decomposition graph:', error);
    return { tasks, technologies, outcomes, edges: [] };
  }
}

// =============================================
// Graph Classification - GNN Layer
// =============================================

/**
 * Learn node embeddings through graph structure
 *
 * Implements graph-level classification by:
 * 1. Computing node embeddings from features
 * 2. Aggregating neighbor information
 * 3. Computing graph-level features
 * 4. Classifying task into strategy categories
 *
 * @param graph - Task-technology-outcome graph
 * @param embeddingDim - Embedding dimension (default: 32)
 * @returns GNN layer with node and graph embeddings
 *
 * @example
 * const gnn = buildDecompositionGNN(graph, 32);
 * const strategyLogits = gnn.classificationLogits;
 */
export function buildDecompositionGNN(
  graph: {
    tasks: Map<string, TaskNode>;
    technologies: Map<string, TechnologyNode>;
    outcomes: Map<string, OutcomeNode>;
    edges: StrategyEdge[];
  },
  embeddingDim: number = 32
): DecompositionGNNLayer {
  const layer: DecompositionGNNLayer = {
    nodeEmbeddings: new Map(),
    graphFeatures: new Float32Array(embeddingDim),
    classificationLogits: [],
  };

  const validDim = Math.max(8, Math.min(64, embeddingDim));

  // Initialize embeddings for all node types
  for (const [taskId, task] of Array.from(graph.tasks.entries())) {
    layer.nodeEmbeddings.set(taskId, initializeTaskEmbedding(task, validDim));
  }

  for (const [techId, tech] of Array.from(graph.technologies.entries())) {
    layer.nodeEmbeddings.set(techId, initializeTechEmbedding(tech, validDim));
  }

  for (const [outcomeName, outcome] of Array.from(graph.outcomes.entries())) {
    layer.nodeEmbeddings.set(outcomeName, initializeOutcomeEmbedding(outcome, validDim));
  }

  // Aggregate neighbor information via edges
  const aggregatedEmbeddings = new Map<string, Float32Array>();

  for (const [nodeId, embedding] of Array.from(layer.nodeEmbeddings.entries())) {
    const aggregated = new Float32Array(validDim);
    const relevantEdges = graph.edges.filter((e) => e.source === nodeId || e.target === nodeId);

    let edgeCount = 0;
    for (const edge of relevantEdges) {
      const neighborId = edge.source === nodeId ? edge.target : edge.source;
      const neighborEmbedding = layer.nodeEmbeddings.get(neighborId);

      if (neighborEmbedding) {
        for (let i = 0; i < validDim; i++) {
          aggregated[i] += neighborEmbedding[i] * edge.weight;
        }
        edgeCount++;
      }
    }

    if (edgeCount > 0) {
      for (let i = 0; i < validDim; i++) {
        aggregated[i] /= edgeCount;
      }
    }

    // Update embedding with aggregated information (skip connection)
    const updated = new Float32Array(validDim);
    for (let i = 0; i < validDim; i++) {
      updated[i] = 0.6 * embedding[i] + 0.4 * aggregated[i];
    }

    aggregatedEmbeddings.set(nodeId, updated);
  }

  // Update layer embeddings
  for (const [nodeId, embedding] of Array.from(aggregatedEmbeddings.entries())) {
    layer.nodeEmbeddings.set(nodeId, embedding);
  }

  // Compute graph-level features (readout)
  const allEmbeddings = Array.from(layer.nodeEmbeddings.values());
  if (allEmbeddings.length > 0) {
    for (let i = 0; i < validDim; i++) {
      let sum = 0;
      for (const emb of allEmbeddings) {
        sum += emb[i];
      }
      layer.graphFeatures[i] = sum / allEmbeddings.length;
    }
  }

  // Classify into strategy categories
  // Strategies: sequential, parallel, hierarchical, adaptive
  const strategyLogits = [
    computeStrategyScore(graph, layer, 'sequential'),
    computeStrategyScore(graph, layer, 'parallel'),
    computeStrategyScore(graph, layer, 'hierarchical'),
    computeStrategyScore(graph, layer, 'adaptive'),
  ];

  layer.classificationLogits = strategyLogits;

  return layer;
}

// =============================================
// Strategy Selection
// =============================================

/**
 * Recommend decomposition strategy for new task
 *
 * Analyzes task characteristics and recommends optimal strategy
 * based on learned patterns from historical tasks.
 *
 * @param newTask - Task to recommend strategy for
 * @param graph - Historical task-technology-outcome graph
 * @param similarityThreshold - Minimum similarity to consider (default: 0.5)
 * @returns Top strategies with confidence scores
 *
 * @example
 * const task = { originalTask: "Build React component with TypeScript", complexity: 5 };
 * const recommendation = recommendDecompositionStrategy(task, graph, 0.5);
 * console.log(`Recommended: ${recommendation.selectedStrategy.strategy}`);
 */
export function recommendDecompositionStrategy(
  newTask: Omit<TaskNode, 'taskId'> & { taskId?: string },
  graph: {
    tasks: Map<string, TaskNode>;
    technologies: Map<string, TechnologyNode>;
    outcomes: Map<string, OutcomeNode>;
    edges: StrategyEdge[];
  },
  similarityThreshold: number = 0.5
): StrategySelectionResult {
  const gnn = buildDecompositionGNN(graph, 32);

  // Find similar historical tasks
  const taskId = newTask.taskId || `new-task-${Date.now()}`;
  const similarTasks: Array<{
    taskId: string;
    similarity: number;
    successRate: number;
    strategy: string;
  }> = [];

  for (const [histTaskId, histTask] of Array.from(graph.tasks.entries())) {
    const similarity = computeTaskSimilarity(newTask, histTask);
    if (similarity >= similarityThreshold) {
      // Find outcome for this task
      const outcomeNode = graph.outcomes.get(`${histTaskId}-outcome`);
      const successRate = outcomeNode?.gateCheckScore || 0;

      // Find strategy used
      const strategyEdge = graph.edges.find((e) => e.source === histTaskId && e.targetType === 'outcome');
      const strategy = strategyEdge?.strategyApproach || 'default';

      similarTasks.push({
        taskId: histTaskId,
        similarity,
        successRate,
        strategy,
      });
    }
  }

  // Rank strategies by predicted success
  const strategies = ['sequential', 'parallel', 'hierarchical', 'adaptive'];
  const strategiesBySuccess: DecompositionStrategyRecommendation[] = [];

  for (const strategy of strategies) {
    const matchingTasks = similarTasks.filter((t) => t.strategy === strategy);
    const avgSuccessRate = matchingTasks.length > 0 ?
      matchingTasks.reduce((sum, t) => sum + t.successRate, 0) / matchingTasks.length : 0.5;

    const logitIndex = strategies.indexOf(strategy);
    const logit = gnn.classificationLogits[logitIndex] || 0.25;
    const combinedScore = (avgSuccessRate * 0.6 + logit * 0.4);

    strategiesBySuccess.push({
      strategy,
      successProbability: Math.min(1, combinedScore),
      confidence: Math.min(0.95, 0.5 + (matchingTasks.length * 0.1)),
      estimatedMicroTasks: estimateMicroTasks(newTask, strategy),
      estimatedPhases: estimatePhases(newTask, strategy),
      estimatedDurationMs: estimateDuration(newTask, strategy),
      reasoning: generateStrategyReasoning(
        strategy,
        newTask,
        matchingTasks.slice(0, 3)
      ),
      similarPastTasks: matchingTasks
        .slice(0, 3)
        .map((t) => ({
          taskId: t.taskId,
          similarity: t.similarity,
          successRate: t.successRate,
        })),
    });
  }

  // Sort by success probability and confidence
  strategiesBySuccess.sort(
    (a, b) =>
      b.successProbability * b.confidence - (a.successProbability * a.confidence)
  );

  const selectedStrategy = strategiesBySuccess[0];

  return {
    topStrategies: strategiesBySuccess.slice(0, 3),
    selectedStrategy,
    analysisDetails: {
      tasksAnalyzed: graph.tasks.size,
      strategiesConsidered: strategies.length,
      similarTasksFound: similarTasks.length,
      modelConfidence: selectedStrategy.confidence,
    },
  };
}

// =============================================
// Pattern Learning
// =============================================

/**
 * Extract successful decomposition patterns
 *
 * Identifies patterns in successful decompositions that can be
 * applied to similar tasks.
 *
 * @param graph - Historical task graph
 * @param minSuccessRate - Minimum success rate to consider (default: 0.8)
 * @returns Array of learned patterns
 *
 * @example
 * const patterns = extractDecompositionPatterns(graph, 0.8);
 * for (const pattern of patterns) {
 *   console.log(`Pattern: ${pattern.strategy} for ${pattern.technologies.join(', ')}`);
 * }
 */
export function extractDecompositionPatterns(
  graph: {
    tasks: Map<string, TaskNode>;
    technologies: Map<string, TechnologyNode>;
    outcomes: Map<string, OutcomeNode>;
    edges: StrategyEdge[];
  },
  minSuccessRate: number = 0.8
): Array<{
  patternId: string;
  strategy: string;
  technologies: string[];
  avgSuccessRate: number;
  frequency: number;
  recommendedMicroTasks: number;
  recommendedPhases: number;
}> {
  const patterns = new Map<string, {
    strategy: string;
    technologies: Set<string>;
    successRates: number[];
  }>();

  // Aggregate patterns from successful tasks
  for (const [taskId, task] of Array.from(graph.tasks.entries())) {
    const outcomeNode = graph.outcomes.get(`${taskId}-outcome`);
    if (!outcomeNode || outcomeNode.gateCheckScore < minSuccessRate) {
      continue;
    }

    // Find strategy and technologies for this task
    const strategyEdge = graph.edges.find((e) => e.source === taskId && e.targetType === 'outcome');
    const strategy = strategyEdge?.strategyApproach || 'default';

    const techEdges = graph.edges.filter((e) => e.source === taskId && e.targetType === 'technology');
    const technologies = new Set(techEdges.map((e) => e.target));

    const patternKey = `${strategy}:${Array.from(technologies).sort().join(',')}`;

    if (!patterns.has(patternKey)) {
      patterns.set(patternKey, {
        strategy,
        technologies,
        successRates: [],
      });
    }

    patterns.get(patternKey)!.successRates.push(outcomeNode.gateCheckScore);
  }

  // Convert to result format
  const resultPatterns = Array.from(patterns.entries()).map(([key, pattern], idx) => ({
    patternId: `pattern-${idx}`,
    strategy: pattern.strategy,
    technologies: Array.from(pattern.technologies),
    avgSuccessRate: pattern.successRates.reduce((a, b) => a + b, 0) / pattern.successRates.length,
    frequency: pattern.successRates.length,
    recommendedMicroTasks: Math.ceil(10 + pattern.technologies.size * 2),
    recommendedPhases: Math.ceil(3 + (pattern.technologies.size > 3 ? 1 : 0)),
  }));

  return resultPatterns.sort((a, b) => b.frequency - a.frequency || b.avgSuccessRate - a.avgSuccessRate);
}

// =============================================
// Helper Functions
// =============================================

/**
 * Estimate task complexity
 */
function estimateComplexity(metadata: Partial<DecompositionHistoryEntry['metadata']>): number {
  let complexity = 5; // Default medium

  if (metadata.securityRiskLevel === 'critical') complexity += 3;
  else if (metadata.securityRiskLevel === 'high') complexity += 2;

  if ((metadata.microTaskCount || 0) > 10) complexity += 2;

  return Math.min(10, complexity);
}

/**
 * Extract technologies from task description
 */
function extractTechnologies(taskDescription: string): string[] {
  const techPatterns: Record<string, RegExp> = {
    React: /react/i,
    TypeScript: /typescript|ts/i,
    Python: /python/i,
    Rust: /rust/i,
    PostgreSQL: /postgres|sql/i,
    Docker: /docker/i,
    Kubernetes: /kubernetes|k8s/i,
    Express: /express|node/i,
  };

  const found: string[] = [];
  for (const [tech, pattern] of Object.entries(techPatterns)) {
    if (pattern.test(taskDescription)) {
      found.push(tech);
    }
  }

  return found.length > 0 ? found : ['generic'];
}

/**
 * Initialize task embedding
 */
function initializeTaskEmbedding(task: TaskNode, dim: number): Float32Array {
  const embedding = new Float32Array(dim);

  embedding[0] = task.complexity / 10;
  embedding[1] = Math.min(1, task.microTaskCount / 20);
  embedding[2] = Math.min(1, task.executionPhases / 10);

  const severityMap = { critical: 1.0, high: 0.75, medium: 0.5, low: 0.25 };
  embedding[3] = severityMap[task.securityRiskLevel];

  const hash = hashString(task.taskCategory);
  for (let i = 4; i < dim; i++) {
    embedding[i] = ((hash >> (i * 2)) & 0x3) / 3.0;
  }

  return embedding;
}

/**
 * Initialize technology embedding
 */
function initializeTechEmbedding(tech: TechnologyNode, dim: number): Float32Array {
  const embedding = new Float32Array(dim);

  embedding[0] = Math.min(1, tech.usageCount / 50);
  embedding[1] = Math.min(1, tech.relatedFrameworks.length / 5);

  const hash = hashString(tech.technologyName);
  for (let i = 2; i < dim; i++) {
    embedding[i] = ((hash >> (i * 3)) & 0x7) / 7.0;
  }

  return embedding;
}

/**
 * Initialize outcome embedding
 */
function initializeOutcomeEmbedding(outcome: OutcomeNode, dim: number): Float32Array {
  const embedding = new Float32Array(dim);

  embedding[0] = outcome.gateCheckScore;
  embedding[1] = outcome.performanceScore / 100;
  embedding[2] = Math.min(1, outcome.securityFindings / 10);

  const decisionMap = { PROCEED: 1.0, ITERATE: 0.5, ABORT: 0.0 };
  embedding[3] = decisionMap[outcome.finalDecision];

  return embedding;
}

/**
 * Compute strategy score
 */
function computeStrategyScore(
  graph: {
    tasks: Map<string, TaskNode>;
    edges: StrategyEdge[];
  },
  layer: DecompositionGNNLayer,
  strategy: string
): number {
  const strategicEdges = graph.edges.filter((e) => e.strategyApproach === strategy);
  const successEdges = strategicEdges.filter((e) => {
    const isOutcome = e.targetType === 'outcome';
    return isOutcome && e.weight > 0.8;
  });

  const successRate = strategicEdges.length > 0 ? successEdges.length / strategicEdges.length : 0.5;
  const graphScore = layer.graphFeatures.reduce((a, b) => a + b, 0) / layer.graphFeatures.length;

  return successRate * 0.7 + graphScore * 0.3;
}

/**
 * Compute task similarity
 */
function computeTaskSimilarity(task1: any, task2: TaskNode): number {
  let similarity = 0;

  // Complexity similarity
  const complexityDiff = Math.abs((task1.complexity || 5) - task2.complexity);
  similarity += (1 - Math.min(1, complexityDiff / 10)) * 0.3;

  // Category similarity
  if ((task1.taskCategory || task2.taskCategory) === task2.taskCategory) {
    similarity += 0.3;
  }

  // Security level similarity
  if ((task1.securityRiskLevel || 'low') === task2.securityRiskLevel) {
    similarity += 0.2;
  }

  // Task count similarity
  const microDiff = Math.abs((task1.microTaskCount || 8) - task2.microTaskCount);
  similarity += (1 - Math.min(1, microDiff / 20)) * 0.2;

  return similarity;
}

/**
 * Estimate micro tasks for strategy
 */
function estimateMicroTasks(task: any, strategy: string): number {
  const baseCount = task.microTaskCount || 8;

  if (strategy === 'sequential') return baseCount;
  if (strategy === 'parallel') return baseCount + 2;
  if (strategy === 'hierarchical') return Math.ceil(baseCount * 1.3);
  if (strategy === 'adaptive') return Math.ceil(baseCount * 1.5);

  return baseCount;
}

/**
 * Estimate phases for strategy
 */
function estimatePhases(task: any, strategy: string): number {
  const basePhases = task.executionPhases || 3;

  if (strategy === 'sequential') return basePhases;
  if (strategy === 'parallel') return Math.max(2, basePhases - 1);
  if (strategy === 'hierarchical') return basePhases + 1;
  if (strategy === 'adaptive') return basePhases + 2;

  return basePhases;
}

/**
 * Estimate duration
 */
function estimateDuration(task: any, strategy: string): number {
  const baseMs = 60000 * (task.executionPhases || 3);

  if (strategy === 'sequential') return baseMs;
  if (strategy === 'parallel') return Math.floor(baseMs * 0.7);
  if (strategy === 'hierarchical') return Math.floor(baseMs * 1.1);
  if (strategy === 'adaptive') return Math.floor(baseMs * 1.3);

  return baseMs;
}

/**
 * Generate strategy reasoning
 */
function generateStrategyReasoning(
  strategy: string,
  task: any,
  similarTasks: Array<{ taskId: string; successRate: number }> = []
): string {
  const messages: Record<string, string> = {
    sequential: 'Sequential execution suitable for simple dependencies.',
    parallel: 'High parallelism for independent components.',
    hierarchical: 'Hierarchical decomposition for complex task structure.',
    adaptive: 'Adaptive strategy adjusts based on runtime feedback.',
  };

  let reasoning = messages[strategy] || 'Default strategy recommended.';

  if (similarTasks.length > 0) {
    const avgSuccess = similarTasks.reduce((sum, t) => sum + t.successRate, 0) / similarTasks.length;
    reasoning += ` Similar tasks succeeded ${(avgSuccess * 100).toFixed(0)}% of the time.`;
  }

  return reasoning;
}
// Helper functions (hashString) now imported from ruvector-gnn-utils.js
// Note: DecompositionStrategyRecommendation, StrategySelectionResult are exported via interface declarations above
