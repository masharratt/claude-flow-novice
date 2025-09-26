# Debug Mode and Advanced Diagnostics

This guide covers debug mode activation, advanced diagnostic techniques, and troubleshooting tools for Claude Flow.

## Table of Contents

1. [Debug Mode Activation](#debug-mode-activation)
2. [Debug Categories](#debug-categories)
3. [Log Analysis and Tracing](#log-analysis-and-tracing)
4. [Performance Profiling](#performance-profiling)
5. [Memory Debugging](#memory-debugging)
6. [Network Debugging](#network-debugging)
7. [Advanced Diagnostic Tools](#advanced-diagnostic-tools)

## Debug Mode Activation

### Environment Variable Method

```bash
# Enable all debug output
export DEBUG=*
claude-flow-novice sparc run "test task"

# Enable specific categories
export DEBUG=claude-flow:*
claude-flow-novice status

# Enable multiple categories
export DEBUG=claude-flow:*,agent:*,mcp:*
claude-flow-novice sparc run "test task"

# Save debug output to file
DEBUG=* claude-flow-novice sparc run "test task" 2> debug.log
```

### Command Line Method

```bash
# Single command with debug
claude-flow-novice --debug sparc run "test task"

# Verbose mode
claude-flow-novice --verbose sparc run "test task"

# Maximum verbosity
claude-flow-novice --verbose=3 sparc run "test task"

# Specific debug level
claude-flow-novice --debug-level=trace sparc run "test task"
```

### Configuration Method

```bash
# Enable debug in configuration
claude-flow-novice config set debug.enabled true
claude-flow-novice config set debug.level trace

# Enable specific debug categories
claude-flow-novice config set debug.categories "agent,swarm,mcp"

# Enable debug output to file
claude-flow-novice config set debug.logToFile true
claude-flow-novice config set debug.logFile debug.log
```

### Programmatic Method

```json
{
  "debug": {
    "enabled": true,
    "level": "trace",
    "categories": ["agent", "swarm", "mcp", "config"],
    "logToFile": true,
    "logFile": "debug.log",
    "console": true
  }
}
```

## Debug Categories

### Core System Categories

```bash
# System-level debugging
DEBUG=system:* claude-flow-novice status

# Configuration debugging
DEBUG=config:* claude-flow-novice config show

# File system operations
DEBUG=fs:* claude-flow-novice sparc run "task"

# Process management
DEBUG=process:* claude-flow-novice sparc run "task"
```

### Agent and Swarm Categories

```bash
# Agent lifecycle debugging
DEBUG=agent:lifecycle claude-flow-novice sparc run "task"

# Agent communication
DEBUG=agent:communication claude-flow-novice sparc run "task"

# Swarm coordination
DEBUG=swarm:coordination claude-flow-novice sparc run "task"

# Task orchestration
DEBUG=task:orchestration claude-flow-novice sparc run "task"
```

### Network and MCP Categories

```bash
# MCP server communication
DEBUG=mcp:server claude-flow-novice mcp status

# MCP tool invocation
DEBUG=mcp:tools claude-flow-novice sparc run "task"

# Network requests
DEBUG=network:* claude-flow-novice sparc run "task"

# HTTP debugging
DEBUG=http:* claude-flow-novice sparc run "task"
```

### Performance Categories

```bash
# Performance monitoring
DEBUG=perf:* claude-flow-novice sparc run "task"

# Memory usage
DEBUG=memory:* claude-flow-novice sparc run "task"

# Timing information
DEBUG=timing:* claude-flow-novice sparc run "task"

# Resource usage
DEBUG=resources:* claude-flow-novice sparc run "task"
```

### Debug Category Examples

```bash
# Complete agent debugging
DEBUG=agent:* claude-flow-novice sparc run "Create user authentication"

# Sample output:
# agent:lifecycle Agent spawning: researcher +0ms
# agent:communication Sending message to agent: researcher +10ms
# agent:coordination Coordinating with swarm +25ms
# agent:lifecycle Agent ready: researcher +45ms
```

## Log Analysis and Tracing

### Log Levels

```bash
# Set specific log levels
claude-flow-novice config set logging.level trace

# Available levels: trace, debug, info, warn, error, fatal
DEBUG=* LOG_LEVEL=trace claude-flow-novice sparc run "task"
```

### Structured Logging

```bash
# Enable structured JSON logging
claude-flow-novice config set logging.format json

# Enable log correlation IDs
claude-flow-novice config set logging.correlationId true

# Example structured log:
# {
#   "timestamp": "2024-09-26T10:30:45.123Z",
#   "level": "debug",
#   "category": "agent",
#   "message": "Agent spawned",
#   "correlationId": "req-123",
#   "agentId": "agent-456",
#   "taskId": "task-789"
# }
```

### Log Filtering and Search

```bash
# Filter logs by level
claude-flow-novice logs --level error

# Search logs
claude-flow-novice logs --search "agent spawn"

# Filter by component
claude-flow-novice logs --component agent

# Time-based filtering
claude-flow-novice logs --since "2024-09-26T10:00:00Z"
claude-flow-novice logs --last 1h

# Export filtered logs
claude-flow-novice logs --level error --export error-logs.json
```

### Trace Correlation

```bash
# Enable request tracing
claude-flow-novice config set tracing.enabled true

# Generate trace ID for operations
TRACE_ID=$(uuidgen) DEBUG=* claude-flow-novice sparc run "task"

# Follow trace through logs
claude-flow-novice logs --trace-id $TRACE_ID
```

## Performance Profiling

### Built-in Profiling

```bash
# Enable performance profiling
claude-flow-novice profile --enable

# Profile specific operation
claude-flow-novice profile --operation "sparc run" --duration 60

# CPU profiling
claude-flow-novice profile --cpu --duration 30

# Memory profiling
claude-flow-novice profile --memory --duration 30
```

### Node.js Profiling

```bash
# CPU profiling with Node.js
node --prof $(which claude-flow-novice) sparc run "task"
node --prof-process isolate-*.log > cpu-profile.txt

# Memory profiling
node --inspect $(which claude-flow-novice) sparc run "task"
# Connect Chrome DevTools to localhost:9229

# Heap snapshots
node --heapsnapshot-signal=SIGUSR2 $(which claude-flow-novice) sparc run "task" &
PID=$!
kill -USR2 $PID
```

### External Profiling Tools

#### clinic.js
```bash
# Install clinic.js
npm install -g clinic

# Doctor (overall performance)
clinic doctor -- claude-flow-novice sparc run "task"

# Flame (CPU profiling)
clinic flame -- claude-flow-novice sparc run "task"

# Bubbleprof (async operations)
clinic bubbleprof -- claude-flow-novice sparc run "task"
```

#### 0x (Flame graphs)
```bash
# Install 0x
npm install -g 0x

# Generate flame graph
0x claude-flow-novice sparc run "task"
```

## Memory Debugging

### Memory Monitoring

```bash
# Real-time memory monitoring
claude-flow-novice monitor --memory --real-time

# Memory usage statistics
claude-flow-novice status --memory --detailed

# Memory leak detection
claude-flow-novice memory-check --leak-detection --duration 10m
```

### Heap Analysis

```bash
# Generate heap snapshot
node --heapsnapshot-signal=SIGUSR2 $(which claude-flow-novice) sparc run "task" &
PID=$!
sleep 30
kill -USR2 $PID
# Analyze .heapsnapshot file in Chrome DevTools
```

### Memory Debugging Tools

#### heapdump
```bash
# Install heapdump module
npm install -g heapdump

# Generate heap dump programmatically
node -e "require('heapdump').writeSnapshot()" $(which claude-flow-novice)
```

#### memwatch-next
```bash
# Install memwatch
npm install -g memwatch-next

# Monitor memory leaks
node -r memwatch-next $(which claude-flow-novice) sparc run "task"
```

### Memory Configuration for Debugging

```bash
# Increase Node.js memory for debugging
export NODE_OPTIONS="--max-old-space-size=16384 --expose-gc"

# Enable memory debugging flags
export NODE_OPTIONS="$NODE_OPTIONS --trace-gc --trace-gc-verbose"

# Enable heap profiling
export NODE_OPTIONS="$NODE_OPTIONS --heap-prof --heap-prof-interval=512"
```

## Network Debugging

### Network Request Tracing

```bash
# Enable network debugging
DEBUG=network:* claude-flow-novice sparc run "task"

# HTTP request debugging
DEBUG=http:* claude-flow-novice sparc run "task"

# MCP network debugging
DEBUG=mcp:network claude-flow-novice mcp status
```

### Network Monitoring Tools

#### tcpdump/Wireshark
```bash
# Capture network traffic (Linux/macOS)
sudo tcpdump -i any -w claude-flow-traffic.pcap host api.anthropic.com

# Analyze with Wireshark
wireshark claude-flow-traffic.pcap
```

#### netstat monitoring
```bash
# Monitor connections
watch -n 1 "netstat -an | grep :3001"

# Monitor network usage
iftop -i eth0
```

### Proxy Debugging

```bash
# Use debugging proxy
npm install -g http-proxy-cli

# Start proxy with logging
http-proxy-cli --port 8888 --target http://api.anthropic.com --verbose

# Configure Claude Flow to use proxy
claude-flow-novice config set network.proxy.http "http://localhost:8888"
```

## Advanced Diagnostic Tools

### System Call Tracing

#### Linux (strace)
```bash
# Trace system calls
strace -f -e trace=file,network,process claude-flow-novice sparc run "task"

# Trace specific system calls
strace -e trace=open,read,write claude-flow-novice sparc run "task"

# Output to file
strace -o trace.log claude-flow-novice sparc run "task"
```

#### macOS (dtruss)
```bash
# Trace system calls on macOS
sudo dtruss -f claude-flow-novice sparc run "task"

# Trace specific calls
sudo dtruss -t open,read,write claude-flow-novice sparc run "task"
```

#### Windows (Process Monitor)
```powershell
# Use Process Monitor (ProcMon) from Microsoft
# Filter by process name: claude-flow-novice or node.exe
# Monitor file system, registry, and network activity
```

### Process Debugging

```bash
# Monitor process tree
pstree -p $(pgrep -f claude-flow)

# Process resource usage
top -p $(pgrep -f claude-flow)

# Detailed process information
ps aux | grep claude-flow

# Process file descriptors
lsof -p $(pgrep -f claude-flow)
```

### Database Debugging

```bash
# SQLite debugging (if using local database)
claude-flow-novice db --debug --query "SELECT * FROM agents"

# Database performance
claude-flow-novice db --explain --query "SELECT * FROM tasks"

# Database integrity check
claude-flow-novice db --check-integrity
```

### Configuration Debugging

```bash
# Debug configuration loading
DEBUG=config:* claude-flow-novice config show

# Validate configuration with debugging
claude-flow-novice config validate --debug

# Show configuration sources
claude-flow-novice config sources --debug
```

## Debugging Specific Issues

### Agent Spawning Issues

```bash
# Debug agent lifecycle
DEBUG=agent:lifecycle,agent:spawn claude-flow-novice sparc run "task"

# Monitor agent resources
claude-flow-novice monitor --agents --resources

# Test agent communication
DEBUG=agent:communication claude-flow-novice test-agent-communication
```

### MCP Communication Issues

```bash
# Debug MCP protocol
DEBUG=mcp:protocol claude-flow-novice mcp test

# Trace MCP tool calls
DEBUG=mcp:tools claude-flow-novice sparc run "task"

# Monitor MCP server
DEBUG=mcp:server claude-flow-novice mcp monitor
```

### Performance Issues

```bash
# Debug performance bottlenecks
DEBUG=perf:* claude-flow-novice sparc run "task"

# Monitor resource usage
DEBUG=resources:* claude-flow-novice monitor --resources

# Profile slow operations
claude-flow-novice profile --slow-operations
```

## Debug Output Analysis

### Reading Debug Output

```bash
# Example debug output format:
# [timestamp] [level] [category] message +time_delta

# Example:
# 2024-09-26T10:30:45.123Z debug agent:spawn Spawning agent: researcher +0ms
# 2024-09-26T10:30:45.133Z debug agent:communication Sending task to agent +10ms
# 2024-09-26T10:30:45.156Z debug agent:lifecycle Agent ready +33ms
```

### Debug Output Tools

```bash
# Pretty-print debug output
DEBUG=* claude-flow-novice sparc run "task" 2>&1 | bunyan

# Filter debug output
DEBUG=* claude-flow-novice sparc run "task" 2>&1 | grep "agent:"

# Analyze timing
DEBUG=* claude-flow-novice sparc run "task" 2>&1 | grep -E "\+[0-9]+ms"
```

### Log Aggregation

```bash
# Centralized logging with journald (Linux)
journalctl -f -u claude-flow

# Syslog integration
logger -t claude-flow "Debug message"

# External log aggregation
# Configure to send logs to ELK stack, Splunk, etc.
```

## Automated Debugging

### Health Monitoring

```bash
# Continuous health monitoring with debugging
claude-flow-novice monitor --health --debug

# Automated issue detection
claude-flow-novice auto-debug --enable

# Performance regression detection
claude-flow-novice monitor --performance --baseline previous-run.json
```

### Debug Automation Scripts

```bash
# Create debug script
cat > debug-claude-flow.sh << 'EOF'
#!/bin/bash
echo "Starting Claude Flow debug session..."
export DEBUG=*
export NODE_OPTIONS="--max-old-space-size=8192"
mkdir -p debug-logs/$(date +%Y%m%d)
claude-flow-novice sparc run "$1" 2> debug-logs/$(date +%Y%m%d)/debug-$(date +%H%M%S).log
echo "Debug logs saved to debug-logs/$(date +%Y%m%d)/"
EOF

chmod +x debug-claude-flow.sh
./debug-claude-flow.sh "test task"
```

### Debug Configuration Management

```bash
# Create debug configuration
claude-flow-novice config profile create debug

# Switch to debug profile
claude-flow-novice config profile switch debug

# Debug-specific settings
claude-flow-novice config set debug.enabled true
claude-flow-novice config set logging.level trace
claude-flow-novice config set performance.monitoring true
```

## Best Practices for Debugging

### 1. Start with Minimal Reproduction
```bash
# Create minimal test case
claude-flow-novice sparc run "simple task" --minimal

# Isolate the issue
claude-flow-novice test-component --component agent
```

### 2. Use Incremental Debugging
```bash
# Start with basic debugging
DEBUG=claude-flow:* claude-flow-novice sparc run "task"

# Add more categories as needed
DEBUG=claude-flow:*,agent:* claude-flow-novice sparc run "task"
```

### 3. Save Debug Sessions
```bash
# Save debug output with timestamp
DEBUG=* claude-flow-novice sparc run "task" 2> debug-$(date +%Y%m%d-%H%M%S).log

# Compress old debug logs
find debug-logs/ -name "*.log" -mtime +7 -exec gzip {} \;
```

### 4. Use Correlation IDs
```bash
# Generate correlation ID
CORRELATION_ID=$(uuidgen)
DEBUG=* CORRELATION_ID=$CORRELATION_ID claude-flow-novice sparc run "task"

# Track across logs
grep $CORRELATION_ID debug.log
```

---

**Next Steps:**
- [Log Analysis Guide](./log-analysis.md)
- [Performance Troubleshooting](./performance-troubleshooting.md)
- [Error Analysis Guide](./error-analysis.md)