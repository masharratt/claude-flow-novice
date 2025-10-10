/**
 * Dependency Resolver Engine
 *
 * High-performance dependency resolution with <10ms overhead
 * Supports up to 10,000 nodes using optimized algorithms
 */

import { DependencyGraph, TarjanCycleDetector, TopologicalSorter } from './dependency-graph.js';
import { performance } from 'perf_hooks';

/**
 * Resolution Strategy Configuration
 */
const RESOLUTION_STRATEGIES = {
  TOPOLOGICAL: 'topological',
  PRIORITY_BASED: 'priority_based',
  RESOURCE_AWARE: 'resource_aware',
  DEADLINE_DRIVEN: 'deadline_driven',
  CRITICAL_PATH: 'critical_path'
};

/**
 * Performance Metrics for Resolution Operations
 */
class ResolutionMetrics {
  constructor() {
    this.startTime = performance.now();
    this.operations = {
      cycleDetection: [],
      topologicalSort: [],
      prioritySort: [],
      resourceAnalysis: [],
      conflictResolution: []
    };
  }

  recordOperation(operation, duration, nodeCount) {
    if (!this.operations[operation]) {
      this.operations[operation] = [];
    }

    this.operations[operation].push({
      duration,
      nodeCount,
      timestamp: performance.now() - this.startTime,
      throughput: nodeCount / duration * 1000 // nodes per second
    });
  }

  getReport() {
    const report = {};

    for (const [op, measurements] of Object.entries(this.operations)) {
      if (measurements.length === 0) continue;

      const durations = measurements.map(m => m.duration);
      const throughputs = measurements.map(m => m.throughput);

      report[op] = {
        count: measurements.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        avgThroughput: throughputs.reduce((a, b) => a + b, 0) / throughputs.length,
        maxThroughput: Math.max(...throughputs)
      };
    }

    return report;
  }
}

/**
 * Main Dependency Resolver Class
 */
class DependencyResolver {
  constructor(options = {}) {
    this.graph = new DependencyGraph();
    this.metrics = new ResolutionMetrics();
    this.options = {
      strategy: RESOLUTION_STRATEGIES.TOPOLOGICAL,
      enableCycleDetection: true,
      enableMetrics: true,
      maxResolutionTime: 10, // ms
      ...options
    };

    this.cache = new Map();
    this.lastResolution = null;
  }

  /**
   * Add a task to the dependency graph
   */
  addTask(taskId, taskData = {}) {
    const startTime = performance.now();

    const node = this.graph.addNode({
      id: taskId,
      data: {
        type: 'task',
        priority: taskData.priority || 0,
        estimatedDuration: taskData.estimatedDuration || 0,
        requiredResources: taskData.requiredResources || [],
        deadline: taskData.deadline || null,
        critical: taskData.critical || false,
        ...taskData
      }
    });

    if (taskData.dependencies) {
      for (const depId of taskData.dependencies) {
        this.addDependency(taskId, depId);
      }
    }

    this.invalidateCache();

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('addTask', performance.now() - startTime, 1);
    }

