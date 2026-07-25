/**
 * Agent Completion Reporter
 *
 * Handles reporting agent completion, confidence, and test results to Redis.
 *
 * Migrated from:
 * - report-completion.sh (89 lines)
 */

import type {
  TaskId,
  AgentId,
  Logger,
  CompletionReport,
  TestResults
} from './types';
import {
  CoordinationError,
  CoordinationErrorType,
  validateTaskId,
  validateAgentId,
  validateConfidence,
  isValidTaskId,
  isValidAgentId,
  isValidConfidence
} from './types';
import { RedisCoordinator } from './redis-client';

export interface CompletionReportOptions {
  result?: {
    status: 'complete' | 'failed' | 'blocked';
    deliverablesCreated?: string[];
    testsRun?: number;
    testsPassed?: number;
    testsFailed?: number;
    errors?: string[];
    metadata?: Record<string, unknown>;
  };
  iteration?: number;
  namespace?: string;
}

export class CompletionReporter {
  constructor(
    private redis: RedisCoordinator,
    private logger: Logger
  ) {}

  /**
   * Report agent completion with confidence score
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Stores in Redis and signals completion
   */
  async reportCompletion(
    taskId: TaskId,
    agentId: AgentId,
    confidence: number,
    options: CompletionReportOptions = {}
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

    if (!isValidConfidence(confidence)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid confidence value: ${confidence}. Must be between 0.0 and 1.0.`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info(
        `Task Mode: Agent completion reported (no Redis storage) - Agent: ${agentId}, Confidence: ${confidence}`
      );
      return;
    }

    // CLI Mode: Report to Redis with optimized pipeline
    const iteration = options.iteration || 1;
    const namespace = options.namespace || 'swarm';
    const timestamp = new Date().toISOString();

    try {
      // Signal completion (for waiting mode)
      await this.redis.lpush(`${namespace}:${taskId}:${agentId}:done`, 'complete');

      // Store confidence score
      await this.redis.set(
        `${namespace}:${taskId}:${agentId}:confidence`,
        String(confidence),
        'EX',
        3600
      );

      // Store detailed result
      const resultData: Record<string, string> = {
        confidence: String(confidence),
        iteration: String(iteration),
        timestamp
      };

      if (options.result) {
        resultData.status = options.result.status;
        if (options.result.deliverablesCreated) {
          resultData.deliverablesCreated = JSON.stringify(options.result.deliverablesCreated);
        }
        if (options.result.testsRun !== undefined) {
          resultData.testsRun = String(options.result.testsRun);
        }
        if (options.result.testsPassed !== undefined) {
          resultData.testsPassed = String(options.result.testsPassed);
        }
        if (options.result.testsFailed !== undefined) {
          resultData.testsFailed = String(options.result.testsFailed);
        }
        if (options.result.errors) {
          resultData.errors = JSON.stringify(options.result.errors);
        }
        if (options.result.metadata) {
          resultData.metadata = JSON.stringify(options.result.metadata);
        }
      }

      await this.redis.hset(
        `${namespace}:${taskId}:${agentId}:result`,
        ...Object.entries(resultData).flat()
      );

      // Track in completed agents list
      await this.redis.lpush(`${namespace}:${taskId}:completed_agents`, agentId);

      // Set TTLs
      await this.redis.expire(`${namespace}:${taskId}:${agentId}:result`, 3600);
      await this.redis.expire(`${namespace}:${taskId}:${agentId}:done`, 3600);

      this.logger.info(
        `✅ Completion reported: Agent ${agentId}, Confidence: ${confidence}, Iteration: ${iteration}`
      );
    } catch (error) {
      this.logger.error('Failed to report completion', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to report completion for agent ${agentId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Report test results with pass rate
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Stores in Redis for gate checking
   */
  async reportTestResults(
    taskId: TaskId,
    agentId: AgentId,
    results: TestResults,
    iteration: number = 1,
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

    if (!Number.isFinite(results.passRate) || results.passRate < 0 || results.passRate > 1) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid pass rate: ${results.passRate}. Must be between 0.0 and 1.0.`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info(
        `Task Mode: Test results reported (no Redis storage) - Pass Rate: ${(results.passRate * 100).toFixed(1)}%`
      );
      return;
    }

    // CLI Mode: Store in Redis
    const timestamp = new Date().toISOString();

    try {
      const testResultsKey = `${namespace}:${taskId}:${agentId}:test-results`;

      await this.redis.hset(
        testResultsKey,
        'pass', String(results.pass),
        'fail', String(results.fail),
        'skip', String(results.skip || 0),
        'total', String(results.total),
        'passRate', String(results.passRate),
        'iteration', String(iteration),
        'timestamp', timestamp
      );

      // Set TTL (24 hours)
      await this.redis.expire(testResultsKey, 86400);

      this.logger.info(
        `✅ Test results reported: Pass Rate ${(results.passRate * 100).toFixed(1)}% (${results.pass}/${results.total})`
      );
    } catch (error) {
      this.logger.error('Failed to report test results', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to report test results for agent ${agentId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Signal agent done for waiting mode
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Signals via Redis list
   */
  async signalDone(
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
      this.logger.info(`Task Mode: Agent done signal ignored (no Redis) - Agent: ${agentId}`);
      return;
    }

    // CLI Mode: Push to done list
    try {
      const doneKey = `${namespace}:${taskId}:${agentId}:done`;
      await this.redis.lpush(doneKey, 'done');
      await this.redis.expire(doneKey, 3600);

      this.logger.info(`✅ Done signal sent for agent: ${agentId}`);
    } catch (error) {
      this.logger.error('Failed to signal done', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to signal done for agent ${agentId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get completion report for an agent
   */
  async getCompletionReport(
    taskId: TaskId,
    agentId: AgentId,
    namespace: string = 'swarm'
  ): Promise<CompletionReport | null> {
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
      this.logger.info('Task Mode: No completion reports available in Redis');
      return null;
    }

    // CLI Mode: Retrieve from Redis
    try {
      const resultKey = `${namespace}:${taskId}:${agentId}:result`;
      const data = await this.redis.hgetall(resultKey);

      if (!data || Object.keys(data).length === 0) {
        this.logger.warn(`No completion report found for agent: ${agentId}`);
        return null;
      }

      const confidence = parseFloat(data.confidence || '0');
      const report: CompletionReport = {
        agentId,
        taskId,
        confidence,
        iteration: parseInt(data.iteration || '1', 10),
        result: {
          status: (data.status as 'complete' | 'failed' | 'blocked') || 'complete',
          deliverablesCreated: data.deliverablesCreated ? JSON.parse(data.deliverablesCreated) : undefined,
          testsRun: data.testsRun ? parseInt(data.testsRun, 10) : undefined,
          testsPassed: data.testsPassed ? parseInt(data.testsPassed, 10) : undefined,
          testsFailed: data.testsFailed ? parseInt(data.testsFailed, 10) : undefined,
          errors: data.errors ? JSON.parse(data.errors) : undefined,
          metadata: data.metadata ? JSON.parse(data.metadata) : undefined
        },
        timestamp: data.timestamp || new Date().toISOString()
      };

      return report;
    } catch (error) {
      this.logger.error('Failed to get completion report', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to retrieve completion report for agent ${agentId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Clear completion data for an agent
   */
  async clearCompletion(
    taskId: TaskId,
    agentId: AgentId,
    namespace: string = 'swarm'
  ): Promise<void> {
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

    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Completion data cleanup skipped');
      return;
    }

    try {
      const keys = [
        `${namespace}:${taskId}:${agentId}:done`,
        `${namespace}:${taskId}:${agentId}:confidence`,
        `${namespace}:${taskId}:${agentId}:result`,
        `${namespace}:${taskId}:${agentId}:test-results`
      ];

      await this.redis.del(...keys);
      this.logger.info(`✅ Completion data cleared for agent: ${agentId}`);
    } catch (error) {
      this.logger.error('Failed to clear completion data', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to clear completion data for agent ${agentId}: ${(error as Error).message}`
      );
    }
  }
}
