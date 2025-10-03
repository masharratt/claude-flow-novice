/**
 * Rate Limiter - Token Bucket Algorithm Implementation
 *
 * Prevents resource exhaustion by limiting operation rate:
 * - Token bucket refill strategy
 * - Configurable burst capacity
 * - Adaptive backpressure
 * - Memory operation throttling (CVE-2025-001 mitigation)
 *
 * @module utils/rate-limiter
 */

export interface RateLimiterConfig {
  /** Maximum token capacity (burst limit) */
  maxTokens: number;
  /** Refill rate (tokens per second) */
  refillRate: number;
  /** Initial token count (default: maxTokens) */
  initialTokens?: number;
  /** Enable adaptive refill rate based on system load */
  adaptiveRefill?: boolean;
}

export interface RateLimiterStats {
  /** Current token count */
  currentTokens: number;
  /** Total operations acquired */
  totalAcquired: number;
  /** Total wait time in milliseconds */
  totalWaitTime: number;
  /** Current refill rate (tokens/sec) */
  refillRate: number;
  /** Utilization percentage (0-100) */
  utilization: number;
}

/**
 * Token Bucket Rate Limiter
 *
 * Implements token bucket algorithm for smooth rate limiting:
 * - Tokens refill at constant rate
 * - Operations consume tokens
 * - Waits if insufficient tokens
 * - Prevents thundering herd with backpressure
 */
