#!/usr/bin/env bash
# tests/cli-mode/test-prompt-delivery.sh
# Phase 1 :: End-to-end test for CLI mode agent completion signaling protocol
# Integration Test: Validates Redis coordination for agent completion messages

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TASK_ID="test-prompt-delivery-$$-$(date +%s)"
AGENT_ID="mock-agent-$$-$(date +%s)"
COMPLETION_KEY="swarm:${TASK_ID}:${AGENT_ID}:done"  # Production format: swarm:{taskId}:{agentId}:done
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
TIMEOUT=10
MOCK_AGENT_PID=""

cleanup() {
    log_info "Cleaning up test resources..."

    # Kill mock agent if still running
    if [ -n "$MOCK_AGENT_PID" ] && kill -0 "$MOCK_AGENT_PID" 2>/dev/null; then
        kill "$MOCK_AGENT_PID" 2>/dev/null || true
    fi

    # Clean Redis keys
    redis-cli -p "$REDIS_PORT" DEL "$COMPLETION_KEY" 2>/dev/null || true
    redis-cli -p "$REDIS_PORT" DEL "swarm:${TASK_ID}:*" 2>/dev/null || true

    log_info "Cleanup complete"
}
trap cleanup EXIT

# Test Case 1: Verify coordination infrastructure
test_coordination_infrastructure() {
    log_step "GIVEN CLI coordination infrastructure is available"

    # Verify redis-cli is available
    if ! command -v redis-cli &>/dev/null; then
        log_error "Redis CLI required for coordination"
        return 1
    fi
    log_info "✓ redis-cli available"

    # Verify Redis is accessible
    if ! redis-cli -p "$REDIS_PORT" PING &>/dev/null; then
        log_error "Redis server not available on port $REDIS_PORT"
        return 1
    fi
    log_info "✓ Redis server accessible"

    log_step "WHEN creating mock agent that sends completion signal"

    # Create a mock agent that simulates the completion protocol
    # This agent will sleep briefly, then send a completion signal
    (
        sleep 3
        SIGNAL_JSON=$(cat <<EOF
{
  "agentId": "$AGENT_ID",
  "taskId": "$TASK_ID",
  "status": "completed",
  "confidence": 0.95,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "metadata": {
    "testCase": "prompt-delivery",
    "duration": 3
  }
}
EOF
)
        redis-cli -p "$REDIS_PORT" RPUSH "$COMPLETION_KEY" "$SIGNAL_JSON" >/dev/null
    ) &

    MOCK_AGENT_PID=$!

    log_step "THEN mock agent process starts successfully"

    if kill -0 $MOCK_AGENT_PID 2>/dev/null; then
        log_info "✓ Mock agent running (PID: $MOCK_AGENT_PID)"
    else
        log_error "Mock agent failed to start"
        return 1
    fi
}

# Test Case 2: Verify completion signal reception
test_completion_signal_reception() {
    log_step "GIVEN agent is running with task"
    
    log_step "WHEN waiting for completion signal on Redis key: $COMPLETION_KEY"
    
    # Use BLPOP with timeout to wait for completion
    SIGNAL_DATA=$(timeout "$TIMEOUT" redis-cli -p "$REDIS_PORT" BLPOP "$COMPLETION_KEY" "$TIMEOUT" 2>&1 || true)
    
    log_step "THEN completion signal is received within timeout"
    
    if [ -z "$SIGNAL_DATA" ] || echo "$SIGNAL_DATA" | grep -q "nil"; then
        log_error "No completion signal received within ${TIMEOUT}s timeout"
        log_error "Signal data: $SIGNAL_DATA"
        return 1
    fi
    
    log_info "✓ Completion signal received"
    annotate "Signal data: $SIGNAL_DATA"
}

