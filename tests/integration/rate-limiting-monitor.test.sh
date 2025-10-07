#!/usr/bin/env bash
# tests/integration/rate-limiting-monitor.test.sh - Rate limiting monitor integration tests
# Phase 1 Sprint 1.5: Validate metrics collection and alerting

set -euo pipefail

# ==============================================================================
# TEST SETUP
# ==============================================================================

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
SCRIPT_PATH="$PROJECT_ROOT/scripts/monitoring/rate-limiting-monitor.sh"

# Test environment
export CFN_BASE_DIR="/tmp/cfn-test-$$"
export METRICS_FILE="/tmp/cfn-test-metrics-$$.jsonl"
export ALERT_LOG_FILE="/tmp/cfn-test-alerts-$$.jsonl"
export MONITOR_PID_FILE="/tmp/rate-limiting-monitor-$$.pid"
export CHECK_INTERVAL=2
export MAX_INBOX_SIZE=100
export INBOX_CRITICAL_PCT=90
export INBOX_WARNING_PCT=75

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ==============================================================================
# TEST HELPERS
# ==============================================================================

setup_test() {
  # Create test directories
  mkdir -p "$CFN_BASE_DIR/inbox"

  # Clear test files
  rm -f "$METRICS_FILE" "$ALERT_LOG_FILE" "$MONITOR_PID_FILE"

  echo "[TEST] Test environment initialized" >&2
}

teardown_test() {
  # Stop any running monitor
  if [ -f "$MONITOR_PID_FILE" ]; then
    local pid
    pid=$(cat "$MONITOR_PID_FILE")
    kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    kill -KILL "$pid" 2>/dev/null || true
  fi

  # Cleanup test files
  rm -rf "$CFN_BASE_DIR"
  rm -f "$METRICS_FILE" "$ALERT_LOG_FILE" "$MONITOR_PID_FILE"

  echo "[TEST] Test environment cleaned up" >&2
}

assert_true() {
  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$1" = "0" ]; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo "  ✅ PASS: $2"
    return 0
  else
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo "  ❌ FAIL: $2"
    return 1
  fi
}

assert_file_exists() {
  TESTS_RUN=$((TESTS_RUN + 1))

  if [ -f "$1" ]; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo "  ✅ PASS: File exists: $1"
    return 0
  else
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo "  ❌ FAIL: File not found: $1"
    return 1
  fi
}

assert_contains() {
  TESTS_RUN=$((TESTS_RUN + 1))

  if echo "$1" | grep -q "$2"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo "  ✅ PASS: Output contains '$2'"
    return 0
  else
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo "  ❌ FAIL: Output does not contain '$2'"
    echo "     Output: $1"
    return 1
  fi
}

create_test_messages() {
  local agent_id="$1"
  local count="$2"
  local inbox_dir="$CFN_BASE_DIR/inbox/$agent_id"

  mkdir -p "$inbox_dir"

  for i in $(seq 1 "$count"); do
    echo "{\"id\":\"msg-$i\",\"content\":\"test\"}" > "$inbox_dir/msg-$i.msg"
  done
}

# ==============================================================================
# TEST CASES
# ==============================================================================

test_monitor_start_stop() {
  echo ""
  echo "TEST: Monitor start/stop lifecycle"

  # Start monitor in background
  timeout 5 bash "$SCRIPT_PATH" background || true
  sleep 2

  # Check status
  local status
  status=$(bash "$SCRIPT_PATH" status)
  assert_contains "$status" "running"

  # Stop monitor
  bash "$SCRIPT_PATH" stop
  sleep 1

  # Verify stopped
  status=$(bash "$SCRIPT_PATH" status)
  assert_contains "$status" "stopped"
}

