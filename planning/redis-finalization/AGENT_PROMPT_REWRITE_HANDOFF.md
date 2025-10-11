# Agent Prompt Rewrite Handoff Documentation

**Version:** 1.0.0
**Date:** 2025-10-10
**Target Team:** Agent Prompt Rewrite Team
**Epic:** SQLite Memory Integration + Blocking Coordination
**Estimated Effort:** 2-3 weeks (all agent types)

---

## Executive Summary

This handoff document provides comprehensive guidance for rewriting **all agent prompt templates** to integrate:

1. **SQLite Memory Persistence** - Cross-session recovery, audit trail, compliance tracking
2. **Blocking Coordination Pattern** - Signal ACK protocol, timeout enforcement, dead coordinator detection
3. **CFN Loop Memory Patterns** - Loop 3/2/4 data persistence, consensus history, Product Owner decisions

**Critical Insight:** This integration affects **ALL agent types**, not just coordinators. Every agent (coder, tester, reviewer, architect, security-specialist, etc.) must persist audit trails, report confidence scores, and participate in memory-backed coordination.

**Architecture References:**
- `docs/implementation/SQLITE_INTEGRATION_IMPLEMENTATION.md`
- `docs/patterns/blocking-coordination-pattern.md`
- `planning/EPIC_COMPLETION_REPORT.json`

---

## 1. Agent vs Hook Delegation Strategy

### What Agents Should Handle (Creative/Implementation Work)

**Agent-Driven Tasks (2-3 weeks, 41 agent types):**

✅ **Prompt Template Rewriting** - Requires understanding context, agent capabilities, and integration patterns
- Update all 41 agent prompt templates with SQLite lifecycle hooks
- Implement blocking coordination patterns for 12 coordinator agents
- Add CFN Loop memory patterns for Loop 3/2/4 participants
- Write agent-specific error handling and recovery logic

✅ **Integration Implementation** - Complex logic requiring architectural decisions
- Design agent-specific ACL level policies (Private/Team/Swarm/Project/System)
- Implement confidence score persistence strategies per agent role
- Create agent lifecycle state machines (spawn → in_progress → completed)
- Design memory retention policies (30d/90d/365d TTLs)

✅ **Testing & Validation** - Domain expertise required
- Write unit tests for SQLite integration (agents table, audit logs, ACL enforcement)
- Create integration tests for Signal ACK protocol end-to-end
- Develop chaos tests for coordinator death scenarios
- Build regression tests for CFN Loop memory patterns

✅ **Documentation** - Contextual writing for multiple audiences
- Migration guides for each agent type category
- Troubleshooting guides with failure scenario analysis
- Training materials for agent prompt template patterns
- API documentation for blocking coordination interfaces

### What Hooks Should Handle (Automated Validation/Enforcement)

**Hook-Driven Tasks (automated, real-time):**

✅ **Post-Edit Validation** - Automated compliance checks
- Verify SQLite lifecycle hooks present in prompt templates (`agents` table registration)
- Detect missing audit log integration patterns
- Validate ACL level declarations match agent type guidelines
- Check for required error handling patterns (SQLite write failures, Redis connection loss)

✅ **Code Quality Enforcement** - Pattern matching and linting
- Enforce dual-write pattern (Redis ephemeral + SQLite persistent)
- Validate HMAC secret usage in blocking coordination
- Check for heartbeat broadcasting in coordinator agents
- Detect hardcoded paths or missing environment variable usage

✅ **Integration Completeness** - Automated dependency checks
- Verify `BlockingCoordinationSignals` imports for coordinators
- Check `CoordinatorTimeoutHandler` initialization
- Validate CFN Loop memory key patterns (`cfn/phase-${phaseId}/loop3/...`)
- Ensure ACL enforcement in all `sqlite.memoryAdapter.set()` calls

✅ **Testing Coverage Enforcement** - Automated test validation
- Require unit tests for agent spawn registration
- Mandate integration tests for Signal ACK protocol
- Enforce chaos tests for coordinator death scenarios
- Validate test assertions for ACL violations

### Hook Implementation Requirements

**New Hook Capabilities Needed:**

1. **Agent Prompt Template Validator Hook** (`post-edit-agent-template.js`)
   - Triggers: On edit to `.claude/agents/**/*.md` files
   - Checks: SQLite lifecycle hooks, ACL declarations, error handling patterns
   - Actions: Warn if patterns missing, suggest fixes, block commit if critical issues

2. **Blocking Coordination Validator Hook** (`post-edit-blocking-coordination.js`)
   - Triggers: On edit to files importing `blocking-coordination-signals.ts`
   - Checks: Signal ACK protocol usage, heartbeat broadcasting, timeout handling
   - Actions: Validate HMAC secret env var, check ACK timeout values, verify dead coordinator detection

3. **CFN Loop Memory Pattern Validator Hook** (`post-edit-cfn-loop-memory.js`)
   - Triggers: On edit to files using `cfn/phase-*/loop*/` memory keys
   - Checks: ACL level correctness (Loop 3: Private, Loop 2: Swarm, Loop 4: Project)
   - Actions: Validate retention policies (Loop 4: 365d), check encryption for sensitive data

4. **Test Coverage Validator Hook** (`post-test-coverage.js`)
   - Triggers: After test execution
   - Checks: Agent lifecycle tests, Signal ACK tests, chaos tests present
   - Actions: Block PR if coverage <80% for new agent integration code

### Decision Matrix

