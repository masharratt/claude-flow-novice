---
name: run-tests
description: Run CFN test suites with benchmarking and regression detection
category: testing
---

# Run CFN Tests

Execute CFN test suites (Hello World + CFN E2E) with automatic benchmarking and regression detection.

## Usage

```bash
# Run all tests
/run-tests

# Run specific suite
/run-tests hello-world
/run-tests cfn-e2e

# With benchmarking
/run-tests --benchmark

# With regression detection
/run-tests --detect-regressions --threshold 0.10
```

## Execution

```bash
./.claude/skills/cfn-test-runner/run-all-tests.sh \
  --suite {{arg1:-all}} \
  {{#if benchmark}}--benchmark{{/if}} \
  {{#if detect-regressions}}--detect-regressions --threshold {{threshold:-0.10}}{{/if}}
```

## Test Suites

### Hello World (4 tests)
- Layer 0: Tool Validation (60s)
- Layer 5: Coordinator Spawning (120s)
- Layer 6: Review Handoff (180s)
- Layer 7: Error Retry (150s)

### CFN E2E (9 tests)
- Coordinator → Orchestrator handoff
- Loop 3 → Gate Check
- Gate Pass → Loop 2
- Loop 2 → Product Owner
- Product Owner Decision
- Iteration Cycle
- Redis Key Structure
- Error Recovery
- Cleanup

## Benchmarking

Results stored in `.artifacts/test-benchmarks.db`:
- Test run history (30 days)
- Success rate trends
- Duration tracking
- Git commit correlation

## Regression Detection

Automatic alerts for:
- Test failures (was passing)
- Performance degradation (>10% slower)
- Success rate drops (>10% decrease)

View regressions:
```sql
sqlite3 .artifacts/test-benchmarks.db "SELECT * FROM regression_alerts WHERE acknowledged = 0"
```

## Examples

**Standard test run:**
```
/run-tests
```

**With full benchmarking:**
```
/run-tests --benchmark --detect-regressions
```

**Specific suite only:**
```
/run-tests cfn-e2e --benchmark
```

## Output

```
==========================================
CFN Test Suite Runner
==========================================
Suite: all
Benchmark: true
Detect Regressions: true
Git: main @ abc123

Hello World: 4 passed, 0 failed, 0 skipped (494s)
CFN E2E: 7 passed, 0 failed, 2 skipped (356s)

==========================================
Test Summary
==========================================
Total: 13 tests
Passed: 11
Failed: 0
Skipped: 2
Duration: 850s
Success Rate: 84.6%

✅ Benchmark stored (run_id: 42)
✅ No regressions detected
```
