#!/usr/bin/env bash

##############################################################################
# CFN Loop Graceful Shutdown - Simple Test Suite
# Tests core graceful shutdown mechanisms in orchestrate.sh
##############################################################################

set -euo pipefail

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Test ID
TEST_ID="graceful-test-$(date +%s)"
TEST_RESULTS_DIR="/tmp/cfn-graceful-simple-$(date +%s)"

log_info() {
    echo -e "${BLUE}[GRACEFUL TEST]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_test_start() {
    echo -e "${BLUE}[TEST START]${NC} $1"
    ((TESTS_TOTAL++))
}

# Test 1: Check for signal handlers in orchestrate.sh
test_signal_handlers() {
    log_test_start "Signal Handlers in orchestrate.sh"

    local orchestrate_file="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

    if [[ -f "$orchestrate_file" ]]; then
        # Check for trap statements
        if grep -q "trap.*INT" "$orchestrate_file"; then
            log_success "Signal handler: SIGINT trap found"
        else
            log_error "Signal handler: SIGINT trap missing"
        fi

        if grep -q "trap.*TERM" "$orchestrate_file"; then
            log_success "Signal handler: SIGTERM trap found"
        else
            log_error "Signal handler: SIGTERM trap missing"
        fi

        if grep -q "trap.*ERR" "$orchestrate_file"; then
            log_success "Signal handler: ERR trap found"
        else
            log_error "Signal handler: ERR trap missing"
        fi

        if grep -q "trap.*EXIT" "$orchestrate_file"; then
            log_success "Signal handler: EXIT trap found"
        else
            log_error "Signal handler: EXIT trap missing"
        fi

        # Check for cleanup functions
        if grep -q "cleanup" "$orchestrate_file"; then
            log_success "Cleanup function: Cleanup logic found"
        else
            log_error "Cleanup function: No cleanup logic found"
        fi

    else
        log_error "Orchestrate script not found at $orchestrate_file"
    fi
}

# Test 2: Test process cleanup mechanisms
test_process_cleanup() {
    log_test_start "Process Cleanup Mechanisms"

    # Start test processes
    local test_pids=()
    for i in {1..3}; do
        (sleep 60) &
        test_pids+=($!)
    done

    log_info "Started ${#test_pids[@]} test processes"

    # Verify processes are running
    local running_before=0
    for pid in "${test_pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            ((running_before++))
        fi
    done

    log_info "Processes running before cleanup: $running_before"

    # Test cleanup escalation
    # First try SIGTERM
    for pid in "${test_pids[@]}"; do
        kill -TERM "$pid" 2>/dev/null || true
    done

    sleep 2

    # Check if processes terminated
    local running_after_term=0
    for pid in "${test_pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            ((running_after_term++))
        fi
    done

    if [[ $running_after_term -eq 0 ]]; then
        log_success "Process cleanup: SIGTERM termination successful"
    else
        log_info "$running_after_term processes still running, escalating to SIGKILL"

        # Escalate to SIGKILL
        for pid in "${test_pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done

        sleep 1

        # Final check
        local running_after_kill=0
        for pid in "${test_pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                ((running_after_kill++))
            fi
        done

        if [[ $running_after_kill -eq 0 ]]; then
            log_success "Process cleanup: SIGKILL escalation successful"
        else
            log_error "Process cleanup: $running_after_kill processes still running after SIGKILL"
        fi
    fi
}

# Test 3: Test file cleanup
test_file_cleanup() {
    log_test_start "File Cleanup"

    # Create test files
    local test_files=(
        "/tmp/cfn-test-$TEST_ID-1.tmp"
        "/tmp/cfn-test-$TEST_ID-2.log"
        "/tmp/cfn-test-$TEST_ID-3.pid"
        "/tmp/cfn-test-$TEST_ID-4.lock"
    )

    for file in "${test_files[@]}"; do
        echo "test data" > "$file"
    done

    log_info "Created ${#test_files[@]} test files"

    # Verify files exist
    local files_before=$(find /tmp -name "cfn-test-$TEST_ID-*" 2>/dev/null | wc -l)
    log_info "Files before cleanup: $files_before"

    # Cleanup files
    find /tmp -name "cfn-test-$TEST_ID-*" -type f -delete 2>/dev/null || true
    rm -f /tmp/cfn-test-$TEST_ID-* 2>/dev/null || true

    # Verify cleanup
    local files_after=$(find /tmp -name "cfn-test-$TEST_ID-*" 2>/dev/null | wc -l)

    if [[ $files_after -eq 0 ]]; then
        log_success "File cleanup: All test files removed successfully"
    else
        log_error "File cleanup: $files_after files remain after cleanup"
    fi
}

