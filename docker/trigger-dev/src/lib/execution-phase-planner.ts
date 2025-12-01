/**
 * Execution Phase Planner - Dependency-Aware Parallel Execution
 *
 * Creates execution phases that respect all dependencies from the 4 perspectives:
 * - Architecture dependencies (data flow, component order)
 * - Security dependencies (auth before protected resources)
 * - Performance dependencies (infrastructure before optimization)
 * - Testing dependencies (implementation before tests)
 *
 * Algorithm:
 * 1. Build dependency graph from all micro-tasks
 * 2. Topological sort to find valid ordering
 * 3. Group tasks by dependency level (parallelizable groups)
 * 4. Identify critical path for timing estimates
 *
 * @module execution-phase-planner
 * @version 1.0.0
 */

import type { RefinedMicroTask } from "./decomposition-merger.js";

// =============================================
// Type Definitions
// =============================================

export interface ExecutionPhase {
  phase: number;
  parallelTasks: string[]; // Task IDs that can run in parallel
  dependencies: string[]; // Task IDs that must complete before this phase
  estimatedDuration: number; // Minutes (max of parallel tasks)
  criticalPath: boolean; // Whether this phase is on the critical path
}

export interface ExecutionPlan {
  phases: ExecutionPhase[];
  totalPhases: number;
  totalEstimatedDuration: number; // Minutes
  criticalPath: string[]; // Task IDs on the critical path
  parallelismScore: number; // % of tasks that can run in parallel
  maxParallelTasks: number; // Peak parallelism
}

export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, string[]>; // taskId -> dependentTaskIds
}

interface GraphNode {
  taskId: string;
  task: RefinedMicroTask;
  dependencies: string[];
  dependents: string[];
  level: number; // Topological level (0 = no deps, 1 = depends on level 0, etc.)
}

// =============================================
// Main Planner
// =============================================

/**
 * Create execution phases from refined micro-tasks.
 *
 * This is the core algorithm that enables parallel execution while
 * respecting all cross-cutting dependencies.
 */
export function createExecutionPhases(tasks: RefinedMicroTask[]): ExecutionPlan {
  const startTime = Date.now();

  console.log(`[planner] Creating execution phases for ${tasks.length} tasks`);

  // Step 1: Build dependency graph
  const graph = buildDependencyGraph(tasks);
  console.log(`  Graph: ${graph.nodes.size} nodes, ${countEdges(graph)} edges`);

  // Step 2: Validate no circular dependencies
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    throw new Error(
      `Circular dependencies detected: ${cycles.map((c) => c.join(" -> ")).join("; ")}`
    );
  }
  console.log(`  No circular dependencies ✓`);

  // Step 3: Topological sort and assign levels
  assignTopologicalLevels(graph);

  // Step 4: Group tasks by level into phases
  const phases = groupTasksIntoPhases(graph, tasks);
  console.log(`  Created ${phases.length} execution phases`);

  // Step 5: Calculate critical path
  const criticalPath = calculateCriticalPath(graph, phases, tasks);
  console.log(`  Critical path: ${criticalPath.length} tasks`);

  // Step 6: Calculate metrics
  const totalEstimatedDuration = phases.reduce((sum, p) => sum + p.estimatedDuration, 0);
  const maxParallelTasks = Math.max(...phases.map((p) => p.parallelTasks.length));
  const parallelismScore = calculateParallelismScore(phases, tasks.length);

  const plan: ExecutionPlan = {
    phases,
    totalPhases: phases.length,
    totalEstimatedDuration,
    criticalPath,
    parallelismScore,
    maxParallelTasks,
  };

  const duration = Date.now() - startTime;
  console.log(`[planner] Execution plan complete in ${duration}ms`);
  console.log(`  Phases: ${plan.totalPhases}`);
  console.log(`  Estimated duration: ${plan.totalEstimatedDuration} minutes`);
  console.log(`  Parallelism score: ${(plan.parallelismScore * 100).toFixed(1)}%`);
  console.log(`  Max parallel tasks: ${plan.maxParallelTasks}`);

  return plan;
}

// =============================================
// Dependency Graph Construction
// =============================================

function buildDependencyGraph(tasks: RefinedMicroTask[]): DependencyGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, string[]>();

  // Initialize nodes
  for (const task of tasks) {
    nodes.set(task.id, {
      taskId: task.id,
      task,
      dependencies: [...task.dependencies],
      dependents: [],
      level: -1, // Will be assigned in topological sort
    });
    edges.set(task.id, []);
  }

  // Build edges (task -> tasks that depend on it)
  for (const task of tasks) {
    for (const depId of task.dependencies) {
      if (!edges.has(depId)) {
        console.warn(`  Warning: Dependency ${depId} not found for task ${task.id}`);
        continue;
      }
      edges.get(depId)!.push(task.id);
      nodes.get(task.id)!.dependents.push(depId);
    }
  }

  return { nodes, edges };
}

function countEdges(graph: DependencyGraph): number {
  let count = 0;
  for (const deps of Array.from(graph.edges.values())) {
    count += deps.length;
  }
  return count;
}

// =============================================
// Cycle Detection
// =============================================

function detectCycles(graph: DependencyGraph): string[][] {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(nodeId: string, path: string[]): void {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const dependents = graph.edges.get(nodeId) || [];
    for (const depId of dependents) {
      if (!visited.has(depId)) {
        dfs(depId, [...path]);
      } else if (recursionStack.has(depId)) {
        // Cycle detected
        const cycleStart = path.indexOf(depId);
        cycles.push([...path.slice(cycleStart), depId]);
      }
    }

    recursionStack.delete(nodeId);
  }

  for (const nodeId of Array.from(graph.nodes.keys())) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, []);
    }
  }

  return cycles;
}

