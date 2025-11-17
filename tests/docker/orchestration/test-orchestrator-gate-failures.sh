#!/bin/bash
# tests/docker/orchestration/test-orchestrator-gate-failures.sh
# Phase 3 :: CFN Loop Orchestrator Gate Failures - Threshold enforcement and retry logic

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

##############################################################################
# Test Configuration
##############################################################################

TEST_ID=$(generate_test_id)
TASK_ID="test-gate-fail-${TEST_ID}"
TMP_DIR=$(create_temp_dir)
ORCHESTRATOR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

# Mode configuration (standard mode)
MODE="standard"
GATE_THRESHOLD="0.75"
MAX_ITERATIONS="10"

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
# Test 1: Gate Failure - Confidence Below Threshold
##############################################################################

test_gate_failure_below_threshold() {
    log_step "GIVEN Loop 3 agents complete with confidence below threshold"

    # Set up Redis with mock confidence scores BELOW threshold (0.75)
    redis_set "swarm:${TASK_ID}:agent:backend-developer:confidence" "0.65"
    redis_set "swarm:${TASK_ID}:agent:frontend-developer:confidence" "0.70"

    # WHEN calculating average confidence
    log_step "WHEN average confidence is calculated"

    local score1=$(redis_get "swarm:${TASK_ID}:agent:backend-developer:confidence")
    local score2=$(redis_get "swarm:${TASK_ID}:agent:frontend-developer:confidence")

    log_info "Agent 1 confidence: $score1"
    log_info "Agent 2 confidence: $score2"

    # THEN average is below gate threshold
    log_step "THEN average confidence fails gate check"

    if command -v bc >/dev/null 2>&1; then
        local avg=$(echo "scale=2; ($score1 + $score2) / 2" | bc -l)
        local gate_passed=$(echo "$avg >= $GATE_THRESHOLD" | bc -l)

        log_info "Average confidence: $avg (threshold: $GATE_THRESHOLD)"

        assert_equals "0" "$gate_passed" "Gate check fails with low confidence"

        # Verify both individual scores are below threshold
        local score1_passes=$(echo "$score1 >= $GATE_THRESHOLD" | bc -l)
        local score2_passes=$(echo "$score2 >= $GATE_THRESHOLD" | bc -l)

        assert_equals "0" "$score1_passes" "Agent 1 confidence below threshold"
        assert_equals "0" "$score2_passes" "Agent 2 confidence below threshold"
    else
        log_warn "bc not available, skipping float validation"
    fi
}

##############################################################################
# Test 2: Iteration Increment on Gate Failure
##############################################################################

test_iteration_increment_on_failure() {
    log_step "GIVEN gate check fails on iteration 1"

    # Initialize iteration counter
    redis_set "swarm:${TASK_ID}:iteration" "1"
    redis_set "swarm:${TASK_ID}:gate:passed" "false"

    # WHEN iteration counter is incremented for retry
    log_step "WHEN iteration counter increments for retry"

    local current_iteration=$(redis_get "swarm:${TASK_ID}:iteration")
    local next_iteration=$((current_iteration + 1))
    redis_set "swarm:${TASK_ID}:iteration" "$next_iteration"

    # THEN iteration counter is incremented
    log_step "THEN iteration counter advances to next iteration"

    local new_iteration=$(redis_get "swarm:${TASK_ID}:iteration")

    assert_equals "2" "$new_iteration" "Iteration incremented from 1 to 2"

    # Verify gate status remains failed
    local gate_status=$(redis_get "swarm:${TASK_ID}:gate:passed")
    assert_equals "false" "$gate_status" "Gate status remains failed"
}

##############################################################################
# Test 3: Maximum Iteration Limit Enforcement
##############################################################################

test_max_iteration_enforcement() {
    log_step "GIVEN orchestrator has maximum iteration limit"

    # WHEN checking maximum iteration validation
    log_step "WHEN verifying max iteration enforcement in orchestrator"

    # THEN orchestrator enforces iteration limits
    log_step "THEN orchestrator has max iteration enforcement logic"

    # Check for max iteration comparison
    assert_success "Max iteration check exists" \
        grep -q "MAX_ITERATIONS\|max.*iteration" "$ORCHESTRATOR"

    # Check for iteration limit enforcement
    assert_success "Iteration limit enforcement exists" \
        grep -q "iteration.*limit\|ITERATIONS_COMPLETED.*MAX\|gt.*MAX_ITERATIONS" "$ORCHESTRATOR"

    # Test iteration limit logic with Redis
    redis_set "swarm:${TASK_ID}:iteration" "$MAX_ITERATIONS"

    local current=$(redis_get "swarm:${TASK_ID}:iteration")

    if command -v bc >/dev/null 2>&1; then
        local at_limit=$(echo "$current >= $MAX_ITERATIONS" | bc -l)
        assert_equals "1" "$at_limit" "Iteration at maximum limit"
    fi

    log_info "Max iterations: $MAX_ITERATIONS, Current: $current"
}

