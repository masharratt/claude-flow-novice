/**
 * Structured Logging Utility
 *
 * Provides structured JSON logging for consistent log output across the application.
 * Part of Task 0.5: Implementation Tooling & Utilities (Foundation)
 *
 * Usage:
 *   const logger = createLogger('database-service');
 *   logger.info('Connection established', { host: 'localhost', port: 5432 });
 */

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Minimum log level to output (default: INFO) */
  minLevel?: LogLevel;
  /** Enable console output (default: true) */
  console?: boolean;
  /** File path for log output (optional) */
  filePath?: string;
  /** Pretty print JSON (default: false) */
  pretty?: boolean;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, metadata?: Record<string, any>): void;
  info(message: string, metadata?: Record<string, any>): void;
  warn(message: string, metadata?: Record<string, any>): void;
  error(message: string, error?: Error, metadata?: Record<string, any>): void;
  setMinLevel(level: LogLevel): void;
}

/**
 * Log level priorities for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Create a structured logger instance
 *
 * @param context - Logger context (e.g., 'database-service', 'api-handler')
 * @param options - Logger configuration options
 * @returns Logger instance
 */
export function createLogger(context: string, options: LoggerOptions = {}): Logger {
  const {
    minLevel = LogLevel.INFO,
    console: consoleOutput = true,
    filePath,
    pretty = false,
  } = options;

  let currentMinLevel = minLevel;
  let fileStream: fs.WriteStream | null = null;

  // Initialize file stream if file path provided
  if (filePath) {
    const logDir = path.dirname(filePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fileStream = fs.createWriteStream(filePath, { flags: 'a' });
  }

  /**
   * Write log entry to outputs
   */
  function writeLog(entry: LogEntry): void {
    // Check if log level meets minimum threshold
    if (LOG_LEVEL_PRIORITY[entry.level] < LOG_LEVEL_PRIORITY[currentMinLevel]) {
      return;
    }

    const jsonString = pretty
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    // Console output
    if (consoleOutput) {
      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(jsonString);
          break;
        case LogLevel.INFO:
          console.info(jsonString);
          break;
        case LogLevel.WARN:
          console.warn(jsonString);
          break;
        case LogLevel.ERROR:
          console.error(jsonString);
          break;
      }
    }

    // File output
    if (fileStream) {
      fileStream.write(jsonString + '\n');
    }
  }

  /**
   * Create log entry
   */
  function createLogEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
    };

    if (metadata && Object.keys(metadata).length > 0) {
      entry.metadata = metadata;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  return {
    debug(message: string, metadata?: Record<string, any>): void {
      const entry = createLogEntry(LogLevel.DEBUG, message, metadata);
      writeLog(entry);
    },

    info(message: string, metadata?: Record<string, any>): void {
      const entry = createLogEntry(LogLevel.INFO, message, metadata);
      writeLog(entry);
    },

    warn(message: string, metadata?: Record<string, any>): void {
      const entry = createLogEntry(LogLevel.WARN, message, metadata);
      writeLog(entry);
    },

    error(message: string, error?: Error, metadata?: Record<string, any>): void {
      const entry = createLogEntry(LogLevel.ERROR, message, metadata, error);
      writeLog(entry);
    },

    setMinLevel(level: LogLevel): void {
      currentMinLevel = level;
    },
  };
}

/**
 * Global logger instance (default context)
 */
let globalLogger: Logger | null = null;

/**
 * Get or create global logger
 *
 * @param options - Logger configuration options
 * @returns Global logger instance
 */
export function getGlobalLogger(options?: LoggerOptions): Logger {
  if (!globalLogger) {
    globalLogger = createLogger('global', options);
  }
  return globalLogger;
}

/**
 * Set global logger instance
 *
 * @param logger - Logger instance to use globally
 */
export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}
