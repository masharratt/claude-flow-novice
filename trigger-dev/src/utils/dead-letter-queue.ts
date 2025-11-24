/**
 * Dead Letter Queue - Phase 6 #3
 *
 * Captures failed agent tasks for inspection, retry, and recovery.
 * Uses Redis for persistence and coordination across distributed workers.
 */

import { createClient, RedisClientType } from 'redis';
import { recordMetric } from './metrics';
import { logger } from './logging';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface FailedTask {
  id: string;
  taskId: string;
  agentType: string;
  error: string;
  errorStack?: string;
  context: Record<string, any>;
  timestamp: Date;
  retryCount: number;
  nextRetryAt?: Date;
  metadata?: Record<string, any>;
}

export interface DLQConfig {
  redisUrl?: string;
  redisKey: string;
  maxRetries: number;
  retryDelayMs: number;
  retentionMs: number;
  batchSize?: number;
}

export interface DLQStats {
  totalTasks: number;
  retriableTasks: number;
  expiredTasks: number;
  avgRetryCount: number;
}

// ============================================================================
// Dead Letter Queue Implementation
// ============================================================================

export class DeadLetterQueue {
  private config: DLQConfig;
  private redis: RedisClientType;
  private connected: boolean = false;

  constructor(config: Partial<DLQConfig> = {}) {
    this.config = {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      redisKey: 'cfn:dlq:failed-tasks',
      maxRetries: 3,
      retryDelayMs: 5 * 60 * 1000,  // 5 minutes
      retentionMs: 24 * 60 * 60 * 1000,  // 24 hours
      batchSize: 100,
      ...config
    };

    this.redis = createClient({ url: this.config.redisUrl });
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('error', (error) => {
      logger.error('DLQ Redis error', { error: error.message });
    });

    this.redis.on('connect', () => {
      this.connected = true;
      logger.info('DLQ connected to Redis');
    });

    this.redis.on('disconnect', () => {
      this.connected = false;
      logger.warn('DLQ disconnected from Redis');
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (!this.connected) {
      await this.redis.connect();
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.redis.disconnect();
    }
  }

  /**
   * Add failed task to DLQ
   */
  async add(task: Omit<FailedTask, 'id' | 'timestamp' | 'retryCount' | 'nextRetryAt'>): Promise<string> {
    await this.connect();

    const failedTask: FailedTask = {
      ...task,
      id: `dlq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      retryCount: 0,
      nextRetryAt: new Date(Date.now() + this.config.retryDelayMs)
    };

    // Store in Redis sorted set (sorted by nextRetryAt)
    await this.redis.zAdd(this.config.redisKey, {
      score: failedTask.nextRetryAt!.getTime(),
      value: JSON.stringify(failedTask)
    });

    // Track DLQ metrics
    recordMetric('dlq.added', 1, {
      taskId: task.taskId,
      agentType: task.agentType
    });

    logger.warn('Task added to DLQ', {
      id: failedTask.id,
      taskId: task.taskId,
      agentType: task.agentType,
      error: task.error
    });

    return failedTask.id;
  }

  /**
   * Get all tasks in DLQ
   */
  async getAll(limit?: number): Promise<FailedTask[]> {
    await this.connect();

    const count = limit || this.config.batchSize || 100;
    const results = await this.redis.zRange(
      this.config.redisKey,
      0,
      count - 1
    );

    return results.map(json => this.parseTask(json));
  }

  /**
   * Get tasks ready for retry
   */
  async getRetryable(): Promise<FailedTask[]> {
    await this.connect();

    const now = Date.now();

    // Get tasks with nextRetryAt <= now
    const results = await this.redis.zRangeByScore(
      this.config.redisKey,
      0,
      now
    );

    const tasks = results.map(json => this.parseTask(json));

    // Filter tasks that haven't exceeded max retries
    return tasks.filter(task => task.retryCount < this.config.maxRetries);
  }

  /**
   * Get specific task by ID
   */
  async get(id: string): Promise<FailedTask | null> {
    await this.connect();

    const results = await this.redis.zRange(this.config.redisKey, 0, -1);

    for (const json of results) {
      const task = this.parseTask(json);
      if (task.id === id) {
        return task;
      }
    }

    return null;
  }

  /**
   * Retry specific task
   */
  async retry(id: string): Promise<void> {
    await this.connect();

    const task = await this.get(id);

    if (!task) {
      throw new Error(`Task ${id} not found in DLQ`);
    }

    if (task.retryCount >= this.config.maxRetries) {
      throw new Error(`Task ${id} has exceeded max retries (${this.config.maxRetries})`);
    }

    // Remove from DLQ
    await this.remove(id);

    // Track retry metrics
    recordMetric('dlq.retry', 1, {
      taskId: task.taskId,
      agentType: task.agentType,
      retryCount: task.retryCount
    });

    logger.info('Retrying task from DLQ', {
      id: task.id,
      taskId: task.taskId,
      retryCount: task.retryCount
    });

    // Note: Actual retry logic should be implemented by the consumer
    // This method just removes from DLQ and tracks metrics
  }

  /**
   * Increment retry count for task
   */
  async incrementRetries(id: string): Promise<void> {
    await this.connect();

    const task = await this.get(id);

    if (!task) {
      throw new Error(`Task ${id} not found in DLQ`);
    }

    // Remove old entry
    await this.removeTask(task);

    // Update task
    task.retryCount++;
    task.nextRetryAt = new Date(Date.now() + this.config.retryDelayMs * Math.pow(2, task.retryCount - 1));

    // Re-add with updated retry count
    await this.redis.zAdd(this.config.redisKey, {
      score: task.nextRetryAt.getTime(),
      value: JSON.stringify(task)
    });

    // Track metrics
    recordMetric('dlq.retry_increment', 1, {
      taskId: task.taskId,
      retryCount: task.retryCount
    });

    logger.info('Incremented retry count for task', {
      id: task.id,
      taskId: task.taskId,
      retryCount: task.retryCount,
      nextRetryAt: task.nextRetryAt
    });
  }

  /**
   * Remove task from DLQ
   */
  async remove(id: string): Promise<void> {
    await this.connect();

    const task = await this.get(id);

    if (!task) {
      return;
    }

    await this.removeTask(task);

    // Track metrics
    recordMetric('dlq.removed', 1, {
      taskId: task.taskId,
      agentType: task.agentType
    });

    logger.info('Removed task from DLQ', {
      id: task.id,
      taskId: task.taskId
    });
  }

  /**
   * Clean up expired tasks
   */
  async cleanup(): Promise<number> {
    await this.connect();

    const cutoff = Date.now() - this.config.retentionMs;

    // Get all tasks
    const results = await this.redis.zRange(this.config.redisKey, 0, -1);
    const tasks = results.map(json => this.parseTask(json));

    // Filter expired tasks
    const expiredTasks = tasks.filter(task =>
      task.timestamp.getTime() < cutoff
    );

    // Remove expired tasks
    for (const task of expiredTasks) {
      await this.removeTask(task);
    }

    if (expiredTasks.length > 0) {
      logger.info('Cleaned up expired tasks from DLQ', {
        count: expiredTasks.length,
        cutoffDate: new Date(cutoff)
      });
    }

    // Track metrics
    recordMetric('dlq.cleanup', expiredTasks.length);

    return expiredTasks.length;
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<DLQStats> {
    await this.connect();

    const tasks = await this.getAll();
    const retryable = await this.getRetryable();

    const cutoff = Date.now() - this.config.retentionMs;
    const expired = tasks.filter(task => task.timestamp.getTime() < cutoff);

    const avgRetryCount = tasks.length > 0
      ? tasks.reduce((sum, task) => sum + task.retryCount, 0) / tasks.length
      : 0;

    return {
      totalTasks: tasks.length,
      retriableTasks: retryable.length,
      expiredTasks: expired.length,
      avgRetryCount
    };
  }

  /**
   * Get queue depth
   */
  async getDepth(): Promise<number> {
    await this.connect();

    return await this.redis.zCard(this.config.redisKey);
  }

  /**
   * Clear all tasks (use with caution)
   */
  async clear(): Promise<void> {
    await this.connect();

    await this.redis.del(this.config.redisKey);

    logger.warn('Cleared all tasks from DLQ');
  }

  // Private helper methods

  private parseTask(json: string): FailedTask {
    const task = JSON.parse(json);

    return {
      ...task,
      timestamp: new Date(task.timestamp),
      nextRetryAt: task.nextRetryAt ? new Date(task.nextRetryAt) : undefined
    };
  }

  private async removeTask(task: FailedTask): Promise<void> {
    await this.redis.zRem(this.config.redisKey, JSON.stringify({
      ...task,
      timestamp: task.timestamp.toISOString(),
      nextRetryAt: task.nextRetryAt?.toISOString()
    }));
  }
}

// ============================================================================
// DLQ Background Worker
// ============================================================================

export interface DLQWorkerConfig {
  dlq: DeadLetterQueue;
  retryHandler: (task: FailedTask) => Promise<void>;
  pollingIntervalMs?: number;
  maxConcurrent?: number;
}

/**
 * Background worker for processing DLQ tasks
 */
export class DLQWorker {
  private config: DLQWorkerConfig;
  private running: boolean = false;
  private processingCount: number = 0;
  private timer?: NodeJS.Timeout;

  constructor(config: DLQWorkerConfig) {
    this.config = {
      pollingIntervalMs: 60000,  // 1 minute
      maxConcurrent: 5,
      ...config
    };
  }

  /**
   * Start worker
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    logger.info('DLQ worker started');

    this.scheduleNext();
  }

  /**
   * Stop worker
   */
  stop(): void {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    logger.info('DLQ worker stopped');
  }

  private scheduleNext(): void {
    if (!this.running) {
      return;
    }

    this.timer = setTimeout(async () => {
      await this.processRetryable();
      this.scheduleNext();
    }, this.config.pollingIntervalMs);
  }

  private async processRetryable(): Promise<void> {
    try {
      const tasks = await this.config.dlq.getRetryable();

      if (tasks.length === 0) {
        return;
      }

      logger.info('Processing retryable tasks from DLQ', {
        count: tasks.length
      });

      for (const task of tasks) {
        // Check concurrent limit
        if (this.processingCount >= this.config.maxConcurrent!) {
          break;
        }

        this.processTask(task);
      }
    } catch (error) {
      logger.error('Error processing DLQ tasks', {
        error: (error as Error).message
      });
    }
  }

  private async processTask(task: FailedTask): Promise<void> {
    this.processingCount++;

    try {
      await this.config.retryHandler(task);

      // Success - remove from DLQ
      await this.config.dlq.remove(task.id);

      logger.info('Successfully retried task from DLQ', {
        id: task.id,
        taskId: task.taskId
      });

      recordMetric('dlq.retry_success', 1, {
        taskId: task.taskId,
        agentType: task.agentType
      });
    } catch (error) {
      logger.error('Failed to retry task from DLQ', {
        id: task.id,
        taskId: task.taskId,
        error: (error as Error).message
      });

      // Increment retry count
      await this.config.dlq.incrementRetries(task.id);

      recordMetric('dlq.retry_failure', 1, {
        taskId: task.taskId,
        agentType: task.agentType,
        retryCount: task.retryCount
      });
    } finally {
      this.processingCount--;
    }
  }

  getStatus(): { running: boolean; processing: number } {
    return {
      running: this.running,
      processing: this.processingCount
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create DLQ with default configuration
 */
export function createDLQ(config?: Partial<DLQConfig>): DeadLetterQueue {
  return new DeadLetterQueue(config);
}

/**
 * Create DLQ worker with retry handler
 */
export function createDLQWorker(
  dlq: DeadLetterQueue,
  retryHandler: (task: FailedTask) => Promise<void>,
  config?: Partial<DLQWorkerConfig>
): DLQWorker {
  return new DLQWorker({
    dlq,
    retryHandler,
    ...config
  });
}
