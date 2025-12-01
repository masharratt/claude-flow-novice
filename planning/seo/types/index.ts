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

// ============================================================================
// PATTERN SCHEMA TYPES (Phase 1 Sprint 3)
// ============================================================================

/**
 * Pattern type classification
 */
export type PatternType = 'content' | 'technical' | 'algorithm';

/**
 * Pattern lifecycle states
 */
export type PatternLifecycle = 'discovery' | 'validation' | 'promoted' | 'archived';

/**
 * Pattern outcome classification
 */
export type PatternOutcome = 'success' | 'failure';

/**
 * Evidence for pattern effectiveness
 */
export interface PatternEvidence {
  /** Source URL, article ID, or data source identifier */
  source: string;

  /** Outcome classification */
  outcome: PatternOutcome;

  /** Quantitative performance metrics (optional) */
  metrics?: Record<string, number>;

  /** Timestamp when evidence was captured */
  capturedAt: Date;

  /** Additional context or observations (optional) */
  notes?: string;

  /** Domain where pattern was applied (optional) */
  domain?: string;

  /** Content type where pattern was applied (optional) */
  contentType?: string;
}

/**
 * Pattern applicability constraints
 */
export interface PatternApplicability {
  /** Content types this pattern applies to */
  contentTypes: string[];

  /** Industries where pattern is effective */
  industries: string[];

  /** Scenarios where pattern should NOT be used (optional) */
  restrictions?: string[];
}

/**
 * Pattern performance metrics
 */
export interface PatternPerformance {
  /** Percentage of successful applications (0.0-1.0) */
  successRate: number;

  /** Total times pattern has been applied */
  totalApplications: number;

  /** Average impact metrics across all applications (optional) */
  avgImpact?: Record<string, number>;
}

/**
 * Seasonal effectiveness pattern
 */
export interface PatternSeasonality {
  /** Whether pattern has seasonal variations */
  hasSeasonality: boolean;

  /** Months where pattern is most effective (optional) */
  peakMonths?: string[];

  /** Months where pattern is least effective (optional) */
  troughMonths?: string[];
}

/**
 * Pattern update history entry
 */
export interface PatternUpdateHistoryEntry {
  /** Semantic version */
  version: string;

  /** Update timestamp */
  updatedAt: Date;

  /** Description of changes */
  changes: string;

  /** User or system that performed update */
  updatedBy: string;
}

/**
 * Pattern metadata
 */
export interface PatternMetadata {
  /** Applicability constraints (required) */
  applicability: PatternApplicability;

  /** Performance metrics (required) */
  performance: PatternPerformance;

  /** Specific domain for local patterns (optional) */
  domain?: string;

  /** Related keywords or topics (optional) */
  keywords?: string[];

  /** Seasonal effectiveness patterns (optional) */
  seasonality?: PatternSeasonality;

  /** History of pattern updates (optional) */
  updateHistory?: PatternUpdateHistoryEntry[];
}

/**
 * SEO Intelligence Pattern
 *
 * Represents a discovered, validated, or promoted pattern for content,
 * technical SEO, or algorithm intelligence.
 */
export interface Pattern {
  /** Unique pattern identifier */
  id: string;

  /** Pattern type classification */
  type: PatternType;

  /** Pattern category (e.g., 'title-tags', 'schema-markup', 'risk-scores') */
  category: string;

  /** Human-readable pattern name */
  name: string;

  /** Detailed pattern description */
  description: string;

  /** Confidence score (0.0-1.0) */
  confidence: number;

  /** Current lifecycle state */
  lifecycle: PatternLifecycle;

  /** Evidence supporting pattern effectiveness */
  evidence: PatternEvidence[];

  /** Pattern metadata */
  metadata: PatternMetadata;

  /** Pattern creation timestamp */
  createdAt: Date;

  /** Pattern last update timestamp */
  updatedAt: Date;

  /** Semantic version */
  version: string;

  /** Archive reason (required for archived patterns) */
  archivedReason?: string;

  /** Archive timestamp (required for archived patterns) */
  archivedAt?: Date;
}

/**
 * Pattern query filters
 */
export interface PatternQuery {
  /** Filter by pattern type (optional) */
  type?: PatternType;

  /** Filter by category (optional) */
  category?: string;

  /** Filter by minimum confidence (optional) */
  minConfidence?: number;

  /** Filter by lifecycle state (optional) */
  lifecycle?: PatternLifecycle;

  /** Filter by domain (for local patterns) (optional) */
  domain?: string;

  /** Filter by keywords (optional) */
  keywords?: string[];

  /** Limit number of results (optional) */
  limit?: number;
}

/**
 * Pattern validation result
 */
export interface PatternValidationResult {
  /** Whether pattern is valid */
  valid: boolean;

  /** Validation errors (if any) */
  errors: string[];

  /** Validation warnings (if any) */
  warnings: string[];
}

/**
 * Pattern promotion result
 */
export interface PatternPromotionResult {
  /** Whether promotion succeeded */
  success: boolean;

  /** Updated pattern (if successful) */
  pattern?: Pattern;

  /** Error message (if failed) */
  error?: string;

  /** Previous lifecycle state */
  previousLifecycle: PatternLifecycle;

  /** New lifecycle state */
  newLifecycle: PatternLifecycle;
}

/**
 * Pattern confidence update result
 */
