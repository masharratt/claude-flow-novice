# Redis Coordination Skill

[... previous content ...]

## Metrics & Observability (v2.0.0)

### Overview

The Redis Coordination Skill provides comprehensive metrics and observability features to monitor distributed coordination performance, track system health, and enable advanced analytics.

### Metrics Configuration

```json
{
  "metrics": {
    "enabled": true,
    "retention": 604800,          // 7 days of metric retention
    "export_formats": [
      "json",                     // Lightweight JSON export
      "prometheus"                // Prometheus-compatible metrics
    ]
  }
}
```

### Collected Metrics

#### System Performance Metrics
- `redis_coordination_task_latency`: Latency for task coordination
  - Labels: `task_id`, `agent_id`, `operation_type`
  - Unit: Milliseconds
  - Description: Time taken to complete coordination operations

- `redis_coordination_waiting_mode_duration`: Duration of agent waiting mode
  - Labels: `task_id`, `agent_id`, `iteration`
  - Unit: Seconds
  - Description: Time agents spend in waiting state

#### Coordination Metrics
- `redis_coordination_consensus_score`: Consensus calculation metrics
  - Labels: `task_id`, `loop_stage`
  - Range: 0.0 - 1.0
  - Description: Real-time consensus calculation progress

- `redis_coordination_retry_count`: Retry mechanism tracking
  - Labels: `task_id`, `operation`, `reason`
  - Unit: Count
  - Description: Number of retries for different coordination operations

#### Agent Health Metrics
- `redis_agent_heartbeat_status`: Agent heartbeat status
  - Labels: `task_id`, `agent_id`, `status`
  - Values: 0 (Failed), 1 (Active)
  - Description: Tracks individual agent health

- `redis_agent_replacement_count`: Agent replacement tracking
  - Labels: `task_id`, `original_agent_id`, `replacement_agent_id`
  - Unit: Count
  - Description: Tracks automatic agent replacements

### Export Examples

#### JSON Export
```bash
# Export metrics to JSON
./.claude/skills/redis-coordination/export-metrics.sh \
  --format json \
  --output /var/log/claude-flow/metrics-$(date +%Y%m%d).json \
  --retention 7 \
  --compress
```

#### Prometheus Export
```bash
# Export metrics for Prometheus scraping
./.claude/skills/redis-coordination/export-metrics.sh \
  --format prometheus \
  --output /var/lib/prometheus/redis_coordination_metrics.prom
```

### Grafana Dashboard Integration

**Dashboard URL:** `https://grafana.claude-flow.ai/dashboards/redis-coordination`

**Key Visualization Panels:**
1. Task Latency Heatmap
2. Consensus Score Trends
3. Agent Health Overview
4. Retry and Fallback Analysis

### Monitoring Best Practices

1. Set up real-time alerting for:
   - Consensus score below threshold
   - High retry rates
   - Repeated agent replacements

2. Use retention and rotation to manage metric storage
3. Implement secure, read-only metric access
4. Correlate metrics with logs for deep insights

### Security Considerations
- Metrics do not expose sensitive task details
- Anonymized agent tracking
- Configurable metric retention

### Performance Impact
- Minimal overhead (<1% CPU)
- Configurable metric collection
- Zero-token metric tracking

## Deliverable Verification (BUG #11 Fix)

### Overview

The orchestrator implements automatic deliverable verification to prevent "consensus on vapor" - a critical bug where validators approve work with no actual implementation files created.

### Problem Statement

**BUG #11:** Loop 2 validators gave 0.91 consensus despite Loop 3 producing zero files. This allowed empty iterations to pass validation, wasting resources and tokens.

### Solution: Pre-Validation File Check

After Loop 3 completes but **before** Loop 2 validation begins, the orchestrator checks:

```bash
FILES_CHANGED=$(git status --short | grep -E "^(A|M|\?\?)" | wc -l)
```

**If no files were created or modified:**

1. Override all Loop 3 confidence scores to 0.0
2. Skip Loop 2 validation (no point validating nothing)
3. Wake Loop 3 agents with HIGH priority feedback
4. Continue to next iteration

**If files exist:**

Proceed normally to gate check and Loop 2 validation.

### Implementation Location

File: `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`

Lines: ~833-885 (after Loop 3 consensus collection, before gate check)

### Metrics Collected

