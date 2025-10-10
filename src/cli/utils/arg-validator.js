/**
 * CLI Argument Validation Utilities with Production Security Hardening
 */

// import { SecurityUtils } from '../../config/production-security.js';

/**
 * Security limits for production environments
 */
const PRODUCTION_LIMITS = {
  // Objective limits
  objective: {
    minLength: 1,
    maxLength: 2000,
    forbiddenPatterns: [
      /[<>]/,                    // HTML injection
      /javascript:/i,           // JavaScript injection
      /data:/i,                 // Data URI
      /vbscript:/i,             // VBScript injection
      /(\r\n|\n|\r)/,           // Newline injection
      /\\x[0-9a-fA-F]{2}/g,     // Hex encoding attempts
      /%[0-9a-fA-F]{2}/g,       // URL encoding attempts
      /\\u[0-9a-fA-F]{4}/g      // Unicode encoding attempts
    ]
  },

  // Agent limits for DoS protection
  agents: {
    minAgents: 1,
    maxAgents: process.env.NODE_ENV === 'production' ? 10 : 20, // Stricter in production
    maxAgentsPerStrategy: {
      'auto': 15,
      'development': 10,
      'research': 8,
      'testing': 6,
      'analysis': 12,
      'optimization': 8,
      'maintenance': 5
    }
  },

  // Timeout limits
  timeout: {
    minMinutes: 1,
    maxMinutes: process.env.NODE_ENV === 'production' ? 60 : 1440, // 1 hour max in production
    defaultMinutes: 30
  },

  // Rate limiting
  rateLimit: {
    windowMs: 60000, // 1 minute
    maxRequests: process.env.NODE_ENV === 'production' ? 100 : 1000,
    burstLimit: process.env.NODE_ENV === 'production' ? 20 : 100
  },

  // Input sanitization
  sanitization: {
    stripHTML: true,
    normalizeWhitespace: true,
    removeControlChars: true,
    maxLengthAfterSanitization: 1800 // Leave room for escaping
  }
};

/**
 * Validate and sanitize basic command line arguments with production security
 */
