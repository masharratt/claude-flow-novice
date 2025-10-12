/**
 * Rate Limiting Middleware
 *
 * Protects API endpoints from abuse
 */

import rateLimit from 'express-rate-limit';

/**
 * Standard rate limiter: 100 requests per minute per IP
 */
export const standardRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
      details: {
        retryAfter: '60 seconds',
      },
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for intervention endpoint: 10 requests per minute per IP
 */
export const interventionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many intervention requests, please try again later',
      details: {
        retryAfter: '60 seconds',
      },
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
