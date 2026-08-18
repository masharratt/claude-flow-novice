#!/usr/bin/env bash
# tests/perf/run-all-perf-tests.sh
# Phase 6 :: Master Performance Test Runner
#
# Executes all 4 performance optimization test suites:
# 1. Connection Pooling (3-5x throughput)
# 2. Query Optimization (10-20x speedup)
# 3. Docker Image Optimization (50% size reduction)
# 4. Agent Result Caching (80%+ hit rate)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

PERF_TEST_DIR="$PROJECT_ROOT/tests/perf"

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

run_test_suite() {
  local test_script=$1
  local test_name=$2

  log_section "Running: $test_name"

  if [[ ! -f "$test_script" ]]; then
    log_error "Test script not found: $test_script"
    ((FAILED_TESTS++))
    return 1
  fi

  if bash "$test_script"; then
    log_success "$test_name - PASSED"
    ((PASSED_TESTS++))
  else
    log_error "$test_name - FAILED"
    ((FAILED_TESTS++))
  fi

  ((TOTAL_TESTS++))
}

# Banner
log_section "Phase 6 Performance Optimization Test Suite"
echo ""
echo "Testing 4 performance optimizations:"
echo "  1. Connection Pooling (PostgreSQL + Redis)"
echo "  2. Query Optimization (Indexes + Materialized Views)"
echo "  3. Docker Image Optimization (Multi-stage builds)"
echo "  4. Agent Result Caching (Redis + Prometheus)"
echo ""

# Run test suites
run_test_suite "$PERF_TEST_DIR/test-connection-pooling.sh" "Connection Pooling Tests"
run_test_suite "$PERF_TEST_DIR/test-query-optimization.sh" "Query Optimization Tests"
run_test_suite "$PERF_TEST_DIR/test-docker-optimization.sh" "Docker Optimization Tests"
run_test_suite "$PERF_TEST_DIR/test-result-caching.sh" "Result Caching Tests"

# Summary
log_section "Performance Test Suite Summary"
echo ""
echo "Total Test Suites: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo ""

if [[ $FAILED_TESTS -eq 0 ]]; then
  log_success "ALL PERFORMANCE TESTS PASSED ✓"
  echo ""
  echo "Performance Targets:"
  echo "  ✓ Connection Pooling: 3-5x throughput improvement"
  echo "  ✓ Query Optimization: 10-20x query speedup"
  echo "  ✓ Docker Optimization: 50% image size reduction"
  echo "  ✓ Result Caching: 80%+ cache hit rate"
  exit 0
else
  log_error "SOME PERFORMANCE TESTS FAILED ✗"
  exit 1
fi
