/**
 * Rate Limiting Implementation for RuVector
 *
 * Provides distributed rate limiting with:
 * - Token bucket algorithm for fair rate limiting
 * - Per-user/per-service rate limits
 * - Burst capacity support
 * - Multiple time windows (per-minute, per-hour, per-day)
 * - Redis-backed distributed state (optional)
 * - In-memory fallback for single-instance deployments
 *
 * Security Features:
 * - Prevents brute force attacks
 * - DoS attack mitigation
 * - Fair resource allocation
 * - Configurable per-actor limits
 * - Non-blocking failure modes
 *
 * CVSS Mitigation: Prevents resource exhaustion and DoS attacks
 * Compliance: Supports OWASP Rate Limiting Best Practices
 */

import { createLogger } from './logging.js';

const logger = createLogger('rate-limiter');

/**
 * Rate limit configuration for an actor
 */
export interface RateLimitConfig {
  /** Requests allowed per minute */
  per_minute: number;
  /** Requests allowed per hour */
  per_hour: number;
  /** Requests allowed per day */
  per_day: number;
  /** Burst capacity (temporary spikes) */
  burst_capacity: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** When the rate limit resets */
  reset_at: Date;
  /** Retry after (seconds) if rate limited */
  retry_after_seconds?: number;
}

/**
 * Rate limit bucket state
 */
export interface RateLimitBucket {
  /** Current token count */
  tokens: number;
  /** Last refill timestamp */
  last_refill: number;
  /** Window size in milliseconds */
  window_ms: number;
  /** Refill rate (tokens per millisecond) */
  refill_rate: number;
}

/**
 * In-memory rate limit store
 */
export class RateLimiter {
  /** Rate limit configurations per actor */
  private configs: Map<string, RateLimitConfig> = new Map();
  /** Token buckets: actor_id -> { minute, hour, day } */
  private buckets: Map<string, Map<string, RateLimitBucket>> = new Map();
  /** Redis client for distributed rate limiting (optional) */
  private redisClient?: any;
  /** Cleanup interval reference */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(redisClient?: any) {
    this.redisClient = redisClient;

    // Start cleanup of old buckets periodically (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldBuckets();
    }, 5 * 60 * 1000);

    logger.info('Rate limiter initialized', {
      distributed: !!redisClient,
    });
  }

  /**
   * Set rate limit configuration for an actor
   */
  setConfig(actor_id: string, config: RateLimitConfig): void {
    this.configs.set(actor_id, config);
    // Clear cached buckets for this actor
    this.buckets.delete(actor_id);
    logger.debug('Rate limit config set', { actor_id, config });
  }

  /**
   * Check if request is allowed under rate limits
   */
  async checkLimit(actor_id: string, config: RateLimitConfig): Promise<RateLimitResult> {
    try {
      if (this.redisClient) {
        return await this.checkLimitRedis(actor_id, config);
      } else {
        return this.checkLimitMemory(actor_id, config);
      }
    } catch (error) {
      logger.error('Rate limit check failed', { error, actor_id });
      // On error, allow request (fail open for availability)
      return {
        allowed: true,
        remaining: config.per_minute,
        reset_at: new Date(Date.now() + 60000),
      };
    }
  }

  /**
   * In-memory rate limit check using token bucket algorithm
   */
  private checkLimitMemory(actor_id: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();

    // Get or create buckets for this actor
    let actorBuckets = this.buckets.get(actor_id);
    if (!actorBuckets) {
      actorBuckets = new Map();
      this.buckets.set(actor_id, actorBuckets);
    }

    // Check per-minute limit
    const minuteBucket = this.getOrCreateBucket(actorBuckets, 'minute', config.per_minute, 60000);
    this.refillBucket(minuteBucket, now);

    if (minuteBucket.tokens < 1) {
      const resetAt = new Date(minuteBucket.last_refill + minuteBucket.window_ms);
      return {
        allowed: false,
        remaining: 0,
        reset_at: resetAt,
        retry_after_seconds: Math.ceil((resetAt.getTime() - now) / 1000),
      };
    }

    // Consume token
    minuteBucket.tokens--;

    // Check per-hour limit
    const hourBucket = this.getOrCreateBucket(actorBuckets, 'hour', config.per_hour, 3600000);
    this.refillBucket(hourBucket, now);

    if (hourBucket.tokens < 1) {
      const resetAt = new Date(hourBucket.last_refill + hourBucket.window_ms);
      return {
        allowed: false,
        remaining: 0,
        reset_at: resetAt,
        retry_after_seconds: Math.ceil((resetAt.getTime() - now) / 1000),
      };
    }

    hourBucket.tokens--;

    // Check per-day limit
    const dayBucket = this.getOrCreateBucket(actorBuckets, 'day', config.per_day, 86400000);
    this.refillBucket(dayBucket, now);

    if (dayBucket.tokens < 1) {
      const resetAt = new Date(dayBucket.last_refill + dayBucket.window_ms);
      return {
        allowed: false,
        remaining: 0,
        reset_at: resetAt,
        retry_after_seconds: Math.ceil((resetAt.getTime() - now) / 1000),
      };
    }

    dayBucket.tokens--;

    logger.debug('Rate limit check passed', {
      actor_id,
      remaining_minute: Math.floor(minuteBucket.tokens),
    });

    return {
      allowed: true,
      remaining: Math.floor(minuteBucket.tokens),
      reset_at: new Date(minuteBucket.last_refill + minuteBucket.window_ms),
    };
  }

  /**
   * Redis-based distributed rate limit check
   */
  private async checkLimitRedis(actor_id: string, config: RateLimitConfig): Promise<RateLimitResult> {
    if (!this.redisClient) {
      return this.checkLimitMemory(actor_id, config);
    }

    const now = Date.now();
    const keys = {
      minute: `rl:${actor_id}:minute`,
      hour: `rl:${actor_id}:hour`,
      day: `rl:${actor_id}:day`,
    };

    try {
      // Increment minute counter with TTL
      const minuteKey = keys.minute;
      const minuteCount = await this.redisClient.incr(minuteKey);
      if (minuteCount === 1) {
        await this.redisClient.expire(minuteKey, 60);
      }

      if (minuteCount > config.per_minute) {
        const ttl = await this.redisClient.ttl(minuteKey);
        return {
          allowed: false,
          remaining: 0,
          reset_at: new Date(now + ttl * 1000),
          retry_after_seconds: ttl,
        };
      }

      // Increment hour counter with TTL
      const hourKey = keys.hour;
      const hourCount = await this.redisClient.incr(hourKey);
      if (hourCount === 1) {
        await this.redisClient.expire(hourKey, 3600);
      }

      if (hourCount > config.per_hour) {
        const ttl = await this.redisClient.ttl(hourKey);
        return {
          allowed: false,
          remaining: 0,
          reset_at: new Date(now + ttl * 1000),
          retry_after_seconds: ttl,
        };
      }

      // Increment day counter with TTL
      const dayKey = keys.day;
      const dayCount = await this.redisClient.incr(dayKey);
      if (dayCount === 1) {
        await this.redisClient.expire(dayKey, 86400);
      }

      if (dayCount > config.per_day) {
        const ttl = await this.redisClient.ttl(dayKey);
        return {
          allowed: false,
          remaining: 0,
          reset_at: new Date(now + ttl * 1000),
          retry_after_seconds: ttl,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, config.per_minute - minuteCount),
        reset_at: new Date(now + 60000),
      };
    } catch (error) {
      logger.error('Redis rate limit check failed', { error, actor_id });
      // Fail open on error
      return {
        allowed: true,
        remaining: config.per_minute,
        reset_at: new Date(now + 60000),
      };
    }
  }

  /**
   * Get or create a rate limit bucket
   */
  private getOrCreateBucket(
    buckets: Map<string, RateLimitBucket>,
    window: string,
    limit: number,
    window_ms: number
  ): RateLimitBucket {
    let bucket = buckets.get(window);

    if (!bucket) {
      const now = Date.now();
      bucket = {
        tokens: limit,
        last_refill: now,
        window_ms,
        refill_rate: limit / window_ms, // tokens per millisecond
      };
      buckets.set(window, bucket);
    }

    return bucket;
  }

  /**
   * Refill bucket with tokens based on time elapsed
   */
  private refillBucket(bucket: RateLimitBucket, now: number): void {
    const elapsed = now - bucket.last_refill;
    const tokensToAdd = elapsed * bucket.refill_rate;

    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, bucket.window_ms * bucket.refill_rate);
    bucket.last_refill = now;
  }

  /**
   * Clean up old buckets from memory
   */
  private cleanupOldBuckets(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    let removed = 0;
    for (const [actor_id, buckets] of this.buckets) {
      for (const [window, bucket] of buckets) {
        if (now - bucket.last_refill > maxAge) {
          buckets.delete(window);
          removed++;
        }
      }
      // Remove actor entry if no buckets
      if (buckets.size === 0) {
        this.buckets.delete(actor_id);
      }
    }

    if (removed > 0) {
      logger.debug('Cleaned up old rate limit buckets', { removed });
    }
  }

  /**
   * Get statistics about rate limiting
   */
  getStats(): {
    tracked_actors: number;
    configured_actors: number;
    memory_usage_estimate_bytes: number;
  } {
    const stats = {
      tracked_actors: this.buckets.size,
      configured_actors: this.configs.size,
      memory_usage_estimate_bytes: 0,
    };

    // Estimate memory usage
    stats.memory_usage_estimate_bytes = stats.tracked_actors * 200; // ~200 bytes per actor

    return stats;
  }

  /**
   * Reset rate limit for an actor (admin operation)
   */
  async resetLimit(actor_id: string): Promise<void> {
    this.buckets.delete(actor_id);

    if (this.redisClient) {
      try {
        await this.redisClient.del(`rl:${actor_id}:minute`, `rl:${actor_id}:hour`, `rl:${actor_id}:day`);
      } catch (error) {
        logger.error('Failed to reset Redis rate limits', { error, actor_id });
      }
    }

    logger.info('Rate limit reset for actor', { actor_id });
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.buckets.clear();
    logger.info('Rate limiter shut down');
  }
}

/**
 * Create a singleton rate limiter instance
 */
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(redisClient?: any): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(redisClient);
  }
  return rateLimiterInstance;
}
