/**
 * Structured Logger for Production Monitoring
 *
 * Provides JSON structured logging with consistent format across all modules.
 * Integrates with monitoring and observability platforms.
 *
 * Log Format:
 * {
 *   timestamp: ISO8601,
 *   level: 'info'|'warn'|'error'|'debug',
 *   component: 'module-name',
 *   taskId?: 'task-123',
 *   message: string,
 *   metrics?: { key: value },
 *   error?: { message, stack, code },
 *   context?: arbitrary object
 * }
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  taskId?: string;
  message: string;
  metrics?: Record<string, unknown>;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  context?: Record<string, unknown>;
}

export interface StructuredLoggerConfig {
  component: string;
  minLevel?: LogLevel;
  includeStackTrace?: boolean;
  includeContext?: boolean;
  taskId?: string;
}

/**
 * Log level priority for filtering
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured logger for production monitoring
 */
export class StructuredLogger {
  private component: string;
  private minLevel: LogLevel;
  private includeStackTrace: boolean;
  private includeContext: boolean;
  private taskId?: string;

  constructor(config: StructuredLoggerConfig) {
    this.component = config.component;
    this.minLevel = config.minLevel || 'info';
    this.includeStackTrace = config.includeStackTrace !== false;
    this.includeContext = config.includeContext !== false;
    this.taskId = config.taskId;
  }

  /**
   * Check if log level should be processed
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  /**
   * Format and output log entry
   */
  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    // Clean up undefined fields
    const cleanEntry: LogEntry = {
      timestamp: entry.timestamp,
      level: entry.level,
      component: entry.component,
      message: entry.message,
    };

    if (entry.taskId) cleanEntry.taskId = entry.taskId;
    if (entry.metrics) cleanEntry.metrics = entry.metrics;
    if (entry.error) cleanEntry.error = entry.error;
    if (entry.context && this.includeContext) cleanEntry.context = entry.context;

    const output = JSON.stringify(cleanEntry);

    // Write to appropriate stream
    if (entry.level === 'error') {
      console.error(output);
    } else if (entry.level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  /**
   * Log info message
   */
  info(message: string, metrics?: Record<string, unknown>, context?: Record<string, unknown>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      component: this.component,
      taskId: this.taskId,
      message,
      metrics,
      context,
    });
  }

  /**
   * Log warning message
   */
  warn(message: string, metrics?: Record<string, unknown>, context?: Record<string, unknown>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      component: this.component,
      taskId: this.taskId,
      message,
      metrics,
      context,
    });
  }

  /**
   * Log error with exception details
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    let errorDetails;

    if (error instanceof Error) {
      errorDetails = {
        message: error.message,
        code: (error as any).code,
        stack: this.includeStackTrace ? error.stack : undefined,
      };
    } else if (typeof error === 'string') {
      errorDetails = {
        message: error,
      };
    } else if (error && typeof error === 'object') {
      errorDetails = {
        message: (error as any).message || String(error),
        code: (error as any).code,
        stack: this.includeStackTrace && (error as any).stack ? (error as any).stack : undefined,
      };
    }

    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'error',
      component: this.component,
      taskId: this.taskId,
      message,
      error: errorDetails,
      context,
    });
  }

  /**
   * Log debug message (lower priority)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'debug',
      component: this.component,
      taskId: this.taskId,
      message,
      context,
    });
  }

  /**
   * Create child logger with inherited taskId
   */
  child(config: Partial<StructuredLoggerConfig>): StructuredLogger {
    return new StructuredLogger({
      component: config.component || this.component,
      minLevel: config.minLevel || this.minLevel,
      includeStackTrace: config.includeStackTrace !== undefined ? config.includeStackTrace : this.includeStackTrace,
      includeContext: config.includeContext !== undefined ? config.includeContext : this.includeContext,
      taskId: config.taskId || this.taskId,
    });
  }

  /**
   * Measure execution time of a function
   */
  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const startMs = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - startMs;
      this.info(label, { durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startMs;
      this.error(`${label} failed`, error, { durationMs });
      throw error;
    }
  }

  /**
   * Measure synchronous function execution
   */
  measureSync<T>(label: string, fn: () => T): T {
    const startMs = Date.now();
    try {
      const result = fn();
      const durationMs = Date.now() - startMs;
      this.info(label, { durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startMs;
      this.error(`${label} failed`, error, { durationMs });
      throw error;
    }
  }
}

/**
 * Global logger factory
 */
let globalLogger: StructuredLogger | undefined;

export function initializeLogger(config: StructuredLoggerConfig): void {
  globalLogger = new StructuredLogger(config);
}

export function getLogger(component?: string): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger({ component: 'unknown' });
  }

  if (component) {
    return globalLogger.child({ component });
  }

  return globalLogger;
}
