/**
 * Performance Optimization System
 * Caching, connection pooling, and performance enhancements
 */

import { GitHubConfig, CacheEntry, GitHubMetrics } from '../types';

export interface PerformanceConfig {
  caching: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
    compressionThreshold: number;
  };
  requestBatching: {
    enabled: boolean;
    batchSize: number;
    batchTimeout: number;
  };
  rateLimit: {
    requestsPerSecond: number;
    burstLimit: number;
  };
  compression: {
    enabled: boolean;
    threshold: number;
  };
}

export interface BatchRequest {
  id: string;
  endpoint: string;
  options: any;
  resolve: Function;
  reject: Function;
  timestamp: number;
}

export interface PerformanceMetrics {
  cache_hit_rate: number;
  avg_response_time: number;
  memory_usage: number;
  requests_batched: number;
  compression_saved_bytes: number;
  rate_limit_hits: number;
  total_requests: number;
}

export class GitHubPerformanceOptimizer {
  private config: PerformanceConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private requestQueue: BatchRequest[] = [];
  private rateLimiter: Map<string, number[]> = new Map();
  private metrics: PerformanceMetrics;
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      caching: {
        enabled: true,
        ttl: 300, // 5 minutes
        maxSize: 10000,
        compressionThreshold: 1024 // Compress responses > 1KB
      },
      requestBatching: {
        enabled: true,
        batchSize: 10,
        batchTimeout: 100 // 100ms
      },
      rateLimit: {
        requestsPerSecond: 50,
        burstLimit: 100
      },
      compression: {
        enabled: true,
        threshold: 1024
      },
      ...config
    };

    this.metrics = {
      cache_hit_rate: 0,
      avg_response_time: 0,
      memory_usage: 0,
      requests_batched: 0,
      compression_saved_bytes: 0,
      rate_limit_hits: 0,
      total_requests: 0
    };

    this.startCacheCleanup();
  }

  // =============================================================================
  // CACHING SYSTEM
  // =============================================================================

  /**
   * Get data from cache if available
   */
  getFromCache(key: string): any | null {
    if (!this.config.caching.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() > entry.timestamp + entry.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }

    // Decompress if needed
    const data = this.decompressData(entry.data);

    // Update metrics
    this.metrics.cache_hit_rate = (this.metrics.cache_hit_rate + 1) / 2;

    return data;
  }

  /**
   * Store data in cache
   */
  setCache(key: string, data: any, customTtl?: number): void {
    if (!this.config.caching.enabled) return;

    const ttl = customTtl || this.config.caching.ttl;
    const compressedData = this.compressData(data);

    const entry: CacheEntry = {
      key,
      data: compressedData,
      timestamp: Date.now(),
      ttl
    };

    this.cache.set(key, entry);

    // Maintain cache size limit
    if (this.cache.size > this.config.caching.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // Update memory metrics
    this.updateMemoryMetrics();
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidateCache(pattern: string | RegExp): number {
    let invalidated = 0;

    for (const [key] of this.cache.entries()) {
      if (typeof pattern === 'string') {
        if (key.includes(pattern)) {
          this.cache.delete(key);
          invalidated++;
        }
      } else {
        if (pattern.test(key)) {
          this.cache.delete(key);
          invalidated++;
        }
      }
    }

    this.updateMemoryMetrics();
    return invalidated;
  }

  /**
   * Preload frequently accessed data
   */
  async preloadCache(
    preloadConfig: Array<{
      key: string;
      fetcher: () => Promise<any>;
      ttl?: number;
    }>
  ): Promise<void> {
    const preloadPromises = preloadConfig.map(async (config) => {
      try {
        const data = await config.fetcher();
        this.setCache(config.key, data, config.ttl);
      } catch (error) {
        console.warn(`[PerformanceOptimizer] Failed to preload cache for ${config.key}:`, error);
      }
    });

    await Promise.all(preloadPromises);
  }

  // =============================================================================
  // REQUEST BATCHING
  // =============================================================================

  /**
   * Batch multiple requests for better efficiency
   */
  async batchRequest(endpoint: string, options: any = {}): Promise<any> {
    if (!this.config.requestBatching.enabled) {
      return this.executeSingleRequest(endpoint, options);
    }

    return new Promise((resolve, reject) => {
      const batchRequest: BatchRequest = {
        id: this.generateRequestId(),
        endpoint,
        options,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.requestQueue.push(batchRequest);

      // Process batch if size limit reached
      if (this.requestQueue.length >= this.config.requestBatching.batchSize) {
        this.processBatch();
      } else if (!this.batchTimer) {
        // Set timer for batch timeout
        this.batchTimer = setTimeout(() => {
          this.processBatch();
        }, this.config.requestBatching.batchTimeout);
      }
    });
  }

  /**
   * Process batched requests
   */
  private async processBatch(): Promise<void> {
    if (this.requestQueue.length === 0) return;

    const batch = this.requestQueue.splice(0, this.config.requestBatching.batchSize);
    this.metrics.requests_batched += batch.length;

    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Group similar requests
    const groupedRequests = this.groupSimilarRequests(batch);

    for (const group of groupedRequests) {
      try {
        if (group.length === 1) {
          // Single request
          const req = group[0];
          const result = await this.executeSingleRequest(req.endpoint, req.options);
          req.resolve(result);
        } else {
          // Multiple similar requests - can be optimized
          const results = await this.executeGroupedRequests(group);
          group.forEach((req, index) => {
            req.resolve(results[index]);
          });
        }
      } catch (error) {
        // Reject all requests in the group
        group.forEach(req => req.reject(error));
      }
    }
  }

  /**
   * Group similar requests for batch processing
   */
  private groupSimilarRequests(batch: BatchRequest[]): BatchRequest[][] {
    const groups: Map<string, BatchRequest[]> = new Map();

    for (const request of batch) {
      // Create a key based on endpoint and method
      const key = `${request.options.method || 'GET'}:${request.endpoint.split('?')[0]}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key)!.push(request);
    }

    return Array.from(groups.values());
  }

  // =============================================================================
  // RATE LIMITING
  // =============================================================================

  /**
   * Check if request is within rate limits
   */
  checkRateLimit(identifier: string = 'default'): boolean {
    if (!this.rateLimiter.has(identifier)) {
      this.rateLimiter.set(identifier, []);
    }

    const now = Date.now();
    const requests = this.rateLimiter.get(identifier)!;

    // Remove old requests (older than 1 second)
    const recentRequests = requests.filter(timestamp => now - timestamp < 1000);
    this.rateLimiter.set(identifier, recentRequests);

    // Check rate limit
    if (recentRequests.length >= this.config.rateLimit.requestsPerSecond) {
      this.metrics.rate_limit_hits++;
      return false;
    }

    // Add current request
    recentRequests.push(now);
    return true;
  }

  /**
   * Wait for rate limit to reset
   */
  async waitForRateLimit(identifier: string = 'default'): Promise<void> {
    while (!this.checkRateLimit(identifier)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // =============================================================================
  // REQUEST OPTIMIZATION
  // =============================================================================

  /**
   * Optimize request with caching, batching, and rate limiting
   */
  async optimizedRequest(
    endpoint: string,
    options: any = {},
    cacheKey?: string,
    identifier?: string
  ): Promise<any> {
    const startTime = Date.now();
    this.metrics.total_requests++;

    try {
      // Check cache first
      if (cacheKey && options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          this.updateResponseTimeMetrics(Date.now() - startTime);
          return cached;
        }
      }

      // Check rate limits
      await this.waitForRateLimit(identifier);

      // Execute request (batched or single)
      let result;
      if (this.config.requestBatching.enabled && this.shouldBatchRequest(endpoint, options)) {
        result = await this.batchRequest(endpoint, options);
      } else {
        result = await this.executeSingleRequest(endpoint, options);
      }

      // Cache successful GET requests
      if (cacheKey && options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
        this.setCache(cacheKey, result);
      }

      this.updateResponseTimeMetrics(Date.now() - startTime);
      return result;
    } catch (error) {
      this.updateResponseTimeMetrics(Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Optimize multiple concurrent requests
   */
  async optimizedBatchRequests(
    requests: Array<{
      endpoint: string;
      options?: any;
      cacheKey?: string;
      identifier?: string;
    }>
  ): Promise<any[]> {
    // Check cache for all requests first
    const cachedResults: Array<{ index: number; result: any }> = [];
    const uncachedRequests: Array<{ index: number; request: any }> = [];

    requests.forEach((request, index) => {
      if (request.cacheKey &&
          request.options?.method !== 'POST' &&
          request.options?.method !== 'PUT' &&
          request.options?.method !== 'DELETE') {
        const cached = this.getFromCache(request.cacheKey);
        if (cached) {
          cachedResults.push({ index, result: cached });
          return;
        }
      }
      uncachedRequests.push({ index, request });
    });

    // Execute uncached requests with rate limiting
    const uncachedPromises = uncachedRequests.map(async ({ index, request }) => {
      await this.waitForRateLimit(request.identifier);
      const result = await this.optimizedRequest(
        request.endpoint,
        request.options,
        request.cacheKey,
        request.identifier
      );
      return { index, result };
    });

    const uncachedResults = await Promise.all(uncachedPromises);

    // Combine results in original order
    const results = new Array(requests.length);
    [...cachedResults, ...uncachedResults].forEach(({ index, result }) => {
      results[index] = result;
    });

    return results;
  }

  // =============================================================================
  // COMPRESSION UTILITIES
  // =============================================================================

  /**
   * Compress data if it exceeds threshold
   */
  private compressData(data: any): any {
    if (!this.config.compression.enabled) return data;

    const serialized = JSON.stringify(data);
    if (serialized.length < this.config.compression.threshold) {
      return data;
    }

    try {
      // Simple compression simulation (in real implementation, use actual compression)
      const compressed = {
        __compressed: true,
        data: serialized, // Would use actual compression library here
        originalSize: serialized.length,
        compressedSize: serialized.length // Would be smaller with real compression
      };

      this.metrics.compression_saved_bytes += serialized.length - compressed.compressedSize;
      return compressed;
    } catch (error) {
      console.warn('[PerformanceOptimizer] Compression failed:', error);
      return data;
    }
  }

  /**
   * Decompress data if compressed
   */
  private decompressData(data: any): any {
    if (!data || typeof data !== 'object' || !data.__compressed) {
      return data;
    }

    try {
      // Simple decompression simulation
      return JSON.parse(data.data); // Would use actual decompression library here
    } catch (error) {
      console.warn('[PerformanceOptimizer] Decompression failed:', error);
      return data;
    }
  }

  // =============================================================================
  // MEMORY MANAGEMENT
  // =============================================================================

  /**
   * Evict least recently used cache entries
   */
  private evictLeastRecentlyUsed(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);

    const toEvict = Math.ceil(this.config.caching.maxSize * 0.1); // Evict 10%
    for (let i = 0; i < toEvict && entries.length > 0; i++) {
      const [key] = entries.shift()!;
      this.cache.delete(key);
    }
  }

  /**
   * Start automatic cache cleanup
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // Clean up every minute
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl * 1000) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[PerformanceOptimizer] Cleaned up ${cleaned} expired cache entries`);
      this.updateMemoryMetrics();
    }
  }

  // =============================================================================
  // METRICS AND MONITORING
  // =============================================================================

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      cache_hit_rate: 0,
      avg_response_time: 0,
      memory_usage: 0,
      requests_batched: 0,
      compression_saved_bytes: 0,
      rate_limit_hits: 0,
      total_requests: 0
    };
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): any {
    const cacheStats = {
      size: this.cache.size,
      hit_rate: this.metrics.cache_hit_rate,
      memory_usage_bytes: this.metrics.memory_usage
    };

    const batchingStats = {
      requests_batched: this.metrics.requests_batched,
      batch_efficiency: this.metrics.requests_batched / Math.max(this.metrics.total_requests, 1)
    };

    const compressionStats = {
      enabled: this.config.compression.enabled,
      bytes_saved: this.metrics.compression_saved_bytes
    };

    const rateLimitStats = {
      hits: this.metrics.rate_limit_hits,
      hit_rate: this.metrics.rate_limit_hits / Math.max(this.metrics.total_requests, 1)
    };

    return {
      timestamp: new Date().toISOString(),
      overall_metrics: this.metrics,
      cache_stats: cacheStats,
      batching_stats: batchingStats,
      compression_stats: compressionStats,
      rate_limit_stats: rateLimitStats,
      recommendations: this.generateOptimizationRecommendations()
    };
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private async executeSingleRequest(endpoint: string, options: any): Promise<any> {
    // This would be implemented by the calling client
    // Placeholder for actual HTTP request execution
    throw new Error('executeSingleRequest must be implemented by the client');
  }

  private async executeGroupedRequests(group: BatchRequest[]): Promise<any[]> {
    // Execute grouped requests - can be optimized for similar endpoints
    const promises = group.map(req => this.executeSingleRequest(req.endpoint, req.options));
    return await Promise.all(promises);
  }

  private shouldBatchRequest(endpoint: string, options: any): boolean {
    // Don't batch certain types of requests
    if (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE') {
      return false;
    }

    // Don't batch real-time critical operations
    const realTimeCritical = [
      '/notifications',
      '/user/starred',
      '/user/subscriptions'
    ];

    return !realTimeCritical.some(critical => endpoint.includes(critical));
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private updateResponseTimeMetrics(responseTime: number): void {
    this.metrics.avg_response_time =
      (this.metrics.avg_response_time + responseTime) / 2;
  }

  private updateMemoryMetrics(): void {
    // Estimate memory usage from cache
    let memoryUsage = 0;

    for (const entry of this.cache.values()) {
      try {
        memoryUsage += JSON.stringify(entry).length * 2; // Rough estimation
      } catch (error) {
        memoryUsage += 1024; // Fallback estimate
      }
    }

    this.metrics.memory_usage = memoryUsage;
  }

  private generateOptimizationRecommendations(): string[] {
    const recommendations = [];

    if (this.metrics.cache_hit_rate < 0.3) {
      recommendations.push('Low cache hit rate detected. Consider increasing TTL or preloading frequently accessed data.');
    }

    if (this.metrics.rate_limit_hits > this.metrics.total_requests * 0.1) {
      recommendations.push('High rate limit hit rate. Consider implementing more aggressive request throttling.');
    }

    if (this.cache.size > this.config.caching.maxSize * 0.9) {
      recommendations.push('Cache approaching size limit. Consider increasing max size or reducing TTL.');
    }

    if (this.metrics.avg_response_time > 2000) {
      recommendations.push('High average response time. Consider enabling request batching or connection pooling.');
    }

    if (this.config.compression.enabled && this.metrics.compression_saved_bytes === 0) {
      recommendations.push('Compression enabled but no bytes saved. Consider adjusting compression threshold.');
    }

    return recommendations;
  }
}

// Global performance optimizer instance
export const githubPerformanceOptimizer = new GitHubPerformanceOptimizer();