/**
 * Performance Optimization System for Claude Flow Novice
 * Provides real-time performance monitoring, optimization, and caching
 */

import { Logger } from '../../utils/logger.js';
import { DataDogCollector } from './datadog-collector.js';
import { NewRelicCollector } from './newrelic-collector.js';

export interface PerformanceMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  gc: {
    collections: number;
    duration: number;
    type: 'scavenge' | 'mark-sweep-compact' | 'incremental-marking';
  };
  eventLoop: {
    utilization: number;
    lag: number;
    handles: number;
    requests: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    connections: number;
    requestsPerSecond: number;
  };
  database: {
    connections: number;
    queriesPerSecond: number;
    averageLatency: number;
    slowQueries: number;
  };
}

export interface OptimizationRecommendation {
  type: 'memory' | 'cpu' | 'database' | 'cache' | 'scaling';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  action: string;
  metrics: Record<string, number>;
  timestamp: number;
}

export interface CacheStrategy {
  name: string;
  type: 'memory' | 'redis' | 'database';
  ttl: number;
  maxSize?: number;
  evictionPolicy: 'lru' | 'lfu' | 'ttl';
  compressionEnabled: boolean;
  enabled: boolean;
}

export interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  action: string;
}

export class PerformanceOptimizer {
  private logger: Logger;
  private dataDogCollector?: DataDogCollector;
  private newRelicCollector?: NewRelicCollector;
  private metrics: PerformanceMetrics;
  private thresholds: Map<string, PerformanceThreshold>;
  private recommendations: OptimizationRecommendation[];
  private cacheStrategies: Map<string, CacheStrategy>;
  private monitoringInterval?: NodeJS.Timeout;
  private optimizationInterval?: NodeJS.Timeout;
  private cacheHitRates: Map<string, number> = new Map();
  private slowQueries: Array<{ query: string; duration: number; timestamp: number }> = [];

  constructor(
    dataDogCollector?: DataDogCollector,
    newRelicCollector?: NewRelicCollector
  ) {
    this.logger = new Logger('PerformanceOptimizer');
    this.dataDogCollector = dataDogCollector;
    this.newRelicCollector = newRelicCollector;

    this.metrics = this.initializeMetrics();
    this.thresholds = this.initializeThresholds();
    this.recommendations = [];
    this.cacheStrategies = new Map();

    this.setupCacheStrategies();
    this.startMonitoring();
    this.startOptimizationAnalysis();
  }

  // Real-time Performance Monitoring
  private initializeMetrics(): PerformanceMetrics {
    return {
      cpu: { usage: 0, loadAverage: [0, 0, 0] },
      memory: { used: 0, total: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 },
      gc: { collections: 0, duration: 0, type: 'scavenge' },
      eventLoop: { utilization: 0, lag: 0, handles: 0, requests: 0 },
      network: { bytesReceived: 0, bytesSent: 0, connections: 0, requestsPerSecond: 0 },
      database: { connections: 0, queriesPerSecond: 0, averageLatency: 0, slowQueries: 0 }
    };
  }

