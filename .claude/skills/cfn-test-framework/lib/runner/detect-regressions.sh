#!/usr/bin/env bash
# Detect test regressions
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Two distinct anchors. CFN_ROOT is the shared CFN source tree (this repo) and is
# where the sqlite-params helper lives. PROJECT_DATA_ROOT is the invoking project,
# which owns .artifacts/. A BASH_SOURCE root must never be used for .artifacts/:
# it resolves into the CFN checkout that every project shares by symlink.
CFN_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
PROJECT_DATA_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"

# Load parameterized query library (SQL injection prevention)
source "$CFN_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

DB_FILE="$PROJECT_DATA_ROOT/.artifacts/test-benchmarks.db"

THRESHOLD=0.10

while [[ $# -gt 0 ]]; do
  case $1 in
    --threshold) THRESHOLD="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Get latest run
LATEST_RUN=$(sqlite_select "$DB_FILE" "SELECT id FROM test_runs ORDER BY run_timestamp DESC LIMIT 1")

if [ -z "$LATEST_RUN" ]; then
  echo "No test runs found"
  exit 0
fi

# Get baseline (average of last 10 runs excluding latest)
BASELINE_SUCCESS_RATE=$(sqlite_select "$DB_FILE" "
  SELECT AVG(success_rate) FROM (
    SELECT success_rate FROM test_runs
    WHERE id != ?1
    ORDER BY run_timestamp DESC
    LIMIT 10
  )
" "$LATEST_RUN")

LATEST_SUCCESS_RATE=$(sqlite_select "$DB_FILE" "SELECT success_rate FROM test_runs WHERE id = ?1" "$LATEST_RUN")

# Check for regression
REGRESSION=$(awk "BEGIN {print ($BASELINE_SUCCESS_RATE - $LATEST_SUCCESS_RATE) > $THRESHOLD}")

if [ "$REGRESSION" = "1" ]; then
  DIFF=$(awk "BEGIN {printf \"%.1f\", ($BASELINE_SUCCESS_RATE - $LATEST_SUCCESS_RATE) * 100}")
  MESSAGE="Success rate dropped ${DIFF}% (baseline: ${BASELINE_SUCCESS_RATE}, current: ${LATEST_SUCCESS_RATE})"

  sqlite_exec "$DB_FILE" \
    "INSERT INTO regression_alerts (run_id, alert_type, severity, message) VALUES (?1, ?2, ?3, ?4)" \
    "$LATEST_RUN" "success_rate_drop" "warning" "$MESSAGE"

  echo "⚠️  Regression detected: Success rate dropped ${DIFF}%"
  exit 1
fi

echo "✅ No regressions detected"
exit 0
