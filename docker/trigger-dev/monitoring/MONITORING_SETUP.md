# Production Monitoring and Alerting Setup

Comprehensive monitoring and alerting for MDAP + RuVector integration in CFN Loop v3.

## Overview

This monitoring system provides production-grade observability for the CFN Loop infrastructure:

- **Structured Logging**: JSON-formatted logs for machine parsing
- **Metrics Collection**: Prometheus-compatible metrics export
- **Health Checks**: Component-level health status
- **Alerting Rules**: Critical infrastructure event detection

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Application Layer                                   │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│ │ Structured   │ │   Metrics    │ │   Health     │ │
│ │   Logger     │ │  Collector   │ │   Check      │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────┘
           │                │               │
           ▼                ▼               ▼
┌─────────────────────────────────────────────────────┐
│ Observability Exporters                             │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│ │ Log Stream │  │ Prometheus │  │   JSON     │    │
│ │  (stdout)  │  │   Metrics  │  │   API      │    │
│ └────────────┘  └────────────┘  └────────────┘    │
└─────────────────────────────────────────────────────┘
           │                │               │
           ▼                ▼               ▼
┌─────────────────────────────────────────────────────┐
│ Data Collection Layer                               │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│ │ Log Aggregation │ │ Prometheus │ │ Alertmanager│   │
│ │ (ELK/Loki) │  │  Scraper   │  │            │    │
│ └────────────┘  └────────────┘  └────────────┘    │
└─────────────────────────────────────────────────────┘
           │                │               │
           ▼                ▼               ▼
┌─────────────────────────────────────────────────────┐
│ Visualization & Alerting                            │
│ ┌────────────────────────────────────────────────┐  │
│ │ Grafana Dashboards                             │  │
│ │ - CFN Loop Overview                            │  │
│ │ - RuVector Performance                         │  │
│ │ - Tier Escalations                             │  │
│ │ - SLA Compliance                               │  │
│ └────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────┐  │
│ │ Alert Notifications (PagerDuty, Slack, etc)    │  │
│ └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Core Modules

### 1. Structured Logger (`src/lib/structured-logger.ts`)

JSON-structured logging for production monitoring.

**Features:**
- Consistent log format across all components
- Log level filtering (debug, info, warn, error)
- Task ID correlation
- Performance measurement utilities

**Example Usage:**

```typescript
import { StructuredLogger, initializeLogger, getLogger } from './structured-logger.js';

// Initialize global logger
initializeLogger({
  component: 'my-service',
  minLevel: 'info',
  includeStackTrace: true,
  taskId: 'task-123'
});

// Get logger instance
const logger = getLogger('decomposer');

// Log info
logger.info('Task started', {
  taskId: 'task-123',
  phase: 'architecture'
});

// Log warning
logger.warn('High latency detected', {
  latencyMs: 2500
});

// Log error with exception
logger.error('Query failed', new Error('Connection timeout'));

// Measure async operation
const result = await logger.measureAsync('Query execution', async () => {
  return await ruvectorQuery(prompt);
});

// Child logger with inherited context
const childLogger = logger.child({ component: 'security-check' });
```

**Log Output Format:**

```json
{
  "timestamp": "2025-11-29T10:30:45.123Z",
  "level": "info",
  "component": "decomposer",
  "taskId": "task-123",
  "message": "Task started",
  "metrics": {
    "taskId": "task-123",
    "phase": "architecture"
  }
}
```

### 2. Metrics Collector (`src/lib/metrics-collector.ts`)

Collects and exports production metrics in Prometheus format.

**Tracked Metrics:**

| Metric | Type | Description |
|--------|------|-------------|
| `cfn_task_completion_rate` | Gauge | Task completion rate (0-1) |
| `cfn_task_count` | Counter | Total tasks processed |
| `cfn_task_duration_avg_ms` | Gauge | Average task duration |
| `cfn_ruvector_queries_total` | Counter | Total RuVector queries |
| `cfn_ruvector_latency_avg_ms` | Gauge | Average query latency |
| `cfn_ruvector_cache_hit_rate` | Gauge | Cache hit rate (0-1) |
| `cfn_gate_check_pass_rate` | Gauge | Gate check pass rate |
| `cfn_sla_breaches_total` | Counter | Total SLA breaches |
| `cfn_sla_breach_rate` | Gauge | Breaches per 1000 tasks |
| `cfn_error_rate` | Gauge | Error rate percentage |
| `cfn_tier_escalations_total` | Counter | Escalations by tier |

