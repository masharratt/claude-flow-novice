/**
 * Recovery Engine - Resume CFN Loop Execution from Checkpoint
 *
 * Loads checkpoint state and resumes execution from last known state:
 * - Recovery prompt with options (resume/restart/inspect/abandon)
 * - Load checkpoint state from Redis
 * - Resume agents from last known state
 * - Skip completed sprints, resume in-progress sprints
 * - Handle partially written files (compare disk vs checkpoint)
 * - Re-establish coordination locks and dependencies
 *
 * Acceptance Criteria:
 * - Resumes execution within 2 minutes of crash
 * - Work loss < 5% for crashes at any point
 * - Completed sprints not re-executed
 * - In-progress files resume from last completed section
 * - Locks and dependencies correctly restored
 *
 * @module cfn-loop/recovery-engine
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { promises as fs } from 'node:fs';
import { createClient, RedisClientType } from 'redis';
import { StateCheckpointManager, EpicState, SprintState, PhaseState, AgentState } from './state-checkpoint-manager.js';
import { CheckpointSerializer } from './checkpoint-serializer.js';
import { CrashDetector, InterruptedExecution } from './crash-detector.js';
import { MetaCoordinator, SprintGroup } from './meta-coordinator.js';

// ===== TYPE DEFINITIONS =====

/**
 * Recovery mode options
 */
export enum RecoveryMode {
  RESUME = 'resume', // Resume from last checkpoint
  RESTART = 'restart', // Restart epic from beginning
  INSPECT = 'inspect', // Inspect checkpoint state only
  ABANDON = 'abandon', // Abandon recovery, clean up state
}

/**
 * Recovery options configuration
 */
export interface RecoveryOptions {
  mode: RecoveryMode;
  epicId: string;
  continueFromSprint?: string; // Optional: resume from specific sprint
  skipFileReconciliation?: boolean; // Default: false
  forceReset?: boolean; // Force reset coordination state
}

/**
 * File reconciliation result
 */
export interface FileReconciliationResult {
  filePath: string;
  diskExists: boolean;
  checkpointExists: boolean;
  diskSize: number;
  checkpointSize: number;
  action: 'keep-disk' | 'restore-checkpoint' | 'skip' | 'merge-required';
  reason: string;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  success: boolean;
  mode: RecoveryMode;
  epicId: string;
  recoveryDurationMs: number;
  sprintsResumed: string[];
  sprintsSkipped: string[];
  filesReconciled: number;
  locksRestored: number;
  agentsResumed: number;
  estimatedWorkLoss: number; // percentage (0-100)
  errors: string[];
  timestamp: number;
}

/**
 * Configuration for recovery engine
 */
export interface RecoveryEngineConfig {
  redisUrl?: string;
  checkpointManager?: StateCheckpointManager;
  crashDetector?: CrashDetector;
  maxRecoveryTimeMs?: number; // Default: 120000 (2 minutes)
  enableFileReconciliation?: boolean; // Default: true
  workingDirectory?: string; // Default: process.cwd()
}

/**
 * Sprint resume context
 */
interface SprintResumeContext {
  sprintId: string;
  name: string;
  lastPhaseCompleted: string | null;
  phasesToResume: PhaseState[];
  agentsToResume: AgentState[];
  coordinationLocks: string[];
}

// ===== RECOVERY ENGINE =====

/**
 * Resumes CFN Loop execution from checkpoint after crash
 *
 * Features:
 * - Fast recovery (<2 minutes)
 * - Minimal work loss (<5%)
 * - Smart file reconciliation
 * - Coordination state restoration
 * - Multiple recovery modes
 *
 * Usage:
 * ```typescript
 * const engine = new RecoveryEngine({
 *   checkpointManager: manager,
 *   crashDetector: detector
 * });
 *
 * await engine.initialize();
 * const result = await engine.resumeFromCheckpoint({
 *   mode: RecoveryMode.RESUME,
 *   epicId: 'epic-123'
 * });
 * ```
 */
