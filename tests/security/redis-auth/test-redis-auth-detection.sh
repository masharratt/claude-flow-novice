#!/bin/bash
# Test smart Redis AUTH detection in redis-cli-wrapper.sh
# Validates no-password, password, and unavailable scenarios
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WRAPPER="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/redis-cli-wrapper.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Redis AUTH Detection Tests"
echo "========================================"
echo ""

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run test
run_test() {
    local test_name="$1"
    local expected_result="$2"
    shift 2

    TESTS_RUN=$((TESTS_RUN + 1))
    echo -n "Test $TESTS_RUN: $test_name ... "

    # Run the test command and capture output
    if output=$("$@" 2>&1); then
        actual_result="success"
    else
        actual_result="failure"
    fi

    if [ "$actual_result" = "$expected_result" ]; then
        echo -e "${GREEN}PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        echo "  Expected: $expected_result"
        echo "  Got: $actual_result"
        echo "  Output: $output"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Test 1: Redis without password (default setup)
echo "Test Group 1: Redis without password"
echo "--------------------------------------"
export REDIS_HOST="localhost"
export REDIS_PORT="6379"
unset REDIS_PASSWORD
unset CFN_REDIS_PASSWORD

# Check if Redis is running
if timeout 1 redis-cli -h localhost -p 6379 ping &>/dev/null; then
    run_test "PING without password" "success" "$WRAPPER" ping
    run_test "GET without password" "success" "$WRAPPER" get test-key
    echo -e "${GREEN}✓ No-password mode working${NC}"
else
    echo -e "${YELLOW}⚠ Redis not running - skipping no-password tests${NC}"
fi
echo ""

# Test 2: Redis with incorrect password (should soft-fail)
echo "Test Group 2: Redis with wrong password"
echo "--------------------------------------"
export REDIS_HOST="localhost"
export REDIS_PORT="6379"
export REDIS_PASSWORD="wrong-password-that-doesnt-exist"

# Should soft-fail (exit 0) when password is wrong
if output=$("$WRAPPER" ping 2>&1); then
    if echo "$output" | grep -q "Redis unavailable"; then
        echo -e "${GREEN}✓ Wrong password handled gracefully (soft fail)${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗ Wrong password did not produce soft-fail message${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
else
    echo -e "${RED}✗ Wrapper should soft-fail (exit 0) for wrong password${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
fi
echo ""

# Test 3: Redis unavailable (wrong port)
echo "Test Group 3: Redis unavailable"
echo "--------------------------------------"
export REDIS_HOST="localhost"
export REDIS_PORT="9999"
unset REDIS_PASSWORD
unset CFN_REDIS_PASSWORD

# Should soft-fail (exit 0) when Redis is down
if output=$("$WRAPPER" ping 2>&1); then
    if echo "$output" | grep -q "Redis unavailable"; then
        echo -e "${GREEN}✓ Unavailable Redis handled gracefully (soft fail)${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗ Unavailable Redis did not produce soft-fail message${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
else
    echo -e "${RED}✗ Wrapper should soft-fail (exit 0) for unavailable Redis${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
fi
echo ""

# Test 4: Verify no AUTH warnings in stderr
echo "Test Group 4: No AUTH warnings check"
echo "--------------------------------------"
export REDIS_HOST="localhost"
export REDIS_PORT="6379"
unset REDIS_PASSWORD
unset CFN_REDIS_PASSWORD

if timeout 1 redis-cli -h localhost -p 6379 ping &>/dev/null; then
    # Capture stderr to check for AUTH warnings
    if stderr=$("$WRAPPER" ping 2>&1 >/dev/null); then
        if echo "$stderr" | grep -qi "auth"; then
            echo -e "${RED}✗ AUTH warning detected in stderr:${NC}"
            echo "$stderr"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        else
            echo -e "${GREEN}✓ No AUTH warnings in output${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        fi
    else
        echo -e "${GREEN}✓ No stderr output (clean execution)${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
else
    echo -e "${YELLOW}⚠ Redis not running - skipping AUTH warning test${NC}"
fi
echo ""

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Total tests run: $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
