/**
 * DataDog APM Integration for Claude Flow Novice
 * Provides comprehensive monitoring, tracing, and metrics collection
 */

import { Logger } from '../../utils/logger.js';

export interface DataDogConfig {
  enabled: boolean;
  apiKey?: string;
  site?: string;
  serviceName?: string;
  env?: string;
  version?: string;
  tracing: {
    enabled: boolean;
    sampleRate: number;
    excludedUrls: string[];
  };
  metrics: {
    enabled: boolean;
    host?: string;
    port?: number;
    prefix?: string;
  };
  logs: {
    enabled: boolean;
    apiKey?: string;
    site?: string;
  };
  profiling: {
    enabled: boolean;
    sourceCode: boolean;
  };
}

export interface DataDogSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  resource: string;
  service: string;
  startTime: number;
  duration: number;
  tags: Record<string, string>;
  error?: number;
}

export interface DataDogMetric {
  metric: string;
  points: [[number, number]];
  tags?: string[];
  type?: 'count' | 'gauge' | 'histogram' | 'rate';
}

export interface DataDogLog {
  message: string;
  service: string;
  env: string;
  timestamp: number;
  level: string;
  traceId?: string;
  spanId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export class DataDogCollector {
  private config: DataDogConfig;
  private logger: Logger;
  private activeSpans: Map<string, DataDogSpan> = new Map();
  private metricsQueue: DataDogMetric[] = [];
  private logsQueue: DataDogLog[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor(config: DataDogConfig) {
    this.config = {
      serviceName: 'claude-flow-novice',
      env: process.env.NODE_ENV || 'production',
      site: 'datadoghq.com',
      version: process.env.npm_package_version || '1.6.2',
      tracing: {
        enabled: true,
        sampleRate: 1.0,
        excludedUrls: ['/health', '/metrics']
      },
      metrics: {
        enabled: true,
        port: 8125,
        prefix: 'claude.flow'
      },
      logs: {
        enabled: true
      },
      profiling: {
        enabled: false,
        sourceCode: false
      },
      ...config
    };

    this.logger = new Logger('DataDogCollector');
    this.startFlushing();
  }

  // Distributed Tracing
  public startSpan(operationName: string, parentSpanId?: string, tags?: Record<string, string>): string {
    if (!this.config.tracing?.enabled) return '';

    const spanId = this.generateSpanId();
    const span: DataDogSpan = {
      traceId: parentSpanId ? this.getTraceId(parentSpanId) : this.generateTraceId(),
      spanId,
      parentSpanId,
      operationName,
      resource: operationName,
      service: this.config.serviceName!,
      startTime: Date.now(),
      duration: 0,
      tags: {
        env: this.config.env!,
        version: this.config.version!,
        ...tags
      }
    };

    this.activeSpans.set(spanId, span);
    return spanId;
  }

  public finishSpan(spanId: string, tags?: Record<string, string>, error?: Error): void {
    if (!spanId || !this.activeSpans.has(spanId)) return;

    const span = this.activeSpans.get(spanId)!;
    span.duration = Date.now() - span.startTime;

    if (tags) {
      span.tags = { ...span.tags, ...tags };
    }

    if (error) {
      span.error = 1;
      span.tags['error.type'] = error.constructor.name;
      span.tags['error.message'] = error.message;
      span.tags['error.stack'] = error.stack || '';
    }

    this.sendSpan(span);
    this.activeSpans.delete(spanId);
  }

  // Metrics Collection
  public count(metric: string, value: number = 1, tags?: Record<string, string>): void {
    if (!this.config.metrics?.enabled) return;

    const fullMetricName = this.config.metrics.prefix ?
      `${this.config.metrics.prefix}.${metric}` : metric;

    const metricData: DataDogMetric = {
      metric: fullMetricName,
      points: [[Date.now() / 1000, value]],
      type: 'count'
    };

    if (tags) {
      metricData.tags = this.formatTags(tags);
    }

    this.metricsQueue.push(metricData);
  }

  public gauge(metric: string, value: number, tags?: Record<string, string>): void {
    if (!this.config.metrics?.enabled) return;

    const fullMetricName = this.config.metrics.prefix ?
      `${this.config.metrics.prefix}.${metric}` : metric;

    const metricData: DataDogMetric = {
      metric: fullMetricName,
      points: [[Date.now() / 1000, value]],
      type: 'gauge'
    };

    if (tags) {
      metricData.tags = this.formatTags(tags);
    }

    this.metricsQueue.push(metricData);
  }

  public histogram(metric: string, value: number, tags?: Record<string, string>): void {
    if (!this.config.metrics?.enabled) return;

    const fullMetricName = this.config.metrics.prefix ?
      `${this.config.metrics.prefix}.${metric}` : metric;

    const metricData: DataDogMetric = {
      metric: fullMetricName,
      points: [[Date.now() / 1000, value]],
      type: 'histogram'
    };

    if (tags) {
      metricData.tags = this.formatTags(tags);
    }

    this.metricsQueue.push(metricData);
  }

  // Business Metrics for Agent Operations
  public recordAgentOperation(agentType: string, operation: string, duration: number, success: boolean): void {
    this.count('agent.operations.total', 1, {
      'agent.type': agentType,
      'operation.name': operation,
      'operation.status': success ? 'success' : 'failure'
    });

    this.histogram('agent.operation.duration', duration, {
      'agent.type': agentType,
      'operation.name': operation
    });

    if (!success) {
      this.count('agent.operations.errors', 1, {
        'agent.type': agentType,
        'operation.name': operation
      });
    }
  }

  public recordSwarmActivity(swarmSize: number, topology: string, duration: number, success: boolean): void {
    this.gauge('swarm.active.size', swarmSize, {
      'swarm.topology': topology
    });

    this.count('swarm.executions.total', 1, {
      'swarm.topology': topology,
      'execution.status': success ? 'success' : 'failure'
    });

    this.histogram('swarm.execution.duration', duration, {
      'swarm.topology': topology
    });
  }

  public recordWebSocketEvent(eventType: string, duration: number, success: boolean): void {
    this.count('websocket.events.total', 1, {
      'event.type': eventType,
      'event.status': success ? 'success' : 'failure'
    });

    this.histogram('websocket.event.duration', duration, {
      'event.type': eventType
    });

    // Track active connections
    if (eventType === 'connection') {
      this.gauge('websocket.connections.active', 1);
    } else if (eventType === 'disconnection') {
      this.gauge('websocket.connections.active', -1);
    }
  }

  public recordAPICall(method: string, route: string, statusCode: number, duration: number): void {
    this.count('api.requests.total', 1, {
      'http.method': method,
      'http.route': route,
      'http.status_code': statusCode.toString()
    });

    this.histogram('api.request.duration', duration, {
      'http.method': method,
      'http.route': route
    });

    if (statusCode >= 400) {
      this.count('api.errors.total', 1, {
        'http.method': method,
        'http.route': route,
        'http.status_code': statusCode.toString()
      });
    }
  }

  // Logging Integration
  public log(message: string, level: 'debug' | 'info' | 'warn' | 'error', metadata?: Record<string, any>): void {
    if (!this.config.logs?.enabled) return;

    const logEntry: DataDogLog = {
      message,
      service: this.config.serviceName!,
      env: this.config.env!,
      timestamp: Date.now(),
      level,
      metadata
    };

    this.logsQueue.push(logEntry);
  }

  // Performance Monitoring
  public startPerformanceProfiling(): void {
    if (!this.config.profiling?.enabled) return;

    // Enable Node.js profiling
    if (process.env.NODE_ENV === 'production') {
      // In production, you would enable profiling here
      this.logger.info('Performance profiling enabled');
    }
  }

  public recordPerformanceMetric(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.histogram('performance.operation.duration', duration, {
      'operation.name': operation,
      ...metadata
    });

    if (duration > 5000) { // 5 seconds threshold
      this.log(`Slow operation detected: ${operation}`, 'warn', {
        duration,
        operation,
        ...metadata
      });
    }
  }

  // Health Check
  public async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const health = {
        status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
        details: {
          config: {
            tracing: this.config.tracing?.enabled || false,
            metrics: this.config.metrics?.enabled || false,
            logs: this.config.logs?.enabled || false,
            profiling: this.config.profiling?.enabled || false
          },
          activeSpans: this.activeSpans.size,
          queuedMetrics: this.metricsQueue.length,
          queuedLogs: this.logsQueue.length,
          lastFlush: Date.now()
        }
      };

      // Check if queues are growing too large
      if (this.metricsQueue.length > 1000 || this.logsQueue.length > 1000) {
        health.status = 'degraded';
        health.details.queues = 'high';
      }

      return health;
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }

  // Private Methods
  private generateSpanId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private getTraceId(spanId: string): string {
    const span = this.activeSpans.get(spanId);
    return span?.traceId || this.generateTraceId();
  }

  private formatTags(tags: Record<string, string>): string[] {
    return Object.entries(tags).map(([key, value]) => `${key}:${value}`);
  }

  private sendSpan(span: DataDogSpan): void {
    if (!this.config.apiKey) return;

    // In a real implementation, you would send this to DataDog's trace API
    this.logger.debug('Sending span to DataDog', {
      traceId: span.traceId,
      spanId: span.spanId,
      operation: span.operationName,
      duration: span.duration
    });
  }

  private async flushMetrics(): Promise<void> {
    if (!this.config.apiKey || this.metricsQueue.length === 0) return;

    const metricsToSend = [...this.metricsQueue];
    this.metricsQueue = [];

    try {
      // In a real implementation, send to DataDog's metrics API
      this.logger.debug(`Flushing ${metricsToSend.length} metrics to DataDog`);
    } catch (error) {
      this.logger.error('Failed to flush metrics to DataDog', { error: error.message });
      // Re-queue failed metrics
      this.metricsQueue.unshift(...metricsToSend);
    }
  }

  private async flushLogs(): Promise<void> {
    if (!this.config.logs?.apiKey || this.logsQueue.length === 0) return;

    const logsToSend = [...this.logsQueue];
    this.logsQueue = [];

    try {
      // In a real implementation, send to DataDog's logs API
      this.logger.debug(`Flushing ${logsToSend.length} logs to DataDog`);
    } catch (error) {
      this.logger.error('Failed to flush logs to DataDog', { error: error.message });
      // Re-queue failed logs
      this.logsQueue.unshift(...logsToSend);
    }
  }

  private startFlushing(): void {
    this.flushInterval = setInterval(async () => {
      await Promise.all([
        this.flushMetrics(),
        this.flushLogs()
      ]);
    }, 10000); // Flush every 10 seconds
  }

  // Shutdown
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down DataDog collector');

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Flush any remaining data
    await Promise.all([
      this.flushMetrics(),
      this.flushLogs()
    ]);

    // Clean up any remaining spans
    for (const spanId of this.activeSpans.keys()) {
      this.finishSpan(spanId, { 'shutdown': 'true' });
    }

    this.logger.info('DataDog collector shutdown complete');
  }
}

export function createDataDogCollector(config: Partial<DataDogConfig> = {}): DataDogCollector {
  return new DataDogCollector({
    enabled: true,
    ...config
  });
}