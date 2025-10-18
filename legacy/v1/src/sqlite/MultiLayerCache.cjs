/**
 * MultiLayerCache - Three-tier caching system for SQLite memory
 * Phase 2 Fleet Manager Features & Advanced Capabilities
 *
 * Layers:
 * L1: In-memory cache (hot data) - Ultra-fast, limited capacity
 * L2: Redis cache (warm data) - Fast, distributed, larger capacity
 * L3: SQLite persistence (cold data) - Permanent, unlimited capacity
 *
 * Features:
 * - Automatic promotion/demotion between layers
 * - TTL-based expiration per layer
 * - Access frequency tracking
 * - Cache coherence across distributed agents
 */

const LRU = require('lru-cache');
const EventEmitter = require('events');

class MultiLayerCache extends EventEmitter {
  constructor(options = {}) {
    super();

    // L1: In-memory cache configuration
    this.l1Cache = new LRU({
      max: options.l1MaxSize || 1000,
      maxSize: options.l1MaxBytes || 50 * 1024 * 1024, // 50MB
      sizeCalculation: (value) => {
        return JSON.stringify(value).length;
      },
      ttl: options.l1TTL || 300000, // 5 minutes
      updateAgeOnGet: true,
      updateAgeOnHas: false
    });

    // L2: Redis cache (optional)
    this.redisClient = options.redisClient || null;
    this.l2TTL = options.l2TTL || 1800000; // 30 minutes
    this.l2Prefix = options.l2Prefix || 'cache:l2:';

    // L3: SQLite database
    this.db = options.db || null;
    this.l3TTL = options.l3TTL || 86400000; // 24 hours

    // Cache coherence settings
    this.enableCoherence = options.enableCoherence !== false;
    this.coherenceChannel = options.coherenceChannel || 'cache:invalidation';

    // Promotion/demotion thresholds
    this.promotionThreshold = options.promotionThreshold || 5; // Access count
    this.demotionThreshold = options.demotionThreshold || 100; // Time in ms

    // Metrics
    this.metrics = {
      l1: { hits: 0, misses: 0, writes: 0, evictions: 0, size: 0 },
      l2: { hits: 0, misses: 0, writes: 0, evictions: 0, size: 0 },
      l3: { hits: 0, misses: 0, writes: 0, evictions: 0, size: 0 },
      promotions: { l3ToL2: 0, l2ToL1: 0 },
      demotions: { l1ToL2: 0, l2ToL3: 0 },
      totalOperations: 0,
      errors: 0
    };

    // Access tracking for intelligent promotion
    this.accessTracker = new Map(); // key -> { count, lastAccess, layer }
    this.accessTrackerMaxSize = options.accessTrackerMaxSize || 10000;

    // Set up L1 eviction listener
    this._setupL1Eviction();

    // Set up Redis coherence if enabled
    if (this.enableCoherence && this.redisClient) {
      this._setupCacheCoherence();
    }
  }

  /**
   * Get value from cache (check all layers)
   */
  async get(key, options = {}) {
    const startTime = Date.now();
    this.metrics.totalOperations++;

    try {
      // Track access
      this._trackAccess(key);

      // L1: Check in-memory cache first
      const l1Value = this.l1Cache.get(key);
      if (l1Value !== undefined) {
        this.metrics.l1.hits++;
        this._updateAccessTracker(key, 'l1');
        this.emit('cacheHit', { key, layer: 'l1', latency: Date.now() - startTime });
        return l1Value;
      }
      this.metrics.l1.misses++;

      // L2: Check Redis cache
      if (this.redisClient) {
        const l2Value = await this._getFromL2(key);
        if (l2Value !== null) {
          this.metrics.l2.hits++;

          // Promote to L1
          await this._promoteToL1(key, l2Value);

          this._updateAccessTracker(key, 'l2');
          this.emit('cacheHit', { key, layer: 'l2', latency: Date.now() - startTime });
          return l2Value;
        }
        this.metrics.l2.misses++;
      }

      // L3: Check SQLite
      if (this.db) {
        const l3Value = await this._getFromL3(key, options);
        if (l3Value !== null) {
          this.metrics.l3.hits++;

          // Promote to L2 and L1 based on access frequency
          const accessInfo = this.accessTracker.get(key);
          if (accessInfo && accessInfo.count >= this.promotionThreshold) {
            await this._promoteToL2(key, l3Value);
            await this._promoteToL1(key, l3Value);
          } else {
            await this._promoteToL2(key, l3Value);
          }

          this._updateAccessTracker(key, 'l3');
          this.emit('cacheHit', { key, layer: 'l3', latency: Date.now() - startTime });
          return l3Value;
        }
        this.metrics.l3.misses++;
      }

      // Cache miss on all layers
      this.emit('cacheMiss', { key, latency: Date.now() - startTime });
      return null;

    } catch (error) {
      console.error('Cache get error:', error);
      this.metrics.errors++;
      this.emit('error', { operation: 'get', key, error });
      return null;
    }
  }

