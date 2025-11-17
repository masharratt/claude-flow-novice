/**
 * Schema Validation Middleware
 *
 * Task: P2-3.2 - JSON Schema Validation Enforcement
 * Provides Express middleware for automatic schema validation
 *
 * Usage:
 * ```typescript
 * app.post('/api/pattern-deployment',
 *   validateRequest('database-handoffs/pattern-deployment', '1.0.0'),
 *   handlePatternDeployment
 * );
 * ```
 *
 * @module schema-validation
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { IntegrationSchemaValidator } from '../lib/integration-schema-validator.js';
import { StandardError, ErrorCode } from '../lib/errors.js';
import { getGlobalLogger } from '../lib/logging.js';
import path from 'path';

const logger = getGlobalLogger();

// ============================================================================
// Global Validator Instance
// ============================================================================

let globalValidator: IntegrationSchemaValidator | null = null;

/**
 * Initialize global validator instance
 */
export async function initializeSchemaValidation(schemaPath?: string): Promise<void> {
  const resolvedPath = schemaPath || path.join(process.cwd(), 'schemas/integration-points');

  globalValidator = new IntegrationSchemaValidator({
    schemaPath: resolvedPath,
    enableCache: true,
    strictMode: true,
  });

  await globalValidator.initialize();

  logger.info('Schema validation middleware initialized', {
    schemaPath: resolvedPath,
  });
}

/**
 * Get global validator instance
 */
function getValidator(): IntegrationSchemaValidator {
  if (!globalValidator) {
    throw new StandardError(
      ErrorCode.CONFIGURATION_ERROR,
      'Schema validator not initialized. Call initializeSchemaValidation() first.',
      { initialized: false }
    );
  }

  return globalValidator;
}

// ============================================================================
// Middleware Functions
// ============================================================================

/**
 * Validate request body against schema
 *
 * @param schemaId - Schema identifier (e.g., "database-handoffs/pattern-deployment")
 * @param version - Schema version (optional, defaults to latest)
 * @param options - Validation options
 */
export function validateRequest(
  schemaId: string,
  version?: string,
  options: ValidationOptions = {}
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    try {
      const validator = getValidator();

      // Validate request body
      await validator.validate(req.body, schemaId, version);

      const duration = Date.now() - startTime;

      logger.debug('Request validation succeeded', {
        schemaId,
        version,
        path: req.path,
        method: req.method,
        duration,
      });

      // Store validated data in request for downstream use
      if (options.attachValidatedData) {
        (req as any).validatedData = req.body;
      }

      next();
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.warn('Request validation failed', {
        schemaId,
        version,
        path: req.path,
        method: req.method,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof StandardError) {
        res.status(400).json({
          error: 'Validation Failed',
          message: error.message,
          code: error.code,
          details: error.context?.errors || [],
          suggestions: error.context?.suggestions || [],
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Schema validation error',
        });
      }
    }
  };
}

/**
 * Validate response body against schema
 *
 * @param schemaId - Schema identifier
 * @param version - Schema version (optional)
 */
