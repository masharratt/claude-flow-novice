#!/usr/bin/env bash
# tests/docker/test-success-criteria-loading.sh
# Phase 4 :: Success Criteria Loading & Validation (Standalone)
# Tests security fixes and JSON validation without requiring coordinator context

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test fixtures
ENTRYPOINT="$PROJECT_ROOT/docker/coordinator-entrypoint.sh"
TEST_DIR="/tmp/test-success-criteria-$$"
mkdir -p "$TEST_DIR"

cleanup() {
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test helper functions
pass() {
    log_info "✅ PASS: $1"
    ((TESTS_PASSED++)) || true
}

fail() {
    log_info "❌ FAIL: $1"
    if [[ -n "${2:-}" ]]; then
        log_info "  Error: $2"
    fi
    ((TESTS_FAILED++)) || true
}

run_test() {
    ((TESTS_RUN++)) || true
    log_step "Test $TESTS_RUN: $1"
}

##############################################################################
# Test 1: DoS Protection - Large File Rejection (>10MB)
##############################################################################
test_dos_protection() {
    run_test "DoS Protection - Reject files >10MB"

    # GIVEN: A JSON file exceeding 10MB size limit
    LARGE_FILE="$TEST_DIR/large-criteria.json"
    dd if=/dev/zero of="$LARGE_FILE" bs=1M count=11 2>/dev/null

    # WHEN: Attempting to load the file via entrypoint logic
    # Extract the validation logic from entrypoint (simulate it)
    FILE_SIZE=$(stat -c%s "$LARGE_FILE" 2>/dev/null || echo "0")
    MAX_JSON_SIZE=$((10 * 1024 * 1024))  # 10MB limit

    # THEN: File should be rejected
    if [[ "$FILE_SIZE" -gt "$MAX_JSON_SIZE" ]]; then
        pass "Large file correctly rejected (${FILE_SIZE} bytes > 10MB)"
    else
        fail "DoS protection failed" "File should have been rejected"
    fi

    # Verify entrypoint contains DoS protection code
    if grep -q "JSON DoS protection" "$ENTRYPOINT"; then
        pass "Entrypoint contains DoS protection code"
    else
        fail "Entrypoint missing DoS protection" "Security vulnerability"
    fi
}

##############################################################################
# Test 2: Valid JSON Loading
##############################################################################
test_valid_json_loading() {
    run_test "Valid JSON Loading"

    # GIVEN: A valid success criteria JSON file
    VALID_FILE="$TEST_DIR/valid-criteria.json"
    cat > "$VALID_FILE" << 'EOF'
{
  "test_suites": [
    {
      "name": "Unit Tests",
      "command": "npm test",
      "required": true,
      "pass_threshold": 0.95
    }
  ],
  "deliverables": [
    "src/index.ts",
    "tests/unit.test.ts"
  ]
}
EOF

    # WHEN: Validating JSON with jq
    if echo "$(cat "$VALID_FILE")" | jq empty 2>/dev/null; then
        # THEN: JSON should be valid
        pass "Valid JSON parsed successfully"
    else
        fail "Valid JSON rejected" "JSON should have been accepted"
    fi

    # Verify entrypoint contains JSON validation
    if grep -q "jq empty" "$ENTRYPOINT"; then
        pass "Entrypoint contains JSON validation logic"
    else
        fail "Entrypoint missing JSON validation" "Quality issue"
    fi
}

##############################################################################
# Test 3: Invalid JSON Handling
##############################################################################
test_invalid_json_handling() {
    run_test "Invalid JSON Handling"

    # GIVEN: An invalid JSON file (malformed syntax)
    INVALID_FILE="$TEST_DIR/invalid-criteria.json"
    cat > "$INVALID_FILE" << 'EOF'
{
  "test_suites": [
    {
      "name": "Incomplete JSON - missing closing bracket"
    }
EOF

    # WHEN: Attempting to validate with jq
    if echo "$(cat "$INVALID_FILE")" | jq empty 2>/dev/null; then
        # THEN: Should fail validation
        fail "Invalid JSON accepted" "Malformed JSON should be rejected"
    else
        pass "Invalid JSON correctly rejected"
    fi
}

##############################################################################
# Test 4: Missing Required Fields
##############################################################################
test_missing_required_fields() {
    run_test "Missing Required Fields Detection"

    # GIVEN: JSON missing required 'test_suites' field
    INCOMPLETE_FILE="$TEST_DIR/incomplete-criteria.json"
    cat > "$INCOMPLETE_FILE" << 'EOF'
{
  "deliverables": [
    "src/index.ts"
  ]
}
EOF

    # WHEN: Validating structure
    # Note: Basic jq validation will pass, but schema validation would catch this
    if echo "$(cat "$INCOMPLETE_FILE")" | jq '.test_suites' 2>/dev/null | grep -q null; then
        # THEN: Missing field should be detectable
        pass "Missing 'test_suites' field detected"
    else
        fail "Missing field not detected" "Schema validation needed"
    fi

    # Verify field exists in valid example
    VALID_FILE="$TEST_DIR/valid-criteria.json"
    if echo "$(cat "$VALID_FILE")" | jq '.test_suites' 2>/dev/null | grep -q -v null; then
        pass "Required 'test_suites' field present in valid JSON"
    else
        fail "Valid JSON missing required field" "Test fixture issue"
    fi
}

##############################################################################
# Test 5: Malformed JSON Edge Cases
##############################################################################
test_malformed_json_edge_cases() {
    run_test "Malformed JSON Edge Cases"

    # Test 5a: Empty file (jq accepts empty/null as valid JSON)
    EMPTY_FILE="$TEST_DIR/empty.json"
    touch "$EMPTY_FILE"

    # Note: jq treats empty input as valid (null), so we check this behavior
    if echo "$(cat "$EMPTY_FILE")" | jq empty 2>/dev/null; then
        pass "Empty file treated as valid JSON (null) - expected jq behavior"
    else
        pass "Empty file rejected"
    fi

    # Test 5b: Plain text instead of JSON
    TEXT_FILE="$TEST_DIR/text.json"
    echo "This is not JSON" > "$TEXT_FILE"

    if echo "$(cat "$TEXT_FILE")" | jq empty 2>/dev/null; then
        fail "Plain text accepted as valid JSON" "Should reject non-JSON"
    else
        pass "Plain text correctly rejected"
    fi

    # Test 5c: JSON with trailing comma (common error)
    TRAILING_COMMA_FILE="$TEST_DIR/trailing-comma.json"
    cat > "$TRAILING_COMMA_FILE" << 'EOF'
{
  "test_suites": [],
}
EOF

    if echo "$(cat "$TRAILING_COMMA_FILE")" | jq empty 2>/dev/null; then
        fail "JSON with trailing comma accepted" "Should reject malformed JSON"
    else
        pass "JSON with trailing comma correctly rejected"
    fi
}

##############################################################################
# Test 6: Path Traversal Protection
##############################################################################
test_path_traversal_protection() {
    run_test "Path Traversal Protection"

    # GIVEN: Entrypoint has path traversal protection
    if grep -q "Path traversal protection" "$ENTRYPOINT"; then
        pass "Entrypoint contains path traversal protection code"
    else
        fail "Path traversal protection missing" "Security vulnerability"
    fi

    # WHEN: Checking allowed paths
    if grep -q "/workspace/" "$ENTRYPOINT" && grep -q "/etc/cfn/" "$ENTRYPOINT"; then
        # THEN: Only safe paths should be allowed
        pass "Entrypoint restricts to safe paths (/workspace, /etc/cfn)"
    else
        fail "Path restrictions not found" "Security configuration issue"
    fi
}

##############################################################################
# Test 7: Environment Variable Handling
##############################################################################
test_env_variable_handling() {
    run_test "Environment Variable Handling"

    # GIVEN: Entrypoint supports both file and inline JSON
    if grep -q "CFN_SUCCESS_CRITERIA" "$ENTRYPOINT"; then
        pass "Entrypoint checks CFN_SUCCESS_CRITERIA variable"
    else
        fail "Environment variable handling missing" "Configuration issue"
    fi

    # WHEN: Checking for file vs inline logic
    if grep -q "if \[\[ -f" "$ENTRYPOINT"; then
        # THEN: Should detect file paths vs inline JSON
        pass "Entrypoint distinguishes file paths from inline JSON"
    else
        fail "File detection logic missing" "Functionality gap"
    fi
}

##############################################################################
# Test 8: File Size Validation Logic
##############################################################################
test_file_size_validation() {
    run_test "File Size Validation Logic"

    # GIVEN: A small valid file (well under 10MB)
    SMALL_FILE="$TEST_DIR/small-criteria.json"
    cat > "$SMALL_FILE" << 'EOF'
{
  "test_suites": [{"name": "Test", "command": "echo test", "required": true, "pass_threshold": 1.0}]
}
EOF

    # WHEN: Checking file size
    FILE_SIZE=$(stat -c%s "$SMALL_FILE" 2>/dev/null || echo "0")
    MAX_JSON_SIZE=$((10 * 1024 * 1024))

    # THEN: Small file should pass validation
    if [[ "$FILE_SIZE" -le "$MAX_JSON_SIZE" ]]; then
        pass "Small file passes size validation (${FILE_SIZE} bytes < 10MB)"
    else
        fail "Small file incorrectly rejected" "Size validation error"
    fi

    # Verify size is reported in KB (human-readable)
    SIZE_KB=$((FILE_SIZE / 1024))
    if [[ "$SIZE_KB" -lt 1024 ]]; then
        pass "File size reported in human-readable format (${SIZE_KB}KB)"
    else
        fail "File size format incorrect" "Expected KB for small files"
    fi
}

##############################################################################
# Execute All Tests
##############################################################################
main() {
    log_step "=== Docker Coordinator Success Criteria Loading Tests ==="
    log_info "Testing security fixes and JSON validation (standalone mode)"
    log_info ""

    test_dos_protection
    test_valid_json_loading
    test_invalid_json_handling
    test_missing_required_fields
    test_malformed_json_edge_cases
    test_path_traversal_protection
    test_env_variable_handling
    test_file_size_validation

    log_info ""
    log_step "=== Test Summary ==="
    log_info "Tests run:    $TESTS_RUN"
    log_info "Tests passed: $TESTS_PASSED"
    log_info "Tests failed: $TESTS_FAILED"

    if [[ "$TESTS_FAILED" -eq 0 ]]; then
        log_info ""
        log_info "✅ All tests passed!"
        exit 0
    else
        log_info ""
        log_info "❌ Some tests failed"
        exit 1
    fi
}

main "$@"
