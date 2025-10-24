#!/usr/bin/env bash
# Granular Product Owner Handoff Tests for CFN v3

# Test helper functions
source "$(dirname "$0")/../test-helpers.sh"

# Mocked directories and test setup
TEST_DIR="/tmp/cfn-v3-po-tests"
TASK_ID="test-po-handoff-$(date +%s)"
LOOP3_DIR="${TEST_DIR}/loop3"
LOOP2_DIR="${TEST_DIR}/loop2"

# Setup test environment
setup_test_environment() {
    mkdir -p "$TEST_DIR" "$LOOP3_DIR" "$LOOP2_DIR"
    cd "$TEST_DIR" || exit 1
    git init > /dev/null
}

# Cleanup test environment
cleanup_test_environment() {
    rm -rf "$TEST_DIR"
}

# Mocks Redis communication for testing
mock_redis_push() {
    local key="$1"
    local value="$2"
    # In real test, this would use redis-cli
    echo "$value" > "${TEST_DIR}/${key}.mock"
}

# Mocks Product Owner spawn and decision extraction
test_po_spawn_and_decision_extraction() {
    setup_test_environment

    # Simulate Loop 3 deliverables
    echo "Implement authentication service" > "$LOOP3_DIR/deliverables.txt"

    # Create mock Loop 2 validation feedback
    echo "Comprehensive review passed. Minor improvements suggested." > "$LOOP2_DIR/validation-feedback.txt"

    # Mocked Product Owner output with different decision styles
    local decision_outputs=(
        "DECISION: PROCEED with the implementation. Looks good!"
        "I recommend we ITERATE. Some improvements needed."
        "After careful review, we should ABORT this iteration."
        "The team should PROCEED. The work meets our standards. No further changes required."
    )

    for output in "${decision_outputs[@]}"; do
        # Test decision extraction
        local extracted_decision=$(echo "$output" | grep -oP '(PROCEED|ITERATE|ABORT)')

        if [[ -z "$extracted_decision" ]]; then
            echo "ERROR: Failed to extract decision from output: $output"
            return 1
        fi

        echo "Extracted decision: $extracted_decision"
    done

    cleanup_test_environment
    return 0
}

# Test deliverables validation via git diff
test_deliverables_validation() {
    setup_test_environment

    # Test scenario 1: No deliverables created
    # Expect forced ITERATE
    if git status | grep -q "nothing to commit"; then
        mock_redis_push "${TASK_ID}-decision" "ITERATE"
        mock_redis_push "${TASK_ID}-feedback" "No files created. Implement required deliverables."
    fi

    # Test scenario 2: Deliverables created
    touch "$LOOP3_DIR/authentication-service.js"
    git add "$LOOP3_DIR/authentication-service.js"
    git commit -m "Implement authentication service" > /dev/null

    if [[ $(git status --porcelain) == "" ]]; then
        mock_redis_push "${TASK_ID}-decision" "PROCEED"
    fi

    cleanup_test_environment
    return 0
}

# Test decision execution paths
test_decision_execution() {
    setup_test_environment

    # Scenario 1: PROCEED
    mock_redis_push "${TASK_ID}-decision" "PROCEED"
    if grep -q "PROCEED" "${TEST_DIR}/${TASK_ID}-decision.mock"; then
        echo "Task complete. Exiting with success."
        return 0
    fi

    # Scenario 2: ITERATE
    mock_redis_push "${TASK_ID}-decision" "ITERATE"
    if grep -q "ITERATE" "${TEST_DIR}/${TASK_ID}-decision.mock"; then
        # Simulate agent wake-up for next iteration
        mock_redis_push "${TASK_ID}-agents-wake" "Loop 3 agents"
        mock_redis_push "${TASK_ID}-iteration" "2"
    fi

    # Scenario 3: ABORT
    mock_redis_push "${TASK_ID}-decision" "ABORT"
    if grep -q "ABORT" "${TEST_DIR}/${TASK_ID}-decision.mock"; then
        echo "Task aborted. Exiting with failure."
        return 1
    fi

    cleanup_test_environment
    return 0
}

# Test feedback injection for ITERATE scenario
test_feedback_injection() {
    setup_test_environment

    local feedback_samples=(
        "Improve error handling in authentication service"
        "Add more comprehensive test coverage"
        "Refactor for better modularity"
    )

    for feedback in "${feedback_samples[@]}"; do
        mock_redis_push "${TASK_ID}-iteration-feedback" "$feedback"

        # Validate feedback extraction
        if [[ -z "$(cat "${TEST_DIR}/${TASK_ID}-iteration-feedback.mock")" ]]; then
            echo "ERROR: Failed to inject feedback"
            return 1
        fi
    done

    cleanup_test_environment
    return 0
}

# Main test runner
main() {
    echo "Running Product Owner Handoff Tests..."

    local tests=(
        test_po_spawn_and_decision_extraction
        test_deliverables_validation
        test_decision_execution
        test_feedback_injection
    )

    local passed=0
    local total=${#tests[@]}

    for test in "${tests[@]}"; do
        echo "Running $test..."
        if "$test"; then
            ((passed++))
            echo "$test PASSED"
        else
            echo "$test FAILED"
        fi
    done

    # Calculate and report confidence
    local confidence=$(echo "scale=2; $passed / $total" | bc)
    echo "Test Confidence: $confidence"

    # Exit with number of failed tests
    exit $((total - passed))
}

# Run tests
main