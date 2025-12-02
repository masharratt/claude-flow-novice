/**
 * Rate Limiter with Token Bucket Algorithm
 *
 * @module planning/seo/lib/rate-limiter
 * @description Token bucket rate limiter with request queuing and backoff strategies
 *
 * Performance Optimizations:
 * - Lazy token refill (on-demand calculation) instead of continuous timer
 * - Eliminates 100ms setInterval overhead (~10 events/sec regardless of activity)
 * - Reduces CPU cycles during idle periods
 */

import {
  RateLimitConfig,
  RateLimiterState,
  QueuedRequest,
  ResearchQuery,
  ResearchResult,
  ResearchError,
  ResearchErrorCode,
  RateLimiterStats,
} from '../types/research';

/**
 * Default rate limit configurations
 */
const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  websearch: {
    maxRequests: 10,
    windowMs: 60000, // 10 requests per minute
    service: 'websearch',
    enableQueue: true,
    maxQueueSize: 50,
    backoffStrategy: 'exponential',
    backoffDelay: 1000,
    maxBackoffDelay: 30000,
  },
  webfetch: {
    maxRequests: 20,
    windowMs: 60000, // 20 requests per minute
    service: 'webfetch',
    enableQueue: true,
    maxQueueSize: 100,
    backoffStrategy: 'exponential',
    backoffDelay: 500,
    maxBackoffDelay: 15000,
  },
};

/**
 * Rate limiter implementation using token bucket algorithm with lazy refill
 */
export class RateLimiter {
  private state: RateLimiterState;
  private config: RateLimitConfig;

  constructor(service: 'websearch' | 'webfetch', customConfig?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIGS[service], ...customConfig };

    // Token bucket: refill rate = maxRequests / windowMs (in seconds)
    const refillRate = this.config.maxRequests / (this.config.windowMs / 1000);

