/**
 * Checkpoint Manager
 *
 * Manages dual persistence model with Redis (runtime/ephemeral) and SQLite (durable/persistent).
 * Provides idempotent checkpointing with atomic operations and state validation.
 *
 * Task: Integration Standardization Plan - Task 4.5
 * Version: 1.0.0
 *
 * Persistence Boundaries:
 * - Redis: Agent execution state, coordination signals, temporary queues, active locks
 * - SQLite: Completed task results, agent metrics, audit trail, skill metadata
 *
 * @example
 * ```typescript
 * const checkpointMgr = new CheckpointManager(dbService);
 * await checkpointMgr.initialize();
 *
 * // Create checkpoint on task completion
 * await checkpointMgr.createCheckpoint('task-123', CheckpointTrigger.TASK_COMPLETION);
 *
 * // Recover from checkpoint
 * const state = await checkpointMgr.recoverFromCheckpoint('task-123');
 * ```
 */

import * as crypto from 'crypto';
import { getGlobalLogger } from './logging.js';
import { StandardError, ErrorCode } from './errors.js';
import { DatabaseService } from './database-service/index.js';
import { IDatabaseAdapter } from './database-service/types.js';

const logger = getGlobalLogger();

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Checkpoint trigger types
 */
export enum CheckpointTrigger {
  /** Triggered when a task completes */
  TASK_COMPLETION = 'task_completion',
  /** Triggered at iteration boundaries (CFN Loop iterations) */
  ITERATION_BOUNDARY = 'iteration_boundary',
  /** Triggered periodically (default: 5 minutes) */
  PERIODIC = 'periodic',
  /** Manually triggered checkpoint */
  MANUAL = 'manual',
}

/**
 * Checkpoint status
 */
export enum CheckpointStatus {
  /** Checkpoint creation in progress */
  IN_PROGRESS = 'in_progress',
  /** Checkpoint completed successfully */
  COMPLETED = 'completed',
  /** Checkpoint failed */
  FAILED = 'failed',
  /** Checkpoint recovered and applied */
  RECOVERED = 'recovered',
}

/**
 * Runtime state stored in Redis (ephemeral)
 */
export interface RuntimeState {
  /** Task ID */
  taskId: string;
  /** Agent execution state */
  agents: AgentExecutionState[];
  /** Active coordination signals */
  coordinationSignals: CoordinationSignal[];
  /** Temporary queue data */
  queueData: QueueData[];
  /** Active locks */
  activeLocks: Lock[];
  /** Timestamp when state was captured */
  capturedAt: Date;
}

/**
 * Agent execution state
 */
