# CFN Loop Monitoring & Observability Guide

## Overview

This guide describes the monitoring and observability infrastructure for the CFN Loop Trigger.dev per-agent container architecture.

## Architecture

The monitoring stack consists of:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Metrics visualization and dashboards
- **Loki**: Log aggregation
- **Promtail**: Log shipper for Docker containers
- **Node Exporter**: Host-level metrics
- **cAdvisor**: Container-level metrics
- **Redis Exporter**: Redis metrics

## Quick Start

### 1. Start Monitoring Stack

```bash
# Start all monitoring services
docker-compose -f docker-compose.monitoring.yml up -d

# Verify all services are running
docker-compose -f docker-compose.monitoring.yml ps

# Check service health
docker-compose -f docker-compose.monitoring.yml exec prometheus wget -q -O- http://localhost:9090/-/healthy
docker-compose -f docker-compose.monitoring.yml exec grafana wget -q -O- http://localhost:3000/api/health
docker-compose -f docker-compose.monitoring.yml exec loki wget -q -O- http://localhost:3100/ready
```

### 2. Access Dashboards

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Loki**: http://localhost:3100

### 3. Configure Health Checks

The health check job runs automatically every 5 minutes via Trigger.dev cron scheduler.

To manually trigger a health check:

```bash
# Trigger via API (requires Trigger.dev API key)
curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "health.check.scheduled", "payload": {"scheduled": false}}'
```

## Structured Logging

### Log Format

All logs are emitted as structured JSON with the following schema:

```typescript
{
  "timestamp": "2025-11-24T12:34:56.789Z",
  "level": "INFO",
  "message": "Agent spawned successfully",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "context": {
    "agentId": "agent-backend-dev-1234",
    "agentType": "backend-developer",
    "taskId": "task-5678",
    "team": "platform",
    "project": "auth-service"
  },
  "error": {
    "name": "ValidationError",
    "message": "Invalid configuration",
    "stack": "..."
  }
}
```

### Log Levels

- **DEBUG**: Detailed diagnostic information
- **INFO**: General informational messages
- **WARN**: Warning messages (recoverable errors)
- **ERROR**: Error messages (non-fatal errors)
- **FATAL**: Fatal errors (system shutdown)

### Usage in Code

```typescript
import { logger, createLogger, getAgentContext } from '../utils/logging';

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

// Create child logger with inherited context
const operationLogger = agentLogger.child({
  operation: 'database-migration',
});

operationLogger.debug('Starting migration');
operationLogger.info('Migration completed');

// Log errors with stack traces
try {
  // ... operation
} catch (error) {
  logger.error('Operation failed', { taskId: 'task-456' }, error);
}

// Extract agent context from environment
const context = getAgentContext();
const envLogger = createLogger(context);
```

### Correlation IDs

Correlation IDs enable distributed tracing across agents:

```typescript
import { getCorrelationId } from '../utils/logging';

// Get correlation ID for request
const correlationId = getCorrelationId();

// Pass correlation ID to spawned agents
process.env.CORRELATION_ID = correlationId;

// All logs will include this correlation ID
logger.info('Processing request', { correlationId });
```

## Prometheus Metrics

### Agent Metrics

#### cfn_agent_spawns_total
- **Type**: Counter
- **Labels**: `team`, `agent_type`, `project`, `mode`
- **Description**: Total number of agent spawns

#### cfn_agent_spawn_failures_total
- **Type**: Counter
- **Labels**: `team`, `agent_type`, `project`, `error_type`
- **Description**: Total number of failed agent spawns

#### cfn_agent_execution_duration_seconds
- **Type**: Histogram
- **Labels**: `team`, `agent_type`, `project`, `status`
- **Buckets**: 1s, 5s, 10s, 30s, 1m, 2m, 5m, 10m, 30m
- **Description**: Agent execution duration in seconds

#### cfn_agent_executions_total
- **Type**: Counter
- **Labels**: `team`, `agent_type`, `project`, `status`
- **Description**: Total number of agent executions

### Resource Metrics

#### cfn_agent_cpu_usage_percent
- **Type**: Gauge
- **Labels**: `agent_id`, `agent_type`, `team`
- **Description**: Agent CPU usage percentage

#### cfn_agent_memory_usage_bytes
- **Type**: Gauge
- **Labels**: `agent_id`, `agent_type`, `team`
- **Description**: Agent memory usage in bytes

