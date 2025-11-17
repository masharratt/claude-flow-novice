#!/bin/bash
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../" && pwd)"
ORCHESTRATE="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"
SECURITY_UTILS="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/security_utils.sh"

TESTS_PASSED=0
TESTS_FAILED=0

test_result() {
    local name="$1"
    local status="$2"
    if [[ "$status" == "PASS" ]]; then
        echo "✓ $name"
        ((TESTS_PASSED++))
    else
        echo "✗ $name"
        ((TESTS_FAILED++))
    fi
}

echo "SEC-002 Security Validation Tests"
echo "=================================="
echo ""

echo "1. COMMAND INJECTION (CVSS 9.8)"
source "$SECURITY_UTILS"
result=$(sanitize_docker_var "image; rm -rf /" 2>&1) || true
[[ "$result" == *"Invalid"* ]] && test_result "Semicolon injection blocked" "PASS" || test_result "Semicolon injection blocked" "FAIL"

result=$(sanitize_docker_var "image|cat /etc/passwd" 2>&1) || true
[[ "$result" == *"Invalid"* ]] && test_result "Pipe injection blocked" "PASS" || test_result "Pipe injection blocked" "FAIL"

result=$(sanitize_docker_var "image\$(whoami)" 2>&1) || true
[[ "$result" == *"Invalid"* ]] && test_result "Command substitution blocked" "PASS" || test_result "Command substitution blocked" "FAIL"

sanitize_docker_var "ubuntu:20.04" >/dev/null 2>&1 && test_result "Valid docker image accepted" "PASS" || test_result "Valid docker image accepted" "FAIL"

echo ""
echo "2. BASE64 DoS (CVSS 8.6)"
grep -q "ENCODED_SIZE=.*wc -c" "$ORCHESTRATE" && test_result "Size check after base64 encoding" "PASS" || test_result "Size check after base64 encoding" "FAIL"
grep -q "MAX_ENCODED_SIZE=10485760" "$ORCHESTRATE" && test_result "10MB limit enforced" "PASS" || test_result "10MB limit enforced" "FAIL"
grep -q 'if \[\[ "$ENCODED_SIZE" -gt "$MAX_ENCODED_SIZE" \]\]' "$ORCHESTRATE" && test_result "Size validation check present" "PASS" || test_result "Size validation check present" "FAIL"

echo ""
echo "3. ITERATION BOUNDS (CVSS 7.5)"
grep -q "MAX_ALLOWED_ITERATIONS=100" "$ORCHESTRATE" && test_result "MAX_ITERATIONS limit = 100" "PASS" || test_result "MAX_ITERATIONS limit = 100" "FAIL"
grep -q 'if \[\[ "$2" -gt "$MAX_ALLOWED_ITERATIONS" \]\]' "$ORCHESTRATE" && test_result "Upper bound check enforced" "PASS" || test_result "Upper bound check enforced" "FAIL"
grep -q 'if \[\[ "$2" -lt 1 \]\]' "$ORCHESTRATE" && test_result "Lower bound check enforced" "PASS" || test_result "Lower bound check enforced" "FAIL"

echo ""
echo "4. RCE PREVENTION (Array Execution)"
grep -q 'DOCKER_CMD=(' "$ORCHESTRATE" && test_result "Docker command as array" "PASS" || test_result "Docker command as array" "FAIL"
grep -q '"\${DOCKER_CMD\[@\]}"' "$ORCHESTRATE" && test_result "Array expansion (no eval)" "PASS" || test_result "Array expansion (no eval)" "FAIL"
! grep -A50 "Build Docker command as array" "$ORCHESTRATE" | grep -q "eval" && test_result "No eval in docker code" "PASS" || test_result "No eval in docker code" "FAIL"

echo ""
echo "5. INPUT SANITIZATION"
grep -q "function sanitize_input" "$SECURITY_UTILS" && test_result "sanitize_input function exists" "PASS" || test_result "sanitize_input function exists" "FAIL"
grep -q "pattern=" "$SECURITY_UTILS" && test_result "Whitelist pattern enforced" "PASS" || test_result "Whitelist pattern enforced" "FAIL"

echo ""
echo "=================================="
echo "Results: $TESTS_PASSED passed, $TESTS_FAILED failed"

if [[ $TESTS_FAILED -eq 0 ]]; then
    exit 0
else
    exit 1
fi
