/**
 * Error Handler Middleware
 *
 * Centralized error handling for the transparency API server
 *
 * @module web/api/middleware/error-handler
 */

import { Request, Response, NextFunction } from 'express';
import type { Logger } from '../../../core/logger.js';
import type { ApiConfig } from '../config/api-config.js';

/**
 * API Error class
 */
export class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string,
    details?: any
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/**
 * Validation Error class
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 400, true, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Not Found Error class
 */
export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, 404, true, 'NOT_FOUND', { resource, id });
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized Error class
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, true, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden Error class
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, true, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Rate Limit Error class
 */
export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, true, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

/**
 * Error Handler Middleware Factory
 */
export function errorHandler(logger: Logger) {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    // Default error values
    let statusCode = 500;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';
    let details: any = undefined;
    let isOperational = false;

    // Handle known error types
    if (err instanceof ApiError) {
      statusCode = err.statusCode;
      errorCode = err.code || 'API_ERROR';
      message = err.message;
      details = err.details;
      isOperational = err.isOperational;
    } else if (err.name === 'ValidationError') {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = err.message;
      isOperational = true;
    } else if (err.name === 'CastError') {
      statusCode = 400;
      errorCode = 'INVALID_ID';
      message = 'Invalid ID format';
      isOperational = true;
    } else if (err.name === 'JsonWebTokenError') {
      statusCode = 401;
      errorCode = 'INVALID_TOKEN';
      message = 'Invalid authentication token';
      isOperational = true;
    } else if (err.name === 'TokenExpiredError') {
      statusCode = 401;
      errorCode = 'TOKEN_EXPIRED';
      message = 'Authentication token expired';
      isOperational = true;
    } else if (err.name === 'MulterError') {
      statusCode = 400;
      errorCode = 'FILE_UPLOAD_ERROR';
      message = 'File upload error';
      isOperational = true;
    } else if (err.name === 'SyntaxError' && (err as any).type === 'entity.parse.failed') {
      statusCode = 400;
      errorCode = 'INVALID_JSON';
      message = 'Invalid JSON in request body';
      isOperational = true;
    }

    // Log error
    const logData = {
      error: {
        name: err.name,
        message: err.message,
        code: errorCode,
        statusCode,
        isOperational,
        stack: err.stack
      },
      request: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        user: (req as any).user?.id || 'anonymous'
      },
      details
    };

    if (isOperational) {
      logger.warn('Operational error', logData);
    } else {
      logger.error('Non-operational error', logData);
    }

    // Build error response
    const errorResponse: any = {
      error: errorCode,
      message,
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || 'unknown'
    };

    // Include details in development or for operational errors
    if (process.env.NODE_ENV === 'development' || isOperational) {
      if (details) {
        errorResponse.details = details;
      }

      if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
      }
    }

    // Include request path for debugging
    if (process.env.NODE_ENV === 'development') {
      errorResponse.path = req.path;
      errorResponse.method = req.method;
    }

    res.status(statusCode).json(errorResponse);
  };
}

/**
 * Async Error Wrapper
 *
 * Wraps async route handlers to automatically catch errors
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Handler
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
}

/**
 * Create error from validation result
 */
export function createValidationError(validationResult: any): ValidationError {
  const details = validationResult.errors?.map((error: any) => ({
    field: error.path || error.field,
    message: error.message,
    value: error.value
  }));

  return new ValidationError('Validation failed', details);
}

/**
 * Handle Prisma errors (if using Prisma ORM)
 */
export function handlePrismaError(err: any): ApiError {
  switch (err.code) {
    case 'P2002':
      return new ApiError('Unique constraint violation', 409, true, 'UNIQUE_VIOLATION', {
        target: err.meta?.target
      });

    case 'P2025':
      return new NotFoundError('Record', err.meta?.cause);

    case 'P2003':
      return new ValidationError('Foreign key constraint violation', {
        field: err.meta?.field_name
      });

    case 'P2014':
      return new ApiError('Relation violation', 400, true, 'RELATION_VIOLATION', {
        relation: err.meta?.relation_name
      });

    case 'P2021':
      return new ApiError('Table does not exist', 500, false, 'TABLE_NOT_FOUND', {
        table: err.meta?.table
      });

    default:
      return new ApiError('Database error', 500, false, 'DATABASE_ERROR', {
        code: err.code,
        message: err.message
      });
  }
}

/**
 * Handle Mongoose errors (if using Mongoose ODM)
 */
export function handleMongooseError(err: any): ApiError {
  if (err.name === 'ValidationError') {
    const details = Object.keys(err.errors).map(key => ({
      field: key,
      message: err.errors[key].message,
      value: err.errors[key].value
    }));
    return new ValidationError('Validation failed', details);
  }

  if (err.name === 'CastError') {
    return new ValidationError(`Invalid ${err.path}: ${err.value}`);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return new ApiError('Duplicate field value', 409, true, 'DUPLICATE_FIELD', { field });
  }

  return new ApiError('Database error', 500, false, 'DATABASE_ERROR', {
    name: err.name,
    message: err.message
  });
}