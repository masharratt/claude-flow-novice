#!/bin/bash
# Wrapper script to monitor a test execution
# Usage: ./monitor-test.sh <test_command>
# Example: ./monitor-test.sh "npm test -- tests/integration/100-agent-coordination.test.sh"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/../../monitoring-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create results directory
mkdir -p "${RESULTS_DIR}"

# Validate arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 <test_command>"
    echo ""
    echo "Examples:"
    echo "  $0 'npm test -- tests/integration/100-agent-coordination.test.sh'"
    echo "  $0 'bash tests/integration/100-agent-coordination.test.sh'"
    echo ""
    exit 1
fi

TEST_COMMAND="$*"

echo "========================================="
echo "RESOURCE MONITORING WRAPPER"
echo "========================================="
echo "Test Command: ${TEST_COMMAND}"
echo "Results Dir: ${RESULTS_DIR}"
echo "Timestamp: ${TIMESTAMP}"
echo ""

# Start resource monitor in background
echo "Starting resource monitor..."
"${SCRIPT_DIR}/resource-monitor.sh" "${RESULTS_DIR}" &
MONITOR_PID=$!

# Give monitor time to initialize
sleep 2

# Trap to ensure monitor cleanup
cleanup() {
    echo ""
    echo "Stopping resource monitor..."
    if kill -0 "${MONITOR_PID}" 2>/dev/null; then
        kill -TERM "${MONITOR_PID}" 2>/dev/null || true
        wait "${MONITOR_PID}" 2>/dev/null || true
    fi

    # Find the CSV file
    CSV_FILE=$(find "${RESULTS_DIR}" -name "resource-usage-${TIMESTAMP}.csv" -type f 2>/dev/null | head -1)

    if [ -n "${CSV_FILE}" ] && [ -f "${CSV_FILE}" ]; then
        echo ""
        echo "Analyzing results..."
        "${SCRIPT_DIR}/analyze-resources.sh" "${CSV_FILE}"
        echo ""
        echo "========================================="
        echo "MONITORING COMPLETE"
        echo "========================================="
        echo "CSV Data: ${CSV_FILE}"
        echo "Analysis: ${RESULTS_DIR}/analysis-report-*.txt"
        echo ""
    else
        echo "WARNING: No monitoring data found"
    fi
}

trap cleanup EXIT INT TERM

# Run the test command
echo "Running test command..."
echo "========================================="
echo ""

if eval "${TEST_COMMAND}"; then
    TEST_EXIT_CODE=0
    echo ""
    echo "Test PASSED"
else
    TEST_EXIT_CODE=$?
    echo ""
    echo "Test FAILED (exit code: ${TEST_EXIT_CODE})"
fi

echo ""
echo "Waiting for final metrics..."
sleep 3

exit ${TEST_EXIT_CODE}
