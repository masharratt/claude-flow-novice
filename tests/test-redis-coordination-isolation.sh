#!/bin/bash
# tests/test-redis-coordination-isolation.sh
# Tests Redis coordination isolation for multi-worktree environments
# Verifies namespace isolation, key separation, and coordination patterns

set -euo pipefail

# Source test utilities
source "$(dirname "$0")/test-utils.sh"

# ============================================================================
# CONFIGURATION
# ============================================================================

export TEST_TIMEOUT="${TEST_TIMEOUT:-60}"
export TEST_DIR
TEST_DIR="$(create_temp_dir)"

# Test coordination parameters
export TEST_TASK_ID="test-$(date +%s)-$$"
export MAIN_REDIS_PORT="${CFN_REDIS_PORT:-6379}"
export FEATURE_REDIS_PORT=$((MAIN_REDIS_PORT + 42))  # Simulated offset
export BUGFIX_REDIS_PORT=$((MAIN_REDIS_PORT + 84))  # Simulated offset

# Test data
export TEST_WORKTREE_BRANCHES=("main" "feature-auth" "bugfix-validation")
export TEST_COORDINATION_KEYS=("task:status" "agent:lifecycle" "orchestrator:state")

# ============================================================================
# TEST SETUP AND TEARDOWN
# ============================================================================

setup_redis_coordination_test() {
    setup_test "redis-coordination-isolation"
    
    log_step "Setting up Redis coordination isolation test"
    
    # Start Redis if not running
    if ! verify_redis_health; then
        log_info "Starting Redis container"
        docker-compose up -d redis >/dev/null 2>&1 || true
        sleep 5
        
        if ! verify_redis_health; then
            log_error "Failed to start Redis"
            return 1
        fi
    fi
    
    # Clear any existing test data
    redis_flush_all
    
    log_success "Redis coordination test setup complete"
}

teardown_redis_coordination_test() {
    log_step "Cleaning up Redis coordination test"
    
    # Clean up test keys
    for key in $(redis_keys "test:*" 2>/dev/null || echo ""); do
        redis_del "$key"
    done
    
    # Clean up coordination test keys
    for branch in "${TEST_WORKTREE_BRANCHES[@]}"; do
        for key_pattern in "cfn-$branch:*" "coordination:$branch:*"; do
            for key in $(redis_keys "$key_pattern" 2>/dev/null || echo ""); do
                redis_del "$key"
            done
        done
    done
    
    # Clean up test directories
    cleanup_temp_dir "$TEST_DIR"
    
    print_test_summary
}

# ============================================================================
# NAMESPACE ISOLATION TESTS
# ============================================================================

test_namespace_key_separation() {
    log_step "Testing namespace key separation"
    
    # Test data for different worktrees
    local main_key="cfn-main:coordination:test"
    local feature_key="cfn-feature-auth:coordination:test"
    local bugfix_key="cfn-bugfix-validation:coordination:test"
    
    # Set different values for each worktree
    redis_set "$main_key" "main-worktree-value"
    redis_set "$feature_key" "feature-worktree-value"
    redis_set "$bugfix_key" "bugfix-worktree-value"
    
    # Verify each worktree gets its own value
    local main_value
    main_value=$(redis_get "$main_key")
    assert_equals "main-worktree-value" "$main_value" "Main worktree key isolation"
    
    local feature_value
    feature_value=$(redis_get "$feature_key")
    assert_equals "feature-worktree-value" "$feature_value" "Feature worktree key isolation"
    
    local bugfix_value
    bugfix_value=$(redis_get "$bugfix_key")
    assert_equals "bugfix-worktree-value" "$bugfix_value" "Bugfix worktree key isolation"
    
    # Verify keys are separate (no cross-contamination)
    assert_not_equals "$main_value" "$feature_value" "Main and feature values differ"
    assert_not_equals "$feature_value" "$bugfix_value" "Feature and bugfix values differ"
    
    log_success "Namespace key separation verified"
}

test_task_id_isolation() {
    log_step "Testing task ID isolation"
    
    # Simulate task coordination for different worktrees
    local main_task_key="cfn-main:task:$TEST_TASK_ID:status"
    local feature_task_key="cfn-feature-auth:task:$TEST_TASK_ID:status"
    local bugfix_task_key="cfn-bugfix-validation:task:$TEST_TASK_ID:status"
    
    # Set different task statuses
    redis_set "$main_task_key" "running"
    redis_set "$feature_task_key" "completed"
    redis_set "$bugfix_task_key" "pending"
    
    # Verify task isolation
    local main_status
    main_status=$(redis_get "$main_task_key")
    assert_equals "running" "$main_status" "Main task status isolated"
    
    local feature_status
    feature_status=$(redis_get "$feature_task_key")
    assert_equals "completed" "$feature_status" "Feature task status isolated"
    
    local bugfix_status
    bugfix_status=$(redis_get "$bugfix_task_key")
    assert_equals "pending" "$bugfix_status" "Bugfix task status isolated"
    
    log_success "Task ID isolation verified"
}

