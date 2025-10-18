/**
 * Rate Limit Detector
 *
 * Detects rate limit errors (429 responses) and extracts retry information.
 * Calculates exponential backoff delays for request retries.
 *
 * @module providers/rate-limit-detector
 */

import { ILogger } from '../core/logger.js';

/**
 * Rate Limit Detector
 *
 * Identifies rate limit errors from various API response formats
 * and provides backoff calculation utilities.
 */
export class RateLimitDetector {
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Detect if error is a rate limit error
   *
   * Checks for:
   * - HTTP 429 status code
   * - Error codes like 'rate_limit_exceeded'
   * - Error messages containing 'rate limit'
   */
  async detectRateLimit(error: any): Promise<boolean> {
    if (!error) return false;

    // Check HTTP status code
    if (error.status === 429) {
      this.logger.debug('Rate limit detected via status code 429');
      return true;
    }

    // Check error response object
    if (error.response?.status === 429) {
      this.logger.debug('Rate limit detected via response.status 429');
      return true;
    }

    // Check error code
    if (
      error.code === 'rate_limit_exceeded' ||
      error.code === 'RATE_LIMIT' ||
      error.code === 'TOO_MANY_REQUESTS'
    ) {
      this.logger.debug('Rate limit detected via error code', {
        code: error.code,
      });
      return true;
    }

    // Check error message
    const message = (error.message || '').toLowerCase();
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded') ||
      message.includes('rate exceeded')
    ) {
      this.logger.debug('Rate limit detected via error message', {
        message: error.message,
      });
      return true;
    }

    // Check error body
    if (error.response?.data) {
      const dataStr = JSON.stringify(error.response.data).toLowerCase();
      if (
        dataStr.includes('rate limit') ||
        dataStr.includes('too many requests') ||
        dataStr.includes('quota exceeded')
      ) {
        this.logger.debug('Rate limit detected via response data');
        return true;
      }
    }

    return false;
  }

  /**
   * Extract Retry-After header value in seconds
   *
   * Supports:
   * - Retry-After: 60 (seconds)
   * - Retry-After: Wed, 21 Oct 2025 07:28:00 GMT (HTTP date)
   */
  async extractRetryAfter(error: any): Promise<number | null> {
    if (!error.response?.headers) {
      return null;
    }

    const headers = error.response.headers;
    const retryAfter =
      headers['retry-after'] ||
      headers['Retry-After'] ||
      headers['x-ratelimit-reset'];

    if (!retryAfter) {
      return null;
    }

    // Parse as integer (seconds)
    const retrySeconds = parseInt(retryAfter, 10);
    if (!isNaN(retrySeconds)) {
      this.logger.debug('Extracted Retry-After seconds', {
        retryAfter: retrySeconds,
      });
      return retrySeconds;
    }

    // Try parsing as HTTP date
    try {
      const resetDate = new Date(retryAfter);
      const now = new Date();
      const secondsUntilReset = Math.ceil((resetDate.getTime() - now.getTime()) / 1000);

      if (secondsUntilReset > 0) {
        this.logger.debug('Extracted Retry-After from HTTP date', {
          retryAfter: secondsUntilReset,
          resetDate: resetDate.toISOString(),
        });
        return secondsUntilReset;
      }
    } catch (parseError) {
      this.logger.warn('Failed to parse Retry-After header', {
        retryAfter,
        error: parseError,
      });
    }

    return null;
  }

  /**
   * Calculate exponential backoff delay
   *
   * Formula: min(baseDelay * 2^attemptNumber, maxDelay)
   *
   * @param attemptNumber - Zero-based attempt number (0 = first retry)
   * @param baseDelayMs - Base delay in milliseconds (default: 1000)
   * @param maxDelayMs - Maximum delay in milliseconds (default: 60000)
   */
  async calculateBackoffDelay(
    attemptNumber: number,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 60000
  ): Promise<number> {
    // Exponential: 1s, 2s, 4s, 8s, 16s, 32s, 60s (capped)
    const exponentialDelay = baseDelayMs * Math.pow(2, attemptNumber);
    const clampedDelay = Math.min(exponentialDelay, maxDelayMs);

    // Add jitter (±10% random variance) to prevent thundering herd
    const jitter = clampedDelay * 0.1 * (Math.random() * 2 - 1);
    const finalDelay = Math.round(clampedDelay + jitter);

    this.logger.debug('Calculated exponential backoff delay', {
      attemptNumber,
      baseDelayMs,
      exponentialDelay,
      clampedDelay,
      jitter,
      finalDelay,
    });

    return finalDelay;
  }

  /**
   * Check if error is retryable (not just rate limit)
   *
   * Returns true for:
   * - Rate limit errors (429)
   * - Server errors (5xx)
   * - Timeout errors
   * - Network errors
   */
  isRetryableError(error: any): boolean {
    // Rate limits are always retryable
    if (this.detectRateLimit(error)) {
      return true;
    }

    // Check status code
    const status = error.status || error.response?.status;
    if (status) {
      // 5xx server errors
      if (status >= 500 && status < 600) {
        return true;
      }

      // 408 Request Timeout
      if (status === 408) {
        return true;
      }
    }

    // Check error code
    if (
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENETUNREACH'
    ) {
      return true;
    }

    // Check error message
    const message = (error.message || '').toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('connection reset') ||
      message.includes('connection refused') ||
      message.includes('network error')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Get recommended action for error
   */
  getRecommendedAction(error: any): 'retry' | 'rotate' | 'fail' {
    // Rate limit → rotate key
    if (this.detectRateLimit(error)) {
      return 'rotate';
    }

    // Retryable errors → retry with same key
    if (this.isRetryableError(error)) {
      return 'retry';
    }

    // All other errors → fail immediately
    return 'fail';
  }
}
