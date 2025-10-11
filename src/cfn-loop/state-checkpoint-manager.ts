/**
 * State Checkpoint Manager - Redis-backed State Persistence
 *
 * Provides automatic checkpoint creation every 30 seconds for crash recovery:
 * - Epic/Sprint/Phase state serialization with compression
 * - Redis persistence with TTL (Time To Live) management
 * - Incremental checkpointing to minimize write latency
 * - State versioning for rollback capability
 *
 * Acceptance Criteria:
 * - Checkpoint interval: 30 seconds (configurable)
 * - Checkpoint size: <1MB per sprint (with compression)
 * - Write latency: <100ms per checkpoint
 * - Redis TTL: 24 hours (configurable)
 *
 * @module cfn-loop/state-checkpoint-manager
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { CheckpointSerializer, SerializedCheckpoint } from './checkpoint-serializer.js';
import { createClient, RedisClientType } from 'redis';

// ===== TYPE DEFINITIONS =====

/**
 * Epic state snapshot for checkpointing
 */
export interface EpicState {
  epicId: string;
  name: string;
  status: 'planning' | 'in-progress' | 'completed' | 'failed';
  sprints: SprintState[];
  startTime: number;
  lastUpdateTime: number;
  metadata?: Record<string, any>;
}

/**
 * Sprint state snapshot for checkpointing
 */
export interface SprintState {
  sprintId: string;
  name: string;
  status: 'planning' | 'in-progress' | 'completed' | 'failed';
  phases: PhaseState[];
  confidence?: number;
  startTime: number;
  lastUpdateTime: number;
}

/**
 * Phase state snapshot for checkpointing
 */
export interface PhaseState {
  phaseId: string;
  name: string;
  objective: string;
  status: 'pending' | 'loop3-in-progress' | 'loop2-validation' | 'loop4-decision' | 'completed' | 'failed';
  swarmId?: string;
  agents: AgentState[];
  deliverables: string[];
  confidence?: number;
  consensus?: number;
  loop3Iterations: number;
  loop2Iterations: number;
  startTime: number;
  lastUpdateTime: number;
}

/**
 * Agent state snapshot for checkpointing
 */
export interface AgentState {
  agentId: string;
  agentType: string;
  status: 'spawned' | 'in-progress' | 'completed' | 'failed' | 'blocked';
  confidence?: number;
  deliverables: string[];
  blockers: string[];
  lastHeartbeat: number;
}

/**
 * Checkpoint metadata
 */
export interface CheckpointMetadata {
  version: number;
  timestamp: number;
  checkpointId: string;
  previousCheckpointId?: string;
  sizeBytes: number;
  compressionRatio: number;
  writeLatencyMs: number;
}

/**
 * Complete checkpoint with state and metadata
 */
export interface Checkpoint {
  metadata: CheckpointMetadata;
  state: EpicState;
}

/**
 * Configuration for checkpoint manager
 */
export interface CheckpointManagerConfig {
  redisUrl?: string;
  checkpointIntervalMs?: number; // Default: 30000 (30 seconds)
  ttlSeconds?: number; // Default: 86400 (24 hours)
  compressionEnabled?: boolean; // Default: true
  maxCheckpointSizeBytes?: number; // Default: 1048576 (1MB)
  enableVersioning?: boolean; // Default: true
  maxVersionsToKeep?: number; // Default: 10
  enableIncrementalCheckpoints?: boolean; // Default: true
}

/**
 * Checkpoint statistics for monitoring
 */
export interface CheckpointStats {
  totalCheckpoints: number;
  totalSizeBytes: number;
  averageWriteLatencyMs: number;
  lastCheckpointTime: number;
  checkpointFailures: number;
  compressionRatio: number;
}

// ===== STATE CHECKPOINT MANAGER =====

