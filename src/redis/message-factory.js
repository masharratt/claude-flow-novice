/**
 * Enhanced Message Factory
 * Factory pattern for creating standardized Redis messages
 */

const { EnhancedRedisMessage } = require('./index');
const { MessageValidator } = require('./message-validator');

class MessageFactory {
  constructor(options = {}) {
    this.defaultOptions = {
      source: options.source || 'unknown',
      maxAttempts: options.maxAttempts || 3,
      validator: new MessageValidator(options.validatorOptions),
      enableValidation: options.enableValidation !== false,
      defaultPriority: options.defaultPriority || 'normal'
    };
    
    this.messageTemplates = new Map();
    this.statistics = {
      messagesCreated: 0,
      messagesValidated: 0,
      validationErrors: 0,
      types: new Map()
    };
  }

  /**
   * Create a new message with comprehensive validation
   */
  createMessage(type, payload, options = {}) {
    const messageOptions = {
      ...this.defaultOptions,
      type,
      payload,
      ...options
    };

    // Create message instance
    const message = new EnhancedRedisMessage(messageOptions);

    // Validate if enabled
    if (this.defaultOptions.enableValidation) {
      const validationResult = this.defaultOptions.validator.validate(message);
      if (!validationResult.valid) {
        this.statistics.validationErrors++;
        throw new Error(`Message validation failed: ${validationResult.errors.join(', ')}`);
      }
      this.statistics.messagesValidated++;
    }

    // Update statistics
    this.statistics.messagesCreated++;
    const typeCount = this.statistics.types.get(type) || 0;
    this.statistics.types.set(type, typeCount + 1);

    return message;
  }

  /**
   * Create command message
   */
  createCommand(command, payload = {}, options = {}) {
    return this.createMessage('command', {
      command,
      ...payload
    }, {
      priority: options.priority || 'normal',
      ...options
    });
  }

  /**
   * Create event message
   */
  createEvent(eventType, eventData = {}, options = {}) {
    return this.createMessage('event', {
      eventType,
      ...eventData
    }, {
      priority: options.priority || 'normal',
      ...options
    });
  }

  /**
   * Create response message
   */
  createResponse(originalMessage, responseData = {}, options = {}) {
    const responseOptions = {
      destination: originalMessage.source,
      priority: originalMessage.priority,
      metadata: {
        originalMessageId: originalMessage.id,
        originalTraceId: originalMessage.traceInfo?.traceId,
        responseTo: originalMessage.type,
        ...options.metadata
      },
      ...options
    };

    return this.createMessage('response', {
      success: true,
      data: responseData,
      originalMessageId: originalMessage.id
    }, responseOptions);
  }

  /**
   * Create error response message
   */
  createErrorResponse(originalMessage, error, options = {}) {
    const errorData = {
      success: false,
      error: {
        message: error.message || 'Unknown error',
        code: error.code || 'UNKNOWN_ERROR',
        stack: error.stack
      },
      originalMessageId: originalMessage.id
    };

    const responseOptions = {
      destination: originalMessage.source,
      priority: 'high', // Errors should have higher priority
      metadata: {
        originalMessageId: originalMessage.id,
        originalTraceId: originalMessage.traceInfo?.traceId,
        responseTo: originalMessage.type,
        errorType: error.constructor.name,
        ...options.metadata
      },
      ...options
    };

    return this.createMessage('error', errorData, responseOptions);
  }

  /**
   * Create heartbeat message
   */
  createHeartbeat(serviceName, status = 'healthy', options = {}) {
    return this.createMessage('heartbeat', {
      serviceName,
      status,
      timestamp: Date.now(),
      version: options.version || '1.0.0',
      metrics: options.metrics || {}
    }, {
      priority: 'low',
      channel: `heartbeat.${serviceName}`,
      ...options
    });
  }

  /**
   * Create data message
   */
  createDataMessage(dataType, data, options = {}) {
    return this.createMessage('data', {
      dataType,
      data,
      size: JSON.stringify(data).length
    }, {
      priority: options.priority || 'normal',
      ...options
    });
  }

  /**
   * Create batch message for multiple operations
   */
  createBatchMessage(messages, options = {}) {
    const batchPayload = {
      batchId: options.batchId || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      messages: messages.map(msg => msg.getSummary ? msg.getSummary() : msg),
      totalCount: messages.length,
      timestamp: Date.now()
    };

    return this.createMessage('command', {
      command: 'process_batch',
      ...batchPayload
    }, {
      priority: options.priority || 'normal',
      metadata: {
        batchOperation: true,
        originalMessageIds: messages.map(msg => msg.id),
        ...options.metadata
      },
      ...options
    });
  }

  /**
   * Register a message template
   */
  registerTemplate(name, template) {
    this.messageTemplates.set(name, template);
  }

  /**
   * Create message from template
   */
  createFromTemplate(templateName, data = {}, options = {}) {
    const template = this.messageTemplates.get(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Merge template with provided data
    const mergedOptions = {
      ...template,
      payload: {
        ...template.payload,
        ...data
      },
      ...options
    };

    return this.createMessage(mergedOptions.type, mergedOptions.payload, mergedOptions);
  }

  /**
   * Create message with retry configuration
   */
  createRetryableMessage(type, payload, retryOptions = {}, options = {}) {
    const messageOptions = {
      type,
      payload,
      maxAttempts: retryOptions.maxAttempts || 5,
      metadata: {
        retryable: true,
        retryDelay: retryOptions.delay || 1000,
        retryBackoff: retryOptions.backoff || 'exponential',
        maxRetryDelay: retryOptions.maxDelay || 30000,
        ...options.metadata
      },
      ...options
    };

    return this.createMessage(type, payload, messageOptions);
  }

  /**
   * Create scheduled message
   */
  createScheduledMessage(type, payload, scheduledTime, options = {}) {
    const delay = scheduledTime - Date.now();
    if (delay <= 0) {
      throw new Error('Scheduled time must be in the future');
    }

    return this.createMessage(type, payload, {
      metadata: {
        scheduled: true,
        scheduledTime,
        delay,
        ...options.metadata
      },
      ...options
    });
  }

  /**
   * Create message with TTL (time to live)
   */
  createTTLMessage(type, payload, ttlMs, options = {}) {
    const expiresAt = Date.now() + ttlMs;

    return this.createMessage(type, payload, {
      metadata: {
        ttl: ttlMs,
        expiresAt,
        ...options.metadata
      },
      ...options
    });
  }

  /**
   * Clone existing message with modifications
   */
  cloneMessage(originalMessage, modifications = {}) {
    return originalMessage.clone(modifications);
  }

  /**
   * Get factory statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      types: Object.fromEntries(this.statistics.types)
    };
  }

  /**
   * Reset factory statistics
   */
  resetStatistics() {
    this.statistics = {
      messagesCreated: 0,
      messagesValidated: 0,
      validationErrors: 0,
      types: new Map()
    };
  }

  /**
   * Validate message without creating
   */
  validateMessage(messageData) {
    return this.defaultOptions.validator.validate(messageData);
  }

  /**
   * Create message from raw data
   */
  createFromRaw(rawData, options = {}) {
    try {
      let messageData;
      
      if (typeof rawData === 'string') {
        messageData = JSON.parse(rawData);
      } else {
        messageData = rawData;
      }

      return this.createMessage(messageData.type, messageData.payload, {
        ...messageData,
        ...options
      });
    } catch (error) {
      throw new Error(`Failed to create message from raw data: ${error.message}`);
    }
  }
}

module.exports = {
  MessageFactory
};