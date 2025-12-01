/**
 * SEO Research Service - Type Definitions Index
 *
 * @module planning/seo/types
 * @description Central export point for all research service types
 * @version 1.0.0
 *
 * Provides comprehensive, type-safe definitions for:
 * - Research queries and results (SERP, content fetch)
 * - Caching with multiple storage backends
 * - Rate limiting and quota management
 * - Error handling with recovery strategies
 * - Statistics and monitoring
 */

// ============================================================================
// CORE RESEARCH TYPES
// ============================================================================

// Import all types and classes from research module
import {
  ResearchError,
  RateLimitError,
  InvalidQueryError,
  CacheError,
  ResearchErrorCode,
} from './research';

import type {
  ResearchQuery,
  WebSearchOptions,
  WebFetchOptions,
  SerpResult,
  ContentResult,
  ResearchResult,
  CacheEntry,
  RateLimitConfig,
  RateLimiterState,
  QueuedRequest,
  CacheStats,
  RateLimiterStats,
  ResearchServiceStats,
} from './research';

export {
  // Error Classes
  ResearchError,
  ResearchErrorCode,
  RateLimitError,
  InvalidQueryError,
  CacheError,
};

// Re-export types
export type {
  ResearchQuery,
  WebSearchOptions,
  WebFetchOptions,
  SerpResult,
  ContentResult,
  ResearchResult,
  CacheEntry,
  RateLimitConfig,
  RateLimiterState,
  QueuedRequest,
  CacheStats,
  RateLimiterStats,
  ResearchServiceStats,
};

// ============================================================================
// ERROR & RECOVERY TYPES
// ============================================================================

export {
  type RetryStrategy,
  type BackoffConfig,
  type ErrorContext,
  type ResearchErrorType,
  type ErrorHandler,
  type ErrorRecoveryAction,
  type ErrorMatcher,
  type ErrorRecoveryPolicy,
  // Batch Operations
  type BatchErrorResult,
  // Error Serialization
  type SerializedError,
  type ErrorStats,
} from './errors';

// ============================================================================
// CACHE TYPES
// ============================================================================

export {
  CacheBackend,
  EvictionPolicy,
  type CacheConfig,
  // Cache Operations
  type CacheOperationOptions,
  type CacheGetOptions,
  type CacheSetOptions,
  type CacheDeleteOptions,
  // Key Management
  type KeyGenerator,
  type DefaultKeyGeneratorConfig,
  type KeyPattern,
  // Cache Warming
  type CachePreloadSpec,
  type CacheWarmingStrategy,
  // Cache Events
  type CacheEventType,
  type CacheEvent,
  type CacheEventListener,
  // Import/Export
  type CacheExport,
  type CacheImportOptions,
} from './cache';

// ============================================================================
// RATE LIMITING TYPES
// ============================================================================

export {
  // Strategy & Configuration
  RateLimitStrategy,
  QuotaUnit,
} from './rate-limit';

export type {
  Quota,
  RateLimiterConfig,
  // Request Priority
  RequestWeight,
  PriorityLevel,
  PriorityAssignment,
  // Throttling & Backoff
  ThrottleConfig,
  BackoffConfig as RateLimitBackoffConfig,
  // Monitoring
  HealthStatus,
  RateLimitMetrics,
  // Adaptive Rate Limiting
  AdaptiveState,
  ServiceCapacity,
} from './rate-limit';

// ============================================================================
// TYPE GUARDS & UTILITIES
// ============================================================================

/**
 * Type guard: Check if object is a ResearchError
 *
 * @param error - Object to check
 * @returns True if error is a ResearchError
 *
 * @example
 * ```typescript
 * import { isResearchError } from 'planning/seo/types';
 *
 * catch (error) {
 *   if (isResearchError(error)) {
 *     console.log('Error code:', error.code);
 *   }
 * }
 * ```
 */
export function isResearchError(error: unknown): error is ResearchError {
  return error instanceof ResearchError;
}

/**
 * Type guard: Check if object is a RateLimitError
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Type guard: Check if object is a CacheError
 */
export function isCacheError(error: unknown): error is CacheError {
  return error instanceof CacheError;
}

/**
 * Type guard: Check if object is a InvalidQueryError
 */
export function isInvalidQueryError(error: unknown): error is InvalidQueryError {
  return error instanceof InvalidQueryError;
}

/**
 * Type guard: Check if result is from cache
 *
 * @param result - ResearchResult to check
 * @returns True if result came from cache
 */
export function isFromCache(result: ResearchResult): boolean {
  return result.metadata.fromCache;
}

/**
 * Type guard: Check if result includes SERP data
 *
 * @param result - ResearchResult to check
 * @returns True if result includes SERP results
 */
