# Docker Test Suite Overview

**Date:** 2025-01-15 (REVIEWED: 2025-11-12)
**Context:** Align test suite with intelligent Docker coordinator architecture
**Goal:** Remove redundant tests, add missing coverage, update stale tests

---

## Executive Summary

Based on integration test findings and architecture review (Updated 2025-11-13):
- **Current state:** 107 total tests (90 main + 17 docker)
- **Target state:** 73 tests after cleanup (61 main + 12 docker + 12 new)
- **Net change:** -22 removed, -7 archived, +12 added, +12 updated
- **Working tests:** 1 production test (`intelligent-coordinator-test.sh`) validates end-to-end flow

**💬 REVIEW COMMENT (2025-11-13):**
✅ **AGREE** - Numbers look reasonable. 32% cleanup is aggressive but justified given architectural shift from CLI/Task mode to pure Docker coordinator.

⚠️ **UPDATED STATUS** - Bug #4 (architectural mismatch) is FIXED. Coordinator now uses Docker container status tracking instead of Redis queue polling. Bug #6 (hardcoded Redis localhost) remains ACTIVE and blocks all agents from reporting completion to Redis coordination layer.

**CURRENT BLOCKERS (2025-11-13 Session 2):**
- ❌ **Bug #6**: Node.js CLI uses hardcoded `127.0.0.1:6379` instead of reading `process.env.CFN_REDIS_HOST/PORT`
- **Impact**: Agents fail with "Could not connect to Redis at 127.0.0.1:6379: Connection refused" after successful init script
- **Root cause**: `src/cli/anthropic-client.ts` and `src/cli/agent-spawn.ts` use wrong variable names (REDIS_HOST vs CFN_REDIS_HOST)
- **Status**: Root cause identified, fix in progress (variable name alignment needed)
---

## Working Set

This overview now pairs with two scenario-specific supplements:
1. `tests/docker/TEST_SUITE_MAINTENANCE_PLAN.md` – removals, archives, updates, and keep-as-is inventory.
2. `tests/docker/TEST_SUITE_EXECUTION_PLAYBOOK.md` – new test specs, phased rollout, and validation checklist.

All three documents reference the shared standards in `tests/claude.md`.

---

> **Authoring Standards:** See `tests/claude.md` for the canonical template, naming/cleanup rules, and review checklist referenced by every plan below.

---

## Part 8: Test Suite Summary

### Before Cleanup
- **Main tests:** 90
- **Docker tests:** 17
- **Total:** 107 tests

### After Cleanup
- **Main tests:** 61 (-29 removed/archived)
- **Docker tests:** 12 (existing aligned tests)
- **New Docker tests:** 12 (added)
- **Total:** 85 tests

### Net Change
- **Removed:** 22 files
- **Archived:** 7 files
- **Added:** 12 files
- **Updated:** 12 files
- **Kept as-is:** 49 files

---

## Part 9: Success Metrics

### Test Quality
- **Coverage:** 95% of Docker coordinator functionality
- **Reliability:** 100% pass rate (no flaky tests)
- **Performance:** <30 minutes total execution time
- **Maintainability:** Clear test names, good documentation

### Architecture Alignment
- **Redis coordination:** 100% coverage (client, heartbeat, completion, pub/sub)
- **Iteration loop:** 100% coverage (convergence, max iterations, decision gates)
- **Memory budget:** 100% coverage (wave spawning, tier allocation, OOM prevention)
- **Agent lifecycle:** 100% coverage (spawn, execute, cleanup, metadata)
- **Provider auth:** 100% coverage (multi-provider, failover, propagation)

### Test Organization
- **Hierarchy:** Clear separation (main vs docker, P0 vs P1 vs P2)
- **Naming:** Consistent naming convention (`test-<feature>-<variant>.sh`)
- **Documentation:** README in each test directory
- **Archive:** Historical tests preserved with manifest

---

## Appendices

### Appendix A: Test Naming Convention

**Pattern:** `test-<feature>-<variant>.sh` or `<feature>-<action>-test.sh`

**Examples:**
- `redis-coordination-tests.sh` - Redis coordination suite
- `coordinator-iteration-tests.sh` - Coordinator iteration suite
- `memory-budget-tests.sh` - Memory budget suite
- `test-graceful-shutdown-comprehensive.sh` - Comprehensive shutdown test

---

### Appendix B: Test Priority Definitions

