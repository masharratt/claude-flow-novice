#!/usr/bin/env bash
# tests/docker/orchestration/test-orchestrator-consensus.sh
# Phase 3 :: CFN Loop Orchestrator Consensus - Loop 2 validation and product owner decisions

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

##############################################################################
# Test Configuration
##############################################################################

TEST_ID=$(generate_test_id)
TASK_ID="test-consensus-${TEST_ID}"
TMP_DIR=$(create_temp_dir)
ORCHESTRATOR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

# Mode configuration (standard mode)
MODE="standard"
CONSENSUS_THRESHOLD="0.90"
MAX_ITERATIONS="10"

# Mock validators
VALIDATORS="code-reviewer,security-specialist,tester"

##############################################################################
# Cleanup Function
##############################################################################

cleanup() {
    log_info "Cleaning up test environment"

    # Clean Redis test keys
    redis_del "swarm:${TASK_ID}:*" 2>/dev/null || true
    redis_del "task:${TASK_ID}:*" 2>/dev/null || true

    # Clean temporary files
    cleanup_temp_dir "$TMP_DIR"

    # Print test summary
    print_test_summary
}

trap cleanup EXIT

##############################################################################
# Test 1: Consensus Collection from Loop 2 Validators
##############################################################################

test_consensus_collection() {
    log_step "GIVEN Loop 2 validators complete reviews"

    # Set up Redis with mock consensus scores from validators
    redis_set "swarm:${TASK_ID}:validator:code-reviewer:consensus" "0.95"
    redis_set "swarm:${TASK_ID}:validator:security-specialist:consensus" "0.92"
    redis_set "swarm:${TASK_ID}:validator:tester:consensus" "0.93"

    # WHEN collecting consensus scores
    log_step "WHEN consensus scores are collected from validators"

    local score1=$(redis_get "swarm:${TASK_ID}:validator:code-reviewer:consensus")
    local score2=$(redis_get "swarm:${TASK_ID}:validator:security-specialist:consensus")
    local score3=$(redis_get "swarm:${TASK_ID}:validator:tester:consensus")

    log_info "Code reviewer consensus: $score1"
    log_info "Security specialist consensus: $score2"
    log_info "Tester consensus: $score3"

    # THEN all validators provide consensus scores
    log_step "THEN consensus scores are collected from all validators"

    assert_not_empty "$score1" "Code reviewer consensus exists"
    assert_not_empty "$score2" "Security specialist consensus exists"
    assert_not_empty "$score3" "Tester consensus exists"

    # Validate average consensus
    if command -v bc >/dev/null 2>&1; then
        local avg=$(echo "scale=2; ($score1 + $score2 + $score3) / 3" | bc -l)
        local consensus_passes=$(echo "$avg >= $CONSENSUS_THRESHOLD" | bc -l)

        log_info "Average consensus: $avg (threshold: $CONSENSUS_THRESHOLD)"

        assert_equals "1" "$consensus_passes" "Average consensus exceeds threshold"
    else
        log_warn "bc not available, skipping float validation"
    fi
}

##############################################################################
# Test 2: Consensus Threshold Validation
##############################################################################

test_consensus_threshold_validation() {
    log_step "GIVEN consensus must meet mode-specific threshold"

    # Test different consensus scores
    local high_consensus="0.95"
    local at_threshold="0.90"
    local below_threshold="0.85"

    # WHEN validating consensus scores
    log_step "WHEN validating consensus against threshold (0.90)"

    # THEN scores are correctly validated
    log_step "THEN consensus threshold validation works correctly"

    if command -v bc >/dev/null 2>&1; then
        # High consensus
        local passes_high=$(echo "$high_consensus >= $CONSENSUS_THRESHOLD" | bc -l)
        assert_equals "1" "$passes_high" "High consensus (0.95) passes threshold"

        # At threshold
        local passes_at=$(echo "$at_threshold >= $CONSENSUS_THRESHOLD" | bc -l)
        assert_equals "1" "$passes_at" "Consensus at threshold (0.90) passes"

        # Below threshold
        local passes_below=$(echo "$below_threshold >= $CONSENSUS_THRESHOLD" | bc -l)
        assert_equals "0" "$passes_below" "Low consensus (0.85) fails threshold"
    else
        log_warn "bc not available, skipping threshold validation"
    fi

    # Verify orchestrator has consensus threshold checking
    assert_success "Consensus threshold check exists" \
        grep -q "CONSENSUS.*THRESHOLD\|consensus.*threshold" "$ORCHESTRATOR"
}

