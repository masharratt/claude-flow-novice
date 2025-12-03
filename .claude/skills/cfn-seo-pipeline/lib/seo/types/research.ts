/**
 * Type definitions for SEO Research Service
 *
 * @module planning/seo/types/research
 * @description Core types for ResearchService integration with WebSearch/WebFetch MCP tools
 * @version 1.0.0
 *
 * This module provides type-safe definitions for the SEO Intelligence Phase 1 research infrastructure.
 * It supports Steps 0 (intelligence pre-load) and 12 (learning capture) of the 14-step enhanced pipeline.
 */

// ============================================================================
// QUERY & REQUEST TYPES
// ============================================================================

/**
 * Research query configuration for WebSearch and WebFetch operations
 *
 * @interface ResearchQuery
 * @description Defines a research request with query text, execution type, and optional parameters.
 * Controls which MCP tool (WebSearch vs WebFetch) and how the result is processed.
 *
 * @example
 * ```typescript
 * const query: ResearchQuery = {
 *   query: "TypeScript utility types",
 *   type: "serp",
 *   options: {
 *     maxResults: 10,
 *     priority: "normal",
 *     cacheTtl: 3600
 *   },
 *   correlationId: "step-4-research-001"
 * };
 * ```
 */
export interface ResearchQuery {
  /**
   * Search query text
   * Passed directly to MCP tool (WebSearch or WebFetch)
   */
  query: string;

  /**
   * Query execution type - determines which MCP tool to use
   * - `serp`: WebSearch for SERP results and snippets
   * - `content`: WebFetch for full page content extraction
   * - `hybrid`: Both WebSearch and WebFetch for comprehensive results
   */
  type: 'serp' | 'content' | 'hybrid';

  /**
   * Optional query parameters for tuning execution behavior
   */
  options?: WebSearchOptions | WebFetchOptions;

  /**
   * Correlation ID for tracking this query across the pipeline
   * Used in logging and result aggregation
   * Format: `[phase]-[step]-[sequential-id]`
   */
  correlationId?: string;
}

/**
 * WebSearch-specific query options
 *
 * @interface WebSearchOptions
 * @description Configuration for SERP result retrieval and filtering
 */
export interface WebSearchOptions {
  /**
   * Maximum number of SERP results to return (default: 10)
   * Typical range: 5-100
   */
  maxResults?: number;

  /**
   * Custom cache TTL in seconds (default: 86400 = 24 hours)
   * Set to 0 for no caching
   */
  cacheTtl?: number;

  /**
   * Request priority for rate limiting queue
   * Affects queue position when rate limit is active
   */
  priority?: 'low' | 'normal' | 'high';

  /**
   * Geographic region for search results (optional)
   * ISO country code or region name
   */
  region?: string;

  /**
   * Language for search results (optional)
   * ISO language code (e.g., 'en', 'es', 'fr')
   */
  language?: string;
}

/**
 * WebFetch-specific query options
 *
 * @interface WebFetchOptions
 * @description Configuration for content fetching and deep crawling
 */
export interface WebFetchOptions {
  /**
   * Target domain for content fetch
   * Can be a full URL for specific page or domain root
   * REQUIRED for content fetching
   */
  targetUrl: string;

  /**
   * Enable deep crawling of linked pages
   * When enabled, follows internal links to build site structure
   * Caution: Can generate many requests
   */
  deepCrawl?: boolean;

  /**
   * Maximum number of linked pages to crawl (default: 10)
   * Only used if deepCrawl is true
   */
  maxDepth?: number;

  /**
   * Custom cache TTL in seconds (default: 3600 = 1 hour)
   * Content changes more frequently than SERP results
   */
  cacheTtl?: number;

  /**
   * Request priority for rate limiting queue
   */
  priority?: 'low' | 'normal' | 'high';

  /**
   * Extract raw HTML in addition to text (default: false)
   * Useful for link extraction and schema parsing
   */
  includeHtml?: boolean;

