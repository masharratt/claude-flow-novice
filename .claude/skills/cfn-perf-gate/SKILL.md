---
name: cfn-perf-gate
description: "Performance regression gate. Runs a configurable benchmark command, compares results against a stored baseline, and emits a cfn-vote-implement manifest for every path that regressed beyond CFN_PERF_THRESHOLD_PCT. Set CFN_PERF_BENCH_CMD to a command that outputs {name: number} JSON. Never auto-fixes."
version: 1.0.0
tags: [performance, regression, gate, benchmark, profiling]
status: production
---

# CFN Performance Gate

**Purpose:** Detect performance regressions before merge. Runs your project benchmark, compares against a stored baseline, and emits a structured manifest that feeds `cfn-vote-implement` for 3-agent voting. Findings route through voting. This skill never auto-fixes.

## When to Use (gate)

Run before merging any change that touches:

- Hot code paths (request handlers, query execution, data transforms).
- Caching or memoization layers.
- Database query plans or indexes.
- Build pipeline or CLI performance.

If no benchmark exists for this project, skip this gate or set one up first.

## Benchmark Command Format

`CFN_PERF_BENCH_CMD` must output a flat JSON object where each key is a named benchmark and each value is a numeric measurement (milliseconds or any consistent unit):

```
{"api_endpoint": 120, "db_query": 45, "build_time": 8200}
```

All values must be numbers. All runs must use the same unit. Keys present in the baseline but missing from the current run are skipped (not flagged as regressions).

## Baseline Workflow

1. Before your change: run `execute.sh` with no baseline present. The script records the current benchmark as the baseline and exits 0.
2. Make your change.
3. Run `execute.sh` again. It compares current results against the baseline and flags regressions.
4. If regressions are found: manifest is emitted, exit code 2, run `/cfn-vote-implement latest`.
5. After fixing regressions: run `execute.sh --update-baseline` to promote the current results to the new baseline.

## Inputs

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `CFN_PERF_BENCH_CMD` | (required) | Shell command that outputs benchmark JSON. Gate cannot run without this. |
| `CFN_PERF_THRESHOLD_PCT` | `10` | Percent slower than baseline before a path is flagged as a regression. |

**Flags:**

| Flag | Effect |
|------|--------|
| `--update-baseline` | Run benchmark, write results as new baseline, exit 0. No comparison. |

## Outputs

- Baseline at `<project-root>/.cfn-cache/perf-baseline.json` (auto-gitignored).
- When regressions exist: manifest at `<project-root>/.cfn-cache/manifests/cfn-perf-gate-<ns>.json`.
- When no regressions: stdout summary, no manifest, exit 0.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No regressions found, OR baseline recorded (first run or `--update-baseline`). |
| `1` | Config or execution error: `CFN_PERF_BENCH_CMD` not set, benchmark command failed, output is not valid JSON. |
| `2` | Regressions found. Manifest emitted. Run `/cfn-vote-implement latest`. |

## Usage

```bash
# 1. Record baseline (before your change)
CFN_PERF_BENCH_CMD='./scripts/bench.sh' ./.claude/skills/cfn-perf-gate/execute.sh

# 2. Make your change, then run the gate
CFN_PERF_BENCH_CMD='./scripts/bench.sh' ./.claude/skills/cfn-perf-gate/execute.sh

# 3. If exit code 2, route findings through voting
/cfn-vote-implement latest

# 4. After fixes, promote new baseline
CFN_PERF_BENCH_CMD='./scripts/bench.sh' ./.claude/skills/cfn-perf-gate/execute.sh --update-baseline

# Override threshold (flag if >5% slower)
CFN_PERF_THRESHOLD_PCT=5 CFN_PERF_BENCH_CMD='./scripts/bench.sh' ./.claude/skills/cfn-perf-gate/execute.sh
```

## Manifest Schema (shared with cfn-vote-implement)

```json
{
  "review_id": "perf-gate-<ns>",
  "source": "cfn-perf-gate",
  "generated_at": "ISO-8601",
  "threshold_pct": 10,
  "baseline_file": "<project-root>/.cfn-cache/perf-baseline.json",
  "regression_count": 1,
  "suggestions": [
    {
      "id": "S001",
      "category": "perf_regression",
      "tag": "fix",
      "one_liner": "api_endpoint: regressed 60% (baseline 100, current 160)",
      "title": "perf regression: api_endpoint",
      "description": "api_endpoint regressed 60% above the 10% threshold. Baseline: 100. Current: 160.",
      "files": [],
      "impact": "high | medium | low",
      "effort": "medium",
      "suggested_approach": "Profile api_endpoint to identify the regression. Compare the diff since baseline was recorded. Optimize the hot path or revert the regressing change.",
      "related_suggestions": []
    }
  ]
}
```

Impact tiers: `high` (>50% regression), `medium` (>20%), `low` (above threshold, below 20%).

## Rules

- `CFN_PERF_BENCH_CMD` is required. The gate exits 1 with a clear message if unset.
- Every finding routes through `/cfn-vote-implement`. Never apply fixes manually.
- Baseline is project-local (`.cfn-cache/`, gitignored). Each developer maintains their own baseline.
- Keep benchmark runs deterministic. Noisy benchmarks produce false positives; the threshold exists to absorb minor variance.
- The `cfn:` marker in `execute.sh` flags the flat-JSON assumption. Upgrade to multi-metric (p50/p99) baselines when that limit is hit.

## Related

- `/cfn-vote-implement` - votes on and routes the findings.
- `cfn-dep-audit` - supply-chain gate (same manifest schema).
- `cfn-security-review` - security gate (same manifest schema).
- `cfn-monitor` - runtime health gate (post-deploy probing).