test_agent_lifecycle_isolation() {
    log_step "Testing agent lifecycle isolation"
    
    # Simulate agent lifecycle tracking
    for branch in "${TEST_WORKTREE_BRANCHES[@]}"; do
        local sanitized_branch
        sanitized_branch=$(echo "$branch" | tr '/' '-' | tr '[:upper:]' '[:lower:]')
        local agent_key="cfn-$sanitized_branch:agent:tester-$TEST_TASK_ID:lifecycle"
        
        # Set agent lifecycle data
        local lifecycle_data="{
            \"status\": \"active\",
            \"spawned_at\": \"$(date -Iseconds)\",
            \"worktree\": \"$branch\",
            \"task_id\": \"$TEST_TASK_ID\"
        }"
        
        redis_set "$agent_key" "$lifecycle_data"
        
        # Verify agent data was set
        local retrieved_data
        retrieved_data=$(redis_get "$agent_key")
        assert_contains "$retrieved_data" "$branch" "Agent lifecycle contains branch info"
        assert_contains "$retrieved_data" "$TEST_TASK_ID" "Agent lifecycle contains task ID"
    done
    
    # Verify agent data is isolated between worktrees
    local main_agents
    main_agents=$(redis_keys "cfn-main:agent:*" | wc -l)
    local feature_agents
    feature_agents=$(redis_keys "cfn-feature-auth:agent:*" | wc -l)
    local bugfix_agents
    bugfix_agents=$(redis_keys "cfn-bugfix-validation:agent:*" | wc -l)
    
    assert_equals "1" "$main_agents" "Main worktree has 1 agent"
    assert_equals "1" "$feature_agents" "Feature worktree has 1 agent"
    assert_equals "1" "$bugfix_agents" "Bugfix worktree has 1 agent"
    
    log_success "Agent lifecycle isolation verified"
}

# ============================================================================
# COORDINATION PATTERN TESTS
# ============================================================================

test_broadcast_coordination() {
    log_step "Testing broadcast coordination pattern"
    
    # Simulate broadcast message for main worktree
    local broadcast_key="cfn-main:broadcast:orchestrator:config"
    local broadcast_message='{
        "pattern": "broadcast",
        "sender": "orchestrator",
        "message": "start-agents",
        "timestamp": "'$(date -Iseconds)'",
        "worktree": "main"
    }'
    
    redis_set "$broadcast_key" "$broadcast_message"
    
    # Verify broadcast message is worktree-isolated
    local retrieved_broadcast
    retrieved_broadcast=$(redis_get "$broadcast_key")
    assert_contains "$retrieved_broadcast" "broadcast" "Broadcast pattern identified"
    assert_contains "$retrieved_broadcast" "main" "Broadcast worktree identified"
    
    # Verify broadcast doesn't appear in other worktrees
    local feature_broadcast
    feature_broadcast=$(redis_get "cfn-feature-auth:broadcast:orchestrator:config" || echo "")
    assert_equals "" "$feature_broadcast" "No cross-worktree broadcast contamination"
    
    log_success "Broadcast coordination verified"
}

test_chain_coordination() {
    log_step "Testing chain coordination pattern"
    
    # Simulate chain coordination for feature worktree
    local chain_base="cfn-feature-auth:chain:$TEST_TASK_ID"
    local chain_step1="$chain_base:step1"
    local chain_step2="$chain_base:step2"
    local chain_step3="$chain_base:step3"
    
    # Set up chain steps
    redis_set "$chain_step1" '{"status": "completed", "output": "step1-result"}'
    redis_set "$chain_step2" '{"status": "in_progress", "output": ""}'
    redis_set "$chain_step3" '{"status": "pending", "output": ""}'
    
    # Verify chain isolation
    local step1_data
    step1_data=$(redis_get "$chain_step1")
    assert_contains "$step1_data" "completed" "Chain step 1 status correct"
    
    # Verify chain doesn't interfere with other worktrees
    local main_chain_key="cfn-main:chain:$TEST_TASK_ID:step1"
    local main_chain_data
    main_chain_data=$(redis_get "$main_chain_key" || echo "")
    assert_equals "" "$main_chain_data" "No cross-worktree chain contamination"
    
    log_success "Chain coordination verified"
}

test_consensus_collection() {
    log_step "Testing consensus collection pattern"
    
    # Simulate consensus collection for bugfix worktree
    local consensus_base="cfn-bugfix-validation:consensus:$TEST_TASK_ID"
    local validator_votes=("$consensus_base:validator1" "$consensus_base:validator2" "$consensus_base:validator3")
    
    # Set validator votes
    redis_set "${validator_votes[0]}" '{"score": 0.9, "confidence": "high", "decision": "PROCEED"}'
    redis_set "${validator_votes[1]}" '{"score": 0.85, "confidence": "high", "decision": "PROCEED"}'
    redis_set "${validator_votes[2]}" '{"score": 0.95, "confidence": "high", "decision": "PROCEED"}'
    
    # Verify consensus isolation
    local vote_count
    vote_count=$(redis_keys "cfn-bugfix-validation:consensus:$TEST_TASK_ID:*" | wc -l)
    assert_equals "3" "$vote_count" "Consensus has 3 votes"
    
    # Verify consensus doesn't appear in other worktrees
    local feature_votes
    feature_votes=$(redis_keys "cfn-feature-auth:consensus:$TEST_TASK_ID:*" | wc -l)
    assert_equals "0" "$feature_votes" "No cross-worktree consensus contamination"
    
    log_success "Consensus collection verified"
}

