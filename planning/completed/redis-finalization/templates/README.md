# Agent Update Templates

**Version:** 1.0.0
**Date:** 2025-10-11
**Purpose:** Standardized templates for updating all 41 agent types with SQLite/Redis/CLI integration

---

## Overview

This directory contains **4 reusable templates** for updating agent prompt files with:
- SQLite memory persistence (lifecycle hooks, audit trail)
- Blocking coordination patterns (Signal ACK protocol for coordinators)
- CFN Loop memory patterns (Loop 3/2/4 data persistence)
- Validation hook integration (4 production-ready validators)

---

## Template Files

### 1. **implementer-template.md** (ACL 1, 3 validators)
**Agent Types:** Coder, Backend-Dev, Mobile-Dev, Tester, etc. (15 agents)

**Key Features:**
- ACL Level 1 (Private) - Agent-scoped data
- CFN Loop 3 integration (implementation confidence reporting)
- 3 validators: agent-template, cfn-loop-memory, test-coverage
- SQLite lifecycle hooks (spawn, update, terminate)
- Error handling patterns (retry, fallback)
- Memory key patterns for implementer data

**Use When:**
- Agent implements code, tests, or deliverables
- Agent participates in CFN Loop 3 (implementation phase)
- Agent needs to store private confidence scores and notes

---

### 2. **coordinator-template.md** (ACL 3, 4 validators, blocking coordination)
**Agent Types:** Coordinator, Hierarchical-Coordinator, Mesh-Coordinator, etc. (12 agents)

**Key Features:**
- ACL Level 3 (Swarm) - Multi-agent coordination data
- Blocking coordination integration (Signal ACK protocol)
- 4 validators: agent-template, cfn-loop-memory, test-coverage, blocking-coordination
- HMAC secret validation (BLOCKING_COORDINATION_SECRET env var)
- Heartbeat broadcasting (5s interval, 90s TTL)
- Dead coordinator detection and work transfer
- Signal ACK patterns (sendSignal, waitForAck, timeout handling)

**Use When:**
- Agent coordinates multiple other agents
- Agent orchestrates CFN Loop workflows (Loop 3→2→4)
- Agent needs to send wake signals to validators
- Agent requires timeout enforcement and health monitoring

---

### 3. **validator-template.md** (ACL 3, 3 validators, Loop 2 patterns)
**Agent Types:** Reviewer, Security-Specialist, Tester, Analyst, etc. (8+ agents)

**Key Features:**
- ACL Level 3 (Swarm) - Validation team shared data
- CFN Loop 2 integration (consensus validation)
- 3 validators: agent-template, cfn-loop-memory, test-coverage
- Loop 3 results reading patterns (ACL elevation)
- Validation vote persistence (immutable consensus table)
- Consensus calculation (≥0.90 = pass, <0.90 = retry)
- Recommendation persistence with structured format

**Use When:**
- Agent validates implementation quality
- Agent participates in CFN Loop 2 (consensus validation)
- Agent needs to read Loop 3 Private data with Swarm ACL elevation
- Agent contributes to consensus calculation

---

### 4. **strategic-template.md** (ACL 4, 2 validators, Loop 4 patterns)
**Agent Types:** Product-Owner, Goal-Planner (2 agents)

**Key Features:**
- ACL Level 4 (Project) - Strategic decisions
- CFN Loop 4 integration (GOAP decision making)
- 2 validators: agent-template, cfn-loop-memory
- 365-day retention policy (compliance requirement)
- Reading Loop 3+2 data patterns (ACL elevation to Project level)
- GOAP decision persistence (PROCEED/DEFER/ESCALATE)
- Backlog item creation and phase transition

**Use When:**
- Agent makes strategic GOAP decisions
- Agent participates in CFN Loop 4 (Product Owner gate)
- Agent needs to read all loop data (Loop 3 Private, Loop 2 Swarm)
- Agent requires 365-day retention for compliance

---

## Usage Guide

### Step 1: Choose Template

**Decision Matrix:**

| Agent Category | Template | ACL Level | Validators | CFN Loop |
|----------------|----------|-----------|------------|----------|
| **Implementers** | implementer-template.md | 1 (Private) | 3 | Loop 3 |
| **Coordinators** | coordinator-template.md | 3 (Swarm) | 4 | Multi-loop orchestration |
| **Validators** | validator-template.md | 3 (Swarm) | 3 | Loop 2 |
| **Strategic** | strategic-template.md | 4 (Project) | 2 | Loop 4 |