export function hasSerpResults(
  result: ResearchResult
): result is ResearchResult & {
  serpResults: SerpResult[];
} {
  return (result.serpResults?.length ?? 0) > 0;
}

/**
 * Type guard: Check if result includes content data
 *
 * @param result - ResearchResult to check
 * @returns True if result includes content results
 */
export function hasContentResults(
  result: ResearchResult
): result is ResearchResult & {
  contentResults: ContentResult[];
} {
  return (result.contentResults?.length ?? 0) > 0;
}

// ============================================================================
// CONSTANTS & PRESETS
// ============================================================================

/**
 * Default rate limit configs for common services
 */
export const DEFAULT_RATE_LIMIT_CONFIGS = {
  websearch: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    service: 'websearch' as const,
    enableQueue: true,
    maxQueueSize: 500,
    backoffStrategy: 'exponential' as const,
    backoffDelay: 1000,
    maxBackoffDelay: 30000,
  },
  webfetch: {
    maxRequests: 50,
    windowMs: 60000, // 1 minute
    service: 'webfetch' as const,
    enableQueue: true,
    maxQueueSize: 250,
    backoffStrategy: 'exponential' as const,
    backoffDelay: 1000,
    maxBackoffDelay: 30000,
  },
} as const;

/**
 * Default cache configs for different scenarios
 */
export const DEFAULT_CACHE_CONFIGS = {
  development: {
    backend: 'memory' as const,
    maxSize: 100,
    maxBytes: 10 * 1024 * 1024, // 10MB
    evictionPolicy: 'lru' as const,
    defaultTtlSeconds: 3600, // 1 hour
    enableStats: true,
  },
  production: {
    backend: 'redis' as const,
    maxSize: 10000,
    maxBytes: 500 * 1024 * 1024, // 500MB
    evictionPolicy: 'lru' as const,
    defaultTtlSeconds: 86400, // 24 hours
    enableStats: true,
  },
  hybrid: {
    backend: 'hybrid' as const,
    maxSize: 1000,
    maxBytes: 100 * 1024 * 1024, // 100MB
    evictionPolicy: 'lfu' as const,
    defaultTtlSeconds: 86400,
    enableStats: true,
  },
} as const;

// ============================================================================
// DOCUMENTATION
// ============================================================================

// ============================================================================
// INTELLIGENCE CURATOR TYPES (Phase 1 Sprint 2)
// ============================================================================

/**
 * Intelligence query configuration for Step 0 pre-load
 */
export interface IntelligenceQuery {
  /** Target keyword for intelligence gathering */
  targetKeyword: string;

  /** Optional competitor domains to analyze */
  competitorDomains?: string[];

  /** Include historical intelligence data */
  includeHistorical?: boolean;

  /** Maximum age of intelligence in days (default: 30) */
  maxAge?: number;
}

/**
 * Competitive intelligence data structure
 */
export interface CompetitiveIntelligence {
  /** Analyzed competitor domain */
  domain: string;

  /** Content strategy analysis */
  contentStrategy: {
    /** Average word count across analyzed content */
    averageWordCount: number;

    /** Keyword density mapping */
    keywordDensity: Record<string, number>;

    /** Types of content produced (blog, guide, video, etc.) */
    contentTypes: string[];
  };

  /** Keyword targeting analysis */
  keywordTargeting: {
    /** Primary target keywords */
    primaryKeywords: string[];

    /** Secondary supporting keywords */
    secondaryKeywords: string[];

    /** Search volumes for tracked keywords */
    searchVolumes: Record<string, number>;
  };

  /** Backlink profile analysis */
  backlinks: {
    /** Total backlink count */
    total: number;

    /** Domain authority score */
    domainAuthority: number;

    /** Top referring domains */
    topReferrers: string[];
  };

  /** Timestamp of analysis */
  analyzedAt: Date;
}

/**
 * SERP pattern analysis for a specific keyword
 */
export interface SERPPattern {
  /** Target keyword */
  keyword: string;

  /** Featured snippet patterns */
  featuredSnippets: Array<{
    /** Type of snippet (paragraph, list, table, video) */
    type: string;

    /** Structure description */
    structure: string;

    /** Example content */
    example: string;
  }>;

  /** People Also Ask questions */
  peopleAlsoAsk: string[];

  /** Related searches */
  relatedSearches: string[];

  /** Timestamp of SERP capture */
  capturedAt: Date;
}

/**
 * Learning capture for Step 12 post-pipeline analysis
 */
export interface LearningCapture {
  /** Outcome classification */
  outcome: 'success' | 'failure';

  /** Topic or keyword targeted */
  topic: string;

