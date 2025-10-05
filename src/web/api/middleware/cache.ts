/**
 * Cache Middleware
 *
 * Response caching middleware for the transparency API server
 *
 * @module web/api/middleware/cache
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Cache entry interface
 */
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  etag?: string;
}

/**
 * Cache middleware factory
 */
export function cacheMiddleware(
  cache: Map<string, CacheEntry>,
  defaultTtl: number = 5000 // 5 seconds
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = generateCacheKey(req);

    // Check if we have a valid cached response
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      // Add cache headers
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Age', Math.floor((Date.now() - cached.timestamp) / 1000));

      if (cached.etag) {
        res.setHeader('ETag', cached.etag);
      }

      return res.json(cached.data);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json;
    res.json = function(data: any) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const ttl = getCacheTtl(req, defaultTtl);
        const etag = generateETag(data);

        // Cache the response
        cache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          ttl,
          etag
        });

        // Add cache headers
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-TTL', Math.floor(ttl / 1000));
        res.setHeader('Cache-Control', `public, max-age=${Math.floor(ttl / 1000)}`);

        if (etag) {
          res.setHeader('ETag', etag);
        }
      }

      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Generate cache key from request
 */
function generateCacheKey(req: Request): string {
  const url = new URL(req.originalUrl, `http://${req.headers.host}`);

  // Include query parameters in cache key
  const queryParams = new URLSearchParams(url.search);
  queryParams.sort(); // Sort for consistent keys

  const queryString = queryParams.toString();
  const path = url.pathname;

  // Include user ID if authenticated (for user-specific caching)
  const userId = (req as any).user?.id || 'anonymous';

  return `${req.method}:${path}:${queryString}:${userId}`;
}

/**
 * Get cache TTL based on request characteristics
 */
function getCacheTtl(req: Request, defaultTtl: number): number {
  // Different TTLs for different endpoints
  const path = req.path;

  if (path.includes('/metrics')) {
    return 10000; // 10 seconds for metrics
  }

  if (path.includes('/status')) {
    return 2000; // 2 seconds for status
  }

  if (path.includes('/events')) {
    return 5000; // 5 seconds for events
  }

  if (path.includes('/hierarchy')) {
    return 30000; // 30 seconds for hierarchy (changes less frequently)
  }

  if (path.includes('/analytics')) {
    return 60000; // 1 minute for analytics
  }

  return defaultTtl;
}

/**
 * Generate ETag for response data
 */
function generateETag(data: any): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5');
  hash.update(JSON.stringify(data));
  return `"${hash.digest('hex')}"`;
}

/**
 * Conditional request middleware (ETag support)
 */
export function conditionalRequest() {
  return (req: Request, res: Response, next: NextFunction) => {
    const ifNoneMatch = req.get('If-None-Match');

    // This will be checked in the cache middleware
    if (ifNoneMatch) {
      (req as any).ifNoneMatch = ifNoneMatch;
    }

    next();
  };
}

/**
 * Cache invalidation middleware
 */
export function invalidateCache(cache: Map<string, CacheEntry>) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Invalidate cache for POST, PUT, DELETE, PATCH requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const pattern = getInvalidationPattern(req);

      // Remove matching cache entries
      for (const key of cache.keys()) {
        if (key.includes(pattern)) {
          cache.delete(key);
        }
      }
    }

    next();
  };
}

/**
 * Get cache invalidation pattern for request
 */
function getInvalidationPattern(req: Request): string {
  const path = req.path;

  if (path.includes('/agents')) {
    return '/agents';
  }

  if (path.includes('/status')) {
    return '/status';
  }

  if (path.includes('/events')) {
    return '/events';
  }

  if (path.includes('/metrics')) {
    return '/metrics';
  }

  if (path.includes('/hierarchy')) {
    return '/hierarchy';
  }

  return path;
}

/**
 * Cache warming middleware
 */
export function warmCache(
  cache: Map<string, CacheEntry>,
  warmupFn: () => Promise<void>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run cache warmup on first request
    if (cache.size === 0 && req.path === '/health') {
      try {
        await warmupFn();
      } catch (error) {
        console.error('Cache warmup failed:', error);
      }
    }

    next();
  };
}

/**
 * Memory-based cache store
 */
export class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(maxSize: number = 1000, cleanupIntervalMs: number = 60000) {
    this.maxSize = maxSize;

    // Clean up expired entries periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  /**
   * Get cache entry
   */
  get(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);

    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry;
    }

    if (entry) {
      this.cache.delete(key);
    }

    return undefined;
  }

  /**
   * Set cache entry
   */
  set(key: string, data: any, ttl: number = 5000): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Delete cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    entries: Array<{
      key: string;
      age: number;
      ttl: number;
      size: number;
    }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: Date.now() - entry.timestamp,
      ttl: entry.ttl,
      size: JSON.stringify(entry.data).length
    }));

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Destroy cache store
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}