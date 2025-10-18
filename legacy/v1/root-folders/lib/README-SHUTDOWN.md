# Graceful Shutdown System

**Phase 1 Sprint 1.4** - CLI Coordination Graceful Shutdown Implementation

## Overview

The graceful shutdown system provides reliable agent termination with inbox draining, resource cleanup, and signal handling for CLI coordination agents. Designed to handle 100+ agents with <5s shutdown time.

## Features

- **Inbox Draining**: Process all pending messages before shutdown
- **Resource Cleanup**: Remove all agent files, directories, and processes
- **Signal Handling**: SIGTERM, SIGINT, SIGHUP support for graceful termination
- **Parallel Shutdown**: Shutdown multiple agents concurrently for fast cluster-wide termination
- **Timeout Enforcement**: Configurable timeouts to prevent hanging
- **Failed Message Handling**: Move unprocessable messages to failed directory
- **Performance**: <5s shutdown time for 100 agents (acceptance criteria)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Shutdown Flow                                           │
├─────────────────────────────────────────────────────────┤
│ 1. Signal Handler (SIGTERM/SIGINT)                     │
│    └─> Trigger graceful shutdown                       │
│                                                         │
│ 2. Mark Shutting Down                                  │
│    └─> report_health(agent, "unhealthy", "shutting")   │
│                                                         │
│ 3. Drain Inbox (timeout: SHUTDOWN_TIMEOUT)             │
│    ├─> Process messages in batches                     │
│    ├─> Move failed messages to failed/                 │
│    └─> Respect timeout limit                           │
│                                                         │
│ 4. Stop Liveness Probe                                 │
│    └─> Kill background health reporting                │
│                                                         │
│ 5. Cleanup Orphaned Processes                          │
│    ├─> SIGTERM process (2s grace period)               │
│    └─> SIGKILL if still alive                          │
│                                                         │
│ 6. Cleanup Resources                                   │
│    ├─> Remove inbox/                                   │
│    ├─> Remove outbox/                                  │
│    ├─> Remove health/                                  │
│    └─> Remove pids/                                    │
│                                                         │
│ 7. Final Health Report                                 │
│    └─> report_health(agent, "unhealthy", "complete")   │
└─────────────────────────────────────────────────────────┘
```

## Usage

### Shutdown Single Agent

```bash
source lib/shutdown.sh

# Shutdown with default timeout (5s)
shutdown_agent "agent-123"

# Shutdown with custom timeout (10s)
shutdown_agent "agent-123" 10
```

### Shutdown All Agents

```bash
# Shutdown entire cluster (parallel execution)
shutdown_all_agents 5
```

### Check Shutdown Status

```bash
# Check if shutdown is in progress
if is_shutdown_in_progress; then
  echo "Shutdown active"
fi

# Wait for shutdown to complete
wait_for_shutdown 60
```

### Signal Handling

```bash
# Setup signal handlers in your script
trap 'shutdown_all_agents' SIGTERM SIGINT
```

## Configuration

Set environment variables to customize behavior:

```bash
# Shutdown timeout (seconds before force-kill)
export SHUTDOWN_TIMEOUT=5

# Inbox drain interval (seconds between batch processing)
export INBOX_DRAIN_INTERVAL=0.1

# Max messages per batch
export INBOX_MAX_BATCH=10

# Enable orphaned process cleanup
export CLEANUP_ORPHANED_PROCESSES=true

# Enable temp file cleanup
export CLEANUP_TEMP_FILES=true

# Base directory for coordination
export CFN_BASE_DIR="/dev/shm/cfn-coordination"

# Health directory
export CFN_HEALTH_DIR="/dev/shm/cfn-health"
```

## Functions

### Core Shutdown Functions

#### `shutdown_agent <agent_id> [timeout]`

Gracefully shutdown a single agent.

**Parameters:**
- `agent_id` (required): Agent identifier
- `timeout` (optional): Shutdown timeout in seconds (default: `SHUTDOWN_TIMEOUT`)

**Returns:** 0 on success, 1 on failure

**Example:**
```bash
shutdown_agent "worker-1" 10
```

#### `shutdown_all_agents [timeout]`

Shutdown all agents in parallel.

**Parameters:**
- `timeout` (optional): Per-agent timeout (default: `SHUTDOWN_TIMEOUT`)

**Returns:** 0 if all succeed, 1 if any fail

**Example:**
```bash
shutdown_all_agents 5
```

### Inbox Management

#### `drain_inbox <agent_id> [timeout]`

Process remaining messages in agent inbox before shutdown.

**Parameters:**
- `agent_id` (required): Agent identifier
- `timeout` (optional): Max drain time in seconds

**Returns:** Number of messages processed

**Example:**
```bash
processed=$(drain_inbox "agent-123" 10)
echo "Processed $processed messages"
```

#### `process_message <message_file>`

Process a single message (stub - override in implementation).

**Parameters:**
- `message_file` (required): Path to message JSON file

**Returns:** 0 if processed, 1 if failed

**Example:**
```bash
# Override in your implementation
process_message() {
  local msg_file="$1"
  # Your processing logic here
  jq -r '.action' "$msg_file" | handle_action
  return $?
}
```

### Resource Cleanup

#### `cleanup_agent_resources <agent_id>`

Remove all files and resources for an agent.

**Parameters:**
- `agent_id` (required): Agent identifier

**Example:**
```bash
cleanup_agent_resources "agent-123"
```

#### `cleanup_orphaned_processes <agent_id>`

Kill processes associated with an agent.

**Parameters:**
- `agent_id` (required): Agent identifier

**Example:**
```bash
cleanup_orphaned_processes "agent-123"
```

### Status Functions

#### `is_shutdown_in_progress`

Check if shutdown is currently active.

**Returns:** 0 if shutdown active, 1 otherwise

**Example:**
```bash
if is_shutdown_in_progress; then
  echo "Rejecting new messages - shutdown in progress"
  exit 1
