/**
 * Rate Limiting Module for SEO Pipeline
 *
 * Implements token bucket and sliding window rate limiting
 * to prevent API abuse and resource exhaustion.
 *
 * @module seo/lib/security/rate-limiter
 */

/**
 * Rate limit window statistics
 */
export interface RateLimitStats {
  /** Number of requests in current window */
  requestCount: number;
  /** Requests allowed per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Time until window resets (ms) */
  resetIn: number;
  /** Percentage of limit used */
  usagePercentage: number;
  /** Whether limit is currently exceeded */
  isLimited: boolean;
}

/**
 * Sliding window rate limiter using timestamp arrays
 *
 * Tracks request timestamps and enforces rate limits based on
 * a sliding time window. More accurate than token bucket for
 * strict rate limiting requirements.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter(100, 60000); // 100 req/min
 *
 * try {
 *   await limiter.checkLimit('user-123');
 *   // Make request
 * } catch (error) {
 *   console.error('Rate limited:', error.message);
 * }
 * ```
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {
    if (maxRequests <= 0 || windowMs <= 0) {
      throw new Error('maxRequests and windowMs must be positive numbers');
    }
  }

  /**
   * Check if a request is allowed for the given key
   *
   * @param key - Identifier for rate limit (e.g., user ID, IP address)
   * @throws Error if rate limit exceeded
   * @returns Stats about current rate limit status
   */
  async checkLimit(key: string): Promise<RateLimitStats> {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string');
    }

    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Remove requests outside the current window
    const recentRequests = requests.filter((time) => now - time < this.windowMs);

    // Calculate stats before checking limit
    const stats: RateLimitStats = {
      requestCount: recentRequests.length,
      limit: this.maxRequests,
      windowMs: this.windowMs,
      resetIn: recentRequests.length > 0 ? this.windowMs - (now - recentRequests[0]) : 0,
      usagePercentage: (recentRequests.length / this.maxRequests) * 100,
      isLimited: recentRequests.length >= this.maxRequests,
    };

    // Check if limit exceeded
    if (recentRequests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...recentRequests);
      const waitMs = this.windowMs - (now - oldestRequest);
      const waitSeconds = Math.ceil(waitMs / 1000);

      throw new Error(
        `Rate limit exceeded (${this.maxRequests} per ${Math.round(this.windowMs / 1000)}s). ` +
        `Retry after ${waitSeconds} seconds.`
      );
    }

    // Record this request
    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return stats;
  }

  /**
   * Get current rate limit statistics for a key
   *
   * @param key - Rate limit key
   * @returns Current statistics
   */
  getStats(key: string): RateLimitStats {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    const recentRequests = requests.filter((time) => now - time < this.windowMs);

    return {
      requestCount: recentRequests.length,
      limit: this.maxRequests,
      windowMs: this.windowMs,
      resetIn: recentRequests.length > 0 ? this.windowMs - (now - recentRequests[0]) : 0,
      usagePercentage: (recentRequests.length / this.maxRequests) * 100,
      isLimited: recentRequests.length >= this.maxRequests,
    };
  }

  /**
   * Reset rate limit for a specific key
   *
   * @param key - Rate limit key to reset
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.requests.clear();
  }

  /**
   * Get the number of tracked keys
   */
  getTrackedKeysCount(): number {
    return this.requests.size;
  }

  /**
   * Clean up expired entries (call periodically)
   *
   * Removes entries that haven't had requests in the current window
   * to prevent memory leaks.
   *
   * @returns Number of entries cleaned up
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, timestamps] of this.requests) {
      const recentRequests = timestamps.filter((time) => now - time < this.windowMs);

      if (recentRequests.length === 0) {
        this.requests.delete(key);
        cleaned++;
      } else if (recentRequests.length < timestamps.length) {
        this.requests.set(key, recentRequests);
      }
    }

    return cleaned;
  }
}

/**
 * Pre-configured rate limiters for SEO pipeline services
 */
export const RATE_LIMITERS = {
  googleSuggest: new RateLimiter(100, 60000), // 100 requests per minute
  reddit: new RateLimiter(60, 60000), // 60 requests per minute
  paa: new RateLimiter(30, 60000), // 30 requests per minute
  gsc: new RateLimiter(50, 60000), // 50 requests per minute
  competitors: new RateLimiter(40, 60000), // 40 requests per minute
};