**Example Usage:**

```typescript
import { getMetricsCollector, initializeMetricsCollector } from './metrics-collector.js';

// Initialize metrics collector
initializeMetricsCollector();
const metrics = getMetricsCollector();

// Record task completion
metrics.recordTaskCompletion({
  taskId: 'task-123',
  status: 'completed',
  completedAt: new Date(),
  durationMs: 5000,
  tier: 2
});

// Record RuVector query
metrics.recordRuVectorQuery({
  queryId: 'query-456',
  latencyMs: 1500,
  tokensUsed: 2500,
  cacheHit: true,
  completedAt: new Date()
});

// Record gate check
metrics.recordGateCheck({
  checkId: 'gate-789',
  passed: true,
  passRate: 0.95,
  testsRun: 100,
  testsPassed: 95,
  durationMs: 2000,
  completedAt: new Date()
});

// Record SLA breach
metrics.recordSLABreach({
  slaId: 'sla-1',
  slaName: 'Architecture Phase SLA',
  breachedAt: new Date(),
  actualMs: 3000,
  targetMs: 2000,
  phase: 'architecture'
});

// Record error
metrics.recordError('decomposer', 'connection_timeout');

// Record escalation
metrics.recordEscalation(3);

// Get metrics summary
const summary = metrics.getSummary();
console.log(JSON.stringify(summary, null, 2));

// Export Prometheus format
const prometheusMetrics = metrics.exportPrometheus();
console.log(prometheusMetrics);
```

**Prometheus Export Example:**

```
# HELP cfn_task_completion_rate Task completion rate (0-1)
# TYPE cfn_task_completion_rate gauge
cfn_task_completion_rate 0.95

# HELP cfn_ruvector_latency_avg_ms Average RuVector query latency
# TYPE cfn_ruvector_latency_avg_ms gauge
cfn_ruvector_latency_avg_ms 1250.50

# HELP cfn_tier_escalations_total Total tier escalations by tier
# TYPE cfn_tier_escalations_total counter
cfn_tier_escalations_total{tier="1"} 45
cfn_tier_escalations_total{tier="2"} 15
cfn_tier_escalations_total{tier="3"} 2
```

### 3. Health Check (`src/lib/health-check.ts`)

Component-level health status verification.

**Checked Components:**

1. **RuVector**: API key validation, connectivity
2. **Database**: Configuration, connectivity
3. **Disk Space**: Usage percentage, available space
4. **Memory**: Heap usage, garbage collection

**Health Status Values:**

- `healthy`: All checks pass
- `degraded`: Some checks fail but system operational
- `unhealthy`: Critical checks fail

**Example Usage:**

```typescript
import { getHealthChecker, initializeHealthChecker } from './health-check.js';

// Initialize health checker
initializeHealthChecker();
const healthChecker = getHealthChecker();

// Perform all health checks
const report = await healthChecker.performAllChecks();

// Return report
console.log(JSON.stringify(report, null, 2));

// Check individual components
const ruvectorHealth = await healthChecker.checkRuVector();
const dbHealth = await healthChecker.checkDatabase();
const diskHealth = await healthChecker.checkDiskSpace();
const memoryHealth = await healthChecker.checkMemory();
```

**Health Report Structure:**

