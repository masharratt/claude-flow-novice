---
name: cfn-e2e
description: "Smart parallel E2E test execution with automatic batching. Optimizes Playwright tests for memory-constrained WSL2 environments by grouping tests into fast/medium/large batches."
version: 1.0.0
tags: [testing, e2e, playwright, parallel, batching]
status: production
category: testing
---

# CFN E2E Skill

## Purpose

Smart parallel E2E test execution with automatic batching optimization. Reduces test execution time by 2-3x while staying within memory limits.

**Core Innovation:** Runs fast batches in parallel (2-3 concurrent), large batches sequentially to avoid overwhelming RAM while maximizing throughput.

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

## Integration

### CFN Loop Integration

```bash
/cfn-loop-task "Run E2E tests" --mode=standard --config='{"batch_size":"smoke"}'
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