test_inbox_metrics_collection() {
  echo ""
  echo "TEST: Inbox metrics collection"

  # Create test messages
  create_test_messages "agent-test-1" 45
  create_test_messages "agent-test-2" 75

  # Source metrics library to emit test data
  # shellcheck source=../../lib/metrics.sh
  source "$PROJECT_ROOT/lib/metrics.sh"

  # Manually collect metrics (simulate one iteration)
  timeout 5 bash -c "
    source '$PROJECT_ROOT/lib/metrics.sh'
    source '$PROJECT_ROOT/lib/alerting.sh'
    source '$SCRIPT_PATH'
    collect_inbox_metrics
  " || true

  sleep 1

  # Verify metrics file exists
  assert_file_exists "$METRICS_FILE"

  # Verify metrics contain inbox data
  if [ -f "$METRICS_FILE" ]; then
    local metrics_content
    metrics_content=$(cat "$METRICS_FILE")
    assert_contains "$metrics_content" "inbox.size"
    assert_contains "$metrics_content" "inbox.utilization"
  fi
}

test_warning_threshold_alert() {
  echo ""
  echo "TEST: Warning threshold alert (75%)"

  # Create messages at warning level (75 messages = 75%)
  create_test_messages "agent-warning-test" 75

  # Run metrics collection
  timeout 5 bash -c "
    source '$PROJECT_ROOT/lib/metrics.sh'
    source '$PROJECT_ROOT/lib/alerting.sh'
    source '$SCRIPT_PATH'
    collect_inbox_metrics
  " || true

  sleep 1

  # Check for warning alert
  if [ -f "$ALERT_LOG_FILE" ]; then
    local alert_content
    alert_content=$(cat "$ALERT_LOG_FILE")
    assert_contains "$alert_content" "inbox_high_utilization"
    assert_contains "$alert_content" "warning"
  else
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo "  ❌ FAIL: Alert log file not created"
  fi
}

test_critical_threshold_alert() {
  echo ""
  echo "TEST: Critical threshold alert (90%)"

  # Create messages at critical level (91 messages = 91%)
  create_test_messages "agent-critical-test" 91

  # Run metrics collection
  timeout 5 bash -c "
    source '$PROJECT_ROOT/lib/metrics.sh'
    source '$PROJECT_ROOT/lib/alerting.sh'
    source '$SCRIPT_PATH'
    collect_inbox_metrics
  " || true

  sleep 1

  # Check for critical alert
  if [ -f "$ALERT_LOG_FILE" ]; then
    local alert_content
    alert_content=$(cat "$ALERT_LOG_FILE")
    assert_contains "$alert_content" "inbox_high_utilization"
    assert_contains "$alert_content" "critical"
  else
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo "  ❌ FAIL: Alert log file not created"
  fi
}

test_summary_output() {
  echo ""
  echo "TEST: Summary output generation"

  # Create test messages
  create_test_messages "agent-summary-1" 30
  create_test_messages "agent-summary-2" 85

  # Get summary
  local summary
  summary=$(bash "$SCRIPT_PATH" summary 2>&1)

  assert_contains "$summary" "Rate Limiting Status"
  assert_contains "$summary" "Inbox Utilization"
}

# ==============================================================================
# TEST EXECUTION
# ==============================================================================

main() {
  echo "=================================="
  echo "Rate Limiting Monitor Test Suite"
  echo "=================================="

  # Setup
  setup_test

  # Run tests
  test_monitor_start_stop
  test_inbox_metrics_collection
  test_warning_threshold_alert
  test_critical_threshold_alert
  test_summary_output

  # Teardown
  teardown_test

  # Results
  echo ""
  echo "=================================="
  echo "TEST RESULTS"
  echo "=================================="
  echo "Tests Run:    $TESTS_RUN"
  echo "Tests Passed: $TESTS_PASSED"
  echo "Tests Failed: $TESTS_FAILED"
  echo "=================================="

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo "✅ ALL TESTS PASSED"
    exit 0
  else
    echo "❌ SOME TESTS FAILED"
    exit 1
  fi
}

main "$@"
