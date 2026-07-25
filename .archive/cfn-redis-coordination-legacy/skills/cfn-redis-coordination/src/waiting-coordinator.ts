/**
 * Waiting Coordinator
 *
 * Handles blocking coordination using Redis BLPOP for agents to wait
 * for specific conditions (gate passed, consensus reached, etc).
 *
 * Migrated from:
 * - invoke-waiting-mode.sh (223 lines)
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

export interface WaitResult {
  condition: string;
  met: boolean;
  timedOut: boolean;
  waitedMs: number;
  metadata?: Record<string, unknown>;
}

export interface SignalResult {
  agentId: AgentId;
  signalType: string;
  status: string;
  timestamp: string;
}

export class WaitingCoordinator {
  constructor(
    private redis: RedisCoordinator,
    private logger: Logger
  ) {}

  /**
   * Wait for a specific condition with BLPOP (blocking)
   *
   * Blocks until condition is signaled or timeout occurs.
   * In Task Mode: Returns immediately with false
   * In CLI Mode: Blocks on Redis list
   */
  async waitForCompletion(
    taskId: TaskId,
    agentId: AgentId,
    timeoutSeconds: number = 300,
    namespace: string = 'swarm'
  ): Promise<WaitResult> {
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

    const startTime = Date.now();

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info(`Task Mode: Wait for completion skipped (no Redis) - Agent: ${agentId}`);
      return {
        condition: 'agent-completion',
        met: true,
        timedOut: false,
        waitedMs: 0
      };
    }

    // CLI Mode: Block on Redis list
    const doneKey = `${namespace}:${taskId}:${agentId}:done`;

    try {
      this.logger.info(`⏳ Waiting for completion: ${agentId} (timeout: ${timeoutSeconds}s)`);

      // BLPOP with timeout (Redis timeout in seconds)
      const result = await this.redis.blpop(doneKey, timeoutSeconds);

      const waitedMs = Date.now() - startTime;

      if (result) {
        this.logger.info(`✅ Agent completed: ${agentId} (waited ${waitedMs}ms)`);
        return {
          condition: 'agent-completion',
          met: true,
          timedOut: false,
          waitedMs,
          metadata: { signal: result[1] }
        };
      } else {
        this.logger.warn(`⏱️ Timeout waiting for agent: ${agentId} (${timeoutSeconds}s)`);
        return {
          condition: 'agent-completion',
          met: false,
          timedOut: true,
          waitedMs
        };
      }
    } catch (error) {
      this.logger.error('Failed to wait for completion', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to wait for completion: ${(error as Error).message}`
      );
    }
  }

  /**
   * Wait for gate to pass (test pass rate threshold)
   *
   * Blocks until gate-passed signal is received.
   * In Task Mode: Returns immediately with true
   * In CLI Mode: Blocks on Redis list
   */
  async waitForGate(
    taskId: TaskId,
    timeoutSeconds: number = 600,
    namespace: string = 'swarm'
  ): Promise<WaitResult> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    const startTime = Date.now();

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Wait for gate skipped (no Redis)');
      return {
        condition: 'gate-passed',
        met: true,
        timedOut: false,
        waitedMs: 0
      };
    }

    // CLI Mode: Block on Redis list
    const gateKey = `${namespace}:${taskId}:gate-passed`;

    try {
      this.logger.info(`⏳ Waiting for gate to pass (timeout: ${timeoutSeconds}s)`);

      // BLPOP with timeout
      const result = await this.redis.blpop(gateKey, timeoutSeconds);

      const waitedMs = Date.now() - startTime;

      if (result) {
        this.logger.info(`✅ Gate passed (waited ${waitedMs}ms)`);
        return {
          condition: 'gate-passed',
          met: true,
          timedOut: false,
          waitedMs,
          metadata: { signal: result[1] }
        };
      } else {
        this.logger.warn(`⏱️ Timeout waiting for gate (${timeoutSeconds}s)`);
        return {
          condition: 'gate-passed',
          met: false,
          timedOut: true,
          waitedMs
        };
      }
    } catch (error) {
      this.logger.error('Failed to wait for gate', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to wait for gate: ${(error as Error).message}`
      );
    }
  }

  /**
   * Wait for consensus to be reached from validators
   *
   * Blocks until consensus signal is received.
   * In Task Mode: Returns immediately with true
   * In CLI Mode: Blocks on Redis list
   */
  async waitForConsensus(
    taskId: TaskId,
    timeoutSeconds: number = 600,
    namespace: string = 'swarm'
  ): Promise<WaitResult> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    const startTime = Date.now();

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Wait for consensus skipped (no Redis)');
      return {
        condition: 'consensus-reached',
        met: true,
        timedOut: false,
        waitedMs: 0
      };
    }

    // CLI Mode: Block on Redis list
    const consensusKey = `${namespace}:${taskId}:consensus-reached`;

    try {
      this.logger.info(`⏳ Waiting for consensus (timeout: ${timeoutSeconds}s)`);

      // BLPOP with timeout
      const result = await this.redis.blpop(consensusKey, timeoutSeconds);

      const waitedMs = Date.now() - startTime;

      if (result) {
        this.logger.info(`✅ Consensus reached (waited ${waitedMs}ms)`);
        return {
          condition: 'consensus-reached',
          met: true,
          timedOut: false,
          waitedMs,
          metadata: { signal: result[1] }
        };
      } else {
        this.logger.warn(`⏱️ Timeout waiting for consensus (${timeoutSeconds}s)`);
        return {
          condition: 'consensus-reached',
          met: false,
          timedOut: true,
          waitedMs
        };
      }
    } catch (error) {
      this.logger.error('Failed to wait for consensus', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to wait for consensus: ${(error as Error).message}`
      );
    }
  }

  /**
   * Wait for custom condition by key name
   *
   * Generic wait mechanism for any condition.
   * In Task Mode: Returns immediately with true
   * In CLI Mode: Blocks on Redis list
   */
  async waitForCondition(
    taskId: TaskId,
    conditionName: string,
    timeoutSeconds: number = 300,
    namespace: string = 'swarm'
  ): Promise<WaitResult> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!conditionName || conditionName.length === 0) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        'Condition name cannot be empty'
      );
    }

    const startTime = Date.now();

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info(`Task Mode: Wait for condition skipped (no Redis) - ${conditionName}`);
      return {
        condition: conditionName,
        met: true,
        timedOut: false,
        waitedMs: 0
      };
    }

    // CLI Mode: Block on Redis list
    const conditionKey = `${namespace}:${taskId}:${conditionName}`;

    try {
      this.logger.info(`⏳ Waiting for condition: ${conditionName} (timeout: ${timeoutSeconds}s)`);

      // BLPOP with timeout
      const result = await this.redis.blpop(conditionKey, timeoutSeconds);

      const waitedMs = Date.now() - startTime;

      if (result) {
        this.logger.info(`✅ Condition met: ${conditionName} (waited ${waitedMs}ms)`);
        return {
          condition: conditionName,
          met: true,
          timedOut: false,
          waitedMs,
          metadata: { signal: result[1] }
        };
      } else {
        this.logger.warn(`⏱️ Timeout waiting for condition: ${conditionName} (${timeoutSeconds}s)`);
        return {
          condition: conditionName,
          met: false,
          timedOut: true,
          waitedMs
        };
      }
    } catch (error) {
      this.logger.error('Failed to wait for condition', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to wait for condition ${conditionName}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Signal a condition to wake waiting agents
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Pushes signal to Redis list
   */
  async signalCondition(
    taskId: TaskId,
    conditionName: string,
    metadata?: Record<string, unknown>,
    namespace: string = 'swarm'
  ): Promise<SignalResult> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!conditionName || conditionName.length === 0) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        'Condition name cannot be empty'
      );
    }

    const timestamp = new Date().toISOString();

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info(`Task Mode: Condition signal skipped (no Redis) - ${conditionName}`);
      return {
        agentId: 'orchestrator' as AgentId,
        signalType: conditionName,
        status: 'signaled',
        timestamp
      };
    }

    // CLI Mode: Push signal to Redis
    const conditionKey = `${namespace}:${taskId}:${conditionName}`;

    try {
      const payload = JSON.stringify({
        conditionName,
        timestamp,
        metadata: metadata || {}
      });

      await this.redis.lpush(conditionKey, payload);

      // Set TTL (1 hour - long enough for agents to see it)
      await this.redis.expire(conditionKey, 3600);

      this.logger.info(`✅ Signal sent: ${conditionName}`);

      return {
        agentId: 'orchestrator' as AgentId,
        signalType: conditionName,
        status: 'signaled',
        timestamp
      };
    } catch (error) {
      this.logger.error('Failed to signal condition', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to signal condition ${conditionName}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Wait for multiple agents to complete with parallel blocking
   *
   * In Task Mode: Returns immediately
   * In CLI Mode: Blocks on multiple agent done keys
   */
  async waitForMultipleAgents(
    taskId: TaskId,
    agentIds: AgentId[],
    timeoutSeconds: number = 600,
    namespace: string = 'swarm'
  ): Promise<{
    completed: AgentId[];
    timedOut: boolean;
    waitedMs: number;
  }> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!agentIds || agentIds.length === 0) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        'Agent IDs list cannot be empty'
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Wait for multiple agents skipped (no Redis)');
      return {
        completed: agentIds,
        timedOut: false,
        waitedMs: 0
      };
    }

    const startTime = Date.now();
    const completed: AgentId[] = [];
    const keys = agentIds.map(id => `${namespace}:${taskId}:${id}:done`);

    try {
      this.logger.info(`⏳ Waiting for ${agentIds.length} agents to complete (timeout: ${timeoutSeconds}s)`);

      while (completed.length < agentIds.length) {
        const waitedMs = Date.now() - startTime;

        // Check timeout
        if (waitedMs / 1000 >= timeoutSeconds) {
          this.logger.warn(`⏱️ Timeout waiting for agents to complete`);
          return {
            completed,
            timedOut: true,
            waitedMs
          };
        }

        // Calculate remaining timeout for BLPOP
        const remainingSeconds = timeoutSeconds - (waitedMs / 1000);

        // BLPOP on all remaining keys
        const pendingKeys = agentIds
          .filter(id => !completed.includes(id))
          .map(id => `${namespace}:${taskId}:${id}:done`);

        if (pendingKeys.length === 0) break;

        // BLPOP returns [key, value] or null
        const blpopArgs: Array<string | number> = [...pendingKeys, Math.ceil(remainingSeconds)];
        const result = await this.redis.blpop(...blpopArgs);

        if (result) {
          const key = result[0];
          // Extract agent ID from key: "namespace:taskId:agentId:done"
          const agentId = key.split(':')[2] as AgentId;
          if (!completed.includes(agentId)) {
            completed.push(agentId);
            this.logger.info(`✅ Agent completed: ${agentId}`);
          }
        }
      }

      const waitedMs = Date.now() - startTime;
      this.logger.info(`✅ All agents completed (waited ${waitedMs}ms)`);

      return {
        completed,
        timedOut: false,
        waitedMs
      };
    } catch (error) {
      this.logger.error('Failed to wait for multiple agents', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to wait for multiple agents: ${(error as Error).message}`
      );
    }
  }

  /**
   * Poll for condition (non-blocking alternative to BLPOP)
   *
   * Useful when you can't use BLPOP (Task Mode stubbing issues).
   */
  async pollForCondition(
    taskId: TaskId,
    conditionName: string,
    timeoutSeconds: number = 300,
    pollIntervalMs: number = 1000,
    namespace: string = 'swarm'
  ): Promise<WaitResult> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    const startTime = Date.now();
    const conditionKey = `${namespace}:${taskId}:${conditionName}`;

    try {
      this.logger.info(
        `⏳ Polling for condition: ${conditionName} (timeout: ${timeoutSeconds}s, poll interval: ${pollIntervalMs}ms)`
      );

      while (true) {
        const waitedMs = Date.now() - startTime;

        // Check timeout
        if (waitedMs / 1000 >= timeoutSeconds) {
          this.logger.warn(`⏱️ Timeout polling for condition: ${conditionName}`);
          return {
            condition: conditionName,
            met: false,
            timedOut: true,
            waitedMs
          };
        }

        // Check condition
        if (this.redis.canUseRedis) {
          const result = await this.redis.get(conditionKey);
          if (result && result === 'true') {
            this.logger.info(`✅ Condition met via polling: ${conditionName}`);
            return {
              condition: conditionName,
              met: true,
              timedOut: false,
              waitedMs
            };
          }
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    } catch (error) {
      this.logger.error('Failed to poll for condition', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to poll for condition ${conditionName}: ${(error as Error).message}`
      );
    }
  }
}