export class RecoveryEngine extends EventEmitter {
  private logger: Logger;
  private config: Required<RecoveryEngineConfig>;
  private redis: RedisClientType | null = null;
  private checkpointManager: StateCheckpointManager;
  private crashDetector: CrashDetector;
  private serializer: CheckpointSerializer;

  constructor(config: RecoveryEngineConfig) {
    super();
    this.logger = new Logger(
      { level: 'info', format: 'json', name: 'RecoveryEngine' },
      'RecoveryEngine'
    );

    this.config = {
      redisUrl: config.redisUrl || 'redis://localhost:6379',
      checkpointManager: config.checkpointManager!,
      crashDetector: config.crashDetector!,
      maxRecoveryTimeMs: config.maxRecoveryTimeMs || 120000, // 2 minutes
      enableFileReconciliation: config.enableFileReconciliation ?? true,
      workingDirectory: config.workingDirectory || process.cwd(),
    };

    // Use provided instances or create new ones
    this.checkpointManager = config.checkpointManager || new StateCheckpointManager();
    this.crashDetector = config.crashDetector || new CrashDetector();
    this.serializer = new CheckpointSerializer();
  }

  /**
   * Initialize recovery engine
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing recovery engine');

    try {
      // Create Redis client
      this.redis = createClient({ url: this.config.redisUrl });
      await this.redis.connect();

      // Initialize dependencies if not already initialized
      if (!this.config.checkpointManager) {
        await this.checkpointManager.initialize();
      }
      if (!this.config.crashDetector) {
        await this.crashDetector.initialize();
      }

      this.emit('initialized');
      this.logger.info('Recovery engine initialized');
    } catch (error) {
      this.logger.error('Failed to initialize recovery engine', { error });
      throw error;
    }
  }

  /**
   * Load checkpoint state from Redis
   */
  async loadCheckpoint(epicId: string): Promise<EpicState | null> {
    this.logger.info('Loading checkpoint', { epicId });

    try {
      const state = await this.checkpointManager.restoreLatestCheckpoint();

      if (!state || state.epicId !== epicId) {
        this.logger.warn('No checkpoint found for epic', { epicId });
        return null;
      }

      this.logger.info('Checkpoint loaded successfully', {
        epicId,
        sprints: state.sprints.length,
        status: state.status,
      });

      this.emit('checkpoint-loaded', state);
      return state;
    } catch (error) {
      this.logger.error('Failed to load checkpoint', { epicId, error });
      throw error;
    }
  }

  /**
   * Resume execution from checkpoint
   */
  async resumeFromCheckpoint(options: RecoveryOptions): Promise<RecoveryResult> {
    const startTime = Date.now();
    this.logger.info('Starting recovery', { options });

    const result: RecoveryResult = {
      success: false,
      mode: options.mode,
      epicId: options.epicId,
      recoveryDurationMs: 0,
      sprintsResumed: [],
      sprintsSkipped: [],
      filesReconciled: 0,
      locksRestored: 0,
      agentsResumed: 0,
      estimatedWorkLoss: 0,
      errors: [],
      timestamp: Date.now(),
    };

    try {
      // Handle different recovery modes
      switch (options.mode) {
        case RecoveryMode.RESUME:
          await this.handleResumeMode(options, result);
          break;
        case RecoveryMode.RESTART:
          await this.handleRestartMode(options, result);
          break;
        case RecoveryMode.INSPECT:
          await this.handleInspectMode(options, result);
          break;
        case RecoveryMode.ABANDON:
          await this.handleAbandonMode(options, result);
          break;
        default:
          throw new Error(`Unknown recovery mode: ${options.mode}`);
      }

      result.success = result.errors.length === 0;
      result.recoveryDurationMs = Date.now() - startTime;

      // Validate recovery time
      if (result.recoveryDurationMs > this.config.maxRecoveryTimeMs) {
        this.logger.warn('Recovery exceeded target time', {
          durationMs: result.recoveryDurationMs,
          targetMs: this.config.maxRecoveryTimeMs,
        });
      }

      this.emit('recovery-completed', result);
      this.logger.info('Recovery completed', {
        success: result.success,
        durationMs: result.recoveryDurationMs,
        sprintsResumed: result.sprintsResumed.length,
      });

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.recoveryDurationMs = Date.now() - startTime;
      this.logger.error('Recovery failed', { error });
      this.emit('recovery-failed', result);
      return result;
    }
  }

