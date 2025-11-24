import { v4 as uuidv4 } from 'uuid';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

export interface LogContext {
  correlationId?: string;
  agentId?: string;
  agentType?: string;
  taskId?: string;
  team?: string;
  project?: string;
  [key: string]: any;
}

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private defaultContext: LogContext;
  private correlationId: string;

  constructor(defaultContext: LogContext = {}) {
    this.defaultContext = defaultContext;
    this.correlationId = defaultContext.correlationId || uuidv4();
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const logEntry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: context?.correlationId || this.correlationId,
      context: {
        ...this.defaultContext,
        ...context,
      },
    };

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    // Output to stdout for container log aggregation
    console.log(JSON.stringify(logEntry));

    // For FATAL errors, also output to stderr
    if (level === LogLevel.FATAL) {
      console.error(JSON.stringify(logEntry));
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  fatal(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.FATAL, message, context, error);
  }

  // Create child logger with inherited context
  child(context: LogContext): Logger {
    return new Logger({
      ...this.defaultContext,
      ...context,
      correlationId: this.correlationId,
    });
  }

  // Get correlation ID for distributed tracing
  getCorrelationId(): string {
    return this.correlationId;
  }

  // Set new correlation ID (for new request chains)
  setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }
}

// Default logger instance
export const logger = new Logger();

// Factory for creating loggers with specific context
export function createLogger(context: LogContext): Logger {
  return new Logger(context);
}

// Helper for extracting correlation ID from environment or generating new
export function getCorrelationId(): string {
  return process.env.CORRELATION_ID || uuidv4();
}

// Helper for extracting common agent context from environment
export function getAgentContext(): LogContext {
  return {
    agentId: process.env.AGENT_ID,
    agentType: process.env.AGENT_TYPE,
    taskId: process.env.TASK_ID,
    team: process.env.TEAM_NAME,
    project: process.env.PROJECT_NAME,
    correlationId: getCorrelationId(),
  };
}