  /**
   * Set value in cache (write to all layers)
   */
  async set(key, value, options = {}) {
    const startTime = Date.now();
    this.metrics.totalOperations++;

    try {
      const ttl = options.ttl || this.l3TTL;
      const writeThrough = options.writeThrough !== false;

      // L1: Write to in-memory cache
      this.l1Cache.set(key, value, { ttl: Math.min(ttl, this.l1TTL) });
      this.metrics.l1.writes++;
      this._updateMetricsSize('l1');

      // L2: Write to Redis
      if (this.redisClient && writeThrough) {
        await this._setToL2(key, value, Math.min(ttl, this.l2TTL));
        this.metrics.l2.writes++;
      }

      // L3: Write to SQLite
      if (this.db && writeThrough) {
        await this._setToL3(key, value, ttl, options);
        this.metrics.l3.writes++;
      }

      // Track access
      this._trackAccess(key);
      this._updateAccessTracker(key, 'l1');

      // Invalidate cache on other nodes
      if (this.enableCoherence && this.redisClient) {
        await this._broadcastInvalidation(key);
      }

      this.emit('cacheSet', { key, layer: 'all', latency: Date.now() - startTime });
      return true;

    } catch (error) {
      console.error('Cache set error:', error);
      this.metrics.errors++;
      this.emit('error', { operation: 'set', key, error });
      return false;
    }
  }

