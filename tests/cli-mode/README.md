# CLI Mode Test Suite (v3.0+)

**Created:** 2025-11-17
**Architecture:** CFN Loop v3.0+ with slash command integration
**Purpose:** Validate `/cfn-loop-cli` production workflow end-to-end

---

## Overview

This test suite validates CLI mode (`/cfn-loop-cli`) functionality including:
- Coordinator spawning and orchestration
- Loop 3 → Loop 2 → Product Owner workflow
- Quality gate enforcement (0.95/0.90 thresholds)
- Redis coordination layer
- Agent tool access within CFN Loop context
- CRITICAL fixes validation (path resolution, thresholds, Redis, task detection)

**Unlike legacy v1 tests:** Tests production slash command workflow, not isolated agent spawning.

---

## Test Suite Structure

### Core Tests (Priority 1)

1. **`test-redis-coordination.sh`** ✅ **IMPLEMENTED**
   - Validates Redis availability check before coordinator spawn
   - Tests with Redis up and down
   - Duration: ~2 minutes
   - Success: Clear error when Redis unavailable

2. **`test-threshold-enforcement.sh`** ✅ **IMPLEMENTED**
   - Validates gate thresholds (mvp=0.70, standard=0.95, enterprise=0.98)
   - Reads orchestrate.sh and cfn-loop-cli.md for consistency
   - Duration: <1 minute
   - Success: All threshold values match CLAUDE.md

3. **`test-cfn-loop-execution.sh`** ✅ **IMPLEMENTED**
   - CLI infrastructure smoke test (19 assertions)
   - Validates: Slash command, coordinator agents, orchestrator, spawning
   - Duration: <1 minute
   - Success: All infrastructure components present

### Integration Tests (Priority 2)

4. **`test-coordinator-spawning.sh`** ✅ **IMPLEMENTED**
   - Validates cfn-v3-coordinator spawning (23 tests)
   - Checks environment variables (CFN_DOCKER_MODE, TASK_ID, etc.)
   - TASK_ID sanitization and mode handling

5. **`test-orchestrator-workflow.sh`** ✅ **IMPLEMENTED**
   - Validates orchestrate.sh execution flow (23 tests)
   - Loop 3 → Gate check → Loop 2 → Product Owner
   - Workflow sequencing and decision execution

6. **`test-agent-tool-access.sh`** ✅ **IMPLEMENTED**
   - Validates 7 required tools (26 tests)
   - Tool permissions in spawn-agent.sh
   - Pre-edit backup hook requirements

### Regression Tests (Priority 3)

7. **`test-path-resolution-fix.sh`** ✅ **IMPLEMENTED**
   - Validates CRITICAL-001 fix (13 tests)
   - PROJECT_ROOT vs SCRIPT_DIR path resolution
   - Anti-pattern detection (nested paths)

8. **`test-task-mode-detection.sh`** ✅ **IMPLEMENTED**
   - Validates CRITICAL-004 fix (41 tests)
   - TASK_ID sanitization (17 injection patterns)
   - ANTI-023 enforcement, format support

---

## Quick Start

### Run All Tests
```bash
./run-all-tests.sh
```

### Run Individual Tests
```bash
# Priority 1 (Core Tests)
./test-redis-coordination.sh
./test-threshold-enforcement.sh
./test-cfn-loop-execution.sh

# Priority 2 (Integration Tests)
./test-coordinator-spawning.sh
./test-orchestrator-workflow.sh
./test-agent-tool-access.sh

# Priority 3 (Regression Tests)
./test-path-resolution-fix.sh
./test-task-mode-detection.sh
```

### Prerequisites
- Redis running (`redis-server`)
- Z.ai API key configured (`.env`)
- Project built (`npm run build`)

---

## Related Documentation
- **Architecture:** `docs/CFN_LOOP_ARCHITECTURE.md`
- **Critical Fixes:** `planning/review-and-test/CFN_MODES_INVESTIGATION_REPORT.md`
- **Test Results:** `planning/review-and-test/CLI_MODE_TEST_RESULTS.md`
- **CLAUDE.md:** Lines 167-188 (CLI vs Task mode)
- **Legacy Tests:** `tests/archive/legacy-v1/hello-world/` (reference only)

---

**Test Suite Version:** 1.0.0
**Compatible With:** CFN Loop v3.0+
**Last Updated:** 2025-11-17
**Status:** Complete (8/8 tests implemented, 159 total assertions)

**Test Coverage:**
- Priority 1 (Core): 3/3 tests (46 assertions)
- Priority 2 (Integration): 3/3 tests (72 assertions)
- Priority 3 (Regression): 2/2 tests (54 assertions)
