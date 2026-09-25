# Docker Test Suite Implementation Epic - Summary

**Epic Configuration:** `planning/docker/docker-test-suite-epic.json`
**Created:** 2025-11-13
**Status:** Ready for CFN Loop Execution

---

## Executive Summary

Transform the Docker test suite from 107 tests to a focused 73-test suite (32% reduction) that validates the intelligent Docker coordinator architecture with 95% functionality coverage and 100% pass rate.

**Key Metrics:**
- **Before:** 107 tests (90 main + 17 docker), many obsolete or duplicated
- **After:** 73 tests (61 main + 12 docker), all aligned to coordinator architecture
- **Net Change:** -22 removed, -7 archived, +12 added, +12 updated
- **Target Coverage:** 95% of Docker coordinator functionality
- **Target Execution Time:** <30 minutes
- **Target Pass Rate:** 100%

---

## Epic Structure

### 7 Phases (Standard Mode)

**Phase 0: Prerequisites - Fix Bug #6** (2 iterations)
- Fix Node.js CLI Redis variable name mismatch (REDIS_HOST → CFN_REDIS_HOST)
- Unblock all test execution phases
- Validate agents can connect to Redis coordination layer

**Phase 1: Test Cleanup - Remove Obsolete Tests** (2 iterations)
- Remove 22 obsolete test files (duplicates, mode detection, timeout variants)
- Move CLI/Task mode tests to subdirectories (don't delete)
- Archive ACE tests to tests/archive/historical/

**Phase 2: Test Cleanup - Archive Historical Tests** (1 iteration)
- Archive 7 historical test files (marketing features, Sprint 5)
- Create archive manifest with restoration instructions
- Document quarterly deletion policy (12 months retention)

**Phase 3: Critical Tests - P0 New Test Creation** (4 iterations)
- Create 5 critical P0 tests with 20 total test cases
- Redis coordination, iteration loop, memory budget, clustering, agent lifecycle
- Validate actual coordinator behavior (container status tracking, not queue claiming)

**Phase 4: Architecture Alignment - P1 New Test Creation** (5 iterations)
- Create 7 P1 architecture alignment tests
- Environment propagation, wave spawning, TypeScript analysis, CFN Loop compliance
- Build/sync validation, fault tolerance, provider authentication

**Phase 5: Test Updates - Align Existing Tests** (4 iterations)
- Update 12 existing tests to Docker coordinator architecture
- Remove CLI-specific assumptions, add tier batching validation
- Update iteration loop testing, container lifecycle management

**Phase 6: Validation - Full Test Suite Execution** (3 iterations)
- Execute all 73 tests in dependency-aware order
- Generate coverage report (95% target)
- Identify flaky tests, document execution order for CI/CD

**Phase 7: Stabilization - Fix Failures and Document Maintenance** (3 iterations)
- Fix failing/flaky tests identified in Phase 6
- Document maintenance schedule (weekly/monthly/quarterly)
- Establish quality baseline for future development

---

## Critical Success Factors

### Blocking Dependencies
1. **Bug #6 MUST be fixed before Phase 3-7 can execute**
   - Node.js CLI uses hardcoded `REDIS_HOST/PORT` instead of `CFN_REDIS_HOST/CFN_REDIS_PORT`
   - Agents fail with "Connection refused at 127.0.0.1:6379"
   - Fix locations: `src/cli/agent-spawn.ts` (3 places), `src/cli/anthropic-client.ts` (3 places)

2. **Docker environment configured**
   - Network: cfn-network
   - Redis: cfn-redis container running on port 6379
   - Images: cfn-intelligent-coordinator:latest, claude-flow-novice-agent:frontend

3. **.env.clean file with no inline comments**
   - Required for Bug #2 fix validation
   - Inline comments cause environment variable parsing failures

### Key Review Findings

**From TEST_SUITE_OVERVIEW.md Review (2025-11-12):**
- ✅ Comprehensive test coverage plan (12 new tests, 12 updates)
- ✅ Good organizational structure (P0/P1/P2 prioritization)
- ❌ **CRITICAL:** Plan assumes Bug #4 fixed (now fixed, but Bug #6 remains)
- ⚠️ **WRONG PATTERN:** Tests validate Redis queue claiming pattern that coordinator doesn't use
- ❌ **INAPPROPRIATE DELETIONS:** Deleting CLI/Task mode tests despite system still using both modes

**Corrections Applied:**
1. Added Phase 0 to fix Bug #6 as prerequisite
2. Updated test specifications to validate ACTUAL coordinator behavior (container status tracking)
3. Changed deletion strategy: MOVE CLI/Task tests to subdirectories, don't delete
4. Archive ACE tests instead of deleting (valuable for future integration)

---

## Test Coverage Breakdown

### P0 Critical Tests (5 files, 20 test cases)
1. **Redis Coordination** (4 test cases)
   - Client connectivity (Node.js client, not redis-cli)
   - Heartbeat reporting
   - Task completion protocol
   - Pub/sub messaging

2. **Coordinator Iteration Loop** (4 test cases)
   - Multi-iteration convergence (errors → 0)
   - Max iteration limit
   - Error delta tracking
   - PROCEED/ITERATE decision gates

3. **Memory Budget Enforcement** (4 test cases)
   - Wave spawning when budget exceeded
   - Memory tier allocation (T1: 512MB, T2: 600MB, T3: 800MB, T4: 1GB)
   - OOM prevention
   - Sequential wave execution

4. **Dependency Clustering Accuracy** (4 test cases)
   - Tier distribution (60% T1, 25% T2, 10% T3, 5% T4)
   - Import graph accuracy
   - Coordinated file batching
   - Independent file isolation

5. **Agent Lifecycle and Cleanup** (4 test cases)
   - Full lifecycle (spawn → execute → report → exit)
   - Container metadata capture
   - Auto-removal after completion
   - Orphaned container detection

### P1 Architecture Alignment Tests (7 files)
6. Environment Variable Propagation
7. Wave Spawning and Parallelism
8. TypeScript Error Analysis
9. CFN Loop Pattern Compliance
10. Build and Sync Validation
11. Coordinator Fault Tolerance
12. API Authentication and Provider Routing

### Existing Test Updates (12 files)
- intelligent-coordinator-test.sh
- test-provider-routing.sh
- b10-typescript-fix-test.sh
- 50-agent-parallel-test.sh
- test-graceful-shutdown-comprehensive.sh
- test-memory-leak-prevention.sh
- simple-load-test.sh
- synthetic-load-test.sh
- test-cfn-loop-integration.sh
- test-cfn-stabilization-e2e.sh
- test-comprehensive-stabilization.sh
- test-ace-workflow.sh

---

## Success Metrics

### Critical (Must Achieve)
- ✅ All 7 phases complete
- ✅ 73 total tests (61 main + 12 docker)
- ✅ 100% test pass rate
- ✅ Bug #6 (Redis variable mismatch) fixed and validated
- ✅ 95% coordinator functionality coverage
- ✅ Test execution time <30 minutes
- ✅ Zero flaky tests

### Important (High Priority)
- ✅ Test maintenance schedule documented
- ✅ Quality baseline established
- ✅ Coverage report generated
- ✅ Troubleshooting guide created
- ✅ CLI/Task mode tests moved to subdirectories (not deleted)
- ✅ ACE tests archived (not deleted)

### Nice-to-Have (Future Enhancements)
- Automated coverage report generation
- Test performance benchmarking
- CI/CD integration guide
- Quarterly test cleanup automation

---

## Architectural Alignment Notes

### Correct Coordinator Behavior (Updated 2025-11-13)
**ACTUAL PATTERN (from Bug #4 fix):**
- Coordinator spawns agents with tasks via **environment variables** (TASK_PROMPT, AGENT_ID)
- Agents receive tasks from environment, NOT by claiming from Redis queue
- Coordinator tracks completion via **Docker container status** (exit code, container state)
- Redis coordination layer used for heartbeat, progress reporting, metadata only

**OBSOLETE PATTERN (DO NOT TEST):**
- ❌ Agents claiming tasks from `task:queue` via RPOP
- ❌ Coordinator waiting for `task:completed` counter to increment
- ❌ Task queue polling for work distribution

### Test Authoring Standards
**All new tests MUST follow `tests/claude.md` template:**
- `#!/bin/bash` with `set -euo pipefail`
- Source `tests/test-utils.sh` for helpers
- Implement cleanup trap for containers/worktrees/temp files
- Use GIVEN/WHEN/THEN comments for complex logic
- Cite bug references inline (e.g., "// Bug #6 validation")

---

## Risk Factors

1. **Bug #6 Fix Complexity**
   - Estimated 2 iterations, may require more if edge cases found
   - Impacts all subsequent phases (Phase 3-7 blocked until fixed)

2. **Test Failures in Phase 6**
   - Manual test execution may reveal gaps in coverage
   - Flaky test identification may require additional debugging

3. **Stabilization Challenges in Phase 7**
   - Flaky test stabilization may uncover deeper architectural issues
   - Timeout tuning, race condition fixes may be complex

4. **Coverage Gaps**
   - 95% target may not cover all edge cases
   - Additional tests may be needed based on Phase 6 findings

---

## Execution Guidance

### CFN Loop CLI Mode Execution
```bash
/cfn-loop-cli "Execute Docker Test Suite Implementation epic" \
  --mode=standard \
  --epic-config=planning/docker/docker-test-suite-epic.json
```

### Manual Phase Execution (if needed)
```bash
# Phase 0: Fix Bug #6
/cfn-loop-task "Fix Node.js CLI Redis variable name mismatch (REDIS_HOST → CFN_REDIS_HOST)" --mode=standard

# Phase 1: Remove obsolete tests
bash tests/docker/cleanup/remove-obsolete-tests.sh

# Phase 2: Archive historical tests
bash tests/docker/cleanup/archive-historical-tests.sh

# Phase 3-5: Execute test creation/updates via CFN Loop

# Phase 6: Validate full suite
bash tests/docker/run-all-docker-tests.sh

# Phase 7: Stabilization
# Fix failures identified in Phase 6
```

---

## Related Documentation

- **TEST_SUITE_OVERVIEW.md** - Context, success metrics, review notes
- **TEST_SUITE_MAINTENANCE_PLAN.md** - Cleanup, archival, updates
- **TEST_SUITE_EXECUTION_PLAYBOOK.md** - New tests, phased rollout
- **tests/claude.md** - Test authoring standards template
- **docs/bugs/BUG_4_DOCKER_COORDINATOR.md** - Bug #4 fix (container status tracking)
- **docs/bugs/BUG_6_REDIS_VARIABLE_MISMATCH.md** - Bug #6 documentation (to be created)

---

## Estimated Timeline

**Total Duration:** 5-7 days (24 estimated iterations across 7 phases)

- **Phase 0:** 1 day (Bug #6 fix, critical prerequisite)
- **Phase 1:** 0.5 days (cleanup script execution)
- **Phase 2:** 0.5 days (archival script execution)
- **Phase 3:** 1.5 days (P0 test creation, 20 test cases)
- **Phase 4:** 2 days (P1 test creation, 7 test files)
- **Phase 5:** 1.5 days (12 test updates)
- **Phase 6:** 1 day (full suite execution, coverage report)
- **Phase 7:** 1 day (failure fixes, documentation)

**Critical Path:** Phase 0 → Phase 3-7 (Bug #6 fix blocks all test execution)

---

## Quality Gates

### Phase 0 Exit Criteria
- ✅ All REDIS_HOST references → CFN_REDIS_HOST
- ✅ All REDIS_PORT references → CFN_REDIS_PORT
- ✅ Agents connect to Redis successfully
- ✅ Zero "Connection refused at 127.0.0.1:6379" errors

### Phase 3 Exit Criteria
- ✅ 5 P0 test files created (20 test cases)
- ✅ 100% pass rate on P0 tests
- ✅ Tests validate actual coordinator behavior
- ✅ Bug #6 fix validated in Redis coordination tests

### Phase 6 Exit Criteria
- ✅ All 73 tests executed successfully
- ✅ Coverage report ≥95% coordinator coverage
- ✅ Total execution time ≤30 minutes
- ✅ Zero critical failures

### Final Epic Exit Criteria
- ✅ 100% test pass rate (73/73 tests)
- ✅ 95% coordinator functionality coverage
- ✅ Test maintenance schedule documented
- ✅ Quality baseline established
- ✅ Zero flaky tests (10 consecutive successful runs)

---

**End of Epic Summary**