| Task Type | Handler | Reasoning |
|-----------|---------|-----------|
| **Template Rewriting** | Agents | Requires contextual understanding of agent capabilities |
| **Pattern Implementation** | Agents | Complex logic with architectural trade-offs |
| **Test Writing** | Agents | Domain expertise and edge case identification |
| **Documentation** | Agents | Audience-aware technical writing |
| **Pattern Detection** | Hooks | Fast regex/AST-based matching |
| **Compliance Enforcement** | Hooks | Automated pass/fail checks |
| **Coverage Validation** | Hooks | Quantitative metric evaluation |
| **Real-time Feedback** | Hooks | Sub-second validation during development |

### Recommended Workflow

**Phase 1: Agent Implementation (Weeks 1-3)**
1. Agents rewrite prompt templates (41 agent types)
2. Agents implement SQLite/blocking coordination integration
3. Agents write comprehensive tests
4. Agents create migration documentation

**Phase 2: Hook Automation (Week 4)**
5. Create 4 new validation hooks (agent template, blocking coordination, CFN memory, test coverage)
6. Integrate hooks into post-edit pipeline
7. Configure hooks in `.claude/hooks/` directory
8. Enable hooks for agent template files

**Phase 3: Continuous Validation (Ongoing)**
9. Hooks automatically validate all new agent edits
10. Hooks enforce patterns during development
11. Hooks block commits with critical violations
12. Hooks provide real-time feedback to developers

### Key Insight

**Agents do the creative work (implementation, testing, documentation). Hooks enforce the patterns (validation, compliance, coverage).** This separation ensures:
- Agents focus on high-value creative tasks
- Hooks provide fast automated validation
- Quality standards consistently enforced
- Development velocity maximized

---

## 2. Scope: All Agent Types Affected

### Agent Categories Requiring Updates

**Core Implementers (15 agent types):**
- `coder`, `backend-dev`, `mobile-dev`, `react-frontend-engineer`
- `tester`, `playwright-tester`, `interaction-tester`
- `reviewer`, `code-analyzer`, `analyst`
- `architect`, `system-architect`, `state-architect`
- `devops-engineer`, `cicd-engineer`

**Coordinators & Orchestrators (12 agent types):**
- `coordinator`, `hierarchical-coordinator`, `mesh-coordinator`
- `adaptive-coordinator`, `adaptive-coordinator-enhanced`
- `consensus-builder`, `byzantine-coordinator`, `raft-manager`, `quorum-manager`
- `gossip-coordinator`, `crdt-synchronizer`, `task-coordinator`

**Specialized Roles (10 agent types):**
- `security-specialist`, `security-manager`
- `product-owner`, `goal-planner`
- `researcher`, `planner`
- `api-docs`, `ui-designer`
- `base-template-generator`, `pseudocode`

**SPARC Methodology (4 agent types):**
- `specification`, `pseudocode`, `architecture`, `refinement`

**Total:** ~41 agent types across `.claude/agents/` directories

---

## 3. Key Integration Requirements

### 3.1 SQLite Memory Persistence (ALL Agents)

**Requirement:** Every agent MUST write to SQLite for audit trail compliance.

#### Agent Lifecycle Hooks (Mandatory)

**Agent Spawn:**
```typescript
// On agent initialization
await sqlite.query(`
  INSERT INTO agents (id, name, type, status, metadata, spawned_at)
  VALUES (?, ?, ?, 'spawned', ?, datetime('now'))
`, [agentId, agentName, agentType, JSON.stringify(metadata)]);

await sqlite.query(`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES (?, 'agent_spawned', ?, datetime('now'))
`, [agentId, JSON.stringify({ capabilities, task })]);
```

**Agent Confidence Updates:**
```typescript
// After completing subtask
await sqlite.memoryAdapter.set(
  `agent/${agentId}/confidence/${taskId}`,
  { confidence: 0.85, reasoning: "Tests pass, security clean", blockers: [] },
  { agentId, aclLevel: 1 } // Private to agent
);

// Update agent status
await sqlite.query(`
  UPDATE agents SET status = 'in_progress', last_active = datetime('now')
  WHERE id = ?
`, [agentId]);
```

**Agent Termination:**
```typescript
// On completion or failure
await sqlite.query(`
  UPDATE agents SET status = ?, completed_at = datetime('now')
  WHERE id = ?
`, [finalStatus, agentId]);

await sqlite.query(`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES (?, 'agent_terminated', ?, datetime('now'))
`, [agentId, JSON.stringify({ finalConfidence, filesChanged, duration })]);
```

### 3.2 Blocking Coordination Integration (Coordinator Agents)

**Requirement:** Coordinator agents MUST implement Signal ACK protocol and dead coordinator detection.

#### Signal ACK Protocol Integration

**Sending Signals:**
```typescript
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals.js';

// Initialize signals manager
const signals = new BlockingCoordinationSignals({
  redis,
  swarmId,
  coordinatorId,
  hmacSecret: process.env.BLOCKING_COORDINATION_SECRET
});

// Send wake signal to dependent agent
await signals.sendSignal({
  receiverId: 'reviewer-1',
  type: 'wake',
  data: { phase: 'validation', files: ['auth.js', 'auth.test.js'] },
  reason: 'Loop 3 complete, ready for Loop 2 validation'
});

// Wait for ACK with timeout
const acked = await signals.waitForAck('reviewer-1', 5 * 60 * 1000); // 5 min

if (!acked) {
  await signals.handleTimeout('reviewer-1');
  // Persist timeout event to SQLite
  await sqlite.query(`
    INSERT INTO timeout_events (coordinator_id, target_agent_id, timeout_type, timestamp)
    VALUES (?, ?, 'signal_ack', datetime('now'))
  `, [coordinatorId, 'reviewer-1']);
}
```

