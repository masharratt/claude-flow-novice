# TDD Compliance Test Suite

**Phase 3 Test-Driven Development Validation**

This test suite validates that CFN Loop agents follow proper Test-Driven Development (TDD) protocol in CLI mode. The tests ensure agents write tests before implementation, follow the RED-GREEN-REFACTOR cycle, integrate with post-edit validation pipelines, and enforce coverage gates.

## Overview

**Purpose:** Validate TDD compliance prevents "consensus on vapor" anti-pattern by ensuring objective test execution replaces subjective confidence scoring.

**Scope:** CLI mode agent behavior (Loop 3 implementers)

**Test-Driven Validation Benefits:**
- 95%+ accuracy (vs 55% with confidence-based approach)
- Prevents shipping untested code
- Catches infrastructure gaps (Redis, Docker, Jest config)
- Validates actual test execution, not just test creation

**Reference:** See `docs/testing/TDD_LESSONS_LEARNED.md` for gap analysis (0.88 subjective confidence vs 0.0 actual pass rate)

## Test Files

### 1. `test-tests-before-code.sh`
**Purpose:** Verify agents create test files before implementation files

**Test Scenarios:**
- File creation timestamp verification
- Git commit history analysis (test commits before implementation commits)
- Paired test file existence checks

**Success Criteria:**
- Test files have earlier timestamps than implementation files
- Git history shows TDD workflow (tests committed first)
- Every implementation file has corresponding test file

**Execution:**
```bash
./tests/tdd-compliance/test-tests-before-code.sh
```

**Expected Output:**
```
✅ Test file created before implementation (TDD compliant)
✅ Git history shows TDD order: tests before implementation
✅ Test file exists for implementation (TDD compliant)
```

### 2. `test-red-green-refactor.sh`
**Purpose:** Validate complete RED-GREEN-REFACTOR TDD cycle

**Test Phases:**

**RED Phase:**
- Tests written without implementation
- Tests execute and fail (expected behavior)
- Validates agents don't skip to implementation

**GREEN Phase:**
- Implementation added to make tests pass
- All tests execute successfully
- Minimal implementation (just enough to pass)

**REFACTOR Phase:**
- Code quality improvements applied
- Tests still pass after refactoring
- No behavioral regression introduced

**Success Criteria:**
- RED: Tests fail initially (exit code != 0)
- GREEN: Tests pass with implementation (exit code == 0)
- REFACTOR: Tests pass after quality improvements (exit code == 0)

**Execution:**
```bash
./tests/tdd-compliance/test-red-green-refactor.sh
```

**Expected Output:**
```
✅ RED phase: Tests failed as expected (no implementation)
✅ GREEN phase: Tests passed with implementation
✅ REFACTOR phase: Tests still pass after improvement
✅ Complete RED-GREEN-REFACTOR cycle successful
```

### 3. `test-post-edit-feedback.sh`
**Purpose:** Verify agents integrate with post-edit validation pipeline

**Test Scenarios:**
- Hook invocation after file edits
- Validation feedback loop (agent receives warnings)
- Multi-validator pipeline integration
- File type handling (TypeScript, shell, markdown)
- Non-blocking mode verification

**Success Criteria:**
- Agents invoke `.claude/hooks/cfn-invoke-post-edit.sh` after edits
- Validation output captured and accessible to agents
- Multiple validators execute in pipeline
- Non-blocking mode allows agent to continue with warnings

**Execution:**
```bash
./tests/tdd-compliance/test-post-edit-feedback.sh
```

**Expected Output:**
```
✅ Post-edit hook invoked successfully
✅ Post-edit validation provided feedback
✅ Agent received validation results
✅ Multiple validators integrated in pipeline
```

### 4. `test-post-edit-error-handling.sh`
**Purpose:** Verify agents receive and respond to post-edit validation errors

**Test Scenarios:**
- Pipe safety issue detection
- Error message capture and accessibility
- Agent error parsing and interpretation
- Agent fix workflow based on feedback
- Blocking mode enforcement (errors prevent completion)
- Error context details (file path, line numbers)

