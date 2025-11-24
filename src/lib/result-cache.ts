/**
 * Agent Result Cache
 *
 * Implements Redis-based caching for agent results to achieve
 * 80%+ cache hit rate and reduce redundant agent executions.
 *
 * Features:
 * - Cache key: agent_type + task hash
 * - 1-hour TTL on cached results
 * - Prometheus metrics for cache hit/miss tracking
 * - Automatic cache invalidation
 * - Compression for large results
 */

import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import { Cluster } from 'ioredis';
import { register, Counter, Histogram } from 'prom-client';

// Promisify zlib functions
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

export interface CacheConfig {
  redisCluster: Cluster;
  ttl?: number; // Time to live in seconds (default: 3600 = 1 hour)
  namespace?: string; // Cache key namespace
  compressionThreshold?: number; // Compress results larger than this (bytes)
  maxCacheSize?: number; // Maximum number of cache entries (default: 10000)
}

export interface CachedResult {
  agentType: string;
  taskHash: string;
  result: any;
  confidence: number;
  timestamp: number;
  executionTime: number;
}

export class ResultCache {
  private redis: Cluster;
  private ttl: number;
  private namespace: string;
  private compressionThreshold: number;
  private maxCacheSize: number;
  private accessListKey: string; // Redis sorted set for LRU tracking

  // Prometheus metrics
  private cacheHitCounter: Counter;
  private cacheMissCounter: Counter;
  private cacheGetDuration: Histogram;
  private cacheSetDuration: Histogram;

  constructor(config: CacheConfig) {
    this.redis = config.redisCluster;
    this.ttl = config.ttl || 3600; // 1 hour default
    this.namespace = config.namespace || 'cfn:agent:result';
    this.compressionThreshold = config.compressionThreshold || 10240; // 10KB
    this.maxCacheSize = config.maxCacheSize || 10000; // 10K entries default
    this.accessListKey = `${this.namespace}:lru`;

    // Initialize Prometheus metrics
    this.cacheHitCounter = new Counter({
      name: 'cfn_agent_cache_hits_total',
      help: 'Total number of agent result cache hits',
      labelNames: ['agent_type'],
      registers: [register],
    });

    this.cacheMissCounter = new Counter({
      name: 'cfn_agent_cache_misses_total',
      help: 'Total number of agent result cache misses',
      labelNames: ['agent_type'],
      registers: [register],
    });

    this.cacheGetDuration = new Histogram({
      name: 'cfn_agent_cache_get_duration_seconds',
      help: 'Duration of cache get operations',
      labelNames: ['agent_type', 'hit'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [register],
    });

    this.cacheSetDuration = new Histogram({
      name: 'cfn_agent_cache_set_duration_seconds',
      help: 'Duration of cache set operations',
      labelNames: ['agent_type'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [register],
    });
  }

  /**
   * Generate cache key from agent type and task
   */
  private generateCacheKey(agentType: string, task: string): string {
    const taskHash = this.hashTask(task);
    return `${this.namespace}:${agentType}:${taskHash}`;
  }

  /**
   * Hash task description for cache key
   */
  private hashTask(task: string): string {
    return crypto.createHash('sha256').update(task).digest('hex').substring(0, 16);
  }

  /**
   * Compress data using gzip if it exceeds threshold
   * Uses actual compression (not base64 encoding)
   */
  private async compress(data: string): Promise<Buffer> {
    const dataBuffer = Buffer.from(data, 'utf-8');

    if (dataBuffer.length < this.compressionThreshold) {
      return dataBuffer;
    }

    // Use gzip compression for actual size reduction
    const compressed = await gzipAsync(dataBuffer);

    // Verify compression actually reduced size (compression overhead exists)
    if (compressed.length < dataBuffer.length) {
      return compressed;
    }

    // Return original if compression increased size
    return dataBuffer;
  }

  /**
   * Decompress gzipped data
   * Validates gzip magic header before decompression
   */
  private async decompress(data: Buffer): Promise<string> {
    // Check for gzip magic header (0x1f 0x8b)
    if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
      try {
        const decompressed = await gunzipAsync(data);
        return decompressed.toString('utf-8');
      } catch (err) {
        console.error('Decompression failed, returning raw data:', err);
        return data.toString('utf-8');
      }
    }

    // Not compressed, return as-is
    return data.toString('utf-8');
  }

  /**
   * Update LRU access timestamp for cache key
   */
  private async updateLRU(cacheKey: string): Promise<void> {
    const timestamp = Date.now();
    await this.redis.zadd(this.accessListKey, timestamp, cacheKey);
  }

  /**
   * Evict least recently used entries if cache exceeds max size
   * Implements LRU eviction policy
   */
  private async evictLRU(): Promise<void> {
    try {
      const cacheSize = await this.redis.zcard(this.accessListKey);

      if (cacheSize > this.maxCacheSize) {
        const evictCount = cacheSize - this.maxCacheSize;

        // Get oldest entries (lowest scores)
        const oldestKeys = await this.redis.zrange(
          this.accessListKey,
          0,
          evictCount - 1
        );

        if (oldestKeys.length > 0) {
          // Delete cache entries
          await this.redis.del(...oldestKeys);

          // Remove from LRU tracking
          await this.redis.zrem(this.accessListKey, ...oldestKeys);

          console.log(
            `Cache LRU EVICTION: Removed ${oldestKeys.length} oldest entries (size: ${cacheSize} -> ${cacheSize - oldestKeys.length})`
          );
        }
      }
    } catch (err) {
      console.error('Error during LRU eviction:', err);
    }
  }

  /**
   * Get cached result
   */
  async get(
    agentType: string,
    task: string
  ): Promise<CachedResult | null> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(agentType, task);

    try {
      const cached = await this.redis.getBuffer(cacheKey);

      const duration = (Date.now() - startTime) / 1000;

      if (cached) {
        // Update LRU timestamp on access
        await this.updateLRU(cacheKey);

        this.cacheHitCounter.inc({ agent_type: agentType });
        this.cacheGetDuration.observe(
          { agent_type: agentType, hit: 'true' },
          duration
        );

        const decompressed = await this.decompress(cached);
        const result = JSON.parse(decompressed);

        console.log(
          `Cache HIT: ${agentType} (${this.hashTask(task).substring(0, 8)})`
        );

        return result;
      } else {
        this.cacheMissCounter.inc({ agent_type: agentType });
        this.cacheGetDuration.observe(
          { agent_type: agentType, hit: 'false' },
          duration
        );

        console.log(
          `Cache MISS: ${agentType} (${this.hashTask(task).substring(0, 8)})`
        );

        return null;
      }
    } catch (err) {
      console.error('Error getting cached result:', err);
      return null;
    }
  }

