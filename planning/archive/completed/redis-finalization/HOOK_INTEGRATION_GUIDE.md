# Hook Integration Guide for Agent Validation

**Version:** 1.0.0
**Last Updated:** 2025-10-11
**Status:** Production-Ready

This guide provides practical guidance for integrating the 4 production-ready validation hooks into agent workflows. Use this as your reference for understanding what each validator checks, how to write compliant code, and how to troubleshoot validation failures.

---

## Table of Contents

1. [Overview of Production Validators](#overview-of-production-validators)
2. [Hook Execution Model](#hook-execution-model)
3. [Validator Specifications](#validator-specifications)
4. [Agent Category Mapping](#agent-category-mapping)
5. [Compliance Checklists](#compliance-checklists)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Performance Optimization](#performance-optimization)
8. [Hook Composition Patterns](#hook-composition-patterns)

---

## Overview of Production Validators

### The 4 Production-Ready Validators

| Priority | Validator | Automation | Scope | Execution Time |
|----------|-----------|------------|-------|----------------|
| **1** | Agent Template Validator | 95% | All 41 agent types | <2s (WASM) |
| **2** | CFN Loop Memory Pattern | 90% | CFN Loop operations | <1s |
| **3** | Test Coverage Validator | 100% | Test execution | <500ms |
| **4** | Blocking Coordination | 60% | 12 coordinators | <2s |

**Combined execution time:** <5s (parallel) or ~8s (sequential)

### Automation Breakdown

```
Total validation coverage: 85% automated
├── Pattern detection: 95% (validators 1,2,3)
├── Quantitative metrics: 100% (validator 3)
├── Semantic validation: 40% automated + 15% agent collaboration (validator 4)
└── Manual review required: 15% (complex state machines, timeout rationale)
```

---

## Hook Execution Model

### Trigger Mechanisms

Each validator triggers based on specific file patterns and operations:

```yaml
# Validator 1: Agent Template Validator
trigger_pattern: ".claude/agents/**/*.md"
trigger_event: "file_save"
auto_execute: true

# Validator 2: CFN Loop Memory Pattern
trigger_pattern: "*.{js,ts,py,rs,go}"
trigger_event: "memory.set() detected in code"
auto_execute: true

# Validator 3: Test Coverage Validator
trigger_pattern: "**/*.test.{js,ts,py,rs,go}"
trigger_event: "test_execution_complete"
auto_execute: true

# Validator 4: Blocking Coordination
trigger_pattern: "**/*coordinator*.{js,ts,md}"
trigger_event: "BlockingCoordinationSignals import detected"
auto_execute: true
```

### Execution Flow

```
File Edit Event
     │
     ├─→ File type detection
     │   │
     │   ├─→ Agent template? → Validator 1 (Agent Template)
     │   ├─→ Contains memory.set()? → Validator 2 (CFN Loop Memory)
     │   ├─→ Test file? → Validator 3 (Test Coverage)
     │   └─→ Coordinator file? → Validator 4 (Blocking Coordination)
     │
     ├─→ Parallel execution (independent validators)
     │   │
     │   ├─→ Pattern detection (WASM accelerated)
     │   ├─→ Rule matching (deterministic)
     │   └─→ Metric calculation (quantitative)
     │
     ├─→ Result aggregation
     │   │
     │   ├─→ Violations (errors)
     │   ├─→ Warnings (should fix)
     │   └─→ Recommendations (best practices)
     │
     └─→ Output structured JSON + human-readable report
```

### Manual Invocation

```bash
# Single validator
node config/hooks/post-edit-agent-template.js .claude/agents/coder.md --json

# Composite hook (all applicable validators)
npx claude-flow@alpha hooks post-edit [FILE_PATH] \
  --memory-key "agent/step" \
  --structured

# With specific options
npx claude-flow@alpha hooks post-edit [FILE_PATH] \
  --minimum-coverage 85 \
  --tdd-mode \
  --spawn-reviewer  # For blocking coordination semantic validation
```

---

## Validator Specifications

### 1. Agent Template Validator (Priority 1)

**Purpose:** Ensures all agent templates follow SQLite lifecycle, ACL, and error handling best practices.

**Automation:** 95% (WASM-accelerated pattern matching)

#### What It Checks

✅ **SQLite Lifecycle Hooks**
- Agent spawn registration (`INSERT INTO agents`)
- Status/confidence updates (`UPDATE agents SET status=?, confidence=?`)
- Termination and cleanup (`UPDATE agents SET status='completed'`)

✅ **ACL Level Declarations**
- Implementers: ACL 1 (Private)
- Validators: ACL 3 (Swarm)
- Coordinators: ACL 3 (Swarm)
- Product Owner: ACL 4 (Project)

✅ **Error Handling Patterns**
- SQLite failure handling (`SQLITE_BUSY`, `SQLITE_LOCKED`)
- Redis connection loss handling
- Retry logic with exponential backoff
- Graceful degradation strategies

✅ **Blocking Coordination Imports** (Coordinators only)
- `BlockingCoordinationSignals` import
- `CoordinatorTimeoutHandler` import

#### Validation Patterns

```javascript
// Pattern detection (automated)
{
  sqliteLifecycle: {
    spawn: /INSERT\s+INTO\s+agents.*spawned_at/is,
    update: /UPDATE\s+agents\s+SET\s+.*(?:status|confidence)/is,
    terminate: /UPDATE\s+agents\s+SET\s+status\s*=\s*['"]completed/is
  },

  aclDeclarations: /aclLevel:\s*([1-5])|acl_level:\s*([1-5])/i,

  errorHandling: {
    sqlite: /catch\s*\([^)]*\)\s*\{[^}]*(?:SQLITE_BUSY|SQLITE_LOCKED)/is,
    redis: /catch\s*\([^)]*\)\s*\{[^}]*(?:REDIS_CONNECTION_LOST)/is
  },

  blockingCoordination: {
    imports: /import\s+\{[^}]*(?:BlockingCoordinationSignals|CoordinatorTimeoutHandler)[^}]*\}/i
  }
}
```

#### Common Violations & Fixes

**Violation:** Missing SQLite lifecycle hooks
```javascript
// ❌ Bad: No lifecycle hooks
class AgentImplementation {
  async execute() { /* work */ }
}

// ✅ Good: Complete lifecycle
class AgentImplementation {
  async execute() {
    // Spawn registration
    await sqlite.execute(`
      INSERT INTO agents (id, type, status, spawned_at)
      VALUES (?, ?, 'active', CURRENT_TIMESTAMP)
    `, [this.agentId, this.agentType]);

    /* work */

    // Termination
    await sqlite.execute(`
      UPDATE agents SET status = 'completed',
      completed_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [this.agentId]);
  }
}
```

**Violation:** Incorrect ACL level
```javascript
// ❌ Bad: Implementer using ACL 3 (exposes private data)
await sqlite.memoryAdapter.set(
  `agent/coder-1/confidence`,
  0.85,
  { aclLevel: 3 }  // Wrong! Should be 1 for implementers
);

// ✅ Good: Correct ACL level for agent type
await sqlite.memoryAdapter.set(
  `agent/coder-1/confidence`,
  0.85,
  { aclLevel: 1 }  // Private (implementer)
);
```

**Violation:** Missing error handling
```javascript
// ❌ Bad: No retry logic
await sqlite.memoryAdapter.set(key, value);

// ✅ Good: Retry with exponential backoff
async function writeWithRetry(key, value, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sqlite.memoryAdapter.set(key, value);
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 100));
      } else {
        throw error;
      }
    }
  }
}
```

#### Execution Example

```bash
$ node config/hooks/post-edit-agent-template.js .claude/agents/coder.md --verbose

