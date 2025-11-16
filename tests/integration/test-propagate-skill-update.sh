#!/usr/bin/env bash
#
# test-propagate-skill-update.sh - Integration Tests for propagate-skill-update.sh
#
# Purpose:
#   Comprehensive TDD test suite for skill update propagation from Phase 4
#
# Test Scenarios:
#   1. Patch version update (1.0.0 → 1.0.1) - Bug fix
#   2. Minor version update (1.0.0 → 1.1.0) - New feature
#   3. Major version update (1.0.0 → 2.0.0) - Breaking change
#   4. Content hash update verification
#   5. Approval history creation
#   6. Agent notification (optional)
#   7. Error handling (invalid version, missing file)
#   8. Idempotency (re-running same update)
#
# Usage:
#   bash tests/integration/test-propagate-skill-update.sh

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TEST_DB_PATH="/tmp/test-propagate-skill-update-$$.db"
TEST_SKILL_DIR="/tmp/test-skills-$$"

# Script under test
PROPAGATE_SCRIPT="${PROJECT_ROOT}/.claude/skills/workflow-codification/propagate-skill-update.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

#######################################
# Utility functions
#######################################
log_test() {
    echo -e "${BLUE}[TEST $((TESTS_RUN + 1))]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    ((TESTS_FAILED++))
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

#######################################
# Setup and teardown
#######################################
setup_test_db() {
    log_info "Setting up test database: $TEST_DB_PATH"

    # Create test database with schema
    sqlite3 "$TEST_DB_PATH" <<'EOF'
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  team TEXT,
  content_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tags TEXT,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  approval_level TEXT NOT NULL DEFAULT 'human',
  approval_criteria TEXT,
  last_approved_by TEXT,
  last_approval_date TEXT,
  test_coverage REAL,
  test_suite_path TEXT,
  required_test_pass_rate REAL DEFAULT 0.95,
  phase4_pattern_id INTEGER,
  generated_by TEXT,
  is_auto_generated BOOLEAN DEFAULT 0,
  deprecation_note TEXT,
  replacement_id INTEGER,
  owner TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  approval_level TEXT NOT NULL,
  approver TEXT,
  decision TEXT NOT NULL,
  reasoning TEXT,
  risk_assessment TEXT,
  test_results TEXT,
  approval_criteria_check TEXT,
  escalation_reason TEXT,
  escalated_to TEXT,
  escalation_timestamp TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  review_duration_minutes INTEGER,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_skill_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL,
  skill_id INTEGER NOT NULL,
  priority INTEGER DEFAULT 1,
  required BOOLEAN DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
EOF

    # Create test skill directory
    mkdir -p "$TEST_SKILL_DIR"

    log_info "Test database created"
}

cleanup_test_db() {
    log_info "Cleaning up test database and files"
    rm -f "$TEST_DB_PATH"
    rm -rf "$TEST_SKILL_DIR"
}

insert_test_skill() {
    local name="$1"
    local version="$2"
    local content_path="$3"
    local content_hash="$4"

    sqlite3 "$TEST_DB_PATH" <<EOF
INSERT INTO skills (name, category, content_path, content_hash, version, status, owner, team)
VALUES ('$name', 'domain', '$content_path', '$content_hash', '$version', 'active', 'test-owner', 'cfn');
EOF
}

insert_agent_mapping() {
    local agent_type="$1"
    local skill_name="$2"

    local skill_id
    skill_id=$(sqlite3 "$TEST_DB_PATH" "SELECT id FROM skills WHERE name='$skill_name'")

    sqlite3 "$TEST_DB_PATH" <<EOF
INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required)
VALUES ('$agent_type', $skill_id, 1, 0);
EOF
}

create_test_skill_file() {
    local file_path="$1"
    local content="$2"

    echo "$content" > "$file_path"
}

calculate_hash() {
    local file_path="$1"
    sha256sum "$file_path" | awk '{print $1}'
}

get_skill_version() {
    local skill_name="$1"
    sqlite3 "$TEST_DB_PATH" "SELECT version FROM skills WHERE name='$skill_name'"
}

