/**
 * Advanced Memory Management and Garbage Collection Optimization
 * Provides intelligent memory pooling, garbage collection optimization, and leak detection
 */

export class MemoryManager {
  constructor(config = {}) {
    this.config = {
      monitoring: {
        intervalMs: 1000, // 1 second monitoring
        historySize: 300, // 5 minutes of history
        gcThreshold: 0.8, // Trigger GC at 80% heap usage
        leakThreshold: 50, // MB growth considered potential leak
      },
      pooling: {
        enabled: true,
        maxPoolSize: 1000,
        initialPoolSize: 100,
        cleanupIntervalMs: 30000, // 30 seconds
      },
      optimization: {
        enableForceGC: true,
        gcIntervalMs: 60000, // 1 minute
        compressionEnabled: true,
        lazyLoading: true,
      },
      ...config
    };

    this.objectPools = new Map();
    this.memoryHistory = [];
    this.gcStats = {
      collections: 0,
      totalDuration: 0,
      lastCollection: null,
      forcedCollections: 0
    };
    this.leakDetection = {
      active: true,
      suspiciousGrowth: [],
      trackedObjects: new WeakMap(),
      objectCounts: new Map()
    };

    this.monitoringActive = false;
    this.lastMemoryUsage = null;
    this.baselineMemory = null;

    // Initialize memory monitoring
    this.initializeMonitoring();
  }

  /**
   * Initialize memory monitoring and baseline
   */
  async initializeMonitoring() {
    console.log('🧠 Initializing Memory Management System...');

    // Set baseline memory usage
    this.baselineMemory = process.memoryUsage();
    this.lastMemoryUsage = this.baselineMemory;

    // Start memory monitoring
    this.startMemoryMonitoring();

    // Initialize object pools
    if (this.config.pooling.enabled) {
      this.initializeObjectPools();
    }

    // Setup garbage collection optimization
    this.setupGCOptimization();

    console.log('✅ Memory Management System initialized');
    console.log(`📊 Baseline memory: ${(this.baselineMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

    return this.baselineMemory;
  }

  /**
   * Start continuous memory monitoring
   */
  startMemoryMonitoring() {
    if (this.monitoringActive) return;

    this.monitoringActive = true;

    this.monitoringInterval = setInterval(() => {
      this.collectMemoryMetrics();
    }, this.config.monitoring.intervalMs);

    console.log(`📊 Memory monitoring started (${this.config.monitoring.intervalMs}ms interval)`);
  }

  /**
   * Collect and analyze memory metrics
   */
  collectMemoryMetrics() {
    const currentUsage = process.memoryUsage();
    const timestamp = Date.now();

    // Calculate memory growth
    const memoryGrowth = {
      rss: currentUsage.rss - this.lastMemoryUsage.rss,
      heapUsed: currentUsage.heapUsed - this.lastMemoryUsage.heapUsed,
      heapTotal: currentUsage.heapTotal - this.lastMemoryUsage.heapTotal,
      external: currentUsage.external - this.lastMemoryUsage.external
    };

    // Normalize to MB
    const normalizedUsage = {
      timestamp,
      rss: (currentUsage.rss / 1024 / 1024).toFixed(2),
      heapUsed: (currentUsage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotal: (currentUsage.heapTotal / 1024 / 1024).toFixed(2),
      external: (currentUsage.external / 1024 / 1024).toFixed(2),
      growth: {
        rss: (memoryGrowth.rss / 1024 / 1024).toFixed(2),
        heapUsed: (memoryGrowth.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (memoryGrowth.heapTotal / 1024 / 1024).toFixed(2)
      },
      heapUtilization: ((currentUsage.heapUsed / currentUsage.heapTotal) * 100).toFixed(1)
    };

    // Store in history
    this.memoryHistory.push(normalizedUsage);
    if (this.memoryHistory.length > this.config.monitoring.historySize) {
      this.memoryHistory.shift();
    }

    // Check for memory issues
    this.checkMemoryIssues(normalizedUsage);

    // Update last usage
    this.lastMemoryUsage = currentUsage;

    return normalizedUsage;
  }

  /**
   * Check for memory issues and take action
   */
  checkMemoryIssues(metrics) {
    const heapUtilization = parseFloat(metrics.heapUtilization);
    const heapGrowth = parseFloat(metrics.growth.heapUsed);

    // High heap utilization - trigger optimization
    if (heapUtilization > this.config.monitoring.gcThreshold * 100) {
      console.log(`⚠️ High heap utilization: ${heapUtilization}%`);
      this.optimizeMemoryUsage();
    }

    // Potential memory leak detection
    if (heapGrowth > this.config.monitoring.leakThreshold) {
      this.detectPotentialLeak(metrics);
    }

    // External memory growth
    if (parseFloat(metrics.growth.external) > 10) {
      console.log(`⚠️ High external memory growth: ${metrics.growth.external}MB`);
    }
  }

  /**
   * Initialize object pools for memory efficiency
   */
  initializeObjectPools() {
    // Common object types to pool
    const poolTypes = [
      'buffer',
      'array',
      'object',
      'string',
      'task'
    ];

    poolTypes.forEach(type => {
      this.objectPools.set(type, {
        available: [],
        inUse: new Set(),
        created: 0,
        reused: 0,
        maxSize: this.config.pooling.maxPoolSize
      });

      // Pre-populate pools
      this.prepopulatePool(type, this.config.pooling.initialPoolSize);
    });

    console.log(`🏊 Initialized ${poolTypes.length} object pools`);

    // Start pool cleanup
    this.startPoolCleanup();
  }

  /**
   * Pre-populate object pool
   */
  prepopulatePool(type, count) {
    const pool = this.objectPools.get(type);

    for (let i = 0; i < count; i++) {
      const obj = this.createObject(type);
      pool.available.push(obj);
      pool.created++;
    }
  }

  /**
   * Create object of specific type for pooling
   */
  createObject(type) {
    switch (type) {
      case 'buffer':
        return Buffer.allocUnsafe(1024);
      case 'array':
        return new Array(100);
      case 'object':
        return {};
      case 'string':
        return '';
      case 'task':
        return {
          id: null,
          type: null,
          data: null,
          timestamp: null,
          priority: 'normal'
        };
      default:
        return null;
    }
  }

  /**
   * Get object from pool
   */
  getFromPool(type) {
    if (!this.objectPools.has(type)) {
      return this.createObject(type);
    }

    const pool = this.objectPools.get(type);
    let obj;

    if (pool.available.length > 0) {
      obj = pool.available.pop();
      pool.reused++;
    } else {
      obj = this.createObject(type);
      pool.created++;
    }

    pool.inUse.add(obj);
    return obj;
  }

  /**
   * Return object to pool
   */
  returnToPool(type, obj) {
    if (!this.objectPools.has(type)) {
      return; // Not a pooled object
    }

    const pool = this.objectPools.get(type);

    if (pool.inUse.has(obj)) {
      pool.inUse.delete(obj);

      // Reset object state
      this.resetObject(type, obj);

      // Return to pool if not at capacity
      if (pool.available.length < pool.maxSize) {
        pool.available.push(obj);
      }
    }
  }

  /**
   * Reset object to clean state
   */
  resetObject(type, obj) {
    switch (type) {
      case 'buffer':
        obj.fill(0);
        break;
      case 'array':
        obj.length = 0;
        break;
      case 'object':
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            delete obj[key];
          }
        }
        break;
      case 'string':
        // Strings are immutable, no reset needed
        break;
      case 'task':
        obj.id = null;
        obj.type = null;
        obj.data = null;
        obj.timestamp = null;
        obj.priority = 'normal';
        break;
    }
  }

  /**
   * Start pool cleanup process
   */
  startPoolCleanup() {
    setInterval(() => {
      this.cleanupPools();
    }, this.config.pooling.cleanupIntervalMs);
  }

  /**
   * Clean up object pools
   */
  cleanupPools() {
    for (const [type, pool] of this.objectPools) {
      // Remove excess objects from pool
      while (pool.available.length > pool.maxSize / 2) {
        pool.available.pop();
      }

      // Log pool statistics
      const efficiency = pool.reused > 0 ? (pool.reused / (pool.created + pool.reused)) * 100 : 0;
      if (efficiency < 50 && pool.created > 100) {
        console.log(`🏊 Pool ${type} efficiency: ${efficiency.toFixed(1)}% (${pool.reused}/${pool.created + pool.reused})`);
      }
    }
  }

  /**
   * Setup garbage collection optimization
   */
  setupGCOptimization() {
    if (global.gc && this.config.optimization.enableForceGC) {
      // Schedule periodic GC
      setInterval(() => {
        this.performOptimizedGC();
      }, this.config.optimization.gcIntervalMs);

      // Monitor GC events
      if (global.performance && global.performance.gc) {
        global.performance.gc = (() => {
          const originalGC = global.performance.gc;
          return (type) => {
            const start = Date.now();
            originalGC(type);
            const duration = Date.now() - start;
            this.recordGCMetrics(type, duration);
          };
        })();
      }
    }

    console.log('🗑️ GC optimization setup complete');
  }

  /**
   * Perform optimized garbage collection
   */
  performOptimizedGC() {
    if (!global.gc) return;

    const start = Date.now();
    const beforeGC = process.memoryUsage();

    try {
      // Force garbage collection
      global.gc();

      const afterGC = process.memoryUsage();
      const duration = Date.now() - start;
      const memoryFreed = (beforeGC.heapUsed - afterGC.heapUsed) / 1024 / 1024;

      this.gcStats.collections++;
      this.gcStats.forcedCollections++;
      this.gcStats.totalDuration += duration;
      this.gcStats.lastCollection = Date.now();

      console.log(`🗑️ GC completed in ${duration}ms, freed ${memoryFreed.toFixed(2)}MB`);

      // Record metrics
      this.recordGCMetrics('forced', duration, memoryFreed);

    } catch (error) {
      console.error('❌ Forced GC failed:', error.message);
    }
  }

  /**
   * Record garbage collection metrics
   */
  recordGCMetrics(type, duration, memoryFreed = 0) {
    // This would be integrated with performance monitoring
    const gcMetrics = {
      type,
      duration,
      memoryFreed,
      timestamp: Date.now()
    };

    // Store or emit metrics
    this.emit('gc', gcMetrics);
  }

  /**
   * Detect potential memory leaks
   */
  detectPotentialLeak(metrics) {
    if (!this.leakDetection.active) return;

    const growth = parseFloat(metrics.growth.heapUsed);
    const currentHeap = parseFloat(metrics.heapUsed);

    // Track suspicious growth patterns
    this.leakDetection.suspiciousGrowth.push({
      timestamp: metrics.timestamp,
      growth,
      heapSize: currentHeap
    });

    // Keep only recent growth data
    if (this.leakDetection.suspiciousGrowth.length > 10) {
      this.leakDetection.suspiciousGrowth.shift();
    }

    // Check for consistent growth pattern
    const recentGrowth = this.leakDetection.suspiciousGrowth.slice(-5);
    const avgGrowth = recentGrowth.reduce((sum, g) => sum + g.growth, 0) / recentGrowth.length;

    if (avgGrowth > this.config.monitoring.leakThreshold / 2) {
      console.log(`🚨 Potential memory leak detected: ${avgGrowth.toFixed(2)}MB avg growth`);
      this.analyzeMemoryLeaks();
    }
  }

  /**
   * Analyze potential memory leaks
   */
  analyzeMemoryLeaks() {
    console.log('🔍 Analyzing memory usage patterns...');

    // Get heap snapshot if available
    if (global.v8) {
      try {
        const snapshot = global.v8.getHeapSnapshot();
        console.log('📸 Heap snapshot created for analysis');
      } catch (error) {
        console.log('⚠️ Could not create heap snapshot');
      }
    }

    // Analyze object pools
    for (const [type, pool] of this.objectPools) {
      if (pool.inUse.size > pool.maxSize * 0.8) {
        console.log(`⚠️ High usage in ${type} pool: ${pool.inUse.size} objects in use`);
      }
    }

    // Check for large object accumulation
    const currentUsage = process.memoryUsage();
    const heapUtilization = (currentUsage.heapUsed / currentUsage.heapTotal) * 100;

    if (heapUtilization > 90) {
      console.log('🚨 Critical heap utilization detected');
      this.optimizeMemoryUsage();
    }
  }

  /**
   * Optimize memory usage
   */
  optimizeMemoryUsage() {
    console.log('🔧 Optimizing memory usage...');

    // Force garbage collection
    if (global.gc) {
      this.performOptimizedGC();
    }

    // Clean up object pools
    this.cleanupPools();

    // Clear old history
    if (this.memoryHistory.length > this.config.monitoring.historySize / 2) {
      this.memoryHistory = this.memoryHistory.slice(-Math.floor(this.config.monitoring.historySize / 2));
    }

    // Compress data if enabled
    if (this.config.optimization.compressionEnabled) {
      this.compressMemoryData();
    }

    console.log('✅ Memory optimization completed');
  }

  /**
   * Compress memory data structures
   */
  compressMemoryData() {
    // This would implement data compression strategies
    // For now, just清理 old data
    for (const pool of this.objectPools.values()) {
      // Remove old or unused objects
      pool.available = pool.available.slice(-Math.floor(pool.maxSize * 0.7));
    }
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    const currentUsage = process.memoryUsage();
    const baseline = this.baselineMemory;

    return {
      current: {
        rss: (currentUsage.rss / 1024 / 1024).toFixed(2),
        heapUsed: (currentUsage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (currentUsage.heapTotal / 1024 / 1024).toFixed(2),
        external: (currentUsage.external / 1024 / 1024).toFixed(2)
      },
      baseline: {
        rss: (baseline.rss / 1024 / 1024).toFixed(2),
        heapUsed: (baseline.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (baseline.heapTotal / 1024 / 1024).toFixed(2),
        external: (baseline.external / 1024 / 1024).toFixed(2)
      },
      growth: {
        rss: ((currentUsage.rss - baseline.rss) / 1024 / 1024).toFixed(2),
        heapUsed: ((currentUsage.heapUsed - baseline.heapUsed) / 1024 / 1024).toFixed(2),
        heapTotal: ((currentUsage.heapTotal - baseline.heapTotal) / 1024 / 1024).toFixed(2)
      },
      heapUtilization: ((currentUsage.heapUsed / currentUsage.heapTotal) * 100).toFixed(1),
      gc: this.gcStats,
      pools: this.getPoolStats(),
      leakDetection: {
        active: this.leakDetection.active,
        suspiciousGrowthCount: this.leakDetection.suspiciousGrowth.length
      }
    };
  }

  /**
   * Get object pool statistics
   */
  getPoolStats() {
    const stats = {};

    for (const [type, pool] of this.objectPools) {
      const efficiency = pool.reused > 0 ? (pool.reused / (pool.created + pool.reused)) * 100 : 0;

      stats[type] = {
        available: pool.available.length,
        inUse: pool.inUse.size,
        created: pool.created,
        reused: pool.reused,
        efficiency: efficiency.toFixed(1),
        utilization: ((pool.inUse.size / pool.maxSize) * 100).toFixed(1)
      };
    }

    return stats;
  }

  /**
   * Get memory history
   */
  getMemoryHistory(limit = 60) {
    return this.memoryHistory.slice(-limit);
  }

  /**
   * Reset memory statistics
   */
  resetStats() {
    this.memoryHistory = [];
    this.gcStats = {
      collections: 0,
      totalDuration: 0,
      lastCollection: null,
      forcedCollections: 0
    };
    this.leakDetection.suspiciousGrowth = [];
  }

  /**
   * Enable/disable memory monitoring
   */
  setMonitoringEnabled(enabled) {
    if (enabled && !this.monitoringActive) {
      this.startMemoryMonitoring();
    } else if (!enabled && this.monitoringActive) {
      clearInterval(this.monitoringInterval);
      this.monitoringActive = false;
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Memory Manager...');

    // Stop monitoring
    this.setMonitoringEnabled(false);

    // Clear object pools
    this.objectPools.clear();

    // Clear history
    this.memoryHistory = [];

    // Final GC
    if (global.gc) {
      global.gc();
    }

    console.log('✅ Memory Manager shutdown complete');
  }

  // EventEmitter-like functionality for simple cases
  emit(event, data) {
    // Simple event emission - in real implementation would use EventEmitter
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  on(event, callback) {
    if (!this.listeners) {
      this.listeners = {};
    }
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
}

// Export for use in other modules
export default MemoryManager;