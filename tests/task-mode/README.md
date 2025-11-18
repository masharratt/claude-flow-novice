# Task Mode Tests

Tests specific to CFN Loop Task mode execution (`/cfn-loop-task` command).

## Purpose
Task mode spawns all agents directly via Task() tool in Main Chat.
Provides "full visibility in Main Chat" and is the default debugging mode.

These tests validate:
- Task() spawning patterns
- Direct agent coordination
- Main Chat visibility
- Debugging workflows

## Related Documentation
- `CLAUDE.md` lines 167-188 (Task vs CLI mode)
- `.claude/commands/CFN_LOOP_TASK_MODE.md`
- `SESSION_2025-11-12_FINDINGS.md`

## When to Use Task Mode
- Debugging (full visibility)
- Learning (see all agent interactions)
- Short tasks (<5 min)
- Development and testing

## Moved From
Originally in `tests/cfn-v3/`.
Relocated during Phase 1 cleanup per TEST_SUITE_MAINTENANCE_PLAN.md.

## Current Tests
(Files to be moved here once found in codebase)
- test-task-mode-safety.sh
- test-task-mode-complete.sh
