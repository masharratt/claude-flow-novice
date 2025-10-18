#!/usr/bin/env bash
# tests/cli-coordination/test-health.sh - Unit tests for health check system
# Phase 1 Sprint 1.2: Health Checks & Liveness

set -euo pipefail

# Test configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(cd "$TEST_DIR/../../lib" && pwd)"
TEST_HEALTH_DIR="/tmp/test-cfn-health-$$"
TEST_LOCK_FILE="/tmp/test-cfn-health-$$.lock"

# Override health directory for tests
export HEALTH_DIR="$TEST_HEALTH_DIR"
export HEALTH_LOCK_FILE="$TEST_LOCK_FILE"
export HEALTH_TIMEOUT=5  # Shorter timeout for tests
export HEALTH_CHECK_INTERVAL=2

# Load health library
source "$LIB_DIR/health.sh"

# Test utilities
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Color output (optional, disable if not supported)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_test() {
  echo -e "${YELLOW}[TEST]${NC} $*"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $*"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $*"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local message="${3:-}"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ "$expected" == "$actual" ]]; then
    log_pass "$message (expected=$expected, actual=$actual)"
    return 0
  else
    log_fail "$message (expected=$expected, actual=$actual)"
    return 1
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="${3:-}"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ "$haystack" == *"$needle"* ]]; then
    log_pass "$message (found '$needle')"
    return 0
  else
    log_fail "$message (did not find '$needle' in '$haystack')"
    return 1
  fi
}

assert_exit_code() {
  local expected_code="$1"
  local actual_code="$2"
  local message="${3:-}"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ "$expected_code" -eq "$actual_code" ]]; then
    log_pass "$message (exit code=$actual_code)"
    return 0
  else
    log_fail "$message (expected exit=$expected_code, actual exit=$actual_code)"
    return 1
  fi
}

assert_file_exists() {
  local file="$1"
  local message="${2:-File should exist: $file}"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ -f "$file" ]]; then
    log_pass "$message"
    return 0
  else
    log_fail "$message"
    return 1
  fi
}

assert_json_valid() {
  local json_string="$1"
  local message="${2:-JSON should be valid}"

  TESTS_RUN=$((TESTS_RUN + 1))

  if echo "$json_string" | jq empty 2>/dev/null; then
    log_pass "$message"
    return 0
  else
    log_fail "$message (invalid JSON: $json_string)"
    return 1
  fi
}

# Setup and teardown
setup() {
  rm -rf "$TEST_HEALTH_DIR"
  mkdir -p "$TEST_HEALTH_DIR"
  echo "[SETUP] Created test health directory: $TEST_HEALTH_DIR"
}

teardown() {
  # Stop any running liveness probes
  pkill -f "liveness.pid" 2>/dev/null || true
  rm -rf "$TEST_HEALTH_DIR"
  rm -f "$TEST_LOCK_FILE"
  echo "[TEARDOWN] Cleaned up test environment"
}

# ==============================================================================
# TEST SUITE 1: Basic Health Reporting
# ==============================================================================

test_report_health_basic() {
  log_test "Test 1.1: report_health basic functionality"

  local agent_id="test-agent-1"
  report_health "$agent_id" "healthy" >/dev/null 2>&1
  local exit_code=$?

  assert_exit_code 0 "$exit_code" "report_health should succeed"
  assert_file_exists "$TEST_HEALTH_DIR/$agent_id/status.json" "Status file should be created"

  # Verify JSON structure
  local status_json=$(cat "$TEST_HEALTH_DIR/$agent_id/status.json")
  assert_json_valid "$status_json" "Status JSON should be valid"

  # Check required fields
  local agent_id_field=$(echo "$status_json" | jq -r '.agent_id')
  assert_equals "$agent_id" "$agent_id_field" "agent_id field should match"

  local status_field=$(echo "$status_json" | jq -r '.status')
  assert_equals "healthy" "$status_field" "status field should be 'healthy'"
}