**Receiving Signals & Sending ACKs:**
```typescript
// Poll for signals
const signal = await signals.receiveSignal(myAgentId);

if (signal) {
  // Process signal
  await processValidationTask(signal.data);

  // Send ACK back to coordinator
  await signals.sendAck(signal.senderId, myAgentId, signal.iteration);

  // Persist ACK event to SQLite
  await sqlite.query(`
    INSERT INTO audit_log (agent_id, action, details, timestamp)
    VALUES (?, 'signal_ack_sent', ?, datetime('now'))
  `, [myAgentId, JSON.stringify({ signal, coordinatorId: signal.senderId })]);
}
```

#### Dead Coordinator Detection

**Heartbeat Broadcasting (Coordinators):**
```typescript
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler.js';

// Initialize timeout handler
const timeoutHandler = new CoordinatorTimeoutHandler({
  redis,
  swarmId,
  coordinatorId,
  timeout: 20 * 60 * 1000 // 20 minutes
});

// Start heartbeat (5s interval, 90s TTL)
await timeoutHandler.start();

// Cleanup on termination
process.on('SIGINT', async () => {
  await timeoutHandler.stop();
});
```

**Dead Coordinator Detection (All Agents):**
```typescript
// Check coordinator health before waiting
const isAlive = await timeoutHandler.checkCoordinatorHealth();

if (!isAlive) {
  // Coordinator is dead, escalate to meta-coordinator
  await redis.publish('coordinator:dead', JSON.stringify({
    deadCoordinatorId: coordinatorId,
    detectedBy: myAgentId,
    timestamp: Date.now()
  }));

  // Persist escalation to SQLite
  await sqlite.query(`
    INSERT INTO audit_log (agent_id, action, details, timestamp)
    VALUES (?, 'coordinator_dead_escalation', ?, datetime('now'))
  `, [myAgentId, JSON.stringify({ coordinatorId, reason: 'heartbeat_timeout' })]);

  // Transfer work to new coordinator
  await transferWorkToNewCoordinator();
}
```

### 3.3 CFN Loop Memory Patterns (All Agents)

**Requirement:** Agents participating in CFN Loop phases MUST persist loop-specific data.

#### Loop 3 Implementation Results (Implementers)

**After completing implementation:**
```typescript
// Store implementation results in SQLite (ACL: Private)
await sqlite.memoryAdapter.set(
  `cfn/phase-${phaseId}/loop3/agent-${agentId}`,
  {
    confidence: 0.85,
    files: ['auth.js', 'auth.test.js', 'auth-middleware.js'],
    reasoning: "All tests pass (100% coverage), HMAC-SHA256 implemented, timing-safe comparison used",
    blockers: [],
    timestamp: Date.now()
  },
  { agentId, aclLevel: 1 } // Private to agent
);

// Publish ephemeral notification to Redis
await redis.publish(`cfn:loop3:complete:${agentId}`, JSON.stringify({
  agentId,
  confidence: 0.85,
  phaseId
}));
```

#### Loop 2 Consensus Validation (Validators)

**After validation:**
```typescript
// Store validation vote in SQLite (immutable, ACL: Swarm)
await sqlite.query(`
  INSERT INTO consensus (phase_id, validator_id, vote, confidence_score, reasoning, timestamp, acl_level)
  VALUES (?, ?, 'approve_with_recommendations', ?, ?, datetime('now'), 3)