**P0 (Critical):** Must pass for production deployment
- Redis coordination (heartbeat fix)
- Iteration loop (convergence to 0 errors)
- Memory budget enforcement
- Agent lifecycle (spawn to cleanup)
- Provider auth (API key propagation)

**P1 (High):** Important for architecture alignment
- Clustering accuracy
- Environment variable propagation
- Wave spawning validation
- TypeScript error analysis
- CFN Loop pattern compliance

**P2 (Medium):** Nice-to-have, improves reliability
- Build and sync validation
- Coordinator fault tolerance
- Multi-provider auth
- Rate limiting

---

### Appendix C: Test Execution Order

**Recommended order for CI/CD:**

1. **Smoke tests** (5 minutes)
   - Basic functionality
   - Connectivity
   - Component tests

2. **Unit tests** (10 minutes)
   - Redis coordination
   - Environment propagation
   - TypeScript analysis

3. **Integration tests** (10 minutes)
   - Coordinator iteration
   - Agent lifecycle
   - CFN Loop compliance

4. **System tests** (5 minutes)
   - Memory budget
   - Wave spawning
   - Graceful shutdown

5. **Fault tolerance tests** (optional, 10 minutes)
   - Coordinator restart
   - Provider failover
   - Redis state persistence

**Total:** 30-40 minutes

---

### Appendix D: Test Maintenance Schedule

**Weekly:**
- Review test failures
- Update flaky tests
- Check test execution time

**Monthly:**
- Review test coverage
- Archive obsolete tests
- Update documentation

**Quarterly:**
- Review archived tests for deletion
- Refactor redundant tests
- Optimize test execution time

---

**End of Implementation Plan**

---

## FINAL REVIEW SUMMARY (2025-11-12)

### Overall Assessment

**Grade: B- (75/100)**

**Strengths:**
- ✅ Comprehensive test coverage plan (12 new tests, 12 updates)
- ✅ Good organizational structure (P0/P1/P2 prioritization)
- ✅ Detailed test specifications with code examples
- ✅ Reasonable cleanup scope (32% reduction)

**Critical Issues:**

