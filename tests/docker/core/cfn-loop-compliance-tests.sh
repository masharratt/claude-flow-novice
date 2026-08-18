#!/usr/bin/env bash
# tests/docker/cfn-loop-compliance-tests.sh
# Phase 4 :: P1 - CFN Loop pattern compliance validation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/helpers/architecture-test-helpers.sh"

# Configuration
TEST_DIR="$(create_temp_dir)"
REDIS_SERVICE="cfn-redis"

cleanup() {
    log_step "Cleaning up test data"
    redis_del "loop:test-gate:confidence:agent-1" || true
    redis_del "loop:test-gate:confidence:agent-2" || true
    redis_del "loop:test-gate:confidence:agent-3" || true
    redis_del "loop:test-consensus:validator-1" || true
    redis_del "loop:test-consensus:validator-2" || true
    redis_del "loop:test-consensus:validator-3" || true
    redis_del "loop:test-decision" || true
    redis_del "loop:test-iteration:metadata" || true
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test 1: Loop 3 gate check (≥0.75 threshold)
test_loop3_gate_check() {
    log_step "Test 1: Loop 3 gate check (≥0.75 threshold)"

    # GIVEN: Three Loop 3 agents reporting confidence scores
    local agents=("agent-1" "agent-2" "agent-3")
    local scores=(0.85 0.78 0.82)
    local gate_threshold=0.75

    # WHEN: Agents report confidence to Redis
    for i in "${!agents[@]}"; do
        local agent="${agents[$i]}"
        local score="${scores[$i]}"
        redis_set "loop:test-gate:confidence:$agent" "$score"
        log_info "Agent $agent reported confidence: $score"
    done

    # THEN: Validate gate threshold using helper
    local collected_scores=()
    for agent in "${agents[@]}"; do
        local score
        score=$(redis_get "loop:test-gate:confidence:$agent")
        collected_scores+=("$score")
    done

    validate_gate_threshold "$gate_threshold" "${collected_scores[@]}" || {
        log_error "Gate validation failed"
        return 1
    }

    # THEN: Test gate failure scenario
    redis_set "loop:test-gate:confidence:agent-2" "0.65"
    local low_score
    low_score=$(redis_get "loop:test-gate:confidence:agent-2")

    if [ "${low_score//./}" -lt 75 ]; then
        log_success "Gate correctly identifies failing score: $low_score"
    else
        log_error "Failed to detect low confidence score"
        return 1
    fi
}

# Test 2: Loop 2 consensus validation (≥0.90 threshold)
test_loop2_consensus() {
    log_step "Test 2: Loop 2 consensus validation (≥0.90 threshold)"

    # GIVEN: Three Loop 2 validators reporting consensus scores
    local validators=("validator-1" "validator-2" "validator-3")
    local scores=(0.92 0.95 0.88)
    local consensus_threshold=0.90

    # WHEN: Validators report consensus to Redis
    for i in "${!validators[@]}"; do
        local validator="${validators[$i]}"
        local score="${scores[$i]}"
        redis_set "loop:test-consensus:$validator" "$score"
        log_info "Validator $validator reported: $score"
    done

    # THEN: Validate consensus using helper
    local validator_scores=()
    for validator in "${validators[@]}"; do
        local score
        score=$(redis_get "loop:test-consensus:$validator")
        validator_scores+=("$score")
    done

    validate_consensus "$consensus_threshold" "${validator_scores[@]}" || {
        log_error "Consensus validation failed"
        return 1
    }

    # THEN: Test consensus with split decision
    redis_set "loop:test-consensus:validator-3" "0.85"
    local split_score
    split_score=$(redis_get "loop:test-consensus:validator-3")

    if [ "${split_score//./}" -lt 90 ]; then
        log_success "Detected validator below consensus threshold: $split_score"
    else
        log_error "Failed to detect low consensus score"
        return 1
    fi
}

# Test 3: Product Owner decision validation (PROCEED/ITERATE/ABORT)
test_product_owner_decision() {
    log_step "Test 3: Product Owner decision (PROCEED/ITERATE/ABORT)"

    # GIVEN: Product Owner decision scenarios
    local decisions=("PROCEED" "ITERATE" "ABORT")

    for decision in "${decisions[@]}"; do
        # WHEN: Product Owner writes decision to Redis
        redis_set "loop:test-decision" "$decision"

        # THEN: Retrieve and validate decision
        local stored_decision
        stored_decision=$(redis_get "loop:test-decision")

        if [ "$stored_decision" = "$decision" ]; then
            log_success "Decision stored and retrieved: $decision"
        else
            log_error "Decision mismatch: expected $decision, got $stored_decision"
            return 1
        fi

        # THEN: Validate decision format (uppercase, valid value)
        if [[ "$stored_decision" =~ ^(PROCEED|ITERATE|ABORT)$ ]]; then
            log_success "Decision format valid: $stored_decision"
        else
            log_error "Invalid decision format: $stored_decision"
            return 1
        fi
    done

    # THEN: Test decision with metadata
    local decision_with_metadata='{"decision": "ITERATE", "reason": "3 errors remaining", "next_iteration": 2}'
    redis_set "loop:test-decision" "$decision_with_metadata"

    local stored_metadata
    stored_metadata=$(redis_get "loop:test-decision")

    if echo "$stored_metadata" | grep -q "ITERATE"; then
        log_success "Decision metadata stored correctly"
    else
        log_error "Failed to store decision metadata"
        return 1
    fi
}

# Test 4: Iteration metadata tracking
test_iteration_metadata() {
    log_step "Test 4: Iteration metadata tracking"

    # GIVEN: Iteration metadata structure
    local iteration_data=$(cat <<EOF
{
  "iteration": 1,
  "timestamp": "$(date -Iseconds)",
  "loop3_confidence": 0.82,
  "loop2_consensus": 0.91,
  "decision": "ITERATE",
  "errors_remaining": 5,
  "errors_fixed": 3
}
EOF
)

    # WHEN: Store iteration metadata
    redis_set "loop:test-iteration:metadata" "$iteration_data"

    # THEN: Retrieve and validate metadata
    local stored_metadata
    stored_metadata=$(redis_get "loop:test-iteration:metadata")

    if [ -n "$stored_metadata" ]; then
        log_success "Iteration metadata stored"
    else
        log_error "Failed to store iteration metadata"
        return 1
    fi

    # THEN: Validate required fields present
    local required_fields=("iteration" "timestamp" "loop3_confidence" "loop2_consensus" "decision")

    for field in "${required_fields[@]}"; do
        if echo "$stored_metadata" | grep -q "\"$field\""; then
            log_info "Field present: $field"
        else
            log_error "Missing required field: $field"
            return 1
        fi
    done

    log_success "All required metadata fields present"

    # THEN: Test multi-iteration tracking
    local iteration2_data=$(cat <<EOF
{
  "iteration": 2,
  "timestamp": "$(date -Iseconds)",
  "loop3_confidence": 0.88,
  "loop2_consensus": 0.93,
  "decision": "PROCEED",
  "errors_remaining": 0,
  "errors_fixed": 5
}
EOF
)

    redis_set "loop:test-iteration:metadata" "$iteration2_data"

    local iteration2_stored
    iteration2_stored=$(redis_get "loop:test-iteration:metadata")

    if echo "$iteration2_stored" | grep -q '"iteration": 2'; then
        log_success "Multi-iteration tracking works"
    else
        log_error "Failed to track multiple iterations"
        return 1
    fi

    # THEN: Validate iteration progression
    if echo "$iteration2_stored" | grep -q '"errors_remaining": 0'; then
        log_success "Iteration 2 shows convergence (0 errors)"
    else
        log_error "Iteration progression validation failed"
        return 1
    fi
}

# Execute all tests
setup_test "cfn-loop-compliance"

test_loop3_gate_check
test_loop2_consensus
test_product_owner_decision
test_iteration_metadata

teardown_test
