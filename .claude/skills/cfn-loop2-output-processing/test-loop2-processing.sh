#!/bin/bash
set -eu

# Loop 2 Output Processing: Comprehensive Test Suite

# Determine script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Test Helper Functions
setup() {
    mkdir -p /tmp/loop2-test
    cd /tmp/loop2-test
}

teardown() {
    rm -rf /tmp/loop2-test
}

assert_json_valid() {
    local output="$1"
    echo "DEBUG: Validating output: $output"
    echo "$output" | grep -q '{"confidence":' && \
    echo "$output" | grep -q '"feedback":{' && \
    echo "$output" | grep -q '"critical":\[' && \
    echo "$output" | grep -q '"warning":\[' && \
    echo "$output" | grep -q '"suggestion":\[' || return 1
}

run_test() {
    local testname="$1"
    local testfunc="$2"
    echo "Running test: $testname"
    $testfunc
    echo "✅ $testname passed"
}

# Test Cases
test_parse_high_confidence() {
    local test_input="Confidence is high. Critical: Authentication bypass in login.ts"
    echo "DEBUG: Input for high confidence test: $test_input"
    local output=$(echo "$test_input" | \
        "$SCRIPT_DIR/parse-feedback.sh")

    echo "DEBUG: Actual output: $output"
    assert_json_valid "$output"
    echo "$output" | grep -q '"confidence": 0.9'
    echo "$output" | grep -q '"critical": \["Authentication bypass in login.ts"\]'
}

test_parse_numeric_confidence() {
    local output=$(echo "Confidence: 0.85. Warning: Performance bottleneck detected." | \
        "$SCRIPT_DIR/parse-feedback.sh")

    assert_json_valid "$output"
    echo "$output" | grep -q '"confidence": 0.85'
    echo "$output" | grep -q '"warning": \["Performance bottleneck detected."\]'
}

test_parse_low_confidence() {
    local output=$(echo "Confidence is low. Suggestion: Consider refactoring." | \
        "$SCRIPT_DIR/parse-feedback.sh")

    assert_json_valid "$output"
    echo "$output" | grep -q '"confidence": 0.3'
    echo "$output" | grep -q '"suggestion": \["Consider refactoring."\]'
}

test_multiple_feedback_categories() {
    local output=$(echo "Confidence: 0.75. Critical: Security issue found. Warning: Performance problem. Suggestion: Code optimization." | \
        "$SCRIPT_DIR/parse-feedback.sh")

    assert_json_valid "$output"
    echo "$output" | grep -q '"confidence": 0.75'
    echo "$output" | grep -q '"critical": \["Security issue found."\]'
    echo "$output" | grep -q '"warning": \["Performance problem."\]'
    echo "$output" | grep -q '"suggestion": \["Code optimization."\]'
}

test_empty_output() {
    local output=$(echo "" | \
        "$SCRIPT_DIR/parse-feedback.sh")

    assert_json_valid "$output"
    echo "$output" | grep -q '"confidence": 0.0'
}

test_no_feedback() {
    local output=$(echo "Just a comment with no specific feedback" | \
        "$SCRIPT_DIR/parse-feedback.sh")

    assert_json_valid "$output"
    echo "$output" | grep -q '"confidence": 0.0'
    echo "$output" | grep -q '"critical": \[\]'
    echo "$output" | grep -q '"warning": \[\]'
    echo "$output" | grep -q '"suggestion": \[\]'
}

# Test Runner
main() {
    setup

    run_test "High Confidence Parsing" test_parse_high_confidence
    run_test "Numeric Confidence Parsing" test_parse_numeric_confidence
    run_test "Low Confidence Parsing" test_parse_low_confidence
    run_test "Multiple Feedback Categories" test_multiple_feedback_categories
    run_test "Empty Output Handling" test_empty_output
    run_test "No Specific Feedback" test_no_feedback

    teardown
    echo "All Loop 2 Output Processing tests passed successfully!"
}

main