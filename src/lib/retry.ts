/**
 * Retry and Backoff Utilities
 *
 * Provides retry logic with exponential backoff for transient failures.
 * Part of Task 0.5: Implementation Tooling & Utilities (Foundation)
 *
 * Usage:
 *   const result = await withRetry(
 *     async () => fetchData(),
 *     { maxAttempts: 3, baseDelayMs: 1000, exponential: true }
 *   );
 */

import { createRetryExhaustedError, isRetryableError } from './errors';
import { createLogger } from './logging';

const logger = createLogger('retry-utility');

/**
 * Retry options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Use exponential backoff (default: true) */
  exponential?: boolean;
  /** Custom function to determine if error is retryable (optional) */
  shouldRetry?: (error: Error) => boolean;
  /** Callback invoked before each retry attempt (optional) */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** Add random jitter to delay (default: true) */
  jitter?: boolean;
}

/**
 * Retry statistics
 */
export interface RetryStats {
  /** Total attempts made */
  totalAttempts: number;
  /** Whether operation succeeded */
  succeeded: boolean;
  /** Total time spent (including delays) in milliseconds */
  totalTimeMs: number;
  /** Delays between attempts */
  delays: number[];
  /** Errors encountered */
  errors: Error[];
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponential: true,
  jitter: true,
};

/**
 * Execute a function with retry logic
 *
 * @param fn - Async function to execute
 * @param options - Retry options
 * @returns Result of the function
 * @throws RetryExhaustedError if all attempts fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const errors: Error[] = [];
  const delays: number[] = [];
  const startTime = Date.now();

  let attempt = 0;

  while (attempt < opts.maxAttempts) {
    attempt++;

    try {
      logger.debug('Retry attempt', { attempt, maxAttempts: opts.maxAttempts });
      const result = await fn();

      // Success!
      if (attempt > 1) {
        logger.info('Operation succeeded after retry', {
          attempt,
          totalAttempts: attempt,
          totalTimeMs: Date.now() - startTime,
        });
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);

      // Check if we should retry
      const shouldRetry = options.shouldRetry
        ? options.shouldRetry(err)
        : isRetryableError(err);

      if (!shouldRetry) {
        logger.warn('Error is not retryable', { error: err.message, attempt });
        throw err;
      }

      // Check if we have attempts remaining
      if (attempt >= opts.maxAttempts) {
        logger.error('Retry attempts exhausted', {
          totalAttempts: attempt,
          errors: errors.map((e) => e.message),
          totalTimeMs: Date.now() - startTime,
        });
        throw createRetryExhaustedError(attempt, err);
      }

      // Calculate delay for next attempt
      const delayMs = calculateDelay(attempt, opts);
      delays.push(delayMs);

      logger.debug('Retrying after delay', {
        attempt,
        delayMs,
        error: err.message,
      });

      // Invoke retry callback if provided
      if (options.onRetry) {
        options.onRetry(attempt, err, delayMs);
      }

      // Wait before next attempt
      await sleep(delayMs);
    }
  }

  // This should never be reached due to the throw above, but TypeScript needs it
  throw createRetryExhaustedError(attempt, errors[errors.length - 1]);
}

/**
 * Calculate delay for retry attempt
 *
 * @param attempt - Current attempt number (1-based)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, options: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>>): number {
  let delay: number;

  if (options.exponential) {
    // Exponential backoff: baseDelay * 2^(attempt - 1)
    delay = options.baseDelayMs * Math.pow(2, attempt - 1);
  } else {
    // Linear backoff
    delay = options.baseDelayMs * attempt;
  }

  // Cap at max delay
  delay = Math.min(delay, options.maxDelayMs);

  // Add jitter to prevent thundering herd
  if (options.jitter) {
    const jitterFactor = 0.1; // +/- 10%
    const jitterRange = delay * jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    delay = Math.max(0, delay + jitter);
  }

  return Math.floor(delay);
}

/**
 * Sleep for specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry and collect statistics
 *
 * @param fn - Async function to execute
 * @param options - Retry options
 * @returns Object with result and statistics
 */
export async function withRetryStats<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<{ result: T; stats: RetryStats }> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const errors: Error[] = [];
  const delays: number[] = [];
  const startTime = Date.now();

  let attempt = 0;
  let succeeded = false;
  let result: T | undefined;

  const customOnRetry = (attemptNum: number, error: Error, delayMs: number) => {
    errors.push(error);
    delays.push(delayMs);
    if (options.onRetry) {
      options.onRetry(attemptNum, error, delayMs);
    }
  };

  try {
    result = await withRetry(fn, { ...options, onRetry: customOnRetry });
    succeeded = true;
    attempt = errors.length + 1;
  } catch (error) {
    attempt = errors.length + 1;
    throw error;
  } finally {
    const totalTimeMs = Date.now() - startTime;

    if (!succeeded) {
      logger.info('Retry statistics (failed)', {
        totalAttempts: attempt,
        succeeded,
        totalTimeMs,
        errorCount: errors.length,
      });
    }
  }

  const stats: RetryStats = {
    totalAttempts: attempt,
    succeeded,
    totalTimeMs: Date.now() - startTime,
    delays,
    errors,
  };

  return { result: result as T, stats };
}

/**
 * Retry a function with linear backoff
 *
 * @param fn - Async function to execute
 * @param maxAttempts - Maximum number of attempts
 * @param delayMs - Delay between attempts in milliseconds
 * @returns Result of the function
 */
export async function withLinearRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  return withRetry(fn, {
    maxAttempts,
    baseDelayMs: delayMs,
    exponential: false,
    jitter: false,
  });
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Async function to execute
 * @param maxAttempts - Maximum number of attempts
 * @param baseDelayMs - Base delay in milliseconds
 * @returns Result of the function
 */
export async function withExponentialRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  return withRetry(fn, {
    maxAttempts,
    baseDelayMs,
    exponential: true,
    jitter: true,
  });
}

/**
 * Create a retryable version of an async function
 *
 * @param fn - Async function to make retryable
 * @param options - Retry options
 * @returns Retryable function
 */
export function retryable<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return withRetry(() => fn(...args), options);
  };
}

/**
 * Retry an operation until a condition is met
 *
 * @param fn - Async function to execute
 * @param condition - Condition function (returns true to stop retrying)
 * @param options - Retry options
 * @returns Result when condition is met
 * @throws RetryExhaustedError if max attempts reached
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;

  while (attempt < opts.maxAttempts) {
    attempt++;

    const result = await fn();

    if (condition(result)) {
      return result;
    }

    if (attempt >= opts.maxAttempts) {
      throw createRetryExhaustedError(attempt);
    }

    const delayMs = calculateDelay(attempt, opts);
    logger.debug('Condition not met, retrying', { attempt, delayMs });
    await sleep(delayMs);
  }

  throw createRetryExhaustedError(attempt);
}
