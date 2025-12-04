/**
 * Input Validation Module for SEO Pipeline
 *
 * Comprehensive input validation with XSS/SQLi detection, pattern matching,
 * and sanitization to prevent injection attacks.
 *
 * @module seo/lib/security/input-validator
 */

/**
 * Validation rule configuration
 */
export interface ValidationRule {
  /** Pattern to validate against */
  pattern: RegExp;
  /** Maximum allowed input length */
  maxLength: number;
  /** Pattern for allowed characters only */
  allowedChars: RegExp;
  /** Sanitization function */
  sanitize: (input: string) => string;
}

/**
 * Validation rules for different input types
 */
export const VALIDATION_RULES: Record<string, ValidationRule> = {
  niche: {
    pattern: /^[a-zA-Z0-9\s\-.,&()]+$/,
    maxLength: 200,
    allowedChars: /[^a-zA-Z0-9\s\-.,&()]/g,
    sanitize: (input: string) => input.replace(/[<>'"]/g, ''),
  },
  taskId: {
    pattern: /^[a-f0-9-]{36}$/i, // UUID format
    maxLength: 36,
    allowedChars: /[^a-f0-9-]/gi,
    sanitize: (input: string) => input.toLowerCase(),
  },
  keyword: {
    pattern: /^[a-zA-Z0-9\s\-.,!?'"()]+$/,
    maxLength: 500,
    allowedChars: /[<>{}[\]\\|`]/g,
    sanitize: (input: string) => input.replace(/[<>{}[\]\\|`]/g, ''),
  },
  url: {
    pattern: /^https?:\/\/[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,}){1,2}(\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]*)?$/,
    maxLength: 2048,
    allowedChars: /[^a-zA-Z0-9:/?#[\]@!$&'()*+,;=._~-]/g,
    sanitize: (input: string) => input.trim(),
  },
  siteUrl: {
    pattern: /^https?:\/\/[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,}){1,2}(\/)?$/,
    maxLength: 512,
    allowedChars: /[^a-zA-Z0-9:/?#._~-]/g,
    sanitize: (input: string) => input.trim().toLowerCase(),
  },
  domain: {
    pattern: /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    maxLength: 255,
    allowedChars: /[^a-zA-Z0-9.-]/g,
    sanitize: (input: string) => input.toLowerCase(),
  },
};

/**
 * XSS detection patterns
 */
const XSS_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /on\w+\s*=/i, // onerror=, onload=, etc.
  /<iframe\b/i,
  /<img\b/i,
  /eval\(/i,
  /expression\(/i,
  /vbscript:/i,
];

/**
 * SQL injection detection patterns
 */
const SQLI_PATTERNS = [
  /(\bor\b|\band\b)[\s]+(?:1|true|.+?)\s*[=<>]/i,
  /union[\s]+select/i,
  /drop[\s]+table/i,
  /insert[\s]+into/i,
  /--[\s]*$/,
  /;[\s]*drop/i,
  /xp_/i, // SQL Server stored procedures
  /exec[\s]*\(/i,
  /execute[\s]*\(/i,
];

/**
 * Detect potential XSS attack patterns
 *
 * @param input - Input string to check
 * @returns true if potential XSS detected
 */
export function detectXSS(input: string): boolean {
  return XSS_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Detect potential SQL injection patterns
 *
 * @param input - Input string to check
 * @returns true if potential SQLi detected
 */
export function detectSQLi(input: string): boolean {
  return SQLI_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Detect other common injection patterns
 *
 * @param input - Input string to check
 * @returns true if injection pattern detected
 */
export function detectInjection(input: string): boolean {
  const injectionPatterns = [
    /\$\{.*\}/, // Template injection
    /\{\{.*\}\}/, // Template injection
    /%\d{1,2}x/i, // Format string
    /\x00/, // Null byte injection
  ];

  return injectionPatterns.some((pattern) => pattern.test(input));
}

/**
 * Validate input against a specific rule set
 *
 * Performs comprehensive validation including:
 * - Length checks
 * - Pattern matching
 * - Sanitization
 * - XSS detection
 * - SQL injection detection
 * - General injection patterns
 *
 * @param input - Input string to validate
 * @param type - Validation rule type
 * @returns Sanitized input if valid
 * @throws Error if validation fails
 *
 * @example
 * ```typescript
 * const safeKeyword = validateInput(userInput, 'keyword');
 * const safeNiche = validateInput(userInput, 'niche');
 * ```
 */
export function validateInput(input: string, type: keyof typeof VALIDATION_RULES): string {
  // Null/undefined check
  if (!input || typeof input !== 'string') {
    throw new Error(`Invalid input: must be a non-empty string`);
  }

  const rule = VALIDATION_RULES[type];
  if (!rule) {
    throw new Error(`Unknown validation type: ${type}`);
  }

  // Length check
  if (input.length === 0) {
    throw new Error(`Input cannot be empty`);
  }

  if (input.length > rule.maxLength) {
    throw new Error(`Input exceeds maximum length of ${rule.maxLength} characters`);
  }

  // Check for null bytes
  if (input.includes('\x00')) {
    throw new Error(`Input contains invalid null bytes`);
  }

  // XSS detection (before sanitization for logging)
  if (detectXSS(input)) {
    throw new Error(`Input contains potential XSS attack pattern`);
  }

  // SQLi detection (before sanitization for logging)
  if (detectSQLi(input)) {
    throw new Error(`Input contains potential SQL injection pattern`);
  }

  // General injection detection
  if (detectInjection(input)) {
    throw new Error(`Input contains potential injection pattern`);
  }

  // Sanitize
  const sanitized = rule.sanitize(input);

  // Pattern check
  if (!rule.pattern.test(sanitized)) {
    throw new Error(`Input contains invalid characters for type "${type}"`);
  }

  // Post-sanitization checks
  if (detectXSS(sanitized)) {
    throw new Error(`Sanitized input still contains XSS pattern`);
  }

  if (detectSQLi(sanitized)) {
    throw new Error(`Sanitized input still contains SQLi pattern`);
  }

  return sanitized;
}

/**
 * Safely validate multiple inputs with the same rule
 *
 * @param inputs - Array of input strings
 * @param type - Validation rule type
 * @returns Array of sanitized inputs
 * @throws Error on first validation failure with index info
 */
export function validateInputBatch(
  inputs: string[],
  type: keyof typeof VALIDATION_RULES
): string[] {
  return inputs.map((input, index) => {
    try {
      return validateInput(input, type);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Validation failed for input ${index}: ${message}`);
    }
  });
}

/**
 * Validate and filter an array of inputs, removing invalid ones
 *
 * Useful for batch operations where partial failures are acceptable.
 *
 * @param inputs - Array of input strings
 * @param type - Validation rule type
 * @param onError - Optional callback for validation errors
 * @returns Array of valid sanitized inputs
 */
export function validateInputBatchSoft(
  inputs: string[],
  type: keyof typeof VALIDATION_RULES,
  onError?: (input: string, error: Error, index: number) => void
): string[] {
  return inputs
    .map((input, index) => {
      try {
        return validateInput(input, type);
      } catch (error) {
        if (onError && error instanceof Error) {
          onError(input, error, index);
        }
        return null;
      }
    })
    .filter((input): input is string => input !== null);
}

/**
 * Create a custom validator with specific rules
 *
 * @param pattern - Regex pattern for validation
 * @param maxLength - Maximum input length
 * @param allowedChars - Pattern for allowed characters
 * @returns Validation function
 *
 * @example
 * ```typescript
 * const emailValidator = createValidator(
 *   /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
 *   254,
 *   /[^a-zA-Z0-9._%+\-@]/g
 * );
 * const safe = emailValidator(userEmail);
 * ```
 */
export function createValidator(
  pattern: RegExp,
  maxLength: number,
  allowedChars: RegExp
): (input: string) => string {
  return (input: string) => {
    if (!input || typeof input !== 'string') {
      throw new Error('Invalid input');
    }

    if (input.length > maxLength) {
      throw new Error(`Input exceeds maximum length of ${maxLength}`);
    }

    if (detectXSS(input) || detectSQLi(input) || detectInjection(input)) {
      throw new Error('Input contains attack pattern');
    }

    // Remove disallowed characters
    const sanitized = input.replace(allowedChars, '');

    if (!pattern.test(sanitized)) {
      throw new Error('Input does not match expected format');
    }

    return sanitized;
  };
}
