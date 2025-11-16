#!/bin/bash
set -eu

# Test suite for spawn-agent.sh success criteria passing

TEST_COUNT=0
PASS_COUNT=0
FAILED_TESTS=()

test_redis_storage() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local TASK_ID="test-criteria-$(date +%s)-$$"
    local CRITERIA='{"test_suites":[{"name":"Unit Tests","command":"npm test","required":true,"pass_threshold":0.95}],"gate_mode":"test-driven"}'

    echo "Running test_redis_storage..."

    # Store criteria
    if ! ./.claude/skills/cfn-redis-coordination/store-success-criteria.sh \
        --task-id "$TASK_ID" \
        --criteria "$CRITERIA" >/dev/null 2>&1; then
        echo "  FAIL: Could not store criteria"
        FAILED_TESTS+=("test_redis_storage: store failed")
        redis-cli DEL "swarm:${TASK_ID}:config:success_criteria" >/dev/null 2>&1 || true
        return 1
    fi

    # Retrieve criteria
    local RETRIEVED=$(redis-cli GET "swarm:${TASK_ID}:config:success_criteria" 2>/dev/null || echo "")

    if [[ "$RETRIEVED" == "$CRITERIA" ]]; then
        echo "  PASS: test_redis_storage"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: test_redis_storage (retrieved doesn't match stored)"
        echo "    Expected: $CRITERIA"
        echo "    Got: $RETRIEVED"
        FAILED_TESTS+=("test_redis_storage: data mismatch")
    fi

    # Cleanup
    redis-cli DEL "swarm:${TASK_ID}:config:success_criteria" >/dev/null 2>&1 || true
}

test_json_validation() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local TASK_ID="test-invalid-$(date +%s)-$$"
    local INVALID_JSON='{"test_suites": [invalid json}'

    echo "Running test_json_validation..."

    # Should fail with invalid JSON
    if ./.claude/skills/cfn-redis-coordination/store-success-criteria.sh \
        --task-id "$TASK_ID" \
        --criteria "$INVALID_JSON" 2>&1 | grep -q "Invalid JSON"; then
        echo "  PASS: test_json_validation"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: test_json_validation (did not reject invalid JSON)"
        FAILED_TESTS+=("test_json_validation: accepted invalid JSON")
    fi

    # Cleanup
    redis-cli DEL "swarm:${TASK_ID}:config:success_criteria" >/dev/null 2>&1 || true
}

test_schema_validation() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local TASK_ID="test-schema-$(date +%s)-$$"
    local NO_TEST_SUITES='{"deliverables":[],"gate_mode":"test-driven"}'

    echo "Running test_schema_validation..."

    # Should fail without test_suites field
    if ./.claude/skills/cfn-redis-coordination/store-success-criteria.sh \
        --task-id "$TASK_ID" \
        --criteria "$NO_TEST_SUITES" 2>&1 | grep -q "Missing required field"; then
        echo "  PASS: test_schema_validation"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: test_schema_validation (did not require test_suites field)"
        FAILED_TESTS+=("test_schema_validation: missing field validation")
    fi

    # Cleanup
    redis-cli DEL "swarm:${TASK_ID}:config:success_criteria" >/dev/null 2>&1 || true
}

test_get_criteria() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local TASK_ID="test-get-$(date +%s)-$$"
    local CRITERIA='{"test_suites":[{"name":"Tests","command":"npm test","required":true,"pass_threshold":0.90}],"gate_mode":"test-driven"}'

    echo "Running test_get_criteria..."

    # Store
    if ! ./.claude/skills/cfn-redis-coordination/store-success-criteria.sh \
        --task-id "$TASK_ID" \
        --criteria "$CRITERIA" >/dev/null 2>&1; then
        echo "  FAIL: test_get_criteria (store failed)"
        FAILED_TESTS+=("test_get_criteria: store failed")
        redis-cli DEL "swarm:${TASK_ID}:config:success_criteria" >/dev/null 2>&1 || true
        return 1
    fi

    # Retrieve using get script
    local RETRIEVED=$(./.claude/skills/cfn-redis-coordination/get-success-criteria.sh --task-id "$TASK_ID" 2>/dev/null || echo "")

    if [[ "$RETRIEVED" == "$CRITERIA" ]]; then
        echo "  PASS: test_get_criteria"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: test_get_criteria (retrieved doesn't match)"
        echo "    Expected: $CRITERIA"
        echo "    Got: $RETRIEVED"
        FAILED_TESTS+=("test_get_criteria: data mismatch")
    fi

    # Cleanup
    redis-cli DEL "swarm:${TASK_ID}:config:success_criteria" >/dev/null 2>&1 || true
}

test_expiration() {
    TEST_COUNT=$((TEST_COUNT + 1))

    local TASK_ID="test-expire-$(date +%s)-$$"
    local CRITERIA='{"test_suites":[{"name":"Tests","command":"npm test","required":true,"pass_threshold":0.95}]}'

    echo "Running test_expiration..."

    # Store criteria
    if ! ./.claude/skills/cfn-redis-coordination/store-success-criteria.sh \
        --task-id "$TASK_ID" \
        --criteria "$CRITERIA" >/dev/null 2>&1; then
        echo "  FAIL: test_expiration (store failed)"
        FAILED_TESTS+=("test_expiration: store failed")
        redis-cli DEL "swarm:${TASK_ID}:config:success_criteria" >/dev/null 2>&1 || true
        return 1
    fi

    # Check TTL is set (should be 86400 seconds = 24 hours)
    local TTL=$(redis-cli TTL "swarm:${TASK_ID}:config:success_criteria" 2>/dev/null || echo "-1")

    if [[ "$TTL" -gt 0 ]] && [[ "$TTL" -le 86400 ]]; then
        echo "  PASS: test_expiration (TTL: ${TTL}s)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: test_expiration (TTL not set correctly: $TTL)"
        FAILED_TESTS+=("test_expiration: TTL=$TTL")
    fi

    # Cleanup
    redis-cli DEL "swarm:${TASK_ID}:config:success_criteria" >/dev/null 2>&1 || true
}

# Run all tests
echo "========================================"
echo "Spawn Agent Success Criteria Test Suite"
echo "========================================"
echo ""

test_redis_storage
test_json_validation
test_schema_validation
test_get_criteria
test_expiration

# Summary
echo ""
echo "========================================"
echo "Test Results"
echo "========================================"
echo "Total Tests: $TEST_COUNT"
echo "Passed: $PASS_COUNT"
echo "Failed: $((TEST_COUNT - PASS_COUNT))"

if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
    echo ""
    echo "Failed Tests:"
    for failed in "${FAILED_TESTS[@]}"; do
        echo "  - $failed"
    done
fi

PASS_RATE=$(echo "scale=4; $PASS_COUNT / $TEST_COUNT" | bc)
echo ""
echo "Pass Rate: $(echo "$PASS_RATE * 100" | bc)%"
echo "Threshold: 90%"
echo "========================================"

if (( $(echo "$PASS_RATE >= 0.90" | bc -l) )); then
    echo ""
    echo "Test suite PASSED (≥90% pass rate)"
    exit 0
else
    echo ""
    echo "Test suite FAILED (<90% pass rate)"
    exit 1
fi
