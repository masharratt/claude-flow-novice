/**
 * Message Validator - Comprehensive JSON Schema Validation
 *
 * Security: Prevents unsafe JSON deserialization attacks (VULN-002, CVSS 7.8)
 *
 * Features:
 * - Strict JSON schema validation using AJV
 * - Prototype pollution detection
 * - Payload size limits (max 1MB)
 * - Additional properties removal
 * - Detailed error logging
 * - UUID format validation
 * - Timestamp validation
 *
 * Usage:
 *   const { validateMessage } = require('./src/security/message-validator');
 *   try {
 *     const validatedMessage = validateMessage(rawMessage);
 *     // Process validated message
 *   } catch (error) {
 *     console.error('Validation failed:', error.message);
 *     // Reject message
 *   }
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Initialize AJV with strict mode
const ajv = new Ajv({
  strict: true,
  allErrors: true,
  removeAdditional: true, // Remove properties not in schema (defense in depth)
  useDefaults: false, // Don't auto-fill defaults (explicit is better)
  coerceTypes: false, // Don't auto-convert types (strict validation)
  validateFormats: true // Validate format keywords (uuid, date-time, etc.)
});

// Add format validators (uuid, date-time, etc.)
addFormats(ajv);

// Maximum message size (1MB)
const MAX_MESSAGE_SIZE = 1048576; // 1MB in bytes

// Minimum and maximum timestamp values (prevent overflow attacks)
const MIN_TIMESTAMP = 0;
const MAX_TIMESTAMP = 8640000000000000; // Max JS timestamp (Sep 13, 275760)

// String length limits
const MAX_STRING_LENGTH = 10000;
const MAX_ID_LENGTH = 100;
const MAX_ERROR_MESSAGE_LENGTH = 5000;
const MAX_STACK_TRACE_LENGTH = 10000;

/**
 * Base message schema (common properties)
 */
const baseMessageSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Unique message identifier (UUID v4)'
    },
    type: {
      type: 'string',
      enum: ['request', 'response', 'error', 'heartbeat'],
      description: 'Message type'
    },
    from: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Sender coordinator ID'
    },
    timestamp: {
      type: 'number',
      minimum: MIN_TIMESTAMP,
      maximum: MAX_TIMESTAMP,
      description: 'Unix timestamp in milliseconds'
    }
  },
  required: ['id', 'type', 'from', 'timestamp'],
  additionalProperties: false
};

/**
 * Request message schema
 */
const requestSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid'
    },
    type: {
      type: 'string',
      const: 'request'
    },
    from: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$'
    },
    to: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Target coordinator ID'
    },
    task: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Task identifier'
    },
    correlationId: {
      type: 'string',
      format: 'uuid',
      description: 'Request correlation ID for tracking'
    },
    timestamp: {
      type: 'number',
      minimum: MIN_TIMESTAMP,
      maximum: MAX_TIMESTAMP
    },
    data: {
      type: 'object',
      description: 'Request payload data',
      additionalProperties: true, // Allow flexible data structure
      maxProperties: 100 // Prevent DoS via excessive properties
    }
  },
  required: ['id', 'type', 'from', 'to', 'task', 'correlationId', 'timestamp'],
  additionalProperties: false
};

/**
 * Response message schema
 */
const responseSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid'
    },
    type: {
      type: 'string',
      const: 'response'
    },
    from: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$'
    },
    to: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Target coordinator ID'
    },
    correlationId: {
      type: 'string',
      format: 'uuid',
      description: 'Original request correlation ID'
    },
    timestamp: {
      type: 'number',
      minimum: MIN_TIMESTAMP,
      maximum: MAX_TIMESTAMP
    },
    success: {
      type: 'boolean',
      description: 'Response success status'
    },
    data: {
      type: 'object',
      description: 'Response payload data',
      additionalProperties: true,
      maxProperties: 100
    }
  },
  required: ['id', 'type', 'from', 'to', 'correlationId', 'timestamp', 'success'],
  additionalProperties: false
};

/**
 * Error message schema
 */
const errorSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid'
    },
    type: {
      type: 'string',
      const: 'error'
    },
    from: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$'
    },
    to: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Target coordinator ID'
    },
    timestamp: {
      type: 'number',
      minimum: MIN_TIMESTAMP,
      maximum: MAX_TIMESTAMP
    },
    error: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ERROR_MESSAGE_LENGTH,
      description: 'Error code or type'
    },
    message: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ERROR_MESSAGE_LENGTH,
      description: 'Human-readable error message'
    },
    stack: {
      type: 'string',
      maxLength: MAX_STACK_TRACE_LENGTH,
      description: 'Stack trace (optional)'
    },
    correlationId: {
      type: 'string',
      format: 'uuid',
      description: 'Original request correlation ID (optional)'
    }
  },
  required: ['id', 'type', 'from', 'to', 'timestamp', 'error', 'message'],
  additionalProperties: false
};

/**
 * Heartbeat message schema
 */
const heartbeatSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid'
    },
    type: {
      type: 'string',
      const: 'heartbeat'
    },
    from: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$'
    },
    coordinatorId: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_ID_LENGTH,
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Coordinator sending heartbeat'
    },
    timestamp: {
      type: 'number',
      minimum: MIN_TIMESTAMP,
      maximum: MAX_TIMESTAMP
    },
    state: {
      type: 'string',
      enum: ['dormant', 'active', 'paused', 'stopped'],
      description: 'Current coordinator state'
    },
    stats: {
      type: 'object',
      properties: {
        requestsReceived: { type: 'number', minimum: 0 },
        requestsCompleted: { type: 'number', minimum: 0 },
        queueSize: { type: 'number', minimum: 0 },
        pendingRequests: { type: 'number', minimum: 0 }
      },
      additionalProperties: false,
      description: 'Coordinator statistics'
    }
  },
  required: ['type', 'from', 'coordinatorId', 'timestamp', 'state'],
  additionalProperties: false
};

// Compile schemas
const messageSchemas = {
  request: ajv.compile(requestSchema),
  response: ajv.compile(responseSchema),
  error: ajv.compile(errorSchema),
  heartbeat: ajv.compile(heartbeatSchema)
};

/**
 * Dangerous property names that indicate prototype pollution attempts
 */
const DANGEROUS_PROPERTIES = [
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__'
];

/**
 * Deep scan object for prototype pollution attempts
 *
 * @param {any} obj - Object to scan
 * @param {string} path - Current property path (for error reporting)
 * @returns {void}
 * @throws {Error} If prototype pollution detected
 */
function detectPrototypePollution(obj, path = 'root') {
  if (obj === null || typeof obj !== 'object') {
    return; // Primitives are safe
  }

  // Check for dangerous properties at current level
  for (const dangerousProp of DANGEROUS_PROPERTIES) {
    if (Object.prototype.hasOwnProperty.call(obj, dangerousProp)) {
      throw new Error(
        `Prototype pollution attempt detected: "${dangerousProp}" at ${path}`
      );
    }
  }

  // Recursively check nested objects and arrays
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object') {
      detectPrototypePollution(value, `${path}.${key}`);
    }
  }
}

/**
 * Validate message payload size
 *
 * @param {any} message - Message to validate
 * @param {number} maxSize - Maximum allowed size in bytes
 * @returns {void}
 * @throws {Error} If message exceeds size limit
 */
function validateMessageSize(message, maxSize = MAX_MESSAGE_SIZE) {
  // Handle null/undefined safely
  if (message === null || message === undefined) {
    return; // Will be caught by structure validation
  }

  const messageStr = JSON.stringify(message);
  const sizeBytes = Buffer.byteLength(messageStr, 'utf8');

  if (sizeBytes > maxSize) {
    throw new Error(
      `Message size (${sizeBytes} bytes) exceeds maximum (${maxSize} bytes)`
    );
  }
}

/**
 * Validate message structure and type
 *
 * @param {any} message - Message to validate
 * @returns {void}
 * @throws {Error} If message structure is invalid
 */
