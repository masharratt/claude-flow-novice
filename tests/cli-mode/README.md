# CLI Mode Tests

Tests specific to CFN Loop CLI mode execution (`/cfn-loop-cli` command).

## Purpose
CLI mode spawns the cfn-v3-coordinator which orchestrates workers via CLI spawning
in the background. These tests validate:
- Mode detection logic
- CLI spawning mechanics
- Background worker coordination
- Cost-optimized execution patterns (95-98% savings vs Task mode)

## Related Documentation
- `CLAUDE.md` lines 167-188 (CLI vs Task mode)
- `.claude/commands/cfn/CFN_LOOP_TASK_MODE.md`
- `planning/docker/SESSION_2025-11-12_FINDINGS.md`

## Execution
These tests validate infrastructure that Task mode still uses.
Docker coordinator is ONE execution path, not THE ONLY path.

## Moved From
Originally in `tests/cfn-v3/` and `tests/integration/`.
Relocated during Phase 1 cleanup per TEST_SUITE_MAINTENANCE_PLAN.md.

## Current Tests
(Files to be moved here once found in codebase)
- test_mode_detection.sh
- test_cli_mode.sh
- test_mode_simple.sh
- test-mode-detection-anti023.sh
