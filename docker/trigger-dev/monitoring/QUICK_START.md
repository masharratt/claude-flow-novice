# Monitoring Quick Start Guide

Fast integration guide for adding monitoring to CFN Loop production deployment.

## 5-Minute Setup

### 1. Initialize Logger in Main Application

```typescript
// src/index.ts
import { initializeLogger } from './lib/structured-logger.js';

initializeLogger({
  component: 'cfn-loop',
  minLevel: 'info',
  includeStackTrace: true,
});
```

### 2. Export Metrics Endpoint

```typescript
// Add to Express app
import { getMetricsCollector } from './lib/metrics-collector.js';
import { getHealthChecker } from './lib/health-check.js';

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(getMetricsCollector().exportPrometheus());
});

app.get('/health', async (req, res) => {
  const report = await getHealthChecker().performAllChecks();
  res.status(report.status === 'healthy' ? 200 : 503).json(report);
});
```

### 3. Record Metrics in Task Execution

```typescript
// In decomposer or task handler
import { getLogger } from './lib/structured-logger.js';
import { getMetricsCollector } from './lib/metrics-collector.js';

const logger = getLogger('task-executor');
const metrics = getMetricsCollector();

async function executeTask(taskId: string, tier: number) {
  const startTime = Date.now();
  logger.info('Task started', { taskId, tier });

  try {
    const result = await doWork(taskId);
    const duration = Date.now() - startTime;

    metrics.recordTaskCompletion({
      taskId,
      status: 'completed',
      durationMs: duration,
      tier,
      completedAt: new Date(),
    });

    logger.info('Task completed', { taskId, durationMs: duration });
    return result;
  } catch (error) {
    metrics.recordError('task-executor', error instanceof Error ? error.message : String(error));
    logger.error('Task failed', error);
    throw error;
  }
}
```

### 4. Record RuVector Metrics

```typescript
// In RuVector query handler
const result = await logger.measureAsync('RuVector query', async () => {
  return await ruvectorQuery(prompt);
});

metrics.recordRuVectorQuery({
  queryId: generateId(),
  latencyMs: result.duration,
  tokensUsed: result.tokens,
  cacheHit: result.cached,
  completedAt: new Date(),
});
```

## Monitoring Endpoints

Once configured, your application exposes:

```bash
# Prometheus metrics (text format)
curl http://localhost:3001/metrics

# Health check (JSON)
curl http://localhost:3001/health

# Metrics summary (JSON)
curl http://localhost:3001/metrics/summary
```

## Production Stack (Docker Compose)

```yaml
# Add to docker-compose.yml
services:
  app:
    # ... your app config
    ports:
      - "3001:3001"

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alerts.yml:/etc/prometheus/alerts.yml
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    ports:
      - "3000:3000"
    depends_on:
      - prometheus
```

**prometheus.yml**:

```yaml
global:
  scrape_interval: 30s

scrape_configs:
  - job_name: 'cfn-loop'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
```

## Key Metrics to Watch

### Critical Thresholds

| Metric | Alert If | Action |
|--------|----------|--------|
| `cfn_error_rate` | > 10% | Page on-call |
| `cfn_sla_breaches_total` | > 0 | Review SLA target |
| `cfn_ruvector_latency_avg_ms` | > 2000 | Scale RuVector |
| `cfn_tier_escalations_total{tier="3"}` | > 10/5min | Review backlog |

### Dashboard Queries

```promql
# Task completion rate (last hour)
rate(cfn_task_completion_rate[1h])

# RuVector latency trend (last 6 hours)
cfn_ruvector_latency_avg_ms[6h]

# Gate check failure rate
1 - cfn_gate_check_pass_rate

# SLA breach rate per 1000 tasks
cfn_sla_breach_rate
```

## Logging Examples

### Info Level (Default)

```typescript
logger.info('Phase completed', {
  phase: 'architecture',
  durationMs: 1500,
  taskCount: 25,
});
```

**Output**:
```json
{
  "timestamp": "2025-11-29T10:30:45.123Z",
  "level": "info",
  "component": "architecture-decomposer",
  "taskId": "task-123",
  "message": "Phase completed",
  "metrics": {
    "phase": "architecture",
    "durationMs": 1500,
    "taskCount": 25
  }
}
```

### Error Level

```typescript
logger.error('Query failed', queryError, {
  query: prompt.substring(0, 100),
  attempt: 2,
});
```

**Output**:
```json
{
  "timestamp": "2025-11-29T10:30:45.123Z",
  "level": "error",
  "component": "ruvector-handler",
  "taskId": "task-123",
  "message": "Query failed",
  "error": {
    "message": "Connection timeout",
    "code": "ECONNREFUSED",
    "stack": "..."
  },
  "context": {
    "query": "Find security vulnerabilities...",
    "attempt": 2
  }
}
```

## Alert Response Guide

### High Error Rate

**Condition**: Error rate > 10% for 5+ minutes

**Response**:
1. Check recent deployments
2. Review error logs for patterns
3. Page on-call engineer
4. Consider rollback if critical

### RuVector Down

**Condition**: RuVector unreachable for 2+ minutes

**Response**:
1. Check RuVector service status
2. Verify network connectivity
3. Check API key validity
4. Restart RuVector if needed

### Tier 3 Escalation Spike

**Condition**: >10 escalations to Tier 3 in 5 minutes

**Response**:
1. Review recent task submissions
2. Analyze complex task patterns
3. Consider scaling Tier 3 capacity
4. Investigate root cause

### SLA Breach

**Condition**: Any phase exceeds target duration

**Response**:
1. Review phase metrics
2. Check for resource bottlenecks
3. Analyze specific slow tasks
4. Consider phase timeout adjustment

## Testing Alerts

```bash
# Trigger high error rate manually
for i in {1..100}; do
  curl -X POST http://localhost:3001/test/error
done

# Check alert status in Prometheus
curl http://localhost:9090/api/v1/alerts
```

## Integration Checklist

- [ ] Initialize logger in main application
- [ ] Export metrics endpoint
- [ ] Record task completion metrics
- [ ] Record RuVector query metrics
- [ ] Record gate check metrics
- [ ] Record SLA breach metrics
- [ ] Setup Prometheus scraping
- [ ] Configure Alertmanager notifications
- [ ] Create Grafana dashboards
- [ ] Test health check endpoint
- [ ] Document on-call runbooks
- [ ] Training for ops team

## Next: Full Setup

For comprehensive setup including:
- Grafana dashboard creation
- Alertmanager notification channels
- Advanced PromQL queries
- Log aggregation (ELK/Loki)

See: `MONITORING_SETUP.md`

## Common Issues

**Metrics not showing**:
- Ensure `recordXxx()` methods are called
- Check metrics export endpoint
- Verify Prometheus scrape config

**Alerts not firing**:
- Confirm Prometheus is evaluating rules
- Check alert query syntax
- Verify Alertmanager is running

**High log volume**:
- Increase `minLevel` to 'warn'
- Filter debug logs in production
- Use log aggregation to manage volume

## Reference

- Structured Logger: `src/lib/structured-logger.ts`
- Metrics Collector: `src/lib/metrics-collector.ts`
- Health Check: `src/lib/health-check.ts`
- Alert Rules: `monitoring/alerts.yml`
- Full Guide: `monitoring/MONITORING_SETUP.md`
