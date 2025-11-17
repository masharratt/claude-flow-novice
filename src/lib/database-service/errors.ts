/**
 * Database Error Handling Utilities
 *
 * Provides standardized error handling for database operations.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 */

import { DatabaseError, OperationResult } from './types.js';

/**
 * Database error codes
 */
export enum DatabaseErrorCode {
  CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  QUERY_FAILED = 'DB_QUERY_FAILED',
  TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  VALIDATION_FAILED = 'DB_VALIDATION_FAILED',
  NOT_FOUND = 'DB_NOT_FOUND',
  DUPLICATE_KEY = 'DB_DUPLICATE_KEY',
  TIMEOUT = 'DB_TIMEOUT',
  CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',
  UNKNOWN_ERROR = 'DB_UNKNOWN_ERROR',
}

/**
 * Create standardized database error
 */
export function createDatabaseError(
  code: DatabaseErrorCode,
  message: string,
  originalError?: Error,
  context?: Record<string, any>
): DatabaseError {
  return {
    code,
    message,
    originalError,
    context,
  };
}

/**
 * Create failed operation result
 */
export function createFailedResult<T = any>(error: DatabaseError): OperationResult<T> {
  return {
    success: false,
    error,
  };
}

/**
 * Create successful operation result
 */
export function createSuccessResult<T = any>(
  data?: T,
  rowsAffected?: number,
  insertId?: string | number
): OperationResult<T> {
  return {
    success: true,
    data,
    rowsAffected,
    insertId,
  };
}

/**
 * Wrap database operation with error handling
 */
export async function wrapDatabaseOperation<T>(
  operation: () => Promise<T>,
  errorCode: DatabaseErrorCode,
  errorMessage: string,
  context?: Record<string, any>
): Promise<OperationResult<T>> {
  try {
    const data = await operation();
    return createSuccessResult(data);
  } catch (err) {
    const error = createDatabaseError(
      errorCode,
      errorMessage,
      err instanceof Error ? err : new Error(String(err)),
      context
    );
    return createFailedResult(error);
  }
}

/**
 * Check if error is a specific database error code
 */
export function isDatabaseError(error: any, code: DatabaseErrorCode): boolean {
  return error && typeof error === 'object' && error.code === code;
}

/**
 * Map SQLite error to database error code
 */
export function mapSQLiteError(error: Error): DatabaseErrorCode {
  const message = error.message.toLowerCase();

  if (message.includes('unique constraint')) {
    return DatabaseErrorCode.DUPLICATE_KEY;
  }
  if (message.includes('foreign key constraint')) {
    return DatabaseErrorCode.CONSTRAINT_VIOLATION;
  }
  if (message.includes('not found')) {
    return DatabaseErrorCode.NOT_FOUND;
  }
  if (message.includes('timeout')) {
    return DatabaseErrorCode.TIMEOUT;
  }

  return DatabaseErrorCode.QUERY_FAILED;
}

/**
 * Map PostgreSQL error to database error code
 */
export function mapPostgresError(error: any): DatabaseErrorCode {
  const code = error.code;

  // PostgreSQL error codes
  if (code === '23505') {
    return DatabaseErrorCode.DUPLICATE_KEY;
  }
  if (code === '23503') {
    return DatabaseErrorCode.CONSTRAINT_VIOLATION;
  }
  if (code === '42P01') {
    return DatabaseErrorCode.NOT_FOUND;
  }
  if (code === '57014') {
    return DatabaseErrorCode.TIMEOUT;
  }
  if (code?.startsWith('08')) {
    return DatabaseErrorCode.CONNECTION_FAILED;
  }

  return DatabaseErrorCode.QUERY_FAILED;
}

/**
 * Map Redis error to database error code
 */
export function mapRedisError(error: Error): DatabaseErrorCode {
  const message = error.message.toLowerCase();

  if (message.includes('connection')) {
    return DatabaseErrorCode.CONNECTION_FAILED;
  }
  if (message.includes('timeout')) {
    return DatabaseErrorCode.TIMEOUT;
  }
  if (message.includes('not found') || message.includes('nil')) {
    return DatabaseErrorCode.NOT_FOUND;
  }

  return DatabaseErrorCode.QUERY_FAILED;
}
