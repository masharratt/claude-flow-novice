/**
 * Heartbeat Warning System - Sprint 1.2: Dead Coordinator Detection
 *
 * Monitors coordinator heartbeats and detects dead coordinators within 2 minutes.
 * Implements warning escalation, critical exit paths, and orphan cleanup.
 *
 * Features:
 * - Monitor heartbeat freshness every 10 seconds
 * - Warning threshold: >120 seconds without heartbeat update
 * - Escalation: 3 consecutive warnings → coordinator marked as DEAD
 * - Critical exit: Error emission for dead coordinator scenarios
 * - Cleanup: Remove stale state, ACKs, signals for dead coordinators
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.2 - Dead Coordinator Detection
 * Target: Detection within 2 minutes (120 seconds)
 *
 * @module cfn-loop/heartbeat-warning-system
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import type { Redis } from 'ioredis';
import type { LoggingConfig } from '../utils/types.js';

// ===== TYPE DEFINITIONS =====

/**
 * Heartbeat record structure
 */
export interface HeartbeatRecord {
  /** Coordinator ID */
  coordinatorId: string;
  /** Last heartbeat timestamp (ms since epoch) */
  lastHeartbeat: number;
  /** Heartbeat sequence number for continuity validation */
  sequence: number;
  /** Current iteration count */
  iteration: number;
  /** Optional metadata */
  metadata?: {
    phase?: string;
    agentCount?: number;
    status?: string;
  };
}

/**
 * Coordinator health status
 */
export enum CoordinatorHealth {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  CRITICAL = 'critical',
  DEAD = 'dead',
}

/**
 * Warning event data
 */
export interface HeartbeatWarning {
  coordinatorId: string;
  health: CoordinatorHealth;
  staleDuration: number;
  consecutiveWarnings: number;
  lastHeartbeat: number;
  timestamp: number;
  reason: string;
}

/**
 * Configuration for heartbeat warning system
 */
export interface HeartbeatWarningConfig {
  /** Redis client instance (ioredis) */
  redisClient: Redis;
  /** Monitoring interval in milliseconds (default: 10000 = 10s) */
  monitorInterval?: number;
  /** Stale threshold in milliseconds (default: 120000 = 120s) */
  staleThreshold?: number;
  /** Number of consecutive warnings before marking as DEAD (default: 3) */
  maxWarnings?: number;
  /** Enable automatic cleanup on dead coordinator detection (default: true) */
  autoCleanup?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

// ===== HEARTBEAT WARNING SYSTEM =====

/**
 * Manages heartbeat monitoring and dead coordinator detection
 */
export class HeartbeatWarningSystem extends EventEmitter {
  private logger: Logger;
  private redis: Redis;
  private monitorInterval: number;
  private staleThreshold: number;
  private maxWarnings: number;
  private autoCleanup: boolean;
  private debug: boolean;

  // Monitoring state
  private monitorTimer: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  // Tracking consecutive warnings per coordinator
  private warningCounts: Map<string, number> = new Map();

  // Track coordinator health status
  private healthStatus: Map<string, CoordinatorHealth> = new Map();

  // Track last sequence numbers for continuity validation
  private lastSequences: Map<string, number> = new Map();

  // Statistics
  private stats = {
    totalMonitorCycles: 0,
    warningsIssued: 0,
    coordinatorsMarkedDead: 0,
    cleanupsPerformed: 0,
    continuityViolations: 0,
  };

  constructor(config: HeartbeatWarningConfig) {
    super();

    this.redis = config.redisClient;
    this.monitorInterval = config.monitorInterval ?? 10000; // 10 seconds
    this.staleThreshold = config.staleThreshold ?? 120000; // 120 seconds
    this.maxWarnings = config.maxWarnings ?? 3; // 3 consecutive warnings
    this.autoCleanup = config.autoCleanup ?? true;
    this.debug = config.debug ?? false;

    // Initialize logger
    const loggerConfig: LoggingConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error', format: 'json', destination: 'console' }
        : { level: this.debug ? 'debug' : 'info', format: 'json', destination: 'console' };

    this.logger = new Logger(loggerConfig, { component: 'HeartbeatWarningSystem' });

    this.logger.info('Heartbeat Warning System initialized', {
      monitorInterval: this.monitorInterval,
      staleThreshold: this.staleThreshold,
      maxWarnings: this.maxWarnings,
      autoCleanup: this.autoCleanup,
    });
  }