function validateMessageStructure(message) {
  // Must be an object
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new Error('Message must be a non-null object');
  }

  // Must have a type property
  if (!message.type || typeof message.type !== 'string') {
    throw new Error('Message must have a "type" property (string)');
  }

  // Type must be one of the known types
  const validTypes = ['request', 'response', 'error', 'heartbeat'];
  if (!validTypes.includes(message.type)) {
    throw new Error(
      `Unknown message type: "${message.type}". Must be one of: ${validTypes.join(', ')}`
    );
  }
}

/**
 * Validate message against JSON schema
 *
 * @param {object} message - Message to validate
 * @returns {void}
 * @throws {Error} If schema validation fails
 */
function validateSchema(message) {
  const validator = messageSchemas[message.type];

  if (!validator) {
    throw new Error(`No schema validator for message type: ${message.type}`);
  }

  const valid = validator(message);

  if (!valid) {
    const errors = validator.errors || [];
    const errorDetails = errors
      .map(err => {
        const path = err.instancePath || 'root';
        const message = err.message || 'unknown error';
        const params = err.params ? JSON.stringify(err.params) : '';
        return `  - ${path}: ${message} ${params}`;
      })
      .join('\n');

    throw new Error(`Schema validation failed:\n${errorDetails}`);
  }
}

/**
 * Main message validation function
 *
 * Validates message through multiple security layers:
 * 1. Payload size check (DoS prevention)
 * 2. Structure validation (type checking)
 * 3. Prototype pollution detection (security)
 * 4. JSON schema validation (data integrity)
 *
 * @param {any} message - Raw message to validate
 * @param {number} maxSize - Maximum message size in bytes (default: 1MB)
 * @returns {object} Validated message (sanitized)
 * @throws {Error} If validation fails at any layer
 */
function validateMessage(message, maxSize = MAX_MESSAGE_SIZE) {
  try {
    // Layer 1: Payload size check (prevent DoS)
    validateMessageSize(message, maxSize);

    // Layer 2: Structure validation
    validateMessageStructure(message);

    // Layer 3: Prototype pollution detection
    detectPrototypePollution(message);

    // Layer 4: JSON schema validation
    validateSchema(message);

    // All validations passed
    return message;
  } catch (error) {
    // Re-throw with enhanced error context
    const enhancedError = new Error(
      `Message validation failed: ${error.message}`
    );
    enhancedError.originalError = error;
    enhancedError.messageType = message?.type || 'unknown';
    enhancedError.messageId = message?.id || 'unknown';
    throw enhancedError;
  }
}

/**
 * Safe JSON parse with validation
 *
 * @param {string} messageStr - JSON string to parse and validate
 * @param {number} maxSize - Maximum message size in bytes
 * @returns {object} Parsed and validated message
 * @throws {Error} If parsing or validation fails
 */
function parseAndValidateMessage(messageStr, maxSize = MAX_MESSAGE_SIZE) {
  // Check string size before parsing (prevent DoS)
  const sizeBytes = Buffer.byteLength(messageStr, 'utf8');
  if (sizeBytes > maxSize) {
    throw new Error(
      `Message string size (${sizeBytes} bytes) exceeds maximum (${maxSize} bytes)`
    );
  }

  let message;
  try {
    message = JSON.parse(messageStr);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }

  // Validate parsed message
  return validateMessage(message, maxSize);
}

/**
 * Get validation statistics
 *
 * @returns {object} Validation configuration and limits
 */
function getValidationStats() {
  return {
    maxMessageSize: MAX_MESSAGE_SIZE,
    maxStringLength: MAX_STRING_LENGTH,
    maxIdLength: MAX_ID_LENGTH,
    maxErrorMessageLength: MAX_ERROR_MESSAGE_LENGTH,
    maxStackTraceLength: MAX_STACK_TRACE_LENGTH,
    supportedMessageTypes: ['request', 'response', 'error', 'heartbeat'],
    dangerousProperties: DANGEROUS_PROPERTIES
  };
}

module.exports = {
  validateMessage,
  parseAndValidateMessage,
  detectPrototypePollution,
  validateMessageSize,
  validateMessageStructure,
  validateSchema,
  getValidationStats,
  MAX_MESSAGE_SIZE,
  messageSchemas
};