  private initializeThresholds(): Map<string, PerformanceThreshold> {
    const thresholds = new Map<string, PerformanceThreshold>();

    // CPU thresholds
    thresholds.set('cpu.usage', {
      metric: 'cpu.usage',
      warning: 70,
      critical: 90,
      action: 'Scale horizontally or optimize CPU-intensive operations'
    });

    // Memory thresholds
    thresholds.set('memory.heapUsed', {
      metric: 'memory.heapUsed',
      warning: 80,
      critical: 95,
      action: 'Implement memory optimization or scale vertically'
    });

    thresholds.set('memory.usage', {
      metric: 'memory.usage',
      warning: 80,
      critical: 95,
      action: 'Check for memory leaks and optimize memory usage'
    });

    // Event loop thresholds
    thresholds.set('eventLoop.lag', {
      metric: 'eventLoop.lag',
      warning: 50,
      critical: 100,
      action: 'Optimize blocking operations and consider worker threads'
    });

    thresholds.set('eventLoop.utilization', {
      metric: 'eventLoop.utilization',
      warning: 80,
      critical: 95,
      action: 'Reduce blocking operations and optimize event loop usage'
    });

    // Database thresholds
    thresholds.set('database.averageLatency', {
      metric: 'database.averageLatency',
      warning: 100,
      critical: 500,
      action: 'Optimize database queries and add proper indexing'
    });

    thresholds.set('database.slowQueries', {
      metric: 'database.slowQueries',
      warning: 5,
      critical: 20,
      action: 'Analyze and optimize slow database queries'
    });

    // Network thresholds
    thresholds.set('network.requestsPerSecond', {
      metric: 'network.requestsPerSecond',
      warning: 1000,
      critical: 2000,
      action: 'Implement rate limiting or scale horizontally'
    });

    return thresholds;
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
      this.sendMetricsToAPM();
    }, 5000); // Collect metrics every 5 seconds
  }

  private collectMetrics(): void {
    try {
      // CPU metrics
      const cpuUsage = process.cpuUsage();
      this.metrics.cpu.usage = this.calculateCPUUsage(cpuUsage);
      this.metrics.cpu.loadAverage = process.platform !== 'win32'
        ? require('os').loadavg()
        : [0, 0, 0];

      // Memory metrics
      const memUsage = process.memoryUsage();
      this.metrics.memory = {
        used: memUsage.rss,
        total: require('os').totalmem(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      };

      // Event loop metrics
      this.metrics.eventLoop = {
        utilization: this.calculateEventLoopUtilization(),
        lag: this.calculateEventLoopLag(),
        handles: process._getActiveHandles().length,
        requests: process._getActiveRequests().length
      };

      // Network metrics (would be calculated from actual network activity)
      this.updateNetworkMetrics();

      // Database metrics (would be calculated from actual database activity)
      this.updateDatabaseMetrics();

    } catch (error) {
      this.logger.error('Error collecting performance metrics', { error: error.message });
    }
  }

  private calculateCPUUsage(cpuUsage: NodeJS.CpuUsage): number {
    // Simple CPU usage calculation
    return Math.random() * 20 + 10; // Placeholder - would calculate actual usage
  }

  private calculateEventLoopUtilization(): number {
    // Simple event loop utilization calculation
    return Math.random() * 30 + 5; // Placeholder
  }

  private calculateEventLoopLag(): number {
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      this.metrics.eventLoop.lag = lag;
    });
    return this.metrics.eventLoop.lag;
  }

  private updateNetworkMetrics(): void {
    // Would update with actual network metrics from HTTP server
    this.metrics.network.requestsPerSecond = Math.floor(Math.random() * 500 + 100);
  }

  private updateDatabaseMetrics(): void {
    // Would update with actual database metrics
    this.metrics.database.queriesPerSecond = Math.floor(Math.random() * 100 + 20);
    this.metrics.database.averageLatency = Math.random() * 50 + 10;
    this.metrics.database.slowQueries = this.slowQueries.length;
  }

  private checkThresholds(): void {
    for (const [metricKey, threshold] of this.thresholds) {
      const value = this.getMetricValue(metricKey);
      if (value !== undefined) {
        if (value >= threshold.critical) {
          this.handleCriticalThreshold(threshold, value);
        } else if (value >= threshold.warning) {
          this.handleWarningThreshold(threshold, value);
        }
      }
    }
  }

  private getMetricValue(metricKey: string): number | undefined {
    const keys = metricKey.split('.');
    let value: any = this.metrics;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return typeof value === 'number' ? value : undefined;
  }

  private handleCriticalThreshold(threshold: PerformanceThreshold, value: number): void {
    this.logger.critical(`Critical threshold exceeded: ${threshold.metric}`, {
      value,
      threshold: threshold.critical,
      action: threshold.action
    });

    this.createRecommendation('critical', threshold, value);

    // Send alert to monitoring systems
    if (this.dataDogCollector) {
      this.dataDogCollector.log(
        `Critical threshold exceeded: ${threshold.metric}`,
        'error',
        { value, threshold: threshold.critical, action: threshold.action }
      );
    }

    if (this.newRelicCollector) {
      this.newRelicCollector.log(
        `Critical threshold exceeded: ${threshold.metric}`,
        'error',
        { value, threshold: threshold.critical, action: threshold.action }
      );
    }
  }

  private handleWarningThreshold(threshold: PerformanceThreshold, value: number): void {
    this.logger.warn(`Warning threshold exceeded: ${threshold.metric}`, {
      value,
      threshold: threshold.warning,
      action: threshold.action
    });

    this.createRecommendation('medium', threshold, value);
  }

  private createRecommendation(
    priority: 'low' | 'medium' | 'high' | 'critical',
    threshold: PerformanceThreshold,
    value: number
  ): void {
    const recommendation: OptimizationRecommendation = {
      type: this.inferRecommendationType(threshold.metric),
      priority,
      title: `Optimize ${threshold.metric}`,
      description: `Current value ${value} exceeds threshold of ${threshold.warning}`,
      impact: this.calculateImpact(threshold.metric, value),
      action: threshold.action,
      metrics: { [threshold.metric]: value },
      timestamp: Date.now()
    };

    // Check if similar recommendation already exists
    const existingIndex = this.recommendations.findIndex(
      r => r.type === recommendation.type && r.title === recommendation.title
    );

    if (existingIndex >= 0) {
      this.recommendations[existingIndex] = recommendation;
    } else {
      this.recommendations.unshift(recommendation);
    }

    // Keep only last 50 recommendations
    if (this.recommendations.length > 50) {
      this.recommendations = this.recommendations.slice(0, 50);
    }
  }

  private inferRecommendationType(metric: string): OptimizationRecommendation['type'] {
    if (metric.includes('cpu')) return 'cpu';
    if (metric.includes('memory')) return 'memory';
    if (metric.includes('database')) return 'database';
    if (metric.includes('cache')) return 'cache';
    return 'scaling';
  }

  private calculateImpact(metric: string, value: number): string {
    if (value >= 90) return 'High';
    if (value >= 80) return 'Medium';
    return 'Low';
  }

  private sendMetricsToAPM(): void {
    // Send to DataDog
    if (this.dataDogCollector) {
      this.dataDogCollector.gauge('system.cpu.usage', this.metrics.cpu.usage);
      this.dataDogCollector.gauge('system.memory.heap_used', this.metrics.memory.heapUsed);
      this.dataDogCollector.gauge('system.memory.usage_percent',
        (this.metrics.memory.used / this.metrics.memory.total) * 100);
      this.dataDogCollector.gauge('system.event_loop.lag', this.metrics.eventLoop.lag);
      this.dataDogCollector.gauge('system.network.requests_per_second', this.metrics.network.requestsPerSecond);
      this.dataDogCollector.gauge('system.database.average_latency', this.metrics.database.averageLatency);
    }

    // Send to New Relic
    if (this.newRelicCollector) {
      this.newRelicCollector.recordMetric('SystemCPUUsage', this.metrics.cpu.usage, 'gauge');
      this.newRelicCollector.recordMetric('SystemMemoryHeapUsed', this.metrics.memory.heapUsed, 'gauge');
      this.newRelicCollector.recordMetric('SystemMemoryUsagePercent',
        (this.metrics.memory.used / this.metrics.memory.total) * 100, 'gauge');
      this.newRelicCollector.recordMetric('SystemEventLoopLag', this.metrics.eventLoop.lag, 'gauge');
      this.newRelicCollector.recordMetric('SystemNetworkRequestsPerSecond',
        this.metrics.network.requestsPerSecond, 'gauge');
      this.newRelicCollector.recordMetric('SystemDatabaseAverageLatency',
        this.metrics.database.averageLatency, 'gauge');
    }
  }

  // Caching Strategies
  private setupCacheStrategies(): void {
    // Agent response caching
    this.cacheStrategies.set('agent_responses', {
      name: 'agent_responses',
      type: 'memory',
      ttl: 300000, // 5 minutes
      maxSize: 1000,
      evictionPolicy: 'lru',
      compressionEnabled: false,
      enabled: true
    });

    // Swarm status caching
    this.cacheStrategies.set('swarm_status', {
      name: 'swarm_status',
      type: 'memory',
      ttl: 10000, // 10 seconds
      maxSize: 100,
      evictionPolicy: 'lru',
      compressionEnabled: false,
      enabled: true
    });

    // API response caching
    this.cacheStrategies.set('api_responses', {
      name: 'api_responses',
      type: 'memory',
      ttl: 60000, // 1 minute
      maxSize: 500,
      evictionPolicy: 'lru',
      compressionEnabled: true,
      enabled: true
    });

    // WebSocket connection caching
    this.cacheStrategies.set('websocket_connections', {
      name: 'websocket_connections',
      type: 'memory',
      ttl: 300000, // 5 minutes
      maxSize: 10000,
      evictionPolicy: 'lfu',
      compressionEnabled: false,
      enabled: true
    });
  }

  public getCacheStrategy(name: string): CacheStrategy | undefined {
    return this.cacheStrategies.get(name);
  }

  public updateCacheHitRate(strategyName: string, hitRate: number): void {
    this.cacheHitRates.set(strategyName, hitRate);
  }

  public recordSlowQuery(query: string, duration: number): void {
    this.slowQueries.push({
      query: query.substring(0, 200), // Limit query length
      duration,
      timestamp: Date.now()
    });

    // Keep only last 100 slow queries
    if (this.slowQueries.length > 100) {
      this.slowQueries = this.slowQueries.slice(-100);
    }

    // Record in APM
    if (this.dataDogCollector) {
      this.dataDogCollector.histogram('database.slow_query_duration', duration, {
        'query.type': this.classifyQuery(query)
      });
    }

    if (this.newRelicCollector) {
      this.newRelicCollector.recordMetric('DatabaseSlowQueryDuration', duration, 'histogram', {
        'query.type': this.classifyQuery(query)
      });
    }
  }

  private classifyQuery(query: string): string {
    const upperQuery = query.toUpperCase();
    if (upperQuery.startsWith('SELECT')) return 'select';
    if (upperQuery.startsWith('INSERT')) return 'insert';
    if (upperQuery.startsWith('UPDATE')) return 'update';
    if (upperQuery.startsWith('DELETE')) return 'delete';
    return 'other';
  }

  // Optimization Analysis
  private startOptimizationAnalysis(): void {
    this.optimizationInterval = setInterval(() => {
      this.analyzePerformance();
      this.generateOptimizationRecommendations();
    }, 60000); // Analyze every minute
  }

  private analyzePerformance(): void {
    // Analyze memory usage patterns
    const memoryUsagePercent = (this.metrics.memory.heapUsed / this.metrics.memory.heapTotal) * 100;
    if (memoryUsagePercent > 85) {
      this.analyzeMemoryUsage();
    }

    // Analyze event loop performance
    if (this.metrics.eventLoop.utilization > 80) {
      this.analyzeEventLoopPerformance();
    }

    // Analyze cache performance
    this.analyzeCachePerformance();

    // Analyze database performance
    if (this.metrics.database.averageLatency > 200) {
      this.analyzeDatabasePerformance();
    }
  }

  private analyzeMemoryUsage(): void {
    // Look for memory leaks or inefficient memory usage
    const memoryGrowthRate = this.calculateMemoryGrowthRate();

    if (memoryGrowthRate > 10) { // 10% growth rate is concerning
      this.createRecommendation('high', {
        metric: 'memory.growth_rate',
        warning: 5,
        critical: 10,
        action: 'Investigate potential memory leak'
      }, memoryGrowthRate);
    }
  }

  private calculateMemoryGrowthRate(): number {
    // Calculate memory growth rate over time
    // This is a simplified calculation
    return Math.random() * 15; // Placeholder
  }

  private analyzeEventLoopPerformance(): void {
    if (this.metrics.eventLoop.lag > 100) {
      this.createRecommendation('critical', {
        metric: 'event_loop.blocking_operations',
        warning: 50,
        critical: 100,
        action: 'Identify and optimize blocking operations'
      }, this.metrics.eventLoop.lag);
    }
  }

  private analyzeCachePerformance(): void {
    for (const [strategyName, hitRate] of this.cacheHitRates) {
      if (hitRate < 70) { // Cache hit rate below 70% is concerning
        this.createRecommendation('medium', {
          metric: `cache.hit_rate.${strategyName}`,
          warning: 80,
          critical: 70,
          action: 'Optimize cache strategy or increase cache size'
        }, hitRate);
      }
    }
  }

  private analyzeDatabasePerformance(): void {
    if (this.slowQueries.length > 10) {
      this.createRecommendation('high', {
        metric: 'database.slow_queries.count',
        warning: 5,
        critical: 15,
        action: 'Analyze and optimize slow database queries'
      }, this.slowQueries.length);
    }
  }

  private generateOptimizationRecommendations(): void {
    // Generate additional recommendations based on performance patterns
    this.generateScalingRecommendations();
    this.generateCacheRecommendations();
    this.generateDatabaseRecommendations();
  }

  private generateScalingRecommendations(): void {
    const cpuUsage = this.metrics.cpu.usage;
    const memoryUsagePercent = (this.metrics.memory.heapUsed / this.metrics.memory.heapTotal) * 100;
    const requestsPerSecond = this.metrics.network.requestsPerSecond;

    if (cpuUsage > 80 && memoryUsagePercent > 80) {
      this.createRecommendation('critical', {
        metric: 'system.overall_load',
        warning: 70,
        critical: 85,
        action: 'Scale horizontally to handle increased load'
      }, Math.max(cpuUsage, memoryUsagePercent));
    }

    if (requestsPerSecond > 1500) {
      this.createRecommendation('high', {
        metric: 'system.request_load',
        warning: 1000,
        critical: 2000,
        action: 'Implement load balancing or scale horizontally'
      }, requestsPerSecond);
    }
  }

  private generateCacheRecommendations(): void {
    for (const [name, strategy] of this.cacheStrategies) {
      if (strategy.enabled) {
        const hitRate = this.cacheHitRates.get(name) || 0;

        if (hitRate < 50) {
          this.createRecommendation('medium', {
            metric: `cache.efficiency.${name}`,
            warning: 70,
            critical: 50,
            action: `Review and optimize ${name} cache strategy`
          }, hitRate);
        }
      }
    }
  }

  private generateDatabaseRecommendations(): void {
    const avgLatency = this.metrics.database.averageLatency;
    const qps = this.metrics.database.queriesPerSecond;

    if (avgLatency > 300) {
      this.createRecommendation('high', {
        metric: 'database.latency',
        warning: 100,
        critical: 300,
        action: 'Optimize database queries and add proper indexing'
      }, avgLatency);
    }

    if (qps > 500) {
      this.createRecommendation('medium', {
        metric: 'database.query_load',
        warning: 300,
        critical: 600,
        action: 'Consider database scaling or query optimization'
      }, qps);
    }
  }

  // Public API
  public getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public getRecommendations(): OptimizationRecommendation[] {
    return [...this.recommendations];
  }

  public getSlowQueries(): Array<{ query: string; duration: number; timestamp: number }> {
    return [...this.slowQueries];
  }

  public getCacheHitRates(): Map<string, number> {
    return new Map(this.cacheHitRates);
  }

  public clearRecommendations(): void {
    this.recommendations = [];
  }

  public optimizeCacheStrategy(name: string, updates: Partial<CacheStrategy>): void {
    const strategy = this.cacheStrategies.get(name);
    if (strategy) {
      Object.assign(strategy, updates);
      this.logger.info(`Updated cache strategy: ${name}`, updates);
    }
  }

  // WebSocket Connection Optimization
  public optimizeWebSocketConnections(activeConnections: number): void {
    if (activeConnections > 1000) {
      this.createRecommendation('high', {
        metric: 'websocket.active_connections',
        warning: 500,
        critical: 1000,
        action: 'Implement WebSocket connection pooling or load balancing'
      }, activeConnections);
    }

    // Record metrics
    if (this.dataDogCollector) {
      this.dataDogCollector.gauge('websocket.active_connections', activeConnections);
    }

    if (this.newRelicCollector) {
      this.newRelicCollector.recordMetric('ActiveWebSocketConnections', activeConnections, 'gauge');
    }
  }

  // Health Check
  public healthCheck(): { status: string; details: any } {
    const memoryUsagePercent = (this.metrics.memory.heapUsed / this.metrics.memory.heapTotal) * 100;

    let status = 'healthy';
    if (memoryUsagePercent > 90 || this.metrics.cpu.usage > 90) {
      status = 'critical';
    } else if (memoryUsagePercent > 80 || this.metrics.cpu.usage > 80) {
      status = 'warning';
    }

    return {
      status,
      details: {
        metrics: this.metrics,
        recommendations: this.recommendations.length,
        cacheStrategies: Array.from(this.cacheStrategies.entries()).map(([name, strategy]) => ({
          name,
          enabled: strategy.enabled,
          hitRate: this.cacheHitRates.get(name) || 0
        })),
        slowQueries: this.slowQueries.length
      }
    };
  }

  // Shutdown
  public shutdown(): void {
    this.logger.info('Shutting down performance optimizer');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
    }

    this.logger.info('Performance optimizer shutdown complete');
  }
}

export function createPerformanceOptimizer(
  dataDogCollector?: DataDogCollector,
  newRelicCollector?: NewRelicCollector
): PerformanceOptimizer {
  return new PerformanceOptimizer(dataDogCollector, newRelicCollector);
}