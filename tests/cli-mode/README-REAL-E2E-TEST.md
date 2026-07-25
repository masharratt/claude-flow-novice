# True End-to-End CLI Mode Test

## Overview

**File:** `test-cfn-loop-cli-real-execution.sh`

This test validates the COMPLETE CFN Loop CLI mode execution pipeline using REAL production scripts with NO simulations, mocks, or bypasses.

## Purpose

Validates the entire production code path:

1. **Real Coordinator Spawning** - Uses actual `npx claude-flow-novice agent cfn-v3-coordinator`
2. **Real Orchestration** - Coordinator invokes real `orchestrate-wrapper.sh` → `orchestrate.sh`
3. **Real Agent Spawning** - Orchestrator spawns Loop 3 agents via actual CLI commands
4. **Real Test Execution** - Agents execute real tests and create deliverables
5. **Real Loop 2 Validation** - Validators review real deliverables
6. **Real Product Owner Decision** - Product Owner makes PROCEED/ITERATE/ABORT decision

## Test Architecture

### Execution Flow

```
Test Script
    ↓
1. npx claude-flow-novice agent cfn-v3-coordinator
    ↓
2. Coordinator Process
    ↓
3. orchestrate-wrapper.sh (BUG #22 fix - parameter validation)
    ↓
4. orchestrate.sh (Main orchestrator)
    ↓
5. Loop 3 Agents (backend-developer, coder, etc.)
    ↓
6. Test Execution + Deliverable Creation
    ↓
7. Gate Check (test pass rate ≥ 0.70 for MVP)
    ↓
8. Loop 2 Validators (code-reviewer, tester)
    ↓
9. Consensus Check (consensus ≥ 0.80 for MVP)
    ↓
10. Product Owner Decision (PROCEED/ITERATE/ABORT)
```

### Validation Points

The test validates **10 critical checkpoints**:

| # | Checkpoint | Type | Validation Method |
|---|------------|------|-------------------|
| 1 | Prerequisites | Required | Redis ping, NPX availability, script existence |
| 2 | Coordinator Spawning | Required | Process detection via `pgrep` |
| 3 | Orchestrator Invocation | Required | Process detection + Redis context check |
| 4 | Loop 3 Agent Spawning | Required | Agent process count via `pgrep` |
| 5 | Deliverable Creation | Required | File existence + content verification |
| 6 | Gate Check Execution | Informational | Test results in Redis |
| 7 | Loop 2 Validation | Informational | Validator process detection |
| 8 | Product Owner Decision | Informational | Decision key in Redis |
| 9 | Final Outcome | Required | Deliverable verification + Redis state |
| 10 | Cleanup Verification | Informational | Zombie process + Redis TTL check |

## Test Task

**Simple, Fast Task for Validation:**

```
Create file 'hello-world.txt' in directory '/tmp/cfn-cli-real-test-XXXXX'
with exact content 'Hello CFN Loop'.
Verify the file exists after creation.
```

**Why This Task:**
- Completes in <2 minutes
- Clear success criteria (file exists + content matches)
- No external dependencies
- Easy to verify programmatically
- Realistic enough to exercise full pipeline

## Usage

### Prerequisites

1. **Redis must be running:**
   ```bash
   # Check Redis
   redis-cli ping

   # Start Redis if needed
   docker-compose up -d redis
   ```

2. **NPX must be available:**
   ```bash
   command -v npx
   ```

3. **Project must be built:**
   ```bash
   npm install
   npm run build
   ```

### Running the Test

```bash
# Run from project root
./tests/cli-mode/test-cfn-loop-cli-real-execution.sh

# Or with explicit bash
bash tests/cli-mode/test-cfn-loop-cli-real-execution.sh
```

### Expected Duration

- **Target:** <2 minutes
- **Timeout:** 5 minutes (safety margin)
- **Coordinator Timeout:** 3 minutes