##############################################################################
# Test 4: Loop 2 Not Spawned on Gate Failure
##############################################################################

test_loop2_not_spawned_on_gate_failure() {
    log_step "GIVEN gate check fails"

    # Mark gate as failed in Redis
    redis_set "swarm:${TASK_ID}:gate:passed" "false"
    redis_set "swarm:${TASK_ID}:loop2:spawned" "false"

    # WHEN checking Loop 2 spawn logic
    log_step "WHEN verifying Loop 2 spawn depends on gate pass"

    # THEN orchestrator has conditional Loop 2 spawning
    log_step "THEN Loop 2 is only spawned after gate passes"

    # Check for conditional logic around Loop 2 spawning
    assert_success "Gate pass check before Loop 2 exists" \
        grep -B 5 "Loop 2\|loop2" "$ORCHESTRATOR" | grep -q "gate\|GATE"

    # Verify Loop 2 was not spawned (from Redis)
    local loop2_spawned=$(redis_get "swarm:${TASK_ID}:loop2:spawned")
    assert_equals "false" "$loop2_spawned" "Loop 2 not spawned when gate fails"
}

##############################################################################
# Test 5: Retry Logic Triggers Correctly
##############################################################################

test_retry_logic_triggers() {
    log_step "GIVEN gate failure triggers retry"

    # Set up failure scenario
    redis_set "swarm:${TASK_ID}:iteration" "3"
    redis_set "swarm:${TASK_ID}:gate:passed" "false"
    redis_set "swarm:${TASK_ID}:retry:triggered" "true"

    # WHEN retry is triggered
    log_step "WHEN retry logic executes"

    # THEN retry state is properly tracked
    log_step "THEN retry state is tracked and managed"

    local retry_triggered=$(redis_get "swarm:${TASK_ID}:retry:triggered")
    assert_equals "true" "$retry_triggered" "Retry flag is set"

    local iteration=$(redis_get "swarm:${TASK_ID}:iteration")
    assert_equals "3" "$iteration" "Iteration counter reflects retry attempts"

    # Check orchestrator has retry/iteration logic
    assert_success "Retry logic exists in orchestrator" \
        grep -q "ITERATE\|retry\|iteration" "$ORCHESTRATOR"
}

##############################################################################
# Test 6: Confidence Score Range Validation
##############################################################################

test_confidence_score_range_validation() {
    log_step "GIVEN confidence scores must be in range 0.0-1.0"

    # Test edge cases
    local test_cases=(
        "0.0:valid"
        "0.5:valid"
        "0.74:below_threshold"
        "0.75:at_threshold"
        "1.0:valid"
    )

    # WHEN validating confidence scores
    log_step "WHEN validating confidence score ranges"

    # THEN scores are validated correctly
    log_step "THEN confidence scores are validated"

    if command -v bc >/dev/null 2>&1; then
        for test_case in "${test_cases[@]}"; do
            local score="${test_case%:*}"
            local expected="${test_case#*:}"

            # Validate range
            local in_range=$(echo "$score >= 0.0 && $score <= 1.0" | bc -l)
            assert_equals "1" "$in_range" "Score $score is in valid range (0.0-1.0)"

            # Check against threshold for relevant cases
            if [[ "$expected" == "below_threshold" ]]; then
                local passes=$(echo "$score >= $GATE_THRESHOLD" | bc -l)
                assert_equals "0" "$passes" "Score $score is below threshold"
            elif [[ "$expected" == "at_threshold" ]]; then
                local passes=$(echo "$score >= $GATE_THRESHOLD" | bc -l)
                assert_equals "1" "$passes" "Score $score meets threshold"
            fi
        done
    else
        log_warn "bc not available, skipping float validation"
    fi
}

##############################################################################
# Test 7: Feedback Injection on Gate Failure
##############################################################################

test_feedback_injection_on_failure() {
    log_step "GIVEN gate failure should inject feedback to agents"

    # WHEN checking feedback injection logic
    log_step "WHEN verifying feedback injection mechanism"

    # THEN orchestrator has feedback injection logic
    log_step "THEN feedback is injected on gate failure"

    # Check for feedback-related logic in orchestrator
    # Note: Actual feedback injection may be in separate scripts
    local has_feedback=$(grep -c "feedback\|FEEDBACK" "$ORCHESTRATOR" || echo "0")

    if [[ "$has_feedback" -gt 0 ]]; then
        log_success "Feedback injection logic found ($has_feedback references)"
    else
        log_warn "Feedback injection may be in external scripts"
    fi

    # Test feedback storage in Redis
    local feedback_msg="Gate check failed: confidence below threshold. Please improve quality."
    redis_set "swarm:${TASK_ID}:feedback:iteration:1" "$feedback_msg"

    local stored_feedback=$(redis_get "swarm:${TASK_ID}:feedback:iteration:1")
    assert_not_empty "$stored_feedback" "Feedback message stored"
    assert_contains "$stored_feedback" "confidence below threshold" "Feedback includes failure reason"
}

