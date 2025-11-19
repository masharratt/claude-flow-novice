/**
 * Agent Logger
 *
 * Handles agent logging with dual output (terminal + Redis).
 *
 * Migrated from:
 * - agent-log.sh (128 lines)
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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  agentId: AgentId;
  taskId: TaskId;
  timestamp: string;
  repository?: string;
}

export class AgentLogger implements Logger {
  private repository: string;

  constructor(
    private taskId: TaskId,
    private agentId: AgentId,
    private redis: RedisCoordinator,
    private baseLogger?: Logger,
    repository?: string
  ) {
    // Validate IDs
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

    this.repository = repository || this.detectRepository();
  }

  /**
   * Detect repository name from current working directory
   */
  private detectRepository(): string {
    try {
      const cwd = process.cwd();
      return cwd.split('/').pop() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get ANSI color code for log level
   */
  private getColorCode(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[0;36m',    // Cyan
      info: '\x1b[0;32m',     // Green
      warn: '\x1b[0;33m',     // Yellow
      error: '\x1b[0;31m'     // Red
    };
    return colors[level];
  }

  /**
   * Format log entry for terminal output
   */
  private formatForTerminal(entry: LogEntry): string {
    const color = this.getColorCode(entry.level);
    const reset = '\x1b[0m';
    const agentColor = '\x1b[0;35m'; // Magenta

    return (
      `${color}[${entry.level.toUpperCase()}]${reset} ` +
      `${agentColor}[${entry.agentId}]${reset} ` +
      entry.message
    );
  }

  /**
   * Store log entry in Redis
   *
   * Logs are stored in both:
   * 1. Pub/Sub for real-time delivery
   * 2. Sorted set for history
   */
  private async storeInRedis(entry: LogEntry): Promise<void> {
    if (!this.redis.canUseRedis) {
      return;
    }

    try {
      const payload = JSON.stringify(entry);
      const channelKey = `swarm:${entry.taskId}:logs`;
      const historyKey = `swarm:${entry.taskId}:logs:history`;

      // Publish to channel for real-time consumption
      await this.redis.publish(channelKey, payload);

      // Add to sorted set for persistence (timestamp as score)
      const score = new Date(entry.timestamp).getTime();
      await this.redis.zadd(historyKey, score.toString(), payload);

      // Set TTL on history (7 days = 604800 seconds)
      await this.redis.expire(historyKey, 604800);
    } catch (error) {
      // Non-fatal: logging failure shouldn't crash agent
      console.error('Failed to store log in Redis', error);
    }
  }

  /**
   * Internal logging method
   */
  private async logInternal(
    level: LogLevel,
    message: string,
    noTerminal?: boolean,
    noRedis?: boolean
  ): Promise<void> {
    const entry: LogEntry = {
      level,
      message,
      agentId: this.agentId,
      taskId: this.taskId,
      timestamp: new Date().toISOString(),
      repository: this.repository
    };

    // Terminal output
    if (!noTerminal) {
      const formatted = this.formatForTerminal(entry);
      if (this.baseLogger) {
        switch (level) {
          case 'debug':
            this.baseLogger.debug(formatted);
            break;
          case 'info':
            this.baseLogger.info(formatted);
            break;
          case 'warn':
            this.baseLogger.warn(formatted);
            break;
          case 'error':
            this.baseLogger.error(formatted);
            break;
        }
      } else {
        console.log(formatted);
      }
    }

    // Redis storage
    if (!noRedis) {
      await this.storeInRedis(entry);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    const msg = context ? `${message} ${JSON.stringify(context)}` : message;
    this.logInternal('debug', msg).catch(err =>
      console.error('Error in debug log', err)
    );
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    const msg = context ? `${message} ${JSON.stringify(context)}` : message;
    this.logInternal('info', msg).catch(err =>
      console.error('Error in info log', err)
    );
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    const msg = context ? `${message} ${JSON.stringify(context)}` : message;
    this.logInternal('warn', msg).catch(err =>
      console.error('Error in warn log', err)
    );
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const errorMsg = error
      ? `${message} - ${error.message}${context ? ` ${JSON.stringify(context)}` : ''}`
      : message;
    this.logInternal('error', errorMsg).catch(err =>
      console.error('Error in error log', err)
    );
  }

  /**
   * Get logs for this agent from Redis
   */
  async getAgentLogs(
    limit?: number,
    namespace: string = 'swarm'
  ): Promise<LogEntry[]> {
    if (!this.redis.canUseRedis) {
      return [];
    }

    try {
      const historyKey = `${namespace}:${this.taskId}:logs:history`;

      // Get all logs for task (reverse order, newest first)
      const count = limit || 100;
      const logs = await this.redis.zrevrange(historyKey, 0, count - 1);

      const entries: LogEntry[] = [];

      for (const logJson of logs) {
        try {
          const entry = JSON.parse(logJson) as LogEntry;
          // Filter to only this agent
          if (entry.agentId === this.agentId) {
            entries.push(entry);
          }
        } catch {
          // Skip malformed entries
        }
      }

      return entries;
    } catch (error) {
      this.logger.error('Failed to get agent logs', error as Error);
      return [];
    }
  }

  /**
   * Get logger property for compatibility
   */
  private get logger(): Logger {
    return this.baseLogger || {
      debug: (msg: string) => console.log(msg),
      info: (msg: string) => console.log(msg),
      warn: (msg: string) => console.warn(msg),
      error: (msg: string) => console.error(msg)
    };
  }
}

/**
 * Store agent log entry directly (non-Logger interface)
 */
export async function storeAgentLog(
  taskId: TaskId,
  agentId: AgentId,
  level: LogLevel,
  message: string,
  redis: RedisCoordinator,
  repository?: string
): Promise<void> {
  const logger = new AgentLogger(taskId, agentId, redis, undefined, repository);
  logger[level](message);
}

/**
 * Get agent logs directly (non-Logger interface)
 */
export async function getAgentLogs(
  taskId: TaskId,
  agentId: AgentId,
  redis: RedisCoordinator,
  limit?: number,
  namespace: string = 'swarm'
): Promise<LogEntry[]> {
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

  if (!redis.canUseRedis) {
    return [];
  }

  try {
    const historyKey = `${namespace}:${taskId}:logs:history`;

    // Get logs (reverse order, newest first)
    const count = limit || 100;
    const logs = await redis.zrevrange(historyKey, 0, count - 1);

    const entries: LogEntry[] = [];

    for (const logJson of logs) {
      try {
        const entry = JSON.parse(logJson) as LogEntry;
        // Filter to only this agent
        if (entry.agentId === agentId) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed entries
      }
    }

    return entries;
  } catch (error) {
    throw new CoordinationError(
      CoordinationErrorType.REDIS_UNAVAILABLE,
      `Failed to retrieve agent logs: ${(error as Error).message}`
    );
  }
}

/**
 * Get logs for all agents in a task
 */
export async function getTaskLogs(
  taskId: TaskId,
  redis: RedisCoordinator,
  limit?: number,
  namespace: string = 'swarm'
): Promise<LogEntry[]> {
  if (!isValidTaskId(taskId)) {
    throw new CoordinationError(
      CoordinationErrorType.VALIDATION_ERROR,
      `Invalid task ID: ${taskId}`
    );
  }

  if (!redis.canUseRedis) {
    return [];
  }

  try {
    const historyKey = `${namespace}:${taskId}:logs:history`;

    // Get all logs (reverse order, newest first)
    const count = limit || 1000;
    const logs = await redis.zrevrange(historyKey, 0, count - 1);

    const entries: LogEntry[] = [];

    for (const logJson of logs) {
      try {
        entries.push(JSON.parse(logJson) as LogEntry);
      } catch {
        // Skip malformed entries
      }
    }

    return entries;
  } catch (error) {
    throw new CoordinationError(
      CoordinationErrorType.REDIS_UNAVAILABLE,
      `Failed to retrieve task logs: ${(error as Error).message}`
    );
  }
}

/**
 * Clear logs for a task or agent
 */
export async function clearLogs(
  taskId: TaskId,
  agentId?: AgentId,
  redis?: RedisCoordinator,
  namespace: string = 'swarm'
): Promise<void> {
  if (!isValidTaskId(taskId)) {
    throw new CoordinationError(
      CoordinationErrorType.VALIDATION_ERROR,
      `Invalid task ID: ${taskId}`
    );
  }

  if (!redis || !redis.canUseRedis) {
    return;
  }

  try {
    const historyKey = `${namespace}:${taskId}:logs:history`;

    if (agentId && isValidAgentId(agentId)) {
      // Delete specific agent's logs
      const allLogs = await redis.zrange(historyKey, 0, -1);
      const logsToDelete: string[] = [];

      for (const logJson of allLogs) {
        try {
          const entry = JSON.parse(logJson) as LogEntry;
          if (entry.agentId === agentId) {
            logsToDelete.push(logJson);
          }
        } catch {
          // Skip malformed entries
        }
      }

      for (const logJson of logsToDelete) {
        await redis.zrem(historyKey, logJson);
      }
    } else {
      // Delete all logs for task
      await redis.del(historyKey);
    }
  } catch (error) {
    throw new CoordinationError(
      CoordinationErrorType.REDIS_UNAVAILABLE,
      `Failed to clear logs: ${(error as Error).message}`
    );
  }
}
