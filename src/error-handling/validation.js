/**
 * Input Validation Middleware and Decorators
 *
 * Provides comprehensive input validation and sanitization for production robustness.
 */

import { ValidationError } from './index.js';

/**
 * Validation rule types
 */
export const ValidationTypes = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  EMAIL: 'email',
  URL: 'url',
  UUID: 'uuid',
  DATE: 'date',
  ARRAY: 'array',
  OBJECT: 'object',
  JSON: 'json',
  ALPHANUMERIC: 'alphanumeric',
  REGEX: 'regex',
  CUSTOM: 'custom'
};

/**
 * Validation constraints
 */
export const ValidationConstraints = {
  // String constraints
  MIN_LENGTH: 'minLength',
  MAX_LENGTH: 'maxLength',
  PATTERN: 'pattern',
  ALLOW_EMPTY: 'allowEmpty',
  TRIM: 'trim',
  SANITIZE_HTML: 'sanitizeHtml',
  NORMALIZE_WHITESPACE: 'normalizeWhitespace',
  REMOVE_CONTROL_CHARS: 'removeControlChars',

  // Number constraints
  MIN_VALUE: 'minValue',
  MAX_VALUE: 'maxValue',
  INTEGER: 'integer',
  POSITIVE: 'positive',
  NEGATIVE: 'negative',

  // Array constraints
  MIN_ITEMS: 'minItems',
  MAX_ITEMS: 'maxItems',
  UNIQUE_ITEMS: 'uniqueItems',

  // General constraints
  REQUIRED: 'required',
  OPTIONAL: 'optional',
  DEFAULT: 'default',
  ENUM: 'enum'
};

/**
 * Security patterns for sanitization
 */
const SECURITY_PATTERNS = {
  HTML_INJECTION: /<[^>]*>/g,
  JAVASCRIPT_INJECTION: /javascript:/gi,
  SQL_INJECTION: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
  XSS: /(\bon\w+\s*=|javascript:|vbscript:|data:)/gi,
  PATH_TRAVERSAL: /\.\.[\/\\]/g,
  CONTROL_CHARS: /[\x00-\x1F\x7F]/g,
  ENCODING_ATTEMPTS: /\\x[0-9a-fA-F]{2}|%[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}/g
};

/**
 * Validation context
 */
class ValidationContext {
  constructor(options = {}) {
    this.options = {
      strict: true,           // Throw errors vs. collect them
      sanitize: true,         // Apply sanitization
      security: true,         // Apply security checks
      locale: 'en-US',        // Locale for validation
      ...options
    };
    this.errors = [];
    this.warnings = [];
    this.data = {};
  }

  addError(message, field, value) {
    const error = new ValidationError(message, {
      context: { field, value, context: 'validation' },
      suggestions: this.getSuggestions(field, value)
    });

    if (this.options.strict) {
      throw error;
    } else {
      this.errors.push(error);
    }
  }

  addWarning(message, field) {
    this.warnings.push({ message, field });
  }

  getSuggestions(field, value) {
    const suggestions = [];

    if (!value) {
      suggestions.push(`Provide a value for ${field}`);
    }

    if (typeof value === 'string') {
      if (value.trim().length === 0) {
        suggestions.push(`Ensure ${field} is not empty or just whitespace`);
      }
      if (value.length > 1000) {
        suggestions.push(`Consider shortening the ${field} value`);
      }
    }

    return suggestions;
  }
}

/**
 * Validation rule class
 */
export class ValidationRule {
  constructor(type, constraints = {}) {
    this.type = type;
    this.constraints = constraints;
  }

