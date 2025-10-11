# Agent Update Master Plan
## SQLite/Redis/CLI Integration & Hook Validation Alignment

**Version:** 1.0.0
**Date:** 2025-10-11
**Status:** Planning Phase
**Estimated Effort:** 2-3 weeks (all 41 agent types)

---

## Executive Summary

This plan outlines the comprehensive update strategy for all 41 agent types to align with:
1. **SQLite Memory Integration** - Cross-session recovery, audit trail, compliance
2. **Hook Validation System** - 4 production-ready validators
3. **Blocking Coordination** - Signal ACK protocol for coordinators
4. **CFN Loop Memory Patterns** - Loop 3/2/4 data persistence with ACL enforcement
5. **Redis Pub/Sub Coordination** - Mandatory agent communication layer

**Critical Insight:** This is a BREAKING CHANGE affecting ALL agents. Every agent must persist audit trails, report confidence scores, and participate in memory-backed coordination.

---

## Current State Analysis

### Agent Inventory (59 files discovered)

**Core Implementers (15):**
- coder, tester, reviewer, analyst, base-template-generator
- backend-dev, mobile-dev, playwright-agent
- system-architect, architect, state-architect
- devops-engineer
- researcher, planner, task-coordinator

**Coordinators & Orchestrators (12):**
- coordinator, hierarchical-coordinator, mesh-coordinator
- adaptive-coordinator, adaptive-coordinator-enhanced
- consensus-builder, byzantine-coordinator, raft-manager
- quorum-manager, gossip-coordinator, crdt-synchronizer
- performance-benchmarker

**Specialized Roles (10):**
- security-specialist, security-manager
- product-owner, goal-planner
- api-docs, ui-designer, interaction-tester
- code-booster
- production-validator, tdd-london-swarm

**SPARC Methodology (4):**
- specification, pseudocode, architecture, refinement

**Pre-Design (4):**
- cto-agent, power-user-persona, accessibility-advocate-persona, product-owner-agent

**Documentation/Examples (8):**
- agent-principles (4 files), CLAUDE.md, SPARSE_LANGUAGE_FINDINGS.md
- blocking-coordinator-example, test-coordinator

**Total Production Agents:** ~41 requiring updates

---

## Gap Analysis

### Sample Analysis Results

#### Coder Agent (Implementer) - **7/7 Missing Requirements**

**Current State:**
```yaml
name: coder
tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, TodoWrite
model: sonnet
provider: zai
color: green
# ❌ Missing: validation_hooks, lifecycle, acl_level
```

**Missing Requirements:**
1. ❌ NO `validation_hooks` array in frontmatter
2. ❌ NO `lifecycle.pre_task` (SQLite agent registration)
3. ❌ NO `lifecycle.post_task` (SQLite completion update)
4. ❌ NO ACL level declaration (should be 1 - Private)
5. ❌ NO SQLite error handling patterns
6. ❌ NO memory key patterns documented
7. ❌ NO CFN Loop integration (Loop 3 confidence persistence)

**Estimated Update Effort:** 2-3 hours per agent

---

#### Coordinator Agent (Coordinator) - **10/10 Missing Requirements**

**Current State:**
```yaml
name: coordinator
tools: TodoWrite, Read, Write, Edit, Bash, Glob, Grep, WebSearch, SlashCommand, Task
model: sonnet
color: orange
# ❌ Missing: validation_hooks, lifecycle, acl_level, type: coordinator
```

**Missing Requirements:**
1. ❌ NO `validation_hooks` array (needs blocking-coordination-validator)
2. ❌ NO `lifecycle.pre_task` (SQLite agent registration)
3. ❌ NO `lifecycle.post_task` (SQLite completion update)
4. ❌ NO ACL level declaration (should be 3 - Swarm)
5. ❌ NO blocking coordination imports (`BlockingCoordinationSignals`, `CoordinatorTimeoutHandler`)
6. ❌ NO HMAC secret usage (`process.env.BLOCKING_COORDINATION_SECRET`)
7. ❌ NO Signal ACK patterns (sendSignal, waitForAck)
8. ❌ NO timeout handling logic
9. ❌ NO heartbeat broadcasting
10. ❌ NO dead coordinator detection

**Estimated Update Effort:** 4-6 hours per coordinator

---

#### Reviewer Agent (Validator) - **7/7 Missing Requirements**

