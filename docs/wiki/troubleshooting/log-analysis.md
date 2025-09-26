# Log Analysis and Monitoring Guide

This guide covers comprehensive log analysis, monitoring strategies, and diagnostic techniques for Claude Flow.

## Table of Contents

1. [Log System Overview](#log-system-overview)
2. [Log Formats and Structure](#log-formats-and-structure)
3. [Log Collection and Aggregation](#log-collection-and-aggregation)
4. [Analysis Techniques](#analysis-techniques)
5. [Monitoring and Alerting](#monitoring-and-alerting)
6. [Troubleshooting with Logs](#troubleshooting-with-logs)
7. [Log Management Best Practices](#log-management-best-practices)

## Log System Overview

### Log Sources in Claude Flow

```bash
# Application logs
~/.claude-flow/logs/application.log

# Agent logs
~/.claude-flow/logs/agents/agent-{id}.log

# MCP server logs
~/.claude-flow/logs/mcp/server.log

# Performance logs
~/.claude-flow/logs/performance/metrics.log

# Error logs
~/.claude-flow/logs/errors/error.log

# Debug logs (when enabled)
~/.claude-flow/logs/debug/debug.log
```

### Log Management Commands

```bash
# View recent logs
claude-flow-novice logs

# View specific log file
claude-flow-novice logs --file application

# Follow logs in real-time
claude-flow-novice logs --follow

# View logs from specific time
claude-flow-novice logs --since "2024-09-26T10:00:00Z"

# View last N lines
claude-flow-novice logs --tail 100

# Export logs
claude-flow-novice logs --export logs-$(date +%Y%m%d).tar.gz
```

## Log Formats and Structure

### Standard Log Format

```
[TIMESTAMP] [LEVEL] [COMPONENT] [CORRELATION_ID] MESSAGE [METADATA]
```

**Example:**
```
[2024-09-26T10:30:45.123Z] [INFO] [AGENT] [req-abc123] Agent spawned successfully {agentId: "agent-456", type: "researcher", pid: 12345}
```

### JSON Log Format

```json
{
  "timestamp": "2024-09-26T10:30:45.123Z",
  "level": "INFO",
  "component": "AGENT",
  "correlationId": "req-abc123",
  "message": "Agent spawned successfully",
  "metadata": {
    "agentId": "agent-456",
    "type": "researcher",
    "pid": 12345,
    "memoryUsage": "128MB",
    "cpuUsage": "5%"
  }
}
```

### Log Levels

| Level | Code | Description | When to Use |
|-------|------|-------------|-------------|
| **TRACE** | 10 | Detailed execution flow | Development debugging |
| **DEBUG** | 20 | Debugging information | Development and troubleshooting |
| **INFO** | 30 | General information | Normal operations |
| **WARN** | 40 | Warning conditions | Potential issues |
| **ERROR** | 50 | Error conditions | Errors that don't stop execution |
| **FATAL** | 60 | Fatal errors | Critical errors that stop execution |

### Component Categories

```bash
# Core components
SYSTEM     # System-level operations
CONFIG     # Configuration management
NETWORK    # Network operations
STORAGE    # File system and database operations

# Application components
AGENT      # Agent lifecycle and operations
SWARM      # Swarm coordination
TASK       # Task execution
MCP        # MCP server communication

# Performance components
PERF       # Performance metrics
MEMORY     # Memory usage
CPU        # CPU usage
IO         # Input/output operations
```

## Log Collection and Aggregation

### Local Log Collection

```bash
# Configure log aggregation
claude-flow-novice config set logging.aggregation true

# Set log retention
claude-flow-novice config set logging.retention.days 30

# Configure log rotation
claude-flow-novice config set logging.rotation.size "100MB"
claude-flow-novice config set logging.rotation.files 10
```

### Centralized Logging

#### Using rsyslog (Linux)
```bash
# Configure rsyslog for Claude Flow
echo 'local0.*    /var/log/claude-flow.log' >> /etc/rsyslog.conf
systemctl restart rsyslog

# Send logs to syslog
claude-flow-novice config set logging.syslog.enabled true
claude-flow-novice config set logging.syslog.facility local0
```

#### Using journald (systemd)
```bash
# Create systemd service
cat > /etc/systemd/system/claude-flow.service << EOF
[Unit]
Description=Claude Flow Service
After=network.target

[Service]
Type=simple
User=claude-flow
ExecStart=/usr/local/bin/claude-flow-novice daemon
Restart=always
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# View logs with journalctl
journalctl -u claude-flow -f
```

### Remote Log Shipping

#### Using Filebeat (ELK Stack)
```yaml
# filebeat.yml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /home/user/.claude-flow/logs/*.log
  fields:
    service: claude-flow
  json.keys_under_root: true

output.elasticsearch:
  hosts: ["localhost:9200"]
  index: "claude-flow-%{+yyyy.MM.dd}"
```

#### Using Fluentd
```ruby
# td-agent.conf
<source>
  @type tail
  path /home/user/.claude-flow/logs/*.log
  pos_file /var/log/td-agent/claude-flow.log.pos
  tag claude-flow
  format json
</source>

<match claude-flow>
  @type elasticsearch
  host localhost
  port 9200
  index_name claude-flow
  type_name _doc
</match>
```

## Analysis Techniques

### Command Line Analysis

#### Using grep
```bash
# Find error messages
grep -r "ERROR" ~/.claude-flow/logs/

# Find specific agent issues
grep "agent-456" ~/.claude-flow/logs/agents/

# Find patterns
grep -E "ERROR|FATAL" ~/.claude-flow/logs/application.log

# Count error types
grep "ERROR" ~/.claude-flow/logs/application.log | cut -d' ' -f4 | sort | uniq -c
```

#### Using awk
```bash
# Extract specific fields
awk -F' ' '{print $1, $3, $5}' ~/.claude-flow/logs/application.log

# Calculate error rates
awk '/ERROR/ {errors++} END {print "Error count:", errors}' ~/.claude-flow/logs/application.log

# Time-based analysis
awk '$1 >= "2024-09-26T10:00:00Z" && $1 <= "2024-09-26T11:00:00Z"' ~/.claude-flow/logs/application.log
```

#### Using jq (for JSON logs)
```bash
# Extract specific fields from JSON logs
jq '.timestamp, .level, .message' ~/.claude-flow/logs/application.json

# Filter by log level
jq 'select(.level == "ERROR")' ~/.claude-flow/logs/application.json

# Aggregate by component
jq -r '.component' ~/.claude-flow/logs/application.json | sort | uniq -c

# Calculate average response time
jq -r 'select(.metadata.responseTime) | .metadata.responseTime' ~/.claude-flow/logs/performance.json | awk '{sum+=$1; count++} END {print "Average:", sum/count "ms"}'
```

### Statistical Analysis

#### Error Rate Analysis
```bash
# Calculate error rate per hour
cat ~/.claude-flow/logs/application.log | \
awk '{hour=substr($1,12,2); if($2=="ERROR") errors[hour]++; total[hour]++}
     END {for(h in total) printf "Hour %s: %.2f%% error rate\n", h, (errors[h]/total[h])*100}'
```

#### Performance Trend Analysis
```bash
# Memory usage trend
grep "MEMORY" ~/.claude-flow/logs/performance.log | \
awk '{print $1, $6}' | \
gnuplot -e "set terminal dumb; plot '-' using 1:2 with lines title 'Memory Usage'"
```

#### Response Time Analysis
```bash
# Response time percentiles
grep "responseTime" ~/.claude-flow/logs/performance.log | \
awk -F'"' '{print $4}' | \
sort -n | \
awk '{
  times[NR] = $1
}
END {
  print "50th percentile:", times[int(NR*0.5)]
  print "95th percentile:", times[int(NR*0.95)]
  print "99th percentile:", times[int(NR*0.99)]
}'
```

### Advanced Analysis Tools

#### Using claude-flow-novice built-in analysis
```bash
# Analyze error patterns
claude-flow-novice logs analyze --pattern errors

# Performance analysis
claude-flow-novice logs analyze --pattern performance

# Agent behavior analysis
claude-flow-novice logs analyze --pattern agents

# Generate analysis report
claude-flow-novice logs analyze --report --output analysis-report.html
```

#### Using external tools

##### GoAccess (for web-like log analysis)
```bash
# Install GoAccess
# Ubuntu/Debian: apt-get install goaccess
# macOS: brew install goaccess

# Convert logs to Common Log Format and analyze
goaccess ~/.claude-flow/logs/application.log --log-format=COMBINED -o report.html
```

##### Logstash patterns
```ruby
# logstash.conf
input {
  file {
    path => "/home/user/.claude-flow/logs/*.log"
    start_position => "beginning"
  }
}

filter {
  grok {
    match => { "message" => "\[%{TIMESTAMP_ISO8601:timestamp}\] \[%{LOGLEVEL:level}\] \[%{WORD:component}\] %{GREEDYDATA:message}" }
  }

  date {
    match => [ "timestamp", "ISO8601" ]
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "claude-flow-%{+YYYY.MM.dd}"
  }
}
```

## Monitoring and Alerting

### Real-time Monitoring

```bash
# Real-time log monitoring
claude-flow-novice logs monitor --real-time

# Monitor specific patterns
claude-flow-novice logs monitor --pattern "ERROR|FATAL"

# Monitor performance metrics
claude-flow-novice logs monitor --metrics performance

# Dashboard view
claude-flow-novice dashboard --logs
```

### Automated Alerting

#### Log-based Alerts
```bash
# Configure error threshold alerts
claude-flow-novice alerts config \
  --pattern "ERROR" \
  --threshold 10 \
  --window 300 \
  --action "email:admin@company.com"

# Performance degradation alerts
claude-flow-novice alerts config \
  --pattern "responseTime.*[5-9][0-9]{3}" \
  --threshold 5 \
  --window 60 \
  --action "slack:#alerts"

# Agent failure alerts
claude-flow-novice alerts config \
  --pattern "Agent.*failed" \
  --threshold 1 \
  --window 60 \
  --action "pagerduty:service-key"
```

#### Custom Alert Scripts
```bash
#!/bin/bash
# alert-on-errors.sh

LOG_FILE="$HOME/.claude-flow/logs/application.log"
ERROR_THRESHOLD=5
TIME_WINDOW=300  # 5 minutes

# Count errors in the last 5 minutes
error_count=$(tail -n 1000 "$LOG_FILE" | \
  awk -v threshold=$(date -d "5 minutes ago" +%s) \
  'BEGIN{FS="[\\[\\]]"} {
    if (mktime(gensub(/-|T|:/, " ", "g", $2)) > threshold && $4 == "ERROR")
      count++
  } END {print count+0}')

if [ "$error_count" -ge "$ERROR_THRESHOLD" ]; then
  echo "ALERT: $error_count errors detected in the last 5 minutes" | \
  mail -s "Claude Flow Error Alert" admin@company.com
fi
```

### Health Monitoring Dashboards

#### Grafana Configuration
```json
{
  "dashboard": {
    "title": "Claude Flow Monitoring",
    "panels": [
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(claude_flow_errors_total[5m])",
            "legendFormat": "Errors per second"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "claude_flow_response_time_percentile{quantile=\"0.95\"}",
            "legendFormat": "95th percentile"
          }
        ]
      }
    ]
  }
}
```

## Troubleshooting with Logs

### Common Log Patterns for Issues

#### Agent Spawn Failures
```bash
# Pattern to look for
grep -A5 -B5 "Agent spawn failed" ~/.claude-flow/logs/application.log

# Common causes in logs:
# - "Memory limit exceeded"
# - "Network connection failed"
# - "Configuration invalid"
# - "Resource unavailable"
```

#### MCP Communication Issues
```bash
# Look for MCP-related errors
grep "MCP" ~/.claude-flow/logs/application.log | grep "ERROR"

# Common patterns:
# - "MCP server connection failed"
# - "Tool invocation timeout"
# - "Invalid response format"
# - "Authentication failed"
```

#### Performance Degradation
```bash
# Look for performance indicators
grep -E "slow|timeout|exceeded" ~/.claude-flow/logs/performance.log

# Memory issues
grep "memory" ~/.claude-flow/logs/application.log | grep -E "ERROR|WARN"

# CPU issues
grep "CPU usage" ~/.claude-flow/logs/performance.log | awk '$NF > 80'
```

### Log Correlation Techniques

#### Correlation ID Tracking
```bash
# Extract correlation ID from error
correlation_id=$(grep "ERROR" ~/.claude-flow/logs/application.log | head -1 | awk '{print $4}')

# Find all related log entries
grep "$correlation_id" ~/.claude-flow/logs/*.log

# Trace request flow
grep "$correlation_id" ~/.claude-flow/logs/*.log | sort
```

#### Time-based Correlation
```bash
# Find events around specific time
error_time="2024-09-26T10:30:45"
start_time=$(date -d "$error_time -5 minutes" --iso-8601=seconds)
end_time=$(date -d "$error_time +5 minutes" --iso-8601=seconds)

awk -v start="$start_time" -v end="$end_time" \
  '$1 >= start && $1 <= end' ~/.claude-flow/logs/application.log
```

### Root Cause Analysis

#### Log Analysis Workflow
```bash
# 1. Identify the error
grep "ERROR\|FATAL" ~/.claude-flow/logs/application.log | tail -10

# 2. Get error context
error_time=$(grep "ERROR" ~/.claude-flow/logs/application.log | tail -1 | awk '{print $1}')
grep -C10 "$error_time" ~/.claude-flow/logs/application.log

# 3. Check related components
correlation_id=$(grep "$error_time" ~/.claude-flow/logs/application.log | awk '{print $4}')
grep "$correlation_id" ~/.claude-flow/logs/agents/*.log

# 4. Analyze patterns
grep "ERROR" ~/.claude-flow/logs/application.log | \
  awk '{print $5}' | sort | uniq -c | sort -nr
```

## Log Management Best Practices

### Log Retention and Rotation

```bash
# Configure log rotation
claude-flow-novice config set logging.rotation.enabled true
claude-flow-novice config set logging.rotation.maxSize "100MB"
claude-flow-novice config set logging.rotation.maxFiles 10
claude-flow-novice config set logging.retention.days 30

# Manual log rotation
claude-flow-novice logs rotate

# Clean old logs
claude-flow-novice logs cleanup --older-than 30d
```

### Log Compression and Archival

```bash
# Compress old logs
find ~/.claude-flow/logs -name "*.log" -mtime +7 -exec gzip {} \;

# Archive logs monthly
tar -czf logs-$(date +%Y%m).tar.gz ~/.claude-flow/logs/*.log.gz
mv logs-$(date +%Y%m).tar.gz /archive/claude-flow/

# Automated archival script
#!/bin/bash
# archive-logs.sh
LOG_DIR="$HOME/.claude-flow/logs"
ARCHIVE_DIR="/archive/claude-flow"
RETENTION_DAYS=30

# Create archive
tar -czf "$ARCHIVE_DIR/logs-$(date +%Y%m%d).tar.gz" "$LOG_DIR"/*.log

# Remove old archives
find "$ARCHIVE_DIR" -name "logs-*.tar.gz" -mtime +$RETENTION_DAYS -delete

# Rotate current logs
claude-flow-novice logs rotate
```

### Performance Optimization

```bash
# Asynchronous logging
claude-flow-novice config set logging.async true

# Buffer size optimization
claude-flow-novice config set logging.bufferSize 8192

# Sampling for high-volume logs
claude-flow-novice config set logging.sampling.enabled true
claude-flow-novice config set logging.sampling.rate 0.1  # 10% sampling

# Disable debug logging in production
claude-flow-novice config set logging.level info
```

### Security Considerations

```bash
# Secure log file permissions
chmod 640 ~/.claude-flow/logs/*.log
chown claude-flow:log-readers ~/.claude-flow/logs/*.log

# Sanitize sensitive data
claude-flow-novice config set logging.sanitize.enabled true
claude-flow-novice config set logging.sanitize.patterns "password,apikey,token"

# Encrypt archived logs
gpg --symmetric --cipher-algo AES256 logs-archive.tar.gz
```

### Monitoring Log Health

```bash
# Monitor log file sizes
du -sh ~/.claude-flow/logs/*.log

# Check log write permissions
claude-flow-novice logs test-write

# Verify log format
claude-flow-novice logs validate --format

# Monitor disk space
df -h $(dirname ~/.claude-flow/logs)
```

### Integration with External Systems

#### Splunk Integration
```bash
# Configure Splunk forwarder
cat >> $SPLUNK_HOME/etc/system/local/inputs.conf << EOF
[monitor://$HOME/.claude-flow/logs/*.log]
disabled = false
index = claude_flow
sourcetype = claude_flow_log
EOF
```

#### ELK Stack Integration
```yaml
# logstash pipeline
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][service] == "claude-flow" {
    json {
      source => "message"
    }

    mutate {
      add_field => { "[@metadata][index]" => "claude-flow-%{+YYYY.MM.dd}" }
    }
  }
}

output {
  if [fields][service] == "claude-flow" {
    elasticsearch {
      hosts => ["localhost:9200"]
      index => "%{[@metadata][index]}"
    }
  }
}
```

---

**Next Steps:**
- [Performance Troubleshooting](./performance-troubleshooting.md)
- [Configuration Troubleshooting](./configuration-troubleshooting.md)
- [Platform-Specific Issues](./windows-troubleshooting.md)