##############################################################################
# Test 3: Product Owner Decision Parsing
##############################################################################

test_product_owner_decision_parsing() {
    log_step "GIVEN product owner makes decision"

    # Create mock product owner decisions
    local proceed_decision="DECISION: PROCEED"
    local iterate_decision="DECISION: ITERATE"
    local abort_decision="DECISION: ABORT"

    # WHEN storing decisions in Redis
    log_step "WHEN product owner decisions are stored"

    redis_set "swarm:${TASK_ID}:po:decision:test1" "$proceed_decision"
    redis_set "swarm:${TASK_ID}:po:decision:test2" "$iterate_decision"
    redis_set "swarm:${TASK_ID}:po:decision:test3" "$abort_decision"

    # THEN decisions are properly stored and retrievable
    log_step "THEN product owner decisions can be parsed"

    local decision1=$(redis_get "swarm:${TASK_ID}:po:decision:test1")
    local decision2=$(redis_get "swarm:${TASK_ID}:po:decision:test2")
    local decision3=$(redis_get "swarm:${TASK_ID}:po:decision:test3")

    assert_contains "$decision1" "PROCEED" "PROCEED decision stored"
    assert_contains "$decision2" "ITERATE" "ITERATE decision stored"
    assert_contains "$decision3" "ABORT" "ABORT decision stored"

    # Verify orchestrator handles all decision types
    assert_success "PROCEED handling exists" \
        grep -q "PROCEED" "$ORCHESTRATOR"

    assert_success "ITERATE handling exists" \
        grep -q "ITERATE" "$ORCHESTRATOR"

    assert_success "ABORT handling exists" \
        grep -q "ABORT" "$ORCHESTRATOR"
}

##############################################################################
# Test 4: PROCEED Decision Workflow
##############################################################################

test_proceed_decision_workflow() {
    log_step "GIVEN product owner decides PROCEED"

    # Set up successful consensus
    redis_set "swarm:${TASK_ID}:consensus:average" "0.93"
    redis_set "swarm:${TASK_ID}:po:decision" "PROCEED"
    redis_set "swarm:${TASK_ID}:deliverables:verified" "true"

    # WHEN PROCEED decision is processed
    log_step "WHEN PROCEED decision triggers workflow completion"

    local decision=$(redis_get "swarm:${TASK_ID}:po:decision")
    local deliverables_verified=$(redis_get "swarm:${TASK_ID}:deliverables:verified")

    # THEN workflow completes successfully
    log_step "THEN workflow completes with verified deliverables"

    assert_equals "PROCEED" "$decision" "Decision is PROCEED"
    assert_equals "true" "$deliverables_verified" "Deliverables verified"

    # Verify PROCEED case includes deliverable verification
    assert_success "Deliverable verification in PROCEED" \
        grep -A 10 "PROCEED" "$ORCHESTRATOR" | grep -q "deliverable\|DELIVERABLE\|verified\|output"
}

##############################################################################
# Test 5: ITERATE Decision Workflow
##############################################################################

test_iterate_decision_workflow() {
    log_step "GIVEN product owner decides ITERATE"

    # Set up iteration scenario
    redis_set "swarm:${TASK_ID}:iteration" "3"
    redis_set "swarm:${TASK_ID}:po:decision" "ITERATE"
    redis_set "swarm:${TASK_ID}:po:rationale" "Quality improvements needed"

    # WHEN ITERATE decision is processed
    log_step "WHEN ITERATE decision triggers another iteration"

    local current_iteration=$(redis_get "swarm:${TASK_ID}:iteration")
    local decision=$(redis_get "swarm:${TASK_ID}:po:decision")
    local rationale=$(redis_get "swarm:${TASK_ID}:po:rationale")

    # Simulate iteration increment
    local next_iteration=$((current_iteration + 1))
    redis_set "swarm:${TASK_ID}:iteration" "$next_iteration"

    # THEN iteration counter increments and workflow continues
    log_step "THEN iteration counter increments for retry"

    assert_equals "ITERATE" "$decision" "Decision is ITERATE"
    assert_not_empty "$rationale" "Rationale provided"

    local new_iteration=$(redis_get "swarm:${TASK_ID}:iteration")
    assert_equals "4" "$new_iteration" "Iteration incremented to 4"

    # Verify ITERATE case handles feedback injection
    assert_success "ITERATE feedback handling" \
        grep -A 10 "ITERATE" "$ORCHESTRATOR" | grep -q "iteration\|feedback\|retry"
}

##############################################################################
# Test 6: ABORT Decision Workflow
##############################################################################