`, [phaseId, validatorId, 0.92, "Security excellent (0.92), minor doc gaps"]);

// Read Loop 3 results from SQLite for validation
const loop3Results = await sqlite.memoryAdapter.getPattern(
  `cfn/phase-${phaseId}/loop3/*`,
  { aclLevel: 3 } // Swarm-level read access
);

// Calculate consensus
const consensus = loop3Results.reduce((sum, r) => sum + r.confidence, 0) / loop3Results.length;

// Persist consensus to SQLite
await sqlite.query(`
  INSERT INTO consensus (phase_id, loop, consensus_score, validator_count, timestamp)
  VALUES (?, 2, ?, ?, datetime('now'))
`, [phaseId, consensus, loop3Results.length]);
```

#### Loop 4 Product Owner Decisions (Product Owner Agent)

**GOAP decision persistence:**
```typescript
// Read all loop data for GOAP decision
const loop3Data = await sqlite.memoryAdapter.getPattern(`cfn/phase-${phaseId}/loop3/*`);
const loop2Data = await sqlite.query(`SELECT * FROM consensus WHERE phase_id = ? AND loop = 2`, [phaseId]);

// Make GOAP decision
const decision = await goap.decide({ loop3Data, loop2Data, threshold: 0.90 });

// Persist decision to SQLite (ACL: Project, 365-day retention)
await sqlite.query(`
  INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
  VALUES (?, ?, 4, 31536000, ?, 0)
`, [
  `cfn/phase-${phaseId}/loop4/decision`,
  JSON.stringify({
    decision: decision.action, // PROCEED/DEFER/ESCALATE
    cost: decision.cost,
    reasoning: decision.reasoning,
    backlogItems: decision.backlog,
    timestamp: Date.now()
  }),
  'product-owner'
]);

// Publish ephemeral notification
await redis.publish(`cfn:loop4:decision:${phaseId}`, JSON.stringify(decision));
```

---

## 4. Agent Prompt Template Structure

### 4.1 Standard Template Sections

All agent prompts MUST include these sections:

```markdown
# [Agent Name] - [Agent Type]

**Capabilities:** [List of agent capabilities]
**ACL Level:** [Default ACL level for agent outputs: 1-5]
**Memory Persistence:** [Required/Optional]
**Blocking Coordination:** [Required for coordinators/Optional for implementers]

---

## Agent Initialization

[Instructions for agent spawn, SQLite registration, Redis coordination setup]

## Core Responsibilities

[Agent-specific task instructions]

## Memory Persistence Requirements

### Agent Lifecycle Hooks

- **On Spawn:** Register in SQLite `agents` table, create audit log entry
- **During Execution:** Update confidence scores, persist subtask results
- **On Completion:** Mark status as complete, finalize audit trail

### Data Persistence Patterns

[Agent-specific SQLite write patterns, ACL levels, TTL settings]

## Coordination Protocols

### Redis Pub/Sub Integration

[Event publishing, channel subscriptions, message formats]

### Blocking Coordination (Coordinators Only)

[Signal ACK protocol, heartbeat broadcasting, dead coordinator detection]

## CFN Loop Integration

[Loop 3/2/4 memory patterns if agent participates in CFN Loop]

## Output Format

[JSON schema for agent reports, confidence scoring, blocker reporting]

## Error Handling

[Timeout scenarios, coordinator death, SQLite write failures, Redis connection loss]

---
```

### 4.2 Template Variables for Customization

**Agent-Specific Variables:**
```markdown
{{AGENT_NAME}} - Full agent name (e.g., "Backend Developer")
{{AGENT_TYPE}} - Agent type identifier (e.g., "backend-dev")
{{CAPABILITIES}} - Comma-separated list of agent capabilities
{{DEFAULT_ACL_LEVEL}} - Default ACL level (1-5)
{{MEMORY_REQUIRED}} - true/false
{{BLOCKING_COORD_REQUIRED}} - true/false (coordinators: true)
{{CFN_LOOP_PARTICIPANT}} - true/false
```

**Context Variables:**
```markdown
{{SWARM_ID}} - Current swarm identifier
{{PHASE_ID}} - Current CFN Loop phase identifier
{{COORDINATOR_ID}} - Assigned coordinator for this agent
{{REDIS_CONFIG}} - Redis connection configuration
{{SQLITE_DB_PATH}} - SQLite database file path
{{HMAC_SECRET_ENV}} - Environment variable for HMAC secret
```

---

## 5. Migration Checklist (Per Agent Type)

### Phase 1: Core Integration (Days 1-3)

- [ ] **Read Architecture Documents**
  - [ ] SQLITE_MEMORY_INTEGRATION_ARCHITECTURE.md
  - [ ] blocking-coordination-pattern.md
  - [ ] EPIC_COMPLETION_REPORT.json

- [ ] **Update Agent Prompt Template**
  - [ ] Add "Agent Initialization" section
  - [ ] Add "Memory Persistence Requirements" section
  - [ ] Add "Coordination Protocols" section
  - [ ] Add "CFN Loop Integration" section (if applicable)
  - [ ] Add "Error Handling" section

- [ ] **Add SQLite Lifecycle Hooks**
  - [ ] Agent spawn registration
  - [ ] Confidence score updates
  - [ ] Agent termination cleanup
  - [ ] Audit log integration

### Phase 2: Blocking Coordination (Days 4-7, Coordinators Only)

- [ ] **Implement Signal ACK Protocol**
  - [ ] Import BlockingCoordinationSignals
  - [ ] Add sendSignal() calls
  - [ ] Add receiveSignal() polling
  - [ ] Add sendAck() responses
  - [ ] Add waitForAck() timeout handling

- [ ] **Implement Dead Coordinator Detection**
  - [ ] Import CoordinatorTimeoutHandler
  - [ ] Start heartbeat broadcasting
  - [ ] Add checkCoordinatorHealth() checks
  - [ ] Add escalation logic
  - [ ] Add work transfer procedures

### Phase 3: CFN Loop Patterns (Days 8-10, CFN Loop Participants)

- [ ] **Loop 3 Integration (Implementers)**
  - [ ] Store confidence scores in SQLite (ACL: Private)
  - [ ] Store file changes list
  - [ ] Publish ephemeral Redis notification

- [ ] **Loop 2 Integration (Validators)**
  - [ ] Read Loop 3 results from SQLite
  - [ ] Store validation votes in SQLite (ACL: Swarm)
  - [ ] Calculate and persist consensus score

- [ ] **Loop 4 Integration (Product Owner)**
  - [ ] Read Loop 3 + Loop 2 data from SQLite
  - [ ] Persist GOAP decision (ACL: Project, 365d retention)
  - [ ] Publish decision notification

### Phase 4: Testing & Validation (Days 11-15)

- [ ] **Unit Tests**
  - [ ] Test SQLite agent registration
  - [ ] Test confidence score persistence
  - [ ] Test ACL enforcement
  - [ ] Test audit log completeness

- [ ] **Integration Tests**
  - [ ] Test Signal ACK protocol end-to-end
  - [ ] Test dead coordinator detection
  - [ ] Test work transfer on coordinator death
  - [ ] Test CFN Loop memory patterns

- [ ] **Chaos Tests**
  - [ ] Test agent crash recovery from SQLite
  - [ ] Test Redis connection loss fallback
  - [ ] Test coordinator process kill scenarios
  - [ ] Test concurrent agent writes

### Phase 5: Documentation (Days 16-20)

- [ ] **Update Agent Documentation**
  - [ ] Add SQLite integration examples
  - [ ] Add blocking coordination examples
  - [ ] Add CFN Loop memory patterns
  - [ ] Add troubleshooting guide

- [ ] **Create Migration Guide**
  - [ ] Document breaking changes
  - [ ] Provide migration scripts
  - [ ] Add before/after examples
  - [ ] Add FAQ for common issues

---

## 6. Code Examples by Agent Type

### 6.1 Implementer Agent (Coder, Backend-Dev, Mobile-Dev)

**Enhanced Prompt Section:**

```markdown
## Memory Persistence Requirements

### Agent Lifecycle Integration

On spawn:
\`\`\`typescript
await sqlite.query(\`
  INSERT INTO agents (id, name, type, status, capabilities, spawned_at)
  VALUES (?, ?, 'coder', 'spawned', ?, datetime('now'))
\`, [agentId, agentName, JSON.stringify(['coding', 'refactoring', 'testing'])]);
\`\`\`

During execution:
\`\`\`typescript
// After completing file edit
await sqlite.memoryAdapter.set(
  \`agent/\${agentId}/progress/\${taskId}\`,
  {
    confidence: 0.85,
    filesEdited: ['auth.js', 'auth.test.js'],
    linesAdded: 247,
    linesRemoved: 15,
    reasoning: "Implemented HMAC-SHA256 signature verification with timing-safe comparison"
  },
  { agentId, aclLevel: 1 }
);
\`\`\`

On completion:
\`\`\`typescript
await sqlite.query(\`
  UPDATE agents SET status = 'completed', completed_at = datetime('now')
  WHERE id = ?
\`, [agentId]);
\`\`\`

### CFN Loop 3 Integration

After implementation phase completes:
\`\`\`typescript
await sqlite.memoryAdapter.set(
  \`cfn/phase-\${phaseId}/loop3/agent-\${agentId}\`,
  {
    confidence: 0.85,
    files: ['auth.js', 'auth.test.js'],
    reasoning: "Tests pass, security review clean, performance acceptable",
    blockers: []
  },
  { agentId, aclLevel: 1 }
);

// Notify coordinator
await redis.publish(\`cfn:loop3:complete:\${agentId}\`, JSON.stringify({
  agentId,
  confidence: 0.85
}));
\`\`\`
```

### 6.2 Validator Agent (Reviewer, Security-Specialist, Code-Analyzer)

**Enhanced Prompt Section:**

```markdown
## CFN Loop 2 Consensus Validation

### Read Loop 3 Results

\`\`\`typescript
// Retrieve all Loop 3 implementation results
const loop3Results = await sqlite.memoryAdapter.getPattern(
  \`cfn/phase-\${phaseId}/loop3/*\`,
  { aclLevel: 3 } // Swarm-level access
);

// Analyze results
const avgConfidence = loop3Results.reduce((sum, r) => sum + r.confidence, 0) / loop3Results.length;
const allFiles = loop3Results.flatMap(r => r.files);
\`\`\`

### Store Validation Vote

\`\`\`typescript
await sqlite.query(\`
  INSERT INTO consensus (
    phase_id, validator_id, vote, confidence_score, reasoning, recommendations, timestamp, acl_level
  ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 3)
\`, [
  phaseId,
  validatorId,
  'approve_with_recommendations',
  0.92,
  "Security excellent (HMAC-SHA256, timing-safe), minor doc gaps",
  JSON.stringify(["Add .env.example entry", "Test code examples"])
]);
\`\`\`

### Calculate Consensus

\`\`\`typescript
const consensusData = await sqlite.query(\`
  SELECT AVG(confidence_score) as consensus, COUNT(*) as validator_count
  FROM consensus
  WHERE phase_id = ? AND loop = 2
\`, [phaseId]);

const consensus = consensusData[0].consensus;

// Persist consensus result
await sqlite.query(\`
  INSERT INTO consensus (phase_id, loop, consensus_score, validator_count, timestamp)
  VALUES (?, 2, ?, ?, datetime('now'))
\`, [phaseId, consensus, consensusData[0].validator_count]);

// Notify Product Owner
if (consensus >= 0.90) {
  await redis.publish(\`cfn:loop2:consensus:\${phaseId}\`, JSON.stringify({ consensus, status: 'pass' }));
} else {
  await redis.publish(\`cfn:loop2:consensus:\${phaseId}\`, JSON.stringify({ consensus, status: 'retry' }));
}
\`\`\`
```

### 6.3 Coordinator Agent (Coordinator, Hierarchical-Coordinator)

**Enhanced Prompt Section:**

```markdown
## Blocking Coordination Integration

### Initialize Coordination Components

\`\`\`typescript
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals.js';
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler.js';

const signals = new BlockingCoordinationSignals({
  redis,
  swarmId,
  coordinatorId,
  hmacSecret: process.env.BLOCKING_COORDINATION_SECRET
});

const timeoutHandler = new CoordinatorTimeoutHandler({
  redis,
  swarmId,
  coordinatorId,
  timeout: 20 * 60 * 1000 // 20 minutes
});

// Start heartbeat
await timeoutHandler.start();
\`\`\`

### Coordinate Agent Workflow with Signal ACK

\`\`\`typescript
// 1. Spawn implementer agents
const agents = await spawnAgents(['coder-1', 'coder-2', 'security-1']);

// 2. Wait for Loop 3 completion (self-reported confidence)
const loop3Complete = await waitForAllAgents(agents, 'loop3:complete');

// 3. Check if all agents passed gate (≥0.75 confidence)
const allPassed = loop3Complete.every(a => a.confidence >= 0.75);

if (!allPassed) {
  // Retry Loop 3 with targeted agents
  await retryLoop3(failedAgents);
  return;
}

// 4. Send wake signal to validators
await signals.sendSignal({
  receiverId: 'reviewer-1',
  type: 'wake',
  data: { phase: phaseId, loop3Results },
  reason: 'Loop 3 complete, ready for validation'
});

// 5. Wait for ACK with 5-minute timeout
const acked = await signals.waitForAck('reviewer-1', 5 * 60 * 1000);

if (!acked) {
  // Timeout: Check if coordinator is alive
  const isAlive = await timeoutHandler.checkCoordinatorHealth();

  if (!isAlive) {
    // Coordinator dead, escalate
    await redis.publish('coordinator:dead', JSON.stringify({
      deadCoordinatorId: coordinatorId,
      detectedBy: myAgentId
    }));
  } else {
    // Validator dead or stuck, spawn replacement
    await spawnReplacementValidator('reviewer-2');
  }
}
\`\`\`

### Handle Coordinator Death

\`\`\`typescript
// Detect own death risk (no heartbeat for 2 minutes)
process.on('SIGTERM', async () => {
  // Persist current state to SQLite before termination
  await sqlite.memoryAdapter.set(
    \`coordinator/\${coordinatorId}/final-state\`,
    {
      phase: phaseId,
      loop: 3,
      activeAgents: agents.map(a => a.id),
      progress: 0.75,
      timestamp: Date.now()
    },
    { agentId: coordinatorId, aclLevel: 3 }
  );

  // Stop heartbeat
  await timeoutHandler.stop();
});
\`\`\`
```

### 6.4 Product Owner Agent

**Enhanced Prompt Section:**

```markdown
## Loop 4 GOAP Decision with Memory Persistence

### Read All Loop Data

\`\`\`typescript
// Read Loop 3 implementation results (ACL: Private → Swarm)
const loop3Data = await sqlite.memoryAdapter.getPattern(
  \`cfn/phase-\${phaseId}/loop3/*\`,
  { aclLevel: 3 }
);

// Read Loop 2 consensus validation (ACL: Swarm)
const loop2Data = await sqlite.query(\`
  SELECT * FROM consensus WHERE phase_id = ? AND loop = 2
\`, [phaseId]);

// Read previous Loop 4 decisions for context (ACL: Project)
const previousDecisions = await sqlite.memoryAdapter.getPattern(
  \`cfn/phase-*/loop4/decision\`,
  { aclLevel: 4 }
);
\`\`\`

### Make GOAP Decision

\`\`\`typescript
const decision = await goap.decide({
  loop3Data,
  loop2Data,
  threshold: 0.90,
  previousDecisions,
  costFunction: calculateCost
});

// decision = { action: 'DEFER', cost: 10, reasoning: '...', backlog: [...] }
\`\`\`

### Persist Decision (365-Day Retention)

\`\`\`typescript
await sqlite.query(\`
  INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
  VALUES (?, ?, 4, 31536000, 'product-owner', 0)
\`, [
  \`cfn/phase-\${phaseId}/loop4/decision\`,
  JSON.stringify({
    decision: decision.action,
    cost: decision.cost,
    reasoning: decision.reasoning,
    backlog: decision.backlog,
    consensus: loop2Data[0].consensus_score,
    timestamp: Date.now()
  })
]);

// Audit log for compliance
await sqlite.query(\`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES ('product-owner', 'goap_decision', ?, datetime('now'))
\`, [JSON.stringify({ phaseId, decision: decision.action, cost: decision.cost })]);
\`\`\`

### Publish Decision

\`\`\`typescript
await redis.publish(\`cfn:loop4:decision:\${phaseId}\`, JSON.stringify({
  decision: decision.action,
  phaseId,
  consensus: loop2Data[0].consensus_score
}));
\`\`\`
```

