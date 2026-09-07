#!/usr/bin/env bash
# tests/run-all-tests.sh
# Main test runner for API Gateway comprehensive test suite

set -euo pipefail

# Source test utilities
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/test-setup.sh"

# Test configuration
API_GATEWAY_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
TEST_RESULTS_DIR="$API_GATEWAY_ROOT/.test-data"
FINAL_RESULTS_FILE="$TEST_RESULTS_DIR/final-test-results.json"

# Test suites
declare -a TEST_SUITES=(
    "unit/test-kong-config.sh:Kong Configuration"
    "unit/test-jwt-auth.sh:JWT Authentication"
    "unit/test-nginx-config.sh:Nginx Configuration"
)

# Overall test counters
OVERALL_TOTAL=0
OVERALL_PASSED=0
OVERALL_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print test suite header
print_suite_header() {
    local suite_name=$1
    echo -e "\n${BLUE}================================================${NC}"
    echo -e "${BLUE}Running Test Suite: $suite_name${NC}"
    echo -e "${BLUE}================================================${NC}"
}

# Print test suite summary
print_suite_summary() {
    local suite_name=$1
    local total=$2
    local passed=$3
    local failed=$4
    local pass_rate=0
    
    if [[ $total -gt 0 ]]; then
        pass_rate=$(awk "BEGIN {printf \"%.2f\", $passed/$total}")
    fi
    
    echo -e "\n${BLUE}Suite Summary: $suite_name${NC}"
    echo -e "Total Tests: $total"
    echo -e "${GREEN}Passed: $passed${NC}"
    echo -e "${RED}Failed: $failed${NC}"
    echo -e "Pass Rate: $pass_rate"
    
    if [[ $(echo "$pass_rate >= 0.95" | bc -l 2>/dev/null || echo "0") -eq 1 ]]; then
        echo -e "${GREEN}✓ PASSED (≥95% pass rate)${NC}"
    else
        echo -e "${RED}✗ FAILED (<95% pass rate)${NC}"
    fi
}

# Run individual test suite
run_test_suite() {
    local test_file=$1
    local suite_name=$2
    local suite_path="$SCRIPT_DIR/$test_file"
    
    print_suite_header "$suite_name"
    
    if [[ ! -f "$suite_path" ]]; then
        echo -e "${RED}Test file not found: $suite_path${NC}"
        return 1
    fi
    
    # Make test file executable
    chmod +x "$suite_path"
    
    # Run the test suite
    if bash "$suite_path"; then
        local exit_code=0
    else
        local exit_code=$?
    fi
    
    # Extract results from test report
    local report_file="$TEST_RESULTS_DIR/$(basename "$test_file" .sh)-report.json"
    if [[ -f "$report_file" ]]; then
        local total=$(jq -r '.total_tests // 0' "$report_file" 2>/dev/null || echo "0")
        local passed=$(jq -r '.passed_tests // 0' "$report_file" 2>/dev/null || echo "0")
        local failed=$(jq -r '.failed_tests // 0' "$report_file" 2>/dev/null || echo "0")
        
        print_suite_summary "$suite_name" "$total" "$passed" "$failed"
        
        # Update overall counters
        ((OVERALL_TOTAL += total))
        ((OVERALL_PASSED += passed))
        ((OVERALL_FAILED += failed))
    else
        echo -e "${YELLOW}Warning: No test report found for $suite_name${NC}"
        ((OVERALL_FAILED++))
    fi
    
    return $exit_code
}

# Validate test environment
validate_test_environment() {
    log_info "Validating test environment..."
    
    # Check required commands
    local required_commands=("curl" "jq" "grep" "awk")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            log_warn "Required command not found: $cmd (some tests may fail)"
        fi
    done
    
    # Check directories
    if [[ ! -d "$API_GATEWAY_ROOT" ]]; then
        log_error "API Gateway root directory not found: $API_GATEWAY_ROOT"
        return 1
    fi
    
    # Create test data directory
    mkdir -p "$TEST_RESULTS_DIR"
    
    log_info "Test environment validation completed"
}

