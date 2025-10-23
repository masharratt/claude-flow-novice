#!/bin/bash

# BUG #30 Regression Test - Validator Spawn Fixes
# Comprehensive test for validator spawning in Phases 5-6

set -euo pipefail

# Logging and output configuration
LOG_FILE="/tmp/bug30-validator-spawn-test.log"
RESULTS_FILE="/tmp/bug30-validator-spawn-results.txt"

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Initialize test tracking
PASS_COUNT=0
TOTAL_TESTS=5

# Utility Functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

test_result() {
    local test_name="$1"
    local result="$2"
    local message="${3:-}"

    if [ "$result" -eq 0 ]; then
        echo -e "[${GREEN}PASS${NC}] $test_name" | tee -a "$RESULTS_FILE"
        ((PASS_COUNT++))
    else
        echo -e "[${RED}FAIL${NC}] $test_name ${message:+(}$message${message:+)}" | tee -a "$RESULTS_FILE"
    fi
}

cleanup() {
    # Clean up any leftover resources
    rm -f /tmp/complex-context.json
    redis-cli del "test:bug30:task-id" >/dev/null 2>&1 || true
}

# Setup: Create a unique task ID and mock complex context
setup_test() {
    TASK_ID="bug30-test-$(date +%s)-$RANDOM"

    # Create a complex context JSON with special characters
    cat > /tmp/complex-context.json <<EOF
{
    "task_name": "Test \"Validator\" Spawn w/ Special Ch@r$",
    "phase": "5-6",
    "sensitive_data": "'; DROP TABLE users; --",
    "nested": {
        "array": ["value1", "value with spaces", "!@#$%^&*()"],
        "unicode": "テスト文字"
    }
}
EOF

    # Store task ID in Redis for tracking
    redis-cli set "test:bug30:task-id" "$TASK_ID" >/dev/null
}

# Test 1: Context Sanitization
test_context_sanitization() {
    local result=0
    npx cfn-spawn agent "loop2-validator" \
        --task-id "$TASK_ID" \
        --context-file "/tmp/complex-context.json" \
        || result=$?

    test_result "Context Sanitization" "$result" "Validator spawn failed with complex context"
    return "$result"
}

# Test 2: Environment Validation
test_environment_validation() {
    local result=0
    (
        unset REDIS_HOST HOME PATH
        npx cfn-spawn agent "loop2-validator" \
            --task-id "$TASK_ID" \
            || exit 1
    ) || result=$?

    test_result "Environment Validation" "$result" "Validator spawn succeeded with missing environment variables"
    return "$result"
}

# Test 3: Parallel Spawn (Phases 1-4)
test_parallel_spawn() {
    local result=0
    (
        npx cfn-spawn agent "loop2-validator-1" \
            --task-id "$TASK_ID-parallel-1" \
            --phase 4 &
        npx cfn-spawn agent "loop2-validator-2" \
            --task-id "$TASK_ID-parallel-2" \
            --phase 4 &

        wait $(jobs -p)
    ) || result=$?

    test_result "Parallel Spawn (Phases 1-4)" "$result" "Parallel validator spawn failed"
    return "$result"
}

# Test 4: Sequential Spawn (Phases 5-6)
test_sequential_spawn() {
    local result=0
    (
        npx cfn-spawn agent "loop2-validator-1" \
            --task-id "$TASK_ID-sequential-1" \
            --phase 5 || exit 1
        npx cfn-spawn agent "loop2-validator-2" \
            --task-id "$TASK_ID-sequential-2" \
            --phase 6 || exit 1
    ) || result=$?

    test_result "Sequential Spawn (Phases 5-6)" "$result" "Sequential validator spawn failed"
    return "$result"
}

# Test 5: Error Logging
test_error_logging() {
    local result=0
    local error_log="/tmp/bug30-error-log.txt"

    npx cfn-spawn agent "invalid-agent-type" \
        --task-id "$TASK_ID" \
        2>"$error_log" || result=$?

    if [ "$result" -eq 0 ]; then
        result=1  # Expecting a failure
    else
        # Check if error log contains actionable information
        if grep -qE "Invalid agent type|Error spawning agent" "$error_log"; then
            result=0
        else
            result=1
        fi
    fi

    test_result "Error Logging" "$result" "No actionable error message found"
    return "$result"
}

# Main Test Execution
main() {
    log "Starting BUG #30 Regression Test - Validator Spawn Fixes"

    # Cleanup any previous test artifacts
    cleanup

    # Setup test environment
    setup_test

    # Run tests
    test_context_sanitization || true
    test_environment_validation || true
    test_parallel_spawn || true
    test_sequential_spawn || true
    test_error_logging || true

    # Calculate confidence score
    CONFIDENCE=$(echo "scale=2; $PASS_COUNT / $TOTAL_TESTS" | bc)

    # Print final results
    echo "========================================" | tee -a "$RESULTS_FILE"
    echo "BUG #30 Regression Test - Validator Spawn Fixes" | tee -a "$RESULTS_FILE"
    echo "========================================" | tee -a "$RESULTS_FILE"
    echo "TESTS PASSED: $PASS_COUNT/$TOTAL_TESTS" | tee -a "$RESULTS_FILE"
    echo "CONFIDENCE: $CONFIDENCE" | tee -a "$RESULTS_FILE"
    echo "========================================" | tee -a "$RESULTS_FILE"

    # Cleanup
    cleanup

    # Exit with non-zero if not all tests passed
    [ "$PASS_COUNT" -eq "$TOTAL_TESTS" ]
}

# Ensure script is executable and run main function
main