  /**
   * Set cached result with LRU eviction
   */
  async set(
    agentType: string,
    task: string,
    result: any,
    confidence: number,
    executionTime: number
  ): Promise<void> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(agentType, task);

    try {
      const cachedResult: CachedResult = {
        agentType,
        taskHash: this.hashTask(task),
        result,
        confidence,
        timestamp: Date.now(),
        executionTime,
      };

      const serialized = JSON.stringify(cachedResult);
      const compressed = await this.compress(serialized);

      // Use Buffer.from to ensure proper binary storage
      await this.redis.setex(cacheKey, this.ttl, compressed);

      // Track in LRU
      await this.updateLRU(cacheKey);

      // Trigger eviction if needed
      await this.evictLRU();

      const duration = (Date.now() - startTime) / 1000;
      this.cacheSetDuration.observe({ agent_type: agentType }, duration);

      console.log(
        `Cache SET: ${agentType} (${this.hashTask(task).substring(0, 8)}) - TTL: ${this.ttl}s`
      );
    } catch (err) {
      console.error('Error setting cached result:', err);
    }
  }

  /**
   * Invalidate cached result
   */
  async invalidate(agentType: string, task: string): Promise<void> {
    const cacheKey = this.generateCacheKey(agentType, task);

    try {
      await this.redis.del(cacheKey);
      await this.redis.zrem(this.accessListKey, cacheKey);
      console.log(
        `Cache INVALIDATE: ${agentType} (${this.hashTask(task).substring(0, 8)})`
      );
    } catch (err) {
      console.error('Error invalidating cached result:', err);
    }
  }

  /**
   * Invalidate all cached results for an agent type
   */
  async invalidateAgentType(agentType: string): Promise<void> {
    const pattern = `${this.namespace}:${agentType}:*`;

    try {
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        await this.redis.zrem(this.accessListKey, ...keys);
        console.log(
          `Cache INVALIDATE ALL: ${agentType} (${keys.length} keys)`
        );
      }
    } catch (err) {
      console.error('Error invalidating agent type cache:', err);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
    totalKeys: number;
  }> {
    try {
      // Get metrics from Prometheus
      const metrics = await register.metrics();
      const lines = metrics.split('\n');

      let hits = 0;
      let misses = 0;

      for (const line of lines) {
        if (line.startsWith('cfn_agent_cache_hits_total')) {
          const match = line.match(/(\d+)$/);
          if (match) hits += parseInt(match[1]);
        } else if (line.startsWith('cfn_agent_cache_misses_total')) {
          const match = line.match(/(\d+)$/);
          if (match) misses += parseInt(match[1]);
        }
      }

      const total = hits + misses;
      const hitRate = total > 0 ? hits / total : 0;

      // Get total cached keys
      const pattern = `${this.namespace}:*`;
      const keys = await this.redis.keys(pattern);

      return {
        hits,
        misses,
        hitRate,
        totalKeys: keys.length,
      };
    } catch (err) {
      console.error('Error getting cache stats:', err);
      return { hits: 0, misses: 0, hitRate: 0, totalKeys: 0 };
    }
  }

  /**
   * Clear all cached results
   */
  async clear(): Promise<void> {
    const pattern = `${this.namespace}:*`;

    try {
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        await this.redis.del(this.accessListKey);
        console.log(`Cache CLEAR: ${keys.length} keys deleted`);
      }
    } catch (err) {
      console.error('Error clearing cache:', err);
    }
  }

  /**
   * Warm up cache with common tasks
   */
  async warmUp(
    commonTasks: Array<{ agentType: string; task: string; result: any; confidence: number }>
  ): Promise<void> {
    console.log(`Cache WARM UP: ${commonTasks.length} tasks`);

    for (const task of commonTasks) {
      await this.set(
        task.agentType,
        task.task,
        task.result,
        task.confidence,
        0
      );
    }

    console.log('Cache warm up complete');
  }

  /**
   * Get cache hit rate by agent type
   */
  async getHitRateByAgentType(): Promise<Map<string, number>> {
    const hitRates = new Map<string, number>();

    try {
      const metrics = await register.metrics();
      const lines = metrics.split('\n');

      const hitsByType = new Map<string, number>();
      const missesByType = new Map<string, number>();

      for (const line of lines) {
        if (line.startsWith('cfn_agent_cache_hits_total')) {
          const typeMatch = line.match(/agent_type="([^"]+)"/);
          const countMatch = line.match(/(\d+)$/);
          if (typeMatch && countMatch) {
            const agentType = typeMatch[1];
            const count = parseInt(countMatch[1]);
            hitsByType.set(agentType, (hitsByType.get(agentType) || 0) + count);
          }
        } else if (line.startsWith('cfn_agent_cache_misses_total')) {
          const typeMatch = line.match(/agent_type="([^"]+)"/);
          const countMatch = line.match(/(\d+)$/);
          if (typeMatch && countMatch) {
            const agentType = typeMatch[1];
            const count = parseInt(countMatch[1]);
            missesByType.set(agentType, (missesByType.get(agentType) || 0) + count);
          }
        }
      }

      // Calculate hit rates
      const allTypes = new Set([...hitsByType.keys(), ...missesByType.keys()]);
      for (const agentType of allTypes) {
        const hits = hitsByType.get(agentType) || 0;
        const misses = missesByType.get(agentType) || 0;
        const total = hits + misses;
        const hitRate = total > 0 ? hits / total : 0;
        hitRates.set(agentType, hitRate);
      }

      return hitRates;
    } catch (err) {
      console.error('Error getting hit rate by agent type:', err);
      return hitRates;
    }
  }
}

// Singleton instance
let resultCacheInstance: ResultCache | null = null;

/**
 * Initialize singleton result cache
 */
export function initResultCache(config: CacheConfig): ResultCache {
  if (!resultCacheInstance) {
    resultCacheInstance = new ResultCache(config);
    console.log('Result cache initialized');
  }

  return resultCacheInstance;
}

/**
 * Get singleton result cache instance
 */
export function getResultCache(): ResultCache {
  if (!resultCacheInstance) {
    throw new Error(
      'Result cache not initialized. Call initResultCache first.'
    );
  }
  return resultCacheInstance;
}

/**
 * Clear and reset singleton result cache
 */
export async function resetResultCache(): Promise<void> {
  if (resultCacheInstance) {
    await resultCacheInstance.clear();
    resultCacheInstance = null;
  }
}
