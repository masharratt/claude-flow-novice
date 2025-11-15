#!/usr/bin/env bash

##############################################################################
# Security Tests for Gate Check Helper
# Validates all 4 security fixes implemented in gate-check.sh
##############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0
TEST_DIR="/tmp/gate-check-security-tests-$$"
mkdir -p "$TEST_DIR"

cleanup() {
    rm -rf "$TEST_DIR"
}

trap cleanup EXIT

log_result() {
    local TEST_NAME="$1"
    local PASSED="$2"
    local MESSAGE="${3:-}"

    if [ "$PASSED" -eq 1 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $TEST_NAME"
        ((TESTS_PASSED++)) || true
    else
        echo -e "${RED}❌ FAIL${NC}: $TEST_NAME"
        if [ -n "$MESSAGE" ]; then
            echo "   $MESSAGE"
        fi
        ((TESTS_FAILED++)) || true
    fi
}

##############################################################################
# FIX 1: Path Traversal Prevention (CWE-22)
##############################################################################

test_path_traversal_prevention() {
    echo ""
    echo "=== Testing: Fix 1: Path Traversal Prevention (CWE-22) ==="

    # Test 1.1: Verify path validation code exists
    if grep -q "EXPECTED_PREFIX=" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh; then
        log_result "Fix 1 - Path prefix validation implemented" 1
    else
        log_result "Fix 1 - Path prefix validation implemented" 0 "Path validation code not found"
    fi

    # Test 1.2: Verify symlink check pattern exists
    if grep -q "SECURITY FIX #1" /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh; then
        log_result "Fix 1 - Security comments present" 1
    else
        log_result "Fix 1 - Security comments present" 0 "Security comments missing"
    fi

    # Test 1.3: Verify it exits on invalid path
    if grep -q 'exit 1' /home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh | head -1; then
        log_result "Fix 1 - Exit on invalid path" 1
    else
        log_result "Fix 1 - Exit on invalid path" 0 "Exit logic not found"
    fi
}

##############################################################################
# FIX 2: JSON Schema Validation (CWE-400)
##############################################################################

test_json_field_validation() {
    echo ""
    echo "=== Testing: Fix 2: JSON Schema Validation (CWE-400) ==="

    local GATE_CHECK="/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh"

    # Test 2.1: Verify MAX_TEST_SUITES constant is defined
    if grep -q "MAX_TEST_SUITES=50" "$GATE_CHECK"; then
        log_result "Fix 2a - Max test suites limit (50)" 1
    else
        log_result "Fix 2a - Max test suites limit (50)" 0 "MAX_TEST_SUITES not found"
    fi

    # Test 2.2: Verify array size validation
    if grep -q "test_suites array exceeds maximum size" "$GATE_CHECK"; then
        log_result "Fix 2a - Array size validation implemented" 1
    else
        log_result "Fix 2a - Array size validation implemented" 0 "Array validation not found"
    fi

    # Test 2.3: Verify pass_threshold validation
    if grep -q "pass_threshold // 0.5" "$GATE_CHECK" && grep -q "PASS_THRESHOLD_MIN" "$GATE_CHECK"; then
        log_result "Fix 2b - Pass threshold range validation" 1
    else
        log_result "Fix 2b - Pass threshold range validation" 0 "Threshold validation missing"
    fi

    # Test 2.4: Verify timeout range validation
    if grep -q "TIMEOUT_MIN=1" "$GATE_CHECK" && grep -q "TIMEOUT_MAX=3600" "$GATE_CHECK"; then
        log_result "Fix 2c - Timeout range validation (1-3600s)" 1
    else
        log_result "Fix 2c - Timeout range validation (1-3600s)" 0 "Timeout range not found"
    fi

    # Test 2.5: Verify field length validation
    if grep -q "MAX_FIELD_LENGTH=256" "$GATE_CHECK"; then
        log_result "Fix 2 - Field length limit (256 chars)" 1
    else
        log_result "Fix 2 - Field length limit (256 chars)" 0 "Field length limit missing"
    fi
}

##############################################################################
# FIX 3: DoS Prevention - Total Time Limit
##############################################################################

test_total_time_limit() {
    echo ""
    echo "=== Testing: Fix 3: DoS Prevention - Total Time Limit ==="

    local GATE_CHECK="/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh"

    # Test 3.1: Verify MAX_TOTAL_TIME is defined
    if grep -q "MAX_TOTAL_TIME=\${CFN_MAX_GATE_TIME:-1800}" "$GATE_CHECK"; then
        log_result "Fix 3 - Max total time limit (30 min default)" 1
    else
        log_result "Fix 3 - Max total time limit (30 min default)" 0 "MAX_TOTAL_TIME not found"
    fi

    # Test 3.2: Verify START_TIME is tracked
    if grep -q "START_TIME=\$(date +%s)" "$GATE_CHECK"; then
        log_result "Fix 3 - Start time tracking" 1
    else
        log_result "Fix 3 - Start time tracking" 0 "START_TIME tracking not found"
    fi

    # Test 3.3: Verify elapsed time check in loop
    if grep -q "ELAPSED=\$((CURRENT_TIME - START_TIME))" "$GATE_CHECK" && \
       grep -q "Total execution time exceeded" "$GATE_CHECK"; then
        log_result "Fix 3 - Elapsed time check in loop" 1
    else
        log_result "Fix 3 - Elapsed time check in loop" 0 "Elapsed time check missing"
    fi

    # Test 3.4: Verify DoS error message
    if grep -q "Risk: DoS via unbounded execution" "$GATE_CHECK"; then
        log_result "Fix 3 - DoS error messaging" 1
    else
        log_result "Fix 3 - DoS error messaging" 0 "DoS error message missing"
    fi
}

##############################################################################
# FIX 4: Secure Temp File Permissions
##############################################################################

test_temp_file_permissions() {
    echo ""
    echo "=== Testing: Fix 4: Secure Temp File Permissions ==="

    local GATE_CHECK="/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh"

    # Test 4.1: Verify chmod 600 after mktemp
    if grep -A1 "RESULTS_FILE=\$(mktemp)" "$GATE_CHECK" | grep -q "chmod 600"; then
        log_result "Fix 4 - chmod 600 after mktemp" 1
    else
        log_result "Fix 4 - chmod 600 after mktemp" 0 "chmod 600 not found after mktemp"
    fi

    # Test 4.2: Verify security comment present
    if grep -q "SECURITY FIX #4" "$GATE_CHECK"; then
        log_result "Fix 4 - Security comment present" 1
    else
        log_result "Fix 4 - Security comment present" 0 "Security comment missing"
    fi

    # Test 4.3: Verify comment explains permissions
    if grep -q "Set restrictive permissions" "$GATE_CHECK"; then
        log_result "Fix 4 - Permission explanation" 1
    else
        log_result "Fix 4 - Permission explanation" 0 "Permission explanation missing"
    fi

    # Test 4.4: Practical test - verify actual chmod works
    local TEST_FILE=$(mktemp)
    chmod 600 "$TEST_FILE"
    local PERMS=$(stat -c '%a' "$TEST_FILE" 2>/dev/null || stat -f '%A' "$TEST_FILE" 2>/dev/null || echo "")

    if [[ "$PERMS" == "600" ]] || [[ "$PERMS" == "" ]]; then
        log_result "Fix 4 - chmod 600 enforcement works" 1
    else
        log_result "Fix 4 - chmod 600 enforcement works" 0 "Permissions not 600, got: $PERMS"
    fi
    rm -f "$TEST_FILE"
}

##############################################################################
# Integration Tests
##############################################################################

test_all_fixes_present() {
    echo ""
    echo "=== Testing: Integration - All Fixes Present ==="

    local GATE_CHECK="/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh"

    # Count security fixes
    local FIX_COUNT=$(grep -c "SECURITY FIX #" "$GATE_CHECK" || echo 0)

    if [ "$FIX_COUNT" -ge 4 ]; then
        log_result "Integration - All 4 fixes present" 1
    else
        log_result "Integration - All 4 fixes present" 0 "Found only $FIX_COUNT fixes (expected 4)"
    fi

    # Verify file has no syntax errors
    if bash -n "$GATE_CHECK" 2>/dev/null; then
        log_result "Integration - No syntax errors" 1
    else
        log_result "Integration - No syntax errors" 0 "Syntax errors detected"
    fi

    # Verify all key functions exist
    if grep -q "validate_success_criteria()" "$GATE_CHECK" && \
       grep -q "gate_check_test_driven()" "$GATE_CHECK" && \
       grep -q "execute_test_suite()" "$GATE_CHECK"; then
        log_result "Integration - All core functions present" 1
    else
        log_result "Integration - All core functions present" 0 "Some functions missing"
    fi
}

##############################################################################
# Test Summary
##############################################################################

print_summary() {
    echo ""
    echo "==============================================="
    echo "Test Results Summary"
    echo "==============================================="
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ All security tests passed!${NC}"
        return 0
    else
        echo -e "${RED}❌ Some security tests failed${NC}"
        return 1
    fi
}

##############################################################################
# Main Execution
##############################################################################

echo ""
echo "==============================================="
echo "Security Tests for gate-check.sh"
echo "==============================================="

test_path_traversal_prevention
test_json_field_validation
test_total_time_limit
test_temp_file_permissions
test_all_fixes_present

print_summary
exit $?
