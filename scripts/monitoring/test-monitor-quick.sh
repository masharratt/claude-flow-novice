#!/bin/bash
# Quick test to verify monitoring scripts work correctly

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="${SCRIPT_DIR}/../../reports/monitoring/test-quick"

echo "Quick Monitoring Test"
echo "====================="
echo ""

# Cleanup old test data
rm -rf "${TEST_DIR}"
mkdir -p "${TEST_DIR}"

# Start monitor
echo "Starting monitor for 10 seconds..."
"${SCRIPT_DIR}/resource-monitor.sh" "${TEST_DIR}" &
MONITOR_PID=$!

# Wait for monitor to initialize
sleep 2

# Let it collect some samples
sleep 8

# Stop monitor
echo "Stopping monitor..."
kill -TERM "${MONITOR_PID}" 2>/dev/null || true
wait "${MONITOR_PID}" 2>/dev/null || true

# Find CSV file
CSV_FILE=$(find "${TEST_DIR}" -name "resource-usage-*.csv" -type f | head -1)

if [ ! -f "${CSV_FILE}" ]; then
    echo "ERROR: CSV file not created"
    exit 1
fi

echo ""
echo "CSV created: ${CSV_FILE}"
echo "Sample count: $(tail -n +2 "${CSV_FILE}" | wc -l)"
echo ""

# Analyze
echo "Running analysis..."
"${SCRIPT_DIR}/analyze-resources.sh" "${CSV_FILE}"

echo ""
echo "✅ Monitoring test complete"
echo ""
echo "Files created:"
ls -lh "${TEST_DIR}"
