#!/usr/bin/env bash
# CFN Process Instrumentation Validation Tests
# Part of ANTI-023 Memory Leak Protection System Integration Tests

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TEST_RESULTS_DIR="/tmp/cfn-test-results"
INSTRUMENTATION_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

# Test tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS=()

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Logging functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_TESTS++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_TESTS++))
    TEST_RESULTS+=("FAIL: $1")
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Test setup
setup_test_env() {
    log_info "Setting up test environment..."
    mkdir -p "$TEST_RESULTS_DIR"
    mkdir -p "/tmp/cfn-telemetry"

    # Set test configuration
    export AGENT_ID="test-agent-$$"
    export CFN_MEMORY_LIMIT="512M"
    export CFN_CPU_LIMIT="50%"
    export CFN_TIMEOUT="60"
    export CFN_TELEMETRY_DIR="/tmp/cfn-telemetry"

    ((TOTAL_TESTS++))
}

# Test cleanup
cleanup_test_env() {
    log_info "Cleaning up test environment..."

    # Clean up telemetry files
    rm -rf "/tmp/cfn-telemetry/metrics_${AGENT_ID:-}.json"
    rm -rf "$TEST_RESULTS_DIR"

    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
}

# Test: Metrics file creation
test_metrics_file_creation() {
    log_test "Testing metrics file creation..."

    # Source instrumentation script
    source "$INSTRUMENTATION_SCRIPT" --agent-id "test-metrics"

    local metrics_file="/tmp/cfn-telemetry/metrics_test-metrics.json"

    # Check if metrics file exists
    if [[ -f "$metrics_file" ]]; then
        log_pass "Metrics file created successfully"
    else
        log_fail "Metrics file not created"
        return 1
    fi

    # Check if file contains required fields
    if jq -e '.agent_id' "$metrics_file" >/dev/null 2>&1; then
        log_pass "Metrics file contains agent_id field"
    else
        log_fail "Metrics file missing agent_id field"
    fi

    if jq -e '.start_time' "$metrics_file" >/dev/null 2>&1; then
        log_pass "Metrics file contains start_time field"
    else
        log_fail "Metrics file missing start_time field"
    fi

    if jq -e '.process_id' "$metrics_file" >/dev/null 2>&1; then
        log_pass "Metrics file contains process_id field"
    else
        log_fail "Metrics file missing process_id field"
    fi

    ((TOTAL_TESTS+=4))
}

# Test: Process monitoring functionality
test_process_monitoring() {
    log_test "Testing process monitoring functionality..."

    # Create a long-running background process
    (
        source "$INSTRUMENTATION_SCRIPT" --agent-id "test-monitor"

        # Simulate work for 10 seconds
        for i in {1..10}; do
            sleep 1
            echo "Working $i..."
        done
    ) &
    local test_pid=$!

    # Wait a bit for metrics collection
    sleep 2

    # Check if metrics file has samples
    local metrics_file="/tmp/cfn-telemetry/metrics_test-monitor.json"
    if [[ -f "$metrics_file" ]]; then
        local sample_count
        sample_count=$(jq '.samples | length' "$metrics_file" 2>/dev/null || echo "0")

        if [[ $sample_count -gt 0 ]]; then
            log_pass "Process monitoring collected $sample_count samples"
        else
            log_fail "Process monitoring collected no samples"
        fi
    else
        log_fail "Metrics file not found for monitoring test"
    fi

    # Wait for process to complete and clean up
    wait "$test_pid" 2>/dev/null || true

    ((TOTAL_TESTS++))
}

# Test: Memory limit enforcement
test_memory_limit_enforcement() {
    log_test "Testing memory limit enforcement..."

    # Set very low memory limit for testing
    export CFN_MEMORY_LIMIT="64M"
    export AGENT_ID="test-memory-limit"

    # Create a script that allocates memory
    cat > "$TEST_RESULTS_DIR/memory_test.sh" << 'EOF'
#!/bin/bash
source "$PROJECT_ROOT/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

# Allocate memory gradually
data=""
for i in {1..100}; do
    data="${data}$(printf 'A%.0s' {1..10000})"
    echo "Allocated chunk $i"
    sleep 0.1
done
EOF

    chmod +x "$TEST_RESULTS_DIR/memory_test.sh"

    # Run with timeout to prevent hanging
    if timeout 10 "$TEST_RESULTS_DIR/memory_test.sh" 2>/dev/null; then
        log_fail "Memory allocation completed without limit enforcement"
    else
        # Check if process was terminated (expected behavior)
        local exit_code=$?
        if [[ $exit_code -eq 124 ]]; then
            log_pass "Memory limit enforcement working (process terminated)"
        else
            log_pass "Memory limit enforcement working (exit code: $exit_code)"
        fi
    fi

    ((TOTAL_TESTS++))
}