export function validateArgs(args) {
  const errors = [];
  const warnings = [];
  const sanitized = {};

  try {
    // Validate and sanitize objective
    const objectiveValidation = validateObjective(args.objective);
    if (!objectiveValidation.valid) {
      errors.push(...objectiveValidation.errors);
    } else {
      sanitized.objective = objectiveValidation.value;
      warnings.push(...objectiveValidation.warnings);
    }

    // Validate max-agents with DoS protection
    const agentsValidation = validateMaxAgents(args.maxAgents, args.strategy);
    if (!agentsValidation.valid) {
      errors.push(...agentsValidation.errors);
    } else {
      sanitized.maxAgents = agentsValidation.value;
      warnings.push(...agentsValidation.warnings);
    }

    // Validate timeout with production limits
    const timeoutValidation = validateTimeout(args.timeout);
    if (!timeoutValidation.valid) {
      errors.push(...timeoutValidation.errors);
    } else {
      sanitized.timeout = timeoutValidation.value;
      warnings.push(...timeoutValidation.warnings);
    }

    // Validate strategy
    const strategyValidation = validateStrategy(args.strategy);
    if (!strategyValidation.valid) {
      errors.push(...strategyValidation.errors);
    } else {
      sanitized.strategy = strategyValidation.value;
    }

    // Validate mode
    const modeValidation = validateMode(args.mode);
    if (!modeValidation.valid) {
      errors.push(...modeValidation.errors);
    } else {
      sanitized.mode = modeValidation.value;
    }

    // Validate output format
    const outputFormatValidation = validateOutputFormat(args.outputFormat);
    if (!outputFormatValidation.valid) {
      errors.push(...outputFormatValidation.errors);
    } else {
      sanitized.outputFormat = outputFormatValidation.value;
    }

    // Validate Redis configuration with security checks
    const redisValidation = validateRedisConfigSecure(args);
    if (!redisValidation.valid) {
      errors.push(...redisValidation.errors);
    } else {
      sanitized.redis = redisValidation.value;
    }

    // Additional security validations for production
    if (process.env.NODE_ENV === 'production') {
      const productionValidation = validateProductionSecurity(args);
      if (!productionValidation.valid) {
        errors.push(...productionValidation.errors);
      }
      warnings.push(...productionValidation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitized
    };

  } catch (error) {
    // Handle validation errors securely
    return {
      valid: false,
      errors: [`Validation error: ${sanitizeErrorMessage(error.message)}`],
      warnings,
      sanitized
    };
  }
}

/**
 * Validate and sanitize objective with security checks
 */
function validateObjective(objective) {
  const errors = [];
  const warnings = [];

  if (!objective || typeof objective !== 'string') {
    return {
      valid: false,
      errors: ['Objective is required and must be a string'],
      warnings,
      value: null
    };
  }

  // Trim whitespace
  let sanitized = objective.trim();

  // Check minimum length
  if (sanitized.length < PRODUCTION_LIMITS.objective.minLength) {
    errors.push('Objective must not be empty');
  }

  // Check maximum length
  if (sanitized.length > PRODUCTION_LIMITS.objective.maxLength) {
    errors.push(`Objective exceeds maximum length of ${PRODUCTION_LIMITS.objective.maxLength} characters`);
    return { valid: false, errors, warnings, value: null };
  }

  // Check for forbidden patterns
  for (const pattern of PRODUCTION_LIMITS.objective.forbiddenPatterns) {
    if (pattern.test(sanitized)) {
      errors.push('Objective contains forbidden characters or patterns');
      return { valid: false, errors, warnings, value: null };
    }
  }

  // Apply sanitization
  if (PRODUCTION_LIMITS.sanitization.stripHTML) {
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  }

  if (PRODUCTION_LIMITS.sanitization.normalizeWhitespace) {
    sanitized = sanitized.replace(/\s+/g, ' ');
  }

  if (PRODUCTION_LIMITS.sanitization.removeControlChars) {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  }

  // Check length after sanitization
  if (sanitized.length > PRODUCTION_LIMITS.sanitization.maxLengthAfterSanitization) {
    sanitized = sanitized.substring(0, PRODUCTION_LIMITS.sanitization.maxLengthAfterSanitization);
    warnings.push('Objective was truncated due to length limits after sanitization');
  }

  // Security warnings for sensitive content
  if (sanitized.toLowerCase().includes('password') ||
      sanitized.toLowerCase().includes('secret') ||
      sanitized.toLowerCase().includes('token')) {
    warnings.push('Objective contains potentially sensitive terms');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    value: sanitized
  };
}

/**
 * Validate max agents with DoS protection and strategy-specific limits
 */
function validateMaxAgents(maxAgents, strategy) {
  const errors = [];
  const warnings = [];

  if (maxAgents === undefined || maxAgents === null) {
    return {
      valid: true,
      errors,
      warnings,
      value: Math.min(5, PRODUCTION_LIMITS.agents.maxAgents) // Safe default
    };
  }

  const parsed = parseInt(maxAgents, 10);

  if (isNaN(parsed)) {
    errors.push('max-agents must be a valid number');
    return { valid: false, errors, warnings, value: null };
  }

  // Check absolute limits
  if (parsed < PRODUCTION_LIMITS.agents.minAgents) {
    errors.push(`max-agents must be at least ${PRODUCTION_LIMITS.agents.minAgents}`);
    return { valid: false, errors, warnings, value: null };
  }

  if (parsed > PRODUCTION_LIMITS.agents.maxAgents) {
    errors.push(`max-agents cannot exceed ${PRODUCTION_LIMITS.agents.maxAgents} in production`);
    return { valid: false, errors, warnings, value: null };
  }

  // Strategy-specific limits
  if (strategy && PRODUCTION_LIMITS.agents.maxAgentsPerStrategy[strategy]) {
    const strategyLimit = PRODUCTION_LIMITS.agents.maxAgentsPerStrategy[strategy];
    if (parsed > strategyLimit) {
      warnings.push(`Strategy '${strategy}' recommends maximum ${strategyLimit} agents`);
    }
  }

  // Resource usage warnings
  if (parsed > 10) {
    warnings.push('High agent count may impact system performance');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    value: parsed
  };
}

/**
 * Validate timeout with production security limits
 */
function validateTimeout(timeout) {
  const errors = [];
  const warnings = [];

  if (timeout === undefined || timeout === null) {
    return {
      valid: true,
      errors,
      warnings,
      value: PRODUCTION_LIMITS.timeout.defaultMinutes
    };
  }

  const parsed = parseInt(timeout, 10);

  if (isNaN(parsed)) {
    errors.push('timeout must be a valid number');
    return { valid: false, errors, warnings, value: null };
  }

  if (parsed < PRODUCTION_LIMITS.timeout.minMinutes) {
    errors.push(`timeout must be at least ${PRODUCTION_LIMITS.timeout.minMinutes} minute`);
    return { valid: false, errors, warnings, value: null };
  }

  if (parsed > PRODUCTION_LIMITS.timeout.maxMinutes) {
    errors.push(`timeout cannot exceed ${PRODUCTION_LIMITS.timeout.maxMinutes} minutes in production`);
    return { valid: false, errors, warnings, value: null };
  }

  // Resource usage warnings
  if (parsed > 30) {
    warnings.push('Long timeout periods may consume significant resources');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    value: parsed
  };
}

/**
 * Validate strategy
 */
function validateStrategy(strategy) {
  const errors = [];
  const validStrategies = ['auto', 'development', 'research', 'testing', 'analysis', 'optimization', 'maintenance'];

  if (!strategy) {
    return {
      valid: true,
      errors,
      warnings: [],
      value: 'auto' // Safe default
    };
  }

  if (!validStrategies.includes(strategy)) {
    errors.push(`strategy must be one of: ${validStrategies.join(', ')}`);
    return { valid: false, errors, warnings: [], value: null };
  }

  return {
    valid: true,
    errors,
    warnings: [],
    value: strategy
  };
}

/**
 * Validate mode
 */
function validateMode(mode) {
  const errors = [];
  const validModes = ['centralized', 'distributed', 'hierarchical', 'mesh', 'hybrid'];

  if (!mode) {
    return {
      valid: true,
      errors,
      warnings: [],
      value: 'mesh' // Safe default
    };
  }

  if (!validModes.includes(mode)) {
    errors.push(`mode must be one of: ${validModes.join(', ')}`);
    return { valid: false, errors, warnings: [], value: null };
  }

  return {
    valid: true,
    errors,
    warnings: [],
    value: mode
  };
}

/**
 * Validate output format
 */
function validateOutputFormat(outputFormat) {
  const errors = [];
  const validOutputFormats = ['json', 'text', 'stream'];

  if (!outputFormat) {
    return {
      valid: true,
      errors,
      warnings: [],
      value: 'json' // Safe default
    };
  }

  if (!validOutputFormats.includes(outputFormat)) {
    errors.push(`output-format must be one of: ${validOutputFormats.join(', ')}`);
    return { valid: false, errors, warnings: [], value: null };
  }

  return {
    valid: true,
    errors,
    warnings: [],
    value: outputFormat
  };
}

/**
 * Validate Redis configuration with security enhancements
 */
function validateRedisConfigSecure(args) {
  const errors = [];
  const warnings = [];
  const redisConfig = {};

  // Host validation
  if (args.redisHost) {
    if (typeof args.redisHost !== 'string') {
      errors.push('Redis host must be a string');
    } else {
      // Security checks for host
      const host = args.redisHost.trim();

      // Prevent internal network access in production
      if (process.env.NODE_ENV === 'production') {
        if (host === '0.0.0.0' || host === '::' || host.startsWith('169.254.')) {
          errors.push('Invalid Redis host for production environment');
        }
      }

      // Localhost validation
      if (!/^localhost|^127\.|^::1$|^[\w\.-]+$/.test(host)) {
        warnings.push('Redis host format may be unusual');
      }

      redisConfig.host = host;
    }
  }

  // Port validation with security checks
  if (args.redisPort !== undefined) {
    const port = parseInt(args.redisPort);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('Redis port must be between 1 and 65535');
    } else {
      // Security warnings for non-standard ports
      if (port === 6379) {
        warnings.push('Using default Redis port may be less secure');
      }
      redisConfig.port = port;
    }
  }

  // Password validation for production
  if (process.env.NODE_ENV === 'production') {
    if (!args.redisPassword && !process.env.REDIS_PASSWORD) {
      errors.push('Redis password is required in production environment');
    } else if (args.redisPassword) {
      if (typeof args.redisPassword !== 'string') {
        errors.push('Redis password must be a string');
      } else if (args.redisPassword.length < 32) {
        warnings.push('Redis password should be at least 32 characters for security');
      }
      redisConfig.password = args.redisPassword;
    }
  }

  // TLS validation for production
  if (process.env.NODE_ENV === 'production' && args.redisTls === false) {
    warnings.push('TLS is disabled for Redis - not recommended for production');
  }

  redisConfig.tls = args.redisTls !== false;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    value: Object.keys(redisConfig).length > 0 ? redisConfig : undefined
  };
}

