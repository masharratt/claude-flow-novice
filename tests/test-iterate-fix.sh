#!/bin/bash
# Test script to validate ITERATE decision fix
# Tests that orchestrator properly continues to iteration 2 after ITERATE decision

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

function test_iterate_handler_has_continue() {
    echo -n "Test 1: ITERATE handler has explicit continue statement... "

    if grep -q "elif \[ \"\$DECISION_TYPE\" = \"ITERATE\" \]; then" "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh"; then
        # Check if continue statement exists after ITERATE handler
        if awk '/elif \[ "\$DECISION_TYPE" = "ITERATE" \]; then/,/elif \[ "\$DECISION_TYPE" = "ABORT" \]; then/' "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh" | grep -q "continue"; then
            echo -e "${GREEN}PASS${NC}"
            PASSED=$((PASSED + 1))
            return 0
        else
            echo -e "${RED}FAIL${NC} - No continue statement in ITERATE handler"
            FAILED=$((FAILED + 1))
            return 1
        fi
    else
        echo -e "${RED}FAIL${NC} - ITERATE handler not found"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

function test_iteration_tracking() {
    echo -n "Test 2: Iteration transition tracking exists... "

    if grep -q "iteration_transition" "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh"; then
        echo -e "${GREEN}PASS${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC} - No iteration transition logging"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

function test_current_iteration_redis_key() {
    echo -n "Test 3: Current iteration stored in Redis... "

    if grep -q "swarm:\${TASK_ID}:current-iteration" "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh"; then
        echo -e "${GREEN}PASS${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC} - No current-iteration Redis tracking"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

function test_iteration_timeout_protection() {
    echo -n "Test 4: Iteration timeout protection exists... "

    if grep -q "ITERATION_TIMEOUT" "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh"; then
        if grep -q "ITERATION_DEADLINE" "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh"; then
            if grep -q "ITERATION_ELAPSED" "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh"; then
                echo -e "${GREEN}PASS${NC}"
                PASSED=$((PASSED + 1))
                return 0
            fi
        fi
    fi

    echo -e "${RED}FAIL${NC} - Missing timeout protection variables"
    FAILED=$((FAILED + 1))
    return 1
}

function test_timeout_check_before_continue() {
    echo -n "Test 5: Timeout check before iteration continue... "

    # Check if timeout check exists in ITERATE handler
    if awk '/elif \[ "\$DECISION_TYPE" = "ITERATE" \]; then/,/continue/' "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh" | grep -q "ITERATION_ELAPSED.*ITERATION_TIMEOUT"; then
        echo -e "${GREEN}PASS${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC} - No timeout check before continue"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

function test_next_iteration_variable() {
    echo -n "Test 6: NEXT_ITERATION variable calculated... "

    if awk '/elif \[ "\$DECISION_TYPE" = "ITERATE" \]; then/,/continue/' "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh" | grep -q "NEXT_ITERATION=\$((ITERATION + 1))"; then
        echo -e "${GREEN}PASS${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC} - NEXT_ITERATION not calculated"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

function test_explicit_log_message() {
    echo -n "Test 7: Explicit iteration continuation log message... "

    if sed -n '1699,1760p' "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh" | grep -q 'Starting iteration.*$NEXT_ITERATION'; then
        echo -e "${GREEN}PASS${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC} - No explicit continuation log message"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

function test_proceed_has_exit() {
    echo -n "Test 8: PROCEED handler exits script... "

    if awk '/if \[ "\$DECISION_TYPE" = "PROCEED" \] \|\| \[ "\$DECISION_TYPE" = "DEFER_AND_PROCEED" \]; then/,/elif \[ "\$DECISION_TYPE" = "ITERATE" \]; then/' "$PROJECT_ROOT/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh" | grep -q "exit 0"; then
        echo -e "${GREEN}PASS${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC} - PROCEED handler missing exit 0"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Run tests
echo "=================================="
echo "ITERATE Decision Fix Validation"
echo "=================================="
echo ""

test_iterate_handler_has_continue
test_iteration_tracking
test_current_iteration_redis_key
test_iteration_timeout_protection
test_timeout_check_before_continue
test_next_iteration_variable
test_explicit_log_message
test_proceed_has_exit

echo ""
echo "=================================="
echo "Test Results"
echo "=================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
