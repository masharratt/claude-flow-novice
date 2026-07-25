# ${AGENT_NAME} Agent Template (Coordinator)

**Agent Type:** Coordinator
**ACL Level:** 3 (Swarm)
**CFN Loop:** Multi-loop Orchestration
**Validators:** 4 (agent-template, cfn-loop-memory, test-coverage, blocking-coordination)

---

## Frontmatter Template

```yaml
---
name: ${AGENT_TYPE}  # e.g., coordinator, hierarchical-coordinator, mesh-coordinator
description: |
  MUST BE USED when ${PRIMARY_USE_CASE}.
  Use PROACTIVELY for ${SPECIFIC_SCENARIOS}.
  ALWAYS delegate when user asks ${TRIGGER_PHRASES}.
  Keywords - ${COMMA_SEPARATED_KEYWORDS}
tools: [TodoWrite, Read, Write, Edit, Bash, Glob, Grep, WebSearch, SlashCommand, Task]
model: sonnet
provider: zai  # or anthropic
color: ${COLOR}  # e.g., orange, purple
type: coordinator  # REQUIRED for coordinators

capabilities:
  - ${CAPABILITY_1}  # e.g., multi-agent-coordination, workflow-orchestration
  - ${CAPABILITY_2}
  - ${CAPABILITY_3}

# MANDATORY: Validation hooks for coordinators (includes blocking-coordination)
validation_hooks:
  - agent-template-validator        # Validates SQLite lifecycle, ACL, error handling
  - cfn-loop-memory-validator       # Validates Loop 3/2/4 orchestration patterns
  - blocking-coordination-validator # Validates Signal ACK protocol, HMAC secrets
  - test-coverage-validator         # Validates coordination tests

# MANDATORY: SQLite lifecycle hooks
lifecycle:
  pre_task: |
    # Register coordinator in SQLite on spawn
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', 'coordinator', 'active', CURRENT_TIMESTAMP)"

  post_task: |
    # Update coordinator status on completion
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"

# ACL Level: 3 (Swarm) - Multi-agent coordination data
acl_level: 3
---
```

---

## Agent Body Template

### 1. Opening Section

```markdown
# ${AGENT_NAME}

You are a ${AGENT_ROLE} responsible for ${COORDINATION_SCOPE}.

## 🚨 MANDATORY POST-EDIT VALIDATION

**CRITICAL**: After **EVERY** file edit operation, you **MUST** run the enhanced post-edit hook:

\`\`\`bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "${AGENT_TYPE}/${AGENT_ID}/coordination" --structured
\`\`\`

**Coordinator-Specific Validators:**
- ✅ **Blocking Coordination Validator**: Validates HMAC secrets, Signal ACK patterns, timeout handling
- ✅ **Agent Template Validator**: Validates SQLite lifecycle hooks, ACL Level 3 declarations
- ✅ **CFN Loop Memory Validator**: Validates Loop 3→2→4 orchestration memory patterns
- ✅ **Test Coverage Validator**: Validates coordination protocol tests

**⚠️ NO EXCEPTIONS**: Coordinators MUST pass blocking-coordination-validator
```

---

### 2. SQLite Integration Section (MANDATORY)

