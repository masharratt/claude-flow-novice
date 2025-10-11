# Advanced Application Performance Monitoring (APM) Integration Guide

This guide covers the comprehensive APM integration for Claude Flow Novice, including DataDog, New Relic, distributed tracing, and performance optimization.

## Overview

The APM integration provides:

- **Multi-platform monitoring**: DataDog and New Relic integration
- **Distributed tracing**: End-to-end tracing across microservices and agent swarms
- **Performance optimization**: Real-time monitoring and automatic recommendations
- **Business metrics**: Custom metrics for agent operations and swarm efficiency
- **Real-time analytics**: WebSocket-based real-time performance dashboard
- **Integration testing**: Automated testing of APM components
- **Disaster recovery**: Testing of monitoring system resilience

## Quick Start

### 1. Environment Configuration

Create a `.env` file with your APM configuration:

```bash
# DataDog Configuration
DATADOG_ENABLED=true
DATADOG_API_KEY=your-datadog-api-key
DATADOG_SITE=datadoghq.com
DATADOG_SERVICE_NAME=claude-flow-novice
DATADOG_TRACE_SAMPLE_RATE=1.0
DATADOG_PROFILING_ENABLED=false

# New Relic Configuration
NEWRELIC_ENABLED=true
NEWRELIC_LICENSE_KEY=your-newrelic-license-key
NEWRELIC_APP_NAME=Claude Flow Novice
NEWRELIC_ACCOUNT_ID=your-account-id
NEWRELIC_BROWSER_MONITORING_ENABLED=false

# Distributed Tracing
DISTRIBUTED_TRACING_ENABLED=true
TRACE_SAMPLING_RATE=1.0

# Performance Optimization
PERFORMANCE_OPTIMIZATION_ENABLED=true
PERFORMANCE_MONITORING_INTERVAL=5000

# Custom Metrics
CUSTOM_METRICS_ENABLED=true
CUSTOM_METRICS_INTERVAL=10000

# Alerting
APM_ALERTING_ENABLED=false
APM_WEBHOOK_URL=https://your-webhook-url
APM_SLACK_CHANNEL=#alerts
APM_EMAIL_RECIPIENTS=admin@example.com,dev@example.com
```

### 2. Basic Integration

```typescript
import { setupAPM } from './src/monitoring/apm/index.js';

// Initialize APM with default configuration
const apm = setupAPM();

// Trace agent lifecycle
apm.traceAgentLifecycle('coder', 'execute', 'agent-123', {
  task: 'implement-feature',
  complexity: 'medium'
});

// Trace swarm activity
apm.traceSwarmActivity('swarm-456', 'execute', 'mesh', 5, {
  epic: 'user-authentication',
  phase: 'implementation'
});

// Record custom business metrics
apm.recordBusinessMetric('feature_completion_rate', 87.5, {
  team: 'backend',
  sprint: 'sprint-12'
});
```

### 3. Dashboard Integration

```typescript
import { APMMonitor } from './src/web/dashboard/components/APMMonitor.tsx';

function Dashboard() {
  return (
    <div>
      <APMMonitor />
    </div>
  );
}
```

## DataDog Integration

### Configuration

```typescript
import { createDataDogCollector } from './src/monitoring/apm/datadog-collector.js';

const dataDogCollector = createDataDogCollector({
  enabled: true,
  apiKey: process.env.DATADOG_API_KEY,
  site: process.env.DATADOG_SITE || 'datadoghq.com',
  serviceName: 'claude-flow-novice',
  env: process.env.NODE_ENV || 'production',
  tracing: {
    enabled: true,
    sampleRate: 1.0,
    excludedUrls: ['/health', '/metrics']
  },
  metrics: {
    enabled: true,
    port: 8125,
    prefix: 'claude.flow'
  }
});
```

### Features

- **Custom Metrics**: Business metrics for agent operations
- **Distributed Tracing**: End-to-end trace propagation
- **APM Integration**: Application performance monitoring
- **Log Forwarding**: Centralized log management
- **Profiling**: Code profiling (optional)

### Example Usage

```typescript
// Record agent operation metrics
dataDogCollector.recordAgentOperation('coder', 'implement-feature', 1500, true);

// Record swarm activity
dataDogCollector.recordSwarmActivity(5, 'mesh', 10000, true);

// Record API calls
dataDogCollector.recordAPICall('POST', '/api/swarms', 200, 250);

// Record WebSocket events
dataDogCollector.recordWebSocketEvent('connection', 10, true);
```

## New Relic Integration

### Configuration

```typescript
import { createNewRelicCollector } from './src/monitoring/apm/newrelic-collector.js';

const newRelicCollector = createNewRelicCollector({
  enabled: true,
  licenseKey: process.env.NEWRELIC_LICENSE_KEY,
  appName: 'Claude Flow Novice',
  accountId: process.env.NEWRELIC_ACCOUNT_ID,
  tracing: {
    enabled: true,
    distributedTracing: true,
    transactionEvents: true,
    spanEvents: true
  },
  metrics: {
    enabled: true,
    apiHost: 'https://metric-api.newrelic.com'
  }
});
```

