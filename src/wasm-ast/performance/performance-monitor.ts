/**
 * Performance Monitor for WASM AST Operations
 * Real-time performance tracking with sub-millisecond precision
 */

import { EventEmitter } from 'events';
import {
  PerformanceMetrics,
  BatchProcessingJob,
  RealTimeAnalysisEvent,
  PERFORMANCE_TARGETS
} from '../types/ast-types';

export interface PerformanceAlert {
  id: string;
  type: 'slow_operation' | 'memory_leak' | 'throughput_degradation' | 'timeout';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  metrics: Partial<PerformanceMetrics>;
  threshold: number;
  actual: number;
}

export interface PerformanceBenchmark {
  operation: string;
  sampleCount: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
  p99Time: number;
  throughput: number;
  memoryEfficiency: number;
  targetMet: boolean;
}

export interface PerformanceReport {
  timestamp: number;
  period: string;
  totalOperations: number;
  averageMetrics: PerformanceMetrics;
  benchmarks: Map<string, PerformanceBenchmark>;
  alerts: PerformanceAlert[];
  targetCompliance: number;
  recommendations: string[];
}

export class PerformanceMonitor extends EventEmitter {
  private metricsBuffer: PerformanceMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private benchmarks = new Map<string, PerformanceBenchmark>();
  private monitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastCleanup = Date.now();
  private readonly maxBufferSize = 10000;
  private readonly alertThresholds = {
    SLOW_OPERATION: 1.0, // 1ms threshold for slow operations
    MEMORY_WARNING: 100 * 1024 * 1024, // 100MB memory warning
    THROUGHPUT_MIN: 1000, // Minimum 1000 operations/second
  };

  constructor() {
    super();
    this.initializeBenchmarks();
  }