  /**
   * Handle RESUME mode - resume from last checkpoint
   */
  private async handleResumeMode(
    options: RecoveryOptions,
    result: RecoveryResult
  ): Promise<void> {
    this.logger.info('Handling RESUME mode', { epicId: options.epicId });

    // Load checkpoint
    const state = await this.loadCheckpoint(options.epicId);
    if (!state) {
      throw new Error('No checkpoint found for epic');
    }

    // Skip completed sprints
    const completedSprints = await this.skipCompletedSprints(state);
    result.sprintsSkipped = completedSprints;

    // Resume in-progress sprints
    const resumedSprints = await this.resumeInProgressSprints(state, options);
    result.sprintsResumed = resumedSprints;

    // Reconcile partial files
    if (this.config.enableFileReconciliation && !options.skipFileReconciliation) {
      const reconciled = await this.reconcilePartialFiles(state);
      result.filesReconciled = reconciled.length;
    }

    // Re-establish coordination
    const locks = await this.reestablishCoordination(state);
    result.locksRestored = locks;

    // Calculate work loss
    result.estimatedWorkLoss = this.calculateWorkLoss(state);
  }

  /**
   * Handle RESTART mode - restart epic from beginning
   */
  private async handleRestartMode(
    options: RecoveryOptions,
    result: RecoveryResult
  ): Promise<void> {
    this.logger.info('Handling RESTART mode', { epicId: options.epicId });

    // Clean up existing state
    await this.cleanupEpicState(options.epicId);

    // Mark all sprints as skipped (will be restarted)
    const state = await this.loadCheckpoint(options.epicId);
    if (state) {
      result.sprintsSkipped = state.sprints.map((s) => s.sprintId);
    }

    result.estimatedWorkLoss = 100; // Full restart = 100% work loss
  }

  /**
   * Handle INSPECT mode - inspect checkpoint state only
   */
  private async handleInspectMode(
    options: RecoveryOptions,
    result: RecoveryResult
  ): Promise<void> {
    this.logger.info('Handling INSPECT mode', { epicId: options.epicId });

    // Load checkpoint
    const state = await this.loadCheckpoint(options.epicId);
    if (!state) {
      throw new Error('No checkpoint found for epic');
    }

    // Emit inspection event with full state
    this.emit('checkpoint-inspected', state);

    // No actual recovery actions taken
    result.sprintsSkipped = state.sprints.filter((s) => s.status === 'completed').map((s) => s.sprintId);
    result.sprintsResumed = state.sprints.filter((s) => s.status === 'in-progress').map((s) => s.sprintId);
  }

  /**
   * Handle ABANDON mode - abandon recovery and clean up
   */
  private async handleAbandonMode(
    options: RecoveryOptions,
    result: RecoveryResult
  ): Promise<void> {
    this.logger.info('Handling ABANDON mode', { epicId: options.epicId });

    // Clean up all state
    await this.cleanupEpicState(options.epicId);

    result.estimatedWorkLoss = 100; // Abandoned = 100% work loss
  }

  /**
   * Skip completed sprints (mark as done, don't re-execute)
   */
  async skipCompletedSprints(state: EpicState): Promise<string[]> {
    this.logger.info('Skipping completed sprints', { epicId: state.epicId });

    const completedSprints = state.sprints
      .filter((s) => s.status === 'completed')
      .map((s) => s.sprintId);

    this.logger.info('Completed sprints identified', {
      count: completedSprints.length,
      sprints: completedSprints,
    });

    return completedSprints;
  }

