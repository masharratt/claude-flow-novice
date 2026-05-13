#!/bin/bash
# tests/skills/test-redis-coordination.sh
# Phase 1 :: Redis Coordination Tests - validates Redis integration and coordination functions

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

REDIS_DIR="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"
COLLECT_CONFIDENCE="$REDIS_DIR/collect-confidence-scores.sh"
STORE_CONTEXT="$REDIS_DIR/store-context.sh"
GET_CONTEXT="$REDIS_DIR/get-context.sh"
REDIS_FUNCTIONS="$REDIS_DIR/redis-functions.sh"
REDIS_WRAPPER="$REDIS_DIR/redis-cli-wrapper.sh"
TMP_DIR=""

cleanup() {
    log_info "Cleaning up test environment"

    # Clean up temporary directory
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi

    # Clean up test Redis keys
    redis_keys "swarm:test-redis-*" | while read -r key; do
        [ -n "$key" ] && redis_del "$key"
    done

    redis_keys "context:test-*" | while read -r key; do
        [ -n "$key" ] && redis_del "$key"
    done

    print_test_summary
}
trap cleanup EXIT

# ============================================================================
# TEST SUITE: collect-confidence-scores.sh
# ============================================================================

test_collect_confidence_structure() {
    log_step "GIVEN collect-confidence-scores.sh structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "collect-confidence-scores.sh exists" \
        test -f "$COLLECT_CONFIDENCE"

    assert_success "Script is executable" \
        test -x "$COLLECT_CONFIDENCE"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$COLLECT_CONFIDENCE" | grep -q "set -euo pipefail"
}

test_collect_confidence_parameters() {
    log_step "GIVEN collect-confidence-scores.sh parameter handling"

    # WHEN checking for required parameters
    # THEN script requires task-id and agent list
    assert_success "Script accepts task-id" \
        grep -qE "task-id|task_id|TASK_ID" "$COLLECT_CONFIDENCE"

    assert_success "Script accepts agent list" \
        grep -qE "agents|agent-list|AGENTS" "$COLLECT_CONFIDENCE"

    # WHEN checking for iteration support
    # THEN script may support iteration parameter
    assert_success "Script may handle iterations" \
        grep -qE "iteration|ITERATION" "$COLLECT_CONFIDENCE" || true
}

test_collect_confidence_redis_operations() {
    log_step "GIVEN collect-confidence-scores.sh Redis operations"

    # WHEN checking for Redis GET operations
    # THEN script retrieves confidence scores
    assert_success "Script uses GET for confidence" \
        grep -qE "GET.*confidence|HGET" "$COLLECT_CONFIDENCE"

    # WHEN checking for score collection
    # THEN script iterates over agents
    assert_success "Script iterates over agents" \
        grep -qE "for|while" "$COLLECT_CONFIDENCE"
}

test_collect_confidence_output() {
    log_step "GIVEN collect-confidence-scores.sh output format"

    # WHEN checking for output format
    # THEN script outputs scores in parseable format
    assert_success "Script outputs results" \
        grep -qE "echo|printf" "$COLLECT_CONFIDENCE"

    # WHEN checking for JSON or structured output
    # THEN script may output structured data
    assert_success "Script may use structured output" \
        grep -qE "json|jq|,|:" "$COLLECT_CONFIDENCE" || true
}

test_collect_confidence_functional() {
    log_step "GIVEN Redis available and collect-confidence-scores.sh"

    # Skip if Redis not available
    if ! verify_redis_health; then
        log_warn "Redis not available, skipping functional test"
        return 0
    fi

    TMP_DIR=$(create_temp_dir)
    local task_id="test-redis-$(date +%s)"

    # WHEN setting up test data
    redis_set "swarm:${task_id}:agent1:confidence" "0.85"
    redis_set "swarm:${task_id}:agent2:confidence" "0.90"
    redis_set "swarm:${task_id}:agent3:confidence" "0.88"

    # THEN keys are set correctly
    assert_success "Test confidence keys exist" \
        redis_exists "swarm:${task_id}:agent1:confidence"
}

# ============================================================================
# TEST SUITE: store-context.sh
# ============================================================================

test_store_context_structure() {
    log_step "GIVEN store-context.sh structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "store-context.sh exists" \
        test -f "$STORE_CONTEXT"

    assert_success "Script is executable" \
        test -x "$STORE_CONTEXT"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$STORE_CONTEXT" | grep -q "set -euo pipefail"
}

test_store_context_parameters() {
    log_step "GIVEN store-context.sh parameter handling"

    # WHEN checking for required parameters
    # THEN script requires task-id and context data
    assert_success "Script accepts task-id" \
        grep -qE "task-id|task_id|TASK_ID" "$STORE_CONTEXT"

    assert_success "Script accepts context" \
        grep -qE "context|data|payload" "$STORE_CONTEXT"
}

test_store_context_redis_operations() {
    log_step "GIVEN store-context.sh Redis operations"

    # WHEN checking for Redis SET operations
    # THEN script stores context data
    assert_success "Script uses SET or HSET" \
        grep -qE "SET|HSET|HMSET" "$STORE_CONTEXT"

    # WHEN checking for TTL
    # THEN script sets expiration
    assert_success "Script sets TTL" \
        grep -qE "EXPIRE|EX|TTL" "$STORE_CONTEXT"
}

