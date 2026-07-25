/**
 * Centralized Error Handling Middleware
 *
 * Consistent error response format across all endpoints
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Custom API Error class
 */
export class APIError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Error handling middleware
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error for debugging
  console.error('API Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Handle custom API errors
  if (err instanceof APIError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Handle generic errors
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    },
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
};
