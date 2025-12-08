# Test Suite Consolidation Roadmap
## Implementation Guide for Test Coverage Optimization

**Last Updated:** November 18, 2025  
**Estimated Total Effort:** 14-24 hours across 3 phases

---

## Phase 1: Quick Wins (2-4 hours) ⚡

Start here. These are safe, low-risk improvements with immediate payoff.

### Task 1.1: Delete 5 Empty Test Files (30 min)

Empty files cause confusion and maintenance overhead.

**Files to delete:**
```bash
tests/docker/core/docker-hello-world-parity-tests.sh (0 tests)
tests/docker/core/test-contract-alignment.sh (0 tests)
tests/docker/core/test-coordinator-params-simple.sh (0 tests)
tests/docker/core/test-wave-orchestration-recovery.sh (0 tests)
tests/docker/core/test-bugfix-quick-verification.sh (0 tests)
```

**Command:**
```bash
cd /path/to/project
git rm tests/docker/core/docker-hello-world-parity-tests.sh
git rm tests/docker/core/test-contract-alignment.sh
git rm tests/docker/core/test-coordinator-params-simple.sh
git rm tests/docker/core/test-wave-orchestration-recovery.sh
git rm tests/docker/core/test-bugfix-quick-verification.sh
git commit -m "chore: remove 5 empty test files (cleanup)"
```

**Impact:**
- Reduced confusion about what tests exist
- Cleaner codebase
- No functionality change

**Testing:** No new tests needed (deletion only)

---

### Task 1.2: Create TEST_COVERAGE_MATRIX.md (1 hour)

This document helps developers understand which tests are complementary vs. duplicated.

**Location:** `/mnt/c/Users/masha/Documents/claude-flow-novice/docs/TEST_COVERAGE_MATRIX.md`

**Content Structure:**
```markdown
# Test Coverage Matrix

## Overview
35 test files, 307+ test functions

## Coverage by Area
- Redis Coordination: 11 tests
- CFN Loop: 10 tests
- Coordinator: 68 tests
- Agent Lifecycle: 30 tests
- Orchestrator: 18 tests
- Workflow: 63 tests

## Cross-Reference Guide
[Lists which tests are complementary]
[Lists which tests are duplicated]
[Maps tests to functional areas]

## Test Dependencies
[Shows which tests should run in which order]
[Identifies tests that can run in parallel]
```

**Action:** Create this file with content from the TEST_COVERAGE_OVERLAP_ANALYSIS.md

---

### Task 1.3: Create Threshold Validation Tests (1-2 hours)

Add missing unit-level threshold tests to docker/core/.

**Location:** `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker/core/threshold-validation-tests.sh`

**Tests to implement:**
```bash
test_gate_threshold_70()          # MVP: ≥0.70 threshold
test_gate_threshold_75()          # Standard: ≥0.75 threshold
test_gate_threshold_90()          # Enterprise: ≥0.90 threshold
test_gate_threshold_98()          # Ultra: ≥0.98 threshold
test_consensus_threshold_80()     # MVP consensus: ≥0.80
test_consensus_threshold_90()     # Standard consensus: ≥0.90
test_consensus_threshold_95()     # Enterprise consensus: ≥0.95
test_iteration_limit_enforcement() # Max iterations enforcement
test_convergence_detection()      # Convergence when thresholds met
test_threshold_boundary_values()  # Edge case: exactly at threshold
test_threshold_below_limit()      # Below threshold → iterate
test_threshold_above_limit()      # Above threshold → proceed
```

**Framework:** Use same structure as docker/core/ tests (redis-cli, no containers)

**Success Criteria:**
- 12 tests implemented
- All tests pass locally
- Tests document threshold logic clearly

---

## Phase 2: Organization (4-8 hours) 📦

Improve structure and reduce duplicate code. Do Phase 1 first.

### Task 2.1: Organize Coordinator Tests (2 hours)