  /**
   * Extract schema.org markup (default: false)
   * Enables structured data analysis
   */
  extractSchema?: boolean;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Normalized SERP result from WebSearch MCP tool
 *
 * @interface SerpResult
 * @description Represents a single result from a SERP (Search Engine Results Page)
 * query, normalized and enriched with additional metadata.
 *
 * @example
 * ```typescript
 * const result: SerpResult = {
 *   title: "TypeScript Utility Types | Official Handbook",
 *   url: "https://www.typescriptlang.org/docs/handbook/utility-types.html",
 *   description: "Documentation for utility types in TypeScript...",
 *   position: 1,
 *   features: ["featured-snippet", "has-review-schema"]
 * };
 * ```
 */
export interface SerpResult {
  /**
   * Result title (from SERP title tag or h1)
   */
  title: string;

  /**
   * Result URL (canonical if available, otherwise page URL)
   */
  url: string;

  /**
   * Meta description or search snippet
   * Displayed below title in SERP
   */
  description: string;

  /**
   * Position in SERP results (1-indexed)
   * 1 = first result (top position)
   */
  position: number;

  /**
   * SERP features present on this result
   * Examples: "featured-snippet", "people-also-ask", "has-review-schema",
   * "has-video", "top-story", "in-the-news", "knowledge-panel"
   */
  features?: string[];

  /**
   * SERP visibility/authority signals
   * Estimated by search engine analysis
   */
  signals?: {
    /** Domain authority estimate (0-100) */
    domainAuthority?: number;
    /** Page authority estimate (0-100) */
    pageAuthority?: number;
    /** Has SSL/HTTPS */
    hasHttps?: boolean;
  };

  /**
   * Raw result data from MCP tool (for debugging or extended access)
   */
  raw?: Record<string, unknown>;
}

/**
 * Normalized content result from WebFetch MCP tool
 *
 * @interface ContentResult
 * @description Represents fetched and parsed page content with structural analysis
 *
 * @example
 * ```typescript
 * const result: ContentResult = {
 *   url: "https://example.com/article",
 *   title: "Article Title",
 *   content: "Full text content...",
 *   metadata: {
 *     wordCount: 2500,
 *     headings: { h1: 1, h2: 5, h3: 12 },
 *     internalLinks: 8,
 *     externalLinks: 15,
 *     images: 3,
 *     schema: ["Article", "BreadcrumbList"]
 *   },
 *   statusCode: 200,
 *   fetchedAt: new Date()
 * };
 * ```
 */
export interface ContentResult {
  /**
   * Page URL (canonical if redirected)
   */
  url: string;

  /**
   * Page title (from title tag)
   */
  title: string;

  /**
   * Extracted text content with structure preserved
   * Includes main content body, paragraphs, lists, etc.
   */
  content: string;

  /**
   * Structured metadata about page content and layout
   */
  metadata: {
    /**
     * Total word count of extracted content
     */
    wordCount: number;

    /**
     * Heading hierarchy count
     * Useful for analyzing content structure and organization
     */
    headings: {
      h1: number;
      h2: number;
      h3: number;
    };

    /**
     * Count of internal links (pointing within same domain)
     */
    internalLinks: number;

    /**
     * Count of external links (pointing to other domains)
     */
    externalLinks: number;

    /**
     * Count of embedded images
     */
    images: number;

    /**
     * Schema.org markup types found
     * Examples: ["Article", "FAQPage", "BreadcrumbList", "Organization"]
     */
    schema?: string[];

    /**
     * Media types found on page
     */
    media?: {
      videos?: number;
      audios?: number;
      iframes?: number;
    };
  };

  /**
   * HTTP status code from fetch
   * 200 = success, 404 = not found, 403 = forbidden, etc.
   */
  statusCode: number;

  /**
   * Timestamp when content was fetched
   */
  fetchedAt: Date;

  /**
   * Whether content came from cache vs fresh fetch
   */
  fromCache?: boolean;

  /**
   * Raw HTML if extractSchema option was true
   */
  html?: string;