**Current State:**
```yaml
name: reviewer
type: validator  # ✅ Has type
model: sonnet
provider: zai
color: "#E74C3C"
tools: Read, Write, Edit, Bash, Grep, Glob, WebSearch, TodoWrite
hooks:  # ❌ Wrong format - these are NOT the required lifecycle hooks
  pre: echo "👀 Reviewer agent analyzing: $TASK"
  post: echo "✅ Review complete"
```

**Missing Requirements:**
1. ❌ NO `validation_hooks` array in frontmatter
2. ❌ NO `lifecycle.pre_task` (SQLite agent registration)
3. ❌ NO `lifecycle.post_task` (SQLite completion update)
4. ❌ NO ACL level declaration (should be 3 - Swarm)
5. ❌ NO SQLite error handling patterns
6. ❌ NO CFN Loop integration (Loop 2 validation patterns)
7. ❌ NO consensus vote persistence

**Estimated Update Effort:** 3-4 hours per validator

---

#### Product Owner Agent (Strategic/CFN Loop 4) - **8/8 Missing Requirements**

**Current State:**
```yaml
name: product-owner
model: sonnet
provider: anthropic  # ✅ Has provider
color: purple
type: coordinator  # ❌ Should be strategic or cfn-loop
tools: Read, Write, Edit, Bash, TodoWrite, mcp__claude-flow-novice__memory_usage
```

**Missing Requirements:**
1. ❌ NO `validation_hooks` array in frontmatter
2. ❌ NO `lifecycle.pre_task` (SQLite agent registration)
3. ❌ NO `lifecycle.post_task` (SQLite completion update)
4. ❌ NO ACL level declaration (should be 4 - Project)
5. ❌ NO 365-day retention policy for GOAP decisions
6. ❌ NO SQLite integration for decision persistence
7. ❌ NO error handling patterns
8. ❌ NO Loop 4 memory patterns documented

**Estimated Update Effort:** 5-7 hours (most complex integration)

---

## Universal Update Requirements

### All Agents (100% Coverage Required)

#### 1. Frontmatter Additions

**Mandatory Fields:**
```yaml
---
name: agent-name
# ... existing fields ...
validation_hooks:
  - agent-template-validator        # MANDATORY for all
  - cfn-loop-memory-validator       # MANDATORY for all
  # Additional validators based on agent type (see matrix below)

lifecycle:
  pre_task: |
    # Register agent in SQLite on spawn
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', '${AGENT_TYPE}', 'active', CURRENT_TIMESTAMP)"

  post_task: |
    # Update agent status and confidence on completion
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"

acl_level: 1  # 1=Private, 3=Swarm, 4=Project (see matrix below)
---
```

#### 2. Validation Hooks Matrix

| Agent Category | agent-template | cfn-loop-memory | test-coverage | blocking-coordination |
|----------------|----------------|-----------------|---------------|----------------------|
| **Implementers** | ✅ | ✅ | ✅ | ❌ |
| **Validators** | ✅ | ✅ | ✅ | ❌ |
| **Coordinators** | ✅ | ✅ | ❌ | ✅ |
| **Strategic** | ✅ | ✅ | ❌ | ❌ |
| **Testers** | ✅ | ✅ | ✅ | ❌ |
| **Researchers** | ✅ | ❌ | ❌ | ❌ |

#### 3. ACL Level Matrix

| Agent Type | ACL Level | Scope | Data Examples |
|-----------|-----------|-------|---------------|
| **Implementers** | 1 (Private) | Agent-scoped | Confidence scores, implementation notes |
| **Validators** | 3 (Swarm) | Validation team | Review feedback, consensus votes |
| **Coordinators** | 3 (Swarm) | Multi-agent | Task assignments, signals |
| **Product Owner** | 4 (Project) | Strategic | GOAP decisions (365d retention) |
| **Architects** | 3 (Swarm) | Design team | ADRs (1 year retention) |

---

## Category-Specific Requirements

### A. Implementer Agents (Coder, Backend-Dev, Mobile-Dev, etc.)

**Required Additions:**

1. **Frontmatter Updates:**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator
acl_level: 1  # Private
lifecycle:
  pre_task: "sqlite-cli exec 'INSERT INTO agents ...'"
  post_task: "sqlite-cli exec 'UPDATE agents ...'"
```

2. **Body Additions:**
```markdown
## SQLite Integration (Implementers)

### Agent Lifecycle Hooks