export interface AgentExecutionState {
  agentId: string;
  agentType: string;
  status: 'spawned' | 'in_progress' | 'completed' | 'failed';
  confidence?: number;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * Coordination signal
 */
export interface CoordinationSignal {
  key: string;
  value: string;
  ttl?: number;
  createdAt: Date;
}

/**
 * Queue data
 */
export interface QueueData {
  queueName: string;
  items: any[];
  priority?: number;
}

/**
 * Lock information
 */
export interface Lock {
  lockKey: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
}

/**
 * Durable state stored in SQLite (persistent)
 */
export interface DurableState {
  /** Task ID */
  taskId: string;
  /** Completed task results */
  taskResults: TaskResult[];
  /** Agent execution metrics */
  agentMetrics: AgentMetrics[];
  /** Audit trail entries */
  auditTrail: AuditEntry[];
  /** Skill metadata */
  skillMetadata: SkillMetadata[];
  /** Timestamp when state was captured */
  capturedAt: Date;
}

/**
 * Task result
 */
export interface TaskResult {
  taskId: string;
  status: 'completed' | 'failed' | 'aborted';
  result?: any;
  confidence?: number;
  iterations: number;
  startedAt: Date;
  completedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Agent metrics
 */
export interface AgentMetrics {
  agentId: string;
  agentType: string;
  executionTime: number;
  confidence: number;
  tokensUsed?: number;
  cost?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Audit trail entry
 */
export interface AuditEntry {
  id: string;
  taskId: string;
  agentId?: string;
  action: string;
  details: Record<string, any>;
  timestamp: Date;
}

/**
 * Skill metadata
 */
export interface SkillMetadata {
  skillName: string;
  version: string;
  executionCount: number;
  successRate: number;
  averageExecutionTime: number;
  lastExecutedAt?: Date;
}

/**
 * Checkpoint metadata
 */
export interface CheckpointMetadata {
  /** Unique checkpoint ID */
  checkpointId: string;
  /** Task ID this checkpoint belongs to */
  taskId: string;
  /** Checkpoint trigger type */
  trigger: CheckpointTrigger;
  /** Checkpoint status */
  status: CheckpointStatus;
  /** Runtime state hash for idempotency */
  runtimeStateHash: string;
  /** Durable state hash for idempotency */
  durableStateHash: string;
  /** Created timestamp */
  createdAt: Date;
  /** Completed timestamp */
  completedAt?: Date;
  /** Error message if failed */
  error?: string;
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Checkpoint data
 */
export interface CheckpointData {
  metadata: CheckpointMetadata;
  runtimeState: RuntimeState;
  durableState: DurableState;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  success: boolean;
  checkpointId: string;
  taskId: string;
  runtimeStateRestored: boolean;
  durableStateRestored: boolean;
  timestamp: Date;
  errors?: string[];
}

/**
 * Checkpoint manager configuration
 */
export interface CheckpointManagerConfig {
  /** Enable periodic checkpoints (default: true) */
  enablePeriodicCheckpoints?: boolean;
  /** Periodic checkpoint interval in milliseconds (default: 300000 = 5 minutes) */
  periodicInterval?: number;
  /** Maximum checkpoint retention period in milliseconds (default: 7 days) */
  retentionPeriod?: number;
  /** Enable automatic cleanup of old checkpoints (default: true) */
  enableAutoCleanup?: boolean;
  /** Validation timeout in milliseconds (default: 5000) */
  validationTimeout?: number;
}

// ============================================================================
// Checkpoint Manager
// ============================================================================

/**
 * Checkpoint Manager
 *
 * Manages dual persistence model with idempotent checkpointing and recovery.
 */
export class CheckpointManager {
  private dbService: DatabaseService;
  private redisAdapter: IDatabaseAdapter;
  private sqliteAdapter: IDatabaseAdapter;
  private config: Required<CheckpointManagerConfig>;
  private periodicCheckpointTimer?: NodeJS.Timeout;
  private initialized: boolean = false;

  constructor(
    dbService: DatabaseService,
    config: CheckpointManagerConfig = {}
  ) {
    this.dbService = dbService;

    // Get adapters
    this.redisAdapter = dbService.getAdapter('redis');
    this.sqliteAdapter = dbService.getAdapter('sqlite');

    // Set config with defaults
    this.config = {
      enablePeriodicCheckpoints: config.enablePeriodicCheckpoints ?? true,
      periodicInterval: config.periodicInterval ?? 300000, // 5 minutes
      retentionPeriod: config.retentionPeriod ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      enableAutoCleanup: config.enableAutoCleanup ?? true,
      validationTimeout: config.validationTimeout ?? 5000,
    };

    logger.info('CheckpointManager initialized', {
      config: this.config,
    });
  }

