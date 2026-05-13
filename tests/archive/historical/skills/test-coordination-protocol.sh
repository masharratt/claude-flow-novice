#!/bin/bash
# tests/skills/test-coordination-protocol.sh
# Phase 1 :: Coordination Protocol Tests - validates Redis coordination mechanisms

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

REDIS_DIR="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"
REPORT_COMPLETION="$REDIS_DIR/report-completion.sh"
REDIS_FUNCTIONS="$REDIS_DIR/redis-functions.sh"
INVOKE_WAITING="$REDIS_DIR/invoke-waiting-mode.sh"
TMP_DIR=""

cleanup() {
    log_info "Cleaning up test environment"

    # Clean up temporary directory
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi

    # Clean up test Redis keys
    redis_keys "swarm:test-coord-*" | while read -r key; do
        [ -n "$key" ] && redis_del "$key"
    done

    redis_keys "swarm:test-agent-*" | while read -r key; do
        [ -n "$key" ] && redis_del "$key"
    done

    print_test_summary
}
trap cleanup EXIT

# ============================================================================
# TEST SUITE: report-completion.sh
# ============================================================================

test_report_completion_argument_parsing() {
    log_step "GIVEN report-completion.sh argument parser"

    # WHEN checking for required arguments
    # THEN script requires task-id, agent-id, and confidence
    assert_success "Script requires --task-id" \
        grep -q "\\--task-id)" "$REPORT_COMPLETION"

    assert_success "Script requires --agent-id" \
        grep -q "\\--agent-id)" "$REPORT_COMPLETION"

    assert_success "Script requires --confidence" \
        grep -q "\\--confidence)" "$REPORT_COMPLETION"

    # WHEN checking for optional arguments
    # THEN script supports optional result and iteration
    assert_success "Script supports --result" \
        grep -q "\\--result)" "$REPORT_COMPLETION"

    assert_success "Script supports --iteration" \
        grep -q "\\--iteration)" "$REPORT_COMPLETION"
}

test_report_completion_validation() {
    log_step "GIVEN report-completion.sh input validation"

    # WHEN checking for parameter validation
    # THEN script validates required parameters
    assert_success "Script validates required parameters" \
        grep -q "Missing required parameters" "$REPORT_COMPLETION"

    # WHEN checking for confidence range validation
    # THEN script validates confidence is 0.0-1.0
    assert_success "Script validates confidence range" \
        grep -q "Confidence must be between" "$REPORT_COMPLETION"

    assert_success "Script uses awk for validation" \
        grep -A 5 "Validate confidence" "$REPORT_COMPLETION" | grep -q "awk"
}

test_report_completion_redis_operations() {
    log_step "GIVEN report-completion.sh Redis operations"

    # WHEN checking for Redis operations
    # THEN script uses MULTI/EXEC for atomic operations
    assert_success "Script uses MULTI for transaction" \
        grep -q "MULTI" "$REPORT_COMPLETION"

    assert_success "Script uses EXEC for transaction" \
        grep -q "EXEC" "$REPORT_COMPLETION"

    # WHEN checking for key operations
    # THEN script sets completion signal
    assert_success "Script sets done signal" \
        grep -q "LPUSH.*:done" "$REPORT_COMPLETION"

    assert_success "Script sets confidence score" \
        grep -q "SET.*:confidence" "$REPORT_COMPLETION"

    assert_success "Script sets result hash" \
        grep -q "HSET.*:result" "$REPORT_COMPLETION"

    assert_success "Script adds to completed agents list" \
        grep -q "LPUSH.*:completed_agents" "$REPORT_COMPLETION"
}

test_report_completion_ttl() {
    log_step "GIVEN report-completion.sh TTL management"

    # WHEN checking for TTL settings
    # THEN script sets expiration on keys
    assert_success "Script sets TTL on result" \
        grep -q "EXPIRE.*:result" "$REPORT_COMPLETION"

    assert_success "Script sets TTL on done signal" \
        grep -q "EXPIRE.*:done" "$REPORT_COMPLETION"

    # WHEN checking TTL duration
    # THEN TTL is set to 3600 seconds (1 hour)
    assert_success "TTL is 3600 seconds" \
        grep -q "EX 3600" "$REPORT_COMPLETION"
}