export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private refillRate: number;
  private readonly baseRefillRate: number;
  private readonly adaptiveRefill: boolean;
  private lastRefillTime: number;

  // Statistics
  private totalAcquired: number = 0;
  private totalWaitTime: number = 0;

  // Adaptive refill tracking
  private recentWaitTimes: number[] = [];
  private readonly WAIT_TIME_WINDOW = 10; // Track last 10 operations

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.baseRefillRate = config.refillRate;
    this.adaptiveRefill = config.adaptiveRefill ?? false;
    this.tokens = config.initialTokens ?? config.maxTokens;
    this.lastRefillTime = Date.now();

    // Validate configuration
    if (this.maxTokens <= 0) {
      throw new Error('maxTokens must be positive');
    }
    if (this.refillRate <= 0) {
      throw new Error('refillRate must be positive');
    }
  }

  /**
   * Acquire tokens for an operation
   *
   * @param cost - Token cost (default: 1)
   * @returns Promise that resolves when tokens are acquired
   */
  async acquire(cost: number = 1): Promise<void> {
    if (cost <= 0) {
      throw new Error('Token cost must be positive');
    }
    if (cost > this.maxTokens) {
      throw new Error(`Token cost ${cost} exceeds bucket capacity ${this.maxTokens}`);
    }

    const startTime = Date.now();

    // Refill tokens based on elapsed time
    this.refillTokens();

    // Check if we have enough tokens
    if (this.tokens >= cost) {
      this.tokens -= cost;
      this.totalAcquired += cost;
      return;
    }

    // Calculate wait time
    const tokensNeeded = cost - this.tokens;
    const waitTime = (tokensNeeded / this.refillRate) * 1000; // Convert to milliseconds

    // Wait for tokens to refill
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Refill again after waiting
    this.refillTokens();

    // Consume tokens
    if (this.tokens >= cost) {
      this.tokens -= cost;
    } else {
      // Edge case: consume all available tokens
      this.tokens = 0;
    }

    this.totalAcquired += cost;

    // Track wait time for statistics
    const actualWaitTime = Date.now() - startTime;
    this.totalWaitTime += actualWaitTime;
    this.trackWaitTime(actualWaitTime);

    // Adjust refill rate if adaptive mode enabled
    if (this.adaptiveRefill) {
      this.adjustRefillRate();
    }
  }

  /**
   * Try to acquire tokens without waiting
   *
   * @param cost - Token cost (default: 1)
   * @returns True if tokens acquired, false otherwise
   */
  tryAcquire(cost: number = 1): boolean {
    if (cost <= 0) {
      throw new Error('Token cost must be positive');
    }

    // Refill tokens based on elapsed time
    this.refillTokens();

    // Check if we have enough tokens
    if (this.tokens >= cost) {
      this.tokens -= cost;
      this.totalAcquired += cost;
      return true;
    }

    return false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;

    if (elapsedSeconds > 0) {
      const tokensToAdd = elapsedSeconds * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  /**
   * Track wait time for adaptive refill
   */
  private trackWaitTime(waitTime: number): void {
    this.recentWaitTimes.push(waitTime);

    // Keep only recent wait times
    if (this.recentWaitTimes.length > this.WAIT_TIME_WINDOW) {
      this.recentWaitTimes.shift();
    }
  }

  /**
   * Adjust refill rate based on recent wait times
   *
   * If operations are frequently waiting, increase refill rate.
   * If no waits, gradually decrease to base rate.
   */
  private adjustRefillRate(): void {
    if (this.recentWaitTimes.length < 3) {
      return; // Not enough data
    }

    const avgWaitTime = this.recentWaitTimes.reduce((a, b) => a + b, 0) / this.recentWaitTimes.length;

    // If average wait time is high, increase refill rate
    if (avgWaitTime > 100) {
      // >100ms average wait
      const increase = Math.min(this.baseRefillRate * 0.5, 50); // Max 50% increase or +50 tokens/sec
      this.refillRate = Math.min(this.baseRefillRate * 1.5, this.refillRate + increase);
    } else if (avgWaitTime < 10) {
      // <10ms average wait
      // Gradually return to base rate
      this.refillRate = Math.max(this.baseRefillRate, this.refillRate * 0.95);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): RateLimiterStats {
    this.refillTokens(); // Update tokens before reporting

    const utilization = ((this.maxTokens - this.tokens) / this.maxTokens) * 100;

    return {
      currentTokens: this.tokens,
      totalAcquired: this.totalAcquired,
      totalWaitTime: this.totalWaitTime,
      refillRate: this.refillRate,
      utilization,
    };
  }

  /**
   * Reset limiter state
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefillTime = Date.now();
    this.totalAcquired = 0;
    this.totalWaitTime = 0;
    this.recentWaitTimes = [];
    this.refillRate = this.baseRefillRate;
  }

  /**
   * Check if limiter has available tokens
   */
  hasTokens(cost: number = 1): boolean {
    this.refillTokens();
    return this.tokens >= cost;
  }

  /**
   * Get time until tokens available
   *
   * @param cost - Token cost
   * @returns Milliseconds until cost tokens available
   */
  timeUntilAvailable(cost: number): number {
    this.refillTokens();

    if (this.tokens >= cost) {
      return 0;
    }

    const tokensNeeded = cost - this.tokens;
    return (tokensNeeded / this.refillRate) * 1000;
  }
}

/**
 * Create rate limiter instance
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  return new RateLimiter(config);
}

/**
 * Memory operation rate limiter (CVE-2025-001 mitigation)
 *
 * Prevents excessive memory operations from causing resource exhaustion:
 * - 100 tokens max (burst capacity)
 * - 10 tokens/sec refill (steady state: 10 ops/sec)
 * - Adaptive refill enabled
 */
export function createMemoryRateLimiter(): RateLimiter {
  return new RateLimiter({
    maxTokens: 100,
    refillRate: 10, // 10 operations per second
    adaptiveRefill: true,
  });
}

/**
 * Sprint execution rate limiter
 *
 * Prevents excessive sprint retries:
 * - 50 tokens max
 * - 5 tokens/sec refill (5 sprint executions per second max)
 */
export function createSprintRateLimiter(): RateLimiter {
  return new RateLimiter({
    maxTokens: 50,
    refillRate: 5,
    adaptiveRefill: false,
  });
}

export default RateLimiter;
