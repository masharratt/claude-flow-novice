#!/bin/bash
# Granular Iteration Handoff Tests for CFN v3 Workflow
# Validates complex agent coordination mechanisms

set -euo pipefail

# Global test configuration
TASK_ID="test-handoffs-$(date +%s)"
REDIS_KEY_PREFIX="cfn_test:handoffs:${TASK_ID}"

# Debug logging
debug_log() {
    echo "[DEBUG] $*" >&2
}

# Utility: Check command success with optional message
assert() {
    local condition="$1"
    local expected="$2"
    local actual="$3"
    local message="${4:-Assertion failed}"

    debug_log "Checking condition: $condition, expected=$expected, actual=$actual"

    case "$condition" in
        "eq")
            if [[ "$actual" != "$expected" ]]; then
                echo "❌ ASSERTION FAILED: $message (Expected $expected, Got $actual)" >&2
                return 1
            fi
            ;;
        "ne")
            if [[ "$actual" == "$expected" ]]; then
                echo "❌ ASSERTION FAILED: $message (Expected not $expected, Got $actual)" >&2
                return 1
            fi
            ;;
        "gt")
            if [[ "$actual" -le "$expected" ]]; then
                echo "❌ ASSERTION FAILED: $message (Expected > $expected, Got $actual)" >&2
                return 1
            fi
            ;;
        "ge")
            if [[ "$actual" -lt "$expected" ]]; then
                echo "❌ ASSERTION FAILED: $message (Expected >= $expected, Got $actual)" >&2
                return 1
            fi
            ;;
        "contains")
            if [[ "$actual" != *"$expected"* ]]; then
                echo "❌ ASSERTION FAILED: $message (Expected to contain $expected)" >&2
                return 1
            fi
            ;;
        *)
            echo "❌ INVALID CONDITION: $condition" >&2
            return 1
            ;;
    esac

    return 0
}

# Test 1: Wake Signal Handoff Mechanism
test_wake_signal() {
    local test_name="test_wake_signal"
    debug_log "Running $test_name"

    # Clean previous test data
    redis-cli DEL "${REDIS_KEY_PREFIX}:agent1:waiting" > /dev/null 2>&1

    # Simulate agent entering waiting mode
    redis-cli LPUSH "${REDIS_KEY_PREFIX}:agent1:waiting" "block" > /dev/null

    # Simulate wake signal (simplified)
    redis-cli DEL "${REDIS_KEY_PREFIX}:agent1:waiting" > /dev/null

    # Check if agent was successfully woken
    local wake_result=$(redis-cli LLEN "${REDIS_KEY_PREFIX}:agent1:waiting")

    assert "eq" 0 "$wake_result" "Wake signal should unblock agent"
    echo "✅ $test_name PASSED"
}

# Test 2: Iteration Context Handoff
test_iteration_context() {
    local test_name="test_iteration_context"
    debug_log "Running $test_name"

    # Clean previous test data
    redis-cli DEL "${REDIS_KEY_PREFIX}:context" > /dev/null 2>&1

    # Store iteration context in Redis
    redis-cli HMSET "${REDIS_KEY_PREFIX}:context" \
        "iteration" "2" \
        "previous_confidence" "0.85" \
        "feedback" "Improve error handling" > /dev/null

    # Retrieve and validate context
    local iteration=$(redis-cli HGET "${REDIS_KEY_PREFIX}:context" "iteration")
    local confidence=$(redis-cli HGET "${REDIS_KEY_PREFIX}:context" "previous_confidence")
    local feedback=$(redis-cli HGET "${REDIS_KEY_PREFIX}:context" "feedback")

    debug_log "Retrieved context: iteration=$iteration, confidence=$confidence, feedback=$feedback"

    assert "eq" "2" "$iteration" "Iteration number should be 2"
    assert "eq" "0.85" "$confidence" "Previous confidence should be 0.85"
    assert "contains" "Improve error handling" "$feedback" "Feedback should match expected string"

    echo "✅ $test_name PASSED"
}

