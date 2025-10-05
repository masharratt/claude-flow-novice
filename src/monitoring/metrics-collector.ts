// Metrics collection system for Claude Flow Novice
// Integrates with Prometheus, DataDog, and New Relic

import { createPrometheusMetrics } from './prometheus-collector';
import { createDataDogMetrics } from './datadog-collector';
import { createNewRelicMetrics } from './newrelic-collector';
import { Logger } from '../utils/logger';

export interface MetricsConfig {
  enabled: boolean;
  providers: {
    prometheus?: {
      enabled: boolean;
      port: number;
      endpoint: string;
    };
    datadog?: {
      enabled: boolean;
      apiKey: string;
      site: string;
      prefix: string;
    };
    newrelic?: {
      enabled: boolean;
      licenseKey: string;
      appName: string;
    };
  };
  customMetrics?: Record<string, MetricDefinition>;
}

export interface MetricDefinition {
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  name: string;
  description: string;
  labels?: string[];
  buckets?: number[];
  percentiles?: number[];
}

export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

export class MetricsCollector {
  private config: MetricsConfig;
  private logger: Logger;
  private prometheusCollector?: any;
  private dataDogCollector?: any;
  private newRelicCollector?: any;
  private customMetrics: Map<string, MetricDefinition> = new Map();

  constructor(config: MetricsConfig) {
    this.config = config;
    this.logger = new Logger('MetricsCollector');

    this.initializeCollectors();
    this.registerCustomMetrics();
  }

  private initializeCollectors(): void {
    if (this.config.providers.prometheus?.enabled) {
      this.prometheusCollector = createPrometheusMetrics(this.config.providers.prometheus);
      this.logger.info('Prometheus metrics collector initialized');
    }

    if (this.config.providers.datadog?.enabled) {
      this.dataDogCollector = createDataDogMetrics(this.config.providers.datadog);
      this.logger.info('DataDog metrics collector initialized');
    }

    if (this.config.providers.newrelic?.enabled) {
      this.newRelicCollector = createNewRelicMetrics(this.config.providers.newrelic);
      this.logger.info('New Relic metrics collector initialized');
    }
  }

  private registerCustomMetrics(): void {
    if (!this.config.customMetrics) return;

    for (const [name, definition] of Object.entries(this.config.customMetrics)) {
      this.registerMetric(definition);
    }
  }

  public registerMetric(definition: MetricDefinition): void {
    this.customMetrics.set(definition.name, definition);

    // Register with each provider
    if (this.prometheusCollector) {
      this.prometheusCollector.registerMetric(definition);
    }
    if (this.dataDogCollector) {
      this.dataDogCollector.registerMetric(definition);
    }
    if (this.newRelicCollector) {
      this.newRelicCollector.registerMetric(definition);
    }
  }

