#!/usr/bin/env bash
# tests/integration/alerting-system.test.sh - Alerting system validation
# Phase 1 Sprint 1.1: Testing

set -euo pipefail

# ==============================================================================
# TEST CONFIGURATION
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../../lib"
METRICS_DIR="${SCRIPT_DIR}/../../scripts/monitoring"

# Test data location
TEST_METRICS_FILE="/tmp/test-metrics.jsonl"
TEST_ALERT_FILE="/tmp/test-alerts.jsonl"

# Override environment for testing
export METRICS_FILE="$TEST_METRICS_FILE"
export ALERT_LOG_FILE="$TEST_ALERT_FILE"
export ALERT_COOLDOWN_SECONDS=0  # Disable rate limiting for tests

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ==============================================================================
# TEST FRAMEWORK
# ==============================================================================

setup() {
  echo "[SETUP] Initializing test environment..."
  rm -f "$TEST_METRICS_FILE" "$TEST_ALERT_FILE"
  touch "$TEST_METRICS_FILE" "$TEST_ALERT_FILE"

  # Source alerting library
  # shellcheck source=../../lib/alerting.sh
  source "$LIB_DIR/alerting.sh"
}

teardown() {
  echo "[TEARDOWN] Cleaning up test files..."
  rm -f "$TEST_METRICS_FILE" "$TEST_ALERT_FILE"
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local message="${3:-Assertion failed}"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$expected" = "$actual" ]; then
    echo "  ✅ PASS: $message"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  ❌ FAIL: $message"
    echo "     Expected: $expected"
    echo "     Actual:   $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_greater_than() {
  local threshold="$1"
  local actual="$2"
  local message="${3:-Assertion failed}"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$actual" -gt "$threshold" ]; then
    echo "  ✅ PASS: $message"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  ❌ FAIL: $message"
    echo "     Expected > $threshold"
    echo "     Actual:    $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_less_than() {
  local threshold="$1"
  local actual="$2"
  local message="${3:-Assertion failed}"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$actual" -lt "$threshold" ]; then
    echo "  ✅ PASS: $message"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  ❌ FAIL: $message"
    echo "     Expected < $threshold"
    echo "     Actual:    $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# ==============================================================================
# TEST CASES
# ==============================================================================

test_coordination_time_alert() {
  echo ""
  echo "TEST: Coordination Time Threshold"
  echo "----------------------------------------"

  # Create test metrics with excessive coordination time
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  jq -n \
    --arg ts "$timestamp" \
    '{timestamp: $ts, metric: "coordination.time", value: 15000}' \
    >> "$TEST_METRICS_FILE"

  # Run threshold check
  check_thresholds "$TEST_METRICS_FILE" 2>/dev/null

  # Verify alert was triggered
  local alert_count
  alert_count=$(grep -c "coordination_time_exceeded" "$TEST_ALERT_FILE" || echo "0")

  assert_equals "1" "$alert_count" "Coordination time alert triggered"
}

test_delivery_rate_alert() {
  echo ""
  echo "TEST: Delivery Rate Threshold"
  echo "----------------------------------------"

  # Create test metrics with low delivery rate
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  jq -n \
    --arg ts "$timestamp" \
    '{timestamp: $ts, metric: "coordination.delivery_rate", value: 75}' \
    >> "$TEST_METRICS_FILE"

  # Run threshold check
  check_thresholds "$TEST_METRICS_FILE" 2>/dev/null

  # Verify alert was triggered
  local alert_count
  alert_count=$(grep -c "delivery_rate_low" "$TEST_ALERT_FILE" || echo "0")

  assert_equals "1" "$alert_count" "Delivery rate alert triggered"
}

test_memory_growth_alert() {
  echo ""
  echo "TEST: Memory Growth Threshold"
  echo "----------------------------------------"

  # Create test metrics showing memory growth
  local timestamp1 timestamp2
  timestamp1=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  sleep 0.1
  timestamp2=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  jq -n \
    --arg ts "$timestamp1" \
    '{timestamp: $ts, metric: "system.memory_mb", value: 1000}' \
    >> "$TEST_METRICS_FILE"

  jq -n \
    --arg ts "$timestamp2" \
    '{timestamp: $ts, metric: "system.memory_mb", value: 1150}' \
    >> "$TEST_METRICS_FILE"

  # Run threshold check
  check_thresholds "$TEST_METRICS_FILE" 2>/dev/null

  # Verify alert was triggered (15% growth > 10% threshold)
  local alert_count
  alert_count=$(grep -c "memory_growth_high" "$TEST_ALERT_FILE" || echo "0")

  assert_equals "1" "$alert_count" "Memory growth alert triggered"
}

test_alert_latency() {
  echo ""
  echo "TEST: Alert Latency (<30 seconds)"
  echo "----------------------------------------"

  # Measure time from metric to alert
  local start_time end_time latency

  start_time=$(date +%s%3N)

  # Create threshold-violating metric
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  jq -n \
    --arg ts "$timestamp" \
    '{timestamp: $ts, metric: "coordination.time", value: 20000}' \
    >> "$TEST_METRICS_FILE"

  # Run threshold check
  check_thresholds "$TEST_METRICS_FILE" 2>/dev/null

  end_time=$(date +%s%3N)
  latency=$((end_time - start_time))

  assert_less_than "30000" "$latency" "Alert latency under 30 seconds (${latency}ms)"
}

test_false_positive_rate() {
  echo ""
  echo "TEST: False Positive Rate (<1%)"
  echo "----------------------------------------"

  # Create 1000 valid metrics (within thresholds)
  for i in {1..1000}; do
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

    # Valid coordination time (under 10s)
    jq -n \
      --arg ts "$timestamp" \
      '{timestamp: $ts, metric: "coordination.time", value: 5000}' \
      >> "$TEST_METRICS_FILE"
  done

  # Run threshold checks
  check_thresholds "$TEST_METRICS_FILE" 2>/dev/null

  # Count false positives (alerts triggered for valid metrics)
  local false_positives
  false_positives=$(wc -l < "$TEST_ALERT_FILE" 2>/dev/null || echo "0")
  local false_positive_rate
  false_positive_rate=$((false_positives * 100 / 1000))

  assert_less_than "1" "$false_positive_rate" "False positive rate < 1% (actual: ${false_positive_rate}%)"
}

test_configurable_thresholds() {
  echo ""
  echo "TEST: Configurable Thresholds"
  echo "----------------------------------------"

  # Override threshold
  export ALERT_COORDINATION_TIME_MS=5000

  # Create metric exceeding new threshold
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  jq -n \
    --arg ts "$timestamp" \
    '{timestamp: $ts, metric: "coordination.time", value: 6000}' \
    >> "$TEST_METRICS_FILE"

  # Run threshold check
  check_thresholds "$TEST_METRICS_FILE" 2>/dev/null

  # Verify alert uses custom threshold
  local alert_found
  alert_found=$(grep -c "exceeds threshold 5000ms" "$TEST_ALERT_FILE" || echo "0")

  assert_equals "1" "$alert_found" "Custom threshold applied"

  # Reset threshold
  export ALERT_COORDINATION_TIME_MS=10000
}

test_alert_severity_levels() {
  echo ""
  echo "TEST: Alert Severity Classification"
  echo "----------------------------------------"

  # Create critical alert
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  jq -n \
    --arg ts "$timestamp" \
    '{timestamp: $ts, metric: "coordination.error_rate", value: 10}' \
    >> "$TEST_METRICS_FILE"

  check_thresholds "$TEST_METRICS_FILE" 2>/dev/null

  # Verify severity is "critical"
  local severity
  severity=$(jq -r 'select(.alert == "error_rate_high") | .severity' "$TEST_ALERT_FILE" | head -1)

  assert_equals "critical" "$severity" "Error rate alert marked as critical"
}

test_alert_metadata() {
  echo ""
  echo "TEST: Alert Metadata Inclusion"
  echo "----------------------------------------"

  # Create alert with metadata
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  jq -n \
    --arg ts "$timestamp" \
    '{timestamp: $ts, metric: "coordination.time", value: 12000}' \
    >> "$TEST_METRICS_FILE"

  check_thresholds "$TEST_METRICS_FILE" 2>/dev/null

  # Verify metadata exists
  local has_metadata
  has_metadata=$(jq -r 'select(.alert == "coordination_time_exceeded") | .metadata | has("max_time")' "$TEST_ALERT_FILE" | head -1)

  assert_equals "true" "$has_metadata" "Alert includes metadata"
}

# ==============================================================================
# TEST EXECUTION
# ==============================================================================

main() {
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║        ALERTING SYSTEM INTEGRATION TESTS                  ║"
  echo "╚═══════════════════════════════════════════════════════════╝"

  setup

  # Run all tests
  test_coordination_time_alert
  setup  # Reset for each test

  test_delivery_rate_alert
  setup

  test_memory_growth_alert
  setup

  test_alert_latency
  setup

  test_false_positive_rate
  setup

  test_configurable_thresholds
  setup

  test_alert_severity_levels
  setup

  test_alert_metadata

  teardown

  # Print summary
  echo ""
  echo "=========================================="
  echo "TEST SUMMARY"
  echo "=========================================="
  echo "Total:  $TESTS_RUN"
  echo "Passed: $TESTS_PASSED"
  echo "Failed: $TESTS_FAILED"
  echo ""

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo "✅ ALL TESTS PASSED"
    exit 0
  else
    echo "❌ SOME TESTS FAILED"
    exit 1
  fi
}

main "$@"