---

## 7. ACL Level Guidelines by Agent Type

| Agent Type | Default ACL Level | Data Stored | Retention | Encryption |
|------------|-------------------|-------------|-----------|------------|
| **Implementers** | 1 (Private) | Confidence scores, file changes, reasoning | 30 days | AES-256-GCM |
| **Validators** | 3 (Swarm) | Validation votes, consensus scores, recommendations | 90 days | None |
| **Coordinators** | 3 (Swarm) | Agent assignments, workflow state, signals | 7 days | None |
| **Product Owner** | 4 (Project) | GOAP decisions, backlog items, strategic history | 365 days | None |
| **System Audit** | 5 (System) | Audit logs, security events, compliance records | 2 years | AES-256-GCM |

**Encryption Policy:**
- ACL Level 1 (Private): **Encrypted** with agent-specific key
- ACL Level 2 (Team): **Encrypted** with team-shared key
- ACL Level 3 (Swarm): **Not encrypted** (shared coordination data)
- ACL Level 4 (Project): **Not encrypted** (strategic decisions)
- ACL Level 5 (System): **Encrypted** with master key (audit logs)

---

## 8. Error Handling Patterns

### 8.1 SQLite Write Failures

**Pattern:**
```typescript
async function safeWriteToSQLite(key, value, options) {
  try {
    await sqlite.memoryAdapter.set(key, value, options);
  } catch (error) {
    // Log error but don't fail agent execution
    console.error(`SQLite write failed for key ${key}:`, error);

    // Fallback: Store in Redis with 1-hour TTL
    await redis.setex(`fallback:${key}`, 3600, JSON.stringify(value));

    // Retry asynchronously
    setImmediate(async () => {
      try {
        await sqlite.memoryAdapter.set(key, value, options);
        await redis.del(`fallback:${key}`); // Clear fallback
      } catch (retryError) {
        console.error(`SQLite retry failed for key ${key}:`, retryError);
      }
    });
  }
}
```

