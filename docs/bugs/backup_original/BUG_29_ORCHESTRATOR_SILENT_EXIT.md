# BUG #29: Orchestrator Silent Exit on Agent Failures

**Status:** DISCOVERED
**Severity:** CRITICAL (P0)
**Discovered:** 2025-10-24
**Discovered By:** cfn-v3-validation test
**Affects:** CFN Loop Orchestration v1.1.0

---

## Summary

When CLI-spawned agents fail due to API errors (prompt overflow, rate limits, network issues), the orchestrator script exits silently without logging error details, making debugging extremely difficult.

---

## Impact

**User Experience:**
- Orchestrator appears to "hang" or stop mid-execution
- No error messages in logs
- User must manually inspect processes or re-run in foreground to diagnose

**Development:**
- Hard to debug orchestration failures
- Silent failures hide root causes
- No visibility into why CFN Loops stop

**Production:**
- Unacceptable for production use
- Cannot diagnose customer issues
- No alerting or monitoring hooks

---

## Root Cause Analysis

### Technical Details

**Orchestrator Script Structure:**
```bash
#!/usr/bin/env bash
set -euo pipefail
# ... orchestrator logic
```

**Agent Spawning:**
```bash
npx claude-flow-novice agent "$agent_type" \
  --task-id "$task_id" \
  --agent-id "$agent_id" \
  --iteration "$iteration" \
  --context "..." &

AGENT_PID=$!
```

**Background Execution:**
```bash
orchestrate.sh ... > /tmp/orchestrator.log 2>&1 &
```

### Failure Chain

1. Agent spawns via `npx claude-flow-novice agent ...`
2. Agent makes API call to Z.ai provider
3. **API call fails** (e.g., "Prompt too long" error 400)
4. CLI agent exits with code 1
5. Bash propagates exit code to orchestrator
6. **`set -e` triggers immediate exit**
7. Orchestrator stops without logging why
8. stderr was redirected to log but agent error happens in subprocess
9. **Error message never reaches orchestrator log**

### Why Errors Aren't Logged

**Problem 1: Subprocess Stderr Isolation**
```bash
npx claude-flow-novice agent ... &  # Background process
# Agent errors go to its own stderr, not orchestrator's
```

**Problem 2: Exit on Error**
```bash
set -e  # Exit immediately on any error
# No opportunity to catch and log error
```

**Problem 3: Background Redirection**
```bash
orchestrate.sh ... > log.txt 2>&1 &
# Orchestrator's stderr goes to log, but agent's doesn't
```

---

## Reproduction Steps

### Step 1: Create Test Task (causes prompt overflow)

```bash
TASK_ID="bug29-test-$(date +%s)"

/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "researcher" \
  --loop2-agents "reviewer" \
  --product-owner "product-owner" \
  --max-iterations 2 \
  > /tmp/bug29-test.log 2>&1 &

echo "Orchestrator PID: $!"
```

### Step 2: Monitor Logs

```bash
tail -f /tmp/bug29-test.log
```

**Expected:** Agent spawns, uses Glob tool, generates huge context, API fails

### Step 3: Observe Silent Exit

**Actual Log Output:**
```
Waiting for agents to complete (timeout: 3600s)...
  Retrieved 1 agent IDs from Redis
  Waiting for: researcher-1-1
...
[Agent executes, reports confidence]
...
=== Execution Result ===
Agent ID: researcher-1-1
Status: ✓ Success
Exit Code: 0

[LOG ENDS - no error message]
```

**Check Process:**
```bash
ps aux | grep orchestrate.sh
# No process found - exited silently
```

### Step 4: Compare with Foreground Run

```bash
# Run in foreground to see actual error
timeout 120 bash -c '/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "bug29-debug" \
  --mode standard \
  --loop3-agents "researcher" \
  --loop2-agents "reviewer" \
  --product-owner "product-owner" \
  --max-iterations 2' 2>&1 | tee /tmp/bug29-foreground.log
```

**Actual Error Visible:**
```
[anthropic-client] Error: BadRequestError: 400
{"type":"error","error":{"type":"1261","message":"Prompt too long"},"request_id":"..."}
```

---

## Example Failure Scenarios

### Scenario 1: Prompt Too Long (Z.ai Context Limit)

**Trigger:** Agent uses Glob tool without filters, returns thousands of files