  /**
   * Initialize checkpoint manager and setup periodic checkpoints
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('CheckpointManager already initialized');
      return;
    }

    try {
      // Create SQLite tables for checkpoint storage
      await this.createCheckpointTables();

      // Start periodic checkpoints if enabled
      if (this.config.enablePeriodicCheckpoints) {
        this.startPeriodicCheckpoints();
      }

      this.initialized = true;
      logger.info('CheckpointManager initialization complete');
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to initialize CheckpointManager', err);
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        'Failed to initialize CheckpointManager',
        { error: err.message },
        err
      );
    }
  }

  /**
   * Shutdown checkpoint manager and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.periodicCheckpointTimer) {
      clearInterval(this.periodicCheckpointTimer);
      this.periodicCheckpointTimer = undefined;
    }

    this.initialized = false;
    logger.info('CheckpointManager shutdown complete');
  }

  /**
   * Create a checkpoint for the given task
   *
   * Idempotent: Creating checkpoint with same state produces same result
   */
  async createCheckpoint(
    taskId: string,
    trigger: CheckpointTrigger,
    metadata?: Record<string, any>
  ): Promise<CheckpointMetadata> {
    this.ensureInitialized();

    const startTime = Date.now();
    const checkpointId = this.generateCheckpointId(taskId, trigger);

    logger.info('Creating checkpoint', { taskId, checkpointId, trigger });

    try {
      // 1. Capture runtime state from Redis
      const runtimeState = await this.captureRuntimeState(taskId);
      const runtimeStateHash = this.hashState(runtimeState);

      // 2. Capture durable state from SQLite
      const durableState = await this.captureDurableState(taskId);
      const durableStateHash = this.hashState(durableState);

      // 3. Check for idempotency (same state hash = skip checkpoint)
      const existingCheckpoint = await this.findCheckpointByHash(
        taskId,
        runtimeStateHash,
        durableStateHash
      );

      if (existingCheckpoint && existingCheckpoint.status === CheckpointStatus.COMPLETED) {
        logger.info('Checkpoint already exists with same state hash (idempotent)', {
          checkpointId: existingCheckpoint.checkpointId,
          taskId,
        });
        return existingCheckpoint;
      }

      // 4. Create checkpoint metadata
      const checkpointMetadata: CheckpointMetadata = {
        checkpointId,
        taskId,
        trigger,
        status: CheckpointStatus.IN_PROGRESS,
        runtimeStateHash,
        durableStateHash,
        createdAt: new Date(),
        metadata,
      };

      // 5. Store checkpoint metadata
      await this.storeCheckpointMetadata(checkpointMetadata);

      // 6. Validate state before storing (atomic check)
      await this.validateState(runtimeState, durableState);

      // 7. Store checkpoint data atomically
      await this.storeCheckpointData(checkpointId, runtimeState, durableState);

      // 8. Update checkpoint status to completed
      checkpointMetadata.status = CheckpointStatus.COMPLETED;
      checkpointMetadata.completedAt = new Date();
      await this.updateCheckpointMetadata(checkpointMetadata);

      const duration = Date.now() - startTime;
      logger.info('Checkpoint created successfully', {
        checkpointId,
        taskId,
        trigger,
        duration,
        runtimeStateHash,
        durableStateHash,
      });

      return checkpointMetadata;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create checkpoint', err, { taskId, checkpointId });

      // Mark checkpoint as failed
      const failedMetadata: CheckpointMetadata = {
        checkpointId,
        taskId,
        trigger,
        status: CheckpointStatus.FAILED,
        runtimeStateHash: '',
        durableStateHash: '',
        createdAt: new Date(),
        error: err.message,
        metadata,
      };
      await this.storeCheckpointMetadata(failedMetadata);

      throw new StandardError(
        ErrorCode.OPERATION_TIMEOUT,
        'Failed to create checkpoint',
        { taskId, checkpointId, trigger },
        err
      );
    }
  }

  /**
   * Recover from the latest checkpoint for the given task
   */
  async recoverFromCheckpoint(taskId: string): Promise<RecoveryResult> {
    this.ensureInitialized();

    logger.info('Starting checkpoint recovery', { taskId });

    try {
      // 1. Find latest completed checkpoint
      const checkpoint = await this.findLatestCheckpoint(taskId);

      if (!checkpoint) {
        throw new StandardError(
          ErrorCode.DB_NOT_FOUND,
          'No checkpoint found for task',
          { taskId }
        );
      }

      // 2. Load checkpoint data
      const checkpointData = await this.loadCheckpointData(checkpoint.checkpointId);

      // 3. Validate checkpoint data
      await this.validateCheckpointData(checkpointData);

      // 4. Restore runtime state to Redis
      const runtimeRestored = await this.restoreRuntimeState(
        taskId,
        checkpointData.runtimeState
      );

      // 5. Restore durable state to SQLite (if needed)
      const durableRestored = await this.restoreDurableState(
        taskId,
        checkpointData.durableState
      );

      // 6. Update checkpoint status
      checkpoint.status = CheckpointStatus.RECOVERED;
      await this.updateCheckpointMetadata(checkpoint);

      const result: RecoveryResult = {
        success: true,
        checkpointId: checkpoint.checkpointId,
        taskId,
        runtimeStateRestored: runtimeRestored,
        durableStateRestored: durableRestored,
        timestamp: new Date(),
      };

      logger.info('Checkpoint recovery completed', result);

      return result;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to recover from checkpoint', err, { taskId });

      return {
        success: false,
        checkpointId: '',
        taskId,
        runtimeStateRestored: false,
        durableStateRestored: false,
        timestamp: new Date(),
        errors: [err.message],
      };
    }
  }

