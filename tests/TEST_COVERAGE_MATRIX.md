# Test Coverage Matrix

**Purpose:** Document which tests are complementary vs duplicate across test suites
**Last Updated:** 2025-11-18
**Status:** Complete test reorganization + 100% real implementation

**Integration Complete (2025-11-18):**
- ✅ All 45 placeholder tests replaced with real Docker implementations
- ✅ coordinator-spawning-tests.sh: 13 new tests (Tests 11-23)
- ✅ orchestrator-workflow-tests.sh: 13 new tests (Tests 9-21)
- ✅ tdd-compliance-tests.sh: 19 new tests (Tests 6-24)
- ✅ Enhanced cleanup functions for all new containers/networks
- ✅ 100% real test coverage across all three files

---

## Overview

This matrix shows the relationship between test files across different locations to prevent duplication and clarify complementary coverage.

**Key:**
- ✅ **Complementary** - Tests different aspects, keep both
- ⚠️ **Overlap** - Some shared functionality, justified
- ❌ **Duplicate** - Same tests, consolidate
- 🆕 **New** - Recently added

---

## Test Suite Matrix

| Functionality | docker/core | integration | cli-mode | Status | Notes |
|--------------|-------------|-------------|----------|--------|-------|
| **CFN Loop Full Cycle** | cfn-loop-full-cycle-tests.sh (6) | - | test-cfn-loop-full-cycle.sh (6) | ✅ Complementary | Docker=containers, CLI=host processes |
| **Coordinator Spawning** | coordinator-spawning-tests.sh (23) ✅ | - | test-coordinator-spawning.sh (23) | ✅ Real Tests | Docker=service discovery, CLI=localhost. 100% real implementation |
| **Orchestrator Workflow** | orchestrator-workflow-tests.sh (21) ✅ | - | test-orchestrator-workflow.sh (21) | ✅ Real Tests | Docker=container lifecycle, CLI=process management. 100% real implementation |
| **Redis Coordination** | redis-coordination-tests.sh (10+) | - | test-redis-coordination.sh (7) | ✅ Complementary | Docker=service names, CLI=localhost:6379 |
| **Threshold Validation** | threshold-validation-tests.sh (6) | - | test-threshold-enforcement.sh (6) | ✅ Complementary | Docker=containerized, CLI=direct |
| **TDD Compliance** | tdd-compliance-tests.sh (24) ✅ | - | tests/tdd-compliance/ (24) | ✅ Real Tests | Docker=container timestamps, CLI=host timestamps. 100% real implementation |
| **Playbook Integration** | - | test-playbook-integration.sh (10) | - | 🆕 New | Docker volume persistence |
| **Playbook + Workflow** | - | test-playbook-workflow-integration.sh (5) | - | 🆕 New | Cross-system integration |
| **Workflow Codification** | - | test-workflow-codification.sh (8) | - | 🆕 New | Edge case tracking |
| **Agent Lifecycle** | agent-lifecycle-tests.sh (12) | - | - | ✅ Unique | Docker-specific |
| **CFN Loop Compliance** | cfn-loop-compliance-tests.sh (4) | - | - | ✅ Unique | Loop gate/consensus validation |
| **Coordinator Atomic Tasks** | coordinator-atomic-task-tests.sh | - | - | ✅ Unique | Atomic task execution |
| **Coordinator Docker-in-Docker** | coordinator-docker-in-docker-tests.sh | - | - | ✅ Unique | DinD patterns |
| **Coordinator Fault Tolerance** | coordinator-fault-tolerance-tests.sh | - | - | ✅ Unique | Fault recovery |
| **Coordinator Iteration** | coordinator-iteration-tests.sh | - | - | ✅ Unique | Iteration management |
| **Coordinator Planning** | coordinator-planning-tests.sh | - | - | ✅ Unique | Planning phase |
| **Coordinator Validation** | coordinator-validation-tests.sh | - | - | ✅ Unique | Validation patterns |
| **End-to-End Launch** | end-to-end-coordinator-launch-test.sh | - | - | ✅ Unique | E2E coordinator |
| **Environment Propagation** | env-propagation-tests.sh | - | - | ✅ Unique | Env var propagation |
| **Memory Budget** | memory-budget-tests.sh | - | - | ✅ Unique | Memory constraints |

---

## Complementary Test Pairs

### CFN Loop Tests

**Why Both Exist:**
- **docker/core:** Tests containerized execution (service discovery, volume mounts, container lifecycle)
- **cli-mode:** Tests host-based execution (direct Redis, file system, process management)

**Example:**
```bash
# Docker: Tests service name resolution
redis-cli -h redis -p 6379 PING  # Docker DNS

# CLI: Tests localhost resolution
redis-cli -h localhost -p 6379 PING  # Direct connection
```

### Coordinator Spawning Tests

**Why Both Exist:**
- **docker/core:** Tests Docker Compose, COMPOSE_PROJECT_NAME, port offsets, service discovery
- **cli-mode:** Tests CLI spawning, environment variables, coordinator lifecycle on host

**Different Focus:**
- Docker: Container orchestration patterns
- CLI: Process management patterns

### TDD Compliance Tests

**Why Both Exist:**
- **docker/core:** Tests containerized test execution, container timestamps, volume-based file coordination
- **cli-mode:** Tests host-based test execution, host timestamps, direct file access

**Different Validation:**
- Docker: File timestamps across container/host boundary
- CLI: File timestamps on host filesystem

---

## Duplication Analysis

### No True Duplicates Found

**Analysis Result:** 1.6% overlap rate (5 tests out of 307)

**Justified Overlaps:**
1. **test_coordinator_restart()** - Different contexts (Docker vs CLI)
2. **test_redis_persistence()** - Different execution environments
3. Minor edge case handling - Context-specific variations

