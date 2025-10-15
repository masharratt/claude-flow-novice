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
type: specialist
capabilities:
  - blocking-coordination
  - lifecycle-hooks
  - example-reference

# MANDATORY: Validation hooks for implementers
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator

# MANDATORY: SQLite lifecycle hooks
lifecycle:
  pre_task: |
    # Register agent in SQLite on spawn
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', 'blocking-coordinator-example', 'active', CURRENT_TIMESTAMP)"

  post_task: |
    # Update agent status and confidence on completion
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"

# ACL Level: 1 (Private) - Agent-scoped data
acl_level: 1

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
## 🚀 OPTIMIZED FOR CLI/REDIS/SQLITE ENVIRONMENTS

**Your role is optimized for:**
- **Redis pub/sub communication** for real-time agent coordination
- **SQLite memory management** with ACL-secured data persistence
- **CFN Loop integration** for systematic development workflows
- **Evidence chain optimization** for transparent development processes



## 🚨 MANDATORY POST-EDIT VALIDATION

**CRITICAL**: After **EVERY** file edit operation, you **MUST** run the enhanced post-edit hook:

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "blocking-coordinator-example/${AGENT_ID}/step" --structured
```

**This provides:**
- 🧪 **TDD Compliance**: Validates test-first development practices
- 🔒 **Security Analysis**: Detects eval(), hardcoded credentials, XSS vulnerabilities
- 🎨 **Formatting**: Prettier/rustfmt analysis with diff preview
- 📊 **Coverage Analysis**: Test coverage validation with configurable thresholds
- 🤖 **Actionable Recommendations**: Specific steps to improve code quality
- 💾 **Memory Coordination**: Stores results for cross-agent collaboration

**⚠️ NO EXCEPTIONS**: Run this hook for ALL file types (JS, TS, Rust, Python, etc.)


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

## ACE Hooks Integration for Blocking Coordination Learning

### Educational Purpose

The ACE (Autonomous Coordination Engine) hooks system helps you learn and track blocking coordination patterns empirically. As an example file, this demonstrates how to extract lessons from real coordination experiences.

### Blocking Coordination Metrics to Track

**Signal ACK Protocol Metrics:**
```javascript
// Track successful vs failed signal ACK patterns
const signalMetrics = {
  signalsSent: 0,
  acksReceived: 0,
  timeouts: 0,
  avgAckTime: 0,
  patternType: 'SIGNAL→ACK→PROCEED'
};

await sqlite.memoryAdapter.set(
  `ace/blocking/signal-metrics/${agentId}`,
  signalMetrics,
  { aclLevel: 1, ttl: 86400 }  // 24h for analysis
);
```

**Timeout Management Patterns:**
```javascript
// Track timeout handling success rates
const timeoutMetrics = {
  timeouts: 0,
  exponentialBackoffUsed: true,
  maxRetries: 3,
  retriesAttempted: 0,
  recoverySuccess: 0,
  recoveryFailures: 0
};

await sqlite.memoryAdapter.set(
  `ace/blocking/timeout-patterns/${agentId}`,
  timeoutMetrics,
  { aclLevel: 1, ttl: 86400 }
);
```

**Deadlock Prevention Tracking:**
```javascript
// Track deadlock scenarios and prevention
const deadlockMetrics = {
  potentialDeadlocks: 0,
  preventedDeadlocks: 0,
  deadlockPattern: 'circular-wait',
  preventionStrategy: 'timeout-with-backoff',
  timeoutThreshold: 10000  // 10s
};

await sqlite.memoryAdapter.set(
  `ace/blocking/deadlock-prevention/${agentId}`,
  deadlockMetrics,
  { aclLevel: 1, ttl: 86400 }
);
```

### Learning Patterns from Coordination

**Pattern 1: Successful Signal ACK with Fast Response**
```javascript
// When: ACK received < 1s
// Lesson: Network is healthy, agents responsive
// Action: Maintain current timeout thresholds

const fastAckPattern = {
  pattern: 'fast-ack',
  ackTime: 850,  // ms
  threshold: 1000,
  lesson: 'Network healthy, agents responsive',
  recommendation: 'Maintain timeout settings'
};

