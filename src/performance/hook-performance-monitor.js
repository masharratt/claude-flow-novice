/**
 * Hook Performance Monitor - Real-time performance tracking and optimization
 *
 * Monitors hook execution performance in real-time and provides:
 * - Performance metrics collection
 * - Bottleneck identification
 * - Automatic optimization recommendations
 * - Memory persistence performance tracking
 */

import { performance } from 'perf_hooks';
import EventEmitter from 'events';

/**
 * Performance threshold configuration
 */
const PERFORMANCE_THRESHOLDS = {
  TARGET_EXECUTION_TIME: 100, // ms - main requirement
  WARNING_THRESHOLD: 50,       // ms - warning level
  CRITICAL_THRESHOLD: 150,     // ms - critical level
  MEMORY_OPERATION_LIMIT: 20,  // ms - memory operation limit
  INITIALIZATION_LIMIT: 50,    // ms - initialization limit
  BATCH_PROCESSING_LIMIT: 30   // ms - batch processing limit
};

/**
 * Hook Performance Monitor
 */
class HookPerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.realTimeMetrics = {
      currentExecutions: 0,
      totalExecutions: 0,
      averageTime: 0,
      minTime: Infinity,
      maxTime: 0,
      failureRate: 0,
      memoryPersistenceFailures: 0,
      compatibilityRate: 1.0,
      lastExecutionTime: null
    };
    this.performanceHistory = [];
    this.bottlenecks = new Map();
    this.isMonitoring = false;
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.startTime = performance.now();

    // Start real-time performance tracking
    this.monitoringInterval = setInterval(() => {
      this._collectRealTimeMetrics();
      this._analyzeBottlenecks();
    }, 1000); // Every second

    console.log('🔍 Hook Performance Monitor started');
    this.emit('monitoring_started');
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    const finalReport = this.generatePerformanceReport();
    console.log('📊 Hook Performance Monitor stopped');
    this.emit('monitoring_stopped', finalReport);

    return finalReport;
  }

  /**
   * Record hook execution metrics
   */
  recordExecution(hookType, executionTime, success = true, metadata = {}) {
    const executionData = {
      hookType,
      executionTime,
      success,
      timestamp: Date.now(),
      metadata
    };

    // Store in metrics map
    if (!this.metrics.has(hookType)) {
      this.metrics.set(hookType, {
        totalExecutions: 0,
        totalTime: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        failures: 0,
        memoryFailures: 0,
        executions: []
      });
    }

    const hookMetrics = this.metrics.get(hookType);
    hookMetrics.totalExecutions++;
    hookMetrics.totalTime += executionTime;
    hookMetrics.averageTime = hookMetrics.totalTime / hookMetrics.totalExecutions;
    hookMetrics.minTime = Math.min(hookMetrics.minTime, executionTime);
    hookMetrics.maxTime = Math.max(hookMetrics.maxTime, executionTime);

    if (!success) {
      hookMetrics.failures++;
    }

    if (metadata.memoryPersistenceFailure) {
      hookMetrics.memoryFailures++;
      this.realTimeMetrics.memoryPersistenceFailures++;
    }

    hookMetrics.executions.push(executionData);

    // Update real-time metrics
    this._updateRealTimeMetrics(executionTime, success);

    // Check performance thresholds
    this._checkPerformanceThresholds(hookType, executionTime);

    // Store in performance history
    this.performanceHistory.push(executionData);

    // Limit history size to prevent memory issues
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory.shift();
    }
  }

  /**
   * Record memory operation performance
   */
  recordMemoryOperation(operation, executionTime, success = true) {
    this.recordExecution(`memory:${operation}`, executionTime, success, {
      isMemoryOperation: true
    });

    // Track memory-specific metrics
    if (executionTime > PERFORMANCE_THRESHOLDS.MEMORY_OPERATION_LIMIT) {
      this.bottlenecks.set(`memory:${operation}`, {
        type: 'memory_operation',
        operation,
        averageTime: executionTime,
        frequency: (this.bottlenecks.get(`memory:${operation}`)?.frequency || 0) + 1,
        lastOccurrence: Date.now()
      });
    }
  }

  /**
   * Record initialization performance
   */
  recordInitialization(component, executionTime, success = true) {
    this.recordExecution(`init:${component}`, executionTime, success, {
      isInitialization: true
    });

    if (executionTime > PERFORMANCE_THRESHOLDS.INITIALIZATION_LIMIT) {
      console.warn(`⚠️  Slow initialization: ${component} took ${executionTime.toFixed(2)}ms (limit: ${PERFORMANCE_THRESHOLDS.INITIALIZATION_LIMIT}ms)`);
    }
  }

  /**
   * Get current performance status
   */
  getCurrentStatus() {
    const currentTime = performance.now();
    const runningTime = this.isMonitoring ? currentTime - this.startTime : 0;

    return {
      isMonitoring: this.isMonitoring,
      runningTime,
      realTimeMetrics: { ...this.realTimeMetrics },
      performanceStatus: this._getPerformanceStatus(),
      bottleneckCount: this.bottlenecks.size,
      lastUpdate: Date.now()
    };
  }

  /**
   * Generate comprehensive performance report
   */
  generatePerformanceReport() {
    const report = {
      summary: {
        totalHookTypes: this.metrics.size,
        totalExecutions: this.realTimeMetrics.totalExecutions,
        averageExecutionTime: this.realTimeMetrics.averageTime,
        targetMet: this.realTimeMetrics.averageTime < PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME,
        compatibilityRate: this.realTimeMetrics.compatibilityRate,
        memoryPersistenceFailures: this.realTimeMetrics.memoryPersistenceFailures,
        performanceStatus: this._getPerformanceStatus()
      },
      hookMetrics: {},
      bottlenecks: Array.from(this.bottlenecks.entries()).map(([key, data]) => ({
        identifier: key,
        ...data
      })),
      recommendations: this._generateRecommendations(),
      performanceTrend: this._calculatePerformanceTrend(),
      compliance: this._checkCompliance()
    };

    // Add individual hook metrics
    for (const [hookType, metrics] of this.metrics) {
      report.hookMetrics[hookType] = {
        totalExecutions: metrics.totalExecutions,
        averageTime: metrics.averageTime,
        minTime: metrics.minTime === Infinity ? 0 : metrics.minTime,
        maxTime: metrics.maxTime,
        failureRate: metrics.totalExecutions > 0 ? metrics.failures / metrics.totalExecutions : 0,
        memoryFailureRate: metrics.totalExecutions > 0 ? metrics.memoryFailures / metrics.totalExecutions : 0,
        performanceGrade: this._calculatePerformanceGrade(metrics.averageTime)
      };
    }

    return report;
  }

  /**
   * Get performance bottlenecks
   */
  getBottlenecks() {
    return Array.from(this.bottlenecks.entries())
      .map(([key, data]) => ({
        identifier: key,
        ...data,
        severity: this._calculateBottleneckSeverity(data)
      }))
      .sort((a, b) => b.severity - a.severity);
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations() {
    return this._generateRecommendations();
  }

  // Private methods

  _updateRealTimeMetrics(executionTime, success) {
    this.realTimeMetrics.totalExecutions++;
    this.realTimeMetrics.lastExecutionTime = executionTime;

    // Update running average
    const totalTime = (this.realTimeMetrics.averageTime * (this.realTimeMetrics.totalExecutions - 1)) + executionTime;
    this.realTimeMetrics.averageTime = totalTime / this.realTimeMetrics.totalExecutions;

    // Update min/max
    this.realTimeMetrics.minTime = Math.min(this.realTimeMetrics.minTime, executionTime);
    this.realTimeMetrics.maxTime = Math.max(this.realTimeMetrics.maxTime, executionTime);

    // Update failure rate
    if (!success) {
      const failures = this.realTimeMetrics.totalExecutions * this.realTimeMetrics.failureRate + 1;
      this.realTimeMetrics.failureRate = failures / this.realTimeMetrics.totalExecutions;
    } else {
      const failures = this.realTimeMetrics.totalExecutions * this.realTimeMetrics.failureRate;
      this.realTimeMetrics.failureRate = failures / this.realTimeMetrics.totalExecutions;
    }

    // Update compatibility rate (based on meeting performance targets)
    const compatibleExecutions = this.realTimeMetrics.totalExecutions * this.realTimeMetrics.compatibilityRate;
    if (executionTime < PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME && success) {
      this.realTimeMetrics.compatibilityRate = (compatibleExecutions + 1) / this.realTimeMetrics.totalExecutions;
    } else {
      this.realTimeMetrics.compatibilityRate = compatibleExecutions / this.realTimeMetrics.totalExecutions;
    }
  }

  _checkPerformanceThresholds(hookType, executionTime) {
    if (executionTime > PERFORMANCE_THRESHOLDS.CRITICAL_THRESHOLD) {
      console.error(`❌ CRITICAL: Hook ${hookType} took ${executionTime.toFixed(2)}ms (critical threshold: ${PERFORMANCE_THRESHOLDS.CRITICAL_THRESHOLD}ms)`);
      this.emit('critical_performance', { hookType, executionTime });
    } else if (executionTime > PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME) {
      console.error(`❌ FAILED: Hook ${hookType} took ${executionTime.toFixed(2)}ms (target: ${PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME}ms)`);
      this.emit('target_missed', { hookType, executionTime });
    } else if (executionTime > PERFORMANCE_THRESHOLDS.WARNING_THRESHOLD) {
      console.warn(`⚠️  WARNING: Hook ${hookType} took ${executionTime.toFixed(2)}ms (approaching ${PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME}ms limit)`);
      this.emit('performance_warning', { hookType, executionTime });
    }
  }

  _collectRealTimeMetrics() {
    // Collect additional real-time metrics
    const memoryUsage = process.memoryUsage();

    this.emit('metrics_collected', {
      timestamp: Date.now(),
      metrics: this.realTimeMetrics,
      memoryUsage,
      bottleneckCount: this.bottlenecks.size
    });
  }

  _analyzeBottlenecks() {
    // Analyze for new bottlenecks
    for (const [hookType, metrics] of this.metrics) {
      if (metrics.averageTime > PERFORMANCE_THRESHOLDS.WARNING_THRESHOLD) {
        this.bottlenecks.set(hookType, {
          type: 'slow_execution',
          hookType,
          averageTime: metrics.averageTime,
          frequency: metrics.totalExecutions,
          lastOccurrence: Date.now()
        });
      }
    }

    // Clean up old bottlenecks
    const now = Date.now();
    for (const [key, bottleneck] of this.bottlenecks) {
      if (now - bottleneck.lastOccurrence > 60000) { // 1 minute
        this.bottlenecks.delete(key);
      }
    }
  }

  _getPerformanceStatus() {
    if (this.realTimeMetrics.averageTime < PERFORMANCE_THRESHOLDS.WARNING_THRESHOLD) {
      return 'EXCELLENT';
    } else if (this.realTimeMetrics.averageTime < PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME) {
      return 'GOOD';
    } else if (this.realTimeMetrics.averageTime < PERFORMANCE_THRESHOLDS.CRITICAL_THRESHOLD) {
      return 'POOR';
    } else {
      return 'CRITICAL';
    }
  }

  _calculatePerformanceGrade(averageTime) {
    if (averageTime < PERFORMANCE_THRESHOLDS.WARNING_THRESHOLD) return 'A';
    if (averageTime < PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME) return 'B';
    if (averageTime < PERFORMANCE_THRESHOLDS.CRITICAL_THRESHOLD) return 'C';
    return 'F';
  }

  _calculateBottleneckSeverity(bottleneckData) {
    let severity = 0;

    if (bottleneckData.averageTime > PERFORMANCE_THRESHOLDS.CRITICAL_THRESHOLD) {
      severity += 10;
    } else if (bottleneckData.averageTime > PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME) {
      severity += 5;
    } else if (bottleneckData.averageTime > PERFORMANCE_THRESHOLDS.WARNING_THRESHOLD) {
      severity += 2;
    }

    // Add frequency factor
    severity += Math.log10(bottleneckData.frequency || 1);

    return severity;
  }

  _calculatePerformanceTrend() {
    if (this.performanceHistory.length < 10) {
      return 'INSUFFICIENT_DATA';
    }

    const recent = this.performanceHistory.slice(-10);
    const older = this.performanceHistory.slice(-20, -10);

    const recentAvg = recent.reduce((sum, exec) => sum + exec.executionTime, 0) / recent.length;
    const olderAvg = older.reduce((sum, exec) => sum + exec.executionTime, 0) / older.length;

    if (recentAvg < olderAvg * 0.9) return 'IMPROVING';
    if (recentAvg > olderAvg * 1.1) return 'DEGRADING';
    return 'STABLE';
  }

  _generateRecommendations() {
    const recommendations = [];

    // Check overall performance
    if (this.realTimeMetrics.averageTime > PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME) {
      recommendations.push({
        type: 'CRITICAL',
        message: `Average execution time (${this.realTimeMetrics.averageTime.toFixed(2)}ms) exceeds target (${PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME}ms)`,
        action: 'Implement caching, reduce I/O operations, optimize memory usage'
      });
    }

    // Check memory persistence failures
    if (this.realTimeMetrics.memoryPersistenceFailures > 0) {
      recommendations.push({
        type: 'HIGH',
        message: `Memory persistence failures detected (${this.realTimeMetrics.memoryPersistenceFailures})`,
        action: 'Check database connections, implement retry logic, optimize storage operations'
      });
    }

    // Check compatibility rate
    if (this.realTimeMetrics.compatibilityRate < 0.95) {
      recommendations.push({
        type: 'HIGH',
        message: `Hook compatibility rate (${(this.realTimeMetrics.compatibilityRate * 100).toFixed(1)}%) below target (95%)`,
        action: 'Improve error handling, add fallback mechanisms, optimize slow hooks'
      });
    }

    // Check bottlenecks
    const criticalBottlenecks = Array.from(this.bottlenecks.values())
      .filter(b => b.averageTime > PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME);

    if (criticalBottlenecks.length > 0) {
      recommendations.push({
        type: 'HIGH',
        message: `${criticalBottlenecks.length} critical performance bottlenecks detected`,
        action: 'Profile and optimize slow operations, consider parallel execution'
      });
    }

    return recommendations;
  }

  _checkCompliance() {
    return {
      executionTimeCompliance: this.realTimeMetrics.averageTime < PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME,
      compatibilityCompliance: this.realTimeMetrics.compatibilityRate >= 0.95,
      memoryPersistenceCompliance: this.realTimeMetrics.memoryPersistenceFailures === 0,
      overallCompliance: this.realTimeMetrics.averageTime < PERFORMANCE_THRESHOLDS.TARGET_EXECUTION_TIME &&
                         this.realTimeMetrics.compatibilityRate >= 0.95 &&
                         this.realTimeMetrics.memoryPersistenceFailures === 0
    };
  }
}

export { HookPerformanceMonitor, PERFORMANCE_THRESHOLDS };