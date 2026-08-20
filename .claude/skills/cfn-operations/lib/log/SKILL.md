# CFN Log Operations Skill

**Specialization**: Distributed logging, log aggregation, and monitoring

**Part of**: Task 4.4 Distributed Logging Standardization

## Overview

The CFN Log Operations skill provides comprehensive logging capabilities for the CFN system, including:

- **Log Search and Filtering**: Query logs by correlation ID, agent ID, task ID, or timestamp
- **Log Aggregation**: Combine logs from multiple sources into unified searchable formats
- **Log Rotation and Cleanup**: Manage log lifecycle with retention policies
- **Performance Monitoring**: Track logging overhead and system impact
- **Error Tracking**: Monitor and alert on ERROR/FATAL level logs

## Usage

```bash
$HOME/.claude/skills/cfn-log-operations/execute.sh [COMMAND] [OPTIONS]
```

### Commands

#### search
Search for logs matching specific criteria.

**Syntax**:
```bash
./execute.sh search [OPTIONS]
```

**Options**:
- `--correlation-id ID` - Search by correlation ID
- `--agent-id ID` - Search by agent ID
- `--task-id ID` - Search by task ID
- `--level LEVEL` - Filter by log level (debug, info, warn, error)
- `--since DURATION` - Logs from last N hours/minutes (e.g., 24h, 2h)
- `--pattern PATTERN` - Grep pattern for message
- `--source SOURCE` - Filter by source container/service
- `--format FORMAT` - Output format (json, text, csv)
- `--limit COUNT` - Limit results (default: 100)

**Examples**:
```bash
# Search by correlation ID
./execute.sh search --correlation-id "task:task-001:agent"

# Find all errors in last 24 hours
./execute.sh search --level error --since 24h

# Find logs from specific agent
./execute.sh search --agent-id "backend-dev-001" --format json

# Search with message pattern
./execute.sh search --pattern "connection" --since 2h
```

#### aggregate
Aggregate logs from multiple sources into unified log files.

**Syntax**:
```bash
./execute.sh aggregate [OPTIONS]
```

**Options**:
- `--source SOURCE` - Log source (docker, filesystem, all)
- `--output OUTPUT_DIR` - Output directory
- `--since DURATION` - Only aggregate recent logs
- `--deduplicate` - Remove duplicate entries
- `--validate` - Validate JSON structure
- `--compress` - Compress aggregated logs
- `--correlate-by FIELD` - Group by field (correlationId, agentId, taskId)

**Examples**:
```bash
# Aggregate all logs from last 24 hours
./execute.sh aggregate --source all --since 24h

# Aggregate and deduplicate
./execute.sh aggregate --source filesystem --deduplicate --validate

# Aggregate with compression
./execute.sh aggregate --source docker --compress
```

#### rotate
Manage log rotation and retention.

**Syntax**:
```bash
./execute.sh rotate [OPTIONS]
```

**Options**:
- `--log-dir DIR` - Directory to rotate (default: /var/log/cfn)
- `--max-size SIZE` - Maximum file size (e.g., 100M)
- `--max-files COUNT` - Maximum rotated files to keep
- `--compress` - Compress rotated logs
- `--retention-days DAYS` - Retention period
- `--force` - Force rotation even if not due

**Examples**:
```bash
# Rotate all logs
./execute.sh rotate

# Rotate with custom size and retention
./execute.sh rotate --max-size 50M --retention-days 30

# Force rotation with compression
./execute.sh rotate --force --compress
```

#### monitor
Monitor logs for errors and performance issues.

**Syntax**:
```bash
./execute.sh monitor [OPTIONS]
```

**Options**:
- `--interval SECONDS` - Check interval (default: 60)
- `--alert-on LEVEL` - Alert levels (default: error,fatal)
- `--error-threshold COUNT` - Error count threshold
- `--action ACTION` - Alert action (log, email, webhook)
- `--performance-check` - Enable performance monitoring
- `--retention-check` - Enable retention compliance check
- `--daemon` - Run as daemon