test_report_health_all_statuses() {
  log_test "Test 1.2: report_health with all status values"

  local statuses=("healthy" "unhealthy" "degraded" "unknown")

  for status in "${statuses[@]}"; do
    local agent_id="test-agent-status-$status"
    report_health "$agent_id" "$status" >/dev/null 2>&1
    local exit_code=$?

    assert_exit_code 0 "$exit_code" "report_health with status '$status' should succeed"

    local status_json=$(cat "$TEST_HEALTH_DIR/$agent_id/status.json")
    local status_field=$(echo "$status_json" | jq -r '.status')
    assert_equals "$status" "$status_field" "Status should be '$status'"
  done
}

test_report_health_with_details() {
  log_test "Test 1.3: report_health with JSON details"

  local agent_id="test-agent-details"
  local details='{"queue_depth":10,"last_task":"completed","memory_mb":256}'

  report_health "$agent_id" "healthy" "$details" >/dev/null 2>&1
  local exit_code=$?

  assert_exit_code 0 "$exit_code" "report_health with details should succeed"

  local status_json=$(cat "$TEST_HEALTH_DIR/$agent_id/status.json")
  local queue_depth=$(echo "$status_json" | jq -r '.details.queue_depth')
  assert_equals "10" "$queue_depth" "Details should be preserved in JSON"
}

test_report_health_invalid_status() {
  log_test "Test 1.4: report_health rejects invalid status"

  local agent_id="test-agent-invalid"
  report_health "$agent_id" "invalid-status" >/dev/null 2>&1
  local exit_code=$?

  assert_exit_code 1 "$exit_code" "report_health should reject invalid status"
}

test_report_health_missing_agent_id() {
  log_test "Test 1.5: report_health requires agent_id"

  report_health "" "healthy" >/dev/null 2>&1
  local exit_code=$?

  assert_exit_code 1 "$exit_code" "report_health should fail without agent_id"
}

# ==============================================================================
# TEST SUITE 2: Health Checking
# ==============================================================================

test_check_agent_health_healthy() {
  log_test "Test 2.1: check_agent_health for healthy agent"

  local agent_id="test-agent-check-healthy"
  report_health "$agent_id" "healthy" >/dev/null 2>&1

  local status
  status=$(check_agent_health "$agent_id")
  local exit_code=$?

  assert_exit_code 0 "$exit_code" "check_agent_health should return 0 for healthy agent"
  assert_equals "healthy" "$status" "Status should be 'healthy'"
}

test_check_agent_health_unhealthy() {
  log_test "Test 2.2: check_agent_health for unhealthy agent"

  local agent_id="test-agent-check-unhealthy"
  report_health "$agent_id" "unhealthy" >/dev/null 2>&1

  local status
  status=$(check_agent_health "$agent_id")
  local exit_code=$?

  assert_exit_code 1 "$exit_code" "check_agent_health should return 1 for unhealthy agent"
  assert_equals "unhealthy" "$status" "Status should be 'unhealthy'"
}

test_check_agent_health_degraded() {
  log_test "Test 2.3: check_agent_health for degraded agent"

  local agent_id="test-agent-check-degraded"
  report_health "$agent_id" "degraded" >/dev/null 2>&1

  local status
  status=$(check_agent_health "$agent_id")
  local exit_code=$?

  assert_exit_code 2 "$exit_code" "check_agent_health should return 2 for degraded agent"
  assert_equals "degraded" "$status" "Status should be 'degraded'"
}

test_check_agent_health_timeout() {
  log_test "Test 2.4: check_agent_health detects stale health data"

  local agent_id="test-agent-timeout"
  report_health "$agent_id" "healthy" >/dev/null 2>&1

  # Modify timestamp to simulate stale data
  local status_file="$TEST_HEALTH_DIR/$agent_id/status.json"
  touch -d "10 seconds ago" "$status_file"

  local status
  status=$(check_agent_health "$agent_id")
  local exit_code=$?

  assert_exit_code 1 "$exit_code" "Stale health data should be detected"
  assert_equals "unhealthy" "$status" "Stale agent should be marked unhealthy"
}

