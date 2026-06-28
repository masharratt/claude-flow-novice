---
description: "MUST BE USED instead of running Playwright tests directly in WSL2. Parallel E2E execution, auto-batches tests (fast/medium/large) to avoid OOM on memory-constrained WSL2. Use for Playwright/E2E test runs."
argument-hint: "[--mode=direct|task|error|parallel] [--batch=smoke|fast|medium|large|all] [--parallelism=N]"
allowed-tools: ["Bash", "Read", "TodoWrite", "Task", "Skill"]
---

# CFN E2E Smart Test Runner

Execute E2E tests with intelligent batching for optimal memory usage.

---

## Mode Selection (MANDATORY)

**Parse `--mode` argument and route accordingly:**

| Mode | Trigger | Use Case |
|------|---------|----------|
| `task` | `/cfn-loop-task` | Autonomous execution with iteration on failures |
| `error` | `/cfn-fix-errors` | Fix compilation/test errors after failures |
| `parallel` | `cfn-parallel-execute` | Run multiple tasks in parallel via pipeline |
| `direct` | Script only | Simple test run without orchestration |

**Keyword triggers:**
- "in parallel" / "parallel" → `--mode=parallel`
- "task mode" / "cfn loop" → `--mode=task`
- "fix errors" / "error mode" → `--mode=error`

---

## Mode: task (CFN Loop)

**When `--mode=task` or requesting "task mode" / "CFN loop":**

Invoke the CFN Loop Task command:

```
/cfn-loop-task "Run E2E tests with smart batching" --mode=standard
```

**This triggers:**
1. Loop 3: Implementation agents run E2E tests via `run-e2e-smart.sh`
2. Gate Check: Validates pass rate (95% for standard mode)
3. Loop 2: Validator agents review failures
4. Product Owner: Decides PROCEED/ITERATE/ABORT

**Command reference:** `.claude/commands/cfn-loop-task.md`

---

## Mode: error (Fix Failures)

**When `--mode=error` or tests have failures that need fixing:**

Invoke the Fix Errors command:

```
/cfn-fix-errors typescript --max-parallel=5
```

**This triggers:**
1. Phase 0: Fix root-cause files (type definitions, shared utilities)
2. Phase 1: Parallel fixes for remaining error files
3. Phase 2: Cross-file cleanup

**Command reference:** `.claude/commands/cfn-fix-errors.md`

---

## Mode: parallel (Pipeline Execution)

**When `--mode=parallel` or user says "in parallel":**

1. Generate task list from E2E test files:

```bash
# Create E2E task list
./.claude/skills/cfn-e2e/analyze-batches.sh tests/e2e --json /tmp/e2e-batches.json
```

2. Convert to parallel execute format:

```markdown
# E2E Test Parallel Execution

## Critical (Smoke Tests)
1. Run smoke tests - Agent: playwright-tester - File: tests/e2e/smoke-test.spec.ts

## High Priority (Fast Tests)
2. Run onboarding tests - Agent: playwright-tester - File: tests/e2e/onboarding.spec.ts
3. Run auth tests - Agent: playwright-tester - File: tests/e2e/authentication.spec.ts

## Medium Priority (Large Tests)
4. Run story tests - Agent: playwright-tester - File: tests/e2e/story-creation.spec.ts
```

3. Delegate to parallel executor:

```bash
cfn-parallel-execute --tasks=/tmp/e2e-tasks.md --agents=3
```

**Command reference:** `.claude/skills/cfn-parallel-execute/SKILL.md`

---

## Mode: direct (Script Only)

**When `--mode=direct` or simple execution requested:**

Run the smart batching script directly:

```bash
# Default: run all tests
./.claude/skills/cfn-e2e/run-e2e-smart.sh

# With options
BATCH_SIZE={{batch:-all}} PARALLELISM={{parallelism:-3}} WORKERS={{workers:-3}} \
  ./.claude/skills/cfn-e2e/run-e2e-smart.sh
```

---

## Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--mode` | `direct` | Execution mode: `task`, `error`, `direct` |
| `--batch` | `all` | Test category: `smoke`, `fast`, `medium`, `large`, `all` |
| `--parallelism` | `3` | Number of batches to run in parallel |
| `--workers` | `3` | Playwright workers per batch |

---

## Decision Flow

```
User Request
    │
    ├── "run e2e in task mode" / "cfn loop" / "--mode=task"
    │   └── Invoke: /cfn-loop-task "Run E2E tests" --mode=standard
    │
    ├── "fix e2e errors" / "error mode" / "--mode=error"
    │   └── Invoke: /cfn-fix-errors typescript
    │
    ├── "run e2e in parallel" / "parallel" / "--mode=parallel"
    │   └── Invoke: cfn-parallel-execute --tasks=e2e-tasks.md --agents=3
    │
    └── "run e2e" / "run tests" / "--mode=direct" / (default)
        └── Execute: ./.claude/skills/cfn-e2e/run-e2e-smart.sh
```

---

## Memory Profiles

| RAM | Recommended Settings |
|-----|---------------------|
| 16GB | `--parallelism=2 --workers=2` |
| 32GB | `--parallelism=3 --workers=2` |
| 48GB+ | `--parallelism=3 --workers=3` |

---

## Batch Categories

| Category | Tests | Strategy |
|----------|-------|----------|
| Fast | < 10 | Run 3-4 in parallel |
| Medium | 10-50 | Run 2-3 in parallel |
| Large | 50+ | Run sequentially |

---

## Results

- **JSON report**: `/tmp/cfn-e2e-results-<timestamp>.json`
- **Batch logs**: `/tmp/cfn-e2e-batch-*.log`

---

## Related Commands

- `/cfn-loop-task` - Full CFN Loop orchestration
- `/cfn-fix-errors` - Error coordination and fixing
- `cfn-parallel-execute` - Pipeline-based parallel execution

## Skill Location

`.claude/skills/cfn-e2e/SKILL.md`
