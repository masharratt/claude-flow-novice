---
name: blocking-coordinator-example
description: |
  Example agent profile demonstrating blocking coordination lifecycle hooks.
  Use this as a reference for implementing custom blocking behavior in agent profiles.
  Keywords - blocking, coordination, lifecycle, hooks, example
tools: [Read, Write, Edit, Bash, TodoWrite]
model: sonnet
provider: zai
color: purple
hooks:
  on_blocking_start: |
    echo "🔒 Agent ${AGENT_ID} entering blocking coordination (swarm: ${SWARM_ID}, iteration: ${ITERATION})"
    /sqlite-memory store --key "agent:${AGENT_ID}:blocking:context" \
      --level agent \
      --data '{"status":"blocked","timestamp":"'$(date +%s)'","task":"${TASK}","phase":"${PHASE}","swarm":"${SWARM_ID}","iteration":"${ITERATION}"}' || true

  on_signal_received: |
    echo "✅ Agent ${AGENT_ID} received signal, resuming work"
    CONTEXT=$(/sqlite-memory retrieve --key "agent:${AGENT_ID}:blocking:context" --level agent || echo '{}')
    echo "Resuming from context: ${CONTEXT}"
    /sqlite-memory store --key "agent:${AGENT_ID}:blocking:resumed" \
      --level agent \
      --data '{"status":"resumed","timestamp":"'$(date +%s)'","context":'"${CONTEXT}"'}' || true

  on_blocking_timeout: |
    echo "⏰ Agent ${AGENT_ID} blocking timeout - escalating"
    /sqlite-memory store --key "agent:${AGENT_ID}:timeout" \
      --level agent \
      --data '{"status":"timeout","timestamp":"'$(date +%s)'","action":"escalate","iteration":"${ITERATION}"}' || true
    /eventbus publish --type agent.timeout \
      --data '{"agent":"${AGENT_ID}","iteration":"${ITERATION}","phase":"${PHASE}"}' \
      --priority 9 || true
---

# Blocking Coordinator Example Agent

This agent profile demonstrates how to implement blocking coordination lifecycle hooks.
Use this as a template for creating agents that need custom blocking behavior.

## Overview

Lifecycle hooks allow agents to execute custom logic at critical coordination points:

1. **on_blocking_start**: Executed when agent enters blocking state
2. **on_signal_received**: Executed when agent receives signal to resume
3. **on_blocking_timeout**: Executed when blocking operation times out

## Hook Environment Variables

Each hook has access to these environment variables:

- `AGENT_ID` - Unique agent identifier
- `TASK` - Current task description
- `SWARM_ID` - Swarm identifier
- `ITERATION` - Current iteration number
- `PHASE` - Current phase name
- `BLOCKING_TYPE` - Type of blocking (consensus, validation, dependency, etc.)
- `TIMEOUT_THRESHOLD` - Configured timeout threshold (ms)

## Hook Implementations

### on_blocking_start Hook

**Purpose**: Save agent state before blocking coordination begins.

**Example Use Cases**:
- **Coder Agent**: Save code context, open files, cursor position
- **Reviewer Agent**: Checkpoint current review state, feedback buffer
- **Tester Agent**: Pause test execution, save test queue

**Implementation**:
```bash
# Save blocking context to SQLite memory
/sqlite-memory store \
  --key "agent:${AGENT_ID}:blocking:context" \
  --level agent \
  --data '{"status":"blocked","timestamp":"'$(date +%s)'","task":"${TASK}"}'

# Publish blocking event to event bus
/eventbus publish \
  --type agent.blocking.start \
  --data '{"agent":"${AGENT_ID}","phase":"${PHASE}"}' \
  --priority 8
```

### on_signal_received Hook

**Purpose**: Restore agent state when blocking coordination completes.

**Example Use Cases**:
- **Coder Agent**: Restore code context, resume editing
- **Reviewer Agent**: Load review checkpoint, continue feedback
- **Tester Agent**: Resume test execution from saved queue

**Implementation**:
```bash
# Retrieve blocking context
CONTEXT=$(/sqlite-memory retrieve \
  --key "agent:${AGENT_ID}:blocking:context" \
  --level agent)

# Restore state and resume work
echo "Resuming from context: $CONTEXT"

# Publish resume event
/eventbus publish \
  --type agent.blocking.resume \
  --data '{"agent":"${AGENT_ID}","context":'"$CONTEXT"'}' \
  --priority 8
```

