#!/bin/bash
# Shared Test Utilities for Redis Coordination Test Suite

# Assertion utilities
assert() {
    local condition="$1"
    local message="${2:-Assertion failed}"

    if ! eval "$condition"; then
        echo "❌ $message"
        return 1
    fi
    echo "✅ $message"
}

assert_equal() {
    local actual="$1"
    local expected="$2"
    local message="${3:-Values not equal}"

    if [ "$actual" != "$expected" ]; then
        echo "❌ $message: Expected '$expected', got '$actual'"
        return 1
    fi
    echo "✅ $message"
}

assert_not_empty() {
    local value="$1"
    local message="${2:-Value is empty}"

    if [ -z "$value" ]; then
        echo "❌ $message"
        return 1
    fi
    echo "✅ $message"
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Value not found}"

    if [[ ! "$haystack" == *"$needle"* ]]; then
        echo "❌ $message"
        return 1
    fi
    echo "✅ $message"
}

assert_json_valid() {
    local json="$1"
    local message="${2:-Invalid JSON}"

    if ! echo "$json" | jq empty >/dev/null 2>&1; then
        echo "❌ $message"
        return 1
    fi
    echo "✅ $message"
}

assert_empty() {
    local value="$1"
    local message="${2:-Value is not empty}"

    if [ -n "$value" ]; then
        echo "❌ $message"
        return 1
    fi
    echo "✅ $message"
}

# Test suite runner
run_tests() {
    local tests=("$@")
    local passed=0
    local failed=0
    local total=${#tests[@]}

    echo "Running $total test cases..."

    for test in "${tests[@]}"; do
        if "$test"; then
            ((passed++))
        else
            ((failed++))
        fi
    done

    echo "Test Summary: $passed/$total passed, $failed failed"

    if [ $failed -gt 0 ]; then
        return 1
    fi
    return 0
}

# Compute confidence score based on test results
compute_confidence_score() {
    local passed="$1"
    local total="$2"

    # Compute percentage, convert to 0-1 range
    local confidence=$(echo "scale=2; $passed / $total" | bc)
    echo "$confidence"
}

# Prepare for CFN Loop reporting
report_test_results() {
    local task_id="$1"
    local agent_id="$2"
    local passed="$3"
    local total="$4"

    local confidence=$(compute_confidence_score "$passed" "$total")

    ./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
        --task-id "$task_id" \
        --agent-id "$agent_id" \
        --confidence "$confidence" \
        --iteration 1
}