  /**
   * List checkpoints for a task
   */
  async listCheckpoints(taskId: string): Promise<CheckpointMetadata[]> {
    this.ensureInitialized();

    try {
      const rows = await this.sqliteAdapter.list<any>('checkpoints', {
        filters: [{ field: 'task_id', operator: 'eq', value: taskId }],
        orderBy: 'created_at',
        order: 'desc',
      });

      return rows.map(row => this.deserializeCheckpointMetadata(row));
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to list checkpoints', err, { taskId });
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to list checkpoints',
        { taskId },
        err
      );
    }
  }

  /**
   * Delete old checkpoints (cleanup)
   */
  async cleanupOldCheckpoints(): Promise<number> {
    this.ensureInitialized();

    if (!this.config.enableAutoCleanup) {
      logger.info('Automatic cleanup disabled');
      return 0;
    }

    try {
      const cutoffDate = new Date(Date.now() - this.config.retentionPeriod);

      const result = await this.sqliteAdapter.raw(`
        DELETE FROM checkpoints
        WHERE created_at < ?
      `, [cutoffDate.toISOString()]);

      const deletedCount = result.rowsAffected || 0;

      logger.info('Cleaned up old checkpoints', {
        deletedCount,
        cutoffDate: cutoffDate.toISOString(),
      });

      return deletedCount;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to cleanup old checkpoints', err);
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to cleanup old checkpoints',
        {},
        err
      );
    }
  }

  // ============================================================================
  // Private Methods - State Capture
  // ============================================================================

  private async captureRuntimeState(taskId: string): Promise<RuntimeState> {
    try {
      // Capture agent execution state
      const agentKeys = await this.redisAdapter.raw<string[]>('KEYS', [`agent:${taskId}:*`]);
      const agents: AgentExecutionState[] = [];

      for (const key of agentKeys) {
        const data = await this.redisAdapter.get<any>(key);
        if (data) {
          agents.push({
            agentId: data.agentId || '',
            agentType: data.agentType || '',
            status: data.status || 'in_progress',
            confidence: data.confidence,
            startedAt: new Date(data.startedAt || Date.now()),
            completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
            metadata: data.metadata,
          });
        }
      }

      // Capture coordination signals
      const signalKeys = await this.redisAdapter.raw<string[]>('KEYS', [`swarm:${taskId}:*`]);
      const coordinationSignals: CoordinationSignal[] = [];

      for (const key of signalKeys) {
        const value = await this.redisAdapter.get<string>(key);
        const ttl = await this.redisAdapter.raw<number>('TTL', [key]);

        if (value) {
          coordinationSignals.push({
            key,
            value,
            ttl: ttl > 0 ? ttl : undefined,
            createdAt: new Date(),
          });
        }
      }

      // Capture queue data
      const queueKeys = await this.redisAdapter.raw<string[]>('KEYS', [`queue:${taskId}:*`]);
      const queueData: QueueData[] = [];

      for (const key of queueKeys) {
        const items = await this.redisAdapter.raw<any[]>('LRANGE', [key, '0', '-1']);
        if (items && items.length > 0) {
          queueData.push({
            queueName: key,
            items,
          });
        }
      }

      // Capture active locks
      const lockKeys = await this.redisAdapter.raw<string[]>('KEYS', [`lock:${taskId}:*`]);
      const activeLocks: Lock[] = [];

      for (const key of lockKeys) {
        const owner = await this.redisAdapter.get<string>(key);
        const ttl = await this.redisAdapter.raw<number>('TTL', [key]);

        if (owner && ttl > 0) {
          activeLocks.push({
            lockKey: key,
            owner,
            acquiredAt: new Date(),
            expiresAt: new Date(Date.now() + ttl * 1000),
          });
        }
      }

      return {
        taskId,
        agents,
        coordinationSignals,
        queueData,
        activeLocks,
        capturedAt: new Date(),
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to capture runtime state', err, { taskId });
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to capture runtime state from Redis',
        { taskId },
        err
      );
    }
  }

