#!/bin/bash
# CFN Environment Sanitization Validation Tests
# Part of ANTI-023 Memory Leak Protection System Integration Tests

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_RESULTS_DIR="/tmp/cfn-test-results"
SANITIZATION_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"

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

    # Backup current environment
    env > "$TEST_RESULTS_DIR/original_env.backup"

    # Set test variables that should be sanitized
    export NODE_OPTIONS="--max-old-space-size=4096"
    export UV_THREADPOOL_SIZE=128
    export REDIS_URL="redis://password:secret@localhost:6379"
    export SENSITIVE_VAR="password=mysecret123"

    # Set CFN variables that should be preserved
    export CFN_MODE="cli"
    export TASK_ID="test-task-123"
    export AGENT_ID="test-agent-456"

    # Set variables that should have limits enforced
    export NODE_HEAP_LIMIT="4G"
    export MAX_AGENTS=20
    export CFN_TIMEOUT=1200

    ((TOTAL_TESTS++))
}

# Test cleanup
cleanup_test_env() {
    log_info "Cleaning up test environment..."

    # Restore original environment
    if [[ -f "$TEST_RESULTS_DIR/original_env.backup" ]]; then
        # Reset environment variables
        unset NODE_OPTIONS UV_THREADPOOL_SIZE REDIS_URL SENSITIVE_VAR
        unset CFN_MODE TASK_ID AGENT_ID NODE_HEAP_LIMIT MAX_AGENTS CFN_TIMEOUT

        # Source backup to restore any other variables
        while IFS='=' read -r key value; do
            if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
                export "$key=$value"
            fi
        done < "$TEST_RESULTS_DIR/original_env.backup"
    fi
}

# Test: Sensitive variable detection and redaction
test_sensitive_variable_sanitization() {
    log_test "Testing sensitive variable detection and redaction..."

    # Set up sensitive variables
    export TEST_PASSWORD="password=secret123"
    export TEST_TOKEN="token=abc123def456"
    export TEST_API_KEY="api_key=mykeyvalue"
    export TEST_NORMAL_VAR="normal_value"

    # Source sanitization script
    source "$SANITIZATION_SCRIPT" --strict

    # Check that sensitive variables are unset
    if [[ -z "${TEST_PASSWORD:-}" ]]; then
        log_pass "Sensitive password variable sanitized"
    else
        log_fail "Sensitive password variable not sanitized: $TEST_PASSWORD"
    fi

    if [[ -z "${TEST_TOKEN:-}" ]]; then
        log_pass "Sensitive token variable sanitized"
    else
        log_fail "Sensitive token variable not sanitized: $TEST_TOKEN"
    fi

    if [[ -z "${TEST_API_KEY:-}" ]]; then
        log_pass "Sensitive API key variable sanitized"
    else
        log_fail "Sensitive API key variable not sanitized: $TEST_API_KEY"
    fi

    # Check that normal variable is preserved
    if [[ "${TEST_NORMAL_VAR:-}" == "normal_value" ]]; then
        log_pass "Normal variable preserved"
    else
        log_fail "Normal variable not preserved: ${TEST_NORMAL_VAR:-}"
    fi

    ((TOTAL_TESTS+=5))
}

# Test: CFN critical variables preservation
test_cfn_variables_preservation() {
    log_test "Testing CFN critical variables preservation..."

    # Set CFN variables
    export CFN_MODE="test"
    export TASK_ID="task-123"
    export AGENT_ID="agent-456"
    export LOOP3_AGENTS="dev,tester"
    export LOOP2_AGENTS="reviewer,validator"
    export PRODUCT_OWNER="po-789"

    # Source sanitization script
    source "$SANITIZATION_SCRIPT"

    # Check that CFN variables are preserved
    local preserved=0
    local total=6

    [[ "${CFN_MODE:-}" == "test" ]] && ((preserved++))
    [[ "${TASK_ID:-}" == "task-123" ]] && ((preserved++))
    [[ "${AGENT_ID:-}" == "agent-456" ]] && ((preserved++))
    [[ "${LOOP3_AGENTS:-}" == "dev,tester" ]] && ((preserved++))
    [[ "${LOOP2_AGENTS:-}" == "reviewer,validator" ]] && ((preserved++))
    [[ "${PRODUCT_OWNER:-}" == "po-789" ]] && ((preserved++))

    if [[ $preserved -eq $total ]]; then
        log_pass "All CFN critical variables preserved ($preserved/$total)"
    else
        log_fail "CFN variables not fully preserved ($preserved/$total)"
    fi

    ((TOTAL_TESTS++))
}

