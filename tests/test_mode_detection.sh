#!/bin/bash
# Regression test for mode detection functionality
# Tests ANTI-023 guardrails to ensure Task/CLI mode separation works correctly

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE_DETECTION_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/mode-detection.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

run_test() {
    local test_name="$1"
    local expected_mode="$2"
    local test_env="$3"

    ((TESTS_TOTAL++))
    log_info "Testing: $test_name"

    # Create isolated test environment
    local temp_env=$(mktemp)
    trap "rm -f $temp_env" EXIT

    # Set up test environment
    if [[ -n "$test_env" ]]; then
        echo "$test_env" > "$temp_env"
    fi

    # Clear all relevant environment variables
    unset TASK_ID AGENT_ID CFN_MODE LOOP3_AGENTS

    # Apply test environment if provided
    if [[ -n "$test_env" ]]; then
        eval "$test_env"
    fi

    # Source and execute mode detection
    local detected_mode
    if [[ -f "$MODE_DETECTION_SCRIPT" ]]; then
        source "$MODE_DETECTION_SCRIPT"
        detected_mode=$(detect_execution_mode 2>/dev/null)  # Suppress stderr, capture stdout only
    else
        detected_mode="SCRIPT_NOT_FOUND"
    fi

    # Validate result
    if [[ "$detected_mode" == "$expected_mode" ]]; then
        log_success "$test_name -> $detected_mode"
    else
        log_error "$test_name -> Expected: $expected_mode, Got: $detected_mode"
    fi
}

# Main test execution
main() {
    echo "=== CFN Mode Detection Regression Test Suite ==="
    echo "Testing ANTI-023 guardrails..."
    echo

    # Verify mode detection script exists
    if [[ ! -f "$MODE_DETECTION_SCRIPT" ]]; then
        log_error "Mode detection script not found: $MODE_DETECTION_SCRIPT"
        exit 1
    fi

    # Test 1: CLI Mode with TASK_ID and AGENT_ID
    run_test "CLI Mode - Full environment" "cli" "
        export TASK_ID='task_123'
        export AGENT_ID='agent_456'
        export CFN_MODE='cli'
    "

    # Test 2: Task Mode with CFN_MODE=task
    run_test "Task Mode - CFN_MODE=task" "task" "
        export CFN_MODE='task'
    "

    # Test 3: Task Mode - No environment variables
    run_test "Task Mode - Empty environment" "task" ""

    # Test 4: CLI Mode with LOOP3_AGENTS (coordinator context)
    run_test "CLI Mode - Coordinator context" "cli" "
        export LOOP3_AGENTS='reviewer,tester,implementer'
        export TASK_ID='task_789'
    "

    # Test 5: Task Mode - Missing TASK_ID
    run_test "Task Mode - Missing TASK_ID" "task" "
        export AGENT_ID='agent_123'
        export CFN_MODE='cli'
    "

    # Test 6: Task Mode - Missing AGENT_ID
    run_test "Task Mode - Missing AGENT_ID" "task" "
        export TASK_ID='task_456'
        export CFN_MODE='cli'
    "

    # Test 7: Edge case - Empty TASK_ID
    run_test "Task Mode - Empty TASK_ID" "task" "
        export TASK_ID=''
        export AGENT_ID='agent_789'
    "

    # Test 8: Mode validation functions
    log_info "Testing mode validation functions..."
    ((TESTS_TOTAL++))

    if source "$MODE_DETECTION_SCRIPT" 2>/dev/null; then
        if command -v is_task_mode >/dev/null 2>&1 && command -v is_cli_mode >/dev/null 2>&1; then
            # Test is_task_mode function
            if TASK_ID='' AGENT_ID='' is_task_mode 2>/dev/null; then
                log_success "is_task_mode function works"
            else
                log_error "is_task_mode function failed"
            fi

            # Test is_cli_mode function
            if TASK_ID='test' AGENT_ID='test' is_cli_mode 2>/dev/null; then
                log_success "is_cli_mode function works"
            else
                log_error "is_cli_mode function failed"
            fi
        else
            log_error "Mode validation functions not found"
        fi
    else
        log_error "Failed to source mode detection script"
    fi

    # Results summary
    echo
    echo "=== Test Results ==="
    echo "Total tests: $TESTS_TOTAL"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✅ All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ $TESTS_FAILED tests failed!${NC}"
        exit 1
    fi
}

# Run tests
main "$@"