### Features

- **Transaction Tracing**: Web transaction monitoring
- **Distributed Tracing**: Cross-service trace visibility
- **Custom Events**: Business event tracking
- **Browser Monitoring**: Frontend performance (optional)
- **Log Integration**: Log forwarding and correlation

### Example Usage

```typescript
// Start a transaction
const transactionId = newRelicCollector.startTransaction(
  'Agent Execution',
  'background'
);

// Add spans for detailed operations
const spanId = newRelicCollector.startSpan(
  transactionId,
  'Code Implementation',
  'custom'
);

// Complete the span
newRelicCollector.finishSpan(spanId, {
  'agent.type': 'coder',
  'task.complexity': 'medium'
});

// Complete the transaction
newRelicCollector.finishTransaction(transactionId);
```

## Distributed Tracing

### Configuration

```typescript
import { createDistributedTracer } from './src/monitoring/apm/distributed-tracing.js';

const tracer = createDistributedTracer(
  dataDogCollector,
  newRelicCollector,
  { samplingRate: 1.0 }
);
```

### Features

- **Trace Propagation**: Automatic trace context propagation
- **Cross-Service Tracing**: Trace across microservices
- **Span Management**: Hierarchical span relationships
- **Context Injection/Extraction**: HTTP header-based propagation
- **Service Mapping**: Automatic service dependency mapping

### Example Usage

```typescript
// Start a new trace
const context = tracer.startTrace('agent-operation');

// Start child spans
const spanContext = tracer.startSpan(context, 'code-generation', {
  service: 'agent-service',
  tags: { 'agent.type': 'coder' }
});

// Extract trace context from incoming headers
const incomingContext = tracer.extractTraceContext({
  'x-trace-id': 'trace-123',
  'x-span-id': 'span-456'
});

// Inject trace context into outgoing requests
const headers = {};
tracer.injectTraceContext(context, headers);

// Complete spans
tracer.finishSpan(spanContext, { 'result': 'success' });
tracer.finishSpan(context);
```

## Performance Optimization

### Configuration

```typescript
import { createPerformanceOptimizer } from './src/monitoring/apm/performance-optimizer.js';

const optimizer = createPerformanceOptimizer(dataDogCollector, newRelicCollector);
```

### Features

- **Real-time Monitoring**: CPU, memory, event loop metrics
- **Automatic Recommendations**: Performance optimization suggestions
- **Cache Strategies**: Configurable caching with hit rate monitoring
- **Slow Query Detection**: Database performance monitoring
- **Threshold Alerting**: Configurable performance thresholds

### Example Usage

```typescript
// Get current performance metrics
const metrics = optimizer.getCurrentMetrics();

// Get optimization recommendations
const recommendations = optimizer.getRecommendations();

// Record slow query
optimizer.recordSlowQuery('SELECT * FROM large_table', 2500);

// Get cache hit rates
const cacheHitRates = optimizer.getCacheHitRates();

// Optimize WebSocket connections
optimizer.optimizeWebSocketConnections(activeConnections);
```

## WebSocket Integration

### Configuration

```typescript
import { createAPMWebSocketHandler } from './src/web/websocket/apm-websocket-handler.js';

const apmWebSocketHandler = createAPMWebSocketHandler(io, apmIntegration);
```

### Features

- **Real-time Updates**: Live performance metrics
- **Subscription Management**: Client-side subscription filtering
- **Filtering**: Client-specific metric filtering
- **Alert Broadcasting**: Real-time alert notifications
- **Performance Analytics**: Live performance data streaming

### WebSocket Events

```javascript
// Subscribe to specific metric types
socket.emit('subscribe', {
  subscriptions: ['health-status', 'performance-metrics', 'recommendations']
});

// Set filters for received data
socket.emit('set-filters', {
  components: ['dataDog', 'newRelic'],
  severity: ['high', 'critical'],
  timeRange: '1h'
});

// Request specific metrics
socket.emit('request-metrics', {
  timeRange: '6h',
  type: 'performance'
});

// Trace agent operations
socket.emit('trace-agent', {
  agentType: 'tester',
  lifecycleEvent: 'execute',
  agentId: 'agent-789',
  metadata: { testType: 'integration' }
});

// Run integration tests
socket.emit('run-integration-test');
```

## Integration Testing

### Running Tests

```typescript
// Run comprehensive integration tests
const results = await apm.runIntegrationTest();

console.log('Test Results:', results);
// Output: { status: 'passed', results: {...}, duration: 5234 }

// Run disaster recovery tests
const disasterResults = await apm.runDisasterRecoveryTest();

console.log('Disaster Recovery Results:', disasterResults);
```

### Test Scenarios