1. **❌ BLOCKING DEPENDENCY NOT ADDRESSED**
   - Plan assumes Bug #4 (architectural mismatch) is fixed
   - **REALITY:** Coordinator has infinite wait loop (agents don't report completion)
   - **IMPACT:** All 12 new tests will fail until coordinator.js is rewritten
   - **FIX NEEDED:** Add "Week 0: Fix Bug #4" as Phase 0

2. **⚠️ WRONG ARCHITECTURAL ASSUMPTIONS**
   - Tests validate Redis queue claiming pattern that coordinator doesn't use
   - Agents receive tasks via environment variables, not queue
   - Completion tracking should use Docker container status, not Redis counters
   - **FIX NEEDED:** Rewrite Test 1-3 to match actual coordinator behavior

3. **❌ INAPPROPRIATE DELETIONS**
   - Deleting CLI/Task mode tests despite system still using both modes
   - Docker coordinator is ONE execution path, not THE ONLY path
   - **FIX NEEDED:** Move CLI/Task tests to subdirectories instead of deleting

4. **⚠️ MISLEADING TEST NAMES**
   - "Redis heartbeat using Node.js client" actually tests redis-cli with host flags
   - Actual Bug #3 fix was NOT replacing redis-cli with Node.js client
   - **FIX NEEDED:** Rename tests to match what they actually validate

### Recommended Changes

**BEFORE EXECUTING THIS PLAN:**

1. **Add Phase 0 (Week 0):**
   ```
   Phase 0: Fix Coordinator Architecture (Week 0)
   - Implement container-based completion tracking
   - Remove unused Redis queue operations
   - Update waitForCompletion() to poll Docker container status
   - Test fix with historical commit integration test
   ```

2. **Revise Deletion Strategy:**
   - Move `test-*-mode-*.sh` to `tests/cli-mode/` (don't delete)
   - Move `test-task-mode-*.sh` to `tests/task-mode/` (don't delete)
   - Archive ACE tests instead of deleting

3. **Rewrite Tests 1-3 to Match Reality:**
   - Remove queue claiming validation
   - Add environment variable task passing tests
   - Add Docker container status tracking tests

4. **Update Prerequisites Section:**
   ```markdown
   ## Prerequisites (MUST BE COMPLETE BEFORE PHASE 2)

   ### Bug #4: Architectural Mismatch Fix
   **Status:** ❌ NOT FIXED (as of 2025-11-12)
   **Blocker for:** Phases 2-6 (all test updates/additions)
   **See:** planning/docker/SESSION_2025-11-12_FINDINGS.md

   Fix coordinator.js to:
   - Remove Redis queue operations (task:queue, task:completed, task:total)
   - Replace waitForCompletion() with Docker container status polling
   - Track completion when all wave containers have exited
   ```

### Verdict

**PLAN IS SOUND but EXECUTION IS PREMATURE**

- Don't execute Phases 2-6 until Bug #4 is fixed
- Phase 1 (cleanup) can proceed independently
- Rewrite tests to match ACTUAL coordinator behavior, not idealized pattern

**NEXT ACTIONS:**
1. Fix Bug #4 in coordinator.js (2-3 hours estimated)
2. Rebuild coordinator image with fix
3. Run integration test to validate fix
4. THEN proceed with test suite implementation

---

## Current Working Tests (2025-11-13)

### Production Test: intelligent-coordinator-test.sh

**Status:** ✅ WORKING (validates end-to-end coordinator flow)

**Location:** `tests/docker/intelligent-coordinator-test.sh`

**Purpose:**
- Tests coordinator on FULL frontend codebase (handles 10-1147+ TypeScript errors)
- Validates entire CFN Loop flow: analysis → batching → spawning → iteration
- Production-ready test with safety guards and detailed reporting

**Key Features:**
1. **Error Count Validation**: Warns if <10 errors (below batch testing threshold)
2. **Frontend Path Configuration**: `FRONTEND_PATH` environment variable support
3. **Force Run Mode**: `FORCE_RUN=true` bypasses minimum error threshold
4. **Coordinator Image Validation**: Checks image exists before running
5. **Comprehensive Reporting**: Initial/final error counts, execution time, reduction percentage

**Usage:**
```bash
# Default (requires 10+ errors)
bash tests/docker/intelligent-coordinator-test.sh

# Force run with <10 errors
FORCE_RUN=true bash tests/docker/intelligent-coordinator-test.sh

# Custom frontend path
FRONTEND_PATH="/tmp/frontend-test-worktree/frontend" bash tests/docker/intelligent-coordinator-test.sh

# Custom iteration limit
FRONTEND_PATH="/tmp/frontend-test-worktree/frontend" MAX_ITERATIONS=3 bash tests/docker/intelligent-coordinator-test.sh
```

**Current Blockers:**
- Bug #6 (variable name mismatch) prevents agents from reporting completion to Redis
- Coordinator completes successfully but shows "0/16 tasks, 16 queued" due to agent heartbeat failures

**Validation Metrics:**
- ✅ Coordinator spawning and Docker network setup
- ✅ Redis coordination layer initialization
- ✅ Agent batch creation (Tier 1-4 distribution)
- ✅ Wave spawning with memory budget enforcement
- ❌ Agent completion reporting (blocked by Bug #6)

**Test Output Format:**
```
🎯 INTELLIGENT TYPESCRIPT ERROR COORDINATOR TEST
================================================

✅ Configuration validated
   Frontend path: /tmp/frontend-test-worktree/frontend
   Coordinator image: cfn-intelligent-coordinator:latest
   Network: cfn-network

📊 Counting initial TypeScript errors...
   Initial errors: 140

🔧 Setting up Docker environment...
   ✅ Network: cfn-network
   Starting Redis...
   ✅ Redis running (port 6379)

🚀 Launching intelligent coordinator...
   Coordinator output:
   ───────────────────────────────────────
   [Coordinator logs]
   ───────────────────────────────────────

✅ Coordinator completed successfully
   Total execution time: 180s (3m 0s)

📊 Counting final TypeScript errors...
   Final errors: 140
   Errors fixed: 0

═══════════════════════════════════════
INTELLIGENT COORDINATOR TEST SUMMARY
═══════════════════════════════════════

Execution time:  180s
Initial errors:  140
Final errors:    140
Errors fixed:    0

⚠️  PARTIAL: 0% error reduction

Remaining errors require manual review or additional iterations.
```

---

## Quick Reference

### Remove Script
```bash
bash tests/docker/cleanup/remove-obsolete-tests.sh
```

### Archive Script
```bash
bash tests/docker/cleanup/archive-historical-tests.sh
```

### Run All Tests
```bash
bash tests/docker/run-all-docker-tests.sh
```

### Test Coverage Report
```bash
bash tests/docker/generate-coverage-report.sh
```
