# File-Based 50-Agent Stability Test

A comprehensive 8-hour stability test system using **file-based coordination** via `/dev/shm` for agent communication. This alternative approach complements the existing IPC-based stability test with a different communication paradigm.

## Overview

This test system implements a **file-based coordination pattern** where agents communicate through files in a shared memory filesystem (`/dev/shm`). This approach:

- **Eliminates IPC complexity** - No need for complex inter-process communication
- **Provides persistent logging** - All coordination messages are logged as files
- **Enables post-analysis** - Full coordination history available for analysis
- **Tests file system performance** - Validates system behavior under file I/O load

## Architecture

### File-Based Communication Pattern

```
/dev/shm/agent-coordination/
├── messages/     # Coordinator → Agent messages
│   ├── coordination-1.json
│   ├── coordination-2.json
│   └── ...
├── responses/    # Agent → Coordinator responses
│   ├── response-1-coord-1.json
│   ├── response-2-coord-1.json
│   └── ...
└── status/       # Agent health status
    ├── agent-1-status.json
    ├── agent-2-status.json
    └── ...
```

### Key Components

1. **Agent Worker** (`agent-worker.js`)
   - Monitors message directory for coordination requests
   - Processes messages (ping, compute, memory_test)
   - Writes response files with processing results
   - Tracks memory usage and detects leaks
   - Updates status files with health information

2. **Orchestrator** (`50-agent-test.js`)
   - Spawns 50 agent processes
   - Writes coordination messages to message directory
   - Collects responses from response directory
   - Monitors agent health via status files
   - Generates comprehensive metrics and reports

## Quick Start

### Basic Usage

```bash
# Run the full 8-hour stability test
node scripts/test/50-agent-test.js

# Quick test - 1 hour with 20 agents
node scripts/test/50-agent-test.js --agents 20 --duration 60 --interval 60

# Development test - 10 minutes with 5 agents
node scripts/test/50-agent-test.js --agents 5 --duration 10 --interval 30
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--agents` | Number of agents to spawn | 50 |
| `--duration` | Test duration in minutes | 480 (8 hours) |
| `--interval` | Coordination interval in seconds | 300 (5 minutes) |
| `--coord-dir` | Coordination directory | `/dev/shm/agent-coordination` |
| `--output-dir` | Results output directory | `./scripts/test/stability-results` |

### Example Commands

```bash
# Full production test
node scripts/test/50-agent-test.js

# Quick validation (5 agents, 10 minutes)
node scripts/test/50-agent-test.js --agents 5 --duration 10 --interval 60

# High-frequency test (1-minute intervals)
node scripts/test/50-agent-test.js --interval 60 --duration 60

# Custom coordination directory (for testing)
node scripts/test/50-agent-test.js --coord-dir /tmp/agent-coord --output-dir /tmp/results
```

## Test Scenarios

### Message Types

The test cycles through three message types:

1. **Ping Messages** - Basic connectivity test
   ```json
   {
     "messageId": "coord-1-1234567890",
     "type": "ping",
     "timestamp": 1234567890,
     "cycle": 1
   }
   ```

2. **Compute Messages** - CPU load simulation
   ```json
   {
     "messageId": "coord-2-1234567891",
     "type": "compute",
     "timestamp": 1234567891,
     "cycle": 2,
     "data": { "iterations": 1500 }
   }
   ```

3. **Memory Test Messages** - Memory allocation test
   ```json
   {
     "messageId": "coord-3-1234567892",
     "type": "memory_test",
     "timestamp": 1234567892,
     "cycle": 3,
     "data": { "size": 1500 }
   }
   ```

### Agent Response Format

Each agent responds with comprehensive metrics:

```json
{
  "agentId": 1,
  "messageId": "coord-1-1234567890",
  "timestamp": 1234567891,
  "processingTime": 125,
  "coordinationCount": 15,
  "errorCount": 0,
  "uptime": 3600000,
  "memory": {
    "rss": 52428800,
    "heapUsed": 31457280,
    "heapTotal": 52428800,
    "external": 1048576,
    "arrayBuffers": 2097152
  },
  "memoryGrowthRate": 1024,
  "response": { "pong": true, "timestamp": 1234567891 }
}
```

## Monitoring and Metrics

### Real-time Monitoring

During test execution:

