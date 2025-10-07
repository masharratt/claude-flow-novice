#!/bin/bash
# Sprint 0 Day 2: Quick Stability Test (1-hour dry run)
# Purpose: Validate stability test implementation before 8-hour run
# Duration: 1 hour (12 cycles at 5-minute intervals)

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "Sprint 0 Day 2: Quick Stability Test"
echo "=========================================="
echo "Running 1-hour dry run to validate test implementation"
echo "This will execute 12 coordination cycles at 5-minute intervals"
echo ""
echo "Full 8-hour test command:"
echo "  bash ${SCRIPT_DIR}/sprint0-day2-stability-test.sh"
echo ""
echo "Starting dry run..."
echo "=========================================="
echo ""

# Execute dry run
bash "${SCRIPT_DIR}/sprint0-day2-stability-test.sh" --dry-run

echo ""
echo "=========================================="
echo "Dry run complete!"
echo ""
echo "Next steps:"
echo "  1. Review metrics: ${SCRIPT_DIR}/stability-metrics.jsonl"
echo "  2. Review summary: ${SCRIPT_DIR}/stability-summary.json"
echo "  3. If dry run passes, execute full 8-hour test:"
echo "     bash ${SCRIPT_DIR}/sprint0-day2-stability-test.sh"
echo "=========================================="