### Expected Output

```
========================================
🚀 TRUE End-to-End CLI Mode Test (NO Simulations)
========================================

▶ TEST 1: Validating prerequisites
✅ Redis is available
✅ npx is available
✅ orchestrate-wrapper.sh exists
✅ orchestrate.sh exists
✅ Test workspace created: /tmp/cfn-cli-real-test-XXXXX
✅ All prerequisites met

▶ TEST 2: Spawning real cfn-v3-coordinator
ℹ Spawning coordinator via npx claude-flow-novice agent...
✅ Coordinator spawned (PID: 12345)
✅ Coordinator process running

▶ TEST 3: Verifying orchestrator invocation
ℹ Waiting for orchestrator invocation (timeout: 60s)
✅ Orchestrator invoked successfully

... (additional checkpoints)

▶ TEST 9: Verifying final outcome
✅ Final deliverable verified
✅ Completed within target time (<3 minutes)

========================================
Test Summary
========================================
Total: 10 | Passed: 10 | Failed: 0
Status: ✅ ALL TESTS PASSED
```

## What Makes This Different

### Previous Tests (Simulated/Bypassed)

1. **`test-cfn-loop-e2e-integration.sh`**
   - ✅ Uses real coordinator spawn
   - ❌ Limited validation of orchestrator invocation
   - ❌ Waits for deliverables but doesn't verify full pipeline
   - ❌ Uses process checks but not comprehensive checkpoints

2. **`test-cfn-loop-full-cycle.sh`**
   - ❌ Simulates test file creation (not real agents)
   - ❌ Mocks Loop 2 validation (grep patterns, not real validators)
   - ❌ Calculates Product Owner decision (not real agent)
   - ❌ Spawns agents but uses inline scripts

### This Test (Real Execution)

- ✅ **Real Coordinator:** Actual `npx claude-flow-novice agent cfn-v3-coordinator`
- ✅ **Real Orchestrator:** Actual `orchestrate-wrapper.sh` + `orchestrate.sh`
- ✅ **Real Agents:** Actual CLI spawning via production code paths
- ✅ **Real Tests:** Agents execute actual test commands
- ✅ **Real Validators:** Actual Loop 2 agents review deliverables
- ✅ **Real Decision:** Actual Product Owner agent makes decision
- ✅ **Real Coordination:** Actual Redis coordination protocol
- ✅ **Comprehensive Validation:** 10 checkpoints covering entire pipeline

## BUG #22 Validation

This test specifically validates the BUG #22 fixes:

1. **`orchestrate-wrapper.sh` Parameter Validation:**
   - Test verifies orchestrate-wrapper.sh is invoked
   - Wrapper applies parameter fallbacks for empty values
   - Orchestrator receives non-empty agent lists

2. **Agent Selection Skill:**
   - Coordinator uses `.claude/skills/cfn-agent-selection-with-fallback/`
   - Fallback agents applied when coordinator provides empty parameters
   - Orchestrator never receives empty `--loop3-agents` or `--loop2-agents`

## Debugging Failed Tests

### Coordinator Not Spawning

**Symptom:** TEST 2 fails with "Coordinator process failed to start"

**Debug Steps:**
```bash
# Check coordinator log
cat /tmp/coordinator-cfn-cli-TASKID.log

# Check for NPX errors
npx claude-flow-novice --version

# Verify project build
ls -la dist/cli/
```

### Orchestrator Not Invoked

**Symptom:** TEST 3 fails with "Orchestrator not invoked"

**Debug Steps:**
```bash
# Check if orchestrator scripts are executable
ls -la .claude/skills/cfn-loop-orchestration/*.sh

# Make executable if needed
chmod +x .claude/skills/cfn-loop-orchestration/*.sh

# Check coordinator log for errors
tail -50 /tmp/coordinator-cfn-cli-TASKID.log
```

### Agents Not Spawning