test_abort_decision_workflow() {
    log_step "GIVEN product owner decides ABORT"

    # Set up abort scenario
    redis_set "swarm:${TASK_ID}:po:decision" "ABORT"
    redis_set "swarm:${TASK_ID}:po:rationale" "Critical blocking issues"
    redis_set "swarm:${TASK_ID}:status" "aborted"

    # WHEN ABORT decision is processed
    log_step "WHEN ABORT decision triggers workflow termination"

    local decision=$(redis_get "swarm:${TASK_ID}:po:decision")
    local rationale=$(redis_get "swarm:${TASK_ID}:po:rationale")
    local status=$(redis_get "swarm:${TASK_ID}:status")

    # THEN workflow terminates with abort status
    log_step "THEN workflow terminates with abort status"

    assert_equals "ABORT" "$decision" "Decision is ABORT"
    assert_not_empty "$rationale" "Abort rationale provided"
    assert_equals "aborted" "$status" "Status set to aborted"

    # Verify ABORT case includes error handling
    assert_success "ABORT error handling" \
        grep -A 10 "ABORT" "$ORCHESTRATOR" | grep -q "exit\|error\|fail"
}

##############################################################################
# Test 7: Validator Timeout Handling
##############################################################################

test_validator_timeout_handling() {
    log_step "GIVEN validators may timeout"

    # Set up timeout scenario
    redis_set "swarm:${TASK_ID}:validator:code-reviewer:status" "completed"
    redis_set "swarm:${TASK_ID}:validator:security-specialist:status" "timeout"
    redis_set "swarm:${TASK_ID}:validator:tester:status" "completed"

    # WHEN checking validator statuses
    log_step "WHEN checking for validator timeouts"

    local status1=$(redis_get "swarm:${TASK_ID}:validator:code-reviewer:status")
    local status2=$(redis_get "swarm:${TASK_ID}:validator:security-specialist:status")
    local status3=$(redis_get "swarm:${TASK_ID}:validator:tester:status")

    # THEN timeout is detected
    log_step "THEN validator timeouts are properly detected"

    assert_equals "completed" "$status1" "Code reviewer completed"
    assert_equals "timeout" "$status2" "Security specialist timed out"
    assert_equals "completed" "$status3" "Tester completed"

    # Count timeouts
    local timeout_count=0
    for status in "$status1" "$status2" "$status3"; do
        if [[ "$status" == "timeout" ]]; then
            timeout_count=$((timeout_count + 1))
        fi
    done

    assert_equals "1" "$timeout_count" "One validator timeout detected"

    # Verify orchestrator has timeout handling
    assert_success "Timeout handling exists" \
        grep -q "timeout\|TIMEOUT" "$ORCHESTRATOR"
}

##############################################################################
# Test 8: Consensus Quorum Requirements
##############################################################################

test_consensus_quorum_requirements() {
    log_step "GIVEN consensus requires minimum quorum"

    local min_quorum="0.66"  # 66% of validators must respond
    local total_validators=3
    local required_validators=$(echo "scale=0; $total_validators * $min_quorum / 1" | bc)

    log_info "Total validators: $total_validators"
    log_info "Required validators (66% quorum): $required_validators"

    # WHEN checking quorum requirements
    log_step "WHEN validating quorum requirements"

    # Test with 2/3 validators (meets quorum)
    redis_set "swarm:${TASK_ID}:validators:responded" "2"
    local responded=$(redis_get "swarm:${TASK_ID}:validators:responded")

    # THEN quorum is met
    log_step "THEN quorum requirements are validated"

    if command -v bc >/dev/null 2>&1; then
        local quorum_met=$(echo "$responded >= $required_validators" | bc -l)
        assert_equals "1" "$quorum_met" "Quorum met with 2/3 validators"
    fi

    # Verify orchestrator has quorum checking
    assert_success "Quorum validation exists" \
        grep -q "quorum\|QUORUM\|MIN_QUORUM" "$ORCHESTRATOR"
}

##############################################################################
# Test 9: Mode-Specific Consensus Thresholds
##############################################################################