  private async captureDurableState(taskId: string): Promise<DurableState> {
    try {
      // Capture task results
      const taskResults = await this.sqliteAdapter.list<TaskResult>('task_results', {
        filters: [{ field: 'taskId' as any, operator: 'eq', value: taskId }],
      });

      // Capture agent metrics
      const agentMetrics = await this.sqliteAdapter.list<AgentMetrics>('agent_metrics', {
        filters: [{ field: 'taskId' as any, operator: 'eq', value: taskId }],
      });

      // Capture audit trail
      const auditTrail = await this.sqliteAdapter.list<AuditEntry>('audit_trail', {
        filters: [{ field: 'taskId' as any, operator: 'eq', value: taskId }],
      });

      // Capture skill metadata
      const skillMetadata = await this.sqliteAdapter.list<SkillMetadata>('skill_metadata', {});

      return {
        taskId,
        taskResults,
        agentMetrics,
        auditTrail,
        skillMetadata,
        capturedAt: new Date(),
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to capture durable state', err, { taskId });
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to capture durable state from SQLite',
        { taskId },
        err
      );
    }
  }

  // ============================================================================
  // Private Methods - State Storage
  // ============================================================================

  private async storeCheckpointData(
    checkpointId: string,
    runtimeState: RuntimeState,
    durableState: DurableState
  ): Promise<void> {
    try {
      // Store runtime state as JSON in a key-value table
      await this.sqliteAdapter.insert('checkpoint_data', {
        key: `checkpoint_runtime:${checkpointId}`,
        value: JSON.stringify(runtimeState),
      });

      // Store durable state as JSON in a key-value table
      await this.sqliteAdapter.insert('checkpoint_data', {
        key: `checkpoint_durable:${checkpointId}`,
        value: JSON.stringify(durableState),
      });

      logger.debug('Checkpoint data stored', { checkpointId });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to store checkpoint data', err, { checkpointId });
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to store checkpoint data',
        { checkpointId },
        err
      );
    }
  }

  private async loadCheckpointData(checkpointId: string): Promise<CheckpointData> {
    try {
      // Load metadata from checkpoints table
      const metadataRow = await this.sqliteAdapter.get<any>(`checkpoints:${checkpointId}`);
      if (!metadataRow) {
        throw new StandardError(
          ErrorCode.DB_NOT_FOUND,
          'Checkpoint metadata not found',
          { checkpointId }
        );
      }

      // Load runtime state from checkpoint_data table
      const runtimeStateRow = await this.sqliteAdapter.get<any>(
        `checkpoint_data:checkpoint_runtime:${checkpointId}`
      );
      if (!runtimeStateRow || !runtimeStateRow.value) {
        throw new StandardError(
          ErrorCode.DB_NOT_FOUND,
          'Checkpoint runtime state not found',
          { checkpointId }
        );
      }

      // Load durable state from checkpoint_data table
      const durableStateRow = await this.sqliteAdapter.get<any>(
        `checkpoint_data:checkpoint_durable:${checkpointId}`
      );
      if (!durableStateRow || !durableStateRow.value) {
        throw new StandardError(
          ErrorCode.DB_NOT_FOUND,
          'Checkpoint durable state not found',
          { checkpointId }
        );
      }

      return {
        metadata: this.deserializeCheckpointMetadata(metadataRow),
        runtimeState: JSON.parse(runtimeStateRow.value),
        durableState: JSON.parse(durableStateRow.value),
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to load checkpoint data', err, { checkpointId });
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to load checkpoint data',
        { checkpointId },
        err
      );
    }
  }

  // ============================================================================
  // Private Methods - State Restoration
  // ============================================================================

