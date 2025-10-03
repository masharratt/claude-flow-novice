/**
 * Observability Infrastructure for Hierarchical Orchestration
 *
 * Provides distributed tracing, structured logging, and metrics collection
 * for agent coordination and task delegation.
 *
 * @module observability/telemetry
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags: Record<string, string | number | boolean>;
  logs: TraceLog[];
  status: 'active' | 'completed' | 'failed';
}

export interface TraceLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields: Record<string, any>;
}

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: Date;
  tags: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
}

export interface StructuredLogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  correlationId: string;
  traceId?: string;
  workerId?: string;
  taskId?: string;
  fields: Record<string, any>;
}

export interface LatencyMetrics {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  count: number;
}

export interface ThroughputMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsPerSecond: number;
  successRate: number;
  failureRate: number;
}

export interface TelemetryConfig {
  enableTracing: boolean;
  enableMetrics: boolean;
  enableStructuredLogging: boolean;
  metricsFlushInterval: number; // ms
  traceSamplingRate: number; // 0-1
  maxTraceHistory: number;
  maxMetricHistory: number;
}

// ============================================================================
// Telemetry System
// ============================================================================

export class TelemetrySystem extends EventEmitter {
  private logger: Logger;
  private config: TelemetryConfig;

  // Tracing
  private activeTraces: Map<string, TraceContext> = new Map();
  private completedTraces: TraceContext[] = [];

  // Metrics
  private metrics: Map<string, MetricPoint[]> = new Map();
  private latencyBuffer: Map<string, number[]> = new Map();
  private metricsFlushTimer?: NodeJS.Timeout;

  // Structured Logging
  private logBuffer: StructuredLogEntry[] = [];
  private readonly maxLogBuffer = 1000;

  constructor(config: Partial<TelemetryConfig> = {}) {
    super();

    this.config = {
      enableTracing: config.enableTracing ?? true,
      enableMetrics: config.enableMetrics ?? true,
      enableStructuredLogging: config.enableStructuredLogging ?? true,
      metricsFlushInterval: config.metricsFlushInterval ?? 60000, // 1 minute
      traceSamplingRate: config.traceSamplingRate ?? 1.0,
      maxTraceHistory: config.maxTraceHistory ?? 100,
      maxMetricHistory: config.maxMetricHistory ?? 1000,
    };

    this.logger = new Logger(
      { level: 'info', format: 'json', destination: 'console' },
      { component: 'TelemetrySystem' }
    );
  }

  // ============================================================================
  // Distributed Tracing
  // ============================================================================

  /**
   * Start a new trace span
   */
  startSpan(
    operation: string,
    parentSpanId?: string,
    tags: Record<string, string | number | boolean> = {}
  ): TraceContext {
    if (!this.config.enableTracing) {
      return this.createNoOpTrace();
    }

    // Sampling decision
    if (Math.random() > this.config.traceSamplingRate) {
      return this.createNoOpTrace();
    }

    const traceId = generateId('trace');
    const spanId = generateId('span');

    const trace: TraceContext = {
      traceId,
      spanId,
      parentSpanId,
      startTime: new Date(),
      tags: {
        operation,
        ...tags,
      },
      logs: [],
      status: 'active',
    };

    this.activeTraces.set(spanId, trace);

    this.emit('trace:started', trace);
    this.logger.debug('Trace span started', {
      traceId,
      spanId,
      operation,
      parentSpanId,
    });

    return trace;
  }

  /**
   * End a trace span
   */
  endSpan(spanId: string, status: 'completed' | 'failed' = 'completed'): void {
    if (!this.config.enableTracing) {
      return;
    }

    const trace = this.activeTraces.get(spanId);
    if (!trace) {
      this.logger.warn('Attempted to end non-existent trace span', { spanId });
      return;
    }

    trace.endTime = new Date();
    trace.duration = trace.endTime.getTime() - trace.startTime.getTime();
    trace.status = status;

    this.activeTraces.delete(spanId);
    this.completedTraces.push(trace);

    // Maintain history limit
    if (this.completedTraces.length > this.config.maxTraceHistory) {
      this.completedTraces.shift();
    }

    this.emit('trace:ended', trace);
    this.logger.debug('Trace span ended', {
      traceId: trace.traceId,
      spanId,
      duration: trace.duration,
      status,
    });
  }

  /**
   * Add log to trace span
   */
  addTraceLog(
    spanId: string,
    level: TraceLog['level'],
    message: string,
    fields: Record<string, any> = {}
  ): void {
    const trace = this.activeTraces.get(spanId);
    if (!trace) {
      return;
    }

    trace.logs.push({
      timestamp: new Date(),
      level,
      message,
      fields,
    });
  }

  /**
   * Add tags to trace span
   */
  addTraceTags(spanId: string, tags: Record<string, string | number | boolean>): void {
    const trace = this.activeTraces.get(spanId);
    if (!trace) {
      return;
    }

    Object.assign(trace.tags, tags);
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): TraceContext | undefined {
    // Check active traces
    for (const trace of this.activeTraces.values()) {
      if (trace.traceId === traceId) {
        return trace;
      }
    }

    // Check completed traces
    return this.completedTraces.find(t => t.traceId === traceId);
  }

  /**
   * Get all traces for correlation ID
   */
  getTracesByCorrelation(correlationId: string): TraceContext[] {
    return this.completedTraces.filter(
      t => t.tags.correlationId === correlationId
    );
  }

  // ============================================================================
  // Metrics Collection
  // ============================================================================

  /**
   * Record a counter metric (increments)
   */
  recordCounter(name: string, value: number = 1, tags: Record<string, string> = {}): void {
    if (!this.config.enableMetrics) {
      return;
    }

    const metric: MetricPoint = {
      name,
      value,
      timestamp: new Date(),
      tags,
      type: 'counter',
    };

    this.storeMetric(name, metric);
    this.emit('metric:counter', metric);
  }

  /**
   * Record a gauge metric (point-in-time value)
   */
  recordGauge(name: string, value: number, tags: Record<string, string> = {}): void {
    if (!this.config.enableMetrics) {
      return;
    }

    const metric: MetricPoint = {
      name,
      value,
      timestamp: new Date(),
      tags,
      type: 'gauge',
    };

    this.storeMetric(name, metric);
    this.emit('metric:gauge', metric);
  }

  /**
   * Record a timer metric (duration)
   */
  recordTimer(name: string, durationMs: number, tags: Record<string, string> = {}): void {
    if (!this.config.enableMetrics) {
      return;
    }

    const metric: MetricPoint = {
      name,
      value: durationMs,
      timestamp: new Date(),
      tags,
      type: 'timer',
    };

    this.storeMetric(name, metric);

    // Add to latency buffer for percentile calculations
    if (!this.latencyBuffer.has(name)) {
      this.latencyBuffer.set(name, []);
    }
    this.latencyBuffer.get(name)!.push(durationMs);

    this.emit('metric:timer', metric);
  }

  /**
   * Record a histogram metric
   */
  recordHistogram(name: string, value: number, tags: Record<string, string> = {}): void {
    if (!this.config.enableMetrics) {
      return;
    }

    const metric: MetricPoint = {
      name,
      value,
      timestamp: new Date(),
      tags,
      type: 'histogram',
    };

    this.storeMetric(name, metric);
    this.emit('metric:histogram', metric);
  }

  /**
   * Get latency metrics for operation
   */
  getLatencyMetrics(operationName: string): LatencyMetrics | null {
    const latencies = this.latencyBuffer.get(operationName);
    if (!latencies || latencies.length === 0) {
      return null;
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      p50: this.percentile(sorted, 0.5),
      p90: this.percentile(sorted, 0.9),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      mean: sorted.reduce((sum, val) => sum + val, 0) / count,
      min: sorted[0],
      max: sorted[count - 1],
      count,
    };
  }

  /**
   * Get throughput metrics for operation
   */
  getThroughputMetrics(operationName: string, windowMs: number = 60000): ThroughputMetrics {
    const now = Date.now();
    const windowStart = now - windowMs;

    const metrics = this.metrics.get(operationName) || [];
    const recentMetrics = metrics.filter(
      m => m.timestamp.getTime() >= windowStart
    );

    const totalRequests = recentMetrics.length;
    const successfulRequests = recentMetrics.filter(
      m => m.tags.status === 'success'
    ).length;
    const failedRequests = totalRequests - successfulRequests;

    const requestsPerSecond = (totalRequests / windowMs) * 1000;
    const successRate = totalRequests > 0 ? successfulRequests / totalRequests : 0;
    const failureRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      requestsPerSecond,
      successRate,
      failureRate,
    };
  }

  /**
   * Get all metrics for a name
   */
  getMetrics(name: string, windowMs?: number): MetricPoint[] {
    const metrics = this.metrics.get(name) || [];

    if (!windowMs) {
      return metrics;
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    return metrics.filter(m => m.timestamp.getTime() >= windowStart);
  }

  // ============================================================================
  // Structured Logging
  // ============================================================================

  /**
   * Write structured log entry
   */
  log(
    level: StructuredLogEntry['level'],
    message: string,
    correlationId: string,
    fields: Record<string, any> = {}
  ): void {
    if (!this.config.enableStructuredLogging) {
      return;
    }

    const entry: StructuredLogEntry = {
      timestamp: new Date(),
      level,
      message,
      correlationId,
      traceId: fields.traceId,
      workerId: fields.workerId,
      taskId: fields.taskId,
      fields,
    };

    this.logBuffer.push(entry);

    // Maintain buffer limit
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.shift();
    }

    this.emit('log:entry', entry);

    // Also log to standard logger
    this.logger[level](message, fields);
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count: number = 100, level?: StructuredLogEntry['level']): StructuredLogEntry[] {
    let logs = this.logBuffer;

    if (level) {
      logs = logs.filter(l => l.level === level);
    }

    return logs.slice(-count);
  }

  /**
   * Get logs by correlation ID
   */
  getLogsByCorrelation(correlationId: string): StructuredLogEntry[] {
    return this.logBuffer.filter(l => l.correlationId === correlationId);
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  /**
   * Initialize telemetry system
   */
  initialize(): void {
    this.logger.info('Initializing telemetry system', {
      config: this.config,
    });

    if (this.config.enableMetrics) {
      this.startMetricsFlush();
    }

    this.emit('telemetry:initialized');
  }

  /**
   * Shutdown telemetry system
   */
  shutdown(): void {
    this.logger.info('Shutting down telemetry system');

    if (this.metricsFlushTimer) {
      clearInterval(this.metricsFlushTimer);
      this.metricsFlushTimer = undefined;
    }

    // Flush final metrics
    this.flushMetrics();

    // Clear buffers
    this.activeTraces.clear();
    this.completedTraces.length = 0;
    this.metrics.clear();
    this.latencyBuffer.clear();
    this.logBuffer.length = 0;

    // Clean up event listeners
    this.removeAllListeners();

    this.emit('telemetry:shutdown');
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  private storeMetric(name: string, metric: MetricPoint): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricsList = this.metrics.get(name)!;
    metricsList.push(metric);

    // Maintain history limit
    if (metricsList.length > this.config.maxMetricHistory) {
      metricsList.shift();
    }
  }

  private startMetricsFlush(): void {
    this.metricsFlushTimer = setInterval(() => {
      this.flushMetrics();
    }, this.config.metricsFlushInterval);
  }

  private flushMetrics(): void {
    const summary = this.getMetricsSummary();

    this.emit('metrics:flush', summary);

    this.logger.debug('Metrics flushed', {
      totalMetrics: summary.totalMetrics,
      metricNames: summary.metricNames,
    });
  }

  private getMetricsSummary(): {
    totalMetrics: number;
    metricNames: string[];
    byType: Record<string, number>;
  } {
    let totalMetrics = 0;
    const byType: Record<string, number> = {
      counter: 0,
      gauge: 0,
      timer: 0,
      histogram: 0,
    };

    for (const metricsList of this.metrics.values()) {
      totalMetrics += metricsList.length;
      for (const metric of metricsList) {
        byType[metric.type]++;
      }
    }

    return {
      totalMetrics,
      metricNames: Array.from(this.metrics.keys()),
      byType,
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  private createNoOpTrace(): TraceContext {
    return {
      traceId: 'noop',
      spanId: 'noop',
      startTime: new Date(),
      tags: {},
      logs: [],
      status: 'active',
    };
  }
}

// ============================================================================
// Global Telemetry Instance
// ============================================================================

let globalTelemetry: TelemetrySystem | undefined;

export function getGlobalTelemetry(): TelemetrySystem {
  if (!globalTelemetry) {
    globalTelemetry = new TelemetrySystem();
    globalTelemetry.initialize();
  }
  return globalTelemetry;
}

export function setGlobalTelemetry(telemetry: TelemetrySystem): void {
  globalTelemetry = telemetry;
}