### 8.2 Redis Connection Loss

**Pattern:**
```typescript
async function safePublishToRedis(channel, message) {
  try {
    await redis.publish(channel, message);
  } catch (error) {
    console.error(`Redis publish failed for channel ${channel}:`, error);

    // Store event in SQLite as fallback
    await sqlite.query(`
      INSERT INTO events (channel, message, failed_at, retry_count)
      VALUES (?, ?, datetime('now'), 0)
    `, [channel, message]);

    // Background retry worker will replay events
  }
}
```

### 8.3 Coordinator Death During Signal Wait

**Pattern:**
```typescript
async function waitForSignalWithRecovery(agentId, timeout) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Check signal
    const signal = await signals.receiveSignal(agentId);
    if (signal) return signal;

    // Check coordinator health every 30 seconds
    if ((Date.now() - startTime) % 30000 === 0) {
      const isAlive = await timeoutHandler.checkCoordinatorHealth();

      if (!isAlive) {
        // Coordinator dead, escalate
        await redis.publish('coordinator:dead', JSON.stringify({
          deadCoordinatorId: coordinatorId,
          detectedBy: agentId,
          context: 'waiting_for_signal'
        }));

        // Wait for new coordinator assignment
        const newCoordinator = await waitForNewCoordinator(60000); // 1 min

        if (!newCoordinator) {
          throw new Error('No coordinator available after escalation');
        }

        // Update coordinator reference
        coordinatorId = newCoordinator.id;
      }
    }

    await sleep(5000); // Poll every 5 seconds
  }

  throw new Error('Signal timeout');
}
```

