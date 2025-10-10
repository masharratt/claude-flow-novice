/**
 * AgentBoosterMonitor - WASM-based agent-booster performance monitoring
 *
 * Integrates with fleet monitoring to track:
 * - astOperationsPerSecond
 * - wasmMemoryUsage
 * - taskLatency
 * - errorRate
 * - 52x improvement validation
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import fs from 'fs/promises';
import path from 'path';

/**
 * Agent-Booster Performance Monitor
 */
export class AgentBoosterMonitor extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Update frequency: 1 second for real-time monitoring
      updateInterval: 1000,

      // Performance thresholds for WASM operations
      thresholds: {
        astOperationsPerSecond: {
          min: 1000,    // Minimum operations/sec
          target: 10000, // Target operations/sec
          peak: 50000   // Peak operations/sec
        },
        wasmMemoryUsage: {
          warning: 400,  // MB
          critical: 480, // MB
          max: 512       // MB (hard limit)
        },
        taskLatency: {
          excellent: 10,  // ms
          good: 50,       // ms
          warning: 100,   // ms
          critical: 500   // ms
        },
        errorRate: {
          excellent: 0.1, // %
          good: 1.0,      // %
          warning: 5.0,   // %
          critical: 10.0  // %
        }
      },

      // Redis configuration
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379,
        db: config.redis?.db || 0
      },

      // Data storage
      dataDir: config.dataDir || './data/agent-booster',
      logLevel: config.logLevel || 'info'
    };

    // Internal state
    this.isRunning = false;
    this.updateTimer = null;
    this.redisClient = null;
    this.redisPublisher = null;

    // Performance tracking
    this.startTime = Date.now();
    this.updateCount = 0;
    this.lastUpdateTime = null;

    // Data storage
    this.metricsHistory = [];
    this.benchmarks = new Map();
    this.activeBoosters = new Map();
    this.performanceBaseline = null;

    // 52x improvement tracking
    this.improvementTracker = {
      baselineEstablished: false,
      baselineMetrics: null,
      currentImprovement: 0,
      targetImprovement: 52,
      improvementHistory: []
    };
  }

  /**
   * Initialize the agent-booster monitor
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Agent-Booster Monitor...');

      // Ensure data directory exists
      await this.ensureDataDirectory();

      // Initialize Redis connections
      await this.initializeRedis();

      // Load baseline performance
      await this.loadBaselineData();

      // Load benchmarks
      await this.loadBenchmarks();

      console.log('✅ Agent-Booster Monitor initialized');
      this.emit('initialized', { timestamp: Date.now() });

    } catch (error) {
      console.error('❌ Failed to initialize Agent-Booster Monitor:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start monitoring agent-booster performance
   */
  async start() {
    if (this.isRunning) {
      console.warn('⚠️ Agent-Booster Monitor is already running');
      return;
    }

    try {
      console.log('▶️ Starting Agent-Booster Monitor...');

      this.isRunning = true;
      this.startTime = Date.now();

      // Start real-time updates
      this.startRealTimeMonitoring();

      // Start Redis coordination
      await this.startRedisCoordination();

      console.log('✅ Agent-Booster Monitor started with real-time WASM monitoring');
      this.emit('started', {
        timestamp: Date.now(),
        updateInterval: this.config.updateInterval
      });

    } catch (error) {
      this.isRunning = false;
      console.error('❌ Failed to start Agent-Booster Monitor:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop monitoring and cleanup
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('⏹️ Stopping Agent-Booster Monitor...');

      this.isRunning = false;

      // Stop update timer
      if (this.updateTimer) {
        clearInterval(this.updateTimer);
        this.updateTimer = null;
      }

      // Save final data
      await this.saveFinalData();

      // Cleanup Redis connections
      await this.cleanupRedis();

      console.log('✅ Agent-Booster Monitor stopped');
      this.emit('stopped', { timestamp: Date.now() });

    } catch (error) {
      console.error('❌ Error stopping Agent-Booster Monitor:', error);
      this.emit('error', error);
    }
  }

  /**
   * Start real-time monitoring of WASM instances
   */
  startRealTimeMonitoring() {
    this.updateTimer = setInterval(async () => {
      try {
        await this.collectBoosterMetrics();
        this.updateCount++;
        this.lastUpdateTime = Date.now();
      } catch (error) {
        console.error('❌ Error in real-time monitoring:', error);
        this.emit('error', error);
      }
    }, this.config.updateInterval);
  }

  /**
   * Collect metrics from active agent-booster instances
   */
  async collectBoosterMetrics() {
    const timestamp = Date.now();

    try {
      // Simulate booster metrics collection - in real implementation,
      // this would query actual WASM instances via APIs or monitoring

      const boosterMetrics = [];

      // Simulate 5-10 active booster instances
      const boosterCount = 5 + Math.floor(Math.random() * 6);

      for (let i = 1; i <= boosterCount; i++) {
        const boosterId = `booster-${i.toString().padStart(3, '0')}`;

        // Get existing booster data or create new
        let booster = this.activeBoosters.get(boosterId) || {
          id: boosterId,
          name: `Agent-Booster ${i}`,
          status: 'active',
          type: 'wasm-ast-processor',
          startTime: Date.now() - Math.random() * 3600000, // Random start within last hour
          wasmMemoryAllocated: 256 + Math.random() * 256, // 256-512 MB
          tasksProcessed: 0,
          errors: 0
        };

        // Simulate current performance metrics
        const currentMetrics = {
          // AST operations performance
          astOperationsPerSecond: 5000 + Math.random() * 45000, // 5k-50k ops/sec
          astOperationLatency: 1 + Math.random() * 49, // 1-50 ms

          // WASM memory metrics
          wasmMemoryUsage: booster.wasmMemoryAllocated * (0.7 + Math.random() * 0.3), // 70-100% usage
          wasmMemoryPeak: booster.wasmMemoryAllocated,
          wasmMemoryEfficiency: 0.8 + Math.random() * 0.2, // 80-100% efficiency

          // Task processing metrics
          taskLatency: 5 + Math.random() * 95, // 5-100 ms
          tasksPerSecond: 100 + Math.random() * 900, // 100-1000 tasks/sec
          queueDepth: Math.floor(Math.random() * 50),

          // Error tracking
          errorRate: Math.random() * 5, // 0-5% error rate
          errorsThisSecond: Math.random() > 0.95 ? 1 : 0,
          totalErrors: booster.errors,

          // WASM-specific metrics
          wasmCompileTime: 50 + Math.random() * 450, // 50-500 ms compile time
          wasmExecutionTime: 1 + Math.random() * 9, // 1-10 ms execution time
          functionCallOverhead: 0.1 + Math.random() * 0.9, // 0.1-1 ms overhead

          // Resource utilization
          cpuUsage: 20 + Math.random() * 60, // 20-80% CPU
          jsToWasmCallsPerSecond: 1000 + Math.random() * 9000, // 1k-10k calls/sec
          memoryGarbageCollectionTime: 1 + Math.random() * 4 // 1-5 ms GC time
        };

        // Update booster stats
        booster.tasksProcessed += Math.floor(currentMetrics.tasksPerSecond);
        booster.errors += currentMetrics.errorsThisSecond;
        booster.lastUpdate = Date.now();

        // Check for performance alerts
        const alerts = this.checkBoosterAlerts(boosterId, currentMetrics);

        // Store booster data
        booster.currentMetrics = currentMetrics;
        booster.alerts = alerts;
        this.activeBoosters.set(boosterId, booster);

        boosterMetrics.push({
          boosterId,
          ...booster,
          currentMetrics,
          alerts,
          timestamp
        });
      }

      // Calculate aggregated metrics
      const aggregatedMetrics = this.calculateAggregatedMetrics(boosterMetrics);

      // Check 52x improvement
      const improvementMetrics = this.calculateImprovementMetrics(aggregatedMetrics);

      // Create complete metrics snapshot
      const metrics = {
        timestamp,
        boosters: boosterMetrics,
        aggregated: aggregatedMetrics,
        improvement: improvementMetrics,
        fleet: {
          totalBoosters: boosterMetrics.length,
          activeBoosters: boosterMetrics.filter(b => b.status === 'active').length,
          totalOperations: aggregatedMetrics.performance.totalAstOperations,
          averageLatency: aggregatedMetrics.performance.averageTaskLatency,
          totalThroughput: aggregatedMetrics.performance.totalThroughput,
          memoryEfficiency: aggregatedMetrics.memory.averageEfficiency,
          errorRate: aggregatedMetrics.performance.averageErrorRate,
          improvementFactor: improvementMetrics.currentImprovement
        }
      };

      // Store metrics
      await this.storeMetrics(metrics);

      // Publish to Redis for fleet coordination
      await this.publishToRedis(metrics);

      // Emit metrics event
      this.emit('metrics', metrics);

      // Check for critical alerts
      const criticalAlerts = boosterMetrics.flatMap(b => b.alerts).filter(a => a.severity === 'CRITICAL');
      if (criticalAlerts.length > 0) {
        this.emit('critical_alerts', criticalAlerts);
      }

    } catch (error) {
      console.error('❌ Error collecting booster metrics:', error);
      this.emit('metrics_error', { timestamp, error: error.message });
    }
  }

  /**
   * Check for performance alerts on individual boosters
   */
  checkBoosterAlerts(boosterId, metrics) {
    const alerts = [];
    const thresholds = this.config.thresholds;

    // Check AST operations rate
    if (metrics.astOperationsPerSecond < thresholds.astOperationsPerSecond.min) {
      alerts.push({
        id: `ast-ops-low-${boosterId}-${Date.now()}`,
        boosterId,
        type: 'PERFORMANCE',
        severity: 'WARNING',
        category: 'AST_OPERATIONS',
        message: `AST operations/sec ${metrics.astOperationsPerSecond.toFixed(0)} below minimum ${thresholds.astOperationsPerSecond.min}`,
        value: metrics.astOperationsPerSecond,
        threshold: thresholds.astOperationsPerSecond.min,
        timestamp: Date.now()
      });
    }

    // Check WASM memory usage
    if (metrics.wasmMemoryUsage > thresholds.wasmMemoryUsage.critical) {
      alerts.push({
        id: `wasm-memory-critical-${boosterId}-${Date.now()}`,
        boosterId,
        type: 'RESOURCE',
        severity: 'CRITICAL',
        category: 'WASM_MEMORY',
        message: `WASM memory usage ${metrics.wasmMemoryUsage.toFixed(1)}MB exceeds critical threshold ${thresholds.wasmMemoryUsage.critical}MB`,
        value: metrics.wasmMemoryUsage,
        threshold: thresholds.wasmMemoryUsage.critical,
        timestamp: Date.now()
      });
    } else if (metrics.wasmMemoryUsage > thresholds.wasmMemoryUsage.warning) {
      alerts.push({
        id: `wasm-memory-warning-${boosterId}-${Date.now()}`,
        boosterId,
        type: 'RESOURCE',
        severity: 'WARNING',
        category: 'WASM_MEMORY',
        message: `WASM memory usage ${metrics.wasmMemoryUsage.toFixed(1)}MB above warning threshold ${thresholds.wasmMemoryUsage.warning}MB`,
        value: metrics.wasmMemoryUsage,
        threshold: thresholds.wasmMemoryUsage.warning,
        timestamp: Date.now()
      });
    }

    // Check task latency
    if (metrics.taskLatency > thresholds.taskLatency.critical) {
      alerts.push({
        id: `task-latency-critical-${boosterId}-${Date.now()}`,
        boosterId,
        type: 'PERFORMANCE',
        severity: 'CRITICAL',
        category: 'TASK_LATENCY',
        message: `Task latency ${metrics.taskLatency.toFixed(2)}ms exceeds critical threshold ${thresholds.taskLatency.critical}ms`,
        value: metrics.taskLatency,
        threshold: thresholds.taskLatency.critical,
        timestamp: Date.now()
      });
    } else if (metrics.taskLatency > thresholds.taskLatency.warning) {
      alerts.push({
        id: `task-latency-warning-${boosterId}-${Date.now()}`,
        boosterId,
        type: 'PERFORMANCE',
        severity: 'WARNING',
        category: 'TASK_LATENCY',
        message: `Task latency ${metrics.taskLatency.toFixed(2)}ms above warning threshold ${thresholds.taskLatency.warning}ms`,
        value: metrics.taskLatency,
        threshold: thresholds.taskLatency.warning,
        timestamp: Date.now()
      });
    }

    // Check error rate
    if (metrics.errorRate > thresholds.errorRate.critical) {
      alerts.push({
        id: `error-rate-critical-${boosterId}-${Date.now()}`,
        boosterId,
        type: 'RELIABILITY',
        severity: 'CRITICAL',
        category: 'ERROR_RATE',
        message: `Error rate ${metrics.errorRate.toFixed(2)}% exceeds critical threshold ${thresholds.errorRate.critical}%`,
        value: metrics.errorRate,
        threshold: thresholds.errorRate.critical,
        timestamp: Date.now()
      });
    } else if (metrics.errorRate > thresholds.errorRate.warning) {
      alerts.push({
        id: `error-rate-warning-${boosterId}-${Date.now()}`,
        boosterId,
        type: 'RELIABILITY',
        severity: 'WARNING',
        category: 'ERROR_RATE',
        message: `Error rate ${metrics.errorRate.toFixed(2)}% above warning threshold ${thresholds.errorRate.warning}%`,
        value: metrics.errorRate,
        threshold: thresholds.errorRate.warning,
        timestamp: Date.now()
      });
    }

    return alerts;
  }

  /**
   * Calculate aggregated metrics across all boosters
   */
  calculateAggregatedMetrics(boosterMetrics) {
    if (boosterMetrics.length === 0) {
      return { performance: {}, memory: {}, utilization: {} };
    }

    // Performance aggregates
    const performance = {
      totalAstOperations: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.astOperationsPerSecond, 0),
      averageAstOperationsPerSecond: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.astOperationsPerSecond, 0) / boosterMetrics.length,
      averageTaskLatency: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.taskLatency, 0) / boosterMetrics.length,
      totalThroughput: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.tasksPerSecond, 0),
      averageErrorRate: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.errorRate, 0) / boosterMetrics.length,
      averageWasmExecutionTime: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.wasmExecutionTime, 0) / boosterMetrics.length,
      averageJsToWasmCallsPerSecond: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.jsToWasmCallsPerSecond, 0) / boosterMetrics.length
    };

    // Memory aggregates
    const memory = {
      totalWasmMemory: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.wasmMemoryUsage, 0),
      averageWasmMemoryUsage: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.wasmMemoryUsage, 0) / boosterMetrics.length,
      averageEfficiency: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.wasmMemoryEfficiency, 0) / boosterMetrics.length,
      peakWasmMemory: Math.max(...boosterMetrics.map(b => b.currentMetrics.wasmMemoryPeak)),
      totalMemoryAllocated: boosterMetrics.reduce((sum, b) => sum + b.wasmMemoryAllocated, 0)
    };

    // Utilization aggregates
    const utilization = {
      averageCpuUsage: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.cpuUsage, 0) / boosterMetrics.length,
      averageMemoryUtilization: (memory.totalWasmMemory / memory.totalMemoryAllocated) * 100,
      totalQueueDepth: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.queueDepth, 0),
      averageGcTime: boosterMetrics.reduce((sum, b) => sum + b.currentMetrics.memoryGarbageCollectionTime, 0) / boosterMetrics.length
    };

    return { performance, memory, utilization };
  }

  /**
   * Calculate 52x improvement metrics
   */
  calculateImprovementMetrics(aggregatedMetrics) {
    const tracker = this.improvementTracker;

    // Establish baseline if not already done
    if (!tracker.baselineEstablished) {
      tracker.baselineMetrics = {
        astOperationsPerSecond: aggregatedMetrics.performance.averageAstOperationsPerSecond,
        taskLatency: aggregatedMetrics.performance.averageTaskLatency,
        throughput: aggregatedMetrics.performance.totalThroughput,
        timestamp: Date.now()
      };
      tracker.baselineEstablished = true;
      console.log('📊 Performance baseline established for 52x improvement tracking');
    }

    // Calculate current improvement
    let currentImprovement = 0;
    if (tracker.baselineMetrics) {
      const baselineOps = tracker.baselineMetrics.astOperationsPerSecond;
      const currentOps = aggregatedMetrics.performance.averageAstOperationsPerSecond;

      if (baselineOps > 0) {
        currentImprovement = currentOps / baselineOps;
      }
    }

    // Update improvement tracker
    tracker.currentImprovement = currentImprovement;
    tracker.improvementHistory.push({
      timestamp: Date.now(),
      improvement: currentImprovement,
      target: tracker.targetImprovement,
      achieved: currentImprovement >= tracker.targetImprovement
    });

    // Keep only last 100 improvement records
    if (tracker.improvementHistory.length > 100) {
      tracker.improvementHistory = tracker.improvementHistory.slice(-100);
    }

    return {
      currentImprovement,
      targetImprovement: tracker.targetImprovement,
      baselineMetrics: tracker.baselineMetrics,
      achieved: currentImprovement >= tracker.targetImprovement,
      improvementPercentage: ((currentImprovement - 1) * 100).toFixed(1),
      trend: this.calculateImprovementTrend()
    };
  }

  /**
   * Calculate improvement trend over time
   */
  calculateImprovementTrend() {
    const history = this.improvementTracker.improvementHistory;
    if (history.length < 5) return 'insufficient_data';

    const recent = history.slice(-5);
    const first = recent[0].improvement;
    const last = recent[recent.length - 1].improvement;
    const change = ((last - first) / first) * 100;

    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'improving' : 'degrading';
  }

  /**
   * Initialize Redis clients for coordination
   */
  async initializeRedis() {
    try {
      this.redisClient = createClient(this.config.redis);
      await this.redisClient.connect();

      this.redisPublisher = this.redisClient.duplicate();
      await this.redisPublisher.connect();

      console.log('✅ Redis clients initialized for Agent-Booster Monitor');
    } catch (error) {
      console.error('❌ Failed to initialize Redis:', error);
      throw error;
    }
  }

  /**
   * Start Redis coordination
   */
  async startRedisCoordination() {
    // Publish to performance coordination channel
    await this.redisPublisher.publish('swarm:phase-5:performance', JSON.stringify({
      type: 'MONITOR_STARTED',
      timestamp: Date.now(),
      monitorId: 'agent-booster-monitor',
      config: this.config
    }));

    console.log('✅ Redis coordination started for Agent-Booster Monitor');
  }

  /**
   * Publish metrics to Redis for fleet coordination
   */
  async publishToRedis(metrics) {
    try {
      const message = {
        type: 'BOOSTER_METRICS_UPDATE',
        swarmId: 'phase-5-performance-integration',
        timestamp: metrics.timestamp,
        metrics: metrics.fleet,
        boosters: metrics.boosters.map(b => ({
          id: b.boosterId,
          status: b.status,
          operations: b.currentMetrics.astOperationsPerSecond,
          latency: b.currentMetrics.taskLatency,
          memory: b.currentMetrics.wasmMemoryUsage,
          errorRate: b.currentMetrics.errorRate
        })),
        improvement: metrics.improvement
      };

      await this.redisPublisher.publish('swarm:phase-5:performance', JSON.stringify(message));

      // Store in Redis memory for swarm coordination
      await this.redisClient.setex(
        `swarm:memory:phase-5:booster-metrics:${Date.now()}`,
        3600, // 1 hour TTL
        JSON.stringify(metrics)
      );

    } catch (error) {
      console.error('❌ Error publishing to Redis:', error);
    }
  }

  /**
   * Store metrics with appropriate retention
   */
  async storeMetrics(metrics) {
    // Store in memory for real-time access
    this.metricsHistory.push(metrics);

    // Maintain retention (last 1000 entries)
    if (this.metricsHistory.length > 1000) {
      this.metricsHistory = this.metricsHistory.slice(-1000);
    }

    // Save to disk periodically (every 100 updates)
    if (this.updateCount % 100 === 0) {
      await this.saveMetricsToDisk();
    }
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.config.dataDir, 'metrics'), { recursive: true });
      await fs.mkdir(path.join(this.config.dataDir, 'benchmarks'), { recursive: true });
    } catch (error) {
      console.error('❌ Error creating data directory:', error);
    }
  }

  /**
   * Load baseline performance data
   */
  async loadBaselineData() {
    try {
      const baselineFile = path.join(this.config.dataDir, 'baseline.json');
      const data = await fs.readFile(baselineFile, 'utf-8');
      const baseline = JSON.parse(data);

      if (baseline.metrics && !this.improvementTracker.baselineEstablished) {
        this.improvementTracker.baselineMetrics = baseline.metrics;
        this.improvementTracker.baselineEstablished = true;
        console.log('📂 Loaded baseline performance data');
      }
    } catch (error) {
      console.log('📂 No baseline data found, will establish on first run');
    }
  }

  /**
   * Load existing benchmarks
   */
  async loadBenchmarks() {
    try {
      const benchmarksFile = path.join(this.config.dataDir, 'benchmarks', 'benchmarks.json');
      const data = await fs.readFile(benchmarksFile, 'utf-8');
      const benchmarks = JSON.parse(data);

      benchmarks.forEach(benchmark => {
        this.benchmarks.set(benchmark.id, benchmark);
      });

      console.log(`📂 Loaded ${this.benchmarks.size} benchmarks`);
    } catch (error) {
      console.log('📂 No benchmarks found, starting fresh');
    }
  }

  /**
   * Save metrics to disk
   */
  async saveMetricsToDisk() {
    try {
      const data = {
        timestamp: Date.now(),
        metrics: this.metricsHistory,
        improvement: this.improvementTracker,
        updateCount: this.updateCount,
        uptime: Date.now() - this.startTime
      };

      const metricsFile = path.join(this.config.dataDir, 'metrics', 'latest.json');
      await fs.writeFile(metricsFile, JSON.stringify(data, null, 2));

    } catch (error) {
      console.error('❌ Error saving metrics to disk:', error);
    }
  }

  /**
   * Save final data on shutdown
   */
  async saveFinalData() {
    try {
      await this.saveMetricsToDisk();

      // Save baseline if established
      if (this.improvementTracker.baselineEstablished) {
        const baselineFile = path.join(this.config.dataDir, 'baseline.json');
        await fs.writeFile(baselineFile, JSON.stringify({
          timestamp: Date.now(),
          metrics: this.improvementTracker.baselineMetrics,
          established: this.improvementTracker.baselineEstablished
        }, null, 2));
      }

      // Save benchmarks
      const benchmarksArray = Array.from(this.benchmarks.values());
      const benchmarksFile = path.join(this.config.dataDir, 'benchmarks', 'benchmarks.json');
      await fs.writeFile(benchmarksFile, JSON.stringify(benchmarksArray, null, 2));

      const summary = {
        timestamp: Date.now(),
        totalUpdates: this.updateCount,
        uptime: Date.now() - this.startTime,
        finalMetrics: this.getRealTimeMetrics(),
        improvementAchieved: this.improvementTracker.currentImprovement >= this.improvementTracker.targetImprovement,
        activeBoosters: this.activeBoosters.size
      };

      const summaryFile = path.join(this.config.dataDir, 'session-summary.json');
      await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));

      console.log('💾 Final Agent-Booster data saved to disk');
    } catch (error) {
      console.error('❌ Error saving final data:', error);
    }
  }

  /**
   * Cleanup Redis connections
   */
  async cleanupRedis() {
    try {
      if (this.redisPublisher) {
        await this.redisPublisher.quit();
      }

      if (this.redisClient) {
        await this.redisClient.quit();
      }

      console.log('✅ Redis connections cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up Redis:', error);
    }
  }

  /**
   * Get real-time metrics for API consumption
   */
  getRealTimeMetrics() {
    if (this.metricsHistory.length === 0) {
      return { status: 'NO_DATA' };
    }

    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    const previous = this.metricsHistory.length > 1 ? this.metricsHistory[this.metricsHistory.length - 2] : null;

    return {
      current: latest,
      previous,
      status: this.getStatus(),
      improvement: this.improvementTracker,
      activeBoosters: Array.from(this.activeBoosters.values()),
      summary: this.getPerformanceSummary()
    };
  }

  /**
   * Get current monitor status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      updateCount: this.updateCount,
      updateInterval: this.config.updateInterval,
      lastUpdate: this.lastUpdateTime,
      activeBoosters: this.activeBoosters.size,
      metricsCount: this.metricsHistory.length,
      benchmarksCount: this.benchmarks.size
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    if (this.metricsHistory.length === 0) {
      return { status: 'NO_DATA' };
    }

    const latest = this.metricsHistory[this.metricsHistory.length - 1];

    return {
      totalBoosters: latest.fleet.totalBoosters,
      totalOperations: latest.fleet.totalOperations,
      averageLatency: latest.fleet.averageLatency,
      totalThroughput: latest.fleet.totalThroughput,
      memoryEfficiency: latest.fleet.memoryEfficiency,
      errorRate: latest.fleet.errorRate,
      improvementFactor: latest.fleet.improvementFactor,
      targetAchieved: latest.improvement.achieved,
      improvementPercentage: latest.improvement.improvementPercentage,
      trend: latest.improvement.trend,
      recentTrends: this.calculateRecentTrends()
    };
  }

  /**
   * Calculate recent performance trends
   */
  calculateRecentTrends() {
    if (this.metricsHistory.length < 2) {
      return { operations: 'stable', latency: 'stable', throughput: 'stable' };
    }

    const recent = this.metricsHistory.slice(-10); // Last 10 samples

    const operationsTrend = this.calculateTrend(recent.map(m => m.fleet.totalOperations));
    const latencyTrend = this.calculateTrend(recent.map(m => m.fleet.averageLatency));
    const throughputTrend = this.calculateTrend(recent.map(m => m.fleet.totalThroughput));

    return {
      operations: operationsTrend,
      latency: latencyTrend,
      throughput: throughputTrend
    };
  }

  /**
   * Calculate trend direction from data points
   */
  calculateTrend(data) {
    if (data.length < 2) return 'stable';

    const first = data[0];
    const last = data[data.length - 1];
    const change = ((last - first) / first) * 100;

    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Generate comprehensive agent-booster performance report
   */
  generateBoosterReport() {
    if (this.metricsHistory.length === 0) {
      return { status: 'NO_DATA', message: 'No metrics data available' };
    }

    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    const summary = this.getPerformanceSummary();

    return {
      timestamp: Date.now(),
      summary,
      boosters: Array.from(this.activeBoosters.values()).map(booster => ({
        id: booster.id,
        name: booster.name,
        status: booster.status,
        type: booster.type,
        performance: {
          operationsPerSecond: booster.currentMetrics.astOperationsPerSecond,
          taskLatency: booster.currentMetrics.taskLatency,
          throughput: booster.currentMetrics.tasksPerSecond,
          errorRate: booster.currentMetrics.errorRate
        },
        memory: {
          usage: booster.currentMetrics.wasmMemoryUsage,
          allocated: booster.wasmMemoryAllocated,
          efficiency: booster.currentMetrics.wasmMemoryEfficiency
        },
        alerts: booster.alerts
      })),
      improvement: {
        current: this.improvementTracker.currentImprovement,
        target: this.improvementTracker.targetImprovement,
        achieved: this.improvementTracker.currentImprovement >= this.improvementTracker.targetImprovement,
        percentage: ((this.improvementTracker.currentImprovement - 1) * 100).toFixed(1),
        trend: this.improvementTracker.improvementHistory.slice(-5)
      },
      benchmarks: Array.from(this.benchmarks.values()),
      status: this.getStatus()
    };
  }
}

export default AgentBoosterMonitor;