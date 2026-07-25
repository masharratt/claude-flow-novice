# Docker Mode Testing Gap Analysis - Playbooks & Workflow Codification

**Date:** 2025-11-18
**Status:** Analysis Complete → Implementation Required
**Priority:** Medium (Lower than core CFN Loop parity)

---

## Executive Summary

**Current State:**
- ✅ Playbook Docker tests: **10/10 tests** (100% coverage)
- ✅ Playbook + Workflow integration: **5/5 tests** (100% coverage)
- ⚠️ Workflow Codification standalone: **Limited Docker mode coverage**

**Gap:** Workflow codification has extensive CLI tests but needs Docker-specific validation for:
- Edge case tracking in containerized environments
- Cost tracking across container lifecycles
- Proposal generation from container executions
- ROI calculations with Docker overhead

---

## Part 1: Existing Docker Test Coverage (Excellent)

### Playbook Integration Tests (`test-playbook-integration.sh`)

**Status:** ✅ Complete (10/10 tests passing)

1. **Test 1:** Playbook Database Volume Mount Persistence
2. **Test 2:** Playbook Query from Container
3. **Test 3:** Playbook Update from Container
4. **Test 4:** Cross-Container Playbook Data Sharing
5. **Test 5:** Agent Performance Tracking in Container
6. **Test 6:** Similarity Matching Algorithm in Container
7. **Test 7:** Database Consistency After Container Restart
8. **Test 8:** Redis + SQLite Coordination
9. **Test 9:** Volume Persistence Across Container Lifecycle
10. **Test 10:** Concurrent Database Access

**Coverage Areas:**
- ✅ Volume mount persistence (host → container)
- ✅ Cross-container data sharing
- ✅ Database consistency across restarts
- ✅ Redis + SQLite coordination
- ✅ Concurrent database access
- ✅ Similarity matching in containers

---

### Playbook + Workflow Integration Tests (`test-playbook-workflow-integration.sh`)

**Status:** ✅ Complete (5/5 tests passing)

1. **Test 1:** Full Pipeline Integration (CFN Loop → Playbook → Workflow Codification)
2. **Test 2:** Cross-Container Data Flow (Read Playbook → Update Workflow)
3. **Test 3:** Dual Volume Persistence (Both DBs persist across restarts)
4. **Test 4:** Edge Case Tracking Triggers Playbook Review
5. **Test 5:** Cost Savings Calculation with Playbook Reuse

**Coverage Areas:**
- ✅ End-to-end pipeline integration
- ✅ Cross-container data flow
- ✅ Dual database persistence
- ✅ Edge case threshold detection
- ✅ Cost savings calculations

---

## Part 2: Identified Testing Gaps

### Workflow Codification Standalone Docker Tests (MISSING)

**Required Test File:** `tests/docker-mode/test-workflow-codification.sh`

#### Missing Test Scenarios:

**1. Edge Case Recording in Containers**
```bash
test_edge_case_container_recording() {
  # GIVEN: Skill execution fails inside container
  # WHEN: Edge case tracker records failure
  # THEN: Edge case persisted to host database

  # Test: Container executes skill → fails → records edge case → host DB updated
}
```

**2. Multi-Container Edge Case Aggregation**
```bash
test_multi_container_edge_case_aggregation() {
  # GIVEN: 5 containers execute same skill
  # WHEN: 3 containers fail with same error
  # THEN: Edge case occurrence count = 3

  # Test: Concurrent failures → aggregated count → threshold detection
}
```

**3. Cost Tracking with Container Overhead**
```bash
test_cost_tracking_container_overhead() {
  # GIVEN: Skill execution time in container vs host
  # WHEN: Cost tracking includes container startup overhead
  # THEN: ROI calculations account for Docker overhead

  # Test: execution_time_ms includes container spawn time
}
```

**4. Proposal Generation from Container Logs**
```bash
test_proposal_generation_from_container() {
  # GIVEN: Recurring edge case threshold exceeded
  # WHEN: Proposal generator runs inside container
  # THEN: Proposal file written to host volume

  # Test: Container generates skill update proposal → host volume updated
}
```