🔍 Validating blocking coordination patterns in coder.md

📋 Agent: coder
🏷️  Category: implementer
🔒 Expected ACL: 1

🚀 WASM acceleration enabled

✅ SQLite Lifecycle: spawn ✅, update ✅, terminate ✅
✅ ACL Declaration: 1 (Private) ✅
⚠️  Error Handling: Basic (consider retry logic)

⏱️  Execution Time: 847ms (WASM 52x)
```

---

### 2. CFN Loop Memory Pattern Validator (Priority 2)

**Purpose:** Validates ACL correctness and memory key format for CFN Loop operations.

**Automation:** 90% (deterministic rule matching)

#### What It Checks

✅ **ACL Level Correctness**
- Loop 3 (Implementation): ACL 1 (Private), 30-day TTL
- Loop 2 (Validation): ACL 3 (Swarm), 90-day TTL
- Loop 4 (Decisions): ACL 4 (Project), 365-day TTL (compliance)

✅ **Memory Key Format**
- Pattern: `cfn/phase-{id}/loop{N}/{data}`
- Examples: `cfn/phase-auth/loop3/agent-coder-1/confidence`

✅ **TTL Retention Policies**
- Loop 3: 2592000s (30 days)
- Loop 2: 7776000s (90 days)
- Loop 4: 31536000s (365 days)

✅ **Encryption Requirements**
- Loop 3 private data: MUST be encrypted
- Loop 2/4 data: Optional (based on sensitivity)

#### ACL Rules (Deterministic Mapping)

```javascript
const ACL_RULES = {
  'cfn/phase-.*/loop3/.*': {
    requiredACL: 1,
    name: 'Private',
    ttl: 2592000,  // 30 days
    encryption: true
  },

  'cfn/phase-.*/loop2/.*': {
    requiredACL: 3,
    name: 'Swarm',
    ttl: 7776000,  // 90 days
    encryption: false
  },

  'cfn/phase-.*/loop4/.*': {
    requiredACL: 4,
    name: 'Project',
    ttl: 31536000,  // 365 days
    encryption: false,
    compliance: true
  }
};
```

#### Common Violations & Fixes

**Violation:** ACL mismatch
```javascript
// ❌ Bad: Loop 3 data using wrong ACL
await sqlite.memoryAdapter.set(
  'cfn/phase-auth/loop3/implementation',
  details,
  { aclLevel: 3, ttl: 2592000 }  // Should be ACL 1!
);

