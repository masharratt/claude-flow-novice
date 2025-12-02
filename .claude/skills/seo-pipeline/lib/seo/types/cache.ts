/**
 * Cache management types for SEO Research Service
 *
 * @module planning/seo/types/cache
 * @description Types for cache operations, storage backends, and eviction policies
 * @version 1.0.0
 *
 * Provides abstractions for different cache storage backends (memory, Redis, etc.)
 * and configurable eviction policies (LRU, LFU, TTL).
 */

import { CacheEntry, ResearchResult } from './research';

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

/**
 * Cache backend type indicator
 *
 * @enum CacheBackend
 * @description Types of storage backends supported by cache system
 */
export enum CacheBackend {
  /** In-process memory storage (volatile, lost on restart) */
  MEMORY = 'memory',

  /** Redis distributed cache (persistent, shared across instances) */
  REDIS = 'redis',

  /** SQLite local database (persistent, single instance) */
  SQLITE = 'sqlite',

  /** Hybrid: memory with fallback to Redis */
  HYBRID = 'hybrid',

  /** Multi-tier: memory → Redis → SQLite */
  TIERED = 'tiered',
}

/**
 * Eviction policy for cache entries
 *
 * @enum EvictionPolicy
 * @description Strategy for removing entries when cache is full
 */
export enum EvictionPolicy {
  /**
   * Least Recently Used - remove entry not accessed for longest time
   * Good general-purpose policy
   */
  LRU = 'lru',

  /**
   * Least Frequently Used - remove entry with fewest accesses
   * Good for protecting hot items
   */
  LFU = 'lfu',

  /**
   * First In First Out - remove oldest entry
   * Simple but may evict still-useful items
   */
  FIFO = 'fifo',

  /**
   * Time To Live only - remove only expired entries
   * No size-based eviction
   */
  TTL_ONLY = 'ttl_only',

  /**
   * Random - remove random entry
   * Fast but unpredictable
   */
  RANDOM = 'random',
}

/**
 * Cache configuration object
 *
 * @interface CacheConfig
 * @description Complete configuration for cache behavior
 *
 * @example
 * ```typescript
 * const config: CacheConfig = {
 *   backend: CacheBackend.REDIS,
 *   maxSize: 1000,
 *   maxBytes: 1024 * 1024 * 100, // 100MB
 *   evictionPolicy: EvictionPolicy.LRU,
 *   defaultTtlSeconds: 86400, // 24 hours
 *   redis: {
 *     host: 'localhost',
 *     port: 6379,
 *     password: undefined,
 *     db: 0
 *   }
 * };
 * ```
 */
export interface CacheConfig {
  /**
   * Storage backend to use
   */
  backend: CacheBackend;

  /**
   * Maximum number of entries in cache
   * When exceeded, eviction policy is applied
   */
  maxSize: number;

  /**
   * Maximum cache size in bytes
   * When exceeded, eviction policy is applied
   */
  maxBytes: number;

  /**
   * Eviction policy when limits are reached
   */
  evictionPolicy: EvictionPolicy;

  /**
   * Default TTL for cache entries (seconds)
   * Can be overridden per entry
   * -1 = never expire (not recommended)
   * 0 = no caching (cache disabled)
   */
  defaultTtlSeconds: number;

  /**
   * Whether to compress cached data
   * Saves memory but costs CPU
   */
  compressionEnabled?: boolean;

  /**
   * Minimum entry size to compress (bytes)
   * Don't compress entries smaller than this
   */
  compressionMinBytes?: number;

  /**
   * Redis configuration (if backend is REDIS or HYBRID or TIERED)
   */
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string; // e.g., 'seo:cache:'
    ssl?: boolean;
  };

  /**
   * SQLite configuration (if backend is SQLITE or TIERED)
   */
  sqlite?: {
    path: string;
    vacuumInterval?: number; // seconds
  };

  /**
   * Memory backend configuration
   */
  memory?: {
    /** Enable memory warnings when cache grows large */
    enableWarnings?: boolean;

    /** Memory threshold to emit warning (bytes) */
    warningThresholdBytes?: number;
  };

  /**
   * Whether to enable cache statistics collection
   */
  enableStats: boolean;

  /**
   * How often to recalculate stats (seconds)
   */
  statsIntervalSeconds?: number;

  /**
   * Custom eviction function (called instead of policy if provided)
   */
  customEvictionFn?: (entries: CacheEntry[]) => CacheEntry[];
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Generic cache operation options
 *
 * @interface CacheOperationOptions
 * @description Options that apply to most cache operations
 */
