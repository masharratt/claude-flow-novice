#!/usr/bin/env bash

##############################################################################
# ACE System - Index Integration Test
# Tests automatic index creation and query optimization
##############################################################################

set -euo pipefail

# Test environment
TEST_DB="/tmp/ace-index-test-$$.sqlite"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export ACE_MEMORY_PATH="$TEST_DB"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Cleanup
cleanup() {
  rm -f "$TEST_DB" "$TEST_DB-shm" "$TEST_DB-wal"
}
trap cleanup EXIT

echo "=========================================="
echo "ACE Index Integration Test Suite"
echo "=========================================="
echo ""

# Helper function to run a test
run_test() {
  local test_name="$1"
  local test_command="$2"

  TESTS_RUN=$((TESTS_RUN + 1))
  echo -n "Test $TESTS_RUN: $test_name... "

  if eval "$test_command" > /tmp/test-output-$$.txt 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}FAIL${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    cat /tmp/test-output-$$.txt
    return 1
  fi
}

##############################################################################
# Test 1: Database Initialization with Indexes
##############################################################################

test_db_init() {
  # Build project
  cd "$PROJECT_ROOT"
  npm run build > /dev/null 2>&1

  # Apply schema migration first
  ACE_DB_PATH="$TEST_DB" "$PROJECT_ROOT/.claude/skills/cfn-ace-system/schema/run-migration.sh" \
    --force > /dev/null 2>&1

  # Initialize ACE reflector (should create indexes automatically)
  node -e "
    import { ACEReflector } from './dist/ace/ace-reflector.js';
    const reflector = new ACEReflector('$TEST_DB');
    await reflector.initialize();
    console.log('Initialized');
  " > /tmp/ace-init.log 2>&1

  # Verify initialization message
  grep -q "Applied 6 performance indexes" /tmp/ace-init.log
}

run_test "Database initialization creates indexes" "test_db_init"

##############################################################################
# Test 2: Verify Index Existence
##############################################################################