  /**
   * Parsed schema.org structured data
   */
  structuredData?: Record<string, unknown>[];
}

/**
 * Unified research result combining SERP and content data
 *
 * @interface ResearchResult
 * @description Complete result from research query execution, including
 * SERP results, content results, and execution metadata.
 *
 * @example
 * ```typescript
 * const result: ResearchResult = {
 *   query: { query: "TypeScript types", type: "hybrid" },
 *   serpResults: [{ title: "...", url: "..." }],
 *   contentResults: [{ url: "...", content: "..." }],
 *   metadata: {
 *     resultCount: 11,
 *     executionTime: 2450,
 *     fromCache: false
 *   },
 *   timestamp: new Date()
 * };
 * ```
 */
export interface ResearchResult {
  /**
   * Original query that produced this result
   */
  query: ResearchQuery;

  /**
   * SERP results from WebSearch (if query type includes 'serp')
   * Array of normalized search result snippets
   */
  serpResults?: SerpResult[];

  /**
   * Content results from WebFetch (if query type includes 'content')
   * Array of fetched and parsed page content
   */
  contentResults?: ContentResult[];

  /**
   * Execution and metadata about this result
   */
  metadata: {
    /**
     * Total results returned
     * Sum of SERP results + content results
     */
    resultCount: number;

    /**
     * Execution time in milliseconds
     * Wall clock time from request to response
     */
    executionTime: number;

    /**
     * Whether result was served from cache
     * If true, executionTime is cache lookup time, not full execution
     */
    fromCache: boolean;

    /**
     * Cache key that was used (if fromCache is true)
     */
    cacheKey?: string;

    /**
     * Rate limit status at time of request
     */
    rateLimitStatus?: {
      /** Remaining requests in current window */
      remaining: number;
      /** When the current rate limit window resets */
      resetAt: Date;
      /** Current rate limit tier (if applicable) */
      tier?: string;
    };

    /**
     * Any warnings or quality notes about the result
     */
    warnings?: string[];
  };

  /**
   * Timestamp when research was executed
   */
  timestamp: Date;

  /**
   * Confidence score for result quality (0-1)
   * Lower if results are partial, cached, or from fallback source
   */
  confidence?: number;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

/**
 * Generic cache entry structure for storing typed data
 *
 * @interface CacheEntry
 * @template T The type of data being cached
 * @description Wraps cached data with TTL, metadata, and access tracking
 *
 * @example
 * ```typescript
 * const entry: CacheEntry<ResearchResult> = {
 *   key: "serp:typescript:us:en",
 *   data: { ... },
 *   createdAt: new Date(),
 *   expiresAt: new Date(Date.now() + 86400 * 1000),
 *   accessCount: 5,
 *   lastAccessedAt: new Date()
 * };
 * ```
 */
export interface CacheEntry<T = unknown> {
  /**
   * Unique cache key identifier
   * Format: `[queryType]:[query]:[region]:[language]`
   */
  key: string;

  /**
   * The cached data of type T
   */
  data: T;

  /**
   * When this cache entry was created
   */
  createdAt: Date;

  /**
   * When this cache entry expires and should be invalidated
   * After this time, entry should be treated as stale
   */
  expiresAt: Date;

  /**
   * Number of times this cache entry has been accessed
   * Useful for popularity metrics and LRU eviction
   */
  accessCount: number;

  /**
   * Last timestamp when this entry was accessed
   * Used for LRU (Least Recently Used) eviction
   */
  lastAccessedAt: Date;

  /**
   * Optional metadata about the cached entry
   */
  metadata?: {
    /**
     * Hash of the original query (for duplicate detection)
     */
    queryHash?: string;

    /**
     * Type of result stored: serp, content, or hybrid
     */
    resultType?: 'serp' | 'content' | 'hybrid';

    /**
     * Number of individual results in the cached data
     */
    resultCount?: number;

    /**
     * Size of cached data in bytes (for storage tracking)
     */
    sizeBytes?: number;

    /**
     * Source of the cached data (e.g., 'websearch', 'webfetch', 'redis')
     */
    source?: string;
  };
}

// ============================================================================
// RATE LIMITING TYPES
// ============================================================================

/**
 * Rate limiting configuration per service
 *
 * @interface RateLimitConfig
 * @description Defines rate limiting behavior for WebSearch and WebFetch services
 * Supports token-bucket and sliding-window strategies with configurable backoff.
 *
 * @example
 * ```typescript
 * const config: RateLimitConfig = {
 *   maxRequests: 100,
 *   windowMs: 60000,
 *   service: 'websearch',
 *   enableQueue: true,
 *   maxQueueSize: 500,
 *   backoffStrategy: 'exponential',
 *   backoffDelay: 1000,
 *   maxBackoffDelay: 30000
 * };
 * ```
 */
export interface RateLimitConfig {
  /**
   * Maximum requests allowed per time window
   * Example: 100 requests
   */
  maxRequests: number;

  /**
   * Time window in milliseconds for request limit
   * Example: 60000ms (1 minute)
   */
  windowMs: number;

  /**
   * MCP service this config applies to
   * Each service has independent rate limits
   */
  service: 'websearch' | 'webfetch';

  /**
   * Enable request queuing when rate limit is reached
   * If false, requests fail immediately (fail-fast)
   * If true, requests queue and retry (graceful degradation)
   */
  enableQueue?: boolean;

  /**
   * Maximum queue size before rejecting new requests
   * Prevents unbounded queue growth
   * Default: 1000
   */
  maxQueueSize?: number;

  /**
   * Backoff strategy when rate limited
   * - 'linear': Delay increases linearly (1s, 2s, 3s...)
   * - 'exponential': Delay increases exponentially (1s, 2s, 4s, 8s...)
   */
  backoffStrategy?: 'linear' | 'exponential';

  /**
   * Initial backoff delay in milliseconds
   * First retry after this delay
   * Default: 1000ms (1 second)
   */
  backoffDelay?: number;

  /**
   * Maximum backoff delay in milliseconds
   * Never wait longer than this
   * Default: 30000ms (30 seconds)
   */
  maxBackoffDelay?: number;

  /**
   * Custom retry strategy (advanced)
   * If provided, overrides backoff settings
   */
  retryStrategy?: (attempt: number) => number;
}

/**
 * Current rate limiter state
 *
 * @interface RateLimiterState
 * @description Tracks current token availability, queue, and statistics
 * Used internally by rate limiter; useful for monitoring
 */
export interface RateLimiterState {
  /**
   * Current available tokens
   * Decremented when request made, refilled over time
   */
  tokens: number;

  /**
   * Maximum tokens (bucket capacity)
   * Tokens never exceed this value
   */
  maxTokens: number;

  /**
   * Token refill rate in tokens per second
   * How quickly tokens replenish
   */
  refillRate: number;

  /**
   * Timestamp of last token refill
   * Used to calculate elapsed time for token generation
   */
  lastRefill: Date;

  /**
   * Queue of pending requests waiting for available tokens
   */
  queue: QueuedRequest[];

  /**
   * Total requests processed (cumulative)
   */
  totalRequests: number;

  /**
   * Total requests that were throttled/queued (cumulative)
   */
  throttledRequests: number;

  /**
   * Whether the rate limiter is currently throttled
   * True if tokens < maxTokens or queue has requests
   */
  isThrottled: boolean;

  /**
   * Estimated time until next request can be processed
   * In milliseconds; 0 if request can be processed immediately
   */
  estimatedWaitMs: number;
}

/**
 * Queued request awaiting rate limit tokens
 *
 * @interface QueuedRequest
 * @description Represents a research request that couldn't execute immediately
 * due to rate limiting, waiting in the queue for tokens to become available.
 */
export interface QueuedRequest {
  /**
   * Unique request identifier
   * Generated by rate limiter, used for tracking
   */
  id: string;

  /**
   * The research query to execute
   */
  query: ResearchQuery;

  /**
   * When this request was queued
   */
  queuedAt: Date;

  /**
   * Priority for execution from queue
   * Higher priority requests are processed first
   * - 'high': 10x weight in queue ordering
   * - 'normal': 1x weight (baseline)
   * - 'low': 0.1x weight
   */
  priority: 'low' | 'normal' | 'high';

