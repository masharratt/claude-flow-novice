# Agent Lifecycle Hooks

**Epic:** production-blocking-coordination
**Sprint:** 2.2 - Agent Lifecycle Hooks
**Version:** 1.0.0
**Last Updated:** 2025-10-10

---

## Overview

Agent lifecycle hooks provide customizable entry points for blocking coordination behavior. Hooks execute at critical coordination moments, enabling agents to save state, restore context, and handle timeouts gracefully.

**Key Features:**
- **State Persistence**: Save agent context before blocking
- **Context Restoration**: Resume work with full state recovery
- **Timeout Handling**: Graceful degradation on coordination timeouts
- **Event Integration**: Publish coordination events to event bus
- **Memory Coordination**: Share state across agents via SQLite memory

---

## Table of Contents

1. [Hook Lifecycle](#hook-lifecycle)
2. [Environment Variables](#environment-variables)
3. [Hook Types](#hook-types)
4. [Hook Execution Rules](#hook-execution-rules)
5. [Implementation Examples](#implementation-examples)
6. [Best Practices](#best-practices)
7. [Testing & Debugging](#testing--debugging)
8. [Security Considerations](#security-considerations)

---

## Hook Lifecycle

### Complete Lifecycle Flow

```
┌─────────────────────────────────────────────────┐
│ Agent Task Execution                            │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. Agent starts task                           │
│     ↓                                           │
│  2. Requires blocking coordination              │
│     ↓                                           │
│  3. [on_blocking_start] hook executes           │
│     - Save current state                        │
│     - Record context (files, cursor, queue)     │
│     - Publish blocking event                    │
│     ↓                                           │
│  4. Agent enters blocking wait state            │
│     - Waits for signal or timeout               │
│     ↓                                           │
│  ┌──┴───────────────┐                           │
│  │                  │                           │
│  │ Signal Received  │  Timeout Reached          │
│  │                  │                           │
│  ↓                  ↓                           │
│  5a. [on_signal_received]  5b. [on_blocking_timeout] │
│      - Restore state           - Save partial work   │
│      - Resume work             - Escalate to coord   │
│      - Publish resume event    - Request retry       │
│      ↓                         ↓                │
│  6a. Continue task        6b. Abort or retry    │
│      ↓                         ↓                │
│  7. Task completion       7. Task rescheduled   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### State Transitions

| State | Hook | Next State | Duration |
|-------|------|------------|----------|
| **Active** | - | Blocking Start | Immediate |
| **Blocking Start** | `on_blocking_start` | Waiting | < 5s |
| **Waiting** | - | Signal Received OR Timeout | Variable (0-300s) |
| **Signal Received** | `on_signal_received` | Active | < 5s |
| **Timeout** | `on_blocking_timeout` | Escalated/Retry | < 5s |

---

## Environment Variables

### Available in All Hooks

Each hook receives these environment variables:

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `AGENT_ID` | string | Unique agent identifier | `coder-1` |
| `TASK` | string | Current task description | `Implement authentication` |
| `SWARM_ID` | string | Swarm identifier | `cfn-phase-auth` |
| `ITERATION` | number | Current iteration count | `3` |
| `PHASE` | string | Current phase name | `authentication` |
| `BLOCKING_TYPE` | string | Type of blocking operation | `consensus`, `validation`, `dependency` |
| `TIMEOUT_THRESHOLD` | number | Timeout threshold (ms) | `300000` (5 min) |

### Hook-Specific Variables

**on_signal_received hook only:**

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `SIGNAL_DATA` | JSON | Signal payload data | `{"source":"reviewer-1","action":"approved"}` |
| `WAIT_DURATION` | number | Time spent waiting (ms) | `45000` (45s) |

**on_blocking_timeout hook only:**

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `TIMEOUT_DURATION` | number | Time since blocking start (ms) | `305000` (5m 5s) |
| `EXCEEDED_BY` | number | Time exceeded threshold (ms) | `5000` (5s) |

### Accessing Variables in Hooks

```bash
# Basic usage
echo "Agent ${AGENT_ID} entering blocking coordination"

# Conditional logic
if [ "${BLOCKING_TYPE}" = "consensus" ]; then
  echo "Waiting for consensus validation"
fi

# Embedding in JSON
/sqlite-memory store --key "agent:${AGENT_ID}:context" \
  --data '{"agent":"'"${AGENT_ID}"'","task":"'"${TASK}"'","iteration":'"${ITERATION}"'}'
```

---

## Hook Types

### 1. on_blocking_start

**Purpose**: Execute custom logic when agent enters blocking coordination.

**Use Cases:**
- Save current work state
- Record execution context
- Publish blocking event to event bus
- Initialize timeout monitoring

**Example**:
```yaml
hooks:
  on_blocking_start: |
    echo "🔒 Agent ${AGENT_ID} entering blocking coordination"
    /sqlite-memory store --key "agent:${AGENT_ID}:blocking:context" \
      --level agent \
      --data '{"status":"blocked","timestamp":"'$(date +%s)'","task":"${TASK}","phase":"${PHASE}"}'
    /eventbus publish --type agent.blocking.start \
      --data '{"agent":"${AGENT_ID}","phase":"${PHASE}"}' \
      --priority 8
```

**Execution Time**: Before entering wait state
**Timeout**: 5 seconds
**Exit Code**: 0 = success, non-zero = logged but doesn't block

### 2. on_signal_received

**Purpose**: Execute custom logic when agent receives signal to resume.

**Use Cases:**
- Restore saved state
- Resume paused operations
- Publish resume event
- Log signal reception

**Example**:
```yaml
hooks:
  on_signal_received: |
    echo "✅ Agent ${AGENT_ID} received signal, resuming work"
    CONTEXT=$(/sqlite-memory retrieve --key "agent:${AGENT_ID}:blocking:context" --level agent)
    echo "Resuming from context: $CONTEXT"
    /eventbus publish --type agent.blocking.resume \
      --data '{"agent":"${AGENT_ID}","wait_duration":"${WAIT_DURATION}"}' \
      --priority 8
```

**Execution Time**: After signal received, before resuming work
**Timeout**: 5 seconds
**Exit Code**: 0 = success, non-zero = logged but doesn't block

### 3. on_blocking_timeout

**Purpose**: Execute custom logic when blocking operation times out.

**Use Cases:**
- Save partial work
- Escalate to coordinator
- Request timeout extension
- Publish timeout event for recovery

**Example**:
```yaml
hooks:
  on_blocking_timeout: |
    echo "⏰ Agent ${AGENT_ID} blocking timeout - escalating"
    /sqlite-memory store --key "agent:${AGENT_ID}:timeout" \
      --level agent \
      --data '{"status":"timeout","timestamp":"'$(date +%s)'","action":"escalate","iteration":"${ITERATION}"}'
    /eventbus publish --type agent.timeout \
      --data '{"agent":"${AGENT_ID}","iteration":"${ITERATION}","exceeded_by":"${EXCEEDED_BY}"}' \
      --priority 9
```

**Execution Time**: After timeout threshold exceeded
**Timeout**: 5 seconds
**Exit Code**: 0 = success, non-zero = logged but doesn't block

---

## Hook Execution Rules

### 1. Execution Context

- **Shell**: Hooks execute in Bash shell context
- **Working Directory**: Agent's workspace directory
- **User**: Same user as agent process (not root)
- **Environment**: Inherits agent environment + hook-specific variables

### 2. Exit Codes

| Exit Code | Meaning | Behavior |
|-----------|---------|----------|
| `0` | Success | Hook completed successfully |
| `1-255` | Failure | Error logged, coordination continues |
| Timeout | Hook exceeded 5s | Hook killed, error logged |

**Important**: Hook failures do NOT block coordination. Errors are logged for debugging.

### 3. Timeout Enforcement

- **Default Timeout**: 5 seconds per hook
- **Enforcement**: SIGKILL after timeout
- **Best Practice**: Keep hooks < 3 seconds for safety margin

### 4. Execution Order

```
1. Parse agent profile YAML frontmatter
2. Load hook scripts into memory
3. Wait for blocking coordination trigger
4. Execute on_blocking_start hook
5. Enter blocking wait state
6. On signal/timeout:
   a. Execute on_signal_received (if signal)
   b. Execute on_blocking_timeout (if timeout)
7. Resume agent work or escalate
```

### 5. Error Handling

**Hook errors are non-fatal**:
- Error logged to agent logs
- Stack trace captured
- Coordination continues
- Metrics incremented (`hook_failures_total`)

**Example log entry**:
```json
{
  "level": "error",
  "component": "AgentHookExecutor",
  "hook": "on_blocking_start",
  "agent": "coder-1",
  "error": "Command failed with exit code 1",
  "stderr": "/sqlite-memory: command not found",
  "timestamp": 1728567890
}
```

### 6. Idempotency

Hooks should be idempotent (safe to re-run):
- Check state before operations
- Use conditional logic
- Avoid destructive commands without checks

**Example**:
```bash
# Check if state already saved
if [ ! -f "/tmp/agent_${AGENT_ID}_state.json" ]; then
  # Save state only if not exists
  echo '{"status":"blocked"}' > "/tmp/agent_${AGENT_ID}_state.json"
fi
```

---

## Implementation Examples

### Coder Agent: Save Code Context

```yaml
hooks:
  on_blocking_start: |
    # Save open files and cursor position
    OPEN_FILES=$(lsof -p $$ | grep '\.js$\|\.ts$' | awk '{print $9}' | jq -R -s -c 'split("\n") | map(select(length > 0))')
    CURSOR_POS=$(cat /tmp/cursor_pos_${AGENT_ID}.txt 2>/dev/null || echo "0:0")

    /sqlite-memory store --key "coder:${AGENT_ID}:context" \
      --level agent \
      --data '{"files":'"${OPEN_FILES}"',"cursor":"'"${CURSOR_POS}"'","timestamp":"'$(date +%s)'"}'

    echo "💾 Saved code context: ${OPEN_FILES}"

  on_signal_received: |
    # Restore code context
    CONTEXT=$(/sqlite-memory retrieve --key "coder:${AGENT_ID}:context" --level agent)
    CURSOR=$(echo "$CONTEXT" | jq -r '.cursor')

    echo "📂 Restoring code context, cursor at ${CURSOR}"
    echo "${CURSOR}" > /tmp/cursor_pos_${AGENT_ID}.txt

  on_blocking_timeout: |
    # Save partial work to git stash
    git add -A
    git stash save "WIP: Agent ${AGENT_ID} timeout at iteration ${ITERATION}" || true

    /eventbus publish --type coder.timeout \
      --data '{"agent":"${AGENT_ID}","stash":"latest","files_modified":"'$(git diff --name-only | wc -l)'"}' \
      --priority 9
```

### Reviewer Agent: Checkpoint Review State

```yaml
hooks:
  on_blocking_start: |
    # Checkpoint current review progress
    REVIEWED=$(cat /tmp/reviewed_files_${AGENT_ID}.json 2>/dev/null || echo '[]')
    FEEDBACK=$(cat /tmp/feedback_${AGENT_ID}.json 2>/dev/null || echo '[]')

    /sqlite-memory store --key "reviewer:${AGENT_ID}:checkpoint" \
      --level agent \
      --data '{"reviewed_files":'"${REVIEWED}"',"feedback":'"${FEEDBACK}"',"timestamp":"'$(date +%s)'"}'

    echo "📋 Checkpointed review state: $(echo "$REVIEWED" | jq length) files reviewed"

  on_signal_received: |
    # Load checkpoint and continue review
    CHECKPOINT=$(/sqlite-memory retrieve --key "reviewer:${AGENT_ID}:checkpoint" --level agent)
    echo "$CHECKPOINT" | jq -r '.reviewed_files' > /tmp/reviewed_files_${AGENT_ID}.json
    echo "$CHECKPOINT" | jq -r '.feedback' > /tmp/feedback_${AGENT_ID}.json

    FILES_COUNT=$(echo "$CHECKPOINT" | jq -r '.reviewed_files | length')
    echo "✅ Restored review checkpoint: ${FILES_COUNT} files"

  on_blocking_timeout: |
    # Submit partial review to swarm memory
    PARTIAL_REVIEW=$(cat /tmp/feedback_${AGENT_ID}.json 2>/dev/null || echo '[]')
    FILES_REVIEWED=$(cat /tmp/reviewed_files_${AGENT_ID}.json 2>/dev/null | jq length)

    /sqlite-memory store --key "reviewer:${AGENT_ID}:partial_review" \
      --level swarm \
      --data '{"status":"partial","files_reviewed":"'"${FILES_REVIEWED}"'","feedback":'"${PARTIAL_REVIEW}"'}'

    echo "⚠️ Submitted partial review: ${FILES_REVIEWED} files"
```

### Tester Agent: Pause/Resume Test Execution

```yaml
hooks:
  on_blocking_start: |
    # Pause running test processes
    pkill -STOP -f "vitest.*${AGENT_ID}" 2>/dev/null || true

    # Save test queue state
    TEST_QUEUE=$(cat /tmp/test_queue_${AGENT_ID}.json 2>/dev/null || echo '{"tests":[],"completed":0}')

    /sqlite-memory store --key "tester:${AGENT_ID}:test_queue" \
      --level agent \
      --data '{"paused_at":"'$(date +%s)'","queue":'"${TEST_QUEUE}"'}'

    echo "⏸️ Paused test execution, queue saved"

  on_signal_received: |
    # Resume test processes
    pkill -CONT -f "vitest.*${AGENT_ID}" 2>/dev/null || true

    # Restore test queue
    TEST_QUEUE=$(/sqlite-memory retrieve --key "tester:${AGENT_ID}:test_queue" --level agent)
    PAUSED_AT=$(echo "$TEST_QUEUE" | jq -r '.paused_at')
    DURATION=$(($(date +%s) - PAUSED_AT))

    echo "▶️ Resumed tests after ${DURATION}s pause"

  on_blocking_timeout: |
    # Kill hanging test processes
    pkill -KILL -f "vitest.*${AGENT_ID}" 2>/dev/null || true

    # Save timeout report
    TEST_RESULTS=$(cat /tmp/test_results_${AGENT_ID}.json 2>/dev/null || echo '{"total":0,"passed":0}')
    COMPLETED=$(echo "$TEST_RESULTS" | jq -r '.passed')

    /sqlite-memory store --key "tester:${AGENT_ID}:timeout_report" \
      --level swarm \
      --data '{"status":"timeout","tests_completed":"'"${COMPLETED}"'","action":"retry"}'

    echo "🚨 Test timeout: ${COMPLETED} tests completed before timeout"
```

---

## Best Practices

### 1. Keep Hooks Fast (< 5 seconds)

**Why**: Hooks block coordination flow. Long-running hooks delay entire swarm.

**How**:
- Use async operations where possible
- Avoid heavy computation
- Use background jobs: `command & disown`
- Cache frequently accessed data

**Example**:
```bash
# ❌ Bad: Slow, blocks coordination
for file in $(find . -name "*.js"); do
  analyze_file "$file"
done

# ✅ Good: Fast, async
find . -name "*.js" | xargs -P 4 analyze_file & disown
/sqlite-memory store --key "analysis:${AGENT_ID}:started" --data '{"pid":"'$!'"}'
```

### 2. Handle Errors Gracefully

**Why**: Hook failures should not crash coordination.

**How**:
- Use `|| true` for non-critical commands
- Check command existence: `command -v tool`
- Validate inputs before operations
- Provide fallback values

**Example**:
```bash
# ❌ Bad: Fails if command missing
/sqlite-memory retrieve --key "data"

# ✅ Good: Fallback on failure
DATA=$(/sqlite-memory retrieve --key "data" 2>/dev/null || echo '{}')
```

### 3. Use SQLite Memory for State Persistence

**Why**: SQLite provides structured, queryable, persistent storage.

**Memory Levels**:
- `--level agent`: Private to single agent (isolated)
- `--level swarm`: Shared across swarm (coordination)
- `--level project`: Persistent across swarms (long-term)

**Example**:
```bash
# Agent-private state
/sqlite-memory store --key "agent:${AGENT_ID}:state" \
  --level agent \
  --data '{"status":"blocked"}'

# Swarm-shared coordination
/sqlite-memory store --key "swarm:${SWARM_ID}:agents:blocked" \
  --level swarm \
  --data '{"agents":["coder-1","reviewer-1"]}'

# Project-persistent history
/sqlite-memory store --key "project:timeout_history" \
  --level project \
  --data '{"agent":"${AGENT_ID}","timestamp":"'$(date +%s)'"}'
```

### 4. Publish Events for Coordination

**Why**: Event bus enables real-time coordination across agents.

**Priority Levels**:
- `9`: Critical (timeouts, escalations)
- `8`: Lifecycle (blocking start, resume)
- `7`: Status updates
- `6`: Metrics

**Example**:
```bash
# Critical timeout event
/eventbus publish --type agent.timeout \
  --data '{"agent":"${AGENT_ID}","iteration":"${ITERATION}"}' \
  --priority 9

# Lifecycle event
/eventbus publish --type agent.blocking.start \
  --data '{"agent":"${AGENT_ID}","phase":"${PHASE}"}' \
  --priority 8
```

### 5. Sanitize User Input

**Why**: Prevent command injection and path traversal attacks.

**How**:
- Always quote variables: `"${VAR}"`
- Validate paths before operations
- Escape special characters
- Use allowlists for inputs

**Example**:
```bash
# ❌ Bad: Injection vulnerable
eval "/sqlite-memory retrieve --key agent:${AGENT_ID}:data"

# ✅ Good: Properly quoted and sanitized
AGENT_ID_SAFE=$(echo "${AGENT_ID}" | tr -cd '[:alnum:]-_')
/sqlite-memory retrieve --key "agent:${AGENT_ID_SAFE}:data"
```

### 6. Log Hook Execution

**Why**: Debugging, monitoring, audit trail.

**How**:
- Always echo status messages
- Include agent ID, iteration, phase
- Use emojis for visibility
- Log to stdout (captured by agent)

**Example**:
```bash
echo "🔒 Agent ${AGENT_ID} entering blocking coordination (iteration ${ITERATION}, phase ${PHASE})"
echo "💾 Saving state to SQLite memory: agent:${AGENT_ID}:context"
/sqlite-memory store --key "agent:${AGENT_ID}:context" --data '...'
echo "✅ State saved successfully"
```

---

## Testing & Debugging

### Manual Testing

#### Test on_blocking_start Hook

```bash
# Set up environment
export AGENT_ID="test-agent-1"
export TASK="Test blocking coordination"
export PHASE="testing"
export ITERATION="1"
export SWARM_ID="test-swarm"
export BLOCKING_TYPE="consensus"
export TIMEOUT_THRESHOLD="300000"

# Execute hook script
bash -c 'echo "🔒 Agent ${AGENT_ID} entering blocking coordination"
/sqlite-memory store --key "agent:${AGENT_ID}:blocking:context" \
  --level agent \
  --data "{\"status\":\"blocked\",\"timestamp\":\"$(date +%s)\",\"task\":\"${TASK}\"}"'

# Verify state saved
/sqlite-memory retrieve --key "agent:test-agent-1:blocking:context" --level agent
```

#### Test on_signal_received Hook

```bash
# Set up environment (same as above)
export SIGNAL_DATA='{"source":"reviewer-1","action":"approved"}'
export WAIT_DURATION="45000"

# Execute hook script
bash -c 'CONTEXT=$(/sqlite-memory retrieve --key "agent:${AGENT_ID}:blocking:context" --level agent)
echo "✅ Agent ${AGENT_ID} received signal, resuming work"
echo "Resuming from context: $CONTEXT"'
```

#### Test on_blocking_timeout Hook

```bash
# Set up environment (same as above)
export TIMEOUT_DURATION="305000"
export EXCEEDED_BY="5000"

# Execute hook script
bash -c 'echo "⏰ Agent ${AGENT_ID} blocking timeout - escalating"
/sqlite-memory store --key "agent:${AGENT_ID}:timeout" \
  --level agent \
  --data "{\"status\":\"timeout\",\"timestamp\":\"$(date +%s)\",\"exceeded_by\":\"${EXCEEDED_BY}\"}"'
```

### Automated Testing

Use the validation script to test all hooks:

```bash
# Validate all agent profiles
node scripts/validate-agent-hooks.js --all

# Validate specific profile
node scripts/validate-agent-hooks.js .claude/agents/examples/blocking-coordinator-example.md

# Validate with verbose output
node scripts/validate-agent-hooks.js --all --verbose

# CI mode (exit 1 on errors)
node scripts/validate-agent-hooks.js --all --ci
```

### Debugging Hook Execution

#### Enable Debug Logging

```bash
# Enable hook debug logs
export CLAUDE_FLOW_DEBUG_HOOKS=1

# Enable all debug logs
export CLAUDE_FLOW_DEBUG=1
```

#### Hook Execution Logs

Hooks log to multiple destinations:

1. **stdout**: Captured in agent logs
2. **stderr**: Captured in error logs
3. **SQLite memory**: `hook:${AGENT_ID}:execution`

**Example log entry**:
```json
{
  "level": "debug",
  "component": "AgentHookExecutor",
  "hook": "on_blocking_start",
  "agent": "coder-1",
  "duration_ms": 1234,
  "exit_code": 0,
  "output": "🔒 Agent coder-1 entering blocking coordination\n✅ State saved successfully",
  "timestamp": 1728567890
}
```

#### Common Issues

**Issue: Hook not executing**
- **Cause**: YAML syntax error in frontmatter
- **Fix**: Validate YAML with `yamllint .claude/agents/your-agent.md`

**Issue: Hook timing out**
- **Cause**: Execution exceeds 5 seconds
- **Fix**: Optimize slow commands, use background jobs

**Issue: State not persisted**
- **Cause**: Invalid memory level or key naming
- **Fix**: Use `--level agent` and key pattern `agent:${AGENT_ID}:*`

**Issue: Command not found**
- **Cause**: Tool not in PATH
- **Fix**: Use absolute paths or check availability: `command -v tool`

### Monitoring Hook Performance

```bash
# Get hook execution metrics
/sqlite-memory retrieve --key "metrics:hooks:execution" --level project | jq

# Expected output:
{
  "hooks": {
    "on_blocking_start": {
      "executions": 150,
      "failures": 2,
      "avg_duration_ms": 1234,
      "max_duration_ms": 4567
    },
    "on_signal_received": {
      "executions": 148,
      "failures": 0,
      "avg_duration_ms": 567
    },
    "on_blocking_timeout": {
      "executions": 3,
      "failures": 1,
      "avg_duration_ms": 2345
    }
  }
}
```

---

## Security Considerations

### 1. Input Validation

**Threat**: Command injection via unsanitized variables

**Mitigation**:
- Always quote variables: `"${AGENT_ID}"`
- Sanitize IDs: `tr -cd '[:alnum:]-_'`
- Validate paths: `realpath --relative-to=/workspace`
- Use allowlists for inputs

**Example**:
```bash
# ❌ Vulnerable to injection
/sqlite-memory retrieve --key agent:${AGENT_ID}:data

# ✅ Safe: Properly quoted and sanitized
AGENT_ID_SAFE=$(echo "${AGENT_ID}" | tr -cd '[:alnum:]-_')
/sqlite-memory retrieve --key "agent:${AGENT_ID_SAFE}:data"
```

### 2. Privilege Isolation

**Principle**: Hooks run with minimal privileges

**Enforcement**:
- **User**: Same as agent process (not root)
- **File access**: Limited to agent workspace
- **Network access**: Restricted to event bus and memory store
- **Process isolation**: Cannot access other agents' processes

**Example**:
```bash
# ✅ Allowed: Workspace file operations
cat /workspace/agent_${AGENT_ID}/data.json

# ❌ Forbidden: System file access
cat /etc/passwd

# ✅ Allowed: Memory operations
/sqlite-memory store --key "agent:${AGENT_ID}:data" --data '{}'

# ❌ Forbidden: Direct database access
sqlite3 /var/lib/claude-flow/memory.db "DROP TABLE agents"
```

### 3. Dangerous Commands

**Forbidden Commands**:
- Destructive: `rm -rf`, `dd`, `mkfs`, `shred`
- System modification: `chmod 777`, `chown root`, `sudo`
- Network attacks: `nc -l`, `nmap`, `tcpdump`
- Database manipulation: Direct SQLite access

**Restricted Commands**:
- File operations: Only in workspace
- Process management: Only agent's processes
- Network: Only event bus endpoints

**Allowed Commands**:
- Memory operations: `/sqlite-memory`
- Event publishing: `/eventbus`
- File I/O: In workspace directory
- Process management: Own processes only

**Validation**:
```javascript
// scripts/validate-agent-hooks.js checks for dangerous patterns
const FORBIDDEN_PATTERNS = [
  /rm\s+-rf/,
  /dd\s+if=/,
  /mkfs/,
  /chmod\s+777/,
  /sudo/,
  /nc\s+-l/,
  /sqlite3.*DROP/
];

function validateHookSafety(hookScript) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(hookScript)) {
      throw new Error(`Dangerous command detected: ${pattern}`);
    }
  }
}
```

### 4. Resource Limits

**Enforcement**:
- **CPU**: Max 50% of single core
- **Memory**: Max 512MB per hook
- **Disk I/O**: Max 100MB/s
- **Timeout**: Hard kill after 5 seconds

**Implementation**:
```bash
# Hooks executed with resource limits
ulimit -t 5        # CPU time: 5 seconds
ulimit -m 524288   # Memory: 512MB
ulimit -f 102400   # File size: 100MB
timeout 5s bash -c "<hook_script>"
```

---

## Migration Guide

### From Manual State Management

**Before** (manual state saving):
```javascript
// Agent code
await redis.set(`agent:${agentId}:state`, JSON.stringify(state));
await redis.publish('agent:blocked', agentId);
```

**After** (lifecycle hooks):
```yaml
hooks:
  on_blocking_start: |
    /sqlite-memory store --key "agent:${AGENT_ID}:state" --data '...'
    /eventbus publish --type agent.blocked --data '{"agent":"${AGENT_ID}"}'
```

### From Event Listeners

**Before** (event listeners):
```javascript
eventBus.on('coordinator:signal', async (data) => {
  const state = await redis.get(`agent:${agentId}:state`);
  resumeWork(JSON.parse(state));
});
```

**After** (lifecycle hooks):
```yaml
hooks:
  on_signal_received: |
    STATE=$(/sqlite-memory retrieve --key "agent:${AGENT_ID}:state")
    echo "Resuming work with state: $STATE"
```

---

## Related Documentation

- **[Blocking Coordinator Example](./.claude/agents/examples/blocking-coordinator-example.md)** - Complete example agent
- **[Hook Validation](../scripts/validate-agent-hooks.js)** - Automated hook testing
- **[SQLite Memory Management](./operations/sqlite-memory.md)** - Memory persistence
- **[Event Bus Coordination](./architecture/event-bus.md)** - Event publishing
- **[Agent Profile Structure](../wiki/Agent-Profiles.md)** - Profile frontmatter

---

**Version:** 1.0.0
**Last Updated:** 2025-10-10
**Sprint:** 2.2 - Agent Lifecycle Hooks
**Maintained By:** CFN Loop Team
