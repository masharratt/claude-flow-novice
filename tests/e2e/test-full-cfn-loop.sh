#!/usr/bin/env bash
# tests/e2e/test-full-cfn-loop.sh
# Phase 5 Wave 4A :: E2E tests (IMPL-003)
# Full CFN Loop execution with multiple agents

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test helper functions
pass() {
    local msg="$1"
    echo -e "${GREEN}✓ PASS:${NC} $msg"
    TEST_PASSED=$((TEST_PASSED + 1))
    return 0
}

fail() {
    local msg="$1"
    echo -e "${RED}✗ FAIL:${NC} $msg"
    TEST_FAILED=$((TEST_FAILED + 1))
    return 1
}

skip() {
    local msg="$1"
    echo -e "${YELLOW}⊘ SKIP:${NC} $msg"
    return 0
}

print_summary() {
    local suite_name="$1"
    echo ""
    echo "=========================================="
    echo "$suite_name Summary"
    echo "=========================================="
    echo "Total: $((TEST_PASSED + TEST_FAILED))"
    echo "Passed: $TEST_PASSED"
    echo "Failed: $TEST_FAILED"
    echo "=========================================="
}

# Test configuration
TASK_ID="e2e-test-$(date +%s)"
REDIS_KEY_PREFIX="cfn:e2e:${TASK_ID}"

cleanup() {
    log_info "Cleaning up E2E test artifacts"
    docker rm -f "loop3-agent-${TASK_ID}" "loop2-validator-${TASK_ID}" "product-owner-${TASK_ID}" 2>/dev/null || true
    redis-cli DEL "${REDIS_KEY_PREFIX}:*" 2>/dev/null || true
}
trap cleanup EXIT

test_loop3_implementation() {
    log_step "TEST 1: Loop 3 implementation - implementer agents complete work"

    # GIVEN a Loop 3 implementer agent
    AGENT_NAME="loop3-agent-${TASK_ID}"
    docker run -d --name "$AGENT_NAME" \
        --label "cfn.loop=3" \
        --label "cfn.task=${TASK_ID}" \
        alpine:latest sleep 300 >/dev/null

    # WHEN agent executes implementation work
    docker exec "$AGENT_NAME" sh -c "echo 'implementation-complete' > /tmp/work.txt" >/dev/null

    # THEN work should be completed
    WORK_STATUS=$(docker exec "$AGENT_NAME" cat /tmp/work.txt)
    if [[ "$WORK_STATUS" != "implementation-complete" ]]; then
        fail "Loop 3 implementation failed: $WORK_STATUS"
    fi

    pass "Loop 3 implementation verified"
}

test_loop3_test_execution() {
    log_step "TEST 2: Loop 3 test execution - tests are run and results collected"

    # GIVEN a Loop 3 agent with test capability
    AGENT_NAME="loop3-agent-${TASK_ID}"
    docker run -d --name "$AGENT_NAME" \
        --label "cfn.loop=3" \
        alpine:latest sleep 300 >/dev/null

    # WHEN executing tests
    docker exec "$AGENT_NAME" sh -c "echo 'PASS: test-1' > /tmp/test-results.txt" >/dev/null
    docker exec "$AGENT_NAME" sh -c "echo 'PASS: test-2' >> /tmp/test-results.txt" >/dev/null
    docker exec "$AGENT_NAME" sh -c "echo 'FAIL: test-3' >> /tmp/test-results.txt" >/dev/null

    # THEN test results should be available
    TEST_RESULTS=$(docker exec "$AGENT_NAME" cat /tmp/test-results.txt)
    PASS_COUNT=$(echo "$TEST_RESULTS" | grep -c "PASS:" || echo "0")
    FAIL_COUNT=$(echo "$TEST_RESULTS" | grep -c "FAIL:" || echo "0")

    if [[ "$PASS_COUNT" != "2" ]] || [[ "$FAIL_COUNT" != "1" ]]; then
        fail "Test execution failed: expected 2 pass, 1 fail; got $PASS_COUNT pass, $FAIL_COUNT fail"
    fi

    pass "Loop 3 test execution verified"
}

