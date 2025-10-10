/**
 * Secure Error Handler with Production-Grade Security and Information Leakage Prevention
 */

import { randomBytes } from 'crypto';
import { SecurityUtils } from '../../config/production-security.js';

/**
 * Secure error handler configuration
 */
const ERROR_HANDLER_CONFIG = {
  // Error classification
  errorTypes: {
    SECURITY: 'security',
    VALIDATION: 'validation',
    SYSTEM: 'system',
    NETWORK: 'network',
    BUSINESS: 'business',
    UNKNOWN: 'unknown'
  },

  // Security levels
  securityLevels: {
    CRITICAL: 'critical',    // Security breach, immediate action required
    HIGH: 'high',           // Potential security issue
    MEDIUM: 'medium',       // General error, some security implications
    LOW: 'low',            // Minor error, minimal security impact
    INFO: 'info'           // Informational, no security impact
  },

  // Information leakage prevention
  informationLeakage: {
    // Sensitive patterns to redact
    sensitivePatterns: [
      /password[=:][\w\-\.]+/gi,
      /secret[=:][\w\-\.]+/gi,
      /token[=:][\w\-\.]+/gi,
      /key[=:][\w\-\.]+/gi,
      /auth[=:][\w\-\.]+/gi,
      /certificate[\s\S]*?-----/gi,
      /private[\s\S]*?-----/gi,
      /\/.*\/users/gi,
      /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g,
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g,
      /Basic\s+[A-Za-z0-9+/]+=*/g
    ],

    // Stack trace filtering
    stackFilters: [
      /node_modules/g,
      /internal\/process/g,
      /\/Users\/[^\/]+/g,
      /\/home\/[^\/]+/g,
      /C:\\Users\\[^\\]+/gi,
      /\/tmp\//g,
      /\/var\/tmp\//g
    ],

    // File path sanitization
    pathFilters: [
      /^(\/[a-zA-Z0-9\-_]+)\/.*$/,
      /^[A-Za-z]:\\[^\\]+\\.*$/,
      /\/\.\./g
    ]
  },

  // Error response templates with solutions
  responseTemplates: {
    security: {
      critical: {
        message: 'A security violation has been detected',
        solution: 'Please check your authentication credentials and try again',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#security-issues'
      },
      high: {
        message: 'Authentication failed',
        solution: 'Verify your API key or token is valid and not expired',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#auth-failed'
      },
      medium: {
        message: 'Request cannot be processed',
        solution: 'Check request permissions and retry',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#permissions'
      },
      low: {
        message: 'Request validation failed',
        solution: 'Review request parameters for correctness',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#validation'
      },
      info: {
        message: 'Request information',
        solution: null,
        docsUrl: null
      }
    },
    validation: {
      critical: {
        message: 'Request format is invalid',
        solution: 'Check the request structure matches API requirements',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/API#request-format'
      },
      high: {
        message: 'Required parameters are missing',
        solution: 'Add all required parameters and retry',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/API#parameters'
      },
      medium: {
        message: 'Some parameters are invalid',
        solution: 'Verify parameter types and values match requirements',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/API#validation'
      },
      low: {
        message: 'Parameter validation warnings',
        solution: 'Review warnings and adjust parameters if needed',
        docsUrl: null
      },
      info: {
        message: 'Request format information',
        solution: null,
        docsUrl: null
      }
    },
    system: {
      critical: {
        message: 'System temporarily unavailable',
        solution: 'Run health check: claude-flow-novice health-check',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#system-down'
      },
      high: {
        message: 'System experiencing difficulties',
        solution: 'Check system resources and restart if needed',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#system-errors'
      },
      medium: {
        message: 'Request processing failed',
        solution: 'Retry the operation or check logs for details',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#processing-failed'
      },
      low: {
        message: 'System performance degraded',
        solution: 'Monitor system resources: claude-flow-novice metrics',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#performance'
      },
      info: {
        message: 'System status',
        solution: null,
        docsUrl: null
      }
    },
    network: {
      critical: {
        message: 'Network connectivity lost',
        solution: 'Check internet connection and firewall settings',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#network-issues'
      },
      high: {
        message: 'Connection timeout',
        solution: 'Retry the operation or increase timeout settings',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#timeout'
      },
      medium: {
        message: 'Network temporarily unavailable',
        solution: 'Wait a moment and retry the operation',
        docsUrl: null
      },
      low: {
        message: 'Network performance issues',
        solution: 'Check network latency and bandwidth',
        docsUrl: null
      },
      info: {
        message: 'Network status',
        solution: null,
        docsUrl: null
      }
    },
    business: {
      critical: {
        message: 'Business rule violation',
        solution: 'Review operation requirements and adjust request',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/API#business-rules'
      },
      high: {
        message: 'Operation not permitted',
        solution: 'Check permissions or contact administrator',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#permissions'
      },
      medium: {
        message: 'Request conflicts with business rules',
        solution: 'Adjust request to comply with business requirements',
        docsUrl: null
      },
      low: {
        message: 'Business validation warnings',
        solution: 'Review warnings and adjust if necessary',
        docsUrl: null
      },
      info: {
        message: 'Business logic information',
        solution: null,
        docsUrl: null
      }
    },
    unknown: {
      critical: {
        message: 'An unexpected error occurred',
        solution: 'Check logs and report this issue if it persists',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/issues'
      },
      high: {
        message: 'Request processing failed',
        solution: 'Retry the operation or check system logs',
        docsUrl: 'https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting'
      },
      medium: {
        message: 'Unable to process request',
        solution: 'Review request and retry',
        docsUrl: null
      },
      low: {
        message: 'Request processing issues',
        solution: 'Check logs for more details',
        docsUrl: null
      },
      info: {
        message: 'Processing information',
        solution: null,
        docsUrl: null
      }
    }
  },

  // Audit logging configuration
  audit: {
    enabled: true,
    logLevel: 'warn',
    includeStackTrace: false,
    includeUserData: false,
    maxLogSize: 10000, // characters
    logRetention: 30 * 24 * 60 * 60 * 1000, // 30 days
    sensitiveDataHandling: 'redact' // 'redact', 'hash', 'remove'
  },

  // Rate limiting for errors
  rateLimit: {
    enabled: true,
    windowMs: 60000, // 1 minute
    maxErrors: 100,
    burstLimit: 20
  }
};