get_skill_hash() {
    local skill_name="$1"
    sqlite3 "$TEST_DB_PATH" "SELECT content_hash FROM skills WHERE name='$skill_name'"
}

get_approval_count() {
    local skill_name="$1"
    local skill_id
    skill_id=$(sqlite3 "$TEST_DB_PATH" "SELECT id FROM skills WHERE name='$skill_name'")
    sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM approval_history WHERE skill_id=$skill_id"
}

#######################################
# Test cases
#######################################

# Test 1: Patch version update (1.0.0 → 1.0.1)
test_patch_version_update() {
    ((TESTS_RUN++))
    log_test "Patch version update (1.0.0 → 1.0.1)"

    local skill_name="test-patch-skill"
    local old_version="1.0.0"
    local new_version="1.0.1"
    local old_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.0.md"
    local new_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.1.md"

    # Setup
    create_test_skill_file "$old_content_path" "# Original Content v1.0.0"
    local old_hash
    old_hash=$(calculate_hash "$old_content_path")

    insert_test_skill "$skill_name" "$old_version" "$old_content_path" "$old_hash"

    # Create updated content
    create_test_skill_file "$new_content_path" "# Fixed Content v1.0.1 - Bug fix applied"

    # Execute propagate script
    if CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "$new_version" \
        "$new_content_path" \
        "patch" \
        "false" 2>&1; then

        # Verify version updated
        local current_version
        current_version=$(get_skill_version "$skill_name")

        if [[ "$current_version" == "$new_version" ]]; then
            log_pass "Version updated from $old_version to $new_version"
        else
            log_fail "Version not updated correctly. Expected: $new_version, Got: $current_version"
            return 1
        fi

        # Verify hash updated
        local new_hash
        new_hash=$(calculate_hash "$new_content_path")
        local stored_hash
        stored_hash=$(get_skill_hash "$skill_name")

        if [[ "$stored_hash" == "$new_hash" ]]; then
            log_pass "Content hash updated correctly"
        else
            log_fail "Content hash mismatch. Expected: $new_hash, Got: $stored_hash"
            return 1
        fi

        # Verify approval history created
        local approval_count
        approval_count=$(get_approval_count "$skill_name")

        if [[ "$approval_count" -ge 1 ]]; then
            log_pass "Approval history record created"
        else
            log_fail "No approval history record created"
            return 1
        fi

        log_pass "Patch version update successful"
    else
        log_fail "Script execution failed"
        return 1
    fi
}

# Test 2: Minor version update (1.0.0 → 1.1.0)
test_minor_version_update() {
    ((TESTS_RUN++))
    log_test "Minor version update (1.0.0 → 1.1.0)"

    local skill_name="test-minor-skill"
    local old_version="1.0.0"
    local new_version="1.1.0"
    local old_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.0.md"
    local new_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.1.0.md"

    # Setup
    create_test_skill_file "$old_content_path" "# Original Content v1.0.0"
    local old_hash
    old_hash=$(calculate_hash "$old_content_path")

    insert_test_skill "$skill_name" "$old_version" "$old_content_path" "$old_hash"

    # Create updated content with new feature
    create_test_skill_file "$new_content_path" "# Enhanced Content v1.1.0 - New feature added"

    # Execute propagate script
    if CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "$new_version" \
        "$new_content_path" \
        "minor" \
        "false" 2>&1; then

        local current_version
        current_version=$(get_skill_version "$skill_name")

        if [[ "$current_version" == "$new_version" ]]; then
            log_pass "Minor version update successful"
        else
            log_fail "Version not updated correctly. Expected: $new_version, Got: $current_version"
            return 1
        fi
    else
        log_fail "Script execution failed"
        return 1
    fi
}