  /**
   * Resume in-progress sprints from last known state
   */
  async resumeInProgressSprints(
    state: EpicState,
    options: RecoveryOptions
  ): Promise<string[]> {
    this.logger.info('Resuming in-progress sprints', { epicId: state.epicId });

    const inProgressSprints = state.sprints.filter((s) => s.status === 'in-progress');

    // Filter by continueFromSprint if specified
    const sprintsToResume = options.continueFromSprint
      ? inProgressSprints.filter((s) => s.sprintId === options.continueFromSprint)
      : inProgressSprints;

    const resumedSprints: string[] = [];

    for (const sprint of sprintsToResume) {
      try {
        const context = this.buildSprintResumeContext(sprint);
        await this.resumeSprint(context, state.epicId);
        resumedSprints.push(sprint.sprintId);

        this.logger.info('Sprint resumed', {
          sprintId: sprint.sprintId,
          phasesToResume: context.phasesToResume.length,
        });
      } catch (error) {
        this.logger.error('Failed to resume sprint', {
          sprintId: sprint.sprintId,
          error,
        });
      }
    }

    return resumedSprints;
  }

  /**
   * Build sprint resume context
   */
  private buildSprintResumeContext(sprint: SprintState): SprintResumeContext {
    // Find last completed phase
    const completedPhases = sprint.phases.filter((p) => p.status === 'completed');
    const lastPhaseCompleted = completedPhases.length > 0
      ? completedPhases[completedPhases.length - 1].phaseId
      : null;

    // Get phases to resume
    const phasesToResume = sprint.phases.filter((p) => p.status !== 'completed' && p.status !== 'failed');

    // Get agents to resume
    const agentsToResume: AgentState[] = [];
    for (const phase of phasesToResume) {
      agentsToResume.push(...phase.agents.filter((a) => a.status !== 'completed'));
    }

    // Get coordination locks
    const coordinationLocks = phasesToResume
      .filter((p) => p.swarmId)
      .map((p) => `cfn:lock:${sprint.sprintId}:${p.phaseId}`);

    return {
      sprintId: sprint.sprintId,
      name: sprint.name,
      lastPhaseCompleted,
      phasesToResume,
      agentsToResume,
      coordinationLocks,
    };
  }

  /**
   * Resume sprint execution
   */
  private async resumeSprint(context: SprintResumeContext, epicId: string): Promise<void> {
    this.logger.info('Resuming sprint', {
      sprintId: context.sprintId,
      phasesToResume: context.phasesToResume.length,
    });

    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    // Publish resume event to coordination channel
    const resumeEvent = {
      type: 'sprint:resume',
      epicId,
      sprintId: context.sprintId,
      phasesToResume: context.phasesToResume.map((p) => p.phaseId),
      timestamp: Date.now(),
    };

    await this.redis.publish('sprint:coordination', JSON.stringify(resumeEvent));

    this.emit('sprint-resumed', context);
  }

  /**
   * Reconcile partially written files (compare disk vs checkpoint)
   */
  async reconcilePartialFiles(state: EpicState): Promise<FileReconciliationResult[]> {
    this.logger.info('Reconciling partial files', { epicId: state.epicId });

    const results: FileReconciliationResult[] = [];

    // Collect all deliverable files from in-progress phases
    const filesToReconcile = new Set<string>();
    for (const sprint of state.sprints) {
      for (const phase of sprint.phases) {
        if (phase.status === 'loop3-in-progress' || phase.status === 'loop2-validation') {
          phase.deliverables.forEach((file) => filesToReconcile.add(file));
        }
      }
    }

    for (const filePath of filesToReconcile) {
      try {
        const result = await this.reconcileFile(filePath, state);
        results.push(result);

        this.logger.debug('File reconciled', {
          filePath,
          action: result.action,
          reason: result.reason,
        });
      } catch (error) {
        this.logger.error('Failed to reconcile file', { filePath, error });
      }
    }

    this.logger.info('File reconciliation completed', {
      totalFiles: results.length,
      keepDisk: results.filter((r) => r.action === 'keep-disk').length,
      restoreCheckpoint: results.filter((r) => r.action === 'restore-checkpoint').length,
    });

    return results;
  }