### Step 2: Replace Placeholders

Each template contains placeholders marked with `${PLACEHOLDER_NAME}`. Replace these with agent-specific values:

**Common Placeholders (All Templates):**
```bash
${AGENT_NAME}                    # e.g., "Backend Developer"
${AGENT_TYPE}                    # e.g., "backend-dev"
${AGENT_ROLE}                    # e.g., "senior backend developer"
${PRIMARY_USE_CASE}              # e.g., "implementing RESTful APIs"
${SPECIFIC_SCENARIOS}            # e.g., "Node.js services, Express middleware"
${TRIGGER_PHRASES}               # e.g., "build API, implement backend"
${COMMA_SEPARATED_KEYWORDS}      # e.g., "backend, api, node, express, rest"
${COLOR}                         # e.g., "green", "blue", "#E74C3C"
${CAPABILITY_1/2/3}              # e.g., "coding", "testing", "refactoring"
```

**Implementer-Specific Placeholders:**
```bash
${FILE_1/2/3}                    # e.g., "auth.js", "auth.test.js"
${REASONING_TEXT}                # e.g., "Tests pass, security clean"
${DETAILED_REASONING}            # e.g., "All tests pass (100% coverage), HMAC implemented"
${AGENT_SPECIFIC_RESPONSIBILITIES} # Agent-specific duties
${AGENT_SPECIFIC_METHODOLOGY}    # Agent-specific approach
```

**Coordinator-Specific Placeholders:**
```bash
${COORDINATION_SCOPE}            # e.g., "hierarchical team coordination"
${SWARM_ID}                      # e.g., "swarm-auth-phase"
${COORDINATOR_ID}                # e.g., "coordinator-1"
${TARGET_AGENT_ID}               # e.g., "reviewer-1"
${SIGNAL_DATA}                   # e.g., "phase: 'auth', files: [...]"
${SIGNAL_REASON}                 # e.g., "Loop 3 complete, ready for validation"
${TIMEOUT_MS}                    # e.g., "300000" (5 minutes)
${COORDINATOR_SPECIFIC_RESPONSIBILITIES}
${COORDINATOR_SPECIFIC_METHODOLOGY}
```

**Validator-Specific Placeholders:**
```bash
${VALIDATION_DOMAIN}             # e.g., "security analysis, vulnerability detection"
${VALIDATION_REASONING}          # e.g., "Security excellent (0.92), minor doc gaps"
${RECOMMENDATION_1/2}            # e.g., "Add .env.example entry"
${ISSUE_DESCRIPTION}             # e.g., "SQL injection risk in auth.js:45"
${FIX_RECOMMENDATION}            # e.g., "Use parameterized queries"
${AFFECTED_FILE}                 # e.g., "auth.js"
${VALIDATOR_SPECIFIC_RESPONSIBILITIES}
${VALIDATOR_SPECIFIC_METHODOLOGY}
```

**Strategic-Specific Placeholders:**
```bash
${STRATEGIC_SCOPE}               # e.g., "CFN Loop 4 GOAP decisions, backlog management"
${BACKLOG_ITEM_TITLE}            # e.g., "Add rate limiting to auth API"
${BACKLOG_ITEM_DESCRIPTION}      # e.g., "Implement rate limiting for auth endpoints"
${STRATEGIC_SPECIFIC_RESPONSIBILITIES}
${STRATEGIC_SPECIFIC_METHODOLOGY}
```

### Step 3: Validate Template

After replacing placeholders, validate the updated agent file:

```bash
# Run agent-template-validator
node config/hooks/post-edit-agent-template.js .claude/agents/[category]/[agent-name].md

# Expected: 0 violations, all patterns present
```

**Validation Checklist:**
- [ ] YAML frontmatter valid (no syntax errors)
- [ ] `validation_hooks` array present with correct validators
- [ ] `lifecycle.pre_task` and `lifecycle.post_task` present
- [ ] `acl_level` declared (matches agent type)
- [ ] SQLite lifecycle hooks documented in body
- [ ] Error handling patterns present
- [ ] Memory key patterns documented
- [ ] CFN Loop integration (if applicable)
- [ ] Blocking coordination imports (if coordinator)

### Step 4: Integration Testing

Test the updated agent with representative tasks:

**Implementer Testing:**
```bash
# Spawn agent
# Execute implementation task
# Verify SQLite agent registration
sqlite-cli "SELECT * FROM agents WHERE type='${AGENT_TYPE}' ORDER BY spawned_at DESC LIMIT 1"
# Verify confidence score persistence
sqlite-cli "SELECT * FROM memory WHERE key LIKE 'agent/%/confidence/%' ORDER BY created_at DESC LIMIT 1"
```

**Coordinator Testing:**
```bash
# Spawn coordinator
# Send wake signal to agent
# Verify signal receipt via Redis
redis-cli keys "signal:*"
# Verify ACK received
redis-cli keys "ack:*"
# Verify heartbeat broadcasting
redis-cli keys "coordinator:*:heartbeat"
```

**Validator Testing:**
```bash
# Execute CFN Loop phase
# Verify Loop 3 results in SQLite
sqlite-cli "SELECT * FROM memory WHERE key LIKE 'cfn/%/loop3/%'"
# Verify Loop 2 consensus in SQLite
sqlite-cli "SELECT * FROM consensus WHERE loop=2 ORDER BY timestamp DESC LIMIT 1"
```

**Strategic Testing:**
```bash
# Execute CFN Loop 3→2 workflow
# Verify Loop 4 decision in SQLite
sqlite-cli "SELECT * FROM memory WHERE key LIKE 'cfn/%/loop4/decision'"
# Verify 365-day TTL
sqlite-cli "SELECT key, ttl_seconds FROM memory WHERE key LIKE 'cfn/%/loop4/decision'"
```

---

## ACL Level Guidelines

| ACL Level | Scope | Agent Types | Data Examples | Encryption |
|-----------|-------|-------------|---------------|------------|
| **1 (Private)** | Agent-scoped | Implementers | Confidence scores, implementation notes | AES-256-GCM |
| **3 (Swarm)** | Validation team | Validators, Coordinators | Review feedback, consensus votes, signals | None |
| **4 (Project)** | Strategic | Product Owner | GOAP decisions (365d retention) | None |
| **5 (System)** | Infrastructure | System agents | Audit logs (2-year retention) | AES-256-GCM |

---

## Validation Hooks by Template

### Implementer (3 hooks)
1. **agent-template-validator** - SQLite lifecycle, ACL, error handling
2. **cfn-loop-memory-validator** - Loop 3 memory patterns
3. **test-coverage-validator** - ≥80% line, ≥75% branch coverage

### Coordinator (4 hooks)
1. **agent-template-validator** - SQLite lifecycle, ACL, error handling
2. **cfn-loop-memory-validator** - Loop 3→2→4 orchestration patterns
3. **test-coverage-validator** - Coordination protocol tests
4. **blocking-coordination-validator** - Signal ACK, HMAC secrets, timeouts

### Validator (3 hooks)
1. **agent-template-validator** - SQLite lifecycle, ACL, error handling
2. **cfn-loop-memory-validator** - Loop 2 consensus validation patterns
3. **test-coverage-validator** - Validation test patterns

### Strategic (2 hooks)
1. **agent-template-validator** - SQLite lifecycle, ACL Level 4, error handling
2. **cfn-loop-memory-validator** - Loop 4 GOAP decision patterns, 365-day retention

---

## Memory Key Pattern Reference

### Implementers (ACL 1)
```javascript
// Standard agent memory
`agent/${agentId}/confidence/${taskId}`        // Confidence scores
`agent/${agentId}/notes/${taskId}`             // Implementation notes
`agent/${agentId}/changes/${taskId}`           // File changes

// CFN Loop 3 memory
`cfn/phase-${phaseId}/loop3/agent-${agentId}`  // Loop 3 implementation results
```

### Coordinators (ACL 3)
```javascript
// Coordinator state
`coordinator/${coordinatorId}/state/${phaseId}`       // Workflow state
`coordinator/${coordinatorId}/assignments/${phaseId}` // Agent assignments
`coordinator/${coordinatorId}/signals/${targetAgentId}` // Signal tracking
```

### Validators (ACL 3)
```javascript
// Validator progress
`validator/${validatorId}/progress/${phaseId}` // Validation progress
`validator/${validatorId}/findings/${phaseId}` // Validation findings

// CFN Loop 2 memory
`cfn/phase-${phaseId}/loop2/recommendations`   // Consolidated recommendations
```

