/**
 * Centralized Error Handling System
 *
 * Provides comprehensive error handling, validation, and recovery mechanisms
 * for production robustness across all modules.
 */

import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';

// Error type constants
export const ErrorTypes = {
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  NETWORK: 'network',
  SYSTEM: 'system',
  BUSINESS: 'business',
  TIMEOUT: 'timeout',
  RESOURCE: 'resource',
  CONFIGURATION: 'configuration',
  SECURITY: 'security',
  SWARM: 'swarm',
  REDIS: 'redis',
  WEBSOCKET: 'websocket',
  DASHBOARD: 'dashboard'
};

// Error severity levels
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Error categories for classification
export const ErrorCategories = {
  USER_ERROR: 'user_error',      // User input/validation errors
  SYSTEM_ERROR: 'system_error',  // System-related errors
  EXTERNAL_ERROR: 'external_error', // External service errors
  SECURITY_ERROR: 'security_error' // Security-related errors
};

/**
 * Base Error class
 */
export class BaseError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'UNKNOWN_ERROR';
    this.type = options.type || ErrorTypes.SYSTEM;
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.category = options.category || ErrorCategories.SYSTEM_ERROR;
    this.retryable = options.retryable || false;
    this.context = options.context || {};
    this.timestamp = new Date().toISOString();
    this.errorId = options.errorId || this.generateErrorId();
    this.cause = options.cause;
    this.suggestions = options.suggestions || [];
    this.metadata = options.metadata || {};

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  generateErrorId() {
    return `err_${Date.now()}_${randomBytes(4).toString('hex')}`;
  }

  toJSON() {
    return {
      errorId: this.errorId,
      name: this.name,
      message: this.message,
      code: this.code,
      type: this.type,
      severity: this.severity,
      category: this.category,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp,
      suggestions: this.suggestions,
      metadata: this.metadata,
      stack: this.stack
    };
  }

  toString() {
    return `[${this.code}] ${this.message} (${this.type}:${this.severity})`;
  }
}

/**
 * Validation Error
 */
export class ValidationError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.VALIDATION,
      category: ErrorCategories.USER_ERROR,
      severity: ErrorSeverity.LOW,
      retryable: false,
      ...options
    });
    this.code = options.code || 'VALIDATION_ERROR';
  }
}

/**
 * Authentication Error
 */
export class AuthenticationError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.AUTHENTICATION,
      category: ErrorCategories.SECURITY_ERROR,
      severity: ErrorSeverity.HIGH,
      retryable: false,
      ...options
    });
    this.code = options.code || 'AUTHENTICATION_ERROR';
  }
}

/**
 * Authorization Error
 */
export class AuthorizationError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.AUTHORIZATION,
      category: ErrorCategories.SECURITY_ERROR,
      severity: ErrorSeverity.HIGH,
      retryable: false,
      ...options
    });
    this.code = options.code || 'AUTHORIZATION_ERROR';
  }
}

/**
 * Network Error
 */
export class NetworkError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.NETWORK,
      category: ErrorCategories.EXTERNAL_ERROR,
      severity: ErrorSeverity.MEDIUM,
      retryable: true,
      ...options
    });
    this.code = options.code || 'NETWORK_ERROR';
  }
}

/**
 * Timeout Error
 */
export class TimeoutError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.TIMEOUT,
      category: ErrorCategories.EXTERNAL_ERROR,
      severity: ErrorSeverity.MEDIUM,
      retryable: true,
      ...options
    });
    this.code = options.code || 'TIMEOUT_ERROR';
  }
}

/**
 * Resource Error
 */
export class ResourceError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.RESOURCE,
      category: ErrorCategories.SYSTEM_ERROR,
      severity: ErrorSeverity.HIGH,
      retryable: false,
      ...options
    });
    this.code = options.code || 'RESOURCE_ERROR';
  }
}

/**
 * Configuration Error
 */
export class ConfigurationError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.CONFIGURATION,
      category: ErrorCategories.SYSTEM_ERROR,
      severity: ErrorSeverity.HIGH,
      retryable: false,
      ...options
    });
    this.code = options.code || 'CONFIGURATION_ERROR';
  }
}

/**
 * Security Error
 */
export class SecurityError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.SECURITY,
      category: ErrorCategories.SECURITY_ERROR,
      severity: ErrorSeverity.CRITICAL,
      retryable: false,
      ...options
    });
    this.code = options.code || 'SECURITY_ERROR';
  }
}

/**
 * Swarm Error
 */
export class SwarmError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.SWARM,
      category: ErrorCategories.SYSTEM_ERROR,
      severity: ErrorSeverity.MEDIUM,
      retryable: true,
      ...options
    });
    this.code = options.code || 'SWARM_ERROR';
  }
}

/**
 * Redis Error
 */
export class RedisError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.REDIS,
      category: ErrorCategories.EXTERNAL_ERROR,
      severity: ErrorSeverity.MEDIUM,
      retryable: true,
      ...options
    });
    this.code = options.code || 'REDIS_ERROR';
  }
}

/**
 * WebSocket Error
 */