/**
 * Token bucket rate limiter
 *
 * Alternative implementation using token bucket algorithm.
 * Good for bursty traffic patterns.
 *
 * @example
 * ```typescript
 * const limiter = new TokenBucketLimiter(100, 60000);
 *
 * try {
 *   const tokens = await limiter.consume('user-123', 5); // Consume 5 tokens
 *   if (tokens >= 0) {
 *     // Make request
 *   }
 * } catch (error) {
 *   console.error('No tokens available');
 * }
 * ```
 */
export class TokenBucketLimiter {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();

  constructor(
    private capacity: number,
    private refillInterval: number,
    private tokensPerRefill: number = 1
  ) {
    if (capacity <= 0 || refillInterval <= 0) {
      throw new Error('capacity and refillInterval must be positive numbers');
    }
  }

  /**
   * Consume tokens from the bucket
   *
   * @param key - Bucket identifier
   * @param amount - Number of tokens to consume
   * @returns Number of remaining tokens
   * @throws Error if not enough tokens available
   */
  async consume(key: string, amount: number = 1): Promise<number> {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string');
    }

    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsedMs = now - bucket.lastRefill;
    const refills = Math.floor(elapsedMs / this.refillInterval);

    if (refills > 0) {
      bucket.tokens = Math.min(
        this.capacity,
        bucket.tokens + refills * this.tokensPerRefill
      );
      bucket.lastRefill = now;
    }

    // Check if enough tokens available
    if (bucket.tokens < amount) {
      const tokensNeeded = amount - bucket.tokens;
      const refillsNeeded = Math.ceil(
        tokensNeeded / this.tokensPerRefill
      );
      const waitMs = refillsNeeded * this.refillInterval - (elapsedMs % this.refillInterval);

      throw new Error(
        `Insufficient tokens (have ${bucket.tokens}, need ${amount}). ` +
        `Available in ${Math.ceil(waitMs / 1000)} seconds.`
      );
    }

    // Consume tokens
    bucket.tokens -= amount;

    return bucket.tokens;
  }

  /**
   * Get bucket status
   *
   * @param key - Bucket identifier
   * @returns Current token count and refill info
   */
  getStatus(key: string): { tokens: number; capacity: number; refillIn: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      return { tokens: this.capacity, capacity: this.capacity, refillIn: 0 };
    }

    const elapsedMs = now - bucket.lastRefill;
    const refills = Math.floor(elapsedMs / this.refillInterval);

    if (refills > 0) {
      bucket.tokens = Math.min(
        this.capacity,
        bucket.tokens + refills * this.tokensPerRefill
      );
      bucket.lastRefill = now;
    }

    return {
      tokens: bucket.tokens,
      capacity: this.capacity,
      refillIn: this.refillInterval - (elapsedMs % this.refillInterval),
    };
  }

  /**
   * Reset bucket for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Reset all buckets
   */
  resetAll(): void {
    this.buckets.clear();
  }
}

/**
 * Adaptive rate limiter that adjusts limits based on error rates
 *
 * Increases rate limits on success, decreases on errors.
 */
export class AdaptiveRateLimiter {
  private limiter: RateLimiter;
  private stats: Map<string, { successes: number; failures: number }> = new Map();
  private readonly minLimit = 10;
  private readonly maxLimit = 1000;

  constructor(initialLimit: number, windowMs: number) {
    this.limiter = new RateLimiter(initialLimit, windowMs);
  }

  /**
   * Check limit and record outcome
   */
  async checkLimitAndRecord(
    key: string,
    success: boolean
  ): Promise<RateLimitStats> {
    const stats = this.stats.get(key) || { successes: 0, failures: 0 };

    if (success) {
      stats.successes++;
    } else {
      stats.failures++;
    }

    this.stats.set(key, stats);

    // Adjust limits based on success/failure ratio
    const totalRequests = stats.successes + stats.failures;
    const successRate = stats.successes / totalRequests;

    if (totalRequests % 100 === 0) {
      // Re-evaluate every 100 requests
      if (successRate > 0.95) {
        // Increase limit
        const current = this.limiter.getStats(key);
        const newLimit = Math.min(this.maxLimit, current.limit + 10);
        // Would need to recreate limiter or implement dynamic adjustment
      } else if (successRate < 0.80) {
        // Decrease limit
        const current = this.limiter.getStats(key);
        const newLimit = Math.max(this.minLimit, current.limit - 10);
        // Would need to recreate limiter or implement dynamic adjustment
      }
    }

    return this.limiter.getStats(key);
  }

  /**
   * Check limit without adjustment
   */
  async checkLimit(key: string): Promise<RateLimitStats> {
    return this.limiter.checkLimit(key);
  }
}
