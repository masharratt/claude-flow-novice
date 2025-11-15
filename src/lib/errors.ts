/**
 * Standard Error Utilities
 *
 * Provides standardized error handling with typed error codes and context.
 * Part of Task 0.5: Implementation Tooling & Utilities (Foundation)
 *
 * Usage:
 *   throw createError(ErrorCode.VALIDATION_FAILED, 'Invalid input', { field: 'email' });
 *   if (isErrorCode(error, ErrorCode.RETRY_EXHAUSTED)) { ... }
 */

import { DatabaseErrorCode } from './database-service/errors';

/**
 * Generic error codes (extends DatabaseErrorCode)
 */
export enum ErrorCode {
  // Database error codes (re-exported for convenience)
  DB_CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  DB_QUERY_FAILED = 'DB_QUERY_FAILED',
  DB_TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  DB_VALIDATION_FAILED = 'DB_VALIDATION_FAILED',
  DB_NOT_FOUND = 'DB_NOT_FOUND',
  DB_DUPLICATE_KEY = 'DB_DUPLICATE_KEY',
  DB_TIMEOUT = 'DB_TIMEOUT',
  DB_CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',
  DB_UNKNOWN_ERROR = 'DB_UNKNOWN_ERROR',

  // Generic error codes (new in Task 0.5)
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
  LOCK_TIMEOUT = 'LOCK_TIMEOUT',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Standard error class with typed error codes and context
 */
export class StandardError extends Error {
  /**
   * Error code for programmatic error handling
   */
  public readonly code: ErrorCode | string;

  /**
   * Additional context about the error
   */
  public readonly context?: Record<string, any>;

  /**
   * Timestamp when error was created
   */
  public readonly timestamp: Date;

  /**
   * Original error that caused this error (if any)
   */
  public readonly cause?: Error;

  /**
   * Create a new StandardError
   *
   * @param code - Error code
   * @param message - Human-readable error message
   * @param context - Additional context about the error
   * @param cause - Original error that caused this error
   */
  constructor(
    code: ErrorCode | string,
    message: string,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(message);
    this.name = 'StandardError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.cause = cause;

    // Maintain proper stack trace for where our error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StandardError);
    }

    // Append original error stack if available
    if (cause && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }

  /**
   * Convert error to JSON representation
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    };
  }

  /**
   * Convert error to string representation
   */
  toString(): string {
    let str = `${this.name} [${this.code}]: ${this.message}`;

    if (this.context && Object.keys(this.context).length > 0) {
      str += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
    }

    if (this.cause) {
      str += `\nCaused by: ${this.cause.message}`;
    }

    return str;
  }
}

/**
 * Create a StandardError instance
 *
 * @param code - Error code
 * @param message - Human-readable error message
 * @param context - Additional context about the error
 * @param cause - Original error that caused this error
 * @returns StandardError instance
 */
export function createError(
  code: ErrorCode | string,
  message: string,
  context?: Record<string, any>,
  cause?: Error
): StandardError {
  return new StandardError(code, message, context, cause);
}

/**
 * Check if an error has a specific error code
 *
 * @param error - Error to check
 * @param code - Error code to match
 * @returns True if error has the specified code
 */
export function isErrorCode(error: any, code: ErrorCode | string): boolean {
  if (!error) {
    return false;
  }

  // Check StandardError
  if (error instanceof StandardError) {
    return error.code === code;
  }

  // Check DatabaseError pattern (object with code property)
  if (typeof error === 'object' && 'code' in error) {
    return error.code === code;
  }

  return false;
}

/**
 * Check if error is a StandardError instance
 *
 * @param error - Error to check
 * @returns True if error is a StandardError
 */
export function isStandardError(error: any): error is StandardError {
  return error instanceof StandardError;
}

/**
 * Wrap an unknown error into a StandardError
 *
 * @param error - Unknown error to wrap
 * @param code - Error code to use (default: UNKNOWN_ERROR)
 * @param context - Additional context
 * @returns StandardError instance
 */
export function wrapError(
  error: unknown,
  code: ErrorCode | string = ErrorCode.UNKNOWN_ERROR,
  context?: Record<string, any>
): StandardError {
  if (error instanceof StandardError) {
    // Already a StandardError, return as-is or with additional context
    if (context) {
      return new StandardError(
        error.code,
        error.message,
        { ...error.context, ...context },
        error.cause
      );
    }
    return error;
  }

  if (error instanceof Error) {
    return new StandardError(code, error.message, context, error);
  }

  // Handle non-Error objects
  const message = typeof error === 'string' ? error : String(error);
  return new StandardError(code, message, context);
}

/**
 * Extract error message from unknown error
 *
 * @param error - Unknown error
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  return String(error);
}

/**
 * Extract error code from unknown error
 *
 * @param error - Unknown error
 * @returns Error code or undefined
 */
export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof StandardError) {
    return error.code;
  }

  if (error && typeof error === 'object' && 'code' in error) {
    return String(error.code);
  }

  return undefined;
}

/**
 * Check if error indicates a retryable condition
 *
 * @param error - Error to check
 * @returns True if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const retryableCodes = [
    ErrorCode.DB_TIMEOUT,
    ErrorCode.DB_CONNECTION_FAILED,
    ErrorCode.OPERATION_TIMEOUT,
    ErrorCode.NETWORK_ERROR,
    ErrorCode.LOCK_TIMEOUT,
  ];

  if (error instanceof StandardError) {
    return retryableCodes.includes(error.code as ErrorCode);
  }

  if (typeof error === 'object' && 'code' in error) {
    return retryableCodes.includes(error.code);
  }

  return false;
}

/**
 * Create a validation error
 *
 * @param message - Validation error message
 * @param field - Field that failed validation
 * @param value - Invalid value (optional)
 * @returns StandardError instance
 */
export function createValidationError(
  message: string,
  field?: string,
  value?: any
): StandardError {
  const context: Record<string, any> = {};

  if (field) {
    context.field = field;
  }

  if (value !== undefined) {
    context.value = value;
  }

  return new StandardError(ErrorCode.VALIDATION_FAILED, message, context);
}

/**
 * Create a retry exhausted error
 *
 * @param attempts - Number of retry attempts made
 * @param lastError - Last error encountered
 * @returns StandardError instance
 */
export function createRetryExhaustedError(
  attempts: number,
  lastError?: Error
): StandardError {
  return new StandardError(
    ErrorCode.RETRY_EXHAUSTED,
    `Operation failed after ${attempts} retry attempts`,
    { attempts },
    lastError
  );
}

/**
 * Create a timeout error
 *
 * @param operation - Operation that timed out
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns StandardError instance
 */
export function createTimeoutError(operation: string, timeoutMs: number): StandardError {
  return new StandardError(
    ErrorCode.OPERATION_TIMEOUT,
    `Operation '${operation}' timed out after ${timeoutMs}ms`,
    { operation, timeoutMs }
  );
}