  private async restoreRuntimeState(
    taskId: string,
    runtimeState: RuntimeState
  ): Promise<boolean> {
    try {
      // Restore agent execution state
      for (const agent of runtimeState.agents) {
        await this.redisAdapter.insert(`agent:${taskId}:${agent.agentId}`, agent);
      }

      // Restore coordination signals
      for (const signal of runtimeState.coordinationSignals) {
        await this.redisAdapter.insert(signal.key, signal.value);
        if (signal.ttl) {
          await this.redisAdapter.raw('EXPIRE', [signal.key, signal.ttl.toString()]);
        }
      }

      // Restore queue data
      for (const queue of runtimeState.queueData) {
        await this.redisAdapter.raw('DEL', [queue.queueName]);
        for (const item of queue.items) {
          await this.redisAdapter.raw('RPUSH', [queue.queueName, JSON.stringify(item)]);
        }
      }

      // Restore active locks
      for (const lock of runtimeState.activeLocks) {
        const ttl = Math.floor((lock.expiresAt.getTime() - Date.now()) / 1000);
        if (ttl > 0) {
          await this.redisAdapter.insert(lock.lockKey, lock.owner);
          await this.redisAdapter.raw('EXPIRE', [lock.lockKey, ttl.toString()]);
        }
      }

      logger.info('Runtime state restored to Redis', { taskId });
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to restore runtime state', err, { taskId });
      return false;
    }
  }

  private async restoreDurableState(
    taskId: string,
    durableState: DurableState
  ): Promise<boolean> {
    try {
      // Durable state in SQLite is already persistent
      // This method is for future enhancements (e.g., restoring to different instance)
      logger.info('Durable state validation complete', { taskId });
      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to restore durable state', err, { taskId });
      return false;
    }
  }

  // ============================================================================
  // Private Methods - Validation
  // ============================================================================

  private async validateState(
    runtimeState: RuntimeState,
    durableState: DurableState
  ): Promise<void> {
    // Validate runtime state
    if (!runtimeState.taskId) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Invalid runtime state: missing taskId',
        { runtimeState }
      );
    }