**API Error:**
```json
{
  "type": "error",
  "error": {
    "type": "1261",
    "message": "Prompt too long"
  }
}
```

**Result:** Orchestrator exits after agent reports completion (misleading)

### Scenario 2: Rate Limit Exceeded

**Trigger:** Too many API calls in short time

**API Error:**
```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded"
  }
}
```

**Result:** Orchestrator exits without retry or backoff

### Scenario 3: Network Timeout

**Trigger:** Network instability or provider outage

**API Error:**
```
Error: ETIMEDOUT - Connection timed out
```

**Result:** Orchestrator exits without indicating network issue

---

## Recommended Fixes

### Fix 1: Error Trapping (REQUIRED)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Error handler
log_error() {
    local line_num=$1
    local command=$2
    echo "================================" >> "$LOG_FILE"
    echo "❌ ORCHESTRATOR ERROR" >> "$LOG_FILE"
    echo "Line: $line_num" >> "$LOG_FILE"
    echo "Command: $command" >> "$LOG_FILE"
    echo "Timestamp: $(date -Iseconds)" >> "$LOG_FILE"
    echo "================================" >> "$LOG_FILE"

    # Dump relevant Redis state for debugging
    echo "Redis State:" >> "$LOG_FILE"
    redis-cli keys "swarm:${TASK_ID}:*" >> "$LOG_FILE" 2>&1

    exit 1
}

trap 'log_error $LINENO "$BASH_COMMAND"' ERR
```

### Fix 2: Capture Agent Stderr (REQUIRED)

```bash
# Create agent-specific log file
AGENT_LOG="/tmp/agent-${agent_id}.log"

# Spawn with stderr capture
if ! npx claude-flow-novice agent "$agent_type" \
    --task-id "$task_id" \
    --agent-id "$agent_id" \
    --iteration "$iteration" \
    --context "..." \
    2>&1 | tee -a "$AGENT_LOG" >> "$LOG_FILE"; then

    echo "⚠️ Warning: Agent $agent_id spawn failed" >> "$LOG_FILE"
    echo "See agent log: $AGENT_LOG" >> "$LOG_FILE"

    # Decide: continue or abort
    # For now: abort with context
    echo "❌ Aborting orchestration due to agent spawn failure" >> "$LOG_FILE"
    exit 1
fi
```

### Fix 3: Health Checks (RECOMMENDED)

```bash
# After each agent spawn
check_agent_health() {
    local agent_id=$1
    local timeout=30

    # Wait for agent to signal start
    if ! redis-cli blpop "swarm:${TASK_ID}:${agent_id}:started" "$timeout" >/dev/null 2>&1; then
        echo "❌ Agent $agent_id failed to start within ${timeout}s" >> "$LOG_FILE"
        return 1
    fi

    echo "✅ Agent $agent_id started successfully" >> "$LOG_FILE"
    return 0
}

# After spawn
if ! check_agent_health "$agent_id"; then
    echo "❌ Health check failed for $agent_id" >> "$LOG_FILE"
    exit 1
fi
```

### Fix 4: Graceful Degradation (RECOMMENDED)

```bash
# Allow some agents to fail without aborting entire workflow
MAX_AGENT_FAILURES=1
AGENT_FAILURES=0

spawn_agent_with_retry() {
    local agent_type=$1
    local max_retries=3

    for attempt in $(seq 1 $max_retries); do
        if npx claude-flow-novice agent "$agent_type" ... 2>&1 | tee -a "$AGENT_LOG" >> "$LOG_FILE"; then
            echo "✅ Agent $agent_type spawned successfully (attempt $attempt)" >> "$LOG_FILE"
            return 0
        fi

        echo "⚠️ Agent $agent_type spawn failed (attempt $attempt/$max_retries)" >> "$LOG_FILE"

        if [ $attempt -lt $max_retries ]; then
            sleep $((attempt * 2))  # Exponential backoff
        fi
    done

    # All retries failed
    ((AGENT_FAILURES++))

    if [ $AGENT_FAILURES -gt $MAX_AGENT_FAILURES ]; then
        echo "❌ Too many agent failures ($AGENT_FAILURES), aborting" >> "$LOG_FILE"
        exit 1
    fi

    echo "⚠️ Agent $agent_type failed after $max_retries attempts, continuing..." >> "$LOG_FILE"
    return 1
}
```

### Fix 5: Logging Before Critical Operations (REQUIRED)

```bash
# Add explicit logging before each step
log_step() {
    echo "========================================" >> "$LOG_FILE"
    echo "[$(date -Iseconds)] STEP: $1" >> "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
}