  /**
   * Start heartbeat monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.warn('Heartbeat monitoring already running');
      return;
    }

    this.isMonitoring = true;

    this.logger.info('Starting heartbeat monitoring', {
      interval: this.monitorInterval,
      staleThreshold: this.staleThreshold,
    });

    // Start monitoring loop
    this.monitorTimer = setInterval(() => {
      this.monitorHeartbeats().catch((error) => {
        this.logger.error('Heartbeat monitor cycle failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.monitorInterval);

    // Emit monitoring started event
    this.emit('monitoring:started', {
      interval: this.monitorInterval,
      threshold: this.staleThreshold,
    });
  }

  /**
   * Stop heartbeat monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      this.logger.warn('Heartbeat monitoring not running');
      return;
    }

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }

    this.isMonitoring = false;

    this.logger.info('Stopped heartbeat monitoring', {
      totalCycles: this.stats.totalMonitorCycles,
      warningsIssued: this.stats.warningsIssued,
      coordinatorsMarkedDead: this.stats.coordinatorsMarkedDead,
    });

    // Emit monitoring stopped event
    this.emit('monitoring:stopped', {
      statistics: this.getStatistics(),
    });
  }

  /**
   * Register heartbeat for a coordinator
   *
   * @param coordinatorId - Coordinator ID
   * @param iteration - Current iteration count
   * @param metadata - Optional metadata
   * @returns Heartbeat record
   */
  async registerHeartbeat(
    coordinatorId: string,
    iteration: number,
    metadata?: HeartbeatRecord['metadata']
  ): Promise<HeartbeatRecord> {
    const timestamp = Date.now();

    // Get current sequence (increment from last)
    const lastSequence = this.lastSequences.get(coordinatorId) ?? 0;
    const sequence = lastSequence + 1;

    const heartbeat: HeartbeatRecord = {
      coordinatorId,
      lastHeartbeat: timestamp,
      sequence,
      iteration,
      metadata,
    };

    // Store heartbeat in Redis with TTL
    const key = this.buildHeartbeatKey(coordinatorId);
    await this.redis.setex(key, 300, JSON.stringify(heartbeat)); // 5 min TTL

    // Update local tracking
    this.lastSequences.set(coordinatorId, sequence);

    // Reset warning count on successful heartbeat
    if (this.warningCounts.has(coordinatorId)) {
      this.warningCounts.set(coordinatorId, 0);
      this.healthStatus.set(coordinatorId, CoordinatorHealth.HEALTHY);
    }

    this.logger.debug('Heartbeat registered', {
      coordinatorId,
      sequence,
      iteration,
      timestamp,
    });

    return heartbeat;
  }

  /**
   * Get heartbeat for a coordinator
   *
   * @param coordinatorId - Coordinator ID
   * @returns Heartbeat record or null if not found
   */
  async getHeartbeat(coordinatorId: string): Promise<HeartbeatRecord | null> {
    const key = this.buildHeartbeatKey(coordinatorId);

    try {
      const heartbeatJson = await this.redis.get(key);

      if (!heartbeatJson) {
        return null;
      }

      const heartbeat: HeartbeatRecord = JSON.parse(heartbeatJson);

      return heartbeat;
    } catch (error) {
      this.logger.error('Failed to get heartbeat', {
        coordinatorId,
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
  }

  /**
   * Check heartbeat freshness for a coordinator
   *
   * @param coordinatorId - Coordinator ID
   * @returns Staleness duration in milliseconds, or null if no heartbeat
   */
  async checkHeartbeatFreshness(coordinatorId: string): Promise<number | null> {
    const heartbeat = await this.getHeartbeat(coordinatorId);

    if (!heartbeat) {
      return null;
    }

    const now = Date.now();
    const staleDuration = now - heartbeat.lastHeartbeat;

    return staleDuration;
  }

  /**
   * Get coordinator health status
   *
   * @param coordinatorId - Coordinator ID
   * @returns Health status
   */
  getHealthStatus(coordinatorId: string): CoordinatorHealth {
    return this.healthStatus.get(coordinatorId) ?? CoordinatorHealth.HEALTHY;
  }

  /**
   * Mark coordinator as dead and trigger cleanup
   *
   * @param coordinatorId - Coordinator ID
   * @param reason - Reason for marking as dead
   */
  async markCoordinatorDead(coordinatorId: string, reason: string): Promise<void> {
    this.logger.error('Marking coordinator as DEAD', {
      coordinatorId,
      reason,
      consecutiveWarnings: this.warningCounts.get(coordinatorId) ?? 0,
    });

    // Update health status
    this.healthStatus.set(coordinatorId, CoordinatorHealth.DEAD);
    this.stats.coordinatorsMarkedDead++;

    // Emit critical dead coordinator event
    const deadEvent = {
      coordinatorId,
      reason,
      consecutiveWarnings: this.warningCounts.get(coordinatorId) ?? 0,
      timestamp: Date.now(),
    };

    this.emit('coordinator:dead', deadEvent);

    // Perform automatic cleanup if enabled
    if (this.autoCleanup) {
      await this.cleanupDeadCoordinator(coordinatorId);
    }

    // Throw error for critical exit path
    const error = new Error(
      `CRITICAL: Coordinator ${coordinatorId} marked as DEAD - ${reason}. ` +
      `Consecutive warnings: ${this.warningCounts.get(coordinatorId) ?? 0}/${this.maxWarnings}`
    );
    error.name = 'DeadCoordinatorError';

    this.emit('error', error);
  }

  /**
   * Cleanup stale state for a dead coordinator
   *
   * Removes:
   * - Heartbeat records
   * - Signal ACKs (blocking:ack:coordinatorId:*)
   * - Signals (blocking:signal:coordinatorId)
   * - Idempotency records (blocking:idempotency:*coordinatorId*)
   *
   * @param coordinatorId - Coordinator ID
   */
  async cleanupDeadCoordinator(coordinatorId: string): Promise<void> {
    this.logger.info('Cleaning up dead coordinator state', { coordinatorId });

    try {
      const keysToDelete: string[] = [];

      // 1. Heartbeat key
      const heartbeatKey = this.buildHeartbeatKey(coordinatorId);
      keysToDelete.push(heartbeatKey);

      // 2. Signal ACK keys (blocking:ack:coordinatorId:*)
      const ackPattern = `blocking:ack:${coordinatorId}:*`;
      const ackKeys = await this.redis.keys(ackPattern);
      keysToDelete.push(...ackKeys);

      // 3. Signal key (blocking:signal:coordinatorId)
      const signalKey = `blocking:signal:${coordinatorId}`;
      keysToDelete.push(signalKey);

      // 4. Idempotency keys (blocking:idempotency:*coordinatorId*)
      const idempotencyPattern = `blocking:idempotency:*${coordinatorId}*`;
      const idempotencyKeys = await this.redis.keys(idempotencyPattern);
      keysToDelete.push(...idempotencyKeys);

      // Delete all keys in batch
      if (keysToDelete.length > 0) {
        await this.redis.del(keysToDelete);
      }

      this.stats.cleanupsPerformed++;

      this.logger.info('Dead coordinator cleanup complete', {
        coordinatorId,
        keysDeleted: keysToDelete.length,
        categories: {
          heartbeat: 1,
          acks: ackKeys.length,
          signals: 1,
          idempotency: idempotencyKeys.length,
        },
      });

      // Emit cleanup complete event
      this.emit('cleanup:complete', {
        coordinatorId,
        keysDeleted: keysToDelete.length,
        timestamp: Date.now(),
      });

    } catch (error) {
      this.logger.error('Cleanup failed for dead coordinator', {
        coordinatorId,
        error: error instanceof Error ? error.message : String(error),
      });

      this.emit('cleanup:failed', {
        coordinatorId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Validate heartbeat continuity (sequence numbers)
   *
   * @param coordinatorId - Coordinator ID
   * @param heartbeat - Heartbeat record
   * @returns True if sequence is valid, false if gap detected
   */
  validateHeartbeatContinuity(coordinatorId: string, heartbeat: HeartbeatRecord): boolean {
    const lastSequence = this.lastSequences.get(coordinatorId);

    if (lastSequence === undefined) {
      // First heartbeat for this coordinator
      return true;
    }

    const expectedSequence = lastSequence + 1;

    if (heartbeat.sequence !== expectedSequence) {
      this.logger.warn('Heartbeat sequence gap detected', {
        coordinatorId,
        expected: expectedSequence,
        received: heartbeat.sequence,
        gap: heartbeat.sequence - expectedSequence,
      });

      this.stats.continuityViolations++;

      this.emit('continuity:violation', {
        coordinatorId,
        expectedSequence,
        receivedSequence: heartbeat.sequence,
        gap: heartbeat.sequence - expectedSequence,
        timestamp: Date.now(),
      });

      return false;
    }

    return true;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      coordinatorsMonitored: this.healthStatus.size,
      deadCoordinators: Array.from(this.healthStatus.entries())
        .filter(([_, status]) => status === CoordinatorHealth.DEAD)
        .map(([id]) => id),
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      totalMonitorCycles: 0,
      warningsIssued: 0,
      coordinatorsMarkedDead: 0,
      cleanupsPerformed: 0,
      continuityViolations: 0,
    };
  }

  // ===== PRIVATE METHODS =====

  /**
   * Monitor heartbeats for all coordinators
   */
  private async monitorHeartbeats(): Promise<void> {
    this.stats.totalMonitorCycles++;

    const now = Date.now();

    this.logger.debug('Starting heartbeat monitor cycle', {
      cycle: this.stats.totalMonitorCycles,
      timestamp: now,
    });

    try {
      // Find all heartbeat keys
      const pattern = 'blocking:heartbeat:*';
      const keys = await this.redis.keys(pattern);

      this.logger.debug('Found heartbeat keys', {
        count: keys.length,
        keys,
      });

      for (const key of keys) {
        const coordinatorId = this.extractCoordinatorId(key);

        if (!coordinatorId) {
          continue;
        }

        // Skip if already marked as dead
        if (this.healthStatus.get(coordinatorId) === CoordinatorHealth.DEAD) {
          continue;
        }

        // Check heartbeat freshness
        const heartbeat = await this.getHeartbeat(coordinatorId);

        if (!heartbeat) {
          this.logger.warn('Heartbeat key exists but data missing', {
            coordinatorId,
            key,
          });
          continue;
        }

        // Validate heartbeat continuity
        this.validateHeartbeatContinuity(coordinatorId, heartbeat);

        const staleDuration = now - heartbeat.lastHeartbeat;

        // Check if heartbeat is stale
        if (staleDuration > this.staleThreshold) {
          await this.handleStaleHeartbeat(coordinatorId, staleDuration, heartbeat);
        } else {
          // Heartbeat is fresh - reset warning count if it was previously warned
          if (this.warningCounts.has(coordinatorId) && this.warningCounts.get(coordinatorId)! > 0) {
            this.logger.info('Coordinator recovered from warning state', {
              coordinatorId,
              previousWarnings: this.warningCounts.get(coordinatorId),
              staleDuration,
            });

            this.warningCounts.set(coordinatorId, 0);
            this.healthStatus.set(coordinatorId, CoordinatorHealth.HEALTHY);

            this.emit('coordinator:recovered', {
              coordinatorId,
              previousWarnings: this.warningCounts.get(coordinatorId),
              timestamp: now,
            });
          }
        }
      }

    } catch (error) {
      this.logger.error('Monitor heartbeats cycle failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle stale heartbeat detection
   */
  private async handleStaleHeartbeat(
    coordinatorId: string,
    staleDuration: number,
    heartbeat: HeartbeatRecord
  ): Promise<void> {
    // Increment warning count
    const currentWarnings = this.warningCounts.get(coordinatorId) ?? 0;
    const newWarnings = currentWarnings + 1;
    this.warningCounts.set(coordinatorId, newWarnings);

    // Determine health status
    let health: CoordinatorHealth;
    if (newWarnings >= this.maxWarnings) {
      health = CoordinatorHealth.DEAD;
    } else if (newWarnings >= 2) {
      health = CoordinatorHealth.CRITICAL;
    } else {
      health = CoordinatorHealth.WARNING;
    }

    this.healthStatus.set(coordinatorId, health);

    const warning: HeartbeatWarning = {
      coordinatorId,
      health,
      staleDuration,
      consecutiveWarnings: newWarnings,
      lastHeartbeat: heartbeat.lastHeartbeat,
      timestamp: Date.now(),
      reason: `Heartbeat stale for ${Math.round(staleDuration / 1000)}s (threshold: ${Math.round(this.staleThreshold / 1000)}s)`,
    };

    this.stats.warningsIssued++;

    this.logger.warn('Stale heartbeat detected', {
      coordinatorId,
      health,
      staleDuration,
      staleSeconds: Math.round(staleDuration / 1000),
      thresholdSeconds: Math.round(this.staleThreshold / 1000),
      consecutiveWarnings: newWarnings,
      maxWarnings: this.maxWarnings,
    });

    // Emit warning event
    this.emit('heartbeat:warning', warning);

    // If reached max warnings, mark as dead
    if (newWarnings >= this.maxWarnings) {
      await this.markCoordinatorDead(
        coordinatorId,
        `${newWarnings} consecutive warnings - heartbeat stale for ${Math.round(staleDuration / 1000)}s`
      );
    }
  }

  /**
   * Build Redis key for heartbeat
   */
  private buildHeartbeatKey(coordinatorId: string): string {
    return `blocking:heartbeat:${coordinatorId}`;
  }

  /**
   * Extract coordinator ID from heartbeat key
   */
  private extractCoordinatorId(key: string): string | null {
    const match = key.match(/^blocking:heartbeat:(.+)$/);
    return match ? match[1] : null;
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create a HeartbeatWarningSystem instance
 *
 * @param config - Configuration for heartbeat warning system
 * @returns Configured HeartbeatWarningSystem
 */
export function createHeartbeatWarningSystem(
  config: HeartbeatWarningConfig
): HeartbeatWarningSystem {
  return new HeartbeatWarningSystem(config);
}

// ===== EXPORTS =====

export default HeartbeatWarningSystem;
