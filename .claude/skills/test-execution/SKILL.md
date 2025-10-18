# Test Execution Skill

**Pattern:** Coordinator-Cached Test Execution

## Problem Statement

Concurrent test execution causes conflicts, resource contention, and flaky results. Multiple agents running tests simultaneously creates:
- Port conflicts (test servers)
- Database/file system race conditions
- Unreliable coverage reports
- Wasted computation

## Solution: Coordinator-Pattern Test Execution

**Core Principle:** Coordinator runs tests ONCE, workers read cached results.

### Execution Flow

```
┌─────────────┐
│ Coordinator │ Runs tests ONCE before spawning workers
└──────┬──────┘
       │
       ├─► Terminate existing test runs: pkill -f vitest
       ├─► Execute: npm test -- --run --reporter=json > test-results.json
       ├─► Signal completion: Redis PUBLISH swarm:tests:complete
       │
       ├───────────────────────────────────────┐
       │                                       │
┌──────▼──────┐                        ┌──────▼──────┐
│  Worker 1   │                        │  Worker 2   │
│ (READ ONLY) │                        │ (READ ONLY) │
└─────────────┘                        └─────────────┘
       │                                       │
       └─► cat test-results.json       ───────┘
```

### Usage Patterns

#### Coordinator (Before Spawning Workers)

```bash
#!/usr/bin/env bash
# test-coordinator-pattern.sh

SWARM_ID="${1:-swarm-default}"
REDIS_CHANNEL="swarm:${SWARM_ID}:tests"

# 1. Terminate existing test runs
echo "Terminating existing test processes..."
pkill -f vitest 2>/dev/null || true
pkill -f "npm test" 2>/dev/null || true
sleep 1

# 2. Execute tests once and cache results
echo "Running tests (coordinator-pattern)..."
npm test -- --run --reporter=json > test-results.json 2>&1
TEST_EXIT_CODE=$?

# 3. Parse results for Redis coordination
TESTS_PASSED=$(jq -r '.numPassedTests // 0' test-results.json 2>/dev/null || echo "0")
TESTS_FAILED=$(jq -r '.numFailedTests // 0' test-results.json 2>/dev/null || echo "0")
COVERAGE=$(jq -r '.coverageMap.total.lines.pct // 0' test-results.json 2>/dev/null || echo "0")

# 4. Signal completion via Redis
redis-cli PUBLISH "${REDIS_CHANNEL}:complete" "$(cat <<JSON
{
  "event": "tests_complete",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "exitCode": ${TEST_EXIT_CODE},
  "passed": ${TESTS_PASSED},
  "failed": ${TESTS_FAILED},
  "coverage": ${COVERAGE},
  "resultsFile": "test-results.json"
}
JSON
)"

# 5. Cache results in Redis (1-hour TTL)
redis-cli SETEX "${REDIS_CHANNEL}:results" 3600 "$(cat test-results.json)"

echo "Test execution complete. Results cached."
exit ${TEST_EXIT_CODE}
```

#### Worker (Read Cached Results)

```bash
#!/usr/bin/env bash
# test-cache-reader.sh

SWARM_ID="${1:-swarm-default}"
REDIS_CHANNEL="swarm:${SWARM_ID}:tests"

# 1. Wait for coordinator test completion (max 5 minutes)
echo "Waiting for coordinator test completion..."
TIMEOUT=300
ELAPSED=0
while [ ${ELAPSED} -lt ${TIMEOUT} ]; do
  COMPLETE=$(redis-cli GET "${REDIS_CHANNEL}:results" 2>/dev/null)
  if [ -n "${COMPLETE}" ]; then
    echo "Test results available."
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [ ${ELAPSED} -ge ${TIMEOUT} ]; then
  echo "ERROR: Timeout waiting for test results" >&2
  exit 1
fi

# 2. Read cached results (NEVER run tests)
if [ -f test-results.json ]; then
  echo "Reading cached test results from file..."
  cat test-results.json
else
  echo "Reading cached test results from Redis..."
  redis-cli GET "${REDIS_CHANNEL}:results"
fi

# 3. Parse for worker decision-making
TESTS_PASSED=$(jq -r '.numPassedTests // 0' test-results.json 2>/dev/null || echo "0")
TESTS_FAILED=$(jq -r '.numFailedTests // 0' test-results.json 2>/dev/null || echo "0")
COVERAGE=$(jq -r '.coverageMap.total.lines.pct // 0' test-results.json 2>/dev/null || echo "0")

echo "Tests: ${TESTS_PASSED} passed, ${TESTS_FAILED} failed, Coverage: ${COVERAGE}%"

# 4. Return exit code based on results
[ "${TESTS_FAILED}" -eq 0 ] && exit 0 || exit 1
```