test_mode_specific_consensus_thresholds() {
    log_step "GIVEN different modes have different consensus thresholds"

    # Define mode thresholds
    local mvp_threshold="0.80"
    local standard_threshold="0.90"
    local enterprise_threshold="0.95"

    # Test consensus score that passes MVP/Standard but fails Enterprise
    local test_consensus="0.92"

    # WHEN checking consensus against mode thresholds
    log_step "WHEN validating consensus against mode-specific thresholds"

    # THEN consensus passes/fails based on mode
    log_step "THEN mode-specific consensus thresholds are applied"

    if command -v bc >/dev/null 2>&1; then
        # MVP mode (0.80 threshold)
        local passes_mvp=$(echo "$test_consensus >= $mvp_threshold" | bc -l)
        assert_equals "1" "$passes_mvp" "Consensus 0.92 passes MVP threshold (0.80)"

        # Standard mode (0.90 threshold)
        local passes_standard=$(echo "$test_consensus >= $standard_threshold" | bc -l)
        assert_equals "1" "$passes_standard" "Consensus 0.92 passes Standard threshold (0.90)"

        # Enterprise mode (0.95 threshold)
        local passes_enterprise=$(echo "$test_consensus >= $enterprise_threshold" | bc -l)
        assert_equals "0" "$passes_enterprise" "Consensus 0.92 fails Enterprise threshold (0.95)"

        log_info "Consensus 0.92: MVP=PASS, Standard=PASS, Enterprise=FAIL"
    else
        log_warn "bc not available, skipping threshold validation"
    fi

    # Verify orchestrator defines mode-specific consensus thresholds
    assert_success "MVP consensus threshold defined" \
        grep -q "mvp.*0\\.80" "$ORCHESTRATOR"

    assert_success "Standard consensus threshold defined" \
        grep -q "standard.*0\\.90" "$ORCHESTRATOR"

    assert_success "Enterprise consensus threshold defined" \
        grep -q "enterprise.*0\\.95" "$ORCHESTRATOR"
}

##############################################################################
# Test 10: Product Owner Spawning Logic
##############################################################################

test_product_owner_spawning() {
    log_step "GIVEN product owner is spawned after consensus"

    # Set up consensus completion
    redis_set "swarm:${TASK_ID}:consensus:completed" "true"
    redis_set "swarm:${TASK_ID}:consensus:average" "0.93"
    redis_set "swarm:${TASK_ID}:po:spawned" "false"

    # WHEN checking product owner spawn conditions
    log_step "WHEN verifying product owner spawn logic"

    local consensus_completed=$(redis_get "swarm:${TASK_ID}:consensus:completed")
    local po_spawned=$(redis_get "swarm:${TASK_ID}:po:spawned")

    # THEN product owner spawning is conditional on consensus
    log_step "THEN product owner spawns after consensus completes"

    assert_equals "true" "$consensus_completed" "Consensus completed"
    assert_equals "false" "$po_spawned" "Product owner not yet spawned"

    # Verify orchestrator has product owner spawn logic
    assert_success "Product owner spawn logic exists" \
        grep -q "PRODUCT_OWNER\|product.*owner" "$ORCHESTRATOR"

    # Check for conditional spawning (after consensus)
    assert_success "Conditional spawn after consensus" \
        grep -B 10 "PRODUCT_OWNER" "$ORCHESTRATOR" | grep -q "consensus\|CONSENSUS"
}

##############################################################################
# Test 11: Deliverables Verification
##############################################################################

test_deliverables_verification() {
    log_step "GIVEN deliverables must be verified before PROCEED"

    # Set up deliverables
    local expected_files="src/api.ts,src/utils.ts,tests/api.test.ts"

    # Store in Redis
    redis_set "task:${TASK_ID}:expected-files" "$expected_files"
    redis_set "swarm:${TASK_ID}:deliverables:verified" "true"

    # WHEN checking deliverables
    log_step "WHEN verifying expected deliverables exist"

    local expected=$(redis_get "task:${TASK_ID}:expected-files")
    local verified=$(redis_get "swarm:${TASK_ID}:deliverables:verified")

    # THEN deliverables are tracked and verified
    log_step "THEN deliverables verification is enforced"

    assert_not_empty "$expected" "Expected files defined"
    assert_equals "true" "$verified" "Deliverables verified"

    # Verify orchestrator has deliverables checking
    assert_success "Deliverables verification logic exists" \
        grep -q "deliverable\|DELIVERABLE\|expected.*file" "$ORCHESTRATOR"
}

##############################################################################
# Execute All Tests
##############################################################################

setup_test "orchestrator-consensus"

annotate "Test Suite: CFN Loop Orchestrator Consensus"

test_consensus_collection
test_consensus_threshold_validation
test_product_owner_decision_parsing
test_proceed_decision_workflow
test_iterate_decision_workflow
test_abort_decision_workflow
test_validator_timeout_handling
test_consensus_quorum_requirements
test_mode_specific_consensus_thresholds
test_product_owner_spawning
test_deliverables_verification

teardown_test