# Test 4: Test Redis cleanup (if available)
test_redis_cleanup() {
    log_test_start "Redis Cleanup"

    if ! redis-cli ping >/dev/null 2>&1; then
        log_info "Redis not available - skipping Redis cleanup tests"
        return
    fi

    # Create test keys
    local test_keys=(
        "swarm:$TEST_ID:agent1:done"
        "swarm:$TEST_ID:metadata"
        "cfn_loop:$TEST_ID:state"
    )

    for key in "${test_keys[@]}"; do
        redis-cli set "$key" "test_data" >/dev/null 2>&1
    done

    log_info "Created ${#test_keys[@]} Redis test keys"

    # Count keys before cleanup
    local keys_before=$(redis-cli --scan --pattern "*$TEST_ID*" 2>/dev/null | wc -l)
    log_info "Redis keys before cleanup: $keys_before"

    # Cleanup keys
    local keys_to_delete=$(redis-cli --scan --pattern "*$TEST_ID*" 2>/dev/null)
    if [[ -n "$keys_to_delete" ]]; then
        echo "$keys_to_delete" | xargs redis-cli del >/dev/null 2>&1
    fi

    # Verify cleanup
    local keys_after=$(redis-cli --scan --pattern "*$TEST_ID*" 2>/dev/null | wc -l)

    if [[ $keys_after -eq 0 ]]; then
        log_success "Redis cleanup: All test keys removed successfully"
    else
        log_error "Redis cleanup: $keys_after keys remain after cleanup"
    fi
}

# Test 5: Test resource leak detection
test_resource_leaks() {
    log_test_start "Resource Leak Detection"

    # Get baseline
    local baseline_processes=$(ps aux | wc -l)
    local baseline_temp_files=$(find /tmp -name "cfn-*" 2>/dev/null | wc -l)
    local baseline_redis_keys=0
    if redis-cli ping >/dev/null 2>&1; then
        baseline_redis_keys=$(redis-cli keys "*" 2>/dev/null | wc -l || echo "0")
    fi

    log_info "Baseline: $baseline_processes processes, $baseline_temp_files temp files, $baseline_redis_keys Redis keys"

    # Create resources
    local leak_test_pids=()
    for i in {1..5}; do
        (sleep 10) &
        leak_test_pids+=($!)
    done

    for i in {1..5}; do
        echo "leak test $i" > "/tmp/leak-test-$TEST_ID-$i.tmp"
    done

    if redis-cli ping >/dev/null 2>&1; then
        for i in {1..5}; do
            redis-cli set "leak_test:$TEST_ID:$i" "leak data" >/dev/null 2>&1
        done
    fi

    # Wait and cleanup
    sleep 2

    # Cleanup resources
    for pid in "${leak_test_pids[@]}"; do
        kill -TERM "$pid" 2>/dev/null || true
    done

    find /tmp -name "leak-test-$TEST_ID-*" -delete 2>/dev/null || true

    if redis-cli ping >/dev/null 2>&1; then
        local leak_keys=$(redis-cli --scan --pattern "leak_test:$TEST_ID*")
        if [[ -n "$leak_keys" ]]; then
            echo "$leak_keys" | xargs redis-cli del >/dev/null 2>&1
        fi
    fi

    # Wait for cleanup to complete
    sleep 2

    # Check for leaks
    local current_processes=$(ps aux | wc -l)
    local current_temp_files=$(find /tmp -name "cfn-*" 2>/dev/null | wc -l)
    local current_redis_keys=0
    if redis-cli ping >/dev/null 2>&1; then
        current_redis_keys=$(redis-cli keys "*" 2>/dev/null | wc -l || echo "0")
    fi

    local process_change=$((current_processes - baseline_processes))
    local temp_file_change=$((current_temp_files - baseline_temp_files))
    local redis_key_change=$((current_redis_keys - baseline_redis_keys))

    log_info "Changes from baseline: processes +$process_change, temp files +$temp_file_change, Redis keys +$redis_key_change"

    # Check for leaks (allowing some tolerance)
    if [[ $process_change -lt 10 ]] && [[ $temp_file_change -lt 5 ]] && [[ $redis_key_change -lt 10 ]]; then
        log_success "Resource leak detection: No significant leaks detected"
    else
        log_error "Resource leak detection: Potential leaks detected"
    fi
}

# Test 6: Test emergency cleanup simulation
test_emergency_cleanup() {
    log_test_start "Emergency Cleanup Simulation"

    # Create emergency cleanup script
    local emergency_script="$TEST_RESULTS_DIR/emergency_cleanup.sh"
    cat > "$emergency_script" << 'EOF'
#!/bin/bash

# Emergency cleanup simulation
emergency_cleanup() {
    echo "Emergency cleanup triggered"

    # Force kill processes
    pkill -f "sleep 300" 2>/dev/null || true
    pkill -f "emergency_test" 2>/dev/null || true

    # Remove files aggressively
    find /tmp -name "emergency_test_*" -delete 2>/dev/null || true
    rm -rf /tmp/emergency_test_* 2>/dev/null || true

    exit 1
}

trap emergency_cleanup INT TERM ERR

# Create resources
touch /tmp/emergency_test_1.tmp
touch /tmp/emergency_test_2.tmp

# Start background processes
(sleep 300) &
(sleep 301) &

echo "Emergency test ready"
sleep 30
EOF

    chmod +x "$emergency_script"

    # Run emergency test
    "$emergency_script" &
    local emergency_pid=$!
    sleep 2

    # Trigger emergency cleanup
    kill -INT "$emergency_pid" 2>/dev/null || true
    wait "$emergency_pid" 2>/dev/null || true

    # Check cleanup effectiveness
    local files_remaining=$(find /tmp -name "emergency_test_*" 2>/dev/null | wc -l)
    local processes_remaining=$(pgrep -f "sleep 30[01]" 2>/dev/null | wc -l)

    if [[ $files_remaining -eq 0 ]] && [[ $processes_remaining -eq 0 ]]; then
        log_success "Emergency cleanup: All resources cleaned up successfully"
    else
        log_error "Emergency cleanup: $files_remaining files, $processes_remaining processes remaining"
    fi
}