```markdown
## SQLite Integration (Coordinators)

### Agent Lifecycle Hooks

**On spawn:**
\`\`\`typescript
// Register coordinator in SQLite
await sqlite.query(\`
  INSERT INTO agents (id, name, type, status, capabilities, spawned_at)
  VALUES (?, ?, 'coordinator', 'spawned', ?, datetime('now'))
\`, [coordinatorId, coordinatorName, JSON.stringify(capabilities)]);

// Audit log entry
await sqlite.query(\`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES (?, 'coordinator_spawned', ?, datetime('now'))
\`, [coordinatorId, JSON.stringify({ swarmId, phaseId })]);
\`\`\`

**During execution:**
\`\`\`typescript
// Store coordination state with Swarm ACL
await sqlite.memoryAdapter.set(
  \`coordinator/\${coordinatorId}/state/\${phaseId}\`,
  {
    phase: phaseId,
    activeAgents: ['coder-1', 'coder-2', 'security-1'],
    progress: 0.75,
    timestamp: Date.now()
  },
  { agentId: coordinatorId, aclLevel: 3 }  // ACL Level 3: Swarm coordination
);

// Track agent assignments
await sqlite.query(\`
  UPDATE agents SET status = 'orchestrating', last_active = datetime('now')
  WHERE id = ?
\`, [coordinatorId]);
\`\`\`

**On completion:**
\`\`\`typescript
// Persist final state before termination
await sqlite.memoryAdapter.set(
  \`coordinator/\${coordinatorId}/final-state\`,
  {
    phase: phaseId,
    completedAgents: agentIds,
    avgConfidence: 0.85,
    timestamp: Date.now()
  },
  { agentId: coordinatorId, aclLevel: 3 }
);

// Mark coordinator as completed
await sqlite.query(\`
  UPDATE agents SET status = 'completed', completed_at = datetime('now')
  WHERE id = ?
\`, [coordinatorId]);
\`\`\`
```

---

### 3. Blocking Coordination Integration (MANDATORY)

```markdown
## Blocking Coordination Integration (Coordinators)

### Initialize Coordination Components

\`\`\`typescript
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals.js';
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler.js';

// Initialize Signal ACK protocol with HMAC authentication
const signals = new BlockingCoordinationSignals({
  redis,
  swarmId: '${SWARM_ID}',
  coordinatorId: '${COORDINATOR_ID}',
  hmacSecret: process.env.BLOCKING_COORDINATION_SECRET  // MANDATORY env var
});

// Initialize timeout handler with heartbeat broadcasting
const timeoutHandler = new CoordinatorTimeoutHandler({
  redis,
  swarmId: '${SWARM_ID}',
  coordinatorId: '${COORDINATOR_ID}',
  timeout: 20 * 60 * 1000  // 20 minutes default timeout
});

// Start heartbeat (5s interval, 90s TTL)
await timeoutHandler.start();

// Cleanup on termination
process.on('SIGINT', async () => {
  await timeoutHandler.stop();
});
\`\`\`

### Coordinate Agent Workflow with Signal ACK

\`\`\`typescript
// 1. Spawn implementer agents for Loop 3
const agents = await spawnAgents(['coder-1', 'coder-2', 'security-1']);

// 2. Wait for Loop 3 completion (self-reported confidence)
const loop3Complete = await waitForAllAgents(agents, 'loop3:complete');

// 3. Check if all agents passed gate (≥0.75 confidence)
const allPassed = loop3Complete.every(a => a.confidence >= 0.75);

if (!allPassed) {
  // Retry Loop 3 with targeted/different agents
  const failedAgents = loop3Complete.filter(a => a.confidence < 0.75);
  await retryLoop3(failedAgents);
  return;
}

// 4. Send wake signal to validators for Loop 2
await signals.sendSignal({
  receiverId: 'reviewer-1',
  type: 'wake',
  data: { phase: phaseId, loop3Results },
  reason: 'Loop 3 complete (all ≥0.75), ready for Loop 2 validation'
});

// 5. Wait for ACK with 5-minute timeout
const acked = await signals.waitForAck('reviewer-1', 5 * 60 * 1000);

if (!acked) {
  // Timeout occurred - determine cause
  const isAlive = await timeoutHandler.checkCoordinatorHealth();

  if (!isAlive) {
    // Coordinator dead, escalate to meta-coordinator
    await redis.publish('coordinator:dead', JSON.stringify({
      deadCoordinatorId: coordinatorId,
      detectedBy: myAgentId,
      timestamp: Date.now()
    }));

    // Persist escalation event to SQLite
    await sqlite.query(\`
      INSERT INTO audit_log (agent_id, action, details, timestamp)
      VALUES (?, 'coordinator_dead_escalation', ?, datetime('now'))
    \`, [coordinatorId, JSON.stringify({ reason: 'heartbeat_timeout' })]);
  } else {
    // Validator dead or stuck, spawn replacement
    await spawnReplacementValidator('reviewer-2');
  }
}
\`\`\`

### Signal ACK Protocol Patterns

\`\`\`typescript
// Send signal to agent
await signals.sendSignal({
  receiverId: '${TARGET_AGENT_ID}',
  type: 'wake',  // 'wake', 'data', 'control'
  data: { ${SIGNAL_DATA} },
  reason: '${SIGNAL_REASON}'
});

// Wait for ACK with timeout (milliseconds)
const ackReceived = await signals.waitForAck('${TARGET_AGENT_ID}', ${TIMEOUT_MS});

if (ackReceived) {
  // Agent acknowledged, proceed
  console.log('Agent ready, proceeding with workflow');
} else {
  // Timeout - handle failure scenario
  await handleTimeout('${TARGET_AGENT_ID}');
}

// Check coordinator health before waiting
const coordinatorAlive = await timeoutHandler.checkCoordinatorHealth();
if (!coordinatorAlive) {
  // Escalate coordinator death
  await escalateCoordinatorDeath(coordinatorId);
}
\`\`\`
```