  /**
   * Delete value from cache (all layers)
   */
  async delete(key) {
    this.metrics.totalOperations++;

    try {
      // L1: Delete from memory
      this.l1Cache.delete(key);

      // L2: Delete from Redis
      if (this.redisClient) {
        await this.redisClient.del(this.l2Prefix + key);
      }

      // L3: Delete from SQLite
      if (this.db) {
        await this._deleteFromL3(key);
      }

      // Remove from access tracker
      this.accessTracker.delete(key);

      // Invalidate cache on other nodes
      if (this.enableCoherence && this.redisClient) {
        await this._broadcastInvalidation(key);
      }

      this.emit('cacheDelete', { key });
      return true;

    } catch (error) {
      console.error('Cache delete error:', error);
      this.metrics.errors++;
      this.emit('error', { operation: 'delete', key, error });
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key) {
    // Check L1
    if (this.l1Cache.has(key)) {
      return true;
    }

    // Check L2
    if (this.redisClient) {
      const exists = await this.redisClient.exists(this.l2Prefix + key);
      if (exists) return true;
    }

    // Check L3
    if (this.db) {
      const value = await this._getFromL3(key);
      return value !== null;
    }

    return false;
  }

  /**
   * Clear cache (all layers or specific layer)
   */
  async clear(layer = 'all') {
    try {
      if (layer === 'all' || layer === 'l1') {
        this.l1Cache.clear();
        this.metrics.l1.size = 0;
      }

      if (layer === 'all' || layer === 'l2') {
        if (this.redisClient) {
          const keys = await this.redisClient.keys(this.l2Prefix + '*');
          if (keys.length > 0) {
            await this.redisClient.del(...keys);
          }
        }
      }

      if (layer === 'all' || layer === 'l3') {
        if (this.db) {
          await this._clearL3();
        }
      }

      if (layer === 'all') {
        this.accessTracker.clear();
      }

      this.emit('cacheCleared', { layer });
      return true;

    } catch (error) {
      console.error('Cache clear error:', error);
      this.metrics.errors++;
      this.emit('error', { operation: 'clear', layer, error });
      return false;
    }
  }

  /**
   * Get from L2 (Redis) cache
   */
  async _getFromL2(key) {
    try {
      const value = await this.redisClient.get(this.l2Prefix + key);
      if (value) {
        return JSON.parse(value);
      }
      return null;
    } catch (error) {
      console.error('L2 get error:', error);
      return null;
    }
  }

  /**
   * Set to L2 (Redis) cache
   */
  async _setToL2(key, value, ttl) {
    try {
      await this.redisClient.set(
        this.l2Prefix + key,
        JSON.stringify(value),
        'PX',
        ttl
      );
      return true;
    } catch (error) {
      console.error('L2 set error:', error);
      return false;
    }
  }

  /**
   * Get from L3 (SQLite) cache
   */
  async _getFromL3(key, options = {}) {
    return new Promise((resolve) => {
      const sql = `
        SELECT value, type FROM memory
        WHERE key = ? AND namespace = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `;

      const namespace = options.namespace || 'cache';

      this.db.get(sql, [key, namespace], (err, row) => {
        if (err || !row) {
          resolve(null);
          return;
        }

        try {
          let value = row.value;
          if (row.type === 'data') {
            value = JSON.parse(value);
          }
          resolve(value);
        } catch (error) {
          console.error('L3 parse error:', error);
          resolve(null);
        }
      });
    });
  }

  /**
   * Set to L3 (SQLite) cache
   */
  async _setToL3(key, value, ttl, options = {}) {
    return new Promise((resolve, reject) => {
      const namespace = options.namespace || 'cache';
      const type = options.type || 'data';
      const swarmId = options.swarmId || 'default';
      const aclLevel = options.aclLevel || 3;

      const processedValue = typeof value === 'object' ? JSON.stringify(value) : value;
      const expiresAt = ttl > 0 ?
        new Date(Date.now() + ttl).toISOString() : null;

      const sql = `
        INSERT OR REPLACE INTO memory (
          id, key, value, namespace, type, swarm_id, acl_level,
          ttl_seconds, expires_at, size_bytes, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const memoryId = `cache:${namespace}:${key}`;
      const sizeBytes = Buffer.byteLength(processedValue, 'utf8');
      const ttlSeconds = Math.floor(ttl / 1000);

      this.db.run(sql, [
        memoryId, key, processedValue, namespace, type, swarmId,
        aclLevel, ttlSeconds, expiresAt, sizeBytes
      ], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Delete from L3 (SQLite) cache
   */
  async _deleteFromL3(key) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM memory WHERE key = ? AND namespace = 'cache'`;

      this.db.run(sql, [key], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Clear L3 (SQLite) cache
   */
  async _clearL3() {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM memory WHERE namespace = 'cache'`;

      this.db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Promote value to L1
   */
  async _promoteToL1(key, value) {
    this.l1Cache.set(key, value, { ttl: this.l1TTL });
    this.metrics.promotions.l2ToL1++;
    this._updateMetricsSize('l1');
    this.emit('promotion', { key, from: 'l2', to: 'l1' });
  }

  /**
   * Promote value to L2
   */
  async _promoteToL2(key, value) {
    if (this.redisClient) {
      await this._setToL2(key, value, this.l2TTL);
      this.metrics.promotions.l3ToL2++;
      this.emit('promotion', { key, from: 'l3', to: 'l2' });
    }
  }

  /**
   * Track access for promotion decisions
   */
  _trackAccess(key) {
    if (!this.accessTracker.has(key)) {
      // LRU cleanup if tracker is too large
      if (this.accessTracker.size >= this.accessTrackerMaxSize) {
        const firstKey = this.accessTracker.keys().next().value;
        this.accessTracker.delete(firstKey);
      }

      this.accessTracker.set(key, {
        count: 1,
        lastAccess: Date.now(),
        layer: null
      });
    } else {
      const info = this.accessTracker.get(key);
      info.count++;
      info.lastAccess = Date.now();
    }
  }

  /**
   * Update access tracker with layer information
   */
  _updateAccessTracker(key, layer) {
    const info = this.accessTracker.get(key);
    if (info) {
      info.layer = layer;
    }
  }

  /**
   * Setup L1 eviction listener
   */
  _setupL1Eviction() {
    this.l1Cache.on('evict', (key, value) => {
      this.metrics.l1.evictions++;
      this._updateMetricsSize('l1');

      // Demote to L2 if frequently accessed
      const accessInfo = this.accessTracker.get(key);
      if (accessInfo && accessInfo.count >= this.promotionThreshold) {
        if (this.redisClient) {
          this._setToL2(key, value, this.l2TTL).catch(err => {
            console.error('Failed to demote to L2:', err);
          });
          this.metrics.demotions.l1ToL2++;
          this.emit('demotion', { key, from: 'l1', to: 'l2' });
        }
      }
    });
  }

  /**
   * Setup cache coherence (invalidation broadcasts)
   */
  _setupCacheCoherence() {
    if (!this.redisClient.subscribe) {
      console.warn('Redis client does not support pub/sub for cache coherence');
      return;
    }

    // Subscribe to invalidation channel
    const subscriber = this.redisClient.duplicate();
    subscriber.subscribe(this.coherenceChannel);

    subscriber.on('message', (channel, message) => {
      if (channel === this.coherenceChannel) {
        try {
          const { key, nodeId } = JSON.parse(message);

          // Don't invalidate our own writes
          if (nodeId !== this.nodeId) {
            this.l1Cache.delete(key);
            this.emit('coherenceInvalidation', { key, nodeId });
          }
        } catch (error) {
          console.error('Coherence message parsing error:', error);
        }
      }
    });

    this.coherenceSubscriber = subscriber;
  }

  /**
   * Broadcast cache invalidation to other nodes
   */
  async _broadcastInvalidation(key) {
    try {
      await this.redisClient.publish(
        this.coherenceChannel,
        JSON.stringify({ key, nodeId: this.nodeId })
      );
    } catch (error) {
      console.error('Failed to broadcast invalidation:', error);
    }
  }

  /**
   * Update metrics size
   */
  _updateMetricsSize(layer) {
    if (layer === 'l1') {
      this.metrics.l1.size = this.l1Cache.size;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.metrics,
      l1: {
        ...this.metrics.l1,
        hitRate: this._calculateHitRate(this.metrics.l1),
        currentSize: this.l1Cache.size
      },
      l2: {
        ...this.metrics.l2,
        hitRate: this._calculateHitRate(this.metrics.l2)
      },
      l3: {
        ...this.metrics.l3,
        hitRate: this._calculateHitRate(this.metrics.l3)
      },
      overallHitRate: this._calculateOverallHitRate(),
      accessTrackerSize: this.accessTracker.size
    };
  }

  /**
   * Calculate hit rate for a layer
   */
  _calculateHitRate(layerMetrics) {
    const total = layerMetrics.hits + layerMetrics.misses;
    return total > 0 ? layerMetrics.hits / total : 0;
  }

  /**
   * Calculate overall hit rate
   */
  _calculateOverallHitRate() {
    const totalHits = this.metrics.l1.hits + this.metrics.l2.hits + this.metrics.l3.hits;
    const totalMisses = this.metrics.l3.misses; // Only L3 misses count as true misses
    const total = totalHits + totalMisses;
    return total > 0 ? totalHits / total : 0;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return this.getStats();
  }

  /**
   * Shutdown cache system
   */
  async shutdown() {
    console.log('🛑 Shutting down MultiLayerCache...');

    // Close coherence subscriber
    if (this.coherenceSubscriber) {
      await this.coherenceSubscriber.quit();
    }

    // Clear L1
    this.l1Cache.clear();

    // Clear access tracker
    this.accessTracker.clear();

    this.emit('shutdown');
    console.log('✅ MultiLayerCache shut down');
  }
}

module.exports = MultiLayerCache;