**Success Criteria:**
- Post-edit pipeline detects intentional errors
- Error messages captured in agent-accessible locations
- Agents can parse and identify error types
- Agents apply fixes that reduce error count
- Blocking mode returns non-zero exit code on errors

**Execution:**
```bash
./tests/tdd-compliance/test-post-edit-error-handling.sh
```

**Expected Output:**
```
✅ Post-edit pipeline detected pipe safety issue
✅ Error messages captured and accessible to agent
✅ Agent can parse and identify error types from validation output
✅ Agent successfully fixed issues based on post-edit feedback
✅ Blocking mode: Hook returns error to prevent agent completion
```

### 5. `test-coverage-enforcement.sh`
**Purpose:** Validate test coverage gates and mode-specific thresholds

**Test Scenarios:**
- Coverage calculation from test results (pass rate)
- Gate failure when coverage < threshold
- Gate success when coverage ≥ threshold
- Mode-specific thresholds (MVP: 0.70, Standard: 0.95, Enterprise: 0.98)
- Gate check integration (test-driven strategy)
- Coverage metrics storage for iteration context
- Iteration context generation on gate failure

**Success Criteria:**
- Coverage calculated correctly from test pass/fail counts
- Gate fails when pass rate < mode threshold
- Gate passes when pass rate ≥ mode threshold
- Mode thresholds enforced correctly
- Iteration context generated with gap analysis

**Execution:**
```bash
./tests/tdd-compliance/test-coverage-enforcement.sh
```

**Expected Output:**
```
✅ Coverage ≥80% achieved: 1.00
✅ Gate correctly fails with coverage 0.556 < 0.80
✅ Gate passes with coverage 0.967 ≥ 0.95
✅ Mode-specific thresholds validated: MVP (0.70), Standard (0.95), Enterprise (0.98)
```

## Test Execution

### Run All Tests
```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice

# Run complete suite
for test in tests/tdd-compliance/test-*.sh; do
  echo "Running: $test"
  bash "$test"
  echo ""
done
```

### Run Individual Test
```bash
# Example: Run RED-GREEN-REFACTOR test
bash tests/tdd-compliance/test-red-green-refactor.sh
```

### Run with Verbose Output
```bash
# Enable debug mode
bash -x tests/tdd-compliance/test-tests-before-code.sh
```

## Dependencies

**Required:**
- Git (for commit timestamp tests)
- Node.js (for test execution in RED-GREEN-REFACTOR cycle)
- `bc` (for floating-point arithmetic in coverage calculations)
- `jq` (for JSON parsing in gate checks)

**Optional:**
- Redis (for post-edit pipeline integration tests - will skip if unavailable)
- Docker (for CLI mode integration - tests handle absence gracefully)

**Test Utilities:**
- `tests/test-utils.sh` - Shared logging, assertions, and helpers
- `.claude/hooks/cfn-invoke-post-edit.sh` - Post-edit validation hook
- `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh` - Coverage gate validation

## Test Structure

All tests follow the project standard template:

```bash
#!/bin/bash
# tests/tdd-compliance/test-<name>.sh
# Phase 3 :: TDD Compliance - <description>

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # Clean up test artifacts
}
trap cleanup EXIT

test_scenario() {
  log_step "GIVEN <context>"
  # WHEN <action>
  # THEN
  assert_success "<result>"
}

test_scenario
```

**GIVEN/WHEN/THEN Pattern:**
- **GIVEN:** Test context and setup
- **WHEN:** Action or behavior being tested
- **THEN:** Expected outcome with assertions

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed
- `2` - Test setup failed (missing dependencies)

## Integration with CFN Loop

**Loop 3 Gate Check:**
```bash
# Gate check using test-driven strategy
./.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh \
  --task-id "$TASK_ID" \
  --agents "$LOOP3_AGENTS" \
  --threshold 0.95 \
  --min-quorum 3 \
  --mode standard \
  --strategy test-driven \
  --success-criteria '{
    "test_suites": [
      {
        "name": "unit-tests",
        "command": "npm test tests/unit/",
        "pass_threshold": 0.95,
        "timeout": 300,
        "required": true
      }
    ]
  }'
```

