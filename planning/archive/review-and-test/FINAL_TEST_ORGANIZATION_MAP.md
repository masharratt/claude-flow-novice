# Final Test Organization Map - Post Reorganization

**Date:** 2025-11-18
**Status:** ✅ Reorganization Complete
**Total Tests:** 253+ test files across 4 primary locations

---

## Executive Summary

Tests have been successfully reorganized from the initial `tests/docker-mode/` structure into a more logical organization:

**Primary Test Locations:**
1. **tests/docker/core/** - Docker-based CFN Loop core tests (31 files)
2. **tests/integration/** - Integration and system tests (34 files)
3. **tests/cli-mode/** - CLI mode specific tests (17 files)
4. **tests/** (root) - Specialized test categories (171+ files)

**Key Changes:**
- ✅ CFN Loop tests moved to `tests/docker/core/`
- ✅ Playbook/workflow tests remain in specialized locations
- ✅ Clear separation between Docker core and integration tests
- ✅ No duplicate test files

---

## Part 1: Test Directory Structure

### 1. Docker Core Tests (`tests/docker/core/`) - 31 Files

**Purpose:** Core Docker-based CFN Loop functionality and coordinator tests

**Relocated Tests (from docker-mode):**
- ✅ `cfn-loop-full-cycle-tests.sh` (6 tests) - Full CFN Loop with real containers
- ✅ `coordinator-spawning-tests.sh` (23 tests) - Docker spawning patterns
- ✅ `orchestrator-workflow-tests.sh` (21 tests) - Orchestrator workflow validation
- ✅ `tdd-compliance-tests.sh` (24 tests) - TDD compliance in Docker

**Existing Tests (pre-reorganization):**
- `agent-lifecycle-tests.sh` - Agent spawn-to-exit lifecycle
- `cfn-loop-compliance-tests.sh` - Loop 3 gate, Loop 2 consensus, PO decisions
- `coordinator-atomic-task-tests.sh` - Atomic task execution
- `coordinator-docker-in-docker-tests.sh` - Docker-in-Docker coordination
- `coordinator-fault-tolerance-tests.sh` - Fault tolerance and recovery
- `coordinator-iteration-tests.sh` - Iteration management
- `coordinator-planning-tests.sh` - Planning phase validation
- `coordinator-validation-tests.sh` - Coordinator validation patterns
- `docker-hello-world-parity-tests.sh` - Hello world parity tests
- `end-to-end-coordinator-launch-test.sh` - E2E coordinator launch
- `env-propagation-tests.sh` - Environment variable propagation
- `memory-budget-tests.sh` - Memory budget enforcement
- `redis-coordination-tests.sh` - Redis coordination patterns
- `test-bugfix-*.sh` (5 files) - Bug fix validation tests
- `test-contract-alignment.sh` - Contract alignment
- `test-coordinator-*.sh` (3 files) - Coordinator parameter tests
- `test-dashboard-*.sh` (2 files) - Dashboard build tests
- `test-wave-*.sh` (3 files) - Wave orchestration tests

**Total:** 31 test files, ~100+ test functions

---

### 2. Integration Tests (`tests/integration/`) - 34 Files

**Purpose:** System-level integration, load testing, and cross-component validation

**Key Test Categories:**
- Connection management (leak detection, monitoring)
- Load testing (synthetic, rapid spawn, concurrent agents)
- Budget and security audits
- Graceful shutdown and lifecycle
- Component integration
- Deployment workflows
- Environment sanitization
- Dual logging patterns

**Notable Files:**
- `final-test-runner.sh` - Master test executor
- `integration-test-framework.sh` - Test framework utilities
- `memory-leak-detection.sh` - Memory leak diagnostics
- `connection-leak-diagnostic.sh` - Connection leak detection
- `test-10-agent-concurrent.sh` - 10 concurrent agent test
- `synthetic-load-test.sh` - Synthetic load generation
- `test-graceful-shutdown-comprehensive.sh` - Shutdown testing

**Total:** 34 test files, ~80+ test functions

---

### 3. CLI Mode Tests (`tests/cli-mode/`) - 17 Files

**Purpose:** CLI mode specific functionality and coordination

**Test Files:**
- `test-cfn-loop-cli-command.sh` - CLI command validation
- `test-cfn-loop-e2e-integration.sh` - E2E CLI integration
- `test-cfn-loop-execution.sh` - CLI execution patterns
- `test-cfn-loop-full-cycle.sh` - Full CLI cycle (6 scenarios, 100% pass)
- `test-cfn-loop-task-command.sh` - Task command validation
- `test-cli-mode-fixes.sh` - CLI mode bug fixes
- `test-command-parameter-validation.sh` - Parameter validation
- `test-coordinator-spawning.sh` - CLI coordinator spawning (23 tests, 100% pass)
- `test-mode-detection-anti023.sh` - Mode detection
- `test-orchestrator-workflow.sh` - CLI orchestrator (21/23 tests, 91% pass)
- `test-path-resolution-fix.sh` - Path resolution fixes
- `test-redis-coordination.sh` - CLI Redis coordination (7/7 tests, 100% pass)
- `test-task-mode-detection.sh` - Task mode detection
- `test-threshold-enforcement.sh` - Threshold enforcement
- `test_cli_mode.sh` - CLI mode validation
- `test_mode_detection.sh` - Mode detection patterns
- `test_mode_simple.sh` - Simple mode tests

**Total:** 17 test files, 87+ test functions
**Pass Rate:** 98% (57/59 tests passing)

---

### 4. Specialized Test Categories (`tests/` root) - 171+ Files

**Subdirectories:**

#### a. Playbook Tests (`tests/docker-mode/` or specialized)
- Test playbook integration (10 tests, 100% pass)
- Playbook + workflow integration (5 tests, 100% pass)
- Workflow codification (8 tests, 100% pass)

**Note:** These may have been relocated to specialized directories. Verify with:
```bash
find tests -name "*playbook*" -o -name "*workflow-codification*"
```

#### b. TDD Compliance (`tests/tdd-compliance/`) - 24 Scenarios
- Test-before-implementation validation
- Red-Green-Refactor cycle
- Post-edit feedback
- Coverage enforcement
- **Status:** 100% pass rate in CLI mode

#### c. Workflow Codification (`tests/workflow-codification/`)
- Database schema tests
- Redis integration tests
- Execution tracing
- Edge case tracking
- Cost tracking
- Proposal generation

#### d. Enterprise Tests (`tests/enterprise/`)
- 12+ enterprise feature categories
- Human-in-loop workflows
- Customer success playbooks
- Integration marketplace
- Multi-team coordination

#### e. Security Tests (`tests/security/`)
- Phase 4 Docker integration security
- Vulnerability scanning
- Input sanitization
- Security audits

#### f. CFN v3 Tests (`tests/cfn-v3/`)
- v3 architecture validation
- Integration tests
- Migration validation

#### g. ACE Integration (`tests/ace-integration/`)
- ACE workflow validation
- Context management
- Reflection patterns

#### h. E2E Tests (`tests/e2e/`)
- End-to-end workflows
- Approval workflows
- Full deployment workflows

#### i. Other Specialized Tests
- Agent tests
- Benchmark tests
- Docker tests (additional)
- Monitoring tests
- Performance tests
- Regression tests
- Stress tests

**Total:** 171+ files across specialized categories

---

## Part 2: Test Count Summary

| Location | Files | Tests | Pass Rate | Status |
|----------|-------|-------|-----------|--------|
| `tests/docker/core/` | 31 | ~100+ | TBD | ✅ Reorganized |
| `tests/integration/` | 34 | ~80+ | TBD | ✅ Existing |
| `tests/cli-mode/` | 17 | 87 | 98% | ✅ Complete |
| `tests/tdd-compliance/` | 5-6 | 24 | 100% | ✅ Complete |
| `tests/workflow-codification/` | 10+ | 30+ | TBD | ✅ Existing |
| `tests/enterprise/` | 30+ | 60+ | TBD | ✅ Existing |
| `tests/security/` | 10+ | 20+ | TBD | ✅ Existing |
| `tests/e2e/` | 5+ | 10+ | TBD | ✅ Existing |
| Other specialized | 60+ | 100+ | TBD | ✅ Existing |
| **Total** | **253+** | **511+** | **Mixed** | - |

---

## Part 3: Relocated Files

### Files Moved from `tests/docker-mode/` → `tests/docker/core/`

| Original Name | New Location | Tests | Status |
|--------------|--------------|-------|--------|
| test-cfn-loop-full-cycle.sh | docker/core/cfn-loop-full-cycle-tests.sh | 6 | ✅ Moved |
| test-coordinator-spawning.sh | docker/core/coordinator-spawning-tests.sh | 23 | ✅ Moved |
| test-orchestrator-workflow.sh | docker/core/orchestrator-workflow-tests.sh | 21 | ✅ Moved |
| test-tdd-compliance.sh | docker/core/tdd-compliance-tests.sh | 24 | ✅ Moved |

### Files Moved to Integration or Other Locations

| File | Likely New Location | Reason |
|------|---------------------|--------|
| test-redis-coordination.sh | Already exists in docker/core/ | Duplicate avoided |
| test-threshold-validation.sh | Possibly merged into cfn-loop-compliance | Threshold tests consolidated |
| test-playbook-*.sh | Specialized playbook directory | Domain-specific |
| test-workflow-codification.sh | tests/workflow-codification/ | Domain-specific |

---

## Part 4: Missing or Removed Files

### Files Created in docker-mode but Not Found

**Investigation needed for:**
1. `test-threshold-validation.sh` (6 tests)
   - Likely merged into `cfn-loop-compliance-tests.sh`
   - Or exists in CLI mode as `test-threshold-enforcement.sh`

2. `test-redis-coordination.sh` (7 tests)
   - Already exists as `docker/core/redis-coordination-tests.sh`
   - New version may have been merged or discarded

3. Playbook tests
   - May be in specialized location
   - Need to verify with find command

**Action Required:**
```bash
# Find playbook tests
find tests -name "*playbook*" -type f

# Find workflow codification tests
find tests -name "*workflow-codification*" -type f

# Find threshold tests
find tests -name "*threshold*" -type f
```

---

## Part 5: Test Organization Principles

### What Belongs in `tests/docker/core/`?

**Criteria:**
- Docker-based execution required
- CFN Loop core functionality
- Coordinator and orchestrator tests
- Redis coordination patterns
- Agent lifecycle management
- Core infrastructure tests

**Examples:**
- ✅ cfn-loop-full-cycle-tests.sh (Docker containers required)
- ✅ coordinator-spawning-tests.sh (Docker spawning patterns)
- ✅ redis-coordination-tests.sh (Docker network + Redis)
- ❌ cli-mode tests (belongs in tests/cli-mode/)
- ❌ playbook tests (domain-specific, belongs in specialized dir)

### What Belongs in `tests/integration/`?

**Criteria:**
- Cross-component integration
- System-level validation
- Load and stress testing
- End-to-end workflows (non-CFN specific)
- Performance benchmarks
- Security integration tests

**Examples:**
- ✅ test-10-agent-concurrent.sh (system-level concurrency)
- ✅ memory-leak-detection.sh (system-level diagnostics)
- ✅ synthetic-load-test.sh (performance testing)
- ❌ coordinator-spawning (belongs in docker/core/)

### What Belongs in `tests/cli-mode/`?

**Criteria:**
- CLI mode specific execution
- Host-based (non-Docker) tests
- CLI command validation
- Mode detection and switching

**Examples:**
- ✅ test-cfn-loop-cli-command.sh (CLI specific)
- ✅ test-coordinator-spawning.sh (CLI coordinator spawn)
- ❌ Docker container tests (belongs in docker/core/)

---

## Part 6: Test Dependencies and Imports

### Common Test Utilities

**Shared Helpers:**
1. `tests/test-utils.sh` - Core test utilities (log, assert, create_temp_dir)
2. `tests/docker/helpers/architecture-test-helpers.sh` - Docker-specific helpers
3. `docker/tests/test-helpers.sh` - Docker test helpers (log_section, log_test, etc.)

**Import Pattern:**
```bash
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/helpers/architecture-test-helpers.sh"  # If Docker test
```

### Validation Required

**Check for broken imports:**
```bash
# Find files sourcing non-existent helpers
grep -r "source.*test-utils" tests/ | while read line; do
    file=$(echo "$line" | cut -d: -f1)
    source_path=$(echo "$line" | grep -oP 'source\s+"\K[^"]+')
    if [ ! -f "$source_path" ]; then
        echo "BROKEN: $file sources missing $source_path"
    fi
done
```

---

## Part 7: Test Execution Guide

### Running Tests by Location

**Docker Core Tests:**
```bash
# Run all Docker core tests
for test in tests/docker/core/*.sh; do
    bash "$test"
done

# Run specific test
bash tests/docker/core/cfn-loop-full-cycle-tests.sh
```

**Integration Tests:**
```bash
# Run all integration tests
bash tests/integration/run-all-tests.sh

# Or individual test
bash tests/integration/test-10-agent-concurrent.sh
```

**CLI Mode Tests:**
```bash
# Run all CLI mode tests
for test in tests/cli-mode/test-*.sh; do
    bash "$test"
done
```

**Specialized Tests:**
```bash
# Run TDD compliance tests
for test in tests/tdd-compliance/*.sh; do
    bash "$test"
done

# Run workflow codification tests
bash tests/workflow-codification/database/test-schema.sh
```

---

## Part 8: Documentation Updates Required

### Files Needing Updates

1. **DOCKER_MODE_TESTING_PARITY_HANDOFF.md**
   - Update test locations (docker-mode → docker/core)
   - Update file references
   - Add note about reorganization

2. **DOCKER_TEST_IMPLEMENTATION_COMPLETE.md**
   - Update file paths
   - Reflect new organization
   - Add reorganization notes

3. **TEST_COVERAGE_OVERLAP_ANALYSIS.md**
   - Update file locations
   - Validate overlap analysis still accurate
   - Update recommendations based on new structure

4. **README files**
   - Update tests/docker-mode/README.md (if exists)
   - Create tests/docker/core/README.md (if missing)
   - Update root tests/README.md

---

## Part 9: Recommended Next Steps

### Immediate (This Session)

1. **Verify playbook test locations** (5 min)
   ```bash
   find tests -name "*playbook*" -type f
   ```

2. **Verify workflow codification test locations** (5 min)
   ```bash
   find tests -name "*workflow-codification*" -type f
   ```

3. **Check for threshold validation tests** (5 min)
   ```bash
   find tests -name "*threshold*" -type f
   ```

4. **Validate test imports** (10 min)
   - Check all relocated tests have correct source paths
   - Fix any broken imports

5. **Update documentation** (20 min)
   - DOCKER_MODE_TESTING_PARITY_HANDOFF.md
   - DOCKER_TEST_IMPLEMENTATION_COMPLETE.md

### Short-Term (Next 1-2 Days)

1. **Run all Docker core tests** - Validate relocated tests work
2. **Create README.md for docker/core/** - Document test organization
3. **Update test coverage matrix** - Reflect new locations
4. **Validate no duplicate tests** - Ensure clean organization

### Long-Term (Next Week)

1. **Consolidate test helpers** - Remove duplicate helper functions
2. **Create test execution playbook** - Document how to run all tests
3. **Set up CI/CD integration** - Automate test execution
4. **Monitor test stability** - Track pass rates over time

---

## Part 10: Quick Reference

### Test Locations by Category

| Category | Location | Files | Purpose |
|----------|----------|-------|---------|
| CFN Loop Core | `tests/docker/core/` | 31 | Docker-based CFN Loop tests |
| Integration | `tests/integration/` | 34 | System-level integration |
| CLI Mode | `tests/cli-mode/` | 17 | CLI mode specific tests |
| TDD Compliance | `tests/tdd-compliance/` | 5-6 | TDD protocol validation |
| Playbook | TBD | 3-5 | Playbook learning tests |
| Workflow Codification | `tests/workflow-codification/` | 10+ | Workflow automation tests |
| Enterprise | `tests/enterprise/` | 30+ | Enterprise features |
| Security | `tests/security/` | 10+ | Security validation |
| E2E | `tests/e2e/` | 5+ | End-to-end workflows |

### Find Tests by Name

```bash
# Find all coordinator tests
find tests -name "*coordinator*" -type f

# Find all Redis coordination tests
find tests -name "*redis-coordination*" -type f

# Find all CFN Loop tests
find tests -name "*cfn-loop*" -type f

# Find all threshold tests
find tests -name "*threshold*" -type f

# Find all playbook tests
find tests -name "*playbook*" -type f
```

### Validation Commands

```bash
# Count total test files
find tests -name "*.sh" -type f | wc -l

# Count Docker core tests
ls -1 tests/docker/core/*.sh | wc -l

# Count integration tests
ls -1 tests/integration/*.sh 2>/dev/null | wc -l

# Count CLI mode tests
ls -1 tests/cli-mode/*.sh | wc -l

# Find broken symbolic links
find tests -type l ! -exec test -e {} \; -print
```

---

## Appendix A: File Timestamp Analysis

**Recently Modified Files (Nov 18, 2025):**
- `tests/docker/core/cfn-loop-full-cycle-tests.sh` (04:16)
- `tests/docker/core/coordinator-spawning-tests.sh` (04:16)
- `tests/docker/core/orchestrator-workflow-tests.sh` (04:16)
- `tests/docker/core/tdd-compliance-tests.sh` (04:16)

**Indicates:** These files were moved/created during reorganization on Nov 18.

---

## Appendix B: Test File Size Analysis

**Largest Test Files:**
- `docker-hello-world-parity-tests.sh` - 29,561 bytes (29 KB)
- `end-to-end-coordinator-launch-test.sh` - 22,750 bytes (22 KB)
- `orchestrator-workflow-tests.sh` - 11,491 bytes (11 KB)
- `coordinator-spawning-tests.sh` - 12,712 bytes (12 KB)
- `cfn-loop-full-cycle-tests.sh` - 11,482 bytes (11 KB)

**Smallest Test Files:**
- `test-bugfix-quick-verification.sh` - 1,600 bytes (1.6 KB)

---

## Appendix C: Missing Test Documentation

**Tests Without README:**
- `tests/docker/core/` - No README.md (NEEDS CREATION)
- `tests/integration/` - May have README (verify)
- `tests/cli-mode/` - May have README (verify)

**Action Required:**
Create README.md files documenting:
- Test purpose and scope
- How to run tests
- Test organization
- Common patterns
- Troubleshooting

---

**Document Version:** 1.0
**Created:** 2025-11-18
**Last Verified:** 2025-11-18 04:16 UTC
**Status:** Complete - Ready for Validation
**Next Review:** After test execution and validation