Create subdirectory for coordinator-specific tests to reduce root-level clutter.

**Current structure:**
```
tests/docker/core/
├── coordinator-atomic-task-tests.sh
├── coordinator-docker-in-docker-tests.sh
├── coordinator-fault-tolerance-tests.sh
├── coordinator-iteration-tests.sh
├── coordinator-planning-tests.sh
├── coordinator-validation-tests.sh
└── ...
```

**New structure:**
```
tests/docker/core/
├── coordinator/
│   ├── README.md (purpose, relationships)
│   ├── atomic-task-tests.sh
│   ├── docker-in-docker-tests.sh
│   ├── fault-tolerance-tests.sh
│   ├── iteration-tests.sh
│   ├── planning-tests.sh
│   ├── validation-tests.sh
│   └── run-all.sh (execute all coordinator tests)
└── ...
```

**Steps:**
1. Create `tests/docker/core/coordinator/` directory
2. Move 6 coordinator-*.sh files into subdirectory
3. Create `coordinator/README.md` explaining:
   - Purpose of each test file
   - Dependencies between tests
   - Which tests can run in parallel
4. Create `coordinator/run-all.sh` script:
   ```bash
   #!/bin/bash
   source "$PROJECT_ROOT/tests/test-utils.sh"
   
   for test_file in atomic-task-tests.sh docker-in-docker-tests.sh ...; do
       bash "$test_file" || exit 1
   done
   ```

**Impact:**
- Coordinator tests grouped logically
- Easier to navigate test suite
- Coordinator/ can be independently run

---

### Task 2.2: Create Shared Test Helpers (2 hours)

Extract duplicate code into reusable helpers.

**New files to create:**

#### redis-test-helpers.sh
```bash
# Extract common Redis setup from:
# - docker/core/redis-coordination-tests.sh
# - docker/core/cfn-loop-compliance-tests.sh
# - docker-mode/test-redis-coordination.sh

redis_test_init() { }
redis_test_cleanup() { }
redis_verify_connectivity() { }
redis_get_service_name() { }
redis_wait_for_ready() { }
```

#### coordinator-test-helpers.sh
```bash
# Extract common coordinator setup from:
# - docker/core/coordinator-*.sh files

coordinator_cleanup() { }
coordinator_verify_docker() { }
coordinator_verify_redis() { }
coordinator_get_plan() { }
```

#### lifecycle-helpers.sh
```bash
# Extract common lifecycle patterns from:
# - docker/core/agent-lifecycle-tests.sh
# - docker-mode/test-orchestrator-workflow.sh

lifecycle_spawn_agent() { }
lifecycle_verify_metadata() { }
lifecycle_verify_cleanup() { }
lifecycle_detect_orphans() { }
```

**Expected reduction:** 200-300 lines of duplicate code

---

### Task 2.3: Create TEST_EXECUTION_GUIDE.md (2 hours)

Practical guide for running tests effectively.

**Location:** `/mnt/c/Users/masha/Documents/claude-flow-novice/docs/TEST_EXECUTION_GUIDE.md`

**Content:**
```markdown
# Test Execution Guide

## Recommended Execution Order

### Phase 0: Quick Validation (5 min)
- redis-coordination-tests.sh (core only)
- Result: Verify Redis connectivity

### Phase 1: Core Logic Tests (20 min)
- cfn-loop-compliance-tests.sh
- agent-lifecycle-tests.sh
- threshold-validation-tests.sh

### Phase 2: Coordinator Tests (30 min)
- tests/docker/core/coordinator/run-all.sh
- Result: Verify coordinator behavior

### Phase 3: Integration Tests (40 min)
- tests/docker-mode/test-cfn-loop-full-cycle.sh
- tests/docker-mode/test-orchestrator-workflow.sh
- Result: Full workflow validation

### Phase 4: Process Tests (30 min)
- tests/docker-mode/test-tdd-compliance.sh
- tests/docker-mode/test-workflow-codification.sh

## Parallel Execution
Tests that can run simultaneously:
- env-propagation-tests.sh + memory-budget-tests.sh
- docker/core/coordinator/* (all coordinator tests)
- test-playbook-*.sh (all playbook tests)

## Resource Requirements
- Redis: 1 instance shared across core tests
- Docker: Standard daemon
- Disk: 500MB temporary
- Memory: 2GB minimum
- Time: ~125 minutes full suite, ~50 min core only

## CI/CD Integration
- Pre-commit: core logic tests only (5 min)
- Pre-merge: core + coordinator tests (35 min)
- Pre-release: full suite (125 min)
```

