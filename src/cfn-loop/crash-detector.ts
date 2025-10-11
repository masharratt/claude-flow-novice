/**
 * Crash Detection System - Detect and Analyze Interrupted CFN Loop Executions
 *
 * Detects interrupted executions on CLI startup by scanning Redis for:
 * - Epics with stale heartbeats (>5 minutes without update)
 * - Sprints in progress vs completed states
 * - Checkpoint timestamps vs current time
 * - Estimated work loss and recovery time
 *
 * Acceptance Criteria:
 * - Detect interrupted epics within 5 seconds of CLI start
 * - Show accurate sprint progress percentages
 * - Calculate estimated recovery time
 * - Differentiate between crash and clean shutdown
 *
 * @module cfn-loop/crash-detector
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { createClient, RedisClientType } from 'redis';
import { EpicState, SprintState, PhaseState } from './state-checkpoint-manager.js';

// ===== TYPE DEFINITIONS =====

/**
 * Interrupted sprint details
 */
export interface InterruptedSprint {
  sprintId: string;
  name: string;
  progress: number; // 0.0 to 1.0
  filesInProgress: string[];
  phasesCompleted: number;
  phasesTotal: number;
  lastUpdateTime: number;
}

/**
 * Interrupted execution detected
 */
export interface InterruptedExecution {
  epicId: string;
  epicName: string;
  lastHeartbeat: number;
  timeSinceHeartbeat: number; // milliseconds
  sprintsInProgress: InterruptedSprint[];
  sprintsCompleted: number;
  sprintsTotal: number;
  estimatedWorkLoss: number; // percentage (0-100)
  recoveryTimeEstimate: number; // minutes
  isCleanShutdown: boolean;
  checkpointVersion: number;
  lastCheckpointTime: number;
}

/**
 * Configuration for crash detector
 */
export interface CrashDetectorConfig {
  redisUrl?: string;
  heartbeatTimeoutMs?: number; // Default: 300000 (5 minutes)
  scanTimeoutMs?: number; // Default: 5000 (5 seconds)
  recoveryTimePerPhaseMin?: number; // Default: 5 minutes per phase
}

/**
 * Crash detection summary statistics
 */
export interface CrashDetectionStats {
  totalEpicsScanned: number;
  interruptedEpicsFound: number;
  cleanShutdownsFound: number;
  scanDurationMs: number;
  redisKeysScanned: number;
}

// ===== CRASH DETECTOR =====

/**
 * Detects interrupted CFN Loop executions on CLI startup
 *
 * Features:
 * - Fast detection (<5 seconds)
 * - Redis heartbeat analysis
 * - Sprint progress calculation
 * - Work loss estimation
 * - Clean shutdown differentiation
 *
 * Usage:
 * ```typescript
 * const detector = new CrashDetector({
 *   heartbeatTimeoutMs: 300000 // 5 minutes
 * });
 *
 * await detector.initialize();
 * const interrupted = await detector.detectInterruptedExecutions();
 * ```
 */
export class CrashDetector extends EventEmitter {
  private logger: Logger;
  private config: Required<CrashDetectorConfig>;
  private redis: RedisClientType | null = null;
  private stats: CrashDetectionStats;

