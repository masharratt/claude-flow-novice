#!/usr/bin/env bash
# test-cache-reader.sh
# Worker-pattern test result reader: ONLY read cached results, NEVER run tests

set -euo pipefail

SWARM_ID="${1:-swarm-default}"
AGENT_ID="${2:-worker-unknown}"
REDIS_CHANNEL="swarm:${SWARM_ID}:tests"
RESULTS_FILE="test-results.json"
TIMEOUT="${TEST_CACHE_TIMEOUT:-300}"  # 5 minutes default

echo "[WORKER:${AGENT_ID}] Waiting for coordinator test completion..."

# 1. Wait for coordinator test completion signal
ELAPSED=0
COMPLETE=false

while [ ${ELAPSED} -lt ${TIMEOUT} ]; do
  # Check Redis for completion signal
  if METADATA=$(redis-cli GET "${REDIS_CHANNEL}:metadata" 2>/dev/null); then
    if [ -n "${METADATA}" ] && [ "${METADATA}" != "(nil)" ]; then
      echo "[WORKER:${AGENT_ID}] Test completion signal received from Redis."
      COMPLETE=true
      break
    fi
  fi

  # Fallback: Check file system signal
  if [ -f ".test-results-ready" ] && [ -f "${RESULTS_FILE}" ]; then
    echo "[WORKER:${AGENT_ID}] Test completion signal received from file system."
    COMPLETE=true
    break
  fi

  # Wait and retry
  sleep 2
  ELAPSED=$((ELAPSED + 2))

  # Log progress every 30 seconds
  if [ $((ELAPSED % 30)) -eq 0 ]; then
    echo "[WORKER:${AGENT_ID}] Still waiting for test results... (${ELAPSED}s/${TIMEOUT}s)"
  fi
done

if [ "${COMPLETE}" = false ]; then
  echo "[WORKER:${AGENT_ID}] ERROR: Timeout waiting for test results after ${TIMEOUT}s" >&2
  echo "[WORKER:${AGENT_ID}] Coordinator may not have executed tests yet." >&2
  exit 1
fi

# 2. Read cached results (NEVER run tests)
echo "[WORKER:${AGENT_ID}] Reading cached test results..."

# Try Redis cache first (fastest)
if CACHED_RESULTS=$(redis-cli GET "${REDIS_CHANNEL}:results" 2>/dev/null); then
  if [ -n "${CACHED_RESULTS}" ] && [ "${CACHED_RESULTS}" != "(nil)" ]; then
    echo "[WORKER:${AGENT_ID}] Using Redis-cached results."
    echo "${CACHED_RESULTS}" > ".worker-${AGENT_ID}-results.json"
    RESULTS_SOURCE="redis"
  fi
fi

# Fallback to file cache
if [ ! -f ".worker-${AGENT_ID}-results.json" ] && [ -f "${RESULTS_FILE}" ]; then
  echo "[WORKER:${AGENT_ID}] Using file-cached results."
  cp "${RESULTS_FILE}" ".worker-${AGENT_ID}-results.json"
  RESULTS_SOURCE="file"
fi

# Verify results available
if [ ! -f ".worker-${AGENT_ID}-results.json" ]; then
  echo "[WORKER:${AGENT_ID}] ERROR: No cached results available" >&2
  exit 1
fi

WORKER_RESULTS_FILE=".worker-${AGENT_ID}-results.json"

# 3. Parse results for worker decision-making
TESTS_PASSED=$(jq -r '.numPassedTests // 0' "${WORKER_RESULTS_FILE}" 2>/dev/null || echo "0")
TESTS_FAILED=$(jq -r '.numFailedTests // 0' "${WORKER_RESULTS_FILE}" 2>/dev/null || echo "0")
TESTS_TOTAL=$(jq -r '.numTotalTests // 0' "${WORKER_RESULTS_FILE}" 2>/dev/null || echo "0")
COVERAGE_LINES=$(jq -r '.coverageMap.total.lines.pct // 0' "${WORKER_RESULTS_FILE}" 2>/dev/null || echo "0")
COVERAGE_BRANCHES=$(jq -r '.coverageMap.total.branches.pct // 0' "${WORKER_RESULTS_FILE}" 2>/dev/null || echo "0")

# 4. Output results summary
echo "[WORKER:${AGENT_ID}] =========================================="
echo "[WORKER:${AGENT_ID}] Test Results Summary (${RESULTS_SOURCE} cache)"
echo "[WORKER:${AGENT_ID}] =========================================="
echo "[WORKER:${AGENT_ID}] Tests:    ${TESTS_PASSED}/${TESTS_TOTAL} passed, ${TESTS_FAILED} failed"
echo "[WORKER:${AGENT_ID}] Coverage: ${COVERAGE_LINES}% lines, ${COVERAGE_BRANCHES}% branches"
echo "[WORKER:${AGENT_ID}] =========================================="

# 5. Store parsed results for worker consumption
cat > ".worker-${AGENT_ID}-summary.json" <<JSON
{
  "agent": "${AGENT_ID}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "${RESULTS_SOURCE}",
  "tests": {
    "passed": ${TESTS_PASSED},
    "failed": ${TESTS_FAILED},
    "total": ${TESTS_TOTAL}
  },
  "coverage": {
    "lines": ${COVERAGE_LINES},
    "branches": ${COVERAGE_BRANCHES}
  }
}
JSON

echo "[WORKER:${AGENT_ID}] Results cached to .worker-${AGENT_ID}-summary.json"

# 6. Signal worker read completion to coordinator
redis-cli LPUSH "${REDIS_CHANNEL}:workers:read" "$(cat <<JSON
{
  "agent": "${AGENT_ID}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "${RESULTS_SOURCE}"
}
JSON
)" >/dev/null 2>&1 || true

# 7. Return exit code based on test results
if [ "${TESTS_FAILED}" -eq 0 ] && [ "${TESTS_TOTAL}" -gt 0 ]; then
  echo "[WORKER:${AGENT_ID}] All tests passed. Worker can proceed."
  exit 0
elif [ "${TESTS_FAILED}" -gt 0 ]; then
  echo "[WORKER:${AGENT_ID}] WARNING: ${TESTS_FAILED} tests failed. Worker should address failures."
  exit 1
else
  echo "[WORKER:${AGENT_ID}] WARNING: No tests found. Worker should verify test execution."
  exit 2
fi