On spawn:
\`\`\`typescript
await sqlite.query(\`
  INSERT INTO agents (id, name, type, status, capabilities, spawned_at)
  VALUES (?, ?, '${AGENT_TYPE}', 'spawned', ?, datetime('now'))
\`, [agentId, agentName, JSON.stringify(capabilities)]);
\`\`\`

During execution:
\`\`\`typescript
// After completing file edit
await sqlite.memoryAdapter.set(
  \`agent/\${agentId}/progress/\${taskId}\`,
  {
    confidence: 0.85,
    filesEdited: ['auth.js', 'auth.test.js'],
    reasoning: "Implemented HMAC-SHA256 signature verification"
  },
  { agentId, aclLevel: 1 }  // Private
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
    reasoning: "Tests pass, security review clean",
    blockers: []
  },
  { agentId, aclLevel: 1, ttl: 2592000 }  // Private, 30 days
);

// Notify coordinator via Redis
await redis.publish(\`cfn:loop3:complete:\${agentId}\`, JSON.stringify({
  agentId,
  confidence: 0.85
}));
\`\`\`

### Error Handling

\`\`\`javascript
try {
  await sqlite.memoryAdapter.set(key, value, { aclLevel: 1 });
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    await retryWithBackoff(() => sqlite.memoryAdapter.set(key, value, { aclLevel: 1 }));
  } else if (error.code === 'SQLITE_LOCKED') {
    await waitForLockRelease(key);
  } else {
    console.error('SQLite failure:', error);
    // Fallback to Redis for non-critical data
    await redis.set(key, JSON.stringify(value));
  }
}
\`\`\`
```

**Priority:** HIGH (affects 15 agents, critical for audit trail)

---

### B. Coordinator Agents (All 12 Coordinators)

**Required Additions:**

1. **Frontmatter Updates:**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - blocking-coordination-validator  # Coordinator-specific
type: coordinator  # Ensure type is set
acl_level: 3  # Swarm
lifecycle:
  pre_task: "sqlite-cli exec 'INSERT INTO agents ...'"
  post_task: "sqlite-cli exec 'UPDATE agents ...'"
```

2. **Body Additions:**
```markdown
## Blocking Coordination Integration (Coordinators)

### Initialize Coordination Components

\`\`\`typescript
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals.js';
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler.js';

const signals = new BlockingCoordinationSignals({
  redis,
  swarmId,
  coordinatorId,
  hmacSecret: process.env.BLOCKING_COORDINATION_SECRET  // MANDATORY env var
});

const timeoutHandler = new CoordinatorTimeoutHandler({
  redis,
  swarmId,
  coordinatorId,
  timeout: 20 * 60 * 1000  // 20 minutes
});

// Start heartbeat (5s interval, 90s TTL)
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

### Error Handling

\`\`\`javascript
// Handle HMAC secret missing
if (!process.env.BLOCKING_COORDINATION_SECRET) {
  throw new Error('BLOCKING_COORDINATION_SECRET environment variable required for coordinators');
}

// Handle Redis connection loss
try {
  await signals.sendSignal(signalData);
} catch (error) {
  if (error.code === 'REDIS_CONNECTION_LOST') {
    // Store signal in SQLite for retry
    await sqlite.query(\`
      INSERT INTO pending_signals (coordinator_id, target_agent, signal_data, created_at)
      VALUES (?, ?, ?, datetime('now'))
    \`, [coordinatorId, targetAgentId, JSON.stringify(signalData)]);
  }
}
\`\`\`
```

**Priority:** CRITICAL (enables blocking coordination, affects 12 agents)

---

### C. Validator Agents (Reviewer, Tester, Security-Specialist, etc.)

**Required Additions:**

1. **Frontmatter Updates:**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator  # For testers
acl_level: 3  # Swarm
lifecycle:
  pre_task: "sqlite-cli exec 'INSERT INTO agents ...'"
  post_task: "sqlite-cli exec 'UPDATE agents ...'"
```

2. **Body Additions:**
```markdown
## CFN Loop 2 Consensus Validation

### Read Loop 3 Results

\`\`\`typescript
// Retrieve all Loop 3 implementation results
const loop3Results = await sqlite.memoryAdapter.getPattern(
  \`cfn/phase-\${phaseId}/loop3/*\`,
  { aclLevel: 3 }  // Swarm-level access
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

**Priority:** HIGH (enables Loop 2 validation, affects 8+ agents)

---

### D. Product Owner Agent (CFN Loop 4)

**Required Additions:**

1. **Frontmatter Updates:**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
type: strategic  # Or cfn-loop
acl_level: 4  # Project (strategic decisions)
lifecycle:
  pre_task: "sqlite-cli exec 'INSERT INTO agents ...'"
  post_task: "sqlite-cli exec 'UPDATE agents ...'"
```