    this.state = {
      tokens: this.config.maxRequests,
      maxTokens: this.config.maxRequests,
      refillRate,
      lastRefill: new Date(),
      queue: [],
      totalRequests: 0,
      throttledRequests: 0,
      isThrottled: false,
      estimatedWaitMs: 0,
    };
  }

  /**
   * Acquire a token for request execution
   *
   * @param query - Research query to execute
   * @returns Promise that resolves when token is acquired
   */
  async acquireToken(query: ResearchQuery): Promise<void> {
    // Lazy refill - calculate tokens based on elapsed time
    this.refillTokens();

    if (this.state.tokens >= 1) {
      // Token available, consume immediately
      this.state.tokens -= 1;
      this.state.totalRequests += 1;
      return Promise.resolve();
    }

    // No tokens available
    this.state.throttledRequests += 1;

    if (!this.config.enableQueue) {
      throw new ResearchError(
        'Rate limit exceeded and queuing is disabled',
        ResearchErrorCode.RATE_LIMIT_EXCEEDED,
        {
          service: this.config.service,
          tokensAvailable: this.state.tokens,
          queueEnabled: false,
        }
      );
    }

    if (this.state.queue.length >= (this.config.maxQueueSize || 50)) {
      throw new ResearchError(
        'Rate limit queue is full',
        ResearchErrorCode.RATE_LIMIT_EXCEEDED,
        {
          service: this.config.service,
          queueSize: this.state.queue.length,
          maxQueueSize: this.config.maxQueueSize,
        }
      );
    }

    // Queue the request (ignore result as this is just about queuing)
    await this.enqueueRequest(query);
  }

  /**
   * Enqueue a request when rate limit is reached
   *
   * @param query - Research query to queue
   * @returns Promise that resolves when request is dequeued
   */
  private enqueueRequest(query: ResearchQuery): Promise<ResearchResult> {
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        query,
        queuedAt: new Date(),
        createdAt: new Date(),
        priority: (query.options && 'priority' in query.options ? (query.options as Record<string, unknown>).priority : 'normal') as 'low' | 'normal' | 'high',
        retries: 0,
        maxRetries: 3,
        resolve: (result: ResearchResult) => resolve(result),
        reject,
      };

      // Insert based on priority
      const insertIndex = this.state.queue.findIndex(
        (req) => this.getPriorityValue(req.priority) < this.getPriorityValue(queuedRequest.priority)
      );

      if (insertIndex === -1) {
        this.state.queue.push(queuedRequest);
      } else {
        this.state.queue.splice(insertIndex, 0, queuedRequest);
      }
    });
  }

  /**
   * Get numeric priority value for sorting
   */
  private getPriorityValue(priority: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'high':
        return 3;
      case 'normal':
        return 2;
      case 'low':
        return 1;
      default:
        return 2;
    }
  }

  /**
   * Refill tokens based on elapsed time (lazy calculation)
   */
  private refillTokens(): void {
    const now = new Date();
    const elapsedMs = now.getTime() - this.state.lastRefill.getTime();
    const elapsedSeconds = elapsedMs / 1000;

    const tokensToAdd = elapsedSeconds * this.state.refillRate;

    if (tokensToAdd >= 0.1) {
      // Only refill if at least 0.1 tokens accumulated
      this.state.tokens = Math.min(this.state.maxTokens, this.state.tokens + tokensToAdd);
      this.state.lastRefill = now;
    }

    // Process queue if tokens available
    this.processQueue();
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    while (this.state.queue.length > 0 && this.state.tokens >= 1) {
      const request = this.state.queue.shift();
      if (request) {
        this.state.tokens -= 1;
        this.state.totalRequests += 1;
        request.resolve(null as unknown as ResearchResult); // Signal token acquired
      }
    }
  }

  /**
   * Stop refill timer (no-op for lazy refill, kept for compatibility)
   */
  stop(): void {
    // No timer to stop in lazy refill implementation
    // Method kept for backward compatibility
  }

  /**
   * Calculate backoff delay for retries
   *
   * @param retryCount - Current retry attempt number
   * @returns Backoff delay in milliseconds
   */
  calculateBackoff(retryCount: number): number {
    const baseDelay = this.config.backoffDelay || 1000;
    const maxDelay = this.config.maxBackoffDelay || 30000;

    if (this.config.backoffStrategy === 'linear') {
      return Math.min(baseDelay * (retryCount + 1), maxDelay);
    }

    // Exponential backoff
    const delay = baseDelay * Math.pow(2, retryCount);
    return Math.min(delay, maxDelay);
  }

  /**
   * Get current rate limiter statistics
   *
   * @returns Rate limiter stats
   */
  getStats(): RateLimiterStats {
    // Ensure tokens are up-to-date before reporting
    this.refillTokens();

    const totalRequests = this.state.totalRequests;
    const throttledRequests = this.state.throttledRequests;
    const throttleRate = totalRequests > 0 ? throttledRequests / totalRequests : 0;

    // Calculate average queue wait time
    let avgQueueWaitMs: number | undefined;
    if (this.state.queue.length > 0) {
      const now = new Date();
      const totalWaitMs = this.state.queue.reduce((sum, req) => {
        return sum + (now.getTime() - req.queuedAt.getTime());
      }, 0);
      avgQueueWaitMs = totalWaitMs / this.state.queue.length;
    }

    // Calculate estimated wait time (how long until next token is available)
    let estimatedWaitMs = 0;
    if (this.state.tokens < 1) {
      // Calculate time until at least 1 token is available
      const tokensNeeded = 1 - this.state.tokens;
      const timeForTokens = tokensNeeded / this.state.refillRate;
      estimatedWaitMs = Math.ceil(timeForTokens * 1000);
    }

    // Update state with current throttled status
    this.state.isThrottled = this.state.tokens < this.state.maxTokens || this.state.queue.length > 0;
    this.state.estimatedWaitMs = estimatedWaitMs;

    return {
      currentTokens: this.state.tokens,
      requestsInWindow: this.state.maxTokens - this.state.tokens,
      queueLength: this.state.queue.length,
      totalRequests,
      throttledRequests,
      throttleRate,
      avgQueueWaitMs,
      isThrottled: this.state.isThrottled,
      estimatedWaitMs: this.state.estimatedWaitMs,
    };
  }

  /**
   * Reset rate limiter state
   */
  reset(): void {
    this.state.tokens = this.state.maxTokens;
    this.state.lastRefill = new Date();
    this.state.queue = [];
    this.state.totalRequests = 0;
    this.state.throttledRequests = 0;
  }

  /**
   * Get current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (recreates token bucket)
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Recalculate refill rate
    this.state.refillRate = this.config.maxRequests / (this.config.windowMs / 1000);
    this.state.maxTokens = this.config.maxRequests;

    // Clamp current tokens to new max
    this.state.tokens = Math.min(this.state.tokens, this.state.maxTokens);
  }
}

/**
 * Rate limiter manager for multiple services
 */
export class RateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map();

  /**
   * Get or create rate limiter for service
   *
   * @param service - Service identifier
   * @param customConfig - Optional custom configuration
   * @returns Rate limiter instance
   */
  getLimiter(service: 'websearch' | 'webfetch', customConfig?: Partial<RateLimitConfig>): RateLimiter {
    const key = service + '-' + JSON.stringify(customConfig || {});

    if (!this.limiters.has(key)) {
      this.limiters.set(key, new RateLimiter(service, customConfig));
    }

    return this.limiters.get(key)!;
  }

  /**
   * Get statistics for all rate limiters
   */
  getAllStats(): Record<string, RateLimiterStats> {
    const stats: Record<string, RateLimiterStats> = {};
    this.limiters.forEach((limiter, key) => {
      stats[key] = limiter.getStats();
    });
    return stats;
  }

  /**
   * Stop all rate limiters
   */
  stopAll(): void {
    this.limiters.forEach((limiter) => limiter.stop());
    this.limiters.clear();
  }
}

/**
 * Default rate limiter manager instance
 */
export const rateLimiterManager = new RateLimiterManager();