- `swarm:{TASK_ID}:metrics:deliverable_failures` - Count of iterations with no deliverables

### Example Output

```
[Deliverable Check] Verifying implementation artifacts...
❌ DELIVERABLE VERIFICATION FAILED: No files created or modified
   This prevents 'consensus on vapor' - validators approving nothing

Decision: RELAUNCH iteration 2 (skip Loop 2 validation)

  [Override] coder-1 confidence: 0.95 → 0.0 (no deliverables)
  [Override] backend-dev-1 confidence: 0.88 → 0.0 (no deliverables)

[Loop 3] Recalculated confidence after override: 0.0

[Wake] coder-1 for iteration 2 (reason: no_deliverables, priority: 40)
  Feedback: CRITICAL: You must create or modify files. No deliverables were produced in iteration 1.
```

### Benefits

- Prevents wasted validator tokens on empty work
- Provides immediate, actionable feedback to Loop 3 agents
- Enforces concrete deliverables before validation
- Reduces iteration cycles on non-productive work

### Test Coverage

Test case: `test-orchestrator.sh` - Test 9: "Deliverable verification - prevents consensus on vapor"

Validates:
- Git status check implementation
- Override logic presence
- Feedback messaging

### Version Information
- **Version:** 2.0.0
- **Metrics Support:** Full
- **Export Formats:** JSON, Prometheus
- **Deliverable Verification:** Enabled (BUG #11 Fix)
- **Last Updated:** 2025-10-20

## Agent Completion Protocol (v2.1.0)

### Overview

The Agent Completion Protocol implements robust timeout handling and process monitoring to prevent indefinite blocking when agents crash or fail to signal completion.

### Problem Statement

**Previous Behavior:** If an agent failed to execute `redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"`, the orchestrator would block forever on BLPOP, waiting for a signal that never arrives.

**Root Causes:**
- Agent process crashes without cleanup
- Bash script errors before reaching done signal
- Agent gets stuck in infinite loop
- Network issues preventing Redis communication

### Solution: Three-Layer Protection

#### Layer 1: Process-Based Completion Detection

When spawning agents, the orchestrator automatically monitors process exit:

```bash
# Spawn agent
npx cfn-spawn agent "$AGENT" --agent-id "$AGENT_ID" --task-id "$TASK_ID" &
AGENT_PID=$!

# Start process monitor
monitor_agent_process "$AGENT_ID" "$AGENT_PID" "$TASK_ID" "$DONE_KEY"
```

**Process Monitor Behavior:**
- Waits for agent process to exit
- Checks if done signal already sent (agent may have signaled normally)
- If no signal: Auto-complete based on exit code
  - Exit code 0: `auto-completed-success`
  - Exit code non-zero: `auto-completed-error:<code>`

**Benefits:**
- Prevents indefinite blocking if agent crashes
- Captures exit code for debugging
- Zero overhead (background monitor)

#### Layer 2: BLPOP with Process Status Checks

Enhanced BLPOP retry logic checks process status on timeout:

```bash
# BLPOP with PID tracking
blpop_with_retry "$AGENT_ID" "$DONE_KEY" "$TIMEOUT" "$RETRY_COUNT" "$RETRY_DELAY" "$AGENT_PID"
```

**Timeout Behavior:**
1. BLPOP times out (no signal received)
2. Check if process still alive: `kill -0 $AGENT_PID`
3. If process dead: Check for auto-completion signal
4. If process alive: Continue retry logic

**Benefits:**
- Detects premature process termination
- Retrieves auto-completion signals
- Reduces wasted retry attempts

#### Layer 3: Heartbeat Monitoring

Agents can optionally send heartbeats to signal they're still working:

```bash
# Agent sends heartbeat every 30s
./.claude/skills/redis-coordination/send-heartbeat.sh start \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --interval 30 &
HEARTBEAT_PID=$!

# ... do work ...

# Stop heartbeat when done
./.claude/skills/redis-coordination/send-heartbeat.sh stop \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --pid "$HEARTBEAT_PID"
```

**Orchestrator Heartbeat Checks:**
- On BLPOP timeout: Check if heartbeat exists
- If no heartbeat for 2 intervals (60s default): Consider agent stuck
- If agent stuck and process alive: Kill process

**Benefits:**
- Detects stuck agents (infinite loops, deadlocks)
- Allows orchestrator to kill unresponsive processes
- Optional (agents work without heartbeats)

### Implementation Details

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`

**Key Functions:**

```bash
# Process monitor (lines ~498-529)
function monitor_agent_process() {
  local agent_id="$1"
  local agent_pid="$2"
  local task_id="$3"
  local done_key="$4"

  # Monitor in background
  (
    wait "$agent_pid"
    EXIT_CODE=$?

    # Check if already signaled
    DONE_COUNT=$(redis-cli LLEN "$done_key")
    if [ "$DONE_COUNT" -gt 0 ]; then
      exit 0  # Normal completion
    fi

    # Auto-complete based on exit code
    if [ $EXIT_CODE -eq 0 ]; then
      redis-cli LPUSH "$done_key" "auto-completed-success"
    else
      redis-cli LPUSH "$done_key" "auto-completed-error:$EXIT_CODE"
    fi
  ) &
}

# Enhanced BLPOP (lines ~534-620)
function blpop_with_retry() {
  local agent="$1"
  local done_key="$2"
  local timeout="$3"
  local retry_count="$4"
  local retry_delay="$5"
  local agent_pid="${6:-}"  # Optional PID

  for ATTEMPT in $(seq 1 $retry_count); do
    RESULT=$(redis-cli blpop "$done_key" "$timeout")

    if [ -n "$RESULT" ]; then
      echo "$RESULT"
      return 0
    fi

    # Check process status
    if [ -n "$agent_pid" ] && ! kill -0 "$agent_pid" 2>/dev/null; then
      # Process dead - check for auto-completion
      RESULT=$(redis-cli LPOP "$done_key")
      if [ -n "$RESULT" ]; then
        echo "$RESULT"
        return 0
      fi
    fi

    # Check heartbeat
    HEARTBEAT_EXISTS=$(redis-cli EXISTS "swarm:${TASK_ID}:${agent}:heartbeat")
    if [ "$HEARTBEAT_EXISTS" -eq 0 ] && [ -n "$agent_pid" ]; then
      # No heartbeat + process alive = stuck agent
      kill "$agent_pid"
      redis-cli INCR "swarm:${TASK_ID}:metrics:agent_killed"
    fi

    # Retry logic...
  done
}
```

### Metrics Collected

- `swarm:{TASK_ID}:metrics:agent_errors` - Count of agents that exited with errors
- `swarm:{TASK_ID}:metrics:agent_killed` - Count of stuck agents killed by timeout logic
- `swarm:{TASK_ID}:metrics:timeout_count` - Count of BLPOP timeouts
- `swarm:{TASK_ID}:metrics:retry_count` - Count of retry attempts

### Test Coverage

Test script: `.claude/skills/loop3-output-processing/test-agent-timeout.sh`

**Test Cases:**
1. Agent completes successfully - normal path
2. Agent exits with error - auto-completion
3. Agent stuck without heartbeat - timeout kill
4. Agent with continuous heartbeat - no timeout

### Usage Examples

#### Example 1: Normal Agent (No Changes Required)

```bash
# Agent completes work
do_work

# Signal completion (required)
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Report confidence (required)
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85

# Enter waiting mode (optional)
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID"
```

**Protection:** If agent crashes before signaling, process monitor auto-completes.

#### Example 2: Long-Running Agent with Heartbeat

```bash
# Start heartbeat
./.claude/skills/redis-coordination/send-heartbeat.sh start \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --interval 30 &
HEARTBEAT_PID=$!

# Do long-running work (>5 minutes)
do_complex_work

# Stop heartbeat
./.claude/skills/redis-coordination/send-heartbeat.sh stop \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --pid "$HEARTBEAT_PID"

# Signal completion
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

**Protection:** If agent gets stuck, orchestrator detects missing heartbeat and kills process.

### Benefits

- **Prevents indefinite blocking** - Orchestrator never hangs waiting for dead agents
- **Automatic cleanup** - Dead processes auto-complete without manual intervention
- **Graceful degradation** - System continues with quorum even if some agents fail
- **Debugging support** - Exit codes and metrics help identify failure patterns
- **Zero token waste** - No API calls for stuck agents in waiting mode

### Version Information
- **Version:** 2.1.0
- **Agent Completion Protocol:** Enabled
- **Process Monitoring:** Automatic
- **Heartbeat Support:** Optional
- **Last Updated:** 2025-10-20