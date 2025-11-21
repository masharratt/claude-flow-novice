/**
 * Task Context Manager
 *
 * Handles storing and retrieving task context in Redis (CLI Mode)
 * or gracefully stubbing in Task Mode.
 *
 * Migrated from:
 * - store-context.sh (93 lines)
 * - get-context.sh (145 lines)
 * - store-success-criteria.sh (85 lines)
 * - get-success-criteria.sh (54 lines)
 */

import type {
  TaskId,
  Logger,
  TaskContext,
  ValidationResult
} from './types';
import {
  CoordinationError,
  CoordinationErrorType,
  validateTaskId,
  isValidTaskId
} from './types';
import { RedisCoordinator } from './redis-client';

export interface SuccessCriteria {
  taskId: TaskId;
  criteria: string[];
  testSuites?: string[];
  passThreshold?: number;
  timestamp?: string;
}

export class ContextManager {
  constructor(
    private redis: RedisCoordinator,
    private logger: Logger
  ) {}

  /**
   * Store task context in Redis
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Stores in Redis with 24h TTL
   */
  async storeContext(taskId: TaskId, context: TaskContext): Promise<void> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Context passed via Task() parameters (no Redis storage)');
      return;
    }

    // CLI Mode: Store in Redis
    const key = `swarm:${taskId}:context`;
    const epic = context.epic || '';
    const scope = JSON.stringify(context.scope || {});
    const deliverables = JSON.stringify(context.deliverables || []);
    const successCriteria = JSON.stringify(context.successCriteria || []);
    const mode = context.mode || 'standard';
    const timestamp = context.timestamp || new Date().toISOString();

    try {
      await this.redis.hset(
        key,
        'epic', epic,
        'scope', scope,
        'deliverables', deliverables,
        'successCriteria', successCriteria,
        'mode', mode,
        'updated_at', timestamp
      );

      // Set TTL (24 hours)
      await this.redis.expire(key, 86400);

      this.logger.info(`✅ Context stored for task: ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to store context', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to store context for task ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Retrieve task context from Redis
   *
   * In Task Mode: Returns empty context
   * In CLI Mode: Retrieves from Redis
   */
  async getContext(taskId: TaskId): Promise<TaskContext | null> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: No context available in Redis');
      return null;
    }

    // CLI Mode: Retrieve from Redis
    const key = `swarm:${taskId}:context`;

    try {
      const data = await this.redis.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        this.logger.warn(`No context found for task: ${taskId}`);
        return null;
      }

      // Parse JSON fields
      const scope = data.scope ? JSON.parse(data.scope) : {};
      const deliverables = data.deliverables ? JSON.parse(data.deliverables) : [];
      const successCriteria = data.successCriteria ? JSON.parse(data.successCriteria) : [];

      const context: TaskContext = {
        taskId,
        epic: data.epic || undefined,
        scope: Object.keys(scope).length > 0 ? scope : undefined,
        deliverables: deliverables.length > 0 ? deliverables : undefined,
        successCriteria: successCriteria.length > 0 ? successCriteria : undefined,
        mode: (data.mode as 'mvp' | 'standard' | 'enterprise') || 'standard',
        timestamp: data.updated_at
      };

      this.logger.info(`✅ Context retrieved for task: ${taskId}`);
      return context;
    } catch (error) {
      this.logger.error('Failed to get context', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to retrieve context for task ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Store success criteria for a task
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Stores in Redis with 24h TTL
   */
  async storeSuccessCriteria(taskId: TaskId, criteria: SuccessCriteria): Promise<void> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!criteria.criteria || criteria.criteria.length === 0) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        'Success criteria must contain at least one criterion'
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Success criteria passed via Task() parameters');
      return;
    }

    // CLI Mode: Store in Redis
    const key = `swarm:${taskId}:success_criteria`;

    try {
      const criteriaJson = JSON.stringify(criteria.criteria);
      const testSuitesJson = JSON.stringify(criteria.testSuites || []);
      const timestamp = criteria.timestamp || new Date().toISOString();

      await this.redis.hset(
        key,
        'criteria', criteriaJson,
        'testSuites', testSuitesJson,
        'passThreshold', String(criteria.passThreshold || 0.95),
        'stored_at', timestamp
      );

      // Set TTL (24 hours)
      await this.redis.expire(key, 86400);

      this.logger.info(`✅ Success criteria stored for task: ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to store success criteria', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to store success criteria for task ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Retrieve success criteria from Redis
   *
   * In Task Mode: Returns null
   * In CLI Mode: Retrieves from Redis
   */
  async getSuccessCriteria(taskId: TaskId): Promise<SuccessCriteria | null> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: No success criteria available in Redis');
      return null;
    }

    // CLI Mode: Retrieve from Redis
    const key = `swarm:${taskId}:success_criteria`;

    try {
      const data = await this.redis.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        this.logger.warn(`No success criteria found for task: ${taskId}`);
        return null;
      }

      // Parse JSON fields
      const criteria = data.criteria ? JSON.parse(data.criteria) : [];
      const testSuites = data.testSuites ? JSON.parse(data.testSuites) : [];
      const passThreshold = data.passThreshold ? parseFloat(data.passThreshold) : 0.95;

      const result: SuccessCriteria = {
        taskId,
        criteria,
        testSuites: testSuites.length > 0 ? testSuites : undefined,
        passThreshold,
        timestamp: data.stored_at
      };

      this.logger.info(`✅ Success criteria retrieved for task: ${taskId}`);
      return result;
    } catch (error) {
      this.logger.error('Failed to get success criteria', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to retrieve success criteria for task ${taskId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Validate context structure
   */
  validateContext(context: TaskContext): ValidationResult {
    const errors: string[] = [];

    if (!isValidTaskId(context.taskId)) {
      errors.push(`Invalid task ID: ${context.taskId}`);
    }

    if (context.deliverables && !Array.isArray(context.deliverables)) {
      errors.push('Deliverables must be an array');
    }

    if (context.successCriteria && !Array.isArray(context.successCriteria)) {
      errors.push('Success criteria must be an array');
    }

    if (context.mode && !['mvp', 'standard', 'enterprise'].includes(context.mode)) {
      errors.push(`Invalid mode: ${context.mode}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Clear context for a task
   */
  async clearContext(taskId: TaskId): Promise<void> {
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Context cleanup skipped');
      return;
    }

    try {
      const keys = [
        `swarm:${taskId}:context`,
        `swarm:${taskId}:success_criteria`
      ];

      await this.redis.del(...keys);
      this.logger.info(`✅ Context cleared for task: ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to clear context', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to clear context for task ${taskId}: ${(error as Error).message}`
      );
    }
  }
}
