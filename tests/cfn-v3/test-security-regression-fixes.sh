#!/bin/bash
# Security Regression Fix Test Suite
# Tests fixes for 3 critical/high vulnerabilities introduced in iteration 2
#
# Tests:
# 1. Environment variable command injection prevention (eval replacement)
# 2. Base64 expansion DoS bypass (post-encoding size check)
# 3. Unbounded iteration count (upper bound validation)

set -euo pipefail

TEST_COUNT=0
PASS_COUNT=0
ORCHESTRATE_SH="/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh"
SECURITY_UTILS_SH="/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/security_utils.sh"

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"

    TEST_COUNT=$((TEST_COUNT + 1))

    if eval "$test_command"; then
        echo "✅ $test_name: PASS"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    else
        echo "❌ $test_name: FAIL"
        return 1
    fi
}

# Test 1: Verify eval is NOT used for Docker command execution
test_no_eval_usage() {
    # Check for array-based execution instead of eval
    grep -q 'DOCKER_CMD=(' "$ORCHESTRATE_SH" && \
    grep -q '"\${DOCKER_CMD\[@\]}"' "$ORCHESTRATE_SH" && \
    ! grep -q 'eval "\$DOCKER_CMD"' "$ORCHESTRATE_SH"
}

# Test 2: Verify sanitize_docker_var function exists in security_utils.sh
test_sanitize_function_exists() {
    grep -q "function sanitize_docker_var" "$SECURITY_UTILS_SH"
}

# Test 3: Verify Docker variable validation pattern in security_utils.sh
test_docker_var_validation_pattern() {
    # Pattern should allow safe characters only: alphanumeric, dash, colon, slash, dot, underscore
    grep -q 'a-zA-Z0-9._:/-' "$SECURITY_UTILS_SH"
}

# Test 4: Verify sanitize_docker_var is called for all Docker variables
test_sanitize_all_docker_vars() {
    grep -q "CFN_DOCKER_IMAGE.*sanitize_docker_var" "$ORCHESTRATE_SH" && \
    grep -q "CFN_DOCKER_NETWORK.*sanitize_docker_var" "$ORCHESTRATE_SH" && \
    grep -q "CFN_MEMORY_LIMIT.*sanitize_docker_var" "$ORCHESTRATE_SH"
}

# Test 5: Verify base64 encoding happens BEFORE size check
test_base64_expansion_check() {
    # Look for pattern: base64 encode → store in variable → size check on encoded variable
    grep -q "ENCODED_CRITERIA.*base64" "$ORCHESTRATE_SH" && \
    grep -q "ENCODED_SIZE.*ENCODED_CRITERIA.*wc -c" "$ORCHESTRATE_SH" && \
    grep -q "ENCODED_SIZE.*-gt.*MAX.*SIZE" "$ORCHESTRATE_SH"
}

# Test 6: Verify MAX_ALLOWED_ITERATIONS constant exists
test_iteration_upper_bound_constant() {
    grep -q "MAX_ALLOWED_ITERATIONS=100" "$ORCHESTRATE_SH"
}

# Test 7: Verify iteration upper bound is enforced
test_iteration_upper_bound_enforcement() {
    grep -q "\-gt.*MAX_ALLOWED_ITERATIONS" "$ORCHESTRATE_SH" && \
    grep -A 4 "\-gt.*MAX_ALLOWED_ITERATIONS" "$ORCHESTRATE_SH" | grep -q "exit 1"
}

# Test 8: Verify iteration numeric validation (positive integer pattern)
test_iteration_numeric_validation() {
    grep -q '1-9' "$ORCHESTRATE_SH" && grep -q '0-9' "$ORCHESTRATE_SH"
}

# Test 9: Verify iteration minimum bound (>= 1)
test_iteration_minimum_bound() {
    grep -q "\-lt 1" "$ORCHESTRATE_SH" && \
    grep -A 2 "\-lt 1" "$ORCHESTRATE_SH" | grep -q "exit 1"
}

# Test 10: Verify all three fixes are present
test_all_fixes_present() {
    local FIXES=0

    # Fix 1: sanitize_docker_var function (in security_utils.sh) + usage in orchestrate.sh
    if grep -q "function sanitize_docker_var" "$SECURITY_UTILS_SH" && \
       grep -q "sanitize_docker_var" "$ORCHESTRATE_SH"; then
        ((FIXES++))
    fi

    # Fix 2: post-encoding size check
    if grep -q "ENCODED_SIZE" "$ORCHESTRATE_SH"; then
        ((FIXES++))
    fi

    # Fix 3: iteration bounds
    if grep -q "MAX_ALLOWED_ITERATIONS" "$ORCHESTRATE_SH"; then
        ((FIXES++))
    fi

    [[ "$FIXES" -eq 3 ]]
}

# Run all tests
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Security Regression Fix Test Suite"
echo "Testing: $ORCHESTRATE_SH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Fix 1: Environment Variable Command Injection Prevention"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test "test_no_eval_usage" "test_no_eval_usage"
run_test "test_sanitize_function_exists" "test_sanitize_function_exists"
run_test "test_docker_var_validation_pattern" "test_docker_var_validation_pattern"
run_test "test_sanitize_all_docker_vars" "test_sanitize_all_docker_vars"
echo ""

echo "Fix 2: Base64 Expansion DoS Bypass Prevention"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test "test_base64_expansion_check" "test_base64_expansion_check"
echo ""

echo "Fix 3: Unbounded Iteration Count Prevention"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test "test_iteration_upper_bound_constant" "test_iteration_upper_bound_constant"
run_test "test_iteration_upper_bound_enforcement" "test_iteration_upper_bound_enforcement"
run_test "test_iteration_numeric_validation" "test_iteration_numeric_validation"
run_test "test_iteration_minimum_bound" "test_iteration_minimum_bound"
echo ""

echo "Overall Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_test "test_all_fixes_present" "test_all_fixes_present"
echo ""

# Summary
PASS_RATE=$(echo "scale=4; $PASS_COUNT / $TEST_COUNT" | bc)
PASS_PERCENTAGE=$(echo "scale=2; $PASS_RATE * 100" | bc)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Results: $PASS_COUNT/$TEST_COUNT passed ($PASS_PERCENTAGE%)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if (( $(echo "$PASS_RATE >= 1.0" | bc -l) )); then
    echo "✅ All security regression fixes validated (100% pass rate)"
    exit 0
else
    echo "❌ Security regression fixes incomplete (<100% pass rate)"
    echo ""
    echo "Failed tests indicate missing or incomplete security fixes."
    echo "Review orchestrate.sh and implement all required changes."
    exit 1
fi