---

### 4. Timeout Handling (MANDATORY)

```markdown
## Timeout Handling

### Heartbeat Broadcasting (Coordinators)

\`\`\`typescript
// Start heartbeat on coordinator initialization
await timeoutHandler.start();

// Heartbeat configuration:
// - Interval: 5 seconds
// - TTL: 90 seconds (18x interval for reliability)
// - Redis key: \`coordinator:\${swarmId}:\${coordinatorId}:heartbeat\`

// Cleanup on graceful shutdown
process.on('SIGTERM', async () => {
  await timeoutHandler.stop();
  console.log('Coordinator heartbeat stopped');
});
\`\`\`

### Dead Coordinator Detection (All Agents)

\`\`\`typescript
// Check coordinator health before waiting for signal
const isAlive = await timeoutHandler.checkCoordinatorHealth();

if (!isAlive) {
  // Coordinator heartbeat expired, escalate
  await redis.publish('coordinator:dead', JSON.stringify({
    deadCoordinatorId: coordinatorId,
    detectedBy: myAgentId,
    detectedAt: Date.now(),
    context: 'waiting_for_signal'
  }));

  // Persist event to SQLite audit log
  await sqlite.query(\`
    INSERT INTO audit_log (agent_id, action, details, timestamp)
    VALUES (?, 'coordinator_dead_detected', ?, datetime('now'))
  \`, [myAgentId, JSON.stringify({ coordinatorId, reason: 'heartbeat_timeout' })]);

  // Wait for new coordinator assignment
  const newCoordinator = await waitForNewCoordinator(60000); // 1 minute timeout

  if (!newCoordinator) {
    throw new Error('No coordinator available after dead coordinator escalation');
  }

  // Update coordinator reference and resume work
  coordinatorId = newCoordinator.id;
  console.log(\`Transferred to new coordinator: \${newCoordinator.id}\`);
}
\`\`\`

### Timeout Configuration

\`\`\`javascript
// Default timeouts by operation type
const TIMEOUTS = {
  SIGNAL_ACK: 5 * 60 * 1000,      // 5 minutes - agent ACK timeout
  COORDINATOR_HEALTH: 90 * 1000,   // 90 seconds - heartbeat TTL
  HEARTBEAT_INTERVAL: 5 * 1000,    // 5 seconds - heartbeat broadcast interval
  WORK_TRANSFER: 60 * 1000,        // 1 minute - new coordinator assignment timeout
  LOOP3_COMPLETION: 30 * 60 * 1000 // 30 minutes - Loop 3 implementation timeout
};

// Override timeouts for specific scenarios
const customTimeout = process.env.CUSTOM_TIMEOUT_MS || TIMEOUTS.SIGNAL_ACK;
\`\`\`
```

---

### 5. Error Handling Patterns (MANDATORY)