**5. ROI Snapshot Generation in Container**
```bash
test_roi_snapshot_container() {
  # GIVEN: 24 hours of skill executions logged
  # WHEN: Daily ROI snapshot command runs in container
  # THEN: ROI snapshot written to database

  # Test: Cron-like execution inside container → snapshot persists
}
```

**6. Cross-Container ROI Dashboard Export**
```bash
test_cross_container_roi_dashboard() {
  # GIVEN: Multiple containers executing skills
  # WHEN: Dashboard export aggregates all executions
  # THEN: Dashboard JSON includes all container executions

  # Test: Aggregated metrics across container boundaries
}
```

**7. Skill Update Proposal Validation**
```bash
test_skill_update_proposal_validation() {
  # GIVEN: Edge case with occurrence_count ≥ 5
  # WHEN: Skill update generator creates proposal
  # THEN: Proposal includes edge case hash, solution, and metadata

  # Test: Proposal file structure validation in Docker environment
}
```

**8. Database Schema Migration in Container**
```bash
test_database_schema_migration_container() {
  # GIVEN: Old workflow-codification.db schema
  # WHEN: Container runs schema migration
  # THEN: Database upgraded to latest schema

  # Test: Schema versioning and migration in Docker volumes
}
```

---

### Workflow Codification Performance Tests (MISSING)

**Required Test File:** `tests/docker-mode/test-workflow-codification-performance.sh`

#### Missing Performance Scenarios:

**1. High-Volume Edge Case Recording**
```bash
test_high_volume_edge_case_recording() {
  # GIVEN: 1000 edge cases recorded in 10 seconds
  # WHEN: Container writes to SQLite database
  # THEN: No database locks or timeouts

  # Test: Concurrent write performance in Docker
}
```

**2. Cost Tracking Query Performance**
```bash
test_cost_tracking_query_performance() {
  # GIVEN: 10,000 skill execution records
  # WHEN: ROI snapshot query aggregates data
  # THEN: Query completes in <5 seconds

  # Test: Database query performance with large datasets
}
```

**3. Concurrent Proposal Generation**
```bash
test_concurrent_proposal_generation() {
  # GIVEN: 3 containers generating proposals simultaneously
  # WHEN: All containers write to proposals/ directory
  # THEN: No file conflicts or corruption

  # Test: Parallel file writes to shared volume
}
```

---

### Workflow Codification Security Tests (MISSING)

**Required Test File:** `tests/docker-mode/test-workflow-codification-security.sh`

#### Missing Security Scenarios:

**1. SQL Injection Prevention**
```bash
test_sql_injection_prevention() {
  # GIVEN: Malicious input in error_message field
  # WHEN: Edge case recording escapes input
  # THEN: No SQL injection vulnerability

  # Test: Input validation and sanitization
}
```

**2. File Path Traversal Prevention**
```bash
test_file_path_traversal_prevention() {
  # GIVEN: Malicious proposal filename (e.g., ../../etc/passwd)
  # WHEN: Proposal generator validates path
  # THEN: Proposal written only to allowed directory

  # Test: Path validation and confinement
}
```

**3. Database Permissions in Container**
```bash
test_database_permissions_container() {
  # GIVEN: Workflow-codification.db mounted read-only
  # WHEN: Container attempts write operation
  # THEN: Write fails with clear error message

  # Test: File permission enforcement in Docker
}
```

---

## Part 3: Priority Assessment

### Critical (Must Have) - Docker Core Parity
**Priority:** P0 (Already Complete ✅)
- Playbook volume persistence
- Cross-container data sharing
- Database consistency

### Important (Should Have) - Workflow Codification Core
**Priority:** P1 (Implement Next)
- Edge case recording in containers (Test 1)
- Cost tracking with container overhead (Test 3)
- ROI snapshot generation (Test 5)

### Nice to Have - Advanced Features
**Priority:** P2 (Defer if Time-Constrained)
- Multi-container aggregation (Test 2)
- Proposal generation (Test 4, 7)
- Performance tests (all)
- Security tests (all)

---

