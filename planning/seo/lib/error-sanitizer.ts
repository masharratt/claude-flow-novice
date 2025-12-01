/**
 * Error Sanitizer for SEO Research Service
 *
 * @module planning/seo/lib/error-sanitizer
 * @description Sanitizes error messages to remove sensitive data (queries, URLs, cache keys)
 * before propagating errors to prevent information leakage
 *
 * SECURITY FIX: Error messages can leak sensitive business intelligence
 * (e.g., competitor research queries, internal URLs, cache key patterns)
 * This module provides utilities to redact sensitive fields while preserving
 * debugging information needed for troubleshooting
 */

/**
 * List of fields that should be redacted from error messages
 * These fields commonly contain sensitive data
 */
const SENSITIVE_FIELDS = ['query', 'url', 'cacheKey', 'targetUrl', 'apiKey', 'token'];

/**
 * ErrorSanitizer provides static methods for sanitizing errors
 *
 * Usage:
 * ```typescript
 * try {
 *   const result = await risky();
 * } catch (error) {
 *   throw new ResearchError(
 *     'Operation failed',
 *     ResearchErrorCode.UNKNOWN_ERROR,
 *     { cause: ErrorSanitizer.sanitize(error as Error) }
 *   );
 * }
 * ```
 */
export class ErrorSanitizer {
  /**
   * Sanitize an error by removing sensitive fields from context
   *
   * @param error - Error to sanitize
   * @returns New error with sensitive fields redacted
   *
   * SECURITY NOTES:
   * - Preserves error name and message for debugging
   * - Removes nested objects containing sensitive queries/URLs
   * - Maintains error codes and types for programmatic handling
   * - Does NOT strip stack traces (can contain sensitive info, handle separately if needed)
   */
  static sanitize(error: Error): Error {
    const sanitized = new Error(error.message);
    sanitized.name = error.name;

    // Copy stack trace for debugging (consider stripping in production)
    if (error.stack) {
      sanitized.stack = error.stack;
    }

    // Sanitize any custom error context
    const errorObj = (error as unknown) as Record<string, unknown>;

    if (errorObj.context && typeof errorObj.context === 'object') {
      const originalContext = (errorObj.context as unknown) as Record<string, unknown>;
      const sanitizedContext: Record<string, unknown> = {};

      // Copy over safe fields, redact sensitive ones
      for (const [key, value] of Object.entries(originalContext)) {
        if (this.isSensitiveField(key)) {
          sanitizedContext[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          // Recursively sanitize nested objects
          sanitizedContext[key] = this.sanitizeObject(value);
        } else {
          sanitizedContext[key] = value;
        }
      }

      ((sanitized as unknown) as Record<string, unknown>).context = sanitizedContext;
    }

    // Sanitize other custom properties
    for (const [key, value] of Object.entries(errorObj)) {
      if (
        key !== 'message' &&
        key !== 'name' &&
        key !== 'stack' &&
        key !== 'context' &&
        this.isSensitiveField(key)
      ) {
        ((sanitized as unknown) as Record<string, unknown>)[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Sanitize error context by removing sensitive fields
   *
   * @param context - Context object to sanitize
   * @returns Sanitized context
   */
  private static sanitizeContext(context: unknown): Record<string, unknown> {
    if (!context || typeof context !== 'object') {
      return {};
    }

    const ctx = (context as unknown) as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(ctx)) {
      if (this.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if a field name contains sensitive information
   *
   * @param fieldName - Field name to check
   * @returns True if field should be redacted
   */
  static isSensitiveField(fieldName: string): boolean {
    const lowerKey = fieldName.toLowerCase();

    // Check against known sensitive fields
    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field))) {
      return true;
    }

    // Check for patterns
    if (lowerKey.includes('secret') || lowerKey.includes('password') || lowerKey.includes('key')) {
      return true;
    }

    return false;
  }

  /**
   * Recursively sanitize an object, removing sensitive nested data
   *
   * @param obj - Object to sanitize
   * @returns Sanitized object with sensitive fields redacted
   */
  static sanitizeObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      const objRecord = obj as Record<string, unknown>;

      for (const [key, value] of Object.entries(objRecord)) {
        if (this.isSensitiveField(key)) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }

      return sanitized;
    }

    return obj;
  }

  /**
   * Sanitize error for logging while preserving debugging capability
   *
   * Returns a minimal error representation safe for external logging systems
   *
   * @param error - Error to sanitize
   * @returns Object safe for logging
   */
  static toLoggableObject(error: Error): Record<string, unknown> {
    return {
      type: error.name,
      message: error.message,
      // Stack trace can contain sensitive info - consider removing in production
      // stack: error.stack,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create a safe error message from potentially sensitive error
   *
   * @param error - Original error
   * @param fallbackMessage - Message to use if error is too sensitive
   * @returns Safe error message
   */
  static createSafeMessage(error: Error, fallbackMessage: string = 'An error occurred'): string {
    const msg = error.message || '';

    // Check if error message itself contains sensitive patterns
    if (this.containsSensitiveContent(msg)) {
      return fallbackMessage;
    }

    return msg;
  }

  /**
   * Check if a string contains sensitive content patterns
   *
   * @param str - String to check
   * @returns True if string appears to contain sensitive data
   */
  static containsSensitiveContent(str: string): boolean {
    const sensitivePatterns = [
      /https?:\/\//i, // URLs
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, // Email addresses
      /sk-[a-zA-Z0-9]{20,}/i, // API keys pattern
      /password|secret|token|api[_-]?key/i, // Credential keywords
    ];

    return sensitivePatterns.some((pattern) => pattern.test(str));
  }
}

/**
 * Export singleton instance for common use cases
 */
export const errorSanitizer = new ErrorSanitizer();