2. **Body Additions:**
```markdown
## Loop 4 GOAP Decision with Memory Persistence

### Read All Loop Data

\`\`\`typescript
// Read Loop 3 implementation results (ACL: Private → Swarm)
const loop3Data = await sqlite.memoryAdapter.getPattern(
  \`cfn/phase-\${phaseId}/loop3/*\`,
  { aclLevel: 3 }  // Swarm access required to read Loop 3 Private data
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

**Priority:** CRITICAL (enables CFN Loop 4, only 1 agent but essential)

---

### E. SPARC Methodology Agents (4 agents)

**Required Additions:**

Similar to implementers but with methodology-specific patterns:
- specification: ACL 3 (Swarm), requirements documentation persistence
- pseudocode: ACL 1 (Private), algorithm design notes
- architecture: ACL 3 (Swarm), ADRs with 1 year retention
- refinement: ACL 1 (Private), refactoring notes with test results

**Priority:** MEDIUM (affects 4 agents, specialized use cases)

---

## Implementation Timeline

### Phase 1: Critical Foundation (Week 1)

**Days 1-2: Core Implementers (Priority 1)**
- coder, backend-dev, mobile-dev (3 agents)
- Update frontmatter + SQLite lifecycle + CFN Loop 3 integration
- Test with sample tasks to validate hook execution
- **Deliverable:** 3 fully compliant implementer agents

**Days 3-4: Coordinators (Priority 1)**
- coordinator, hierarchical-coordinator, adaptive-coordinator (3 agents)
- Add blocking coordination imports + Signal ACK patterns
- Test with multi-agent coordination scenarios
- **Deliverable:** 3 fully compliant coordinator agents with blocking coordination

**Day 5: Product Owner (Priority 1)**
- product-owner (1 agent)
- Add CFN Loop 4 GOAP decision patterns + 365-day retention
- Test with Loop 2 consensus → Loop 4 decision workflow
- **Deliverable:** 1 fully compliant strategic agent

**Week 1 Validation:**
- Run all 4 validators on updated agents
- Execute integration tests for CFN Loop 3→2→4 workflow
- Verify SQLite persistence and ACL enforcement
- **Target:** 100% validation pass rate for 7 critical agents

---

### Phase 2: Validators & Testers (Week 2)

**Days 1-2: Validator Agents (Priority 2)**
- reviewer, security-specialist, analyst (3 agents)
- Add CFN Loop 2 validation patterns + consensus vote persistence
- Test with Loop 3 results → Loop 2 validation workflow
- **Deliverable:** 3 fully compliant validator agents

**Days 3-4: Tester Agents (Priority 2)**
- tester, playwright-agent, tdd-london-swarm (3 agents)
- Add test coverage validator integration
- Test with code → test → coverage validation workflow
- **Deliverable:** 3 fully compliant tester agents

**Day 5: Remaining Coordinators (Priority 2)**
- mesh-coordinator, byzantine-coordinator, raft-manager, quorum-manager (4 agents)
- Add blocking coordination patterns
- Test with consensus protocol scenarios
- **Deliverable:** 4 additional coordinator agents

**Week 2 Validation:**
- Run validators on all Week 2 agents
- Execute chaos tests (coordinator death, agent crash recovery)
- Verify Loop 2 consensus calculation
- **Target:** 100% validation pass rate for 10 additional agents

---

### Phase 3: Specialized & SPARC (Week 3)

**Days 1-2: Specialized Agents (Priority 3)**
- architect, system-architect, goal-planner, devops-engineer (4 agents)
- Add appropriate ACL levels and retention policies
- Test with cross-agent collaboration scenarios
- **Deliverable:** 4 fully compliant specialized agents

**Days 3: SPARC Methodology (Priority 3)**
- specification, pseudocode, architecture, refinement (4 agents)
- Add SPARC-specific memory patterns
- Test with SPARC workflow (specification → pseudocode → architecture → refinement)
- **Deliverable:** 4 fully compliant SPARC agents

**Days 4-5: Remaining Agents (Priority 3)**
- All remaining agents (~20): researcher, planner, api-docs, ui-designer, etc.
- Batch update with appropriate ACL levels
- Test with representative scenarios
- **Deliverable:** All remaining agents compliant

**Week 3 Validation:**
- Full regression test suite across all 41 agents
- Performance benchmarking (hook execution time <5s)
- SQLite persistence stress testing (concurrent writes)
- ACL enforcement verification (0% violation rate)
- **Target:** 100% of agents compliant, all tests passing

---

## Testing & Validation Strategy

### 1. Pre-Update Checklist (Per Agent)

```markdown
- [ ] Read agent file completely
- [ ] Identify agent category (implementer/coordinator/validator/strategic)
- [ ] Determine appropriate ACL level (1/3/4)
- [ ] Identify required validation_hooks (2-4 hooks)
- [ ] Determine CFN Loop participation (Loop 3/2/4)
- [ ] Check if coordinator (needs blocking-coordination-validator)
- [ ] Identify memory patterns needed
```

### 2. Update Validation (Per Agent)

**Automated Validation:**
```bash
# Run agent-template-validator on updated agent
node config/hooks/post-edit-agent-template.js .claude/agents/core-agents/coder.md