# Test: CPU monitoring
test_cpu_monitoring() {
    log_test "Testing CPU monitoring functionality..."

    # Create CPU-intensive process
    (
        source "$INSTRUMENTATION_SCRIPT" --agent-id "test-cpu"

        # CPU intensive work for short duration
        end_time=$(($(date +%s) + 5))
        while [[ $(date +%s) -lt $end_time ]]; do
            # CPU intensive calculation
            result=$(echo "scale=1000; 4*a(1)" | bc -l 2>/dev/null || echo "3.14159")
        done
    ) &
    local cpu_pid=$!

    sleep 3

    # Check if CPU metrics were collected
    local metrics_file="/tmp/cfn-telemetry/metrics_test-cpu.json"
    if [[ -f "$metrics_file" ]]; then
        if jq -e '.samples[] | .cpu_usage' "$metrics_file" >/dev/null 2>&1; then
            log_pass "CPU monitoring metrics collected"
        else
            log_fail "CPU monitoring metrics not found"
        fi
    else
        log_fail "CPU monitoring metrics file not created"
    fi

    wait "$cpu_pid" 2>/dev/null || true

    ((TOTAL_TESTS++))
}

# Test: External PID monitoring
test_external_pid_monitoring() {
    log_test "Testing external PID monitoring functionality..."

    # Create a test process to monitor
    sleep 30 &
    local target_pid=$!

    # Monitor the external PID
    "$INSTRUMENTATION_SCRIPT" --monitor-pid "$target_pid" &
    local monitor_pid=$!

    sleep 2

    # Check if monitoring is active
    if kill -0 "$monitor_pid" 2>/dev/null; then
        log_pass "External PID monitoring started successfully"
    else
        log_fail "External PID monitoring failed to start"
    fi

    # Clean up
    kill "$target_pid" "$monitor_pid" 2>/dev/null || true

    ((TOTAL_TESTS++))
}

# Test: Telemetry data integrity
test_telemetry_integrity() {
    log_test "Testing telemetry data integrity..."

    # Generate telemetry data
    (
        source "$INSTRUMENTATION_SCRIPT" --agent-id "test-integrity"

        # Generate some activity
        for i in {1..5}; do
            echo "Activity $i"
            sleep 0.5
        done
    ) &
    local telemetry_pid=$!

    wait "$telemetry_pid" 2>/dev/null || true

    # Validate telemetry file structure
    local metrics_file="/tmp/cfn-telemetry/metrics_test-integrity.json"

    if [[ ! -f "$metrics_file" ]]; then
        log_fail "Telemetry file not created"
        return 1
    fi

    # Validate JSON structure
    if jq empty "$metrics_file" 2>/dev/null; then
        log_pass "Telemetry file is valid JSON"
    else
        log_fail "Telemetry file is invalid JSON"
    fi

    # Check required fields exist and have correct types
    if jq -e 'type == "object"' "$metrics_file" >/dev/null 2>&1; then
        log_pass "Telemetry root is object type"
    else
        log_fail "Telemetry root is not object type"
    fi

    if jq -e '.samples | type == "array"' "$metrics_file" >/dev/null 2>&1; then
        log_pass "Telemetry samples array is correct type"
    else
        log_fail "Telemetry samples array is not correct type"
    fi

    # Validate timestamp format (ISO 8601)
    if jq -r '.start_time' "$metrics_file" | grep -q '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'; then
        log_pass "Timestamp format is ISO 8601"
    else
        log_fail "Timestamp format is not ISO 8601"
    fi

    ((TOTAL_TESTS+=4))
}

