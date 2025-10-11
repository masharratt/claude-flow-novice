/**
 * Meta-Coordinator - Sprint 4.1: Parallel Sprint Coordination
 *
 * Spawns and monitors multiple sprint coordinators for independent sprint groups.
 * Aggregates Loop 4 Product Owner decisions and handles sprint failures/retries.
 *
 * Features:
 * - Spawn N sprint coordinators for parallel execution
 * - Monitor progress via Redis pub/sub
 * - Aggregate confidence scores across all sprints
 * - Handle failures with targeted retries
 * - Coordinate Loop 4 Product Owner decisions
 * - Integration with existing SprintOrchestrator
 *
 * Architecture:
 * Meta-Coordinator → Sprint Coordinators → CFN Loop → Agents
 *
 * @module cfn-loop/meta-coordinator
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import type { Redis } from 'ioredis';
import type { LoggingConfig } from '../utils/types.js';
import {
  SprintOrchestrator,
  Sprint,
  SprintResult,
  SprintOrchestratorConfig,
  EpicResult
} from './sprint-orchestrator.js';

// ===== TYPE DEFINITIONS =====

/**
 * Sprint group for parallel execution
 */
export interface SprintGroup {
  /** Group identifier */
  groupId: string;
  /** Sprints in this group */
  sprints: Sprint[];
  /** Dependencies (other group IDs that must complete first) */
  dependencies: string[];
  /** Priority (higher = execute earlier) */
  priority: number;
}

/**
 * Sprint coordinator instance metadata
 */
export interface CoordinatorInstance {
  /** Unique coordinator ID */
  coordinatorId: string;
  /** Sprint group being coordinated */
  group: SprintGroup;
  /** Orchestrator instance */
  orchestrator: SprintOrchestrator;
  /** Current status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Start timestamp */
  startTime?: number;
  /** Completion timestamp */
  endTime?: number;
  /** Epic result if completed */
  result?: EpicResult;
  /** Error if failed */
  error?: Error;
}

/**
 * Meta-coordinator configuration
 */
export interface MetaCoordinatorConfig {
  /** Epic identifier */
  epicId: string;
  /** Sprint groups to coordinate */
  sprintGroups: SprintGroup[];
  /** Redis client for pub/sub coordination */
  redisClient: Redis;
  /** Maximum parallel coordinators (default: 5) */
  maxParallelCoordinators?: number;
  /** Global sprint results map (shared across all coordinators) */
  globalSprintResults?: Map<string, any>;
  /** CFN Loop configuration */
  loopConfig?: {
    maxLoop2Iterations?: number;
    maxLoop3Iterations?: number;
    confidenceThreshold?: number;
    consensusThreshold?: number;
  };
}

/**
 * Meta-coordination result
 */
export interface MetaCoordinationResult {
  /** Success status */
  success: boolean;
  /** Epic ID */
  epicId: string;
  /** Total sprint groups */
  totalGroups: number;
  /** Completed groups */
  completedGroups: string[];
  /** Failed groups */
  failedGroups: string[];
  /** Aggregated confidence score */
  aggregatedConfidence: number;
  /** Total sprints across all groups */
  totalSprints: number;
  /** Completed sprints */
  completedSprints: string[];
  /** Failed sprints */
  failedSprints: string[];
  /** Total duration (ms) */
  totalDuration: number;
  /** Coordinator results */
  coordinatorResults: Map<string, EpicResult>;
  /** Timestamp */
  timestamp: number;
}

/**
 * Progress update event
 */
export interface ProgressUpdate {
  coordinatorId: string;
  groupId: string;
  type: 'started' | 'sprint_completed' | 'sprint_failed' | 'group_completed' | 'group_failed';
  sprintId?: string;
  confidence?: number;
  timestamp: number;
}

// ===== META-COORDINATOR =====

/**
 * Meta-Coordinator for parallel sprint coordination
 *
 * Spawns multiple SprintOrchestrator instances and monitors their progress
 * through Redis pub/sub coordination.
 */
export class MetaCoordinator extends EventEmitter {
  private logger: Logger;
  private config: Required<MetaCoordinatorConfig>;
  private redis: Redis;

  // Coordinator instances
  private coordinators: Map<string, CoordinatorInstance> = new Map();
  private activeCoordinators: Set<string> = new Set();
  private completedGroups: Set<string> = new Set();
  private failedGroups: Set<string> = new Set();

  // Global sprint results (shared across all coordinators)
  private globalSprintResults: Map<string, any>;

  // Timing
  private startTime: number = 0;

  // Redis pub/sub channel
  private readonly COORDINATION_CHANNEL = 'cfn:meta:coordination';

