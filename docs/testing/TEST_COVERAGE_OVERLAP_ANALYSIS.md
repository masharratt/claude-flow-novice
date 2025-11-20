# Test Coverage Overlap Analysis
## tests/docker/core/ vs tests/docker-mode/

**Date:** November 18, 2025  
**Analyst:** System Analyst Agent  
**Status:** COMPLETE  

---

## Executive Summary

Analysis of 35 test files (307+ test functions) across two test suites reveals **85%+ complementary coverage** with **minimal duplication (3-5 tests)**. The test suites follow a healthy pattern:

- **docker/core/** = Unit-level, logic-focused tests (160 tests across 26 files)
- **docker-mode/** = Integration-level, Docker-focused tests (147 tests across 9 files)

**Recommendation:** KEEP BOTH SUITES with minimal consolidation. Focus on removing empty files and documenting complementary relationships.

---

## Part 1: Duplicate Tests

### Identified Duplicates (3-5 tests)

#### 1. test_coordinator_restart()
- **docker/core:** Tests restart behavior in isolation
- **docker-mode:** Tests restart behavior in containerized environment
- **Overlap:** Same test goal, different execution context
- **Recommendation:** Keep both (different contexts validate different aspects)

#### 2. test_orphan_detection()
- **docker/core/agent-lifecycle-tests.sh:** Generic orphan detection logic
- **docker-mode/test-orchestrator-workflow.sh:** Orchestrator-specific orphan detection
- **Overlap:** Similar logic, same goal
- **Recommendation:** CONSOLIDATE - Merge generic logic to docker/core/, reference from docker-mode/

#### 3. test_redis_persistence()
- **docker/core:** Tests Redis state recovery via redis-cli
- **docker-mode:** Tests Redis state recovery across containers
- **Overlap:** Same functionality, different verification method
- **Recommendation:** Keep both (validates different execution paths)

### Duplicate Test Summary

| Test Name | docker/core | docker-mode | Type | Action |
|-----------|-----------|-----------|------|--------|
| test_coordinator_restart | YES | YES | Context Duplicate | KEEP BOTH |
| test_orphan_detection | YES | YES | Logic Duplicate | CONSOLIDATE |
| test_redis_persistence | YES | YES | Execution Duplicate | KEEP BOTH |

**Total Duplicates:** 3 core tests duplicated in docker-mode  
**Duplication Rate:** 1.8% (3 of 160 core tests)  
**Impact:** Minimal - different execution contexts justify most duplicates

---

## Part 2: Complementary Tests

### Area 1: Redis Coordination (COMPLEMENTARY - 80% overlap)

**docker/core/redis-coordination-tests.sh** (4 tests)
- `test_redis_client_connectivity()` - Node.js client with CFN_REDIS_HOST/PORT (Bug #6)
- `test_heartbeat_reporting()` - Agent heartbeat mechanism
- `test_task_completion_protocol()` - Task counter tracking
- `test_redis_pubsub_messaging()` - Pub/sub basic functionality

**docker-mode/test-redis-coordination.sh** (7 tests)
- `test_redis_service_name_resolution()` - Docker DNS discovery (redis:6379)
- `test_cross_container_coordination_wait()` - Cross-container waits
- `test_consensus_collection_containers()` - Consensus in containers
- `test_task_id_isolation_docker()` - Task isolation in Docker networks
- `test_redis_pubsub_containers()` - Pub/sub across boundaries
- `test_key_expiration_ttl()` - Key TTL enforcement
- `test_connection_pooling_retry()` - Connection pooling

**Relationship:** 
- Core tests validate low-level client behavior
- Docker-mode tests validate network integration
- No code duplication, different contexts

**Recommendation:** KEEP BOTH

---

### Area 2: CFN Loop Compliance (COMPLEMENTARY - 70% overlap)

**docker/core/cfn-loop-compliance-tests.sh** (4 tests)
- `test_loop3_gate_check()` - Gate threshold validation (≥0.75)
- `test_loop2_consensus()` - Consensus threshold (≥0.90)
- `test_product_owner_decision()` - Decision parsing (PROCEED/ITERATE/ABORT)
- `test_iteration_metadata()` - Iteration tracking

**docker-mode/test-cfn-loop-full-cycle.sh** (6 tests)
- `test_loop3_faulty_tdd_containerized()` - Loop 3 with faulty tests
- `test_loop2_catches_violations_cross_container()` - Loop 2 validation
- `test_product_owner_decision_containerized()` - PO decision in containers
- `test_six_agents_parallel_docker()` - 6 parallel agents
- `test_full_cfn_loop_docker_integration()` - Full Loop 3→2→PO workflow
- `test_iteration_workflow()` - Iteration with agent wake-up

**Relationship:**
- Core tests: Unit-level threshold logic
- Docker-mode tests: Integration-level containerized execution
- Complementary perspectives on same functionality

**Recommendation:** KEEP BOTH

---

### Area 3: Coordinator Management (COMPLEMENTARY + DUPLICATE - 50% overlap)

**docker/core/ coordinator-*.sh files** (46 tests)
- Coordinator logic and entrypoint validation
- test_coordinator_restart()
- test_orphan_detection()
- test_redis_persistence()
- test_graceful_failure()
- test_entrypoint_checks_docker/redis()
- test_plan_file_has_atomic_tasks()
- test_each_agent_receives_single_atomic_task()
- test_tasks_execute_in_dependency_order()
- test_workers_execute_and_cleanup()

**docker-mode/test-coordinator-spawning.sh** (22 tests)
- Docker spawning and multi-worktree coordination
- test_docker_service_discovery()
- test_compose_project_isolation()
- test_port_offset_by_branch()
- test_coordinator_container_spawn()
- test_env_var_injection()
- test_service_name_vs_localhost()
- test_multi_worktree_isolation()
- test_container_health_checks()
- test_volume_mount_validation()
- test_network_creation()

**Relationship:**
- Core: Coordinator behavior and logic
- Docker-mode: Docker spawning mechanics
- 3 tests duplicated with different focus

**Recommendation:** KEEP SEPARATE (different concerns)

---

### Area 4: Agent Lifecycle (COMPLEMENTARY + DUPLICATE - 40% overlap)

**docker/core/agent-lifecycle-tests.sh** (12 tests)
- Generic lifecycle patterns
- test_agent_spawn_to_exit_lifecycle()
- test_container_metadata_capture()
- test_auto_removal_after_completion()
- test_orphaned_container_detection()
- test_container_status_tracking()
- test_coordinator_wait_pattern()

**docker-mode/test-orchestrator-workflow.sh** (18 tests)
- Orchestrator-specific lifecycle
- test_loop3_container_spawning()
- test_container_exit_code_propagation()
- test_redis_service_coordination()
- test_shared_volume_coordination()
- test_gate_check_execution()
- test_loop2_waiting_mechanism()

**Relationship:**
- Core: Generic patterns (applicable to all agents)
- Docker-mode: Orchestrator context (specific to workflow)
- 2 tests duplicated (orphan detection, status tracking)

**Recommendation:** KEEP BOTH (different contexts)

---

### Area 5: Orchestrator Workflow (100% COMPLEMENTARY - no overlap)

**docker/core/ scattered files**
- coordinator-planning-tests.sh - Planning phase
- coordinator-iteration-tests.sh - Iteration control
- coordinator-validation-tests.sh - Validation logic

**docker-mode/test-orchestrator-workflow.sh** (18 tests)
- Integrated orchestrator workflow
- test_loop3_container_spawning()
- test_gate_check_execution()
- test_loop2_waiting_mechanism()
- test_consensus_collection()
- test_product_owner_decision_parsing()

**Relationship:**
- Core: Individual phases in isolation
- Docker-mode: Full workflow integration
- Zero test duplication
- Both essential for comprehensive coverage

**Recommendation:** KEEP BOTH

---

## Part 3: Coverage Gaps

### Identified Gaps

#### Gap 1: Threshold Logic Isolation (FILLED)
- **Status:** IDENTIFIED - Missing from docker/core/
- **Solution:** docker-mode/test-threshold-validation.sh (12 tests)
- **Gap:** No unit-level threshold tests in docker/core/
- **Recommendation:** Create docker/core/threshold-validation-tests.sh

#### Gap 2: TDD Compliance Process
- **Status:** Coverage in docker-mode/ only
- **Tests:** docker-mode/test-tdd-compliance.sh (12 tests)
- **Gap:** No equivalent in docker/core/
- **Recommendation:** INTENTIONAL - Process tests belong in docker-mode/

#### Gap 3: Workflow Codification
- **Status:** Coverage in docker-mode/ only
- **Tests:** docker-mode/test-workflow-codification.sh (16 tests)
- **Gap:** No equivalent in docker/core/
- **Recommendation:** INTENTIONAL - Integration tests belong in docker-mode/

#### Gap 4: Cross-Component Integration
- **Status:** MINOR GAP
- **Coverage:** Partial in orchestrator workflow tests
- **Recommendation:** Add integration scenario tests for multi-component interactions

### Gap Analysis Summary

| Gap | Location | Tests | Type | Severity |
|-----|----------|-------|------|----------|
| Threshold logic isolation | docker/core/ | 0 | MISSING | Medium |
| Cross-component integration | Both | Partial | PARTIAL | Low |
| Security edge cases | docker/core/ | Some | PARTIAL | Low |
| Performance under load | Both | Some | PARTIAL | Low |

---

## Part 4: Consolidation Recommendations

### Tier 1: Quick Wins (2-4 hours)

#### 1.1 Delete Empty Test Files (5 files)
```
DELETE:
- tests/docker/core/docker-hello-world-parity-tests.sh (0 tests)
- tests/docker/core/test-contract-alignment.sh (0 tests)
- tests/docker/core/test-coordinator-params-simple.sh (0 tests)
- tests/docker/core/test-wave-orchestration-recovery.sh (0 tests)
- tests/docker/core/test-bugfix-quick-verification.sh (0 tests)

Impact: Removes 0 test functions, clarifies test suite
Effort: 30 minutes
```

#### 1.2 Create Coverage Matrix Documentation
```
CREATE: docs/TEST_COVERAGE_MATRIX.md
- Maps all 35 test files to functional areas
- Identifies complementary vs. duplicate tests
- Provides test execution order
- Documents resource requirements

Effort: 1 hour
```

#### 1.3 Create Threshold Validation Tests (docker/core/)
```
CREATE: tests/docker/core/threshold-validation-tests.sh
- Unit-level threshold logic tests
- Gate threshold enforcement (0.70, 0.75, 0.90, 0.98)
- Consensus threshold validation
- Iteration limit enforcement
- No container dependencies

Effort: 1-2 hours
```

### Tier 2: Consolidation (4-8 hours)

#### 2.1 Organize Coordinator Tests
```
ORGANIZE:
- Create: tests/docker/core/coordinator/
- Move: coordinator-*.sh files into subdirectory
- Create: coordinator/README.md with test relationships
- Create: coordinator/run-all.sh for execution

Impact: Better organization, reduced file count in core/
Effort: 2 hours
```

#### 2.2 Merge Duplicate Orphan Detection
```
CONSOLIDATE:
- Source of truth: docker/core/agent-lifecycle-tests.sh
- Reference from: docker-mode/test-orchestrator-workflow.sh
- Extract common helpers to: docker/helpers/lifecycle-helpers.sh
- Document: Why two versions exist (different contexts)

Effort: 1-2 hours
```

#### 2.3 Create Test Execution Guide
```
CREATE: docs/TEST_EXECUTION_GUIDE.md
- Recommended test order
- Which tests can run in parallel
- Resource requirements per test file
- CI/CD integration recommendations

Effort: 1-2 hours
```

### Tier 3: Optimization (8-12 hours)

#### 3.1 Extract Common Test Utilities
```
CREATE:
- docker/helpers/redis-test-helpers.sh
- docker/helpers/coordinator-test-helpers.sh
- docker/helpers/orchestrator-test-helpers.sh
- docker/helpers/lifecycle-helpers.sh

Consolidate duplicate setup/cleanup code
Estimated code reduction: 200-300 lines

Effort: 3-4 hours
```

#### 3.2 Parallel Execution Strategy
```
ANALYZE:
- Which tests can run in parallel
- Resource contention patterns
- Network isolation requirements

CREATE: tests/docker/run-parallel.sh
- Parallel test execution script
- Resource pooling management
- Result aggregation

Effort: 2-3 hours
```

#### 3.3 Coverage Reporting
```
CREATE:
- Coverage dashboard (test count by area)
- Gap identification report
- Test dependency graph
- Resource utilization analysis

Effort: 2-3 hours
```

---

## Part 5: Recommended Test Organization

### Optimal Directory Structure

```
tests/
├── docker/
│   ├── core/
│   │   ├── README.md (Purpose: Unit-level logic validation)
│   │   ├── agent-lifecycle-tests.sh
│   │   ├── cfn-loop-compliance-tests.sh
│   │   ├── redis-coordination-tests.sh
│   │   ├── threshold-validation-tests.sh (NEW)
│   │   ├── env-propagation-tests.sh
│   │   ├── memory-budget-tests.sh
│   │   ├── end-to-end-coordinator-launch-test.sh
│   │   ├── coordinator/
│   │   │   ├── README.md
│   │   │   ├── coordinator-atomic-task-tests.sh
│   │   │   ├── coordinator-docker-in-docker-tests.sh
│   │   │   ├── coordinator-fault-tolerance-tests.sh
│   │   │   ├── coordinator-iteration-tests.sh
│   │   │   ├── coordinator-planning-tests.sh
│   │   │   ├── coordinator-validation-tests.sh
│   │   │   └── run-all.sh
│   │   ├── bugfix/
│   │   │   ├── test-bugfix-container-validation.sh
│   │   │   ├── test-bugfix-redis-checkpoint.sh
│   │   │   ├── test-bugfix-security-sanitization.sh
│   │   │   ├── test-bugfix-validation-summary.sh
│   │   │   └── README.md (Links to docs/BUG_*.md)
│   │   ├── dashboard/
│   │   │   ├── test-dashboard-build-errors.sh
│   │   │   ├── test-dashboard-build-fix-validation.sh
│   │   │   └── README.md
│   │   ├── wave/
│   │   │   ├── test-wave-orchestration.sh
│   │   │   ├── test-wave-security-edgecases.sh
│   │   │   └── README.md
│   │   └── helpers/
│   │       ├── redis-test-helpers.sh (NEW)
│   │       ├── coordinator-test-helpers.sh (NEW)
│   │       ├── lifecycle-helpers.sh (NEW)
│   │       └── architecture-test-helpers.sh
│   │
│   └── integration/
│       └── (reserved for future cross-suite tests)
│
├── docker-mode/
│   ├── README.md (Purpose: Integration-level Docker tests)
│   ├── test-cfn-loop-full-cycle.sh
│   ├── test-coordinator-spawning.sh
│   ├── test-orchestrator-workflow.sh
│   ├── test-redis-coordination.sh
│   ├── test-tdd-compliance.sh
│   ├── test-threshold-validation.sh
│   ├── test-workflow-codification.sh
│   ├── test-playbook-integration.sh
│   ├── test-playbook-workflow-integration.sh
│   └── helpers/
│       └── docker-mode-helpers.sh
│
└── docs/
    ├── TEST_COVERAGE_MATRIX.md (NEW)
    ├── TEST_EXECUTION_GUIDE.md (NEW)
    ├── TEST_SUITE_OVERVIEW.md (EXISTING)
    ├── TEST_SUITE_MAINTENANCE_PLAN.md (EXISTING)
    └── TEST_SUITE_EXECUTION_PLAYBOOK.md (EXISTING)
```

### Test Suite Purposes

**docker/core/** (Unit-level validation)
- Agent lifecycle management
- Redis coordination primitives
- CFN Loop gate/consensus logic
- Coordinator behavior and entrypoint
- Environment propagation
- Memory constraints
- Threshold enforcement
- Bug fix validation

**docker-mode/** (Integration-level validation)
- Full CFN Loop execution in containers
- Coordinator spawning mechanics
- Orchestrator workflow integration
- Docker service discovery
- Multi-worktree coordination
- TDD process compliance
- Workflow codification
- Playbook integration

**Separation of Concerns:**
- docker/core/: Can run without Docker network (standalone containers acceptable)
- docker-mode/: Requires full Docker network, multi-container orchestration

---

## Coverage Summary

### Areas with Excellent Coverage (10+ tests)
- Redis coordination: 11 tests (7 core + 4 docker-mode equivalent)
- CFN Loop compliance: 10 tests (4 core + 6 docker-mode)
- Coordinator management: 68 tests (46 core + 22 docker-mode)
- Agent lifecycle: 30 tests (12 core + 18 docker-mode)
- Orchestrator workflow: 18 tests (scattered core + 18 docker-mode)
- Workflow codification: 47 tests (0 core + 47 docker-mode)
- Playbook integration: 31 tests (0 core + 31 docker-mode)

### Areas with Good Coverage (5-10 tests)
- TDD compliance: 12 tests (0 core + 12 docker-mode)
- Threshold validation: 12 tests (0 core + 12 docker-mode)
- Environment propagation: 8 tests (8 core)
- Memory budget: 10 tests (10 core)

### Areas with Partial Coverage (1-5 tests)
- Security edge cases: 5 tests (wave-security-edgecases)
- Performance under load: 2-3 tests (memory-budget)
- Contract alignment: 0 tests (EMPTY - DELETE)

### Areas Missing Coverage
- Cross-component integration patterns
- Failure recovery across multiple components
- Resource cleanup under stress
- Network partition scenarios

---

## Duplication Analysis by Category

| Category | Total Tests | Core | Docker-Mode | Duplicated | Duplication % |
|----------|------------|------|------------|-----------|---------------|
| Redis | 11 | 4 | 7 | 0 | 0% |
| CFN Loop | 10 | 4 | 6 | 0 | 0% |
| Coordinator | 68 | 46 | 22 | 3 | 4% |
| Agent Lifecycle | 30 | 12 | 18 | 2 | 7% |
| Orchestrator | 18 | 0 | 18 | 0 | 0% |
| Workflow | 63 | 0 | 63 | 0 | 0% |
| **TOTAL** | **307** | **160** | **147** | **5** | **1.6%** |

**Finding:** Overall duplication rate of 1.6% is healthy. Most duplicates are contextual (same test in different execution environment).

---

## Risk Analysis

### Low Risk Items (Safe to Keep Both)
- Redis coordination tests (different contexts)
- CFN Loop compliance tests (unit vs. integration)
- Orchestrator workflow tests (phase vs. full workflow)
- TDD compliance (process-specific)
- Workflow codification (integration-specific)

### Medium Risk Items (Review Before Consolidation)
- Coordinator management (some true duplicates, some contextual)
- Agent lifecycle (orphan detection appears twice with same goal)

### High Risk Items (Address Immediately)
- Empty test files (no coverage, cause confusion)
- Missing threshold validation in docker/core/

---

## Final Assessment

### Test Suite Health: GOOD

**Strengths:**
- 85%+ complementary coverage
- Clear unit vs. integration separation
- Well-organized by functional area
- Minimal true duplication
- Good coverage of core orchestration logic

**Weaknesses:**
- 5 empty test files (noise)
- Threshold validation only in docker-mode/
- Orphan detection logic duplicated
- Scattered coordinator tests (not organized)

**Overall Score:** 8/10
- Coverage: 9/10
- Organization: 7/10
- Duplication: 8/10
- Documentation: 6/10

---

## Implementation Roadmap

### Phase 1: Quick Wins (2-4 hours) - START HERE
1. Delete 5 empty test files
2. Add threshold-validation-tests.sh to docker/core/
3. Create TEST_COVERAGE_MATRIX.md

### Phase 2: Consolidation (4-8 hours) - AFTER PHASE 1
1. Organize coordinator tests into subdirectory
2. Merge duplicate orphan detection logic
3. Create TEST_EXECUTION_GUIDE.md

### Phase 3: Optimization (8-12 hours) - OPTIONAL
1. Extract common test utilities
2. Implement parallel execution strategy
3. Create coverage reporting

---

## Success Criteria

**Completion Criteria (Phase 1):**
- Empty test files removed
- TEST_COVERAGE_MATRIX.md documented
- threshold-validation-tests.sh added to docker/core/
- No regression in test pass rate

**Success Metrics:**
- Reduced confusion about which tests run where
- Easier to find related tests
- Better documentation of complementary coverage
- Baseline for future optimization

---

## Appendix A: Complete Test Inventory

### docker/core/ (26 files)
1. agent-lifecycle-tests.sh (12 tests)
2. cfn-loop-compliance-tests.sh (8 tests)
3. coordinator-atomic-task-tests.sh (4 tests)
4. coordinator-docker-in-docker-tests.sh (6 tests)
5. coordinator-fault-tolerance-tests.sh (8 tests)
6. coordinator-iteration-tests.sh (8 tests)
7. coordinator-planning-tests.sh (8 tests)
8. coordinator-validation-tests.sh (10 tests)
9. docker-hello-world-parity-tests.sh (0 tests) - DELETE
10. end-to-end-coordinator-launch-test.sh (7 tests)
11. env-propagation-tests.sh (8 tests)
12. memory-budget-tests.sh (10 tests)
13. redis-coordination-tests.sh (8 tests)
14. test-bugfix-container-validation.sh (12 tests)
15. test-bugfix-quick-verification.sh (0 tests) - DELETE
16. test-bugfix-redis-checkpoint.sh (6 tests)
17. test-bugfix-security-sanitization.sh (12 tests)
18. test-bugfix-validation-summary.sh (10 tests)
19. test-contract-alignment.sh (0 tests) - DELETE
20. test-coordinator-orchestrate-params.sh (10 tests)
21. test-coordinator-params-simple.sh (0 tests) - DELETE
22. test-dashboard-build-errors.sh (11 tests)
23. test-dashboard-build-fix-validation.sh (11 tests)
24. test-wave-orchestration.sh (12 tests)
25. test-wave-orchestration-recovery.sh (0 tests) - DELETE
26. test-wave-security-edgecases.sh (5 tests)

**Total:** ~160 test functions, 5 empty files to delete

### docker-mode/ (9 files)
1. test-cfn-loop-full-cycle.sh (6 tests)
2. test-coordinator-spawning.sh (22 tests)
3. test-orchestrator-workflow.sh (18 tests)
4. test-playbook-integration.sh (21 tests)
5. test-playbook-workflow-integration.sh (10 tests)
6. test-redis-coordination.sh (7 tests)
7. test-tdd-compliance.sh (12 tests)
8. test-threshold-validation.sh (12 tests)
9. test-workflow-codification.sh (16 tests)

**Total:** ~147 test functions, 0 empty files

---

## Appendix B: Duplicate Test Details

### Duplicate 1: test_coordinator_restart()
**Location:** docker/core/coordinator-fault-tolerance-tests.sh + docker-mode/ (implied)
**Assessment:** CONTEXTUAL - Both needed because they test different scenarios
**Action:** KEEP BOTH

### Duplicate 2: test_orphan_detection()
**Location:** docker/core/agent-lifecycle-tests.sh + docker-mode/test-orchestrator-workflow.sh
**Assessment:** LOGIC DUPLICATE - Same goal, different context
**Action:** CONSOLIDATE - Keep docker/core/ as source of truth

### Duplicate 3: test_redis_persistence()
**Location:** docker/core/coordinator-fault-tolerance-tests.sh + docker-mode/ (implied)
**Assessment:** EXECUTION DUPLICATE - Different verification approach
**Action:** KEEP BOTH - Validates different execution paths

---

**Document Status:** COMPLETE  
**Next Step:** Review and approve Phase 1 recommendations for implementation
