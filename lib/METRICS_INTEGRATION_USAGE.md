# Metrics + Message-Bus Integration Usage Guide

## Overview

The metrics.sh library now integrates with message-bus.sh to provide **event-driven metrics emission** for real-time coordination monitoring.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Metrics Emission (lib/metrics.sh)                           │
│                                                              │
│  emit_metric()                                              │
│    ├─> JSONL file (/dev/shm/cfn-metrics.jsonl)             │
│    └─> Thread-safe with flock                               │
│                                                              │
│  emit_coordination_metric() [NEW]                           │
│    ├─> JSONL file (same as above)                          │
│    └─> Message-bus event (metrics-collector inbox)          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Message-Bus Coordination (tests/cli-coordination/...)       │
│                                                              │
│  send_message()                                             │
│    └─> Auto-emits: coordination.message_sent                │
│                     coordination.latency                     │
│                                                              │
│  receive_messages()                                         │
│    └─> Auto-emits: coordination.message_received            │
│                                                              │
│  Inbox overflow (FIFO eviction)                             │
│    └─> Auto-emits: coordination.inbox_overflow              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## New Function: emit_coordination_metric()

**Dual-channel emission** - writes to both JSONL file AND message-bus.

### Usage

```bash
source /path/to/lib/metrics.sh

# Emit coordination metric with dual-channel emission
emit_coordination_metric "coordination.latency" "45" "ms" '{"phase":"consensus"}' "agent-1"

# Parameters:
# 1. metric_name   - Metric identifier
# 2. value         - Numeric value
# 3. unit          - Measurement unit (default: "count")
# 4. tags          - JSON object with metadata (default: {})
# 5. agent_id      - Source agent ID (default: "coordinator")
```

### Behavior

- **JSONL file**: Always writes to `$METRICS_FILE` (thread-safe with flock)
- **Message-bus**: If `MESSAGE_BASE_DIR` is set and `send_message` is available, sends metric event to `metrics-collector` inbox
- **Non-blocking**: Message-bus emission is best-effort (errors suppressed)

## Automatic Metrics from Message-Bus Operations

### send_message()

Automatically emits:

```json
{
  "metric": "coordination.message_sent",
  "value": 1,
  "unit": "count",
  "tags": {
    "from": "agent-1",
    "to": "agent-2",
    "type": "task.request",
    "sequence": 5
  }
}
```

```json
{
  "metric": "coordination.latency",
  "value": 12,
  "unit": "milliseconds",
  "tags": {
    "operation": "send_message",
    "from": "agent-1",
    "to": "agent-2"
  }
}
```

### receive_messages()

Automatically emits:

```json
{
  "metric": "coordination.message_received",
  "value": 3,
  "unit": "count",
  "tags": {
    "agent": "agent-2",
    "inbox_size": 3
  }
}
```

### Inbox Overflow

When inbox exceeds 100 messages (FIFO eviction):

```json
{
  "metric": "coordination.inbox_overflow",
  "value": 1,
  "unit": "count",
  "tags": {
    "agent": "agent-2",
    "inbox_size": 100,
    "evicted": "msg-1696594335-042"
  }
}
```

## Integration Example

```bash
#!/bin/bash
set -euo pipefail

# Source libraries
source /path/to/lib/metrics.sh
source /path/to/tests/cli-coordination/message-bus.sh

# Configure paths
export METRICS_FILE="/dev/shm/my-metrics.jsonl"
export MESSAGE_BASE_DIR="/dev/shm/my-agents"

# Initialize agents
init_message_bus "agent-1"
init_message_bus "agent-2"
init_message_bus "metrics-collector"

# Send message (auto-emits coordination.message_sent + latency)
send_message "agent-1" "agent-2" "task.request" '{"action":"process"}'

# Receive messages (auto-emits coordination.message_received)
messages=$(receive_messages "agent-2")

# Custom coordination metric (dual-channel emission)
emit_coordination_metric "task.processing_time" "250" "ms" '{"task":"process"}' "agent-2"

# View collected metrics
cat "$METRICS_FILE"
```

## Thread-Safety

All metrics operations are thread-safe:

- **flock-based locking**: Atomic writes to JSONL file
- **5-second timeout**: Prevents deadlocks
- **Concurrent safe**: Multiple agents can emit metrics simultaneously

## Performance

- **emit_metric()**: <5ms (JSONL write only)
- **emit_coordination_metric()**: <10ms (JSONL + message-bus)
- **send_message()**: +2ms overhead for metrics emission
- **Memory**: Minimal (single line per metric)

## Testing

Run integration tests:

```bash
# Quick test (5 tests, <2 seconds)
bash tests/integration/quick-metrics-bus-test.sh

# Full test suite (comprehensive, may be slower on WSL)
bash tests/integration/metrics-message-bus.test.sh
```

## Metrics Storage

### JSONL Format

```json
{"timestamp":"2025-10-07T03:13:45.123Z","metric":"coordination.latency","value":12,"unit":"milliseconds","tags":{"operation":"send_message","from":"agent-1","to":"agent-2"}}
```

### Message-Bus Format

Sent to `metrics-collector` inbox as type `metric.emitted`:

```json
{
  "version": "1.0",
  "msg_id": "msg-1696594400-123",
  "from": "agent-1",
  "to": "metrics-collector",
  "timestamp": 1696594400,
  "sequence": 1,
  "type": "metric.emitted",
  "payload": {
    "metric": "coordination.latency",
    "value": 12,
    "unit": "milliseconds",
    "tags": {"operation":"send_message"},
    "source": "metrics-system"
  },
  "requires_ack": false
}
```

## Use Cases

1. **Real-time monitoring**: Message-bus events enable live metric dashboards
2. **Coordination debugging**: Track message flow and latency between agents
3. **Performance analysis**: Identify bottlenecks in agent communication
4. **Alerting**: Trigger alerts on inbox overflow or high latency
5. **Metrics aggregation**: Collect metrics from distributed agents

## Configuration

```bash
# Metrics file location (default: /dev/shm/cfn-metrics.jsonl)
export METRICS_FILE="/custom/path/metrics.jsonl"

# Message-bus directory (default: /dev/shm/cfn-mvp/messages)
export MESSAGE_BASE_DIR="/custom/path/messages"

# Metrics library path (for message-bus integration)
export METRICS_LIB="/path/to/lib/metrics.sh"
```

## See Also

- `lib/metrics.sh` - Core metrics emission library
- `tests/cli-coordination/message-bus.sh` - Agent messaging infrastructure
- `tests/integration/quick-metrics-bus-test.sh` - Integration test examples
