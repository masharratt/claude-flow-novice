/**
 * Conflict Resolution Engine for Cross-Functional Task Resolution
 *
 * Provides automated conflict resolution with multiple strategies
 * Integrates with dependency graph and resolver for seamless coordination
 */

import { performance } from 'perf_hooks';

/**
 * Conflict Types
 */
const CONFLICT_TYPES = {
  RESOURCE: 'resource',
  DEADLINE: 'deadline',
  PRIORITY: 'priority',
  DEPENDENCY: 'dependency',
  CYCLE: 'cycle',
  SCHEDULING: 'scheduling',
  CONSTRAINT: 'constraint'
};

/**
 * Resolution Strategies
 */
const RESOLUTION_STRATEGIES = {
  PRIORITY_OVERRIDE: 'priority_override',
  DEADLINE_ADJUSTMENT: 'deadline_adjustment',
  RESOURCE_REALLOCATION: 'resource_reallocation',
  DEPENDENCY_RESTRUCTURING: 'dependency_restructuring',
  TASK_SPLITTING: 'task_splitting',
  PARALLEL_EXECUTION: 'parallel_execution',
  DELAY_RESOLUTION: 'delay_resolution',
  CANCEL_LOWER_PRIORITY: 'cancel_lower_priority'
};

/**
 * Conflict Definition
 */