  validate(value, field, context) {
    // Check if value is required
    if (this.constraints[ValidationConstraints.REQUIRED] && (value === undefined || value === null)) {
      context.addError(`${field} is required`, field, value);
      return;
    }

    // If value is not required and is empty, skip validation
    if (!this.constraints[ValidationConstraints.REQUIRED] && (value === undefined || value === null || value === '')) {
      // Apply default value if specified
      if (this.constraints[ValidationConstraints.DEFAULT] !== undefined) {
        context.data[field] = this.constraints[ValidationConstraints.DEFAULT];
      }
      return;
    }

    // Apply sanitization if enabled
    if (context.options.sanitize) {
      value = this.sanitize(value, context);
    }

    // Perform type-specific validation
    this.validateType(value, field, context);

    // Apply constraints
    this.applyConstraints(value, field, context);

    // Store validated value
    context.data[field] = value;
  }

  sanitize(value, context) {
    if (typeof value !== 'string') {
      return value;
    }

    let sanitized = value;

    // Apply sanitization based on constraints
    if (this.constraints[ValidationConstraints.TRIM] !== false) {
      sanitized = sanitized.trim();
    }

    if (this.constraints[ValidationConstraints.SANITIZE_HTML]) {
      sanitized = sanitized.replace(SECURITY_PATTERNS.HTML_INJECTION, '');
    }

    if (this.constraints[ValidationConstraints.NORMALIZE_WHITESPACE]) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }

    if (this.constraints[ValidationConstraints.REMOVE_CONTROL_CHARS]) {
      sanitized = sanitized.replace(SECURITY_PATTERNS.CONTROL_CHARS, '');
    }

    // Apply security sanitization if enabled
    if (context.options.security) {
      Object.values(SECURITY_PATTERNS).forEach(pattern => {
        if (pattern !== SECURITY_PATTERNS.CONTROL_CHARS) {
          sanitized = sanitized.replace(pattern, '');
        }
      });
    }

    // Check for encoding attempts
    if (SECURITY_PATTERNS.ENCODING_ATTEMPTS.test(sanitized)) {
      context.addWarning(`Potential encoding attempt detected in ${field}`, field);
    }