---

## 9. Testing Requirements

### 9.1 Unit Tests (Per Agent Type)

**Test Coverage Requirements:**
- ✅ Agent spawn registration (SQLite `agents` table)
- ✅ Confidence score persistence (SQLite `memory` table)
- ✅ Audit log creation (SQLite `audit_log` table)
- ✅ ACL enforcement (read/write permissions)
- ✅ Encryption/decryption (ACL levels 1-2)
- ✅ Agent termination cleanup

**Example Test:**
```typescript
describe('Coder Agent - SQLite Integration', () => {
  it('should register agent on spawn', async () => {
    const agent = new CoderAgent({ agentId: 'coder-1', sqlite });
    await agent.initialize();

    const registered = await sqlite.query(
      'SELECT * FROM agents WHERE id = ?',
      ['coder-1']
    );

    expect(registered).toHaveLength(1);
    expect(registered[0].type).toBe('coder');
    expect(registered[0].status).toBe('spawned');
  });

  it('should persist confidence score with ACL enforcement', async () => {
    const agent = new CoderAgent({ agentId: 'coder-1', sqlite });
    await agent.reportConfidence(0.85, 'Tests pass');

    // Should succeed (agent reading own data)
    const value = await sqlite.memoryAdapter.get('agent/coder-1/confidence', {
      agentId: 'coder-1',
      aclLevel: 1
    });
    expect(value.confidence).toBe(0.85);

    // Should fail (different agent reading private data)
    await expect(
      sqlite.memoryAdapter.get('agent/coder-1/confidence', {
        agentId: 'coder-2',
        aclLevel: 1
      })
    ).rejects.toThrow('ACL violation');
  });
});
```

### 9.2 Integration Tests (Cross-Agent Coordination)

**Test Coverage Requirements:**
- ✅ Signal ACK protocol end-to-end
- ✅ Dead coordinator detection and escalation
- ✅ Work transfer on coordinator death
- ✅ CFN Loop 3 → 2 → 4 memory patterns
- ✅ Consensus calculation from multiple validators
- ✅ GOAP decision based on SQLite data

**Example Test:**
```typescript
describe('CFN Loop Integration - Full Workflow', () => {
  it('should complete Loop 3 → 2 → 4 with memory persistence', async () => {
    // 1. Spawn Loop 3 implementers
    const implementers = await spawnAgents(['coder-1', 'coder-2']);

    // 2. Wait for Loop 3 completion
    await waitForAllAgents(implementers, 'loop3:complete');

    // 3. Verify SQLite persistence
    const loop3Data = await sqlite.memoryAdapter.getPattern('cfn/phase-test/loop3/*');
    expect(loop3Data).toHaveLength(2);
    expect(loop3Data.every(d => d.confidence >= 0.75)).toBe(true);

    // 4. Spawn Loop 2 validators
    const validators = await spawnAgents(['reviewer-1', 'security-1']);

    // 5. Send wake signals
    for (const validator of validators) {
      await signals.sendSignal({ receiverId: validator.id, type: 'wake' });
    }

    // 6. Wait for Loop 2 consensus
    const consensus = await waitForConsensus('cfn/phase-test', 2);
    expect(consensus).toBeGreaterThanOrEqual(0.90);

    // 7. Spawn Product Owner
    const productOwner = new ProductOwnerAgent({ sqlite, redis });
    const decision = await productOwner.makeGOAPDecision('cfn/phase-test');

    // 8. Verify decision persistence
    const storedDecision = await sqlite.memoryAdapter.get('cfn/phase-test/loop4/decision');
    expect(storedDecision.decision).toBe('DEFER');
  });
});
```

### 9.3 Chaos Tests (Failure Scenarios)

**Test Coverage Requirements:**
- ✅ Agent crash recovery from SQLite checkpoint
- ✅ Redis connection loss fallback to SQLite
- ✅ Coordinator process kill with work transfer
- ✅ Concurrent agent writes (race conditions)
- ✅ SQLite database lock contention

**Example Test:**
```typescript
describe('Chaos Tests - Coordinator Death', () => {
  it('should transfer work when coordinator dies', async () => {
    // 1. Start coordinator with heartbeat
    const coordinator = await spawnCoordinator('coord-1');
    await coordinator.start();

    // 2. Spawn agents waiting for signal
    const agents = await spawnAgents(['coder-1', 'coder-2']);
    agents.forEach(a => a.waitForSignal());

    // 3. Kill coordinator process
    setTimeout(() => coordinator.kill(), 5000);

    // 4. Verify dead coordinator detection
    await waitFor(() => coordinator.isDetectedDead(), 120000); // 2 min

    // 5. Verify work transfer to new coordinator
    const newCoordinator = await waitForNewCoordinator(60000);
    expect(newCoordinator).toBeDefined();
    expect(newCoordinator.id).not.toBe('coord-1');

    // 6. Verify agents receive signals from new coordinator
    const signals = await Promise.all(agents.map(a => a.receiveSignal()));
    expect(signals.every(s => s.senderId === newCoordinator.id)).toBe(true);
  });
});
```