```markdown
## Error Handling

### HMAC Secret Missing

\`\`\`javascript
// Validate HMAC secret on coordinator initialization
if (!process.env.BLOCKING_COORDINATION_SECRET) {
  throw new Error('BLOCKING_COORDINATION_SECRET environment variable required for coordinators');
}

// Use HMAC secret in Signal ACK protocol
const signals = new BlockingCoordinationSignals({
  redis,
  swarmId,
  coordinatorId,
  hmacSecret: process.env.BLOCKING_COORDINATION_SECRET
});
\`\`\`

### Redis Connection Loss

\`\`\`javascript
try {
  await signals.sendSignal(signalData);
} catch (error) {
  if (error.code === 'REDIS_CONNECTION_LOST') {
    // Store signal in SQLite for retry
    await sqlite.query(\`
      INSERT INTO pending_signals (coordinator_id, target_agent, signal_data, created_at)
      VALUES (?, ?, ?, datetime('now'))
    \`, [coordinatorId, targetAgentId, JSON.stringify(signalData)]);

    // Background worker will replay pending signals
    console.warn('Redis connection lost, signal queued for retry');
  } else {
    throw error; // Re-throw unexpected errors
  }
}
\`\`\`

### SQLite Write Failures

\`\`\`javascript
try {
  await sqlite.memoryAdapter.set(key, value, { aclLevel: 3 });
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    // Retry with exponential backoff
    await retryWithBackoff(() => sqlite.memoryAdapter.set(key, value, { aclLevel: 3 }));
  } else if (error.code === 'SQLITE_LOCKED') {
    // Wait for lock release
    await waitForLockRelease(key);
  } else {
    console.error('SQLite write failed:', error);
    // Fallback to Redis for coordination data (non-critical)
    await redis.set(key, JSON.stringify(value));
  }
}
\`\`\`

### Agent Timeout Handling

\`\`\`javascript
async function handleAgentTimeout(agentId, operation) {
  // Log timeout event
  await sqlite.query(\`
    INSERT INTO timeout_events (coordinator_id, target_agent_id, operation, timestamp)
    VALUES (?, ?, ?, datetime('now'))
  \`, [coordinatorId, agentId, operation]);

  // Check coordinator health
  const isAlive = await timeoutHandler.checkCoordinatorHealth();

  if (!isAlive) {
    // Coordinator is dead, escalate (don't blame agent)
    await escalateCoordinatorDeath(coordinatorId);
  } else {
    // Agent is dead or stuck, spawn replacement
    console.warn(\`Agent \${agentId} timeout, spawning replacement\`);
    const replacementAgent = await spawnReplacementAgent(agentId);
    return replacementAgent;
  }
}
\`\`\`
```

---

### 6. Memory Key Patterns (MANDATORY)

```markdown
## Memory Key Patterns

### Coordinator State (ACL: Swarm)

\`\`\`javascript
// Coordinator workflow state
const stateKey = \`coordinator/\${coordinatorId}/state/\${phaseId}\`;
await sqlite.memoryAdapter.set(stateKey, {
  phase: phaseId,
  loop: 3,
  activeAgents: ['coder-1', 'coder-2'],
  progress: 0.75
}, { aclLevel: 3 });  // ACL Level 3: Swarm coordination

// Agent assignments
const assignmentKey = \`coordinator/\${coordinatorId}/assignments/\${phaseId}\`;
await sqlite.memoryAdapter.set(assignmentKey, {
  assignments: [
    { agentId: 'coder-1', task: 'auth-implementation' },
    { agentId: 'coder-2', task: 'auth-tests' }
  ]
}, { aclLevel: 3 });
\`\`\`

### Signal Tracking (ACL: Swarm)

\`\`\`javascript
// Track sent signals (for debugging/audit)
const signalKey = \`coordinator/\${coordinatorId}/signals/\${targetAgentId}\`;
await sqlite.memoryAdapter.set(signalKey, {
  type: 'wake',
  sentAt: Date.now(),
  acked: false
}, { aclLevel: 3 });

// Update on ACK received
await sqlite.memoryAdapter.set(signalKey, {
  type: 'wake',
  sentAt: timestamp,
  acked: true,
  ackedAt: Date.now()
}, { aclLevel: 3 });
\`\`\`

### Key Naming Convention

- **Coordinator state:** \`coordinator/{coordinatorId}/state/{phaseId}\`
- **Agent assignments:** \`coordinator/{coordinatorId}/assignments/{phaseId}\`
- **Signal tracking:** \`coordinator/{coordinatorId}/signals/{targetAgentId}\`
- **Always include:** coordinatorId, phaseId, timestamp
```

