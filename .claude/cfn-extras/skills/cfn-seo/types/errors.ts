/**
 * Error types for SEO Research Service
 *
 * @module planning/seo/types/errors
 * @description Comprehensive error hierarchy for research operations
 * @version 1.0.0
 *
 * This module provides type-safe error handling with discriminated unions,
 * specific error classes for common failure modes, and error recovery strategies.
 */

import { ResearchErrorCode } from './research';

// ============================================================================
// ERROR RECOVERY STRATEGIES
// ============================================================================

/**
 * Retry strategy configuration for failed research queries
 *
 * @interface RetryStrategy
 * @description Defines how and when to retry failed requests
 *
 * @example
 * ```typescript
 * const strategy: RetryStrategy = {
 *   maxAttempts: 3,
 *   initialDelayMs: 1000,
 *   maxDelayMs: 10000,
 *   backoffMultiplier: 2,
 *   jitterFactor: 0.1
 * };
 * ```
 */
export interface RetryStrategy {
  /**
   * Maximum number of retry attempts
   * Total attempts = 1 initial + maxAttempts retries
   */
  maxAttempts: number;

  /**
   * Initial delay before first retry (milliseconds)
   */
  initialDelayMs: number;

  /**
   * Maximum delay between retries (milliseconds)
   * Delay will cap at this value
   */
  maxDelayMs: number;

  /**
   * Multiplier for exponential backoff
   * Each retry: delay = min(delay * multiplier, maxDelayMs)
   * Default: 2.0 (doubles each time)
   */
  backoffMultiplier?: number;

  /**
   * Jitter factor (0-1) to randomize retry delay
   * Prevents thundering herd problem
   * 0.1 = ±10% randomization
   */
  jitterFactor?: number;

  /**
   * Error codes that should trigger retry
   * If not specified, retries on all errors
   */
  retryableErrors?: ResearchErrorCode[];

  /**
   * Custom retry condition function
   * Return true to retry, false to fail
   */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Backoff configuration for rate limiting
 *
 * @interface BackoffConfig
 * @description Controls exponential backoff behavior when rate limited
 */
export interface BackoffConfig {
  /**
   * Initial backoff delay (milliseconds)
   */
  initialDelayMs: number;

  /**
   * Maximum backoff delay (milliseconds)
   * Prevents waiting excessively long
   */
  maxDelayMs: number;

  /**
   * Multiplier for each backoff iteration
   */
  multiplier: number;

  /**
   * Whether to add random jitter
   */
  useJitter: boolean;

  /**
   * Maximum jitter percentage (0-100)
   * If useJitter is true, adds random value up to this percent
   */
  jitterPercent?: number;
}

// ============================================================================
// ERROR CONTEXT & METADATA
// ============================================================================

/**
 * Error context with full debugging information
 *
 * @interface ErrorContext
 * @description Rich context about when and how an error occurred
 */
export interface ErrorContext {
  /**
   * When the error occurred
   */
  timestamp: Date;

  /**
   * The query that failed (if available)
   */
  query?: {
    text: string;
    type: 'serp' | 'content' | 'hybrid';
  };

  /**
   * HTTP status code (if network error)
   */
  statusCode?: number;

  /**
   * Response body or error details from service
   */
  responseBody?: string;

  /**
   * Request headers that were sent (redacted)
   */
  requestHeaders?: Record<string, string>;

  /**
   * Duration of failed request (milliseconds)
   */
  durationMs?: number;

  /**
   * Attempt number if retrying
   */
  attemptNumber?: number;

  /**
   * Custom metadata about the error
   */
  metadata?: Record<string, unknown>;
}

/**
 * Discriminated union of all possible research errors
 *
 * @type ResearchErrorType
 * @description Use this for type-safe error handling with pattern matching
 */
export type ResearchErrorType =
  | {
      type: 'RATE_LIMIT_EXCEEDED';
      resetAt: Date;
      remainingRequests: number;
      context: ErrorContext;
    }
  | {
      type: 'TOOL_UNAVAILABLE';
      service: 'websearch' | 'webfetch';
      statusCode?: number;
      context: ErrorContext;
    }
  | {
      type: 'INVALID_QUERY';
      invalidField: string;
      reason: string;
      allowedValues?: string[];
      context: ErrorContext;
    }
  | {
      type: 'FETCH_ERROR';
      cause: 'TIMEOUT' | 'DNS_FAILED' | 'CONNECTION_REFUSED' | 'SSL_ERROR' | 'OTHER';
      context: ErrorContext;
    }
  | {
      type: 'PARSE_ERROR';
      expectedFormat: string;
      receivedValue: string;
      context: ErrorContext;
    }
  | {
      type: 'CACHE_ERROR';
      operation: 'read' | 'write' | 'delete' | 'expire';
      cacheKey?: string;
      context: ErrorContext;
    }
  | {
      type: 'TIMEOUT_ERROR';
      timeoutMs: number;
      context: ErrorContext;
    }
  | {
      type: 'UNKNOWN_ERROR';
      originalError: Error;
      context: ErrorContext;
    };

// ============================================================================
// ERROR HANDLER TYPES
// ============================================================================

/**
 * Error handler callback
 *
 * @type ErrorHandler
 * @description Function to handle specific error types
 */
export type ErrorHandler<T extends ResearchErrorType = ResearchErrorType> = (
  error: T
) => Promise<void> | void;

/**
 * Error recovery action
 *
 * @interface ErrorRecoveryAction
 * @description Describes what action to take in response to an error
 */
export interface ErrorRecoveryAction {
  /**
   * Type of action to take
   */
  action:
    | 'retry' // Retry the operation
    | 'fallback' // Use fallback source/value
    | 'queue' // Queue for later
    | 'fail' // Fail immediately
    | 'ignore' // Log and ignore
    | 'custom'; // Custom handler

