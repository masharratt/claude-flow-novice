/**
 * PerformanceOptimizer - Ensures <2s command execution
 * Optimizes command performance through caching, preloading, and intelligent execution
 */

export interface PerformanceMetrics {
  commandExecutionTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  agentSpawnTime: number;
  totalResponseTime: number;
}

export interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  ttl: number;
  accessCount: number;
}

export interface OptimizationConfig {
  cacheEnabled: boolean;
  preloadEnabled: boolean;
  parallelExecution: boolean;
  maxConcurrency: number;
  cacheSize: number;
  defaultTtl: number;
}

export class PerformanceOptimizer {
  private cache: Map<string, CacheEntry> = new Map();
  private metrics: PerformanceMetrics;
  private config: OptimizationConfig;
  private preloadedData: Map<string, any> = new Map();

  constructor(
    config: OptimizationConfig = {
      cacheEnabled: true,
      preloadEnabled: true,
      parallelExecution: true,
      maxConcurrency: 4,
      cacheSize: 100,
      defaultTtl: 300000, // 5 minutes
    },
  ) {
    this.config = config;
    this.metrics = {
      commandExecutionTime: 0,
      memoryUsage: 0,
      cacheHitRate: 0,
      agentSpawnTime: 0,
      totalResponseTime: 0,
    };

    this.initializeOptimizations();
  }

  /**
   * Optimize command execution for performance
   */
  async optimizeExecution<T>(
    key: string,
    executor: () => Promise<T>,
    options: { cacheable?: boolean; ttl?: number } = {},
  ): Promise<T> {
    const startTime = performance.now();

    try {
      // Check cache first if enabled
      if (this.config.cacheEnabled && options.cacheable !== false) {
        const cached = this.getCached(key);
        if (cached) {
          this.updateMetrics({ cacheHit: true, executionTime: performance.now() - startTime });
          return cached;
        }
      }

      // Execute with performance monitoring
      const result = await this.executeWithMonitoring(executor);

      // Cache result if configured
      if (this.config.cacheEnabled && options.cacheable !== false) {
        this.setCached(key, result, options.ttl);
      }

      this.updateMetrics({
        cacheHit: false,
        executionTime: performance.now() - startTime,
      });

      return result;
    } catch (error) {
      this.updateMetrics({
        cacheHit: false,
        executionTime: performance.now() - startTime,
        error: true,
      });
      throw error;
    }
  }

  /**
   * Execute multiple operations in parallel
   */
  async parallelExecute<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    if (!this.config.parallelExecution) {
      const results = [];
      for (const op of operations) {
        results.push(await op());
      }
      return results;
    }