# Expected: 0 violations, all patterns present
```

**Manual Validation:**
```yaml
Checklist:
  - [ ] validation_hooks array present in frontmatter
  - [ ] lifecycle.pre_task and post_task present
  - [ ] acl_level declared (matches agent type)
  - [ ] SQLite lifecycle hooks documented in body
  - [ ] Error handling patterns present
  - [ ] Memory key patterns documented
  - [ ] CFN Loop integration (if applicable)
  - [ ] Blocking coordination (if coordinator)
```

### 3. Integration Testing

**Test Scenarios:**

**Scenario 1: Implementer Lifecycle**
```bash
# 1. Spawn coder agent
# 2. Execute code implementation task
# 3. Verify SQLite agent registration
sqlite-cli "SELECT * FROM agents WHERE type='coder' ORDER BY spawned_at DESC LIMIT 1"
# 4. Verify confidence score persistence
sqlite-cli "SELECT * FROM memory WHERE key LIKE 'agent/%/confidence/%' ORDER BY created_at DESC LIMIT 1"
# 5. Verify agent completion
sqlite-cli "SELECT * FROM agents WHERE status='completed' ORDER BY completed_at DESC LIMIT 1"
```

**Scenario 2: Coordinator Signal ACK**
```bash
# 1. Spawn coordinator agent
# 2. Spawn 2 implementer agents
# 3. Coordinator sends wake signal to implementer
# 4. Verify signal receipt via Redis
redis-cli keys "signal:*"
# 5. Verify ACK received
redis-cli keys "ack:*"
# 6. Verify timeout handling (kill implementer, check coordinator response)
```

**Scenario 3: CFN Loop 3→2→4**
```bash
# 1. Execute CFN Loop phase
# 2. Verify Loop 3 results in SQLite
sqlite-cli "SELECT * FROM memory WHERE key LIKE 'cfn/%/loop3/%'"
# 3. Verify Loop 2 consensus in SQLite
sqlite-cli "SELECT * FROM consensus WHERE loop=2 ORDER BY timestamp DESC LIMIT 1"
# 4. Verify Loop 4 decision in SQLite
sqlite-cli "SELECT * FROM memory WHERE key LIKE 'cfn/%/loop4/decision'"
# 5. Verify ACL enforcement (try to access Private data with wrong agent)
```

### 4. Performance Testing

**Metrics to Track:**
```yaml
Hook Execution Time:
  agent-template-validator: <2s
  cfn-loop-memory-validator: <2s
  test-coverage-validator: <2s
  blocking-coordination-validator: <5s (includes agent review)
  composite_validation: <5s (all hooks)

SQLite Operations:
  agent_registration: <50ms
  confidence_persistence: <50ms
  consensus_vote: <100ms
  goap_decision: <200ms

Redis Operations:
  signal_send: <10ms
  ack_wait: <5000ms (5s timeout acceptable)
  pub_sub_latency: <100ms

ACL Enforcement:
  read_allowed: <10ms
  read_denied: <10ms (immediate rejection)
  violation_detection: <5ms
```

### 5. Chaos Testing

**Failure Scenarios:**
```yaml
Scenario 1: Agent Crash
  - Kill agent process mid-task
  - Verify recovery from SQLite checkpoint
  - Verify no data loss
  - Target: >95% successful recovery

Scenario 2: Redis Connection Loss
  - Disconnect Redis mid-coordination
  - Verify fallback to SQLite
  - Verify signal retry
  - Target: >99% message delivery

Scenario 3: SQLite Lock Contention
  - Spawn 10 concurrent agents
  - All write to SQLite simultaneously
  - Verify retry with exponential backoff
  - Target: 0 deadlocks, <2% retry failures

