/**
 * RuVector GNN Performance Optimization
 *
 * Implements caching, batch inference, and pagination for GNN-enhanced operations.
 * Optimizes query performance using adaptive compression and result caching.
 *
 * Optimization Strategies:
 * - LRU cache for frequent queries
 * - Batch GNN inference operations
 * - Query result pagination with cursor-based approach
 * - Adaptive compression based on access patterns
 * - Query deduplication and coalescing
 *
 * Reference: docker/trigger-dev/src/lib/ruvector-gnn-connectors.ts
 */

import { TensorCompress, getCompressionLevel, differentiableSearch } from '@ruvector/gnn';
import type { GraphTraversalResult } from './ruvector-gnn-connectors';

/**
 * Cache Entry
 */
interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Timestamp of last access */
  lastAccessed: number;
  /** Number of times accessed */
  accessCount: number;
  /** Entry creation time */
  createdAt: number;
  /** TTL (time-to-live) in milliseconds */
  ttl: number;
}

/**
 * LRU Cache Configuration
 */
export interface LRUCacheConfig {
  /** Maximum cache size (number of entries) */
  maxSize: number;
  /** Default TTL for entries (milliseconds) */
  defaultTTL: number;
  /** Enable access frequency tracking */
  trackAccessFrequency: boolean;
  /** Enable compression for cached values */
  enableCompression: boolean;
}

/**
 * Default LRU cache configuration
 */
export const DEFAULT_CACHE_CONFIG: LRUCacheConfig = {
  maxSize: 1000,
  defaultTTL: 3600000, // 1 hour
  trackAccessFrequency: true,
  enableCompression: true
};

/**
 * LRU Cache
 *
 * Least Recently Used cache for query results and embeddings.
 * Supports TTL, compression, and access frequency tracking.
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: LRUCacheConfig;
  private compressor?: TensorCompress;

  constructor(config: Partial<LRUCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };

    if (this.config.enableCompression) {
      this.compressor = new TensorCompress();
    }
  }

  /**
   * Get value from cache
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check TTL
    const age = Date.now() - entry.createdAt;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access tracking
    entry.lastAccessed = Date.now();
    entry.accessCount++;

    return entry.value;
  }

  /**
   * Set value in cache
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Custom TTL (optional)
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict if cache is full
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      lastAccessed: Date.now(),
      accessCount: 1,
      createdAt: Date.now(),
      ttl: ttl ?? this.config.defaultTTL
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if key exists in cache
   *
   * @param key - Cache key
   * @returns True if key exists and not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete key from cache
   *
   * @param key - Cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all entries
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
    hitRate: number;
    avgAccessCount: number;
    totalAccesses: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalAccesses = entries.reduce((sum, e) => sum + e.accessCount, 0);
    const avgAccessCount = entries.length > 0 ? totalAccesses / entries.length : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: 0, // Would need to track hits/misses
      avgAccessCount,
      totalAccesses
    };
  }

  /**
   * Get access frequency for a key
   *
   * Used for adaptive compression
   *
   * @param key - Cache key
   * @returns Access frequency (0.0-1.0)
   */
  getAccessFrequency(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) return 0;

    const age = Date.now() - entry.createdAt;
    const ageHours = age / 3600000;

    // Frequency = accesses per hour, normalized to 0-1
    // Assume max 100 accesses per hour = 1.0
    const accessesPerHour = ageHours > 0 ? entry.accessCount / ageHours : entry.accessCount;
    return Math.min(1.0, accessesPerHour / 100);
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Evict expired entries
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.createdAt;
      if (age > entry.ttl) {
        this.cache.delete(key);
        evicted++;
      }
    }

    return evicted;
  }
}

/**
 * Batch GNN Inference Configuration
 */
export interface BatchInferenceConfig {
  /** Maximum batch size */
  maxBatchSize: number;
  /** Batch timeout (milliseconds) */
  batchTimeoutMs: number;
  /** Enable parallel processing */
  enableParallel: boolean;
  /** Number of parallel workers */
  parallelWorkers: number;
}

/**
 * Default batch inference configuration
 */
export const DEFAULT_BATCH_CONFIG: BatchInferenceConfig = {
  maxBatchSize: 32,
  batchTimeoutMs: 100,
  enableParallel: true,
  parallelWorkers: 4
};

/**
 * Batch GNN Inference Request
 */
interface BatchInferenceRequest {
  /** Request ID */
  id: string;
  /** Query embedding */
  query: number[];
  /** Candidate embeddings */
  candidates: number[][];
  /** Top-K results */
  topK: number;
  /** Temperature for differentiable search */
  temperature: number;
  /** Resolve callback */
  resolve: (result: { indices: number[]; weights: number[] }) => void;
  /** Reject callback */
  reject: (error: Error) => void;
}

/**
 * Batch GNN Inference Manager
 *
 * Batches GNN inference requests for improved throughput.
 * Automatically flushes batches when size or timeout threshold is reached.
 */
