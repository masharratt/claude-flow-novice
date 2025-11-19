#!/bin/bash
################################################################################
# Test Suite: Bug Fix Validation - Redis Checkpoint Operations
# Purpose: Validate Redis SADD/EXPIRE command syntax fix
# Coverage: Bug #2 fix in save-checkpoint.sh
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
TEST_PREFIX="cfn:test:bugfix:$$"

log_test() {
    echo -e "${BLUE}[TEST $((TESTS_RUN + 1))]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}  ✓ PASS${NC} $*"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}  ✗ FAIL${NC} $*"
    ((TESTS_FAILED++))
}

run_test() {
    ((TESTS_RUN++))
    "$@"
}

# Check Redis availability
check_redis() {
    if ! command -v redis-cli &> /dev/null; then
        echo -e "${YELLOW}⚠ redis-cli not found, skipping Redis tests${NC}"
        return 1
    fi

    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &> /dev/null; then
        echo -e "${YELLOW}⚠ Redis not available at $REDIS_HOST:$REDIS_PORT, skipping Redis tests${NC}"
        return 1
    fi

    return 0
}

# Cleanup test keys
cleanup_redis() {
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "${TEST_PREFIX}:checkpoint:task1:1" &> /dev/null || true
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "${TEST_PREFIX}:checkpoints:task1" &> /dev/null || true
}

################################################################################
# TEST 1: SADD Without EX Parameter
################################################################################
test_sadd_without_ex() {
    log_test "SADD command should not use EX parameter"

    cleanup_redis

    # Execute SADD command (should succeed)
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
        SADD "${TEST_PREFIX}:checkpoints:task1" "1" &> /dev/null; then
        log_pass "SADD executed successfully without EX"
        cleanup_redis
        return 0
    else
        log_fail "SADD command failed"
        cleanup_redis
        return 1
    fi
}

################################################################################
# TEST 2: Separate EXPIRE Command
################################################################################
test_separate_expire() {
    log_test "EXPIRE command should be called separately after SADD"

    cleanup_redis

    # Add to set
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
        SADD "${TEST_PREFIX}:checkpoints:task1" "1" &> /dev/null

    # Set expiry separately
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
        EXPIRE "${TEST_PREFIX}:checkpoints:task1" 60 &> /dev/null; then

        # Check TTL was set
        local ttl
        ttl=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            TTL "${TEST_PREFIX}:checkpoints:task1")

        if [[ "$ttl" -gt 0 ]] && [[ "$ttl" -le 60 ]]; then
            log_pass "EXPIRE set TTL correctly (${ttl}s)"
            cleanup_redis
            return 0
        else
            log_fail "TTL not set correctly: $ttl"
            cleanup_redis
            return 1
        fi
    else
        log_fail "EXPIRE command failed"
        cleanup_redis
        return 1
    fi
}

################################################################################
# TEST 3: SET Command with EX Parameter (Valid)
################################################################################
test_set_with_ex() {
    log_test "SET command should support EX parameter"

    cleanup_redis

    # SET supports EX parameter
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
        SET "${TEST_PREFIX}:checkpoint:task1:1" '{"status":"test"}' EX 60 &> /dev/null; then

        # Check TTL was set
        local ttl
        ttl=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            TTL "${TEST_PREFIX}:checkpoint:task1:1")

        if [[ "$ttl" -gt 0 ]] && [[ "$ttl" -le 60 ]]; then
            log_pass "SET with EX parameter works correctly (${ttl}s)"
            cleanup_redis
            return 0
        else
            log_fail "TTL not set correctly: $ttl"
            cleanup_redis
            return 1
        fi
    else
        log_fail "SET command with EX failed"
        cleanup_redis
        return 1
    fi
}

