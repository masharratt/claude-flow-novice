/**
 * Security Decorator Pattern for Collectors
 *
 * Provides decorator functions to wrap collectors with security validation,
 * rate limiting, and error sanitization.
 *
 * @module seo/lib/security/decorator
 */

import {
  validateInput,
  type ValidationRule,
} from './input-validator';
import {
  validateURL,
} from './ssrf-protection';
import {
  RateLimiter,
} from './rate-limiter';
import {
  ErrorHandler,
  ErrorSeverity,
  type ErrorContext,
} from './error-handler';

/**
 * Decorator options for collectors
 */
export interface CollectorSecurityOptions {
  /** Enable input validation */
  validateInput?: boolean;
  /** Input type to validate */
  inputType?: string;
  /** Enable URL validation */
  validateURL?: boolean;
  /** Enable rate limiting */
  rateLimit?: boolean;
  /** Rate limiter instance */
  limiter?: RateLimiter;
  /** Enable error sanitization */
  sanitizeErrors?: boolean;
  /** Error context for logging */
  errorContext?: Partial<ErrorContext>;
}

/**
 * Validate keyword inputs before processing
 *
 * @param target - Target function
 * @param methodName - Method name
 * @param descriptor - Property descriptor
 * @returns Wrapped function
 *
 * @example
 * ```typescript
 * class GoogleSuggestCollector {
 *   @ValidateKeywordInput()
 *   async collect(keyword: string) {
 *     // keyword is already validated
 *   }
 * }
 * ```
 */
export function ValidateKeywordInput(validationType: string = 'keyword') {
  return function (
    target: unknown,
    methodName: string | symbol | undefined,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      try {
        if (args.length > 0 && typeof args[0] === 'string') {
          const validated = validateInput(args[0], validationType as keyof typeof VALIDATION_RULES);
          args[0] = validated;
        }
        return await originalMethod.apply(this, args);
      } catch (error) {
        throw ErrorHandler.wrapError(error, `Input validation failed in ${String(methodName)}`, {
          category: 'Input Validation',
          location: `${target?.constructor?.name}.${String(methodName)}`,
          severity: ErrorSeverity.HIGH,
        });
      }
    };

    return descriptor;
  };
}

/**
 * Validate URLs in function arguments
 *
 * @param urlArgIndex - Index of URL argument (default 0)
 * @returns Decorator function
 */
export function ValidateURLInput(urlArgIndex: number = 0) {
  return function (
    target: unknown,
    methodName: string | symbol | undefined,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      try {
        if (urlArgIndex < args.length && typeof args[urlArgIndex] === 'string') {
          await validateURL(args[urlArgIndex] as string);
        }
        return await originalMethod.apply(this, args);
      } catch (error) {
        throw ErrorHandler.wrapError(error, `URL validation failed in ${String(methodName)}`, {
          category: 'URL Validation',
          location: `${target?.constructor?.name}.${String(methodName)}`,
          severity: ErrorSeverity.CRITICAL,
        });
      }
    };

    return descriptor;
  };
}

/**
 * Apply rate limiting to a method
 *
 * @param limiter - RateLimiter instance
 * @param keyExtractor - Function to extract rate limit key from arguments
 * @returns Decorator function
 *
 * @example
 * ```typescript
 * class Collector {
 *   @ApplyRateLimit(limiter, (args) => args[0]?.userId)
 *   async collect(options: {userId: string}) {
 *     // Automatically rate limited
 *   }
 * }
 * ```
 */
export function ApplyRateLimit(
  limiter: RateLimiter,
  keyExtractor: (args: unknown[]) => string
) {
  return function (
    target: unknown,
    methodName: string | symbol | undefined,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      try {
        const key = keyExtractor(args);
        await limiter.checkLimit(key);
        return await originalMethod.apply(this, args);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Rate limit')) {
          throw error; // Re-throw rate limit errors as-is
        }
        throw ErrorHandler.wrapError(error, `Rate limiting error in ${String(methodName)}`, {
          category: 'Rate Limiting',
          location: `${target?.constructor?.name}.${String(methodName)}`,
          severity: ErrorSeverity.MEDIUM,
        });
      }
    };

    return descriptor;
  };
}

/**
 * Sanitize errors thrown by a method
 *
 * @param context - Error context for logging
 * @returns Decorator function
 *
 * @example
 * ```typescript
 * class Collector {
 *   @SanitizeErrors({
 *     category: 'Keyword Collection',
 *     location: 'paa-collector.ts',
 *     severity: ErrorSeverity.MEDIUM
 *   })
 *   async collect() {
 *     // Errors are automatically sanitized
 *   }
 * }
 * ```
 */
