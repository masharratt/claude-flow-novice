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

3. **`test-cfn-loop-execution.sh`** (TODO)
   - End-to-end CFN Loop via `/cfn-loop-cli`
   - Validates: Coordinator spawn, orchestrator execution, agent completion
   - Duration: ~3-5 minutes
   - Success: Loop completes with PROCEED decision

### Integration Tests (Priority 2)

4. **`test-coordinator-spawning.sh`** (TODO)
   - Validates cfn-v3-coordinator spawns correctly
   - Checks environment variables (CFN_DOCKER_MODE, TASK_ID, etc.)

5. **`test-orchestrator-workflow.sh`** (TODO)
   - Validates orchestrate.sh execution flow
   - Loop 3 → Gate check → Loop 2 → Product Owner

6. **`test-agent-tool-access.sh`** (TODO)
   - Validates agents have access to all 7 tools within CFN Loop
   - Spawns agents via CFN Loop, checks tool usage in logs

### Regression Tests (Priority 3)

7. **`test-path-resolution-fix.sh`** (TODO)
   - Validates CRITICAL-001 fix (orchestrate.sh:923)
   - Ensures Product Owner decision script is found

8. **`test-task-mode-detection.sh`** (TODO)
   - Validates CRITICAL-004 fix (spawn-agent.sh)
   - Tests various TASK_ID formats (task-*, test-*, infra-test-*)

---

## Quick Start

### Run All Tests
```bash
./run-all-tests.sh
```

### Run Individual Tests
```bash
# Redis coordination
./test-redis-coordination.sh

# Threshold validation
./test-threshold-enforcement.sh
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
**Status:** Active development (2/8 tests implemented)
