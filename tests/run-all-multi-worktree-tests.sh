#!/bin/bash
# tests/run-all-multi-worktree-tests.sh
# Comprehensive test runner for multi-worktree Docker coordination
# Runs all related test suites and provides combined reporting

set -euo pipefail

# Source test utilities
source "$(dirname "$0")/test-utils.sh"

# ============================================================================
# CONFIGURATION
# ============================================================================

export TEST_START_TIME
TEST_START_TIME=$(date +%s)
export TEST_RESULTS_DIR=".artifacts/test-results/multi-worktree"
export TEST_LOG="$TEST_RESULTS_DIR/test-execution-$(date +%s).log"

# Test suites to run
declare -a TEST_SUITES=(
    "test-multi-worktree-docker-coordination.sh"
    "test-docker-build-isolation.sh"
    "test-redis-coordination-isolation.sh"
)

# Test result tracking
declare -A SUITE_RESULTS
declare -A SUITE_PASSED
declare -A SUITE_FAILED

# ============================================================================
# TEST RUNNER SETUP
# ============================================================================

setup_test_runner() {
    # Create results directory
    mkdir -p "$TEST_RESULTS_DIR"
    
    # Initialize test log
    cat > "$TEST_LOG" << EOF
Multi-Worktree Docker Coordination Test Execution
Started: $(date -Iseconds)
Test Environment: $(uname -a)
Docker Version: $(docker --version 2>/dev/null || echo "Not available")
Docker Compose Version: $(docker-compose --version 2>/dev/null || echo "Not available")
Git Branch: $(git branch --show-current 2>/dev/null || echo "Not in git repo")
Working Directory: $(pwd)
EOF
    
    echo "Multi-Worktree Docker Coordination Test Suite"
    echo "=============================================="
    echo "Started: $(date -Iseconds)"
    echo "Results Directory: $TEST_RESULTS_DIR"
    echo "Log File: $TEST_LOG"
    echo ""
}

# ============================================================================
# TEST SUITE EXECUTION
# ============================================================================

run_test_suite() {
    local suite_name="$1"
    local suite_path="$(dirname "$0")/$suite_name"
    
    echo "▶ Running test suite: $suite_name"
    echo "  Path: $suite_path"
    
    # Check if test suite exists
    if [[ ! -f "$suite_path" ]]; then
        echo "  ❌ Test suite not found: $suite_path"
        SUITE_RESULTS["$suite_name"]="NOT_FOUND"
        SUITE_FAILED["$suite_name"]=1
        return 1
    fi
    
    # Check if test suite is executable
    if [[ ! -x "$suite_path" ]]; then
        echo "  ❌ Test suite not executable: $suite_path"
        SUITE_RESULTS["$suite_name"]="NOT_EXECUTABLE"
        SUITE_FAILED["$suite_name"]=1
        return 1
    fi
    
    # Create suite-specific log
    local suite_log="$TEST_RESULTS_DIR/$(basename "$suite_name" .sh)-$(date +%s).log"
    
    # Run the test suite
    echo "  Started: $(date -Iseconds)"
    local suite_start_time=$(date +%s)
    
    if timeout 600 "$suite_path" >> "$suite_log" 2>&1; then
        local suite_end_time=$(date +%s)
        local suite_duration=$((suite_end_time - suite_start_time))
        
        echo "  ✅ PASSED (${suite_duration}s)"
        SUITE_RESULTS["$suite_name"]="PASSED"
        SUITE_PASSED["$suite_name"]=1
        
        # Extract test results from log
        extract_test_results "$suite_name" "$suite_log"
    else
        local suite_end_time=$(date +%s)
        local suite_duration=$((suite_end_time - suite_start_time))
        local exit_code=$?
        
        echo "  ❌ FAILED (${suite_duration}s, exit code: $exit_code)"
        SUITE_RESULTS["$suite_name"]="FAILED"
        SUITE_FAILED["$suite_name"]=1
        
        # Show last 10 lines of failed test log
        echo "  Last 10 lines of test output:"
        tail -10 "$suite_log" | sed 's/^/    /'
    fi
    
    # Append suite log to main log
    echo "" >> "$TEST_LOG"
    echo "=== Test Suite: $suite_name ===" >> "$TEST_LOG"
    echo "Result: ${SUITE_RESULTS[$suite_name]}" >> "$TEST_LOG"
    echo "Duration: ${suite_duration}s" >> "$TEST_LOG"
    echo "" >> "$TEST_LOG"
    cat "$suite_log" >> "$TEST_LOG"
    
    echo ""
}

