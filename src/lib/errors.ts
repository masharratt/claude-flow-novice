// Stub: common error types
// Created to satisfy test imports

export class BaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'BaseError';
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConfigurationError extends BaseError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class OperationError extends BaseError {
  constructor(message: string) {
    super(message, 'OPERATION_ERROR');
    this.name = 'OperationError';
  }
}

export class TimeoutError extends BaseError {
  constructor(message: string) {
    super(message, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}