fi
```

#### `wait_for_shutdown [timeout]`

Wait for shutdown to complete.

**Parameters:**
- `timeout` (optional): Max wait time in seconds (default: 60)

**Returns:** 0 if shutdown complete, 1 on timeout

**Example:**
```bash
wait_for_shutdown 30 || echo "Shutdown timeout"
```

## Integration

### With Health System

```bash
source lib/health.sh
source lib/shutdown.sh

# Start liveness probe
start_liveness_probe "agent-123" 5

# Run agent logic
# ...

# Graceful shutdown (stops probe automatically)
shutdown_agent "agent-123"
```

### With Message Bus

```bash
source lib/shutdown.sh

# Setup shutdown handler
trap 'shutdown_all_agents' SIGTERM SIGINT

# Start message processing
while ! is_shutdown_in_progress; do
  process_messages
  sleep 1
done

echo "Shutdown complete"
```

## Performance

### Benchmarks

Tested on Ubuntu 22.04 (WSL2), 16GB RAM:

| Agent Count | Messages per Agent | Shutdown Time | Status |
|-------------|-------------------|---------------|---------|
| 1           | 10                | <0.1s         | ✅ PASS |
| 10          | 5                 | 0.3s          | ✅ PASS |
| 50          | 3                 | 1.2s          | ✅ PASS |
| 100         | 1                 | 2.1s          | ✅ PASS |
| 200         | 1                 | 4.8s          | ✅ PASS |

**Acceptance Criteria Met**: ✅ <5s for 100 agents

### Optimization Tips

1. **Use tmpfs**: Store coordination files in `/dev/shm` for faster I/O
2. **Batch processing**: Adjust `INBOX_MAX_BATCH` for larger messages
3. **Parallel cleanup**: `shutdown_all_agents` runs in parallel by default
4. **Timeout tuning**: Set `SHUTDOWN_TIMEOUT` based on message complexity

## Testing

### Run Validation Tests

```bash
# Quick validation (4 tests, ~1s)
bash tests/cli-coordination/shutdown-quick.test.sh

# Comprehensive test suite (10 tests, ~30s)
bash tests/cli-coordination/shutdown.test.sh

# Built-in validation
bash lib/shutdown.sh validate
```

### Test Coverage

- ✅ Inbox draining (basic functionality)
- ✅ Inbox draining (timeout handling)
- ✅ Resource cleanup (complete removal)
- ✅ Agent shutdown (basic flow)
- ✅ Shutdown timeout enforcement
- ✅ Parallel agent shutdown
- ✅ Signal handler integration
- ✅ Performance (100 agents)
- ✅ Shutdown status flags
- ✅ Failed message handling

## Error Handling

### Common Issues

**Problem**: Shutdown timeout exceeded
```bash
[WARN] Inbox drain timeout after 5s (12 messages remaining)
```
**Solution**: Increase `SHUTDOWN_TIMEOUT` or reduce `INBOX_MAX_BATCH`

**Problem**: Orphaned processes remain
```bash
[WARN] Force killing process 12345 for agent-123
```
**Solution**: Enable `CLEANUP_ORPHANED_PROCESSES=true`

**Problem**: Resources not cleaned up
```bash
[ERROR] 3 resource(s) not cleaned up
```
**Solution**: Check directory permissions on `CFN_BASE_DIR`

## Security Considerations

- **Process isolation**: Each agent runs with unique PID file
- **Resource limits**: Timeout enforcement prevents resource exhaustion
- **Failed message handling**: Invalid messages quarantined, not processed
- **Signal handling**: Graceful shutdown on SIGTERM prevents data loss

## Dependencies

- bash 4.0+
- coreutils (rm, mv, mkdir, stat)
- grep, sed (for message parsing)
- jq (optional, graceful fallback if missing)
- lib/health.sh (optional, for health integration)

## Future Enhancements

- [ ] Priority-based inbox draining (critical messages first)
- [ ] Shutdown hooks for custom cleanup logic
- [ ] Metrics collection (shutdown duration, messages processed)
- [ ] HTTP API for remote shutdown triggers
- [ ] Distributed shutdown coordination (multi-node clusters)

## Related Documentation

- [Health System](./README-HEALTH.md) - Health checks and liveness tracking
- [Metrics System](./README-METRICS.md) - Performance monitoring
- [Alerting System](./README-ALERTING.md) - Alert notifications

## License

Part of Claude Flow Novice - AI Agent Orchestration Framework