export function SanitizeErrors(context: Partial<ErrorContext>) {
  return function (
    target: unknown,
    methodName: string | symbol | undefined,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const fullContext: ErrorContext = {
          category: context.category || 'Unknown',
          location: context.location || `${target?.constructor?.name}.${String(methodName)}`,
          severity: context.severity || ErrorSeverity.MEDIUM,
          timestamp: Date.now(),
          details: context.details,
        };

        // Log full error server-side
        ErrorHandler.logError(error, fullContext, '');

        // Throw sanitized error
        const publicError = ErrorHandler.sanitizeForClient(error, fullContext);
        throw new Error(publicError.message);
      }
    };

    return descriptor;
  };
}

/**
 * Compose multiple security decorators
 *
 * @param options - Security options
 * @returns Composed decorator function
 *
 * @example
 * ```typescript
 * class Collector {
 *   @ComposeSecurity({
 *     validateInput: true,
 *     inputType: 'keyword',
 *     rateLimit: true,
 *     limiter: rateLimiter,
 *     sanitizeErrors: true
 *   })
 *   async collect(keyword: string) {
 *     // All security checks applied
 *   }
 * }
 * ```
 */
export function ComposeSecurity(options: CollectorSecurityOptions) {
  return function (
    target: unknown,
    methodName: string | symbol | undefined,
    descriptor: PropertyDescriptor
  ) {
    let wrappedMethod = descriptor.value;

    // Apply input validation if enabled
    if (options.validateInput) {
      const validator = ValidateKeywordInput(options.inputType || 'keyword');
      wrappedMethod = validator(target, methodName, { value: wrappedMethod }).value;
    }

    // Apply URL validation if enabled
    if (options.validateURL) {
      const urlValidator = ValidateURLInput(0);
      wrappedMethod = urlValidator(target, methodName, { value: wrappedMethod }).value;
    }

    // Apply rate limiting if enabled
    if (options.rateLimit && options.limiter) {
      const rateLimitDecorator = ApplyRateLimit(options.limiter, (args) => {
        if (args[0] && typeof args[0] === 'object') {
          return (args[0] as Record<string, unknown>).taskId as string || 'unknown';
        }
        return String(args[0]);
      });
      wrappedMethod = rateLimitDecorator(target, methodName, { value: wrappedMethod }).value;
    }

    // Apply error sanitization if enabled
    if (options.sanitizeErrors) {
      const errorSanitizer = SanitizeErrors(
        options.errorContext || {
          category: 'Collector',
          location: `${target?.constructor?.name}.${String(methodName)}`,
          severity: ErrorSeverity.MEDIUM,
        }
      );
      wrappedMethod = errorSanitizer(target, methodName, { value: wrappedMethod }).value;
    }

    descriptor.value = wrappedMethod;
    return descriptor;
  };
}

/**
 * Wrap a function with security checks
 *
 * @param fn - Function to wrap
 * @param options - Security options
 * @returns Wrapped function
 *
 * @example
 * ```typescript
 * const secureCollect = wrapWithSecurity(
 *   collectFromPAA,
 *   {
 *     validateInput: true,
 *     rateLimit: true,
 *     limiter: paaLimiter,
 *     sanitizeErrors: true
 *   }
 * );
 * ```
 */
export function wrapWithSecurity<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: CollectorSecurityOptions
): T {
  return (async (...args: unknown[]) => {
    try {
      // Input validation
      if (options.validateInput && args.length > 0 && typeof args[0] === 'string') {
        args[0] = validateInput(args[0], options.inputType || 'keyword' as any);
      }

      // URL validation
      if (options.validateURL && args.length > 0 && typeof args[0] === 'string') {
        await validateURL(args[0]);
      }

      // Rate limiting
      if (options.rateLimit && options.limiter) {
        const key = typeof args[0] === 'object'
          ? (args[0] as Record<string, unknown>).taskId as string || 'unknown'
          : String(args[0]);
        await options.limiter.checkLimit(key);
      }

      return await fn(...args);
    } catch (error) {
      // Error sanitization
      if (options.sanitizeErrors) {
        const context: ErrorContext = {
          category: options.errorContext?.category || 'Security Check',
          location: options.errorContext?.location || fn.name,
          severity: options.errorContext?.severity || ErrorSeverity.MEDIUM,
          timestamp: Date.now(),
        };
        const publicError = ErrorHandler.sanitizeForClient(error, context);
        throw new Error(publicError.message);
      }

      throw error;
    }
  }) as T;
}

// Import at runtime to avoid circular deps
import { VALIDATION_RULES } from './input-validator';
