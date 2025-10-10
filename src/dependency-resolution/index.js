/**
 * Dependency Resolution Engine - Main Index
 *
 * Phase 2 Auto-Scaling & Resource Management
 * Cross-functional task resolution with <10ms overhead
 */

import { DependencyNode, DependencyGraph, TarjanCycleDetector, TopologicalSorter } from './dependency-graph.js';
import { DependencyResolver, RESOLUTION_STRATEGIES, ResolutionMetrics } from './dependency-resolver.js';
import { ConflictResolutionEngine, Conflict, ResolutionPlan, ConflictDetectionRules, ResolutionStrategies, CONFLICT_TYPES, CONFLICT_RESOLUTION_STRATEGIES } from './conflict-resolution-engine.js';
import { RedisCoordinationManager, CHANNELS, MESSAGE_TYPES } from './redis-coordination.js';

/**
 * Factory function to create a complete dependency resolution system
 */
export function createDependencyResolutionSystem(options = {}) {
  const resolver = new DependencyResolver(options.resolver);
  const conflictEngine = new ConflictResolutionEngine(resolver, options.conflict);

  if (options.enableRedisCoordination) {
    const coordinator = new RedisCoordinationManager(options.redis);
    return {
      resolver,
      conflictEngine,
      coordinator,
      async initialize() {
        await coordinator.initialize();
        return this;
      },
      async shutdown() {
        await coordinator.shutdown();
        return this;
      }
    };
  }

  return {
    resolver,
    conflictEngine
  };
}

/**
 * Quick start helper for basic dependency resolution
 */
export function quickStart(tasks = [], options = {}) {
  const { resolver, conflictEngine } = createDependencyResolutionSystem(options);

  // Add tasks
  for (const task of tasks) {
    resolver.addTask(task.id, task.data);
  }

  // Add dependencies
  if (options.dependencies) {
    for (const [from, to] of options.dependencies) {
      try {
        resolver.addDependency(from, to);
      } catch (error) {
        console.warn(`Could not add dependency ${from} -> ${to}: ${error.message}`);
      }
    }
  }

  return {
    async resolve() {
      // Detect conflicts
      const conflicts = await conflictEngine.detectConflicts();

      if (conflicts.length > 0) {
        console.log(`Detected ${conflicts.length} conflicts, attempting resolution...`);
        await conflictEngine.resolveAllConflicts();
      }

      return resolver.resolve();
    },

    getResolver: () => resolver,
    getConflictEngine: () => conflictEngine,

    addTask: (id, data) => resolver.addTask(id, data),
    addDependency: (from, to) => resolver.addDependency(from, to),
    updateTaskState: (id, state) => resolver.updateTaskState(id, state),

    getStats: () => ({
      graph: resolver.getStats(),
      conflicts: conflictEngine.getMetrics(),
      resolver: resolver.getMetrics()
    })
  };
}

/**
 * Performance validation helper
 */
export async function validatePerformance(options = {}) {
  const { PerformanceTestSuite } = await import('./performance-validation-test.js');
  const testSuite = new PerformanceTestSuite();
  return await testSuite.runAllTests();
}

/**
 * Utility functions for common operations
 */
export const utils = {
  /**
   * Create a simple task definition
   */
  createTask(id, priority = 0, duration = 1000, resources = []) {
    return {
      id,
      data: {
        priority,
        estimatedDuration: duration,
        requiredResources: resources,
        type: 'task'
      }
    };
  },

  /**
   * Create a dependency chain
   */
  createChain(taskIds, resolver) {
    for (let i = 1; i < taskIds.length; i++) {
      resolver.addDependency(taskIds[i], taskIds[i - 1]);
    }
  },

  /**
   * Create parallel tasks with shared resources
   */
  createParallelTasks(baseId, count, sharedResources, resolver) {
    const taskIds = [];

    for (let i = 0; i < count; i++) {
      const taskId = `${baseId}_parallel_${i}`;
      resolver.addTask(taskId, {
        priority: Math.floor(Math.random() * 10),
        estimatedDuration: Math.floor(Math.random() * 2000) + 500,
        requiredResources: sharedResources
      });
      taskIds.push(taskId);
    }

    return taskIds;
  },

  /**
   * Validate dependency graph integrity
   */
  validateGraph(resolver) {
    const cycles = resolver.detectCycles();
    const stats = resolver.getStats();

    return {
      hasCycles: cycles.length > 0,
      cycles,
      isValid: cycles.length === 0 && stats.totalNodes > 0,
      stats
    };
  }
};

// Export all main classes and constants
export {
  // Core classes
  DependencyNode,
  DependencyGraph,
  DependencyResolver,
  ConflictResolutionEngine,
  RedisCoordinationManager,

  // Algorithm classes
  TarjanCycleDetector,
  TopologicalSorter,
  ConflictDetectionRules,
  ResolutionStrategies,

  // Data structures
  Conflict,
  ResolutionPlan,
  ResolutionMetrics,

  // Constants
  RESOLUTION_STRATEGIES,
  CONFLICT_TYPES,
  CONFLICT_RESOLUTION_STRATEGIES,
  CHANNELS,
  MESSAGE_TYPES
};

// Default export
export default {
  createDependencyResolutionSystem,
  quickStart,
  validatePerformance,
  utils,
  DependencyNode,
  DependencyGraph,
  DependencyResolver,
  ConflictResolutionEngine,
  RedisCoordinationManager,
  RESOLUTION_STRATEGIES,
  CONFLICT_TYPES
};