# Usage
log_step "Spawning Loop 3 agents"
spawn_loop3_agents "$TASK_ID" "$ITERATION" "$LOOP3_AGENTS"

log_step "Waiting for Loop 3 agents to complete"
wait_for_agents "$TASK_ID" "$LOOP3_AGENTS" "$TIMEOUT" "$ITERATION"

log_step "Verifying deliverables"
if "$HELPERS_DIR/deliverable-verifier.sh" ...; then
    ...
fi

log_step "Checking Loop 3 gate"
if "$HELPERS_DIR/gate-check.sh" ...; then
    ...
fi
```

---

## Validation Plan

### Test 1: Prompt Overflow Recovery

```bash
# Create agent that generates huge context
TASK_ID="test-overflow-recovery"

# Run orchestrator
orchestrate.sh \
  --task-id "$TASK_ID" \
  --loop3-agents "researcher" \
  ...

# Expected: Error logged with details, orchestrator exits gracefully
grep "Prompt too long" /tmp/orchestrator.log
grep "❌ ORCHESTRATOR ERROR" /tmp/orchestrator.log
```

### Test 2: Rate Limit Retry

```bash
# Simulate rate limiting
# Run orchestrator with high agent count
TASK_ID="test-rate-limit"

orchestrate.sh \
  --task-id "$TASK_ID" \
  --loop3-agents "agent1,agent2,agent3,agent4,agent5" \
  ...

# Expected: Retries with backoff, eventual success or graceful failure
grep "attempt" /tmp/orchestrator.log
```

### Test 3: Network Timeout

```bash
# Disable network temporarily
# Run orchestrator
TASK_ID="test-network-timeout"

orchestrate.sh \
  --task-id "$TASK_ID" \
  --loop3-agents "coder" \
  ...

# Expected: Network error logged, orchestrator exits with clear message
grep "ETIMEDOUT" /tmp/orchestrator.log
grep "❌ ORCHESTRATOR ERROR" /tmp/orchestrator.log
```

---

## Priority Justification (P0)

**Why Critical:**
1. **Blocks End-to-End Testing:** Cannot validate full CFN Loop without diagnosing failures
2. **Production Blocker:** Unacceptable error handling for production use
3. **User Experience:** Silent failures are confusing and frustrating
4. **Development Velocity:** Debugging takes 10x longer without error logs

**Impact:**
- Affects: ALL CFN Loop orchestration workflows
- Frequency: ANY agent API failure triggers this
- Workaround: Run orchestrator in foreground (not viable for production)

**Estimated Fix Time:** 1-2 hours

**Estimated Test Time:** 30 minutes

**Total:** 2-3 hours to full resolution

---

## Related Issues

- **BUG #28:** Missing `--append` parameter (FIXED) - revealed by debugging this issue
- **FUTURE:** Agent context optimization - prevent prompt overflow at source

---

## Monitoring & Alerting (Post-Fix)

**Add to Orchestrator:**
```bash
# Send alert on error
on_error() {
    # Log to monitoring system
    curl -X POST "https://monitoring.example.com/alert" \
        -d "orchestrator_error" \
        -d "task_id=$TASK_ID" \
        -d "error=$BASH_COMMAND"

    # Log to file
    log_error $LINENO "$BASH_COMMAND"
}

trap 'on_error' ERR
```

**Metrics to Track:**
- Orchestrator exit codes
- Agent spawn success rate
- API error types
- Average recovery time

---

## Conclusion

BUG #29 is a critical orchestrator reliability issue that prevents production use and makes debugging extremely difficult. Implementing error trapping, stderr capture, health checks, and graceful degradation will resolve this issue and significantly improve CFN Loop robustness.

**Next Steps:**
1. Implement Fixes 1, 2, and 5 (error trapping, stderr capture, step logging)
2. Test with simulated failures (prompt overflow, rate limits, network issues)
3. Re-run CFN v3 validation test
4. Document error handling best practices

**Estimated Time to Resolution:** 2-3 hours

---

**Bug Report By:** cfn-v3-coordinator
**Date:** 2025-10-24
**Version:** 1.0