### on_blocking_timeout Hook

**Purpose**: Handle timeout scenarios gracefully.

**Example Use Cases**:
- **Coder Agent**: Save partial work, escalate to coordinator
- **Reviewer Agent**: Submit partial review, request extension
- **Tester Agent**: Report timeout, save test state for retry

**Implementation**:
```bash
# Store timeout event
/sqlite-memory store \
  --key "agent:${AGENT_ID}:timeout" \
  --level agent \
  --data '{"status":"timeout","timestamp":"'$(date +%s)'","action":"escalate"}'

# Publish timeout event for coordinator escalation
/eventbus publish \
  --type agent.timeout \
  --data '{"agent":"${AGENT_ID}","iteration":"${ITERATION}"}' \
  --priority 9
```

## Agent Type Examples

### Coder Agent Hook

```yaml
hooks:
  on_blocking_start: |
    # Save code editing context
    /sqlite-memory store --key "coder:${AGENT_ID}:context" --level agent \
      --data '{"files":["'$(echo $OPEN_FILES)'"],"cursor":"'$(echo $CURSOR_POS)'"}'

  on_signal_received: |
    # Restore code context
    CONTEXT=$(/sqlite-memory retrieve --key "coder:${AGENT_ID}:context" --level agent)
    echo "Restoring code context: $CONTEXT"

  on_blocking_timeout: |
    # Save partial work
    git stash save "WIP: Agent ${AGENT_ID} timeout at iteration ${ITERATION}"
    /eventbus publish --type coder.timeout \
      --data '{"agent":"${AGENT_ID}","stash":"latest"}' --priority 9
```

### Reviewer Agent Hook

```yaml
hooks:
  on_blocking_start: |
    # Checkpoint review state
    /sqlite-memory store --key "reviewer:${AGENT_ID}:checkpoint" --level agent \
      --data '{"reviewed_files":'"$(cat /tmp/reviewed_files.json)"',"feedback":'"$(cat /tmp/feedback.json)"'}'

  on_signal_received: |
    # Load checkpoint and continue
    CHECKPOINT=$(/sqlite-memory retrieve --key "reviewer:${AGENT_ID}:checkpoint" --level agent)
    echo "$CHECKPOINT" | jq -r '.reviewed_files' > /tmp/reviewed_files.json
    echo "$CHECKPOINT" | jq -r '.feedback' > /tmp/feedback.json

  on_blocking_timeout: |
    # Submit partial review
    /sqlite-memory store --key "reviewer:${AGENT_ID}:partial_review" --level swarm \
      --data '{"status":"partial","files_reviewed":"'$(wc -l < /tmp/reviewed_files.json)'"}'
```

### Tester Agent Hook

```yaml
hooks:
  on_blocking_start: |
    # Pause test execution
    pkill -STOP -f "vitest.*${AGENT_ID}"
    /sqlite-memory store --key "tester:${AGENT_ID}:test_queue" --level agent \
      --data '{"paused_at":"'$(date +%s)'","queue":'"$(cat /tmp/test_queue.json)"'}'

  on_signal_received: |
    # Resume test execution
    pkill -CONT -f "vitest.*${AGENT_ID}"
    TEST_QUEUE=$(/sqlite-memory retrieve --key "tester:${AGENT_ID}:test_queue" --level agent)
    echo "Resuming tests from: $TEST_QUEUE"

  on_blocking_timeout: |
    # Kill hanging tests and report
    pkill -KILL -f "vitest.*${AGENT_ID}"
    /sqlite-memory store --key "tester:${AGENT_ID}:timeout_report" --level swarm \
      --data '{"status":"timeout","tests_completed":"'$(cat /tmp/test_results.json | jq '.total')'","action":"retry"}'
```

## Hook Execution Flow

```
Agent starts task
      ↓
Enters blocking coordination
      ↓
on_blocking_start hook executes
      ↓
Agent waits for signal
      ↓
  ┌───┴────┐
  │        │
Signal   Timeout
Received   Reached
  │        │
  ↓        ↓
on_signal  on_blocking_timeout
_received  hook executes
hook       ↓
executes   Escalate or retry
  ↓
Resume work
  ↓
Complete task
```

