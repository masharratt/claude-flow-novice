# Heartbeat Monitoring for CFN Loop Orchestration

## Overview

The orchestrator includes built-in heartbeat monitoring to detect hung or unresponsive agents during BLPOP waiting periods. This feature provides early warning of agent failures and enables quorum-aware decision making.

## Features

- **Periodic Health Checks**: Monitors agent heartbeats every 30 seconds
- **Missed Beat Tracking**: Tracks consecutive missed heartbeats per agent
- **Quorum-Aware Decisions**: Determines if the loop can continue without hung agents
- **Automatic Recovery**: Resets counters when agents recover
- **Graceful Shutdown**: Monitors stop cleanly when orchestrator shuts down

## Architecture

### Components

1. **Heartbeat Check Function** (`check_agent_heartbeat`)
   - Checks Redis key: `swarm:{task_id}:{agent_id}:heartbeat`
   - Returns 0 if heartbeat exists, 1 if missing

2. **Loop Health Check** (`check_heartbeats_loop`)
   - Checks all agents in a loop
   - Increments missed heartbeat counter
   - Warns after 2 consecutive misses (60 seconds)
   - Evaluates quorum impact

3. **Background Monitor** (`start_heartbeat_monitor`)
   - Runs in background subprocess
   - Checks every 30 seconds
   - Stops via marker file removal
   - Respects SHUTDOWN_REQUESTED flag

4. **Monitor Cleanup** (`stop_heartbeat_monitor`)
   - Removes marker file
   - Terminates background process
   - Called during shutdown

### Heartbeat Data Format

```json
{
  "timestamp": 1760898665,
  "status": "working",
  "iteration": 1,
  "task": "implementing feature X"
}
```

## Usage

### Agent Side (Publishing Heartbeats)

Agents should publish heartbeats every 20-30 seconds:

```bash
# Set heartbeat with 60s TTL
HEARTBEAT=$(jq -n \
  --arg ts "$(date +%s)" \
  --arg status "working" \
  --arg iteration "1" \
  '{timestamp: ($ts | tonumber), status: $status, iteration: ($iteration | tonumber)}')

redis-cli SET "swarm:${TASK_ID}:${AGENT_ID}:heartbeat" "$HEARTBEAT" EX 60
```

### Orchestrator Side (Monitoring)

The orchestrator automatically starts/stops monitors during each loop:

```bash
# Loop 3 monitoring
LOOP3_HEARTBEAT_MONITOR_PID=$(start_heartbeat_monitor "$TASK_ID" "loop3" "${LOOP3_AGENTS[@]}")

# ... wait for agents ...

stop_heartbeat_monitor "$TASK_ID" "loop3" "$LOOP3_HEARTBEAT_MONITOR_PID"
```

## Monitoring Output

### Normal Operation

```
[Loop 3] Starting heartbeat monitor (checking every 30s)...
```

### Agent Appears Hung

```
[2025-10-19T18:30:00Z] [loop3] ⚠️ agent-1 appears hung (no heartbeat for 60s)
[2025-10-19T18:30:00Z] [loop3] ℹ️ Continuing with quorum (2/2 agents)
```

### Quorum at Risk

```
[2025-10-19T18:30:00Z] [loop3] ⚠️ agent-2 appears hung (no heartbeat for 60s)
[2025-10-19T18:30:00Z] [loop3] ⚠️ Cannot meet quorum without agent-2 (1/2)
```

## Configuration

### Monitoring Interval

Default: 30 seconds

To change, edit the `sleep` duration in `start_heartbeat_monitor`:

```bash
sleep 30  # Check every 30s
```

### Missed Heartbeat Threshold

Default: 2 consecutive misses (60 seconds)

To change, edit the threshold in `check_heartbeats_loop`:

```bash
if [ ${MISSED_HEARTBEATS["$AGENT"]} -ge 2 ]; then
```

### Heartbeat TTL

Default: 60 seconds

Agents should set TTL when publishing:

