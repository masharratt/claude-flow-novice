/**
 * Coordinator Timeout Handler - Sprint 1.4: Extended Timeout Testing
 *
 * Detects coordinator timeouts and triggers comprehensive state cleanup.
 * Integrates with HeartbeatWarningSystem's cleanup infrastructure.
 *
 * Features:
 * - Timeout detection based on configurable threshold
 * - Automatic state cleanup (heartbeat, ACKs, signals, idempotency)
 * - Event emission for timeout notifications
 * - Metrics tracking (timeout_events_total)
 * - Reuses existing cleanup logic from HeartbeatWarningSystem
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.4 - Extended Timeout Testing - State Cleanup
 *
 * @module cfn-loop/coordinator-timeout-handler
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import type { Redis } from 'ioredis';
import type { LoggingConfig } from '../utils/types.js';
import type { HeartbeatWarningSystem } from './heartbeat-warning-system.js';
import { NamespaceSanitizer } from '../utils/namespace-sanitizer.js';
import {
  heartbeatFailuresTotal,
  timeoutEventsTotal
} from '../observability/prometheus-metrics.js';

// ===== TYPE DEFINITIONS =====

/**
 * Timeout event data
 */
export interface CoordinatorTimeoutEvent {
  /** Coordinator ID that timed out */
  coordinatorId: string;
  /** Duration since last activity (ms) */
  timeoutDuration: number;
  /** Timestamp when timeout was detected */
  timestamp: number;
  /** Reason for timeout */
  reason: string;
  /** Optional metadata */
  metadata?: {
    lastHeartbeat?: number;
    iteration?: number;
    phase?: string;
  };
}

/**
 * Configuration for coordinator timeout handler
 */
export interface CoordinatorTimeoutConfig {
  /** Redis client instance (ioredis) */
  redisClient: Redis;
  /** Timeout threshold in milliseconds (default: 300000 = 5 minutes) */
  timeoutThreshold?: number;
  /** Check interval in milliseconds (default: 30000 = 30s) */
  checkInterval?: number;
  /** Optional HeartbeatWarningSystem for cleanup integration */
  heartbeatSystem?: HeartbeatWarningSystem;
  /** Enable automatic cleanup on timeout (default: true) */
  autoCleanup?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Coordinator activity record
 */
interface CoordinatorActivity {
  coordinatorId: string;
  lastActivity: number;
  iteration: number;
  phase?: string;
}

// ===== COORDINATOR TIMEOUT HANDLER =====

/**
 * Manages coordinator timeout detection and cleanup
 */
export class CoordinatorTimeoutHandler extends EventEmitter {
  private logger: Logger;
  private redis: Redis;
  private timeoutThreshold: number;
  private checkInterval: number;
  private heartbeatSystem?: HeartbeatWarningSystem;
  private autoCleanup: boolean;
  private debug: boolean;

  // Monitoring state
  private checkTimer: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  // Metrics
  private metrics = {
    totalChecks: 0,
    timeoutEventsTotal: 0,
    cleanupsPerformed: 0,
    cleanupFailures: 0,
  };

  constructor(config: CoordinatorTimeoutConfig) {
    super();

    this.redis = config.redisClient;
    this.timeoutThreshold = config.timeoutThreshold ?? 300000; // 5 minutes
    this.checkInterval = config.checkInterval ?? 30000; // 30 seconds
    this.heartbeatSystem = config.heartbeatSystem;
    this.autoCleanup = config.autoCleanup ?? true;
    this.debug = config.debug ?? false;

    // Initialize logger
    const loggerConfig: LoggingConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error', format: 'json', destination: 'console' }
        : { level: this.debug ? 'debug' : 'info', format: 'json', destination: 'console' };

    this.logger = new Logger(loggerConfig, { component: 'CoordinatorTimeoutHandler' });

    this.logger.info('Coordinator Timeout Handler initialized', {
      timeoutThreshold: this.timeoutThreshold,
      checkInterval: this.checkInterval,
      autoCleanup: this.autoCleanup,
      hasHeartbeatSystem: !!this.heartbeatSystem,
    });
  }

  /**
   * Non-blocking Redis SCAN operation to replace KEYS
   *
   * SEC-HIGH-001 FIX: Uses cursor-based iteration instead of blocking KEYS command.
   * Prevents DoS attacks in production environments with large key sets.
   *
   * @param {string} pattern - Redis key pattern to match
   * @returns {Promise<string[]>} Matching keys
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Start timeout monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.warn('Timeout monitoring already running');
      return;
    }

    this.isMonitoring = true;

    this.logger.info('Starting coordinator timeout monitoring', {
      checkInterval: this.checkInterval,
      timeoutThreshold: this.timeoutThreshold,
    });

    // Start monitoring loop
    this.checkTimer = setInterval(() => {
      this.checkForTimeouts().catch((error) => {
        this.logger.error('Timeout check cycle failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.checkInterval);

    // Emit monitoring started event
    this.emit('monitoring:started', {
      checkInterval: this.checkInterval,
      timeoutThreshold: this.timeoutThreshold,
    });
  }

  /**
   * Stop timeout monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      this.logger.warn('Timeout monitoring not running');
      return;
    }

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.isMonitoring = false;

    this.logger.info('Stopped timeout monitoring', {
      totalChecks: this.metrics.totalChecks,
      timeoutEventsTotal: this.metrics.timeoutEventsTotal,
      cleanupsPerformed: this.metrics.cleanupsPerformed,
    });

    // Emit monitoring stopped event
    this.emit('monitoring:stopped', {
      metrics: this.getMetrics(),
    });
  }

  /**
   * Manually trigger timeout detection for a specific coordinator
   *
   * @param coordinatorId - Coordinator ID to check
   * @param currentTime - Current timestamp (defaults to Date.now())
   * @returns True if timeout detected and handled
   */
  async checkCoordinatorTimeout(
    coordinatorId: string,
    currentTime: number = Date.now()
  ): Promise<boolean> {
    // SEC-HIGH-002 FIX: Sanitize coordinatorId to prevent Redis key injection
    const sanitizedId = NamespaceSanitizer.sanitizeId(coordinatorId);

    this.logger.debug('Checking coordinator timeout', {
      coordinatorId, // Original for logging
      sanitizedId,   // Sanitized for security
      currentTime,
    });

    const activity = await this.getCoordinatorActivity(sanitizedId);

    if (!activity) {
      this.logger.debug('No activity record found for coordinator', {
        coordinatorId,
      });
      return false;
    }

    const timeoutDuration = currentTime - activity.lastActivity;

    if (timeoutDuration > this.timeoutThreshold) {
      // PROMETHEUS METRIC: Increment heartbeat failure counter for stale heartbeat
      heartbeatFailuresTotal.labels(sanitizedId, 'stale').inc();

      this.logger.warn('Coordinator timeout detected', {
        coordinatorId,
        sanitizedId,
        timeoutDuration,
        threshold: this.timeoutThreshold,
        lastActivity: activity.lastActivity,
      });

      // Trigger timeout handling with sanitized ID
      await this.handleTimeout(sanitizedId, timeoutDuration, activity);
      return true;
    }

    return false;
  }

  /**
   * Handle coordinator timeout
   *
   * @param coordinatorId - Coordinator ID that timed out
   * @param timeoutDuration - Duration since last activity (ms)
   * @param activity - Coordinator activity record
   */
  private async handleTimeout(
    coordinatorId: string,
    timeoutDuration: number,
    activity: CoordinatorActivity
  ): Promise<void> {
    this.metrics.timeoutEventsTotal++;

    // PROMETHEUS METRIC: Increment timeout event counter
    timeoutEventsTotal.labels(coordinatorId, 'heartbeat').inc();

    const timeoutEvent: CoordinatorTimeoutEvent = {
      coordinatorId,
      timeoutDuration,
      timestamp: Date.now(),
      reason: `Coordinator inactive for ${Math.round(timeoutDuration / 1000)}s (threshold: ${Math.round(this.timeoutThreshold / 1000)}s)`,
      metadata: {
        lastHeartbeat: activity.lastActivity,
        iteration: activity.iteration,
        phase: activity.phase,
      },
    };

    this.logger.error('Coordinator timeout event', {
      coordinatorId,
      timeoutDuration,
      timeoutSeconds: Math.round(timeoutDuration / 1000),
      thresholdSeconds: Math.round(this.timeoutThreshold / 1000),
      metadata: timeoutEvent.metadata,
    });

    // Emit timeout event
    this.emit('coordinator:timeout', timeoutEvent);

    // Perform cleanup if enabled
    if (this.autoCleanup) {
      await this.cleanupTimeoutCoordinator(coordinatorId);
    }
  }

  /**
   * Cleanup state for timed-out coordinator
   *
   * Delegates to HeartbeatWarningSystem if available, otherwise performs direct cleanup.
   * Removes:
   * - Heartbeat records
   * - Signal ACKs (blocking:ack:coordinatorId:*)
   * - Signals (blocking:signal:coordinatorId)
   * - Idempotency records (blocking:idempotency:*coordinatorId*)
   * - Activity tracking (coordinator:activity:coordinatorId)
   *
   * @param coordinatorId - Coordinator ID to cleanup
   */
  async cleanupTimeoutCoordinator(coordinatorId: string): Promise<void> {
    // SEC-HIGH-002 FIX: Sanitize coordinatorId to prevent Redis key injection
    const sanitizedId = NamespaceSanitizer.sanitizeId(coordinatorId);

    this.logger.info('Cleaning up timed-out coordinator state', {
      coordinatorId, // Original for logging
      sanitizedId,   // Sanitized for security
      delegateToHeartbeatSystem: !!this.heartbeatSystem,
    });

    try {
      // Delegate to HeartbeatWarningSystem if available
      if (this.heartbeatSystem) {
        this.logger.debug('Delegating cleanup to HeartbeatWarningSystem', {
          coordinatorId,
          sanitizedId,
        });

        // HeartbeatWarningSystem handles its own sanitization
        await this.heartbeatSystem.cleanupDeadCoordinator(sanitizedId);

        this.metrics.cleanupsPerformed++;

        this.logger.info('Cleanup delegated to HeartbeatWarningSystem successfully', {
          coordinatorId,
          sanitizedId,
        });
      } else {
        // Perform direct cleanup if no HeartbeatWarningSystem
        await this.performDirectCleanup(sanitizedId);
      }

      // Emit cleanup complete event
      this.emit('cleanup:complete', {
        coordinatorId,
        timestamp: Date.now(),
      });

    } catch (error) {
      this.metrics.cleanupFailures++;

      this.logger.error('Cleanup failed for timed-out coordinator', {
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
   * Perform direct cleanup without HeartbeatWarningSystem
   *
   * @param coordinatorId - Coordinator ID to cleanup (should already be sanitized)
   */
  private async performDirectCleanup(coordinatorId: string): Promise<void> {
    this.logger.debug('Performing direct cleanup', { coordinatorId });

    const keysToDelete: string[] = [];

    // 1. Heartbeat key
    const heartbeatKey = `blocking:heartbeat:${coordinatorId}`;
    keysToDelete.push(heartbeatKey);

    // 2. Signal ACK keys (blocking:ack:coordinatorId:*)
    // SEC-HIGH-001 FIX: Replace redis.keys() with scanKeys()
    const ackPattern = `blocking:ack:${coordinatorId}:*`;
    const ackKeys = await this.scanKeys(ackPattern);
    keysToDelete.push(...ackKeys);

    // 3. Signal key (blocking:signal:coordinatorId)
    const signalKey = `blocking:signal:${coordinatorId}`;
    keysToDelete.push(signalKey);

    // 4. Idempotency keys (blocking:idempotency:*coordinatorId*)
    // SEC-HIGH-001 FIX: Replace redis.keys() with scanKeys()
    const idempotencyPattern = `blocking:idempotency:*${coordinatorId}*`;
    const idempotencyKeys = await this.scanKeys(idempotencyPattern);
    keysToDelete.push(...idempotencyKeys);

    // 5. Activity tracking key
    const activityKey = `coordinator:activity:${coordinatorId}`;
    keysToDelete.push(activityKey);

    // Delete all keys in batch
    if (keysToDelete.length > 0) {
      await this.redis.del(keysToDelete);
    }

    this.metrics.cleanupsPerformed++;

    this.logger.info('Direct cleanup complete', {
      coordinatorId,
      keysDeleted: keysToDelete.length,
      categories: {
        heartbeat: 1,
        acks: ackKeys.length,
        signals: 1,
        idempotency: idempotencyKeys.length,
        activity: 1,
      },
    });
  }

  /**
   * Record coordinator activity
   *
   * @param coordinatorId - Coordinator ID
   * @param iteration - Current iteration count
   * @param phase - Optional phase information
   */
  async recordActivity(
    coordinatorId: string,
    iteration: number,
    phase?: string
  ): Promise<void> {
    // SEC-HIGH-002 FIX: Sanitize coordinatorId to prevent Redis key injection
    const sanitizedId = NamespaceSanitizer.sanitizeId(coordinatorId);

    const activity: CoordinatorActivity = {
      coordinatorId: sanitizedId, // Store sanitized ID
      lastActivity: Date.now(),
      iteration,
      phase,
    };

    const key = `coordinator:activity:${sanitizedId}`;
    await this.redis.setex(key, 600, JSON.stringify(activity)); // 10 min TTL

    this.logger.debug('Recorded coordinator activity', {
      coordinatorId, // Original for logging
      sanitizedId,   // Sanitized for security
      iteration,
      phase,
    });
  }

  /**
   * Get coordinator activity record
   *
   * @param coordinatorId - Coordinator ID (should already be sanitized by caller)
   * @returns Activity record or null if not found
   */
  private async getCoordinatorActivity(
    coordinatorId: string
  ): Promise<CoordinatorActivity | null> {
    // Note: coordinatorId should already be sanitized by public method callers
    // This is a private method, so we trust the sanitized input from public methods
    const key = `coordinator:activity:${coordinatorId}`;

    try {
      const activityJson = await this.redis.get(key);

      if (!activityJson) {
        return null;
      }

      const activity: CoordinatorActivity = JSON.parse(activityJson);
      return activity;
    } catch (error) {
      this.logger.error('Failed to get coordinator activity', {
        coordinatorId,
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
  }

  /**
   * Check for timeouts across all coordinators
   */
  private async checkForTimeouts(): Promise<void> {
    this.metrics.totalChecks++;

    const now = Date.now();

    this.logger.debug('Starting timeout check cycle', {
      cycle: this.metrics.totalChecks,
      timestamp: now,
    });

    try {
      // Find all activity keys
      // SEC-HIGH-001 FIX: Replace redis.keys() with scanKeys()
      const pattern = 'coordinator:activity:*';
      const keys = await this.scanKeys(pattern);

      this.logger.debug('Found activity keys', {
        count: keys.length,
        keys,
      });

      for (const key of keys) {
        const coordinatorId = this.extractCoordinatorId(key);

        if (!coordinatorId) {
          continue;
        }

        // Check for timeout
        // Note: checkCoordinatorTimeout() will sanitize the ID internally
        await this.checkCoordinatorTimeout(coordinatorId, now);
      }

    } catch (error) {
      this.logger.error('Timeout check cycle failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Extract coordinator ID from activity key
   */
  private extractCoordinatorId(key: string): string | null {
    const match = key.match(/^coordinator:activity:(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Escalate dead coordinator to parent or swarm manager
   *
   * Sprint 3.2: Auto-Recovery Mechanisms
   *
   * When a coordinator is detected as dead (timed out), this method:
   * 1. Notifies the parent coordinator or swarm manager
   * 2. Spawns a NEW coordinator to replace the dead one
   * 3. Transfers incomplete work to the new coordinator
   * 4. Logs the escalation event to Redis
   *
   * @param coordinatorId - Dead coordinator ID
   * @param swarmId - Swarm ID that the coordinator belonged to
   * @returns New coordinator ID if spawned, null if escalation failed
   */
  async escalateDeadCoordinator(
    coordinatorId: string,
    swarmId: string
  ): Promise<string | null> {
    // SEC-HIGH-002 FIX: Sanitize IDs to prevent Redis key injection
    const sanitizedCoordinatorId = NamespaceSanitizer.sanitizeId(coordinatorId);
    const sanitizedSwarmId = NamespaceSanitizer.sanitizeId(swarmId);

    this.logger.warn('Escalating dead coordinator', {
      coordinatorId, // Original for logging
      sanitizedCoordinatorId,
      swarmId,
      sanitizedSwarmId,
    });

    try {
      // 1. Create escalation record in Redis
      const escalationKey = `coordinator:escalation:${sanitizedCoordinatorId}`;
      const escalationData = {
        deadCoordinatorId: sanitizedCoordinatorId,
        swarmId: sanitizedSwarmId,
        timestamp: Date.now(),
        reason: 'coordinator_timeout',
        status: 'escalated',
      };

      await this.redis.setex(escalationKey, 3600, JSON.stringify(escalationData));

      this.logger.info('Escalation record created', {
        coordinatorId,
        swarmId,
        escalationKey,
      });

      // 2. Notify parent coordinator or swarm manager
      const parentNotificationKey = `swarm:${sanitizedSwarmId}:coordinator:dead`;
      await this.redis.publish(parentNotificationKey, JSON.stringify({
        deadCoordinatorId: sanitizedCoordinatorId,
        swarmId: sanitizedSwarmId,
        timestamp: Date.now(),
        action: 'spawn_replacement',
      }));

      this.logger.info('Notified parent coordinator', {
        coordinatorId,
        swarmId,
        notificationChannel: parentNotificationKey,
      });

      // 3. Generate new coordinator ID
      const newCoordinatorId = `coordinator-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // 4. Create spawn request for new coordinator
      const spawnRequestKey = `coordinator:spawn:${newCoordinatorId}`;
      const spawnRequest = {
        newCoordinatorId,
        replacesCoordinatorId: sanitizedCoordinatorId,
        swarmId: sanitizedSwarmId,
        timestamp: Date.now(),
        status: 'pending',
        priority: 'high', // Dead coordinator replacement is high priority
      };

      await this.redis.setex(spawnRequestKey, 3600, JSON.stringify(spawnRequest));

      this.logger.info('Spawn request created for new coordinator', {
        newCoordinatorId,
        replacesCoordinatorId: coordinatorId,
        swarmId,
      });

      // 5. Transfer incomplete work (if any exists)
      await this.transferIncompleteWork(sanitizedCoordinatorId, newCoordinatorId, sanitizedSwarmId);

      // 6. Emit escalation event
      this.emit('coordinator:escalated', {
        deadCoordinatorId: sanitizedCoordinatorId,
        newCoordinatorId,
        swarmId: sanitizedSwarmId,
        timestamp: Date.now(),
      });

      this.logger.info('Dead coordinator escalation complete', {
        deadCoordinatorId: coordinatorId,
        newCoordinatorId,
        swarmId,
      });

      return newCoordinatorId;

    } catch (error) {
      this.logger.error('Failed to escalate dead coordinator', {
        coordinatorId,
        swarmId,
        error: error instanceof Error ? error.message : String(error),
      });

      this.emit('escalation:failed', {
        coordinatorId: sanitizedCoordinatorId,
        swarmId: sanitizedSwarmId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });

      return null;
    }
  }

  /**
   * Transfer incomplete work from dead coordinator to new coordinator
   *
   * @param deadCoordinatorId - Dead coordinator ID (should be sanitized)
   * @param newCoordinatorId - New coordinator ID
   * @param swarmId - Swarm ID (should be sanitized)
   */
  private async transferIncompleteWork(
    deadCoordinatorId: string,
    newCoordinatorId: string,
    swarmId: string
  ): Promise<void> {
    this.logger.debug('Transferring incomplete work', {
      from: deadCoordinatorId,
      to: newCoordinatorId,
      swarmId,
    });

    try {
      // Find incomplete work items for the dead coordinator
      // Pattern: coordinator:work:{swarmId}:{coordinatorId}:*
      const workPattern = `coordinator:work:${swarmId}:${deadCoordinatorId}:*`;
      const workKeys = await this.scanKeys(workPattern);

      if (workKeys.length === 0) {
        this.logger.debug('No incomplete work to transfer', {
          deadCoordinatorId,
        });
        return;
      }

      this.logger.info('Found incomplete work items to transfer', {
        count: workKeys.length,
        from: deadCoordinatorId,
        to: newCoordinatorId,
      });

      // Transfer each work item
      for (const workKey of workKeys) {
        const workData = await this.redis.get(workKey);

        if (!workData) {
          continue;
        }

        // Parse work item
        const work = JSON.parse(workData);

        // Create new work key for the new coordinator
        const newWorkKey = workKey.replace(
          `coordinator:work:${swarmId}:${deadCoordinatorId}:`,
          `coordinator:work:${swarmId}:${newCoordinatorId}:`
        );

        // Update work item with transfer metadata
        const updatedWork = {
          ...work,
          transferredFrom: deadCoordinatorId,
          transferredAt: Date.now(),
          assignedTo: newCoordinatorId,
          status: 'transferred',
        };

        // Store in new location with 1-hour TTL
        await this.redis.setex(newWorkKey, 3600, JSON.stringify(updatedWork));

        // Delete old work item
        await this.redis.del(workKey);

        this.logger.debug('Transferred work item', {
          from: workKey,
          to: newWorkKey,
          workId: work.workId || 'unknown',
        });
      }

      this.logger.info('Work transfer complete', {
        itemsTransferred: workKeys.length,
        from: deadCoordinatorId,
        to: newCoordinatorId,
      });

    } catch (error) {
      this.logger.error('Failed to transfer incomplete work', {
        deadCoordinatorId,
        newCoordinatorId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Non-fatal - new coordinator can pick up work from shared queue
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalChecks: 0,
      timeoutEventsTotal: 0,
      cleanupsPerformed: 0,
      cleanupFailures: 0,
    };
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create a CoordinatorTimeoutHandler instance
 *
 * @param config - Configuration for timeout handler
 * @returns Configured CoordinatorTimeoutHandler
 */
export function createCoordinatorTimeoutHandler(
  config: CoordinatorTimeoutConfig
): CoordinatorTimeoutHandler {
  return new CoordinatorTimeoutHandler(config);
}

// ===== EXPORTS =====

export default CoordinatorTimeoutHandler;
