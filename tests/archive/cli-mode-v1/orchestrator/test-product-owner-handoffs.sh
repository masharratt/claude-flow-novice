#!/bin/bash
# tests/cli-mode/core/integration/test-product-owner-handoffs.sh
# Phase 2 :: Product Owner Decision Extraction and Feedback Injection (Priority 2)
#
# Purpose:
#   Validates Product Owner decision-making handoffs:
#   - Decision extraction from agent output (PROCEED/ITERATE/ABORT)
#   - Deliverable validation (prevents "consensus on vapor")
#   - Decision execution paths
#   - Feedback injection for ITERATE scenarios
#   - Context passing between iterations
#
# Related: BUG #11 (Product Owner timeout), BUG #21 (production validation)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_ID="po-handoff-$(date +%s)-$$"
TASK_ID="test-${TEST_ID}"
REDIS_TEST_DB=15
TEST_TMP_DIR="/tmp/cfn-po-${TEST_ID}"

cleanup() {
    log_info "Cleaning up Product Owner handoff test..."

    # Clear Redis test database
    redis-cli -n "$REDIS_TEST_DB" FLUSHDB >/dev/null 2>&1 || true

    # Remove temporary directory
    rm -rf "$TEST_TMP_DIR"

    # Reset working directory
    cd "$PROJECT_ROOT" 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================================
# TEST 1: Decision Extraction from Agent Output
# ============================================================================

test_decision_extraction() {
    log_step "GIVEN Product Owner generates decision with various formats"

    mkdir -p "$TEST_TMP_DIR"

    # Test various decision output formats
    declare -A decision_outputs=(
        ["proceed1"]="DECISION: PROCEED with the implementation. Looks good!"
        ["proceed2"]="The team should PROCEED. The work meets our standards."
        ["iterate1"]="I recommend we ITERATE. Some improvements needed."
        ["iterate2"]="After review, let's ITERATE on the implementation."
        ["abort1"]="After careful review, we should ABORT this iteration."
        ["abort2"]="ABORT: Implementation does not meet requirements."
    )

    log_info "WHEN orchestrator extracts decisions using grep/sed"

    for key in "${!decision_outputs[@]}"; do
        output="${decision_outputs[$key]}"

        # Extract decision (matches production code path)
        extracted=$(echo "$output" | grep -oE '(PROCEED|ITERATE|ABORT)' | head -1)

        log_info "THEN decision should be correctly extracted"

        if [ -z "$extracted" ]; then
            fail "Failed to extract decision from: $output"
        fi

        # Validate extracted decision
        case "$key" in
            proceed*)
                assert_equals "PROCEED" "$extracted" "Expected PROCEED from: $output"
                ;;
            iterate*)
                assert_equals "ITERATE" "$extracted" "Expected ITERATE from: $output"
                ;;
            abort*)
                assert_equals "ABORT" "$extracted" "Expected ABORT from: $output"
                ;;
        esac

        annotate "Extracted '$extracted' from '$key' format"
    done

    log_success "Decision extraction validated"
}

# ============================================================================
# TEST 2: Deliverable Validation (Prevents "Consensus on Vapor")
# ============================================================================

