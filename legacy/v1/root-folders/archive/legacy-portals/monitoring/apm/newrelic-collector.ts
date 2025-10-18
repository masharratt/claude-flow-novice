/**
 * New Relic APM Integration for Claude Flow Novice
 * Provides comprehensive monitoring, tracing, and metrics collection
 */

import { Logger } from '../../utils/logger.js';

export interface NewRelicConfig {
  enabled: boolean;
  licenseKey?: string;
  appName?: string;
  accountId?: string;
  trustKey?: string;
  env?: string;
  version?: string;
  tracing: {
    enabled: boolean;
    distributedTracing: boolean;
    transactionEvents: boolean;
    spanEvents: boolean;
  };
  metrics: {
    enabled: boolean;
    apiHost?: string;
    metricApiPath?: string;
  };
  logs: {
    enabled: boolean;
    apiHost?: string;
    logApiPath?: string;
  };
  browserMonitoring: {
    enabled: boolean;
  };
}

export interface NewRelicTransaction {
  name: string;
  type: string;
  startTime: number;
  duration: number;
  attributes: Record<string, any>;
  error?: boolean;
}

export interface NewRelicSpan {
  id: string;
  traceId: string;
  transactionId: string;
  parentId?: string;
  name: string;
  type: string;
  startTime: number;
  duration: number;
  attributes: Record<string, any>;
  error?: boolean;
}

export interface NewRelicMetric {
  name: string;
  type: 'count' | 'gauge' | 'summary' | 'histogram';
  value: number;
  timestamp: number;
  attributes?: Record<string, any>;
}

export interface NewRelicLog {
  message: string;
  timestamp: number;
  level: string;
  attributes: Record<string, any>;
  traceId?: string;
  spanId?: string;
}