test_index_existence() {
  # Query SQLite for indexes on context_reflections table
  local indexes=$(sqlite3 "$TEST_DB" "
    SELECT name FROM sqlite_master
    WHERE type='index'
    AND tbl_name='context_reflections'
    AND name NOT LIKE 'sqlite_%'
  ")

  # Check for expected indexes
  echo "$indexes" | grep -q "idx_reflections_tags" &&
  echo "$indexes" | grep -q "idx_reflections_domain" &&
  echo "$indexes" | grep -q "idx_reflections_confidence" &&
  echo "$indexes" | grep -q "idx_reflections_created_at" &&
  echo "$indexes" | grep -q "idx_reflections_domain_conf_date" &&
  echo "$indexes" | grep -q "idx_reflections_conf_date"
}

run_test "All 6 performance indexes exist" "test_index_existence"

##############################################################################
# Test 3: Index Stats Query
##############################################################################

test_index_stats_query() {
  # Query index stats using invoke-context-stats.sh
  local stats=$("$PROJECT_ROOT/.claude/skills/cfn-ace-system/invoke-context-stats.sh" \
    --show-indexes \
    --memory-path "$TEST_DB" 2>&1)

  # Verify stats output
  echo "$stats" | grep -q "totalIndexes" &&
  echo "$stats" | grep -q "idx_reflections_tags" &&
  echo "$stats" | grep -q "optimized"
}

run_test "Index stats query returns correct data" "test_index_stats_query"

##############################################################################
# Test 4: Query Plan Verification (Tag Search)
##############################################################################

test_query_plan_tags() {
  # Create test reflection with metadata
  cd "$PROJECT_ROOT"
  node -e "
    import { ACEReflector } from './dist/ace/ace-reflector.js';
    const reflector = new ACEReflector('$TEST_DB');
    await reflector.initialize();
    await reflector.reflect({
      task_id: 'test-1',
      swarm_id: 'test-swarm'
    });
  " > /dev/null 2>&1

  # Check EXPLAIN QUERY PLAN for tag search
  local plan=$(sqlite3 "$TEST_DB" "
    EXPLAIN QUERY PLAN
    SELECT * FROM context_reflections
    WHERE json_extract(metadata, '\$.tags') LIKE '%test%'
  ")

  # Verify index is used
  echo "$plan" | grep -q "idx_reflections_tags"
}

run_test "Tag search query uses idx_reflections_tags" "test_query_plan_tags"

##############################################################################
# Test 5: Query Plan Verification (Domain + Confidence)
##############################################################################

test_query_plan_domain_confidence() {
  # Check EXPLAIN QUERY PLAN for domain + confidence search
  local plan=$(sqlite3 "$TEST_DB" "
    EXPLAIN QUERY PLAN
    SELECT * FROM context_reflections
    WHERE json_extract(metadata, '\$.domain') = 'backend'
    AND confidence >= 0.80
    ORDER BY created_at DESC
  ")

  # Verify composite index is used
  echo "$plan" | grep -q "idx_reflections_domain_conf_date"
}

run_test "Domain+Confidence query uses composite index" "test_query_plan_domain_confidence"

##############################################################################
# Test 6: Query Plan Verification (Confidence + Recency)
##############################################################################

test_query_plan_confidence_recency() {
  # Check EXPLAIN QUERY PLAN for confidence + recency search
  local plan=$(sqlite3 "$TEST_DB" "
    EXPLAIN QUERY PLAN
    SELECT * FROM context_reflections
    WHERE confidence >= 0.90
    ORDER BY created_at DESC
  ")

  # Verify covering index is used
  echo "$plan" | grep -q "idx_reflections_conf_date"
}

run_test "Confidence+Recency query uses covering index" "test_query_plan_confidence_recency"

##############################################################################
# Test 7: Performance Benchmark (with indexes)
##############################################################################

test_performance_with_indexes() {
  # Create 100 test reflections
  cd "$PROJECT_ROOT"
  node -e "
    import { ACEReflector } from './dist/ace/ace-reflector.js';
    const reflector = new ACEReflector('$TEST_DB');
    await reflector.initialize();

    for (let i = 0; i < 100; i++) {
      await reflector.reflect({
        task_id: 'perf-test-' + i,
        swarm_id: 'perf-swarm',
        domain: i % 3 === 0 ? 'backend' : 'frontend'
      }, { complexity: Math.random() });
    }
  " > /dev/null 2>&1

  # Measure query time
  local start=$(date +%s%3N)
  sqlite3 "$TEST_DB" "
    SELECT * FROM context_reflections
    WHERE json_extract(metadata, '\$.domain') = 'backend'
    AND confidence >= 0.50
    ORDER BY created_at DESC
    LIMIT 10
  " > /dev/null
  local end=$(date +%s%3N)

  local duration=$((end - start))

  # Verify query completes in < 100ms (target from init-indexes.sql)
  [ "$duration" -lt 100 ]
}

run_test "Query completes in < 100ms with 100 reflections" "test_performance_with_indexes"

##############################################################################
# Test 8: Index Idempotency
##############################################################################

test_index_idempotency() {
  # Re-initialize ACE system (should not fail or duplicate indexes)
  cd "$PROJECT_ROOT"
  node -e "
    import { ACEReflector } from './dist/ace/ace-reflector.js';
    const reflector = new ACEReflector('$TEST_DB');
    await reflector.initialize();
  " > /tmp/ace-reinit.log 2>&1

  # Verify initialization succeeds
  grep -q "Applied 6 performance indexes" /tmp/ace-reinit.log

  # Verify no duplicate indexes
  local index_count=$(sqlite3 "$TEST_DB" "
    SELECT COUNT(*) FROM sqlite_master
    WHERE type='index'
    AND tbl_name='context_reflections'
    AND name LIKE 'idx_reflections_%'
  ")

  [ "$index_count" -eq 6 ]
}

run_test "Re-initialization is idempotent (no duplicate indexes)" "test_index_idempotency"

##############################################################################
# Test Results
##############################################################################

echo ""
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo "Tests Run:    $TESTS_RUN"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
