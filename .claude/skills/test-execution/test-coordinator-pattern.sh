#!/usr/bin/env bash
# test-coordinator-pattern.sh
# Coordinator-pattern test execution: Run tests ONCE, cache results for workers

set -euo pipefail

SWARM_ID="${1:-swarm-default}"
REDIS_CHANNEL="swarm:${SWARM_ID}:tests"
RESULTS_FILE="test-results.json"

echo "[COORDINATOR] Starting test execution for swarm: ${SWARM_ID}"

# 1. Terminate existing test runs to prevent conflicts
echo "[COORDINATOR] Terminating existing test processes..."
pkill -f vitest 2>/dev/null || true
pkill -f "npm test" 2>/dev/null || true
pkill -f "node.*test" 2>/dev/null || true
sleep 1

# Verify no test processes remain
REMAINING=$(pgrep -f "vitest|npm test" | wc -l || echo "0")
if [ "${REMAINING}" -gt 0 ]; then
  echo "[COORDINATOR] WARNING: ${REMAINING} test processes still running. Force killing..."
  pkill -9 -f vitest 2>/dev/null || true
  pkill -9 -f "npm test" 2>/dev/null || true
  sleep 1
fi

# 2. Execute tests once and cache results
echo "[COORDINATOR] Running tests (single execution)..."
START_TIME=$(date +%s)

# Run tests with JSON reporter for parsing
if npm test -- --run --reporter=json > "${RESULTS_FILE}" 2>&1; then
  TEST_EXIT_CODE=0
else
  TEST_EXIT_CODE=$?
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "[COORDINATOR] Test execution complete in ${DURATION}s (exit code: ${TEST_EXIT_CODE})"

# 3. Parse test results
if [ -f "${RESULTS_FILE}" ]; then
  TESTS_PASSED=$(jq -r '.numPassedTests // 0' "${RESULTS_FILE}" 2>/dev/null || echo "0")
  TESTS_FAILED=$(jq -r '.numFailedTests // 0' "${RESULTS_FILE}" 2>/dev/null || echo "0")
  TESTS_TOTAL=$(jq -r '.numTotalTests // 0' "${RESULTS_FILE}" 2>/dev/null || echo "0")
  COVERAGE_LINES=$(jq -r '.coverageMap.total.lines.pct // 0' "${RESULTS_FILE}" 2>/dev/null || echo "0")
  COVERAGE_BRANCHES=$(jq -r '.coverageMap.total.branches.pct // 0' "${RESULTS_FILE}" 2>/dev/null || echo "0")

  echo "[COORDINATOR] Results: ${TESTS_PASSED}/${TESTS_TOTAL} passed, ${TESTS_FAILED} failed"
  echo "[COORDINATOR] Coverage: ${COVERAGE_LINES}% lines, ${COVERAGE_BRANCHES}% branches"
else
  echo "[COORDINATOR] WARNING: ${RESULTS_FILE} not found. Using default values."
  TESTS_PASSED=0
  TESTS_FAILED=0
  TESTS_TOTAL=0
  COVERAGE_LINES=0
  COVERAGE_BRANCHES=0
fi

# 4. Signal completion via Redis pub/sub
COMPLETION_MESSAGE=$(cat <<JSON
{
  "event": "tests_complete",
  "swarmId": "${SWARM_ID}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "duration": ${DURATION},
  "exitCode": ${TEST_EXIT_CODE},
  "tests": {
    "passed": ${TESTS_PASSED},
    "failed": ${TESTS_FAILED},
    "total": ${TESTS_TOTAL}
  },
  "coverage": {
    "lines": ${COVERAGE_LINES},
    "branches": ${COVERAGE_BRANCHES}
  },
  "resultsFile": "${RESULTS_FILE}"
}
JSON
)

echo "[COORDINATOR] Publishing completion signal to Redis..."
redis-cli PUBLISH "${REDIS_CHANNEL}:complete" "${COMPLETION_MESSAGE}" >/dev/null 2>&1 || {
  echo "[COORDINATOR] WARNING: Redis publish failed. Workers must rely on file cache."
}

# 5. Cache results in Redis (1-hour TTL)
if [ -f "${RESULTS_FILE}" ]; then
  echo "[COORDINATOR] Caching results in Redis (TTL: 3600s)..."
  redis-cli SETEX "${REDIS_CHANNEL}:results" 3600 "$(cat "${RESULTS_FILE}")" >/dev/null 2>&1 || {
    echo "[COORDINATOR] WARNING: Redis cache failed. Workers will use file cache."
  }

  # Store metadata separately for quick access
  redis-cli SETEX "${REDIS_CHANNEL}:metadata" 3600 "${COMPLETION_MESSAGE}" >/dev/null 2>&1 || true
fi

# 6. Create worker-ready signal file (fallback for no Redis)
touch ".test-results-ready"

echo "[COORDINATOR] Test execution complete. Results cached for workers."
echo "[COORDINATOR] Workers can now safely read results without running tests."

# Return original test exit code
exit ${TEST_EXIT_CODE}