extract_test_results() {
    local suite_name="$1"
    local suite_log="$2"
    
    # Look for test summary patterns
    if grep -q "Total:" "$suite_log" && grep -q "Passed:" "$suite_log" && grep -q "Failed:" "$suite_log"; then
        local total_passed
        total_passed=$(grep "Passed:" "$suite_log" | tail -1 | awk '{print $2}' || echo "0")
        local total_failed
        total_failed=$(grep "Failed:" "$suite_log" | tail -1 | awk '{print $2}' || echo "0")
        
        echo "  Test Results: $total_passed passed, $total_failed failed"
        
        # Store in global counters
        if [[ -z "${TOTAL_PASSED:-}" ]]; then TOTAL_PASSED=0; fi
        if [[ -z "${TOTAL_FAILED:-}" ]]; then TOTAL_FAILED=0; fi
        
        TOTAL_PASSED=$((TOTAL_PASSED + total_passed))
        TOTAL_FAILED=$((TOTAL_FAILED + total_failed))
    fi
}

# ============================================================================
# ENVIRONMENT VALIDATION
# ============================================================================

validate_test_environment() {
    echo "Validating test environment..."
    
    local validation_issues=0
    
    # Check Docker
    if ! command -v docker &>/dev/null; then
        echo "  ❌ Docker not available"
        validation_issues=$((validation_issues + 1))
    else
        echo "  ✅ Docker available: $(docker --version)"
    fi
    
    # Check docker-compose
    if ! command -v docker-compose &>/dev/null; then
        echo "  ❌ docker-compose not available"
        validation_issues=$((validation_issues + 1))
    else
        echo "  ✅ docker-compose available: $(docker-compose --version)"
    fi
    
    # Check Redis
    if ! command -v redis-cli &>/dev/null; then
        echo "  ❌ redis-cli not available"
        validation_issues=$((validation_issues + 1))
    else
        echo "  ✅ redis-cli available"
    fi
    
    # Check required scripts
    local required_scripts=(
        "./scripts/docker/run-in-worktree.sh"
        "./.claude/skills/docker-build/build.sh"
    )
    
    for script in "${required_scripts[@]}"; do
        if [[ -f "$script" ]]; then
            echo "  ✅ Required script exists: $script"
        else
            echo "  ❌ Required script missing: $script"
            validation_issues=$((validation_issues + 1))
        fi
    done
    
    if [[ $validation_issues -gt 0 ]]; then
        echo ""
        echo "❌ Environment validation failed with $validation_issues issues"
        echo "Some tests may fail or be skipped"
        echo ""
    else
        echo ""
        echo "✅ Environment validation passed"
        echo ""
    fi
}

# ============================================================================
# RESULTS REPORTING
# ============================================================================

