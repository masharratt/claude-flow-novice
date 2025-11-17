# CFN Distributed Logging Guide
**Task 4.4: Distributed Logging Standardization - Sprint 4**

## Table of Contents
1. [Overview](#overview)
2. [Log Format Specification](#log-format-specification)
3. [Docker Configuration](#docker-configuration)
4. [Log Aggregation](#log-aggregation)
5. [Log Rotation and Retention](#log-rotation-and-retention)
6. [Searching and Filtering](#searching-and-filtering)
7. [Monitoring and Alerting](#monitoring-and-alerting)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

---

## Overview

The CFN distributed logging system provides comprehensive structured JSON logging across all Docker containers and services. This system ensures:

- **Consistency**: All logs follow standardized JSON format
- **Traceability**: Correlation IDs enable tracking across services
- **Searchability**: Structured data enables powerful queries
- **Scalability**: Handles high-volume logging with minimal overhead
- **Compliance**: Retention policies meet regulatory requirements

### Key Components

- **Docker Logging Driver**: JSON-file driver with automatic rotation
- **Logrotate Configuration**: Manages rotation and retention
- **Log Aggregator**: Combines logs from multiple sources
- **Log Monitor**: Real-time error detection and alerting
- **Search Tools**: Query logs by correlation ID, agent ID, task ID, level
- **CFN Log Operations Skill**: Unified interface for all logging operations

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Applications & Containers                 │
│  (Generate structured JSON logs with standard format)        │
└────────────┬────────────────────────────────────┬───────────┘
             │                                    │
             ▼                                    ▼
   ┌──────────────────┐              ┌─────────────────────┐
   │  Docker Logging  │              │  Filesystem Logs    │
   │   (json-file)    │              │  (/var/log/cfn)     │
   └──────────┬───────┘              └────────────┬────────┘
              │                                   │
              └───────────────┬───────────────────┘
                              ▼
                   ┌──────────────────────┐
                   │  Log Aggregator      │
                   │  (Combine & dedupe)  │
                   └──────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐     ┌──────────┐    ┌─────────┐
        │  Search │     │ Monitor  │    │  Rotate │
        │  (jq)   │     │ (Alert)  │    │ (Logrotate)
        └─────────┘     └──────────┘    └─────────┘
```

---

## Log Format Specification

All logs must conform to this JSON schema for consistency and searchability.

### JSON Schema

```json
{
  "timestamp": "2025-11-16T03:00:00Z",
  "level": "info",
  "message": "Task completed successfully",
  "correlationId": "task:task-001:agent",
  "source": "cfn-agent-container",
  "context": {
    "agentId": "backend-dev-001",
    "taskId": "task-001",
    "iteration": 1,
    "sprintId": "sprint-4"
  },
  "metadata": {
    "duration": 5000,
    "confidence": 0.92,
    "tags": ["task-execution", "success"]
  }
}
```

### Field Definitions

#### Required Fields

| Field | Type | Format | Description |
|-------|------|--------|-------------|
| `timestamp` | string | ISO 8601 UTC | Event timestamp in UTC timezone |
| `level` | string | enum | Log severity: debug, info, warn, error, fatal |
| `message` | string | text | Human-readable log message |
| `source` | string | text | Container name or service identifier |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `correlationId` | string | Tracing ID: format `type:id:agent` (e.g., `task:task-001:agent`) |
| `context` | object | Additional context (agentId, taskId, iteration, sprintId) |
| `metadata` | object | Operation-specific data (duration, confidence, tags) |
| `error` | object | Error details (name, message, stack) |

### Examples

#### Task Execution Log
```json
{
  "timestamp": "2025-11-16T03:15:42Z",
  "level": "info",
  "message": "Task execution started",
  "correlationId": "task:task-001:agent",
  "source": "cfn-agent-task-001",
  "context": {
    "agentId": "backend-dev-001",
    "taskId": "task-001",
    "iteration": 1,
    "sprintId": "sprint-4"
  },
  "metadata": {
    "tags": ["task-start"]
  }
}
```

#### Error Log
```json
{
  "timestamp": "2025-11-16T03:16:42Z",
  "level": "error",
  "message": "Connection timeout to database",
  "correlationId": "task:task-001:agent",
  "source": "cfn-agent-task-001",
  "context": {
    "agentId": "backend-dev-001",
    "taskId": "task-001",
    "iteration": 1
  },
  "metadata": {
    "duration": 5000,
    "retryCount": 3,
    "tags": ["connection-error", "database"]
  },
  "error": {
    "name": "TimeoutError",
    "message": "Connection timeout after 5000ms",
    "stack": "at DatabaseConnection.connect (db.ts:123:45)"
  }
}
```

#### Completion Log
```json
{
  "timestamp": "2025-11-16T03:20:42Z",
  "level": "info",
  "message": "Task completed successfully",
  "correlationId": "task:task-001:agent",
  "source": "cfn-agent-task-001",
  "context": {
    "agentId": "backend-dev-001",
    "taskId": "task-001",
    "iteration": 1,
    "sprintId": "sprint-4"
  },
  "metadata": {
    "duration": 300000,
    "confidence": 0.92,
    "tags": ["task-complete", "success"]
  }
}
```

---

## Docker Configuration

### Configuration File

**Location**: `/home/user/claude-flow-novice/docker/logging-config.json`

The Docker logging configuration specifies:
- Logging driver (json-file)
- Log rotation settings (100MB per file, keep 10 generations)
- Container labels for metadata
- Environment variable capture

### Docker Compose Integration

Add to `docker-compose.yml`:

```yaml
version: '3.8'

services:
  cfn-agent:
    image: cfn-agent:latest
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "10"
        labels: "com.example.app,com.example.env"
        env: "AGENT_ID,TASK_ID,ITERATION"
    environment:
      AGENT_ID: "backend-dev-001"
      TASK_ID: "task-001"
      ITERATION: "1"
    volumes:
      - /var/log/cfn/containers:/var/log/cfn/containers:rw

  cfn-coordinator:
    image: cfn-coordinator:latest
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "10"
    volumes:
      - /var/log/cfn/coordinator:/var/log/cfn/coordinator:rw
```

### Manual Docker Configuration

For individual container runs:

```bash
docker run \
  --name cfn-agent-001 \
  --log-driver json-file \
  --log-opt max-size=100m \
  --log-opt max-file=10 \
  --log-opt labels=com.example.app \
  --log-opt env=AGENT_ID,TASK_ID \
  -e AGENT_ID=backend-dev-001 \
  -e TASK_ID=task-001 \
  cfn-agent:latest
```

### Viewing Docker Logs

```bash
# View JSON logs for a container
docker logs --follow <container-id>

# View formatted logs
docker logs <container-id> | jq '.'

# Filter by level
docker logs <container-id> | jq 'select(.level=="error")'

# Search by correlation ID
docker logs <container-id> | jq 'select(.correlationId=="task-001:task:agent")'
```

---

## Log Aggregation

### Using Log Aggregator Script

**Location**: `/home/user/claude-flow-novice/scripts/log-aggregator.sh`

#### Basic Aggregation

```bash
# Aggregate all logs from Docker and filesystem
./scripts/log-aggregator.sh --source all --output /var/log/cfn/aggregated

# Aggregate only Docker logs
./scripts/log-aggregator.sh --source docker

# Aggregate only filesystem logs
./scripts/log-aggregator.sh --source filesystem
```

#### Advanced Aggregation

```bash
# Aggregate recent logs with deduplication
./scripts/log-aggregator.sh \
  --source all \
  --since 24h \
  --deduplicate \
  --validate \
  --compress

# Aggregate and correlate by task ID
./scripts/log-aggregator.sh \
  --source all \
  --correlate-by taskId \
  --output /var/log/cfn/by-task
```

#### Using CFN Skill

```bash
# Use the CFN Log Operations skill
./.claude/skills/cfn-log-operations/execute.sh aggregate \
  --source all \
  --validate \
  --compress
```

### Aggregation Workflow

1. **Collection**: Gather logs from Docker containers and filesystem
2. **Parsing**: Convert to standardized JSON format
3. **Deduplication** (optional): Remove duplicate entries
4. **Validation** (optional): Check JSON structure
5. **Correlation** (optional): Group by specified field
6. **Sorting**: Order by timestamp
7. **Compression** (optional): Compress aggregated files
8. **Output**: Write to aggregated log directory

---

## Log Rotation and Retention

### Logrotate Configuration

**Location**: `/home/user/claude-flow-novice/config/logrotate.d/cfn-logs`

The logrotate configuration manages:
- **Rotation Trigger**: 100MB per file
- **Retention**: 30 days for standard logs, 7 days for debug logs
- **Compression**: Gzip compression (level 6)
- **Post-rotation Actions**: Cleanup, metrics export

### Manual Log Rotation

```bash
# Test logrotate configuration
logrotate -d /etc/logrotate.d/cfn-logs

# Force rotation
logrotate -f /etc/logrotate.d/cfn-logs

# Rotate specific directory
./scripts/log-aggregator.sh --rotate
```

### Using CFN Skill

```bash
# Rotate logs with default settings
./.claude/skills/cfn-log-operations/execute.sh rotate

# Rotate with compression
./.claude/skills/cfn-log-operations/execute.sh rotate --compress

# Rotate with custom settings
./.claude/skills/cfn-log-operations/execute.sh rotate \
  --max-size 50M \
  --retention-days 15 \
  --compress
```

### Retention Policies

| Log Type | Retention | Rotation Size |
|----------|-----------|---------------|
| Standard Logs | 30 days | 100MB |
| Debug Logs | 7 days | 50MB |
| Error Logs | 60 days | 50MB |
| Audit Logs | 90 days | 100MB |
| Agent Logs | 30 days | 100MB |
| Coordinator Logs | 30 days | 100MB |

---

## Searching and Filtering

### Using jq for Log Search

#### Search by Correlation ID
```bash
# Find all logs for a specific task execution
jq 'select(.correlationId=="task:task-001:agent")' /var/log/cfn/aggregated/*.log

# Find logs and count
jq 'select(.correlationId=="task:task-001:agent") | {timestamp, level, message}' \
  /var/log/cfn/aggregated/*.log | jq -s 'length'

# Output as formatted table
jq -r '[.timestamp, .level, .message] | @tsv' \
  /var/log/cfn/aggregated/*.log | column -t
```

#### Search by Agent ID
```bash
# Find all logs from a specific agent
jq 'select(.context.agentId=="backend-dev-001")' /var/log/cfn/aggregated/*.log

# List unique messages from agent
jq 'select(.context.agentId=="backend-dev-001") | .message' \
  /var/log/cfn/aggregated/*.log | sort | uniq
```

#### Search by Task ID
```bash
# Find all logs for a specific task
jq 'select(.context.taskId=="task-001")' /var/log/cfn/aggregated/*.log

# Show log timeline for task
jq 'select(.context.taskId=="task-001") | [.timestamp, .level, .message]' \
  /var/log/cfn/aggregated/*.log | jq -r '.[] | @csv'
```

#### Search by Level
```bash
# Find all error logs
jq 'select(.level=="error")' /var/log/cfn/aggregated/*.log

# Count errors by source
jq 'select(.level=="error") | .source' /var/log/cfn/aggregated/*.log | sort | uniq -c

# Find errors in last hour
jq 'select(.level=="error" and .timestamp > "'$(date -u -d '1 hour ago' +'%Y-%m-%dT%H:%M:%SZ')'")' \
  /var/log/cfn/aggregated/*.log
```

#### Complex Queries
```bash
# Find slow operations (duration > 5000ms)
jq 'select(.metadata.duration > 5000)' /var/log/cfn/aggregated/*.log

# Find failed operations (confidence < 0.5)
jq 'select(.metadata.confidence < 0.5)' /var/log/cfn/aggregated/*.log

# Find logs with specific tags
jq 'select(.metadata.tags[] | select(. == "connection-error"))' /var/log/cfn/aggregated/*.log

# Export errors to CSV
jq -r 'select(.level=="error") | [.timestamp, .level, .message, .source] | @csv' \
  /var/log/cfn/aggregated/*.log > errors.csv

# Aggregate errors by source
jq 'select(.level=="error") | {source, message}' /var/log/cfn/aggregated/*.log | \
  jq -s 'group_by(.source) | map({source: .[0].source, count: length})'
```

### Using grep and Tools

```bash
# Find logs for correlation ID
grep 'task:task-001:agent' /var/log/cfn/aggregated/*.log | jq '.'

# Find error logs with pattern matching
grep '"level":"error"' /var/log/cfn/aggregated/*.log | grep 'connection'

# Count log entries
grep -h '.' /var/log/cfn/aggregated/*.log | wc -l

# Find logs from specific time range
awk '/2025-11-16T03:1[0-5]:/' /var/log/cfn/aggregated/*.log | jq '.'
```

### Using CFN Log Operations Skill

```bash
# Search by correlation ID
./.claude/skills/cfn-log-operations/execute.sh search \
  --correlation-id "task:task-001:agent" \
  --format detailed

# Search by agent ID
./.claude/skills/cfn-log-operations/execute.sh search \
  --agent-id "backend-dev-001" \
  --format json

# Find errors from last 24 hours
./.claude/skills/cfn-log-operations/execute.sh search \
  --level error \
  --since 24h \
  --format text

# Search with pattern matching
./.claude/skills/cfn-log-operations/execute.sh search \
  --pattern "timeout" \
  --since 2h \
  --limit 50
```

---

## Monitoring and Alerting

### Using Log Monitor Script

**Location**: `/home/user/claude-flow-novice/scripts/log-monitor.sh`

#### Basic Monitoring

```bash
# Monitor logs with default settings
./scripts/log-monitor.sh

# Monitor with custom error threshold
./scripts/log-monitor.sh --error-threshold 20

# Monitor as daemon
./scripts/log-monitor.sh --daemon --interval 60
```

#### Advanced Monitoring

```bash
# Monitor with performance checks
./scripts/log-monitor.sh \
  --daemon \
  --performance-check \
  --retention-check \
  --interval 60

# Monitor with webhook alerts
./scripts/log-monitor.sh \
  --daemon \
  --action webhook \
  --webhook-url https://hooks.slack.com/services/YOUR/WEBHOOK

# Monitor with email alerts
./scripts/log-monitor.sh \
  --daemon \
  --action email \
  --email-to ops@example.com
```

#### Using CFN Skill

```bash
# Monitor logs
./.claude/skills/cfn-log-operations/execute.sh monitor

# Monitor with performance tracking
./.claude/skills/cfn-log-operations/execute.sh monitor \
  --daemon \
  --performance-check \
  --retention-check
```

### Alert Triggers

Alerts are triggered on:

- **ERROR Level Logs**: Log level == "error"
- **FATAL Level Logs**: Log level == "fatal"
- **Error Threshold**: Count of errors > threshold
- **CPU Warning**: CPU usage > 75%
- **Memory Warning**: Memory usage > 85%
- **Disk Critical**: Disk usage > 90%
- **Abnormal Growth**: Log file growth > 10MB/min

### Alert Actions

- **log**: Write to local log file
- **email**: Send email notification
- **webhook**: POST to webhook URL (Slack, Discord, etc.)

---

## Performance Optimization

### Logging Overhead

The distributed logging system is designed for <5% CPU overhead:

- JSON formatting is handled by logging libraries
- Async I/O prevents blocking
- Compression is deferred to post-rotation
- Aggregation runs on schedule, not real-time

### Metrics

Monitor these performance metrics:

```bash
# Check logging overhead
./.claude/skills/cfn-log-operations/execute.sh stats --format json | \
  jq '.statistics | {totalEntries, totalSizeBytes, totalSizeMB}'

# Monitor specific container logs
docker stats <container-id> | awk '{print $3}'

# Check disk I/O
iostat -x 1 5

# Check CPU usage
ps aux | grep log | awk '{sum+=$3} END {print sum "%"}'
```

### Optimization Strategies

1. **Structured Logging**: Use standard JSON format
2. **Async Writing**: Buffer logs before writing
3. **Compression**: Compress rotated files asynchronously
4. **Deduplication**: Remove duplicates during aggregation
5. **Time-Based Filtering**: Reduce search scope with `--since` flag
6. **Result Limiting**: Use `--limit` to cap result set

---

## Troubleshooting

### No Logs Found

**Problem**: Searches return no results

**Solutions**:
```bash
# Verify log directory exists
ls -la /var/log/cfn/

# Check file permissions
stat /var/log/cfn/containers/

# List available log files
find /var/log/cfn -name "*.log" -type f

# Verify log format
head -1 /var/log/cfn/containers/*.log | jq '.'

# Check Docker logging configuration
docker inspect <container-id> | jq '.LogDriver'
```

### JSON Parsing Errors

**Problem**: "Invalid JSON" errors during aggregation

**Solutions**:
```bash
# Validate log format
jq . /var/log/cfn/containers/*.log

# Find invalid lines
jq . /var/log/cfn/containers/*.log 2>&1 | grep -A 5 "parse error"

# Check file encoding
file /var/log/cfn/containers/*.log

# Fix mixed content by filtering valid JSON only
grep -h '^{' /var/log/cfn/containers/*.log | jq . | wc -l
```

### Performance Issues

**Problem**: Slow log searches or aggregation

**Solutions**:
```bash
# Reduce search scope
./.claude/skills/cfn-log-operations/execute.sh search \
  --level error \
  --since 24h \
  --limit 100

# Check disk space
df /var/log/cfn

# Check inode usage
df -i /var/log/cfn

# Compress old logs manually
find /var/log/cfn -name "*.log.*[0-9]" ! -name "*.gz" -exec gzip {} \;

# Remove old logs
find /var/log/cfn -mtime +30 -delete
```

### Retention Not Working

**Problem**: Logs not being rotated or deleted

**Solutions**:
```bash
# Test logrotate configuration
logrotate -d /etc/logrotate.d/cfn-logs

# Verify logrotate is installed
which logrotate

# Check cron jobs
crontab -l | grep logrotate

# Manually trigger rotation
logrotate -f /etc/logrotate.d/cfn-logs

# Verify permissions
stat /var/log/cfn/containers/
sudo ls -la /var/log/cfn/containers/
```

### High Disk Usage

**Problem**: Log directory using too much disk space

**Solutions**:
```bash
# Check disk usage by log directory
du -sh /var/log/cfn/*

# Find largest log files
find /var/log/cfn -name "*.log*" -exec du -h {} \; | sort -rh | head -10

# Check for uncompressed rotated logs
find /var/log/cfn -name "*.log.*[0-9]" ! -name "*.gz"

# Compress and cleanup
find /var/log/cfn -name "*.log.*[0-9]" ! -name "*.gz" -exec gzip -9 {} \;
find /var/log/cfn -mtime +30 -delete

# Use logrotate to clean up
logrotate -f /etc/logrotate.d/cfn-logs
```

---

## Best Practices

### Logging Standards

1. **Always Use JSON Format**
   ```json
   {"timestamp": "2025-11-16T03:00:00Z", "level": "info", "message": "Task started", "source": "app"}
   ```

2. **Include Correlation IDs**
   - Format: `type:id:agent` (e.g., `task:task-001:agent`)
   - Enables end-to-end tracing

3. **Add Context Information**
   - Agent ID, Task ID, Iteration number
   - Sprint ID for epic tracking

4. **Use Meaningful Messages**
   - Clear, actionable descriptions
   - Include relevant values (IDs, durations, counts)

5. **Set Appropriate Log Levels**
   - `debug`: Detailed diagnostic info
   - `info`: General information
   - `warn`: Warning conditions
   - `error`: Error conditions
   - `fatal`: Critical failures

### Monitoring Best Practices

1. **Set Reasonable Thresholds**
   - Error threshold: 10+ errors in 5 minutes
   - CPU warning: 75%
   - Memory warning: 85%
   - Disk critical: 90%

2. **Configure Appropriate Alerts**
   - Production: Email + Webhook
   - Staging: Webhook only
   - Development: Log only

3. **Regular Log Review**
   - Check error logs daily
   - Analyze error trends weekly
   - Review retention policies monthly

4. **Archive Important Logs**
   - Export critical logs to external storage
   - Maintain audit trail for compliance

### Retention Best Practices

1. **Follow Standard Retention**
   - Standard logs: 30 days
   - Debug logs: 7 days
   - Error logs: 60 days
   - Audit logs: 90 days

2. **Monitor Disk Usage**
   - Alert at 80% disk usage
   - Critical at 90% disk usage
   - Auto-cleanup when critical

3. **Compress Early**
   - Compress after rotation (max 1 day delay)
   - Use gzip compression (level 6)
   - Archive compressed logs to cold storage

4. **Test Retention Policy**
   - Verify logrotate configuration
   - Test cleanup procedures
   - Document recovery processes

### Search Best Practices

1. **Use Correlation IDs for Tracing**
   ```bash
   jq 'select(.correlationId=="task:task-001:agent")' logs/*.json
   ```

2. **Limit Search Scope**
   ```bash
   jq 'select(.timestamp > "2025-11-16T02:00:00Z")' logs/*.json
   ```

3. **Export for Analysis**
   ```bash
   jq -r '[.timestamp, .level, .message] | @csv' logs/*.json > analysis.csv
   ```

4. **Automate Common Searches**
   ```bash
   # Create search shortcuts
   alias cfn-errors='jq "select(.level==\"error\")" /var/log/cfn/aggregated/*.log'
   alias cfn-agent='jq "select(.context.agentId==\"$1\")"'
   ```

---

## Integration with CFN System

### Application Logging

Use the TypeScript logging utility from Task 0.5:

```typescript
import { createLogger } from 'src/lib/logging';

const logger = createLogger('myservice', {
  console: true,
  filePath: '/var/log/cfn/agents/myservice.log'
});

logger.info('Task started', {
  correlationId: 'task:001:agent',
  context: { agentId: 'backend-dev', taskId: 'task-001' }
});

logger.error('Connection failed', new Error('timeout'), {
  duration: 5000,
  retryCount: 3
});
```

### CFN Skill Integration

Use the CFN Log Operations skill in orchestration:

```bash
# In orchestration scripts
./.claude/skills/cfn-log-operations/execute.sh search \
  --correlation-id "$TASK_ID:task:agent" \
  --format json > "$TASK_DIR/logs.json"

# Aggregate after task completion
./.claude/skills/cfn-log-operations/execute.sh aggregate \
  --source all \
  --since 24h \
  --correlate-by taskId
```

---

## Metrics and KPIs

Track these key metrics for logging system health:

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Structured Log % | 90%+ | <90% | <80% |
| Search Response Time | <500ms | >1s | >5s |
| Disk Usage | <70% | >80% | >90% |
| Error Log Count | <100/hour | >500/hour | >1000/hour |
| Monitor Uptime | 99.9% | <99% | <95% |
| Retention Compliance | 100% | <95% | <80% |
| CPU Overhead | <5% | >10% | >15% |
| Memory Overhead | <2% | >5% | >10% |

---

## Related Documents

- **Task 0.5**: Logging utilities (`src/lib/logging.ts`)
- **Task 4.1**: Integration infrastructure
- **Docker Logging**: `/home/user/claude-flow-novice/docker/logging-config.json`
- **Log Aggregator**: `/home/user/claude-flow-novice/scripts/log-aggregator.sh`
- **Log Monitor**: `/home/user/claude-flow-novice/scripts/log-monitor.sh`
- **CFN Skill**: `./.claude/skills/cfn-log-operations/SKILL.md`

---

## Support and Feedback

For issues or improvements:
1. Check Troubleshooting section
2. Review relevant logs
3. Test with CFN skill commands
4. Document findings in issue tracker

Last Updated: 2025-11-16
Maintained By: DevOps Team
