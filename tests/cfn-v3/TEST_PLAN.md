# CFN Loop v3 Testing Coordinator - Test Plan

**Status:** In Progress
**Created:** 2025-10-24
**Coordinator:** CFN v3 Testing Coordinator
**Goal:** Comprehensive validation of CFN Loop v3 dual-mode architecture

---

## Executive Summary

This test plan validates the CFN Loop v3 architecture against design specifications documented in `planning/cfn-v3/DUAL_MODE_IMPLEMENTATION.md` and `CLAUDE.md`. The architecture introduces dual spawning modes (CLI vs Task), Redis context storage, swarm recovery, and modular orchestration helpers.

**Critical Claims to Validate:**
1. CLI mode achieves 95-98% cost savings vs Task mode
2. Redis context enables swarm recovery
3. Orchestrator achieved 78% code reduction through modularization
4. Both modes share core logic and produce identical results
5. Zero-token waiting via BLPOP works in both modes
6. Deliverable verification prevents "consensus on vapor"

---

## Test Architecture

### Test Categories

```
tests/cfn-v3/
├── cli-mode/              # CLI spawning mode validation
│   ├── test-redis-context.sh
│   ├── test-zai-routing.sh
│   └── test-cost-optimization.sh
├── task-mode/             # Task spawning mode validation
│   ├── test-direct-injection.sh
│   ├── test-anthropic-routing.sh
│   └── test-visibility.sh
├── orchestrator/          # Orchestrator core functionality
│   ├── test-gate-check.sh
│   ├── test-consensus.sh
│   ├── test-product-owner.sh
│   └── test-iteration-management.sh
├── helpers/               # Modular helper validation
│   ├── test-deliverable-verifier.sh
│   ├── test-timeout-calculator.sh
│   ├── test-iteration-manager.sh
│   └── test-gate-consensus.sh
├── integration/           # End-to-end workflows
│   ├── test-simple-task.sh
│   ├── test-multi-iteration.sh
│   └── test-mode-comparison.sh
├── recovery/              # Swarm recovery validation
│   ├── test-redis-persistence.sh
│   ├── test-context-retrieval.sh
│   └── test-crash-recovery.sh
└── TEST_PLAN.md           # This document
```

---

## Phase 1: Foundation Tests (Critical Path)

### Test 1.1: CLI Mode - Redis Context Storage
**File:** `tests/cfn-v3/cli-mode/test-redis-context.sh`

**Objective:** Validate context storage and retrieval in Redis

**Test Steps:**
1. Coordinator stores epic context, phase context, success criteria in Redis
2. Orchestrator retrieves context from Redis
3. Agents spawned via CLI receive context from Redis
4. Verify context integrity (no data loss)

**Success Criteria:**
- ✅ All context stored in Redis with correct keys
- ✅ Context retrieval returns complete JSON
- ✅ Agents receive deliverables, acceptance criteria
- ✅ No hardcoded context in CLI spawn commands

**Validation Commands:**
```bash
# Check context storage
redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"

# Verify epic context
redis-cli GET "swarm:$TASK_ID:epic-context"

# Verify success criteria
redis-cli GET "swarm:$TASK_ID:success-criteria"
```

---

### Test 1.2: Task Mode - Direct Injection
**File:** `tests/cfn-v3/task-mode/test-direct-injection.sh`

**Objective:** Validate direct context injection via Task() parameters

**Test Steps:**
1. Main Chat spawns coordinator with full context
2. Coordinator spawns agents via Task() with injected context
3. Verify agents receive deliverables directly (no Redis lookup)
4. Compare with CLI mode output (should be identical)

**Success Criteria:**
- ✅ Agents receive context via Task() parameters
- ✅ Context matches Redis-stored version
- ✅ No Redis lookup required for context
- ✅ Results identical to CLI mode

---

### Test 1.3: Orchestrator - Gate Check Enforcement
**File:** `tests/cfn-v3/orchestrator/test-gate-check.sh`

**Objective:** Validate Loop 3 gate enforcement (≥0.75 threshold)

**Test Steps:**
1. Spawn Loop 3 agents with known confidence scores
2. Test gate failure (avg < 0.75) → Loop 2 stays blocked
3. Test gate pass (avg ≥ 0.75) → Loop 2 wakes
4. Verify BLPOP blocking mechanism