**Examples**:
```bash
# Monitor with default settings
./execute.sh monitor

# Monitor with custom error threshold
./execute.sh monitor --error-threshold 20

# Monitor as daemon with performance checks
./execute.sh monitor --daemon --performance-check --retention-check
```

#### stats
Generate log statistics and metrics.

**Syntax**:
```bash
./execute.sh stats [OPTIONS]
```

**Options**:
- `--log-dir DIR` - Directory to analyze
- `--since DURATION` - Time window for analysis
- `--format FORMAT` - Output format (json, text)

**Examples**:
```bash
# Get log statistics
./execute.sh stats

# Statistics for last 24 hours
./execute.sh stats --since 24h --format json
```

#### export
Export logs in various formats.

**Syntax**:
```bash
./execute.sh export [OPTIONS]
```

**Options**:
- `--source SOURCE` - Log source directory
- `--format FORMAT` - Output format (json, csv, tsv)
- `--output FILE` - Output file
- `--filter PATTERN` - Filter logs before export

**Examples**:
```bash
# Export to CSV
./execute.sh export --format csv --output logs.csv

# Export errors to JSON
./execute.sh export --filter "level==error" --format json
```

## Log Format Specification

All logs follow the standardized JSON format:

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

### Required Fields
- `timestamp`: ISO 8601 UTC timestamp
- `level`: debug, info, warn, error, fatal
- `message`: Human-readable message
- `source`: Container/service name

### Optional Fields
- `correlationId`: Format: `type:id:agent` (e.g., `task:task-001:agent`)
- `context`: Additional context (agentId, taskId, iteration, sprintId)
- `metadata`: Operation-specific metadata (duration, confidence, tags)
- `error`: Error details (name, message, stack)

## Search Patterns

### Using jq

```bash
# Find all error logs
jq 'select(.level=="error")' logs/*.json

# Filter by correlation ID
jq 'select(.correlationId=="task-001:task:agent")' logs/*.json

# Find logs by agent
jq 'select(.context.agentId=="backend-dev-001")' logs/*.json

# Count errors by source
jq 'select(.level=="error") | .source' logs/*.json | sort | uniq -c

# Complex query: errors in last hour
jq 'select(.level=="error" and .timestamp > "'$(date -u -d '1 hour ago' +'%Y-%m-%dT%H:%M:%SZ')'")' logs/*.json

# Export to CSV
jq -r '[.timestamp, .level, .message, .source] | @csv' logs/*.json
```

### Using grep and awk

```bash
# Find error logs
grep '"level":"error"' logs/*.json

# Find logs by task ID
grep 'task-001' logs/*.json | jq '.'

# Count log levels
grep -o '"level":"[^"]*"' logs/*.json | sort | uniq -c

# Find slow operations (duration > 5000ms)
jq 'select(.metadata.duration > 5000)' logs/*.json
```

## Troubleshooting

### No logs found
- Check log directory path: `/var/log/cfn/`
- Verify log files exist: `ls -la /var/log/cfn/`
- Check permissions: `stat /var/log/cfn/`

### JSON parsing errors
- Validate log format: `./.claude/skills/cfn-log-operations/execute.sh search --validate`
- Check file encoding: `file logs/*.log`
- Review recent logs: `tail -50 logs/*.log`

### Performance issues
- Reduce search scope: use `--since` flag
- Limit results: use `--limit` flag
- Check disk space: `df /var/log/cfn`

### Retention not working
- Verify logrotate config: `/etc/logrotate.d/cfn-logs`
- Test logrotate: `logrotate -d /etc/logrotate.d/cfn-logs`
- Check permissions: files should be readable by logrotate

## Integration

This skill integrates with:
- Docker logging driver (json-file)
- Logrotate for log rotation and retention
- Application logging utilities (`src/lib/logging.ts`)
- Monitoring systems (custom alerting)

## Performance Targets

- Search operation: <500ms for 1GB of logs
- Aggregation: <5% CPU overhead
- Monitoring: <1% memory overhead when running as daemon
- 90%+ structured JSON logs (10% unstructured OK)

## Related Tasks

- **Task 0.5**: Logging utilities (`src/lib/logging.ts`)
- **Task 4.1**: Integration infrastructure
- **Task 4.4**: Distributed logging standardization