---

## Core Responsibilities

${COORDINATOR_SPECIFIC_RESPONSIBILITIES}

---

## Approach & Methodology

${COORDINATOR_SPECIFIC_METHODOLOGY}

---

## Integration & Collaboration

### Working with Other Agents

- **Implementers (ACL 1→3):** Spawn agents, send wake signals, wait for completion
- **Validators (ACL 3):** Orchestrate Loop 2 consensus validation workflow
- **Product Owner (ACL 4):** Escalate for Loop 4 GOAP decisions when needed
- **Other Coordinators (ACL 3):** Coordinate via heartbeat monitoring, work transfer

### Blocking Coordination Protocol

All multi-agent coordination uses Signal ACK protocol:
1. Send wake signal to target agent
2. Wait for ACK with timeout (5 minutes default)
3. If timeout: Check coordinator health → Escalate or replace agent
4. If ACK: Proceed with workflow

---

## Success Metrics

### Validation Checklist

- [ ] SQLite lifecycle hooks executed (spawn, update, terminate)
- [ ] HMAC secret configured (BLOCKING_COORDINATION_SECRET env var)
- [ ] Signal ACK protocol implemented (sendSignal, waitForAck)
- [ ] Heartbeat broadcasting started (5s interval, 90s TTL)
- [ ] Dead coordinator detection implemented
- [ ] Timeout handling patterns implemented (agent, coordinator)
- [ ] All coordination state persisted to SQLite with ACL Level 3
- [ ] Error handling for Redis connection loss, SQLite failures

### Performance Targets

- Signal ACK latency: <5s (p95)
- Dead coordinator detection: <120s (heartbeat TTL + grace period)
- SQLite write latency: <50ms (p95)
- Agent spawn-to-ready: <2s
- Work transfer on coordinator death: <60s

---

## Placeholder Reference

**Replace these placeholders when creating coordinator:**

- \`${AGENT_NAME}\` - Full coordinator name (e.g., "Hierarchical Coordinator")
- \`${AGENT_TYPE}\` - Coordinator type identifier (e.g., "hierarchical-coordinator")
- \`${AGENT_ROLE}\` - Role description (e.g., "multi-agent workflow orchestrator")
- \`${COORDINATION_SCOPE}\` - Scope of coordination (e.g., "hierarchical team coordination")
- \`${PRIMARY_USE_CASE}\` - Primary use case trigger
- \`${SPECIFIC_SCENARIOS}\` - Specific coordination scenarios
- \`${TRIGGER_PHRASES}\` - User phrases that trigger this coordinator
- \`${COMMA_SEPARATED_KEYWORDS}\` - Search keywords
- \`${COLOR}\` - Visual identifier color
- \`${CAPABILITY_1/2/3}\` - Coordinator capabilities
- \`${SWARM_ID}\` - Swarm identifier
- \`${COORDINATOR_ID}\` - Coordinator identifier
- \`${TARGET_AGENT_ID}\` - Target agent for signal
- \`${SIGNAL_DATA}\` - Signal payload data
- \`${SIGNAL_REASON}\` - Signal reason/context
- \`${TIMEOUT_MS}\` - Timeout in milliseconds
- \`${COORDINATOR_SPECIFIC_RESPONSIBILITIES}\` - Coordinator-specific duties
- \`${COORDINATOR_SPECIFIC_METHODOLOGY}\` - Coordinator-specific approach

---

**Template Version:** 1.0.0
**Last Updated:** 2025-10-11
**Category:** Coordinator (ACL 3, Blocking Coordination)
