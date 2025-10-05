/**
 * APM Integration Main Entry Point
 * Exports all APM components for easy integration
 */

export { DataDogCollector, createDataDogCollector } from './datadog-collector.js';
export { NewRelicCollector, createNewRelicCollector } from './newrelic-collector.js';
export { DistributedTracer, createDistributedTracer } from './distributed-tracing.js';
export { PerformanceOptimizer, createPerformanceOptimizer } from './performance-optimizer.js';
export { APMIntegration, createAPMIntegration } from './apm-integration.js';

export type {
  DataDogConfig,
  DataDogSpan,
  DataDogMetric,
  DataDogLog
} from './datadog-collector.js';

export type {
  NewRelicConfig,
  NewRelicTransaction,
  NewRelicSpan,
  NewRelicMetric,
  NewRelicLog
} from './newrelic-collector.js';

export type {
  TraceContext,
  SpanOptions,
  DistributedTrace,
  TraceSpan,
  TraceLog
} from './distributed-tracing.js';

export type {
  PerformanceMetrics,
  OptimizationRecommendation,
  CacheStrategy,
  PerformanceThreshold
} from './performance-optimizer.js';

export type {
  APMIntegrationConfig,
  APMHealthStatus
} from './apm-integration.js';

// Default configuration factory
export function createDefaultAPMConfig(overrides: any = {}) {
  return {
    dataDog: {
      enabled: process.env.DATADOG_ENABLED === 'true',
      apiKey: process.env.DATADOG_API_KEY,
      site: process.env.DATADOG_SITE || 'datadoghq.com',
      serviceName: process.env.DATADOG_SERVICE_NAME || 'claude-flow-novice',
      env: process.env.NODE_ENV || 'production',
      version: process.env.npm_package_version || '1.6.2',
      tracing: {
        enabled: true,
        sampleRate: parseFloat(process.env.DATADOG_TRACE_SAMPLE_RATE || '1.0'),
        excludedUrls: ['/health', '/metrics']
      },
      metrics: {
        enabled: true,
        port: parseInt(process.env.DATADOG_METRICS_PORT || '8125'),
        prefix: 'claude.flow'
      },
      logs: {
        enabled: true,
        apiKey: process.env.DATADOG_LOG_API_KEY || process.env.DATADOG_API_KEY,
        site: process.env.DATADOG_SITE || 'datadoghq.com'
      },
      profiling: {
        enabled: process.env.DATADOG_PROFILING_ENABLED === 'true',
        sourceCode: false
      }
    },
    newRelic: {
      enabled: process.env.NEWRELIC_ENABLED === 'true',
      licenseKey: process.env.NEWRELIC_LICENSE_KEY,
      appName: process.env.NEWRELIC_APP_NAME || 'Claude Flow Novice',
      accountId: process.env.NEWRELIC_ACCOUNT_ID,
      trustKey: process.env.NEWRELIC_TRUST_KEY,
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
        apiHost: process.env.NEWRELIC_METRICS_API_HOST || 'https://metric-api.newrelic.com',
        metricApiPath: '/metric/v1'
      },
      logs: {
        enabled: true,
        apiHost: process.env.NEWRELIC_LOG_API_HOST || 'https://log-api.newrelic.com',
        logApiPath: '/log/v1'
      },
      browserMonitoring: {
        enabled: process.env.NEWRELIC_BROWSER_MONITORING_ENABLED === 'true'
      }
    },
    distributedTracing: {
      enabled: process.env.DISTRIBUTED_TRACING_ENABLED !== 'false',
      samplingRate: parseFloat(process.env.TRACE_SAMPLING_RATE || '1.0')
    },
    performanceOptimization: {
      enabled: process.env.PERFORMANCE_OPTIMIZATION_ENABLED !== 'false',
      monitoringInterval: parseInt(process.env.PERFORMANCE_MONITORING_INTERVAL || '5000')
    },
    customMetrics: {
      enabled: process.env.CUSTOM_METRICS_ENABLED !== 'false',
      interval: parseInt(process.env.CUSTOM_METRICS_INTERVAL || '10000')
    },
    alerting: {
      enabled: process.env.APM_ALERTING_ENABLED === 'true',
      webhookUrl: process.env.APM_WEBHOOK_URL,
      slackChannel: process.env.APM_SLACK_CHANNEL,
      emailRecipients: process.env.APM_EMAIL_RECIPIENTS?.split(',').filter(Boolean)
    },
    ...overrides
  };
}

// Convenience function for quick setup
export function setupAPM(configOverrides?: any) {
  const config = createDefaultAPMConfig(configOverrides);
  return createAPMIntegration(config);
}