  constructor(config: CrashDetectorConfig = {}) {
    super();
    this.logger = new Logger({ level: 'info', format: 'json', name: 'CrashDetector' }, 'CrashDetector');

    this.config = {
      redisUrl: config.redisUrl || 'redis://localhost:6379',
      heartbeatTimeoutMs: config.heartbeatTimeoutMs || 300000, // 5 minutes
      scanTimeoutMs: config.scanTimeoutMs || 5000, // 5 seconds
      recoveryTimePerPhaseMin: config.recoveryTimePerPhaseMin || 5, // 5 minutes per phase
    };

    this.stats = {
      totalEpicsScanned: 0,
      interruptedEpicsFound: 0,
      cleanShutdownsFound: 0,
      scanDurationMs: 0,
      redisKeysScanned: 0,
    };
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing crash detector');

      // Create Redis client
      this.redis = createClient({ url: this.config.redisUrl });

      this.redis.on('error', (err) => {
        this.logger.error('Redis client error', { error: err.message });
        this.emit('error', err);
      });

      await this.redis.connect();

      this.logger.info('Crash detector initialized');
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize crash detector', { error });
      throw error;
    }
  }

  /**
   * Detect all interrupted executions
   */
  async detectInterruptedExecutions(): Promise<InterruptedExecution[]> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    const startTime = Date.now();
    const interrupted: InterruptedExecution[] = [];

    try {
      this.logger.info('Starting crash detection scan');

      // Scan for stale heartbeats with timeout
      const staleEpicIds = await this.withTimeout(
        this.scanRedisForStaleHeartbeats(),
        this.config.scanTimeoutMs,
        'Heartbeat scan timeout'
      );

      this.stats.totalEpicsScanned = staleEpicIds.length;

      // Analyze each stale epic
      for (const epicId of staleEpicIds) {
        try {
          const execution = await this.analyzeInterruptedEpic(epicId);
          if (execution) {
            interrupted.push(execution);

            if (execution.isCleanShutdown) {
              this.stats.cleanShutdownsFound++;
            } else {
              this.stats.interruptedEpicsFound++;
            }
          }
        } catch (error) {
          this.logger.error('Failed to analyze epic', { epicId, error });
        }
      }

      // Update statistics
      this.stats.scanDurationMs = Date.now() - startTime;

      this.logger.info('Crash detection scan completed', {
        interrupted: interrupted.length,
        cleanShutdowns: this.stats.cleanShutdownsFound,
        durationMs: this.stats.scanDurationMs,
      });

      this.emit('scan-completed', { interrupted, stats: this.stats });
      return interrupted;
    } catch (error) {
      this.logger.error('Crash detection scan failed', { error });
      throw error;
    }
  }

  /**
   * Scan Redis for running epics without recent heartbeats
   */
  async scanRedisForStaleHeartbeats(): Promise<string[]> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    try {
      const now = Date.now();
      const staleEpicIds: string[] = [];

      // Find all epic heartbeat keys
      const heartbeatKeys = await this.redis.keys('cfn:epic:*:heartbeat');
      this.stats.redisKeysScanned += heartbeatKeys.length;

      for (const key of heartbeatKeys) {
        const heartbeatData = await this.redis.get(key);
        if (!heartbeatData) continue;

        try {
          const heartbeat = JSON.parse(heartbeatData);
          const timeSinceHeartbeat = now - heartbeat.timestamp;

          // Check if heartbeat is stale (>5 minutes old)
          if (timeSinceHeartbeat > this.config.heartbeatTimeoutMs) {
            // Extract epic ID from key: cfn:epic:{epicId}:heartbeat
            const epicId = key.split(':')[2];
            staleEpicIds.push(epicId);

            this.logger.debug('Stale heartbeat detected', {
              epicId,
              timeSinceHeartbeat,
              lastHeartbeat: heartbeat.timestamp,
            });
          }
        } catch (error) {
          this.logger.warn('Failed to parse heartbeat data', { key, error });
        }
      }

      return staleEpicIds;
    } catch (error) {
      this.logger.error('Failed to scan for stale heartbeats', { error });
      throw error;
    }
  }

  /**
   * Analyze a specific interrupted epic
   */
  private async analyzeInterruptedEpic(epicId: string): Promise<InterruptedExecution | null> {
    if (!this.redis) return null;

    try {
      // Get latest checkpoint
      const checkpointKey = await this.redis.get(`cfn:checkpoint:${epicId}:latest`);
      if (!checkpointKey) {
        this.logger.debug('No checkpoint found for epic', { epicId });
        return null;
      }

      // Extract checkpoint version
      const versionMatch = checkpointKey.match(/checkpoint-.+-(\d+)/);
      if (!versionMatch) return null;

      const checkpointVersion = parseInt(versionMatch[1], 10);

      // Get checkpoint data
      const checkpointData = await this.redis.get(checkpointKey.replace(':latest', `:${checkpointVersion}`));
      if (!checkpointData) return null;

      const { metadata, serialized } = JSON.parse(checkpointData);

      // Parse epic state (simplified - in production would use CheckpointSerializer)
      const epicState: EpicState = JSON.parse(serialized.compressed || serialized.data);

      // Get heartbeat data
      const heartbeatData = await this.redis.get(`cfn:epic:${epicId}:heartbeat`);
      const heartbeat = heartbeatData ? JSON.parse(heartbeatData) : null;

      // Determine if clean shutdown
      const isCleanShutdown = await this.differentiateCleanShutdown(epicId, epicState);

      // Calculate sprint progress
      const sprintsInProgress = this.calculateSprintProgress(epicState.sprints);
      const sprintsCompleted = epicState.sprints.filter((s) => s.status === 'completed').length;

      // Calculate work loss and recovery time
      const estimatedWorkLoss = this.calculateWorkLoss(epicState.sprints);
      const recoveryTimeEstimate = await this.calculateRecoveryEstimate(epicId, epicState);

      const execution: InterruptedExecution = {
        epicId,
        epicName: epicState.name,
        lastHeartbeat: heartbeat?.timestamp || metadata.timestamp,
        timeSinceHeartbeat: Date.now() - (heartbeat?.timestamp || metadata.timestamp),
        sprintsInProgress,
        sprintsCompleted,
        sprintsTotal: epicState.sprints.length,
        estimatedWorkLoss,
        recoveryTimeEstimate,
        isCleanShutdown,
        checkpointVersion,
        lastCheckpointTime: metadata.timestamp,
      };

      return execution;
    } catch (error) {
      this.logger.error('Failed to analyze interrupted epic', { epicId, error });
      return null;
    }
  }

  /**
   * Calculate sprint progress percentages
   */
  private calculateSprintProgress(sprints: SprintState[]): InterruptedSprint[] {
    const inProgressSprints: InterruptedSprint[] = [];

    for (const sprint of sprints) {
      if (sprint.status !== 'in-progress') continue;

      const phasesCompleted = sprint.phases.filter((p) => p.status === 'completed').length;
      const phasesTotal = sprint.phases.length;
      const progress = phasesTotal > 0 ? phasesCompleted / phasesTotal : 0;

      // Collect files in progress from phases
      const filesInProgress: string[] = [];
      for (const phase of sprint.phases) {
        if (phase.status !== 'completed' && phase.deliverables.length > 0) {
          filesInProgress.push(...phase.deliverables);
        }
      }

      inProgressSprints.push({
        sprintId: sprint.sprintId,
        name: sprint.name,
        progress,
        filesInProgress,
        phasesCompleted,
        phasesTotal,
        lastUpdateTime: sprint.lastUpdateTime,
      });
    }

    return inProgressSprints;
  }

  /**
   * Calculate estimated work loss percentage
   */
  private calculateWorkLoss(sprints: SprintState[]): number {
    let totalPhases = 0;
    let completedPhases = 0;
    let inProgressPhases = 0;

    for (const sprint of sprints) {
      totalPhases += sprint.phases.length;
      completedPhases += sprint.phases.filter((p) => p.status === 'completed').length;
      inProgressPhases += sprint.phases.filter(
        (p) => p.status === 'loop3-in-progress' || p.status === 'loop2-validation'
      ).length;
    }

    if (totalPhases === 0) return 0;

    // Work loss is the percentage of in-progress work that may need to be redone
    // Completed work is safe, in-progress work may be partially lost
    const workLossPercentage = (inProgressPhases / totalPhases) * 100;
    return Math.round(workLossPercentage * 10) / 10; // Round to 1 decimal
  }

  /**
   * Calculate estimated recovery time in minutes
   */
  async calculateRecoveryEstimate(epicId: string, epicState: EpicState): Promise<number> {
    let totalRecoveryMin = 0;

    for (const sprint of epicState.sprints) {
      const inProgressPhases = sprint.phases.filter(
        (p) => p.status !== 'completed' && p.status !== 'failed'
      ).length;

      // Estimate recovery time: 5 minutes per incomplete phase (configurable)
      totalRecoveryMin += inProgressPhases * this.config.recoveryTimePerPhaseMin;
    }

    return totalRecoveryMin;
  }

  /**
   * Differentiate between crash and clean shutdown
   */
  async differentiateCleanShutdown(epicId: string, epicState: EpicState): Promise<boolean> {
    if (!this.redis) return false;

    try {
      // Check for clean shutdown marker
      const shutdownMarker = await this.redis.get(`cfn:epic:${epicId}:shutdown`);
      if (shutdownMarker) {
        return true;
      }

      // Check epic status
      if (epicState.status === 'completed' || epicState.status === 'failed') {
        return true;
      }

      // Check if all sprints are completed or failed
      const allSprintsFinished = epicState.sprints.every(
        (s) => s.status === 'completed' || s.status === 'failed'
      );
      if (allSprintsFinished) {
        return true;
      }

      // Otherwise, assume crash
      return false;
    } catch (error) {
      this.logger.warn('Failed to check clean shutdown', { epicId, error });
      return false;
    }
  }

  /**
   * Get crash detection statistics
   */
  getStats(): CrashDetectionStats {
    return { ...this.stats };
  }

  /**
   * Helper to execute promise with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      ),
    ]);
  }

  /**
   * Shutdown crash detector and close Redis connection
   */
  async shutdown(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    this.logger.info('Crash detector shutdown');
    this.emit('shutdown');
  }
}
