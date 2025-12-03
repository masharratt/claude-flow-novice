/**
 * SEO Security Module - Central Export Point
 *
 * Comprehensive security controls for SEO pipeline:
 * - SEC-1.1: Input Validation (keywords, niches, domains)
 * - SEC-1.3: SSRF Protection (URL validation, IP range blocking)
 * - SEC-1.4: Cache Integrity (HMAC-SHA256 signing)
 *
 * @module seo/security
 */

// Input Validation Module (SEC-1.1)
export {
  sanitizeKeyword,
  sanitizeNiche,
  validateDomain,
  sanitizeAPIParams,
  validateInputSize,
  validateAndSanitizeQuery,
} from './input-validator';

// SSRF Protection Module (SEC-1.3)
export {
  isAllowedURL,
  validateExternalURL,
  extractValidDomain,
  isDomainAllowed,
  addToAllowlist,
  validateURLList,
  getRejectionReason,
} from './ssrf-protection';

// Cache Integrity Module (SEC-1.4)
export {
  CacheIntegrityManager,
  getCacheIntegrityManager,
  signCacheEntry,
  verifyCacheEntry,
  wrapCacheValue,
  unwrapCacheValue,
  createCacheWrapper,
  type SignedCacheEntry,
  type CacheIntegrityConfig,
} from './cache-integrity';