  /**
   * Start real-time performance monitoring
   */
  startMonitoring(intervalMs: number = 1000): void {
    if (this.monitoring) return;

    this.monitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectPerformanceData();
      this.checkPerformanceThresholds();
      this.cleanupOldData();
    }, intervalMs);

    this.emit('monitoring:started', { intervalMs });
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (!this.monitoring) return;

    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('monitoring:stopped');
  }

  /**
   * Record performance metrics for an operation
   */
  recordMetrics(metrics: PerformanceMetrics, operation: string = 'unknown'): void {
    // Add timestamp to metrics
    const timestampedMetrics = {
      ...metrics,
      timestamp: Date.now(),
      operation,
    };

    this.metricsBuffer.push(timestampedMetrics as any);

    // Update benchmarks
    this.updateBenchmark(operation, metrics);

    // Check for immediate performance issues
    this.checkImmediateThresholds(metrics, operation);

    // Emit metrics for real-time consumers
    this.emit('metrics:recorded', timestampedMetrics);

    // Maintain buffer size
    if (this.metricsBuffer.length > this.maxBufferSize) {
      this.metricsBuffer.shift();
    }
  }

  /**
   * Get current performance statistics
   */
  getCurrentStats(): {
    operations: number;
    averageMetrics: Partial<PerformanceMetrics>;
    recentPerformance: PerformanceMetrics[];
    activeAlerts: PerformanceAlert[];
    targetCompliance: number;
  } {
    const recent = this.metricsBuffer.slice(-100);
    const averageMetrics = recent.length > 0 ? this.calculateAverageMetrics(recent) : {};

    // Calculate target compliance
    const subMillisecondOps = recent.filter(m => m.totalTime < 1.0).length;
    const targetCompliance = recent.length > 0 ? (subMillisecondOps / recent.length) * 100 : 0;

    return {
      operations: this.metricsBuffer.length,
      averageMetrics,
      recentPerformance: recent.slice(-10),
      activeAlerts: this.alerts.filter(a => a.timestamp > Date.now() - 60000), // Last minute
      targetCompliance,
    };
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(period: 'hour' | 'day' | 'week' = 'hour'): PerformanceReport {
    const now = Date.now();
    const periodMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[period];

    const periodStart = now - periodMs;
    const periodMetrics = this.metricsBuffer.filter(m => m.timestamp >= periodStart);

    const averageMetrics = periodMetrics.length > 0
      ? this.calculateAverageMetrics(periodMetrics)
      : this.getEmptyMetrics();

    // Calculate benchmark compliance
    let totalBenchmarks = 0;
    let compliantBenchmarks = 0;

    for (const benchmark of this.benchmarks.values()) {
      totalBenchmarks++;
      if (benchmark.targetMet) compliantBenchmarks++;
    }

    const targetCompliance = totalBenchmarks > 0 ? (compliantBenchmarks / totalBenchmarks) * 100 : 0;

    // Generate recommendations
    const recommendations = this.generateRecommendations(periodMetrics, this.alerts);

    const report: PerformanceReport = {
      timestamp: now,
      period,
      totalOperations: periodMetrics.length,
      averageMetrics: averageMetrics as PerformanceMetrics,
      benchmarks: new Map(this.benchmarks),
      alerts: this.alerts.filter(a => a.timestamp >= periodStart),
      targetCompliance,
      recommendations,
    };

    this.emit('report:generated', report);
    return report;
  }

  /**
   * Set custom performance thresholds
   */
  setThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    Object.assign(this.alertThresholds, thresholds);
    this.emit('thresholds:updated', this.alertThresholds);
  }

  /**
   * Clear performance history
   */
  clearHistory(): void {
    this.metricsBuffer = [];
    this.alerts = [];
    this.benchmarks.clear();
    this.initializeBenchmarks();
    this.emit('history:cleared');
  }

  // Private methods

  private initializeBenchmarks(): void {
    const defaultOperations = ['parse', 'transform', 'analyze', 'batch_process'];

    for (const operation of defaultOperations) {
      this.benchmarks.set(operation, {
        operation,
        sampleCount: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        p95Time: 0,
        p99Time: 0,
        throughput: 0,
        memoryEfficiency: 0,
        targetMet: false,
      });
    }
  }

  private updateBenchmark(operation: string, metrics: PerformanceMetrics): void {
    let benchmark = this.benchmarks.get(operation);
    if (!benchmark) {
      benchmark = {
        operation,
        sampleCount: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        p95Time: 0,
        p99Time: 0,
        throughput: 0,
        memoryEfficiency: 0,
        targetMet: false,
      };
      this.benchmarks.set(operation, benchmark);
    }

    // Update basic statistics
    benchmark.sampleCount++;
    benchmark.averageTime = (benchmark.averageTime * (benchmark.sampleCount - 1) + metrics.totalTime) / benchmark.sampleCount;
    benchmark.minTime = Math.min(benchmark.minTime, metrics.totalTime);
    benchmark.maxTime = Math.max(benchmark.maxTime, metrics.totalTime);
    benchmark.throughput = metrics.throughput;

    // Calculate percentiles (simplified)
    const recentMetrics = this.metricsBuffer
      .filter(m => (m as any).operation === operation)
      .slice(-100)
      .map(m => m.totalTime)
      .sort((a, b) => a - b);

    if (recentMetrics.length > 0) {
      benchmark.p95Time = recentMetrics[Math.floor(recentMetrics.length * 0.95)] || 0;
      benchmark.p99Time = recentMetrics[Math.floor(recentMetrics.length * 0.99)] || 0;
    }

    // Check if target is met (sub-millisecond for 95% of operations)
    const subMillisecondCount = recentMetrics.filter(m => m < 1.0).length;
    benchmark.targetMet = recentMetrics.length > 0 &&
      (subMillisecondCount / recentMetrics.length) >= PERFORMANCE_TARGETS.PARSE_TIME_SUB_MILLISECOND;

    this.emit('benchmark:updated', benchmark);
  }

  private checkImmediateThresholds(metrics: PerformanceMetrics, operation: string): void {
    // Check for slow operation
    if (metrics.totalTime > this.alertThresholds.SLOW_OPERATION) {
      this.createAlert({
        type: 'slow_operation',
        severity: metrics.totalTime > 5.0 ? 'high' : 'medium',
        message: `Slow ${operation} operation: ${metrics.totalTime.toFixed(2)}ms`,
        metrics,
        threshold: this.alertThresholds.SLOW_OPERATION,
        actual: metrics.totalTime,
      });
    }

    // Check for memory usage
    if (metrics.memoryUsed > this.alertThresholds.MEMORY_WARNING) {
      this.createAlert({
        type: 'memory_leak',
        severity: 'high',
        message: `High memory usage: ${(metrics.memoryUsed / 1024 / 1024).toFixed(2)}MB`,
        metrics,
        threshold: this.alertThresholds.MEMORY_WARNING,
        actual: metrics.memoryUsed,
      });
    }

    // Check throughput
    if (metrics.throughput < this.alertThresholds.THROUGHPUT_MIN && metrics.throughput > 0) {
      this.createAlert({
        type: 'throughput_degradation',
        severity: 'medium',
        message: `Low throughput: ${metrics.throughput.toFixed(0)} ops/sec`,
        metrics,
        threshold: this.alertThresholds.THROUGHPUT_MIN,
        actual: metrics.throughput,
      });
    }
  }

  private checkPerformanceThresholds(): void {
    const recent = this.metricsBuffer.slice(-100);
    if (recent.length < 10) return; // Need sufficient data

    const avgMetrics = this.calculateAverageMetrics(recent);

    // Check overall performance degradation
    if (avgMetrics.totalTime && avgMetrics.totalTime > this.alertThresholds.SLOW_OPERATION * 2) {
      this.createAlert({
        type: 'throughput_degradation',
        severity: 'high',
        message: `Overall performance degradation: ${avgMetrics.totalTime.toFixed(2)}ms average`,
        metrics: avgMetrics,
        threshold: this.alertThresholds.SLOW_OPERATION * 2,
        actual: avgMetrics.totalTime,
      });
    }
  }

  private collectPerformanceData(): void {
    const stats = this.getCurrentStats();
    this.emit('performance:tick', stats);

    // Check if we should emit performance alert
    if (stats.targetCompliance < 90 && stats.operations > 50) {
      this.createAlert({
        type: 'throughput_degradation',
        severity: 'medium',
        message: `Target compliance below 90%: ${stats.targetCompliance.toFixed(1)}%`,
        metrics: stats.averageMetrics,
        threshold: 90,
        actual: stats.targetCompliance,
      });
    }
  }

  private cleanupOldData(): void {
    const now = Date.now();
    if (now - this.lastCleanup < 60000) return; // Cleanup once per minute

    // Remove old metrics (older than 1 hour)
    const oneHourAgo = now - 60 * 60 * 1000;
    this.metricsBuffer = this.metricsBuffer.filter(m => (m as any).timestamp > oneHourAgo);

    // Remove old alerts (older than 1 hour)
    this.alerts = this.alerts.filter(a => a.timestamp > oneHourAgo);

    this.lastCleanup = now;
    this.emit('cleanup:completed', {
      metricsRemoved: this.maxBufferSize - this.metricsBuffer.length,
      alertsRemoved: this.alerts.length,
    });
  }

  private calculateAverageMetrics(metrics: PerformanceMetrics[]): Partial<PerformanceMetrics> {
    if (metrics.length === 0) return {};

    const sum = metrics.reduce((acc, m) => ({
      totalTime: acc.totalTime + m.totalTime,
      parseTime: acc.parseTime + m.parseTime,
      transformTime: acc.transformTime + m.transformTime,
      memoryUsed: Math.max(acc.memoryUsed, m.memoryUsed),
      nodesProcessed: acc.nodesProcessed + m.nodesProcessed,
      throughput: acc.throughput + m.throughput,
    }), { totalTime: 0, parseTime: 0, transformTime: 0, memoryUsed: 0, nodesProcessed: 0, throughput: 0 });

    const count = metrics.length;
    return {
      totalTime: sum.totalTime / count,
      parseTime: sum.parseTime / count,
      transformTime: sum.transformTime / count,
      memoryUsed: sum.memoryUsed,
      nodesProcessed: sum.nodesProcessed,
      throughput: sum.throughput / count,
    };
  }

  private getEmptyMetrics(): PerformanceMetrics {
    return {
      parseTime: 0,
      transformTime: 0,
      totalTime: 0,
      memoryUsed: 0,
      nodesProcessed: 0,
      throughput: 0,
    };
  }

  private createAlert(alertData: Omit<PerformanceAlert, 'id' | 'timestamp'>): void {
    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...alertData,
    };

    this.alerts.push(alert);
    this.emit('alert:created', alert);

    // Limit alert history
    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }
  }

  private generateRecommendations(metrics: any[], alerts: PerformanceAlert[]): string[] {
    const recommendations: string[] = [];

    if (metrics.length === 0) {
      recommendations.push('No performance data available for analysis');
      return recommendations;
    }

    const avgMetrics = this.calculateAverageMetrics(metrics);

    // Performance recommendations
    if (avgMetrics.totalTime && avgMetrics.totalTime > 1.0) {
      recommendations.push('Consider optimizing AST parsing for better sub-millisecond performance');
    }

    if (avgMetrics.memoryUsed && avgMetrics.memoryUsed > 50 * 1024 * 1024) {
      recommendations.push('Memory usage is high, consider implementing more efficient memory management');
    }

    if (alerts.filter(a => a.type === 'slow_operation').length > 5) {
      recommendations.push('Multiple slow operations detected - review WASM optimization flags');
    }

    if (alerts.filter(a => a.type === 'memory_leak').length > 0) {
      recommendations.push('Memory leaks detected - implement proper cleanup in WASM functions');
    }

    // Throughput recommendations
    const recentThroughput = metrics.slice(-20).map(m => m.throughput).filter(t => t > 0);
    if (recentThroughput.length > 0) {
      const avgThroughput = recentThroughput.reduce((a, b) => a + b, 0) / recentThroughput.length;
      if (avgThroughput < this.alertThresholds.THROUGHPUT_MIN) {
        recommendations.push('Enable SIMD optimizations and batch processing for better throughput');
      }
    }

    return recommendations;
  }
}