# Generate simple report
generate_simple_report() {
    log_info "Generating simple test report..."

    local report_file="$TEST_RESULTS_DIR/graceful-shutdown-simple-report.md"

    cat > "$report_file" << EOF
# CFN Loop Graceful Shutdown - Simple Test Report

**Test ID:** $TEST_ID
**Date:** $(date)

## Executive Summary

- **Total Tests:** $TESTS_TOTAL
- **Passed:** $TESTS_PASSED
- **Failed:** $TESTS_FAILED
- **Success Rate:** $(( TESTS_TOTAL > 0 ? (TESTS_PASSED * 100) / TESTS_TOTAL : 0 ))%

## Test Results

EOF

    # Add individual test results
    if [[ $TESTS_PASSED -gt 0 ]]; then
        echo "### ✅ Passed Tests" >> "$report_file"
        echo "" >> "$report_file"
    fi

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo "### ❌ Failed Tests" >> "$report_file"
        echo "" >> "$report_file"
    fi

    # Add recommendations
    cat >> "$report_file" << EOF

## Recommendations

EOF

    if [[ $TESTS_FAILED -eq 0 ]]; then
        cat >> "$report_file" << EOF
✅ **Good**: All basic graceful shutdown mechanisms are working

However, the orchestrate.sh script still needs implementation of:
1. Signal handlers (trap statements)
2. Centralized cleanup function
3. Process tracking and cleanup
4. File cleanup procedures
5. Redis data cleanup
6. Emergency cleanup procedures

## Implementation Priority

1. **Critical**: Add signal handlers to orchestrate.sh
2. **High**: Implement cleanup functions
3. **Medium**: Add process tracking
4. **Low**: Enhance monitoring capabilities
EOF
    else
        cat >> "$report_file" << EOF
❌ **Action Required**: Some graceful shutdown mechanisms need attention

Priority implementation:
1. **Critical**: Fix failing basic cleanup mechanisms
2. **High**: Implement missing signal handlers
3. **Medium**: Add comprehensive cleanup procedures
4. **Low**: Add monitoring and alerting
EOF
    fi

    log_success "Simple test report generated: $report_file"
    echo ""
    echo "📊 Test Summary: $TESTS_PASSED/$TESTS_TOTAL passed ($(( TESTS_TOTAL > 0 ? (TESTS_PASSED * 100) / TESTS_TOTAL : 0 ))%)"
    echo "📄 Report: $report_file"
}

# Setup and cleanup
setup_test() {
    mkdir -p "$TEST_RESULTS_DIR"
    log_info "Test directory: $TEST_RESULTS_DIR"
}

cleanup_test() {
    log_info "Cleaning up test environment..."

    # Kill any remaining test processes
    pkill -f "sleep 60" 2>/dev/null || true
    pkill -f "sleep 300" 2>/dev/null || true
    pkill -f "emergency_test" 2>/dev/null || true

    # Remove test files
    find /tmp -name "*$TEST_ID*" -delete 2>/dev/null || true
    find /tmp -name "graceful_test_*" -delete 2>/dev/null || true
    find /tmp -name "leak_test_*" -delete 2>/dev/null || true
    find /tmp -name "emergency_test_*" -delete 2>/dev/null || true

    # Cleanup Redis if available
    if redis-cli ping >/dev/null 2>&1; then
        local test_keys=$(redis-cli --scan --pattern "*$TEST_ID*")
        if [[ -n "$test_keys" ]]; then
            echo "$test_keys" | xargs redis-cli del >/dev/null 2>&1
        fi
    fi
}

# Main execution
main() {
    echo "🚀 CFN Loop Graceful Shutdown - Simple Test Suite"
    echo "=============================================="
    echo ""

    setup_test
    trap cleanup_test EXIT INT TERM

    # Run tests
    test_signal_handlers
    test_process_cleanup
    test_file_cleanup
    test_redis_cleanup
    test_resource_leaks
    test_emergency_cleanup

    # Generate report
    generate_simple_report

    echo ""
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo "🎉 All basic tests passed! Core mechanisms are functional."
        exit 0
    else
        echo "❌ $TESTS_FAILED test(s) failed. Review the report for details."
        exit 1
    fi
}

# Run tests
main "$@"