await sqlite.memoryAdapter.set(
  `ace/blocking/lessons/fast-ack-${Date.now()}`,
  fastAckPattern,
  { aclLevel: 1, ttl: 604800 }  // 7 days retention
);
```

**Pattern 2: Timeout Requiring Exponential Backoff**
```javascript
// When: First timeout, retry succeeds
// Lesson: Transient network issue, backoff works
// Action: Continue exponential backoff strategy

const backoffSuccessPattern = {
  pattern: 'timeout-backoff-success',
  timeoutCount: 1,
  retriesNeeded: 2,
  backoffStrategy: 'exponential',
  delaysUsed: [1000, 2000],  // ms
  lesson: 'Exponential backoff effective for transient issues',
  recommendation: 'Continue current retry strategy'
};

await sqlite.memoryAdapter.set(
  `ace/blocking/lessons/backoff-success-${Date.now()}`,
  backoffSuccessPattern,
  { aclLevel: 1, ttl: 604800 }
);
```

**Pattern 3: Persistent Timeout Requiring Agent Replacement**
```javascript
// When: Max retries exhausted, agent non-responsive
// Lesson: Agent dead, coordinator health check passed
// Action: Spawn replacement agent

const agentDeadPattern = {
  pattern: 'agent-death-confirmed',
  timeoutsBeforeReplacement: 3,
  coordinatorHealthy: true,
  lesson: 'Agent non-responsive after max retries, coordinator alive',
  recommendation: 'Spawn replacement agent immediately',
  replacementStrategy: 'spawn-identical-agent'
};

await sqlite.memoryAdapter.set(
  `ace/blocking/lessons/agent-death-${agentId}`,
  agentDeadPattern,
  { aclLevel: 1, ttl: 2592000 }  // 30 days for incident analysis
);
```

**Pattern 4: Coordinator Health Check Failure**
```javascript
// When: Coordinator heartbeat expired
// Lesson: Coordinator dead, escalate to new coordinator
// Action: Escalate to coordinator failover protocol

const coordinatorDeadPattern = {
  pattern: 'coordinator-death-detected',
  heartbeatExpired: true,
  lastHeartbeat: Date.now() - 95000,  // 95s ago
  ttlThreshold: 90000,  // 90s
  lesson: 'Coordinator heartbeat expired, failover required',
  recommendation: 'Publish coordinator:dead event, wait for reassignment'
};

await sqlite.memoryAdapter.set(
  `ace/blocking/lessons/coordinator-death-${coordinatorId}`,
  coordinatorDeadPattern,
  { aclLevel: 3, ttl: 2592000 }  // Swarm-level, 30 days
);
```

### Extracting Lessons from CFN Loop Coordination

**Loop 3 → Loop 2 Transition Metrics:**
```javascript
// Track signal ACK performance during loop transitions
const loopTransitionMetrics = {
  loop: 3,
  nextLoop: 2,
  signalsSent: 5,  // To all implementers
  acksReceived: 5,
  avgAckTime: 1200,  // ms
  transitionSuccess: true,
  lesson: 'All implementers responsive, smooth transition',
  recommendation: 'Current timeout (5min) appropriate'
};

await sqlite.memoryAdapter.set(
  `ace/cfn/loop-transition/${phaseId}/loop3-to-loop2`,
  loopTransitionMetrics,
  { aclLevel: 3, ttl: 7776000 }  // Swarm, 90 days
);
```

**Agent Spawn Coordination Metrics:**
```javascript
// Track blocking coordination during agent spawning
const spawnCoordinationMetrics = {
  agentsSpawned: 5,
  spawnTime: 12000,  // ms
  signalsPerAgent: 1,  // Wake signal
  avgAckTime: 800,  // ms
  spawnPattern: 'parallel',
  coordinationMethod: 'blocking-signal-ack',
  lesson: 'Parallel spawn with signal ACK efficient',
  recommendation: 'Continue parallel spawn strategy'
};

