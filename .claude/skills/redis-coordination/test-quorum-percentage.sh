#!/bin/bash
# Quorum Percentage Test Case
# Tests percentage-based quorum scenarios

source "$(dirname "$0")/test-utils.sh"

# Test Scenario 1: 80% of 10 agents = 8 required, 8/10 complete → SUCCESS
test_percentage_quorum_success() {
    local total_agents=10
    local quorum_percentage=0.8
    local completed_agents=8

    local result=$(check_percentage_quorum "$total_agents" "$quorum_percentage" "$completed_agents")
    assert_equals "$result" "SUCCESS" "Quorum not reached when 8/10 agents complete (80% required)"
}

# Test Scenario 2: 80% of 10 agents = 8 required, 7/10 complete → FAILURE
test_percentage_quorum_failure() {
    local total_agents=10
    local quorum_percentage=0.8
    local completed_agents=7

    local result=$(check_percentage_quorum "$total_agents" "$quorum_percentage" "$completed_agents")
    assert_equals "$result" "FAILURE" "Quorum incorrectly reached when only 7/10 agents complete (80% required)"
}

# Test Scenario 3: 90% of 5 agents = 4.5 → 5 required (round up)
test_percentage_quorum_round_up() {
    local total_agents=5
    local quorum_percentage=0.9
    local completed_agents=5

    local result=$(check_percentage_quorum "$total_agents" "$quorum_percentage" "$completed_agents")
    assert_equals "$result" "SUCCESS" "Quorum not reached when all 5/5 agents complete (90% required)"
}

# Test Scenario 4: 90% of 5 agents = 4.5 → 5 required, 4/5 complete → FAILURE
test_percentage_quorum_insufficient() {
    local total_agents=5
    local quorum_percentage=0.9
    local completed_agents=4

    local result=$(check_percentage_quorum "$total_agents" "$quorum_percentage" "$completed_agents")
    assert_equals "$result" "FAILURE" "Quorum incorrectly reached when 4/5 agents complete (90% required)"
}

# Run the tests
main() {
    test_percentage_quorum_success
    test_percentage_quorum_failure
    test_percentage_quorum_round_up
    test_percentage_quorum_insufficient
    echo "Percentage Quorum Test Complete"
}

main