/**
 * Research Cache with File-Based Storage and In-Memory Tier
 *
 * @module planning/seo/lib/research-cache
 * @description Async file-based cache with in-memory tier, TTL support for research results
 * Note: RuVector integration deferred to Phase 5
 *
 * Performance Optimizations:
 * - Async file I/O (fs.promises) to prevent event loop blocking
 * - In-memory LRU cache tier for hot queries (100-1000x faster)
 * - Configurable eviction ratio and memory tier size
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  CacheEntry,
  ResearchQuery,
  ResearchResult,
  ResearchError,
  ResearchErrorCode,
  CacheStats,
} from '../types/research';

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG = {
  cacheDir: path.join(process.env.HOME || '/tmp', '.cfn/seo/cache/research'),
  defaultTtl: {
    serp: 86400, // 24 hours for SERP data
    content: 604800, // 7 days for content data
    hybrid: 86400, // 24 hours for hybrid queries
  },
  maxCacheSize: 1024 * 1024 * 100, // 100MB
  evictionTargetRatio: 0.8, // Evict to 80% capacity when full
  memoryTierSize: 100, // Maximum entries in memory cache (LRU)
  compressionEnabled: false, // Defer compression to future optimization
};

/**
 * Research cache implementation with async file-based storage and memory tier
 */
export class ResearchCache {
  private cacheDir: string;
  private memoryCache: Map<string, CacheEntry<ResearchResult>>;
  private maxMemoryEntries: number;
  private evictionTargetRatio: number;
  private stats: {
    hits: number;
    misses: number;
    memoryHits: number;
    fileHits: number;
    writes: number;
    evictions: number;
  };