    return sanitized;
  }

  validateType(value, field, context) {
    switch (this.type) {
      case ValidationTypes.STRING:
        if (typeof value !== 'string') {
          context.addError(`${field} must be a string`, field, value);
        }
        break;

      case ValidationTypes.NUMBER:
        const numValue = Number(value);
        if (isNaN(numValue)) {
          context.addError(`${field} must be a valid number`, field, value);
        } else if (this.constraints[ValidationConstraints.INTEGER] && !Number.isInteger(numValue)) {
          context.addError(`${field} must be an integer`, field, value);
        }
        break;

      case ValidationTypes.BOOLEAN:
        if (typeof value !== 'boolean') {
          const strValue = String(value).toLowerCase();
          if (!['true', 'false', '1', '0', 'yes', 'no'].includes(strValue)) {
            context.addError(`${field} must be a boolean`, field, value);
          }
        }
        break;

      case ValidationTypes.EMAIL:
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(value)) {
          context.addError(`${field} must be a valid email address`, field, value);
        }
        break;

      case ValidationTypes.URL:
        try {
          new URL(value);
        } catch {
          context.addError(`${field} must be a valid URL`, field, value);
        }
        break;

      case ValidationTypes.UUID:
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidPattern.test(value)) {
          context.addError(`${field} must be a valid UUID`, field, value);
        }
        break;

      case ValidationTypes.DATE:
        const dateValue = new Date(value);
        if (isNaN(dateValue.getTime())) {
          context.addError(`${field} must be a valid date`, field, value);
        }
        break;

      case ValidationTypes.ARRAY:
        if (!Array.isArray(value)) {
          context.addError(`${field} must be an array`, field, value);
        }
        break;

      case ValidationTypes.OBJECT:
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          context.addError(`${field} must be an object`, field, value);
        }
        break;

      case ValidationTypes.JSON:
        try {
          if (typeof value !== 'string') {
            JSON.stringify(value);
          } else {
            JSON.parse(value);
          }
        } catch {
          context.addError(`${field} must be valid JSON`, field, value);
        }
        break;

      case ValidationTypes.ALPHANUMERIC:
        const alphanumPattern = /^[a-zA-Z0-9]+$/;
        if (!alphanumPattern.test(value)) {
          context.addError(`${field} must contain only alphanumeric characters`, field, value);
        }
        break;

      case ValidationTypes.REGEX:
        if (this.constraints.pattern && !this.constraints.pattern.test(value)) {
          context.addError(`${field} does not match required pattern`, field, value);
        }
        break;

      case ValidationTypes.CUSTOM:
        if (this.constraints.validator && typeof this.constraints.validator === 'function') {
          const result = this.constraints.validator(value);
          if (result !== true) {
            context.addError(result || `${field} failed custom validation`, field, value);
          }
        }
        break;
    }
  }

  applyConstraints(value, field, context) {
    // String constraints
    if (typeof value === 'string') {
      const minLength = this.constraints[ValidationConstraints.MIN_LENGTH];
      const maxLength = this.constraints[ValidationConstraints.MAX_LENGTH];

      if (minLength !== undefined && value.length < minLength) {
        context.addError(`${field} must be at least ${minLength} characters long`, field, value);
      }

      if (maxLength !== undefined && value.length > maxLength) {
        context.addError(`${field} must not exceed ${maxLength} characters`, field, value);
      }

      const pattern = this.constraints[ValidationConstraints.PATTERN];
      if (pattern && !pattern.test(value)) {
        context.addError(`${field} does not match required pattern`, field, value);
      }
    }

    // Number constraints
    if (typeof value === 'number' || !isNaN(Number(value))) {
      const numValue = Number(value);
      const minValue = this.constraints[ValidationConstraints.MIN_VALUE];
      const maxValue = this.constraints[ValidationConstraints.MAX_VALUE];

      if (minValue !== undefined && numValue < minValue) {
        context.addError(`${field} must be at least ${minValue}`, field, value);
      }

      if (maxValue !== undefined && numValue > maxValue) {
        context.addError(`${field} must not exceed ${maxValue}`, field, value);
      }

      if (this.constraints[ValidationConstraints.POSITIVE] && numValue <= 0) {
        context.addError(`${field} must be positive`, field, value);
      }

      if (this.constraints[ValidationConstraints.NEGATIVE] && numValue >= 0) {
        context.addError(`${field} must be negative`, field, value);
      }
    }

    // Array constraints
    if (Array.isArray(value)) {
      const minItems = this.constraints[ValidationConstraints.MIN_ITEMS];
      const maxItems = this.constraints[ValidationConstraints.MAX_ITEMS];

      if (minItems !== undefined && value.length < minItems) {
        context.addError(`${field} must have at least ${minItems} items`, field, value);
      }

      if (maxItems !== undefined && value.length > maxItems) {
        context.addError(`${field} must not exceed ${maxItems} items`, field, value);
      }

      if (this.constraints[ValidationConstraints.UNIQUE_ITEMS]) {
        const unique = new Set(value);
        if (unique.size !== value.length) {
          context.addError(`${field} must contain unique items`, field, value);
        }
      }
    }

    // Enum constraint
    const enumValues = this.constraints[ValidationConstraints.ENUM];
    if (enumValues && !enumValues.includes(value)) {
      context.addError(`${field} must be one of: ${enumValues.join(', ')}`, field, value);
    }
  }
}

/**
 * Validation schema class
 */
export class ValidationSchema {
  constructor(rules = {}) {
    this.rules = rules;
  }

  addRule(field, type, constraints = {}) {
    this.rules[field] = new ValidationRule(type, constraints);
    return this;
  }

  removeRule(field) {
    delete this.rules[field];
    return this;
  }