print_test_summary() {
    local test_end_time=$(date +%s)
    local total_duration=$((test_end_time - TEST_START_TIME))
    
    echo "================================================================"
    echo "Multi-Worktree Docker Coordination Test Summary"
    echo "================================================================"
    echo "Started: $(date -d "@$TEST_START_TIME" -Iseconds)"
    echo "Completed: $(date -Iseconds)"
    echo "Total Duration: ${total_duration}s"
    echo ""
    
    # Suite results
    echo "Test Suite Results:"
    for suite in "${TEST_SUITES[@]}"; do
        local result="${SUITE_RESULTS[$suite]:-SKIPPED}"
        local status_icon="❌"
        
        case "$result" in
            "PASSED")
                status_icon="✅"
                ;;
            "FAILED")
                status_icon="❌"
                ;;
            "NOT_FOUND"|"NOT_EXECUTABLE")
                status_icon="⚠️"
                ;;
            "SKIPPED")
                status_icon="⏭️"
                ;;
        esac
        
        echo "  $status_icon $suite: $result"
    done
    echo ""
    
    # Overall test counts
    local total_suites=${#TEST_SUITES[@]}
    local passed_suites=0
    local failed_suites=0
    
    for result in "${SUITE_RESULTS[@]}"; do
        case "$result" in
            "PASSED")
                passed_suites=$((passed_suites + 1))
                ;;
            "FAILED"|"NOT_FOUND"|"NOT_EXECUTABLE")
                failed_suites=$((failed_suites + 1))
                ;;
        esac
    done
    
    echo "Overall Results:"
    echo "  Test Suites: $passed_suites/$total_suites passed"
    
    if [[ -n "${TOTAL_PASSED:-}" ]]; then
        echo "  Individual Tests: ${TOTAL_PASSED:-0}/$((TOTAL_PASSED + TOTAL_FAILED)) passed"
    fi
    
    echo ""
    
    # Final status
    if [[ $passed_suites -eq $total_suites ]]; then
        echo "🎉 ALL TESTS PASSED"
        return 0
    else
        echo "❌ SOME TESTS FAILED"
        echo ""
        echo "Check detailed logs in: $TEST_RESULTS_DIR"
        echo "Main execution log: $TEST_LOG"
        return 1
    fi
}

generate_test_report() {
    local report_file="$TEST_RESULTS_DIR/test-report-$(date +%s).json"
    
    cat > "$report_file" << EOF
{
    "test_run": {
        "started_at": "$(date -d "@$TEST_START_TIME" -Iseconds)",
        "completed_at": "$(date -Iseconds)",
        "duration_seconds": $(($(date +%s) - TEST_START_TIME)),
        "environment": {
            "hostname": "$(hostname)",
            "os": "$(uname -s)",
            "kernel": "$(uname -r)",
            "docker_version": "$(docker --version 2>/dev/null || echo 'N/A')",
            "docker_compose_version": "$(docker-compose --version 2>/dev/null || echo 'N/A')"
        }
    },
    "test_suites": [
EOF
    
    local first_suite=true
    for suite in "${TEST_SUITES[@]}"; do
        if [[ "$first_suite" == true ]]; then
            first_suite=false
        else
            echo "," >> "$report_file"
        fi
        
        cat >> "$report_file" << EOF
        {
            "name": "$suite",
            "result": "${SUITE_RESULTS[$suite]:-SKIPPED}",
            "passed": ${SUITE_PASSED[$suite]:-0},
            "failed": ${SUITE_FAILED[$suite]:-0}
        }
EOF
    done
    
    cat >> "$report_file" << EOF
    ],
    "summary": {
        "total_suites": ${#TEST_SUITES[@]},
        "passed_suites": $passed_suites,
        "failed_suites": $failed_suites,
        "total_tests": ${TOTAL_PASSED:-0}$((${TOTAL_FAILED:-0} + ${TOTAL_PASSED:-0})),
        "passed_tests": ${TOTAL_PASSED:-0},
        "failed_tests": ${TOTAL_FAILED:-0}
    }
}
EOF
    
    echo "Test report generated: $report_file"
}

# ============================================================================
# CLEANUP FUNCTIONS
# ============================================================================

cleanup_test_environment() {
    echo "Cleaning up test environment..."
    
    # Clean up any test containers that might be left over
    docker ps -a --filter "name=cfn-test" -q | xargs -r docker rm -f >/dev/null 2>&1 || true
    
    # Clean up test networks
    docker network ls --filter "name=test-" -q | xargs -r docker network rm >/dev/null 2>&1 || true
    
    echo "Test environment cleanup complete"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    # Set up test runner
    setup_test_runner
    
    # Validate environment
    validate_test_environment
    
    # Trap for cleanup
    trap cleanup_test_environment EXIT
    
    # Run all test suites
    echo "Running test suites..."
    echo ""
    
    for suite in "${TEST_SUITES[@]}"; do
        run_test_suite "$suite"
    done
    
    # Print summary
    print_test_summary
    
    # Generate detailed report
    generate_test_report
    
    # Final cleanup
    cleanup_test_environment
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi