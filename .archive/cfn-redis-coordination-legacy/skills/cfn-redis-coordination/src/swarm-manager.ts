/**
 * Swarm Manager
 *
 * Handles swarm lifecycle management, including completion and cancellation.
 *
 * Migrated from:
 * - complete-swarm.sh (75 lines)
 * - cancel-swarm.sh (221 lines)
 */

import type {
  TaskId,
  Logger
} from './types';
import {
  CoordinationError,
  CoordinationErrorType,
  isValidTaskId
} from './types';
import { RedisCoordinator } from './redis-client';

export interface SwarmMetadata {
  taskId: TaskId;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  completedAt?: string;
  reason?: string;
  metrics?: Record<string, unknown>;
}

export interface CancellationSignal {
  reason: string;
  timestamp: string;
  initiator: string;
}

export class SwarmManager {
  constructor(
    private redis: RedisCoordinator,
    private logger: Logger
  ) {}

  /**
   * Create swarm metadata on task start
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Stores in Redis
   */
  async createSwarm(taskId: TaskId, metadata?: Record<string, unknown>): Promise<void> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info(`Task Mode: Swarm metadata not stored (no Redis) - Task: ${taskId}`);
      return;
    }

    // CLI Mode: Store in Redis
    const key = `swarm:${taskId}:metadata`;
    const timestamp = new Date().toISOString();

    try {
      const data: Record<string, string> = {
        taskId,
        status: 'running',
        createdAt: timestamp
      };

      // Add any custom metadata
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          data[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
      }

      await this.redis.hset(key, ...Object.entries(data).flat());

      // Set TTL (24 hours)
      await this.redis.expire(key, 86400);

      this.logger.info(`✅ Swarm created: ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to create swarm', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to create swarm ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Complete swarm with final metrics
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Updates swarm status to completed
   */
  async completeSwarm(
    taskId: TaskId,
    finalMetrics?: Record<string, unknown>
  ): Promise<void> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info(`Task Mode: Swarm completion not recorded (no Redis) - Task: ${taskId}`);
      return;
    }

    // CLI Mode: Update status
    const key = `swarm:${taskId}:metadata`;
    const timestamp = new Date().toISOString();

    try {
      // Verify swarm exists
      const exists = await this.redis.exists(key);
      if (exists === 0) {
        this.logger.warn(`Swarm not found: ${taskId}`);
        // Still record completion even if metadata doesn't exist
      }

      // Update status
      const data: Record<string, string> = {
        status: 'completed',
        completedAt: timestamp
      };

      // Add final metrics
      if (finalMetrics) {
        for (const [k, v] of Object.entries(finalMetrics)) {
          data[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
      }

      await this.redis.hset(key, ...Object.entries(data).flat());

      this.logger.info(`✅ Swarm completed: ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to complete swarm', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to complete swarm ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Cancel swarm with graceful shutdown signal
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Broadcasts shutdown signal to all agents
   */
  async cancelSwarm(
    taskId: TaskId,
    reason: string = 'user_requested_cancellation',
    initiator: string = 'main-chat'
  ): Promise<void> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info(`Task Mode: Swarm cancellation signal skipped (no Redis) - Task: ${taskId}`);
      return;
    }

    // CLI Mode: Broadcast shutdown signal
    const timestamp = new Date().toISOString();

    try {
      // Broadcast shutdown signal to all agents
      const shutdownSignal = JSON.stringify({
        reason,
        timestamp,
        initiator
      });

      const shutdownKey = `swarm:${taskId}:shutdown`;
      await this.redis.set(shutdownKey, shutdownSignal);

      // Set TTL (agents have 5 minutes to see it)
      await this.redis.expire(shutdownKey, 300);

      // Update swarm metadata
      const metadataKey = `swarm:${taskId}:metadata`;
      await this.redis.hset(
        metadataKey,
        'status', 'cancelled',
        'cancelledAt', timestamp,
        'cancellationReason', reason,
        'cancelledBy', initiator
      );

      this.logger.info(`✅ Swarm cancellation signal broadcast: ${taskId}`);
      this.logger.info(`   Reason: ${reason}`);
      this.logger.info(`   Initiator: ${initiator}`);
    } catch (error) {
      this.logger.error('Failed to cancel swarm', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to cancel swarm ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get swarm status and metadata
   */
  async getSwarmStatus(taskId: TaskId): Promise<SwarmMetadata | null> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: No swarm metadata available in Redis');
      return null;
    }

    // CLI Mode: Retrieve from Redis
    const key = `swarm:${taskId}:metadata`;

    try {
      const data = await this.redis.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        this.logger.warn(`No swarm metadata found: ${taskId}`);
        return null;
      }

      const metadata: SwarmMetadata = {
        taskId,
        status: (data.status as any) || 'unknown',
        createdAt: data.createdAt || new Date().toISOString(),
        completedAt: data.completedAt,
        reason: data.reason,
        metrics: {}
      };

      // Extract metrics (all other fields)
      for (const [k, v] of Object.entries(data)) {
        if (!['taskId', 'status', 'createdAt', 'completedAt', 'reason'].includes(k)) {
          try {
            metadata.metrics![k] = JSON.parse(v);
          } catch {
            metadata.metrics![k] = v;
          }
        }
      }

      return metadata;
    } catch (error) {
      this.logger.error('Failed to get swarm status', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to get swarm status for ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Check if swarm is cancelled
   */
  async isSwarmCancelled(taskId: TaskId): Promise<boolean> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      return false;
    }

    // CLI Mode: Check shutdown signal
    try {
      const shutdownKey = `swarm:${taskId}:shutdown`;
      const signal = await this.redis.get(shutdownKey);

      if (signal) {
        const parsedSignal = JSON.parse(signal) as CancellationSignal;
        this.logger.warn(
          `🛑 Swarm cancelled: ${taskId} - Reason: ${parsedSignal.reason} (by ${parsedSignal.initiator})`
        );
        return true;
      }

      return false;
    } catch (error) {
      // If Redis fails, assume not cancelled
      this.logger.error('Failed to check swarm cancellation status', error as Error);
      return false;
    }
  }

  /**
   * Get shutdown signal for a swarm
   */
  async getShutdownSignal(taskId: TaskId): Promise<CancellationSignal | null> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      return null;
    }

    // CLI Mode: Retrieve signal
    try {
      const shutdownKey = `swarm:${taskId}:shutdown`;
      const signal = await this.redis.get(shutdownKey);

      if (signal) {
        return JSON.parse(signal) as CancellationSignal;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get shutdown signal', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to get shutdown signal for ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Record swarm metrics
   */
  async recordMetrics(
    taskId: TaskId,
    metrics: Record<string, unknown>
  ): Promise<void> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Swarm metrics not recorded (no Redis)');
      return;
    }

    // CLI Mode: Store metrics
    const key = `swarm:${taskId}:metrics`;
    const timestamp = new Date().toISOString();

    try {
      const data: Record<string, string> = {
        timestamp
      };

      // Convert metrics to strings
      for (const [k, v] of Object.entries(metrics)) {
        data[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }

      await this.redis.hset(key, ...Object.entries(data).flat());

      // Set TTL (24 hours)
      await this.redis.expire(key, 86400);

      this.logger.info(`✅ Swarm metrics recorded for: ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to record metrics', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to record metrics for ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get swarm metrics
   */
  async getMetrics(taskId: TaskId): Promise<Record<string, unknown> | null> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      return null;
    }

    // CLI Mode: Retrieve from Redis
    const key = `swarm:${taskId}:metrics`;

    try {
      const data = await this.redis.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        this.logger.warn(`No metrics found: ${taskId}`);
        return null;
      }

      const metrics: Record<string, unknown> = {};

      // Parse JSON fields
      for (const [k, v] of Object.entries(data)) {
        if (k !== 'timestamp') {
          try {
            metrics[k] = JSON.parse(v);
          } catch {
            metrics[k] = v;
          }
        }
      }

      return metrics;
    } catch (error) {
      this.logger.error('Failed to get metrics', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to retrieve metrics for ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Clean up all swarm data
   */
  async cleanupSwarm(taskId: TaskId): Promise<void> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Swarm cleanup skipped');
      return;
    }

    // CLI Mode: Delete all swarm keys
    try {
      const keys = [
        `swarm:${taskId}:metadata`,
        `swarm:${taskId}:metrics`,
        `swarm:${taskId}:shutdown`,
        `swarm:${taskId}:completed_agents`
      ];

      await this.redis.del(...keys);

      this.logger.info(`✅ Swarm data cleaned up: ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to cleanup swarm', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to cleanup swarm ${taskId}: ${(error as Error).message}`
      );
    }
  }
}