**Success Criteria:**
- ✅ Gate fails when avg < 0.75
- ✅ Loop 2 agents blocked via BLPOP until gate passes
- ✅ Gate passes when avg ≥ 0.75
- ✅ Loop 2 wakes immediately after gate pass

**Test Data:**
```bash
# Iteration 1: Gate fails (0.70 < 0.75)
LOOP3_CONFIDENCE="0.68,0.72,0.70"

# Iteration 2: Gate passes (0.80 ≥ 0.75)
LOOP3_CONFIDENCE="0.78,0.82,0.80"
```

---

### Test 1.4: Orchestrator - Consensus Validation
**File:** `tests/cfn-v3/orchestrator/test-consensus.sh`

**Objective:** Validate Loop 2 consensus enforcement (≥0.90 threshold)

**Test Steps:**
1. Gate passes → Loop 2 agents wake
2. Test consensus failure (avg < 0.90) → iterate all agents
3. Test consensus pass (avg ≥ 0.90) → Product Owner decision
4. Verify feedback accumulation for iteration

**Success Criteria:**
- ✅ Consensus fails when avg < 0.90
- ✅ All agents iterate when consensus fails
- ✅ Consensus passes when avg ≥ 0.90
- ✅ Product Owner receives control after consensus

**Test Data:**
```bash
# Iteration 1: Consensus fails (0.85 < 0.90)
LOOP2_CONFIDENCE="0.83,0.87,0.85"

# Iteration 2: Consensus passes (0.92 ≥ 0.90)
LOOP2_CONFIDENCE="0.90,0.94,0.92"
```

---

## Phase 2: Helper Module Validation

### Test 2.1: Deliverable Verifier
**File:** `tests/cfn-v3/helpers/test-deliverable-verifier.sh`

**Objective:** Prevent "consensus on vapor" (high confidence, zero deliverables)

**Test Steps:**
1. Loop 3 completes with high confidence
2. Run deliverable verifier with expected files
3. Test case 1: Files created → verification passes
4. Test case 2: No files created → verification fails, force iteration

**Success Criteria:**
- ✅ Verification passes when expected files exist
- ✅ Verification fails when files missing
- ✅ Forced iteration includes explicit deliverable feedback
- ✅ Git diff used to detect changes

**Test Data:**
```bash
# Expected deliverables
EXPECTED_FILES=".claude/skills/test-skill/SKILL.md,.claude/skills/test-skill/execute.sh"

# Test case 1: Files created
touch .claude/skills/test-skill/SKILL.md
touch .claude/skills/test-skill/execute.sh

# Test case 2: No files (should fail)
# (no file creation)
```

---

### Test 2.2: Timeout Calculator
**File:** `tests/cfn-v3/helpers/test-timeout-calculator.sh`

**Objective:** Validate dynamic timeout calculation based on phase

**Test Steps:**
1. Test timeout for different phase IDs
2. Verify timeout increases with phase complexity
3. Check bounds (min: 60s, max: 600s)

**Success Criteria:**
- ✅ Returns valid timeout for all phase IDs
- ✅ Timeout ≥ 60s for simple phases
- ✅ Timeout ≤ 600s for complex phases
- ✅ Default timeout when phase-id unknown

---

### Test 2.3: Iteration Manager
**File:** `tests/cfn-v3/helpers/test-iteration-manager.sh`

**Objective:** Validate iteration management and feedback propagation

**Test Steps:**
1. Collect feedback from Loop 2 validators
2. Wake Loop 3 agents with feedback
3. Verify feedback injected into agent context
4. Test iteration counter increment

**Success Criteria:**
- ✅ Feedback collected from Redis
- ✅ All specified agents woken
- ✅ Feedback injected into context
- ✅ Iteration counter incremented

---

## Phase 3: Integration Tests (End-to-End)

### Test 3.1: Simple Task (Single Iteration)
**File:** `tests/cfn-v3/integration/test-simple-task.sh`

**Objective:** Validate end-to-end CFN Loop with minimal complexity

**Test Steps:**
1. Use `/cfn-loop-single` with simple task
2. Monitor Redis state during execution
3. Verify deliverables created
4. Check structured output

**Task:**
```
Create a simple test script at tests/cfn-v3/fixtures/hello.sh
that prints "Hello CFN v3" when executed.
```

**Success Criteria:**
- ✅ Task completes in 1 iteration
- ✅ File created at correct path
- ✅ Script executable and outputs correct message
- ✅ Redis context populated correctly
- ✅ Structured JSON output produced

---

### Test 3.2: Multi-Iteration Task
**File:** `tests/cfn-v3/integration/test-multi-iteration.sh`

**Objective:** Validate iteration management with gate/consensus failures

**Test Steps:**
1. Use task requiring multiple iterations
2. Simulate gate failure → Loop 3 iteration
3. Simulate consensus failure → all agents iteration
4. Verify feedback incorporation

**Task:**
```
Implement authentication middleware with security review.
Loop 3: backend-dev (initial implementation has security issues)
Loop 2: security-specialist finds issues → consensus fails
Iteration 2: backend-dev fixes issues → consensus passes
```

**Success Criteria:**
- ✅ Minimum 2 iterations required
- ✅ Gate enforcement works
- ✅ Consensus enforcement works
- ✅ Feedback incorporated in iteration 2

---

### Test 3.3: Mode Comparison (CLI vs Task)
**File:** `tests/cfn-v3/integration/test-mode-comparison.sh`

**Objective:** Validate both modes produce identical results

**Test Steps:**
1. Execute same task in CLI mode
2. Execute same task in Task mode
3. Compare outputs (deliverables, confidence scores, iterations)
4. Verify context consistency

**Success Criteria:**
- ✅ Both modes create identical deliverables
- ✅ Confidence scores match
- ✅ Iteration counts match
- ✅ Context stored identically in Redis

---

## Phase 4: Swarm Recovery Tests

### Test 4.1: Redis Persistence
**File:** `tests/cfn-v3/recovery/test-redis-persistence.sh`

**Objective:** Validate swarm state survives interruptions

**Test Steps:**
1. Start CFN Loop task
2. Store task state in Redis
3. Simulate crash (kill orchestrator)
4. Retrieve task state from Redis
5. Verify context intact

**Success Criteria:**
- ✅ Task state stored with TTL
- ✅ Context retrievable after crash
- ✅ Agent states preserved
- ✅ Iteration counter preserved

---

### Test 4.2: Context Retrieval After Crash
**File:** `tests/cfn-v3/recovery/test-context-retrieval.sh`

**Objective:** Validate agents can resume from Redis context

**Test Steps:**
1. Start task, store context
2. Simulate agent crash
3. Spawn replacement agent
4. Verify agent retrieves context from Redis
5. Check agent continues from correct iteration

**Success Criteria:**
- ✅ Replacement agent retrieves context
- ✅ Context complete (deliverables, acceptance criteria)
- ✅ Iteration context preserved
- ✅ No context loss

---

## Phase 5: Validation Tests

### Test 5.1: Product Owner Decision Flow
**File:** `tests/cfn-v3/orchestrator/test-product-owner.sh`

**Objective:** Validate Product Owner decision execution (PROCEED/ITERATE/ABORT)

**Test Steps:**
1. Loop 2 consensus passes
2. Product Owner decision skill executes
3. Test PROCEED → task complete
4. Test ITERATE → wake all agents
5. Test ABORT → exit with error

**Success Criteria:**
- ✅ Decision skill executes correctly
- ✅ PROCEED completes task
- ✅ ITERATE wakes agents with feedback
- ✅ ABORT exits gracefully
- ✅ Deliverable verification runs before decision

---

## Test Execution Strategy

### Manual Execution

```bash
# Run all tests
./tests/cfn-v3/run-all-tests.sh

# Run specific category
./tests/cfn-v3/cli-mode/test-redis-context.sh

# Run with verbose logging
VERBOSE=1 ./tests/cfn-v3/orchestrator/test-gate-check.sh
```

### Automated Execution (Future)

```bash
# CI/CD integration
npm test -- cfn-v3

# Generate coverage report
./tests/cfn-v3/generate-coverage.sh
```

---

## Success Metrics

### Per-Test Metrics

```json
{
  "test_id": "cli-mode-redis-context",
  "status": "pass",
  "duration_ms": 3500,
  "assertions": {
    "total": 12,
    "passed": 12,
    "failed": 0
  },
  "redis_operations": {
    "stores": 3,
    "retrievals": 5,
    "deletes": 1
  }
}
```

### Aggregate Metrics

