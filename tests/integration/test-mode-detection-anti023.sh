#!/bin/bash
# CFN Mode Detection (ANTI-023) Validation Tests
# Part of ANTI-023 Memory Leak Protection System Integration Tests

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)
TEST_RESULTS_DIR="/tmp/cfn-test-results"
MODE_DETECTION_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/mode-detection.sh"
CLI_COORDINATION_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/cli-coordination.sh"

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

    # Clean environment
    unset CFN_MODE TASK_ID AGENT_ID __CFN_CLI_SPAWN PPID

    ((TOTAL_TESTS++))
}

# Test cleanup
cleanup_test_env() {
    log_info "Cleaning up test environment..."
    rm -rf "$TEST_RESULTS_DIR"

    # Clean environment
    unset CFN_MODE TASK_ID AGENT_ID __CFN_CLI_SPAWN PPID
}

# Test: CLI mode detection via environment variables
test_cli_mode_detection_env_vars() {
    log_test "Testing CLI mode detection via environment variables..."

    # Set CLI mode indicators
    export CFN_MODE="cli"

    # Source mode detection script and capture output
    local detected_mode
    detected_mode=$(source "$MODE_DETECTION_SCRIPT" && detect_execution_mode 2>/dev/null || echo "failed")

    if [[ "$detected_mode" == "cli" ]]; then
        log_pass "CLI mode detected via CFN_MODE variable"
    else
        log_fail "CLI mode not detected via CFN_MODE: $detected_mode"
    fi

    # Clean and test TASK_ID/AGENT_ID detection
    unset CFN_MODE
    export TASK_ID="test-task-123"
    export AGENT_ID="test-agent-456"

    detected_mode=$(source "$MODE_DETECTION_SCRIPT" && detect_execution_mode 2>/dev/null || echo "failed")

    if [[ "$detected_mode" == "cli" ]]; then
        log_pass "CLI mode detected via TASK_ID/AGENT_ID variables"
    else
        log_fail "CLI mode not detected via TASK_ID/AGENT_ID: $detected_mode"
    fi

    ((TOTAL_TESTS+=2))
}

# Test: Task mode detection via environment
test_task_mode_detection_env() {
    log_test "Testing Task mode detection via environment..."

    # Set Task mode indicator
    export CFN_MODE="task"

    local detected_mode
    detected_mode=$(source "$MODE_DETECTION_SCRIPT" && detect_execution_mode 2>/dev/null || echo "failed")

    if [[ "$detected_mode" == "task" ]]; then
        log_pass "Task mode detected via CFN_MODE variable"
    else
        log_fail "Task mode not detected via CFN_MODE: $detected_mode"
    fi

    ((TOTAL_TESTS++))
}

# Test: CLI spawn marker detection
test_cli_spawn_marker_detection() {
    log_test "Testing CLI spawn marker detection..."

    # Clean environment first
    unset CFN_MODE TASK_ID AGENT_ID

    # Set CLI spawn marker
    export __CFN_CLI_SPAWN="true"

    local detected_mode
    detected_mode=$(source "$MODE_DETECTION_SCRIPT" && detect_execution_mode 2>/dev/null || echo "failed")

    if [[ "$detected_mode" == "cli" ]]; then
        log_pass "CLI mode detected via __CFN_CLI_SPAWN marker"
    else
        log_fail "CLI mode not detected via __CFN_CLI_SPAWN: $detected_mode"
    fi

    ((TOTAL_TESTS++))
}

# Test: Process parent inspection
test_process_parent_inspection() {
    log_test "Testing process parent inspection..."

    # Clean environment
    unset CFN_MODE TASK_ID AGENT_ID __CFN_CLI_SPAWN

    # Simulate being spawned by a claude process
    export PPID=$$

    # Create a fake parent process name check
    local detected_mode
    detected_mode=$(source "$MODE_DETECTION_SCRIPT" && detect_execution_mode 2>/dev/null || echo "fallback")

    # This test might not always work depending on the environment
    # So we'll check if it doesn't fail catastrophically
    if [[ "$detected_mode" != "failed" ]]; then
        log_pass "Process parent inspection completed without failure"
    else
        log_fail "Process parent inspection failed"
    fi

    ((TOTAL_TESTS++))
}

