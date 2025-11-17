/**
 * LRU Skill Cache
 *
 * Memory-aware LRU (Least Recently Used) cache for skill content.
 * Tracks memory usage per skill and evicts LRU entries when budget exceeded.
 *
 * Features:
 * - Memory budget enforcement (bytes, not just entry count)
 * - LRU eviction policy
 * - Cache statistics (hits, misses, evictions)
 * - Thread-safe operations
 * - TTL support (optional)
 *
 * @module skill-cache
 */

import { createLogger, Logger } from './logging.js';
import { StandardError } from './errors.js';

/**
 * Cache entry with LRU metadata
 */
export interface CacheEntry<T> {
  /** Cache key (skill ID) */
  key: string;

  /** Cached value (skill content) */
  value: T;

  /** Entry size in bytes */
  sizeBytes: number;

  /** Last access timestamp */
  lastAccessed: Date;

  /** Creation timestamp */
  createdAt: Date;

  /** Expiry timestamp (optional) */
  expiresAt?: Date;
}

/**
 * Cache statistics
 */
export interface CacheStatistics {
  /** Current number of entries */
  size: number;

  /** Maximum number of entries */
  maxSize: number;

  /** Current memory usage (bytes) */
  memoryUsageBytes: number;

  /** Maximum memory budget (bytes) */
  maxMemoryBytes: number;

  /** Total cache hits */
  hits: number;

  /** Total cache misses */
  misses: number;

  /** Total evictions */
  evictions: number;

  /** Cache hit rate (0-1) */
  hitRate: number;

  /** Eviction rate (evictions / total operations) */
  evictionRate: number;

  /** Memory utilization (0-1) */
  memoryUtilization: number;
}

/**
 * LRU Cache configuration
 */
export interface LRUCacheConfig {
  /** Maximum memory budget in bytes */
  maxMemoryBytes: number;

  /** Maximum number of entries (optional, defaults to unlimited) */
  maxEntries?: number;

  /** Default TTL in milliseconds (optional, defaults to no expiry) */
  defaultTTLMs?: number;

  /** Logger instance */
  logger?: Logger;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * LRU Skill Cache with memory budget enforcement
 */
export class LRUSkillCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxMemoryBytes: number;
  private maxEntries: number;
  private defaultTTLMs?: number;
  private currentMemoryBytes: number = 0;
  private logger: Logger;
  private debug: boolean;

  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(config: LRUCacheConfig) {
    this.cache = new Map();
    this.maxMemoryBytes = config.maxMemoryBytes;
    this.maxEntries = config.maxEntries ?? Number.MAX_SAFE_INTEGER;
    this.defaultTTLMs = config.defaultTTLMs;
    this.logger = config.logger ?? createLogger('lru-skill-cache');
    this.debug = config.debug ?? false;

    if (this.debug) {
      this.logger.info('LRU cache initialized', {
        maxMemoryBytes: this.maxMemoryBytes,
        maxMemoryMB: (this.maxMemoryBytes / 1024 / 1024).toFixed(2),
        maxEntries: this.maxEntries,
        defaultTTLMs: this.defaultTTLMs,
      });
    }
  }