test_check_agent_health_nonexistent() {
  log_test "Test 2.5: check_agent_health for non-existent agent"

  local status
  status=$(check_agent_health "nonexistent-agent")
  local exit_code=$?

  assert_exit_code 1 "$exit_code" "Non-existent agent should return 1"
  assert_equals "unknown" "$status" "Non-existent agent should return 'unknown'"
}

# ==============================================================================
# TEST SUITE 3: Cluster Health
# ==============================================================================

test_get_cluster_health_empty() {
  log_test "Test 3.1: get_cluster_health with no agents"

  local cluster_health
  cluster_health=$(get_cluster_health json)

  assert_json_valid "$cluster_health" "Cluster health JSON should be valid"

  local total=$(echo "$cluster_health" | jq -r '.total')
  assert_equals "0" "$total" "Total agents should be 0"
}

test_get_cluster_health_multiple_agents() {
  log_test "Test 3.2: get_cluster_health with multiple agents"

  # Create agents with different statuses
  report_health "agent-1" "healthy" >/dev/null 2>&1
  report_health "agent-2" "healthy" >/dev/null 2>&1
  report_health "agent-3" "degraded" >/dev/null 2>&1
  report_health "agent-4" "unhealthy" >/dev/null 2>&1

  local cluster_health
  cluster_health=$(get_cluster_health json)

  assert_json_valid "$cluster_health" "Cluster health JSON should be valid"

  local total=$(echo "$cluster_health" | jq -r '.total')
  assert_equals "4" "$total" "Total agents should be 4"

  local healthy=$(echo "$cluster_health" | jq -r '.healthy')
  assert_equals "2" "$healthy" "Healthy agents should be 2"

  local degraded=$(echo "$cluster_health" | jq -r '.degraded')
  assert_equals "1" "$degraded" "Degraded agents should be 1"

  local unhealthy=$(echo "$cluster_health" | jq -r '.unhealthy')
  assert_equals "1" "$unhealthy" "Unhealthy agents should be 1"

  local health_pct=$(echo "$cluster_health" | jq -r '.health_percentage')
  assert_equals "50" "$health_pct" "Health percentage should be 50"
}

test_get_cluster_health_summary_format() {
  log_test "Test 3.3: get_cluster_health with summary format"

  report_health "agent-summary-1" "healthy" >/dev/null 2>&1
  report_health "agent-summary-2" "unhealthy" >/dev/null 2>&1

  local summary
  summary=$(get_cluster_health summary)

  assert_contains "$summary" "Cluster Health" "Summary should contain 'Cluster Health'"
  assert_contains "$summary" "Healthy:" "Summary should contain 'Healthy:'"
}

# ==============================================================================
# TEST SUITE 4: Unhealthy Agents Listing
# ==============================================================================

test_get_unhealthy_agents_none() {
  log_test "Test 4.1: get_unhealthy_agents with all healthy"

  report_health "healthy-agent-1" "healthy" >/dev/null 2>&1
  report_health "healthy-agent-2" "healthy" >/dev/null 2>&1

  local unhealthy_list
  unhealthy_list=$(get_unhealthy_agents)

  assert_json_valid "$unhealthy_list" "Unhealthy agents JSON should be valid"

  local count=$(echo "$unhealthy_list" | jq '. | length')
  assert_equals "0" "$count" "Should have 0 unhealthy agents"
}

test_get_unhealthy_agents_some() {
  log_test "Test 4.2: get_unhealthy_agents with mixed health"

  report_health "healthy-agent" "healthy" >/dev/null 2>&1
  report_health "unhealthy-agent-1" "unhealthy" >/dev/null 2>&1
  report_health "degraded-agent-1" "degraded" >/dev/null 2>&1

  local unhealthy_list
  unhealthy_list=$(get_unhealthy_agents)

  assert_json_valid "$unhealthy_list" "Unhealthy agents JSON should be valid"

  local count=$(echo "$unhealthy_list" | jq '. | length')
  assert_equals "2" "$count" "Should have 2 unhealthy/degraded agents"
}