################################################################################
# TEST 4: Checkpoint Save Integration
################################################################################
test_checkpoint_save_integration() {
    log_test "save_checkpoint should use correct Redis command syntax"

    cleanup_redis

    local CHECKPOINT_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-wave-checkpoint/save-checkpoint.sh"

    if [[ ! -f "$CHECKPOINT_SCRIPT" ]]; then
        log_fail "save-checkpoint.sh not found"
        return 1
    fi

    # Source the script
    source "$CHECKPOINT_SCRIPT"

    # Call save_checkpoint function
    export REDIS_HOST
    export REDIS_PORT
    export CHECKPOINT_TTL=60

    if save_checkpoint "test-task-$$" "1" "container1,container2" "$(date +%s)" "2" 2>&1 | grep -q "Checkpoint saved"; then
        log_pass "save_checkpoint executed successfully"

        # Verify checkpoint was saved
        local checkpoint_key="cfn:wave:checkpoint:test-task-$$:1"
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" EXISTS "$checkpoint_key" | grep -q "^1$"; then
            log_pass "Checkpoint data stored correctly"

            # Verify TTL was set
            local ttl
            ttl=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" TTL "$checkpoint_key")

            if [[ "$ttl" -gt 0 ]] && [[ "$ttl" -le 60 ]]; then
                log_pass "Checkpoint TTL set correctly (${ttl}s)"
                redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$checkpoint_key" &> /dev/null
                redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "cfn:wave:checkpoints:test-task-$$" &> /dev/null
                return 0
            else
                log_fail "Checkpoint TTL incorrect: $ttl"
                return 1
            fi
        else
            log_fail "Checkpoint data not found in Redis"
            return 1
        fi
    else
        log_fail "save_checkpoint failed"
        return 1
    fi
}

################################################################################
# TEST 5: Checkpoint Set TTL
################################################################################
test_checkpoint_set_ttl() {
    log_test "Checkpoint set should have TTL applied"

    cleanup_redis

    local CHECKPOINT_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-wave-checkpoint/save-checkpoint.sh"
    source "$CHECKPOINT_SCRIPT"

    export REDIS_HOST
    export REDIS_PORT
    export CHECKPOINT_TTL=60

    save_checkpoint "test-task-$$" "1" "container1" "$(date +%s)" "1" &> /dev/null

    # Check set TTL
    local set_key="cfn:wave:checkpoints:test-task-$$"
    local ttl
    ttl=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" TTL "$set_key")

    if [[ "$ttl" -gt 0 ]] && [[ "$ttl" -le 60 ]]; then
        log_pass "Checkpoint set TTL correct (${ttl}s)"
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$set_key" &> /dev/null
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "cfn:wave:checkpoint:test-task-$$:1" &> /dev/null
        return 0
    else
        log_fail "Checkpoint set TTL incorrect: $ttl"
        return 1
    fi
}

################################################################################
# TEST 6: Multiple Wave Checkpoints
################################################################################
test_multiple_wave_checkpoints() {
    log_test "Multiple wave checkpoints should be tracked in set"

    cleanup_redis

    local CHECKPOINT_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-wave-checkpoint/save-checkpoint.sh"
    source "$CHECKPOINT_SCRIPT"

    export REDIS_HOST
    export REDIS_PORT
    export CHECKPOINT_TTL=60

    # Save multiple checkpoints
    save_checkpoint "test-task-$$" "1" "container1" "$(date +%s)" "1" &> /dev/null
    save_checkpoint "test-task-$$" "2" "container2" "$(date +%s)" "1" &> /dev/null
    save_checkpoint "test-task-$$" "3" "container3" "$(date +%s)" "1" &> /dev/null

    # Check set contains all wave numbers
    local set_key="cfn:wave:checkpoints:test-task-$$"
    local count
    count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SCARD "$set_key")

    if [[ "$count" -eq 3 ]]; then
        log_pass "All 3 wave checkpoints tracked in set"

        # Cleanup
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$set_key" &> /dev/null
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "cfn:wave:checkpoint:test-task-$$:1" &> /dev/null
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "cfn:wave:checkpoint:test-task-$$:2" &> /dev/null
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "cfn:wave:checkpoint:test-task-$$:3" &> /dev/null
        return 0
    else
        log_fail "Expected 3 checkpoints, found $count"
        return 1
    fi
}

################################################################################
# MAIN TEST EXECUTION
################################################################################

echo "========================================"
echo "Bug Fix Validation: Redis Checkpoint"
echo "Target: save-checkpoint.sh SADD/EXPIRE"
echo "========================================"
echo ""

if ! check_redis; then
    echo -e "${YELLOW}Skipping Redis checkpoint tests (Redis not available)${NC}"
    exit 0
fi

run_test test_sadd_without_ex
run_test test_separate_expire
run_test test_set_with_ex
run_test test_checkpoint_save_integration
run_test test_checkpoint_set_ttl
run_test test_multiple_wave_checkpoints

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Total Tests:  $TESTS_RUN"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
echo ""

cleanup_redis

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All Redis checkpoint tests passed${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