export function validateResponse(
  schemaId: string,
  version?: string
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const originalSend = res.send;
    const originalJson = res.json;

    // Intercept res.send()
    res.send = function (data: any): Response {
      validateResponseData(data, schemaId, version, req, res);
      return originalSend.call(this, data);
    };

    // Intercept res.json()
    res.json = function (data: any): Response {
      validateResponseData(data, schemaId, version, req, res);
      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Validate response data helper
 */
async function validateResponseData(
  data: any,
  schemaId: string,
  version: string | undefined,
  req: Request,
  res: Response
): Promise<void> {
  const startTime = Date.now();

  try {
    const validator = getValidator();

    // Only validate if response is successful (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      await validator.validate(data, schemaId, version);

      const duration = Date.now() - startTime;

      logger.debug('Response validation succeeded', {
        schemaId,
        version,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Response validation failed', error as Error, {
      schemaId,
      version,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    });

    // Log error but don't modify response
    // Response validation failures are logged for monitoring
  }
}

/**
 * Validate both request and response
 */
export function validateRequestResponse(
  requestSchemaId: string,
  responseSchemaId: string,
  requestVersion?: string,
  responseVersion?: string
): RequestHandler[] {
  return [
    validateRequest(requestSchemaId, requestVersion),
    validateResponse(responseSchemaId, responseVersion),
  ];
}

/**
 * Create validation middleware with custom error handler
 */
export function createValidationMiddleware(options: MiddlewareOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    try {
      const validator = getValidator();

      // Determine schema based on request path or custom function
      let schemaId: string;
      let version: string | undefined;

      if (options.schemaResolver) {
        const resolved = options.schemaResolver(req);
        schemaId = resolved.schemaId;
        version = resolved.version;
      } else if (options.schemaId) {
        schemaId = options.schemaId;
        version = options.version;
      } else {
        throw new StandardError(
          ErrorCode.CONFIGURATION_ERROR,
          'No schema resolver or schemaId provided',
          { options }
        );
      }

      // Validate request body
      await validator.validate(req.body, schemaId, version);

      const duration = Date.now() - startTime;

      logger.debug('Validation middleware succeeded', {
        schemaId,
        version,
        path: req.path,
        duration,
      });

      next();
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.warn('Validation middleware failed', {
        path: req.path,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      if (options.errorHandler) {
        options.errorHandler(error as Error, req, res, next);
      } else {
        // Default error handler
        if (error instanceof StandardError) {
          res.status(400).json({
            error: 'Validation Failed',
            message: error.message,
            code: error.code,
            details: error.context?.errors || [],
          });
        } else {
          res.status(500).json({
            error: 'Internal Server Error',
            message: 'Validation error',
          });
        }
      }
    }
  };
}

/**
 * Validate query parameters against schema
 */
export function validateQueryParams(
  schemaId: string,
  version?: string
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validator = getValidator();

      // Validate query parameters
      await validator.validate(req.query, schemaId, version);

      logger.debug('Query parameter validation succeeded', {
        schemaId,
        version,
        path: req.path,
      });

      next();
    } catch (error) {
      logger.warn('Query parameter validation failed', {
        schemaId,
        version,
        path: req.path,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof StandardError) {
        res.status(400).json({
          error: 'Invalid Query Parameters',
          message: error.message,
          details: error.context?.errors || [],
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
        });
      }
    }
  };
}

/**
 * Batch validation middleware
 * Validates an array of items in request body
 */
export function validateBatch(
  schemaId: string,
  version?: string,
  options: BatchValidationMiddlewareOptions = {}
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validator = getValidator();

      // Ensure request body is an array
      if (!Array.isArray(req.body)) {
        throw new StandardError(
          ErrorCode.VALIDATION_FAILED,
          'Request body must be an array for batch validation',
          { bodyType: typeof req.body }
        );
      }

      // Validate batch
      const result = await validator.validateBatch(req.body, schemaId, version, {
        failFast: options.failFast,
      });

      if (!result.valid) {
        res.status(400).json({
          error: 'Batch Validation Failed',
          message: `${result.invalidRecords} of ${result.totalRecords} records failed validation`,
          totalRecords: result.totalRecords,
          validRecords: result.validRecords,
          invalidRecords: result.invalidRecords,
          errors: result.errors,
        });
        return;
      }

      logger.debug('Batch validation succeeded', {
        schemaId,
        version,
        totalRecords: result.totalRecords,
      });

      next();
    } catch (error) {
      if (error instanceof StandardError) {
        res.status(400).json({
          error: 'Batch Validation Error',
          message: error.message,
          code: error.code,
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
        });
      }
    }
  };
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface ValidationOptions {
  /**
   * Attach validated data to request object
   * @default false
   */
  attachValidatedData?: boolean;
}

export interface SchemaResolverResult {
  schemaId: string;
  version?: string;
}

export interface MiddlewareOptions {
  /**
   * Schema ID (if static)
   */
  schemaId?: string;

  /**
   * Schema version (if static)
   */
  version?: string;

  /**
   * Function to resolve schema dynamically based on request
   */
  schemaResolver?: (req: Request) => SchemaResolverResult;

  /**
   * Custom error handler
   */
  errorHandler?: (error: Error, req: Request, res: Response, next: NextFunction) => void;
}

export interface BatchValidationMiddlewareOptions {
  /**
   * Stop on first validation error
   * @default false
   */
  failFast?: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create schema resolver based on route patterns
 *
 * Example:
 * ```typescript
 * const resolver = createRouteSchemaResolver({
 *   '/api/patterns': 'database-handoffs/pattern-deployment',
 *   '/api/metrics': 'database-handoffs/execution-metrics',
 * });
 * ```
 */
export function createRouteSchemaResolver(
  routeMap: Record<string, string>
): (req: Request) => SchemaResolverResult {
  return (req: Request): SchemaResolverResult => {
    const schemaId = routeMap[req.path];

    if (!schemaId) {
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        `No schema mapping found for route: ${req.path}`,
        { path: req.path, availableRoutes: Object.keys(routeMap) }
      );
    }

    return { schemaId };
  };
}

/**
 * Shutdown schema validation middleware
 */
export async function shutdownSchemaValidation(): Promise<void> {
  if (globalValidator) {
    await globalValidator.shutdown();
    globalValidator = null;

    logger.info('Schema validation middleware shutdown complete');
  }
}
