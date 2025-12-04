/**
 * Security Module Index
 *
 * Exports all security utilities for the SEO pipeline.
 *
 * @module seo/lib/security
 */

export {
  validateInput,
  validateInputBatch,
  validateInputBatchSoft,
  detectXSS,
  detectSQLi,
  detectInjection,
  createValidator,
  VALIDATION_RULES,
  type ValidationRule,
} from './input-validator';

export {
  validateURL,
  fetchWithSSRFProtection,
  validateURLBatch,
  addWhitelistedDomain,
  getWhitelistedDomains,
  type ValidatedURL,
} from './ssrf-protection';

export {
  RateLimiter,
  TokenBucketLimiter,
  AdaptiveRateLimiter,
  RATE_LIMITERS,
  type RateLimitStats,
} from './rate-limiter';

export {
  ErrorHandler,
  ErrorSeverity,
  getErrorDetails,
  wrapAsync,
  type ErrorContext,
  type PublicError,
} from './error-handler';