```bash
# Monitor agent status
ls -la /dev/shm/agent-coordination/status/

# Watch coordination messages
watch -n 1 'ls -la /dev/shm/agent-coordination/messages/'

# Track responses
watch -n 1 'ls -la /dev/shm/agent-coordination/responses/ | wc -l'
```

### Log Files

The test generates several output files:

#### `stability-metrics.jsonl`
Real-time metrics in JSONL format:
```json
{"timestamp":"2025-10-07T20:00:00.000Z","type":"coordination_cycle","cycle":1,"duration":15234,"messagesSent":50,"responsesReceived":48,"responseRate":0.96,"averageResponseTime":125,"memoryStats":{"average":52428800,"growthRate":1024},"crashedAgents":2}
```

#### `stability-test.log`
Human-readable test log:
```
[2025-10-07T20:00:00.000Z] [INFO] Starting 50-agent stability test for 8 hours
[2025-10-07T20:00:05.000Z] [INFO] Spawned 50 agents
[2025-10-07T20:00:10.000Z] [INFO] Starting coordination cycle 1/96
[2025-10-07T20:00:25.234Z] [INFO] Coordination cycle 1 completed in 15234ms with 48 responses
```

#### `stability-test-report.json`
Comprehensive final report with acceptance criteria validation.

## Acceptance Criteria

The test validates four key criteria:

### 1. Memory Growth (<10%)
- **Measurement**: Average memory usage across all agents
- **Calculation**: `(final_memory - initial_memory) / initial_memory`
- **Pass Threshold**: < 10% growth over 8 hours

### 2. Coordination Time Variance (<20%)
- **Measurement**: Coordination cycle duration variance
- **Calculation**: Standard deviation / mean of cycle durations
- **Pass Threshold**: < 20% coefficient of variation

### 3. Critical Crashes (Zero tolerance)
- **Measurement**: Agent crashes during test
- **Behavior**: Test continues despite crashes
- **Pass Threshold**: Test continues running (crashes tracked but don't stop test)

### 4. Complete Metrics (100%)
- **Measurement**: Metrics logging completeness
- **Pass Threshold**: All coordination cycles logged successfully

## Troubleshooting

### Common Issues

#### `/dev/shm` Permission Denied
```bash
# Check permissions
ls -la /dev/shm

# Create coordination directory manually
sudo mkdir -p /dev/shm/agent-coordination
sudo chmod 777 /dev/shm/agent-coordination

# Or use alternative directory
node scripts/test/50-agent-test.js --coord-dir /tmp/agent-coordination
```

#### Disk Space Issues
```bash
# Check available space
df -h /dev/shm

# Clean up old test files
rm -rf /dev/shm/agent-coordination/*

# Monitor during test
watch -n 30 'df -h /dev/shm && du -sh /dev/shm/agent-coordination'
```

#### Agent Process Failures
```bash
# Check agent processes
ps aux | grep agent-worker

# Monitor system resources
htop
free -h

# Check individual agent status
cat /dev/shm/agent-coordination/status/agent-1-status.json
```

#### Slow Response Times
```bash
# Check disk I/O performance
iostat -x 1

# Monitor file operations
inotifywatch -v /dev/shm/agent-coordination/

# Reduce coordination interval for testing
node scripts/test/50-agent-test.js --interval 30
```

### Debug Mode

Enable detailed logging:
```bash
DEBUG=stability-test node scripts/test/50-agent-test.js --agents 5 --duration 5
```

## Integration with Existing Tools

### Compatibility with stability-monitor.js
```bash
# Feed metrics to existing monitor
tail -f scripts/test/stability-results/stability-metrics.jsonl | \
  node scripts/monitoring/stability-monitor.js --input - --output integrated-results.json
```

### Comparison with IPC-based Test
This file-based approach complements the existing IPC-based test:

| Aspect | File-Based (New) | IPC-based (Existing) |
|--------|------------------|---------------------|
| Communication | File I/O | Process messaging |
| Overhead | Higher (file system) | Lower (memory) |
| Persistence | Full history | In-memory only |
| Debugging | Easier (file inspection) | Harder (process debugging) |
| Scalability | Limited by file handles | Limited by process limits |

## Performance Expectations

### Typical Resource Usage (50 agents, 8 hours)
- **Memory**: ~300-500MB initial + ~5MB per agent = ~550-750MB total
- **Disk I/O**: ~1-5MB per coordination cycle = ~500MB-2.5GB total
- **File handles**: ~150-300 (messages + responses + status)
- **CPU**: Low during coordination, minimal during wait periods

### System Requirements
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 5GB available in `/dev/shm` or alternative
- **CPU**: 2+ cores recommended
- **File descriptors**: 1000+ limit recommended

## Example Execution

### Quick Development Test
```bash
$ node scripts/test/50-agent-test.js --agents 5 --duration 5 --interval 60

[2025-10-07T20:00:00.000Z] [INFO] Starting 5-agent stability test for 5 minutes
[2025-10-07T20:00:00.001Z] [INFO] Options: {"numAgents":5,"testDuration":300000,"coordinationInterval":60000}
[2025-10-07T20:00:00.002Z] [INFO] Spawning 5 agents...
[2025-10-07T20:00:00.500Z] [INFO] Spawned agent 1 with PID 12345
[2025-10-07T20:00:01.000Z] [INFO] Spawned agent 2 with PID 12346
[2025-10-07T20:00:01.500Z] [INFO] Spawned agent 3 with PID 12347
[2025-10-07T20:00:02.000Z] [INFO] Spawned agent 4 with PID 12348
[2025-10-07T20:00:02.500Z] [INFO] Spawned agent 5 with PID 12349
[2025-10-07T20:00:02.501Z] [INFO] All 5 agents spawned
[2025-10-07T20:00:02.502Z] [INFO] Waiting for agents to initialize...
[2025-10-07T20:00:12.503Z] [INFO] Starting coordination cycle 1/5
[2025-10-07T20:00:12.504Z] [INFO] Starting coordination cycle 1/5
[2025-10-07T20:00:25.234Z] [INFO] Coordination cycle 1 completed in 12730ms with 5 responses
[2025-10-07T20:01:25.235Z] [INFO] Starting coordination cycle 2/5
[2025-10-07T20:01:37.891Z] [INFO] Coordination cycle 2 completed in 12656ms with 5 responses
...
[2025-10-07T20:05:12.500Z] [INFO] Stability test completed
[2025-10-07T20:05:12.600Z] [INFO] Final report generated: scripts/test/stability-results/stability-test-report.json
[2025-10-07T20:05:12.601Z] [INFO] Test completed: PASSED
```

### Full Production Test
```bash
$ node scripts/test/50-agent-test.js

# Runs for 8 hours with full logging
# Check progress:
tail -f scripts/test/stability-results/stability-test.log

# Monitor metrics:
tail -f scripts/test/stability-results/stability-metrics.jsonl | jq .
```

## Advanced Usage

### Custom Coordination Directory
```bash
# Use persistent storage for analysis
node scripts/test/50-agent-test.js \
  --coord-dir /mnt/data/agent-coordination \
  --output-dir /mnt/data/test-results
```

### Integration with Monitoring
```bash
# Real-time monitoring dashboard
watch -n 5 '
  echo "=== Agent Status ==="
  ls /dev/shm/agent-coordination/status/ | wc -l
  echo "=== Recent Responses ==="
  ls -la /dev/shm/agent-coordination/responses/ | tail -5
  echo "=== Memory Usage ==="
  ps aux --sort=-%mem | grep agent-worker | head -5
'
```

### Post-Test Analysis
```bash
# Analyze coordination patterns
jq '.responseRate' scripts/test/stability-results/stability-metrics.jsonl | sort -n

# Memory growth analysis
jq '.memoryStats.average' scripts/test/stability-results/stability-metrics.jsonl | \
  awk 'NR==1{first=$1} END{print "Growth:", ($1-first)/first*100 "%"}'

# Response time analysis
jq '.averageResponseTime' scripts/test/stability-results/stability-metrics.jsonl | \
  awk '{sum+=$1; count++} END{print "Average:", sum/count "ms"}'
```

## Future Enhancements

Potential improvements for production use:

1. **Message Queuing** - Implement proper message queue system
2. **Batch Processing** - Process multiple messages per cycle
3. **Compression** - Compress message files to reduce I/O
4. **Network File Systems** - Support for distributed coordination
5. **Encryption** - Secure message content for sensitive operations
6. **Priority Messaging** - Urgent vs normal message handling
7. **Message Persistence** - Survive system restarts
8. **Dynamic Scaling** - Add/remove agents during test

---

**Note**: This file-based coordination system is designed for testing and validation. For production use, consider more robust messaging systems like Redis, RabbitMQ, or Apache Kafka.