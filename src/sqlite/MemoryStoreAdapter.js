/**
 * MemoryStoreAdapter - Bridge between MemoryStore interface and SQLite backend
 * Phase 1 Foundation Infrastructure & Event Bus Architecture
 *
 * This adapter provides compatibility with the existing MemoryStore interface
 * while leveraging the SQLite-based SwarmMemoryManager for persistence and ACL.
 */

const SwarmMemoryManager = require('./SwarmMemoryManager');
const EventEmitter = require('events');
const crypto = require('crypto');

class MemoryStoreAdapter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.swarmId = options.swarmId || 'default';
    this.namespace = options.namespace || 'memory-store';
    this.defaultTTL = options.defaultTTL || 86400; // 24 hours

    // Initialize SwarmMemoryManager
    this.memoryManager = new SwarmMemoryManager({
      dbPath: options.dbPath,
      encryptionKey: options.encryptionKey,
      compressionThreshold: options.compressionThreshold || 1024,
      defaultTTL: this.defaultTTL,
      aclCacheTimeout: options.aclCacheTimeout || 300000
    });

    // Forward events from memory manager
    this.memoryManager.on('error', (error) => this.emit('error', error));
    this.memoryManager.on('initialized', () => this.emit('initialized'));
    this.memoryManager.on('closed', () => this.emit('closed'));
    this.memoryManager.on('get', (data) => this.emit('get', data));
    this.memoryManager.on('set', (data) => this.emit('set', data));
    this.memoryManager.on('accessDenied', (data) => this.emit('accessDenied', data));

    // Adapter-specific metrics
    this.metrics = {
      operations: 0,
      getOperations: 0,
      setOperations: 0,
      deleteOperations: 0,
      clearOperations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      totalAccessTime: 0,
      averageAccessTime: 0
    };

    this.isInitialized = false;
  }

  /**
   * Initialize the adapter and underlying memory manager
   */
  async initialize() {
    if (this.isInitialized) {
      return this;
    }

    try {
      await this.memoryManager.initialize();
      this.isInitialized = true;
      this.emit('adapterInitialized');
      return this;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get a value from memory store
   */
  async get(key, options = {}) {
    const startTime = Date.now();
    this.metrics.getOperations++;
    this.metrics.operations++;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const value = await this.memoryManager.get(key, {
        agentId: options.agentId || 'system',
        namespace: this.namespace,
        swarmId: this.swarmId
      });

      const accessTime = Date.now() - startTime;
      this.updateMetrics(accessTime);

      if (value !== null) {
        this.metrics.cacheHits++;
      } else {
        this.metrics.cacheMisses++;
      }

      return value;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set a value in memory store
   */
  async set(key, value, options = {}) {
    const startTime = Date.now();
    this.metrics.setOperations++;
    this.metrics.operations++;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const ttl = options.ttl || this.defaultTTL;
      const aclLevel = options.aclLevel || this._deriveACLLevel(key, value);

      const result = await this.memoryManager.set(key, value, {
        agentId: options.agentId || 'system',
        namespace: this.namespace,
        swarmId: this.swarmId,
        teamId: options.teamId,
        type: options.type || 'data',
        aclLevel,
        ttl
      });

      const accessTime = Date.now() - startTime;
      this.updateMetrics(accessTime);

      this.emit('setItem', { key, value, options });
      return result;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Delete a value from memory store
   */
  async delete(key, options = {}) {
    const startTime = Date.now();
    this.metrics.deleteOperations++;
    this.metrics.operations++;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const result = await this.memoryManager.delete(key, {
        agentId: options.agentId || 'system',
        namespace: this.namespace
      });

      const accessTime = Date.now() - startTime;
      this.updateMetrics(accessTime);

      if (result) {
        this.emit('deleteItem', { key });
      }

      return result;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check if a key exists in memory store
   */
  async has(key, options = {}) {
    const startTime = Date.now();
    this.metrics.operations++;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const result = await this.memoryManager.has(key, {
        agentId: options.agentId || 'system',
        namespace: this.namespace
      });

      const accessTime = Date.now() - startTime;
      this.updateMetrics(accessTime);

      return result;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Clear memory store (namespace or all)
   */
  async clear(options = {}) {
    const startTime = Date.now();
    this.metrics.clearOperations++;
    this.metrics.operations++;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const result = await this.memoryManager.clear({
        agentId: options.agentId || 'system',
        namespace: options.clearAll ? undefined : this.namespace
      });

      const accessTime = Date.now() - startTime;
      this.updateMetrics(accessTime);

      this.emit('clear', { namespace: options.clearAll ? 'all' : this.namespace });
      return result;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get multiple values
   */
  async mget(keys, options = {}) {
    const startTime = Date.now();
    this.metrics.operations++;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const promises = keys.map(key =>
        this.get(key, options).catch(() => null)
      );

      const results = await Promise.all(promises);

      const accessTime = Date.now() - startTime;
      this.updateMetrics(accessTime);

      return results;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set multiple values
   */
  async mset(keyValuePairs, options = {}) {
    const startTime = Date.now();
    this.metrics.operations++;

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const promises = Object.entries(keyValuePairs).map(([key, value]) =>
        this.set(key, value, options)
      );

      const results = await Promise.all(promises);

      const accessTime = Date.now() - startTime;
      this.updateMetrics(accessTime);

      return results;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get all keys in namespace
   */
  async keys(options = {}) {
    return new Promise(async (resolve, reject) => {
      const startTime = Date.now();
      this.metrics.operations++;

      try {
        if (!this.isInitialized) {
          await this.initialize();
        }

        const sql = `
          SELECT key FROM memory
          WHERE namespace = ?
          AND (expires_at IS NULL OR expires_at > datetime('now'))
          ORDER BY created_at DESC
        `;

        this.memoryManager.db.all(sql, [this.namespace], (err, rows) => {
          const accessTime = Date.now() - startTime;
          this.updateMetrics(accessTime);

          if (err) {
            this.metrics.errors++;
            reject(err);
          } else {
            const keys = rows.map(row => row.key);
            resolve(keys);
          }
        });
      } catch (error) {
        this.metrics.errors++;
        reject(error);
      }
    });
  }

  /**
   * Get memory store statistics
   */
  async getStats() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const memoryStats = await this.memoryManager.getStats();
      const performanceMetrics = this.memoryManager.getMetrics();

      return {
        ...memoryStats,
        adapter: {
          ...this.metrics,
          hitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
          namespace: this.namespace,
          swarmId: this.swarmId
        },
        performance: performanceMetrics
      };
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set memory with TTL
   */
  async setex(key, ttl, value, options = {}) {
    return this.set(key, value, { ...options, ttl });
  }

  /**
   * Get and delete a value
   */
  async getdel(key, options = {}) {
    const value = await this.get(key, options);
    if (value !== null) {
      await this.delete(key, options);
    }
    return value;
  }

  /**
   * Get and set a value (atomic operation)
   */
  async getset(key, value, options = {}) {
    const oldValue = await this.get(key, options);
    await this.set(key, value, options);
    return oldValue;
  }

  /**
   * Increment a numeric value
   */
  async incr(key, options = {}) {
    const current = await this.get(key, options) || 0;
    const newValue = parseInt(current, 10) + 1;
    await this.set(key, newValue, options);
    return newValue;
  }

  /**
   * Increment a numeric value by amount
   */
  async incrby(key, increment, options = {}) {
    const current = await this.get(key, options) || 0;
    const newValue = parseInt(current, 10) + parseInt(increment, 10);
    await this.set(key, newValue, options);
    return newValue;
  }

  /**
   * Decrement a numeric value
   */
  async decr(key, options = {}) {
    const current = await this.get(key, options) || 0;
    const newValue = parseInt(current, 10) - 1;
    await this.set(key, newValue, options);
    return newValue;
  }

  /**
   * Decrement a numeric value by amount
   */
  async decrby(key, decrement, options = {}) {
    const current = await this.get(key, options) || 0;
    const newValue = parseInt(current, 10) - parseInt(decrement, 10);
    await this.set(key, newValue, options);
    return newValue;
  }

  /**
   * Append to a string value
   */
  async append(key, value, options = {}) {
    const current = await this.get(key, options) || '';
    const newValue = current.toString() + value.toString();
    await this.set(key, newValue, options);
    return newValue.length;
  }

  /**
   * Get string length
   */
  async strlen(key, options = {}) {
    const value = await this.get(key, options);
    return value ? value.toString().length : 0;
  }

  /**
   * Create a backup of the memory store
   */
  async backup(backupPath) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fullPath = `${backupPath}/memory-store-backup-${this.namespace}-${timestamp}.db`;

      await this.memoryManager.backup(fullPath);

      this.emit('backup', { path: fullPath, namespace: this.namespace });
      return fullPath;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Optimize memory store performance
   */
  async optimize() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      await this.memoryManager.vacuum();
      await this.memoryManager.analyze();
      this.memoryManager.clearACLCache();

      this.emit('optimized');
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Derive ACL level from key and value
   */
  _deriveACLLevel(key, value) {
    // Privacy rules based on key patterns
    if (key.includes('private') || key.includes('secret') || key.includes('credential')) {
      return 1; // private
    }

    if (key.includes('team') || key.includes('group')) {
      return 2; // team
    }

    if (key.includes('system') || key.includes('config')) {
      return 5; // system
    }

    if (key.includes('public') || key.includes('shared')) {
      return 4; // public
    }

    // Default to swarm level
    return 3; // swarm
  }

  /**
   * Update adapter metrics
   */
  updateMetrics(accessTime) {
    this.metrics.totalAccessTime += accessTime;
    this.metrics.averageAccessTime = this.metrics.totalAccessTime / this.metrics.operations;
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      operations: 0,
      getOperations: 0,
      setOperations: 0,
      deleteOperations: 0,
      clearOperations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      totalAccessTime: 0,
      averageAccessTime: 0
    };
  }

  /**
   * Close the adapter and underlying memory manager
   */
  async close() {
    try {
      if (this.memoryManager) {
        await this.memoryManager.close();
      }
      this.isInitialized = false;
      this.emit('adapterClosed');
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get memory manager instance for advanced operations
   */
  getMemoryManager() {
    return this.memoryManager;
  }
}

module.exports = MemoryStoreAdapter;