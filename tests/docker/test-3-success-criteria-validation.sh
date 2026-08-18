#!/usr/bin/env bash
##############################################################################
# Test 3: Success Criteria Loading Logic (Standalone)
# Phase 4: Docker Mode Integration - Test-Driven Gates
#
# Tests success criteria loading logic independently without requiring
# coordinator container to be running. Extracts validation logic from
# coordinator-entrypoint.sh and tests all scenarios.
#
# Test Scenarios:
# 1. Valid file path (workspace location)
# 2. Valid file path (etc/cfn location)
# 3. Invalid file path (path traversal attack)
# 4. Oversized file (DoS attack prevention)
# 5. Malformed JSON (validation failure)
##############################################################################

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
WORKSPACE_DIR="/tmp/test-workspace-$$"
ETC_CFN_DIR="/tmp/test-etc-cfn-$$"
ATTACK_DIR="/tmp/test-attack-$$"
MAX_JSON_SIZE=$((10 * 1024 * 1024))  # 10MB limit

cleanup() {
    rm -rf "$WORKSPACE_DIR" "$ETC_CFN_DIR" "$ATTACK_DIR"
    log_info "Cleanup completed"
}
trap cleanup EXIT

# Extract validation logic from coordinator-entrypoint.sh
validate_success_criteria_file() {
    local CFN_SUCCESS_CRITERIA="$1"

    # GIVEN: Check if CFN_SUCCESS_CRITERIA is a file path
    if [[ -f "$CFN_SUCCESS_CRITERIA" ]]; then
        # WHEN: Path traversal protection
        # Only allow files in /workspace or /etc/cfn directories
        RESOLVED_PATH=$(readlink -f "$CFN_SUCCESS_CRITERIA" 2>/dev/null || echo "$CFN_SUCCESS_CRITERIA")

        # In test environment, use test directories instead of /workspace and /etc/cfn
        if [[ "$RESOLVED_PATH" =~ ^${WORKSPACE_DIR}/ ]] || [[ "$RESOLVED_PATH" =~ ^${ETC_CFN_DIR}/ ]]; then
            # THEN: Path is valid
            :
        else
            echo "❌ ERROR: Success criteria file must be in workspace or etc/cfn"
            echo "   Attempted path: ${CFN_SUCCESS_CRITERIA}"
            echo "   Resolved path: ${RESOLVED_PATH}"
            return 1
        fi

        # WHEN: JSON DoS protection - check file size (max 10MB)
        FILE_SIZE=$(stat -c%s "$CFN_SUCCESS_CRITERIA" 2>/dev/null || echo "0")

        if [[ "$FILE_SIZE" -gt "$MAX_JSON_SIZE" ]]; then
            echo "❌ ERROR: Success criteria file exceeds 10MB limit"
            echo "   File size: $((FILE_SIZE / 1024 / 1024))MB"
            return 1
        fi

        # WHEN: Load file content
        SUCCESS_CRITERIA=$(cat "$CFN_SUCCESS_CRITERIA")
    else
        # GIVEN: Inline JSON string
        SUCCESS_CRITERIA="$CFN_SUCCESS_CRITERIA"
    fi

    # WHEN: Validate JSON format
    if ! echo "$SUCCESS_CRITERIA" | jq empty 2>/dev/null; then
        echo "❌ Invalid success criteria JSON format"
        return 1
    fi

    # THEN: Success
    echo "✅ Success criteria loaded and validated"
    echo "$SUCCESS_CRITERIA"
    return 0
}

##############################################################################
# Test 1: Valid file path in workspace location
##############################################################################
test_valid_workspace_file() {
    log_step "Test 1: Valid file path in workspace location"

    # GIVEN: Valid JSON file in workspace
    mkdir -p "$WORKSPACE_DIR"
    local CRITERIA_FILE="$WORKSPACE_DIR/success-criteria.json"
    cat > "$CRITERIA_FILE" << 'EOF'
{
  "test_suites": [{
    "name": "Docker Tests",
    "command": "bash test.sh",
    "required": true,
    "pass_threshold": 0.95
  }],
  "deliverables": ["file.ts"]
}
EOF

    # WHEN: Validate file
    local output
    if output=$(validate_success_criteria_file "$CRITERIA_FILE" 2>&1); then
        # THEN: Should pass validation
        assert_contains "$output" "Success criteria loaded and validated" \
            "Valid workspace file should pass"
        assert_contains "$output" "Docker Tests" \
            "Output should contain parsed JSON"
        return 0
    else
        log_error "Validation failed: $output"
        return 1
    fi
}

