# Agent Completion Protocol Implementation

## Overview

This implementation adds robust timeout handling and process monitoring to the Redis Coordination orchestrator, preventing indefinite blocking when agents crash or fail to signal completion.

## Problem Solved

**Issue:** If an agent doesn't execute `redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"`, the orchestrator blocks forever on BLPOP.

**Root Causes:**
- Agent process crashes without cleanup
- Bash script errors before reaching done signal
- Agent gets stuck in infinite loop
- Network issues preventing Redis communication

## Implementation

### Files Modified

1. **orchestrate-cfn-loop.sh** - Core orchestration script
   - Added `monitor_agent_process()` function (lines ~498-529)
   - Enhanced `blpop_with_retry()` with PID tracking (lines ~534-620)
   - Updated Loop 3 spawning to track PIDs and start monitors (lines ~751-775)
   - Updated Loop 2 spawning to track PIDs and start monitors (lines ~1032-1056)
   - Modified BLPOP calls to include PID parameter (lines ~805, ~1086)

2. **send-heartbeat.sh** - Heartbeat utility
   - Added start/stop/once modes for continuous heartbeat
   - Backward compatible with original one-shot behavior
   - Supports custom intervals and TTLs

3. **SKILL.md** - Documentation
   - Added "Agent Completion Protocol (v2.1.0)" section
   - Comprehensive usage examples
   - Metrics and test coverage documentation

### Files Created

1. **test-agent-timeout.sh** - Test suite
   - Test 1: Normal agent completion
   - Test 2: Agent exits with error (auto-completion)
   - Test 3: Agent stuck without heartbeat (timeout kill)
   - Test 4: Agent with continuous heartbeat (no timeout)

## Three-Layer Protection

### Layer 1: Process-Based Completion Detection

**What it does:**
- Monitors agent process in background
- Auto-signals completion when process exits
- Captures exit code for debugging

**Implementation:**
```bash
monitor_agent_process "$AGENT_ID" "$AGENT_PID" "$TASK_ID" "$DONE_KEY"
```

**Auto-completion signals:**
- Exit code 0: `auto-completed-success`
- Exit code non-zero: `auto-completed-error:<code>`

### Layer 2: BLPOP with Process Status Checks

**What it does:**
- Enhanced BLPOP retry logic
- Checks if process is still alive on timeout
- Retrieves auto-completion signals from dead processes

**Implementation:**
```bash
blpop_with_retry "$AGENT_ID" "$DONE_KEY" "$TIMEOUT" "$RETRY_COUNT" "$RETRY_DELAY" "$AGENT_PID"
```

**Behavior on timeout:**
1. BLPOP times out (no signal)
2. Check: `kill -0 $AGENT_PID`
3. If dead: Check for auto-completion signal
4. If alive: Continue retry logic

### Layer 3: Heartbeat Monitoring (Optional)

**What it does:**
- Agents send periodic heartbeats
- Orchestrator checks heartbeat on timeout
- Kills stuck processes with no heartbeat

**Agent usage:**
```bash
# Start heartbeat
./.claude/skills/redis-coordination/send-heartbeat.sh start \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --interval 30 &
HEARTBEAT_PID=$!

# ... do work ...

# Stop heartbeat
./.claude/skills/redis-coordination/send-heartbeat.sh stop \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --pid "$HEARTBEAT_PID"
```

**Orchestrator behavior:**
- No heartbeat for 2 intervals (60s) → Consider agent stuck
- Stuck + alive → Kill process with SIGTERM/SIGKILL

## Metrics

New metrics collected:

- `swarm:{TASK_ID}:metrics:agent_errors` - Agents that exited with errors
- `swarm:{TASK_ID}:metrics:agent_killed` - Stuck agents killed by timeout
- `swarm:{TASK_ID}:metrics:timeout_count` - BLPOP timeouts
- `swarm:{TASK_ID}:metrics:retry_count` - Retry attempts

## Testing

Run the test suite:

```bash
./.claude/skills/loop3-output-processing/test-agent-timeout.sh
```

**Expected output:**
```
=== Agent Completion Protocol Test ===
Task ID: test-timeout-1729517234

[Test 1] Agent completes successfully and signals done
  ✅ PASS: Agent signaled completion

[Test 2] Agent exits with error - process monitor auto-completes
  ✅ PASS: Process monitor auto-completed with error

[Test 3] Agent stuck without heartbeat - orchestrator kills process
  ✅ PASS: Stuck process was killed by timeout logic

[Test 4] Agent with continuous heartbeat - no timeout
  ✅ PASS: Heartbeat active after 5 seconds

=== Test Summary ===
Passed: 4
Failed: 0
✅ ALL TESTS PASSED
```

## Benefits

1. **No indefinite blocking** - Orchestrator never hangs on dead agents
2. **Automatic cleanup** - Dead processes auto-complete without intervention
3. **Graceful degradation** - System continues with quorum if some agents fail
4. **Debugging support** - Exit codes and metrics identify failure patterns
5. **Zero token waste** - No API calls for stuck agents
6. **Backward compatible** - Agents work without heartbeats
7. **Optional enhancement** - Heartbeats only for long-running agents

## Migration Guide

### For Agent Developers

**No changes required!** The protocol works automatically with existing agents.

**Optional enhancement** (for long-running agents >5 minutes):

```bash
# Add heartbeat at start of agent script
./.claude/skills/redis-coordination/send-heartbeat.sh start \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --interval 30 &
HEARTBEAT_PID=$!

# Add cleanup at end
./.claude/skills/redis-coordination/send-heartbeat.sh stop \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --pid "$HEARTBEAT_PID"
```

### For Orchestrator Operators

**No changes required!** Process monitoring is automatic for all CLI-spawned agents.

**Monitoring:**
- Check metrics for `agent_errors` and `agent_killed` counts
- High kill rates may indicate agent bugs or resource issues

## Version History

- **v2.1.0** (2025-10-20) - Agent Completion Protocol implementation
  - Process-based completion detection
  - Enhanced BLPOP with PID tracking
  - Continuous heartbeat support
  - Comprehensive test suite

## References

- Implementation: `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
- Documentation: `.claude/skills/redis-coordination/SKILL.md`
- Tests: `.claude/skills/loop3-output-processing/test-agent-timeout.sh`
- Heartbeat: `.claude/skills/redis-coordination/send-heartbeat.sh`
- Requirements: `docs/SKILL_ENFORCEMENT_OPPORTUNITIES.md` (Section 4)
