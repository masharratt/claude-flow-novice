---
name: cfn-e2e
description: "MUST BE USED instead of running Playwright tests directly in WSL2. Parallel E2E execution, auto-batches tests (fast/medium/large) to avoid OOM on memory-constrained WSL2. Use for Playwright/E2E test runs."
version: 1.0.0
tags: [testing, e2e, playwright, parallel, batching]
status: production
category: testing
---

# CFN E2E Skill

## Purpose

Smart parallel E2E test execution with automatic batching optimization. Reduces test execution time by 2-3x while staying within memory limits.

**Core Innovation:** Runs fast batches in parallel (2-3 concurrent), large batches sequentially to avoid overwhelming RAM while maximizing throughput.

> **Leaked workers:** If a Playwright/test runner dies and orphans worker processes (reparented to PID 1), `.claude/hooks/reap-orphan-test-workers.sh` reaps them so they do not burn CPU/RAM.

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `TEST_DIR` | string | No | `tests/e2e` | Path to E2E test directory |
| `PARALLELISM` | integer | No | `3` | Number of batches to run in parallel |
| `BATCH_SIZE` | enum | No | `all` | `fast`, `medium`, `large`, `all`, `smoke` |
| `WORKERS` | integer | No | `3` | Playwright workers per batch |
| `HEAP_SIZE_MB` | integer | No | `6144` | Node heap size in MB |
| `TIMEOUT_MS` | integer | No | `30000` | Per-test timeout in milliseconds |

## Outputs

- **stdout**: Test progress and results summary
- **exit code**: 0 = all passed, 1 = failures, 2 = configuration error
- **JSON report**: `/tmp/cfn-e2e-results-<timestamp>.json`

## Usage

### Basic Usage

```bash
# Run all E2E tests with smart batching
./.claude/skills/cfn-e2e/run-e2e-smart.sh

# Run only smoke tests
BATCH_SIZE=smoke ./.claude/skills/cfn-e2e/run-e2e-smart.sh

# Custom test directory
TEST_DIR=e2e ./.claude/skills/cfn-e2e/run-e2e-smart.sh

# Lower parallelism for 16GB RAM
PARALLELISM=2 WORKERS=2 HEAP_SIZE_MB=4096 ./.claude/skills/cfn-e2e/run-e2e-smart.sh
```

### Analyze Batches Only

```bash
# Discover and categorize tests without running
./.claude/skills/cfn-e2e/analyze-batches.sh tests/e2e
```

## Batch Heuristics

| Category | Test Count | Typical Duration | Parallelism |
|----------|------------|------------------|-------------|
| Fast | < 10 tests | 30-60 sec | 3-4 concurrent |
| Medium | 10-50 tests | 2-5 min | 2-3 concurrent |
| Large | 50+ tests | 4-8 min | Sequential |

## Configuration

### Environment Variables

```bash
# Node.js heap size (default: 6GB for 48GB RAM systems)
export NODE_OPTIONS="--max-old-space-size=6144"

# Playwright workers per batch
export PLAYWRIGHT_WORKERS=3

# Test timeout
export PLAYWRIGHT_TIMEOUT=30000
```

### Project Requirements

1. **Playwright installed**: `npx playwright --version`
2. **Test files pattern**: `*.spec.ts` or `*.test.ts`
3. **playwright.config.ts**: Standard Playwright configuration

### Memory Profiles

| RAM | HEAP_SIZE_MB | WORKERS | PARALLELISM |
|-----|--------------|---------|-------------|
| 16GB | 4096 | 2 | 2 |
| 32GB | 5120 | 2-3 | 3 |
| 48GB | 6144 | 3 | 3 |
| 64GB+ | 8192 | 4 | 4 |

## Performance Metrics

| Metric | Single Run | Smart Batched | Improvement |
|--------|-----------|---------------|-------------|
| Total Time | 90 min | 33 min | 2.7x faster |
| Peak RAM | ~2GB | 9-14GB | Safe for 48GB |
| Test Count | 568 tests | 568 tests | Same coverage |

## Dependencies

- Node.js v18+
- Playwright v1.40+
- Bash 4.0+
- CFN Utilities (optional, for structured logging)

## Execution Modes

### Task Mode (CFN Loop)

**For autonomous E2E execution with iteration on failures:**

```bash
/cfn-loop-task "Run E2E tests and fix failures" --mode=standard
```

This triggers the full CFN Loop workflow:
1. Loop 3: Implementation agents run E2E tests
2. Gate Check: Validates pass rate against threshold
3. Loop 2: Validator agents review failures
4. Product Owner: Decides PROCEED/ITERATE/ABORT

**Command reference:** `.claude/commands/cfn-loop-task.md`

### Error Mode (Fix Failures)

**When E2E tests fail and need fixing:**

```bash
/cfn-fix-errors typescript --max-parallel=5
```

This triggers the error coordination workflow:
1. Phase 0: Fix root-cause files (type definitions, configs)
2. Phase 1: Parallel fixes for remaining files
3. Phase 2: Cross-file cleanup

**Command reference:** `.claude/commands/cfn-fix-errors.md`

### Parallel Mode (Pipeline Execution)

**For running E2E tests in parallel via cfn-parallel-execute:**

```bash
cfn-parallel-execute --tasks=/tmp/e2e-tasks.md --agents=3
```

This triggers the pipeline execution engine:
1. Spawns N agents to work through test files
2. Maintains agent count via exit notification-driven replacement
3. No polling - preserves context window

**Trigger keywords:** "in parallel", "parallel execution"

**Command reference:** `.claude/skills/cfn-parallel-execute/SKILL.md`

### Direct Mode (Script Only)

**For simple test execution without CFN orchestration:**

```bash
./.claude/skills/cfn-e2e/run-e2e-smart.sh
```

## Integration

### CFN Loop Integration

```bash
# Full autonomous loop with E2E validation
/cfn-loop-task "Run E2E tests" --mode=standard --config='{"batch_size":"smoke"}'

# On failures, trigger error fixing
/cfn-fix-errors typescript
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run E2E Tests
  run: |
    PARALLELISM=2 WORKERS=2 ./.claude/skills/cfn-e2e/run-e2e-smart.sh
  env:
    NODE_OPTIONS: --max-old-space-size=4096
```

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | This documentation |
| `run-e2e-smart.sh` | Main batched test runner |
| `analyze-batches.sh` | Test discovery and categorization |
| `lib/batch-runner.sh` | Batch execution utilities |

## Known Limitations

1. **WSL2 Memory Monitor**: Kills processes >10% RAM per process
2. **Dev Server Overhead**: Each batch may start/stop dev server
3. **Test Isolation**: No shared state between batches
4. **Browser Instances**: 2-3 workers × 2-3 batches = 4-9 browsers max

## Troubleshooting

### Tests killed unexpectedly
- Check WSL memory monitor: `~/.local/bin/wsl-memory-monitor.sh --status`
- Reduce WORKERS or PARALLELISM
- Reduce HEAP_SIZE_MB

### Tests timing out
- Increase TIMEOUT_MS
- Check if dev server is running
- Verify network connectivity for external APIs

### Batch analyzer finds no tests
- Verify TEST_DIR path
- Check file patterns (*.spec.ts, *.test.ts)
- Ensure playwright.config.ts exists

## Version History

- **1.0.0** (2025-01-17): Initial release with smart batching
