# CLI Mode Core Test Standards

**Purpose:** Define requirements for tests to be included in the CLI Mode core test suite.

## Core Test Inclusion Criteria

Tests in `tests/cli-mode/core/` MUST meet ALL of the following requirements:

### 1. Clear Purpose & Documentation
- [ ] Test file includes header docstring with purpose, phase, and priority
- [ ] Test addresses specific CRITICAL issue, bug, or core functionality
- [ ] Test name clearly indicates what is being validated
- [ ] Bug references included if applicable (e.g., "Bug #21", "CRITICAL-001")

**Example:**
```bash
#!/bin/bash
# tests/cli-mode/test-coordinator-spawning.sh
# Phase 2 :: Validates cfn-v3-coordinator spawning from /cfn-loop-cli (Priority 2)
```

### 2. Production Code Fidelity
- [ ] Integration/E2E tests MUST use real production scripts (no simulations)
- [ ] Tests validate actual CLI commands executed in production
- [ ] Tests use production images (cfn-agent:latest, not alpine:latest)
- [ ] Tests validate actual spawn-agent.sh behavior (not mocked)

**Anti-Pattern (BUG #21 Lesson):**
```bash
# ❌ WRONG - Simulations don't catch production bugs
docker run alpine:latest sh -c "inline script"

# ✅ CORRECT - Real production code paths
npx claude-flow-novice agent cfn-v3-coordinator --task-id "$TASK_ID"
```

### 3. Non-Redundant Coverage
- [ ] Test provides unique validation not covered by other core tests
- [ ] Test cannot be replaced by existing unit/integration/e2e tests
- [ ] Test adds measurable value to test suite coverage
- [ ] Redundant tests moved to `core/legacy/` with documentation

### 4. Proper Test Category Placement

**Unit Tests** (`core/unit/`):
- Component-level validation
- No external dependencies (Redis, Docker)
- Fast execution (<10 seconds each)
- Examples: Parameter validation, syntax checks, threshold enforcement

**Integration Tests** (`core/integration/`):
- Component interaction validation
- May require Redis or Docker
- Moderate execution time (10-60 seconds each)
- Examples: Coordinator spawning, orchestrator workflow, Redis coordination

**E2E Tests** (`core/e2e/`):
- Full workflow validation with real production scripts
- Requires all dependencies (Redis, Docker, NPX, cfn-agent image)
- Longer execution time (1-5 minutes each)
- Examples: TRUE E2E CLI mode execution, success criteria flow

**North Star E2E Test** (`core/e2e/test-cfn-loop-cli-real-execution.sh`):
- **MUST be included in `--full` mode** - No exceptions
- **NO mocks, simulations, or bypasses** - Real production code paths only
- **5 FULL ITERATIONS** - Validates context passing and ITERATE workflow
- **Validates complete CLI mode pipeline:**
  1. Real cfn-spawn spawns cfn-v3-coordinator
  2. Coordinator invokes real orchestrate-wrapper.sh
  3. Wrapper validates parameters and calls orchestrate.sh
  4. Orchestrator spawns real Loop 3 agents via CLI (up to 5 iterations)
  5. Real test execution and deliverable creation
  6. Real gate checks (test pass rate ≥0.95 in standard mode)
  7. Real Loop 2 validators review deliverables
  8. Real Product Owner makes PROCEED/ITERATE/ABORT decision
  9. Context passing between iterations validated
  10. ITERATE → feedback → retry workflow validated
- **Purpose:** Prevents BUG #21 regressions (tests pass while production fails)
- **Expected Runtime:** 5-10 minutes (5 iterations with real agent spawning)
- **Dependencies:** Redis running, NPX available, production scripts unmodified
- **Configuration:** MODE=standard, MAX_ITERATIONS=5, gate_threshold=0.95, consensus_threshold=0.90

### 5. Test Structure Compliance
- [ ] Uses `set -euo pipefail` for strict error handling
- [ ] Sources `$PROJECT_ROOT/tests/test-utils.sh` for shared helpers
- [ ] Implements `cleanup()` function with `trap cleanup EXIT`
- [ ] Uses structured logging (`log_step`, `log_info`, `annotate`)
- [ ] Follows GIVEN/WHEN/THEN comment structure for clarity

**Required Template:**
```bash
#!/bin/bash
# tests/cli-mode/core/<category>/test-name.sh
# Phase X :: <purpose> (Priority X)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # Cleanup resources
}
trap cleanup EXIT

test_scenario() {
  log_step "GIVEN <context>"
  # WHEN <action>
  # THEN assert_* "<result>"
}

test_scenario
```

### 6. Test Runner Integration
- [ ] Test is executable (`chmod +x`)
- [ ] Test is referenced in `run-all-tests.sh` appropriate category
- [ ] Test passes when run via test runner
- [ ] Test handles cleanup even on failure

### 7. Maintenance & Evolution
- [ ] Test can run idempotently (multiple times without side effects)
- [ ] Test includes comments explaining non-obvious validation logic
- [ ] Test references related bug documentation if applicable
- [ ] Test has clear pass/fail criteria

## Legacy Test Movement Criteria

Move tests to `core/legacy/` when they:

1. **Duplicate functionality** of newer, more comprehensive tests
2. **Use simulations/mocks** instead of real production code paths
3. **Target specific bugs** that have been fixed and are now validated elsewhere
4. **Lack clear descriptions** or have been superseded by refactored versions
5. **Provide no unique value** compared to existing core tests

**When moving to legacy:**
- Update `core/legacy/README.md` with reason for move
- Document replacement test if applicable
- Preserve test for historical reference

## Test Runner Requirements

The `tests/cli-mode/run-all-tests.sh` script MUST:

### Quick Mode (`--quick`)
- Run ONLY unit tests from `core/unit/`
- Complete in <2 minutes
- No external dependencies required
- Exit code 0 if all unit tests pass

### Integration Mode (`--integration`)
- Run unit tests + integration tests from `core/integration/`
- Complete in <7 minutes
- Require Redis and Docker
- Exit code 0 if all tests pass

### Full Mode (`--full`)
- Run ALL core tests (unit + integration + e2e)
- Complete in <20 minutes
- Require all dependencies (Redis, Docker, NPX, cfn-agent image)
- Exit code 0 if all tests pass
- **MUST include North Star E2E test** (`test-cfn-loop-cli-real-execution.sh`)
  - This test uses REAL agent spawning (no mocks)
  - Validates production code paths end-to-end
  - Prevents regressions where tests pass but production fails (BUG #21)

### Standard Features
- [ ] Automatic prerequisite checking (Redis, Docker, NPX)
- [ ] Color-coded output (pass/fail/skip)
- [ ] Summary report with pass/fail counts
- [ ] Automatic cleanup of test artifacts
- [ ] **Excludes `core/legacy/` tests by default**

### Test Discovery Pattern
```bash
# Unit tests
for test in tests/cli-mode/core/unit/*.sh; do
  run_test "$test"
done

# Integration tests
for test in tests/cli-mode/core/integration/*.sh; do
  run_test "$test"
done

# E2E tests
for test in tests/cli-mode/core/e2e/*.sh; do
  run_test "$test"
done

# ❌ WRONG - Don't include legacy
for test in tests/cli-mode/core/legacy/*.sh; do
  run_test "$test"  # NO - legacy excluded by default
done
```

## Quality Gates

### Unit Test Requirements
- **Pass Rate:** 100% (no flaky tests)
- **Coverage:** All critical parameters and validation logic
- **Speed:** <10 seconds per test

### Integration Test Requirements
- **Pass Rate:** ≥95% (allow for transient failures)
- **Coverage:** All coordinator spawning and orchestrator workflows
- **Speed:** <60 seconds per test

### E2E Test Requirements
- **Pass Rate:** ≥90% (allow for infrastructure issues)
- **Coverage:** Full CFN Loop workflows with real scripts
- **Speed:** <5 minutes per test

## Review Checklist

Before adding a test to core:

- [ ] Test meets all 7 inclusion criteria
- [ ] Test is in correct category (unit/integration/e2e)
- [ ] Test uses production code paths (no simulations for integration/e2e)
- [ ] Test is non-redundant with existing core tests
- [ ] Test follows template structure
- [ ] Test is integrated into `run-all-tests.sh`
- [ ] Test includes cleanup trap
- [ ] Test has clear pass/fail criteria
- [ ] Test can run idempotently
- [ ] Legacy tests moved if applicable

## Why the North Star E2E Test Matters

**Background (BUG #21 Lesson):**

During CLI mode development, we had comprehensive test coverage with 100% pass rates. However, production was failing 100% due to a critical gap:

**The Gap:**
- Tests used: Mock containers with inline scripts (`docker run alpine:latest sh -c "..."`)
- Production used: Real cfn-spawn → spawn-agent.sh → cfn-agent image → npx CLI

**The Result:**
- spawn-agent.sh had incorrect CLI syntax: `npx claude-flow-novice agent "$AGENT_TYPE"`
- Correct syntax requires: `npx claude-flow-novice agent "$AGENT_TYPE" --task-id "$TASK_ID"`
- Tests never caught this because they bypassed the real spawning mechanism

**The Prevention:**

The North Star E2E test (`test-cfn-loop-cli-real-execution.sh`) prevents this by:

1. **Using ZERO mocks** - Every component is the real production version
2. **Following exact production flow** - Same spawn commands, same scripts, same images
3. **Validating container logs** - Checks for CLI errors that only appear in real execution
4. **Testing deliverables** - Ensures agents actually complete work (prevents "consensus on vapor")
5. **End-to-end validation** - Coordinator → Orchestrator → Loop 3 → Loop 2 → Product Owner

**This test is the final gate that ensures:**
- If the test passes, production will work
- If production fails, the test will catch it
- No "works in test, fails in production" scenarios

**Runtime Commitment:**
- Expected: 2-5 minutes
- Acceptable: Up to 10 minutes in resource-constrained environments
- Worth it: Prevents hours of production debugging

## Related Documentation

- `tests/CORE_TEST_SUMMARY.md` - Complete core test catalog
- `tests/CLAUDE.md` - Global test authoring standards
- `tests/cli-mode/core/legacy/README.md` - Legacy test reference
- `docs/BUG_21_PRODUCTION_TESTING_REQUIREMENTS.md` - Production testing requirements