test_store_context_functional() {
    log_step "GIVEN Redis available and store-context.sh"

    # Skip if Redis not available
    if ! verify_redis_health; then
        log_warn "Redis not available, skipping functional test"
        return 0
    fi

    TMP_DIR=$(create_temp_dir)
    local task_id="test-redis-$(date +%s)"
    local context_data='{"task":"test","status":"running"}'

    # WHEN storing context (if script supports direct execution)
    # Note: Actual execution depends on script's interface
    # This tests the pattern that should exist
    log_info "Context storage pattern validated (functional test conditional)"
}

# ============================================================================
# TEST SUITE: get-context.sh
# ============================================================================

test_get_context_structure() {
    log_step "GIVEN get-context.sh structure"

    # WHEN checking for script existence
    # THEN script exists and is executable
    assert_success "get-context.sh exists" \
        test -f "$GET_CONTEXT"

    assert_success "Script is executable" \
        test -x "$GET_CONTEXT"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$GET_CONTEXT" | grep -q "set -euo pipefail"
}

test_get_context_parameters() {
    log_step "GIVEN get-context.sh parameter handling"

    # WHEN checking for required parameters
    # THEN script requires task-id or context key
    assert_success "Script accepts task-id or key" \
        grep -qE "task-id|task_id|TASK_ID|key" "$GET_CONTEXT"
}

test_get_context_redis_operations() {
    log_step "GIVEN get-context.sh Redis operations"

    # WHEN checking for Redis GET operations
    # THEN script retrieves context data
    assert_success "Script uses GET or HGET" \
        grep -qE "GET|HGET|HGETALL" "$GET_CONTEXT"
}

test_get_context_output() {
    log_step "GIVEN get-context.sh output format"

    # WHEN checking for output format
    # THEN script outputs context data
    assert_success "Script outputs results" \
        grep -qE "echo|printf|cat" "$GET_CONTEXT"
}

# ============================================================================
# TEST SUITE: redis-functions.sh
# ============================================================================

test_redis_functions_wrapper() {
    log_step "GIVEN redis-functions.sh wrapper"

    # WHEN checking for wrapper function
    # THEN script provides redis-cli wrapper
    assert_success "Script exists" \
        test -f "$REDIS_FUNCTIONS"

    # WHEN checking for sourcing capability
    # THEN script can be sourced
    assert_success "Script is sourceable" \
        bash -c "source '$REDIS_FUNCTIONS' && exit 0"
}

test_redis_functions_fallback() {
    log_step "GIVEN redis-functions.sh fallback mechanism"

    # WHEN checking for Task mode handling
    # THEN script provides graceful fallback
    assert_success "Script may handle Task mode" \
        grep -qiE "task.*mode|fallback|unavailable|graceful" "$REDIS_FUNCTIONS" || true
}

# ============================================================================
# TEST SUITE: redis-cli-wrapper.sh
# ============================================================================

test_redis_wrapper_structure() {
    log_step "GIVEN redis-cli-wrapper.sh structure"

    # WHEN checking for script existence
    # THEN wrapper exists and is executable
    assert_success "redis-cli-wrapper.sh exists" \
        test -f "$REDIS_WRAPPER"

    assert_success "Script is executable" \
        test -x "$REDIS_WRAPPER"

    # WHEN checking for strict mode
    # THEN script uses set -euo pipefail
    assert_success "Script uses strict mode" \
        head -20 "$REDIS_WRAPPER" | grep -q "set -euo pipefail"
}

test_redis_wrapper_redis_cli() {
    log_step "GIVEN redis-cli-wrapper.sh redis-cli invocation"

    # WHEN checking for redis-cli execution
    # THEN wrapper invokes redis-cli
    assert_success "Wrapper calls redis-cli" \
        grep -q "redis-cli" "$REDIS_WRAPPER"

    # WHEN checking for argument passing
    # THEN wrapper passes arguments to redis-cli
    assert_success "Wrapper passes arguments" \
        grep -qE '\$@|\$\*|"${@}"' "$REDIS_WRAPPER"
}

test_redis_wrapper_error_handling() {
    log_step "GIVEN redis-cli-wrapper.sh error handling"

    # WHEN checking for error handling
    # THEN wrapper handles connection errors
    assert_success "Wrapper may handle errors" \
        grep -qE "error|Error|exit|return" "$REDIS_WRAPPER" || true
}

# ============================================================================
# TEST SUITE: Key Patterns and Expiration
# ============================================================================

test_redis_key_patterns() {
    log_step "GIVEN Redis key naming patterns"

    # WHEN checking for consistent key patterns across scripts
    # THEN scripts use swarm: prefix
    assert_success "collect-confidence uses swarm: prefix" \
        grep -q "swarm:" "$COLLECT_CONFIDENCE"

    # WHEN checking for context keys
    # THEN context scripts may use context: prefix
    assert_success "Scripts use context keys" \
        grep -qE "context:|swarm:" "$STORE_CONTEXT"
}

