/**
 * Validation Middleware
 *
 * Request validation middleware using JSON Schema
 *
 * @module web/api/middleware/validation
 */

import { Request, Response, NextFunction } from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError } from './error-handler.js';

/**
 * Validation schema interface
 */
interface ValidationSchema {
  body?: object;
  query?: object;
  params?: object;
  headers?: object;
}

/**
 * JSON Schema validator
 */
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false,
  removeAdditional: 'all',
  useDefaults: true,
  coerceTypes: true
});

// Add formats for JSON Schema validation
addFormats(ajv);

/**
 * Validation middleware factory
 */
export function validationMiddleware(schema: ValidationSchema) {
  const validators = {
    body: schema.body ? ajv.compile(schema.body) : null,
    query: schema.query ? ajv.compile(schema.query) : null,
    params: schema.params ? ajv.compile(schema.params) : null,
    headers: schema.headers ? ajv.compile(schema.headers) : null
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const errors: any[] = [];

    // Validate request body
    if (validators.body) {
      if (!validators.body(req.body)) {
        errors.push({
          location: 'body',
          errors: formatAjvErrors(validators.body.errors || [])
        });
      }
    }

    // Validate query parameters
    if (validators.query) {
      if (!validators.query(req.query)) {
        errors.push({
          location: 'query',
          errors: formatAjvErrors(validators.query.errors || [])
        });
      }
    }

    // Validate route parameters
    if (validators.params) {
      if (!validators.params(req.params)) {
        errors.push({
          location: 'params',
          errors: formatAjvErrors(validators.params.errors || [])
        });
      }
    }

    // Validate headers
    if (validators.headers) {
      if (!validators.headers(req.headers)) {
        errors.push({
          location: 'headers',
          errors: formatAjvErrors(validators.headers.errors || [])
        });
      }
    }

    // Return validation errors if any
    if (errors.length > 0) {
      throw new ValidationError('Request validation failed', { errors });
    }

    next();
  };
}

/**
 * Format AJV errors for better readability
 */
function formatAjvErrors(errors: any[]): any[] {
  return errors.map(error => {
    const field = error.instancePath || error.schemaPath || 'unknown';
    const message = error.message || 'Validation error';
    const value = error.data;

    return {
      field,
      message,
      value,
      allowedValues: error.schema?.enum,
      constraint: error.keyword,
      schema: error.schema
    };
  });
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // Pagination query parameters
  pagination: {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        minimum: 1,
        default: 1,
        description: 'Page number'
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Items per page'
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'Number of items to skip'
      },
      sort: {
        type: 'string',
        description: 'Sort field'
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'desc',
        description: 'Sort order'
      }
    }
  },

  // Date range query parameters
  dateRange: {
    type: 'object',
    properties: {
      startDate: {
        type: 'string',
        format: 'date-time',
        description: 'Start date (ISO 8601)'
      },
      endDate: {
        type: 'string',
        format: 'date-time',
        description: 'End date (ISO 8601)'
      }
    },
    additionalProperties: false
  },

  // Agent ID parameter
  agentIdParam: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        minLength: 1,
        description: 'Agent ID'
      }
    },
    required: ['agentId'],
    additionalProperties: false
  },

  // Event type filter
  eventTypeFilter: {
    type: 'object',
    properties: {
      eventType: {
        type: 'string',
        enum: [
          'spawned',
          'paused',
          'resumed',
          'terminated',
          'checkpoint_created',
          'checkpoint_restored',
          'state_changed',
          'task_assigned',
          'task_completed',
          'error_occurred'
        ],
        description: 'Event type filter'
      }
    },
    additionalProperties: false
  },

  // Agent level filter
  levelFilter: {
    type: 'object',
    properties: {
      level: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Agent hierarchy level'
      }
    },
    additionalProperties: false
  },

  // Agent state filter
  stateFilter: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: [
          'idle',
          'active',
          'paused',
          'terminated',
          'error',
          'completing',
          'checkpointing',
          'waiting_for_dependency'
        ],
        description: 'Agent state filter'
      }
    },
    additionalProperties: false
  },

  // WebSocket subscription
  subscription: {
    type: 'object',
    properties: {
      channels: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'agent-status',
            'hierarchy',
            'events',
            'metrics',
            'alerts',
            'system'
          ]
        },
        uniqueItems: true,
        minItems: 1,
        description: 'WebSocket channels to subscribe to'
      }
    },
    required: ['channels'],
    additionalProperties: false
  }
};

/**
 * Create validation schema for specific endpoints
 */
export function createSchema(overrides: Partial<ValidationSchema>): ValidationSchema {
  return overrides;
}

/**
 * Validate UUID string
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate ISO date string
 */
export function isValidISODate(date: string): boolean {
  if (!date) return false;
  const parsed = new Date(date);
  return !isNaN(parsed.getTime()) && date === parsed.toISOString();
}

/**
 * Sanitize and validate input string
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes and control characters
  const sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');

  // Truncate if too long
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) : sanitized;
}

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate numeric range
 */
export function isValidNumber(value: any, min?: number, max?: number): boolean {
  const num = Number(value);
  if (isNaN(num)) return false;
  if (min !== undefined && num < min) return false;
  if (max !== undefined && num > max) return false;
  return true;
}

/**
 * Validate array of strings
 */
export function isValidStringArray(value: any, allowedValues?: string[]): boolean {
  if (!Array.isArray(value)) return false;
  return value.every(item =>
    typeof item === 'string' &&
    (!allowedValues || allowedValues.includes(item))
  );
}

/**
 * Middleware to validate content type
 */
export function validateContentType(allowedTypes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.get('Content-Type');

    if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
      throw new ValidationError(`Content-Type must be one of: ${allowedTypes.join(', ')}`);
    }

    next();
  };
}

/**
 * Middleware to validate request size
 */
export function validateRequestSize(maxSizeBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('Content-Length') || '0', 10);

    if (contentLength > maxSizeBytes) {
      throw new ValidationError(`Request size exceeds maximum allowed size of ${maxSizeBytes} bytes`);
    }

    next();
  };
}