// ✅ Good: Correct ACL for Loop 3
await sqlite.memoryAdapter.set(
  'cfn/phase-auth/loop3/agent-coder-1/implementation',
  details,
  { aclLevel: 1, ttl: 2592000, encrypted: true }
);
```

**Violation:** TTL mismatch
```javascript
// ❌ Bad: Loop 4 with wrong retention (compliance violation)
await sqlite.memoryAdapter.set(
  'cfn/phase-auth/loop4/decision',
  'DEFER',
  { aclLevel: 4, ttl: 2592000 }  // Should be 365 days!
);

// ✅ Good: Compliance-correct TTL
await sqlite.memoryAdapter.set(
  'cfn/phase-auth/loop4/decision',
  'DEFER',
  { aclLevel: 4, ttl: 31536000 }  // 365 days (compliance)
);
```

**Violation:** Invalid key format
```javascript
// ❌ Bad: Doesn't follow CFN Loop pattern
await sqlite.memoryAdapter.set(
  'loop3/auth/data',  // Missing 'cfn/phase-' prefix
  value,
  { aclLevel: 1 }
);

// ✅ Good: Correct format
await sqlite.memoryAdapter.set(
  'cfn/phase-auth/loop3/agent-coder-1/confidence',
  value,
  { aclLevel: 1, ttl: 2592000 }
);
```

#### Execution Example

```bash
$ node config/hooks/post-edit-cfn-loop-memory.cjs src/cfn-loop/coordinator.ts --json

{
  "validator": "cfn-loop-memory-validator",
  "file": "src/cfn-loop/coordinator.ts",
  "valid": false,
  "violations": [
    {
      "type": "acl_mismatch",
      "line": 42,
      "key": "cfn/phase-auth/loop3/implementation",
      "expected": { "acl": 1, "name": "Private" },
      "actual": { "acl": 3 },
      "recommendation": "Loop 3 implementation data must use ACL Level 1 (Private)"
    }
  ],
  "validationCount": 3,
  "executionTime": "234ms"
}
```

---

### 3. Test Coverage Validator (Priority 3)

**Purpose:** Validates test coverage thresholds for edited files.

**Automation:** 100% (quantitative metrics)

#### What It Checks

✅ **Coverage Thresholds**
- Line coverage ≥ 80%
- Branch coverage ≥ 75%
- Function coverage ≥ 80%
- Statement coverage ≥ 80%

✅ **Framework Support**
- JavaScript/TypeScript: Jest, Vitest, Mocha
- Python: Pytest, unittest
- Go: go test with coverage
- Rust: cargo-tarpaulin

✅ **Test File Association**
- Finds corresponding test files
- Validates bidirectional coverage

#### Threshold Configuration

```javascript
// Default thresholds
const DEFAULT_THRESHOLDS = {
  line: 80,
  branch: 75,
  function: 80,
  statement: 80
};

// Per-file overrides (coverage.config.json)
{
  "thresholds": { "line": 80, "branch": 75 },
  "perFileThresholds": {
    "src/critical/.*": { "line": 90, "branch": 85 },
    "src/experimental/.*": { "line": 60, "branch": 50 }
  }
}
```

#### Common Violations & Fixes

**Violation:** Line coverage below threshold
```javascript
// Coverage report shows 72% line coverage (threshold: 80%)

// Fix: Add tests for uncovered lines
describe('Authentication', () => {
  // ❌ Missing: Error handling tests
  it('should handle invalid tokens', async () => {
    await expect(auth.verify('invalid')).rejects.toThrow();
  });

  // ❌ Missing: Edge case tests
  it('should handle empty credentials', async () => {
    await expect(auth.login('', '')).rejects.toThrow();
  });
});
```

**Violation:** Branch coverage below threshold
```javascript
// Function with untested branches
function processData(input) {
  if (input.type === 'A') {
    return handleA(input);
  } else if (input.type === 'B') {  // ❌ Branch not tested
    return handleB(input);
  }
  return defaultHandler(input);  // ❌ Branch not tested
}

// Fix: Test all branches
it('should handle type A', () => { /* test */ });
it('should handle type B', () => { /* test */ });  // ✅ Added
it('should handle default case', () => { /* test */ });  // ✅ Added
```

#### Execution Example

```bash
$ node config/hooks/post-test-coverage.js src/auth.js --line 85 --branch 80

📊 TEST COVERAGE VALIDATION REPORT
Status: ❌ FAILED

📈 COVERAGE METRICS:
  Line:      78% ❌ (threshold: 85%)
  Branch:    72% ❌ (threshold: 80%)
  Function:  85% ✅ (threshold: 80%)
  Statement: 78% ❌ (threshold: 80%)

