#!/bin/bash
set -uo

# Security fix validation test suite
# Tests all 5 security vulnerabilities identified by security-specialist
# Note: -e and pipefail flags removed to allow testing of expected failures

TEST_COUNT=0
PASS_COUNT=0

echo "=============================================="
echo "Security Fix Validation Test Suite"
echo "=============================================="
echo ""

##############################################################################
# Test 1: Redis Key Injection - store-success-criteria.sh
##############################################################################
test_task_id_validation_store() {
    echo "Test 1: TASK_ID validation in store-success-criteria.sh"

    # Test 1a: Reject TASK_ID with spaces
    TEST_COUNT=$((TEST_COUNT + 1))
    if /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/store-success-criteria.sh --task-id "test space" --criteria '{"test_suites":[]}' 2>&1 | grep -q "Invalid TASK_ID format"; then
        echo "  ✅ 1a: Rejects TASK_ID with spaces"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 1a: FAIL - Should reject TASK_ID with spaces"
    fi

    # Test 1b: Reject TASK_ID with injection characters (semicolon)
    TEST_COUNT=$((TEST_COUNT + 1))
    if /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/store-success-criteria.sh --task-id "test;rm -rf /" --criteria '{"test_suites":[]}' 2>&1 | grep -q "Invalid TASK_ID format"; then
        echo "  ✅ 1b: Rejects TASK_ID with shell injection chars"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 1b: FAIL - Should reject shell injection characters"
    fi

    # Test 1c: Reject TASK_ID with special characters (dollar sign)
    TEST_COUNT=$((TEST_COUNT + 1))
    if /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/store-success-criteria.sh --task-id 'test$MALICIOUS' --criteria '{"test_suites":[]}' 2>&1 | grep -q "Invalid TASK_ID format"; then
        echo "  ✅ 1c: Rejects TASK_ID with variable expansion chars"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 1c: FAIL - Should reject variable expansion characters"
    fi

    # Test 1d: Accept valid TASK_ID
    TEST_COUNT=$((TEST_COUNT + 1))
    if /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/store-success-criteria.sh --task-id "valid-task_123" --criteria '{"test_suites":[]}' >/dev/null 2>&1; then
        echo "  ✅ 1d: Accepts valid TASK_ID format"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 1d: FAIL - Should accept valid alphanumeric-dash-underscore"
    fi

    echo ""
}

##############################################################################
# Test 2: Redis Key Injection - get-success-criteria.sh
##############################################################################
test_task_id_validation_get() {
    echo "Test 2: TASK_ID validation in get-success-criteria.sh"

    # Test 2a: Reject TASK_ID with spaces
    TEST_COUNT=$((TEST_COUNT + 1))
    if /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/get-success-criteria.sh --task-id "test space" 2>&1 | grep -q "Invalid TASK_ID format"; then
        echo "  ✅ 2a: Rejects TASK_ID with spaces"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 2a: FAIL - Should reject TASK_ID with spaces"
    fi

    # Test 2b: Reject TASK_ID with injection characters
    TEST_COUNT=$((TEST_COUNT + 1))
    if /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/get-success-criteria.sh --task-id "test;echo hacked" 2>&1 | grep -q "Invalid TASK_ID format"; then
        echo "  ✅ 2b: Rejects TASK_ID with injection chars"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 2b: FAIL - Should reject injection characters"
    fi

    # Test 2c: Accept valid TASK_ID
    TEST_COUNT=$((TEST_COUNT + 1))
    # Store a valid entry first
    /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/store-success-criteria.sh --task-id "valid-get-test" --criteria '{"test_suites":[]}' >/dev/null 2>&1

    if /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/get-success-criteria.sh --task-id "valid-get-test" >/dev/null 2>&1; then
        echo "  ✅ 2c: Accepts valid TASK_ID format"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 2c: FAIL - Should accept valid alphanumeric-dash-underscore"
    fi

    echo ""
}

##############################################################################
# Test 3: Shell Injection via JSON - orchestrate.sh Docker env
##############################################################################
test_base64_encoding() {
    echo "Test 3: Base64 encoding for Docker environment variables"

    # Test 3a: Verify base64 encoding implemented in orchestrate.sh
    TEST_COUNT=$((TEST_COUNT + 1))
    if grep -q "base64" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh && \
       grep -q "AGENT_SUCCESS_CRITERIA_B64" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh; then
        echo "  ✅ 3a: Base64 encoding implementation found"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 3a: FAIL - Base64 encoding not implemented"
    fi

    # Test 3b: Verify old AGENT_SUCCESS_CRITERIA removed from Docker command
    TEST_COUNT=$((TEST_COUNT + 1))
    # Check that AGENT_SUCCESS_CRITERIA is NOT passed directly to Docker
    # (should be base64 encoded instead)
    if ! grep -E "DOCKER_CMD.*--env AGENT_SUCCESS_CRITERIA='.*'" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh | grep -v "B64"; then
        echo "  ✅ 3b: Direct AGENT_SUCCESS_CRITERIA env var removed"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 3b: FAIL - Direct env var still present (injection risk)"
    fi

    echo ""
}

##############################################################################
# Test 4: JSON DoS - orchestrate.sh size limit
##############################################################################
test_json_size_limit() {
    echo "Test 4: JSON size limit enforcement (10MB max)"

    # Test 4a: Verify 10MB limit constant exists
    TEST_COUNT=$((TEST_COUNT + 1))
    if grep -q "10485760" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh; then
        echo "  ✅ 4a: 10MB size limit constant defined"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 4a: FAIL - Size limit not defined"
    fi

    # Test 4b: Verify size check before jq parsing
    TEST_COUNT=$((TEST_COUNT + 1))
    if grep -q "CRITERIA_SIZE.*wc -c" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh && \
       grep -q "CRITERIA_SIZE.*-gt.*MAX_SIZE" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh; then
        echo "  ✅ 4b: Size validation before JSON parsing"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 4b: FAIL - No size check before parsing"
    fi

    # Test 4c: Verify error exit on size exceeded
    TEST_COUNT=$((TEST_COUNT + 1))
    if grep -q "exceeds maximum size.*10MB" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh; then
        echo "  ✅ 4c: Exit on size limit exceeded"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 4c: FAIL - No fatal exit on oversized JSON"
    fi

    echo ""
}

##############################################################################
# Test 5: TTL Failure Handling - store-success-criteria.sh
##############################################################################
test_ttl_failure_fatal() {
    echo "Test 5: TTL failure is fatal error"

    # Test 5a: Verify EXPIRE command has error handler
    TEST_COUNT=$((TEST_COUNT + 1))
    if grep -A 3 "redis-cli EXPIRE.*REDIS_KEY" /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/store-success-criteria.sh | \
       grep -q "exit 1"; then
        echo "  ✅ 5a: EXPIRE failure triggers exit 1"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 5a: FAIL - EXPIRE failure not fatal"
    fi

    # Test 5b: Verify error message on TTL failure
    TEST_COUNT=$((TEST_COUNT + 1))
    if grep -A 3 "redis-cli EXPIRE.*REDIS_KEY" /home/user/claude-flow-novice/.claude/skills/cfn-redis-coordination/store-success-criteria.sh | \
       grep -q "Failed to set TTL"; then
        echo "  ✅ 5b: TTL failure has error message"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 5b: FAIL - No TTL failure error message"
    fi

    echo ""
}

##############################################################################
# Test 6: Race Condition - orchestrate.sh Lua atomic operations
##############################################################################
test_lua_atomic_operations() {
    echo "Test 6: Atomic Redis operations via Lua script"

    # Test 6a: Verify Lua script usage for SADD+SMEMBERS
    TEST_COUNT=$((TEST_COUNT + 1))
    if grep -q "\-\-eval" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh && \
       grep -q "SADD.*KEYS" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh; then
        echo "  ✅ 6a: Lua script for atomic operations"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 6a: FAIL - No Lua script for atomic operations"
    fi

    # Test 6b: Verify SADD is in Lua context (not standalone)
    TEST_COUNT=$((TEST_COUNT + 1))
    # Check that SADD calls are part of Lua scripts (within heredoc)
    if grep -A 2 "redis-cli.*--eval" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh | grep -q "SADD.*KEYS"; then
        echo "  ✅ 6b: SADD operations use atomic Lua scripts"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ 6b: FAIL - SADD not in atomic Lua context"
    fi

    echo ""
}

##############################################################################
# Run All Tests
##############################################################################
test_task_id_validation_store
test_task_id_validation_get
test_base64_encoding
test_json_size_limit
test_ttl_failure_fatal
test_lua_atomic_operations

##############################################################################
# Summary Report
##############################################################################
PASS_RATE=$(echo "scale=4; $PASS_COUNT / $TEST_COUNT" | bc)
PASS_PERCENTAGE=$(echo "scale=2; $PASS_RATE * 100" | bc)

echo "=============================================="
echo "Security Fixes Test Summary"
echo "=============================================="
echo "Total Tests: $TEST_COUNT"
echo "Passed: $PASS_COUNT"
echo "Failed: $((TEST_COUNT - PASS_COUNT))"
echo "Pass Rate: ${PASS_PERCENTAGE}%"
echo "=============================================="
echo ""

# Exit with success only if all tests pass (100% required)
if (( $(echo "$PASS_RATE >= 1.0" | bc -l) )); then
    echo "✅ All security fixes validated (100% pass rate)"
    echo "   Gate threshold: PASS"
    exit 0
else
    echo "❌ Security fixes incomplete (<100% pass rate)"
    echo "   Gate threshold: FAIL"
    echo ""
    echo "Failed Tests:"
    echo "  - Review implementation above for specific failures"
    exit 1
fi