# Test 3: Major version update (1.0.0 → 2.0.0)
test_major_version_update() {
    ((TESTS_RUN++))
    log_test "Major version update (1.0.0 → 2.0.0)"

    local skill_name="test-major-skill"
    local old_version="1.0.0"
    local new_version="2.0.0"
    local old_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.0.md"
    local new_content_path="${TEST_SKILL_DIR}/${skill_name}-v2.0.0.md"

    # Setup
    create_test_skill_file "$old_content_path" "# Original Content v1.0.0"
    local old_hash
    old_hash=$(calculate_hash "$old_content_path")

    insert_test_skill "$skill_name" "$old_version" "$old_content_path" "$old_hash"

    # Create updated content with breaking changes
    create_test_skill_file "$new_content_path" "# Breaking Changes v2.0.0 - Complete rewrite"

    # Execute propagate script
    if CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "$new_version" \
        "$new_content_path" \
        "major" \
        "false" 2>&1; then

        local current_version
        current_version=$(get_skill_version "$skill_name")

        if [[ "$current_version" == "$new_version" ]]; then
            log_pass "Major version update successful"
        else
            log_fail "Version not updated correctly. Expected: $new_version, Got: $current_version"
            return 1
        fi
    else
        log_fail "Script execution failed"
        return 1
    fi
}

# Test 4: Invalid version increment (1.0.0 → 1.0.0)
test_invalid_version_same() {
    ((TESTS_RUN++))
    log_test "Invalid version increment (same version)"

    local skill_name="test-invalid-same"
    local version="1.0.0"
    local content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.0.md"

    # Setup
    create_test_skill_file "$content_path" "# Original Content"
    local hash
    hash=$(calculate_hash "$content_path")

    insert_test_skill "$skill_name" "$version" "$content_path" "$hash"

    # Try to update with same version
    if CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "$version" \
        "$content_path" \
        "patch" \
        "false" 2>&1; then

        log_fail "Script should have failed with same version"
        return 1
    else
        log_pass "Script correctly rejected same version"
    fi
}

# Test 5: Invalid version downgrade (1.1.0 → 1.0.0)
test_invalid_version_downgrade() {
    ((TESTS_RUN++))
    log_test "Invalid version downgrade (1.1.0 → 1.0.0)"

    local skill_name="test-invalid-downgrade"
    local old_version="1.1.0"
    local new_version="1.0.0"
    local old_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.1.0.md"
    local new_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.0.md"

    # Setup
    create_test_skill_file "$old_content_path" "# Content v1.1.0"
    local hash
    hash=$(calculate_hash "$old_content_path")

    insert_test_skill "$skill_name" "$old_version" "$old_content_path" "$hash"
    create_test_skill_file "$new_content_path" "# Content v1.0.0"

    # Try to downgrade version
    if CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "$new_version" \
        "$new_content_path" \
        "patch" \
        "false" 2>&1; then

        log_fail "Script should have failed with version downgrade"
        return 1
    else
        log_pass "Script correctly rejected version downgrade"
    fi
}

# Test 6: Missing file error
test_missing_file() {
    ((TESTS_RUN++))
    log_test "Missing file error handling"

    local skill_name="test-missing-file"
    local version="1.0.0"
    local missing_path="${TEST_SKILL_DIR}/nonexistent-file.md"

    # Try to update with non-existent file
    if CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "1.0.1" \
        "$missing_path" \
        "patch" \
        "false" 2>&1; then

        log_fail "Script should have failed with missing file"
        return 1
    else
        log_pass "Script correctly handled missing file"
    fi
}

# Test 7: Non-existent skill error
test_nonexistent_skill() {
    ((TESTS_RUN++))
    log_test "Non-existent skill error handling"

    local skill_name="nonexistent-skill"
    local content_path="${TEST_SKILL_DIR}/dummy.md"

    create_test_skill_file "$content_path" "# Dummy content"

    # Try to update non-existent skill
    if CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "1.0.1" \
        "$content_path" \
        "patch" \
        "false" 2>&1; then

        log_fail "Script should have failed with non-existent skill"
        return 1
    else
        log_pass "Script correctly handled non-existent skill"
    fi
}