#### cfn_agent_disk_usage_bytes
- **Type**: Gauge
- **Labels**: `agent_id`, `agent_type`, `team`
- **Description**: Agent disk usage in bytes

### Cost Metrics

#### cfn_agent_cost_dollars_total
- **Type**: Counter
- **Labels**: `team`, `project`, `agent_type`, `provider`
- **Description**: Total cost of agent executions in dollars

#### cfn_agent_tokens_total
- **Type**: Counter
- **Labels**: `team`, `project`, `agent_type`, `provider`, `token_type`
- **Description**: Total tokens consumed by agents

### Health Check Metrics

#### cfn_health_check_success_total
- **Type**: Counter
- **Labels**: `check_type`
- **Description**: Total successful health checks

#### cfn_health_check_failure_total
- **Type**: Counter
- **Labels**: `check_type`, `error_type`
- **Description**: Total failed health checks

#### cfn_health_check_duration_seconds
- **Type**: Histogram
- **Labels**: `check_type`
- **Buckets**: 0.1s, 0.5s, 1s, 2s, 5s, 10s
- **Description**: Health check duration in seconds

### CFN Loop Metrics

#### cfn_loop_iterations_total
- **Type**: Counter
- **Labels**: `task_id`, `loop_level`, `mode`
- **Description**: Total CFN Loop iterations

#### cfn_loop_consensus_score
- **Type**: Gauge
- **Labels**: `task_id`, `iteration`
- **Description**: CFN Loop consensus score (0-1)

#### cfn_loop_test_pass_rate
- **Type**: Gauge
- **Labels**: `task_id`, `iteration`
- **Description**: CFN Loop test pass rate (0-1)

#### cfn_loop_decisions_total
- **Type**: Counter
- **Labels**: `task_id`, `decision`, `mode`
- **Description**: Total CFN Loop decisions (PROCEED/ITERATE/ABORT)

### Usage in Code

```typescript
import {
  recordAgentSpawn,
  recordAgentExecution,
  recordAgentCost,
  updateResourceUsage,
  recordHealthCheck,
} from '../utils/metrics';

// Record agent spawn
recordAgentSpawn({
  team: 'platform',
  agentType: 'backend-developer',
  project: 'auth-service',
  mode: 'standard',
});

// Record agent execution
const startTime = Date.now();
try {
  // ... agent execution
  const duration = (Date.now() - startTime) / 1000;
  recordAgentExecution(
    {
      team: 'platform',
      agentType: 'backend-developer',
      project: 'auth-service',
    },
    duration,
    'success'
  );
} catch (error) {
  const duration = (Date.now() - startTime) / 1000;
  recordAgentExecution(
    {
      team: 'platform',
      agentType: 'backend-developer',
      project: 'auth-service',
    },
    duration,
    'failure'
  );
}

// Record cost tracking
recordAgentCost(
  {
    team: 'platform',
    project: 'auth-service',
    agentType: 'backend-developer',
    provider: 'kimi',
  },
  0.05, // Cost in dollars
  1500, // Input tokens
  500   // Output tokens
);

// Update resource usage
updateResourceUsage(
  {
    agentId: 'agent-123',
    agentType: 'backend-developer',
    team: 'platform',
  },
  45.2,           // CPU percent
  536870912,      // Memory bytes (512MB)
  1073741824      // Disk bytes (1GB)
);

// Record health check
const healthStartTime = Date.now();
try {
  // ... health check operation
  const healthDuration = (Date.now() - healthStartTime) / 1000;
  recordHealthCheck('docker', healthDuration, true);
} catch (error) {
  const healthDuration = (Date.now() - healthStartTime) / 1000;
  recordHealthCheck('docker', healthDuration, false, 'connection_error');
}
```

## Grafana Dashboards

### Team Overview Dashboard

**Purpose**: High-level view of team activity, success rates, and costs

**Panels**:
- Active agents by team
- Agent spawn rate (last 1h)
- Success rate by team (last 24h)
- Total cost by team (last 24h)
- Top 10 most used agent types
- Alert status summary

**Use Cases**:
- Monitor team productivity
- Track resource utilization
- Identify anomalies

### Agent Performance Dashboard

**Purpose**: Detailed agent execution metrics and performance analysis

**Panels**:
- Agent execution duration (P50, P95, P99)
- Agent success/failure rate
- Agent spawn failures by error type
- Resource usage (CPU, memory, disk) by agent type
- Slowest agents (last 1h)
- Agent lifecycle timeline