## Part 4: Implementation Roadmap

### Phase 1: Core Workflow Codification Tests (Week 1)
**Goal:** Validate workflow codification basics in Docker

**Deliverables:**
- `tests/docker-mode/test-workflow-codification.sh` (Tests 1, 3, 5)
- Edge case recording
- Cost tracking
- ROI snapshot generation

**Validation:**
- 3/3 tests passing
- No database corruption
- Cost calculations accurate

---

### Phase 2: Advanced Integration Tests (Week 2)
**Goal:** Multi-container coordination and proposal generation

**Deliverables:**
- Complete `test-workflow-codification.sh` (Tests 2, 4, 6, 7, 8)
- Multi-container aggregation
- Proposal generation
- Dashboard export
- Schema migration

**Validation:**
- 8/8 tests passing
- Concurrent operations work
- Proposals generated correctly

---

### Phase 3: Performance & Security (Week 3 - Optional)
**Goal:** Stress testing and security validation

**Deliverables:**
- `test-workflow-codification-performance.sh` (3 tests)
- `test-workflow-codification-security.sh` (3 tests)

**Validation:**
- Performance benchmarks met
- Security vulnerabilities addressed

---

## Part 5: Test Template

### Workflow Codification Docker Test Template

```bash
#!/bin/bash
# tests/docker-mode/test-workflow-codification.sh
# Docker Mode Workflow Codification Test Suite

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/docker/tests/test-helpers.sh"

# Test configuration
TEST_ID="docker-workflow-$(date +%s)"
COMPOSE_PROJECT_NAME="cfn-workflow-test-${TEST_ID}"
CONTAINER_NETWORK="${COMPOSE_PROJECT_NAME}_default"

# Database paths
HOST_WORKFLOW_DB="$PROJECT_ROOT/.claude/skills/workflow-codification/workflow-codification.db"
CONTAINER_WORKFLOW_DB="/workspace/workflow-codification.db"

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up Docker test environment..."

    docker ps -a --filter "name=cfn-test-workflow-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker-compose -p "$COMPOSE_PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true
    docker network rm "$CONTAINER_NETWORK" 2>/dev/null || true

    exit $exit_code
}

trap cleanup EXIT INT TERM

# ============================================================================
# Test 1: Edge Case Recording in Container
# ============================================================================

test_edge_case_container_recording() {
    log_test "Test 1: Edge Case Recording in Container"

    # GIVEN: Skill execution fails inside container
    local container_id=$(docker run --rm -d \
        --name "cfn-test-workflow-edge-$$" \
        --network "$CONTAINER_NETWORK" \
        --volume "$PROJECT_ROOT:/workspace:rw" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        cfn-agent:latest \
        bash -c "
            # Record edge case
            sqlite3 '$CONTAINER_WORKFLOW_DB' \\
                \"INSERT INTO edge_cases (skill_name, skill_version, exit_code, input_params, error_message, occurrence_count) \\
                VALUES ('test-skill', '1.0.0', 1, 'param1=value1', 'Connection timeout', 1);\"
        ")

    # WHEN: Edge case tracker records failure
    if wait_for_container "$container_id" 20; then
        # THEN: Edge case persisted to host database
        local edge_cases=$(sqlite3 "$HOST_WORKFLOW_DB" \
            "SELECT COUNT(*) FROM edge_cases WHERE skill_name = 'test-skill';" 2>/dev/null || echo "0")

        if [[ "$edge_cases" -ge 1 ]]; then
            log_pass "Edge case recording successful (edge_cases=$edge_cases)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_fail "Edge case not recorded"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        log_fail "Edge case recording container failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# ============================================================================
# Execute Tests
# ============================================================================

TESTS_PASSED=0
TESTS_FAILED=0

test_edge_case_container_recording
# Add more tests here...

# ============================================================================
# Test Summary
# ============================================================================

echo ""
log_section "Workflow Codification Test Summary"
echo ""
echo "Total Tests Run:    $((TESTS_PASSED + TESTS_FAILED))"
echo -e "${GREEN}Tests Passed:       $TESTS_PASSED${NC}"

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Tests Failed:       $TESTS_FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}✅ All workflow codification tests passed!${NC}"
    exit 0
fi
```