```bash
redis-cli SET "swarm:${TASK_ID}:${AGENT_ID}:heartbeat" "$DATA" EX 60
```

## Integration Points

### Cleanup Handler

Monitors are automatically stopped during shutdown:

```bash
function cleanup_and_exit() {
  # Stop heartbeat monitors if running
  if [ -n "${LOOP3_HEARTBEAT_MONITOR_PID:-}" ]; then
    stop_heartbeat_monitor "$TASK_ID" "loop3" "$LOOP3_HEARTBEAT_MONITOR_PID"
  fi
  if [ -n "${LOOP2_HEARTBEAT_MONITOR_PID:-}" ]; then
    stop_heartbeat_monitor "$TASK_ID" "loop2" "$LOOP2_HEARTBEAT_MONITOR_PID"
  fi
}
```

### Global Variables

```bash
LOOP3_HEARTBEAT_MONITOR_PID=""
LOOP2_HEARTBEAT_MONITOR_PID=""
declare -A MISSED_HEARTBEATS
```

## Testing

### Unit Tests

```bash
./.claude/skills/redis-coordination/tests/test-heartbeat-simple.sh
```

Tests:
1. Active heartbeat detection
2. Missing heartbeat detection
3. Missed heartbeat counter increment
4. Counter reset on recovery

### Manual Testing

```bash
# Set up test heartbeat
redis-cli SET "swarm:test-task:test-agent:heartbeat" '{"timestamp": 1234567890}' EX 60

# Source functions
source ./.claude/skills/redis-coordination/heartbeat-functions.sh

# Check heartbeat
check_agent_heartbeat "test-agent" "test-task"
echo $?  # Should be 0 (success)
```

## Best Practices

### For Agents

1. **Publish regularly**: Every 20-30 seconds
2. **Use appropriate TTL**: 60 seconds (2x publish interval)
3. **Include metadata**: Status, iteration, current task
4. **Handle errors**: Continue if Redis unavailable

### For Orchestrators

1. **Start monitors early**: Before waiting for agents
2. **Stop monitors promptly**: After agents complete
3. **Check quorum impact**: Before making decisions
4. **Log appropriately**: Warn for hung agents, not for normal timeouts

## Troubleshooting

### Monitor Not Detecting Hung Agents

**Symptoms**: Agents appear hung but no warnings

**Causes**:
1. Monitor not started
2. Heartbeat check interval too long
3. Missed heartbeat threshold too high

**Solutions**:
- Verify monitor PID is set
- Check monitor marker file exists
- Review threshold values

### False Positives

**Symptoms**: Warnings for healthy agents

**Causes**:
1. Heartbeat publish interval too long
2. Heartbeat TTL too short
3. Network latency issues

**Solutions**:
- Reduce heartbeat interval (e.g., 15s)
- Increase TTL (e.g., 90s)
- Increase missed heartbeat threshold

### Monitor Not Stopping

**Symptoms**: Background processes remain after completion

**Causes**:
1. Marker file not removed
2. Process not killed
3. Cleanup not called

**Solutions**:
- Check for marker files: `ls /tmp/heartbeat-monitor-*.active`
- Kill processes: `pkill -f heartbeat-monitor`
- Verify cleanup handler is registered

## Performance Impact

- **CPU**: Negligible (~0.01% per monitor)
- **Network**: ~1 Redis GET per agent per 30s
- **Memory**: ~1KB per agent for tracking state

## Future Enhancements

1. **Adaptive Intervals**: Reduce check frequency for stable agents
2. **Health Scores**: Track reliability over time
3. **Auto-Retry**: Wake hung agents with lower priority
4. **Metrics Export**: Publish heartbeat stats to monitoring system
5. **Dead Letter Queue Integration**: Automatic DLQ writes for consistently hung agents

## Related Documentation

- [Redis Coordination Skill](./SKILL.md)
- [CFN Loop Orchestration](./orchestrate-cfn-loop.sh)
- [Waiting Mode Documentation](../../CLAUDE.md#redis-waiting-mode-zero-token-agent-coordination)