  public increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.sendToAllProviders('increment', name, value, labels);
  }

  public gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.sendToAllProviders('gauge', name, value, labels);
  }

  public histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.sendToAllProviders('histogram', name, value, labels);
  }

  public timing(name: string, value: number, labels?: Record<string, string>): void {
    this.sendToAllProviders('timing', name, value, labels);
  }

  private sendToAllProviders(
    type: 'increment' | 'gauge' | 'histogram' | 'timing',
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    try {
      if (this.prometheusCollector) {
        this.prometheusCollector[type](name, value, labels);
      }
      if (this.dataDogCollector) {
        this.dataDogCollector[type](name, value, labels);
      }
      if (this.newRelicCollector) {
        this.newRelicCollector[type](name, value, labels);
      }
    } catch (error) {
      this.logger.error('Failed to send metric to providers', { error, name, type });
    }
  }

  // HTTP request metrics
  public recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    userAgent?: string
  ): void {
    const labels = {
      method,
      route,
      status_code: statusCode.toString(),
      status_class: this.getStatusClass(statusCode),
      user_agent: userAgent ? this.getUserAgentCategory(userAgent) : 'unknown'
    };

    this.increment('http_requests_total', 1, labels);
    this.histogram('http_request_duration_seconds', duration, labels);

    if (statusCode >= 400) {
      this.increment('http_errors_total', 1, labels);
    }
  }

  // Business metrics
  public recordAgentOperation(
    agentType: string,
    operation: string,
    duration: number,
    success: boolean,
    errorType?: string
  ): void {
    const labels = {
      agent_type: agentType,
      operation,
      success: success.toString()
    };

    this.increment('agent_operations_total', 1, labels);
    this.histogram('agent_operation_duration_seconds', duration, labels);

    if (!success && errorType) {
      this.increment('agent_errors_total', 1, { ...labels, error_type: errorType });
    }
  }

  public recordSwarmActivity(
    swarmSize: number,
    topology: string,
    duration: number,
    success: boolean
  ): void {
    const labels = {
      topology,
      success: success.toString()
    };

    this.gauge('active_swarm_size', swarmSize);
    this.increment('swarm_executions_total', 1, labels);
    this.histogram('swarm_execution_duration_seconds', duration, labels);
  }

  // System metrics
  public recordMemoryUsage(used: number, total: number, component: string): void {
    const labels = { component };
    const usagePercent = (used / total) * 100;

    this.gauge('memory_usage_bytes', used, labels);
    this.gauge('memory_usage_percent', usagePercent, labels);
  }

  public recordCPUUsage(percent: number, component: string): void {
    this.gauge('cpu_usage_percent', percent, { component });
  }

  // Database metrics
  public recordDatabaseQuery(
    operation: string,
    table: string,
    duration: number,
    success: boolean,
    errorType?: string
  ): void {
    const labels = {
      operation,
      table,
      success: success.toString()
    };

    this.increment('database_queries_total', 1, labels);
    this.histogram('database_query_duration_seconds', duration, labels);

    if (!success && errorType) {
      this.increment('database_errors_total', 1, { ...labels, error_type: errorType });
    }
  }

  // Cache metrics
  public recordCacheOperation(
    operation: 'hit' | 'miss' | 'set' | 'delete',
    key: string,
    duration?: number
  ): void {
    const labels = {
      operation,
      key_prefix: key.split(':')[0] || 'unknown'
    };

    this.increment('cache_operations_total', 1, labels);

    if (duration) {
      this.histogram('cache_operation_duration_seconds', duration, labels);
    }
  }

  // Utility methods
  private getStatusClass(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return '2xx';
    if (statusCode >= 300 && statusCode < 400) return '3xx';
    if (statusCode >= 400 && statusCode < 500) return '4xx';
    if (statusCode >= 500) return '5xx';
    return 'unknown';
  }

  private getUserAgentCategory(userAgent: string): string {
    if (userAgent.includes('curl') || userAgent.includes('wget')) return 'cli';
    if (userAgent.includes('Mozilla')) return 'browser';
    if (userAgent.includes('bot') || userAgent.includes('crawler')) return 'bot';
    return 'other';
  }

  // Health check
  public async healthCheck(): Promise<{ status: string; providers: Record<string, boolean> }> {
    const providers: Record<string, boolean> = {};

    if (this.prometheusCollector) {
      try {
        await this.prometheusCollector.healthCheck();
        providers.prometheus = true;
      } catch {
        providers.prometheus = false;
      }
    }

    if (this.dataDogCollector) {
      try {
        await this.dataDogCollector.healthCheck();
        providers.datadog = true;
      } catch {
        providers.datadog = false;
      }
    }

    if (this.newRelicCollector) {
      try {
        await this.newRelicCollector.healthCheck();
        providers.newrelic = true;
      } catch {
        providers.newrelic = false;
      }
    }

    const allHealthy = Object.values(providers).every(status => status);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      providers
    };
  }

  // Shutdown
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down metrics collector');

    if (this.prometheusCollector) {
      await this.prometheusCollector.shutdown();
    }
    if (this.dataDogCollector) {
      await this.dataDogCollector.shutdown();
    }
    if (this.newRelicCollector) {
      await this.newRelicCollector.shutdown();
    }

    this.logger.info('Metrics collector shutdown complete');
  }
}

// Factory function
export function createMetricsCollector(config: MetricsConfig): MetricsCollector {
  return new MetricsCollector(config);
}

// Default configuration
export const defaultMetricsConfig: MetricsConfig = {
  enabled: true,
  providers: {
    prometheus: {
      enabled: true,
      port: 9090,
      endpoint: '/metrics'
    }
  },
  customMetrics: {
    claude_flow_operations_total: {
      type: 'counter',
      name: 'claude_flow_operations_total',
      description: 'Total number of Claude Flow operations',
      labels: ['operation_type', 'agent_type', 'status']
    },
    claude_flow_operation_duration: {
      type: 'histogram',
      name: 'claude_flow_operation_duration_seconds',
      description: 'Duration of Claude Flow operations',
      labels: ['operation_type', 'agent_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
    },
    active_agents_count: {
      type: 'gauge',
      name: 'active_agents_count',
      description: 'Number of currently active agents',
      labels: ['agent_type']
    }
  }
};