**Use Cases**:
- Debug slow agent executions
- Identify resource bottlenecks
- Optimize agent performance

### Cost Tracking Dashboard

**Purpose**: Financial tracking and cost optimization

**Panels**:
- Total cost by team (hourly, daily, weekly)
- Cost by project
- Cost by provider (Kimi, Z.ai, Anthropic, etc.)
- Token usage by provider
- Cost per agent execution
- Cost trends over time

**Use Cases**:
- Budget tracking
- Cost optimization opportunities
- Provider comparison

### Creating Custom Dashboards

1. Access Grafana: http://localhost:3000
2. Navigate to "Create" > "Dashboard"
3. Add panels with PromQL queries
4. Save to "CFN Loop" folder

**Example PromQL queries**:

```promql
# Agent spawn rate (per minute)
rate(cfn_agent_spawns_total[1m])

# Success rate by team
sum(rate(cfn_agent_executions_total{status="success"}[5m])) by (team)
/
sum(rate(cfn_agent_executions_total[5m])) by (team)

# P95 execution duration
histogram_quantile(0.95, rate(cfn_agent_execution_duration_seconds_bucket[5m]))

# Cost by team (last 1h)
sum(increase(cfn_agent_cost_dollars_total[1h])) by (team)
```

## Alerting

### Alert Rules

See `monitoring/prometheus-rules.yml` for complete list.

**Key alerts**:

- **HighAgentFailureRate**: Agent failure rate > 10% for 5 minutes
- **CriticalAgentFailureRate**: Agent failure rate > 25% for 2 minutes
- **SlowAgentExecution**: P95 duration > 5 minutes for 10 minutes
- **HealthCheckFailure**: Health checks failing for 5 minutes
- **HighCostPerHour**: Team spending > $10/hour
- **CFNLoopStuck**: No progress for 30 minutes
- **LowTestPassRate**: Test pass rate < 95%

### Alert Notifications

Configure alert notifications in Grafana:

1. Navigate to "Alerting" > "Contact points"
2. Add contact point (email, Slack, PagerDuty, etc.)
3. Create notification policy
4. Link to Prometheus data source

## OpenTelemetry Tracing

### Trace Spans

Key operations instrumented with OpenTelemetry spans:

- **agent.lifecycle**: Complete agent spawn → execution → completion
- **redis.coordination**: Redis BLPOP/RPUSH operations
- **docker.operation**: Docker build, run, stop, rm operations
- **cfn.loop.iteration**: Full CFN Loop iteration
- **health.check**: Health check operations

### Trace Context Propagation

Correlation IDs are used for distributed tracing:

```typescript
import { getCorrelationId } from '../utils/logging';

// Get trace context
const traceId = getCorrelationId();

// Inject into spawned agent environment
process.env.CORRELATION_ID = traceId;

// All logs and spans will include this trace ID
```

### Viewing Traces

Traces can be viewed in:
- Grafana (via Tempo - future enhancement)
- Loki (via correlation ID filtering)

**LogQL query example**:
```logql
{container_name=~"/cfn-.*"} | json | correlationId="550e8400-e29b-41d4-a716-446655440000"
```

## Integration with Existing Jobs

### test-single-agent.ts Integration

```typescript
import { logger } from '../utils/logging';
import { recordAgentSpawn, recordAgentExecution } from '../utils/metrics';

client.defineJob({
  id: "test-single-agent",
  // ... existing config
  run: async (payload, io, ctx) => {
    const startTime = Date.now();

    logger.info('Starting single agent test', {
      taskId: ctx.run.id,
      agentType: payload.agentType,
    });

    recordAgentSpawn({
      team: payload.team || 'unknown',
      agentType: payload.agentType,
      project: payload.project || 'test',
      mode: 'test',
    });

    try {
      // ... existing agent spawn logic

      const duration = (Date.now() - startTime) / 1000;
      recordAgentExecution(
        {
          team: payload.team || 'unknown',
          agentType: payload.agentType,
          project: payload.project || 'test',
        },
        duration,
        'success'
      );

      logger.info('Single agent test completed', {
        taskId: ctx.run.id,
        duration,
      });

      return result;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      recordAgentExecution(
        {
          team: payload.team || 'unknown',
          agentType: payload.agentType,
          project: payload.project || 'test',
        },
        duration,
        'failure'
      );

      logger.error('Single agent test failed', {
        taskId: ctx.run.id,
        duration,
      }, error);

      throw error;
    }
  },
});
```