##############################################################################
# Test 2: Valid file path in etc/cfn location
##############################################################################
test_valid_etc_cfn_file() {
    log_step "Test 2: Valid file path in etc/cfn location"

    # GIVEN: Valid JSON file in etc/cfn
    mkdir -p "$ETC_CFN_DIR"
    local CRITERIA_FILE="$ETC_CFN_DIR/criteria.json"
    cat > "$CRITERIA_FILE" << 'EOF'
{
  "test_suites": [{
    "name": "System Tests",
    "command": "npm test",
    "required": true,
    "pass_threshold": 1.0
  }]
}
EOF

    # WHEN: Validate file
    local output
    if output=$(validate_success_criteria_file "$CRITERIA_FILE" 2>&1); then
        # THEN: Should pass validation
        assert_contains "$output" "Success criteria loaded and validated" \
            "Valid etc/cfn file should pass"
        return 0
    else
        log_error "Validation failed: $output"
        return 1
    fi
}

##############################################################################
# Test 3: Invalid file path (path traversal attack)
##############################################################################
test_path_traversal_attack() {
    log_step "Test 3: Invalid file path (path traversal attack)"

    # GIVEN: Malicious file outside allowed directories
    mkdir -p "$ATTACK_DIR"
    local ATTACK_FILE="$ATTACK_DIR/malicious.json"
    cat > "$ATTACK_FILE" << 'EOF'
{
  "test_suites": [{
    "name": "Evil Test",
    "command": "rm -rf /",
    "required": true
  }]
}
EOF

    # WHEN: Attempt to validate file
    local output
    if output=$(validate_success_criteria_file "$ATTACK_FILE" 2>&1); then
        # THEN: Should FAIL validation (security)
        log_error "Path traversal attack not detected!"
        return 1
    else
        assert_contains "$output" "must be in workspace or etc/cfn" \
            "Should reject files outside allowed paths"
        return 0
    fi
}

##############################################################################
# Test 4: Oversized file (DoS attack prevention)
##############################################################################
test_oversized_file_dos() {
    log_step "Test 4: Oversized file (DoS attack prevention)"

    # GIVEN: File exceeding 10MB limit
    mkdir -p "$WORKSPACE_DIR"
    local LARGE_FILE="$WORKSPACE_DIR/large.json"

    # Create 11MB file (exceeds 10MB limit)
    dd if=/dev/zero of="$LARGE_FILE" bs=1M count=11 2>/dev/null

    # WHEN: Attempt to validate file
    local output
    if output=$(validate_success_criteria_file "$LARGE_FILE" 2>&1); then
        # THEN: Should FAIL validation (DoS protection)
        log_error "Oversized file not detected!"
        return 1
    else
        assert_contains "$output" "exceeds 10MB limit" \
            "Should reject files over 10MB"
        return 0
    fi
}

##############################################################################
# Test 5: Malformed JSON (validation failure)
##############################################################################
test_malformed_json() {
    log_step "Test 5: Malformed JSON (validation failure)"

    # GIVEN: Invalid JSON file
    mkdir -p "$WORKSPACE_DIR"
    local INVALID_FILE="$WORKSPACE_DIR/invalid.json"
    cat > "$INVALID_FILE" << 'EOF'
{
  "test_suites": [{
    "name": "Broken Test",
    "command": "test"
  }
  # Missing closing brackets
EOF

    # WHEN: Attempt to validate file
    local output
    if output=$(validate_success_criteria_file "$INVALID_FILE" 2>&1); then
        # THEN: Should FAIL validation
        log_error "Malformed JSON not detected!"
        return 1
    else
        assert_contains "$output" "Invalid success criteria JSON format" \
            "Should reject malformed JSON"
        return 0
    fi
}

##############################################################################
# Main execution
##############################################################################
# Manual test setup (skip Redis since not needed for this test)
TEST_LOG="/tmp/test-3-success-criteria-validation-$(date +%s).log"
TEST_TOTAL=0
TEST_PASSED=0
TEST_FAILED=0

annotate "Test Suite: test-3-success-criteria-validation"
log_info "Started at: $(date -Iseconds)"
log_info "Log file: $TEST_LOG"

# Run all tests
test_valid_workspace_file
test_valid_etc_cfn_file
test_path_traversal_attack
test_oversized_file_dos
test_malformed_json

# Print summary
print_test_summary