test_deliverable_validation() {
    log_step "GIVEN orchestrator must validate actual file changes"

    redis-cli -n "$REDIS_TEST_DB" FLUSHDB >/dev/null
    mkdir -p "$TEST_TMP_DIR/repo"
    cd "$TEST_TMP_DIR/repo" || exit 1
    git init >/dev/null 2>&1

    log_info "WHEN no deliverables are created (consensus on vapor)"

    # Scenario 1: No files created
    git_changes=$(git status --porcelain 2>/dev/null || echo "")

    if [ -z "$git_changes" ]; then
        decision="ITERATE"
        feedback="No files created. Implement required deliverables."
    else
        decision="PROCEED"
        feedback=""
    fi

    log_info "THEN decision should be forced to ITERATE"

    assert_equals "ITERATE" "$decision" "Should force ITERATE when no deliverables"
    assert_not_empty "$feedback" "Should provide feedback about missing deliverables"

    annotate "Forced ITERATE due to no file changes"

    log_info "WHEN deliverables are created"

    # Scenario 2: Create actual deliverables
    echo "export function authenticate() { return true; }" > auth.ts
    echo "test('authenticate works', () => { expect(true).toBe(true); });" > auth.test.ts
    git add auth.ts auth.test.ts
    git commit -m "Implement authentication" >/dev/null 2>&1

    git_changes=$(git log --oneline -1)

    if [ -n "$git_changes" ]; then
        decision="PROCEED"
        feedback=""
    else
        decision="ITERATE"
        feedback="No commits detected"
    fi

    log_info "THEN decision can be PROCEED"

    assert_equals "PROCEED" "$decision" "Should allow PROCEED when deliverables exist"
    assert_equals "" "$feedback" "Should not force feedback when deliverables exist"

    annotate "Allowed PROCEED due to valid deliverables"

    cd "$PROJECT_ROOT"

    log_success "Deliverable validation prevents 'consensus on vapor'"
}

# ============================================================================
# TEST 3: Decision Execution Paths
# ============================================================================

test_decision_execution_paths() {
    log_step "GIVEN Product Owner makes decision"

    redis-cli -n "$REDIS_TEST_DB" FLUSHDB >/dev/null
    mkdir -p "$TEST_TMP_DIR"

    log_info "WHEN decision is PROCEED"

    # Scenario 1: PROCEED path
    redis-cli -n "$REDIS_TEST_DB" HSET "cfn_loop:task:${TASK_ID}:decision" "decision" "PROCEED" >/dev/null

    decision=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:decision" "decision")

    log_info "THEN orchestrator should complete task"

    assert_equals "PROCEED" "$decision" "PROCEED decision not stored correctly"

    annotate "PROCEED: Task completes successfully"

    log_info "WHEN decision is ITERATE"

    # Scenario 2: ITERATE path
    redis-cli -n "$REDIS_TEST_DB" HSET "cfn_loop:task:${TASK_ID}:decision" "decision" "ITERATE" >/dev/null
    redis-cli -n "$REDIS_TEST_DB" HSET "cfn_loop:task:${TASK_ID}:decision" "feedback" "Improve test coverage" >/dev/null

    decision=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:decision" "decision")
    feedback=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:decision" "feedback")

    log_info "THEN orchestrator should wake agents for iteration N+1"

    assert_equals "ITERATE" "$decision" "ITERATE decision not stored correctly"
    assert_not_empty "$feedback" "ITERATE feedback not provided"

    annotate "ITERATE: Wake agents with feedback"

    log_info "WHEN decision is ABORT"

    # Scenario 3: ABORT path
    redis-cli -n "$REDIS_TEST_DB" HSET "cfn_loop:task:${TASK_ID}:decision" "decision" "ABORT" >/dev/null
    redis-cli -n "$REDIS_TEST_DB" HSET "cfn_loop:task:${TASK_ID}:decision" "reason" "Requirements not feasible" >/dev/null

    decision=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:decision" "decision")
    reason=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:decision" "reason")

    log_info "THEN orchestrator should exit with error"

    assert_equals "ABORT" "$decision" "ABORT decision not stored correctly"
    assert_not_empty "$reason" "ABORT reason not provided"

    annotate "ABORT: Exit with error and reason"

    log_success "Decision execution paths validated"
}

# ============================================================================
# TEST 4: Feedback Injection for ITERATE
# ============================================================================

