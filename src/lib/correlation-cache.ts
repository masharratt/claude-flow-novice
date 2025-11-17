/**
 * Correlation Cache Layer
 *
 * Provides LRU caching for correlation key queries with TTL and invalidation.
 * Part of Task 3.3: Query Correlation Key Layer
 *
 * @example
 * ```typescript
 * const cache = new CorrelationCache({
 *   maxSize: 100,
 *   ttlMinutes: 5,
 * });
 *
 * cache.set('task:abc123', { data: 'value' });
 * const value = cache.get('task:abc123'); // { data: 'value' }
 * ```
 */

import { createLogger, Logger } from './logging.js';

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T = any> {
  /** Cached value */
  value: T;
  /** Entry creation timestamp */
  createdAt: Date;
  /** Last accessed timestamp */
  lastAccessed: Date;
  /** Access count */
  accessCount: number;
  /** TTL in milliseconds */
  ttl: number;
}

/**
 * Cache metrics
 */
export interface CacheMetrics {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Cache hit ratio (0.0-1.0) */
  hitRatio: number;
  /** Current cache size */
  size: number;
  /** Maximum cache size */
  maxSize: number;
  /** Total evictions */
  evictions: number;
  /** Total invalidations */
  invalidations: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum cache size (default: 100) */
  maxSize?: number;
  /** TTL in minutes (default: 5) */
  ttlMinutes?: number;
  /** Enable cache warming (default: false) */
  enableWarming?: boolean;
  /** Common patterns for cache warming */
  warmingPatterns?: string[];
  /** Logger instance (optional) */
  logger?: Logger;
}

/**
 * Cache invalidation trigger
 */
export type InvalidationTrigger = 'write' | 'delete' | 'manual' | 'ttl';

/**
 * LRU Cache for correlation key queries
 *
 * Implements Least Recently Used eviction policy with TTL and metrics tracking.
 */
export class CorrelationCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttlMinutes: number;
  private logger: Logger;

  // Metrics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;
  private invalidations: number = 0;

  // Cache warming
  private warmingEnabled: boolean;
  private warmingPatterns: string[];

  constructor(config: CacheConfig = {}) {
    this.cache = new Map();
    this.maxSize = config.maxSize || 100;
    this.ttlMinutes = config.ttlMinutes || 5;
    this.warmingEnabled = config.enableWarming || false;
    this.warmingPatterns = config.warmingPatterns || [];
    this.logger = config.logger || createLogger('correlation-cache');

    // Start periodic TTL cleanup
    this.startTTLCleanup();
  }

  /**
   * Get value from cache
   *
   * @param key - Cache key
   * @returns Cached value or undefined
   */
  get<T = any>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      this.logger.debug('Cache miss', { key });
      return undefined;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.invalidate(key, 'ttl');
      this.misses++;
      this.logger.debug('Cache miss (expired)', { key });
      return undefined;
    }

    // Update LRU metadata
    entry.lastAccessed = new Date();
    entry.accessCount++;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    this.logger.debug('Cache hit', { key, accessCount: entry.accessCount });

    return entry.value as T;
  }

  /**
   * Set value in cache
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMinutes - Optional TTL override
   */
  set<T = any>(key: string, value: T, ttlMinutes?: number): void {
    const ttl = (ttlMinutes || this.ttlMinutes) * 60 * 1000; // Convert to milliseconds

    const entry: CacheEntry<T> = {
      value,
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      ttl,
    };

    // Check if we need to evict
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Add/update entry
    this.cache.set(key, entry);

    this.logger.debug('Cache set', { key, ttl });
  }

  /**
   * Check if key exists in cache
   *
   * @param key - Cache key
   * @returns True if key exists and not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.invalidate(key, 'ttl');
      return false;
    }

    return true;
  }

  /**
   * Delete key from cache
   *
   * @param key - Cache key
   * @returns True if key was deleted
   */
  delete(key: string): boolean {
    return this.invalidate(key, 'delete');
  }

  /**
   * Invalidate cache entry
   *
   * @param key - Cache key
   * @param trigger - Invalidation trigger
   * @returns True if entry was invalidated
   */
  invalidate(key: string, trigger: InvalidationTrigger = 'manual'): boolean {
    const deleted = this.cache.delete(key);

    if (deleted) {
      this.invalidations++;
      this.logger.debug('Cache invalidated', { key, trigger });
    }

    return deleted;
  }

  /**
   * Invalidate multiple keys by pattern
   *
   * @param pattern - Key pattern (supports wildcards)
   * @returns Number of keys invalidated
   */
  invalidatePattern(pattern: string): number {
    const regex = this.patternToRegex(pattern);
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.invalidate(key, 'manual');
        count++;
      }
    }

    this.logger.info('Pattern invalidation', { pattern, count });

    return count;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.invalidations += size;
    this.logger.info('Cache cleared', { entriesCleared: size });
  }

  /**
   * Get cache metrics
   *
   * @returns Cache metrics
   */
  getMetrics(): CacheMetrics {
    const totalRequests = this.hits + this.misses;
    const hitRatio = totalRequests > 0 ? this.hits / totalRequests : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRatio,
      size: this.cache.size,
      maxSize: this.maxSize,
      evictions: this.evictions,
      invalidations: this.invalidations,
    };
  }

  /**
   * Reset cache metrics
   */
  resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.invalidations = 0;
    this.logger.info('Cache metrics reset');
  }

  /**
   * Warm cache with common patterns
   *
   * @param dataLoader - Function to load data for warming
   */
  async warm(dataLoader: (pattern: string) => Promise<Map<string, any>>): Promise<void> {
    if (!this.warmingEnabled || this.warmingPatterns.length === 0) {
      return;
    }

    this.logger.info('Cache warming started', { patterns: this.warmingPatterns });

    for (const pattern of this.warmingPatterns) {
      try {
        const data = await dataLoader(pattern);

        for (const [key, value] of data.entries()) {
          this.set(key, value);
        }

        this.logger.debug('Pattern warmed', { pattern, count: data.size });
      } catch (error) {
        this.logger.warn('Cache warming failed for pattern', { pattern, error });
      }
    }

    this.logger.info('Cache warming completed');
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    // Map maintains insertion order, so first entry is LRU
    const firstKey = this.cache.keys().next().value;

    if (firstKey) {
      this.cache.delete(firstKey);
      this.evictions++;
      this.logger.debug('LRU eviction', { key: firstKey });
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    const createdAt = entry.createdAt.getTime();
    return now - createdAt > entry.ttl;
  }

  /**
   * Convert pattern to regex
   */
  private patternToRegex(pattern: string): RegExp {
    // Escape special regex characters except *
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Convert * to .*
    const regexPattern = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Start periodic TTL cleanup
   */
  private startTTLCleanup(): void {
    // Run cleanup every minute
    setInterval(() => {
      this.cleanupExpired();
    }, 60 * 1000);
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.invalidate(key, 'ttl');
        count++;
      }
    }

    if (count > 0) {
      this.logger.debug('TTL cleanup', { expired: count });
    }
  }
}

/**
 * Create correlation cache instance
 *
 * @param config - Cache configuration
 * @returns Correlation cache instance
 */
export function createCorrelationCache(config?: CacheConfig): CorrelationCache {
  return new CorrelationCache(config);
}
