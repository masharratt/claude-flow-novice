# Test Coverage Gap - Action Plan

**Priority:** P0 - CRITICAL
**Risk:** Production code regressions not caught by test runners
**Impact:** BUG #22 fixes not validated by `run-all-tests.sh`

## Quick Summary

**CRITICAL FINDING:** Comprehensive BUG #22 integration test EXISTS but is NOT in core test runners.

**File:** `tests/integration/test-bug22-coordinator-params.sh` (15KB, 100+ assertions)
**Problem:** Not executed by `tests/cli-mode/run-all-tests.sh`
**Solution:** Move to core and update test runner

## P0 Actions (Do Immediately)

### 1. Move BUG #22 Test to Core

```bash
# Move test to CLI core integration
mv tests/integration/test-bug22-coordinator-params.sh \
   tests/cli-mode/core/integration/test-bug22-integration.sh

# Verify it's executable
chmod +x tests/cli-mode/core/integration/test-bug22-integration.sh

# Test it runs
tests/cli-mode/core/integration/test-bug22-integration.sh
```

**Why:** Validates all 3 phases of BUG #22 fix:
- Phase 1: Coordinator parameter initialization
- Phase 2: orchestrate-wrapper.sh validation + fallbacks (all task types)
- Phase 3: agent-selection-with-fallback skill (9 categories, JSON parsing)

**Coverage:** 100+ assertions across wrapper logic and skill behavior

### 2. Move BUG #21 Test to Docker Core

```bash
# Check if test-real-agent-spawning.sh should be in core
ls -la tests/docker/integration/test-real-agent-spawning.sh

# If it validates production spawn-agent.sh with cfn-agent image, move it:
mv tests/docker/integration/test-real-agent-spawning.sh \
   tests/docker/core/integration/test-real-agent-spawning.sh
```

**Why:** Validates BUG #21 fix with actual production code paths

### 3. Verify Test Runners Include New Tests

**CLI Mode:**
```bash
# Verify test is discovered
tests/cli-mode/run-all-tests.sh --integration

# Should now include test-bug22-integration.sh
```

**Docker Mode:**
```bash
# Verify test is discovered
tests/docker/run-all-tests.sh --integration

# Should include test-real-agent-spawning.sh if moved
```

## P1 Actions (Do This Week)

### 4. Create CLI Iteration Enforcement Test

**File:** `tests/cli-mode/core/integration/test-iteration-enforcement.sh`

**Coverage:**
- ITERATE decision triggers new iteration
- Max iterations enforced (10 for Standard mode)
- Iteration counter increments correctly
- ABORT decision stops iteration

**Reason:** CLI mode iteration logic currently only tested in Docker mode

### 5. Create Docker Exit Code Test

**File:** `tests/docker/core/test-orchestrator-exit-codes.sh`

**Coverage:**
- PROCEED decision → exit code 0
- ABORT decision → exit code non-zero
- Failure scenarios → exit code non-zero
- docker-compose propagates exit code correctly

**Reason:** CI/CD needs to detect orchestrator failures via exit codes

## P2 Actions (Nice to Have)

### 6. Create Loop 2 Timeout Test

**File:** `tests/cli-mode/core/integration/test-loop2-timeout.sh`

**Coverage:**
- Stuck Loop 2 agent doesn't hang forever
- Timeout mechanism exists and triggers
- Timeout triggers appropriate fallback (ABORT or retry)

### 7. Review Legacy tdd-compliance-tests.sh

**Action:** Read `tests/docker/core/legacy/tdd-compliance-tests.sh`

**Purpose:** Verify no unique coverage lost

**Decision:**
- If unique coverage exists → Move relevant parts to core
- If redundant → Document in legacy/README.md why it's redundant

## Verification Steps

After completing P0 actions:

```bash
# 1. Run CLI quick tests (should pass)
tests/cli-mode/run-all-tests.sh --quick

# 2. Run CLI integration tests (should now include BUG #22 test)
tests/cli-mode/run-all-tests.sh --integration

# 3. Run Docker integration tests
tests/docker/run-all-tests.sh --integration

# 4. Verify new tests appear in output
# Look for: "test-bug22-integration.sh" in CLI output
# Look for: "test-real-agent-spawning.sh" in Docker output (if moved)
```

## Expected Test Count After P0

**Before:**
- CLI: 12 core tests (4 unit, 6 integration, 2 e2e)
- Docker: 17 core tests

**After P0:**
- CLI: 13 core tests (4 unit, **7 integration**, 2 e2e)
- Docker: 17-18 core tests (depending on test-real-agent-spawning.sh move)

**After P1:**
- CLI: 15 core tests (add iteration + timeout tests)
- Docker: 18-19 core tests (add exit code test)

## Risk Reduction

**Current Risk:** MEDIUM-HIGH
- BUG #22 regressions not caught
- Orchestrator failures not detected by CI/CD

**After P0:** LOW
- BUG #22 fully validated
- Production code paths tested

**After P1:** VERY LOW
- Iteration logic validated
- Exit codes tested
- Comprehensive failure coverage

## Time Estimate

- P0 Actions: 30 minutes (move + verify)
- P1 Actions: 2-3 hours (create new tests)
- P2 Actions: 1-2 hours (review + create)

**Total:** 4-6 hours for complete coverage

## Quick Win

**Do this first (15 minutes):**
```bash
# Move BUG #22 test
mv tests/integration/test-bug22-coordinator-params.sh \
   tests/cli-mode/core/integration/test-bug22-integration.sh

# Run it to verify
tests/cli-mode/core/integration/test-bug22-integration.sh

# Commit
git add tests/cli-mode/core/integration/test-bug22-integration.sh
git commit -m "fix(tests): move BUG #22 test to core (P0 gap fix)

Critical: BUG #22 comprehensive integration test existed in tests/integration/
but was NOT included in test runners.

Moved to: tests/cli-mode/core/integration/test-bug22-integration.sh

Coverage: All 3 BUG #22 phases (coordinator, wrapper, skill)
Risk Reduction: MEDIUM-HIGH → LOW
"
```

## Related Documentation

- `tests/TEST_COVERAGE_GAP_ANALYSIS.md` - Complete gap analysis
- `docs/BUG_CLI_MODE_COORDINATOR_EMPTY_PARAMS.md` - BUG #22 details
- `tests/CORE_TEST_SUMMARY.md` - Core test catalog