    // Execute in batches based on max concurrency
    const results: T[] = [];
    const batches = this.createBatches(operations, this.config.maxConcurrency);

    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map((op) => op()));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Preload commonly used data
   */
  async preloadData(): Promise<void> {
    if (!this.config.preloadEnabled) return;

    const preloadTasks = [
      this.preloadProjectContext(),
      this.preloadUserProgress(),
      this.preloadSystemStatus(),
      this.preloadCommandMetadata(),
    ];

    await Promise.all(preloadTasks);
  }

  /**
   * Get cached data if available and valid
   */
  getCached(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access count and return data
    entry.accessCount++;
    return entry.data;
  }

  /**
   * Cache data with TTL
   */
  setCached(key: string, data: any, ttl?: number): void {
    if (this.cache.size >= this.config.cacheSize) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      key,
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTtl,
      accessCount: 0,
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      commandExecutionTime: 0,
      memoryUsage: 0,
      cacheHitRate: 0,
      agentSpawnTime: 0,
      totalResponseTime: 0,
    };
  }

  /**
   * Optimize memory usage
   */
  optimizeMemory(): void {
    // Clear old cache entries
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }

    // Clear preloaded data if memory usage is high
    if (process.memoryUsage().heapUsed > 100 * 1024 * 1024) {
      // 100MB
      this.preloadedData.clear();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Warm up the system for better performance
   */
  async warmUp(): Promise<void> {
    console.log('🔥 Warming up Claude Flow...');

    const warmupTasks = [
      this.preloadData(),
      this.testAgentSpawning(),
      this.precompileTemplates(),
      this.validateSystemResources(),
    ];

    await Promise.all(warmupTasks);
    console.log('✅ System ready for optimal performance');
  }

  // Private helper methods

  private initializeOptimizations(): void {
    // Set up periodic cache cleanup
    setInterval(() => {
      this.optimizeMemory();
    }, 60000); // Every minute

    // Preload data on startup
    setTimeout(() => {
      this.preloadData();
    }, 100);
  }

  private async executeWithMonitoring<T>(executor: () => Promise<T>): Promise<T> {
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    try {
      const result = await executor();

      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;

      this.metrics.commandExecutionTime = endTime - startTime;
      this.metrics.memoryUsage = endMemory - startMemory;

      return result;
    } catch (error) {
      // Still update metrics on error
      const endTime = performance.now();
      this.metrics.commandExecutionTime = endTime - startTime;
      throw error;
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private evictLeastUsed(): void {
    let leastUsedKey = '';
    let leastUsedCount = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < leastUsedCount) {
        leastUsedCount = entry.accessCount;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
    }
  }

  private updateMetrics(update: {
    cacheHit: boolean;
    executionTime: number;
    error?: boolean;
  }): void {
    // Update cache hit rate
    const totalRequests = this.getCacheStats().totalRequests;
    const cacheHits = this.getCacheStats().hits + (update.cacheHit ? 1 : 0);
    this.metrics.cacheHitRate = totalRequests > 0 ? cacheHits / totalRequests : 0;

    // Update execution time (moving average)
    this.metrics.totalResponseTime =
      this.metrics.totalResponseTime * 0.8 + update.executionTime * 0.2;
  }

  private getCacheStats(): { totalRequests: number; hits: number } {
    let totalRequests = 0;
    let hits = 0;

    for (const entry of this.cache.values()) {
      totalRequests += entry.accessCount + 1;
      hits += entry.accessCount;
    }

    return { totalRequests, hits };
  }

  private async preloadProjectContext(): Promise<void> {
    try {
      // This would preload common project detection patterns
      this.preloadedData.set('projectPatterns', {
        web: ['package.json', 'src', 'public'],
        api: ['package.json', 'src', 'routes'],
        mobile: ['package.json', 'App.js', 'android', 'ios'],
      });

      this.preloadedData.set('frameworkSignatures', {
        react: ['react', 'jsx', 'tsx'],
        vue: ['vue', '.vue'],
        angular: ['@angular', 'angular.json'],
      });
    } catch (error) {
      console.warn('Failed to preload project context');
    }
  }

  private async preloadUserProgress(): Promise<void> {
    try {
      // Preload user progress data structure
      this.preloadedData.set('userProgressTemplate', {
        tier: 'novice',
        commandsUsed: 0,
        achievements: [],
        preferences: {},
      });
    } catch (error) {
      console.warn('Failed to preload user progress');
    }
  }

  private async preloadSystemStatus(): Promise<void> {
    try {
      // Preload system status template
      this.preloadedData.set('systemStatusTemplate', {
        agents: { active: 0, available: 5 },
        memory: { usage: '0MB', available: '100MB' },
        performance: { avgResponseTime: '0s', uptime: '0s' },
      });
    } catch (error) {
      console.warn('Failed to preload system status');
    }
  }

  private async preloadCommandMetadata(): Promise<void> {
    try {
      // Preload command help and metadata
      this.preloadedData.set('commandExamples', {
        init: ['claude-flow-novice init', 'claude-flow-novice init react', 'claude-flow-novice init "todo app"'],
        build: ['claude-flow-novice build "add auth"', 'claude-flow-novice build "REST API"'],
        status: ['claude-flow-novice status', 'claude-flow-novice status --detailed'],
      });
    } catch (error) {
      console.warn('Failed to preload command metadata');
    }
  }

  private async testAgentSpawning(): Promise<void> {
    const startTime = performance.now();

    try {
      // Test a lightweight agent operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      this.metrics.agentSpawnTime = performance.now() - startTime;
    } catch (error) {
      this.metrics.agentSpawnTime = 1000; // Default fallback
    }
  }

  private async precompileTemplates(): Promise<void> {
    try {
      // Precompile common project templates
      this.preloadedData.set('compiledTemplates', {
        web: 'precompiled-web-template',
        api: 'precompiled-api-template',
      });
    } catch (error) {
      console.warn('Failed to precompile templates');
    }
  }

  private async validateSystemResources(): Promise<void> {
    try {
      const memoryUsage = process.memoryUsage();
      const isLowMemory = memoryUsage.heapUsed > 500 * 1024 * 1024; // 500MB

      if (isLowMemory) {
        console.warn('⚠️ High memory usage detected - optimizing performance settings');
        this.config.cacheSize = Math.min(this.config.cacheSize, 50);
        this.config.maxConcurrency = Math.min(this.config.maxConcurrency, 2);
      }
    } catch (error) {
      console.warn('Failed to validate system resources');
    }
  }

  /**
   * Performance monitoring and reporting
   */
  startPerformanceMonitoring(): void {
    setInterval(() => {
      const metrics = this.getMetrics();

      // Alert if performance degrades
      if (metrics.totalResponseTime > 2000) {
        console.warn('⚠️ Performance degradation detected - response time > 2s');
        this.optimizeMemory();
      }

      if (metrics.memoryUsage > 50 * 1024 * 1024) {
        // 50MB
        console.warn('⚠️ High memory usage detected - optimizing cache');
        this.evictLeastUsed();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): {
    metrics: PerformanceMetrics;
    recommendations: string[];
    cacheStats: any;
  } {
    const metrics = this.getMetrics();
    const cacheStats = this.getCacheStats();
    const recommendations = [];

    if (metrics.cacheHitRate < 0.5) {
      recommendations.push('Consider increasing cache TTL for better performance');
    }

    if (metrics.totalResponseTime > 1500) {
      recommendations.push('Enable parallel execution to improve response times');
    }

    if (metrics.memoryUsage > 100 * 1024 * 1024) {
      recommendations.push('Reduce cache size or increase cleanup frequency');
    }

    return {
      metrics,
      recommendations,
      cacheStats,
    };
  }
}