## Hook Best Practices

### 1. Keep Hooks Fast
- **Target**: < 5 seconds execution time
- **Why**: Hooks block coordination flow
- **How**: Use async operations, avoid heavy computation

### 2. Handle Errors Gracefully
- **Exit code 0**: Hook success
- **Exit code non-zero**: Hook failure (logged, doesn't block)
- **Always include error handling**: `|| true` for non-critical commands

### 3. Use SQLite Memory for State
- **Level `agent`**: Private to single agent
- **Level `swarm`**: Shared across swarm
- **Level `project`**: Persistent across swarms
- **Include TTL**: Auto-cleanup with `--ttl 3600`

### 4. Publish Events for Coordination
- **Priority 9**: Critical timeouts, escalations
- **Priority 8**: Lifecycle events (start, resume)
- **Priority 7**: Status updates, metrics
- **Use structured data**: JSON for event payloads

### 5. Sanitize User Input
- **Never use raw variables in commands**: `"${AGENT_ID}"` not `$AGENT_ID`
- **Validate paths**: Check file existence before operations
- **Escape special characters**: Use proper quoting

### 6. Log Hook Execution
- **Always echo status**: `echo "🔒 Agent entering blocking"`
- **Include context**: Agent ID, iteration, phase
- **Use emojis for visibility**: 🔒 blocking, ✅ resume, ⏰ timeout

## Testing Hooks

### Manual Testing

```bash
# Test on_blocking_start hook
export AGENT_ID="test-agent-1"
export TASK="Test blocking coordination"
export PHASE="testing"
export ITERATION="1"
bash -c '<hook_script_here>'

# Verify state saved
/sqlite-memory retrieve --key "agent:test-agent-1:blocking:context" --level agent

# Test on_signal_received hook
bash -c '<hook_script_here>'

# Verify state restored
cat /tmp/restored_context.json
```

### Automated Testing

See `scripts/validate-agent-hooks.js` for hook validation:

```bash
# Validate all agent profiles
node scripts/validate-agent-hooks.js --all

# Validate specific profile
node scripts/validate-agent-hooks.js .claude/agents/examples/blocking-coordinator-example.md
```

## Debugging Hooks

### Enable Debug Logging

```bash
export CLAUDE_FLOW_DEBUG_HOOKS=1
```

### Hook Execution Logs

Hooks log to:
- **stdout**: Captured in agent logs
- **stderr**: Captured in error logs
- **SQLite memory**: `hook:${AGENT_ID}:execution`

### Common Issues

**Hook not executing:**
- Check YAML syntax in frontmatter
- Verify hook name (must be exact: `on_blocking_start`)
- Check file permissions (hooks must be readable)

**Hook timing out:**
- Reduce execution time (< 5 seconds)
- Use background jobs for long operations: `command & disown`
- Check for hanging processes: `pkill -f <process>`

**State not persisted:**
- Verify SQLite memory level (agent/swarm/project)
- Check key naming: `agent:${AGENT_ID}:*`
- Ensure data is valid JSON

## Security Considerations

### 1. Input Validation
- **Always quote variables**: `"${AGENT_ID}"`
- **Sanitize IDs**: No special characters in agent IDs
- **Validate paths**: Check existence before file operations

### 2. Privilege Isolation
- **Hooks run with agent privileges**: Not root
- **File access**: Limited to agent workspace
- **Network access**: Restricted to event bus and memory store

### 3. Dangerous Commands
- **Forbidden**: `rm -rf`, `dd`, `mkfs`, destructive operations
- **Restricted**: Direct database access, system configuration
- **Allowed**: Memory operations, event publishing, file I/O in workspace

## Related Documentation

- **[Agent Lifecycle Hooks](../../docs/agent-lifecycle-hooks.md)** - Complete hook documentation
- **[SQLite Memory Management](../../docs/operations/sqlite-memory.md)** - Memory persistence
- **[Event Bus Coordination](../../docs/architecture/event-bus.md)** - Event publishing
- **[Hook Validation](../../scripts/validate-agent-hooks.js)** - Hook testing

---

**Version:** 1.0.0
**Last Updated:** 2025-10-10
**Sprint:** 2.2 - Agent Lifecycle Hooks