/**
 * Secure Error Handler class
 */
export class SecureErrorHandler {
  constructor(config = {}) {
    this.config = this.mergeConfig(config);
    this.errorCounts = new Map();
    this.suspiciousActivityTracker = new Map();
    this.auditLogger = new AuditLogger(this.config.audit);
  }

  /**
   * Merge configuration with defaults
   */
  mergeConfig(userConfig) {
    return {
      ...ERROR_HANDLER_CONFIG,
      ...userConfig,
      informationLeakage: {
        ...ERROR_HANDLER_CONFIG.informationLeakage,
        ...userConfig.informationLeakage
      },
      audit: {
        ...ERROR_HANDLER_CONFIG.audit,
        ...userConfig.audit
      },
      rateLimit: {
        ...ERROR_HANDLER_CONFIG.rateLimit,
        ...userConfig.rateLimit
      }
    };
  }

  /**
   * Handle error with security controls
   */
  async handleError(error, context = {}) {
    const errorId = this.generateErrorId();
    const classifiedError = this.classifyError(error);
    const sanitizedError = this.sanitizeError(error, classifiedError);

    // Rate limiting check
    if (this.config.rateLimit.enabled) {
      this.checkRateLimit(classifiedError.type, context.clientId);
    }

    // Security monitoring
    this.monitorSuspiciousActivity(classifiedError, context);

    // Audit logging
    await this.auditLogger.logError({
      errorId,
      error: sanitizedError,
      classification: classifiedError,
      context: this.sanitizeContext(context),
      timestamp: Date.now()
    });

    // Generate secure response
    const response = this.generateSecureResponse(classifiedError, context);

    return {
      errorId,
      ...response,
      timestamp: Date.now()
    };
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Classify error by type and security level
   */
  classifyError(error) {
    const classification = {
      type: ERROR_HANDLER_CONFIG.errorTypes.UNKNOWN,
      securityLevel: ERROR_HANDLER_CONFIG.securityLevels.MEDIUM,
      isSecurity: false,
      isSuspicious: false,
      requiresImmediateAction: false
    };

    const errorMessage = error.message || '';
    const errorStack = error.stack || '';

    // Security-related errors
    if (this.isSecurityError(errorMessage, errorStack)) {
      classification.type = ERROR_HANDLER_CONFIG.errorTypes.SECURITY;
      classification.isSecurity = true;
      classification.securityLevel = this.determineSecurityLevel(errorMessage);
      classification.requiresImmediateAction = classification.securityLevel === 'critical';

      if (classification.securityLevel === 'critical' || classification.securityLevel === 'high') {
        classification.isSuspicious = true;
      }
    }
    // Validation errors
    else if (this.isValidationError(errorMessage)) {
      classification.type = ERROR_HANDLER_CONFIG.errorTypes.VALIDATION;
      classification.securityLevel = ERROR_HANDLER_CONFIG.securityLevels.LOW;
    }
    // Network errors
    else if (this.isNetworkError(errorMessage)) {
      classification.type = ERROR_HANDLER_CONFIG.errorTypes.NETWORK;
      classification.securityLevel = ERROR_HANDLER_CONFIG.securityLevels.MEDIUM;
    }
    // System errors
    else if (this.isSystemError(errorMessage, errorStack)) {
      classification.type = ERROR_HANDLER_CONFIG.errorTypes.SYSTEM;
      classification.securityLevel = ERROR_HANDLER_CONFIG.securityLevels.HIGH;
    }
    // Business logic errors
    else if (this.isBusinessError(errorMessage)) {
      classification.type = ERROR_HANDLER_CONFIG.errorTypes.BUSINESS;
      classification.securityLevel = ERROR_HANDLER_CONFIG.securityLevels.LOW;
    }

    return classification;
  }

  /**
   * Check if error is security-related
   */
  isSecurityError(message, stack) {
    const securityIndicators = [
      'unauthorized', 'forbidden', 'access denied', 'authentication failed',
      'permission denied', 'security violation', 'invalid credentials',
      'token expired', 'invalid token', 'csrf', 'xss', 'injection',
      'security breach', 'malicious', 'suspicious activity'
    ];

    return securityIndicators.some(indicator =>
      message.toLowerCase().includes(indicator) ||
      stack.toLowerCase().includes(indicator)
    );
  }

  /**
   * Determine security level
   */
  determineSecurityLevel(message) {
    const criticalIndicators = [
      'security breach', 'malicious', 'attack', 'exploit', 'intrusion'
    ];

    const highIndicators = [
      'unauthorized', 'forbidden', 'access denied', 'authentication failed',
      'invalid credentials', 'token expired', 'suspicious activity'
    ];

    const lowerMessage = message.toLowerCase();

    if (criticalIndicators.some(indicator => lowerMessage.includes(indicator))) {
      return ERROR_HANDLER_CONFIG.securityLevels.CRITICAL;
    }

    if (highIndicators.some(indicator => lowerMessage.includes(indicator))) {
      return ERROR_HANDLER_CONFIG.securityLevels.HIGH;
    }

    return ERROR_HANDLER_CONFIG.securityLevels.MEDIUM;
  }

  /**
   * Check if error is validation-related
   */
  isValidationError(message) {
    const validationIndicators = [
      'validation', 'invalid', 'required', 'missing', 'format', 'schema',
      'constraint', 'duplicate', 'exists', 'not found', 'out of range'
    ];

    return validationIndicators.some(indicator =>
      message.toLowerCase().includes(indicator)
    );
  }

  /**
   * Check if error is network-related
   */
  isNetworkError(message) {
    const networkIndicators = [
      'timeout', 'connection', 'network', 'econnrefused', 'econnreset',
      'enotfound', 'etimedout', 'eaiagain', 'network unreachable'
    ];

    return networkIndicators.some(indicator =>
      message.toLowerCase().includes(indicator)
    );
  }

  /**
   * Check if error is system-related
   */
  isSystemError(message, stack) {
    const systemIndicators = [
      'system', 'internal', 'fatal', 'crash', 'out of memory', 'disk full',
      'permission denied', 'file not found', 'directory', 'filesystem'
    ];

    return systemIndicators.some(indicator =>
      message.toLowerCase().includes(indicator) ||
      stack.toLowerCase().includes(indicator)
    );
  }

  /**
   * Check if error is business logic-related
   */
  isBusinessError(message) {
    const businessIndicators = [
      'business rule', 'policy', 'constraint', 'limit exceeded',
      'quota', 'rate limit', 'subscription', 'license', 'entitlement'
    ];

    return businessIndicators.some(indicator =>
      message.toLowerCase().includes(indicator)
    );
  }

  /**
   * Sanitize error to prevent information leakage
   */
  sanitizeError(error, classification) {
    const sanitized = {
      message: error.message || 'Unknown error',
      code: error.code,
      type: classification.type,
      securityLevel: classification.securityLevel,
      isSecurity: classification.isSecurity,
      isSuspicious: classification.isSuspicious
    };

    // Apply information leakage prevention
    sanitized.message = this.redactSensitiveInformation(sanitized.message);

    // Sanitize stack trace based on security level
    if (error.stack && this.shouldIncludeStackTrace(classification)) {
      sanitized.stack = this.sanitizeStackTrace(error.stack);
    }

    // Remove sensitive properties
    const safeError = { ...error };
    delete safeError.config;
    delete safeError.request;
    delete safeError.response;
    delete safeError.headers;

    // Only include safe properties
    Object.keys(safeError).forEach(key => {
      if (!['message', 'code', 'type', 'status', 'statusCode', 'path'].includes(key)) {
        sanitized[key] = typeof safeError[key] === 'string'
          ? this.redactSensitiveInformation(safeError[key])
          : safeError[key];
      }
    });

    return sanitized;
  }

  /**
   * Redact sensitive information from text
   */
  redactSensitiveInformation(text) {
    if (typeof text !== 'string') {
      return text;
    }

    let redacted = text;

    // Apply sensitive patterns
    this.config.informationLeakage.sensitivePatterns.forEach(pattern => {
      redacted = redacted.replace(pattern, (match) => {
        const parts = match.split(/[=:]/);
        if (parts.length >= 2) {
          return `${parts[0]}=***`;
        }
        return '***';
      });
    });

    // Sanitize file paths
    this.config.informationLeakage.pathFilters.forEach(pattern => {
      redacted = redacted.replace(pattern, (match) => {
        return match.replace(/[a-zA-Z0-9\-_.]+/g, (pathPart) => {
          return pathPart.length > 3 ? pathPart[0] + '***' : '***';
        });
      });
    });

    return redacted;
  }

  /**
   * Sanitize stack trace
   */
  sanitizeStackTrace(stack) {
    if (!stack) return null;

    let sanitized = stack;

    // Apply stack filters
    this.config.informationLeakage.stackFilters.forEach(filter => {
      sanitized = sanitized.replace(filter, '[FILTERED]');
    });

    // Redact sensitive information
    sanitized = this.redactSensitiveInformation(sanitized);

    // Limit stack trace length
    if (sanitized.length > 2000) {
      sanitized = sanitized.substring(0, 2000) + '\n... [TRUNCATED]';
    }

    return sanitized;
  }

  /**
   * Determine if stack trace should be included
   */
  shouldIncludeStackTrace(classification) {
    // Don't include stack trace for security errors in production
    if (process.env.NODE_ENV === 'production' && classification.isSecurity) {
      return false;
    }

    // Include stack trace for development and system errors
    if (process.env.NODE_ENV !== 'production' ||
        classification.type === ERROR_HANDLER_CONFIG.errorTypes.SYSTEM) {
      return this.config.audit.includeStackTrace;
    }

    return false;
  }

  /**
   * Sanitize context information
   */
  sanitizeContext(context) {
    const sanitized = {};

    Object.keys(context).forEach(key => {
      const value = context[key];

      if (key === 'user' && !this.config.audit.includeUserData) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = this.redactSensitiveInformation(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    });

    return sanitized;
  }

  /**
   * Recursively sanitize object
   */
  sanitizeObject(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized = {};
    Object.keys(obj).forEach(key => {
      if (['password', 'secret', 'token', 'key', 'auth'].includes(key.toLowerCase())) {
        sanitized[key] = '***';
      } else if (typeof obj[key] === 'string') {
        sanitized[key] = this.redactSensitiveInformation(obj[key]);
      } else if (typeof obj[key] === 'object') {
        sanitized[key] = this.sanitizeObject(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    });

    return sanitized;
  }

  /**
   * Check rate limiting
   */
  checkRateLimit(errorType, clientId = 'default') {
    const key = `${errorType}:${clientId}`;
    const now = Date.now();
    const windowStart = now - this.config.rateLimit.windowMs;

    if (!this.errorCounts.has(key)) {
      this.errorCounts.set(key, []);
    }

    const errors = this.errorCounts.get(key);
    const validErrors = errors.filter(time => time > windowStart);

    if (validErrors.length >= this.config.rateLimit.maxErrors) {
      throw new SecurityError('Rate limit exceeded for error reporting', {
        type: 'RATE_LIMIT',
        errorType,
        clientId
      });
    }

    validErrors.push(now);
    this.errorCounts.set(key, validErrors);
  }

  /**
   * Monitor suspicious activity
   */
  monitorSuspiciousActivity(classification, context) {
    if (!classification.isSuspicious) {
      return;
    }

    const key = context.clientId || 'anonymous';
    const now = Date.now();

    if (!this.suspiciousActivityTracker.has(key)) {
      this.suspiciousActivityTracker.set(key, []);
    }

    const activities = this.suspiciousActivityTracker.get(key);
    activities.push({
      timestamp: now,
      errorType: classification.type,
      securityLevel: classification.securityLevel,
      context: this.sanitizeContext(context)
    });

    // Keep only last 24 hours of activity
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const recentActivities = activities.filter(activity => activity.timestamp > dayAgo);
    this.suspiciousActivityTracker.set(key, recentActivities);

    // Check for patterns indicating attacks
    if (recentActivities.length >= 5) {
      this.reportSuspiciousPattern(key, recentActivities);
    }
  }

  /**
   * Report suspicious activity pattern
   */
  reportSuspiciousPattern(clientId, activities) {
    const report = {
      clientId,
      activityCount: activities.length,
      timeWindow: '24h',
      securityLevels: activities.map(a => a.securityLevel),
      errorTypes: activities.map(a => a.errorType),
      timestamp: Date.now(),
      requiresInvestigation: true
    };

    this.auditLogger.logSecurityAlert({
      type: 'SUSPICIOUS_PATTERN',
      severity: 'HIGH',
      report
    });
  }

  /**
   * Generate secure error response with actionable guidance
   */
  generateSecureResponse(classification, context) {
    const template = this.config.responseTemplates[classification.type] ||
                    this.config.responseTemplates.unknown;

    const levelTemplate = template[classification.securityLevel] || template.medium;

    const response = {
      type: classification.type,
      securityLevel: classification.securityLevel,
      message: typeof levelTemplate === 'string' ? levelTemplate : levelTemplate.message,
      code: this.generateErrorCode(classification)
    };

    // Add solution and documentation links if available
    if (typeof levelTemplate === 'object') {
      if (levelTemplate.solution) {
        response.solution = levelTemplate.solution;
      }
      if (levelTemplate.docsUrl) {
        response.documentation = levelTemplate.docsUrl;
      }
    }

    // Add troubleshooting steps for common errors
    const troubleshootingSteps = this.getTroubleshootingSteps(classification, context);
    if (troubleshootingSteps && troubleshootingSteps.length > 0) {
      response.troubleshooting = troubleshootingSteps;
    }

    // Add additional information for non-production environments
    if (process.env.NODE_ENV !== 'production') {
      response.debug = {
        originalType: classification.type,
        securityLevel: classification.securityLevel,
        isSecurity: classification.isSecurity,
        requiresImmediateAction: classification.requiresImmediateAction
      };
    }

    // Add rate limiting information
    if (this.config.rateLimit.enabled) {
      response.rateLimit = {
        windowMs: this.config.rateLimit.windowMs,
        maxErrors: this.config.rateLimit.maxErrors
      };
    }

    return response;
  }

  /**
   * Get troubleshooting steps based on error type
   */
  getTroubleshootingSteps(classification, context) {
    const steps = [];

    // Network errors
    if (classification.type === ERROR_HANDLER_CONFIG.errorTypes.NETWORK) {
      if (context.service === 'redis') {
        steps.push('Check if Redis is running: redis-cli ping');
        steps.push('Start Redis: redis-server or brew services start redis');
        steps.push('Verify Redis connection: claude-flow-novice health-check --service redis');
      } else {
        steps.push('Check internet connectivity');
        steps.push('Verify firewall settings');
        steps.push('Try again in a moment');
      }
    }

    // System errors
    if (classification.type === ERROR_HANDLER_CONFIG.errorTypes.SYSTEM) {
      steps.push('Run system diagnostics: claude-flow-novice health-check');
      steps.push('Check available memory and disk space');
      steps.push('Review logs: claude-flow-novice logs --level error');

      if (context.component) {
        steps.push(`Restart ${context.component} component`);
      }
    }

    // Validation errors
    if (classification.type === ERROR_HANDLER_CONFIG.errorTypes.VALIDATION) {
      steps.push('Review API documentation for required parameters');
      steps.push('Validate your configuration: claude-flow-novice config validate');

      if (context.missingParams) {
        steps.push(`Add missing parameters: ${context.missingParams.join(', ')}`);
      }
    }

    // Security errors
    if (classification.type === ERROR_HANDLER_CONFIG.errorTypes.SECURITY) {
      steps.push('Verify authentication credentials');
      steps.push('Check API key or token expiration');
      steps.push('Review security documentation');
    }

    return steps;
  }

  /**
   * Generate error code
   */
  generateErrorCode(classification) {
    const typePrefix = classification.type.substring(0, 3).toUpperCase();
    const levelPrefix = classification.securityLevel.substring(0, 2).toUpperCase();
    const randomSuffix = randomBytes(4).toString('hex').toUpperCase();

    return `${typePrefix}_${levelPrefix}_${randomSuffix}`;
  }

  /**
   * Get error statistics
   */
  getErrorStatistics() {
    const stats = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySecurityLevel: {},
      suspiciousActivities: 0,
      rateLimitViolations: 0,
      last24hErrors: 0
    };

    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);

    // Count errors
    for (const [key, errors] of this.errorCounts.entries()) {
      const recentErrors = errors.filter(time => time > dayAgo);
      stats.last24hErrors += recentErrors.length;
      stats.totalErrors += errors.length;

      const [errorType] = key.split(':');
      stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + errors.length;
    }

    // Count suspicious activities
    for (const activities of this.suspiciousActivityTracker.values()) {
      if (activities.length > 0) {
        stats.suspiciousActivities++;
      }
    }

    return stats;
  }

  /**
   * Clean up old data
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.config.rateLimit.windowMs;

    // Clean up old error counts
    for (const [key, errors] of this.errorCounts.entries()) {
      const validErrors = errors.filter(time => time > windowStart);
      if (validErrors.length === 0) {
        this.errorCounts.delete(key);
      } else {
        this.errorCounts.set(key, validErrors);
      }
    }

    // Clean up old suspicious activity records
    const dayAgo = now - (24 * 60 * 60 * 1000);
    for (const [key, activities] of this.suspiciousActivityTracker.entries()) {
      const recentActivities = activities.filter(activity => activity.timestamp > dayAgo);
      if (recentActivities.length === 0) {
        this.suspiciousActivityTracker.delete(key);
      } else {
        this.suspiciousActivityTracker.set(key, recentActivities);
      }
    }
  }
}

/**
 * Security Error class
 */
export class SecurityError extends Error {
  constructor(message, metadata = {}) {
    super(message);
    this.name = 'SecurityError';
    this.isSecurity = true;
    this.metadata = metadata;
  }
}

/**
 * Audit Logger for security events
 */
class AuditLogger {
  constructor(config) {
    this.config = config;
    this.logFile = process.env.SECURITY_AUDIT_LOG || './logs/security-audit.log';
  }

  async logError(errorData) {
    if (!this.config.enabled) return;

    try {
      const logEntry = {
        timestamp: errorData.timestamp,
        type: 'ERROR',
        errorId: errorData.errorId,
        errorType: errorData.classification.type,
        securityLevel: errorData.classification.securityLevel,
        isSecurity: errorData.classification.isSecurity,
        message: errorData.error.message,
        context: errorData.context,
        userAgent: process.env.USER_AGENT || 'unknown'
      };

      await this.writeToLog(logEntry);
    } catch (error) {
      console.error('Failed to log error audit:', error.message);
    }
  }

  async logSecurityAlert(alertData) {
    if (!this.config.enabled) return;

    try {
      const logEntry = {
        timestamp: Date.now(),
        type: 'SECURITY_ALERT',
        alertType: alertData.type,
        severity: alertData.severity,
        data: alertData.report || alertData.data,
        requiresInvestigation: true
      };

      await this.writeToLog(logEntry);

      // Send immediate notification for critical alerts
      if (alertData.severity === 'CRITICAL') {
        await this.sendCriticalAlert(logEntry);
      }
    } catch (error) {
      console.error('Failed to log security alert:', error.message);
    }
  }

  async writeToLog(logEntry) {
    const logLine = JSON.stringify(logEntry) + '\n';

    if (logLine.length > this.config.maxLogSize) {
      // Truncate large log entries
      const truncated = logLine.substring(0, this.config.maxLogSize - 20) + '... [TRUNCATED]\n';
      await this.appendToFile(truncated);
    } else {
      await this.appendToFile(logLine);
    }
  }

  async appendToFile(logLine) {
    const fs = require('fs').promises;
    try {
      await fs.appendFile(this.logFile, logLine);
    } catch (error) {
      console.error('Failed to write to audit log:', error.message);
    }
  }

  async sendCriticalAlert(alertData) {
    // Implement critical alert notification
    // This could send to SIEM, security team, etc.
    console.error('CRITICAL SECURITY ALERT:', JSON.stringify(alertData));
  }
}

// Export singleton instance
export const secureErrorHandler = new SecureErrorHandler();

export default SecureErrorHandler;