  /**
   * Delay before executing action (milliseconds)
   */
  delayMs?: number;

  /**
   * Custom handler if action is 'custom'
   */
  handler?: () => Promise<void>;

  /**
   * Fallback value if action is 'fallback'
   */
  fallbackValue?: unknown;

  /**
   * Reason for this action
   */
  reason: string;
}

/**
 * Error recovery strategy matcher
 *
 * @type ErrorMatcher
 * @description Matches errors to recovery strategies
 */
export type ErrorMatcher = (error: ResearchErrorType) => ErrorRecoveryAction | null;

/**
 * Error recovery policy
 *
 * @interface ErrorRecoveryPolicy
 * @description Defines how to handle different error types
 */
export interface ErrorRecoveryPolicy {
  /**
   * Default action for unmatched errors
   */
  default: ErrorRecoveryAction;

  /**
   * Matchers checked in order (first match wins)
   */
  matchers: Array<{
    /** Check if error matches this pattern */
    match: (error: ResearchErrorType) => boolean;
    /** Action to take if matched */
    action: ErrorRecoveryAction;
  }>;

  /**
   * Errors that should never be caught/recovered
   * Will be re-thrown immediately
   */
  fatalErrors?: ResearchErrorCode[];

  /**
   * Maximum number of recovery attempts
   * Prevents infinite retry loops
   */
  maxRecoveryAttempts?: number;
}

// ============================================================================
// ERROR AGGREGATION
// ============================================================================

/**
 * Aggregated errors from batch operations
 *
 * @interface BatchErrorResult
 * @description Results when some queries in a batch fail
 */
export interface BatchErrorResult {
  /**
   * Queries that succeeded
   */
  successful: number;

  /**
   * Queries that failed
   */
  failed: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Errors that occurred
   */
  errors: Array<{
    /** Index in batch (0-based) */
    index: number;

    /** Error that occurred */
    error: ResearchErrorType;

    /** Whether this error was recovered */
    recovered: boolean;

    /** Recovery action taken (if recovered) */
    recoveryAction?: ErrorRecoveryAction;
  }>;

  /**
   * Whether batch is considered successful
   * (determined by success rate threshold)
   */
  isSuccessful: boolean;

  /**
   * Threshold for batch success (0-1)
   */
  successThreshold: number;
}

// ============================================================================
// ERROR SERIALIZATION
// ============================================================================

/**
 * Serialized error for logging/transmission
 *
 * @interface SerializedError
 * @description JSON-serializable representation of error
 */
export interface SerializedError {
  /**
   * Error type/code
   */
  type: string;

  /**
   * Human-readable message
   */
  message: string;

  /**
   * Stack trace (if available)
   */
  stack?: string;

  /**
   * Error context
   */
  context: ErrorContext;

  /**
   * Additional details
   */
  details?: Record<string, unknown>;

  /**
   * When error was serialized
   */
  serializedAt: Date;

  /**
   * Whether error is retryable
   */
  retryable: boolean;

  /**
   * Suggested recovery action
   */
  suggestedAction?: ErrorRecoveryAction;
}

/**
 * Error statistics for monitoring
 *
 * @interface ErrorStats
 * @description Aggregated error metrics
 */
export interface ErrorStats {
  /**
   * Total errors encountered
   */
  totalErrors: number;

  /**
   * Count by error type
   */
  errorsByType: Record<ResearchErrorCode, number>;

  /**
   * Most common error type
   */
  mostCommonError?: ResearchErrorCode;

  /**
   * Error rate (errors per 1000 requests)
   */
  errorRate: number;

  /**
   * Percentage of errors that were recovered
   */
  recoveryRate: number;

  /**
   * Time period for these stats
   */
  period: {
    startTime: Date;
    endTime: Date;
  };

  /**
   * Top errors by frequency
   */
  topErrors: Array<{
    type: ResearchErrorCode;
    count: number;
    percentage: number;
  }>;
}