/**
 * Additional production security validations
 */
function validateProductionSecurity(args) {
  const errors = [];
  const warnings = [];

  // Check for insecure flags
  if (args.skipAuth === true) {
    errors.push('Authentication cannot be skipped in production');
  }

  if (args.debug === true) {
    warnings.push('Debug mode enabled in production - may expose sensitive information');
  }

  if (args.verbose === true) {
    warnings.push('Verbose logging enabled in production - may expose sensitive information');
  }

  // Check for environment variables
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
    warnings.push('NODE_ENV should be set to production for security');
  }

  // Check for security headers
  if (!process.env.SECURITY_ENABLED || process.env.SECURITY_ENABLED !== 'true') {
    warnings.push('Security features should be enabled in production');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Sanitize error messages to prevent information leakage
 */
function sanitizeErrorMessage(message) {
  return message
    .replace(/password[=:][\w\-\.]+/gi, 'password=***')
    .replace(/secret[=:][\w\-\.]+/gi, 'secret=***')
    .replace(/token[=:][\w\-\.]+/gi, 'token=***')
    .replace(/key[=:][\w\-\.]+/gi, 'key=***')
    .replace(/\/.*\/users/gi, '/***/users')
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '***.***.***.***')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***');
}

/**
 * Validate swarm configuration
 */