export interface CacheOperationOptions {
  /**
   * Custom TTL for this operation (overrides default)
   * In seconds
   */
  ttl?: number;

  /**
   * Whether to skip cache and go directly to source
   */
  bypassCache?: boolean;

  /**
   * Timeout for cache operation (milliseconds)
   */
  timeoutMs?: number;

  /**
   * Whether to emit events for this operation
   */
  emitEvents?: boolean;

  /**
   * Metadata to store with cached entry
   */
  metadata?: Record<string, unknown>;
}

/**
 * Cache get operation options
 *
 * @interface CacheGetOptions
 * @extends CacheOperationOptions
 */
export interface CacheGetOptions extends CacheOperationOptions {
  /**
   * Only return cached entry if accessed within this timeframe (seconds)
   * Useful for getting only "fresh" cached entries
   */
  maxAgeSecs?: number;

  /**
   * Whether this access counts toward LFU frequency
   */
  countAsAccess?: boolean;
}

/**
 * Cache set operation options
 *
 * @interface CacheSetOptions
 * @extends CacheOperationOptions
 */
export interface CacheSetOptions extends CacheOperationOptions {
  /**
   * Whether to overwrite existing entry if key exists
   * If false and key exists, operation fails
   */
  overwrite?: boolean;

  /**
   * Whether to replace existing entry regardless
   */
  replace?: boolean;
}

/**
 * Cache delete operation options
 *
 * @interface CacheDeleteOptions
 * @extends CacheOperationOptions
 */
export interface CacheDeleteOptions extends CacheOperationOptions {
  /**
   * Whether to emit delete event even if key doesn't exist
   */
  emitIfNotFound?: boolean;

  /**
   * Whether to cascade delete related entries
   * e.g., delete all entries with key prefix
   */
  cascadeDelete?: boolean;
}

// ============================================================================
// KEY GENERATION & VALIDATION
// ============================================================================

/**
 * Cache key generation from research query
 *
 * @interface KeyGenerator
 * @description Function that generates cache keys from queries
 */
export type KeyGenerator = (
  query: {
    text: string;
    type: string;
    region?: string;
    language?: string;
  }
) => string;

/**
 * Default key generation strategy
 *
 * @interface DefaultKeyGeneratorConfig
 * @description Configuration for built-in key generator
 */
export interface DefaultKeyGeneratorConfig {
  /**
   * Separator character between key parts
   */
  separator: string;

  /**
   * Whether to normalize query text (lowercase, trim, etc.)
   */
  normalizeQuery: boolean;

  /**
   * Whether to include region in key (for SERP cache)
   */
  includeRegion: boolean;

  /**
   * Whether to include language in key
   */
  includeLanguage: boolean;

  /**
   * Hash function for query normalization
   */
  hashFn?: (text: string) => string;
}

/**
 * Cache key pattern for bulk operations
 *
 * @interface KeyPattern
 * @description Pattern for matching multiple cache keys
 */
export interface KeyPattern {
  /**
   * Prefix to match
   * e.g., 'serp:' matches all SERP results
   */
  prefix?: string;

  /**
   * Suffix to match
   */
  suffix?: string;

  /**
   * Regex pattern to match against full key
   */
  pattern?: RegExp;

  /**
   * Keys to include (if pattern not specified)
   */
  keys?: string[];
}

// ============================================================================
// CACHE WARMING & PRELOADING
// ============================================================================

/**
 * Cache preload specification
 *
 * @interface CachePreloadSpec
 * @description Defines what entries to preload into cache at startup
 */
export interface CachePreloadSpec {
  /**
   * Array of queries to preload
   */
  queries: Array<{
    query: string;
    type: 'serp' | 'content' | 'hybrid';
    region?: string;
    language?: string;
  }>;