  constructor(cacheDir?: string, options?: { memoryTierSize?: number; evictionTargetRatio?: number }) {
    this.cacheDir = cacheDir || DEFAULT_CONFIG.cacheDir;
    this.maxMemoryEntries = options?.memoryTierSize || DEFAULT_CONFIG.memoryTierSize;
    this.evictionTargetRatio = options?.evictionTargetRatio || DEFAULT_CONFIG.evictionTargetRatio;
    this.memoryCache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      fileHits: 0,
      writes: 0,
      evictions: 0,
    };

    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists (async)
   */
  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.promises.access(this.cacheDir);
    } catch {
      await fs.promises.mkdir(this.cacheDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Generate cache key from query
   *
   * @param query - Research query
   * @returns Cache key (SHA-256 hash)
   */
  generateCacheKey(query: ResearchQuery): string {
    const keyData: Record<string, unknown> = {
      query: query.query,
      type: query.type,
      options: {} as Record<string, unknown>,
    };

    // Use type guards to safely access union type properties
    if (query.options) {
      const optionsRecord = query.options as unknown as Record<string, unknown>;
      const optionsObj = keyData.options as Record<string, unknown>;

      // WebSearchOptions properties
      if ('maxResults' in query.options) {
        optionsObj.maxResults = optionsRecord.maxResults;
      }
      if ('targetUrl' in query.options) {
        optionsObj.targetUrl = optionsRecord.targetUrl;
      }
      if ('deepCrawl' in query.options) {
        optionsObj.deepCrawl = optionsRecord.deepCrawl;
      }
      // Common properties
      if ('cacheTtl' in query.options) {
        optionsObj.cacheTtl = optionsRecord.cacheTtl;
      }
      if ('priority' in query.options) {
        optionsObj.priority = optionsRecord.priority;
      }
    }

    const keyString = JSON.stringify(keyData);
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Set entry in memory cache with LRU eviction
   *
   * @param cacheKey - Cache key
   * @param entry - Cache entry
   */
  private setMemoryCache(cacheKey: string, entry: CacheEntry<ResearchResult>): void {
    // Simple LRU: evict oldest entry if cache is full
    if (this.memoryCache.size >= this.maxMemoryEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }

    // Delete and re-add to maintain insertion order (Map is ordered)
    this.memoryCache.delete(cacheKey);
    this.memoryCache.set(cacheKey, entry);
  }

  /**
   * Get cached result (checks memory tier first, then file tier)
   *
   * @param query - Research query
   * @returns Cached result or null if not found/expired
   */
  async get(query: ResearchQuery): Promise<ResearchResult | null> {
    const cacheKey = this.generateCacheKey(query);

    // Check memory cache first (O(1) lookup, 100-1000x faster)
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry) {
      const now = new Date();
      const expiresAt = new Date(memEntry.expiresAt);

      if (now <= expiresAt) {
        // Memory hit - update access tracking
        memEntry.accessCount += 1;
        memEntry.lastAccessedAt = now;
        this.stats.hits += 1;
        this.stats.memoryHits += 1;

        // Re-insert to maintain LRU order
        this.setMemoryCache(cacheKey, memEntry);

        // Return cached data with updated metadata
        const result = memEntry.data;
        result.metadata.fromCache = true;
        result.metadata.cacheKey = cacheKey;
        return result;
      } else {
        // Expired memory entry - remove it
        this.memoryCache.delete(cacheKey);
      }
    }

    // Fallback to file cache (async I/O)
    const fileResult = await this.getFromFile(cacheKey);
    if (fileResult) {
      // Warm memory cache for future requests
      const cacheFile = path.join(this.cacheDir, cacheKey + '.json');
      try {
        const cacheData = await fs.promises.readFile(cacheFile, 'utf-8');
        const entry: CacheEntry<ResearchResult> = JSON.parse(cacheData);
        this.setMemoryCache(cacheKey, entry);
      } catch {
        // Non-fatal error warming cache
      }

      this.stats.hits += 1;
      this.stats.fileHits += 1;
    } else {
      this.stats.misses += 1;
    }

    return fileResult;
  }

  /**
   * Get entry from file cache (async)
   *
   * @param cacheKey - Cache key
   * @returns Cached result or null
   */
  private async getFromFile(cacheKey: string): Promise<ResearchResult | null> {
    const cacheFile = path.join(this.cacheDir, cacheKey + '.json');

    try {
      await fs.promises.access(cacheFile);
    } catch {
      return null;
    }

    try {
      const cacheData = await fs.promises.readFile(cacheFile, 'utf-8');
      const entry: CacheEntry<ResearchResult> = JSON.parse(cacheData);

      // Check expiration
      const now = new Date();
      const expiresAt = new Date(entry.expiresAt);

      if (now > expiresAt) {
        // Expired, delete cache file (async)
        await fs.promises.unlink(cacheFile);
        return null;
      }

      // Update access tracking (async write)
      entry.accessCount += 1;
      entry.lastAccessedAt = now;
      await fs.promises.writeFile(cacheFile, JSON.stringify(entry, null, 2));

      // Return cached data with updated metadata
      const result = entry.data;
      result.metadata.fromCache = true;
      result.metadata.cacheKey = cacheKey;

      return result;
    } catch (error) {
      // Cache read error, treat as miss
      return null;
    }
  }

  /**
   * Set cache entry (writes to both memory and file tiers)
   *
   * @param query - Research query
   * @param result - Research result to cache
   * @returns Cache key
   */
  async set(query: ResearchQuery, result: ResearchResult): Promise<string> {
    const cacheKey = this.generateCacheKey(query);
    const cacheFile = path.join(this.cacheDir, cacheKey + '.json');

    try {
      // Determine TTL based on query type and custom options
      const ttl =
        query.options?.cacheTtl ||
        DEFAULT_CONFIG.defaultTtl[query.type] ||
        DEFAULT_CONFIG.defaultTtl.hybrid;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      const entry: CacheEntry<ResearchResult> = {
        key: cacheKey,
        data: result,
        createdAt: now,
        expiresAt,
        accessCount: 0,
        lastAccessedAt: now,
        metadata: {
          queryHash: this.hashQuery(query.query),
          resultType: query.type,
          resultCount:
            (result.serpResults?.length || 0) + (result.contentResults?.length || 0),
        },
      };

      // Write to memory cache first (fast)
      this.setMemoryCache(cacheKey, entry);

      // Write to file cache (async)
      await fs.promises.writeFile(cacheFile, JSON.stringify(entry, null, 2), { mode: 0o600 });
      this.stats.writes += 1;

      // Check cache size and evict if needed (async)
      await this.evictIfNeeded();

      return cacheKey;
    } catch (error) {
      throw new ResearchError(
        'Failed to write cache entry: ' + (error instanceof Error ? error.message : 'Unknown error'),
        ResearchErrorCode.CACHE_ERROR,
        { cacheKey, error }
      );
    }
  }

  /**
   * Invalidate cache entry (removes from both tiers)
   *
   * @param query - Research query to invalidate
   * @returns True if entry was deleted
   */
  async invalidate(query: ResearchQuery): Promise<boolean> {
    const cacheKey = this.generateCacheKey(query);
    const cacheFile = path.join(this.cacheDir, cacheKey + '.json');

    // Remove from memory cache
    this.memoryCache.delete(cacheKey);

    try {
      await fs.promises.access(cacheFile);
      await fs.promises.unlink(cacheFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Invalidate all cache entries matching a pattern
   *
   * @param queryPattern - Query text pattern (substring match)
   * @returns Number of entries invalidated
   */
  async invalidateByPattern(queryPattern: string): Promise<number> {
    let invalidatedCount = 0;

    try {
      const cacheFiles = await fs.promises.readdir(this.cacheDir);

      for (const file of cacheFiles) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        const cacheData = await fs.promises.readFile(filePath, 'utf-8');
        const entry: CacheEntry<ResearchResult> = JSON.parse(cacheData);

        if (entry.data.query.query.includes(queryPattern)) {
          await fs.promises.unlink(filePath);
          // Also remove from memory cache
          this.memoryCache.delete(entry.key);
          invalidatedCount += 1;
        }
      }

      return invalidatedCount;
    } catch (error) {
      throw new ResearchError(
        'Failed to invalidate by pattern: ' + (error instanceof Error ? error.message : 'Unknown error'),
        ResearchErrorCode.CACHE_ERROR,
        { queryPattern, error }
      );
    }
  }

  /**
   * Clear all cache entries (both tiers)
   */
  async clear(): Promise<void> {
    try {
      const cacheFiles = await fs.promises.readdir(this.cacheDir);

      for (const file of cacheFiles) {
        if (file.endsWith('.json')) {
          await fs.promises.unlink(path.join(this.cacheDir, file));
        }
      }

      // Clear memory cache
      this.memoryCache.clear();

      this.stats = {
        hits: 0,
        misses: 0,
        memoryHits: 0,
        fileHits: 0,
        writes: 0,
        evictions: 0,
      };
    } catch (error) {
      throw new ResearchError(
        'Failed to clear cache: ' + (error instanceof Error ? error.message : 'Unknown error'),
        ResearchErrorCode.CACHE_ERROR,
        { error }
      );
    }
  }

  /**
   * Evict expired or excess entries if cache size exceeds limit (async)
   */
  private async evictIfNeeded(): Promise<void> {
    const cacheSize = await this.getCacheSize();

    if (cacheSize <= DEFAULT_CONFIG.maxCacheSize) {
      return;
    }

    try {
      const cacheFiles = await fs.promises.readdir(this.cacheDir);
      const entries: Array<{ file: string; accessedAt: Date; size: number; key: string }> = [];

      // Build entry list with metadata (async)
      for (const file of cacheFiles) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.promises.stat(filePath);
        const cacheData = await fs.promises.readFile(filePath, 'utf-8');
        const entry: CacheEntry<ResearchResult> = JSON.parse(cacheData);

        entries.push({
          file,
          accessedAt: new Date(entry.lastAccessedAt),
          size: stats.size,
          key: entry.key,
        });
      }

      // Sort by least recently accessed
      entries.sort((a, b) => a.accessedAt.getTime() - b.accessedAt.getTime());

      // Evict oldest entries until cache size is acceptable
      let currentSize = cacheSize;
      const targetSize = DEFAULT_CONFIG.maxCacheSize * this.evictionTargetRatio;

      for (const entry of entries) {
        if (currentSize <= targetSize) break;

        await fs.promises.unlink(path.join(this.cacheDir, entry.file));
        // Also remove from memory cache
        this.memoryCache.delete(entry.key);
        currentSize -= entry.size;
        this.stats.evictions += 1;
      }
    } catch (error) {
      // Non-fatal eviction error
      console.error('Cache eviction error:', error);
    }
  }

  /**
   * Get total cache size in bytes (async)
   */
  private async getCacheSize(): Promise<number> {
    try {
      const cacheFiles = await fs.promises.readdir(this.cacheDir);
      let totalSize = 0;

      for (const file of cacheFiles) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.cacheDir, file);
          const stats = await fs.promises.stat(filePath);
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats & { memoryHitRate: number; memoryEntries: number }> {
    const totalEntries = await this.getCacheEntryCount();
    const sizeBytes = await this.getCacheSize();
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const memoryHitRate = this.stats.hits > 0 ? this.stats.memoryHits / this.stats.hits : 0;

    // Calculate oldest entry age
    let oldestEntryAge: number | undefined;
    let totalAccessCount = 0;

    try {
      const cacheFiles = await fs.promises.readdir(this.cacheDir);

      for (const file of cacheFiles) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        const cacheData = await fs.promises.readFile(filePath, 'utf-8');
        const entry: CacheEntry<ResearchResult> = JSON.parse(cacheData);

        const age = (Date.now() - new Date(entry.createdAt).getTime()) / 1000;
        if (oldestEntryAge === undefined || age > oldestEntryAge) {
          oldestEntryAge = age;
        }

        totalAccessCount += entry.accessCount;
      }
    } catch (error) {
      // Non-fatal stats error
    }

    const avgAccessCount = totalEntries > 0 ? totalAccessCount / totalEntries : undefined;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      memoryHitRate,
      memoryEntries: this.memoryCache.size,
      totalEntries,
      sizeBytes,
      oldestEntryAge,
      avgAccessCount,
    };
  }

  /**
   * Get cache entry count (async)
   */
  private async getCacheEntryCount(): Promise<number> {
    try {
      const cacheFiles = await fs.promises.readdir(this.cacheDir);
      return cacheFiles.filter((file) => file.endsWith('.json')).length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Hash query string for metadata
   */
  private hashQuery(query: string): string {
    return crypto.createHash('md5').update(query).digest('hex');
  }
}

/**
 * Default cache instance
 */
export const researchCache = new ResearchCache();
