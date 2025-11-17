/**
 * Mock Error Classes for Integration Tests
 */

export enum ErrorCode {
  UNKNOWN = 'UNKNOWN',
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INTERNAL = 'INTERNAL',
  EXTERNAL = 'EXTERNAL',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  DATABASE = 'DATABASE',
  NETWORK = 'NETWORK',
}

export class StandardError extends Error {
  constructor(
    message: string,
    public code: ErrorCode = ErrorCode.UNKNOWN,
    public details?: any
  ) {
    super(message);
    this.name = 'StandardError';
  }
}

export class ValidationError extends StandardError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.VALIDATION, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends StandardError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.NOT_FOUND, details);
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends StandardError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.DATABASE, details);
    this.name = 'DatabaseError';
  }
}