    return node;
  }

  /**
   * Add a dependency between two tasks
   */
  addDependency(taskId, dependsOnTaskId) {
    const startTime = performance.now();

    try {
      this.graph.addDependency(taskId, dependsOnTaskId);
      this.invalidateCache();

      if (this.options.enableMetrics) {
        this.metrics.recordOperation('addDependency', performance.now() - startTime, 2);
      }

      return true;
    } catch (error) {
      if (this.options.enableMetrics) {
        this.metrics.recordOperation('addDependencyFailed', performance.now() - startTime, 2);
      }
      throw error;
    }
  }

  /**
   * Remove a dependency between two tasks
   */
  removeDependency(taskId, dependsOnTaskId) {
    const startTime = performance.now();

    const result = this.graph.removeDependency(taskId, dependsOnTaskId);

    if (result) {
      this.invalidateCache();
    }

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('removeDependency', performance.now() - startTime, 2);
    }

    return result;
  }

  /**
   * Detect cycles in the dependency graph
   */
  detectCycles() {
    const startTime = performance.now();

    const detector = new TarjanCycleDetector(this.graph);
    const cycles = detector.detectCycles();

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('cycleDetection', performance.now() - startTime, this.graph.nodes.size);
    }

    return cycles;
  }

  /**
   * Check if the graph has any cycles
   */
  hasCycles() {
    const startTime = performance.now();

    const detector = new TarjanCycleDetector(this.graph);
    const hasCycles = detector.hasCycles();

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('cycleDetection', performance.now() - startTime, this.graph.nodes.size);
    }

    return hasCycles;
  }

  /**
   * Resolve dependencies using the configured strategy
   */
  resolve() {
    const startTime = performance.now();

    // Check cache first
    const cacheKey = this.generateCacheKey();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Cycle detection
    if (this.options.enableCycleDetection && this.hasCycles()) {
      const cycles = this.detectCycles();
      throw new Error(`Dependency cycles detected: ${JSON.stringify(cycles)}`);
    }

    let result;
    switch (this.options.strategy) {
      case RESOLUTION_STRATEGIES.PRIORITY_BASED:
        result = this.resolvePriorityBased();
        break;
      case RESOLUTION_STRATEGIES.RESOURCE_AWARE:
        result = this.resolveResourceAware();
        break;
      case RESOLUTION_STRATEGIES.DEADLINE_DRIVEN:
        result = this.resolveDeadlineDriven();
        break;
      case RESOLUTION_STRATEGIES.CRITICAL_PATH:
        result = this.resolveCriticalPath();
        break;
      case RESOLUTION_STRATEGIES.TOPOLOGICAL:
      default:
        result = this.resolveTopological();
        break;
    }

    const resolutionTime = performance.now() - startTime;

    if (resolutionTime > this.options.maxResolutionTime) {
      console.warn(`Resolution time ${resolutionTime.toFixed(2)}ms exceeded threshold of ${this.options.maxResolutionTime}ms`);
    }

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('resolve', resolutionTime, this.graph.nodes.size);
    }

    // Cache the result
    this.cache.set(cacheKey, result);
    this.lastResolution = result;

    return result;
  }

  /**
   * Topological sorting resolution
   */
  resolveTopological() {
    const startTime = performance.now();

    const sorter = new TopologicalSorter(this.graph);
    const sortedNodes = sorter.sort();

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('topologicalSort', performance.now() - startTime, this.graph.nodes.size);
    }

    return {
      strategy: RESOLUTION_STRATEGIES.TOPOLOGICAL,
      executionOrder: sortedNodes,
      levels: sorter.getExecutionLevels(),
      totalNodes: sortedNodes.length
    };
  }

  /**
   * Priority-based resolution
   */
  resolvePriorityBased() {
    const startTime = performance.now();

    const sorter = new TopologicalSorter(this.graph);
    const levels = sorter.getExecutionLevels();

    // Sort each level by priority (descending)
    const prioritizedLevels = levels.map(level =>
      level.sort((a, b) => {
        const nodeA = this.graph.getNode(a);
        const nodeB = this.graph.getNode(b);
        return (nodeB.data.priority || 0) - (nodeA.data.priority || 0);
      })
    );

    const executionOrder = prioritizedLevels.flat();

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('prioritySort', performance.now() - startTime, this.graph.nodes.size);
    }

    return {
      strategy: RESOLUTION_STRATEGIES.PRIORITY_BASED,
      executionOrder,
      levels: prioritizedLevels,
      totalNodes: executionOrder.length
    };
  }

  /**
   * Resource-aware resolution
   */
  resolveResourceAware() {
    const startTime = performance.now();

    const sorter = new TopologicalSorter(this.graph);
    const levels = sorter.getExecutionLevels();

    // Sort nodes within each level by resource requirements
    const resourceOptimizedLevels = levels.map(level => {
      return level.sort((a, b) => {
        const nodeA = this.graph.getNode(a);
        const nodeB = this.graph.getNode(b);

        // Prefer tasks with fewer resource conflicts
        const resourceCountA = (nodeA.data.requiredResources || []).length;
        const resourceCountB = (nodeB.data.requiredResources || []).length;

        return resourceCountA - resourceCountB;
      });
    });

    const executionOrder = resourceOptimizedLevels.flat();

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('resourceAnalysis', performance.now() - startTime, this.graph.nodes.size);
    }

    return {
      strategy: RESOLUTION_STRATEGIES.RESOURCE_AWARE,
      executionOrder,
      levels: resourceOptimizedLevels,
      totalNodes: executionOrder.length,
      resourceAnalysis: this.analyzeResourceUsage(executionOrder)
    };
  }

  /**
   * Deadline-driven resolution
   */
  resolveDeadlineDriven() {
    const startTime = performance.now();

    const sorter = new TopologicalSorter(this.graph);
    const levels = sorter.getExecutionLevels();

    // Sort by deadline (earliest first)
    const deadlineOptimizedLevels = levels.map(level => {
      return level.sort((a, b) => {
        const nodeA = this.graph.getNode(a);
        const nodeB = this.graph.getNode(b);

        const deadlineA = nodeA.data.deadline || Number.MAX_SAFE_INTEGER;
        const deadlineB = nodeB.data.deadline || Number.MAX_SAFE_INTEGER;

        return deadlineA - deadlineB;
      });
    });

    const executionOrder = deadlineOptimizedLevels.flat();

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('deadlineAnalysis', performance.now() - startTime, this.graph.nodes.size);
    }

    return {
      strategy: RESOLUTION_STRATEGIES.DEADLINE_DRIVEN,
      executionOrder,
      levels: deadlineOptimizedLevels,
      totalNodes: executionOrder.length
    };
  }

  /**
   * Critical path resolution
   */
  resolveCriticalPath() {
    const startTime = performance.now();

    // Calculate critical path using longest path algorithm
    const criticalPath = this.calculateCriticalPath();
    const criticalSet = new Set(criticalPath);

    // Sort by critical path priority
    const sorter = new TopologicalSorter(this.graph);
    const levels = sorter.getExecutionLevels();

    const criticalPathLevels = levels.map(level => {
      return level.sort((a, b) => {
        const aCritical = criticalSet.has(a);
        const bCritical = criticalSet.has(b);

        if (aCritical && !bCritical) return -1;
        if (!aCritical && bCritical) return 1;

        // Within critical path, sort by duration
        const nodeA = this.graph.getNode(a);
        const nodeB = this.graph.getNode(b);

        return (nodeB.data.estimatedDuration || 0) - (nodeA.data.estimatedDuration || 0);
      });
    });

    const executionOrder = criticalPathLevels.flat();

    if (this.options.enableMetrics) {
      this.metrics.recordOperation('criticalPathAnalysis', performance.now() - startTime, this.graph.nodes.size);
    }

    return {
      strategy: RESOLUTION_STRATEGIES.CRITICAL_PATH,
      executionOrder,
      levels: criticalPathLevels,
      totalNodes: executionOrder.length,
      criticalPath,
      criticalPathLength: this.calculateCriticalPathLength(criticalPath)
    };
  }

  /**
   * Calculate the critical path in the dependency graph
   */
  calculateCriticalPath() {
    const nodeDurations = new Map();
    const longestPaths = new Map();

    // Initialize durations
    for (const [nodeId, node] of this.graph.nodes) {
      nodeDurations.set(nodeId, node.data.estimatedDuration || 1);
      longestPaths.set(nodeId, 0);
    }

    // Calculate longest path to each node
    const sortedNodes = new TopologicalSorter(this.graph).sort();

    for (const nodeId of sortedNodes) {
      const node = this.graph.getNode(nodeId);
      let maxPath = 0;

      for (const depId of node.dependencies) {
        const depPath = longestPaths.get(depId) + nodeDurations.get(depId);
        maxPath = Math.max(maxPath, depPath);
      }

      longestPaths.set(nodeId, maxPath);
    }

    // Find the end of the critical path
    let endNode = null;
    let maxPath = 0;

    for (const [nodeId, pathLength] of longestPaths) {
      if (pathLength > maxPath) {
        maxPath = pathLength;
        endNode = nodeId;
      }
    }

    // Backtrack to find the critical path
    const criticalPath = [];
    let currentNode = endNode;

    while (currentNode) {
      criticalPath.unshift(currentNode);

      const node = this.graph.getNode(currentNode);
      let nextNode = null;
      let maxDepPath = -1;

      for (const depId of node.dependencies) {
        const depPath = longestPaths.get(depId);
        if (depPath > maxDepPath) {
          maxDepPath = depPath;
          nextNode = depId;
        }
      }

      currentNode = nextNode;
    }

    return criticalPath;
  }

  /**
   * Calculate critical path length
   */
  calculateCriticalPathLength(criticalPath) {
    return criticalPath.reduce((total, nodeId) => {
      const node = this.graph.getNode(nodeId);
      return total + (node.data.estimatedDuration || 1);
    }, 0);
  }

  /**
   * Analyze resource usage across the execution plan
   */
  analyzeResourceUsage(executionOrder) {
    const resourceUsage = new Map();
    const conflicts = [];

    for (const nodeId of executionOrder) {
      const node = this.graph.getNode(nodeId);
      const resources = node.data.requiredResources || [];

      for (const resource of resources) {
        if (!resourceUsage.has(resource)) {
          resourceUsage.set(resource, []);
        }
        resourceUsage.get(resource).push(nodeId);
      }
    }

    // Find resource conflicts
    for (const [resource, nodes] of resourceUsage) {
      if (nodes.length > 1) {
        conflicts.push({
          resource,
          nodes,
          count: nodes.length
        });
      }
    }

    return {
      totalResources: resourceUsage.size,
      conflicts: conflicts.sort((a, b) => b.count - a.count),
      resourceUsage: Object.fromEntries(resourceUsage)
    };
  }

  /**
   * Get ready tasks that can be executed immediately
   */
  getReadyTasks() {
    return this.graph.getReadyNodes().map(node => ({
      id: node.id,
      data: node.data,
      priority: node.data.priority || 0,
      estimatedDuration: node.data.estimatedDuration || 0
    })).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Update task state
   */
  updateTaskState(taskId, newState) {
    const node = this.graph.getNode(taskId);
    if (!node) {
      throw new Error(`Task not found: ${taskId}`);
    }

    node.updateState(newState);
    this.invalidateCache();

    return node;
  }

  /**
   * Set resolution strategy
   */
  setStrategy(strategy) {
    if (!Object.values(RESOLUTION_STRATEGIES).includes(strategy)) {
      throw new Error(`Invalid strategy: ${strategy}`);
    }

    this.options.strategy = strategy;
    this.invalidateCache();
  }

  /**
   * Generate cache key based on graph state
   */
  generateCacheKey() {
    const nodes = Array.from(this.graph.nodes.keys()).sort().join(',');
    const strategy = this.options.strategy;
    return `${strategy}:${nodes}`;
  }

  /**
   * Invalidate resolution cache
   */
  invalidateCache() {
    this.cache.clear();
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return this.metrics.getReport();
  }

  /**
   * Get graph statistics
   */
  getStats() {
    return this.graph.getStats();
  }

  /**
   * Export the current state for persistence
   */
  export() {
    return {
      graph: this.graph.toJSON(),
      options: this.options,
      metrics: this.getMetrics(),
      lastResolution: this.lastResolution
    };
  }

  /**
   * Import state from persistence
   */
  static import(data) {
    const resolver = new DependencyResolver(data.options);
    resolver.graph = DependencyGraph.fromJSON(data.graph);

    if (data.lastResolution) {
      resolver.lastResolution = data.lastResolution;
    }

    return resolver;
  }
}

export {
  DependencyResolver,
  RESOLUTION_STRATEGIES,
  ResolutionMetrics
};