// =============================================
// Topological Sort and Level Assignment
// =============================================

function assignTopologicalLevels(graph: DependencyGraph): void {
  // Kahn's algorithm for topological sort
  const inDegree = new Map<string, number>();
  const queue: string[] = [];

  // Calculate in-degrees
  for (const nodeId of Array.from(graph.nodes.keys())) {
    const deps = graph.nodes.get(nodeId)!.dependencies;
    inDegree.set(nodeId, deps.length);

    if (deps.length === 0) {
      queue.push(nodeId);
      graph.nodes.get(nodeId)!.level = 0;
    }
  }

  // Process queue
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = graph.nodes.get(nodeId)!;
    const dependents = graph.edges.get(nodeId) || [];

    for (const depId of dependents) {
      const currentInDegree = inDegree.get(depId)!;
      inDegree.set(depId, currentInDegree - 1);

      if (currentInDegree - 1 === 0) {
        // All dependencies satisfied, assign level
        const depNode = graph.nodes.get(depId)!;
        const maxDepLevel = Math.max(
          ...depNode.dependencies.map((d) => graph.nodes.get(d)?.level ?? -1)
        );
        depNode.level = maxDepLevel + 1;
        queue.push(depId);
      }
    }
  }
}

// =============================================
// Phase Grouping
// =============================================

function groupTasksIntoPhases(
  graph: DependencyGraph,
  tasks: RefinedMicroTask[]
): ExecutionPhase[] {
  // Group tasks by level
  const levelMap = new Map<number, string[]>();

  for (const node of Array.from(graph.nodes.values())) {
    if (node.level === -1) {
      console.warn(`  Warning: Task ${node.taskId} has unassigned level (isolated node?)`);
      node.level = 0;
    }

    if (!levelMap.has(node.level)) {
      levelMap.set(node.level, []);
    }
    levelMap.get(node.level)!.push(node.taskId);
  }

  // Sort levels and create phases
  const sortedLevels = Array.from(levelMap.keys()).sort((a, b) => a - b);
  const phases: ExecutionPhase[] = [];

  for (let i = 0; i < sortedLevels.length; i++) {
    const level = sortedLevels[i];
    const parallelTasks = levelMap.get(level)!;

    // Dependencies are all tasks from previous levels
    const dependencies: string[] = [];
    for (let j = 0; j < i; j++) {
      const prevLevel = sortedLevels[j];
      dependencies.push(...levelMap.get(prevLevel)!);
    }

    // Estimated duration is the max of all parallel tasks
    const taskObjects = parallelTasks.map((id) => tasks.find((t) => t.id === id)!);
    const estimatedDuration = Math.max(
      ...taskObjects.map((t) => estimateTaskDuration(t))
    );

    phases.push({
      phase: i + 1,
      parallelTasks,
      dependencies,
      estimatedDuration,
      criticalPath: false, // Will be set in critical path calculation
    });
  }

  return phases;
}

function estimateTaskDuration(task: RefinedMicroTask): number {
  const effortMap = {
    small: 5, // 5 minutes
    medium: 15, // 15 minutes
    large: 30, // 30 minutes
  };

  return effortMap[task.estimatedEffort];
}

// =============================================
// Critical Path Calculation
// =============================================

function calculateCriticalPath(
  graph: DependencyGraph,
  phases: ExecutionPhase[],
  tasks: RefinedMicroTask[]
): string[] {
  // Find the task with the longest path to completion
  const taskDurations = new Map<string, number>();
  const taskPaths = new Map<string, string[]>();

  // Initialize all tasks
  for (const task of tasks) {
    taskDurations.set(task.id, estimateTaskDuration(task));
    taskPaths.set(task.id, [task.id]);
  }

  // Process tasks in topological order (by phase)
  for (const phase of phases) {
    for (const taskId of phase.parallelTasks) {
      const node = graph.nodes.get(taskId)!;
      const taskDuration = estimateTaskDuration(node.task);

      // Find longest path from dependencies
      let maxPathDuration = 0;
      let longestPath: string[] = [];

      for (const depId of node.dependencies) {
        const depDuration = taskDurations.get(depId) || 0;
        if (depDuration > maxPathDuration) {
          maxPathDuration = depDuration;
          longestPath = taskPaths.get(depId) || [];
        }
      }

      // Update this task's path
      taskDurations.set(taskId, maxPathDuration + taskDuration);
      taskPaths.set(taskId, [...longestPath, taskId]);
    }
  }

  // Find overall longest path
  let criticalPath: string[] = [];
  let maxDuration = 0;

  for (const [taskId, duration] of Array.from(taskDurations.entries())) {
    if (duration > maxDuration) {
      maxDuration = duration;
      criticalPath = taskPaths.get(taskId)!;
    }
  }

  // Mark phases on critical path
  const criticalTaskSet = new Set(criticalPath);
  for (const phase of phases) {
    phase.criticalPath = phase.parallelTasks.some((id) => criticalTaskSet.has(id));
  }

  return criticalPath;
}

// =============================================
// Metrics
// =============================================

function calculateParallelismScore(phases: ExecutionPhase[], totalTasks: number): number {
  // Parallelism score = average tasks per phase / total tasks
  const avgTasksPerPhase = totalTasks / phases.length;
  return avgTasksPerPhase / totalTasks;
}