# Test Case 3: Validate signal format and metadata
test_signal_format_validation() {
    log_step "GIVEN completion signal was received"

    # Extract JSON from BLPOP response
    # BLPOP returns: line1=key, line2=value (JSON)
    # We want the second line (the JSON value)
    SIGNAL_JSON=$(echo "$SIGNAL_DATA" | sed -n '2,$p')

    log_step "WHEN parsing signal metadata"
    annotate "Raw signal: $SIGNAL_JSON"
    
    log_step "THEN signal contains valid JSON with required fields"
    
    # Validate JSON structure
    if ! echo "$SIGNAL_JSON" | jq empty 2>/dev/null; then
        log_error "Signal is not valid JSON: $SIGNAL_JSON"
        return 1
    fi
    
    log_info "✓ Signal is valid JSON"
    
    # Extract and validate required fields
    local AGENT_ID=$(echo "$SIGNAL_JSON" | jq -r '.agentId // empty')
    local TASK_ID_FROM_SIGNAL=$(echo "$SIGNAL_JSON" | jq -r '.taskId // empty')
    local STATUS=$(echo "$SIGNAL_JSON" | jq -r '.status // empty')
    local CONFIDENCE=$(echo "$SIGNAL_JSON" | jq -r '.confidence // empty')
    
    # Validate agentId exists
    if [ -z "$AGENT_ID" ]; then
        log_error "Signal missing 'agentId' field"
        return 1
    fi
    log_info "✓ agentId present: $AGENT_ID"
    
    # Validate taskId matches
    if [ "$TASK_ID_FROM_SIGNAL" != "$TASK_ID" ]; then
        log_error "Signal taskId ($TASK_ID_FROM_SIGNAL) does not match expected ($TASK_ID)"
        return 1
    fi
    log_info "✓ taskId matches: $TASK_ID"
    
    # Validate status field
    if [ -z "$STATUS" ]; then
        log_error "Signal missing 'status' field"
        return 1
    fi
    log_info "✓ status present: $STATUS"
    
    # Validate confidence is numeric
    if [ -n "$CONFIDENCE" ] && ! echo "$CONFIDENCE" | grep -qE '^[0-9]+(\.[0-9]+)?$'; then
        log_error "Confidence is not numeric: $CONFIDENCE"
        return 1
    fi
    log_info "✓ confidence valid: ${CONFIDENCE:-N/A}"
    
    log_info "✓ All required metadata fields validated"
}

# Test Case 4: Timeout handling verification
test_timeout_handling() {
    log_step "GIVEN a new task with very short timeout"

    local TIMEOUT_TASK_ID="test-timeout-$$-$(date +%s)"
    local TIMEOUT_AGENT_ID="timeout-agent-$$-$(date +%s)"
    local TIMEOUT_KEY="swarm:${TIMEOUT_TASK_ID}:${TIMEOUT_AGENT_ID}:done"

    log_step "WHEN waiting on non-existent completion signal with 3s timeout"
    
    START_TIME=$(date +%s)
    timeout 3 redis-cli -p "$REDIS_PORT" BLPOP "$TIMEOUT_KEY" 3 &>/dev/null || true
    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))
    
    log_step "THEN timeout occurs within expected range (2-5 seconds)"
    
    if [ "$ELAPSED" -lt 2 ] || [ "$ELAPSED" -gt 5 ]; then
        log_error "Timeout took ${ELAPSED}s, expected 2-5s"
        return 1
    fi
    
    log_info "✓ Timeout handling works correctly (${ELAPSED}s)"
    
    # Cleanup timeout test key
    redis-cli -p "$REDIS_PORT" DEL "$TIMEOUT_KEY" 2>/dev/null || true
}

# Main test execution
main() {
    log_info "Starting CLI Mode Completion Signaling Protocol Test"
    log_info "Task ID: $TASK_ID"
    log_info "Redis Port: $REDIS_PORT"
    log_info "Timeout: ${TIMEOUT}s"
    echo

    # Run test cases sequentially
    test_coordination_infrastructure
    test_completion_signal_reception
    test_signal_format_validation
    test_timeout_handling

    echo
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "✓ ALL TESTS PASSED"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    log_info "Test Summary:"
    log_info "  - Coordination infrastructure: ✓"
    log_info "  - Completion signal reception: ✓"
    log_info "  - Signal format validation: ✓"
    log_info "  - Timeout handling: ✓"
    echo
}

main "$@"