  /**
   * Get value from cache
   *
   * Updates last access time (LRU tracking).
   * Returns undefined if not found or expired.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check expiry
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      if (this.debug) {
        this.logger.debug('Cache entry expired', { key });
      }
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update last accessed (LRU tracking)
    entry.lastAccessed = new Date();
    this.stats.hits++;

    if (this.debug) {
      this.logger.debug('Cache hit', {
        key,
        sizeBytes: entry.sizeBytes,
        age: Date.now() - entry.createdAt.getTime(),
      });
    }

    return entry.value;
  }

  /**
   * Set value in cache
   *
   * Evicts LRU entries if memory budget would be exceeded.
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param sizeBytes - Size of value in bytes
   * @param ttlMs - TTL in milliseconds (optional, overrides default)
   */
  set(key: string, value: T, sizeBytes: number, ttlMs?: number): void {
    // Check if entry already exists
    const existing = this.cache.get(key);
    if (existing) {
      // Update existing entry
      this.currentMemoryBytes -= existing.sizeBytes;
      this.currentMemoryBytes += sizeBytes;

      existing.value = value;
      existing.sizeBytes = sizeBytes;
      existing.lastAccessed = new Date();
      existing.createdAt = new Date();

      if (ttlMs !== undefined || this.defaultTTLMs !== undefined) {
        const ttl = ttlMs ?? this.defaultTTLMs!;
        existing.expiresAt = new Date(Date.now() + ttl);
      }

      if (this.debug) {
        this.logger.debug('Cache entry updated', {
          key,
          sizeBytes,
          memoryUsageBytes: this.currentMemoryBytes,
        });
      }

      return;
    }

    // Evict entries if needed
    this.evictIfNeeded(sizeBytes);

    // Create new entry
    const entry: CacheEntry<T> = {
      key,
      value,
      sizeBytes,
      lastAccessed: new Date(),
      createdAt: new Date(),
    };

    if (ttlMs !== undefined || this.defaultTTLMs !== undefined) {
      const ttl = ttlMs ?? this.defaultTTLMs!;
      entry.expiresAt = new Date(Date.now() + ttl);
    }

    this.cache.set(key, entry);
    this.currentMemoryBytes += sizeBytes;

    if (this.debug) {
      this.logger.debug('Cache entry added', {
        key,
        sizeBytes,
        memoryUsageBytes: this.currentMemoryBytes,
        memoryUtilization: (this.currentMemoryBytes / this.maxMemoryBytes).toFixed(2),
      });
    }
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.currentMemoryBytes -= entry.sizeBytes;

    if (this.debug) {
      this.logger.debug('Cache entry deleted', {
        key,
        sizeBytes: entry.sizeBytes,
        memoryUsageBytes: this.currentMemoryBytes,
      });
    }

    return true;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check expiry
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.currentMemoryBytes = 0;

    if (this.debug) {
      this.logger.debug('Cache cleared');
    }
  }

  /**
   * Get cache size (number of entries)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get current memory usage (bytes)
   */
  get memoryUsageBytes(): number {
    return this.currentMemoryBytes;
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    const totalOps = this.stats.hits + this.stats.misses;
    const hitRate = totalOps > 0 ? this.stats.hits / totalOps : 0;
    const evictionRate = totalOps > 0 ? this.stats.evictions / totalOps : 0;
    const memoryUtilization = this.currentMemoryBytes / this.maxMemoryBytes;

    return {
      size: this.cache.size,
      maxSize: this.maxEntries,
      memoryUsageBytes: this.currentMemoryBytes,
      maxMemoryBytes: this.maxMemoryBytes,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate,
      evictionRate,
      memoryUtilization,
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Evict entries if needed to fit new entry
   *
   * Uses LRU (Least Recently Used) eviction policy.
   *
   * @param newEntrySizeBytes - Size of new entry to add
   */
  private evictIfNeeded(newEntrySizeBytes: number): void {
    // Check entry count limit
    while (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    // Check memory budget
    while (
      this.currentMemoryBytes + newEntrySizeBytes > this.maxMemoryBytes &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    // Final check: if single entry exceeds budget, throw error
    if (newEntrySizeBytes > this.maxMemoryBytes) {
      throw new StandardError(
        'CACHE_ENTRY_TOO_LARGE',
        `Entry size (${newEntrySizeBytes} bytes) exceeds maximum memory budget (${this.maxMemoryBytes} bytes)`,
        { newEntrySizeBytes, maxMemoryBytes: this.maxMemoryBytes }
      );
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime: Date | undefined;

    // Find LRU entry
    for (const [key, entry] of this.cache.entries()) {
      if (!oldestTime || entry.lastAccessed < oldestTime) {
        oldestKey = key;
        oldestTime = entry.lastAccessed;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      this.delete(oldestKey);
      this.stats.evictions++;

      if (this.debug) {
        this.logger.debug('Evicted LRU entry', {
          key: oldestKey,
          sizeBytes: entry.sizeBytes,
          age: Date.now() - entry.createdAt.getTime(),
          lastAccessed: entry.lastAccessed.toISOString(),
        });
      }
    }
  }

  /**
   * Remove expired entries
   *
   * @returns Number of expired entries removed
   */
  cleanupExpired(): number {
    const now = new Date();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.delete(key);
        removed++;
      }
    }

    if (removed > 0 && this.debug) {
      this.logger.debug('Cleaned up expired entries', { count: removed });
    }

    return removed;
  }
}