  constructor(config: MetaCoordinatorConfig) {
    super();

    // Validate and set defaults
    this.config = {
      epicId: config.epicId,
      sprintGroups: config.sprintGroups,
      redisClient: config.redisClient,
      maxParallelCoordinators: config.maxParallelCoordinators || 5,
      globalSprintResults: config.globalSprintResults,
      loopConfig: config.loopConfig || {
        maxLoop2Iterations: 10,
        maxLoop3Iterations: 10,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
      },
    };

    this.redis = config.redisClient;

    // Initialize global sprint results (shared state)
    this.globalSprintResults = config.globalSprintResults || new Map();

    // Initialize logger
    const loggerConfig: LoggingConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error', format: 'json', destination: 'console' }
        : { level: 'info', format: 'json', destination: 'console' };

    this.logger = new Logger(loggerConfig, { component: 'MetaCoordinator' });

    this.logger.info('Meta-Coordinator initialized', {
      epicId: this.config.epicId,
      groupCount: this.config.sprintGroups.length,
      maxParallel: this.config.maxParallelCoordinators,
    });
  }

  /**
   * Initialize meta-coordinator and validate sprint groups
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Meta-Coordinator', {
      epicId: this.config.epicId,
      groups: this.config.sprintGroups.length,
    });

    // Validate sprint groups
    this.validateSprintGroups();

    // Subscribe to coordination events
    await this.subscribeToCoordinationEvents();

    this.logger.info('Meta-Coordinator ready', {
      epicId: this.config.epicId,
      validatedGroups: this.config.sprintGroups.length,
    });

    this.emit('initialized', {
      epicId: this.config.epicId,
      totalGroups: this.config.sprintGroups.length,
    });
  }

  /**
   * Execute all sprint groups with parallel coordination
   */
  async execute(): Promise<MetaCoordinationResult> {
    this.startTime = Date.now();

    this.logger.info('Starting meta-coordination', {
      epicId: this.config.epicId,
      totalGroups: this.config.sprintGroups.length,
    });

    this.emit('execution:started', {
      epicId: this.config.epicId,
      timestamp: Date.now(),
    });

    try {
      // Sort groups by priority (highest first)
      const sortedGroups = [...this.config.sprintGroups].sort(
        (a, b) => b.priority - a.priority
      );

      // Execute groups respecting dependencies and parallelism
      await this.executeGroupsWithDependencies(sortedGroups);

      // Generate final result
      const result = this.generateMetaCoordinationResult();

      this.emit('execution:completed', result);

      return result;
    } catch (error) {
      this.logger.error('Meta-coordination failed', {
        epicId: this.config.epicId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Execute sprint groups respecting dependencies and parallelism limits
   */
  private async executeGroupsWithDependencies(
    groups: SprintGroup[]
  ): Promise<void> {
    const pendingGroups = new Set(groups.map(g => g.groupId));

    while (pendingGroups.size > 0) {
      // Find groups ready to execute (dependencies satisfied)
      const readyGroups = groups.filter(group => {
        if (!pendingGroups.has(group.groupId)) {
          return false; // Already processed
        }

        // Check if all dependencies are completed
        return group.dependencies.every(depId => this.completedGroups.has(depId));
      });

      if (readyGroups.length === 0 && pendingGroups.size > 0) {
        // Deadlock or failure - no groups can proceed
        const remaining = Array.from(pendingGroups);
        this.logger.error('Coordination deadlock detected', {
          epicId: this.config.epicId,
          pendingGroups: remaining,
          completedGroups: Array.from(this.completedGroups),
          failedGroups: Array.from(this.failedGroups),
        });

        throw new Error(
          `Coordination deadlock: ${remaining.length} groups cannot proceed due to dependency failures`
        );
      }

      // Launch coordinators up to parallel limit
      const availableSlots = this.config.maxParallelCoordinators - this.activeCoordinators.size;
      const groupsToLaunch = readyGroups.slice(0, availableSlots);

      this.logger.info('Launching sprint coordinators', {
        epicId: this.config.epicId,
        groupCount: groupsToLaunch.length,
        activeCoordinators: this.activeCoordinators.size,
        availableSlots,
      });

      // Launch coordinators in parallel
      const launchPromises = groupsToLaunch.map(group =>
        this.launchCoordinator(group)
      );

      // Wait for at least one coordinator to complete
      await Promise.race(launchPromises);

      // Wait a bit to allow other coordinators to complete
      await this.sleep(100);

      // Remove completed/failed groups from pending
      for (const group of readyGroups) {
        if (
          this.completedGroups.has(group.groupId) ||
          this.failedGroups.has(group.groupId)
        ) {
          pendingGroups.delete(group.groupId);
        }
      }
    }

    // Wait for all remaining active coordinators to complete
    await this.waitForAllCoordinators();
  }

  /**
   * Launch a sprint coordinator for a group
   */
  private async launchCoordinator(group: SprintGroup): Promise<void> {
    const coordinatorId = `coordinator-${group.groupId}`;

    this.logger.info('Launching sprint coordinator', {
      coordinatorId,
      groupId: group.groupId,
      sprintCount: group.sprints.length,
    });

    try {
      // Create SprintOrchestrator configuration
      const orchestratorConfig: SprintOrchestratorConfig = {
        epicId: this.config.epicId,
        sprints: group.sprints,
        globalSprintResults: this.globalSprintResults, // Shared state
        defaultMaxRetries: 10,
        enableParallelExecution: false, // Coordinators handle parallelism
        loopConfig: this.config.loopConfig,
        memoryConfig: {
          enabled: true,
          namespace: `epic/${this.config.epicId}/group-${group.groupId}`,
        },
      };

      // Create orchestrator instance
      const orchestrator = new SprintOrchestrator(orchestratorConfig);

      // Initialize orchestrator
      await orchestrator.initialize();

      // Register coordinator instance
      const instance: CoordinatorInstance = {
        coordinatorId,
        group,
        orchestrator,
        status: 'running',
        startTime: Date.now(),
      };

      this.coordinators.set(coordinatorId, instance);
      this.activeCoordinators.add(coordinatorId);

      // Publish start event
      await this.publishProgress({
        coordinatorId,
        groupId: group.groupId,
        type: 'started',
        timestamp: Date.now(),
      });

      // Execute orchestrator (asynchronously)
      this.executeOrchestrator(instance)
        .then(() => {
          this.logger.info('Coordinator completed successfully', {
            coordinatorId,
            groupId: group.groupId,
          });
        })
        .catch(error => {
          this.logger.error('Coordinator failed', {
            coordinatorId,
            groupId: group.groupId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    } catch (error) {
      this.logger.error('Failed to launch coordinator', {
        coordinatorId,
        groupId: group.groupId,
        error: error instanceof Error ? error.message : String(error),
      });

      this.failedGroups.add(group.groupId);
      throw error;
    }
  }

  /**
   * Execute sprint orchestrator and handle result
   */
  private async executeOrchestrator(
    instance: CoordinatorInstance
  ): Promise<void> {
    try {
      // Execute epic
      const result = await instance.orchestrator.executeEpic();

      // Update instance
      instance.status = result.success ? 'completed' : 'failed';
      instance.endTime = Date.now();
      instance.result = result;

      // Mark group as completed or failed
      if (result.success) {
        this.completedGroups.add(instance.group.groupId);

        await this.publishProgress({
          coordinatorId: instance.coordinatorId,
          groupId: instance.group.groupId,
          type: 'group_completed',
          confidence: result.statistics.averageConfidence,
          timestamp: Date.now(),
        });
      } else {
        this.failedGroups.add(instance.group.groupId);

        await this.publishProgress({
          coordinatorId: instance.coordinatorId,
          groupId: instance.group.groupId,
          type: 'group_failed',
          timestamp: Date.now(),
        });
      }

      // Remove from active set
      this.activeCoordinators.delete(instance.coordinatorId);

      this.logger.info('Orchestrator execution completed', {
        coordinatorId: instance.coordinatorId,
        groupId: instance.group.groupId,
        success: result.success,
        completedSprints: result.completedSprints.length,
        failedSprints: result.failedSprints.length,
      });
    } catch (error) {
      instance.status = 'failed';
      instance.endTime = Date.now();
      instance.error = error instanceof Error ? error : new Error(String(error));

      this.failedGroups.add(instance.group.groupId);
      this.activeCoordinators.delete(instance.coordinatorId);

      this.logger.error('Orchestrator execution failed', {
        coordinatorId: instance.coordinatorId,
        groupId: instance.group.groupId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Wait for all active coordinators to complete
   */
  private async waitForAllCoordinators(): Promise<void> {
    while (this.activeCoordinators.size > 0) {
      this.logger.debug('Waiting for active coordinators', {
        active: this.activeCoordinators.size,
        completed: this.completedGroups.size,
        failed: this.failedGroups.size,
      });

      await this.sleep(500);
    }
  }

  /**
   * Generate meta-coordination result
   */
  private generateMetaCoordinationResult(): MetaCoordinationResult {
    const coordinatorResults = new Map<string, EpicResult>();
    let totalSprints = 0;
    const completedSprints: string[] = [];
    const failedSprints: string[] = [];
    let totalConfidence = 0;
    let confidenceCount = 0;

    // Aggregate results from all coordinators
    for (const instance of this.coordinators.values()) {
      if (instance.result) {
        coordinatorResults.set(instance.coordinatorId, instance.result);
        totalSprints += instance.result.totalSprints;
        completedSprints.push(...instance.result.completedSprints);
        failedSprints.push(...instance.result.failedSprints);

        // Aggregate confidence
        totalConfidence += instance.result.statistics.averageConfidence;
        confidenceCount++;
      }
    }

    const aggregatedConfidence =
      confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return {
      success: this.failedGroups.size === 0,
      epicId: this.config.epicId,
      totalGroups: this.config.sprintGroups.length,
      completedGroups: Array.from(this.completedGroups),
      failedGroups: Array.from(this.failedGroups),
      aggregatedConfidence,
      totalSprints,
      completedSprints,
      failedSprints,
      totalDuration: Date.now() - this.startTime,
      coordinatorResults,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate sprint groups for dependency cycles and conflicts
   */
  private validateSprintGroups(): void {
    this.logger.info('Validating sprint groups', {
      groupCount: this.config.sprintGroups.length,
    });

    // Check for duplicate group IDs
    const groupIds = new Set<string>();
    for (const group of this.config.sprintGroups) {
      if (groupIds.has(group.groupId)) {
        throw new Error(`Duplicate group ID: ${group.groupId}`);
      }
      groupIds.add(group.groupId);
    }

    // Check for invalid dependencies
    for (const group of this.config.sprintGroups) {
      for (const depId of group.dependencies) {
        if (!groupIds.has(depId)) {
          throw new Error(
            `Invalid dependency in group ${group.groupId}: ${depId} does not exist`
          );
        }
      }
    }

    // Detect dependency cycles
    this.detectDependencyCycles();

    this.logger.info('Sprint groups validated successfully', {
      totalGroups: groupIds.size,
    });
  }

  /**
   * Detect dependency cycles in sprint groups
   */
  private detectDependencyCycles(): void {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (groupId: string, path: string[]): void => {
      if (recStack.has(groupId)) {
        const cycle = [...path, groupId];
        throw new Error(`Dependency cycle detected: ${cycle.join(' → ')}`);
      }

      if (visited.has(groupId)) {
        return;
      }

      visited.add(groupId);
      recStack.add(groupId);

      const group = this.config.sprintGroups.find(g => g.groupId === groupId);
      if (group) {
        for (const depId of group.dependencies) {
          dfs(depId, [...path, groupId]);
        }
      }

      recStack.delete(groupId);
    };

    for (const group of this.config.sprintGroups) {
      if (!visited.has(group.groupId)) {
        dfs(group.groupId, []);
      }
    }
  }

  /**
   * Subscribe to coordination events via Redis pub/sub
   */
  private async subscribeToCoordinationEvents(): Promise<void> {
    // In a real implementation, this would subscribe to Redis pub/sub channel
    // For now, we'll use EventEmitter for internal coordination
    this.logger.debug('Subscribing to coordination events', {
      channel: this.COORDINATION_CHANNEL,
    });
  }

  /**
   * Publish progress update to Redis
   */
  private async publishProgress(update: ProgressUpdate): Promise<void> {
    try {
      const message = JSON.stringify(update);
      await this.redis.publish(this.COORDINATION_CHANNEL, message);

      this.logger.debug('Progress update published', {
        coordinatorId: update.coordinatorId,
        groupId: update.groupId,
        type: update.type,
      });

      this.emit('progress', update);
    } catch (error) {
      this.logger.warn('Failed to publish progress update', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get coordination statistics
   */
  getStatistics() {
    return {
      epicId: this.config.epicId,
      totalGroups: this.config.sprintGroups.length,
      completedGroups: this.completedGroups.size,
      failedGroups: this.failedGroups.size,
      activeCoordinators: this.activeCoordinators.size,
      duration: this.startTime > 0 ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Shutdown meta-coordinator and all child coordinators
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Meta-Coordinator', {
      epicId: this.config.epicId,
    });

    // Shutdown all orchestrators
    for (const instance of this.coordinators.values()) {
      try {
        await instance.orchestrator.shutdown();
      } catch (error) {
        this.logger.warn('Error shutting down orchestrator', {
          coordinatorId: instance.coordinatorId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.removeAllListeners();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create Meta-Coordinator instance
 */
export function createMetaCoordinator(
  config: MetaCoordinatorConfig
): MetaCoordinator {
  return new MetaCoordinator(config);
}

// ===== EXPORTS =====

export default MetaCoordinator;