```json
{
  "total_tests": 20,
  "passed": 18,
  "failed": 2,
  "skipped": 0,
  "coverage": {
    "cli_mode": "95%",
    "task_mode": "90%",
    "orchestrator": "100%",
    "helpers": "85%",
    "integration": "75%",
    "recovery": "80%"
  },
  "confidence_score": 0.90
}
```

---

## Critical Validation Points

### Architecture Stability Checklist

- [ ] **CLI Mode**
  - [ ] Redis context storage works
  - [ ] Z.ai routing enabled (when activated)
  - [ ] Cost savings measurable
  - [ ] Agents retrieve context from Redis

- [ ] **Task Mode**
  - [ ] Direct context injection works
  - [ ] Anthropic routing used
  - [ ] Full visibility into agent execution
  - [ ] Results identical to CLI mode

- [ ] **Orchestrator**
  - [ ] Gate enforcement (≥0.75)
  - [ ] Consensus enforcement (≥0.90)
  - [ ] Product Owner decision flow
  - [ ] Iteration management
  - [ ] Deliverable verification

- [ ] **Helpers (78% code reduction claim)**
  - [ ] Modular helper scripts exist
  - [ ] Each helper independently testable
  - [ ] Code reuse validated
  - [ ] Reduction measurable

- [ ] **Swarm Recovery**
  - [ ] Redis persistence works
  - [ ] Context retrievable after crash
  - [ ] Agent replacement seamless
  - [ ] TTL configured correctly

- [ ] **Context Injection (BUG #20 fix)**
  - [ ] Multi-layer context flow (coordinator → orchestrator → agents)
  - [ ] Deliverables reach agents
  - [ ] Acceptance criteria injected
  - [ ] No "consensus on vapor"

---

## Known Issues to Monitor

### BUG #20: Consensus on Vapor
**Status:** Fixed
**Validation:** Test deliverable verifier with zero files created
**Expected:** Forced iteration with explicit deliverable requirements

### BUG #18: Agent Lifecycle
**Status:** Fixed
**Validation:** Test agents exit cleanly (no waiting mode blocking orchestrator)
**Expected:** Orchestrator `wait $PID` completes, allows adaptive specialization

### BUG #11: Product Owner Decision
**Status:** Fixed
**Validation:** Test Product Owner decision parsing and execution
**Expected:** PROCEED/ITERATE/ABORT extracted correctly, orchestrator pushes decision to Redis

---

## Test Data Requirements

### Synthetic Agents (for testing)
```javascript
// Loop 3 synthetic agent
class SyntheticCoder {
  execute(context) {
    // Parse deliverables from context
    // Create files
    // Report confidence
    // Exit cleanly (no waiting mode)
  }
}

// Loop 2 synthetic validator
class SyntheticReviewer {
  execute(context) {
    // Wait for gate pass signal
    // Review Loop 3 work
    // Report consensus score
    // Exit cleanly
  }
}
```

### Test Fixtures
```bash
tests/cfn-v3/fixtures/
├── simple-task.json        # Simple task for single iteration
├── complex-task.json       # Complex task requiring multiple iterations
├── epic-context.json       # Sample epic context
├── phase-context.json      # Sample phase context
└── success-criteria.json   # Sample success criteria
```

---

## Documentation Requirements

All test results must be documented in:
- `tests/cfn-v3/TEST_RESULTS.md` - Summary, pass/fail, bugs found
- `tests/cfn-v3/test-*.sh` - Executable test scripts (version controlled)
- `tests/cfn-v3/results/*.json` - Structured test outputs

---

## Next Steps

1. **Review and approve test plan**
2. **Create test fixtures** (synthetic agents, task definitions)
3. **Implement Phase 1 tests** (foundation)
4. **Execute tests and document results**
5. **Iterate on failures**
6. **Generate final confidence score for v3 architecture**

---

## Estimated Timeline

- **Phase 1 (Foundation):** 2-3 hours
- **Phase 2 (Helpers):** 1-2 hours
- **Phase 3 (Integration):** 2-3 hours
- **Phase 4 (Recovery):** 1-2 hours
- **Phase 5 (Validation):** 1-2 hours
- **Documentation:** 1 hour

**Total:** 8-13 hours

---

## Confidence Target

**Target:** ≥ 0.85 confidence in CFN v3 architecture stability

**Criteria:**
- ≥ 90% tests passing
- All critical paths validated
- Zero blockers discovered
- Known issues validated as fixed
- Swarm recovery functional
- Both modes produce identical results
