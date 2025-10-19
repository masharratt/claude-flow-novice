#!/bin/bash
# Utility functions for quorum testing

# Check absolute quorum
check_quorum() {
    local total_agents="$1"
    local quorum="$2"
    local completed_agents="$3"

    if [ "$completed_agents" -ge "$quorum" ]; then
        echo "SUCCESS"
    else
        echo "FAILURE"
    fi
}

# Check percentage-based quorum
check_percentage_quorum() {
    local total_agents="$1"
    local quorum_percentage="$2"
    local completed_agents="$3"

    # Calculate the minimum number of agents required (round up)
    local required_agents=$(echo "scale=0; ceil($total_agents * $quorum_percentage)" | bc)

    if [ "$completed_agents" -ge "$required_agents" ]; then
        echo "SUCCESS"
    else
        echo "FAILURE"
    fi
}

# Graceful degradation strategy
simulate_graceful_degradation() {
    local total_agents="$1"
    local initial_quorum="$2"
    local max_failures="$3"

    # Dynamically adjust quorum based on failures
    local current_quorum="$initial_quorum"
    local adjusted_agents=$((total_agents - max_failures))
    local adjusted_quorum_threshold=$(echo "scale=2; $current_quorum * 0.8" | bc)

    if (( $(echo "$adjusted_quorum_threshold <= 0.65" | bc -l) )); then
        echo "HALT"  # Prevent degradation below minimum viable quorum
    else
        echo "$(check_percentage_quorum "$adjusted_agents" "$adjusted_quorum_threshold" "$adjusted_agents")"
    fi
}

# Assertion functions
assert_equals() {
    local actual="$1"
    local expected="$2"
    local message="${3:-Assertion failed}"

    if [ "$actual" != "$expected" ]; then
        echo "FAIL: $message (Expected: $expected, Got: $actual)"
        exit 1
    fi
}

assert_greater_than() {
    local actual="$1"
    local expected="$2"
    local message="${3:-Assertion failed}"

    if [ "$actual" -le "$expected" ]; then
        echo "FAIL: $message (Expected > $expected, Got: $actual)"
        exit 1
    fi
}

assert_not_empty() {
    local value="$1"
    local message="${2:-Value is empty}"

    if [ -z "$value" ]; then
        echo "FAIL: $message"
        exit 1
    fi
}

# Error handling and logging
log_error() {
    local message="$1"
    echo "[ERROR] $message" >&2
}

# Cleanup function
cleanup() {
    # Remove any temporary files or reset test environments
    echo "Cleaning up test environment..."
}

# Trap to ensure cleanup happens even if script fails
trap cleanup EXIT