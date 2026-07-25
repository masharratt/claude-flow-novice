/**
 * Validation Middleware using Zod
 *
 * Express middleware for request validation
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Create validation middleware for request components
 */
export const validate = (schemas: {
  params?: ZodSchema;
  query?: ZodSchema;
  body?: ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate params
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      // Validate query
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      // Validate body
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.errors.map((err) => ({
              path: err.path.join('.'),
              message: err.message,
            })),
          },
        });
        return;
      }

      next(error);
    }
  };
};
