#!/bin/bash
# Store test benchmarks in SQLite
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DB_FILE="$PROJECT_ROOT/.artifacts/test-benchmarks.db"

# Parse arguments
SUITE=""
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
DURATION=0
COMMIT=""
BRANCH=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --suite) SUITE="$2"; shift 2 ;;
    --total) TOTAL="$2"; shift 2 ;;
    --passed) PASSED="$2"; shift 2 ;;
    --failed) FAILED="$2"; shift 2 ;;
    --skipped) SKIPPED="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SUCCESS_RATE=$(awk "BEGIN {printf \"%.4f\", ($PASSED / $TOTAL)}")

# Get or create suite ID
SUITE_ID=$(sqlite3 "$DB_FILE" "SELECT id FROM test_suites WHERE name='$SUITE'")
if [ -z "$SUITE_ID" ]; then
  sqlite3 "$DB_FILE" "INSERT INTO test_suites (name) VALUES ('$SUITE')"
  SUITE_ID=$(sqlite3 "$DB_FILE" "SELECT last_insert_rowid()")
fi

# Insert test run
sqlite3 "$DB_FILE" << EOFSQL
INSERT INTO test_runs (
  suite_id, git_commit, git_branch, 
  total_tests, passed, failed, skipped, 
  duration_seconds, success_rate
) VALUES (
  $SUITE_ID, '$COMMIT', '$BRANCH',
  $TOTAL, $PASSED, $FAILED, $SKIPPED,
  $DURATION, $SUCCESS_RATE
);
EOFSQL

echo "✅ Benchmark stored (run_id: $(sqlite3 "$DB_FILE" "SELECT last_insert_rowid()"))"