# ==============================================================================
# TEST SUITE 5: Liveness Probes
# ==============================================================================

test_start_liveness_probe() {
  log_test "Test 5.1: start_liveness_probe creates background process"

  local agent_id="liveness-test-1"
  start_liveness_probe "$agent_id" 2 >/dev/null 2>&1

  local pid_file="$TEST_HEALTH_DIR/$agent_id/liveness.pid"
  assert_file_exists "$pid_file" "Liveness PID file should be created"

  # Check process is running
  local probe_pid=$(cat "$pid_file")
  if kill -0 "$probe_pid" 2>/dev/null; then
    log_pass "Liveness probe process is running (PID $probe_pid)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_fail "Liveness probe process not running"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  TESTS_RUN=$((TESTS_RUN + 1))

  # Stop probe
  stop_liveness_probe "$agent_id" >/dev/null 2>&1
}

test_stop_liveness_probe() {
  log_test "Test 5.2: stop_liveness_probe terminates background process"

  local agent_id="liveness-test-2"
  start_liveness_probe "$agent_id" 2 >/dev/null 2>&1

  local pid_file="$TEST_HEALTH_DIR/$agent_id/liveness.pid"
  local probe_pid=$(cat "$pid_file")

  stop_liveness_probe "$agent_id" >/dev/null 2>&1

  sleep 1

  if ! kill -0 "$probe_pid" 2>/dev/null; then
    log_pass "Liveness probe process terminated"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_fail "Liveness probe process still running"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    kill "$probe_pid" 2>/dev/null || true
  fi
  TESTS_RUN=$((TESTS_RUN + 1))
}

test_liveness_probe_reports_health() {
  log_test "Test 5.3: liveness probe reports health periodically"

  local agent_id="liveness-test-3"
  start_liveness_probe "$agent_id" 1 >/dev/null 2>&1

  # Wait for at least 2 health reports
  sleep 2

  local status
  status=$(check_agent_health "$agent_id")

  assert_equals "healthy" "$status" "Liveness probe should report healthy status"

  stop_liveness_probe "$agent_id" >/dev/null 2>&1
}

# ==============================================================================
# TEST SUITE 6: Cleanup Functions
# ==============================================================================

test_cleanup_stale_agents() {
  log_test "Test 6.1: cleanup_stale_agents removes old agents"

  # Create fresh agent
  report_health "fresh-agent" "healthy" >/dev/null 2>&1

  # Create stale agent
  report_health "stale-agent" "healthy" >/dev/null 2>&1
  local stale_file="$TEST_HEALTH_DIR/stale-agent/status.json"
  touch -d "2 hours ago" "$stale_file"

  # Cleanup agents older than 1 hour
  local result
  result=$(cleanup_stale_agents 3600)

  assert_json_valid "$result" "Cleanup result should be valid JSON"

  local removed=$(echo "$result" | jq -r '.removed')
  assert_equals "1" "$removed" "Should remove 1 stale agent"

  # Verify stale agent removed, fresh agent remains
  if [[ ! -d "$TEST_HEALTH_DIR/stale-agent" ]]; then
    log_pass "Stale agent directory removed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_fail "Stale agent directory still exists"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ -d "$TEST_HEALTH_DIR/fresh-agent" ]]; then
    log_pass "Fresh agent directory preserved"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_fail "Fresh agent directory removed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  TESTS_RUN=$((TESTS_RUN + 1))
}