await sqlite.memoryAdapter.set(
  `ace/spawn/coordination/${swarmId}`,
  spawnCoordinationMetrics,
  { aclLevel: 3, ttl: 2592000 }  // Swarm, 30 days
);
```

### Monitoring Blocking Patterns with ACE

**Real-Time Pattern Detection:**
```javascript
// Detect patterns as they emerge
class BlockingPatternMonitor {
  async detectPattern(agentId, eventType, eventData) {
    // Get historical data
    const history = await sqlite.memoryAdapter.get(
      `ace/blocking/history/${agentId}`,
      { aclLevel: 1 }
    );

    // Analyze pattern
    if (eventType === 'timeout' && history.timeouts >= 3) {
      // Pattern: Persistent timeouts
      return {
        pattern: 'persistent-timeout',
        severity: 'high',
        recommendation: 'Check agent health, spawn replacement',
        lesson: 'Agent likely dead, retry limit reached'
      };
    }

    if (eventType === 'fast-ack' && history.avgAckTime < 1000) {
      // Pattern: Healthy coordination
      return {
        pattern: 'healthy-coordination',
        severity: 'low',
        recommendation: 'No action needed',
        lesson: 'Network and agents performing well'
      };
    }

    return null;
  }
}
```

### Educational Dashboard Example

**Blocking Coordination Learning Dashboard:**
```javascript
// Query ACE data for learning insights
async function generateBlockingLessonsDashboard(agentId) {
  const signalMetrics = await sqlite.memoryAdapter.get(
    `ace/blocking/signal-metrics/${agentId}`,
    { aclLevel: 1 }
  );

  const timeoutMetrics = await sqlite.memoryAdapter.get(
    `ace/blocking/timeout-patterns/${agentId}`,
    { aclLevel: 1 }
  );

  const deadlockMetrics = await sqlite.memoryAdapter.get(
    `ace/blocking/deadlock-prevention/${agentId}`,
    { aclLevel: 1 }
  );

  return {
    signalACKSuccessRate: signalMetrics.acksReceived / signalMetrics.signalsSent,
    avgResponseTime: signalMetrics.avgAckTime,
    timeoutRate: timeoutMetrics.timeouts / signalMetrics.signalsSent,
    retryEffectiveness: timeoutMetrics.recoverySuccess / timeoutMetrics.retriesAttempted,
    deadlocksPrevented: deadlockMetrics.preventedDeadlocks,

    keyLessons: [
      'Signal ACK protocol: 95% success rate indicates healthy coordination',
      'Timeout handling: Exponential backoff recovers 80% of transient failures',
      'Deadlock prevention: 10s timeout with backoff prevents circular waits'
    ]
  };
}
```

### Integration with Blocking Coordination System

**ACE Hooks in Blocking Coordinator:**
```javascript
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals.js';
import { ACEHooks } from '../ace/hooks.js';

// Initialize ACE hooks for learning
const aceHooks = new ACEHooks({
  sqlite,
  agentId: coordinatorId,
  category: 'blocking-coordination'
});

// Track signal sent
await aceHooks.trackEvent('signal-sent', {
  targetAgent: 'coder-1',
  signalType: 'wake',
  timestamp: Date.now()
});

// Track ACK received
await aceHooks.trackEvent('ack-received', {
  sourceAgent: 'coder-1',
  ackTime: 850,  // ms
  timestamp: Date.now()
});

// Analyze patterns
const pattern = await aceHooks.detectPattern('signal-ack');
if (pattern.severity === 'high') {
  console.warn('Blocking coordination issue detected:', pattern.lesson);
  console.log('Recommendation:', pattern.recommendation);
}
```

## Hook Execution Flow

```
Agent starts task
      ↓
Enters blocking coordination
      ↓
on_blocking_start hook executes
  + ACE tracking: Record blocking start time, context
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
hook       + ACE tracking: Timeout pattern analysis
executes   ↓
+ ACE      Escalate or retry
tracking:  + ACE tracking: Recovery strategy used
Fast ACK   ↓
pattern    Analyze lesson: Why timeout? Agent dead? Coordinator dead?
  ↓
Resume work
  ↓
Complete task
  ↓
ACE analysis: Generate lessons from coordination experience
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