  /** Context data */
  context: {
    /** Target keyword used */
    targetKeyword: string;

    /** Approach taken */
    approach: string;

    /** Performance metrics (optional) */
    metrics?: Record<string, number>;
  };

  /** Lessons learned */
  lessons: string[];

  /** Recommendations for future */
  recommendations: string[];

  /** Timestamp of capture */
  capturedAt: Date;
}

/**
 * Intelligence load result from knowledge store
 */
export interface IntelligenceLoadResult {
  /** Competitive intelligence data */
  competitive: CompetitiveIntelligence[];

  /** SERP pattern data */
  serpPatterns: SERPPattern[];

  /** Historical learning data */
  learnings: LearningCapture[];

  /** Metadata about load operation */
  metadata: {
    /** Number of intelligence items loaded */
    itemsLoaded: number;

    /** Age of oldest item in days */
    oldestItemAge: number;

    /** Load execution time in ms */
    executionTime: number;

    /** Whether any fresh data was fetched */
    hasFreshData: boolean;
  };
}

/**
 * SEO Intelligence Phase 1 Type System Overview
 *
 * This module provides comprehensive TypeScript types for the SEO Research Service,
 * supporting both Step 0 (intelligence pre-load) and Step 12 (learning capture) of
 * the enhanced 14-step pipeline.
 *
 * ## Core Concepts
 *
 * ### Research Queries & Results
 * - `ResearchQuery`: Configures what to research (SERP, content, or both)
 * - `SerpResult`: Individual SERP snippet with ranking position and features
 * - `ContentResult`: Fetched page content with structural analysis
 * - `ResearchResult`: Combined results with metadata and timing
 *
 * ### Intelligence Curator (Phase 1 Sprint 2)
 * - `IntelligenceQuery`: Configuration for Step 0 intelligence pre-load
 * - `CompetitiveIntelligence`: Competitor analysis data
 * - `SERPPattern`: SERP feature patterns and examples
 * - `LearningCapture`: Step 12 learning outcomes
 * - `IntelligenceLoadResult`: Combined intelligence load results
 *
 * ### Caching
 * - Multiple storage backends: memory, Redis, SQLite, tiered
 * - Eviction policies: LRU, LFU, FIFO, TTL-only, random
 * - Event-driven architecture for cache operations
 * - Import/export for cache migration
 *
 * ### Rate Limiting
 * - Token bucket, sliding window, and adaptive strategies
 * - Priority-based queuing (high, normal, low)
 * - Automatic backoff with jitter
 * - Quota per service and per client
 *
 * ### Error Handling
 * - Discriminated union types for type-safe error handling
 * - Specific error classes: ResearchError, RateLimitError, CacheError
 * - Recovery strategies and retry policies
 * - Error aggregation for batch operations
 *
 * ### Monitoring
 * - Cache statistics (hit rate, size, access patterns)
 * - Rate limiter statistics (throttle rate, queue length)
 * - Service-wide metrics (latency, error rate, success rate)
 * - Health status with recommendations
 *
 * ## Usage Examples
 *
 * ### Step 0: Intelligence Injection (Pre-Pipeline)
 * ```typescript
 * // Query for existing patterns
 * const query: IntelligenceQuery = {
 *   targetKeyword: "TypeScript utility types",
 *   competitorDomains: ["example.com"],
 *   includeHistorical: true,
 *   maxAge: 30
 * };
 *
 * const result = await intelligenceCurator.loadIntelligence(query);
 * // Result includes SERP patterns, competitor content, algorithm risks
 * ```
 *
 * ### Step 12: Learning Capture (Post-Pipeline)
 * ```typescript
 * // Capture learning from completed content
 * const learning: LearningCapture = {
 *   outcome: "success",
 *   topic: "TypeScript utility types",
 *   context: {
 *     targetKeyword: "typescript utility types",
 *     approach: "comprehensive guide with examples",
 *     metrics: { wordCount: 2500, readingTime: 12 }
 *   },
 *   lessons: ["FAQ schema improved CTR", "Code examples increased engagement"],
 *   recommendations: ["Add video tutorial", "Create interactive playground"],
 *   capturedAt: new Date()
 * };
 *
 * await intelligenceCurator.captureLearning(learning);
 * ```
 *
 * ## Type Safety Features
 *
 * - No `any` types (strict typing throughout)
 * - Discriminated unions for error handling
 * - Generic types for reusable cache/queue structures
 * - Type guards and narrowing functions
 * - Const-asserted objects for literal types
 *
 * ## Integration Points
 *
 * - Redis: For distributed caching and rate limiting
 * - WebSearch MCP: For SERP queries
 * - WebFetch MCP: For content extraction
 * - Intelligence Curator: For pattern storage and retrieval
 * - Knowledge Store: File-based persistence for intelligence data
 */