```json
{
  "status": "healthy",
  "timestamp": "2025-11-29T10:30:45.123Z",
  "uptime": 3600000,
  "summary": "System healthy: 4 components checked in 125ms",
  "components": [
    {
      "name": "RuVector",
      "status": "healthy",
      "message": "RuVector connected and operational",
      "lastChecked": "2025-11-29T10:30:45.123Z",
      "details": {
        "apiKeyConfigured": true,
        "apiKeyValid": true,
        "checkDurationMs": 25
      }
    },
    {
      "name": "Database",
      "status": "healthy",
      "message": "Database connected and operational",
      "lastChecked": "2025-11-29T10:30:45.123Z",
      "details": {
        "host": "postgres.default",
        "port": "5432",
        "checkDurationMs": 50
      }
    },
    {
      "name": "Disk Space",
      "status": "healthy",
      "message": "Disk space available",
      "lastChecked": "2025-11-29T10:30:45.123Z",
      "details": {
        "usagePercent": "45.2",
        "dbPath": "/var/lib/postgresql/data",
        "cachePath": "/tmp/cache"
      }
    },
    {
      "name": "Memory",
      "status": "healthy",
      "message": "Memory available",
      "lastChecked": "2025-11-29T10:30:45.123Z",
      "details": {
        "heapUsedMb": "256.5",
        "heapTotalMb": "512.0",
        "heapPercent": "50.1"
      }
    }
  ]
}
```

## Alert Rules (`monitoring/alerts.yml`)

### Critical Alerts (Immediate Response Required)

**High Error Rate:**
- Condition: Error rate > 10% for 5+ minutes
- Action: Page on-call engineer
- Runbook: `docs/RUNBOOK_HIGH_ERROR_RATE.md`

**RuVector Down:**
- Condition: RuVector unreachable for 2+ minutes
- Action: Page database team
- Runbook: `docs/RUNBOOK_RUVECTOR_DOWN.md`

**Disk Space Critical:**
- Condition: Disk usage > 90%
- Action: Immediate storage expansion
- Runbook: `docs/RUNBOOK_DISK_SPACE.md`

**Database Connection Pool Exhausted:**
- Condition: Available connections < 10% of pool
- Action: Kill idle connections, scale pool
- Runbook: `docs/RUNBOOK_DB_CONNECTIONS.md`

### Warning Alerts (Investigate Within 1 Hour)

**SLA Breach:**
- Condition: Any SLA breach detected
- Action: Review phase performance
- Runbook: `docs/RUNBOOK_SLA_BREACH.md`

**RuVector High Latency:**
- Condition: Average latency > 2000ms for 5+ minutes
- Action: Check RuVector metrics, investigate slow queries
- Runbook: `docs/RUNBOOK_RUVECTOR_LATENCY.md`

**Tier 3 Escalation Spike:**
- Condition: >10 escalations to Tier 3 in 5 minutes
- Action: Review complex task backlog, consider scaling
- Runbook: `docs/RUNBOOK_TIER3_ESCALATION.md`

**Gate Check Failure Rate:**
- Condition: Gate failure rate > 20%
- Action: Review validation logic, check test coverage
- Runbook: `docs/RUNBOOK_GATE_CHECK_FAILURE.md`

**Memory Usage High:**
- Condition: Heap usage > 85% for 10+ minutes
- Action: Check for memory leaks, restart service
- Runbook: `docs/RUNBOOK_MEMORY_HIGH.md`

## Integration Guide

### 1. Integrate Structured Logger

In each module that needs logging:

```typescript
import { getLogger } from './lib/structured-logger.js';

const logger = getLogger('my-module');

export async function myFunction(input: string): Promise<string> {
  logger.info('Starting operation', { input });

  try {
    const result = await someAsyncOperation(input);
    logger.info('Operation completed', { resultLength: result.length });
    return result;
  } catch (error) {
    logger.error('Operation failed', error);
    throw error;
  }
}
```

### 2. Record Metrics

In decomposer and coordinator modules:

```typescript
import { getMetricsCollector } from './lib/metrics-collector.js';

const metrics = getMetricsCollector();

// In task execution
metrics.recordTaskCompletion({
  taskId: taskId,
  status: 'completed',
  completedAt: new Date(),
  durationMs: Date.now() - startTime,
  tier: batchTier
});

// In RuVector queries
metrics.recordRuVectorQuery({
  queryId: id,
  latencyMs: duration,
  tokensUsed: usage,
  cacheHit: cached,
  completedAt: new Date()
});
```

### 3. Expose Metrics Endpoint

Create an HTTP endpoint to export metrics:

```typescript
import express from 'express';
import { getMetricsCollector } from './lib/metrics-collector.js';
import { getHealthChecker } from './lib/health-check.js';

const app = express();

// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = getMetricsCollector();
  res.set('Content-Type', 'text/plain');
  res.send(metrics.exportPrometheus());
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const healthChecker = getHealthChecker();
  const report = await healthChecker.performAllChecks();
  res.status(report.status === 'healthy' ? 200 : 503).json(report);
});

// Metrics summary (JSON)
app.get('/metrics/summary', (req, res) => {
  const metrics = getMetricsCollector();
  res.json(metrics.getSummary());
});

app.listen(3001, () => {
  console.log('Monitoring endpoints available at http://localhost:3001');
});
```

### 4. Setup Prometheus Scraping

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'cfn-loop'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
```

### 5. Configure Alertmanager

Create `alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h

  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true

    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'default'

  - name: 'slack'
    slack_configs:
      - api_url: '[REDACTED]'
        channel: '#cfn-alerts'
        title: 'CFN Alert: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '[REDACTED]'
        description: '{{ .GroupLabels.alertname }}: {{ .Alerts[0].Annotations.summary }}'
```

## Docker Compose Integration

Add monitoring services to `docker-compose.yml`:

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alerts.yml:/etc/prometheus/alerts.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  alertmanager:
    image: prom/alertmanager:latest
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/config.yml
    ports:
      - "9093:9093"

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/dashboards:/etc/grafana/provisioning/dashboards
    ports:
      - "3000:3000"
    depends_on:
      - prometheus

volumes:
  prometheus-data:
  grafana-data:
```

## Grafana Dashboards

Create dashboard JSON files in `monitoring/dashboards/`:

### CFN Overview Dashboard
- Task completion rate (gauge)
- Error rate trend (line)
- Task duration distribution (histogram)
- Tier escalation breakdown (bar)

### RuVector Performance
- Query latency (histogram)
- Cache hit rate (gauge)
- Token usage (line)
- High latency queries (table)

### SLA Compliance
- SLA breach timeline (bar)
- Breach rate per phase (gauge)
- Phase duration vs target (bar)

### Resource Utilization
- Memory usage (area)
- Disk space (gauge)
- Database connections (line)

## Testing Monitoring

```bash
# Test structured logger
npm test -- --grep "StructuredLogger"

# Test metrics collector
npm test -- --grep "MetricsCollector"

# Test health checks
npm test -- --grep "HealthChecker"

# Generate sample metrics for testing
npm run test:monitoring
```

## Production Deployment Checklist

- [ ] Configure RuVector API key in secrets
- [ ] Set database connection string
- [ ] Configure Prometheus scrape interval (recommended: 30s)
- [ ] Setup Alertmanager notification channels
- [ ] Create Grafana dashboards
- [ ] Configure log aggregation (ELK/Loki)
- [ ] Set alert notification email
- [ ] Establish on-call rotation
- [ ] Document runbooks for all alerts
- [ ] Setup monitoring dashboards for operations team
- [ ] Configure health check interval (recommended: 60s)
- [ ] Enable structured logging in all components

## Troubleshooting

### Missing Metrics

**Problem**: Metrics endpoint returns empty
**Solution**: Ensure metrics are being recorded:
```typescript
const metrics = getMetricsCollector();
metrics.recordTaskCompletion({ ... });
```

### High Latency Alerts

**Problem**: Frequent RuVector latency alerts
**Solution**:
1. Check RuVector service health
2. Review query complexity
3. Enable caching if not already enabled
4. Scale RuVector worker pool

### False Alarm Rate High

**Problem**: Too many non-critical alerts
**Solution**:
1. Adjust alert thresholds based on baseline metrics
2. Increase alert duration (e.g., 15m → 30m)
3. Group related alerts
4. Implement alert silencing for maintenance windows

## Maintenance

### Monthly Tasks

- Review alert threshold accuracy
- Analyze metrics trends for capacity planning
- Update runbooks based on incident learnings
- Clean up old metrics data from Prometheus

### Quarterly Tasks

- Review and update alert rules
- Audit Grafana dashboard usage
- Optimize metric retention policies
- Conduct alert reliability audit

## References

- Prometheus Documentation: https://prometheus.io/docs/
- Alertmanager Configuration: https://prometheus.io/docs/alerting/latest/configuration/
- Grafana Dashboards: https://grafana.com/grafana/dashboards/
- Best Practices: https://prometheus.io/docs/practices/naming/