  /**
   * Whether to fetch missing entries from source
   * If false, only preload existing cached entries
   */
  fetchMissing?: boolean;

  /**
   * TTL for preloaded entries
   */
  ttlSeconds?: number;

  /**
   * Priority for preload operations
   */
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Cache warming strategy
 *
 * @interface CacheWarmingStrategy
 * @description Proactively maintain cache freshness
 */
export interface CacheWarmingStrategy {
  /**
   * Whether warming is enabled
   */
  enabled: boolean;

  /**
   * Queries to keep warm
   */
  warmQueries: Array<{
    query: string;
    type: 'serp' | 'content' | 'hybrid';

    /**
     * Interval to refresh this entry (seconds)
     */
    refreshIntervalSeconds: number;

    /**
     * Priority relative to other warm queries
     */
    priority?: number;
  }>;

  /**
   * Whether to refresh stale entries automatically
   */
  autoRefreshStale?: boolean;

  /**
   * Age threshold for considering entry stale (seconds)
   */
  staleThresholdSeconds?: number;

  /**
   * Maximum concurrent warming operations
   */
  maxConcurrent?: number;
}

// ============================================================================
// CACHE EVENTS
// ============================================================================

/**
 * Cache event types
 *
 * @enum CacheEventType
 * @description Events emitted by cache operations
 */
export enum CacheEventType {
  /** Entry was accessed */
  HIT = 'cache:hit',

  /** Entry was not found */
  MISS = 'cache:miss',

  /** Entry was stored */
  SET = 'cache:set',

  /** Entry was deleted */
  DELETE = 'cache:delete',

  /** Entry was updated */
  UPDATE = 'cache:update',

  /** Entry expired */
  EXPIRE = 'cache:expire',

  /** Entry was evicted */
  EVICT = 'cache:evict',

  /** Cache is full */
  FULL = 'cache:full',

  /** Cache operation failed */
  ERROR = 'cache:error',

  /** Cache stats updated */
  STATS_UPDATE = 'cache:stats_update',
}

/**
 * Cache event structure
 *
 * @interface CacheEvent
 * @description Emitted when cache operations occur
 */
export interface CacheEvent {
  /**
   * Event type
   */
  type: CacheEventType;

  /**
   * Timestamp of event
   */
  timestamp: Date;

  /**
   * Cache key affected
   */
  key?: string;

  /**
   * Data associated with event
   */
  data?: {
    entry?: CacheEntry;
    error?: Error;
    stats?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/**
 * Cache event listener
 *
 * @type CacheEventListener
 * @description Callback for cache events
 */
export type CacheEventListener = (event: CacheEvent) => void | Promise<void>;

// ============================================================================
// CACHE MIGRATION & EXPORT
// ============================================================================

/**
 * Cache export format
 *
 * @interface CacheExport
 * @description Portable representation of cache contents for export/import
 */
export interface CacheExport {
  /**
   * Export metadata
   */
  metadata: {
    exportedAt: Date;
    version: string;
    backend: CacheBackend;
    entryCount: number;
    totalSizeBytes: number;
  };

  /**
   * Cache entries
   */
  entries: Array<{
    key: string;
    data: unknown;
    createdAt: Date;
    expiresAt: Date;
    accessCount: number;
    lastAccessedAt: Date;
    metadata?: Record<string, unknown>;
  }>;

  /**
   * Cache configuration at time of export
   */
  config: CacheConfig;
}

/**
 * Cache import options
 *
 * @interface CacheImportOptions
 * @description Options for importing cache data
 */
export interface CacheImportOptions {
  /**
   * Whether to clear cache before importing
   */
  clearFirst?: boolean;

  /**
   * Whether to preserve entry timestamps
   * If false, treat imported entries as fresh
   */
  preserveTimestamps?: boolean;

  /**
   * Whether to overwrite existing keys
   */
  overwrite?: boolean;

  /**
   * Filter function to select which entries to import
   */
  filter?: (entry: CacheExport['entries'][0]) => boolean;

  /**
   * Transform function to modify entries during import
   */
  transform?: (entry: CacheExport['entries'][0]) => CacheExport['entries'][0];
}