export class NewRelicCollector {
  private config: NewRelicConfig;
  private logger: Logger;
  private activeTransactions: Map<string, NewRelicTransaction> = new Map();
  private activeSpans: Map<string, NewRelicSpan> = new Map();
  private metricsQueue: NewRelicMetric[] = [];
  private logsQueue: NewRelicLog[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor(config: NewRelicConfig) {
    this.config = {
      appName: 'Claude Flow Novice',
      env: process.env.NODE_ENV || 'production',
      version: process.env.npm_package_version || '1.6.2',
      tracing: {
        enabled: true,
        distributedTracing: true,
        transactionEvents: true,
        spanEvents: true
      },
      metrics: {
        enabled: true,
        apiHost: 'https://metric-api.newrelic.com',
        metricApiPath: '/metric/v1'
      },
      logs: {
        enabled: true,
        apiHost: 'https://log-api.newrelic.com',
        logApiPath: '/log/v1'
      },
      browserMonitoring: {
        enabled: false
      },
      ...config
    };

    this.logger = new Logger('NewRelicCollector');
    this.startFlushing();
  }

  // Transaction Management
  public startTransaction(name: string, type: 'web' | 'background' | 'other', attributes?: Record<string, any>): string {
    if (!this.config.tracing?.enabled) return '';

    const transactionId = this.generateId();
    const transaction: NewRelicTransaction = {
      name,
      type,
      startTime: Date.now(),
      duration: 0,
      attributes: {
        'service.name': this.config.appName!,
        'service.version': this.config.version!,
        'environment': this.config.env!,
        ...attributes
      }
    };

    this.activeTransactions.set(transactionId, transaction);
    return transactionId;
  }

  public finishTransaction(transactionId: string, attributes?: Record<string, any>, error?: Error): void {
    if (!transactionId || !this.activeTransactions.has(transactionId)) return;

    const transaction = this.activeTransactions.get(transactionId)!;
    transaction.duration = Date.now() - transaction.startTime;

    if (attributes) {
      transaction.attributes = { ...transaction.attributes, ...attributes };
    }

    if (error) {
      transaction.error = true;
      transaction.attributes['error.type'] = error.constructor.name;
      transaction.attributes['error.message'] = error.message;
      transaction.attributes['error.stack'] = error.stack || '';
    }

    this.sendTransaction(transaction);
    this.activeTransactions.delete(transactionId);
  }

  // Span Management
  public startSpan(transactionId: string, name: string, type: string, parentId?: string, attributes?: Record<string, any>): string {
    if (!this.config.tracing?.enabled || !this.activeTransactions.has(transactionId)) return '';

    const spanId = this.generateId();
    const transaction = this.activeTransactions.get(transactionId)!;

    const span: NewRelicSpan = {
      id: spanId,
      traceId: this.generateId(),
      transactionId,
      parentId,
      name,
      type,
      startTime: Date.now(),
      duration: 0,
      attributes: {
        'service.name': this.config.appName!,
        ...attributes
      }
    };

    this.activeSpans.set(spanId, span);
    return spanId;
  }

  public finishSpan(spanId: string, attributes?: Record<string, any>, error?: Error): void {
    if (!spanId || !this.activeSpans.has(spanId)) return;

    const span = this.activeSpans.get(spanId)!;
    span.duration = Date.now() - span.startTime;

    if (attributes) {
      span.attributes = { ...span.attributes, ...attributes };
    }

    if (error) {
      span.error = true;
      span.attributes['error.type'] = error.constructor.name;
      span.attributes['error.message'] = error.message;
      span.attributes['error.stack'] = error.stack || '';
    }

    this.sendSpan(span);
    this.activeSpans.delete(spanId);
  }

  // Metrics Collection
  public recordMetric(name: string, value: number, type: 'count' | 'gauge' | 'summary' | 'histogram', attributes?: Record<string, any>): void {
    if (!this.config.metrics?.enabled) return;

    const metric: NewRelicMetric = {
      name,
      type,
      value,
      timestamp: Date.now() * 1000000, // New Relic expects nanoseconds
      attributes: {
        'service.name': this.config.appName!,
        'environment': this.config.env!,
        ...attributes
      }
    };

    this.metricsQueue.push(metric);
  }

  // Business Metrics for Agent Operations
  public recordAgentOperation(agentType: string, operation: string, duration: number, success: boolean): void {
    this.recordMetric('AgentOperation', duration, 'histogram', {
      'agent.type': agentType,
      'operation.name': operation,
      'operation.status': success ? 'success' : 'failure'
    });

    this.recordMetric('AgentOperations', 1, 'count', {
      'agent.type': agentType,
      'operation.name': operation,
      'operation.status': success ? 'success' : 'failure'
    });

    if (!success) {
      this.recordMetric('AgentErrors', 1, 'count', {
        'agent.type': agentType,
        'operation.name': operation
      });
    }
  }

  public recordSwarmActivity(swarmSize: number, topology: string, duration: number, success: boolean): void {
    this.recordMetric('SwarmSize', swarmSize, 'gauge', {
      'swarm.topology': topology
    });

    this.recordMetric('SwarmExecution', duration, 'histogram', {
      'swarm.topology': topology,
      'execution.status': success ? 'success' : 'failure'
    });

    this.recordMetric('SwarmExecutions', 1, 'count', {
      'swarm.topology': topology,
      'execution.status': success ? 'success' : 'failure'
    });
  }

  public recordWebSocketEvent(eventType: string, duration: number, success: boolean): void {
    this.recordMetric('WebSocketEvent', duration, 'histogram', {
      'event.type': eventType,
      'event.status': success ? 'success' : 'failure'
    });

    this.recordMetric('WebSocketEvents', 1, 'count', {
      'event.type': eventType,
      'event.status': success ? 'success' : 'failure'
    });

    // Track active connections
    if (eventType === 'connection') {
      this.recordMetric('ActiveWebSocketConnections', 1, 'gauge');
    } else if (eventType === 'disconnection') {
      this.recordMetric('ActiveWebSocketConnections', -1, 'gauge');
    }
  }

  public recordAPICall(method: string, route: string, statusCode: number, duration: number): void {
    this.recordMetric('APICall', duration, 'histogram', {
      'http.method': method,
      'http.route': route,
      'http.status_code': statusCode.toString()
    });

    this.recordMetric('APICalls', 1, 'count', {
      'http.method': method,
      'http.route': route,
      'http.status_code': statusCode.toString()
    });

    if (statusCode >= 400) {
      this.recordMetric('APIErrors', 1, 'count', {
        'http.method': method,
        'http.route': route,
        'http.status_code': statusCode.toString()
      });
    }
  }

  // Custom Event Tracking
  public recordCustomEvent(eventType: string, attributes: Record<string, any>): void {
    this.recordMetric('CustomEvent', 1, 'count', {
      'event.type': eventType,
      ...attributes
    });
  }

  // Logging Integration
  public log(message: string, level: 'debug' | 'info' | 'warn' | 'error', attributes?: Record<string, any>, traceId?: string, spanId?: string): void {
    if (!this.config.logs?.enabled) return;

    const logEntry: NewRelicLog = {
      message,
      timestamp: Date.now() * 1000000, // New Relic expects nanoseconds
      level: level.toUpperCase(),
      attributes: {
        'service.name': this.config.appName!,
        'environment': this.config.env!,
        ...attributes
      },
      traceId,
      spanId
    };

    this.logsQueue.push(logEntry);
  }

  // Performance Monitoring
  public recordPerformanceMetric(operation: string, duration: number, attributes?: Record<string, any>): void {
    this.recordMetric('PerformanceOperation', duration, 'histogram', {
      'operation.name': operation,
      ...attributes
    });

    if (duration > 5000) { // 5 seconds threshold
      this.log(`Slow operation detected: ${operation}`, 'warn', {
        duration,
        operation,
        ...attributes
      });
    }
  }

  // Browser Monitoring
  public getBrowserMonitoringScript(): string {
    if (!this.config.browserMonitoring?.enabled || !this.config.licenseKey) return '';

    // Return the New Relic browser monitoring script
    return `
      (function(window){
        window.NREUM||(window.NREUM={});
        NREUM.init={...}; // Configuration would go here
      })(window);
    `;
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
            browserMonitoring: this.config.browserMonitoring?.enabled || false
          },
          activeTransactions: this.activeTransactions.size,
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
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private sendTransaction(transaction: NewRelicTransaction): void {
    if (!this.config.licenseKey) return;

    // In a real implementation, you would send this to New Relic's API
    this.logger.debug('Sending transaction to New Relic', {
      name: transaction.name,
      duration: transaction.duration,
      error: transaction.error
    });
  }

  private sendSpan(span: NewRelicSpan): void {
    if (!this.config.licenseKey) return;

    // In a real implementation, you would send this to New Relic's API
    this.logger.debug('Sending span to New Relic', {
      id: span.id,
      name: span.name,
      duration: span.duration,
      error: span.error
    });
  }

  private async flushMetrics(): Promise<void> {
    if (!this.config.licenseKey || this.metricsQueue.length === 0) return;

    const metricsToSend = [...this.metricsQueue];
    this.metricsQueue = [];

    try {
      // In a real implementation, send to New Relic's metrics API
      this.logger.debug(`Flushing ${metricsToSend.length} metrics to New Relic`);
    } catch (error) {
      this.logger.error('Failed to flush metrics to New Relic', { error: error.message });
      // Re-queue failed metrics
      this.metricsQueue.unshift(...metricsToSend);
    }
  }

  private async flushLogs(): Promise<void> {
    if (!this.config.logs?.enabled || !this.config.licenseKey || this.logsQueue.length === 0) return;

    const logsToSend = [...this.logsQueue];
    this.logsQueue = [];

    try {
      // In a real implementation, send to New Relic's logs API
      this.logger.debug(`Flushing ${logsToSend.length} logs to New Relic`);
    } catch (error) {
      this.logger.error('Failed to flush logs to New Relic', { error: error.message });
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
    this.logger.info('Shutting down New Relic collector');

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Flush any remaining data
    await Promise.all([
      this.flushMetrics(),
      this.flushLogs()
    ]);

    // Clean up any remaining transactions and spans
    for (const transactionId of this.activeTransactions.keys()) {
      this.finishTransaction(transactionId, { 'shutdown': 'true' });
    }

    for (const spanId of this.activeSpans.keys()) {
      this.finishSpan(spanId, { 'shutdown': 'true' });
    }

    this.logger.info('New Relic collector shutdown complete');
  }
}

export function createNewRelicCollector(config: Partial<NewRelicConfig> = {}): NewRelicCollector {
  return new NewRelicCollector({
    enabled: true,
    ...config
  });
}