# Generate comprehensive test report
generate_final_report() {
    log_info "Generating comprehensive test report..."
    
    local overall_pass_rate=0
    if [[ $OVERALL_TOTAL -gt 0 ]]; then
        overall_pass_rate=$(awk "BEGIN {printf \"%.2f\", $OVERALL_PASSED/$OVERALL_TOTAL}")
    fi
    
    # Create final report
    cat > "$FINAL_RESULTS_FILE" << EOF
{
    "test_run": {
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "environment": "$TEST_ENV",
        "api_gateway_root": "$API_GATEWAY_ROOT",
        "test_runner_version": "1.0.0"
    },
    "summary": {
        "total_tests": $OVERALL_TOTAL,
        "passed_tests": $OVERALL_PASSED,
        "failed_tests": $OVERALL_FAILED,
        "pass_rate": $overall_pass_rate,
        "success": $([ $(echo "$overall_pass_rate >= 0.95" | bc -l 2>/dev/null || echo "0") -eq 1 ] && echo "true" || echo "false")
    },
    "test_suites": [
EOF

    # Add individual suite results
    local first_suite=true
    for suite_info in "${TEST_SUITES[@]}"; do
        local test_file="${suite_info%%:*}"
        local suite_name="${suite_info##*:}"
        local report_file="$TEST_RESULTS_DIR/$(basename "$test_file" .sh)-report.json"
        
        if [[ -f "$report_file" ]]; then
            if [[ "$first_suite" != "true" ]]; then
                echo "," >> "$FINAL_RESULTS_FILE"
            fi
            first_suite=false
            
            # Read and format suite results
            jq -c \
                --arg name "$suite_name" \
                --arg file "$test_file" \
                '. + {suite_name: $name, test_file: $file}' \
                "$report_file" >> "$FINAL_RESULTS_FILE"
        fi
    done
    
    cat >> "$FINAL_RESULTS_FILE" << EOF
    ],
    "thresholds": {
        "minimum_pass_rate": 0.95,
        "required_for_success": true
    },
    "recommendations": [
EOF

    # Add recommendations based on results
    local recommendations=()
    if [[ $(echo "$overall_pass_rate < 0.95" | bc -l 2>/dev/null || echo "1") -eq 1 ]]; then
        recommendations+=("\"Overall pass rate below 95% - review failed tests\"")
    fi
    
    if [[ $OVERALL_FAILED -gt 0 ]]; then
        recommendations+=("\"$OVERALL_FAILED tests failed - check test logs\"")
    fi
    
    if [[ $OVERALL_TOTAL -eq 0 ]]; then
        recommendations+=("\"No tests executed - check test configuration\"")
    fi
    
    # Add recommendations to report
    local first_rec=true
    for rec in "${recommendations[@]}"; do
        if [[ "$first_rec" != "true" ]]; then
            echo "," >> "$FINAL_RESULTS_FILE"
        fi
        first_rec=false
        echo "        $rec" >> "$FINAL_RESULTS_FILE"
    done
    
    cat >> "$FINAL_RESULTS_FILE" << EOF
    ]
}
EOF

    log_info "Final test report generated: $FINAL_RESULTS_FILE"
}

# Display final summary
display_final_summary() {
    local overall_pass_rate=0
    if [[ $OVERALL_TOTAL -gt 0 ]]; then
        overall_pass_rate=$(awk "BEGIN {printf \"%.2f\", $OVERALL_PASSED/$OVERALL_TOTAL}")
    fi
    
    echo -e "\n${BLUE}================================================${NC}"
    echo -e "${BLUE}FINAL TEST RESULTS${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo -e "Total Tests: $OVERALL_TOTAL"
    echo -e "${GREEN}Passed: $OVERALL_PASSED${NC}"
    echo -e "${RED}Failed: $OVERALL_FAILED${NC}"
    echo -e "Overall Pass Rate: $overall_pass_rate"
    
    if [[ $(echo "$overall_pass_rate >= 0.95" | bc -l 2>/dev/null || echo "0") -eq 1 ]]; then
        echo -e "\n${GREEN}🎉 ALL TESTS PASSED (≥95% pass rate)${NC}"
        echo -e "${GREEN}API Gateway configuration is ready for deployment${NC}"
    else
        echo -e "\n${RED}❌ TESTS FAILED (<95% pass rate)${NC}"
        echo -e "${RED}Please review failed tests before deployment${NC}"
    fi
    
    echo -e "\nDetailed report: $FINAL_RESULTS_FILE"
    echo -e "Test logs: $TEST_RESULTS_DIR/"
}

# Cleanup test environment
cleanup_tests() {
    log_info "Cleaning up test environment..."
    
    # Stop any running test servers
    pkill -f "node.*jwt" 2>/dev/null || true
    pkill -f "nginx.*test" 2>/dev/null || true
    
    # Clear test data (optional)
    if [[ "${KEEP_TEST_DATA:-false}" != "true" ]]; then
        rm -rf "$TEST_RESULTS_DIR"/*.tmp
    fi
}

# Main execution
main() {
    log_info "Starting API Gateway comprehensive test suite..."
    
    # Setup test environment
    setup_test_env
    validate_test_environment
    
    # Trap cleanup
    trap cleanup_tests EXIT
    
    # Run all test suites
    local failed_suites=0
    for suite_info in "${TEST_SUITES[@]}"; do
        local test_file="${suite_info%%:*}"
        local suite_name="${suite_info##*:}"
        
        if ! run_test_suite "$test_file" "$suite_name"; then
            ((failed_suites++))
        fi
    done
    
    # Generate final report
    generate_final_report
    display_final_summary
    
    # Return appropriate exit code
    if [[ $failed_suites -gt 0 ]]; then
        log_error "$failed_suites test suite(s) failed"
        return 1
    fi
    
    log_info "All test suites completed successfully"
    return 0
}

# Handle command line arguments
case "${1:-run}" in
    "run")
        main "$@"
        ;;
    "clean")
        cleanup_tests
        ;;
    "report")
        if [[ -f "$FINAL_RESULTS_FILE" ]]; then
            cat "$FINAL_RESULTS_FILE" | jq .
        else
            echo "No test report found. Run tests first."
            return 1
        fi
        ;;
    *)
        echo "Usage: $0 [run|clean|report]"
        echo "  run    - Run all test suites (default)"
        echo "  clean  - Cleanup test environment"
        echo "  report - Display last test report"
        exit 1
        ;;
esac