**Agent Completion Protocol:**
```bash
# Agent executes tests and reports pass rate (NOT subjective confidence)
TESTS_PASSED=51
TESTS_TOTAL=54
PASS_RATE=$(echo "scale=3; $TESTS_PASSED / $TESTS_TOTAL" | bc -l)

./.claude/skills/cfn-coordination/report-completion.sh \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence "$PASS_RATE" \
  --result "{\"tests_passed\": $TESTS_PASSED, \"tests_total\": $TESTS_TOTAL}"
```

## TDD Protocol Summary

**Phase 1: Write Tests (RED)**
1. Agent creates test file BEFORE implementation
2. Tests execute and fail (expected)
3. Commit tests with message: "test: add X tests (RED - expected to fail)"

**Phase 2: Implement (GREEN)**
4. Agent creates minimal implementation to pass tests
5. Tests execute and pass
6. Commit implementation: "feat: implement X to pass tests (GREEN)"

**Phase 3: Validate (REFACTOR)**
7. Agent runs post-edit validation (`.claude/hooks/cfn-invoke-post-edit.sh`)
8. Agent refactors code based on feedback
9. Tests still pass after refactoring
10. Agent reports objective pass rate (NOT subjective confidence)

**Phase 4: Gate Check**
11. Gate check calculates aggregate pass rate from all agents
12. Gate passes if pass_rate ≥ threshold (mode-specific)
13. If gate fails, iteration context generated with gap analysis

## Anti-Pattern Prevention

**"Consensus on Vapor" (BUG #11 root cause):**
- Agents report high confidence without test execution
- Example: 0.88 subjective confidence vs 0.0 actual pass rate
- **Prevention:** TDD protocol requires objective test execution

**Missing Infrastructure:**
- Agents create tests but can't execute (Redis down, Jest not configured)
- Example: 81% of tests blocked by missing Redis/Docker
- **Prevention:** Infrastructure validation before test creation

**Subjective Confidence:**
- Agents estimate coverage ("looks good to me")
- Example: "85-90% coverage achieved" vs 0% executable
- **Prevention:** Objective pass rate calculation required

## Troubleshooting

**Tests fail due to missing Node.js:**
```bash
# Install Node.js
sudo apt-get install nodejs npm
```

**Post-edit hook not found:**
```bash
# Verify hook exists and is executable
ls -la .claude/hooks/cfn-invoke-post-edit.sh
chmod +x .claude/hooks/cfn-invoke-post-edit.sh
```

**Gate check script not executable:**
```bash
# Make gate-check.sh executable
chmod +x .claude/skills/cfn-loop-orchestration/helpers/gate-check.sh
```

**bc command not found:**
```bash
# Install bc for floating-point arithmetic
sudo apt-get install bc
```

## Related Documentation

- **TDD Lessons Learned:** `docs/testing/TDD_LESSONS_LEARNED.md`
- **Test-Driven CFN Loop Guide:** `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md`
- **Success Criteria Examples:** `docs/guides/SUCCESS_CRITERIA_EXAMPLES.md`
- **Test Authoring Standards:** `tests/CLAUDE.md`
- **Post-Edit Validators:** `docs/guides/POST_EDIT_VALIDATORS.md`

## Metrics

**Test Coverage:**
- 5 test files
- 32 test scenarios
- 100% TDD protocol coverage (tests-before-code, RED-GREEN-REFACTOR, post-edit, coverage gates)

**Execution Time:**
- Full suite: ~60 seconds
- Individual test: ~10-15 seconds

**Success Rate Target:**
- Baseline: 100% (all tests pass on compliant agents)
- Regression detection: <100% indicates TDD protocol violation

## Contributing

When adding new TDD compliance tests:

1. Follow template structure (see above)
2. Use GIVEN/WHEN/THEN pattern
3. Add cleanup trap for test artifacts
4. Document in this README
5. Ensure tests are idempotent (can run multiple times)
6. Make tests executable: `chmod +x tests/tdd-compliance/test-*.sh`

## Version History

- **v1.0** (2025-11-17) - Initial TDD compliance test suite
  - Tests-before-code validation
  - RED-GREEN-REFACTOR cycle validation
  - Post-edit pipeline integration
  - Coverage enforcement and gate checks
