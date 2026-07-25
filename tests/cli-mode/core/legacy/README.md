# Legacy CLI Mode Tests

This directory contains CLI mode tests that have been superseded by newer, more comprehensive tests or are specific to historical bugs that have been resolved.

## Why Tests Were Moved Here

Tests are moved to legacy when they:
1. **Duplicate functionality** of newer, more comprehensive tests
2. **Use simulation/mocking** instead of real production code paths
3. **Target specific bugs** that have been fixed and validated
4. **Lack clear descriptions** or have been superseded by refactored versions

## Contents

### test-cfn-loop-execution.sh
- **Reason:** Smoke test superseded by TRUE E2E test
- **Replaced By:** `tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh`
- **Why:** The TRUE E2E test uses real production scripts (spawn-agent.sh, cfn-agent image) instead of infrastructure checks. Provides 10 validation checkpoints vs basic smoke test.

### test-cfn-loop-e2e-integration.sh
- **Reason:** Integration test redundant with TRUE E2E
- **Replaced By:** `tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh`
- **Why:** The newer E2E test provides more comprehensive validation without simulations.

### test-cfn-loop-full-cycle.sh
- **Reason:** Obsolete (no description, likely superseded)
- **Replaced By:** Multiple specialized tests in core/
- **Why:** Lacks documentation and appears to duplicate functionality now covered by unit/integration/e2e breakdown.

## When to Use Legacy Tests

Legacy tests may still be useful for:
- Historical reference
- Understanding evolution of test approach
- Debugging regressions in specific edge cases
- Comparative analysis

## Moving Tests Back to Core

If a legacy test is needed again:
1. Update test documentation
2. Ensure it doesn't duplicate existing core tests
3. Verify it uses production code paths (not simulations)
4. Move to appropriate core subdirectory (unit/integration/e2e)
5. Update test runners to include it

## Related Documentation

- `tests/TEST_ORGANIZATION.md` - Complete test organization guide
- `tests/CLAUDE.md` - Test authoring standards
- `tests/cli-mode/run-all-tests.sh` - Test runner (excludes legacy by default)
