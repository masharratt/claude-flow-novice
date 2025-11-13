#!/bin/bash
# Sprint 5 Integration Tests

set -eo pipefail

# Logging function
log() {
    echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')]: $*" >&2
}

# Check Redis connectivity
check_redis() {
    if ! redis-cli ping &> /dev/null; then
        log "Error: Redis is not running or not accessible"
        exit 1
    fi
}

# Validate CLI tool
check_cli_tool() {
    if ! command -v npx &> /dev/null; then
        log "Error: npx is not installed"
        exit 1
    fi

    if ! npx claude-flow-novice --version &> /dev/null; then
        log "Error: claude-flow-novice CLI not found or not configured"
        exit 1
    fi
}

# Test 1: Epic Context Injection
test_epic_context_injection() {
    log "Running Test 1: Epic Context Injection"

    TASK_ID="sprint5-epic-$(date +%s%N)"
    export TASK_ID

    redis-cli setex "swarm:${TASK_ID}:epic-context" 600 '{
        "epicName": "Sprint 5 Epic",
        "successCriteria": ["Context Injection", "Redis Management"]
    }'

    local EPIC=$(redis-cli get "swarm:${TASK_ID}:epic-context")
    local TTL=$(redis-cli ttl "swarm:${TASK_ID}:epic-context")

    if [[ "$EPIC" == *"Sprint 5 Epic"* ]] && [[ $TTL -gt 500 && $TTL -le 600 ]]; then
        log "✓ Epic Context Injection Test PASSED"
        return 0
    else
        log "✗ Epic Context Injection Test FAILED"
        return 1
    fi
}

# Test 2: CFN Loop Protocol Verification
test_cfn_loop_protocol() {
    log "Running Test 2: CFN Loop Protocol"

    TASK_ID="sprint5-loop-$(date +%s%N)"
    export TASK_ID

    # More robust agent spawning with error handling
    if npx claude-flow-novice agent spawn \
        --type tester \
        --task-id "$TASK_ID" \
        --mode integration-test; then

        sleep 10  # Give agent time to potentially signal

        local COMPLETION_STATUS=$(redis-cli llen "swarm:${TASK_ID}:tester:done")
        local TASK_KEYS=$(redis-cli keys "swarm:${TASK_ID}:*")

        if [[ -n "$TASK_KEYS" ]]; then
            log "✓ CFN Loop Protocol: Redis keys created"
            log "Task Keys: $TASK_KEYS"
            return 0
        else
            log "✗ CFN Loop Protocol Test FAILED: No Redis keys"
            return 1
        fi
    else
        log "✗ CFN Loop Protocol Test FAILED: Agent spawn error"
        return 1
    fi
}

# Test 3: Enhanced Heartbeat Monitoring
test_heartbeat_monitoring() {
    log "Running Test 3: Heartbeat Monitoring"

    TASK_ID="sprint5-heartbeat-$(date +%s%N)"
    export TASK_ID

    # Spawn heartbeat agent with more logging
    npx claude-flow-novice agent spawn \
        --type heartbeat-monitor \
        --task-id "$TASK_ID" \
        --mode integration-test \
        --verbose &

    # Extended wait and multiple checks
    for i in {1..6}; do
        local HEARTBEAT_KEY="swarm:${TASK_ID}:heartbeat:last_update"
        local LAST_HEARTBEAT=$(redis-cli get "$HEARTBEAT_KEY")

        if [[ -n "$LAST_HEARTBEAT" ]]; then
            log "✓ Heartbeat detected at: $LAST_HEARTBEAT"
            return 0
        fi

        sleep 10
    done

    log "✗ Heartbeat Monitoring Test FAILED: No heartbeat detected"
    return 1
}

# Main test execution
main() {
    log "=== Starting Sprint 5 Integration Tests ==="

    check_redis
    check_cli_tool

    local FAILURES=0

    test_epic_context_injection || ((FAILURES++))
    test_cfn_loop_protocol || ((FAILURES++))
    test_heartbeat_monitoring || ((FAILURES++))

    log "=== Test Summary ==="
    log "Total Failures: $FAILURES"

    if [[ $FAILURES -eq 0 ]]; then
        log "✅ All Sprint 5 Integration Tests PASSED"
        exit 0
    else
        log "❌ Some Sprint 5 Integration Tests FAILED"
        exit 1
    fi
}

# Execute main function with comprehensive error handling
main 2>&1 | tee /tmp/sprint5-integration-test.log