💡 RECOMMENDATIONS:
  1. [HIGH] Increase line coverage from 78% to 85%
     Action: Add tests for uncovered lines 42-48, 67
     Gap: 7.0%

  2. [MEDIUM] Increase branch coverage from 72% to 80%
     Action: Add tests for uncovered if/else at line 42
     Gap: 8.0%
```

---

### 4. Blocking Coordination Validator (Priority 4)

**Purpose:** Validates coordinator-specific blocking coordination patterns.

**Automation:** 60% (pattern detection) + 15% (agent collaboration for semantic validation)

#### What It Checks

✅ **Required Imports** (95% automated)
- `BlockingCoordinationSignals` import
- `CoordinatorTimeoutHandler` import

✅ **Signal ACK Protocol** (95% automated)
- `sendSignal()` method present
- `waitForAck()` method present
- `receiveSignal()` method present
- `sendAck()` method present

✅ **HMAC Secret Validation** (95% automated)
- `process.env.BLOCKING_COORDINATION_SECRET` usage
- Secret validation on initialization

✅ **Timeout Configuration** (80% automated)
- ACK timeout: 5-60 seconds (recommended)
- Heartbeat interval: 10-120 seconds (recommended)

⚠️ **State Machine Logic** (40% automated, requires agent review)
- State complexity detection
- Transition validation
- Conditional logic analysis

#### Configuration Thresholds

```javascript
const CONFIG = {
  timeouts: {
    minAckTimeout: 5000,    // 5 seconds
    maxAckTimeout: 60000,   // 60 seconds
    minHeartbeat: 10000,    // 10 seconds
    maxHeartbeat: 120000    // 2 minutes
  },

  complexity: {
    maxStates: 5,           // >5 states = complex
    maxTransitions: 10,     // >10 transitions = complex
    maxConditionals: 8      // >8 conditionals = complex
  }
};
```

#### Common Violations & Fixes

**Violation:** Missing HMAC secret
```javascript
// ❌ Bad: No HMAC secret validation
const signals = new BlockingCoordinationSignals(coordinatorId);

// ✅ Good: HMAC secret from environment
const hmacSecret = process.env.BLOCKING_COORDINATION_SECRET;
if (!hmacSecret) {
  throw new Error('BLOCKING_COORDINATION_SECRET not configured');
}
const signals = new BlockingCoordinationSignals(coordinatorId, hmacSecret);
```

**Violation:** Incomplete Signal ACK protocol
```javascript
// ❌ Bad: Missing ACK wait
await signals.sendSignal('READY', targetAgentId);
// No waitForAck() - signal may be lost!

// ✅ Good: Complete ACK protocol
await signals.sendSignal('READY', targetAgentId);
const ack = await signals.waitForAck(requestId, 30000);
if (!ack) {
  throw new Error('ACK timeout - coordinator may be dead');
}
```

**Violation:** Timeout values outside recommended range
```javascript
// ❌ Bad: ACK timeout too long (70 seconds)
const ack = await signals.waitForAck(requestId, 70000);

// ✅ Good: Recommended timeout (30 seconds)
const ack = await signals.waitForAck(requestId, 30000);
```

**Violation:** Complex state machine (requires agent review)
```javascript
// ⚠️ Warning: High complexity detected
// States: 8, Transitions: 15, Conditionals: 12
// → Recommendation: Spawn reviewer agent for semantic validation

// Run with --spawn-reviewer flag:
// node config/hooks/post-edit-blocking-coordination.js coordinator.js --spawn-reviewer
```

#### Execution Example

```bash
$ node config/hooks/post-edit-blocking-coordination.js src/coordinator.js --verbose

═══════════════════════════════════════════════════════════════
  Blocking Coordination Validator - coordinator.js
═══════════════════════════════════════════════════════════════

✅ Status: VALID
⏱️  Execution Time: 1247ms

📋 Pattern Validation:
  • Required Imports:     ✅
  • Signal Methods:       ✅
  • HMAC Secret:          ✅
  • Heartbeat:            ✅
  • Timeout Handling:     ✅

📊 Complexity Metrics:
  • State Variables:      3
  • State Transitions:    5
  • Conditionals:         4
  • Complexity Score:     14.5

💡 Recommendations:
  🟢 [LOW] All blocking coordination patterns validated successfully

═══════════════════════════════════════════════════════════════
```

---

## Agent Category Mapping

### Validator Triggers by Agent Type

```yaml
implementers:
  category: "implementer"
  types: ["coder", "backend-dev", "frontend-dev", "mobile-dev"]
  acl_level: 1  # Private
  validators:
    - agent-template-validator  # ✅ Always
    - cfn-loop-memory-validator  # ✅ If using CFN Loop
    - test-coverage-validator  # ✅ Always

validators:
  category: "validator"
  types: ["reviewer", "security-specialist", "tester", "qa-engineer"]
  acl_level: 3  # Swarm
  validators:
    - agent-template-validator  # ✅ Always
    - cfn-loop-memory-validator  # ✅ If using CFN Loop
    - test-coverage-validator  # ✅ For testers only

