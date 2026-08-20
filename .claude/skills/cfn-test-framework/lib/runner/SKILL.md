# CFN Test Runner Skill

**Version:** 1.0.0
**Status:** Production
**Purpose:** Unified test execution with benchmarking and regression detection

---

## Overview

Provides comprehensive test execution across all CFN test suites:
- **Hello World Tests** (Layer 0-7)
- **CFN Loop E2E Tests** (9 integration tests)
- **Benchmark Tracking** (SQLite storage)
- **Regression Detection** (automated alerts)

**Key Features:**
- Single command test execution
- Historical benchmark comparison
- Performance regression alerts
- Git-aware baseline tracking
- Parallel test execution
- Comprehensive reporting

---

## Architecture

### Skill Components

```
.claude/skills/cfn-test-runner/
├── SKILL.md                    # This file
├── run-all-tests.sh            # Main test runner
├── store-benchmarks.sh         # SQLite benchmark storage
├── detect-regressions.sh       # Regression analysis
├── init-benchmark-db.sh        # Database initialization
└── generate-report.sh          # Test report generation
```

---

## Usage

### Run All Tests

```bash
$HOME/.claude/skills/cfn-test-runner/run-all-tests.sh \
  --suite all \
  --benchmark \
  --detect-regressions
```

### Run Specific Suite

```bash
# Hello World only
$HOME/.claude/skills/cfn-test-runner/run-all-tests.sh --suite hello-world

# CFN E2E only
$HOME/.claude/skills/cfn-test-runner/run-all-tests.sh --suite cfn-e2e

# Both
$HOME/.claude/skills/cfn-test-runner/run-all-tests.sh --suite all
```

### With Regression Detection

```bash
$HOME/.claude/skills/cfn-test-runner/run-all-tests.sh \
  --suite all \
  --benchmark \
  --detect-regressions \
  --threshold 0.10
```

---

## Parameters

### run-all-tests.sh

| Parameter | Required | Description | Default |
|-----------|----------|-------------|---------|
| `--suite` | No | Test suite: `all`, `hello-world`, `cfn-e2e` | `all` |
| `--benchmark` | No | Store results in SQLite | `false` |
| `--detect-regressions` | No | Run regression analysis | `false` |
| `--threshold` | No | Regression threshold (%) | `0.10` |
| `--parallel` | No | Run tests in parallel | `false` |
| `--output` | No | Output format: `text`, `json`, `html` | `text` |

---

## Test Suites

### Hello World (Layer 0-7)

**Purpose:** Validate agent spawning patterns and coordination

| Layer | Test | Duration | Critical |
|-------|------|----------|----------|
| 0 | Tool Validation | 60s | ✅ |
| 1-4 | [Future] | - | - |
| 5 | Coordinator Spawning | 120s | ✅ |
| 6 | Review Handoff | 180s | ✅ |
| 7 | Error Retry | 150s | ✅ |

**Location:** `tests/hello-world/`

### CFN Loop E2E (9 Tests)

**Purpose:** Validate full CFN Loop workflow

| Test | Component | Duration | Critical |
|------|-----------|----------|----------|
| 1 | Coordinator → Orchestrator | 30s | ✅ |
| 2 | Loop 3 → Gate Check | 60s | ✅ |
| 3 | Gate Pass → Loop 2 | 30s | ⚠️ |
| 4 | Loop 2 → Product Owner | 90s | ✅ |
| 5 | Product Owner Decision | 60s | ✅ |
| 6 | Iteration Cycle | 120s | ✅ |
| 7 | Redis Key Structure | 10s | ✅ |
| 8 | Error Recovery | 60s | ⚠️ |
| 9 | Cleanup | 10s | ⚠️ |

**Location:** `tests/cfn-v3/test-e2e-cfn-loop.sh`

---

## Benchmark Storage

### SQLite Schema

```sql
test_suites          -- Suite definitions
test_runs            -- Execution records
test_cases           -- Individual tests
test_results         -- Per-test outcomes
performance_metrics  -- Performance data
regression_alerts    -- Detected regressions
```

**Database:** `.artifacts/test-benchmarks.db`

### Stored Metrics

**Test-Level:**
- Duration (ms)
- Status (passed/failed/skipped)
- Assertion count
- Error messages

**Suite-Level:**
- Total duration (seconds)
- Success rate (%)
- Pass/fail/skip counts
- Git commit/branch

**Performance:**
- Agent spawn time
- Redis operation latency
- File I/O duration
- Memory usage

---

## Regression Detection

### Automatic Alerts

```bash
# Critical: Test started failing
alert_type: test_failure
severity: critical
message: "TEST 5: Product Owner Decision FAILED (was passing)"

# Warning: Performance degraded
alert_type: performance_regression
severity: warning
message: "Loop 3 spawn time increased 25% (baseline: 5s, current: 6.25s)"

# Info: Success rate dropped
alert_type: success_rate_drop
severity: info
message: "Suite success rate: 88% → 77% (threshold: 10%)"
```

### Threshold Configuration

```bash
# Default: 10% regression threshold
--threshold 0.10

# Strict: 5% threshold
--threshold 0.05

# Relaxed: 20% threshold
--threshold 0.20
```

---

## Output Formats

### Text (Console)

```
==========================================
CFN Test Suite Results
==========================================

Suite: Hello World
  Layer 0: ✅ PASSED (58.3s)
  Layer 5: ✅ PASSED (115.7s)
  Layer 6: ✅ PASSED (172.4s)
  Layer 7: ✅ PASSED (148.2s)

Suite: CFN E2E
  TEST 1: ✅ PASSED (28.1s)
  TEST 2: ✅ PASSED (54.6s)
  TEST 3: ⚠️  SKIPPED
  TEST 4: ✅ PASSED (87.3s)
  TEST 5: ✅ PASSED (59.2s)
  TEST 6: ✅ PASSED (118.9s)
  TEST 7: ✅ PASSED (9.4s)

Total: 11 tests, 9 passed, 0 failed, 2 skipped
Duration: 851.1s
Success Rate: 81.8%

Regressions Detected: 0
==========================================
```

### JSON (API/CI)

```json
{
  "timestamp": "2025-11-04T02:00:00Z",
  "git_commit": "abc123",
  "git_branch": "main",
  "suites": {
    "hello-world": {
      "total": 4,
      "passed": 4,
      "failed": 0,
      "skipped": 0,
      "duration": 494.6,
      "success_rate": 1.0
    },
    "cfn-e2e": {
      "total": 9,
      "passed": 7,
      "failed": 0,
      "skipped": 2,
      "duration": 356.5,
      "success_rate": 0.778
    }
  },
  "regressions": [],
  "baseline_comparison": {
    "duration_change": "+2.3%",
    "success_rate_change": "+0.0%"
  }
}
```

### HTML (Report)

Generates interactive HTML report with:
- Trend graphs (Chart.js)
- Regression highlights
- Test history
- Performance metrics

---

## Baseline Management

### Establish Baseline

```bash
# First run establishes baseline
$HOME/.claude/skills/cfn-test-runner/run-all-tests.sh --suite all --benchmark

# Mark as baseline
sqlite3 .artifacts/test-benchmarks.db << EOF
UPDATE test_runs SET environment = 'baseline' WHERE id = (SELECT MAX(id) FROM test_runs);