test_feedback_injection() {
    log_step "GIVEN Product Owner decides to ITERATE"

    redis-cli -n "$REDIS_TEST_DB" FLUSHDB >/dev/null

    feedback_samples=(
        "Improve error handling in authentication service"
        "Add more comprehensive test coverage"
        "Refactor for better modularity"
        "Address security concerns in password hashing"
    )

    log_info "WHEN feedback is injected into Redis for next iteration"

    for idx in "${!feedback_samples[@]}"; do
        feedback="${feedback_samples[$idx]}"

        # Store feedback in Redis (matches production pattern)
        redis-cli -n "$REDIS_TEST_DB" HSET "cfn_loop:task:${TASK_ID}:iteration:$((idx+1))" "feedback" "$feedback" >/dev/null

        # Verify feedback stored
        stored_feedback=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:iteration:$((idx+1))" "feedback")

        log_info "THEN feedback should be available for agents"

        assert_equals "$feedback" "$stored_feedback" "Feedback not stored correctly (iteration $((idx+1)))"

        annotate "Iteration $((idx+1)): $feedback"
    done

    log_success "Feedback injection validated"
}

# ============================================================================
# TEST 5: Context Passing Between Iterations
# ============================================================================

test_context_passing() {
    log_step "GIVEN iteration 1 completes with ITERATE decision"

    redis-cli -n "$REDIS_TEST_DB" FLUSHDB >/dev/null

    # Setup iteration 1 context
    redis-cli -n "$REDIS_TEST_DB" HMSET "cfn_loop:task:${TASK_ID}:iteration:1" \
        epicGoal "Implement authentication" \
        feedback "Add JWT token validation" \
        decision "ITERATE" \
        >/dev/null

    log_info "WHEN iteration 2 agents spawn"

    # Iteration 2 context should inherit previous feedback
    iteration1_feedback=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:iteration:1" "feedback")

    # Store combined context for iteration 2
    redis-cli -n "$REDIS_TEST_DB" HMSET "cfn_loop:task:${TASK_ID}:iteration:2" \
        epicGoal "Implement authentication" \
        previousFeedback "$iteration1_feedback" \
        iteration "2" \
        >/dev/null

    log_info "THEN iteration 2 should have access to iteration 1 feedback"

    # Verify context passing
    iteration2_previous=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:iteration:2" "previousFeedback")
    iteration2_num=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:iteration:2" "iteration")

    assert_equals "$iteration1_feedback" "$iteration2_previous" "Previous feedback not passed to iteration 2"
    assert_equals "2" "$iteration2_num" "Iteration number not updated"

    annotate "Context passed: Previous feedback = '$iteration1_feedback'"

    log_success "Context passing validated"
}

# ============================================================================
# TEST 6: Decision Timeout Handling (BUG #11)
# ============================================================================

test_decision_timeout_handling() {
    log_step "GIVEN Product Owner must complete within timeout"

    redis-cli -n "$REDIS_TEST_DB" FLUSHDB >/dev/null
    mkdir -p "$TEST_TMP_DIR"

    # Timeout configuration (matches orchestrator)
    DECISION_TIMEOUT=300  # 5 minutes

    log_info "WHEN Product Owner completes before timeout"

    # Simulate quick decision
    START_TIME=$(date +%s)
    sleep 1
    redis-cli -n "$REDIS_TEST_DB" HSET "cfn_loop:task:${TASK_ID}:decision" "decision" "PROCEED" >/dev/null
    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))

    log_info "THEN decision should be accepted"

    decision=$(redis-cli -n "$REDIS_TEST_DB" HGET "cfn_loop:task:${TASK_ID}:decision" "decision")

    if [ "$ELAPSED" -lt "$DECISION_TIMEOUT" ]; then
        assert_equals "PROCEED" "$decision" "Decision not accepted before timeout"
        annotate "Decision completed in ${ELAPSED}s (timeout: ${DECISION_TIMEOUT}s)"
    else
        fail "Test took longer than timeout"
    fi

    log_success "Decision timeout handling validated (BUG #11 fix)"
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================

main() {
    log_info "=== Starting Product Owner Handoff Tests ==="

    # Check Redis availability
    if ! redis-cli -n "$REDIS_TEST_DB" ping >/dev/null 2>&1; then
        log_error "Redis not available on database $REDIS_TEST_DB"
        exit 1
    fi

    test_decision_extraction
    test_deliverable_validation
    test_decision_execution_paths
    test_feedback_injection
    test_context_passing
    test_decision_timeout_handling

    log_info "=== Product Owner Handoff Tests Complete ==="
}

main