### CFN Loop Jobs Integration

Similar patterns apply to:
- `cfn-loop3.ts`
- `cfn-loop2.ts`
- `cfn-product-owner.ts`

Add logging and metrics at key lifecycle events:
- Loop iteration start
- Agent spawn
- Test execution
- Consensus collection
- Product owner decision
- Loop iteration completion

## Production Deployment

### Resource Requirements

Minimum recommended resources:

- **Prometheus**: 2 CPU cores, 4GB RAM, 50GB disk
- **Grafana**: 1 CPU core, 2GB RAM, 10GB disk
- **Loki**: 2 CPU cores, 4GB RAM, 100GB disk
- **Node Exporter**: 0.5 CPU cores, 128MB RAM
- **cAdvisor**: 0.5 CPU cores, 256MB RAM

### Data Retention

Configure retention policies:

- **Prometheus**: 30 days (configured in docker-compose.monitoring.yml)
- **Loki**: 30 days (configure in loki-config.yml)
- **Grafana**: No limits (dashboard configs stored indefinitely)

### Scaling Considerations

For high-traffic production environments:

- Use Prometheus federation for multi-datacenter setups
- Deploy Loki with S3 backend for scalable log storage
- Use Grafana Enterprise for advanced features (RBAC, reporting)
- Deploy multiple Promtail instances for log collection redundancy

### Backup and Recovery

Backup critical data:

```bash
# Backup Prometheus data
docker run --rm -v prometheus-data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz /data

# Backup Grafana dashboards
docker run --rm -v grafana-data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/grafana-$(date +%Y%m%d).tar.gz /data

# Backup Loki data
docker run --rm -v loki-data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/loki-$(date +%Y%m%d).tar.gz /data
```

## Troubleshooting

### Prometheus Not Scraping Metrics

1. Check target status: http://localhost:9090/targets
2. Verify network connectivity: `docker network inspect monitoring`
3. Check Prometheus logs: `docker-compose -f docker-compose.monitoring.yml logs prometheus`

### Grafana Dashboards Not Loading

1. Verify datasource configuration: http://localhost:3000/datasources
2. Check Grafana logs: `docker-compose -f docker-compose.monitoring.yml logs grafana`
3. Test Prometheus connection: http://localhost:3000/datasources/test

### Loki Not Receiving Logs

1. Check Promtail status: `docker-compose -f docker-compose.monitoring.yml logs promtail`
2. Verify Promtail can reach Loki: `docker-compose -f docker-compose.monitoring.yml exec promtail wget -q -O- http://loki:3100/ready`
3. Check log file permissions: `/var/lib/docker/containers` must be readable

### Health Checks Failing

1. Verify health check job is scheduled: Check Trigger.dev dashboard
2. Manually trigger health check (see Quick Start section)
3. Check health check logs in Grafana/Loki
4. Verify system dependencies (Docker, Redis, filesystem)

## Best Practices

1. **Use correlation IDs**: Always propagate correlation IDs across agent boundaries
2. **Log structured data**: Use JSON logging for easy parsing and filtering
3. **Set appropriate log levels**: DEBUG for development, INFO for production
4. **Monitor alert noise**: Tune alert thresholds to reduce false positives
5. **Regular dashboard reviews**: Update dashboards as system evolves
6. **Cost tracking**: Monitor costs daily to prevent budget overruns
7. **Capacity planning**: Use resource metrics to plan infrastructure scaling
8. **Incident response**: Document alert runbooks and escalation procedures

## Future Enhancements

- **OpenTelemetry Collector**: Full distributed tracing with Tempo
- **Grafana Cloud**: Managed monitoring for simplified operations
- **Advanced alerting**: ML-based anomaly detection
- **Cost optimization**: Automated recommendations based on usage patterns
- **SLO tracking**: Service Level Objectives with error budgets
- **Multi-region monitoring**: Consolidated view across regions

## References

- Prometheus documentation: https://prometheus.io/docs/
- Grafana documentation: https://grafana.com/docs/
- Loki documentation: https://grafana.com/docs/loki/
- OpenTelemetry documentation: https://opentelemetry.io/docs/
- Trigger.dev documentation: https://trigger.dev/docs