  /**
   * Number of times this request has been retried
   */
  retries: number;

  /**
   * Maximum number of retry attempts
   * Request rejected after this many failures
   */
  maxRetries: number;

  /**
   * When this request was created (may differ from queuedAt if queued after initial attempt)
   */
  createdAt: Date;

  /**
   * Promise resolver - called when request succeeds
   * Resolves with the ResearchResult
   * Note: In actual implementation, use async/await instead of direct callback
   */
  resolve: (result: ResearchResult) => void;

  /**
   * Promise rejecter - called when request fails after all retries
   * Rejects with the error
   */
  reject: (error: Error) => void;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Research error code enumeration
 * Discriminates different failure modes for error handling
 *
 * @enum ResearchErrorCode
 */
export enum ResearchErrorCode {
  /**
   * Rate limit has been exceeded
   * Service is rejecting requests due to quota limits
   */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  /**
   * MCP tool (WebSearch or WebFetch) is unavailable
   * Service may be down for maintenance or experiencing issues
   */
  TOOL_UNAVAILABLE = 'TOOL_UNAVAILABLE',

  /**
   * Invalid query parameters provided
   * Query validation failed before execution
   */
  INVALID_QUERY = 'INVALID_QUERY',

  /**
   * Network or fetch error
   * DNS failure, connection timeout, socket error, etc.
   */
  FETCH_ERROR = 'FETCH_ERROR',

  /**
   * Error parsing or normalizing result data
   * Unexpected response format from MCP tool
   */
  PARSE_ERROR = 'PARSE_ERROR',

  /**
   * Cache operation failed
   * Storage read/write error
   */
  CACHE_ERROR = 'CACHE_ERROR',

  /**
   * Request timeout
   * Execution took longer than allowed time limit
   */
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  /**
   * Unknown or unclassified error
   * Unexpected condition not covered by other codes
   */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Base error class for research service operations
 *
 * @class ResearchError
 * @extends Error
 * @description Discriminated error with code and optional details for type-safe error handling
 *
 * @example
 * ```typescript
 * try {
 *   const result = await researchService.query(query);
 * } catch (error) {
 *   if (error instanceof ResearchError) {
 *     switch (error.code) {
 *       case ResearchErrorCode.RATE_LIMIT_EXCEEDED:
 *         console.log('Rate limited, waiting before retry');
 *         break;
 *       case ResearchErrorCode.INVALID_QUERY:
 *         console.error('Invalid query:', error.details?.invalidField);
 *         break;
 *       default:
 *         console.error('Research error:', error.message);
 *     }
 *   }
 * }
 * ```
 */
export class ResearchError extends Error {
  override readonly name: string = 'ResearchError';

  /**
   * Create a typed research error
   *
   * @param message Human-readable error message
   * @param code Discriminant for error type
   * @param details Additional error context (optional)
   */
  constructor(
    message: string,
    readonly code: ResearchErrorCode,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, ResearchError.prototype);
  }
}

/**
 * Rate limit exceeded error (specific case of ResearchError)
 *
 * @class RateLimitError
 * @extends ResearchError
 */
export class RateLimitError extends ResearchError {
  override readonly name: string = 'RateLimitError';