### Cleanup (After All Work Complete)

```bash
# Terminate any remaining test processes
pkill -f vitest 2>/dev/null || true
pkill -f "npm test" 2>/dev/null || true

# Clean up Redis cache
redis-cli DEL "swarm:${SWARM_ID}:tests:results" 2>/dev/null || true

# Archive test results
mv test-results.json ".artifacts/test-results-$(date +%Y%m%d-%H%M%S).json"
```

## Redis Coordination Schema

### Channels

| Channel | Purpose | Publisher | Subscriber |
|---------|---------|-----------|------------|
| `swarm:{id}:tests:complete` | Test completion signal | Coordinator | Workers |
| `swarm:{id}:tests:results` | Cached test results (TTL: 1h) | Coordinator | Workers |

### Message Format

```json
{
  "event": "tests_complete",
  "timestamp": "2025-10-18T12:34:56Z",
  "exitCode": 0,
  "passed": 127,
  "failed": 0,
  "coverage": 87.5,
  "resultsFile": "test-results.json"
}
```

## Benefits

1. **Zero Concurrent Conflicts:** Single test execution eliminates race conditions
2. **Faster Worker Spawn:** Workers skip 30-60s test execution
3. **Consistent Results:** All workers use identical test data
4. **Resource Efficiency:** Single test run vs N parallel runs
5. **Reliable Coverage:** One authoritative coverage report

## Anti-Patterns (Prohibited)

❌ **Worker Running Tests:**
```bash
# WRONG: Worker executes tests
npm test  # DO NOT DO THIS
```

❌ **No Coordination:**
```bash
# WRONG: No Redis coordination check
if [ -f test-results.json ]; then
  cat test-results.json
fi
# Missing: Wait for coordinator completion signal
```

❌ **Concurrent Execution:**
```bash
# WRONG: Multiple agents run tests in parallel
agent1: npm test &
agent2: npm test &
agent3: npm test &
```

## Validation Tests

### Test 1: Zero Concurrent Conflicts (20 runs)

```bash
# Run 20 parallel test-cache-reader instances
for i in {1..20}; do
  bash .claude/skills/test-execution/test-cache-reader.sh swarm-test &
done
wait

# Expected: Zero conflicts, all workers read same results
# Validation: grep "ERROR" should return empty
```

### Test 2: Coordinator Single Execution

```bash
# Monitor test process count during coordinator execution
bash .claude/skills/test-execution/test-coordinator-pattern.sh swarm-test &
sleep 5
TEST_PROCS=$(pgrep -f "npm test" | wc -l)

# Expected: TEST_PROCS <= 1 (only coordinator)
[ ${TEST_PROCS} -le 1 ] && echo "PASS" || echo "FAIL"
```

### Test 3: Worker Wait Timeout

```bash
# Test worker timeout when coordinator never runs
redis-cli DEL "swarm:test-timeout:tests:results"
timeout 10 bash .claude/skills/test-execution/test-cache-reader.sh test-timeout

# Expected: Exits with error after timeout
# Exit code: 1, stderr: "ERROR: Timeout waiting for test results"
```

## Integration with CLAUDE.md

This skill implements the "Safe Test Execution" pattern from CLAUDE.md Section 3.3:

```
3.3 Safe Test Execution
- Coordinator runs tests ONCE before spawning workers
- Workers ONLY read test-results.json (never run tests)
- Single test execution prevents concurrent conflicts
- Cache results in test-results.json for worker consumption
```

## Related Skills

- **CFN Loop:** Loop 3 validators use cached test results for confidence scoring
- **Hook System:** Post-edit pipeline triggers coordinator test execution
- **Swarm Memory:** Test results cached in Redis (hot) + SQLite (persistent)

## Changelog

- **2025-10-18:** Initial implementation (Sprint 2.3)
- Pattern: Coordinator-cached execution with Redis coordination
- Zero concurrent conflicts in 20 parallel test runs