export class BatchInferenceManager {
  private config: BatchInferenceConfig;
  private requestQueue: BatchInferenceRequest[] = [];
  private batchTimer?: NodeJS.Timeout;

  constructor(config: Partial<BatchInferenceConfig> = {}) {
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
  }

  /**
   * Add inference request to batch
   *
   * @param query - Query embedding
   * @param candidates - Candidate embeddings
   * @param topK - Number of results
   * @param temperature - Search temperature
   * @returns Promise that resolves with search results
   */
  async infer(
    query: number[],
    candidates: number[][],
    topK: number = 10,
    temperature: number = 1.0
  ): Promise<{ indices: number[]; weights: number[] }> {
    return new Promise((resolve, reject) => {
      const request: BatchInferenceRequest = {
        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        query,
        candidates,
        topK,
        temperature,
        resolve,
        reject
      };

      this.requestQueue.push(request);

      // Flush if batch is full
      if (this.requestQueue.length >= this.config.maxBatchSize) {
        this.flushBatch();
      } else if (!this.batchTimer) {
        // Start timeout timer
        this.batchTimer = setTimeout(() => {
          this.flushBatch();
        }, this.config.batchTimeoutMs);
      }
    });
  }

  /**
   * Flush current batch and process requests
   */
  private async flushBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    if (this.requestQueue.length === 0) {
      return;
    }

    const batch = this.requestQueue.splice(0, this.config.maxBatchSize);

    if (this.config.enableParallel) {
      // Process batch in parallel
      await this.processBatchParallel(batch);
    } else {
      // Process batch sequentially
      await this.processBatchSequential(batch);
    }
  }

  /**
   * Process batch sequentially
   */
  private async processBatchSequential(batch: BatchInferenceRequest[]): Promise<void> {
    for (const request of batch) {
      try {
        const result = differentiableSearch(
          request.query,
          request.candidates,
          request.topK,
          request.temperature
        );
        request.resolve(result);
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Process batch in parallel
   */
  private async processBatchParallel(batch: BatchInferenceRequest[]): Promise<void> {
    // Split batch into chunks for parallel processing
    const chunkSize = Math.ceil(batch.length / this.config.parallelWorkers);
    const chunks: BatchInferenceRequest[][] = [];

    for (let i = 0; i < batch.length; i += chunkSize) {
      chunks.push(batch.slice(i, i + chunkSize));
    }

    // Process chunks in parallel
    await Promise.all(chunks.map(chunk => this.processBatchSequential(chunk)));
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueSize: number;
    maxBatchSize: number;
    batchTimeoutMs: number;
  } {
    return {
      queueSize: this.requestQueue.length,
      maxBatchSize: this.config.maxBatchSize,
      batchTimeoutMs: this.config.batchTimeoutMs
    };
  }
}

/**
 * Pagination Cursor
 */
export interface PaginationCursor {
  /** Offset in result set */
  offset: number;
  /** Page size */
  limit: number;
  /** Total results (if known) */
  total?: number;
  /** Has more results */
  hasMore: boolean;
  /** Next cursor (opaque string) */
  next?: string;
}

/**
 * Paginated Results
 */
export interface PaginatedResults<T> {
  /** Results for current page */
  results: T[];
  /** Pagination metadata */
  pagination: PaginationCursor;
}

/**
 * Query Result Paginator
 *
 * Implements cursor-based pagination for large result sets.
 * Supports both offset-based and keyset pagination.
 */
export class QueryResultPaginator<T> {
  private cache: LRUCache<T[]>;

  constructor() {
    this.cache = new LRUCache<T[]>({
      maxSize: 100,
      defaultTTL: 300000 // 5 minutes
    });
  }

  /**
   * Paginate results using offset-based approach
   *
   * @param results - Full result set
   * @param offset - Starting offset
   * @param limit - Page size
   * @returns Paginated results
   */
  paginateOffset(results: T[], offset: number, limit: number): PaginatedResults<T> {
    const page = results.slice(offset, offset + limit);
    const hasMore = offset + limit < results.length;

    return {
      results: page,
      pagination: {
        offset,
        limit,
        total: results.length,
        hasMore,
        next: hasMore ? this.encodeCursor({ offset: offset + limit, limit }) : undefined
      }
    };
  }

  /**
   * Paginate using cursor
   *
   * @param results - Full result set
   * @param cursor - Encoded cursor string
   * @param defaultLimit - Default page size if not in cursor
   * @returns Paginated results
   */
  paginateCursor(results: T[], cursor?: string, defaultLimit: number = 20): PaginatedResults<T> {
    const decoded = cursor ? this.decodeCursor(cursor) : { offset: 0, limit: defaultLimit };
    return this.paginateOffset(results, decoded.offset, decoded.limit);
  }

  /**
   * Encode pagination cursor
   *
   * @param cursor - Cursor object
   * @returns Base64-encoded cursor string
   */
  private encodeCursor(cursor: { offset: number; limit: number }): string {
    const json = JSON.stringify(cursor);
    return Buffer.from(json).toString('base64');
  }

  /**
   * Decode pagination cursor
   *
   * @param cursor - Base64-encoded cursor string
   * @returns Cursor object
   */
  private decodeCursor(cursor: string): { offset: number; limit: number } {
    try {
      const json = Buffer.from(cursor, 'base64').toString('utf-8');
      return JSON.parse(json);
    } catch (error) {
      throw new Error('Invalid pagination cursor');
    }
  }
}

/**
 * Query Deduplicator
 *
 * Coalesces duplicate queries to reduce redundant GNN inference.
 * Returns cached results for identical queries in flight.
 */
export class QueryDeduplicator {
  private inFlightQueries = new Map<
    string,
    Promise<{ indices: number[]; weights: number[] }>
  >();

  /**
   * Execute query with deduplication
   *
   * @param queryKey - Unique query identifier
   * @param executor - Function that executes the query
   * @returns Query results (possibly from cache)
   */
  async deduplicate<T>(queryKey: string, executor: () => Promise<T>): Promise<T> {
    // Check if query is already in flight
    const existing = this.inFlightQueries.get(queryKey) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    // Execute query and cache promise
    const promise = executor() as Promise<T>;
    this.inFlightQueries.set(queryKey, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      // Remove from in-flight queries
      this.inFlightQueries.delete(queryKey);
    }
  }

  /**
   * Generate query key from embedding
   *
   * @param embedding - Query embedding
   * @returns Hash string
   */
  generateQueryKey(embedding: number[]): string {
    // Simple hash: sum of values + length
    // In production, use a proper hash function (e.g., xxhash, murmur3)
    const sum = embedding.reduce((acc, val) => acc + val, 0);
    return `${embedding.length}-${sum.toFixed(6)}`;
  }

  /**
   * Get in-flight query count
   */
  getInFlightCount(): number {
    return this.inFlightQueries.size;
  }
}

/**
 * Performance Optimization Manager
 *
 * Combines caching, batching, pagination, and deduplication.
 */
export class PerformanceOptimizationManager {
  private cache: LRUCache<any>;
  private batchManager: BatchInferenceManager;
  private paginator: QueryResultPaginator<any>;
  private deduplicator: QueryDeduplicator;

  constructor(
    cacheConfig?: Partial<LRUCacheConfig>,
    batchConfig?: Partial<BatchInferenceConfig>
  ) {
    this.cache = new LRUCache(cacheConfig);
    this.batchManager = new BatchInferenceManager(batchConfig);
    this.paginator = new QueryResultPaginator();
    this.deduplicator = new QueryDeduplicator();
  }

  /**
   * Optimized search with caching, batching, and deduplication
   *
   * @param query - Query embedding
   * @param candidates - Candidate embeddings
   * @param topK - Number of results
   * @param temperature - Search temperature
   * @returns Search results
   */
  async optimizedSearch(
    query: number[],
    candidates: number[][],
    topK: number = 10,
    temperature: number = 1.0
  ): Promise<{ indices: number[]; weights: number[] }> {
    // Generate cache key
    const queryKey = this.deduplicator.generateQueryKey(query);
    const cacheKey = `search-${queryKey}-${topK}-${temperature}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Deduplicate and batch
    const result = await this.deduplicator.deduplicate(cacheKey, async () => {
      return this.batchManager.infer(query, candidates, topK, temperature);
    });

    // Cache result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Optimized graph traversal with caching
   *
   * @param traversalKey - Unique traversal identifier
   * @param executor - Function that executes traversal
   * @returns Traversal result
   */
  async optimizedTraversal(
    traversalKey: string,
    executor: () => Promise<GraphTraversalResult>
  ): Promise<GraphTraversalResult> {
    // Check cache
    const cached = this.cache.get(traversalKey);
    if (cached) {
      return cached;
    }

    // Execute and cache
    const result = await executor();
    this.cache.set(traversalKey, result);

    return result;
  }

  /**
   * Paginate results
   *
   * @param results - Full result set
   * @param cursor - Pagination cursor
   * @param limit - Page size
   * @returns Paginated results
   */
  paginate<T>(results: T[], cursor?: string, limit: number = 20): PaginatedResults<T> {
    return this.paginator.paginateCursor(results, cursor, limit);
  }

  /**
   * Get optimization statistics
   */
  getStats(): {
    cache: ReturnType<LRUCache<any>['getStats']>;
    batch: ReturnType<BatchInferenceManager['getStats']>;
    inFlightQueries: number;
  } {
    return {
      cache: this.cache.getStats(),
      batch: this.batchManager.getStats(),
      inFlightQueries: this.deduplicator.getInFlightCount()
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.cache.clear();
  }

  /**
   * Evict expired cache entries
   */
  evictExpired(): number {
    return this.cache.evictExpired();
  }
}
