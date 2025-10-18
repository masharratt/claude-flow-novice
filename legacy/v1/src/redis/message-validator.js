/**
 * Enhanced Message Validator
 * Comprehensive validation system for Redis messages
 */

class MessageValidator {
  constructor(options = {}) {
    this.rules = options.rules || this.getDefaultRules();
    this.strictMode = options.strictMode || false;
    this.maxPayloadSize = options.maxPayloadSize || 1024 * 1024; // 1MB
    this.allowedChannels = options.allowedChannels || [];
    this.allowedTypes = options.allowedTypes || ['command', 'event', 'response', 'error', 'heartbeat', 'data'];
  }

  /**
   * Get default validation rules
   */
  getDefaultRules() {
    return {
      id: {
        required: true,
        type: 'string',
        minLength: 10,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9_-]+$/
      },
      type: {
        required: true,
        type: 'string',
        enum: this.allowedTypes
      },
      channel: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9._-]+$/
      },
      timestamp: {
        required: true,
        type: 'number',
        min: 0,
        max: Date.now() + 60000 // Allow 1 minute future timestamp
      },
      priority: {
        required: false,
        type: 'string',
        enum: ['low', 'normal', 'high', 'critical'],
        default: 'normal'
      },
      source: {
        required: false,
        type: 'string',
        maxLength: 100
      },
      destination: {
        required: false,
        type: 'string',
        maxLength: 100
      },
      payload: {
        required: false,
        type: 'object',
        validate: this.validatePayload.bind(this)
      },
      metadata: {
        required: false,
        type: 'object'
      }
    };
  }

  /**
   * Validate message object
   */
  validate(message) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        validationTime: Date.now(),
        validatorVersion: '1.0.0'
      }
    };

    // Check if message is object
    if (!message || typeof message !== 'object') {
      result.valid = false;
      result.errors.push('Message must be an object');
      return result;
    }

    // Validate each field according to rules
    for (const [fieldName, rule] of Object.entries(this.rules)) {
      const fieldValue = message[fieldName];
      const fieldResult = this.validateField(fieldName, fieldValue, rule);
      
      if (!fieldResult.valid) {
        result.valid = false;
        result.errors.push(...fieldResult.errors);
      }
      
      if (fieldResult.warnings) {
        result.warnings.push(...fieldResult.warnings);
      }
    }

    // Additional cross-field validations
    this.validateCrossFields(message, result);

    // Performance and security checks
    this.performSecurityChecks(message, result);

    return result;
  }

  /**
   * Validate individual field
   */
  validateField(fieldName, value, rule) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check required fields
    if (rule.required && (value === undefined || value === null)) {
      result.valid = false;
      result.errors.push(`Field '${fieldName}' is required`);
      return result;
    }

    // Skip validation if field is not required and value is undefined/null
    if (!rule.required && (value === undefined || value === null)) {
      return result;
    }

    // Type validation
    if (rule.type && typeof value !== rule.type) {
      result.valid = false;
      result.errors.push(`Field '${fieldName}' must be of type ${rule.type}, got ${typeof value}`);
      return result;
    }

    // String-specific validations
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        result.valid = false;
        result.errors.push(`Field '${fieldName}' must be at least ${rule.minLength} characters long`);
      }

      if (rule.maxLength && value.length > rule.maxLength) {
        result.valid = false;
        result.errors.push(`Field '${fieldName}' must be at most ${rule.maxLength} characters long`);
      }

      if (rule.pattern && !rule.pattern.test(value)) {
        result.valid = false;
        result.errors.push(`Field '${fieldName}' does not match required pattern`);
      }
    }

    // Number-specific validations
    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        result.valid = false;
        result.errors.push(`Field '${fieldName}' must be at least ${rule.min}`);
      }

      if (rule.max !== undefined && value > rule.max) {
        result.valid = false;
        result.errors.push(`Field '${fieldName}' must be at most ${rule.max}`);
      }
    }

    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      result.valid = false;
      result.errors.push(`Field '${fieldName}' must be one of: ${rule.enum.join(', ')}`);
    }

    // Custom validation function
    if (rule.validate && typeof rule.validate === 'function') {
      try {
        const customResult = rule.validate(value, fieldName);
        if (!customResult.valid) {
          result.valid = false;
          result.errors.push(...customResult.errors);
        }
        if (customResult.warnings) {
          result.warnings.push(...customResult.warnings);
        }
      } catch (error) {
        result.valid = false;
        result.errors.push(`Custom validation failed for field '${fieldName}': ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Validate payload specifically
   */
  validatePayload(payload) {
    const result = { valid: true, errors: [], warnings: [] };

    if (!payload) {
      return result; // Payload is optional
    }

    try {
      const payloadSize = JSON.stringify(payload).length;
      
      if (payloadSize > this.maxPayloadSize) {
        result.valid = false;
        result.errors.push(`Payload too large: ${payloadSize} bytes (max: ${this.maxPayloadSize})`);
      } else if (payloadSize > this.maxPayloadSize * 0.8) {
        result.warnings.push(`Large payload detected: ${payloadSize} bytes`);
      }

      // Check for potentially dangerous payload structures
      if (payload.constructor && payload.constructor.name === 'Object') {
        const keys = Object.keys(payload);
        if (keys.length > 100) {
          result.warnings.push(`Payload has many properties: ${keys.length}`);
        }

        // Check for nested depth
        const maxDepth = this.getMaxDepth(payload);
        if (maxDepth > 10) {
          result.warnings.push(`Payload has deep nesting: ${maxDepth} levels`);
        }
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(`Payload validation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Get maximum nesting depth of object
   */
  getMaxDepth(obj, currentDepth = 0) {
    if (typeof obj !== 'object' || obj === null) {
      return currentDepth;
    }

    let maxDepth = currentDepth;
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const depth = this.getMaxDepth(value, currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return maxDepth;
  }

  /**
   * Cross-field validations
   */
  validateCrossFields(message, result) {
    // Validate timestamp is not too old
    if (message.timestamp && Date.now() - message.timestamp > 24 * 60 * 60 * 1000) {
      result.warnings.push('Message timestamp is more than 24 hours old');
    }

    // Validate source/destination consistency
    if (message.source && message.destination && message.source === message.destination) {
      result.warnings.push('Message source and destination are the same');
    }

    // Validate priority with type
    if (message.type === 'heartbeat' && message.priority === 'critical') {
      result.warnings.push('Heartbeat messages should not have critical priority');
    }

    if (message.type === 'error' && message.priority === 'low') {
      result.warnings.push('Error messages should have at least normal priority');
    }
  }

  /**
   * Security and performance checks
   */
  performSecurityChecks(message, result) {
    // Check for potential injection patterns
    const stringFields = ['id', 'type', 'channel', 'source', 'destination'];
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:/i,
      /vbscript:/i
    ];

    for (const field of stringFields) {
      if (message[field] && typeof message[field] === 'string') {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(message[field])) {
            result.valid = false;
            result.errors.push(`Potentially dangerous content detected in field '${field}'`);
            break;
          }
        }
      }
    }

    // Check metadata size
    if (message.metadata) {
      try {
        const metadataSize = JSON.stringify(message.metadata).length;
        if (metadataSize > 10240) { // 10KB
          result.warnings.push(`Large metadata detected: ${metadataSize} bytes`);
        }
      } catch (error) {
        result.warnings.push('Metadata could not be serialized for size check');
      }
    }
  }

  /**
   * Add custom validation rule
   */
  addRule(fieldName, rule) {
    this.rules[fieldName] = rule;
  }

  /**
   * Remove validation rule
   */
  removeRule(fieldName) {
    delete this.rules[fieldName];
  }

  /**
   * Update allowed channels
   */
  setAllowedChannels(channels) {
    this.allowedChannels = channels;
    if (channels.length > 0) {
      this.rules.channel.enum = channels;
    }
  }

  /**
   * Update allowed types
   */
  setAllowedTypes(types) {
    this.allowedTypes = types;
    this.rules.type.enum = types;
  }
}

module.exports = {
  MessageValidator
};