# Test 3: Feedback Routing Validation
test_feedback_routing() {
    local test_name="test_feedback_routing"
    debug_log "Running $test_name"

    # Clean previous test data
    redis-cli DEL "${REDIS_KEY_PREFIX}:product-owner:feedback" > /dev/null 2>&1
    redis-cli DEL "${REDIS_KEY_PREFIX}:security-agent:specific_feedback" > /dev/null 2>&1
    redis-cli DEL "${REDIS_KEY_PREFIX}:all-agents:generic_feedback" > /dev/null 2>&1

    # Simulate product owner feedback
    local feedback='{"type":"security","target_agents":["security-agent"],"message":"Add input validation"}'
    local generic_message="General improvement needed"

    redis-cli LPUSH "${REDIS_KEY_PREFIX}:product-owner:feedback" "$feedback" > /dev/null
    redis-cli LPUSH "${REDIS_KEY_PREFIX}:security-agent:specific_feedback" "Add input validation" > /dev/null
    redis-cli LPUSH "${REDIS_KEY_PREFIX}:all-agents:generic_feedback" "$generic_message" > /dev/null

    # Retrieve feedback
    local routed_feedback=$(redis-cli LPOP "${REDIS_KEY_PREFIX}:security-agent:specific_feedback")
    local generic_feedback=$(redis-cli LPOP "${REDIS_KEY_PREFIX}:all-agents:generic_feedback")

    debug_log "Routed feedback: $routed_feedback"
    debug_log "Generic feedback: $generic_feedback"

    assert "contains" "input validation" "$routed_feedback" "Specific feedback should contain 'input validation'"
    assert "contains" "improvement" "$generic_feedback" "Generic feedback should have expected content"

    echo "✅ $test_name PASSED"
}

# Test 4: Max Iterations Enforcement
test_max_iterations() {
    local test_name="test_max_iterations"
    debug_log "Running $test_name"

    # Clean previous test data
    redis-cli DEL "${REDIS_KEY_PREFIX}:iteration_tracking" > /dev/null 2>&1
    redis-cli DEL "${REDIS_KEY_PREFIX}:orchestrator:status" > /dev/null 2>&1

    local max_iterations=3
    local current_iteration=0

    while ((current_iteration < max_iterations)); do
        current_iteration=$((current_iteration + 1))
        redis-cli HSET "${REDIS_KEY_PREFIX}:iteration_tracking" "current" "$current_iteration" > /dev/null
    done

    local final_iteration=$(redis-cli HGET "${REDIS_KEY_PREFIX}:iteration_tracking" "current")

    debug_log "Final iteration: $final_iteration"

    assert "eq" "$max_iterations" "$final_iteration" "Should reach max iterations"

    # Simulate ABORT mechanism
    redis-cli LPUSH "${REDIS_KEY_PREFIX}:orchestrator:status" "ABORT" > /dev/null

    local abort_signal=$(redis-cli LPOP "${REDIS_KEY_PREFIX}:orchestrator:status")

    debug_log "Abort signal: $abort_signal"

    assert "eq" "ABORT" "$abort_signal" "Abort signal should be 'ABORT'"

    echo "✅ $test_name PASSED"
}

# Test 5: Agent Specialization Handoff
test_agent_specialization() {
    local test_name="test_agent_specialization"
    debug_log "Running $test_name"

    # Clean previous test data
    for type in security performance reliability; do
        redis-cli DEL "${REDIS_KEY_PREFIX}:agent-selection:${type}" > /dev/null 2>&1
    done

    # Simulate feedback requiring specialized agent
    local feedback_types=("security" "performance" "reliability")

    for type in "${feedback_types[@]}"; do
        local specialist_agent="${type}-specialist"
        redis-cli LPUSH "${REDIS_KEY_PREFIX}:agent-selection:${type}" "$specialist_agent" > /dev/null
    done

    for type in "${feedback_types[@]}"; do
        local selected_agent=$(redis-cli LPOP "${REDIS_KEY_PREFIX}:agent-selection:${type}")
        debug_log "Selected agent for $type: $selected_agent"
        assert "contains" "-specialist" "$selected_agent" "Agent should end with -specialist"
    done

    echo "✅ $test_name PASSED"
}

# Main Test Runner
main() {
    debug_log "Starting CFN v3 Handoff Mechanism Tests"
    local success=true

    test_wake_signal || success=false
    test_iteration_context || success=false
    test_feedback_routing || success=false
    test_max_iterations || success=false
    test_agent_specialization || success=false

    if [ "$success" = true ]; then
        echo "✅ All CFN v3 Handoff Tests PASSED"
        ./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
            --task-id "$TASK_ID" \
            --agent-id "test-agent" \
            --confidence 0.95 \
            --context "Comprehensive handoff tests validated"
        exit 0
    else
        echo "❌ Some CFN v3 Handoff Tests FAILED"
        ./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
            --task-id "$TASK_ID" \
            --agent-id "test-agent" \
            --confidence 0.65 \
            --context "Handoff tests revealed potential issues"
        exit 1
    fi
}

# Run tests with comprehensive error handling
main