class Conflict {
  constructor(type, involvedTasks, severity = 'medium', details = {}) {
    this.id = `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = type;
    this.involvedTasks = involvedTasks;
    this.severity = severity; // low, medium, high, critical
    this.details = details;
    this.timestamp = Date.now();
    this.status = 'pending'; // pending, resolving, resolved, escalated
    this.resolution = null;
    this.resolutionAttempts = 0;
    this.maxAttempts = 3;
  }

  addAttempt() {
    this.resolutionAttempts++;
    if (this.resolutionAttempts >= this.maxAttempts) {
      this.status = 'escalated';
    }
  }

  setResolution(resolution) {
    this.resolution = resolution;
    this.status = 'resolved';
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      involvedTasks: this.involvedTasks,
      severity: this.severity,
      details: this.details,
      timestamp: this.timestamp,
      status: this.status,
      resolution: this.resolution,
      resolutionAttempts: this.resolutionAttempts
    };
  }
}

/**
 * Resolution Plan
 */
class ResolutionPlan {
  constructor(conflictId, strategy, actions, expectedOutcome) {
    this.conflictId = conflictId;
    this.strategy = strategy;
    this.actions = actions;
    this.expectedOutcome = expectedOutcome;
    this.timestamp = Date.now();
    this.status = 'pending';
    this.executionLog = [];
  }

  execute() {
    this.status = 'executing';
    const results = [];

    for (const action of this.actions) {
      try {
        const result = action.execute();
        this.executionLog.push({
          action: action.description,
          result: 'success',
          details: result,
          timestamp: Date.now()
        });
        results.push(result);
      } catch (error) {
        this.executionLog.push({
          action: action.description,
          result: 'error',
          details: error.message,
          timestamp: Date.now()
        });
        throw error;
      }
    }

    this.status = 'completed';
    return results;
  }

  toJSON() {
    return {
      conflictId: this.conflictId,
      strategy: this.strategy,
      actions: this.actions.map(a => ({ description: a.description, type: a.type })),
      expectedOutcome: this.expectedOutcome,
      timestamp: this.timestamp,
      status: this.status,
      executionLog: this.executionLog
    };
  }
}

/**
 * Conflict Detection Rules
 */
class ConflictDetectionRules {
  constructor() {
    this.rules = new Map();
    this.initializeRules();
  }

  initializeRules() {
    // Resource conflict detection
    this.rules.set('resource_conflict', {
      detect: (tasks, dependencies) => {
        const conflicts = [];
        const resourceUsage = new Map();

        // Build resource usage map
        for (const task of tasks) {
          const resources = task.data.requiredResources || [];
          for (const resource of resources) {
            if (!resourceUsage.has(resource)) {
              resourceUsage.set(resource, []);
            }
            resourceUsage.get(resource).push(task);
          }
        }

        // Identify conflicts
        for (const [resource, taskList] of resourceUsage) {
          if (taskList.length > 1) {
            // Check if tasks are scheduled to run concurrently
            const concurrentTasks = taskList.filter(task => {
              const deps = dependencies.get(task.id) || [];
              return deps.length === 0; // Ready tasks
            });

            if (concurrentTasks.length > 1) {
              conflicts.push(new Conflict(
                CONFLICT_TYPES.RESOURCE,
                concurrentTasks.map(t => t.id),
                this.calculateSeverity(concurrentTasks),
                {
                  resource,
                  competingTasks: concurrentTasks.length,
                  totalDemand: concurrentTasks.reduce((sum, t) => sum + (t.data.resourceDemand || 1), 0)
                }
              ));
            }
          }
        }

        return conflicts;
      }
    });

    // Deadline conflict detection
    this.rules.set('deadline_conflict', {
      detect: (tasks, dependencies) => {
        const conflicts = [];
        const now = Date.now();

        for (const task of tasks) {
          const deadline = task.data.deadline;
          const estimatedDuration = task.data.estimatedDuration || 0;

          if (deadline && deadline <= now + estimatedDuration) {
            // Calculate critical path to see if deadline can be met
            const criticalPath = this.calculateCriticalPath(task, dependencies);
            const totalTime = criticalPath.reduce((sum, t) => sum + (t.data.estimatedDuration || 0), 0);

            if (totalTime > deadline - now) {
              conflicts.push(new Conflict(
                CONFLICT_TYPES.DEADLINE,
                [task.id, ...criticalPath.map(t => t.id)],
                this.calculateDeadlineSeverity(deadline, now),
                {
                  deadline,
                  requiredTime: totalTime,
                  availableTime: deadline - now,
                  criticalPathLength: criticalPath.length
                }
              ));
            }
          }
        }

        return conflicts;
      }
    });

    // Priority conflict detection
    this.rules.set('priority_conflict', {
      detect: (tasks, dependencies) => {
        const conflicts = [];
        const readyTasks = tasks.filter(task => {
          const deps = dependencies.get(task.id) || [];
          return deps.length === 0;
        });

        // Check for priority inversions
        const sortedByPriority = readyTasks.sort((a, b) =>
          (b.data.priority || 0) - (a.data.priority || 0)
        );

        for (let i = 0; i < sortedByPriority.length - 1; i++) {
          const higherPriority = sortedByPriority[i];
          const lowerPriority = sortedByPriority[i + 1];

          if ((higherPriority.data.priority || 0) > (lowerPriority.data.priority || 0)) {
            // Check if lower priority task blocks higher priority task
            if (this.dependsOn(lowerPriority, higherPriority, dependencies)) {
              conflicts.push(new Conflict(
                CONFLICT_TYPES.PRIORITY,
                [higherPriority.id, lowerPriority.id],
                'high',
                {
                  higherPriority: higherPriority.data.priority,
                  lowerPriority: lowerPriority.data.priority,
                  inversionType: 'blocking'
                }
              ));
            }
          }
        }

        return conflicts;
      }
    });
  }

  calculateSeverity(tasks) {
    const totalPriority = tasks.reduce((sum, task) => sum + (task.data.priority || 0), 0);
    const avgPriority = totalPriority / tasks.length;

    if (avgPriority >= 8) return 'critical';
    if (avgPriority >= 6) return 'high';
    if (avgPriority >= 4) return 'medium';
    return 'low';
  }

  calculateDeadlineSeverity(deadline, now) {
    const timeUntilDeadline = deadline - now;
    const hoursUntilDeadline = timeUntilDeadline / (1000 * 60 * 60);

    if (hoursUntilDeadline < 1) return 'critical';
    if (hoursUntilDeadline < 6) return 'high';
    if (hoursUntilDeadline < 24) return 'medium';
    return 'low';
  }

  calculateCriticalPath(task, dependencies) {
    // Simplified critical path calculation
    const path = [task];
    let currentTask = task;

    while (true) {
      const deps = dependencies.get(currentTask.id) || [];
      if (deps.length === 0) break;

      // Find the longest dependency
      let longestDep = null;
      let maxDuration = 0;

      for (const dep of deps) {
        if ((dep.data.estimatedDuration || 0) > maxDuration) {
          maxDuration = dep.data.estimatedDuration || 0;
          longestDep = dep;
        }
      }

      if (!longestDep) break;
      path.push(longestDep);
      currentTask = longestDep;
    }

    return path;
  }

  dependsOn(taskA, taskB, dependencies) {
    // Check if taskA depends on taskB (directly or indirectly)
    const visited = new Set();

    const checkDependency = (taskId) => {
      if (taskId === taskB.id) return true;
      if (visited.has(taskId)) return false;

      visited.add(taskId);
      const deps = dependencies.get(taskId) || [];

      for (const dep of deps) {
        if (checkDependency(dep.id)) return true;
      }

      return false;
    };

    return checkDependency(taskA.id);
  }
}

/**
 * Resolution Strategies Implementation
 */
class ResolutionStrategies {
  constructor(dependencyResolver) {
    this.dependencyResolver = dependencyResolver;
  }

  async resolvePriorityOverride(conflict) {
    const { involvedTasks, details } = conflict;
    const tasks = involvedTasks.map(id => this.dependencyResolver.graph.getNode(id));

    // Sort by priority
    tasks.sort((a, b) => (b.data.priority || 0) - (a.data.priority || 0));

    const actions = [];

    // Lower priority tasks get delayed or reallocated
    for (let i = 1; i < tasks.length; i++) {
      const lowerTask = tasks[i];
      actions.push({
        type: 'delay',
        description: `Delay lower priority task ${lowerTask.id}`,
        execute: () => {
          lowerTask.data.delayed = true;
          lowerTask.data.delayReason = `priority_override_${conflict.id}`;
          this.dependencyResolver.invalidateCache();
          return { delayed: lowerTask.id };
        }
      });
    }

    return new ResolutionPlan(
      conflict.id,
      RESOLUTION_STRATEGIES.PRIORITY_OVERRIDE,
      actions,
      'Higher priority tasks proceed, lower priority tasks are delayed'
    );
  }

  async resolveResourceReallocation(conflict) {
    const { involvedTasks, details } = conflict;
    const { resource } = details;

    const actions = [];
    const tasks = involvedTasks.map(id => this.dependencyResolver.graph.getNode(id));

    // Find alternative resources or schedule sequentially
    actions.push({
      type: 'schedule_sequential',
      description: `Schedule tasks requiring ${resource} sequentially`,
      execute: () => {
        // Add temporary dependencies to ensure sequential execution
        for (let i = 1; i < tasks.length; i++) {
          try {
            this.dependencyResolver.addDependency(tasks[i].id, tasks[i-1].id);
          } catch (error) {
            // Dependency might already exist or create cycle
            console.warn(`Could not add dependency: ${error.message}`);
          }
        }
        return { sequential: tasks.map(t => t.id) };
      }
    });

    return new ResolutionPlan(
      conflict.id,
      RESOLUTION_STRATEGIES.RESOURCE_REALLOCATION,
      actions,
      'Tasks with resource conflicts are scheduled sequentially'
    );
  }

  async resolveDeadlineAdjustment(conflict) {
    const { involvedTasks, details } = conflict;
    const { deadline, requiredTime, availableTime } = details;

    const actions = [];
    const tasks = involvedTasks.map(id => this.dependencyResolver.graph.getNode(id));

    // Option 1: Extend deadline
    if (details.canExtendDeadline) {
      actions.push({
        type: 'extend_deadline',
        description: 'Extend task deadline to accommodate required time',
        execute: () => {
          const newDeadline = Date.now() + requiredTime + (24 * 60 * 60 * 1000); // Add 24 hour buffer
          for (const task of tasks) {
            task.data.deadline = newDeadline;
          }
          return { newDeadline, extendedBy: newDeadline - deadline };
        }
      });
    }

    // Option 2: Reduce scope or parallelize
    actions.push({
      type: 'optimize_execution',
      description: 'Optimize task execution to meet deadline',
      execute: () => {
        for (const task of tasks) {
          // Mark for parallel execution if possible
          if (task.data.canParallelize !== false) {
            task.data.parallelizable = true;
          }
          // Reduce estimated duration (optimistic estimate)
          task.data.optimisticDuration = Math.floor(task.data.estimatedDuration * 0.8);
        }
        return { optimized: tasks.map(t => t.id) };
      }
    });

    return new ResolutionPlan(
      conflict.id,
      RESOLUTION_STRATEGIES.DEADLINE_ADJUSTMENT,
      actions,
      'Task deadlines adjusted or execution optimized'
    );
  }

  async resolveDependencyRestructuring(conflict) {
    const { involvedTasks } = conflict;
    const tasks = involvedTasks.map(id => this.dependencyResolver.graph.getNode(id));

    const actions = [];

    // Try to break dependency cycles or restructure dependencies
    actions.push({
      type: 'restructure_dependencies',
      description: 'Restructure dependencies to resolve conflicts',
      execute: () => {
        const changes = [];

        for (const task of tasks) {
          const deps = Array.from(task.dependencies);

          // Try to remove non-critical dependencies
          for (const depId of deps) {
            const depTask = this.dependencyResolver.graph.getNode(depId);
            if (!depTask.data.critical) {
              this.dependencyResolver.removeDependency(task.id, depId);
              changes.push({ removed: `${task.id} -> ${depId}` });
            }
          }
        }

        return { changes };
      }
    });

    return new ResolutionPlan(
      conflict.id,
      RESOLUTION_STRATEGIES.DEPENDENCY_RESTRUCTURING,
      actions,
      'Dependencies restructured to eliminate conflicts'
    );
  }
}

/**
 * Main Conflict Resolution Engine
 */
class ConflictResolutionEngine {
  constructor(dependencyResolver, options = {}) {
    this.dependencyResolver = dependencyResolver;
    this.options = {
      autoResolve: true,
      maxConcurrentResolutions: 5,
      enableMetrics: true,
      resolutionTimeout: 5000, // 5 seconds
      ...options
    };

    this.detectionRules = new ConflictDetectionRules();
    this.resolutionStrategies = new ResolutionStrategies(dependencyResolver);
    this.conflicts = new Map();
    this.resolutionHistory = [];
    this.metrics = {
      conflictsDetected: 0,
      conflictsResolved: 0,
      resolutionTime: [],
      strategyUsage: new Map()
    };
  }

  /**
   * Detect conflicts in the current dependency graph
   */
  async detectConflicts() {
    const startTime = performance.now();
    const detectedConflicts = [];
    const tasks = Array.from(this.dependencyResolver.graph.nodes.values());
    const dependencies = new Map();

    // Build dependency map
    for (const task of tasks) {
      const deps = Array.from(task.dependencies).map(id =>
        this.dependencyResolver.graph.getNode(id)
      ).filter(Boolean);
      dependencies.set(task.id, deps);
    }

    // Run detection rules
    for (const [ruleName, rule] of this.detectionRules.rules) {
      try {
        const conflicts = rule.detect(tasks, dependencies);
        detectedConflicts.push(...conflicts);
      } catch (error) {
        console.error(`Error in conflict detection rule ${ruleName}:`, error);
      }
    }

    // Store detected conflicts
    for (const conflict of detectedConflicts) {
      this.conflicts.set(conflict.id, conflict);
      this.metrics.conflictsDetected++;
    }

    if (this.options.enableMetrics) {
      this.metrics.resolutionTime.push({
        operation: 'detection',
        duration: performance.now() - startTime,
        timestamp: Date.now()
      });
    }

    return detectedConflicts;
  }

  /**
   * Resolve a specific conflict
   */
  async resolveConflict(conflictId) {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    if (conflict.status !== 'pending') {
      return { success: false, reason: `Conflict status is ${conflict.status}` };
    }

    conflict.status = 'resolving';
    const startTime = performance.now();

    try {
      let resolutionPlan;

      // Select resolution strategy based on conflict type
      switch (conflict.type) {
        case CONFLICT_TYPES.RESOURCE:
          resolutionPlan = await this.resolutionStrategies.resolveResourceReallocation(conflict);
          break;
        case CONFLICT_TYPES.DEADLINE:
          resolutionPlan = await this.resolutionStrategies.resolveDeadlineAdjustment(conflict);
          break;
        case CONFLICT_TYPES.PRIORITY:
          resolutionPlan = await this.resolutionStrategies.resolvePriorityOverride(conflict);
          break;
        case CONFLICT_TYPES.DEPENDENCY:
          resolutionPlan = await this.resolutionStrategies.resolveDependencyRestructuring(conflict);
          break;
        default:
          resolutionPlan = await this.resolutionStrategies.resolvePriorityOverride(conflict);
          break;
      }

      // Execute resolution plan
      const results = await this.executeResolutionPlan(resolutionPlan, conflict);

      conflict.setResolution(results);
      this.metrics.conflictsResolved++;

      // Track strategy usage
      const strategy = resolutionPlan.strategy;
      this.metrics.strategyUsage.set(strategy, (this.metrics.strategyUsage.get(strategy) || 0) + 1);

      // Store in history
      this.resolutionHistory.push({
        conflictId,
        strategy,
        resolutionTime: performance.now() - startTime,
        timestamp: Date.now(),
        success: true
      });

      if (this.options.enableMetrics) {
        this.metrics.resolutionTime.push({
          operation: 'resolution',
          duration: performance.now() - startTime,
          timestamp: Date.now()
        });
      }

      return { success: true, results, resolutionPlan };

    } catch (error) {
      conflict.addAttempt();
      this.resolutionHistory.push({
        conflictId,
        error: error.message,
        resolutionTime: performance.now() - startTime,
        timestamp: Date.now(),
        success: false
      });

      throw error;
    }
  }

  /**
   * Execute a resolution plan with timeout
   */
  async executeResolutionPlan(resolutionPlan, conflict) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Resolution timeout for conflict ${conflict.id}`));
      }, this.options.resolutionTimeout);

      resolutionPlan.execute()
        .then(results => {
          clearTimeout(timeout);
          resolve(results);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Auto-resolve all pending conflicts
   */
  async resolveAllConflicts() {
    if (!this.options.autoResolve) {
      return { resolved: 0, conflicts: Array.from(this.conflicts.values()) };
    }

    const pendingConflicts = Array.from(this.conflicts.values())
      .filter(conflict => conflict.status === 'pending');

    const results = [];
    const batchSize = Math.min(pendingConflicts.length, this.options.maxConcurrentResolutions);

    for (let i = 0; i < pendingConflicts.length; i += batchSize) {
      const batch = pendingConflicts.slice(i, i + batchSize);
      const batchPromises = batch.map(conflict =>
        this.resolveConflict(conflict.id).catch(error => ({
          conflictId: conflict.id,
          error: error.message,
          success: false
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const resolved = results.filter(r => r.success).length;

    return { resolved, total: pendingConflicts.length, results };
  }

  /**
   * Get conflict by ID
   */
  getConflict(conflictId) {
    return this.conflicts.get(conflictId);
  }

  /**
   * Get all conflicts
   */
  getAllConflicts() {
    return Array.from(this.conflicts.values());
  }

  /**
   * Get conflicts by status
   */
  getConflictsByStatus(status) {
    return Array.from(this.conflicts.values()).filter(conflict => conflict.status === status);
  }

  /**
   * Get conflicts by type
   */
  getConflictsByType(type) {
    return Array.from(this.conflicts.values()).filter(conflict => conflict.type === type);
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const avgResolutionTime = this.metrics.resolutionTime
      .filter(op => op.operation === 'resolution')
      .reduce((sum, op, _, arr) => sum + op.duration / arr.length, 0);

    return {
      conflictsDetected: this.metrics.conflictsDetected,
      conflictsResolved: this.metrics.conflictsResolved,
      resolutionRate: this.metrics.conflictsDetected > 0
        ? this.metrics.conflictsResolved / this.metrics.conflictsDetected
        : 0,
      averageResolutionTime: avgResolutionTime,
      strategyUsage: Object.fromEntries(this.metrics.strategyUsage),
      pendingConflicts: this.getConflictsByStatus('pending').length,
      escalatedConflicts: this.getConflictsByStatus('escalated').length
    };
  }

  /**
   * Clear resolved conflicts
   */
  clearResolvedConflicts() {
    for (const [id, conflict] of this.conflicts) {
      if (conflict.status === 'resolved') {
        this.conflicts.delete(id);
      }
    }
  }

  /**
   * Export current state
   */
  export() {
    return {
      conflicts: Array.from(this.conflicts.values()).map(c => c.toJSON()),
      resolutionHistory: this.resolutionHistory,
      metrics: this.getMetrics(),
      options: this.options
    };
  }
}

export {
  ConflictResolutionEngine,
  Conflict,
  ResolutionPlan,
  ConflictDetectionRules,
  ResolutionStrategies,
  CONFLICT_TYPES,
  RESOLUTION_STRATEGIES as CONFLICT_RESOLUTION_STRATEGIES
};