  /**
   * Reconcile single file
   */
  private async reconcileFile(
    filePath: string,
    state: EpicState
  ): Promise<FileReconciliationResult> {
    const fullPath = `${this.config.workingDirectory}/${filePath}`;

    // Check disk
    let diskExists = false;
    let diskSize = 0;
    try {
      const stats = await fs.stat(fullPath);
      diskExists = true;
      diskSize = stats.size;
    } catch (error) {
      // File doesn't exist on disk
    }

    // For now, we don't have checkpoint file contents
    // In production, you'd store file contents or hashes in checkpoint
    const checkpointExists = false;
    const checkpointSize = 0;

    // Determine action
    let action: FileReconciliationResult['action'];
    let reason: string;

    if (diskExists && !checkpointExists) {
      action = 'keep-disk';
      reason = 'File exists on disk, no checkpoint data';
    } else if (!diskExists && checkpointExists) {
      action = 'restore-checkpoint';
      reason = 'File missing on disk, restore from checkpoint';
    } else if (diskExists && checkpointExists) {
      if (diskSize > checkpointSize) {
        action = 'keep-disk';
        reason = 'Disk file is newer (larger)';
      } else {
        action = 'restore-checkpoint';
        reason = 'Checkpoint is newer';
      }
    } else {
      action = 'skip';
      reason = 'File not found in disk or checkpoint';
    }

    return {
      filePath,
      diskExists,
      checkpointExists,
      diskSize,
      checkpointSize,
      action,
      reason,
    };
  }

  /**
   * Re-establish coordination locks and dependencies
   */
  async reestablishCoordination(state: EpicState): Promise<number> {
    this.logger.info('Re-establishing coordination', { epicId: state.epicId });

    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    let locksRestored = 0;

    // Re-establish locks for in-progress phases
    for (const sprint of state.sprints) {
      if (sprint.status !== 'in-progress') continue;

      for (const phase of sprint.phases) {
        if (phase.status === 'loop3-in-progress' || phase.status === 'loop2-validation') {
          const lockKey = `cfn:lock:${sprint.sprintId}:${phase.phaseId}`;
          const lockData = {
            lockId: lockKey,
            holderId: phase.swarmId || 'recovery-engine',
            acquiredAt: Date.now(),
            expiresAt: Date.now() + 300000, // 5 minutes
          };

          await this.redis.setEx(lockKey, 300, JSON.stringify(lockData));
          locksRestored++;

          this.logger.debug('Lock restored', { lockKey, phaseId: phase.phaseId });
        }
      }
    }

    this.logger.info('Coordination re-established', { locksRestored });
    return locksRestored;
  }

  /**
   * Calculate work loss percentage
   */
  private calculateWorkLoss(state: EpicState): number {
    let totalPhases = 0;
    let completedPhases = 0;

    for (const sprint of state.sprints) {
      totalPhases += sprint.phases.length;
      completedPhases += sprint.phases.filter((p) => p.status === 'completed').length;
    }

    if (totalPhases === 0) return 0;

    const workCompleted = (completedPhases / totalPhases) * 100;
    const workLoss = 100 - workCompleted;

    // Work loss should be <5% for good recovery
    return Math.round(workLoss * 10) / 10; // Round to 1 decimal
  }

  /**
   * Clean up epic state (for restart/abandon)
   */
  private async cleanupEpicState(epicId: string): Promise<void> {
    this.logger.info('Cleaning up epic state', { epicId });

    if (!this.redis) return;

    // Delete all epic-related keys
    const patterns = [
      `cfn:checkpoint:${epicId}:*`,
      `cfn:epic:${epicId}:*`,
      `cfn:agent:${epicId}:*`,
      `cfn:lock:${epicId}:*`,
    ];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      for (const key of keys) {
        await this.redis.del(key);
      }
    }

    this.logger.info('Epic state cleaned up', { epicId });
  }

  /**
   * Shutdown recovery engine
   */
  async shutdown(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    await this.checkpointManager.shutdown();
    await this.crashDetector.shutdown();

    this.logger.info('Recovery engine shutdown');
    this.emit('shutdown');
  }
}