coordinators:
  category: "coordinator"
  types: ["architect", "planner", "devops-engineer", "system-architect"]
  acl_level: 3  # Swarm
  validators:
    - agent-template-validator  # ✅ Always
    - cfn-loop-memory-validator  # ✅ If using CFN Loop
    - blocking-coordination-validator  # ✅ If imports BlockingCoordinationSignals

product_owner:
  category: "product-owner"
  types: ["product-owner"]
  acl_level: 4  # Project
  validators:
    - agent-template-validator  # ✅ Always
    - cfn-loop-memory-validator  # ✅ Always (CFN Loop 4)
```

### Trigger Decision Matrix

```
File Type Detection
        │
    ┌───┴────────────────────────────────────┐
    │                                        │
Agent Template (.md)           Source Code (.js/.ts/.py/.rs)
    │                                        │
    ├─→ Agent Template Validator             ├─→ Pattern Detection
    │                                        │
    └─→ Check agent type from frontmatter    ├─→ memory.set()? → CFN Loop Memory Validator
        │                                    │
        ├─→ Implementer (ACL 1)              ├─→ Test file? → Test Coverage Validator
        ├─→ Validator (ACL 3)                │
        ├─→ Coordinator (ACL 3)              └─→ BlockingCoordinationSignals import?
        │   └─→ Also trigger Blocking            └─→ Blocking Coordination Validator
        │       Coordination Validator
        └─→ Product Owner (ACL 4)
```

---

## Compliance Checklists

### For Implementers (Coder, Backend-Dev, Frontend-Dev)

**Agent Template Validator Checklist:**
- [ ] SQLite spawn registration: `INSERT INTO agents (id, type, status, spawned_at) VALUES (...)`
- [ ] SQLite status updates: `UPDATE agents SET status=?, confidence=?, updated_at=CURRENT_TIMESTAMP`
- [ ] SQLite termination: `UPDATE agents SET status='completed', completed_at=CURRENT_TIMESTAMP`
- [ ] ACL Level 1 declared: `aclLevel: 1` in memory operations
- [ ] Error handling for SQLite: Retry logic for `SQLITE_BUSY`, `SQLITE_LOCKED`
- [ ] Error handling for Redis: Graceful degradation for `REDIS_CONNECTION_LOST`

**CFN Loop Memory Validator Checklist** (if using CFN Loop):
- [ ] Loop 3 keys use ACL 1: `cfn/phase-{id}/loop3/agent-{id}/{metric}` with `aclLevel: 1`
- [ ] Loop 3 TTL is 30 days: `ttl: 2592000`
- [ ] Loop 3 data encrypted: `encrypted: true`
- [ ] Memory key format valid: `cfn/phase-{id}/loop{N}/...`

**Test Coverage Validator Checklist:**
- [ ] Line coverage ≥ 80%
- [ ] Branch coverage ≥ 75%
- [ ] Function coverage ≥ 80%
- [ ] Test file exists for source file
- [ ] Tests cover error handling paths
- [ ] Tests cover edge cases

---

### For Validators (Reviewer, Security-Specialist, Tester)

**Agent Template Validator Checklist:**
- [ ] SQLite lifecycle hooks present (spawn, update, terminate)
- [ ] ACL Level 3 declared: `aclLevel: 3` in memory operations
- [ ] Error handling patterns implemented
- [ ] Validation results persisted to SQLite with ACL 3

**CFN Loop Memory Validator Checklist** (if using CFN Loop):
- [ ] Loop 2 keys use ACL 3: `cfn/phase-{id}/loop2/validation/{validator-id}` with `aclLevel: 3`
- [ ] Loop 2 TTL is 90 days: `ttl: 7776000`
- [ ] Consensus data stored with correct ACL

**Test Coverage Validator Checklist** (Testers only):
- [ ] Test files achieve ≥80% line coverage
- [ ] Integration tests validate multi-agent workflows
- [ ] Chaos tests validate failure scenarios

---

### For Coordinators (Architect, Planner, DevOps-Engineer)

**Agent Template Validator Checklist:**
- [ ] SQLite lifecycle hooks present
- [ ] ACL Level 3 declared: `aclLevel: 3`
- [ ] Error handling patterns implemented
- [ ] Blocking Coordination imports if coordinating agents

**CFN Loop Memory Validator Checklist:**
- [ ] Phase metadata uses ACL 4: `cfn/phase-{id}/metadata` with `aclLevel: 4`
- [ ] Coordination data uses ACL 3: `aclLevel: 3`
- [ ] Appropriate TTL values (90-180 days for coordination data)

**Blocking Coordination Validator Checklist** (if coordinating):
- [ ] `BlockingCoordinationSignals` imported
- [ ] `CoordinatorTimeoutHandler` imported
- [ ] HMAC secret validation: `process.env.BLOCKING_COORDINATION_SECRET`
- [ ] Signal ACK protocol complete: `sendSignal()`, `waitForAck()`, `receiveSignal()`, `sendAck()`
- [ ] Timeout values in recommended range (5-60s for ACK, 10-120s for heartbeat)
- [ ] State machine complexity reviewed (if >5 states, spawn reviewer agent)

---

### For Product Owner

**Agent Template Validator Checklist:**
- [ ] SQLite lifecycle hooks present
- [ ] ACL Level 4 declared: `aclLevel: 4`
- [ ] Strategic decisions persisted with 365-day retention

**CFN Loop Memory Validator Checklist:**
- [ ] Loop 4 keys use ACL 4: `cfn/phase-{id}/loop4/decision/{type}` with `aclLevel: 4`
- [ ] Loop 4 TTL is 365 days: `ttl: 31536000` (compliance requirement)
- [ ] GOAP decisions persisted to SQLite for audit trail

---

## Troubleshooting Guide

### Common Validation Failures

#### 1. "Missing SQLite lifecycle hooks"

**Error:**
```json
{
  "type": "missing_sqlite_lifecycle_spawn",
  "severity": "error",
  "message": "Missing agent spawn registration",
  "recommendation": "Add SQLite lifecycle hook for agent spawn"
}
```

**Root Cause:** Agent doesn't register in SQLite on spawn.

**Fix:**
```javascript
// Add to agent initialization
await sqlite.execute(`
  INSERT INTO agents (id, type, status, spawned_at)
  VALUES (?, ?, 'active', CURRENT_TIMESTAMP)
`, [this.agentId, this.agentType]);
```

**Verification:**
```bash
# Check agent registration
sqlite3 memory.db "SELECT * FROM agents WHERE id='agent-id'"
```

---

#### 2. "ACL level mismatch"

**Error:**
```json
{
  "type": "acl_mismatch",
  "expected": { "acl": 1, "name": "Private" },
  "actual": { "acl": 3 },
  "recommendation": "Change aclLevel to 1 for implementer agents"
}
```

**Root Cause:** Agent using wrong ACL level for its type.

**Fix:**
```javascript
// Determine correct ACL level by agent type
const aclLevels = {
  'implementer': 1,    // coder, backend-dev, frontend-dev
  'validator': 3,      // reviewer, security-specialist, tester
  'coordinator': 3,    // architect, planner
  'product-owner': 4   // product-owner (CFN Loop 4 only)
};

await sqlite.memoryAdapter.set(key, value, {
  aclLevel: aclLevels[this.agentType]
});
```

**Verification:**
```bash
# Check stored ACL level
sqlite3 memory.db "SELECT key, acl_level FROM memory WHERE key LIKE 'agent/%'"
```

---

#### 3. "Test coverage below threshold"

**Error:**
```
Line coverage 72% < 80%
Branch coverage 68% < 75%
```

**Root Cause:** Insufficient test coverage.

**Fix Steps:**
1. Identify uncovered lines:
   ```bash
   # View coverage report
   cat coverage/lcov-report/index.html
   ```

2. Add missing tests:
   ```javascript
   // Test uncovered branches
   describe('Error handling', () => {
     it('should handle timeout errors', async () => {
       await expect(operation({ timeout: 1 })).rejects.toThrow('Timeout');
     });
   });
   ```

3. Re-run validation:
   ```bash
   npm test -- --coverage
   node config/hooks/post-test-coverage.js src/module.js
   ```

---

#### 4. "Incomplete Signal ACK protocol"

**Error:**
```json
{
  "type": "incomplete_signal_protocol",
  "message": "Missing: waitForAck(), sendAck()",
  "recommendation": "Complete Signal ACK protocol requires: sendSignal() + waitForAck() + receiveSignal() + sendAck()"
}
```

**Root Cause:** Coordinator not implementing full ACK protocol.

**Fix:**
```javascript
// Complete implementation
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals';

const signals = new BlockingCoordinationSignals(
  coordinatorId,
  process.env.BLOCKING_COORDINATION_SECRET
);

// Send signal
await signals.sendSignal('READY', targetAgentId);

// Wait for ACK
const ack = await signals.waitForAck(requestId, 30000);
if (!ack) {
  throw new Error('ACK timeout');
}

// Receive and respond
signals.on('signal', async (signal) => {
  await processSignal(signal);
  await signals.sendAck(signal.requestId);
});
```

---

#### 5. "Complex state machine requires agent review"

**Warning:**
```json
{
  "type": "complex_state_machine",
  "message": "States: 8, Transitions: 15, Conditionals: 12",
  "needsAgentReview": true,
  "recommendation": "Spawn reviewer agent for semantic validation using --spawn-reviewer flag"
}
```

**Root Cause:** State machine complexity exceeds automation threshold.

**Fix:**
```bash
# Trigger agent semantic validation
node config/hooks/post-edit-blocking-coordination.js coordinator.js --spawn-reviewer

# This spawns a reviewer agent to validate:
# - State transition correctness
# - Timeout value appropriateness
# - Recovery logic completeness
```

---

### Debugging Validation Issues

#### Enable Verbose Logging

```bash
# Individual validator
node config/hooks/post-edit-agent-template.js file.md --verbose