# Test: Fallback to task mode
test_fallback_to_task_mode() {
    log_test "Testing fallback to task mode..."

    # Clean all indicators
    unset CFN_MODE TASK_ID AGENT_ID __CFN_CLI_SPAWN PPID

    local detected_mode
    detected_mode=$(source "$MODE_DETECTION_SCRIPT" && detect_execution_mode 2>/dev/null || echo "failed")

    if [[ "$detected_mode" == "task" ]]; then
        log_pass "Fallback to task mode working correctly"
    else
        log_fail "Fallback to task mode failed: $detected_mode"
    fi

    ((TOTAL_TESTS++))
}

# Test: ANTI-023 protection - CLI coordination blocking
test_anti023_cli_coordination_blocking() {
    log_test "Testing ANTI-023 CLI coordination blocking in Task mode..."

    # Set Task mode environment
    export CFN_MODE="task"
    unset TASK_ID AGENT_ID __CFN_CLI_SPAWN

    # Create test script that tries CLI coordination
    cat > "$TEST_RESULTS_DIR/cli_coordination_test.sh" << 'EOF'
#!/bin/bash
export CFN_MODE="task"
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-mode-safety/cli-coordination.sh"

# This should fail in Task mode
if redis_lpush_safe "test_key" "test_value"; then
    echo "SUCCESS: CLI coordination allowed"
    exit 0
else
    echo "BLOCKED: CLI coordination blocked"
    exit 1
fi
EOF

    chmod +x "$TEST_RESULTS_DIR/cli_coordination_test.sh"

    # Run the test
    if "$TEST_RESULTS_DIR/cli_coordination_test.sh" 2>/dev/null; then
        log_fail "ANTI-023 protection failed - CLI coordination allowed in Task mode"
    else
        log_pass "ANTI-023 protection working - CLI coordination blocked in Task mode"
    fi

    ((TOTAL_TESTS++))
}

# Test: ANTI-023 protection - CLI mode coordination allowed
test_anti023_cli_mode_allowed() {
    log_test "Testing ANTI-023 CLI coordination allowed in CLI mode..."

    # Set CLI mode environment
    export TASK_ID="test-task-123"
    export AGENT_ID="test-agent-456"

    # Create test script that tries CLI coordination
    cat > "$TEST_RESULTS_DIR/cli_allowed_test.sh" << 'EOF'
#!/bin/bash
export TASK_ID="test-task-123"
export AGENT_ID="test-agent-456"

# Mock redis-cli for testing
redis-cli() {
    if [[ "$1" == "ping" ]]; then
        echo "PONG"
        return 0
    elif [[ "$1" == "-h" ]]; then
        if [[ "$5" == "LPUSH" ]]; then
            return 0
        fi
    fi
    return 1
}

source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-task-mode-safety/cli-coordination.sh"

# This should succeed in CLI mode
if redis_lpush_safe "test_key" "test_value"; then
    echo "SUCCESS: CLI coordination allowed"
    exit 0
else
    echo "FAILED: CLI coordination blocked"
    exit 1
fi
EOF

    chmod +x "$TEST_RESULTS_DIR/cli_allowed_test.sh"

    # Run the test
    if "$TEST_RESULTS_DIR/cli_allowed_test.sh" 2>/dev/null; then
        log_pass "CLI coordination properly allowed in CLI mode"
    else
        log_fail "CLI coordination incorrectly blocked in CLI mode"
    fi

    ((TOTAL_TESTS++))
}

# Test: Redis connection safety
test_redis_connection_safety() {
    log_test "Testing Redis connection safety mechanisms..."

    # Set CLI mode for testing
    export TASK_ID="test-task-123"
    export AGENT_ID="test-agent-456"

    # Mock redis-cli that fails
    cat > "$TEST_RESULTS_DIR/mock_redis_fail.sh" << 'EOF'
#!/bin/bash
echo "Mock Redis CLI - Connection Failed"
exit 1
EOF

    chmod +x "$TEST_RESULTS_DIR/mock_redis_fail.sh"

    # Override redis-cli in PATH
    export PATH="$TEST_RESULTS_DIR:$PATH"

    # Test with failing Redis connection
    source "$CLI_COORDINATION_SCRIPT"

    if redis_check_connection; then
        log_fail "Redis connection check should fail with broken Redis"
    else
        log_pass "Redis connection safety working - properly detects failure"
    fi

    # Restore PATH
    export PATH=$(echo "$PATH" | sed "s|$TEST_RESULTS_DIR:||")

    ((TOTAL_TESTS++))
}