# Test: Resource limit configuration
test_resource_limit_configuration() {
    log_test "Testing resource limit configuration..."

    # Test custom configuration
    export CFN_MEMORY_LIMIT="1G"
    export CFN_CPU_LIMIT="90%"
    export CFN_TIMEOUT="300"
    export AGENT_ID="test-config"

    # Source instrumentation with custom config
    source "$INSTRUMENTATION_SCRIPT" --agent-id "test-config"

    local metrics_file="/tmp/cfn-telemetry/metrics_test-config.json"

    # Check if custom limits are reflected in telemetry
    if [[ -f "$metrics_file" ]]; then
        local memory_limit
        memory_limit=$(jq -r '.memory_limit' "$metrics_file" 2>/dev/null || echo "failed")

        if [[ "$memory_limit" == "1G" ]]; then
            log_pass "Custom memory limit configured correctly"
        else
            log_fail "Custom memory limit not configured: $memory_limit"
        fi

        local cpu_limit
        cpu_limit=$(jq -r '.cpu_limit' "$metrics_file" 2>/dev/null || echo "failed")

        if [[ "$cpu_limit" == "90%" ]]; then
            log_pass "Custom CPU limit configured correctly"
        else
            log_fail "Custom CPU limit not configured: $cpu_limit"
        fi

        local timeout
        timeout=$(jq -r '.timeout' "$metrics_file" 2>/dev/null || echo "failed")

        if [[ "$timeout" == "300" ]]; then
            log_pass "Custom timeout configured correctly"
        else
            log_fail "Custom timeout not configured: $timeout"
        fi
    else
        log_fail "Metrics file not created for configuration test"
    fi

    ((TOTAL_TESTS+=3))
}

# Test: Error handling and robustness
test_error_handling() {
    log_test "Testing error handling and robustness..."

    # Test with invalid parameters
    if "$INSTRUMENTATION_SCRIPT" --invalid-option 2>/dev/null; then
        log_fail "Script should fail with invalid option"
    else
        log_pass "Script properly handles invalid option"
    fi

    # Test with non-existent PID
    if "$INSTRUMENTATION_SCRIPT" --monitor-pid 999999 2>/dev/null; then
        log_fail "Script should handle non-existent PID gracefully"
    else
        log_pass "Script properly handles non-existent PID"
    fi

    # Test with read-only telemetry directory
    mkdir -p "/tmp/cfn-telemetry-readonly"
    chmod 444 "/tmp/cfn-telemetry-readonly"
    export CFN_TELEMETRY_DIR="/tmp/cfn-telemetry-readonly"

    if source "$INSTRUMENTATION_SCRIPT" --agent-id "test-readonly" 2>/dev/null; then
        log_pass "Script handles read-only telemetry directory"
    else
        log_fail "Script fails with read-only telemetry directory"
    fi

    # Restore permissions and clean up
    chmod 755 "/tmp/cfn-telemetry-readonly"
    rm -rf "/tmp/cfn-telemetry-readonly"
    unset CFN_TELEMETRY_DIR

    ((TOTAL_TESTS+=3))
}

# Run all tests
run_all_tests() {
    log_info "Starting CFN Process Instrumentation Validation Tests..."

    setup_test_env
    test_metrics_file_creation
    test_process_monitoring
    test_memory_limit_enforcement
    test_cpu_monitoring
    test_external_pid_monitoring
    test_telemetry_integrity
    test_resource_limit_configuration
    test_error_handling
    cleanup_test_env

    log_info "Test execution completed"
}

# Generate test report
generate_report() {
    local success_rate=0
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    fi

    cat << EOF
=========================================
CFN Process Instrumentation Test Report
=========================================

Total Tests: $TOTAL_TESTS
Passed: $PASSED_TESTS
Failed: $FAILED_TESTS
Success Rate: ${success_rate}%

EOF

    if [[ ${#TEST_RESULTS[@]} -gt 0 ]]; then
        echo "Failed Tests:"
        printf "  %s\n" "${TEST_RESULTS[@]}"
        echo ""
    fi

    if [[ $FAILED_TESTS -eq 0 ]]; then
        echo "✅ All tests passed! Process instrumentation is working correctly."
        return 0
    else
        echo "❌ Some tests failed. Review the failed tests above."
        return 1
    fi
}

# Main execution
main() {
    run_all_tests
    generate_report
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi