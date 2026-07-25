# Core Test Suite Summary (Post-Reorganization)

**Date:** 2025-11-18
**Reorganization:** Moved redundant/obsolete tests to legacy/ subfolders

## CLI Mode Core Tests (12 tests)

### Unit Tests (4)
- `test-agent-tool-access.sh` - Agent tool access configuration validation
- `test-command-parameter-validation.sh` - Parameter validation for CFN Loop commands
- `test-path-resolution-fix.sh` - CRITICAL-001 fix validation
- `test-threshold-enforcement.sh` - CRITICAL-002 gate threshold validation

### Integration Tests (6)
- `test-cfn-loop-cli-command.sh` - /cfn-loop-cli command execution
- `test-cfn-loop-task-command.sh` - /cfn-loop-task command execution
- `test-coordinator-spawning.sh` - cfn-v3-coordinator spawning validation
- `test-orchestrator-workflow.sh` - orchestrate.sh execution flow
- `test-redis-coordination.sh` - CRITICAL-003 Redis availability check
- `test-task-mode-detection.sh` - CRITICAL-004 task mode detection

### E2E Tests (4)
- `test-cfn-loop-cli-real-execution.sh` - **TRUE E2E** (uses real production scripts)
- `test-full-loop3-agent-spawning.sh` - **COMPREHENSIVE E2E** (validates complete spawning chain: Coordinator → Orchestrator → Loop 3 Agent)
- `test-5-iteration-cfn-loop.sh` - **MULTI-ITERATION E2E** (validates 5-iteration workflow, ITERATE decisions, convergence, Product Owner decisions)
- `test-success-criteria-e2e.sh` - Success criteria flow validation

## Docker Mode Core Tests (17 tests)

### Agent Lifecycle
- `agent-lifecycle-tests.sh` - Spawn-to-exit, metadata, auto-removal

### CFN Loop Compliance
- `cfn-loop-compliance-tests.sh` - Pattern compliance validation

### Coordinator Tests (7)
- `coordinator-atomic-task-tests.sh` - Atomic task assignment
- `coordinator-docker-in-docker-tests.sh` - DinD worker spawning
- `coordinator-fault-tolerance-tests.sh` - Fault tolerance & recovery
- `coordinator-iteration-tests.sh` - Iteration loop validation
- `coordinator-planning-tests.sh` - Dynamic planning via API
- `coordinator-validation-tests.sh` - Validation logic & error handling
- `end-to-end-coordinator-launch-test.sh` - E2E coordinator launch (Bug #4)

### Coordination & Infrastructure (3)
- `redis-coordination-tests.sh` - Node.js client connectivity (Bug #6 validation)
- `env-propagation-tests.sh` - Environment variable propagation
- `test-contract-alignment.sh` - YAML contract consistency

### Memory & Resource Management
- `memory-budget-tests.sh` - Wave spawning, tier allocation, OOM prevention

### Wave Orchestration (3)
- `test-wave-orchestration.sh` - Wave-based orchestration integration
- `test-wave-orchestration-recovery.sh` - Multi-wave with crash recovery
- `test-wave-security-edgecases.sh` - Wave security & edge cases

### Parameter Validation
- `test-coordinator-orchestrate-params.sh` - Coordinator → Orchestrate.sh handoff

## Legacy Tests (Moved to legacy/ subfolders)

### CLI Legacy (3 tests)
- Smoke tests superseded by TRUE E2E
- Integration tests with redundant coverage
- Obsolete tests without descriptions

### Docker Legacy (14 tests)
- Bug-specific validation tests (historical reference)
- Dashboard build tests (specific bug, now fixed)
- Tests without descriptions (likely obsolete)

## Test Coverage Metrics

| Category | CLI Core | Docker Core | Total Core |
|----------|----------|-------------|------------|
| Unit | 4 | - | 4 |
| Integration | 6 | 13 | 19 |
| E2E | 4 | 4 | 8 |
| **Total** | **14** | **17** | **31** |

## Quality Improvements

1. **Production Code Fidelity**: All integration/E2E tests use real scripts (no simulations)
2. **Clear Purpose**: All core tests have documented descriptions and bug references
3. **No Duplication**: Redundant tests moved to legacy/
4. **BUG #21 Lesson Applied**: TRUE E2E test validates actual production execution path

## Test Execution

```bash
# CLI Mode
tests/cli-mode/run-all-tests.sh --quick      # Unit only (fast)
tests/cli-mode/run-all-tests.sh --integration # Unit + Integration
tests/cli-mode/run-all-tests.sh --full       # All tests

# Docker Mode
tests/docker/run-all-tests.sh --quick        # Unit + critical integration
tests/docker/run-all-tests.sh --integration  # All integration tests
tests/docker/run-all-tests.sh --full         # All tests including E2E
```

Test runners automatically exclude legacy/ subfolders.

## Related Documentation

- `tests/TEST_ORGANIZATION.md` - Comprehensive test organization guide
- `tests/CLAUDE.md` - Test authoring standards
- `tests/cli-mode/core/legacy/README.md` - CLI legacy test reference
- `tests/docker/core/legacy/README.md` - Docker legacy test reference
