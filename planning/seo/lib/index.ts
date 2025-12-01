/**
 * SEO Research Service - Main Export
 *
 * @module planning/seo/lib
 * @description Unified exports for ResearchService, Intelligence Curator, cache, and rate limiting
 */

// Core service
export {
  ResearchService,
  researchService,
  searchSerp,
  fetchContent,
  hybridResearch,
} from './research-service';

// Intelligence Curator (Phase 1 Sprint 2)
export {
  IntelligenceCurator,
  intelligenceCurator,
  loadIntelligence,
  captureLearning,
} from './intelligence-curator';

// Cache layer
export { ResearchCache, researchCache } from './research-cache';

// Rate limiting
export {
  RateLimiter,
  RateLimiterManager,
  rateLimiterManager,
} from './rate-limiter';

// Types
export {
  ResearchQuery,
  ResearchResult,
  SerpResult,
  ContentResult,
  CacheEntry,
  RateLimitConfig,
  RateLimiterState,
  QueuedRequest,
  ResearchError,
  ResearchErrorCode,
  CacheStats,
  RateLimiterStats,
} from '../types/research';

// Intelligence Curator Types
export type {
  IntelligenceQuery,
  CompetitiveIntelligence,
  SERPPattern,
  LearningCapture,
  IntelligenceLoadResult,
} from '../types';
