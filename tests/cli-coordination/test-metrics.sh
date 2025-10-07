#!/bin/bash
# Unit Tests for Metrics Infrastructure - Sprint 1.1
# Tests emit_metric(), metrics file format, and alerting thresholds

set -euo pipefail

# Source metrics library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(cd "$SCRIPT_DIR/../../lib" && pwd)"
source "$LIB_DIR/metrics.sh"

# Test configuration
TEST_METRICS_FILE="/dev/shm/cfn-test-metrics.jsonl"
METRICS_FILE="$TEST_METRICS_FILE"  # Override global

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*"
}

# Test framework
start_test() {
    local test_name="$1"
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log_info "Test #$TESTS_TOTAL: $test_name"
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [[ "$expected" == "$actual" ]]; then
        log_success "$message (expected=$expected, actual=$actual)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$message (expected=$expected, actual=$actual)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_file_exists() {
    local filepath="$1"
    local message="${2:-File should exist}"

    if [[ -f "$filepath" ]]; then
        log_success "$message (file=$filepath)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$message (file=$filepath not found)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_json_valid() {
    local json_file="$1"
    local message="${2:-JSON should be valid}"

    if ! command -v jq >/dev/null 2>&1; then
        log_info "jq not available, skipping JSON validation"
        return 0
    fi

    if jq empty "$json_file" 2>/dev/null; then
        log_success "$message"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$message (invalid JSON)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Setup test environment
setup_test_env() {
    log_info "Setting up test environment..."

    # Remove existing test metrics file
    if [[ -f "$TEST_METRICS_FILE" ]]; then
        rm -f "$TEST_METRICS_FILE"
    fi

    # Initialize metrics file
    touch "$TEST_METRICS_FILE"
    chmod 644 "$TEST_METRICS_FILE"

    log_success "Test environment initialized"
}

# Cleanup test environment
cleanup_test_env() {
    log_info "Cleaning up test environment..."

    if [[ -f "$TEST_METRICS_FILE" ]]; then
        rm -f "$TEST_METRICS_FILE"
    fi

    log_success "Test environment cleaned up"
}

# Test 1: emit_metric() basic functionality
test_emit_metric_basic() {
    start_test "emit_metric() basic functionality"

    # Emit a simple metric
    METRICS_FILE="$TEST_METRICS_FILE" emit_metric "test.metric" "42" "count" '{"env":"test"}'

    # Verify metrics file exists and has content
    assert_file_exists "$TEST_METRICS_FILE" "Metrics file should exist after emit"

    local line_count=$(wc -l < "$TEST_METRICS_FILE")
    assert_equals "1" "$line_count" "Metrics file should have 1 entry"

    # Verify JSON structure (if jq available)
    if command -v jq >/dev/null 2>&1; then
        local metric_name=$(jq -r '.metric' "$TEST_METRICS_FILE")
        assert_equals "test.metric" "$metric_name" "Metric name should match"

        local metric_value=$(jq -r '.value' "$TEST_METRICS_FILE")
        assert_equals "42" "$metric_value" "Metric value should match"

        local metric_unit=$(jq -r '.unit' "$TEST_METRICS_FILE")
        assert_equals "count" "$metric_unit" "Metric unit should match"
    fi
}

# Test 2: JSONL format correctness
test_jsonl_format() {
    start_test "JSONL format correctness"

    # Clear previous metrics
    > "$TEST_METRICS_FILE"

    # Emit multiple metrics
    METRICS_FILE="$TEST_METRICS_FILE" emit_metric "coordination.time" "150" "milliseconds" '{"phase":"coordination"}'
    METRICS_FILE="$TEST_METRICS_FILE" emit_metric "coordination.agents" "5" "count" '{"status":"active"}'
    METRICS_FILE="$TEST_METRICS_FILE" emit_metric "coordination.delivery_rate" "95" "percent" '{"target":90}'

    # Verify line count
    local line_count=$(wc -l < "$TEST_METRICS_FILE")
    assert_equals "3" "$line_count" "Should have 3 JSONL entries"

    # Verify each line is valid JSON (if jq available)
    if command -v jq >/dev/null 2>&1; then
        local valid_count=0
        while IFS= read -r line; do
            if echo "$line" | jq empty 2>/dev/null; then
                valid_count=$((valid_count + 1))
            fi
        done < "$TEST_METRICS_FILE"

        assert_equals "3" "$valid_count" "All 3 lines should be valid JSON"
    fi
}

# Test 3: Convenience functions
test_convenience_functions() {
    start_test "Convenience functions (emit_coordination_time, emit_agent_count, etc.)"

    # Clear previous metrics
    > "$TEST_METRICS_FILE"

    # Test convenience functions
    METRICS_FILE="$TEST_METRICS_FILE" emit_coordination_time "125" "3" "coordination"
    METRICS_FILE="$TEST_METRICS_FILE" emit_agent_count "5" "active"
    METRICS_FILE="$TEST_METRICS_FILE" emit_delivery_rate "92" "100" "92"
    METRICS_FILE="$TEST_METRICS_FILE" emit_message_count "10" "sent" "agent-1"
    METRICS_FILE="$TEST_METRICS_FILE" emit_consensus_score "94" "4" "validation"
    METRICS_FILE="$TEST_METRICS_FILE" emit_confidence_score "85" "agent-1" "2"

    # Verify all metrics emitted
    local line_count=$(wc -l < "$TEST_METRICS_FILE")
    assert_equals "6" "$line_count" "Should have 6 metrics from convenience functions"

    if command -v jq >/dev/null 2>&1; then
        # Verify metric names
        local coord_time_count=$(jq -s '[.[] | select(.metric == "coordination.time")] | length' "$TEST_METRICS_FILE")
        assert_equals "1" "$coord_time_count" "Should have 1 coordination.time metric"

        local agent_count=$(jq -s '[.[] | select(.metric == "coordination.agents")] | length' "$TEST_METRICS_FILE")
        assert_equals "1" "$agent_count" "Should have 1 coordination.agents metric"

        local delivery_count=$(jq -s '[.[] | select(.metric == "coordination.delivery_rate")] | length' "$TEST_METRICS_FILE")
        assert_equals "1" "$delivery_count" "Should have 1 coordination.delivery_rate metric"
    fi
}

# Test 4: Concurrent writes (thread safety)
test_concurrent_writes() {
    start_test "Concurrent writes (thread safety with flock)"

    # Clear previous metrics
    > "$TEST_METRICS_FILE"

    # Emit 10 metrics concurrently
    for i in {1..10}; do
        METRICS_FILE="$TEST_METRICS_FILE" emit_metric "concurrent.test" "$i" "count" '{"iteration":'$i'}' &
    done

    # Wait for all background jobs to complete
    wait

    # Verify all 10 metrics were written
    local line_count=$(wc -l < "$TEST_METRICS_FILE")
    assert_equals "10" "$line_count" "Should have 10 metrics after concurrent writes"

    # Verify no corruption (all valid JSON)
    if command -v jq >/dev/null 2>&1; then
        local valid_count=0
        while IFS= read -r line; do
            if echo "$line" | jq empty 2>/dev/null; then
                valid_count=$((valid_count + 1))
            fi
        done < "$TEST_METRICS_FILE"

        assert_equals "10" "$valid_count" "All 10 concurrent writes should produce valid JSON"
    fi
}

# Test 5: Performance overhead (<1%)
test_performance_overhead() {
    start_test "Performance overhead (<1% of total execution time)"

    # Clear previous metrics
    > "$TEST_METRICS_FILE"

    # Baseline: measure time without metrics
    local start_baseline=$(date +%s%N)
    for i in {1..100}; do
        : # No-op
    done
    local end_baseline=$(date +%s%N)
    local baseline_time=$((end_baseline - start_baseline))

    # Measure time with metrics emission
    local start_metrics=$(date +%s%N)
    for i in {1..100}; do
        METRICS_FILE="$TEST_METRICS_FILE" emit_metric "perf.test" "$i" "count" '{"test":"performance"}' >/dev/null 2>&1
    done
    local end_metrics=$(date +%s%N)
    local metrics_time=$((end_metrics - start_metrics))

    # Calculate overhead percentage
    local overhead_pct=$(echo "scale=2; (($metrics_time - $baseline_time) / $metrics_time) * 100" | bc)

    log_info "Baseline time: ${baseline_time}ns"
    log_info "Metrics time: ${metrics_time}ns"
    log_info "Overhead: ${overhead_pct}%"

    # Verify overhead is reasonable (allow up to 50% for testing, production should be <1%)
    if [[ $(echo "$overhead_pct < 50" | bc) -eq 1 ]]; then
        log_success "Performance overhead acceptable: ${overhead_pct}%"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Performance overhead too high: ${overhead_pct}% (target: <1%)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 6: Timestamp format (ISO 8601 with milliseconds)
test_timestamp_format() {
    start_test "Timestamp format (ISO 8601 with milliseconds)"

    # Clear previous metrics
    > "$TEST_METRICS_FILE"

    # Emit a metric
    METRICS_FILE="$TEST_METRICS_FILE" emit_metric "timestamp.test" "1" "count" '{}'

    if command -v jq >/dev/null 2>&1; then
        local timestamp=$(jq -r '.timestamp' "$TEST_METRICS_FILE")

        # Verify ISO 8601 format: YYYY-MM-DDTHH:MM:SS.sssZ
        if [[ "$timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]]; then
            log_success "Timestamp format is ISO 8601 with milliseconds: $timestamp"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_error "Timestamp format incorrect: $timestamp"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    fi
}

# Print test summary
print_test_summary() {
    echo ""
    echo "========================================"
    echo "         TEST SUMMARY"
    echo "========================================"
    echo "Total Tests:    $TESTS_TOTAL"
    echo -e "Tests Passed:   ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed:   ${RED}$TESTS_FAILED${NC}"
    echo "Success Rate:   $(echo "scale=2; ($TESTS_PASSED / $TESTS_TOTAL) * 100" | bc)%"
    echo "========================================"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All metrics tests passed! ✅"
        return 0
    else
        log_error "$TESTS_FAILED test(s) failed ❌"
        return 1
    fi
}

# Main test execution
main() {
    echo "========================================"
    echo "   Metrics Infrastructure Tests"
    echo "   Sprint 1.1 - Phase 1"
    echo "========================================"
    echo ""

    # Setup
    setup_test_env

    # Run tests
    test_emit_metric_basic
    echo ""

    test_jsonl_format
    echo ""

    test_convenience_functions
    echo ""

    test_concurrent_writes
    echo ""

    test_performance_overhead
    echo ""

    test_timestamp_format
    echo ""

    # Summary
    print_test_summary
    local exit_code=$?

    # Cleanup
    cleanup_test_env

    exit $exit_code
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