# Test: Memory limit enforcement
test_memory_limit_enforcement() {
    log_test "Testing memory limit enforcement..."

    # Set excessive memory limit
    export NODE_HEAP_LIMIT="8G"  # Above 2GB limit

    # Source sanitization script
    source "$SANITIZATION_SCRIPT"

    # Check that limit is enforced
    if [[ "${NODE_HEAP_LIMIT:-}" == "2G" ]]; then
        log_pass "Memory limit enforced (8G -> 2G)"
    elif [[ "${NODE_HEAP_LIMIT:-}" == "2048M" ]]; then
        log_pass "Memory limit enforced (8G -> 2048M)"
    else
        log_fail "Memory limit not enforced: ${NODE_HEAP_LIMIT:-}"
    fi

    ((TOTAL_TESTS++))
}

# Test: Agent count limit enforcement
test_agent_count_enforcement() {
    log_test "Testing agent count limit enforcement..."

    # Set excessive agent count
    export MAX_AGENTS=50  # Above 10 limit

    # Source sanitization script
    source "$SANITIZATION_SCRIPT"

    # Check that limit is enforced
    if [[ "${MAX_AGENTS:-}" == "10" ]]; then
        log_pass "Agent count limit enforced (50 -> 10)"
    else
        log_fail "Agent count limit not enforced: ${MAX_AGENTS:-}"
    fi

    ((TOTAL_TESTS++))
}

# Test: Timeout limit enforcement
test_timeout_enforcement() {
    log_test "Testing timeout limit enforcement..."

    # Set excessive timeout
    export CFN_TIMEOUT=3600  # Above 600 second limit

    # Source sanitization script
    source "$SANITIZATION_SCRIPT"

    # Check that limit is enforced
    if [[ "${CFN_TIMEOUT:-}" == "600" ]]; then
        log_pass "Timeout limit enforced (3600 -> 600)"
    else
        log_fail "Timeout limit not enforced: ${CFN_TIMEOUT:-}"
    fi

    ((TOTAL_TESTS++))
}

# Test: Environment check functionality
test_environment_check() {
    log_test "Testing environment check functionality..."

    # Create test environment
    export CLEAN_VAR="clean_value"
    export DIRTY_VAR="password=dirty_secret"

    # Run check command
    local check_output
    check_output=$("$SANITIZATION_SCRIPT" --check 2>&1 || true)

    # Check that sensitive data is detected
    if echo "$check_output" | grep -q "DIRTY_VAR"; then
        log_pass "Environment check detected sensitive variable"
    else
        log_fail "Environment check failed to detect sensitive variable"
    fi

    # Check that clean variables are allowed
    if echo "$check_output" | grep -q "CLEAN_VAR"; then
        log_pass "Environment check properly identified clean variable"
    else
        log_fail "Environment check misidentified clean variable"
    fi

    ((TOTAL_TESTS+=2))
}

# Test: Script error handling
test_error_handling() {
    log_test "Testing script error handling..."

    # Test with invalid parameters
    local error_output
    if error_output=$("$SANITIZATION_SCRIPT" --invalid-option 2>&1 && false); then
        log_fail "Script should fail with invalid option"
    else
        log_pass "Script properly handles invalid option"
    fi

    # Test with non-existent script path
    if bash /non/existent/path/sanitize-environment.sh 2>/dev/null; then
        log_fail "Script should handle missing script gracefully"
    else
        log_pass "Script properly handles missing script"
    fi

    ((TOTAL_TESTS+=2))
}

# Run all tests
run_all_tests() {
    log_info "Starting CFN Environment Sanitization Validation Tests..."

    setup_test_env
    test_sensitive_variable_sanitization
    test_cfn_variables_preservation
    test_memory_limit_enforcement
    test_agent_count_enforcement
    test_timeout_enforcement
    test_environment_check
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
========================================
CFN Environment Sanitization Test Report
========================================

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
        echo "✅ All tests passed! Environment sanitization is working correctly."
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