**Symptom:** TEST 4 fails with "Loop 3 agents not spawned"

**Debug Steps:**
```bash
# Check running processes
pgrep -af cfn

# Check Redis for task context
redis-cli KEYS "swarm:cfn-cli-*"

# Check orchestrator logs (if available)
# Look for agent spawn commands
```

### Deliverables Not Created

**Symptom:** TEST 5 fails with "Deliverables not created"

**Debug Steps:**
```bash
# Check workspace directory
ls -la /tmp/cfn-cli-real-test-XXXXX/

# Check if agents completed
redis-cli KEYS "swarm:TASKID:*:done"

# Check agent logs (if available)
# Look for file creation errors
```

## Success Criteria

Test passes if:

1. ✅ All required checkpoints pass (1, 2, 3, 4, 5, 9)
2. ✅ Deliverable file exists with correct content
3. ✅ Completes within 5-minute timeout
4. ✅ No zombie processes after cleanup
5. ✅ Redis keys have TTL (no permanent pollution)

Test provides warnings (not failures) for:

- ⚠️ Informational checkpoints (6, 7, 8, 10)
- ⚠️ Execution time >3 minutes (but <5 minutes)
- ⚠️ Missing test execution evidence (simple tasks may skip tests)

## CI Integration

### Prerequisites in CI

```yaml
# .github/workflows/test-cli-mode.yml
steps:
  - name: Start Redis
    run: docker-compose up -d redis

  - name: Wait for Redis
    run: |
      timeout 30 bash -c 'until redis-cli ping; do sleep 1; done'

  - name: Run CLI Mode E2E Test
    run: bash tests/cli-mode/test-cfn-loop-cli-real-execution.sh
    timeout-minutes: 6
```

### Cleanup in CI

```yaml
  - name: Cleanup Test Artifacts
    if: always()
    run: |
      # Kill any remaining CFN processes
      pkill -f "cfn-v3-coordinator" || true
      pkill -f "claude-flow-novice agent" || true

      # Clean up Redis test keys
      redis-cli KEYS "swarm:cfn-cli-*" | xargs -r redis-cli DEL || true

      # Remove test workspaces
      rm -rf /tmp/cfn-cli-real-test-* || true
```

## Maintenance

### When to Update This Test

1. **Coordinator Changes:**
   - Update coordinator spawn command if CLI changes
   - Update context parameters if coordinator API changes

2. **Orchestrator Changes:**
   - Update orchestrator validation if scripts are renamed
   - Update parameter passing if orchestrator API changes

3. **Agent Spawning Changes:**
   - Update agent process detection if spawn mechanism changes
   - Update Redis coordination if protocol changes

4. **Success Criteria Changes:**
   - Update task description if criteria format changes
   - Update deliverable verification if validation changes

### Test Maintenance Checklist

- [ ] Verify task completes in <2 minutes (adjust if needed)
- [ ] Verify all validation checkpoints are still relevant
- [ ] Update timeout values if execution time increases
- [ ] Update Redis key patterns if coordination protocol changes
- [ ] Update process detection if agent naming changes
- [ ] Verify cleanup removes all artifacts
- [ ] Test runs successfully on fresh environment

## Related Documentation

- **BUG #22 Analysis:** `docs/BUG_22_PHASE_2_IMPLEMENTATION.md`
- **CFN Loop Orchestration:** `.claude/skills/cfn-loop-orchestration/SKILL.md`
- **Agent Spawning:** `.claude/skills/cfn-agent-spawning/SKILL.md`
- **Test Standards:** `tests/CLAUDE.md`
- **Existing E2E Test:** `tests/cli-mode/test-cfn-loop-e2e-integration.sh`

## Version History

### v1.0.0 (2025-11-18)
- Initial implementation
- 10 comprehensive validation checkpoints
- Real production code path execution
- No simulations or bypasses
- BUG #22 validation included
- Comprehensive documentation