---

## Phase 3: Optimization (8-12 hours) 🚀

Advanced improvements for CI/CD and developer experience. Do Phases 1-2 first.

### Task 3.1: Implement Parallel Execution (3 hours)

Create framework for running tests in parallel.

**Location:** `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker/run-parallel.sh`

**Features:**
- Detects which tests can run in parallel
- Manages resource pooling (Redis ports, Docker networks)
- Aggregates results
- Reports timing per test

**Script structure:**
```bash
#!/bin/bash
# Parallel test executor with resource isolation

set -euo pipefail

# Tests that can run in parallel (isolated Redis instances)
parallel_tests=(
    "core/agent-lifecycle-tests.sh"
    "core/cfn-loop-compliance-tests.sh"
    "core/threshold-validation-tests.sh"
)

# Tests that must run sequentially (shared coordinator)
sequential_tests=(
    "core/end-to-end-coordinator-launch-test.sh"
    "docker-mode/test-cfn-loop-full-cycle.sh"
)

# Run parallel tests with process management
for test in "${parallel_tests[@]}"; do
    (bash "$test") &
done
wait

# Run sequential tests
for test in "${sequential_tests[@]}"; do
    bash "$test" || exit 1
done
```

---

### Task 3.2: Create Coverage Dashboard (2-3 hours)

Automated report of test coverage by area.

**Location:** `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker/coverage-report.sh`

**Output:**
```
Test Coverage Report
====================
Generated: 2025-11-18

Area                    Core    Docker-Mode    Total    Coverage %
Redis                   4            7          11       85%
CFN Loop               4            6          10       80%
Coordinator           46           22          68       95%
Agent Lifecycle       12           18          30       75%
Orchestrator           0           18          18       90%
Workflow               0           63          63       100%
─────────────────────────────────────────────────────
TOTAL               160          147         307       87%

Gaps Identified:
- Performance under load: PARTIAL
- Cross-component interaction: PARTIAL
- Security edge cases: MINIMAL

Empty files to remove:
- 0 (all deleted in Phase 1)
```

---

### Task 3.3: Create Test Dependency Graph (2-3 hours)

Document which tests depend on each other.

**Location:** `/mnt/c/Users/masha/Documents/claude-flow-novice/docs/TEST_DEPENDENCY_GRAPH.md`

**Content:**
```
redis-coordination-tests.sh (CORE)
├── REQUIRED BY: cfn-loop-compliance-tests.sh
├── REQUIRED BY: test-orchestrator-workflow.sh
└── REQUIRED BY: coordinator-validation-tests.sh

cfn-loop-compliance-tests.sh (CORE)
├── REQUIRED BY: test-cfn-loop-full-cycle.sh
└── REQUIRED BY: coordinator-validation-tests.sh

agent-lifecycle-tests.sh (CORE)
└── REQUIRED BY: test-orchestrator-workflow.sh

coordinator/* (CORE GROUP)
├── REQUIRED BY: test-orchestrator-workflow.sh
└── REQUIRED BY: test-cfn-loop-full-cycle.sh
```

---

## Implementation Checklist

### Phase 1: Quick Wins
- [ ] Delete 5 empty test files
- [ ] Create TEST_COVERAGE_MATRIX.md
- [ ] Create threshold-validation-tests.sh
- [ ] Run full test suite to verify no regression
- [ ] Commit: "Phase 1: Test suite cleanup and documentation"
- **Estimated Time:** 2-4 hours

