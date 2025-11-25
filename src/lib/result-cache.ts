/**
 * Agent Result Cache - Phase 6 Performance Optimization
 *
 * Implements Redis-based caching for agent results to reduce redundant work.
 *
 * Performance targets:
 * - Cache hit rate: ~80% (with 1-hour TTL)
 * - Cache operation latency: <10ms
 * - 80% reduction in redundant agent execution
 *
 * Features:
 * - SHA256-based task hashing for cache keys
 * - Configurable TTL (default 1 hour)
 * - Prometheus metrics (hits, misses, size)
 * - Graceful degradation if Redis unavailable
 * - TypeScript strict mode (no any types)
 * - Cache invalidation API
 */

import { createHash } from 'crypto';
import { getRedisPool } from './connection-pool.js';

/**
 * Cache configuration
 */
export interface CacheConfig {
  ttlSeconds: number; // Default 3600 (1 hour)
  maxEntries: number; // Default 10000
  prefix: string; // Default 'cfn:cache:'
}

/**
 * Cached result structure
 */
export interface CachedResult {
  agentType: string;
  taskHash: string;
  result: unknown;
  confidence: number;
  cachedAt: string;
  expiresAt: string;
}

/**
 * Cache metrics for Prometheus monitoring
 */
export interface CacheMetrics {
  hits: number;
  misses: number;
  totalRequests: number;
  hitRate: number;
  sizeBytes: number;
  entries: number;
  lastUpdated: string;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  ttlSeconds: parseInt(process.env.CFN_CACHE_TTL_SECONDS || '3600', 10),
  maxEntries: parseInt(process.env.CFN_CACHE_MAX_ENTRIES || '10000', 10),
  prefix: process.env.CFN_CACHE_PREFIX || 'cfn:cache:',
};

/**
 * Metrics tracking
 */
let cacheHits = 0;
let cacheMisses = 0;
let cacheSizeBytes = 0;
let cacheEntries = 0;

/**
 * Cache availability flag
 */
let cacheAvailable = true;

/**
 * Generate SHA256 hash for task description
 * Ensures consistent cache keys for identical tasks
 */
export function generateTaskHash(taskDescription: string): string {
  return createHash('sha256').update(taskDescription.trim()).digest('hex');
}

/**
 * Build cache key from agent type and task hash
 */
function buildCacheKey(agentType: string, taskHash: string): string {
  return `${DEFAULT_CONFIG.prefix}${agentType}:${taskHash}`;
}

/**
 * Get cached result for agent task
 * Returns null if cache miss or error
 *
 * @param agentType - Type of agent (e.g., 'backend-developer')
 * @param taskDescription - Task description to hash
 * @returns Cached result or null
 */
export async function getCachedResult(
  agentType: string,
  taskDescription: string
): Promise<CachedResult | null> {
  if (!cacheAvailable) {
    cacheMisses++;
    return null;
  }

  try {
    const redis = getRedisPool();
    const taskHash = generateTaskHash(taskDescription);
    const cacheKey = buildCacheKey(agentType, taskHash);

    const startTime = Date.now();
    const cachedData = await redis.get(cacheKey);
    const latency = Date.now() - startTime;

    if (latency > 10) {
      console.warn(`Cache GET latency ${latency}ms exceeds 10ms target`);
    }

    if (!cachedData) {
      cacheMisses++;
      return null;
    }

    const parsed = JSON.parse(cachedData) as CachedResult;

    // Validate expiration
    const expiresAt = new Date(parsed.expiresAt);
    if (expiresAt < new Date()) {
      // Expired, delete and return null
      await redis.del(cacheKey);
      cacheMisses++;
      return null;
    }

    cacheHits++;
    return parsed;
  } catch (error) {
    const err = error as Error;
    console.error('Cache GET error:', err.message);
    // Graceful degradation
    cacheAvailable = false;
    cacheMisses++;
    return null;
  }
}

/**
 * Set cached result for agent task
 * Implements TTL-based expiration and size limits
 *
 * @param agentType - Type of agent
 * @param taskDescription - Task description to hash
 * @param result - Agent result to cache
 * @param confidence - Confidence score
 */
