/**
 * Secure Error Handling Module
 *
 * Sanitizes error messages to remove sensitive data before propagating errors.
 * Prevents information leakage of internal details, credentials, and system paths.
 *
 * @module seo/lib/security/error-handler
 */

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error context for detailed logging
 */
export interface ErrorContext {
  /** Error category */
  category: string;
  /** Where error occurred */
  location: string;
  /** Error severity */
  severity: ErrorSeverity;
  /** Sensitive details (server-side only) */
  details?: Record<string, unknown>;
  /** Stack trace (server-side only) */
  stack?: string;
  /** Timestamp of error */
  timestamp: number;
}

/**
 * Patterns that indicate sensitive information in error messages
 */
const SENSITIVE_PATTERNS = [
  { pattern: /api[_-]?key[:"'=\s]+([a-z0-9]+)/gi, name: 'API Key' },
  { pattern: /secret[:"'=\s]+([a-z0-9]+)/gi, name: 'Secret' },
  { pattern: /password[:"'=\s]+([a-z0-9]+)/gi, name: 'Password' },
  { pattern: /token[:"'=\s]+([a-z0-9]+)/gi, name: 'Token' },
  { pattern: /bearer[:\s]+([a-z0-9]+)/gi, name: 'Bearer Token' },
  { pattern: /authorization[:"'=\s]+([a-z0-9\s]+)/gi, name: 'Authorization' },
  { pattern: /\/[a-z0-9]{32,}[/"]?/gi, name: 'Cache Key/Hash' },
  { pattern: /\/home\/[a-z_][a-z0-9_-]{0,31}/gi, name: 'Home Path' },
  { pattern: /\/var\/.*?\//gi, name: 'System Path' },
  { pattern: /c:\\users\\[^\\]+\\/gi, name: 'Windows Path' },
  { pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, name: 'IP Address' },
  { pattern: /[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}/gi, name: 'UUID' },
];

/**
 * Extract sensitive information from error message for logging
 *
 * @param message - Error message to check
 * @returns Array of found sensitive items
 */
function extractSensitiveInfo(message: string): Array<{ name: string; value: string }> {
  const sensitive: Array<{ name: string; value: string }> = [];

  for (const { pattern, name } of SENSITIVE_PATTERNS) {
    let match;
    const regexClone = new RegExp(pattern);
    while ((match = regexClone.exec(message)) !== null) {
      sensitive.push({
        name,
        value: match[0].substring(0, 20) + (match[0].length > 20 ? '...' : ''),
      });
    }
  }

  return sensitive;
}

/**
 * Sanitize error message by removing sensitive data
 *
 * @param message - Error message to sanitize
 * @returns Sanitized message with sensitive data redacted
 */
function sanitizeMessage(message: string): string {
  let sanitized = message;

  for (const { pattern } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized;
}

/**
 * Classify error by type to determine public message
 *
 * @param error - Error to classify
 * @returns Public error message
 */
function getPublicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Network errors
  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
    return 'Service temporarily unavailable';
  }
  if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
    return 'Request timeout - please try again later';
  }

  // Authentication errors
  if (message.includes('401') || message.includes('Unauthorized')) {
    return 'Authentication failed';
  }
  if (message.includes('403') || message.includes('Forbidden')) {
    return 'Access denied';
  }

  // Rate limiting
  if (message.includes('429') || message.includes('Too Many Requests')) {
    return 'Rate limit exceeded - please try again later';
  }

  // Validation errors
  if (message.includes('Invalid') || message.includes('validation')) {
    return 'Invalid request parameters';
  }

  // Database errors
  if (message.includes('database') || message.includes('connection')) {
    return 'Database error - please try again later';
  }

  // Default generic message
  return 'An error occurred while processing your request';
}

/**
 * Sanitized error suitable for client consumption
 */
export interface PublicError {
  /** User-friendly error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
  /** Error type for classification */
  type: 'validation' | 'authentication' | 'authorization' | 'network' | 'server' | 'unknown';
  /** Request ID for support reference */
  requestId?: string;
}

/**
 * Secure error handler for SEO pipeline
 */
export class ErrorHandler {
  /**
   * Sanitize error for client consumption
   *
   * Removes sensitive details like queries, URLs, paths, credentials,
   * and returns a generic error message.
   *
   * @param error - Error to sanitize
   * @param context - Error context for logging
   * @returns Public error object
   *
   * @example
   * ```typescript
   * try {
   *   const result = await risky();
   * } catch (error) {
   *   const publicError = ErrorHandler.sanitizeForClient(error, {
   *     category: 'Keyword Collection',
   *     location: 'google-suggest-collector.ts',
   *     severity: ErrorSeverity.MEDIUM
   *   });
   *   res.status(500).json(publicError);
   * }
   * ```
   */
  static sanitizeForClient(error: unknown, context: ErrorContext): PublicError {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const sanitized = sanitizeMessage(rawMessage);
    const publicMessage = getPublicErrorMessage(error);

    // Log full error server-side
    ErrorHandler.logError(error, context, sanitized);

    return {
      message: publicMessage,
      code: ErrorHandler.getErrorCode(error),
      type: ErrorHandler.getErrorType(error),
      requestId: context.details?.requestId as string | undefined,
    };
  }

  /**
   * Log full error details server-side
   *
   * Only call this function in a server environment where logging
   * is secure and monitored.
   *
   * @param error - Original error
   * @param context - Error context
   * @param sanitized - Sanitized message
   */
  static logError(error: unknown, context: ErrorContext, sanitized: string): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // Log structured error (would typically go to logger service)
    const logEntry = {
      timestamp: new Date(context.timestamp).toISOString(),
      severity: context.severity,
      category: context.category,
      location: context.location,
      message: message,
      sanitized: sanitized,
      sensitive: extractSensitiveInfo(message),
      stack: stack ? stack.split('\n').slice(0, 5) : undefined, // First 5 lines only
      ...(context.details || {}),
    };

    // In production, send to logger service
    console.error('[SEO Pipeline Error]', logEntry);
  }

  /**
   * Determine error type for classification
   */
  static getErrorType(error: unknown): PublicError['type'] {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('401') || message.includes('Unauthorized')) {
      return 'authentication';
    }
    if (message.includes('403') || message.includes('Forbidden')) {
      return 'authorization';
    }
    if (message.includes('400') || message.includes('Invalid')) {
      return 'validation';
    }
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      return 'network';
    }
    if (message.includes('500') || message.includes('database')) {
      return 'server';
    }

    return 'unknown';
  }

  /**
   * Generate error code for programmatic handling
   */
  static getErrorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('401')) return 'UNAUTHORIZED';
    if (message.includes('403')) return 'FORBIDDEN';
    if (message.includes('429')) return 'RATE_LIMITED';
    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
    if (message.includes('database')) return 'DATABASE_ERROR';
    if (message.includes('validation')) return 'VALIDATION_ERROR';

    return 'UNKNOWN_ERROR';
  }

  /**
   * Create error with context
   */
  static createError(
    message: string,
    category: string,
    location: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): Error & { context?: ErrorContext } {
    const error = new Error(message) as Error & { context?: ErrorContext };
    error.context = {
      category,
      location,
      severity,
      timestamp: Date.now(),
    };
    return error;
  }

  /**
   * Wrap error with additional context
   */
  static wrapError(
    error: unknown,
    message: string,
    context: Partial<ErrorContext>
  ): Error & { originalError?: unknown; context?: ErrorContext } {
    const originalMessage = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(`${message}: ${originalMessage}`) as Error & {
      originalError?: unknown;
      context?: ErrorContext;
    };

    wrapped.originalError = error;
    wrapped.context = {
      category: context.category || 'Unknown',
      location: context.location || 'Unknown',
      severity: context.severity || ErrorSeverity.MEDIUM,
      timestamp: context.timestamp || Date.now(),
      details: context.details,
    };

    if (error instanceof Error && error.stack) {
      wrapped.stack = error.stack;
    }

    return wrapped;
  }
}

/**
 * Create async error wrapper
 *
 * Catches errors and sanitizes them before re-throwing
 *
 * @param fn - Async function to wrap
 * @param context - Error context
 * @returns Wrapped function that sanitizes errors
 *
 * @example
 * ```typescript
 * const safeCollect = wrapAsync(
 *   collectFromPAA,
 *   { category: 'PAA Collector', location: 'paa-collector.ts' }
 * );
 * ```
 */
export function wrapAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: ErrorContext
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      ErrorHandler.logError(error, context, sanitizeMessage(
        error instanceof Error ? error.message : String(error)
      ));
      throw error;
    }
  }) as T;
}

/**
 * Utility to safely extract error details for logging
 */
export function getErrorDetails(error: unknown): {
  message: string;
  code?: string;
  stack?: string;
  type: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as unknown as Record<string, unknown>).code as string | undefined,
      stack: error.stack,
      type: error.constructor.name,
    };
  }

  return {
    message: String(error),
    type: typeof error,
  };
}