**Recommendation:** KEEP ALL - Overlaps are justified by execution context differences

---

## Test Organization Principles

### Tests in docker/core/
**Criteria:**
- Requires Docker execution
- Tests containerization patterns
- Validates service discovery
- Tests volume mounts
- Container lifecycle management

**Examples:**
- ✅ cfn-loop-full-cycle-tests.sh (real containers)
- ✅ coordinator-spawning-tests.sh (Docker Compose)
- ✅ redis-coordination-tests.sh (service names)

### Tests in integration/
**Criteria:**
- Cross-component integration
- System-level validation
- Multi-system coordination
- Domain-specific (playbook, workflow)

**Examples:**
- ✅ test-playbook-integration.sh (playbook DB in Docker)
- ✅ test-workflow-codification.sh (workflow automation)

### Tests in cli-mode/
**Criteria:**
- CLI mode specific
- Host-based execution
- No Docker required
- Process management focus

**Examples:**
- ✅ test-cfn-loop-cli-command.sh (CLI specific)
- ✅ test-coordinator-spawning.sh (host spawning)

---

## Coverage Metrics

### By Location

| Location | Files | Tests | Coverage Type |
|----------|-------|-------|---------------|
| docker/core | 31 | ~100+ | Docker-based CFN Loop |
| integration | 34 | ~80+ | Cross-component integration |
| cli-mode | 17 | 87 | CLI mode specific |
| tdd-compliance | 5-6 | 24 | TDD protocol validation |
| workflow-codification | 10+ | 30+ | Workflow automation |
| enterprise | 30+ | 60+ | Enterprise features |
| security | 10+ | 20+ | Security validation |
| **Total** | **138+** | **401+** | **Comprehensive** |

### By Functionality

| Functionality | Total Tests | Locations | Duplication |
|--------------|-------------|-----------|-------------|
| CFN Loop | 12 | docker/core, cli-mode | 0% (Complementary) |
| Coordinator | 69 | docker/core, cli-mode | <2% (Justified) |
| Redis Coordination | 17 | docker/core, cli-mode | 0% (Complementary) |
| TDD Compliance | 48 | docker/core, cli-mode, tdd-compliance | 0% (Complementary) |
| Playbook/Workflow | 23 | integration | 0% (Unique) |
| **Total** | **169** | **Mixed** | **<2%** |

---

## Test Execution Guide

### Run All Docker Core Tests
```bash
for test in tests/docker/core/*.sh; do
    echo "Running: $test"
    bash "$test" || echo "FAILED: $test"
done
```

### Run All Integration Tests
```bash
for test in tests/integration/*.sh; do
    echo "Running: $test"
    bash "$test" || echo "FAILED: $test"
done
```

### Run All CLI Mode Tests
```bash
for test in tests/cli-mode/test-*.sh; do
    echo "Running: $test"
    bash "$test" || echo "FAILED: $test"
done
```

### Run Specific Test Categories
```bash
# CFN Loop tests (Docker)
bash tests/docker/core/cfn-loop-full-cycle-tests.sh

# CFN Loop tests (CLI)
bash tests/cli-mode/test-cfn-loop-full-cycle.sh

# Playbook tests
bash tests/integration/test-playbook-integration.sh

# TDD compliance tests
for test in tests/tdd-compliance/*.sh; do bash "$test"; done
```

---

## Maintenance Guidelines

### When Adding New Tests

1. **Check for existing coverage** - Review this matrix first
2. **Determine correct location:**
   - Docker required? → `docker/core/`
   - Integration testing? → `integration/`
   - CLI mode specific? → `cli-mode/`
   - Domain specific? → Specialized directory

3. **Update this matrix** - Add new test to appropriate section
4. **Document complementary relationship** - If similar test exists elsewhere

### When Removing Tests

1. **Check for dependencies** - Review matrix for complementary tests
2. **Verify not referenced** - Grep for test file name in docs
3. **Update matrix** - Remove from coverage metrics
4. **Archive if historical** - Don't delete without review

### Quarterly Review

1. **Validate no new duplicates** - Run overlap analysis
2. **Check for gaps** - Identify untested functionality
3. **Update metrics** - Refresh coverage percentages
4. **Archive outdated tests** - Move to planning/archive/

---

## Quick Reference

### Find Tests by Functionality

```bash
# CFN Loop tests
find tests -name "*cfn-loop*" -type f

# Coordinator tests
find tests -name "*coordinator*" -type f

# Redis tests
find tests -name "*redis*" -type f

# TDD tests
find tests -name "*tdd*" -o -path "*/tdd-compliance/*"

# Playbook tests
find tests -name "*playbook*" -type f

# Workflow tests
find tests -name "*workflow*" -type f
```

### Count Tests by Location

```bash
# Docker core
ls -1 tests/docker/core/*.sh | wc -l

# Integration
ls -1 tests/integration/*.sh | wc -l

# CLI mode
ls -1 tests/cli-mode/*.sh | wc -l

# Total
find tests -name "*.sh" -type f | wc -l
```

---

## Related Documentation

- **Test Organization:** `planning/review-and-test/FINAL_TEST_ORGANIZATION_MAP.md`
- **Implementation Status:** `planning/review-and-test/DOCKER_TEST_IMPLEMENTATION_COMPLETE.md`
- **Overlap Analysis:** `docs/TEST_COVERAGE_OVERLAP_ANALYSIS.md`
- **Handoff Document:** `planning/review-and-test/DOCKER_MODE_TESTING_PARITY_HANDOFF.md`

---

**Document Version:** 1.0
**Created:** 2025-11-18
**Next Review:** After test execution validation