# Composite hook
npx claude-flow@alpha hooks post-edit file.js --verbose
```

#### Check Validation Cache

```bash
# Clear validation cache
rm -rf .cache/validation-results/*

# Re-run without cache
node config/hooks/post-edit-agent-template.js file.md --no-cache
```

#### Inspect Structured Output

```bash
# Get JSON output for programmatic analysis
node config/hooks/post-edit-agent-template.js file.md --json | jq .

# Extract specific violations
node config/hooks/post-edit-agent-template.js file.md --json | \
  jq '.violations[] | select(.severity == "error")'
```

#### Performance Analysis

```bash
# Measure execution time breakdown
node config/hooks/post-edit-agent-template.js file.md --profile

# Expected output:
# - Pattern detection: 450ms
# - AST parsing (WASM): 320ms
# - Rule evaluation: 180ms
# - Report generation: 97ms
# - Total: 1047ms
```

---

## Performance Optimization

### WASM Acceleration (52x Speedup)

**Enabled by default for:**
- JavaScript/TypeScript: AST parsing, linting, type checking
- Rust files: Pattern matching (unwrap, panic, expect detection)
- Agent templates: Pattern detection for lifecycle hooks

**Disable if needed:**
```bash
node config/hooks/post-edit-agent-template.js file.md --no-wasm
```

**Performance comparison:**
```
Pure JS validation:     ~8-12s
WASM-accelerated:      ~150-250ms (52x faster)
```

### Parallel Validation

**Independent validators run in parallel:**
```bash
# Composite hook automatically parallelizes
npx claude-flow@alpha hooks post-edit file.js --structured

# Execution breakdown:
# - Agent Template Validator: 847ms  ┐
# - CFN Loop Memory Validator: 234ms  ├→ Parallel (max: 847ms)
# - Test Coverage Validator: 412ms   ┘
# - Total: ~1.2s (vs ~4.5s sequential)
```

### Incremental Validation (Caching)

**Unchanged files skip validation:**
```javascript
// Automatic file hash-based caching
const hash = computeHash(fileContent);
if (cache.has(hash)) {
  return cache.get(hash);  // <10ms cache hit
}
```

**Cache statistics:**
```bash
# View cache hit rate
npx claude-flow@alpha hooks stats

# Example output:
# Cache Hit Rate: 73.4% (2,341/3,189 validations)
# Avg Validation Time (cache hit): 8ms
# Avg Validation Time (cache miss): 1,247ms
```

### Optimization Recommendations

**For development (fast feedback):**
```bash
# Enable all optimizations
export WASM_ENABLED=true
export VALIDATION_CACHE=true
export PARALLEL_VALIDATION=true
```

**For CI/CD (thorough validation):**
```bash
# Disable cache for clean validation
export VALIDATION_CACHE=false
npx claude-flow@alpha hooks post-edit file.js --ci --no-cache
```

**Target performance metrics:**
- Individual validator: <2s (WASM-accelerated)
- Composite validation: <5s (parallel execution)
- Cache hit rate: >70% during development
- False positive rate: <2%

---

## Hook Composition Patterns

### Pattern 1: Sequential Validation (Dependent Hooks)

**Use when:** Validator B requires output from Validator A

```javascript
// Example: ACL validation before memory pattern validation
class SequentialHook {
  async validate(file, content) {
    // Step 1: Validate ACL declarations
    const aclResult = await agentTemplateValidator.validate(file, content);

    if (!aclResult.valid) {
      return aclResult;  // Stop if ACL fails
    }

    // Step 2: Validate memory patterns (requires ACL info)
    const memoryResult = await cfnLoopMemoryValidator.validate(
      file,
      content,
      { aclLevel: aclResult.actualACL }
    );

    return memoryResult;
  }
}
```

### Pattern 2: Parallel Validation (Independent Hooks)

**Use when:** Validators are independent

```javascript
class ParallelHook {
  async validate(file, content) {
    const results = await Promise.all([
      agentTemplateValidator.validate(file, content),
      cfnLoopMemoryValidator.validate(file, content),
      testCoverageValidator.validate(file, content)
    ]);

    return {
      valid: results.every(r => r.valid),
      results,
      executionTime: Math.max(...results.map(r => r.executionTime))
    };
  }
}
```

### Pattern 3: Composite Hook (Layered Validation)

**Use when:** Multiple validators with aggregated recommendations

```javascript
class CompositeHook {
  constructor(...validators) {
    this.validators = validators;
  }

  async validate(file, content) {
    const results = await Promise.all(
      this.validators.map(v => v.validate(file, content))
    );

    return {
      valid: results.every(r => r.valid),
      violations: results.flatMap(r => r.violations || []),
      warnings: results.flatMap(r => r.warnings || []),
      recommendations: this.mergeRecommendations(results),
      executionTime: Math.max(...results.map(r => r.executionTime))
    };
  }

  mergeRecommendations(results) {
    // Deduplicate and prioritize recommendations
    const allRecs = results.flatMap(r => r.recommendations || []);
    const unique = new Map();

    for (const rec of allRecs) {
      if (!unique.has(rec.message) ||
          this.priorityScore(rec) > this.priorityScore(unique.get(rec.message))) {
        unique.set(rec.message, rec);
      }
    }

    return Array.from(unique.values())
      .sort((a, b) => this.priorityScore(b) - this.priorityScore(a));
  }

  priorityScore(rec) {
    const scores = { critical: 4, high: 3, medium: 2, low: 1 };
    return scores[rec.priority] || 0;
  }
}
```

### Pattern 4: Hybrid Hook-Agent Validation

**Use when:** Pattern detection + semantic validation required

```javascript
class HybridValidator {
  async validate(file, content) {
    // Hook: Pattern detection (95% automation)
    const patterns = await this.detectPatterns(content);

    if (patterns.hasComplexLogic && this.shouldSpawnReviewer) {
      // Agent: Semantic validation (5% requiring human-level understanding)
      const agentReview = await this.spawnReviewerAgent({
        file,
        content,
        concern: 'State machine correctness',
        context: patterns.extracted,
        requestedBy: 'blocking-coordination-validator'
      });

      return {
        ...patterns,
        agentReview,
        needsManualReview: agentReview.confidence < 0.90
      };
    }

    return patterns;
  }

  async spawnReviewerAgent(context) {
    // Spawn specialized reviewer agent for semantic analysis
    const agent = await spawnAgent('semantic-reviewer', {
      task: `Validate state machine logic for ${context.file}`,
      context: context.context,
      focus: context.concern,
      parentValidator: context.requestedBy
    });

    return await agent.execute();
  }
}
```

### Pattern 5: Incremental Hook (Cache-Aware)

**Use when:** Validating unchanged files repeatedly

```javascript
class IncrementalValidator {
  constructor(baseValidator) {
    this.baseValidator = baseValidator;
    this.cache = new Map();
  }

  async validate(file, content) {
    const hash = this.computeHash(content);
    const cacheKey = `${file}:${hash}`;

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      return {
        ...cached,
        fromCache: true,
        executionTime: '<10ms (cached)'
      };
    }

    const result = await this.baseValidator.validate(file, content);
    this.cache.set(cacheKey, result);

    // Evict old entries (LRU policy)
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    return result;
  }

  computeHash(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
```

### Recommended Composition

**For most agents (implementers, validators):**
```javascript
const standardValidation = new CompositeHook(
  new AgentTemplateValidator(),
  new CFNLoopMemoryValidator(),
  new TestCoverageValidator()
);
```

**For coordinators:**
```javascript
const coordinatorValidation = new CompositeHook(
  new AgentTemplateValidator(),
  new CFNLoopMemoryValidator(),
  new HybridValidator(new BlockingCoordinationValidator(), { spawnReviewer: true })
);
```

**For high-performance scenarios:**
```javascript
const cachedValidation = new IncrementalValidator(
  new ParallelHook(
    new AgentTemplateValidator(),
    new CFNLoopMemoryValidator(),
    new TestCoverageValidator()
  )
);
```

---

## Conclusion

### Key Takeaways

1. **4 Production-Ready Validators**: Agent Template (95%), CFN Loop Memory (90%), Test Coverage (100%), Blocking Coordination (60% + agent review)
2. **85% Automation Rate**: Hooks handle pattern detection, quantitative metrics; agents handle semantic understanding
3. **Performance Optimized**: <5s total validation time with WASM acceleration (52x) and parallel execution
4. **Hook Composition**: CompositeHook pattern enables layered validation with merged recommendations
5. **Hybrid Validation**: 60% automated + 15% agent collaboration for complex logic (e.g., state machines)

### Quick Reference

**Run all applicable validators:**
```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "agent/step" --structured
```

**Agent category → Required validators:**
- Implementers: Agent Template + CFN Loop Memory + Test Coverage
- Validators: Agent Template + CFN Loop Memory
- Coordinators: Agent Template + CFN Loop Memory + Blocking Coordination
- Product Owner: Agent Template + CFN Loop Memory (Loop 4)

**Troubleshooting priority:**
1. Missing SQLite lifecycle hooks (CRITICAL - blocks audit trail)
2. ACL level mismatch (HIGH - data exposure risk)
3. Test coverage below threshold (MEDIUM - quality impact)
4. Complex state machine (LOW - spawn reviewer agent)

### Next Steps

1. **Integrate hooks into your agent**: Add `validation_hooks` to agent frontmatter
2. **Configure thresholds**: Create `coverage.config.json` if needed
3. **Run validation**: Execute `npx claude-flow@alpha hooks post-edit` after edits
4. **Monitor metrics**: Track cache hit rate (>70%), execution time (<5s), false positives (<2%)
5. **Iterate**: Use validation feedback to improve agent compliance

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-11
**Maintained By:** Research Agent
**Feedback:** Report issues to System Architect Team