---

## 10. Migration Timeline

### Week 1: Core Implementers (5 days)

**Day 1-2:** Coder, Backend-Dev, Mobile-Dev
- SQLite lifecycle hooks
- Confidence score persistence
- Audit log integration

**Day 3-4:** Tester, Reviewer, Code-Analyzer
- SQLite lifecycle hooks
- CFN Loop 2 consensus patterns
- Validation vote persistence

**Day 5:** Testing & validation
- Unit tests for all agents
- Integration tests for Loop 3 patterns

### Week 2: Coordinators (5 days)

**Day 1-2:** Coordinator, Hierarchical-Coordinator, Mesh-Coordinator
- Blocking coordination integration
- Signal ACK protocol
- Heartbeat broadcasting

**Day 3-4:** Byzantine-Coordinator, Raft-Manager, Consensus-Builder
- Dead coordinator detection
- Work transfer on death
- CFN Loop orchestration

**Day 5:** Testing & validation
- Signal ACK end-to-end tests
- Coordinator death chaos tests

### Week 3: Specialized & Final Integration (5 days)

**Day 1:** Product-Owner, Goal-Planner
- Loop 4 GOAP decision patterns
- 365-day decision history persistence

**Day 2:** Security-Specialist, Architect, Analyst
- Audit trail integration
- Compliance record persistence

**Day 3:** SPARC Agents (Specification, Pseudocode, Architecture, Refinement)
- Methodology-specific memory patterns

**Day 4:** Final integration testing
- Full CFN Loop workflow tests
- Cross-agent coordination tests
- Chaos tests (all scenarios)

**Day 5:** Documentation & handoff
- Update all agent documentation
- Create migration guide
- Training materials

---

## 11. Success Criteria

### Functional Requirements

- ✅ All 41 agent types updated with SQLite integration
- ✅ All coordinator agents implement blocking coordination
- ✅ All CFN Loop participants persist loop-specific data
- ✅ ACL enforcement working across all agents
- ✅ Audit trail complete for all agent actions

### Performance Requirements

- ✅ SQLite write latency p95 < 50ms
- ✅ Dual-write (Redis + SQLite) p95 < 60ms
- ✅ Signal ACK protocol latency < 5s
- ✅ Dead coordinator detection < 120s
- ✅ Agent spawn-to-ready < 2s

### Reliability Requirements

- ✅ Agent crash recovery success rate > 95%
- ✅ Redis connection loss fallback success rate > 99%
- ✅ Coordinator death work transfer success rate > 90%
- ✅ Zero data loss on VS Code crash (SQLite checkpoint)

### Compliance Requirements

- ✅ 100% of agent actions logged in `audit_log` table
- ✅ ACL violations properly rejected and logged
- ✅ Encryption enforced for ACL levels 1-2 and 5
- ✅ Retention policies enforced via TTL

---

## 12. Support & Resources

### Documentation

- **Architecture:** `docs/implementation/SQLITE_INTEGRATION_IMPLEMENTATION.md`
- **Patterns:** `docs/patterns/blocking-coordination-pattern.md`
- **API Reference:** `docs/api/blocking-coordination-api.md`
- **Training:** `docs/training/` (5 training files)
- **Troubleshooting:** `docs/training/troubleshooting-guide.md`

### Code Examples

- **SQLite Integration:** `src/sqlite/README.md`
- **Blocking Coordination:** `src/cfn-loop/blocking-coordination.ts`
- **Signal ACK Protocol:** `src/cfn-loop/blocking-coordination-signals.ts`
- **Timeout Handling:** `src/cfn-loop/coordinator-timeout-handler.ts`

### Testing Resources

- **Unit Test Examples:** `src/cfn-loop/__tests__/cleanup-integration.test.ts`
- **Integration Test Suite:** `tests/integration/`
- **Chaos Test Helpers:** `tests/chaos/utils/chaos-helpers.ts`

### Contact & Escalation

- **Architecture Questions:** System Architect Team
- **Security Questions:** Security Specialist Team
- **Performance Issues:** Performance Engineering Team
- **Urgent Blockers:** Product Owner escalation path

---

## 13. Appendix: Complete Agent List

### Core Implementers (15)
1. coder
2. backend-dev
3. mobile-dev
4. react-frontend-engineer
5. tester
6. playwright-tester
7. interaction-tester
8. reviewer
9. code-analyzer
10. analyst
11. architect
12. system-architect
13. state-architect
14. devops-engineer
15. cicd-engineer

### Coordinators (12)
16. coordinator
17. hierarchical-coordinator
18. mesh-coordinator
19. adaptive-coordinator
20. adaptive-coordinator-enhanced
21. consensus-builder
22. byzantine-coordinator
23. raft-manager
24. quorum-manager
25. gossip-coordinator
26. crdt-synchronizer
27. task-coordinator

### Specialized (10)
28. security-specialist
29. security-manager
30. product-owner
31. goal-planner
32. researcher
33. planner
34. api-docs
35. ui-designer
36. base-template-generator
37. pseudocode (SPARC)

### SPARC Methodology (4)
38. specification
39. pseudocode
40. architecture
41. refinement

**Total:** 41 agent types requiring updates

---

## End of Handoff Document

**Version:** 1.0.0
**Last Updated:** 2025-10-10
**Next Review:** After Week 1 completion (Day 5)

For questions or clarifications, refer to architecture documents or escalate to Product Owner.
