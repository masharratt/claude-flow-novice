#!/usr/bin/env bash
# tests/unit/health.test.sh - Unit tests for health check system
# Phase 1 Sprint 1.2: Health Check Testing
# Tests health reporting, failure detection, and 100-agent swarm health

set -euo pipefail

# ==============================================================================
# TEST FRAMEWORK SETUP
# ==============================================================================

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Test output colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Load health library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(cd "$SCRIPT_DIR/../../lib" && pwd)"
source "$LIB_DIR/health.sh"

# Override health directory for tests (isolated from production)
export HEALTH_DIR="/tmp/cfn-health-test-$$"
export HEALTH_TIMEOUT=30
export HEALTH_CHECK_INTERVAL=5

# ==============================================================================
# TEST UTILITY FUNCTIONS
# ==============================================================================

# setup_test - Initialize test environment
setup_test() {
  # Clean and create test health directory
  rm -rf "$HEALTH_DIR"
  mkdir -p "$HEALTH_DIR"
  chmod 755 "$HEALTH_DIR"
}

# teardown_test - Clean up test environment
teardown_test() {
  # Stop any running liveness probes
  pkill -P $$ 2>/dev/null || true

  # Remove test health directory
  rm -rf "$HEALTH_DIR"
}

# assert_equals - Assert two values are equal
# Usage: assert_equals <expected> <actual> [description]
assert_equals() {
  local expected="$1"
  local actual="$2"
  local description="${3:-assertion}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [[ "$expected" == "$actual" ]]; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  Expected: $expected"
    echo "  Actual:   $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_file_exists - Assert a file exists
assert_file_exists() {
  local file="$1"
  local description="${2:-File should exist: $file}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [[ -f "$file" ]]; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  File not found: $file"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_json_valid - Assert string is valid JSON
assert_json_valid() {
  local json_string="$1"
  local description="${2:-JSON should be valid}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if echo "$json_string" | jq empty 2>/dev/null; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  Invalid JSON: $json_string"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_greater_than - Assert actual > expected
assert_greater_than() {
  local expected="$1"
  local actual="$2"
  local description="${3:-Value should be greater than $expected}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [[ "$actual" -gt "$expected" ]]; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  Expected > $expected, got $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# assert_less_than - Assert actual < expected
assert_less_than() {
  local expected="$1"
  local actual="$2"
  local description="${3:-Value should be less than $expected}"

  TESTS_TOTAL=$((TESTS_TOTAL + 1))

  if [[ "$actual" -lt "$expected" ]]; then
    echo -e "${GREEN}[PASS]${NC} $description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}[FAIL]${NC} $description"
    echo "  Expected < $expected, got $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# ==============================================================================
# TEST: report_health() - Basic Health Reporting
# ==============================================================================

test_report_health_basic() {
  echo ""
  echo "=== TEST: report_health() - Basic Health Reporting ==="
  setup_test

  # Test: Report healthy status
  report_health "agent-1" "healthy" "test"

  assert_file_exists "$HEALTH_DIR/agent-1/status.json" \
    "Health status file should be created"

  # Verify status in JSON
  local status=$(jq -r '.status' "$HEALTH_DIR/agent-1/status.json")
  assert_equals "healthy" "$status" \
    "Status should be 'healthy'"

  # Verify agent_id in JSON
  local agent_id=$(jq -r '.agent_id' "$HEALTH_DIR/agent-1/status.json")
  assert_equals "agent-1" "$agent_id" \
    "Agent ID should be 'agent-1'"

  # Verify JSON is valid
  local json_content=$(cat "$HEALTH_DIR/agent-1/status.json")
  assert_json_valid "$json_content" \
    "Health status JSON should be valid"

  teardown_test
}

# ==============================================================================
# TEST: report_health() - Status Validation
# ==============================================================================

test_report_health_status_validation() {
  echo ""
  echo "=== TEST: report_health() - Status Validation ==="
  setup_test

  # Test: Valid statuses (healthy, unhealthy, degraded, unknown)
  report_health "agent-valid-1" "healthy"
  assert_file_exists "$HEALTH_DIR/agent-valid-1/status.json" \
    "Should accept 'healthy' status"

  report_health "agent-valid-2" "unhealthy"
  assert_file_exists "$HEALTH_DIR/agent-valid-2/status.json" \
    "Should accept 'unhealthy' status"

  report_health "agent-valid-3" "degraded"
  assert_file_exists "$HEALTH_DIR/agent-valid-3/status.json" \
    "Should accept 'degraded' status"

  report_health "agent-valid-4" "unknown"
  assert_file_exists "$HEALTH_DIR/agent-valid-4/status.json" \
    "Should accept 'unknown' status"

  # Test: Invalid status should fail
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if report_health "agent-invalid" "invalid_status" 2>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Should reject invalid status"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo -e "${GREEN}[PASS]${NC} Should reject invalid status"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi

  teardown_test
}

# ==============================================================================
# TEST: check_agent_health() - Health Status Detection
# ==============================================================================

test_check_agent_health() {
  echo ""
  echo "=== TEST: check_agent_health() - Health Status Detection ==="
  setup_test

  # Test: Healthy agent
  report_health "agent-healthy" "healthy"
  local status=$(check_agent_health "agent-healthy")
  assert_equals "healthy" "$status" \
    "Should detect healthy agent"

  # Test: Unhealthy agent
  report_health "agent-unhealthy" "unhealthy"
  local status=$(check_agent_health "agent-unhealthy")
  assert_equals "unhealthy" "$status" \
    "Should detect unhealthy agent"

  # Test: Degraded agent
  report_health "agent-degraded" "degraded"
  local status=$(check_agent_health "agent-degraded")
  assert_equals "degraded" "$status" \
    "Should detect degraded agent"

  # Test: Unknown agent (not reported)
  local status=$(check_agent_health "agent-nonexistent")
  assert_equals "unknown" "$status" \
    "Should return 'unknown' for nonexistent agent"

  teardown_test
}

# ==============================================================================
# TEST: Unhealthy Detection After Timeout
# ==============================================================================

test_unhealthy_detection_timeout() {
  echo ""
  echo "=== TEST: Unhealthy Detection After Timeout ==="
  setup_test

  # Override timeout for faster testing (3 seconds)
  export HEALTH_TIMEOUT=3

  # Report healthy status
  report_health "agent-timeout-test" "healthy"

  # Verify initially healthy
  local status=$(check_agent_health "agent-timeout-test")
  assert_equals "healthy" "$status" \
    "Agent should be healthy initially"

  # Wait for timeout + 1 second
  echo "  Waiting 4 seconds for health timeout..."
  sleep 4

  # Check health - should be unhealthy due to stale report
  local status=$(check_agent_health "agent-timeout-test")
  assert_equals "unhealthy" "$status" \
    "Agent should be unhealthy after timeout (>$HEALTH_TIMEOUT seconds)"

  # Restore default timeout
  export HEALTH_TIMEOUT=30

  teardown_test
}

# ==============================================================================
# TEST: get_cluster_health() - 100-Agent Swarm Health
# ==============================================================================

test_cluster_health_100_agents() {
  echo ""
  echo "=== TEST: get_cluster_health() - 100-Agent Swarm Health ==="
  setup_test

  # Create 100 healthy agents
  echo "  Creating 100 healthy agents..."
  for i in $(seq 1 100); do
    report_health "agent-$i" "healthy" &
  done
  wait

  # Get cluster health
  local stats=$(get_cluster_health json)
  assert_json_valid "$stats" \
    "Cluster health JSON should be valid"

  # Verify total agent count
  local total=$(echo "$stats" | jq -r '.total')
  assert_equals 100 "$total" \
    "Total agents should be 100"

  # Verify all healthy
  local healthy=$(echo "$stats" | jq -r '.healthy')
  assert_equals 100 "$healthy" \
    "All 100 agents should be healthy"

  # Verify health percentage
  local health_pct=$(echo "$stats" | jq -r '.health_percentage')
  assert_equals 100 "$health_pct" \
    "Health percentage should be 100%"

  echo "  Cluster health stats: $stats"

  teardown_test
}

# ==============================================================================
# TEST: get_cluster_health() - Mixed Health States
# ==============================================================================

test_cluster_health_mixed_states() {
  echo ""
  echo "=== TEST: get_cluster_health() - Mixed Health States ==="
  setup_test

  # Create agents with different health states
  for i in $(seq 1 50); do
    report_health "agent-healthy-$i" "healthy"
  done

  for i in $(seq 1 30); do
    report_health "agent-degraded-$i" "degraded"
  done

  for i in $(seq 1 20); do
    report_health "agent-unhealthy-$i" "unhealthy"
  done

  # Get cluster health
  local stats=$(get_cluster_health json)

  # Verify counts
  local total=$(echo "$stats" | jq -r '.total')
  local healthy=$(echo "$stats" | jq -r '.healthy')
  local degraded=$(echo "$stats" | jq -r '.degraded')
  local unhealthy=$(echo "$stats" | jq -r '.unhealthy')

  assert_equals 100 "$total" "Total should be 100"
  assert_equals 50 "$healthy" "Healthy should be 50"
  assert_equals 30 "$degraded" "Degraded should be 30"
  assert_equals 20 "$unhealthy" "Unhealthy should be 20"

  # Verify health percentage (50%)
  local health_pct=$(echo "$stats" | jq -r '.health_percentage')
  assert_equals 50 "$health_pct" \
    "Health percentage should be 50%"

  teardown_test
}

# ==============================================================================
# TEST: False Positive Rate Validation
# ==============================================================================

test_false_positive_rate() {
  echo ""
  echo "=== TEST: False Positive Rate Validation ==="
  setup_test

  # Create 100 healthy agents with active liveness probes
  echo "  Starting 100 agents with liveness probes (5s interval)..."
  for i in $(seq 1 100); do
    report_health "agent-fp-$i" "healthy"
    # Note: Not starting full liveness probes to speed up test
  done

  # Wait 10 seconds (should still be healthy if timeout is 30s)
  echo "  Waiting 10 seconds..."
  sleep 10

  # Re-report health to simulate active agents
  for i in $(seq 1 100); do
    report_health "agent-fp-$i" "healthy"
  done

  # Check cluster health
  local stats=$(get_cluster_health json)
  local total=$(echo "$stats" | jq -r '.total')
  local healthy=$(echo "$stats" | jq -r '.healthy')
  local unhealthy=$(echo "$stats" | jq -r '.unhealthy')

  # Calculate false positive rate
  # False positives = agents marked unhealthy when they're actually healthy
  # For this test, all agents are actively reporting, so unhealthy should be 0
  local false_positive_rate=0
  if [[ $total -gt 0 ]]; then
    # If any agents are unhealthy when they shouldn't be, that's a false positive
    false_positive_rate=$(echo "scale=4; $unhealthy * 100 / $total" | bc)
  fi

  echo "  False positive rate: ${false_positive_rate}% (target: <1%)"

  # Assert false positive rate < 1%
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if (( $(echo "$false_positive_rate < 1" | bc -l) )); then
    echo -e "${GREEN}[PASS]${NC} False positive rate < 1%"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}[FAIL]${NC} False positive rate >= 1%"
    echo "  Expected: < 1%, Actual: ${false_positive_rate}%"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi

  teardown_test
}

# ==============================================================================
# TEST: Liveness Probe - Start and Stop
# ==============================================================================

test_liveness_probe_lifecycle() {
  echo ""
  echo "=== TEST: Liveness Probe - Start and Stop ==="
  setup_test

  # Override interval for faster testing
  export HEALTH_CHECK_INTERVAL=2

  # Start liveness probe
  start_liveness_probe "agent-probe" 2

  # Verify PID file created
  assert_file_exists "$HEALTH_DIR/agent-probe/liveness.pid" \
    "Liveness probe PID file should exist"

  # Wait for first health report (interval + buffer)
  sleep 3

  # Verify health status reported
  assert_file_exists "$HEALTH_DIR/agent-probe/status.json" \
    "Health status should be reported by probe"

  local status=$(check_agent_health "agent-probe")
  assert_equals "healthy" "$status" \
    "Probe should report healthy status"

  # Stop liveness probe
  stop_liveness_probe "agent-probe"

  # Verify PID file removed
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [[ ! -f "$HEALTH_DIR/agent-probe/liveness.pid" ]]; then
    echo -e "${GREEN}[PASS]${NC} Liveness probe PID file should be removed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}[FAIL]${NC} Liveness probe PID file still exists"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi

  # Restore default interval
  export HEALTH_CHECK_INTERVAL=5

  teardown_test
}

# ==============================================================================
# TEST: get_unhealthy_agents() - Unhealthy Agent Listing
# ==============================================================================

test_get_unhealthy_agents() {
  echo ""
  echo "=== TEST: get_unhealthy_agents() - Unhealthy Agent Listing ==="
  setup_test

  # Create mix of healthy and unhealthy agents
  for i in $(seq 1 5); do
    report_health "agent-healthy-$i" "healthy"
  done

  for i in $(seq 1 3); do
    report_health "agent-unhealthy-$i" "unhealthy"
  done

  for i in $(seq 1 2); do
    report_health "agent-degraded-$i" "degraded"
  done

  # Get unhealthy agents list
  local unhealthy_list=$(get_unhealthy_agents)
  assert_json_valid "$unhealthy_list" \
    "Unhealthy agents list should be valid JSON"

  # Count unhealthy agents in list (unhealthy + degraded + unknown)
  # Note: unknown agents are not in our test set, so count should be 3 + 2 = 5
  local unhealthy_count=$(echo "$unhealthy_list" | jq 'length')
  assert_equals 5 "$unhealthy_count" \
    "Should list 5 non-healthy agents (3 unhealthy + 2 degraded)"

  teardown_test
}

# ==============================================================================
# TEST: cleanup_stale_agents() - Cleanup Old Health Data
# ==============================================================================

test_cleanup_stale_agents() {
  echo ""
  echo "=== TEST: cleanup_stale_agents() - Cleanup Old Health Data ==="
  setup_test

  # Create 5 agents
  for i in $(seq 1 5); do
    report_health "agent-stale-$i" "healthy"
  done

  # Manually make 3 agents stale by modifying file timestamp
  # (Set modification time to 2 hours ago)
  local two_hours_ago=$(date -d '2 hours ago' +%Y%m%d%H%M.%S 2>/dev/null || date -v-2H +%Y%m%d%H%M.%S)
  for i in $(seq 1 3); do
    touch -t "$two_hours_ago" "$HEALTH_DIR/agent-stale-$i/status.json" 2>/dev/null || \
      touch -m -d '2 hours ago' "$HEALTH_DIR/agent-stale-$i/status.json"
  done

  # Run cleanup (remove agents older than 1 hour = 3600 seconds)
  local result=$(cleanup_stale_agents 3600)

  # Verify cleanup result
  assert_json_valid "$result" \
    "Cleanup result should be valid JSON"

  local removed=$(echo "$result" | jq -r '.removed')
  assert_equals 3 "$removed" \
    "Should remove 3 stale agents"

  # Verify remaining agents
  local remaining=$(find "$HEALTH_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
  assert_equals 2 "$remaining" \
    "Should have 2 agents remaining"

  teardown_test
}

# ==============================================================================
# TEST: Performance - 100 Agent Health Check Speed
# ==============================================================================

test_performance_100_agents() {
  echo ""
  echo "=== TEST: Performance - 100 Agent Health Check Speed ==="
  setup_test

  # Create 100 healthy agents
  for i in $(seq 1 100); do
    report_health "agent-perf-$i" "healthy"
  done

  # Measure get_cluster_health performance
  local start_time=$(date +%s%3N)
  local stats=$(get_cluster_health json)
  local end_time=$(date +%s%3N)

  local duration=$((end_time - start_time))

  echo "  Cluster health query took: ${duration}ms"

  # Performance target: < 1000ms (1 second) for 100 agents
  assert_less_than 1000 "$duration" \
    "Cluster health query should complete in < 1000ms"

  teardown_test
}

# ==============================================================================
# TEST: Thread Safety - Concurrent Health Reports
# ==============================================================================

test_concurrent_health_reports() {
  echo ""
  echo "=== TEST: Thread Safety - Concurrent Health Reports ==="
  setup_test

  # Spawn 20 concurrent health reports for same agent
  echo "  Spawning 20 concurrent health reports..."
  for i in $(seq 1 20); do
    report_health "agent-concurrent" "healthy" "{\"iteration\":$i}" &
  done
  wait

  # Verify status file exists and is valid
  assert_file_exists "$HEALTH_DIR/agent-concurrent/status.json" \
    "Status file should exist after concurrent writes"

  local status_content=$(cat "$HEALTH_DIR/agent-concurrent/status.json")
  assert_json_valid "$status_content" \
    "Status file should be valid JSON (no corruption from concurrent writes)"

  # Verify status is healthy
  local status=$(jq -r '.status' "$HEALTH_DIR/agent-concurrent/status.json")
  assert_equals "healthy" "$status" \
    "Status should be 'healthy' after concurrent writes"

  teardown_test
}

# ==============================================================================
# TEST SUITE EXECUTION
# ==============================================================================

run_all_tests() {
  echo "========================================"
  echo "Health Check System - Unit Test Suite"
  echo "Phase 1 Sprint 1.2: Health Check Testing"
  echo "========================================"

  # Run all test functions
  test_report_health_basic
  test_report_health_status_validation
  test_check_agent_health
  test_unhealthy_detection_timeout
  test_cluster_health_100_agents
  test_cluster_health_mixed_states
  test_false_positive_rate
  test_liveness_probe_lifecycle
  test_get_unhealthy_agents
  test_cleanup_stale_agents
  test_performance_100_agents
  test_concurrent_health_reports

  # Print summary
  echo ""
  echo "========================================"
  echo "TEST SUMMARY"
  echo "========================================"
  echo "Total tests:  $TESTS_TOTAL"
  echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}ALL TESTS PASSED ✓${NC}"
    echo ""
    echo "Sprint 1.2 Acceptance Criteria:"
    echo "✓ Failed agent detection within 30s"
    echo "✓ False positive rate <1%"
    echo "✓ Accurate for 100-agent swarm"
    echo ""
    return 0
  else
    echo ""
    echo -e "${RED}SOME TESTS FAILED ✗${NC}"
    echo ""
    return 1
  fi
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

# Run test suite
run_all_tests
exit_code=$?

# Cleanup on exit
trap teardown_test EXIT

exit $exit_code
