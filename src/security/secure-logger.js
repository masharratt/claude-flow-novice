/**
 * Secure Logger - Prevents Information Disclosure (VULN-005, CVSS 5.3)
 *
 * Security Features:
 * - File path sanitization (prevents internal structure disclosure)
 * - Credential and secret redaction (prevents credential leaks)
 * - Stack trace depth limiting (prevents verbose error disclosure)
 * - Structured security audit logging
 * - Rate limiting (prevents log flooding attacks)
 * - Configurable sensitivity levels
 *
 * Usage:
 * ```javascript
 * import { SecureLogger } from './security/secure-logger.js';
 *
 * const logger = new SecureLogger('coordinator-id');
 * logger.info('Operation completed', { userId: 'user123' });
 * logger.error('Operation failed', error);
 * logger.security('Authentication attempt', { ip: '1.2.3.4', success: false });
 * ```
 */

/**
 * SecureLogger - Sanitized logging with security controls
 */
export class SecureLogger {
  constructor(componentId, options = {}) {
    this.componentId = componentId;
    this.options = {
      maxStackDepth: options.maxStackDepth || 5,
      enableRateLimiting: options.enableRateLimiting !== false,
      rateLimitWindow: options.rateLimitWindow || 1000, // 1 second
      rateLimitMax: options.rateLimitMax || 100, // 100 messages per window
      enableStructuredLogging: options.enableStructuredLogging !== false,
      enableDebug: options.enableDebug || false,
      ...options
    };

    // Sensitive data patterns to redact
    this.sensitivePatterns = [
      // File system paths (absolute paths)
      { pattern: /\/mnt\/[a-z]\/Users\/[\w-]+/gi, replacement: '[USER_DIR]' },
      { pattern: /\/home\/[\w-]+/gi, replacement: '[USER_DIR]' },
      { pattern: /C:\\Users\\[\w-]+/gi, replacement: '[USER_DIR]' },
      { pattern: /\/[\w-]+\/[\w-]+\/[\w.-]+/g, replacement: '[PATH]' },

      // Credentials and secrets
      { pattern: /password[=:]\s*["']?[\w!@#$%^&*()]+["']?/gi, replacement: 'password=[REDACTED]' },
      { pattern: /api[_-]?key[=:]\s*["']?[\w-]+["']?/gi, replacement: 'api_key=[REDACTED]' },
      { pattern: /secret[=:]\s*["']?[\w-]+["']?/gi, replacement: 'secret=[REDACTED]' },
      { pattern: /token[=:]\s*["']?[\w.-]+["']?/gi, replacement: 'token=[REDACTED]' },
      { pattern: /bearer\s+[\w.-]+/gi, replacement: 'bearer [REDACTED]' },
      { pattern: /authorization:\s*["']?[\w\s.-]+["']?/gi, replacement: 'authorization: [REDACTED]' },

      // Connection strings
      { pattern: /mongodb:\/\/[\w:@.-]+/gi, replacement: 'mongodb://[REDACTED]' },
      { pattern: /redis:\/\/[\w:@.-]+/gi, replacement: 'redis://[REDACTED]' },
      { pattern: /postgresql:\/\/[\w:@.-]+/gi, replacement: 'postgresql://[REDACTED]' },
      { pattern: /mysql:\/\/[\w:@.-]+/gi, replacement: 'mysql://[REDACTED]' },

      // Email addresses (partial redaction)
      { pattern: /[\w.-]+@([\w-]+\.)+[\w-]+/g, replacement: '[EMAIL_REDACTED]' },

      // IP addresses (partial redaction - keep first octet for debugging)
      { pattern: /\b(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '$1.[REDACTED]' },

      // UUIDs (partial redaction - keep first segment for debugging)
      { pattern: /\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, replacement: '$1-[REDACTED]' }
    ];

    // Rate limiting state
    this.rateLimitState = {
      windowStart: Date.now(),
      messageCount: 0,
      suppressedCount: 0
    };

    // Statistics
    this.stats = {
      messagesLogged: 0,
      messagesSuppressed: 0,
      sensitiveDataRedacted: 0,
      securityEventsLogged: 0
    };
  }

  /**
   * Sanitize sensitive data from string
   * @param {string} input - Input string to sanitize
   * @returns {string} Sanitized string
   */
  sanitize(input) {
    if (!input) return input;

    let sanitized = String(input);
    let redactionCount = 0;

    for (const { pattern, replacement } of this.sensitivePatterns) {
      const matches = sanitized.match(pattern);
      if (matches) {
        redactionCount += matches.length;
        sanitized = sanitized.replace(pattern, replacement);
      }
    }

    if (redactionCount > 0) {
      this.stats.sensitiveDataRedacted += redactionCount;
    }

    return sanitized;
  }

  /**
   * Sanitize error object
   * @param {Error} error - Error object to sanitize
   * @returns {Object} Sanitized error object
   */
  sanitizeError(error) {
    if (!error) return null;

    // Handle non-Error objects
    if (!(error instanceof Error)) {
      // If it's an object, try to extract meaningful data
      if (typeof error === 'object') {
        const errorData = this.sanitizeObject(error);
        return {
          message: this.sanitize(JSON.stringify(errorData)),
          type: typeof error,
          timestamp: Date.now()
        };
      }
      return {
        message: this.sanitize(String(error)),
        type: typeof error,
        timestamp: Date.now()
      };
    }

    let message = this.sanitize(error.message || String(error));
    let stack = error.stack || '';

    // Sanitize stack trace
    stack = this.sanitize(stack);

    // Limit stack depth
    const stackLines = stack.split('\n').slice(0, this.options.maxStackDepth);
    const limitedStack = stackLines.join('\n');

    return {
      message,
      stack: limitedStack,
      type: error.constructor.name,
      code: error.code,
      timestamp: Date.now()
    };
  }

  /**
   * Sanitize data object recursively
   * @param {*} data - Data to sanitize
   * @param {number} depth - Current recursion depth
   * @returns {*} Sanitized data
   */
  sanitizeObject(data, depth = 0) {
    // Prevent deep recursion
    if (depth > 5) return '[MAX_DEPTH]';

    if (data === null || data === undefined) return data;

    // Sanitize primitive types
    if (typeof data === 'string') {
      return this.sanitize(data);
    }

    if (typeof data !== 'object') {
      return data;
    }

    // Sanitize arrays
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeObject(item, depth + 1));
    }

    // Sanitize objects
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      // Redact known sensitive keys
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('password') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('key') && !lowerKey.includes('public')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeObject(value, depth + 1);
      }
    }

    return sanitized;
  }

  /**
   * Check rate limit
   * @returns {boolean} True if within rate limit
   */
  checkRateLimit() {
    if (!this.options.enableRateLimiting) return true;

    const now = Date.now();
    const windowElapsed = now - this.rateLimitState.windowStart;

    // Reset window if expired
    if (windowElapsed >= this.options.rateLimitWindow) {
      // Log suppressed messages if any
      if (this.rateLimitState.suppressedCount > 0) {
        console.warn(
          `[${this.componentId}] [RATE_LIMIT] Suppressed ${this.rateLimitState.suppressedCount} messages in last window`
        );
        this.stats.messagesSuppressed += this.rateLimitState.suppressedCount;
      }

      this.rateLimitState = {
        windowStart: now,
        messageCount: 0,
        suppressedCount: 0
      };
    }

    // Check if within limit
    if (this.rateLimitState.messageCount >= this.options.rateLimitMax) {
      this.rateLimitState.suppressedCount++;
      return false;
    }

    this.rateLimitState.messageCount++;
    return true;
  }

  /**
   * Format log message
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {*} data - Additional data
   * @returns {string} Formatted log message
   */
  formatMessage(level, message, data) {
    const sanitizedMessage = this.sanitize(message);

    if (this.options.enableStructuredLogging && data) {
      const sanitizedData = this.sanitizeObject(data);
      return `[${this.componentId}] [${level}] ${sanitizedMessage} ${JSON.stringify(sanitizedData)}`;
    }

    return `[${this.componentId}] [${level}] ${sanitizedMessage}`;
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {*} data - Additional data
   */
  debug(message, data) {
    if (!this.options.enableDebug) return;
    if (!this.checkRateLimit()) return;

    const formatted = this.formatMessage('DEBUG', message, data);
    console.log(formatted);
    this.stats.messagesLogged++;
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {*} data - Additional data
   */
  info(message, data) {
    if (!this.checkRateLimit()) return;

    const formatted = this.formatMessage('INFO', message, data);
    console.log(formatted);
    this.stats.messagesLogged++;
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {*} data - Additional data
   */
  warn(message, data) {
    if (!this.checkRateLimit()) return;

    const formatted = this.formatMessage('WARN', message, data);
    console.warn(formatted);
    this.stats.messagesLogged++;
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Error|*} error - Error object or data
   */
  error(message, error) {
    if (!this.checkRateLimit()) return;

    const sanitizedMessage = this.sanitize(message);

    if (error instanceof Error) {
      const sanitizedError = this.sanitizeError(error);
      console.error(`[${this.componentId}] [ERROR] ${sanitizedMessage}`, sanitizedError);
    } else if (error) {
      const sanitizedData = this.sanitizeObject(error);
      console.error(`[${this.componentId}] [ERROR] ${sanitizedMessage}`, sanitizedData);
    } else {
      console.error(`[${this.componentId}] [ERROR] ${sanitizedMessage}`);
    }

    this.stats.messagesLogged++;
  }

  /**
   * Log security event (structured audit log)
   * @param {string} eventType - Security event type
   * @param {Object} eventData - Event data
   */
  security(eventType, eventData = {}) {
    // Security events bypass rate limiting (critical for audit trail)
    const sanitizedData = this.sanitizeObject(eventData);

    const securityEvent = {
      timestamp: Date.now(),
      component: this.componentId,
      eventType: this.sanitize(eventType),
      severity: eventData.severity || 'INFO',
      ...sanitizedData
    };

    console.log(`[${this.componentId}] [SECURITY] ${JSON.stringify(securityEvent)}`);
    this.stats.securityEventsLogged++;
    this.stats.messagesLogged++;
  }

  /**
   * Get logger statistics
   * @returns {Object} Logger statistics
   */
  getStats() {
    return {
      ...this.stats,
      rateLimitState: {
        messageCount: this.rateLimitState.messageCount,
        suppressedCount: this.rateLimitState.suppressedCount
      }
    };
  }

  /**
   * Reset logger statistics
   */
  resetStats() {
    this.stats = {
      messagesLogged: 0,
      messagesSuppressed: 0,
      sensitiveDataRedacted: 0,
      securityEventsLogged: 0
    };
  }
}

/**
 * Create secure logger instance
 * @param {string} componentId - Component identifier
 * @param {Object} options - Logger options
 * @returns {SecureLogger} Logger instance
 */
export function createSecureLogger(componentId, options = {}) {
  return new SecureLogger(componentId, options);
}

/**
 * Default export
 */
export default SecureLogger;
