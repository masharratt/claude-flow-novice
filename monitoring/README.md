# CFN Loop Monitoring Infrastructure

Production-grade monitoring and observability for Trigger.dev per-agent container architecture.

## Quick Start

### 1. Start Monitoring Stack

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

### 2. Access Dashboards

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Loki**: http://localhost:3100

### 3. View Metrics

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Query metrics
curl 'http://localhost:9090/api/v1/query?query=cfn_agent_spawns_total'

# Export metrics for scraping
curl http://localhost:9091/metrics
```

## Components

### Prometheus (Port 9090)
- Metrics collection and storage
- 30-day retention
- Alert evaluation every 15s

### Grafana (Port 3000)
- Metrics visualization
- Pre-configured dashboards:
  - Team Overview
  - Agent Performance
  - Cost Tracking

### Loki (Port 3100)
- Log aggregation
- JSON log parsing
- Correlation ID tracking

### Promtail
- Docker container log shipping
- Automatic label extraction
- JSON structured log parsing

### Node Exporter (Port 9100)
- Host-level metrics
- CPU, memory, disk, network

### cAdvisor (Port 8080)
- Container-level metrics
- Resource usage per container
- Docker metrics

### Redis Exporter (Port 9121)
- Redis metrics
- Connection stats
- Command latency

## Grafana Dashboards

### Team Overview
- Active agents by team
- Success rates
- Cost tracking
- Alert status

### Agent Performance
- Execution duration (P50, P95, P99)
- Success/failure rates
- Resource usage
- Slowest agents

### Cost Tracking
- Total cost over time
- Cost by team/project
- Cost by provider
- Token usage
- Cost per execution

## Alert Rules

See `prometheus-rules.yml` for complete list:

- High agent failure rate (>10%)
- Critical failure rate (>25%)
- Slow execution (P95 > 5min)
- Health check failures
- High cost per hour (>$10)
- CFN Loop stuck (>30min no progress)
- Low test pass rate (<95%)

## Integration

### Structured Logging

```typescript
import { logger, createLogger } from '../utils/logging';

// Use default logger
logger.info('Application started');

// Create logger with context
const agentLogger = createLogger({
  agentId: 'agent-123',
  agentType: 'backend-developer',
  team: 'platform',
});

agentLogger.info('Agent spawned', {
  taskId: 'task-456',
  project: 'auth-service',
});
```

### Metrics Recording

```typescript
import {
  recordAgentSpawn,
  recordAgentExecution,
  recordAgentCost,
} from '../utils/metrics';

// Record spawn
recordAgentSpawn({
  team: 'platform',
  agentType: 'backend-developer',
  project: 'auth-service',
  mode: 'standard',
});

// Record execution
recordAgentExecution(
  { team: 'platform', agentType: 'backend-developer', project: 'auth-service' },
  45.5, // duration in seconds
  'success' // or 'failure' / 'timeout'
);

// Record cost
recordAgentCost(
  { team: 'platform', project: 'auth-service', agentType: 'backend-developer', provider: 'kimi' },
  0.05, // cost in dollars
  1500, // input tokens
  500   // output tokens
);
```

## Testing

```bash
# Run unit tests
npm test src/utils/__tests__/logging.test.ts
npm test src/utils/__tests__/metrics.test.ts

# Run health check manually
curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "health.check.scheduled", "payload": {"scheduled": false}}'
```

## Maintenance

### Backup Data

```bash
# Prometheus
docker run --rm -v prometheus-data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz /data

# Grafana
docker run --rm -v grafana-data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/grafana-$(date +%Y%m%d).tar.gz /data

# Loki
docker run --rm -v loki-data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/loki-$(date +%Y%m%d).tar.gz /data
```

### Cleanup

```bash
# Stop monitoring stack
docker-compose -f docker-compose.monitoring.yml down

# Remove volumes (WARNING: deletes all data)
docker-compose -f docker-compose.monitoring.yml down -v
```

## Documentation

See `docs/guides/MONITORING_GUIDE.md` for complete documentation.
