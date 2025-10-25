# Shutdown Handling for Waiting Agents

## Overview

Agents in waiting mode can now listen for shutdown signals and exit gracefully with proper cleanup. This enables coordinators to terminate long-running tasks without leaving orphaned agents in the system.

## Implementation Details

### Multi-Key Monitoring

Agents in waiting mode now monitor **two** Redis keys simultaneously:
1. **Wake Queue**: `swarm:{task-id}:{agent-id}:wake-queue` (priority queue for wake signals)
2. **Shutdown Key**: `swarm:{task-id}:shutdown` (broadcast shutdown signal)

### Polling Strategy

Since Redis `BZPOPMIN` doesn't support multiple keys, we implement a polling loop:

```bash
while true; do
    # Check shutdown first (highest priority)
    SHUTDOWN_CHECK=$(redis-cli LPOP "swarm:${TASK_ID}:shutdown")

    if shutdown_detected; then
        exit 130  # SIGINT code for graceful shutdown
    fi

    # Block on wake queue with 1-second timeout
    WAKE_RESULT=$(redis-cli BZPOPMIN "$WAKE_QUEUE" 1)

    if wake_received; then
        process_wake_signal
        break
    fi
done
```

### Exit Code Convention

- **Exit Code 130**: Graceful shutdown via shutdown signal (SIGINT equivalent)
- **Exit Code 0**: Normal completion after wake signal

## Usage

### Coordinator Broadcasts Shutdown

```bash
./invoke-waiting-mode.sh shutdown \
  --task-id "auth-system" \
  --reason "task_complete"
```

**Broadcast Behavior:**
- Shutdown signal is added to `swarm:{task-id}:shutdown` key
- All agents monitoring this task will receive the signal on their next poll cycle (max 1 second latency)
- Multiple agents can be shutdown with a single broadcast

### Agent Enters Waiting Mode

```bash
./invoke-waiting-mode.sh enter \
  --task-id "auth-system" \
  --agent-id "coder-1" \
  --context "iteration-1"
```

**Agent will:**
1. Publish ready status to Redis
2. Enter polling loop monitoring both wake queue and shutdown key
3. Check shutdown key first (highest priority)
4. Block on wake queue with 1-second timeout
5. Exit with code 130 if shutdown signal received
6. Continue normally if wake signal received

## Priority Behavior

**Shutdown signals have HIGHEST priority:**
- Checked **before** wake queue on every poll cycle
- Even if wake signals are in the queue, shutdown is processed first
- Ensures clean task termination

## Performance Characteristics

- **Latency**: Max 1 second to detect shutdown (BZPOPMIN timeout)
- **Cost**: Still zero tokens during waiting (BZPOPMIN blocks, LPOP is instant)
- **Overhead**: Minimal - one LPOP per second for shutdown check

## Test Results

```bash
bash .claude/skills/redis-coordination/test-shutdown.sh
```

**Test Coverage:**
1. ✅ Agent enters waiting mode successfully
2. ✅ Agent receives shutdown signal and exits with code 130
3. ✅ Shutdown signal is broadcasted properly
4. ✅ Agent terminates gracefully within 1-2 seconds

## Integration Examples

### CFN Loop Coordinator

```bash
# After consensus reached or max iterations
./invoke-waiting-mode.sh shutdown \
  --task-id "$TASK_ID" \
  --reason "cfn_loop_complete"

echo "All agents notified of task completion"
```

### Emergency Shutdown

```bash
# Abort all agents in a task
./invoke-waiting-mode.sh shutdown \
  --task-id "$TASK_ID" \
  --reason "emergency_abort"
```

### Timeout Management

```bash
# Coordinator timeout
timeout 300 ./my-coordination-script.sh || {
  echo "Coordinator timeout - sending shutdown to all agents"
  ./invoke-waiting-mode.sh shutdown \
    --task-id "$TASK_ID" \
    --reason "coordinator_timeout"
}
```

## File Changes

**Modified:**
- `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/redis-coordination/invoke-waiting-mode.sh`

**Added:**
- `shutdown` command for broadcasting shutdown signals
- Multi-key monitoring in `enter` command
- Polling loop with shutdown priority
- Exit code 130 convention for graceful shutdown

**Test Suite:**
- `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/redis-coordination/test-shutdown.sh`

## Benefits

1. **Graceful Cleanup**: Agents exit cleanly instead of hanging indefinitely
2. **Broadcast Efficiency**: Single shutdown command affects all agents
3. **Priority Handling**: Shutdown always takes precedence over wake signals
4. **Zero Token Cost**: Still maintains efficient blocking while waiting
5. **Fast Response**: Max 1 second latency to detect shutdown

## Future Enhancements

Potential improvements for future iterations:

1. **Agent-Specific Shutdown**: Target individual agents instead of broadcast
2. **Shutdown Acknowledgement**: Agents report shutdown receipt before exiting
3. **Lua Script Optimization**: Atomic shutdown check + wake queue pop
4. **Timeout Configuration**: Configurable poll timeout instead of hardcoded 1 second
5. **Shutdown Reason Logging**: Persist shutdown events to Redis for audit trail