- **Component Health**: Tests health of each APM component
- **Metric Collection**: Validates metric collection and forwarding
- **Tracing**: Tests distributed tracing functionality
- **Performance**: Tests performance under load
- **Outage Handling**: Tests behavior during provider outages
- **Memory Stress**: Tests memory usage under stress

## Performance SLA Monitoring

### SLA Configuration

```typescript
// Define performance SLAs
const performanceSLAs = {
  responseTime: {
    target: 200, // ms
    warning: 500,
    critical: 1000
  },
  errorRate: {
    target: 0.01, // 1%
    warning: 0.05,
    critical: 0.1
  },
  throughput: {
    target: 1000, // requests/sec
    warning: 500,
    critical: 100
  }
};
```

### SLA Monitoring

```typescript
// Monitor SLA compliance
function checkSLACompliance(metrics: PerformanceMetrics) {
  const compliance = {
    responseTime: metrics.averageResponseTime <= performanceSLAs.responseTime.target,
    errorRate: metrics.errorRate <= performanceSLAs.errorRate.target,
    throughput: metrics.requestsPerSecond >= performanceSLAs.throughput.target
  };

  if (!compliance.responseTime) {
    apm.recordBusinessMetric('sla_violation', 1, {
      type: 'response_time',
      value: metrics.averageResponseTime
    });
  }

  return compliance;
}
```

## Production Deployment

### Environment Variables

```bash
# Production Configuration
NODE_ENV=production
DATADOG_ENABLED=true
NEWRELIC_ENABLED=true
DISTRIBUTED_TRACING_ENABLED=true
PERFORMANCE_OPTIMIZATION_ENABLED=true
CUSTOM_METRICS_ENABLED=true
APM_ALERTING_ENABLED=true

# Performance Tuning
PERFORMANCE_MONITORING_INTERVAL=5000
CUSTOM_METRICS_INTERVAL=10000
TRACE_SAMPLING_RATE=0.1  # Sample 10% of traces in production
```

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:20-alpine

# Install DataDog agent
RUN DD_API_KEY=$DATADOG_API_KEY DD_SITE=$DATADOG_SITE \
    bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script.sh)"

# Install New Relic agent
RUN NRIA_LICENSE_KEY=$NEWRELIC_LICENSE_KEY \
    bash -c "$(curl -L https://download.newrelic.com/install/newrelic-cli/scripts/install.sh)"

EXPOSE 3000

CMD ["npm", "start"]
```

### Kubernetes Deployment

```yaml
# apm-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-flow-novice
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-flow-novice
  template:
    metadata:
      labels:
        app: claude-flow-novice
      annotations:
        ad.datadoghq.com/claude-flow-novice.checks: |
          [
            {
              "name": "openmetrics",
              "http_check": {
                "url": "http://%%host%%:3000/metrics",
                "timeout": 5
              }
            }
          ]
    spec:
      containers:
      - name: claude-flow-novice
        image: claude-flow-novice:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATADOG_ENABLED
          value: "true"
        - name: NEWRELIC_ENABLED
          value: "true"
        resources:
          limits:
            memory: "1Gi"
            cpu: "500m"
          requests:
            memory: "512Mi"
            cpu: "250m"
```

## Troubleshooting

### Common Issues

1. **Missing Metrics**: Check API keys and configuration
2. **High Memory Usage**: Adjust sampling rates and monitoring intervals
3. **Trace Correlation**: Ensure proper header propagation
4. **WebSocket Connection**: Check firewall and CORS settings

### Debug Mode

```typescript
// Enable debug logging
const apm = setupAPM({
  dataDog: {
    enabled: true,
    debug: true
  },
  newRelic: {
    enabled: true,
    debug: true
  }
});
```

### Health Check

```bash
# Check APM health status
curl http://localhost:3000/api/apm/health

# Check performance metrics
curl http://localhost:3000/api/apm/metrics?timeRange=1h

# Run integration tests
curl -X POST http://localhost:3000/api/apm/test/integration
```

## Best Practices

1. **Sampling Rates**: Use lower sampling rates in production
2. **Metric Naming**: Use consistent naming conventions
3. **Error Handling**: Always handle APM failures gracefully
4. **Performance Impact**: Monitor APM overhead on application performance
5. **Security**: Secure API keys and sensitive configuration
6. **Testing**: Regularly test APM integration and disaster recovery

## API Reference

### REST Endpoints

- `GET /api/apm/health` - Get APM health status
- `GET /api/apm/metrics` - Get performance metrics
- `POST /api/apm/metrics/custom` - Record custom metric
- `POST /api/apm/trace/agent` - Trace agent lifecycle
- `POST /api/apm/trace/swarm` - Trace swarm activity
- `POST /api/apm/test/integration` - Run integration tests

### WebSocket Events

- `apm-connected` - Connection established
- `health-status-update` - Health status update
- `performance-metrics-update` - Performance metrics update
- `recommendations-update` - Optimization recommendations
- `alert` - Real-time alert
- `integration-test-completed` - Integration test results

For detailed API documentation, see the inline documentation in the source files.