# Test 8: Agent notification listing
test_agent_notification() {
    ((TESTS_RUN++))
    log_test "Agent notification listing"

    local skill_name="test-agent-notify"
    local old_version="1.0.0"
    local new_version="1.0.1"
    local old_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.0.md"
    local new_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.1.md"

    # Setup
    create_test_skill_file "$old_content_path" "# Original Content"
    local old_hash
    old_hash=$(calculate_hash "$old_content_path")

    insert_test_skill "$skill_name" "$old_version" "$old_content_path" "$old_hash"
    insert_agent_mapping "backend-developer" "$skill_name"
    insert_agent_mapping "api-designer" "$skill_name"

    create_test_skill_file "$new_content_path" "# Updated Content"

    # Execute with notifications enabled
    local output
    output=$(CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "$new_version" \
        "$new_content_path" \
        "patch" \
        "true" 2>&1 || true)

    # Check if agents listed
    if echo "$output" | grep -q "backend-developer" && echo "$output" | grep -q "api-designer"; then
        log_pass "Agent notification listing successful"
    else
        log_fail "Agent notification not working. Output: $output"
        return 1
    fi
}

# Test 9: Idempotency - content hash unchanged
test_idempotency_unchanged_hash() {
    ((TESTS_RUN++))
    log_test "Idempotency - unchanged content hash"

    local skill_name="test-idempotent"
    local version="1.0.0"
    local new_version="1.0.1"
    local content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.0.md"

    # Setup with same content
    create_test_skill_file "$content_path" "# Same Content"
    local hash
    hash=$(calculate_hash "$content_path")

    insert_test_skill "$skill_name" "$version" "$content_path" "$hash"

    # Try to update with same content (hash unchanged)
    if CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "$new_version" \
        "$content_path" \
        "patch" \
        "false" 2>&1; then

        # Should either succeed with warning or fail gracefully
        log_pass "Script handled unchanged content hash"
    else
        local exit_code=$?
        if [[ $exit_code -eq 5 ]]; then
            log_pass "Script correctly detected unchanged content (exit code 5)"
        else
            log_fail "Unexpected exit code: $exit_code"
            return 1
        fi
    fi
}

# Test 10: Version type mismatch (major change labeled as patch)
test_version_type_mismatch() {
    ((TESTS_RUN++))
    log_test "Version type mismatch detection"

    local skill_name="test-type-mismatch"
    local old_version="1.0.0"
    local new_version="2.0.0"
    local old_content_path="${TEST_SKILL_DIR}/${skill_name}-v1.0.0.md"
    local new_content_path="${TEST_SKILL_DIR}/${skill_name}-v2.0.0.md"

    # Setup
    create_test_skill_file "$old_content_path" "# Original"
    local hash
    hash=$(calculate_hash "$old_content_path")

    insert_test_skill "$skill_name" "$old_version" "$old_content_path" "$hash"
    create_test_skill_file "$new_content_path" "# Major update"

    # Try major version with 'patch' change type
    if CFN_SKILLS_DB_PATH="$TEST_DB_PATH" bash "$PROPAGATE_SCRIPT" \
        "$skill_name" \
        "$new_version" \
        "$new_content_path" \
        "patch" \
        "false" 2>&1; then

        log_fail "Script should have detected version type mismatch"
        return 1
    else
        log_pass "Script correctly detected version type mismatch"
    fi
}

#######################################
# Main test runner
#######################################
main() {
    echo "========================================"
    echo "Propagate Skill Update - Integration Tests"
    echo "========================================"
    echo ""

    # Check if script exists
    if [[ ! -f "$PROPAGATE_SCRIPT" ]]; then
        log_info "Script not found: $PROPAGATE_SCRIPT"
        log_info "Tests will be skipped until script is implemented"
        exit 0
    fi

    # Setup
    setup_test_db

    # Run tests
    test_patch_version_update || true
    test_minor_version_update || true
    test_major_version_update || true
    test_invalid_version_same || true
    test_invalid_version_downgrade || true
    test_missing_file || true
    test_nonexistent_skill || true
    test_agent_notification || true
    test_idempotency_unchanged_hash || true
    test_version_type_mismatch || true

    # Cleanup
    cleanup_test_db

    # Summary
    echo ""
    echo "========================================"
    echo "Test Summary"
    echo "========================================"
    echo "Total Tests: $TESTS_RUN"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    fi
}

# Run tests
main "$@"