/**
 * Manages automatic state checkpointing to Redis for crash recovery
 *
 * Features:
 * - Automatic checkpointing every 30 seconds (configurable)
 * - Redis persistence with TTL management
 * - Compression to keep checkpoints <1MB
 * - Incremental checkpointing to minimize write latency
 * - State versioning for rollback capability
 *
 * Usage:
 * ```typescript
 * const manager = new StateCheckpointManager({
 *   checkpointIntervalMs: 30000,
 *   compressionEnabled: true
 * });
 *
 * await manager.initialize();
 * await manager.updateState(epicState);
 * manager.startAutoCheckpoint();
 * ```
 */
export class StateCheckpointManager extends EventEmitter {
  private logger: Logger;
  private config: Required<CheckpointManagerConfig>;
  private redis: RedisClientType | null = null;
  private serializer: CheckpointSerializer;
  private currentState: EpicState | null = null;
  private lastCheckpoint: Checkpoint | null = null;
  private checkpointTimer: NodeJS.Timeout | null = null;
  private stats: CheckpointStats;
  private isRunning: boolean = false;
  private checkpointVersion: number = 0;

  constructor(config: CheckpointManagerConfig = {}) {
    super();
    this.logger = new Logger({ level: 'info', format: 'json', name: 'StateCheckpointManager' }, 'StateCheckpointManager');

    this.config = {
      redisUrl: config.redisUrl || 'redis://localhost:6379',
      checkpointIntervalMs: config.checkpointIntervalMs || 30000,
      ttlSeconds: config.ttlSeconds || 86400,
      compressionEnabled: config.compressionEnabled ?? true,
      maxCheckpointSizeBytes: config.maxCheckpointSizeBytes || 1048576,
      enableVersioning: config.enableVersioning ?? true,
      maxVersionsToKeep: config.maxVersionsToKeep || 10,
      enableIncrementalCheckpoints: config.enableIncrementalCheckpoints ?? true,
    };

    this.serializer = new CheckpointSerializer({
      compressionEnabled: this.config.compressionEnabled,
      maxSizeBytes: this.config.maxCheckpointSizeBytes,
    });

    this.stats = {
      totalCheckpoints: 0,
      totalSizeBytes: 0,
      averageWriteLatencyMs: 0,
      lastCheckpointTime: 0,
      checkpointFailures: 0,
      compressionRatio: 1.0,
    };
  }

  /**
   * Initialize Redis connection and restore state if available
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing state checkpoint manager');

      // Create Redis client
      this.redis = createClient({ url: this.config.redisUrl });

      this.redis.on('error', (err) => {
        this.logger.error('Redis client error', { error: err.message });
        this.emit('error', err);
      });

      this.redis.on('connect', () => {
        this.logger.info('Redis client connected');
      });

      await this.redis.connect();

      // Try to restore latest checkpoint
      const restored = await this.restoreLatestCheckpoint();
      if (restored) {
        this.logger.info('Restored checkpoint on initialization', {
          epicId: restored.epicId,
          version: this.checkpointVersion,
        });
      }

      this.emit('initialized');
      this.logger.info('State checkpoint manager initialized');
    } catch (error) {
      this.logger.error('Failed to initialize checkpoint manager', { error });
      throw error;
    }
  }

  /**
   * Update current epic state (triggers checkpoint on next interval)
   */
  async updateState(state: EpicState): Promise<void> {
    this.currentState = {
      ...state,
      lastUpdateTime: Date.now(),
    };

    this.emit('state-updated', this.currentState);
  }

  /**
   * Start automatic checkpointing at configured interval
   */
  startAutoCheckpoint(): void {
    if (this.isRunning) {
      this.logger.warn('Auto-checkpoint already running');
      return;
    }

    this.isRunning = true;
    this.checkpointTimer = setInterval(async () => {
      await this.createCheckpoint();
    }, this.config.checkpointIntervalMs);

    this.logger.info('Auto-checkpoint started', {
      intervalMs: this.config.checkpointIntervalMs,
    });
    this.emit('auto-checkpoint-started');
  }

  /**
   * Stop automatic checkpointing
   */
  stopAutoCheckpoint(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }

    this.isRunning = false;
    this.logger.info('Auto-checkpoint stopped');
    this.emit('auto-checkpoint-stopped');
  }

  /**
   * Create checkpoint of current state
   */
  async createCheckpoint(): Promise<Checkpoint | null> {
    if (!this.currentState || !this.redis) {
      this.logger.warn('Cannot create checkpoint: no state or Redis connection');
      return null;
    }

    const startTime = Date.now();

    try {
      // Determine if this should be incremental
      const isIncremental = this.config.enableIncrementalCheckpoints && this.lastCheckpoint !== null;

      // Serialize state
      const serialized: SerializedCheckpoint = await this.serializer.serialize(
        this.currentState,
        isIncremental ? this.lastCheckpoint?.state : undefined
      );

      // Create checkpoint metadata
      this.checkpointVersion++;
      const checkpointId = `checkpoint-${this.currentState.epicId}-${this.checkpointVersion}`;
      const metadata: CheckpointMetadata = {
        version: this.checkpointVersion,
        timestamp: Date.now(),
        checkpointId,
        previousCheckpointId: this.lastCheckpoint?.metadata.checkpointId,
        sizeBytes: serialized.sizeBytes,
        compressionRatio: serialized.compressionRatio,
        writeLatencyMs: 0, // Will be calculated after write
      };

      // Store checkpoint in Redis
      const redisKey = `cfn:checkpoint:${this.currentState.epicId}:${this.checkpointVersion}`;
      const checkpointData = JSON.stringify({ metadata, serialized });

      await this.redis.setEx(redisKey, this.config.ttlSeconds, checkpointData);

      // Update metadata pointer (latest checkpoint)
      const latestKey = `cfn:checkpoint:${this.currentState.epicId}:latest`;
      await this.redis.setEx(latestKey, this.config.ttlSeconds, checkpointId);

      // Calculate write latency
      const writeLatencyMs = Date.now() - startTime;
      metadata.writeLatencyMs = writeLatencyMs;

      // Create checkpoint object
      const checkpoint: Checkpoint = {
        metadata,
        state: this.currentState,
      };

      this.lastCheckpoint = checkpoint;

      // Update statistics
      this.updateStats(checkpoint);

      // Cleanup old versions if versioning enabled
      if (this.config.enableVersioning) {
        await this.cleanupOldVersions(this.currentState.epicId);
      }

      // Validate checkpoint meets acceptance criteria
      this.validateCheckpoint(checkpoint);

      this.logger.info('Checkpoint created', {
        checkpointId,
        version: this.checkpointVersion,
        sizeBytes: serialized.sizeBytes,
        writeLatencyMs,
        compressionRatio: serialized.compressionRatio,
      });

      this.emit('checkpoint-created', checkpoint);
      return checkpoint;
    } catch (error) {
      this.stats.checkpointFailures++;
      this.logger.error('Failed to create checkpoint', { error });
      this.emit('checkpoint-error', error);
      return null;
    }
  }

  /**
   * Restore latest checkpoint for an epic
   */
  async restoreLatestCheckpoint(): Promise<EpicState | null> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    try {
      // Find all checkpoint keys
      const keys = await this.redis.keys('cfn:checkpoint:*:latest');
      if (keys.length === 0) {
        this.logger.info('No checkpoints found for restoration');
        return null;
      }

      // Get latest checkpoint ID
      const latestCheckpointId = await this.redis.get(keys[0]);
      if (!latestCheckpointId) {
        return null;
      }

      // Extract epic ID and version from checkpoint ID
      const match = latestCheckpointId.match(/checkpoint-(.+)-(\d+)/);
      if (!match) {
        this.logger.error('Invalid checkpoint ID format', { latestCheckpointId });
        return null;
      }

      const [, epicId, version] = match;
      this.checkpointVersion = parseInt(version, 10);

      // Get checkpoint data
      const checkpointKey = `cfn:checkpoint:${epicId}:${version}`;
      const checkpointData = await this.redis.get(checkpointKey);
      if (!checkpointData) {
        this.logger.error('Checkpoint data not found', { checkpointKey });
        return null;
      }

      // Parse checkpoint
      const { metadata, serialized } = JSON.parse(checkpointData);

      // Deserialize state
      const state = await this.serializer.deserialize(serialized);

      this.currentState = state;
      this.lastCheckpoint = { metadata, state };

      this.logger.info('Checkpoint restored', {
        epicId,
        version: this.checkpointVersion,
        timestamp: metadata.timestamp,
      });

      this.emit('checkpoint-restored', state);
      return state;
    } catch (error) {
      this.logger.error('Failed to restore checkpoint', { error });
      throw error;
    }
  }

  /**
   * Get checkpoint history for an epic
   */
  async getCheckpointHistory(epicId: string, limit: number = 10): Promise<CheckpointMetadata[]> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    try {
      const keys = await this.redis.keys(`cfn:checkpoint:${epicId}:*`);
      const checkpoints: CheckpointMetadata[] = [];

      for (const key of keys) {
        if (key.endsWith(':latest')) continue;

        const data = await this.redis.get(key);
        if (data) {
          const { metadata } = JSON.parse(data);
          checkpoints.push(metadata);
        }
      }

      // Sort by version descending
      checkpoints.sort((a, b) => b.version - a.version);

      return checkpoints.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to get checkpoint history', { error });
      throw error;
    }
  }

  /**
   * Get current checkpoint statistics
   */
  getStats(): CheckpointStats {
    return { ...this.stats };
  }

  /**
   * Cleanup old checkpoint versions
   */
  private async cleanupOldVersions(epicId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const keys = await this.redis.keys(`cfn:checkpoint:${epicId}:*`);
      const versionKeys = keys
        .filter((k) => !k.endsWith(':latest'))
        .sort()
        .reverse();

      // Delete old versions beyond maxVersionsToKeep
      const toDelete = versionKeys.slice(this.config.maxVersionsToKeep);
      for (const key of toDelete) {
        await this.redis.del(key);
      }

      if (toDelete.length > 0) {
        this.logger.debug('Cleaned up old checkpoint versions', {
          epicId,
          deleted: toDelete.length,
        });
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old versions', { error });
    }
  }

  /**
   * Update checkpoint statistics
   */
  private updateStats(checkpoint: Checkpoint): void {
    this.stats.totalCheckpoints++;
    this.stats.totalSizeBytes += checkpoint.metadata.sizeBytes;
    this.stats.lastCheckpointTime = checkpoint.metadata.timestamp;

    // Update rolling average for write latency
    const totalLatency = this.stats.averageWriteLatencyMs * (this.stats.totalCheckpoints - 1);
    this.stats.averageWriteLatencyMs = (totalLatency + checkpoint.metadata.writeLatencyMs) / this.stats.totalCheckpoints;

    // Update compression ratio
    this.stats.compressionRatio = checkpoint.metadata.compressionRatio;
  }

  /**
   * Validate checkpoint meets acceptance criteria
   */
  private validateCheckpoint(checkpoint: Checkpoint): void {
    const { sizeBytes, writeLatencyMs } = checkpoint.metadata;

    // Check size constraint (<1MB)
    if (sizeBytes > this.config.maxCheckpointSizeBytes) {
      this.logger.warn('Checkpoint exceeds size limit', {
        sizeBytes,
        limit: this.config.maxCheckpointSizeBytes,
      });
      this.emit('checkpoint-warning', {
        type: 'size-exceeded',
        sizeBytes,
        limit: this.config.maxCheckpointSizeBytes,
      });
    }

    // Check write latency (<100ms)
    if (writeLatencyMs > 100) {
      this.logger.warn('Checkpoint write latency exceeds target', {
        writeLatencyMs,
        target: 100,
      });
      this.emit('checkpoint-warning', {
        type: 'latency-exceeded',
        writeLatencyMs,
        target: 100,
      });
    }
  }

  /**
   * Shutdown checkpoint manager and close Redis connection
   */
  async shutdown(): Promise<void> {
    this.stopAutoCheckpoint();

    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    this.logger.info('State checkpoint manager shutdown');
    this.emit('shutdown');
  }
}
