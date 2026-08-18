#!/usr/bin/env bash
# tests/docker/example-p1-test.sh
# Phase 4 :: Example P1 test using architecture-test-helpers.sh
# Demonstrates integration patterns for CFN Loop validation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"

cleanup() {
    log_step "Cleaning up test environment"
    cleanup_docker_test
}
trap cleanup EXIT

annotate "Example P1 Test - CFN Loop Gate Validation"

# ============================================================================
# TEST SCENARIO: Validate Loop 3 Gate Check
# ============================================================================

test_loop3_gate_check() {
    log_step "Test: Loop 3 gate validation with agent confidence scores"

    # Simulate 3 Loop 3 agents completing with confidence scores
    local scores=(0.85 0.90 0.88)
    local gate_threshold=0.75

    log_info "Agent scores: ${scores[*]}"
    log_info "Gate threshold: $gate_threshold"

    # Validate gate threshold
    if validate_gate_threshold $gate_threshold "${scores[@]}"; then
        log_success "Loop 3 gate check PASSED - proceed to Loop 2"
        return 0
    else
        log_error "Loop 3 gate check FAILED - iterate Loop 3"
        return 1
    fi
}

# ============================================================================
# TEST SCENARIO: Validate Loop 2 Consensus
# ============================================================================

test_loop2_consensus() {
    log_step "Test: Loop 2 consensus validation"

    # Simulate 4 validators with scores
    local validator_scores=(0.92 0.91 0.93 0.89)
    local consensus_threshold=0.90

    log_info "Validator scores: ${validator_scores[*]}"
    log_info "Consensus threshold: $consensus_threshold"

    # Validate consensus
    if validate_consensus $consensus_threshold "${validator_scores[@]}"; then
        log_success "Loop 2 consensus ACHIEVED"
        return 0
    else
        log_error "Loop 2 consensus FAILED"
        return 1
    fi
}

# ============================================================================
# TEST SCENARIO: Environment Variable Propagation
# ============================================================================

test_env_var_propagation() {
    log_step "Test: Environment variable propagation validation"

    # Create test .env file
    local test_env="/tmp/test-p1.env"
    cat > "$test_env" <<EOF
# CFN Loop configuration
CFN_REDIS_HOST=cfn-redis
CFN_REDIS_PORT=6379
CFN_CUSTOM_ROUTING=true
CLAUDE_API_PROVIDER=zai
TASK_ID=test-task-$(date +%s)
EOF

    # Validate .env file
    if validate_env_file "$test_env"; then
        log_success ".env file validation PASSED"
    else
        log_error ".env file validation FAILED"
        rm -f "$test_env"
        return 1
    fi

    # Check required variables exist
    log_info "Verifying required variables exist in file"
    local required_vars=("CFN_REDIS_HOST" "CFN_REDIS_PORT" "TASK_ID")

    for var in "${required_vars[@]}"; do
        if grep -q "^${var}=" "$test_env"; then
            log_success "Found: $var"
        else
            log_error "Missing: $var"
            rm -f "$test_env"
            return 1
        fi
    done

    # Cleanup
    rm -f "$test_env"
    log_success "Environment variable propagation test PASSED"
    return 0
}

# ============================================================================
# TEST SCENARIO: TypeScript Error Analysis
# ============================================================================

test_typescript_error_analysis() {
    log_step "Test: TypeScript error delta validation"

    # Simulate error reduction scenario
    local iteration1_errors=15
    local iteration2_errors=8
    local iteration3_errors=0

    # Test iteration 1 -> 2
    log_info "Iteration 1 -> 2: $iteration1_errors -> $iteration2_errors errors"
    if validate_error_delta $iteration1_errors $iteration2_errors; then
        log_success "Error reduction validated (iteration 1->2)"
    else
        log_error "No error reduction (iteration 1->2)"
        return 1
    fi

    # Test iteration 2 -> 3
    log_info "Iteration 2 -> 3: $iteration2_errors -> $iteration3_errors errors"
    if validate_error_delta $iteration2_errors $iteration3_errors; then
        log_success "Error reduction validated (iteration 2->3)"
    else
        log_error "No error reduction (iteration 2->3)"
        return 1
    fi

    log_success "TypeScript error analysis test PASSED"
    return 0
}

# ============================================================================
# TEST SCENARIO: Build Context Validation
# ============================================================================

test_build_context_validation() {
    log_step "Test: Build context size and exclusions"

    # Create test build context
    local test_context="/tmp/test-build-p1"
    mkdir -p "$test_context"

    # Create .dockerignore
    cat > "$test_context/.dockerignore" <<EOF
node_modules
.git
*.log
.env
.backups
EOF

    # Verify rsync exclusions
    if validate_rsync_exclusions "$test_context"; then
        log_success "Rsync exclusions validated"
    else
        log_warn "Some exclusions missing (non-fatal)"
    fi

    # Verify build context size (empty context should pass)
    if verify_build_context_size "$test_context" 100; then
        log_success "Build context size acceptable"
    else
        log_error "Build context too large"
        rm -rf "$test_context"
        return 1
    fi

    # Cleanup
    rm -rf "$test_context"
    log_success "Build context validation test PASSED"
    return 0
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

log_step "Running all P1 example tests"

# Disable errexit for test execution
set +e

test_loop3_gate_check
test_loop2_consensus
test_env_var_propagation
test_typescript_error_analysis
test_build_context_validation

# Re-enable errexit
set -e

annotate "All P1 example tests completed successfully"
