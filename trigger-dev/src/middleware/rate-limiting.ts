/**
 * Rate Limiting Middleware - Phase 6 #4
 *
 * Implements sliding window rate limiting using Redis for distributed systems.
 * Prevents abuse and ensures fair resource allocation across teams.
 */

import { Request, Response, NextFunction } from 'express';
import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logging';
import { recordMetric } from '../utils/metrics';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number | ((req: Request) => number);
  keyGenerator: (req: Request) => string;
  handler?: (req: Request, res: Response) => void;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  redisUrl?: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;  // Timestamp
}

// ============================================================================
// Redis-Based Rate Limiter
// ============================================================================

export class RateLimiter {
  private config: RateLimitConfig;
  private redis: RedisClientType;
  private connected: boolean = false;

  constructor(config: RateLimitConfig) {
    this.config = {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      ...config
    };

    this.redis = createClient({ url: this.config.redisUrl });
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('error', (error) => {
      logger.error('Rate limiter Redis error', { error: error.message });
    });

    this.redis.on('connect', () => {
      this.connected = true;
      logger.info('Rate limiter connected to Redis');
    });

    this.redis.on('disconnect', () => {
      this.connected = false;
      logger.warn('Rate limiter disconnected from Redis');
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.redis.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.redis.disconnect();
    }
  }

  /**
   * Check rate limit using sliding window algorithm
   */
  async checkLimit(key: string, limit: number, windowMs: number): Promise<RateLimitInfo> {
    try {
      await this.connect();

      const now = Date.now();
      const windowStart = now - windowMs;
      const redisKey = `ratelimit:${key}`;

      // Remove old entries
      await this.redis.zRemRangeByScore(redisKey, 0, windowStart);

      // Count current window
      const count = await this.redis.zCard(redisKey);

      const remaining = Math.max(0, limit - count);
      const reset = now + windowMs;

      if (count >= limit) {
        // Rate limit exceeded
        recordMetric('ratelimit.exceeded', 1, {
          key,
          limit,
          count
        });

        return {
          limit,
          remaining: 0,
          reset
        };
      }

      // Add current request
      const requestId = `${now}-${Math.random().toString(36).substr(2, 9)}`;
      await this.redis.zAdd(redisKey, { score: now, value: requestId });

      // Set expiration
      await this.redis.expire(redisKey, Math.ceil(windowMs / 1000));

      return {
        limit,
        remaining: remaining - 1,
        reset
      };
    } catch (error) {
      logger.error('Rate limit check failed', {
        error: (error as Error).message,
        key
      });

      // On error, allow request (fail open)
      return {
        limit,
        remaining: limit,
        reset: Date.now() + windowMs
      };
    }
  }

  /**
   * Get current rate limit info without incrementing
   */
  async getInfo(key: string, limit: number, windowMs: number): Promise<RateLimitInfo> {
    try {
      await this.connect();

      const now = Date.now();
      const windowStart = now - windowMs;
      const redisKey = `ratelimit:${key}`;

      // Remove old entries
      await this.redis.zRemRangeByScore(redisKey, 0, windowStart);

      // Count current window
      const count = await this.redis.zCard(redisKey);

      return {
        limit,
        remaining: Math.max(0, limit - count),
        reset: now + windowMs
      };
    } catch (error) {
      logger.error('Failed to get rate limit info', {
        error: (error as Error).message,
        key
      });

      return {
        limit,
        remaining: limit,
        reset: Date.now() + windowMs
      };
    }
  }

  /**
   * Reset rate limit for key
   */
  async reset(key: string): Promise<void> {
    try {
      await this.connect();
      const redisKey = `ratelimit:${key}`;
      await this.redis.del(redisKey);

      logger.info('Rate limit reset', { key });
    } catch (error) {
      logger.error('Failed to reset rate limit', {
        error: (error as Error).message,
        key
      });
    }
  }
}

// ============================================================================
// Express Middleware
// ============================================================================

let globalLimiter: RateLimiter;

/**
 * Create rate limiting middleware
 */
export function rateLimiter(config: RateLimitConfig) {
  if (!globalLimiter) {
    globalLimiter = new RateLimiter(config);
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate rate limit key
      const key = config.keyGenerator(req);

      // Get limit (can be function or number)
      const limit = typeof config.maxRequests === 'function'
        ? config.maxRequests(req)
        : config.maxRequests;

      // Check rate limit
      const info = await globalLimiter.checkLimit(key, limit, config.windowMs);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', info.limit);
      res.setHeader('X-RateLimit-Remaining', info.remaining);
      res.setHeader('X-RateLimit-Reset', info.reset);

      if (info.remaining === 0) {
        // Rate limit exceeded
        res.setHeader('Retry-After', Math.ceil(config.windowMs / 1000));

        // Track metrics
        recordMetric('ratelimit.429_response', 1, {
          key,
          limit
        });

        logger.warn('Rate limit exceeded', {
          key,
          limit,
          path: req.path,
          method: req.method
        });

        // Call custom handler or use default
        if (config.handler) {
          return config.handler(req, res);
        }

        return res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          limit: info.limit,
          retryAfter: Math.ceil(config.windowMs / 1000),
          resetAt: new Date(info.reset).toISOString()
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error', {
        error: (error as Error).message,
        path: req.path
      });

      // On error, allow request (fail open)
      next();
    }
  };
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/**
 * Global API rate limiter
 */
export function globalApiLimiter() {
  return rateLimiter({
    windowMs: 60000,  // 1 minute
    maxRequests: 100,
    keyGenerator: (req) => {
      const user = (req as any).user;
      return user?.teamId || req.ip || 'anonymous';
    }
  });
}

/**
 * Agent spawn rate limiter
 */
export function agentSpawnLimiter() {
  return rateLimiter({
    windowMs: 60000,  // 1 minute
    maxRequests: 10,
    keyGenerator: (req) => {
      const user = (req as any).user;
      return `spawn:${user?.teamId || req.ip}`;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'Agent spawn rate limit exceeded',
        code: 'SPAWN_RATE_LIMIT',
        message: 'Maximum 10 concurrent agent spawns per minute',
        retryAfter: 60
      });
    }
  });
}

/**
 * Cost query rate limiter
 */
export function costQueryLimiter() {
  return rateLimiter({
    windowMs: 60000,  // 1 minute
    maxRequests: 60,
    keyGenerator: (req) => {
      const user = (req as any).user;
      return `cost:${user?.teamId || req.ip}`;
    }
  });
}

/**
 * Redis coordination rate limiter
 */
export function redisCoordinationLimiter() {
  return rateLimiter({
    windowMs: 1000,  // 1 second
    maxRequests: 1000,
    keyGenerator: (req) => {
      const agentId = req.headers['x-agent-id'] as string;
      return `redis:${agentId || req.ip}`;
    }
  });
}

/**
 * Team-specific rate limiter with custom limits
 */
export function teamRateLimiter(teamLimits: Record<string, number>) {
  return rateLimiter({
    windowMs: 60000,
    maxRequests: (req) => {
      const user = (req as any).user;
      const teamId = user?.teamId;
      return teamLimits[teamId] || 100;  // Default to 100
    },
    keyGenerator: (req) => {
      const user = (req as any).user;
      return user?.teamId || req.ip;
    }
  });
}

// ============================================================================
// Rate Limit Utilities
// ============================================================================

/**
 * Get rate limit info for key
 */
export async function getRateLimitInfo(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitInfo> {
  if (!globalLimiter) {
    globalLimiter = new RateLimiter({
      windowMs,
      maxRequests: limit,
      keyGenerator: () => key
    });
  }

  return globalLimiter.getInfo(key, limit, windowMs);
}

/**
 * Reset rate limit for key
 */
export async function resetRateLimit(key: string): Promise<void> {
  if (!globalLimiter) {
    throw new Error('Rate limiter not initialized');
  }

  await globalLimiter.reset(key);
}

/**
 * Get rate limiter instance
 */
export function getRateLimiter(): RateLimiter {
  if (!globalLimiter) {
    throw new Error('Rate limiter not initialized');
  }

  return globalLimiter;
}

// ============================================================================
// Rate Limit Monitoring
// ============================================================================

/**
 * Track rate limit metrics
 */
export function trackRateLimitMetrics(key: string, info: RateLimitInfo): void {
  recordMetric('ratelimit.requests', 1, {
    key,
    remaining: info.remaining,
    limit: info.limit
  });

  const utilization = ((info.limit - info.remaining) / info.limit) * 100;

  recordMetric('ratelimit.utilization', utilization, {
    key
  });

  if (utilization > 80) {
    logger.warn('High rate limit utilization', {
      key,
      utilization: `${utilization.toFixed(1)}%`,
      remaining: info.remaining,
      limit: info.limit
    });
  }
}
