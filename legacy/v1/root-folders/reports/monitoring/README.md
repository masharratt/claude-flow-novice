# Monitoring Reports

System monitoring reports, fleet health checks, event bus metrics, and real-time coordination data.

## Purpose

This directory contains operational monitoring data for fleet management, event bus coordination, Redis state snapshots, swarm telemetry, and real-time health metrics used for system observability and incident response.

## Report Types

### Fleet Health Reports
- **Format**: `fleet-health-{fleet-id}-{date}.json`
- **Content**: Agent status, resource utilization, coordination efficiency, failure rates
- **Generated**: /fleet health command or continuous monitoring

### Event Bus Metrics
- **Format**: `eventbus-metrics-{timeframe}.json`
- **Content**: Throughput, latency, message types, subscription patterns, worker utilization
- **Generated**: /eventbus metrics command

### Redis State Snapshots
- **Format**: `redis-state-{timestamp}.json`
- **Content**: Swarm state, memory entries, pub/sub channels, key expiration data
- **Generated**: Periodic snapshots for recovery and debugging

### Swarm Telemetry
- **Format**: `swarm-telemetry-{swarm-id}-{date}.json`
- **Content**: Agent lifecycle events, coordination messages, confidence scores, iteration counts
- **Generated**: Continuous event bus monitoring

### Incident Reports
- **Format**: `incident-{id}-{date}.md`
- **Content**: Root cause analysis, timeline, resolution steps, post-mortem
- **Generated**: After system failures or performance degradation

## Metrics Tracked

### Fleet Management
- **Agent count**: Active, idle, failed agents
- **Resource utilization**: CPU, memory, I/O per agent
- **Coordination efficiency**: 0.40-0.45 target (useful work / total runtime)
- **Failure rate**: Agent crashes, timeout failures
- **Geographic distribution**: Regional agent allocation

### Event Bus
- **Throughput**: Messages/second (target: 10,000+)
- **Latency**: Message delivery time (target: <50ms p95)
- **Worker threads**: Utilization and efficiency
- **Message types**: Distribution of event types
- **Subscription patterns**: Active subscribers per pattern

### Redis Coordination
- **Key count**: Total keys, by namespace
- **Memory usage**: Redis heap, eviction events
- **Pub/sub channels**: Active channels, subscriber counts
- **Command latency**: GET/SET/PUBLISH timing
- **Persistence**: RDB/AOF status, last save timestamp

### Swarm Health
- **Loop iterations**: CFN Loop 3/2/4 counts per phase
- **Confidence scores**: Average, min, max per loop
- **Consensus success rate**: Loop 2 pass rate
- **Retry frequency**: Loop 3 retries, Loop 2 retries
- **Product owner decisions**: PROCEED/DEFER/ESCALATE distribution

## Report Structure

```json
{
  "fleet": {
    "id": "cfn-fleet-phase3",
    "timestamp": "2025-10-10T12:34:56Z",
    "agents": {
      "total": 1500,
      "active": 1247,
      "idle": 198,
      "failed": 55
    },
    "resources": {
      "cpuUtilization": "67%",
      "memoryUsed": "89GB",
      "networkIO": "1.2GB/s"
    },
    "efficiency": {
      "coordinationEfficiency": 0.43,
      "target": 0.45,
      "status": "near_target"
    },
    "regions": {
      "us-east-1": 600,
      "eu-west-1": 500,
      "ap-southeast-1": 400
    }
  },
  "eventBus": {
    "throughput": {
      "current": 12500,
      "target": 10000,
      "peak": 15000,
      "average": 11200
    },
    "latency": {
      "p50": "15ms",
      "p95": "42ms",
      "p99": "78ms",
      "target": "50ms"
    },
    "workers": {
      "threads": 4,
      "utilization": "82%"
    }
  },
  "redis": {
    "keys": {
      "total": 15673,
      "swarm": 1247,
      "memory": 8456,
      "eventbus": 5970
    },
    "memory": {
      "used": "2.3GB",
      "peak": "3.1GB",
      "evictions": 0
    },
    "pubsub": {
      "channels": 47,
      "subscriptions": 1523,
      "messagesPerSec": 12500
    }
  },
  "swarm": {
    "id": "cfn-phase-auth",
    "loops": {
      "loop3Iterations": 3,
      "loop2Iterations": 2,
      "loop4Decisions": 1
    },
    "confidence": {
      "average": 0.87,
      "min": 0.75,
      "max": 0.95
    },
    "consensus": {
      "successRate": "80%",
      "threshold": 0.90
    }
  },
  "alerts": [
    {
      "severity": "warning",
      "message": "Fleet efficiency below target (0.43 < 0.45)",
      "timestamp": "2025-10-10T12:30:00Z"
    }
  ]
}
```

## Usage

Monitoring reports are consumed by:
- Fleet auto-scaling algorithms
- Incident response teams
- Performance optimization analysis
- Capacity planning
- SRE dashboard visualizations
- CFN Loop health checks

## Examples

- `fleet-health-cfn-fleet-phase3-2025-10-10.json` - Fleet health snapshot
- `eventbus-metrics-24h.json` - 24-hour event bus metrics
- `redis-state-2025-10-10T12-00-00.json` - Redis state snapshot
- `swarm-telemetry-cfn-phase-auth-2025-10-10.json` - Swarm lifecycle data
- `incident-redis-timeout-2025-10-09.md` - Incident post-mortem

## Retention

Keep monitoring reports for latest 30 days. Archive critical incidents for 1 year.

## Alerting Thresholds

- **Fleet efficiency**: <0.40 (warning), <0.35 (critical)
- **Event bus latency**: >50ms p95 (warning), >100ms (critical)
- **Redis memory**: >80% (warning), >90% (critical)
- **Agent failure rate**: >5% (warning), >10% (critical)
- **Throughput**: <8000 msgs/sec (warning), <5000 (critical)

## Automation

```bash
# Monitor fleet health
/fleet health --fleet-id cfn-fleet-phase3 --deep-check

# Get event bus metrics
/eventbus metrics --timeframe 24h --detailed

# Dashboard real-time monitoring
/dashboard monitor --fleet-id cfn-fleet-phase3 --alerts all

# Fleet performance insights
/dashboard insights --fleet-id cfn-fleet-phase3 --timeframe 7d
```

## Integration

Monitoring data feeds into:
- Grafana dashboards (real-time visualization)
- Prometheus metrics (time-series storage)
- PagerDuty alerts (incident response)
- Slack notifications (team awareness)
- Log aggregation (Elasticsearch/Splunk)