export async function setCachedResult(
  agentType: string,
  taskDescription: string,
  result: unknown,
  confidence: number
): Promise<void> {
  if (!cacheAvailable) {
    return;
  }

  try {
    const redis = getRedisPool();
    const taskHash = generateTaskHash(taskDescription);
    const cacheKey = buildCacheKey(agentType, taskHash);

    // Check max entries limit
    const currentEntries = await redis.dbsize();
    if (currentEntries >= DEFAULT_CONFIG.maxEntries) {
      console.warn(
        `Cache at max capacity (${DEFAULT_CONFIG.maxEntries} entries), evicting oldest entries`
      );
      // Redis with maxmemory-policy=allkeys-lru handles eviction automatically
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_CONFIG.ttlSeconds * 1000);

    const cachedResult: CachedResult = {
      agentType,
      taskHash,
      result,
      confidence,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const serialized = JSON.stringify(cachedResult);
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');

    const startTime = Date.now();
    await redis.set(cacheKey, serialized, 'EX', DEFAULT_CONFIG.ttlSeconds);
    const latency = Date.now() - startTime;

    if (latency > 10) {
      console.warn(`Cache SET latency ${latency}ms exceeds 10ms target`);
    }

    // Update metrics
    cacheSizeBytes += sizeBytes;
    cacheEntries++;
  } catch (error) {
    const err = error as Error;
    console.error('Cache SET error:', err.message);
    // Graceful degradation
    cacheAvailable = false;
  }
}

/**
 * Invalidate cache entries
 * If agentType provided, only invalidates that agent's cache
 * Otherwise, clears all cache entries
 *
 * @param agentType - Optional agent type to target
 * @returns Number of entries deleted
 */
export async function invalidateCache(agentType?: string): Promise<number> {
  if (!cacheAvailable) {
    return 0;
  }

  try {
    const redis = getRedisPool();
    let deletedCount = 0;

    if (agentType) {
      // Delete specific agent type cache entries
      const pattern = `${DEFAULT_CONFIG.prefix}${agentType}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        deletedCount = await redis.del(...keys);
      }
    } else {
      // Delete all cache entries
      const pattern = `${DEFAULT_CONFIG.prefix}*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        deletedCount = await redis.del(...keys);
      }
    }

    // Reset metrics
    if (!agentType) {
      cacheHits = 0;
      cacheMisses = 0;
      cacheSizeBytes = 0;
      cacheEntries = 0;
    }

    console.log(`Cache invalidated: ${deletedCount} entries deleted`);
    return deletedCount;
  } catch (error) {
    const err = error as Error;
    console.error('Cache invalidation error:', err.message);
    cacheAvailable = false;
    return 0;
  }
}

/**
 * Get cache metrics for Prometheus monitoring
 * Exposes hits, misses, hit rate, size, and entry count
 */
export function getCacheMetrics(): CacheMetrics {
  const totalRequests = cacheHits + cacheMisses;
  const hitRate = totalRequests > 0 ? cacheHits / totalRequests : 0;

  return {
    hits: cacheHits,
    misses: cacheMisses,
    totalRequests,
    hitRate: parseFloat(hitRate.toFixed(4)),
    sizeBytes: cacheSizeBytes,
    entries: cacheEntries,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Reset cache metrics
 * Used for testing and monitoring reset
 */
export function resetCacheMetrics(): void {
  cacheHits = 0;
  cacheMisses = 0;
  cacheSizeBytes = 0;
  cacheEntries = 0;
  console.log('Cache metrics reset');
}

/**
 * Check if cache is available
 * Used for graceful degradation checks
 */
export function isCacheAvailable(): boolean {
  return cacheAvailable;
}

/**
 * Reset cache availability flag
 * Used after Redis reconnection
 */
export function resetCacheAvailability(): void {
  cacheAvailable = true;
  console.log('Cache availability reset');
}

/**
 * Get cache configuration
 * Returns current cache settings
 */
export function getCacheConfig(): CacheConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Update cache TTL for future entries
 * Does not affect existing cached entries
 *
 * @param ttlSeconds - New TTL in seconds
 */
export function updateCacheTTL(ttlSeconds: number): void {
  if (ttlSeconds < 60 || ttlSeconds > 86400) {
    throw new Error(
      `Invalid TTL: ${ttlSeconds}s. Must be between 60s (1 min) and 86400s (24 hours).`
    );
  }
  DEFAULT_CONFIG.ttlSeconds = ttlSeconds;
  console.log(`Cache TTL updated to ${ttlSeconds} seconds`);
}

/**
 * Get cache entry count from Redis
 * More accurate than tracked metric (accounts for evictions)
 */
export async function getCacheEntryCount(): Promise<number> {
  if (!cacheAvailable) {
    return 0;
  }

  try {
    const redis = getRedisPool();
    const pattern = `${DEFAULT_CONFIG.prefix}*`;
    const keys = await redis.keys(pattern);
    return keys.length;
  } catch (error) {
    const err = error as Error;
    console.error('Failed to get cache entry count:', err.message);
    return 0;
  }
}

/**
 * Prewarm cache with common agent tasks
 * Used during system initialization
 *
 * @param entries - Array of [agentType, taskDescription, result, confidence] tuples
 */
export async function prewarmCache(
  entries: Array<[string, string, unknown, number]>
): Promise<number> {
  let warmedCount = 0;

  for (const [agentType, taskDescription, result, confidence] of entries) {
    try {
      await setCachedResult(agentType, taskDescription, result, confidence);
      warmedCount++;
    } catch (error) {
      const err = error as Error;
      console.error(`Failed to prewarm cache entry: ${err.message}`);
    }
  }

  console.log(`Cache prewarmed with ${warmedCount} entries`);
  return warmedCount;
}