export function validateSwarmConfig(config) {
  const errors = [];

  // Validate required fields
  if (!config.strategy) {
    errors.push('Strategy is required');
  }

  if (!config.mode) {
    errors.push('Mode is required');
  }

  if (!config.maxAgents || config.maxAgents < 1 || config.maxAgents > 50) {
    errors.push('maxAgents must be between 1 and 50');
  }

  // Validate Redis configuration
  if (config.persist) {
    if (!config.redis) {
      errors.push('Redis configuration is required when persistence is enabled');
    } else {
      if (!config.redis.host) {
        errors.push('Redis host is required');
      }
      if (!config.redis.port || config.redis.port < 1 || config.redis.port > 65535) {
        errors.push('Redis port must be between 1 and 65535');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate and parse numeric arguments
 */
export function parseNumber(value, defaultValue = null, min = null, max = null) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }

  if (min !== null && parsed < min) {
    throw new Error(`Value ${parsed} is below minimum ${min}`);
  }

  if (max !== null && parsed > max) {
    throw new Error(`Value ${parsed} is above maximum ${max}`);
  }

  return parsed;
}

/**
 * Validate boolean arguments
 */
export function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const str = String(value).toLowerCase();
  const truthyValues = ['true', '1', 'yes', 'on', 'enabled'];
  const falsyValues = ['false', '0', 'no', 'off', 'disabled'];

  if (truthyValues.includes(str)) {
    return true;
  }

  if (falsyValues.includes(str)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

/**
 * Validate file path arguments
 */
export function validateFilePath(path, mustExist = false) {
  if (!path || typeof path !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  // Basic path validation
  if (path.includes('..') || path.includes('~')) {
    throw new Error('File path cannot contain relative navigation');
  }

  if (mustExist) {
    const fs = require('fs');
    if (!fs.existsSync(path)) {
      throw new Error(`File does not exist: ${path}`);
    }
  }

  return path;
}

/**
 * Validate Redis connection configuration
 */
export function validateRedisConfig(config) {
  const errors = [];

  if (!config.host || typeof config.host !== 'string') {
    errors.push('Redis host is required and must be a string');
  }

  if (config.port === undefined) {
    errors.push('Redis port is required');
  } else {
    const port = parseInt(config.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('Redis port must be between 1 and 65535');
    }
  }

  if (config.password && typeof config.password !== 'string') {
    errors.push('Redis password must be a string');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate output format and file compatibility
 */
export function validateOutputConfig(format, outputFile) {
  const errors = [];

  const validFormats = ['json', 'text', 'stream'];
  if (!validFormats.includes(format)) {
    errors.push(`Invalid output format: ${format}. Must be one of: ${validFormats.join(', ')}`);
  }

  if (outputFile) {
    if (typeof outputFile !== 'string') {
      errors.push('Output file path must be a string');
    } else {
      // Check if directory exists and is writable
      const path = require('path');
      const fs = require('fs');

      const dir = path.dirname(outputFile);
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (error) {
          errors.push(`Cannot create output directory: ${dir}`);
        }
      }

      // Check write permissions
      try {
        fs.accessSync(dir, fs.constants.W_OK);
      } catch (error) {
        errors.push(`No write permission for directory: ${dir}`);
      }
    }
  }

  // Special validation for stream format
  if (format === 'stream' && outputFile) {
    errors.push('Stream format cannot be used with output file');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}