---

## Part 6: Success Criteria

### Test Coverage Targets

| Component | Current Coverage | Target Coverage | Priority |
|-----------|------------------|-----------------|----------|
| Playbook (Docker) | 10/10 (100%) | ✅ Complete | P0 |
| Playbook + Workflow Integration | 5/5 (100%) | ✅ Complete | P0 |
| Workflow Codification (Docker) | 0/8 (0%) | 8/8 (100%) | P1 |
| Workflow Performance (Docker) | 0/3 (0%) | 3/3 (100%) | P2 |
| Workflow Security (Docker) | 0/3 (0%) | 3/3 (100%) | P2 |

**Total Docker Mode Tests:**
- Current: 15 tests
- Target: 29 tests (14 new tests)
- Priority breakdown: P0 Complete, P1 = 8 tests, P2 = 6 tests

---

## Part 7: Key Differences: CLI vs Docker Workflow Tests

### CLI Mode Tests (Already Exist)

**Location:** `docker/tests/test-workflow-codification-*.sh`

Tests run on **host filesystem** with direct SQLite access.

### Docker Mode Tests (Need to Create)

**Location:** `tests/docker-mode/test-workflow-codification.sh`

Tests run in **containers** with volume-mounted databases.

**Critical Differences:**

1. **Volume Mounts:** Database must be mounted read-write
2. **Container Overhead:** Cost tracking must include Docker startup time
3. **Path Resolution:** Container paths (`/workspace`) vs host paths
4. **Concurrent Access:** Multiple containers accessing same database
5. **Persistence:** Database changes must persist after container exit

---

## Part 8: Recommendations

### Immediate Actions (This Sprint)

1. ✅ **Keep existing playbook tests** - Already excellent coverage
2. ✅ **Keep integration tests** - Critical pipeline validation
3. **Create P1 workflow codification tests** - Core functionality (8 tests)
4. **Update test suite documentation** - Reflect new coverage

### Deferred Actions (Future Sprints)

1. **Create P2 performance tests** - Not blocking (3 tests)
2. **Create P2 security tests** - Nice to have (3 tests)
3. **Add CLI mode parity tests** - Lower priority than Docker core

### Non-Actions (Not Needed)

1. ❌ **Don't duplicate playbook tests** - Already complete
2. ❌ **Don't rewrite integration tests** - Already comprehensive
3. ❌ **Don't create CLI mode workflow tests** - Already exist

---

## Part 9: Cost-Benefit Analysis

### Effort Estimates

| Test Suite | Tests | Estimated Hours | Priority |
|------------|-------|----------------|----------|
| Workflow Core (P1) | 8 | 16 hours | High |
| Workflow Performance (P2) | 3 | 6 hours | Medium |
| Workflow Security (P2) | 3 | 6 hours | Low |
| **Total** | **14** | **28 hours** | - |

### ROI Analysis

**Benefits:**
- Validates workflow codification in production Docker environment
- Catches edge case tracking issues early
- Ensures cost tracking accuracy across container lifecycles
- Prevents database corruption in multi-container scenarios

**Cost:**
- ~28 hours development time (1.5 weeks for 1 developer)
- Test maintenance overhead (minimal, follows existing patterns)

**Verdict:** **Proceed with P1 tests** (8 tests, 16 hours). Defer P2 tests to future sprints.

---

## Contact & Handoff

**Current State:**
- Playbook Docker tests: Complete ✅
- Integration tests: Complete ✅
- Workflow Docker tests: Missing ⚠️

**Next Steps:**
1. Implement P1 workflow codification tests (8 tests)
2. Update `DOCKER_MODE_TESTING_PARITY_HANDOFF.md` with results
3. Run full Docker test suite and validate pass rate

**Owner:** Docker Testing Team
**Timeline:** 1-2 weeks for P1, future sprints for P2
**Dependencies:** Existing Docker infrastructure (already complete)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-18
**Author:** Claude Code (Analysis)
**Next Review:** After P1 implementation
