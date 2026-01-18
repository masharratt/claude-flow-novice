---
description: "Smart parallel E2E test execution with automatic batching. Optimizes Playwright tests for memory-constrained WSL2 environments by grouping tests into fast/medium/large batches."
argument-hint: "[--batch=smoke|fast|medium|large|all] [--parallelism=N] [--workers=N]"
allowed-tools: ["Bash", "Read", "TodoWrite"]
---

# CFN E2E Smart Test Runner

Execute E2E tests with intelligent batching for optimal memory usage.

---

## Quick Start

Parse arguments and run tests:

```bash
# Default: run all tests with smart batching
./.claude/skills/cfn-e2e/run-e2e-smart.sh

# Smoke tests only (fastest)
BATCH_SIZE=smoke ./.claude/skills/cfn-e2e/run-e2e-smart.sh

# With custom settings
BATCH_SIZE={{batch:-all}} PARALLELISM={{parallelism:-3}} WORKERS={{workers:-3}} \
  ./.claude/skills/cfn-e2e/run-e2e-smart.sh
```

---

## Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--batch` | `all` | Test category: `smoke`, `fast`, `medium`, `large`, `all` |
| `--parallelism` | `3` | Number of batches to run in parallel |
| `--workers` | `3` | Playwright workers per batch |

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

## Analyze Without Running

```bash
# View batch distribution
./.claude/skills/cfn-e2e/analyze-batches.sh tests/e2e

# Generate JSON config
./.claude/skills/cfn-e2e/analyze-batches.sh tests/e2e --json /tmp/batches.json
```

---

## Results

- **JSON report**: `/tmp/cfn-e2e-results-<timestamp>.json`
- **Batch logs**: `/tmp/cfn-e2e-batch-*.log`

---

## Skill Location

`.claude/skills/cfn-e2e/SKILL.md`
