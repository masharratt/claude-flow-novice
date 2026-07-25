# Legacy Docker Mode Tests

This directory contains Docker mode tests that have been superseded, are specific to resolved bugs, or lack clear documentation.

## Why Tests Were Moved Here

Tests are moved to legacy when they:
1. **Bug-specific validation** - Targeted at specific historical bugs that have been fixed
2. **Missing descriptions** - No clear purpose documented in test headers
3. **Superseded functionality** - Newer tests provide better coverage
4. **Dashboard-specific** - Related to specific bug fixes in dashboard component

## Contents

### Bug-Specific Validation Tests (Historical)

These tests validated specific bug fixes and serve as historical reference:

- **test-bugfix-container-validation.sh** - Container ID validation (Bug #X)
- **test-bugfix-quick-verification.sh** - Quick verification suite for bug fixes
- **test-bugfix-redis-checkpoint.sh** - Redis checkpoint operations
- **test-bugfix-security-sanitization.sh** - Control character and shell metacharacter sanitization
- **test-bugfix-validation-summary.sh** - Bug fix validation summary

**Replaced By:** Integration tests in core/ that validate ongoing functionality

### Dashboard Build Tests

- **test-dashboard-build-errors.sh** - Dashboard build error detection
- **test-dashboard-build-fix-validation.sh** - Dashboard build fix validation

**Reason:** Specific to dashboard component bug fixes, now resolved

### Tests Without Descriptions (Likely Obsolete)

These tests lack clear documentation and appear superseded:

- **cfn-loop-full-cycle-tests.sh** - No description (likely superseded by cfn-loop-compliance-tests.sh)
- **coordinator-spawning-tests.sh** - No description (superseded by coordinator-validation-tests.sh)
- **docker-hello-world-parity-tests.sh** - No description
- **orchestrator-workflow-tests.sh** - No description (superseded by orchestrator-workflow-tests.sh in core/)
- **tdd-compliance-tests.sh** - No description
- **test-coordinator-params-simple.sh** - No description (superseded by test-coordinator-orchestrate-params.sh)
- **threshold-validation-tests.sh** - No description (superseded by BUG #22 Phase 1 threshold enforcement)

## Core Tests Retained

The following test categories remain in core/:

1. **Agent Lifecycle** - Spawn-to-exit, metadata capture, auto-removal
2. **CFN Loop Compliance** - Pattern compliance validation
3. **Coordinator Tests** - Planning, spawning, iteration, validation, fault tolerance
4. **Coordination** - Redis coordination, environment propagation
5. **Memory Management** - Budget enforcement, wave spawning
6. **Contract Alignment** - Environment contract YAML validation
7. **Wave Orchestration** - Multi-wave tests with recovery and security

## When to Use Legacy Tests

Legacy tests may still be useful for:
- Debugging specific historical bug regressions
- Understanding bug fix evolution
- Comparative analysis of old vs new approaches
- Historical reference

## Moving Tests Back to Core

If a legacy test is needed again:
1. Add clear description in test header
2. Verify no duplication with existing core tests
3. Ensure production code path fidelity (no mocks for integration tests)
4. Update to current test standards (see `tests/CLAUDE.md`)
5. Move to core/ and update test runner

## Related Documentation

- `tests/TEST_ORGANIZATION.md` - Complete test organization guide
- `tests/CLAUDE.md` - Test authoring standards (includes BUG #21 lesson)
- `tests/docker/run-all-tests.sh` - Test runner (excludes legacy by default)
- `docs/BUG_21_*.md` - BUG #21 case study on test coverage gaps
