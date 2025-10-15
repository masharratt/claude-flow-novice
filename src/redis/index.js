/**
 * Redis Transparency Enhancement - Enhanced Message Structure Foundation
 * Phase 1: Core message structure implementation with comprehensive validation
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * Enhanced Redis Message Structure
 * Provides comprehensive message metadata, validation, and transparency
 */
class EnhancedRedisMessage extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Core message structure
    this.id = options.id || this.generateId();
    this.type = options.type || 'unknown';
    this.channel = options.channel || 'default';
    this.payload = options.payload || null;
    this.timestamp = options.timestamp || Date.now();
    this.source = options.source || 'unknown';
    this.destination = options.destination || null;
    this.priority = options.priority || 'normal';
    
    // Enhanced transparency fields
    this.metadata = options.metadata || {};
    this.traceInfo = options.traceInfo || this.initializeTraceInfo();
    this.validation = options.validation || {};
    this.status = options.status || 'created';
    this.attempts = options.attempts || 0;
    this.maxAttempts = options.maxAttempts || 3;
    
    // Performance and monitoring
    this.metrics = {
      created: this.timestamp,
      modified: this.timestamp,
      processingStart: null,
      processingEnd: null,
      queueTime: null,
      processingTime: null
    };
    
    // Validation rules
    this.validationRules = {
      required: ['id', 'type', 'channel', 'timestamp'],
      optional: ['payload', 'metadata', 'traceInfo'],
      validators: {
        id: this.validateId.bind(this),
        type: this.validateType.bind(this),
        channel: this.validateChannel.bind(this),
        priority: this.validatePriority.bind(this)
      }
    };
    
    // Auto-validate on creation
    this.validate();
  }

  /**
   * Generate unique message ID
   */
  generateId() {
    return `msg_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Initialize trace information
   */
  initializeTraceInfo() {
    return {
      traceId: crypto.randomBytes(16).toString('hex'),
      spanId: crypto.randomBytes(8).toString('hex'),
      parentSpanId: null,
      operationName: this.type,
      startTime: this.timestamp,
      tags: {},
      logs: [],
      service: 'redis-enhanced'
    };
  }

  /**
   * Validate the message structure
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Check required fields
    for (const field of this.validationRules.required) {
      if (!this[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Run field validators
    for (const [field, validator] of Object.entries(this.validationRules.validators)) {
      if (this[field] !== undefined) {
        try {
          const result = validator(this[field]);
          if (!result.valid) {
            errors.push(result.error);
          }
        } catch (error) {
          errors.push(`Validation error for ${field}: ${error.message}`);
        }
      }
    }

    // Check payload size
    if (this.payload && typeof this.payload === 'object') {
      const payloadSize = JSON.stringify(this.payload).length;
      if (payloadSize > 1024 * 1024) { // 1MB limit
        warnings.push(`Large payload detected: ${payloadSize} bytes`);
      }
    }

    this.validation = {
      valid: errors.length === 0,
      errors,
      warnings,
      validatedAt: Date.now()
    };

    this.status = this.validation.valid ? 'validated' : 'invalid';
    return this.validation;
  }

  /**
   * Field validators
   */
  validateId(id) {
    if (typeof id !== 'string' || id.length < 10) {
      return { valid: false, error: 'ID must be a string with at least 10 characters' };
    }
    return { valid: true };
  }

  validateType(type) {
    const validTypes = ['command', 'event', 'response', 'error', 'heartbeat', 'data'];
    if (!validTypes.includes(type)) {
      return { valid: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` };
    }
    return { valid: true };
  }

  validateChannel(channel) {
    if (typeof channel !== 'string' || channel.length === 0) {
      return { valid: false, error: 'Channel must be a non-empty string' };
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(channel)) {
      return { valid: false, error: 'Channel can only contain alphanumeric characters, dots, hyphens, and underscores' };
    }
    return { valid: true };
  }

  validatePriority(priority) {
    const validPriorities = ['low', 'normal', 'high', 'critical'];
    if (!validPriorities.includes(priority)) {
      return { valid: false, error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` };
    }
    return { valid: true };
  }

  /**
   * Update message status and metrics
   */
  updateStatus(newStatus, metadata = {}) {
    const previousStatus = this.status;
    this.status = newStatus;
    this.metrics.modified = Date.now();
    
    if (metadata) {
      this.metadata = { ...this.metadata, ...metadata };
    }

    this.emit('statusChanged', {
      messageId: this.id,
      previousStatus,
      newStatus,
      timestamp: this.metrics.modified
    });

    return this;
  }

  /**
   * Start processing timer
   */
  startProcessing() {
    this.metrics.processingStart = Date.now();
    this.metrics.queueTime = this.metrics.processingStart - this.metrics.created;
    this.updateStatus('processing');
    return this;
  }

  /**
   * End processing timer
   */
  endProcessing() {
    if (this.metrics.processingStart) {
      this.metrics.processingEnd = Date.now();
      this.metrics.processingTime = this.metrics.processingEnd - this.metrics.processingStart;
      this.updateStatus('completed');
    }
    return this;
  }

  /**
   * Add trace log entry
   */
  addTraceLog(level, message, fields = {}) {
    const logEntry = {
      timestamp: Date.now(),
      level,
      message,
      fields
    };
    
    this.traceInfo.logs.push(logEntry);
    this.emit('traceLog', logEntry);
    
    return this;
  }

  /**
   * Increment attempt counter
   */
  incrementAttempt() {
    this.attempts += 1;
    this.metrics.modified = Date.now();
    
    if (this.attempts >= this.maxAttempts) {
      this.updateStatus('failed', { reason: 'Max attempts exceeded' });
    } else {
      this.updateStatus('retrying');
    }
    
    return this;
  }

  /**
   * Serialize message for Redis storage
   */
  serialize() {
    return JSON.stringify({
      id: this.id,
      type: this.type,
      channel: this.channel,
      payload: this.payload,
      timestamp: this.timestamp,
      source: this.source,
      destination: this.destination,
      priority: this.priority,
      metadata: this.metadata,
      traceInfo: this.traceInfo,
      validation: this.validation,
      status: this.status,
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      metrics: this.metrics
    });
  }

  /**
   * Deserialize message from Redis storage
   */
  static deserialize(data) {
    try {
      const parsed = JSON.parse(data);
      const message = new EnhancedRedisMessage(parsed);
      return message;
    } catch (error) {
      throw new Error(`Failed to deserialize message: ${error.message}`);
    }
  }

  /**
   * Get message summary for monitoring
   */
  getSummary() {
    return {
      id: this.id,
      type: this.type,
      channel: this.channel,
      status: this.status,
      priority: this.priority,
      age: Date.now() - this.timestamp,
      attempts: this.attempts,
      hasPayload: !!this.payload,
      validation: {
        valid: this.validation.valid,
        errorCount: this.validation.errors?.length || 0,
        warningCount: this.validation.warnings?.length || 0
      },
      metrics: {
        queueTime: this.metrics.queueTime,
        processingTime: this.metrics.processingTime
      }
    };
  }

  /**
   * Clone message with modifications
   */
  clone(modifications = {}) {
    const clonedData = {
      id: this.id,
      type: this.type,
      channel: this.channel,
      payload: this.payload,
      timestamp: this.timestamp,
      source: this.source,
      destination: this.destination,
      priority: this.priority,
      metadata: { ...this.metadata },
      traceInfo: { ...this.traceInfo },
      validation: { ...this.validation },
      status: this.status,
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      metrics: { ...this.metrics },
      ...modifications
    };

    return new EnhancedRedisMessage(clonedData);
  }
}

module.exports = {
  EnhancedRedisMessage
};