#!/usr/bin/env bash

##############################################################################
# CFN Loop Orchestrator - Empty Parameter Validation Test
# Version: 1.0.0
#
# Focused test for empty string detection in --loop3-agents, --loop2-agents,
# and --product-owner parameters.
#
# This test validates the fix for parameter validation by checking that:
# 1. Empty string literals are rejected
# 2. Empty variable expansions are rejected
# 3. Unset variable expansions are rejected
# 4. Valid parameters are accepted (without running full orchestration)
##############################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Setup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ORCHESTRATOR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"

if [[ ! -f "$ORCHESTRATOR" ]]; then
    echo -e "${RED}ERROR: Orchestrator not found${NC}"
    exit 1
fi

##############################################################################
# Test Function
##############################################################################

test_params() {
    local test_name="$1"
    local expected="$2"  # "accept" or "reject"
    shift 2
    local args=("$@")

    TESTS_RUN=$((TESTS_RUN + 1))

    # Run orchestrator with timeout to prevent hanging
    local output
    local exit_code=0
    output=$(timeout 5s "$ORCHESTRATOR" "${args[@]}" 2>&1) || exit_code=$?

    # Check result
    if [[ "$expected" == "reject" ]]; then
        # Should fail with empty parameter error
        if echo "$output" | grep -q "value cannot be empty"; then
            echo -e "Test $TESTS_RUN: $test_name ${GREEN}✅ PASS${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "Test $TESTS_RUN: $test_name ${RED}❌ FAIL${NC}"
            echo "  Expected: 'value cannot be empty' error"
            echo "  Got: $output"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        # Should NOT fail with empty parameter error
        if echo "$output" | grep -q "value cannot be empty"; then
            echo -e "Test $TESTS_RUN: $test_name ${RED}❌ FAIL${NC}"
            echo "  Should not reject valid parameters"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        else
            echo -e "Test $TESTS_RUN: $test_name ${GREEN}✅ PASS${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        fi
    fi
}

##############################################################################
# Tests
##############################################################################

echo "=============================================="
echo "Empty Parameter Validation Tests"
echo "=============================================="
echo ""

# Empty string literals
echo "Testing empty string literals..."
test_params "Empty loop3-agents literal" "reject" \
    --task-id "test-1" --loop3-agents "" --loop2-agents "val" --product-owner "po"

test_params "Empty loop2-agents literal" "reject" \
    --task-id "test-2" --loop3-agents "dev" --loop2-agents "" --product-owner "po"

test_params "Empty product-owner literal" "reject" \
    --task-id "test-3" --loop3-agents "dev" --loop2-agents "val" --product-owner ""

# Empty variable expansion
echo ""
echo "Testing empty variable expansion..."
EMPTY=""
test_params "Empty loop3-agents variable" "reject" \
    --task-id "test-4" --loop3-agents "$EMPTY" --loop2-agents "val" --product-owner "po"

test_params "Empty loop2-agents variable" "reject" \
    --task-id "test-5" --loop3-agents "dev" --loop2-agents "$EMPTY" --product-owner "po"

test_params "Empty product-owner variable" "reject" \
    --task-id "test-6" --loop3-agents "dev" --loop2-agents "val" --product-owner "$EMPTY"

# Unset variable expansion
echo ""
echo "Testing unset variable expansion..."
unset UNSET
test_params "Empty loop3-agents unset" "reject" \
    --task-id "test-7" --loop3-agents "${UNSET:-}" --loop2-agents "val" --product-owner "po"

test_params "Empty loop2-agents unset" "reject" \
    --task-id "test-8" --loop3-agents "dev" --loop2-agents "${UNSET:-}" --product-owner "po"

test_params "Empty product-owner unset" "reject" \
    --task-id "test-9" --loop3-agents "dev" --loop2-agents "val" --product-owner "${UNSET:-}"

# Valid parameters
echo ""
echo "Testing valid parameters..."
test_params "Valid single agents" "accept" \
    --task-id "test-10" --loop3-agents "backend-dev" --loop2-agents "validator" --product-owner "product-owner"

test_params "Valid multiple loop3-agents" "accept" \
    --task-id "test-11" --loop3-agents "backend-dev,frontend-dev,tester" --loop2-agents "validator" --product-owner "product-owner"

test_params "Valid multiple loop2-agents" "accept" \
    --task-id "test-12" --loop3-agents "backend-dev" --loop2-agents "validator,security-specialist,perf-analyzer" --product-owner "product-owner"

test_params "Valid multiple agents (all)" "accept" \
    --task-id "test-13" --loop3-agents "backend-dev,frontend-dev" --loop2-agents "validator,security-specialist" --product-owner "product-owner"

##############################################################################
# Summary
##############################################################################

echo ""
echo "=============================================="
echo "Test Summary"
echo "=============================================="
echo "Total:  $TESTS_RUN"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
else
    echo "Failed: $TESTS_FAILED"
fi
echo "=============================================="

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "\n${RED}❌ TEST SUITE FAILED${NC}"
    exit 1
else
    echo -e "\n${GREEN}✅ ALL TESTS PASSED${NC}"
    exit 0
fi