Scenario 4: Coordinator Death
  - Kill coordinator process
  - Verify heartbeat timeout detection
  - Verify work transfer to new coordinator
  - Target: <120s detection, >90% work transfer success
```

---

## Success Criteria

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

### Validation Requirements

- ✅ Agent template validation pass rate: 100%
- ✅ CFN Loop ACL compliance rate: 100%
- ✅ Test coverage thresholds met: ≥80% line, ≥75% branch
- ✅ Blocking coordination pattern correctness: 100% (coordinators)
- ✅ Hook execution time: <5s composite
- ✅ False positive rate: <2%

---

## Risk Management

### High Risk Items

**Risk 1: Breaking Changes to Existing Agents**
- **Impact:** HIGH (affects all 41 agents)
- **Likelihood:** MEDIUM
- **Mitigation:**
  - Create backup copies of all agents before updating
  - Update in phases (Week 1: 7 critical, Week 2: 10, Week 3: 24)
  - Test each agent after update with representative tasks
  - Maintain rollback capability

**Risk 2: SQLite Performance Degradation**
- **Impact:** HIGH (affects all operations)
- **Likelihood:** LOW-MEDIUM
- **Mitigation:**
  - Performance benchmarking after each phase
  - Load testing with 10+ concurrent agents
  - Monitor p95 latency (target <50ms)
  - Implement connection pooling if needed

**Risk 3: Coordinator Blocking Coordination Complexity**
- **Impact:** HIGH (affects 12 coordinators, CFN Loop)
- **Likelihood:** MEDIUM
- **Mitigation:**
  - Detailed examples in handoff guide
  - Test with blocking-coordination-validator
  - Chaos testing (coordinator death scenarios)
  - Comprehensive error handling patterns

### Medium Risk Items

**Risk 4: ACL Level Misconfigurations**
- **Impact:** MEDIUM (data exposure or access denial)
- **Likelihood:** MEDIUM
- **Mitigation:**
  - Clear ACL matrix (implementers=1, validators=3, strategic=4)
  - Automated validation via cfn-loop-memory-validator
  - Integration tests for ACL enforcement
  - Zero tolerance for violations in production

**Risk 5: Hook Execution Time Exceeds 5s**
- **Impact:** MEDIUM (developer experience)
- **Likelihood:** LOW
- **Mitigation:**
  - WASM acceleration for pattern matching (52x speedup)
  - Parallel hook execution where independent
  - Incremental validation with caching (70% hit rate target)
  - Performance profiling and optimization

---

## Next Steps

### Immediate Actions (Next 24 Hours)

1. **Create Update Templates:**
   - Template for implementers (ACL 1, 3 validators)
   - Template for coordinators (ACL 3, 4 validators, blocking coordination)
   - Template for validators (ACL 3, 3 validators, Loop 2 patterns)
   - Template for strategic (ACL 4, 2 validators, Loop 4 patterns)

2. **Setup Testing Infrastructure:**
   - Create test database with agents, consensus, audit_log tables
   - Setup Redis instance for signal testing
   - Create chaos testing scripts
   - Setup performance monitoring

3. **Begin Phase 1:**
   - Update coder.md (implementer)
   - Update coordinator.md (coordinator)
   - Update product-owner.md (strategic)
   - Run validation suite
   - Execute integration tests

### Communication Plan

**Stakeholders:**
- Development team: Daily updates on progress
- QA team: Testing requirements and results
- DevOps team: Infrastructure requirements (Redis, SQLite)
- Product team: Timeline and deliverables

**Reporting:**
- Daily: Progress updates (agents completed, tests passing)
- Weekly: Phase completion reports with metrics
- Final: Comprehensive completion report with benchmarks

---

## Conclusion

This master plan provides a systematic approach to updating all 41 agent types with SQLite/Redis/CLI integration and hook validation alignment. The phased approach (Week 1: Critical 7, Week 2: Additional 10, Week 3: Remaining 24) ensures:

1. **Risk Mitigation:** Test critical agents first, iterate on patterns
2. **Quality Assurance:** Comprehensive validation at each phase
3. **Maintainability:** Clear templates and patterns for future agents
4. **Compliance:** 100% audit trail coverage, ACL enforcement
5. **Performance:** <5s validation, <50ms SQLite operations

**Estimated Completion:** 3 weeks (15 business days)
**Success Criteria:** All 41 agents compliant, all tests passing, zero ACL violations

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-11
**Next Review:** After Week 1 completion (Day 5)
**Maintained By:** Claude Flow Core Team