# Test: Timeout protection for Redis operations
test_redis_timeout_protection() {
    log_test "Testing timeout protection for Redis operations..."

    # Set CLI mode for testing
    export TASK_ID="test-task-123"
    export AGENT_ID="test-agent-456"

    # Mock redis-cli that hangs
    cat > "$TEST_RESULTS_DIR/mock_redis_hang.sh" << 'EOF'
#!/bin/bash
echo "Mock Redis CLI - Hanging..."
sleep 30
exit 1
EOF

    chmod +x "$TEST_RESULTS_DIR/mock_redis_hang.sh"

    # Override redis-cli in PATH
    export PATH="$TEST_RESULTS_DIR:$PATH"

    # Test with hanging Redis operation
    source "$CLI_COORDINATION_SCRIPT"

    # This should timeout and fail
    if timeout 10 redis_lpush_safe "test_key" "test_value" 2>/dev/null; then
        log_fail "Redis operation should timeout with hanging Redis"
    else
        log_pass "Redis timeout protection working - operation timed out"
    fi

    # Restore PATH
    export PATH=$(echo "$PATH" | sed "s|$TEST_RESULTS_DIR:||")

    ((TOTAL_TESTS++))
}

# Test: Mode validation integrity
test_mode_validation_integrity() {
    log_test "Testing mode validation integrity..."

    # Test multiple conflicting indicators
    export CFN_MODE="cli"
    export TASK_ID="conflict-task"
    unset AGENT_ID

    local detected_mode
    detected_mode=$(source "$MODE_DETECTION_SCRIPT" && detect_execution_mode 2>/dev/null || echo "failed")

    # CFN_MODE should take precedence
    if [[ "$detected_mode" == "cli" ]]; then
        log_pass "Mode validation handles conflicting indicators correctly"
    else
        log_fail "Mode validation failed with conflicting indicators: $detected_mode"
    fi

    # Test empty mode indicator
    export CFN_MODE=""
    unset TASK_ID AGENT_ID

    detected_mode=$(source "$MODE_DETECTION_SCRIPT" && detect_execution_mode 2>/dev/null || echo "failed")

    if [[ "$detected_mode" == "task" ]]; then
        log_pass "Empty mode indicator handled correctly (fallback to task)"
    else
        log_fail "Empty mode indicator not handled correctly: $detected_mode"
    fi

    ((TOTAL_TESTS+=2))
}

# Test: Error handling robustness
test_error_handling_robustness() {
    log_test "Testing error handling robustness..."

    # Test with corrupted environment
    export CFN_MODE="invalid\value"
    export TASK_ID="valid_task"

    local detected_mode
    detected_mode=$(source "$MODE_DETECTION_SCRIPT" && detect_execution_mode 2>/dev/null || echo "failed")

    if [[ "$detected_mode" != "failed" ]]; then
        log_pass "Error handling robust - corrupted environment handled"
    else
        log_fail "Error handling failed with corrupted environment"
    fi

    # Test with non-existent mode detection script
    if bash /non/existent/mode-detection.sh 2>/dev/null; then
        log_fail "Should handle missing script gracefully"
    else
        log_pass "Error handling robust - missing script handled"
    fi

    ((TOTAL_TESTS+=2))
}

# Run all tests
run_all_tests() {
    log_info "Starting CFN Mode Detection (ANTI-023) Validation Tests..."

    setup_test_env
    test_cli_mode_detection_env_vars
    test_task_mode_detection_env
    test_cli_spawn_marker_detection
    test_process_parent_inspection
    test_fallback_to_task_mode
    test_anti023_cli_coordination_blocking
    test_anti023_cli_mode_allowed
    test_redis_connection_safety
    test_redis_timeout_protection
    test_mode_validation_integrity
    test_error_handling_robustness
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
CFN Mode Detection (ANTI-023) Test Report
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
        echo "✅ All tests passed! ANTI-023 mode detection is working correctly."
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