/**
 * Agent Recovery Manager
 *
 * Handles agent health checks, stuck agent detection, and recovery mechanisms.
 *
 * Migrated from:
 * - agent-recovery.sh (74 lines)
 */

import type {
  TaskId,
  AgentId,
  Logger
} from './types';
import {
  CoordinationError,
  CoordinationErrorType,
  isValidTaskId,
  isValidAgentId
} from './types';
import { RedisCoordinator } from './redis-client';

export interface AgentHealth {
  agentId: AgentId;
  taskId: TaskId;
  status: 'healthy' | 'stuck' | 'dead' | 'unknown';
  lastHeartbeat?: string;
  processPid?: number;
  stuckFor?: number; // milliseconds
  reason?: string;
}

export class AgentRecoveryManager {
  private readonly HEARTBEAT_TIMEOUT_MS = 60000; // 60 seconds
  private readonly STUCK_THRESHOLD_MS = 300000; // 5 minutes

  constructor(
    private redis: RedisCoordinator,
    private logger: Logger
  ) {}

  /**
   * Record agent heartbeat to indicate it's still alive
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Updates heartbeat timestamp in Redis
   */
  async recordHeartbeat(
    taskId: TaskId,
    agentId: AgentId,
    processPid?: number,
    namespace: string = 'swarm'
  ): Promise<void> {
    // Validate inputs
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!isValidAgentId(agentId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid agent ID: ${agentId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      return;
    }

    // CLI Mode: Update heartbeat
    const key = `${namespace}:${taskId}:${agentId}:heartbeat`;
    const timestamp = new Date().toISOString();

    try {
      const data: Record<string, string> = {
        timestamp,
        lastSeen: new Date().getTime().toString()
      };

      if (processPid) {
        data.processPid = String(processPid);
      }

      await this.redis.hset(key, ...Object.entries(data).flat());

      // Set TTL to 2 minutes (longer than heartbeat timeout)
      await this.redis.expire(key, 120);
    } catch (error) {
      // Non-fatal: heartbeat failure shouldn't crash agent
      this.logger.warn('Failed to record heartbeat');
    }
  }

  /**
   * Check agent health status
   *
   * In Task Mode: Returns 'healthy'
   * In CLI Mode: Checks heartbeat freshness
   */
  async checkAgentHealth(
    taskId: TaskId,
    agentId: AgentId,
    namespace: string = 'swarm'
  ): Promise<AgentHealth> {
    // Validate inputs
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!isValidAgentId(agentId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid agent ID: ${agentId}`
      );
    }

    const baseHealth: AgentHealth = {
      agentId,
      taskId,
      status: 'unknown'
    };

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      baseHealth.status = 'healthy';
      baseHealth.reason = 'Task Mode: Always healthy';
      return baseHealth;
    }

    // CLI Mode: Check heartbeat
    const key = `${namespace}:${taskId}:${agentId}:heartbeat`;

    try {
      const data = await this.redis.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        baseHealth.status = 'dead';
        baseHealth.reason = 'No heartbeat found';
        return baseHealth;
      }

      const lastSeenStr = data.lastSeen;
      if (!lastSeenStr) {
        baseHealth.status = 'unknown';
        baseHealth.reason = 'Invalid heartbeat data';
        return baseHealth;
      }

      const lastSeen = parseInt(lastSeenStr, 10);
      const now = new Date().getTime();
      const timeSinceLastHeartbeat = now - lastSeen;

      baseHealth.lastHeartbeat = data.timestamp;
      baseHealth.processPid = data.processPid ? parseInt(data.processPid, 10) : undefined;

      if (timeSinceLastHeartbeat > this.STUCK_THRESHOLD_MS) {
        baseHealth.status = 'stuck';
        baseHealth.stuckFor = timeSinceLastHeartbeat;
        baseHealth.reason = `No heartbeat for ${Math.round(timeSinceLastHeartbeat / 1000)}s`;
      } else if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT_MS) {
        baseHealth.status = 'dead';
        baseHealth.reason = `Heartbeat timeout (${Math.round(timeSinceLastHeartbeat / 1000)}s)`;
      } else {
        baseHealth.status = 'healthy';
        baseHealth.reason = `Healthy (last beat ${Math.round(timeSinceLastHeartbeat / 1000)}s ago)`;
      }

      return baseHealth;
    } catch (error) {
      this.logger.error('Failed to check agent health', error as Error);
      baseHealth.status = 'unknown';
      baseHealth.reason = `Error checking health: ${(error as Error).message}`;
      return baseHealth;
    }
  }

  /**
   * Detect all stuck agents for a task
   */
  async detectStuckAgents(
    taskId: TaskId,
    agentIds: AgentId[],
    namespace: string = 'swarm'
  ): Promise<AgentHealth[]> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    const stuckAgents: AgentHealth[] = [];

    try {
      for (const agentId of agentIds) {
        const health = await this.checkAgentHealth(taskId, agentId, namespace);

        if (health.status === 'stuck' || health.status === 'dead') {
          stuckAgents.push(health);
          this.logger.warn(
            `🚨 Stuck agent detected: ${agentId} - Status: ${health.status}, Stuck for: ${health.stuckFor}ms`
          );
        }
      }

      if (stuckAgents.length > 0) {
        this.logger.warn(`⚠️ Found ${stuckAgents.length} stuck agents`);
      }

      return stuckAgents;
    } catch (error) {
      this.logger.error('Failed to detect stuck agents', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to detect stuck agents: ${(error as Error).message}`
      );
    }
  }

  /**
   * Mark agent for recovery
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Records recovery marker in Redis
   */
  async markForRecovery(
    taskId: TaskId,
    agentId: AgentId,
    mode: 'soft' | 'hard' = 'soft',
    namespace: string = 'swarm'
  ): Promise<void> {
    // Validate inputs
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!isValidAgentId(agentId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid agent ID: ${agentId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info(`Task Mode: Agent recovery marker not stored (no Redis) - Agent: ${agentId}`);
      return;
    }

    // CLI Mode: Mark in Redis
    const key = `${namespace}:${taskId}:${agentId}:recovery`;
    const timestamp = new Date().toISOString();

    try {
      await this.redis.hset(
        key,
        'mode', mode,
        'markedAt', timestamp,
        'status', 'pending'
      );

      // Set TTL (1 hour)
      await this.redis.expire(key, 3600);

      this.logger.info(`✅ Agent marked for ${mode} recovery: ${agentId}`);
    } catch (error) {
      this.logger.error('Failed to mark for recovery', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to mark agent for recovery: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get recovery markers for agents
   */
  async getRecoveryMarkers(
    taskId: TaskId,
    agentIds: AgentId[],
    namespace: string = 'swarm'
  ): Promise<Array<{ agentId: AgentId; mode: string; markedAt: string }>> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      return [];
    }

    // CLI Mode: Retrieve markers
    const markers: Array<{ agentId: AgentId; mode: string; markedAt: string }> = [];

    try {
      for (const agentId of agentIds) {
        const key = `${namespace}:${taskId}:${agentId}:recovery`;
        const data = await this.redis.hgetall(key);

        if (data && Object.keys(data).length > 0 && data.status === 'pending') {
          markers.push({
            agentId,
            mode: data.mode || 'soft',
            markedAt: data.markedAt || new Date().toISOString()
          });
        }
      }

      return markers;
    } catch (error) {
      this.logger.error('Failed to get recovery markers', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to get recovery markers: ${(error as Error).message}`
      );
    }
  }

  /**
   * Clear recovery marker after recovery is complete
   */
  async clearRecoveryMarker(
    taskId: TaskId,
    agentId: AgentId,
    namespace: string = 'swarm'
  ): Promise<void> {
    // Validate inputs
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!isValidAgentId(agentId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid agent ID: ${agentId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Recovery marker cleanup skipped');
      return;
    }

    // CLI Mode: Delete marker
    try {
      const keys = [
        `${namespace}:${taskId}:${agentId}:recovery`,
        `${namespace}:${taskId}:${agentId}:heartbeat`
      ];

      await this.redis.del(...keys);

      this.logger.info(`✅ Recovery marker cleared: ${agentId}`);
    } catch (error) {
      this.logger.error('Failed to clear recovery marker', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to clear recovery marker: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get overall swarm health summary
   */
  async getSwarmHealth(
    taskId: TaskId,
    agentIds: AgentId[],
    namespace: string = 'swarm'
  ): Promise<{
    healthy: number;
    stuck: number;
    dead: number;
    unknown: number;
    summary: string;
  }> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    const health = {
      healthy: 0,
      stuck: 0,
      dead: 0,
      unknown: 0,
      summary: ''
    };

    try {
      for (const agentId of agentIds) {
        const agentHealth = await this.checkAgentHealth(taskId, agentId, namespace);

        switch (agentHealth.status) {
          case 'healthy':
            health.healthy++;
            break;
          case 'stuck':
            health.stuck++;
            break;
          case 'dead':
            health.dead++;
            break;
          case 'unknown':
            health.unknown++;
            break;
        }
      }

      const total = agentIds.length;
      health.summary = (
        `Swarm Health: ${health.healthy}/${total} healthy, ` +
        `${health.stuck} stuck, ${health.dead} dead, ${health.unknown} unknown`
      );

      if (health.stuck > 0 || health.dead > 0) {
        this.logger.warn(health.summary);
      } else {
        this.logger.info(health.summary);
      }

      return health;
    } catch (error) {
      this.logger.error('Failed to get swarm health', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to get swarm health: ${(error as Error).message}`
      );
    }
  }
}