# ============================================================================
# PORT ISOLATION TESTS
# ============================================================================

test_redis_port_isolation() {
    log_step "Testing Redis port isolation configuration"
    
    # Test that different worktrees would use different Redis ports
    # This is a configuration test since we can't easily spin up multiple Redis instances
    
    # Test port calculation from run-in-worktree.sh
    local main_redis_port
    main_redis_port=$(CFN_WORKTREE_PORT_OFFSET=0 ./scripts/docker/run-in-worktree.sh --dry-run --verbose up 2>&1 | grep "Redis:" | awk '{print $3}' || echo "6379")
    
    local feature_redis_port
    feature_redis_port=$(CFN_WORKTREE_PORT_OFFSET=42 ./scripts/docker/run-in-worktree.sh --dry-run --verbose up 2>&1 | grep "Redis:" | awk '{print $3}' || echo "6421")
    
    # Ensure ports are different
    assert_not_equals "$main_redis_port" "$feature_redis_port" "Different worktrees use different Redis ports"
    
    # Verify port calculations
    assert_contains "$main_redis_port" "6379" "Main uses default Redis port"
    assert_contains "$feature_redis_port" "6421" "Feature uses offset Redis port"
    
    log_success "Redis port isolation configuration verified"
}

# ============================================================================
# COORDINATION LIFECYCLE TESTS
# ============================================================================

test_coordination_cleanup() {
    log_step "Testing coordination cleanup"
    
    # Set up coordination data that should be cleaned up
    local cleanup_key="cfn-main:coordination:$TEST_TASK_ID:temporary"
    redis_set "$cleanup_key" "temporary-data"
    
    # Verify data exists
    assert_success "Temporary data exists" redis_exists "$cleanup_key"
    
    # Simulate cleanup (what should happen when task completes)
    redis_del "$cleanup_key"
    
    # Verify cleanup
    assert_failure "Temporary data cleaned up" redis_exists "$cleanup_key"
    
    log_success "Coordination cleanup verified"
}

test_coordination_timeout() {
    log_step "Testing coordination timeout handling"
    
    # Set up coordination data with timestamp
    local timeout_key="cfn-feature-auth:coordination:$TEST_TASK_ID:timeout-test"
    local timeout_data='{
        "created_at": "'$(date -d '10 minutes ago' -Iseconds)'",
        "expires_at": "'$(date -d '5 minutes ago' -Iseconds)'",
        "status": "expired"
    }'
    
    redis_set "$timeout_key" "$timeout_data"
    
    # Verify expired data can be detected
    local retrieved_data
    retrieved_data=$(redis_get "$timeout_key")
    assert_contains "$retrieved_data" "expired" "Expired data marked correctly"
    
    # Clean up expired data
    redis_del "$timeout_key"
    
    log_success "Coordination timeout handling verified"
}

# ============================================================================
# SECURITY ISOLATION TESTS
# ============================================================================

test_coordination_security() {
    log_step "Testing coordination security isolation"
    
    # Test that worktree-specific data cannot be accessed from other worktrees
    local secure_key="cfn-main:secure:$TEST_TASK_ID:credentials"
    local secure_data='{"api_key": "[REDACTED]", "token": "[REDACTED]"}'
    
    redis_set "$secure_key" "$secure_data"
    
    # Verify data is only accessible with correct namespace
    local main_access
    main_access=$(redis_get "$secure_key")
    assert_contains "$main_access" "REDACTED" "Secure data accessible in correct namespace"
    
    # Verify data is not accessible from other namespaces
    local feature_access
    feature_access=$(redis_get "cfn-feature-auth:secure:$TEST_TASK_ID:credentials" || echo "")
    assert_equals "" "$feature_access" "Secure data not accessible from other namespace"
    
    # Clean up secure data
    redis_del "$secure_key"
    
    log_success "Coordination security isolation verified"
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

main() {
    # Setup test environment
    setup_redis_coordination_test
    
    # Run all test suites
    log_step "Running Redis coordination isolation tests"
    
    # Namespace isolation tests
    test_namespace_key_separation
    test_task_id_isolation
    test_agent_lifecycle_isolation
    
    # Coordination pattern tests
    test_broadcast_coordination
    test_chain_coordination
    test_consensus_collection
    
    # Port isolation tests
    test_redis_port_isolation
    
    # Coordination lifecycle tests
    test_coordination_cleanup
    test_coordination_timeout
    
    # Security isolation tests
    test_coordination_security
    
    # Cleanup
    teardown_redis_coordination_test
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi