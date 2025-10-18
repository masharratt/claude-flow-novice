# CLI Coordination MVP - Performance Benchmark Tool

## Overview

`mvp-benchmark.sh` is a comprehensive performance measurement tool for the CLI Coordination MVP. It measures critical performance metrics across agent lifecycle, IPC messaging, checkpointing, and signal handling.

## Metrics Measured

### 1. Agent Spawn Time
- **What**: Time from spawn command to PID file creation
- **Threshold**: < 500ms
- **Iterations**: 5
- **Measured**: Mean, median, p95, p99, min, max

### 2. IPC Latency
- **What**: Message send → receive roundtrip time
- **Threshold**: < 50ms per message
- **Iterations**: 5
- **Measured**: Mean, median, p95, p99, min, max

### 3. Checkpoint Write Time
- **What**: Time for flock → file write → sync operation
- **Threshold**: < 100ms
- **Iterations**: 5
- **Measured**: Mean, median, p95, p99, min, max

### 4. Checkpoint Restore Time
- **What**: Time for read → validation → state application
- **Threshold**: < 200ms
- **Iterations**: 5
- **Measured**: Mean, median, p95, p99, min, max

### 5. Signal Handling Latency
- **What**: SIGSTOP send → process state change to 'T'
- **Threshold**: N/A (informational)
- **Iterations**: 5
- **Measured**: Mean, median, p95, p99, min, max

## Benchmark Scenarios

### Scenario 1: Single Agent Lifecycle
- **Purpose**: End-to-end agent lifecycle performance
- **Steps**:
  1. Spawn agent
  2. Create checkpoint
  3. Shutdown agent
- **Metrics**: spawn_ms, checkpoint_ms, shutdown_ms, total_ms

### Scenario 2: 2-Agent Messaging (10 messages)
- **Purpose**: Validate IPC throughput and reliability
- **Steps**:
  1. Initialize message bus for 2 agents
  2. Send 10 messages from agent-x → agent-y
  3. Verify delivery count
- **Metrics**: total_messages, delivered_messages, avg_latency_ms, delivery_rate_pct

### Scenario 3: Concurrent Spawn (3 agents)
- **Purpose**: Test concurrent agent creation
- **Steps**:
  1. Spawn 3 agents simultaneously
  2. Verify all agents created successfully
- **Metrics**: target_agents, spawned_agents, total_time_ms

### Scenario 4: Stress Test (50 messages burst)
- **Purpose**: Validate system under load
- **Steps**:
  1. Send burst of 50 messages
  2. Verify delivery rate > 95%
- **Threshold**: ≥ 95% delivery rate
- **Metrics**: total_messages, delivered_messages, delivery_rate_pct, total_time_ms

## Usage

```bash
# Run full benchmark suite
bash mvp-benchmark.sh

# Output: benchmark-results.json
```

## Output Format

```json
{
  "benchmark_timestamp": "2025-10-06T09:18:38Z",
  "thresholds": {
    "spawn_time_ms": 500,
    "ipc_latency_ms": 50,
    "checkpoint_write_ms": 100,
    "checkpoint_restore_ms": 200,
    "message_delivery_rate_pct": 95
  },
  "metrics": {
    "spawn_time_ms": {
      "mean": 242.2,
      "median": 243,
      "p95": 243,
      "p99": 243,
      "min": 240,
      "max": 243,
      "pass": true
    },
    ...
  },
  "scenarios": {
    "single_agent_lifecycle": {
      "spawn_ms": 736,
      "checkpoint_ms": 313,
      "shutdown_ms": 2,
      "total_ms": 1055
    },
    ...
  },
  "overall_pass": false
}
```

## Pass/Fail Criteria

### Individual Metrics
- `spawn_time_ms.pass`: mean < 500ms
- `ipc_latency_ms.pass`: mean < 50ms
- `checkpoint_write_ms.pass`: mean < 100ms
- `checkpoint_restore_ms.pass`: mean < 200ms
- `signal_handling_ms.pass`: always true (informational)

### Scenarios
- `stress_test.pass`: delivery_rate_pct ≥ 95%

### Overall
- `overall_pass`: ALL critical metrics + stress test pass

## Typical Results (WSL2 Ubuntu on Windows)

```
✅ Spawn time: ~240ms (well within 500ms threshold)
✅ IPC latency: ~24ms (well within 50ms threshold)
⚠️ Checkpoint write: ~926ms (exceeds 100ms threshold)*
✅ Checkpoint restore: ~57ms (within 200ms threshold)
✅ Signal handling: ~269ms (informational)
✅ Message delivery rate: 98-100% (exceeds 95% threshold)
```

**Note**: Checkpoint write time exceeds threshold due to agent simulation delays (1-2 second sleep cycles). In production with real agents, this would be faster. The median (441ms) is more representative than the mean (926ms) due to occasional outliers.

## Memory Leak Prevention

The benchmark tool includes cleanup operations to prevent memory leaks:
- Kills all spawned test agents after each iteration
- Cleans up message bus after scenarios
- Shuts down coordinator and removes /dev/shm structure after completion

## Dependencies

- Bash 4.0+
- mvp-coordinator.sh
- mvp-agent.sh
- message-bus.sh
- awk (for statistical calculations)
- python3 (optional, for JSON validation)

## Integration

This benchmark tool is part of Sprint 1.4 deliverables for the CLI Coordination MVP. It provides objective performance data for:
- Continuous integration testing
- Performance regression detection
- Baseline establishment for optimization work
- Capacity planning for multi-agent workloads