  validate(data, options = {}) {
    const context = new ValidationContext(options);

    for (const [field, rule] of Object.entries(this.rules)) {
      const value = data && data[field] !== undefined ? data[field] : undefined;
      rule.validate(value, field, context);
    }

    // Return result based on mode
    if (options.strict === false) {
      return {
        valid: context.errors.length === 0,
        data: context.data,
        errors: context.errors,
        warnings: context.warnings
      };
    }

    // In strict mode, errors are thrown, so just return data
    return {
      valid: true,
      data: context.data,
      warnings: context.warnings
    };
  }

  static create(rules) {
    return new ValidationSchema(rules);
  }
}

/**
 * Decorator for method parameter validation
 */
export function validate(validator) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function(...args) {
      try {
        const validatedArgs = validator(args);
        return originalMethod.apply(this, validatedArgs);
      } catch (error) {
        error.context = {
          ...error.context,
          method: propertyKey,
          className: target.constructor.name,
          arguments: args.length
        };
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Decorator for class property validation
 */
export function validateProperty(schema) {
  return function(target, propertyKey) {
    let value = target[propertyKey];

    const getter = function() {
      return value;
    };

    const setter = function(newValue) {
      const validationSchema = schema instanceof ValidationSchema ? schema : ValidationSchema.create(schema);
      const result = validationSchema.validate({ [propertyKey]: newValue });

      if (result.valid) {
        value = newValue;
      } else {
        throw new ValidationError(`Invalid value for property ${propertyKey}`, {
          context: { property: propertyKey, value: newValue, errors: result.errors }
        });
      }
    };

    Object.defineProperty(target, propertyKey, {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true
    });
  };
}

/**
 * Middleware function for Express-style validation
 */
export function validationMiddleware(schema, options = {}) {
  return (req, res, next) => {
    try {
      const validationSchema = schema instanceof ValidationSchema ? schema : ValidationSchema.create(schema);
      const data = { ...req.params, ...req.query, ...req.body };
      const result = validationSchema.validate(data, { ...options, strict: false });

      if (!result.valid) {
        return res.status(400).json({
          error: 'Validation failed',
          errors: result.errors.map(err => ({
            field: err.context.field,
            message: err.message,
            suggestions: err.suggestions
          })),
          warnings: result.warnings
        });
      }

      // Update request with validated data
      req.validated = result.data;
      req.validationWarnings = result.warnings;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Predefined validation schemas
 */
export const CommonSchemas = {
  // User input validation
  objective: ValidationSchema.create({
    objective: new ValidationRule(ValidationTypes.STRING, {
      [ValidationConstraints.REQUIRED]: true,
      [ValidationConstraints.MIN_LENGTH]: 1,
      [ValidationConstraints.MAX_LENGTH]: 2000,
      [ValidationConstraints.TRIM]: true,
      [ValidationConstraints.SANITIZE_HTML]: true,
      [ValidationConstraints.NORMALIZE_WHITESPACE]: true,
      [ValidationConstraints.REMOVE_CONTROL_CHARS]: true
    })
  }),

  // Configuration validation
  redisConfig: ValidationSchema.create({
    host: new ValidationRule(ValidationTypes.STRING, {
      [ValidationConstraints.REQUIRED]: true,
      [ValidationConstraints.MIN_LENGTH]: 1
    }),
    port: new ValidationRule(ValidationTypes.NUMBER, {
      [ValidationConstraints.REQUIRED]: true,
      [ValidationConstraints.MIN_VALUE]: 1,
      [ValidationConstraints.MAX_VALUE]: 65535,
      [ValidationConstraints.INTEGER]: true
    }),
    password: new ValidationRule(ValidationTypes.STRING, {
      [ValidationConstraints.MIN_LENGTH]: 8
    }),
    tls: new ValidationRule(ValidationTypes.BOOLEAN, {
      [ValidationConstraints.DEFAULT]: true
    })
  }),

  // Swarm configuration validation
  swarmConfig: ValidationSchema.create({
    strategy: new ValidationRule(ValidationTypes.STRING, {
      [ValidationConstraints.REQUIRED]: true,
      [ValidationConstraints.ENUM]: ['auto', 'development', 'research', 'testing', 'analysis', 'optimization', 'maintenance']
    }),
    mode: new ValidationRule(ValidationTypes.STRING, {
      [ValidationConstraints.REQUIRED]: true,
      [ValidationConstraints.ENUM]: ['centralized', 'distributed', 'hierarchical', 'mesh', 'hybrid']
    }),
    maxAgents: new ValidationRule(ValidationTypes.NUMBER, {
      [ValidationConstraints.REQUIRED]: true,
      [ValidationConstraints.MIN_VALUE]: 1,
      [ValidationConstraints.MAX_VALUE]: 50,
      [ValidationConstraints.INTEGER]: true
    }),
    timeout: new ValidationRule(ValidationTypes.NUMBER, {
      [ValidationConstraints.MIN_VALUE]: 1,
      [ValidationConstraints.MAX_VALUE]: 1440,
      [ValidationConstraints.INTEGER]: true,
      [ValidationConstraints.DEFAULT]: 30
    })
  }),

  // API request validation
  apiRequest: ValidationSchema.create({
    method: new ValidationRule(ValidationTypes.STRING, {
      [ValidationConstraints.REQUIRED]: true,
      [ValidationConstraints.ENUM]: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    }),
    path: new ValidationRule(ValidationTypes.STRING, {
      [ValidationConstraints.REQUIRED]: true,
      [ValidationConstraints.MIN_LENGTH]: 1
    }),
    headers: new ValidationRule(ValidationTypes.OBJECT, {
      [ValidationConstraints.OPTIONAL]: true
    }),
    body: new ValidationRule(ValidationTypes.OBJECT, {
      [ValidationConstraints.OPTIONAL]: true
    })
  })
};

/**
 * Utility functions for common validation tasks
 */
export const ValidationUtils = {
  /**
   * Validate and sanitize a single value
   */
  validateValue(value, type, constraints = {}) {
    const rule = new ValidationRule(type, constraints);
    const context = new ValidationContext({ strict: false });
    rule.validate(value, 'value', context);

    return {
      valid: context.errors.length === 0,
      value: context.data.value,
      errors: context.errors,
      warnings: context.warnings
    };
  },

  /**
   * Create validator function from schema
   */
  createValidator(schema) {
    return (data, options = {}) => {
      const validationSchema = schema instanceof ValidationSchema ? schema : ValidationSchema.create(schema);
      return validationSchema.validate(data, options);
    };
  },

  /**
   * Check if value is safe (no security issues)
   */
  isSafe(value) {
    if (typeof value !== 'string') {
      return true;
    }

    const dangerousPatterns = [
      SECURITY_PATTERNS.HTML_INJECTION,
      SECURITY_PATTERNS.JAVASCRIPT_INJECTION,
      SECURITY_PATTERNS.SQL_INJECTION,
      SECURITY_PATTERNS.XSS,
      SECURITY_PATTERNS.PATH_TRAVERSAL
    ];

    return !dangerousPatterns.some(pattern => pattern.test(value));
  },

  /**
   * Sanitize a string value
   */
  sanitize(value) {
    if (typeof value !== 'string') {
      return value;
    }

    let sanitized = value.trim();
    sanitized = sanitized.replace(SECURITY_PATTERNS.HTML_INJECTION, '');
    sanitized = sanitized.replace(SECURITY_PATTERNS.CONTROL_CHARS, '');
    sanitized = sanitized.replace(/\s+/g, ' ');

    Object.values(SECURITY_PATTERNS).forEach(pattern => {
      if (pattern !== SECURITY_PATTERNS.CONTROL_CHARS) {
        sanitized = sanitized.replace(pattern, '');
      }
    });

    return sanitized;
  }
};

export default {
  ValidationTypes,
  ValidationConstraints,
  ValidationRule,
  ValidationSchema,
  validate,
  validateProperty,
  validationMiddleware,
  CommonSchemas,
  ValidationUtils
};