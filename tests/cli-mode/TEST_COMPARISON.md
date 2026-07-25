# CLI Mode Test Comparison

## Overview

Comparison of CLI mode tests showing the evolution from simulated to real execution.

## Test Matrix

| Feature | test-cfn-loop-full-cycle.sh | test-cfn-loop-e2e-integration.sh | test-cfn-loop-cli-real-execution.sh |
|---------|----------------------------|----------------------------------|-------------------------------------|
| **Purpose** | Validate TDD violations and multi-agent coordination | Real CFN Loop execution with deliverables | TRUE end-to-end validation with all real scripts |
| **Coordinator** | ❌ Simulated | ✅ Real spawn | ✅ Real spawn |
| **Orchestrator** | ❌ Not tested | ⚠️ Indirect | ✅ Explicitly validated |
| **Agent Spawning** | ⚠️ Real but inline scripts | ✅ Real spawn | ✅ Real spawn + verification |
| **Loop 3 Agents** | ⚠️ Simulated work | ✅ Real execution | ✅ Real execution + process checks |
| **Test Execution** | ❌ Simulated | ⚠️ Assumed | ✅ Validated via Redis |
| **Gate Check** | ❌ Calculated | ⚠️ Not verified | ✅ Evidence checked |
| **Loop 2 Validators** | ❌ Grep patterns | ⚠️ Not verified | ✅ Process detection + Redis |
| **Consensus** | ❌ Calculated | ⚠️ Not verified | ✅ Validated via Redis |
| **Product Owner** | ❌ Calculated | ⚠️ Not verified | ✅ Process detection + decision |
| **Deliverables** | ⚠️ Simulated files | ✅ Real files | ✅ Real files + content verification |
| **Redis Coordination** | ⚠️ Partial | ✅ Used | ✅ Comprehensive validation |
| **Cleanup** | ✅ Workspace only | ✅ Processes + Redis | ✅ Comprehensive + TTL check |
| **BUG #22 Validation** | ❌ Not tested | ❌ Not tested | ✅ Explicit validation |
| **Checkpoints** | 5 | 5 | 10 |
| **Execution Time** | <1 minute | 2-3 minutes | 2-3 minutes |
| **CI Ready** | ✅ Yes | ✅ Yes | ✅ Yes |

## Detailed Comparison

### Test 1: test-cfn-loop-full-cycle.sh (Simulated)

**Purpose:** Validate CFN Loop workflow logic and TDD violation detection

**Strengths:**
- Fast execution (<1 minute)
- Tests multiple scenarios (faulty TDD, violations, decisions)
- Validates 6 parallel agents
- Good for logic validation

**Weaknesses:**
- Does NOT use real coordinator
- Simulates test files instead of real agent execution
- Mocks Loop 2 validation (grep patterns)
- Calculates Product Owner decision (not real agent)
- Uses inline scripts instead of production spawning
- Misses production code path bugs (like BUG #22)

**When to Use:**
- Unit testing CFN Loop logic
- Validating TDD violation detection
- Fast CI checks for logic changes
- Development/debugging workflow

**Verdict:** ⚠️ Good for LOGIC validation, NOT production code path validation

---

### Test 2: test-cfn-loop-e2e-integration.sh (Partial Real)

**Purpose:** Real CFN Loop execution with deliverable creation

**Strengths:**
- Uses real coordinator spawn
- Real agent processes
- Real deliverables created
- Redis coordination used
- Process cleanup
- Good for smoke testing

**Weaknesses:**
- Limited orchestrator validation (indirect only)
- Doesn't verify Loop 2 validators explicitly
- Doesn't verify Product Owner decision
- Doesn't validate gate check execution
- Doesn't validate BUG #22 fixes
- Focuses on deliverables, not full pipeline

**When to Use:**
- Smoke testing coordinator spawn
- Validating deliverable creation
- Quick production sanity checks
- CI integration tests

**Verdict:** ✅ Good for DELIVERABLE validation, limited pipeline coverage

---

### Test 3: test-cfn-loop-cli-real-execution.sh (TRUE E2E)

**Purpose:** Comprehensive validation of entire production pipeline

**Strengths:**
- Uses ALL real production scripts
- 10 comprehensive checkpoints
- Validates orchestrate-wrapper.sh (BUG #22 fix)
- Validates orchestrate.sh invocation
- Validates Loop 3 agent spawning + process detection
- Validates test execution evidence
- Validates gate check execution
- Validates Loop 2 validators + process detection
- Validates Product Owner decision + Redis
- Validates final deliverables + content
- Validates cleanup + zombie process detection
- Validates Redis TTL (no permanent pollution)
- Explicit BUG #22 validation
- NO simulations or bypasses

**Weaknesses:**
- Longer execution time (2-3 minutes)
- More complex to debug
- Requires Redis availability
- More moving parts

**When to Use:**
- **Production readiness validation**
- **BUG fix verification (e.g., BUG #22)**
- **Pre-release testing**
- **CI gate before deployment**
- **Regression testing for coordinator/orchestrator changes**

**Verdict:** ✅ **PRODUCTION-GRADE** - Use for release validation

## Gap Analysis

### What Previous Tests Missed

**Critical Gap:** Production spawning mechanism bugs (BUG #21 case study)

```
Previous Tests: Alpine container + inline script = ✅ PASSED
Production Code: CFN agent image + spawn-agent.sh = ❌ FAILED

Root Cause: Tests didn't exercise spawn-agent.sh
```

**Critical Gap:** Empty parameter handling (BUG #22)

```
Previous Tests: Assumed parameters are always populated = ✅ PASSED
Production Code: Coordinator provides empty parameters = ❌ FAILED

Root Cause: Tests didn't validate orchestrate-wrapper.sh fallbacks
```

### What This Test Covers

1. ✅ **Real Coordinator Spawning:** `npx claude-flow-novice agent cfn-v3-coordinator`
2. ✅ **Real Orchestrate-Wrapper:** Validates BUG #22 parameter fallback
3. ✅ **Real Orchestrate.sh:** Validates main orchestrator invocation
4. ✅ **Real Agent Spawning:** Production CLI spawning, not inline scripts
5. ✅ **Real Test Execution:** Validates tests actually run
6. ✅ **Real Gate Check:** Validates test pass rate threshold
7. ✅ **Real Loop 2 Validation:** Validates validators actually spawn and run
8. ✅ **Real Consensus:** Validates consensus collection
9. ✅ **Real Product Owner:** Validates decision agent spawns
10. ✅ **Real Cleanup:** Validates no zombie processes or Redis pollution

## Test Selection Guide

### When to Use Each Test

```
┌─────────────────────────────────────────────────────────────┐
│ Development Phase                                           │
├─────────────────────────────────────────────────────────────┤
│ Logic Changes        → test-cfn-loop-full-cycle.sh          │
│ Deliverable Changes  → test-cfn-loop-e2e-integration.sh     │
│ Pipeline Changes     → test-cfn-loop-cli-real-execution.sh  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Bug Fix Validation                                          │
├─────────────────────────────────────────────────────────────┤
│ BUG #22 (Empty Params) → test-cfn-loop-cli-real-execution.sh│
│ BUG #21 (Agent Spawn)  → test-cfn-loop-cli-real-execution.sh│
│ TDD Violations        → test-cfn-loop-full-cycle.sh         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CI/CD Pipeline                                              │
├─────────────────────────────────────────────────────────────┤
│ PR Checks (Fast)     → test-cfn-loop-full-cycle.sh          │
│ Main Branch Gate     → test-cfn-loop-e2e-integration.sh     │
│ Release Gate         → test-cfn-loop-cli-real-execution.sh  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Production Readiness                                        │
├─────────────────────────────────────────────────────────────┤
│ Pre-Deployment       → test-cfn-loop-cli-real-execution.sh  │
│ Smoke Test           → test-cfn-loop-e2e-integration.sh     │
│ Health Check         → test-cfn-loop-full-cycle.sh          │
└─────────────────────────────────────────────────────────────┘
```

## Recommended CI Pipeline

### Stage 1: PR Validation (Fast)

```yaml
- name: Logic Validation
  run: bash tests/cli-mode/test-cfn-loop-full-cycle.sh
  timeout-minutes: 2
```

### Stage 2: Integration Testing (Moderate)

```yaml
- name: Deliverable Validation
  run: bash tests/cli-mode/test-cfn-loop-e2e-integration.sh
  timeout-minutes: 6
```

### Stage 3: Production Readiness (Comprehensive)

```yaml
- name: TRUE E2E Validation
  run: bash tests/cli-mode/test-cfn-loop-cli-real-execution.sh
  timeout-minutes: 6
  if: github.ref == 'refs/heads/main'
```

## Migration Guide

### From Simulated to Real Tests

**Step 1:** Identify what you're actually testing

```bash
# BEFORE (Simulated)
echo "test content" > fake-deliverable.txt
grep -q "test content" fake-deliverable.txt && echo "PASS"

# AFTER (Real)
npx claude-flow-novice agent backend-developer --task-id TEST
wait_for_deliverables TEST 120
verify_file_contents /tmp/test-workspace/
```

**Step 2:** Use process detection, not assumptions

```bash
# BEFORE (Assumed)
# Agent "should" spawn and complete

# AFTER (Verified)
pgrep -f "backend-developer.*${TASK_ID}" >/dev/null
wait_for_completion_signal "swarm:${TASK_ID}:${AGENT_ID}:done"
```

**Step 3:** Validate coordination protocol

```bash
# BEFORE (Skipped)
# Assume Redis coordination works

# AFTER (Validated)
redis-cli KEYS "swarm:${TASK_ID}:*:done" | wc -l
redis-cli GET "swarm:${TASK_ID}:decision"
```

**Step 4:** Check cleanup thoroughly

```bash
# BEFORE (Basic)
rm -rf /tmp/test-workspace

# AFTER (Comprehensive)
pkill -f "cfn.*${TASK_ID}"  # No zombie processes
redis-cli TTL "swarm:${TASK_ID}:context"  # Has TTL
```

## Lessons from BUG #21

**The Problem:**
- Tests used: `docker run alpine:latest sh -c "inline script"`
- Production used: `spawn-agent.sh → docker run cfn-agent:latest`
- Result: **Tests passed 100%, production failed 100%**

**The Solution:**
- Tests MUST use: Production spawn mechanism
- Tests MUST check: Container logs for CLI errors
- Tests MUST validate: Actual Docker CMD construction

**Applied to This Test:**
```bash
# ✅ Uses real coordinator spawn (not inline script)
npx claude-flow-novice agent cfn-v3-coordinator ...

# ✅ Validates orchestrator invocation (not assumed)
pgrep -f "orchestrate.*${TASK_ID}"

# ✅ Validates agent processes (not just containers)
pgrep -f "claude-flow-novice agent.*${TASK_ID}"

# ✅ Checks Redis coordination (not just file existence)
redis-cli KEYS "swarm:${TASK_ID}:*"
```

## Summary

| Test | Purpose | Coverage | Speed | Production Fidelity |
|------|---------|----------|-------|---------------------|
| **full-cycle** | Logic validation | 30% | ⚡ Fast | ⭐ Low (simulated) |
| **e2e-integration** | Deliverable validation | 60% | ⚡⚡ Moderate | ⭐⭐ Medium (partial real) |
| **cli-real-execution** | Production validation | 95% | ⚡⚡ Moderate | ⭐⭐⭐ High (all real) |

**Recommendation:** Use all three in different contexts:
- **Development:** full-cycle (fast iteration)
- **Integration:** e2e-integration (deliverable checks)
- **Release:** cli-real-execution (production readiness)