test_cleanup_all_health_data() {
  log_test "Test 6.2: cleanup_all_health_data removes all agents"

  report_health "agent-cleanup-1" "healthy" >/dev/null 2>&1
  report_health "agent-cleanup-2" "healthy" >/dev/null 2>&1

  cleanup_all_health_data >/dev/null 2>&1

  local agent_count=$(find "$TEST_HEALTH_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
  assert_equals "0" "$agent_count" "All agent directories should be removed"
}

# ==============================================================================
# TEST SUITE 7: Thread Safety
# ==============================================================================

test_concurrent_health_reports() {
  log_test "Test 7.1: concurrent report_health calls (thread safety)"

  local agent_id="concurrent-test"

  # Spawn 10 concurrent health reports
  for i in {1..10}; do
    report_health "$agent_id" "healthy" "{\"iteration\":$i}" >/dev/null 2>&1 &
  done

  wait

  # Verify status file is valid JSON (not corrupted)
  local status_file="$TEST_HEALTH_DIR/$agent_id/status.json"
  assert_file_exists "$status_file" "Status file should exist after concurrent writes"

  local status_json=$(cat "$status_file")
  assert_json_valid "$status_json" "Status JSON should be valid after concurrent writes"
}

# ==============================================================================
# TEST SUITE 8: Performance
# ==============================================================================

test_performance_100_agents() {
  log_test "Test 8.1: Performance with 100 agents (acceptance criteria)"

  local start_time=$(date +%s%3N)

  # Create 100 agents
  for i in {1..100}; do
    report_health "perf-agent-$i" "healthy" >/dev/null 2>&1
  done

  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  echo "[INFO] Created 100 agents in ${duration}ms"

  # Check cluster health performance
  local check_start=$(date +%s%3N)
  local cluster_health
  cluster_health=$(get_cluster_health json)
  local check_end=$(date +%s%3N)
  local check_duration=$((check_end - check_start))

  echo "[INFO] get_cluster_health completed in ${check_duration}ms"

  # Acceptance criteria: Should detect unhealthy agents within 30s
  # For 100 agents, health check should complete in <5s
  if [[ $check_duration -lt 5000 ]]; then
    log_pass "Health check performance acceptable (<5s for 100 agents)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_fail "Health check too slow (${check_duration}ms for 100 agents)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  TESTS_RUN=$((TESTS_RUN + 1))

  local total=$(echo "$cluster_health" | jq -r '.total')
  assert_equals "100" "$total" "Should track 100 agents"
}

# ==============================================================================
# MAIN TEST EXECUTION
# ==============================================================================

main() {
  echo "=========================================="
  echo "Health Check System - Unit Tests"
  echo "=========================================="
  echo ""

  setup

  # Run test suites
  echo "=== Suite 1: Basic Health Reporting ==="
  test_report_health_basic
  test_report_health_all_statuses
  test_report_health_with_details
  test_report_health_invalid_status
  test_report_health_missing_agent_id
  echo ""

  echo "=== Suite 2: Health Checking ==="
  test_check_agent_health_healthy
  test_check_agent_health_unhealthy
  test_check_agent_health_degraded
  test_check_agent_health_timeout
  test_check_agent_health_nonexistent
  echo ""

  echo "=== Suite 3: Cluster Health ==="
  test_get_cluster_health_empty
  test_get_cluster_health_multiple_agents
  test_get_cluster_health_summary_format
  echo ""

  echo "=== Suite 4: Unhealthy Agents Listing ==="
  test_get_unhealthy_agents_none
  test_get_unhealthy_agents_some
  echo ""

  echo "=== Suite 5: Liveness Probes ==="
  test_start_liveness_probe
  test_stop_liveness_probe
  test_liveness_probe_reports_health
  echo ""

  echo "=== Suite 6: Cleanup Functions ==="
  test_cleanup_stale_agents
  test_cleanup_all_health_data
  echo ""

  echo "=== Suite 7: Thread Safety ==="
  test_concurrent_health_reports
  echo ""

  echo "=== Suite 8: Performance ==="
  test_performance_100_agents
  echo ""

  teardown

  # Test summary
  echo "=========================================="
  echo "TEST SUMMARY"
  echo "=========================================="
  echo "Tests Run:    $TESTS_RUN"
  echo "Tests Passed: $TESTS_PASSED"
  echo "Tests Failed: $TESTS_FAILED"
  echo ""

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}ALL TESTS PASSED${NC}"
    exit 0
  else
    echo -e "${RED}SOME TESTS FAILED${NC}"
    exit 1
  fi
}

# Run tests
main "$@"
