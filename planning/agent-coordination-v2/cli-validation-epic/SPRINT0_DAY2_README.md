# Sprint 0 Day 2: 8-Hour Stability Test - Quick Start

## Quick Start Guide

### 1. Quick Test (1-hour dry run - RECOMMENDED FIRST)

```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice/planning/cli-validation-epic
bash sprint0-day2-quick-test.sh
```

**Duration**: 1 hour (12 cycles)

### 2. Full Test (8-hour production test)

```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice/planning/cli-validation-epic
bash sprint0-day2-stability-test.sh
```

**Duration**: 8 hours (96 cycles)

### 3. Analyze Results

```bash
bash analyze-stability-results.sh
```

**Output**: Detailed analysis with GO/NO-GO verdict

---

## Files Created

| File | Purpose |
|------|---------|
| `sprint0-day2-stability-test.sh` | Main 8-hour test script |
| `sprint0-day2-quick-test.sh` | 1-hour dry run wrapper |
| `analyze-stability-results.sh` | Results analysis tool |
| `SPRINT0_DAY2_IMPLEMENTATION.md` | Comprehensive documentation |
| `SPRINT0_DAY2_README.md` | Quick start guide (this file) |

---

## Output Files (Generated During Test)

| File | Description |
|------|-------------|
| `stability-metrics.jsonl` | Per-cycle metrics (JSON Lines) |
| `stability-summary.json` | Aggregated analysis |
| `memory-trend.csv` | Memory usage over time |
| `fd-trend.csv` | File descriptor count over time |
| `coordination-trend.csv` | Coordination time over time |

---

## Acceptance Criteria

- ✅ Memory growth <10% over 8 hours
- ✅ FD count stable (no leaks)
- ✅ Coordination time variance <20%
- ✅ Zero crashes or hangs

---

## Monitoring During Execution

Watch test progress in real-time:

```bash
# Monitor cycle progress
tail -f stability-metrics.jsonl | jq -r '"\(.cycle)/96 - Memory: \(.memory_rss_kb)KB, FD: \(.fd_count)"'

# Check latest metrics
tail -1 stability-metrics.jsonl | jq .
```

---

## Troubleshooting

### Test fails to start

**Error**: `/dev/shm` not available

**Fix**: Verify tmpfs mounted:
```bash
df -h /dev/shm
```

### Metrics file not updating

**Check**: Test is running:
```bash
ps aux | grep stability-test
```

### Analysis script errors

**Error**: `jq` not found

**Fix**: Install jq:
```bash
sudo apt-get install jq  # Ubuntu/Debian
```

---

## Next Steps After Test

### If Test PASSES (GO)

1. Review `stability-summary.json`
2. Archive results
3. Proceed to Sprint 0 Day 3 GO/NO-GO decision
4. Recommend Phase 1 implementation

### If Test FAILS (NO-GO)

1. Analyze failure with `analyze-stability-results.sh`
2. Identify root cause (memory leak, FD leak, etc.)
3. Implement remediation fixes
4. Rerun full 8-hour test

---

## Time Estimates

| Task | Duration |
|------|----------|
| Quick test (dry run) | 1 hour |
| Full test | 8 hours |
| Analysis | 5 minutes |
| Documentation | 15 minutes |
| **Total (with dry run)** | ~9.5 hours |

---

## Contact

**Agent**: DevOps Engineer
**Sprint**: Sprint 0 Day 2
**Date**: 2025-10-06
**Status**: READY FOR EXECUTION