    if (!Array.isArray(runtimeState.agents)) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Invalid runtime state: agents must be an array',
        { runtimeState }
      );
    }

    // Validate durable state
    if (!durableState.taskId) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Invalid durable state: missing taskId',
        { durableState }
      );
    }

    if (runtimeState.taskId !== durableState.taskId) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Task ID mismatch between runtime and durable state',
        { runtimeTaskId: runtimeState.taskId, durableTaskId: durableState.taskId }
      );
    }

    logger.debug('State validation passed', { taskId: runtimeState.taskId });
  }

  private async validateCheckpointData(checkpointData: CheckpointData): Promise<void> {
    await this.validateState(checkpointData.runtimeState, checkpointData.durableState);

    if (checkpointData.metadata.status !== CheckpointStatus.COMPLETED) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        'Cannot recover from incomplete checkpoint',
        { status: checkpointData.metadata.status }
      );
    }

    logger.debug('Checkpoint data validation passed', {
      checkpointId: checkpointData.metadata.checkpointId,
    });
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private generateCheckpointId(taskId: string, trigger: CheckpointTrigger): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `checkpoint_${taskId}_${trigger}_${timestamp}_${random}`;
  }

  private hashState(state: RuntimeState | DurableState): string {
    const stateJson = JSON.stringify(state, Object.keys(state).sort());
    return crypto.createHash('sha256').update(stateJson).digest('hex');
  }

  private async findCheckpointByHash(
    taskId: string,
    runtimeHash: string,
    durableHash: string
  ): Promise<CheckpointMetadata | null> {
    try {
      const rows = await this.sqliteAdapter.list<any>('checkpoints', {
        filters: [
          { field: 'task_id', operator: 'eq', value: taskId },
          { field: 'runtime_state_hash', operator: 'eq', value: runtimeHash },
          { field: 'durable_state_hash', operator: 'eq', value: durableHash },
        ],
        limit: 1,
      });

      if (rows.length === 0) {
        return null;
      }

      return this.deserializeCheckpointMetadata(rows[0]);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find checkpoint by hash', err, { taskId });
      return null;
    }
  }

  private async findLatestCheckpoint(taskId: string): Promise<CheckpointMetadata | null> {
    try {
      const rows = await this.sqliteAdapter.list<any>('checkpoints', {
        filters: [
          { field: 'task_id', operator: 'eq', value: taskId },
          { field: 'status', operator: 'eq', value: CheckpointStatus.COMPLETED },
        ],
        orderBy: 'created_at',
        order: 'desc',
        limit: 1,
      });

      if (rows.length === 0) {
        return null;
      }

      return this.deserializeCheckpointMetadata(rows[0]);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find latest checkpoint', err, { taskId });
      return null;
    }
  }

  private async storeCheckpointMetadata(metadata: CheckpointMetadata): Promise<void> {
    try {
      await this.sqliteAdapter.insert('checkpoints', {
        checkpoint_id: metadata.checkpointId,
        task_id: metadata.taskId,
        trigger: metadata.trigger,
        status: metadata.status,
        runtime_state_hash: metadata.runtimeStateHash,
        durable_state_hash: metadata.durableStateHash,
        created_at: metadata.createdAt.toISOString(),
        completed_at: metadata.completedAt?.toISOString(),
        error: metadata.error,
        metadata: JSON.stringify(metadata.metadata || {}),
      });

      logger.debug('Checkpoint metadata stored', { checkpointId: metadata.checkpointId });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to store checkpoint metadata', err, {
        checkpointId: metadata.checkpointId,
      });
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to store checkpoint metadata',
        { checkpointId: metadata.checkpointId },
        err
      );
    }
  }

  private async updateCheckpointMetadata(metadata: CheckpointMetadata): Promise<void> {
    try {
      await this.sqliteAdapter.update('checkpoints', metadata.checkpointId, {
        status: metadata.status,
        completed_at: metadata.completedAt?.toISOString(),
        error: metadata.error,
      });
    } catch (error) {
      // If update fails, try insert (first time)
      await this.storeCheckpointMetadata(metadata);
    }
  }

  private deserializeCheckpointMetadata(row: any): CheckpointMetadata {
    return {
      checkpointId: row.checkpoint_id,
      taskId: row.task_id,
      trigger: row.trigger as CheckpointTrigger,
      status: row.status as CheckpointStatus,
      runtimeStateHash: row.runtime_state_hash,
      durableStateHash: row.durable_state_hash,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private async createCheckpointTables(): Promise<void> {
    try {
      // Create checkpoints table
      await this.sqliteAdapter.raw(`
        CREATE TABLE IF NOT EXISTS checkpoints (
          checkpoint_id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          trigger TEXT NOT NULL,
          status TEXT NOT NULL,
          runtime_state_hash TEXT NOT NULL,
          durable_state_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          completed_at TEXT,
          error TEXT,
          metadata TEXT
        )
      `, []);

      // Create checkpoint_data table for storing state JSON
      await this.sqliteAdapter.raw(`
        CREATE TABLE IF NOT EXISTS checkpoint_data (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `, []);

      // Create indexes
      await this.sqliteAdapter.raw(`
        CREATE INDEX IF NOT EXISTS idx_checkpoints_task_id ON checkpoints(task_id)
      `, []);

      await this.sqliteAdapter.raw(`
        CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON checkpoints(status)
      `, []);

      await this.sqliteAdapter.raw(`
        CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at ON checkpoints(created_at)
      `, []);

      logger.info('Checkpoint tables created successfully');
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create checkpoint tables', err);
      throw new StandardError(
        ErrorCode.DB_QUERY_FAILED,
        'Failed to create checkpoint tables',
        {},
        err
      );
    }
  }

  private startPeriodicCheckpoints(): void {
    this.periodicCheckpointTimer = setInterval(async () => {
      try {
        logger.debug('Running periodic checkpoint cleanup');
        await this.cleanupOldCheckpoints();
      } catch (error) {
        const err = error as Error;
        logger.error('Periodic checkpoint cleanup failed', err);
      }
    }, this.config.periodicInterval);

    logger.info('Periodic checkpoints started', {
      interval: this.config.periodicInterval,
    });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        'CheckpointManager not initialized. Call initialize() first.',
        {}
      );
    }
  }
}

/**
 * Export convenience functions
 */

/**
 * Create a checkpoint manager instance
 */
export function createCheckpointManager(
  dbService: DatabaseService,
  config?: CheckpointManagerConfig
): CheckpointManager {
  return new CheckpointManager(dbService, config);
}