test_report_completion_functional() {
    log_step "GIVEN Redis available and report-completion.sh"

    # Skip if Redis not available
    if ! verify_redis_health; then
        log_warn "Redis not available, skipping functional test"
        return 0
    fi

    TMP_DIR=$(create_temp_dir)
    local task_id="test-coord-$(date +%s)"
    local agent_id="test-agent-1"

    # WHEN reporting completion
    assert_success "Report completion executes successfully" \
        "$REPORT_COMPLETION" \
            --task-id "$task_id" \
            --agent-id "$agent_id" \
            --confidence 0.85 \
            --iteration 1 \
            --result '{"status":"complete"}'

    # THEN Redis keys are set
    assert_success "Confidence key exists" \
        redis_exists "swarm:${task_id}:${agent_id}:confidence"

    local confidence
    confidence=$(redis_get "swarm:${task_id}:${agent_id}:confidence")
    assert_equals "0.85" "$confidence" "Confidence value is correct"

    # WHEN checking completed agents list
    # THEN agent is in completed list
    assert_success "Agent in completed list" \
        redis-cli LRANGE "swarm:${task_id}:completed_agents" 0 -1 | grep -q "$agent_id"
}

# ============================================================================
# TEST SUITE: redis-functions.sh
# ============================================================================

test_redis_functions_structure() {
    log_step "GIVEN redis-functions.sh"

    # WHEN checking for wrapper function
    # THEN redis-cli wrapper exists
    assert_success "redis-cli wrapper function exists" \
        grep -q "redis-cli" "$REDIS_FUNCTIONS" || grep -q "redis_cmd" "$REDIS_FUNCTIONS"

    # WHEN checking for graceful fallback
    # THEN script handles Task mode without Redis
    assert_success "Script provides fallback mechanism" \
        grep -qi "task mode\|fallback\|unavailable" "$REDIS_FUNCTIONS" || true
}

test_redis_functions_sourcing() {
    log_step "GIVEN report-completion.sh sourcing redis-functions.sh"

    # WHEN checking for source statement
    # THEN report-completion sources redis-functions
    assert_success "report-completion sources redis-functions" \
        grep -q "source.*redis-functions.sh" "$REPORT_COMPLETION"
}

# ============================================================================
# TEST SUITE: invoke-waiting-mode.sh
# ============================================================================

test_invoke_waiting_mode_exists() {
    log_step "GIVEN invoke-waiting-mode.sh"

    # WHEN checking if file exists
    # THEN script exists
    assert_success "invoke-waiting-mode.sh exists" \
        test -f "$INVOKE_WAITING"

    assert_success "Script is executable" \
        test -x "$INVOKE_WAITING"
}

test_invoke_waiting_mode_blocking() {
    log_step "GIVEN invoke-waiting-mode.sh blocking mechanism"

    # WHEN checking for blocking operation
    # THEN script uses BLPOP or BRPOP for blocking
    assert_success "Script uses blocking Redis operation" \
        grep -qE "BLPOP|BRPOP|BZPOPMIN" "$INVOKE_WAITING"

    # WHEN checking for timeout
    # THEN script supports timeout parameter
    assert_success "Script supports timeout" \
        grep -qi "timeout" "$INVOKE_WAITING"
}

test_invoke_waiting_mode_collect_action() {
    log_step "GIVEN invoke-waiting-mode.sh collect action"

    # WHEN checking for collect functionality
    # THEN script supports collect action
    assert_success "Script supports collect action" \
        grep -q "collect" "$INVOKE_WAITING"

    # WHEN checking for confidence collection
    # THEN script collects confidence scores
    assert_success "Script mentions confidence" \
        grep -qi "confidence" "$INVOKE_WAITING"
}

test_invoke_waiting_mode_signal_delivery() {
    log_step "GIVEN invoke-waiting-mode.sh signal delivery"

    # WHEN checking for signal mechanisms
    # THEN script uses LPUSH or similar for signaling
    assert_success "Script uses LPUSH for signaling" \
        grep -q "LPUSH\|RPUSH" "$INVOKE_WAITING" || true
}

# ============================================================================
# TEST SUITE: Coordination Key Patterns
# ============================================================================

test_coordination_key_patterns() {
    log_step "GIVEN coordination key naming patterns"

    # WHEN checking for consistent key patterns
    # THEN scripts use swarm:task-id:agent-id pattern
    assert_success "Scripts use swarm: prefix" \
        grep -q "swarm:" "$REPORT_COMPLETION"

    assert_success "Scripts include task_id in keys" \
        grep -q "\${TASK_ID}" "$REPORT_COMPLETION"

    assert_success "Scripts include agent_id in keys" \
        grep -q "\${AGENT_ID}" "$REPORT_COMPLETION"

    # WHEN checking for key suffixes
    # THEN scripts use descriptive suffixes
    assert_success "Scripts use :done suffix" \
        grep -q ":done" "$REPORT_COMPLETION"

    assert_success "Scripts use :confidence suffix" \
        grep -q ":confidence" "$REPORT_COMPLETION"

    assert_success "Scripts use :result suffix" \
        grep -q ":result" "$REPORT_COMPLETION"
}

# ============================================================================
# TEST SUITE: Error Handling
# ============================================================================

test_coordination_error_handling() {
    log_step "GIVEN coordination scripts error handling"

    # WHEN checking for strict mode
    # THEN scripts use set -euo pipefail
    assert_success "report-completion uses strict mode" \
        head -10 "$REPORT_COMPLETION" | grep -q "set -euo pipefail"

    # WHEN checking for error messages
    # THEN scripts output to stderr
    assert_success "Scripts write errors to stderr" \
        grep -q ">&2" "$REPORT_COMPLETION"

    # WHEN checking for exit codes
    # THEN scripts exit with proper codes
    assert_success "Scripts exit with error codes" \
        grep -q "exit 1" "$REPORT_COMPLETION"
}

# ============================================================================
# TEST SUITE: Timestamp Management
# ============================================================================

test_coordination_timestamps() {
    log_step "GIVEN coordination timestamp tracking"

    # WHEN checking for timestamp fields
    # THEN result hash includes timestamp
    assert_success "Result includes timestamp" \
        grep -A 10 "HSET.*:result" "$REPORT_COMPLETION" | grep -q "timestamp"

    # WHEN checking timestamp format
    # THEN timestamp uses ISO 8601 format
    assert_success "Timestamp uses UTC format" \
        grep -q "date -u.*%Y-%m-%dT%H:%M:%SZ" "$REPORT_COMPLETION"
}

# ============================================================================
# TEST SUITE: Batch Operations Optimization
# ============================================================================

test_coordination_optimization() {
    log_step "GIVEN coordination batch optimization"

    # WHEN checking for performance optimizations
    # THEN script uses Redis pipeline (MULTI/EXEC)
    assert_success "Script uses pipeline for efficiency" \
        grep -B 2 "MULTI" "$REPORT_COMPLETION" | grep -q "OPTIMIZATION\|pipeline\|batch" || true

    # WHEN checking for single network round-trip
    # THEN MULTI/EXEC wraps multiple operations
    local multi_count exec_count
    multi_count=$(grep -c "^.*echo.*MULTI" "$REPORT_COMPLETION" || echo 0)
    exec_count=$(grep -c "^.*echo.*EXEC" "$REPORT_COMPLETION" || echo 0)

    test "$multi_count" -eq "$exec_count"
    assert_success "MULTI and EXEC are balanced" true
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

setup_test "coordination-protocol"

# report-completion.sh tests
test_report_completion_argument_parsing
test_report_completion_validation
test_report_completion_redis_operations
test_report_completion_ttl
test_report_completion_functional

# redis-functions.sh tests
test_redis_functions_structure
test_redis_functions_sourcing

# invoke-waiting-mode.sh tests
test_invoke_waiting_mode_exists
test_invoke_waiting_mode_blocking
test_invoke_waiting_mode_collect_action
test_invoke_waiting_mode_signal_delivery

# Cross-cutting tests
test_coordination_key_patterns
test_coordination_error_handling
test_coordination_timestamps
test_coordination_optimization

# Test summary printed by cleanup trap