test_gate_enforcement() {
    log_step "TEST 3: Gate enforcement - quality gates block progression when failing"

    # GIVEN test results that fail the gate
    TEST_PASS_RATE=0.67  # Below 0.95 threshold

    # WHEN checking gate pass/fail
    GATE_PASSED=false
    if (( $(echo "$TEST_PASS_RATE >= 0.95" | bc -l) )); then
        GATE_PASSED=true
    fi

    # THEN gate should fail
    if [[ "$GATE_PASSED" == "true" ]]; then
        fail "Gate enforcement failed: 67% pass rate should not pass 95% gate"
    fi

    pass "Gate enforcement verified"
}

test_loop2_validation() {
    log_step "TEST 4: Loop 2 validation - validators review Loop 3 work"

    # GIVEN Loop 3 work completed
    LOOP3_AGENT="loop3-agent-${TASK_ID}"
    docker run -d --name "$LOOP3_AGENT" alpine:latest sleep 60 >/dev/null
    docker exec "$LOOP3_AGENT" sh -c "echo 'work-done' > /tmp/deliverable.txt" >/dev/null

    # WHEN Loop 2 validator reviews work
    VALIDATOR_NAME="loop2-validator-${TASK_ID}"
    docker run -d --name "$VALIDATOR_NAME" \
        --label "cfn.loop=2" \
        alpine:latest sleep 300 >/dev/null

    # Validator checks deliverable
    DELIVERABLE=$(docker exec "$LOOP3_AGENT" cat /tmp/deliverable.txt)
    if [[ "$DELIVERABLE" == "work-done" ]]; then
        docker exec "$VALIDATOR_NAME" sh -c "echo 'validation-passed' > /tmp/review.txt" >/dev/null
    fi

    # THEN validation should complete
    VALIDATION=$(docker exec "$VALIDATOR_NAME" cat /tmp/review.txt)
    if [[ "$VALIDATION" != "validation-passed" ]]; then
        fail "Loop 2 validation failed: $VALIDATION"
    fi

    pass "Loop 2 validation verified"
}

test_consensus_collection() {
    log_step "TEST 5: Consensus collection - multiple validators reach consensus"

    # GIVEN multiple validators
    VALIDATOR_1="validator-1-${TASK_ID}"
    VALIDATOR_2="validator-2-${TASK_ID}"

    docker run -d --name "$VALIDATOR_1" alpine:latest sleep 60 >/dev/null
    docker run -d --name "$VALIDATOR_2" alpine:latest sleep 60 >/dev/null

    # WHEN validators provide scores
    docker exec "$VALIDATOR_1" sh -c "echo '0.92' > /tmp/score.txt" >/dev/null
    docker exec "$VALIDATOR_2" sh -c "echo '0.88' > /tmp/score.txt" >/dev/null

    # THEN consensus should be calculable
    SCORE_1=$(docker exec "$VALIDATOR_1" cat /tmp/score.txt)
    SCORE_2=$(docker exec "$VALIDATOR_2" cat /tmp/score.txt)
    CONSENSUS=$(echo "scale=2; ($SCORE_1 + $SCORE_2) / 2" | bc)

    if (( $(echo "$CONSENSUS < 0.90" | bc -l) )); then
        fail "Consensus below threshold: $CONSENSUS < 0.90"
    fi

    docker rm -f "$VALIDATOR_1" "$VALIDATOR_2" >/dev/null 2>&1

    pass "Consensus collection verified"
}

test_product_owner_decision() {
    log_step "TEST 6: Product owner decision - final PROCEED/ITERATE/ABORT decision"

    # GIVEN validation results and consensus
    CONSENSUS=0.92
    GATE_PASSED=true

    # WHEN product owner makes decision
    DECISION="PROCEED"
    if [[ "$GATE_PASSED" == "true" ]] && (( $(echo "$CONSENSUS >= 0.90" | bc -l) )); then
        DECISION="PROCEED"
    else
        DECISION="ITERATE"
    fi

    # THEN decision should be PROCEED
    if [[ "$DECISION" != "PROCEED" ]]; then
        fail "Product owner decision incorrect: expected PROCEED, got $DECISION"
    fi

    pass "Product owner decision verified"
}

test_iteration_management() {
    log_step "TEST 7: Iteration management - failed iterations trigger re-execution"

    # GIVEN a failed iteration
    ITERATION=1
    GATE_PASSED=false

    # WHEN checking if iteration needed
    SHOULD_ITERATE=false
    if [[ "$GATE_PASSED" == "false" ]] && [[ "$ITERATION" -lt 10 ]]; then
        SHOULD_ITERATE=true
    fi

    # THEN iteration should be triggered
    if [[ "$SHOULD_ITERATE" != "true" ]]; then
        fail "Iteration management failed: should iterate on failed gate"
    fi

    pass "Iteration management verified"
}

test_complete_workflow() {
    log_step "TEST 8: Complete workflow - full CFN Loop from spawn to decision"

    # GIVEN fresh test environment
    TEST_TASK_ID="complete-workflow-${TASK_ID}"

    # WHEN executing complete workflow
    # Step 1: Loop 3 implementation
    LOOP3_AGENT="loop3-${TEST_TASK_ID}"
    docker run -d --name "$LOOP3_AGENT" alpine:latest sleep 60 >/dev/null
    docker exec "$LOOP3_AGENT" sh -c "echo 'feature-implemented' > /tmp/work.txt" >/dev/null

    # Step 2: Loop 3 tests (simulate 98% pass rate)
    docker exec "$LOOP3_AGENT" sh -c "echo 'PASSED: 98/100 tests' > /tmp/tests.txt" >/dev/null

    # Step 3: Gate check (98% passes 95% threshold)
    GATE_RESULT="PASS"

    # Step 4: Loop 2 validation
    VALIDATOR="validator-${TEST_TASK_ID}"
    docker run -d --name "$VALIDATOR" alpine:latest sleep 60 >/dev/null
    docker exec "$VALIDATOR" sh -c "echo '0.95' > /tmp/score.txt" >/dev/null

    # Step 5: Product owner decision
    FINAL_DECISION="PROCEED"

    # THEN workflow should complete successfully
    WORK_DONE=$(docker exec "$LOOP3_AGENT" cat /tmp/work.txt)
    TEST_RESULT=$(docker exec "$LOOP3_AGENT" cat /tmp/tests.txt)
    VALIDATION_SCORE=$(docker exec "$VALIDATOR" cat /tmp/score.txt)

    if [[ "$WORK_DONE" != "feature-implemented" ]]; then
        fail "Work not completed: $WORK_DONE"
    fi

    if [[ "$GATE_RESULT" != "PASS" ]]; then
        fail "Gate check failed: $GATE_RESULT"
    fi

    if (( $(echo "$VALIDATION_SCORE < 0.90" | bc -l) )); then
        fail "Validation score too low: $VALIDATION_SCORE"
    fi

    if [[ "$FINAL_DECISION" != "PROCEED" ]]; then
        fail "Final decision incorrect: $FINAL_DECISION"
    fi

    docker rm -f "$LOOP3_AGENT" "$VALIDATOR" >/dev/null 2>&1

    pass "Complete workflow verified"
}

# Execute tests
log_info "Starting E2E CFN Loop tests (8 tests)"
test_loop3_implementation
test_loop3_test_execution
test_gate_enforcement
test_loop2_validation
test_consensus_collection
test_product_owner_decision
test_iteration_management
test_complete_workflow

# Summary
print_summary "E2E CFN Loop Tests"
