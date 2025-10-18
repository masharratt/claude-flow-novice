/**
 * Mock Swarm Memory Manager
 *
 * Provides mock implementation of SwarmMemoryManager for testing
 * CFN Loop memory persistence and coordination.
 *
 * @module mocks/memory-manager-mock
 */

import { EventEmitter } from 'events';

export class MockSwarmMemoryManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      namespace: 'test-memory',
      redis: null,
      sqlite: null,
      ...config
    };
    
    this.memory = new Map();
    this.namespaces = new Map();
  }

  async store(key, value, options = {}) {
    const namespace = options.namespace || this.config.namespace;
    const fullKey = `${namespace}:${key}`;
    const entry = {
      key,
      value,
      namespace,
      metadata: options.metadata || {},
      timestamp: Date.now(),
      ttl: options.ttl
    };
    
    this.memory.set(fullKey, entry);
    
    if (!this.namespaces.has(namespace)) {
      this.namespaces.set(namespace, new Set());
    }
    this.namespaces.get(namespace).add(fullKey);
    
    this.emit('store', { key, value, namespace, options });
    
    return entry;
  }

  async retrieve(key, options = {}) {
    const namespace = options.namespace || this.config.namespace;
    const fullKey = `${namespace}:${key}`;
    const entry = this.memory.get(fullKey);
    
    if (!entry) {
      return null;
    }
    
    // Check TTL
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.memory.delete(fullKey);
      this.namespaces.get(namespace)?.delete(fullKey);
      return null;
    }
    
    this.emit('retrieve', { key, value: entry.value, namespace, options });
    
    return entry.value;
  }

  async search(pattern, options = {}) {
    const namespace = options.namespace || this.config.namespace;
    const results = [];
    
    for (const [fullKey, entry] of this.memory.entries()) {
      if (entry.namespace === namespace && fullKey.includes(pattern)) {
        results.push({
          key: entry.key,
          value: entry.value,
          metadata: entry.metadata,
          timestamp: entry.timestamp
        });
      }
    }
    
    this.emit('search', { pattern, results, namespace, options });
    
    return results;
  }

  async delete(key, options = {}) {
    const namespace = options.namespace || this.config.namespace;
    const fullKey = `${namespace}:${key}`;
    const entry = this.memory.get(fullKey);
    
    if (entry) {
      this.memory.delete(fullKey);
      this.namespaces.get(namespace)?.delete(fullKey);
      this.emit('delete', { key, namespace, options });
      return true;
    }
    
    return false;
  }

  async clearNamespace(namespace) {
    const keys = this.namespaces.get(namespace);
    if (keys) {
      for (const key of keys) {
        this.memory.delete(key);
      }
      this.namespaces.delete(namespace);
      this.emit('clearNamespace', { namespace });
    }
  }

  async getNamespaceKeys(namespace) {
    const keys = this.namespaces.get(namespace);
    return keys ? Array.from(keys).map(key => key.replace(`${namespace}:`, '')) : [];
  }

  async getStatistics() {
    const stats = {
      totalEntries: this.memory.size,
      namespaces: {},
      oldestEntry: null,
      newestEntry: null
    };
    
    let oldestTime = Date.now();
    let newestTime = 0;
    
    for (const [fullKey, entry] of this.memory.entries()) {
      const { namespace } = entry;
      
      if (!stats.namespaces[namespace]) {
        stats.namespaces[namespace] = 0;
      }
      stats.namespaces[namespace]++;
      
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        stats.oldestEntry = { key: entry.key, namespace, timestamp: entry.timestamp };
      }
      
      if (entry.timestamp > newestTime) {
        newestTime = entry.timestamp;
        stats.newestEntry = { key: entry.key, namespace, timestamp: entry.timestamp };
      }
    }
    
    return stats;
  }

  async close() {
    this.memory.clear();
    this.namespaces.clear();
    this.removeAllListeners();
  }
}

export default MockSwarmMemoryManager;