#!/bin/bash
# Detect test regressions
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DB_FILE="$PROJECT_ROOT/.artifacts/test-benchmarks.db"

THRESHOLD=0.10

while [[ $# -gt 0 ]]; do
  case $1 in
    --threshold) THRESHOLD="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Get latest run
LATEST_RUN=$(sqlite3 "$DB_FILE" "SELECT id FROM test_runs ORDER BY run_timestamp DESC LIMIT 1")

if [ -z "$LATEST_RUN" ]; then
  echo "No test runs found"
  exit 0
fi

# Get baseline (average of last 10 runs excluding latest)
BASELINE_SUCCESS_RATE=$(sqlite3 "$DB_FILE" "
  SELECT AVG(success_rate) FROM (
    SELECT success_rate FROM test_runs 
    WHERE id != $LATEST_RUN 
    ORDER BY run_timestamp DESC 
    LIMIT 10
  )
")

LATEST_SUCCESS_RATE=$(sqlite3 "$DB_FILE" "SELECT success_rate FROM test_runs WHERE id = $LATEST_RUN")

# Check for regression
REGRESSION=$(awk "BEGIN {print ($BASELINE_SUCCESS_RATE - $LATEST_SUCCESS_RATE) > $THRESHOLD}")

if [ "$REGRESSION" = "1" ]; then
  DIFF=$(awk "BEGIN {printf \"%.1f\", ($BASELINE_SUCCESS_RATE - $LATEST_SUCCESS_RATE) * 100}")
  
  sqlite3 "$DB_FILE" << EOFSQL
INSERT INTO regression_alerts (run_id, alert_type, severity, message)
VALUES ($LATEST_RUN, 'success_rate_drop', 'warning', 
        'Success rate dropped ${DIFF}% (baseline: ${BASELINE_SUCCESS_RATE}, current: ${LATEST_SUCCESS_RATE})');
EOFSQL
  
  echo "⚠️  Regression detected: Success rate dropped ${DIFF}%"
  exit 1
fi

echo "✅ No regressions detected"
exit 0