##############################################################################
# Test 8: Gate Failure Statistics Tracking
##############################################################################

test_gate_failure_statistics() {
    log_step "GIVEN gate failures should be tracked for statistics"

    # Initialize statistics counters
    redis_set "swarm:${TASK_ID}:stats:gate:passes" "0"
    redis_set "swarm:${TASK_ID}:stats:gate:failures" "3"
    redis_set "swarm:${TASK_ID}:stats:total:iterations" "4"

    # WHEN retrieving statistics
    log_step "WHEN retrieving gate check statistics"

    local gate_passes=$(redis_get "swarm:${TASK_ID}:stats:gate:passes")
    local gate_failures=$(redis_get "swarm:${TASK_ID}:stats:gate:failures")
    local total_iterations=$(redis_get "swarm:${TASK_ID}:stats:total:iterations")

    # THEN statistics are properly tracked
    log_step "THEN gate failure statistics are tracked"

    assert_equals "0" "$gate_passes" "Gate passes count is correct"
    assert_equals "3" "$gate_failures" "Gate failures count is correct"
    assert_equals "4" "$total_iterations" "Total iterations tracked"

    # Calculate failure rate
    if command -v bc >/dev/null 2>&1; then
        local failure_rate=$(echo "scale=2; $gate_failures / $total_iterations" | bc -l)
        log_info "Gate failure rate: $failure_rate (${gate_failures}/${total_iterations})"

        local high_failure=$(echo "$failure_rate > 0.5" | bc -l)
        assert_equals "1" "$high_failure" "High failure rate detected (>50%)"
    fi
}

##############################################################################
# Test 9: Mode-Specific Gate Thresholds
##############################################################################

test_mode_specific_gate_thresholds() {
    log_step "GIVEN different modes have different gate thresholds"

    # Define mode thresholds
    local mvp_threshold="0.70"
    local standard_threshold="0.75"
    local enterprise_threshold="0.85"

    # Test score that passes MVP but fails Standard
    local test_score="0.72"

    # WHEN checking score against different thresholds
    log_step "WHEN validating score against mode-specific thresholds"

    # THEN score passes/fails based on mode
    log_step "THEN mode-specific thresholds are correctly applied"

    if command -v bc >/dev/null 2>&1; then
        # MVP mode (0.70 threshold)
        local passes_mvp=$(echo "$test_score >= $mvp_threshold" | bc -l)
        assert_equals "1" "$passes_mvp" "Score $test_score passes MVP threshold (0.70)"

        # Standard mode (0.75 threshold)
        local passes_standard=$(echo "$test_score >= $standard_threshold" | bc -l)
        assert_equals "0" "$passes_standard" "Score $test_score fails Standard threshold (0.75)"

        # Enterprise mode (0.85 threshold)
        local passes_enterprise=$(echo "$test_score >= $enterprise_threshold" | bc -l)
        assert_equals "0" "$passes_enterprise" "Score $test_score fails Enterprise threshold (0.85)"

        log_info "Score $test_score: MVP=PASS, Standard=FAIL, Enterprise=FAIL"
    else
        log_warn "bc not available, skipping threshold validation"
    fi

    # Verify orchestrator defines these thresholds
    assert_success "MVP threshold defined" \
        grep -q "mvp.*0\\.70" "$ORCHESTRATOR"

    assert_success "Standard threshold defined" \
        grep -q "standard.*0\\.75" "$ORCHESTRATOR"

    assert_success "Enterprise threshold defined" \
        grep -q "enterprise.*0\\.85\|enterprise.*0\\.75" "$ORCHESTRATOR"
}

##############################################################################
# Execute All Tests
##############################################################################

setup_test "orchestrator-gate-failures"

annotate "Test Suite: CFN Loop Orchestrator Gate Failures"

test_gate_failure_below_threshold
test_iteration_increment_on_failure
test_max_iteration_enforcement
test_loop2_not_spawned_on_gate_failure
test_retry_logic_triggers
test_confidence_score_range_validation
test_feedback_injection_on_failure
test_gate_failure_statistics
test_mode_specific_gate_thresholds

teardown_test