export interface PatternConfidenceUpdateResult {
  /** Pattern ID */
  patternId: string;

  /** Previous confidence score */
  previousConfidence: number;

  /** New confidence score */
  newConfidence: number;

  /** New evidence added */
  newEvidence: PatternEvidence;

  /** Whether lifecycle state changed */
  lifecycleChanged: boolean;

  /** New lifecycle state (if changed) */
  newLifecycle?: PatternLifecycle;
}

/**
 * Type guard: Check if pattern is in discovery state
 */
export function isDiscoveryPattern(pattern: Pattern): boolean {
  return pattern.lifecycle === 'discovery';
}

/**
 * Type guard: Check if pattern is in validation state
 */
export function isValidationPattern(pattern: Pattern): boolean {
  return pattern.lifecycle === 'validation';
}

/**
 * Type guard: Check if pattern is promoted
 */
export function isPromotedPattern(pattern: Pattern): boolean {
  return pattern.lifecycle === 'promoted';
}

/**
 * Type guard: Check if pattern is archived
 */
export function isArchivedPattern(pattern: Pattern): boolean {
  return pattern.lifecycle === 'archived';
}

/**
 * Type guard: Check if SEO pattern has high confidence
 */
export function isHighConfidenceSEOPattern(pattern: Pattern): boolean {
  return pattern.confidence >= 0.80;
}

/**
 * Type guard: Check if pattern has sufficient evidence
 */
export function hasSufficientEvidence(pattern: Pattern, minEvidence: number = 3): boolean {
  return pattern.evidence.length >= minEvidence;
}

// ============================================================================
// PIPELINE ORCHESTRATOR TYPES (Phase 1 Sprint 4)
// ============================================================================

/**
 * Pipeline task configuration
 */
export interface PipelineTask {
  /** Unique task identifier */
  taskId: string;

  /** Target keyword for SEO content */
  targetKeyword: string;

  /** Content type (blog, guide, article, etc.) */
  contentType: string;

  /** Target industry (optional) */
  industry?: string;

  /** Competitor domains to analyze (optional) */
  competitorDomains?: string[];

  /** Task creation timestamp */
  createdAt: Date;
}

/**
 * Pipeline execution context
 */
export interface PipelineContext {
  /** Pipeline task configuration */
  task: PipelineTask;

  /** Intelligence loaded from Step 0 */
  intelligence: IntelligenceLoadResult;

  /** Pattern applications tracked during pipeline */
  patternApplications: PatternApplication[];

  /** Execution metrics by step */
  metrics: Record<string, number>;
}

/**
 * Pattern application tracking
 */
export interface PatternApplication {
  /** Pattern ID applied */
  patternId: string;

  /** Step where pattern was applied (e.g., 'step-3-keyword-research') */
  appliedAt: string;

  /** Application outcome (if known) */
  outcome?: 'success' | 'failure';

  /** Performance metrics from application */
  metrics?: Record<string, number>;
}

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  /** Task ID */
  taskId: string;

  /** Overall pipeline status */
  status: 'success' | 'failure' | 'partial';

  /** Number of steps completed */
  stepsCompleted: number;

  /** Total number of steps in pipeline */
  totalSteps: number;

  /** Number of patterns applied */
  patternsApplied: number;

  /** Number of learnings captured */
  learningsCaptured: number;

  /** Total execution time (ms) */
  executionTimeMs: number;

  /** Error details (if failed) */
  error?: {
    step: string;
    message: string;
    code?: string;
  };
}

/**
 * Pipeline step configuration
 */
export interface PipelineStep {
  /** Step number */
  stepNumber: number;

  /** Step name */
  name: string;

  /** Step description */
  description: string;

  /** Step execution function */
  execute: (context: PipelineContext) => Promise<void>;

  /** Whether step is required (cannot be skipped) */
  required?: boolean;
}

/**
 * Pipeline orchestrator configuration
 */
export interface PipelineOrchestratorConfig {
  /** Custom intelligence curator instance */
  intelligenceCurator?: unknown;

  /** Custom pattern manager instance */
  patternManager?: unknown;

  /** Custom Redis context store instance */
  redisContextStore?: unknown;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Maximum time for pipeline execution (ms) */
  maxExecutionTime?: number;

  /** Enable automatic retry on failure */
  autoRetry?: boolean;

  /** Maximum retry attempts */
  maxRetries?: number;
}

// ============================================================================
// COMPETITOR DEEP ANALYSIS TYPES (Phase 2 Sprint 1)
// ============================================================================

export {
  type CompetitorAnalysisConfig,
  type CompetitorAnalysisResult,
  type CrawledPage,
  type CrawlQueueEntry,
  type CrawlResult,
  type SiteArchitecturePattern,
  type ContentStrategyPattern,
  type HubPageMetadata,
  type InternalLinkingPattern,
  type ContentGap,
  type FirecrawlResponse,
  CompetitorAnalysisError,
  CompetitorAnalysisErrorCode,
  type HubPageScoringFactors,
  type PatternExtractionConfig,
  isSuccessfulCrawl,
  isHubPage,
  isHighPriorityGap,
  isHighConfidencePattern,
} from './competitor-analysis';

// ============================================================================
// SERP PATTERN ANALYSIS TYPES (Phase 2 Sprint 4)
// ============================================================================

export type { SERPAnalysisResult } from '../../../packages/seo-analysis/src/types/serp-analysis';
