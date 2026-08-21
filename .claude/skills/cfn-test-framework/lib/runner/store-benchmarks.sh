#!/usr/bin/env bash
# Store test benchmarks in SQLite
# SECURITY: Uses Pattern B parameterized queries to prevent SQL injection
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Two distinct anchors. CFN_ROOT is the shared CFN source tree (this repo) and is
# where the sqlite-params helper lives. PROJECT_DATA_ROOT is the invoking project,
# which owns .artifacts/. A BASH_SOURCE root must never be used for .artifacts/:
# it resolves into the CFN checkout that every project shares by symlink.
CFN_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
PROJECT_DATA_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
# Allow DB_FILE override for testing (security: prevents modification of production DB during tests)
DB_FILE="${DB_FILE:-$PROJECT_DATA_ROOT/.artifacts/test-benchmarks.db}"

# Source sqlite parameter binding library
source "$CFN_ROOT/.claude/shared-lib/bootstrap/sqlite-params.sh"

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

# Get or create suite ID using parameterized query (Pattern B)
SUITE_ID=$(sqlite_select "$DB_FILE" "SELECT id FROM test_suites WHERE name = ?1" "$SUITE")
if [ -z "$SUITE_ID" ]; then
  sqlite_insert "$DB_FILE" "INSERT INTO test_suites (name) VALUES (?1)" "$SUITE"
  SUITE_ID=$(sqlite_select "$DB_FILE" "SELECT last_insert_rowid()")
fi

# Insert test run using parameterized query (Pattern B)
sqlite_insert "$DB_FILE" \
  "INSERT INTO test_runs (suite_id, git_commit, git_branch, total_tests, passed, failed, skipped, duration_seconds, success_rate) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)" \
  "$SUITE_ID" "$COMMIT" "$BRANCH" "$TOTAL" "$PASSED" "$FAILED" "$SKIPPED" "$DURATION" "$SUCCESS_RATE"

RUN_ID=$(sqlite_select "$DB_FILE" "SELECT last_insert_rowid()")
echo "✅ Benchmark stored (run_id: $RUN_ID)"