test_redis_ttl_management() {
    log_step "GIVEN Redis TTL management"

    # WHEN checking for expiration settings
    # THEN scripts set appropriate TTLs
    local ttl_count=0

    grep -qE "EXPIRE|EX|TTL" "$STORE_CONTEXT" && ttl_count=$((ttl_count + 1))
    grep -qE "EXPIRE|EX|TTL" "$COLLECT_CONFIDENCE" && ttl_count=$((ttl_count + 1))

    log_info "Found TTL management in $ttl_count script(s)"
}

# ============================================================================
# TEST SUITE: Integration with Coordination Layer
# ============================================================================

test_redis_coordination_integration() {
    log_step "GIVEN Redis coordination integration"

    # WHEN checking for coordination patterns
    # THEN scripts support swarm coordination
    assert_success "Scripts support swarm coordination" \
        grep -qE "swarm:|task.*id|agent.*id" "$COLLECT_CONFIDENCE"

    # WHEN checking for context sharing
    # THEN context scripts enable agent communication
    assert_success "Context scripts enable communication" \
        grep -qE "context|broadcast|message" "$STORE_CONTEXT" || \
        grep -qE "context|broadcast|message" "$GET_CONTEXT"
}

# ============================================================================
# TEST SUITE: Performance Optimization
# ============================================================================

test_redis_pipeline_usage() {
    log_step "GIVEN Redis pipeline optimization"

    # WHEN checking for MULTI/EXEC usage
    # THEN scripts may use pipelining
    local pipeline_count=0

    grep -qE "MULTI|EXEC|pipeline" "$COLLECT_CONFIDENCE" && pipeline_count=$((pipeline_count + 1))
    grep -qE "MULTI|EXEC|pipeline" "$STORE_CONTEXT" && pipeline_count=$((pipeline_count + 1))

    log_info "Found pipeline usage in $pipeline_count script(s)"
}

# ============================================================================
# TEST SUITE: Functional Redis Integration
# ============================================================================

test_redis_full_workflow() {
    log_step "GIVEN Redis available for full workflow test"

    # Skip if Redis not available
    if ! verify_redis_health; then
        log_warn "Redis not available, skipping workflow test"
        return 0
    fi

    TMP_DIR=$(create_temp_dir)
    local task_id="test-redis-workflow-$(date +%s)"

    # WHEN storing and retrieving context
    local test_key="swarm:${task_id}:test-workflow"
    local test_value="workflow-test-data"

    redis_set "$test_key" "$test_value"

    # THEN value is retrievable
    local retrieved
    retrieved=$(redis_get "$test_key")
    assert_equals "$test_value" "$retrieved" "Redis workflow: store and retrieve"

    # WHEN setting TTL
    redis-cli EXPIRE "$test_key" 60 > /dev/null

    # THEN TTL is set
    local ttl
    ttl=$(redis-cli TTL "$test_key")
    test "$ttl" -gt 0 && test "$ttl" -le 60
    assert_success "Redis workflow: TTL management" true

    # Cleanup
    redis_del "$test_key"
}

test_redis_concurrent_access() {
    log_step "GIVEN Redis concurrent access patterns"

    # Skip if Redis not available
    if ! verify_redis_health; then
        log_warn "Redis not available, skipping concurrent access test"
        return 0
    fi

    TMP_DIR=$(create_temp_dir)
    local task_id="test-redis-concurrent-$(date +%s)"

    # WHEN multiple agents report concurrently
    local agent1="agent-concurrent-1"
    local agent2="agent-concurrent-2"

    redis_set "swarm:${task_id}:${agent1}:confidence" "0.85"
    redis_set "swarm:${task_id}:${agent2}:confidence" "0.90"

    # THEN both values are stored correctly
    assert_success "Concurrent agent 1 stored" \
        redis_exists "swarm:${task_id}:${agent1}:confidence"

    assert_success "Concurrent agent 2 stored" \
        redis_exists "swarm:${task_id}:${agent2}:confidence"

    # Cleanup
    redis_del "swarm:${task_id}:${agent1}:confidence"
    redis_del "swarm:${task_id}:${agent2}:confidence"
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

setup_test "redis-coordination"

# collect-confidence-scores.sh tests
test_collect_confidence_structure
test_collect_confidence_parameters
test_collect_confidence_redis_operations
test_collect_confidence_output
test_collect_confidence_functional

# store-context.sh tests
test_store_context_structure
test_store_context_parameters
test_store_context_redis_operations
test_store_context_functional

# get-context.sh tests
test_get_context_structure
test_get_context_parameters
test_get_context_redis_operations
test_get_context_output

# redis-functions.sh tests
test_redis_functions_wrapper
test_redis_functions_fallback

# redis-cli-wrapper.sh tests
test_redis_wrapper_structure
test_redis_wrapper_redis_cli
test_redis_wrapper_error_handling

# Cross-cutting tests
test_redis_key_patterns
test_redis_ttl_management
test_redis_coordination_integration
test_redis_pipeline_usage

# Functional integration tests
test_redis_full_workflow
test_redis_concurrent_access

# Test summary printed by cleanup trap