### Strategic (ACL 4)
```javascript
// GOAP decisions (365-day retention)
`cfn/phase-${phaseId}/loop4/decision`          // GOAP decision
`cfn/phase-${phaseId}/loop4/metadata`          // Decision metadata

// Backlog items (365-day retention)
`cfn/backlog/item-${itemId}`                   // Backlog item details
`cfn/backlog/index`                            // Backlog index

// Phase transitions
`cfn/phase-${phaseId}/transition`              // Phase transition record
```

---

## Error Handling Patterns

### SQLite Write Failures
```javascript
try {
  await sqlite.memoryAdapter.set(key, value, { aclLevel });
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    await retryWithBackoff(() => sqlite.memoryAdapter.set(key, value, { aclLevel }));
  } else if (error.code === 'SQLITE_LOCKED') {
    await waitForLockRelease(key);
  } else {
    console.error('SQLite failure:', error);
    // Fallback to Redis for non-critical data
    await redis.set(key, JSON.stringify(value));
  }
}
```

### Redis Connection Loss
```javascript
try {
  await redis.publish(channel, message);
} catch (error) {
  console.error('Redis publish failed:', error);
  // Store event in SQLite for later replay
  await sqlite.query(`
    INSERT INTO pending_events (channel, message, created_at, retry_count)
    VALUES (?, ?, datetime('now'), 0)
  `, [channel, message]);
}
```

### Coordinator Death Detection
```javascript
const isAlive = await timeoutHandler.checkCoordinatorHealth();
if (!isAlive) {
  await redis.publish('coordinator:dead', JSON.stringify({
    deadCoordinatorId: coordinatorId,
    detectedBy: myAgentId,
    timestamp: Date.now()
  }));
  // Wait for new coordinator assignment
  const newCoordinator = await waitForNewCoordinator(60000);
}
```

---

## Performance Targets

### SQLite Operations
- Agent registration: <50ms (p95)
- Confidence persistence: <50ms (p95)
- Consensus vote: <100ms (p95)
- GOAP decision: <200ms (p95)

### Coordination Operations
- Signal ACK latency: <5s (p95)
- Dead coordinator detection: <120s (heartbeat TTL + grace)
- Work transfer: <60s (new coordinator assignment)

### Validation Operations
- Hook execution time: <5s (composite, all hooks)
- Individual validator: <2s (WASM-accelerated)
- False positive rate: <2%

---

## Migration Timeline Reference

### Week 1: Core Implementers (5 agents)
- Coder, Backend-Dev, Mobile-Dev (Days 1-2)
- Coordinator, Product-Owner (Days 3-5)

### Week 2: Validators & Testers (10 agents)
- Reviewer, Security-Specialist, Analyst (Days 1-2)
- Tester, Playwright-Agent (Days 3-4)
- Remaining Coordinators (Day 5)

### Week 3: Specialized & Final (24 agents)
- Specialized Agents (Days 1-2)
- SPARC Methodology (Day 3)
- Remaining Agents (Days 4-5)

---

## Resources

### Architecture Documents
- `AGENT_UPDATE_MASTER_PLAN.md` - Master plan for all 41 agent updates
- `AGENT_PROMPT_REWRITE_HANDOFF.md` - Integration patterns and examples
- `.claude/agents/CLAUDE.md` - Agent design principles and format guidelines

### Code Examples
- `src/cfn-loop/blocking-coordination-signals.ts` - Signal ACK implementation
- `src/cfn-loop/coordinator-timeout-handler.ts` - Timeout handling
- `src/sqlite/memory-adapter.ts` - SQLite memory integration

### Testing Resources
- `src/cfn-loop/__tests__/` - Unit test examples
- `tests/integration/` - Integration test suite
- `tests/chaos/` - Chaos test scenarios

---

## Support

### Questions & Escalation
- **Architecture Questions:** System Architect Team
- **Security Questions:** Security Specialist Team
- **Performance Issues:** Performance Engineering Team
- **Urgent Blockers:** Product Owner escalation path

### Validation Issues
- Hook execution failures: Check WASM compilation (`node config/hooks/validate-wasm.js`)
- ACL violations: Review ACL matrix and agent type mappings
- SQLite errors: Check database integrity (`sqlite-cli "PRAGMA integrity_check"`)
- Redis errors: Check connection (`redis-cli ping`)

---

**Template Version:** 1.0.0
**Last Updated:** 2025-10-11
**Maintained By:** Claude Flow Core Team
**Next Review:** After Week 1 completion (5 agents updated)