### Phase 2: Organization
- [ ] Create tests/docker/core/coordinator/ directory
- [ ] Move coordinator-*.sh files to subdirectory
- [ ] Create coordinator/README.md
- [ ] Create coordinator/run-all.sh
- [ ] Extract redis-test-helpers.sh
- [ ] Extract coordinator-test-helpers.sh
- [ ] Extract lifecycle-helpers.sh
- [ ] Create TEST_EXECUTION_GUIDE.md
- [ ] Run full test suite to verify no regression
- [ ] Commit: "Phase 2: Test organization and shared helpers"
- **Estimated Time:** 4-8 hours

### Phase 3: Optimization (Optional)
- [ ] Implement run-parallel.sh
- [ ] Create coverage-report.sh
- [ ] Document test dependency graph
- [ ] Test parallel execution
- [ ] Measure performance improvements
- [ ] Commit: "Phase 3: Parallel execution and coverage reporting"
- **Estimated Time:** 8-12 hours

---

## Success Criteria

### Phase 1 Success
- [x] No empty test files
- [x] New threshold tests added
- [x] Coverage matrix documented
- [x] Full test suite still passes

### Phase 2 Success
- [x] Coordinator tests grouped logically
- [x] Duplicate code extracted to helpers
- [x] Test execution guide available
- [x] Full test suite still passes

### Phase 3 Success (Optional)
- [x] Parallel tests execute without conflicts
- [x] Coverage reporting automated
- [x] Test dependencies documented
- [x] CI/CD optimized for performance

---

## Risk Mitigation

**Risk 1: Breaking Tests During Consolidation**
- Mitigation: Run full test suite after each phase
- Contingency: Git revert if issues arise

**Risk 2: Shared Helpers Break Test Isolation**
- Mitigation: Ensure helpers are stateless
- Contingency: Revert to local code if conflicts

**Risk 3: Parallel Tests Interfere with Each Other**
- Mitigation: Use isolated Redis ports and Docker networks
- Contingency: Fall back to sequential execution

**Risk 4: Developer Confusion During Transition**
- Mitigation: Document all changes in IMPLEMENTATION_NOTES.md
- Contingency: Keep old file structure as fallback

---

## Post-Implementation Actions

### Immediately After Phase 1
1. Update CI/CD to use new test file structure
2. Update documentation references
3. Notify team of changes

### After Phase 2
1. Update test execution documentation
2. Train team on new test organization
3. Update git hooks if needed

### After Phase 3
1. Implement parallel execution in CI/CD
2. Monitor performance improvements
3. Adjust execution strategy based on results

---

## Timeline Estimates

| Phase | Task | Duration | Difficulty |
|-------|------|----------|-----------|
| 1 | Delete empty files | 30 min | Easy |
| 1 | Coverage matrix | 1 hour | Easy |
| 1 | Threshold tests | 1-2 hours | Medium |
| 2 | Organize coordinator | 2 hours | Medium |
| 2 | Extract helpers | 2 hours | Medium |
| 2 | Execution guide | 2 hours | Easy |
| 3 | Parallel runner | 3 hours | Hard |
| 3 | Coverage dashboard | 2-3 hours | Medium |
| 3 | Dependency graph | 2-3 hours | Easy |
| **TOTAL** | | **14-24 hours** | **Mixed** |

---

## Questions for Stakeholders

Before implementation, clarify:

1. **Priority:** Should this be done immediately or defer to later sprint?
2. **Resources:** Who will implement Phase 2 and 3?
3. **Testing:** Any custom test frameworks we should preserve?
4. **CI/CD:** What test execution time is acceptable?
5. **Coverage:** Any additional test areas we should prioritize?

---

**Document Status:** READY FOR IMPLEMENTATION  
**Next Step:** Approve Phase 1 scope and begin implementation