  constructor(
    message: string,
    readonly resetAt: Date,
    readonly remainingRequests: number = 0,
    details?: Record<string, unknown>
  ) {
    super(message, ResearchErrorCode.RATE_LIMIT_EXCEEDED, details);
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Invalid query error (specific case of ResearchError)
 *
 * @class InvalidQueryError
 * @extends ResearchError
 */
export class InvalidQueryError extends ResearchError {
  override readonly name: string = 'InvalidQueryError';

  constructor(
    message: string,
    readonly invalidField: string,
    readonly reason: string,
    details?: Record<string, unknown>
  ) {
    super(message, ResearchErrorCode.INVALID_QUERY, details);
    Object.setPrototypeOf(this, InvalidQueryError.prototype);
  }
}

/**
 * Cache operation error (specific case of ResearchError)
 *
 * @class CacheError
 * @extends ResearchError
 */
export class CacheError extends ResearchError {
  override readonly name: string = 'CacheError';

  constructor(
    message: string,
    readonly operation: 'read' | 'write' | 'delete' | 'expire',
    readonly cacheKey?: string,
    details?: Record<string, unknown>
  ) {
    super(message, ResearchErrorCode.CACHE_ERROR, details);
    Object.setPrototypeOf(this, CacheError.prototype);
  }
}

// ============================================================================
// STATISTICS & MONITORING TYPES
// ============================================================================

/**
 * Cache performance statistics
 *
 * @interface CacheStats
 * @description Aggregated cache performance metrics for monitoring
 */
export interface CacheStats {
  /**
   * Total number of successful cache hits (lookups that found data)
   */
  hits: number;

  /**
   * Total number of cache misses (lookups that found nothing)
   */
  misses: number;

  /**
   * Cache hit rate as percentage (0-1)
   * hits / (hits + misses)
   * 0.8 means 80% of lookups found cached data
   */
  hitRate: number;

  /**
   * Total number of entries currently stored in cache
   */
  totalEntries: number;

  /**
   * Total cache size in bytes
   * Sum of all entry sizes
   */
  sizeBytes: number;

  /**
   * Age of oldest entry in cache (seconds)
   * Useful for understanding cache retention
   */
  oldestEntryAge?: number;

  /**
   * Average number of times each cache entry has been accessed
   */
  avgAccessCount?: number;

  /**
   * Time period these statistics cover
   */
  period?: {
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
  };
}

/**
 * Rate limiter performance statistics
 *
 * @interface RateLimiterStats
 * @description Current state and historical statistics for rate limiter monitoring
 */
export interface RateLimiterStats {
  /**
   * Current number of available tokens
   * Can immediately process request if > 0
   */
  currentTokens: number;

  /**
   * Number of requests made in current time window
   * Resets when window expires
   */
  requestsInWindow: number;

  /**
   * Number of requests waiting in queue
   * Indicates how backed up the system is
   */
  queueLength: number;

  /**
   * Total requests successfully processed (cumulative)
   */
  totalRequests: number;

  /**
   * Total requests that were throttled/queued (cumulative)
   */
  throttledRequests: number;

  /**
   * Throttle rate as percentage (0-1)
   * throttledRequests / totalRequests
   * 0.05 means 5% of requests were throttled
   */
  throttleRate: number;

  /**
   * Average wait time for queued requests (milliseconds)
   * How long requests waited in queue before execution
   */
  avgQueueWaitMs?: number;

  /**
   * Maximum wait time observed (milliseconds)
   * Longest queue wait seen
   */
  maxQueueWaitMs?: number;

  /**
   * Whether rate limiter is currently throttled
   */
  isThrottled: boolean;

  /**
   * Estimated time until next request slot available
   */
  estimatedWaitMs: number;
}

/**
 * Comprehensive research service statistics
 *
 * @interface ResearchServiceStats
 * @description Complete view of research service performance and health
 */
export interface ResearchServiceStats {
  /**
   * Timestamp when these stats were computed
   */
  timestamp: Date;

  /**
   * Cache statistics
   */
  cache: CacheStats;

  /**
   * WebSearch rate limiter statistics
   */
  websearchRateLimit: RateLimiterStats;

  /**
   * WebFetch rate limiter statistics
   */
  webfetchRateLimit: RateLimiterStats;

  /**
   * Total queries executed
   */
  totalQueries: number;

  /**
   * Queries that succeeded
   */
  successfulQueries: number;

  /**
   * Queries that failed
   */
  failedQueries: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;

  /**
   * Average query execution time (milliseconds)
   */
  avgExecutionTimeMs: number;

  /**
   * Median query execution time (milliseconds)
   */
  medianExecutionTimeMs: number;

  /**
   * 95th percentile execution time (milliseconds)
   * 95% of queries complete within this time
   */
  p95ExecutionTimeMs: number;

  /**
   * Most recent error if any
   */
  lastError?: {
    code: ResearchErrorCode;
    message: string;
    timestamp: Date;
  };
}
