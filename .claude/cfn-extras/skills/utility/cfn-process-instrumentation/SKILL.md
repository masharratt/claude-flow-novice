# CFN Process Instrumentation Skill

## Purpose

Provides comprehensive process instrumentation, monitoring, and automatic resource limiting for CFN Loop agents and orchestration processes. This skill is essential for detecting and preventing memory leaks before they impact system performance.

## Core Functions

### Process Monitoring
- Real-time memory usage tracking
- CPU utilization monitoring
- File handle and thread tracking
- Automatic resource limit enforcement

### Telemetry Collection
- Structured metrics collection in JSON format
- Time-series data for performance analysis
- Process lifecycle tracking
- Exit code and duration recording

### Resource Limiting
- Memory limit enforcement with automatic termination
- CPU usage throttling and monitoring
- Timeout protection for long-running processes
- Configurable limits per agent type

## Usage Patterns

### Automatic Instrumentation
```bash
#!/usr/bin/env bash

# Source to automatically instrument current process
source "./cfn-process-instrumentation/instrument-process.sh"

# Rest of script runs with monitoring
```

### Manual Process Monitoring
```bash
# Monitor specific PID
./cfn-process-instrumentation/instrument-process.sh monitor-pid 12345

# Instrument with custom limits
AGENT_ID="my-agent" CFN_MEMORY_LIMIT="1G" \
    ./instrument-process.sh
```

### Integration in Agent Spawning
```bash
#!/usr/bin/env bash

# Load instrumentation before spawning agent
source "./cfn-process-instrumentation/instrument-process.sh"

# Spawn agent with monitoring
npx claude-flow-novice agent "$AGENT_TYPE" \
    --max-memory "$CFN_MEMORY_LIMIT" \
    --timeout "$CFN_TIMEOUT"
```

## Configuration

### Environment Variables
- `AGENT_ID`: Unique identifier for the agent process
- `CFN_MEMORY_LIMIT`: Memory limit (default: 2G, formats: 2G, 2048M, etc.)
- `CFN_CPU_LIMIT`: CPU usage limit as percentage (default: 80%)
- `CFN_TIMEOUT`: Maximum execution time in seconds (default: 600)
- `CFN_TELEMETRY_DIR`: Directory for metrics storage (default: /tmp/cfn-telemetry)

### Resource Limits
The skill enforces configurable limits:
- **Memory**: Prevents OOM conditions with automatic termination
- **CPU**: Throttles excessive CPU usage
- **Timeout**: Kills processes that exceed time limits
- **File Handles**: Monitors for file descriptor leaks

## Telemetry Data Structure

### Metrics Format
```json
{
  "agent_id": "agent-123",
  "start_time": "2025-01-06T10:00:00Z",
  "process_id": "12345",
  "memory_limit": "2G",
  "cpu_limit": "80%",
  "timeout": "600",
  "end_time": "2025-01-06T10:05:00Z",
  "exit_code": "0",
  "samples": [
    {
      "timestamp": "2025-01-06T10:01:00Z",
      "memory_kb": "102400",
      "cpu_percent": "15.5",
      "open_files": "45",
      "threads": "8"
    }
  ]
}
```

### Collected Metrics
- **Memory Usage**: RSS memory in kilobytes
- **CPU Usage**: Percentage of CPU utilization
- **Open Files**: Number of open file descriptors
- **Threads**: Number of active threads
- **Timestamp**: ISO 8601 formatted time

## Integration Points

### Orchestration Scripts
```bash
#!/usr/bin/env bash

# Load instrumentation for orchestrator
source "./cfn-process-instrumentation/instrument-process.sh"

# Orchestrator runs with monitoring
echo "Starting orchestration with process monitoring"
```

### Agent Templates
```bash
#!/usr/bin/env bash

# All agents get automatic instrumentation
source "./cfn-process-instrumentation/instrument-process.sh"

# Agent execution code
echo "Agent execution monitored and resource-limited"
```

### CFN Loop Integration
- **Loop 1**: Orchestration process monitoring
- **Loop 2**: Validator process tracking
- **Loop 3**: Implementation agent monitoring
- **Loop 4**: Product Owner process tracking

## Safety Features

### Graceful Shutdown
- SIGTERM sent before SIGKILL
- Cleanup traps for proper resource release
- Final report generation on exit

### Error Handling
- Missing tools handled gracefully
- Fallback behavior when utilities unavailable
- Comprehensive error logging

### Resource Protection
- Automatic termination on limit violation
- Background monitoring with minimal overhead
- Process group management for cleanup

## Performance Considerations

### Monitoring Overhead
- Minimal impact on agent performance (<1% CPU)
- Efficient metric collection with native tools
- Configurable monitoring intervals (default: 30s)

### Storage Efficiency
- JSON metrics with compact storage
- Automatic cleanup of old telemetry files
- Configurable retention policies

### Network Independence
- No external dependencies for monitoring
- Local process inspection only
- Works in isolated environments

## Usage Examples

### Basic Agent Monitoring
```bash
#!/usr/bin/env bash

# Simple agent with monitoring
source "./cfn-process-instrumentation/instrument-process.sh"

# Agent work here
echo "Performing agent tasks..."

# Monitoring and cleanup automatic
```

### Custom Resource Limits
```bash
#!/usr/bin/env bash

# Agent with custom limits
export CFN_MEMORY_LIMIT="1G"
export CFN_CPU_LIMIT="60%"
export CFN_TIMEOUT="300"

source "./cfn-process-instrumentation/instrument-process.sh"

# Agent runs with stricter limits
```

### Background Process Monitoring
```bash
#!/usr/bin/env bash

# Start long-running process
./long-running-task &
TASK_PID=$!

# Monitor the background process
./cfn-process-instrumentation/instrument-process.sh monitor-pid $TASK_PID

# Wait for completion
wait $TASK_PID
```

## Monitoring and Alerting

### Threshold Alerts
- Memory usage approaching limits
- CPU usage sustained at high levels
- File descriptor count growing unexpectedly
- Process hanging without activity

### Telemetry Analysis
```bash
# Analyze metrics for trends
jq '.samples | map(.memory_kb) | add / length' /tmp/cfn-telemetry/metrics_*.json

# Find processes with high memory usage
find /tmp/cfn-telemetry -name "*.json" -exec jq 'if (.samples | length) > 0 then (.samples[-1].memory_kb | tonumber) else 0 end' {} \;
```

### Integration with Monitoring Systems
- JSON metrics compatible with log aggregators
- Time-series data for graphing tools
- Structured alerts for DevOps monitoring

## Troubleshooting

### Common Issues
1. **High monitoring overhead**: Increase monitoring interval
2. **Missing tools**: Install ps, lsof, jq for full functionality
3. **Permission denied**: Check file system permissions for telemetry directory
4. **Process termination**: Review and adjust resource limits

### Debug Mode
```bash
# Enable detailed logging
export CFN_DEBUG=1
source "./cfn-process-instrumentation/instrument-process.sh"
```

### Manual Inspection
```bash
# Check current metrics
cat /tmp/cfn-telemetry/metrics_*.json | jq .

# Monitor process manually
ps -p $$ -o pid,rss,pcpu,nlwp,fd
```

## Security Considerations

### Data Protection
- Telemetry stored in local filesystem only
- No network transmission of metrics
- Configurable storage location

### Process Isolation
- Each agent tracked independently
- No cross-agent data sharing
- Clean separation of metrics

### Access Control
- File permissions restricted to agent user
- No privileged operations required
- Safe execution in untrusted environments