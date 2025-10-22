#!/bin/bash
# Quorum Absolute Test Case
# Tests absolute quorum scenarios

source "$(dirname "$0")/test-utils.sh"

# Test Scenario 1: 6/7 agents complete, quorum=6 → SUCCESS
test_absolute_quorum_success() {
    local total_agents=7
    local quorum=6
    local completed_agents=6

    local result=$(check_quorum "$total_agents" "$quorum" "$completed_agents")
    assert_equals "$result" "SUCCESS" "Quorum not reached when 6/7 agents complete (quorum=6)"
}

# Test Scenario 2: 5/7 agents complete, quorum=6 → FAILURE
test_absolute_quorum_failure() {
    local total_agents=7
    local quorum=6
    local completed_agents=5

    local result=$(check_quorum "$total_agents" "$quorum" "$completed_agents")
    assert_equals "$result" "FAILURE" "Quorum incorrectly reached when only 5/7 agents complete (quorum=6)")
}

# Test Scenario 3: 7/7 agents complete, quorum=5 → SUCCESS
test_absolute_quorum_full_success() {
    local total_agents=7
    local quorum=5
    local completed_agents=7

    local result=$(check_quorum "$total_agents" "$quorum" "$completed_agents")
    assert_equals "$result" "SUCCESS" "Quorum not reached when all 7/7 agents complete (quorum=5)")
}

# Run the tests
main() {
    test_absolute_quorum_success
    test_absolute_quorum_failure
    test_absolute_quorum_full_success
    echo "Absolute Quorum Test Complete"
}

main