export class WebSocketError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.WEBSOCKET,
      category: ErrorCategories.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      retryable: true,
      ...options
    });
    this.code = options.code || 'WEBSOCKET_ERROR';
  }
}

/**
 * Dashboard Error
 */
export class DashboardError extends BaseError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorTypes.DASHBOARD,
      category: ErrorCategories.SYSTEM_ERROR,
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      ...options
    });
    this.code = options.code || 'DASHBOARD_ERROR';
  }
}

/**
 * Error Handler class
 */
export class ErrorHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      enableLogging: true,
      enableMetrics: true,
      enableRecovery: true,
      maxRetries: 3,
      retryDelay: 1000,
      timeoutMs: 30000,
      ...options
    };

    this.errorCounts = new Map();
    this.errorHistory = [];
    this.recoveryStrategies = new Map();
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
  }

  /**
   * Handle an error with comprehensive processing
   */
  async handleError(error, context = {}) {
    const processedError = this.processError(error, context);

    // Log the error
    if (this.options.enableLogging) {
      await this.logError(processedError);
    }

    // Update metrics
    if (this.options.enableMetrics) {
      this.updateMetrics(processedError);
    }

    // Emit error event
    this.emit('error', processedError);

    // Attempt recovery if enabled and error is retryable
    if (this.options.enableRecovery && processedError.retryable) {
      return this.attemptRecovery(processedError, context);
    }

    return processedError;
  }

  /**
   * Process and normalize error
   */
  processError(error, context = {}) {
    let processedError;

    if (error instanceof BaseError) {
      processedError = error;
    } else if (error instanceof Error) {
      processedError = this.wrapError(error);
    } else {
      processedError = new BaseError(String(error), {
        type: ErrorTypes.SYSTEM,
        category: ErrorCategories.SYSTEM_ERROR,
        context: { originalError: error }
      });
    }

    // Add context
    processedError.context = { ...processedError.context, ...context };

    // Sanitize error for security
    this.sanitizeError(processedError);

    return processedError;
  }

  /**
   * Wrap native Error in BaseError
   */
  wrapError(error) {
    const errorType = this.classifyError(error);
    const ErrorClass = this.getErrorClass(errorType);

    return new ErrorClass(error.message, {
      code: error.code || 'WRAPPED_ERROR',
      cause: error,
      stack: error.stack,
      context: { originalError: error.name }
    });
  }

  /**
   * Classify error type
   */
  classifyError(error) {
    const message = error.message.toLowerCase();
    const stack = error.stack ? error.stack.toLowerCase() : '';

    if (message.includes('timeout') || message.includes('etimedout')) {
      return ErrorTypes.TIMEOUT;
    }
    if (message.includes('network') || message.includes('econnrefused') ||
        message.includes('enotfound') || message.includes('econnreset')) {
      return ErrorTypes.NETWORK;
    }
    if (message.includes('validation') || message.includes('invalid') ||
        message.includes('required') || message.includes('missing')) {
      return ErrorTypes.VALIDATION;
    }
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return ErrorTypes.AUTHENTICATION;
    }
    if (message.includes('forbidden') || message.includes('access denied')) {
      return ErrorTypes.AUTHORIZATION;
    }
    if (message.includes('redis') || stack.includes('redis')) {
      return ErrorTypes.REDIS;
    }
    if (message.includes('websocket') || stack.includes('websocket')) {
      return ErrorTypes.WEBSOCKET;
    }
    if (message.includes('swarm') || stack.includes('swarm')) {
      return ErrorTypes.SWARM;
    }
    if (message.includes('security') || message.includes('malicious')) {
      return ErrorTypes.SECURITY;
    }
    if (message.includes('resource') || message.includes('memory') ||
        message.includes('disk')) {
      return ErrorTypes.RESOURCE;
    }
    if (message.includes('config') || message.includes('setting')) {
      return ErrorTypes.CONFIGURATION;
    }

    return ErrorTypes.SYSTEM;
  }

  /**
   * Get error class for type
   */
  getErrorClass(type) {
    const errorClasses = {
      [ErrorTypes.VALIDATION]: ValidationError,
      [ErrorTypes.AUTHENTICATION]: AuthenticationError,
      [ErrorTypes.AUTHORIZATION]: AuthorizationError,
      [ErrorTypes.NETWORK]: NetworkError,
      [ErrorTypes.TIMEOUT]: TimeoutError,
      [ErrorTypes.RESOURCE]: ResourceError,
      [ErrorTypes.CONFIGURATION]: ConfigurationError,
      [ErrorTypes.SECURITY]: SecurityError,
      [ErrorTypes.SWARM]: SwarmError,
      [ErrorTypes.REDIS]: RedisError,
      [ErrorTypes.WEBSOCKET]: WebSocketError,
      [ErrorTypes.DASHBOARD]: DashboardError
    };

    return errorClasses[type] || BaseError;
  }

  /**
   * Sanitize error to prevent information leakage
   */
  sanitizeError(error) {
    const sensitivePatterns = [
      /password[=:][\w\-\.]+/gi,
      /secret[=:][\w\-\.]+/gi,
      /token[=:][\w\-\.]+/gi,
      /key[=:][\w\-\.]+/gi,
      /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g,
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    ];

    // Sanitize message
    sensitivePatterns.forEach(pattern => {
      error.message = error.message.replace(pattern, (match) => {
        const parts = match.split(/[=:]/);
        return parts.length >= 2 ? `${parts[0]}=***` : '***';
      });
    });

    // Sanitize stack trace in development
    if (error.stack && process.env.NODE_ENV === 'production') {
      error.stack = error.stack.replace(/[a-zA-Z]:\\[^\\]+\\/g, 'C:\\[PATH]\\')
                              .replace(/\/Users\/[^\/]+\//g, '/[USER]/')
                              .replace(/\/home\/[^\/]+\//g, '/[USER]/');
    }
  }

  /**
   * Log error
   */
  async logError(error) {
    const logLevel = this.getLogLevel(error.severity);
    const logEntry = {
      timestamp: error.timestamp,
      level: logLevel,
      errorId: error.errorId,
      type: error.type,
      severity: error.severity,
      message: error.message,
      code: error.code,
      context: error.context,
      suggestions: error.suggestions
    };

    console[logLevel](`[${error.errorId}] ${error.toString()}`);

    if (error.suggestions.length > 0) {
      console[logLevel]('Suggestions:', error.suggestions.join(', '));
    }
  }

  /**
   * Get log level for severity
   */
  getLogLevel(severity) {
    const levels = {
      [ErrorSeverity.LOW]: 'info',
      [ErrorSeverity.MEDIUM]: 'warn',
      [ErrorSeverity.HIGH]: 'error',
      [ErrorSeverity.CRITICAL]: 'error'
    };

    return levels[severity] || 'warn';
  }

  /**
   * Update error metrics
   */
  updateMetrics(error) {
    this.metrics.totalErrors++;

    this.metrics.errorsByType[error.type] =
      (this.metrics.errorsByType[error.type] || 0) + 1;

    this.metrics.errorsBySeverity[error.severity] =
      (this.metrics.errorsBySeverity[error.severity] || 0) + 1;

    // Track error counts for rate limiting
    const key = `${error.type}:${error.context.clientId || 'default'}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

    // Add to history
    this.errorHistory.push({
      errorId: error.errorId,
      timestamp: error.timestamp,
      type: error.type,
      severity: error.severity
    });

    // Keep history to last 1000 errors
    if (this.errorHistory.length > 1000) {
      this.errorHistory = this.errorHistory.slice(-1000);
    }
  }

  /**
   * Attempt error recovery
   */
  async attemptRecovery(error, context) {
    const strategy = this.recoveryStrategies.get(error.type);
    if (!strategy) {
      return error;
    }

    this.metrics.recoveryAttempts++;

    try {
      const result = await strategy(error, context);
      this.metrics.successfulRecoveries++;

      this.emit('recovered', {
        errorId: error.errorId,
        strategy: error.type,
        result
      });

      return { ...error, recovered: true, recoveryResult: result };
    } catch (recoveryError) {
      this.emit('recovery-failed', {
        errorId: error.errorId,
        strategy: error.type,
        recoveryError
      });

      return { ...error, recovered: false, recoveryError };
    }
  }

  /**
   * Register recovery strategy
   */
  registerRecoveryStrategy(errorType, strategy) {
    this.recoveryStrategies.set(errorType, strategy);
  }

  /**
   * Create async function wrapper with error handling
   */
  wrapAsync(fn, options = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        const processedError = await this.handleError(error, {
          function: fn.name,
          arguments: args.length,
          ...options.context
        });

        if (options.rethrow !== false) {
          throw processedError;
        }

        return { error: processedError };
      }
    };
  }

  /**
   * Create sync function wrapper with error handling
   */
  wrapSync(fn, options = {}) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        const processedError = this.processError(error, {
          function: fn.name,
          arguments: args.length,
          ...options.context
        });

        // Log synchronously for sync functions
        if (this.options.enableLogging) {
          console.error(`[${processedError.errorId}] ${processedError.toString()}`);
        }

        if (options.rethrow !== false) {
          throw processedError;
        }

        return { error: processedError };
      }
    };
  }

  /**
   * Get error statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      recentErrors: this.errorHistory.slice(-10),
      errorCounts: Object.fromEntries(this.errorCounts),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear error history and metrics
   */
  clear() {
    this.errorCounts.clear();
    this.errorHistory = [];
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
  }
}

// Create global error handler instance
export const globalErrorHandler = new ErrorHandler();

// Export convenience functions
export const handleError = (error, context) => globalErrorHandler.handleError(error, context);
export const wrapAsync = (fn, options) => globalErrorHandler.wrapAsync(fn, options);
export const wrapSync = (fn, options) => globalErrorHandler.wrapSync(fn, options);
export const registerRecoveryStrategy = (type, strategy) =>
  globalErrorHandler.registerRecoveryStrategy(type, strategy);

export default ErrorHandler;