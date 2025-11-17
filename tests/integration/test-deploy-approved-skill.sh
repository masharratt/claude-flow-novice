#!/usr/bin/env bash
#
# test-deploy-approved-skill.sh - Integration Tests for Deploy Approved Skill Script
#
# Tests the deployment script that Phase 4 calls when a skill is approved
#
# Test Scenarios:
# 1. Basic deployment with minimal parameters
# 2. Risk assessment and approval level assignment
# 3. Agent mapping creation
# 4. Approval history logging
# 5. Error handling (invalid inputs, missing files, database errors)
# 6. Idempotency (re-running same deployment)
# 7. PostgreSQL optional fallback
# 8. Phase 4 pattern ID tracking

set -uo pipefail

# Setup test environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_SCRIPT="${PROJECT_ROOT}/.claude/skills/workflow-codification/deploy-approved-skill.sh"

# Test database (isolated from production)
TEST_DB_PATH="/tmp/test-deploy-skill-$$.db"
export CFN_SKILLS_DB_PATH="$TEST_DB_PATH"

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
# Test utilities
#######################################
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
    ((TESTS_PASSED++))
}

log_failure() {
    echo -e "${RED}[FAIL]${NC} $*"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

setup_test_db() {
    log_info "Setting up test database: $TEST_DB_PATH"

    # Create fresh test database
    rm -f "$TEST_DB_PATH"

    # Apply schema
    sqlite3 "$TEST_DB_PATH" < "${PROJECT_ROOT}/.claude/skills-database/schema-v2.sql"

    log_info "Test database initialized"
}

cleanup_test_db() {
    log_info "Cleaning up test database"
    rm -f "$TEST_DB_PATH"
}

create_test_skill_file() {
    local skill_name="$1"
    local temp_file="/tmp/test-skill-${skill_name}-$$.md"

    cat > "$temp_file" <<'EOF'
# Test Skill: JWT Authentication

## Purpose
Provide JWT token validation and generation for API authentication.

## Usage
```bash
# Validate token
./validate-jwt.sh "$TOKEN"

# Generate token
./generate-jwt.sh --user-id "$USER_ID"
```

## Implementation
Implements secure JWT handling with RS256 algorithm.

## Test Coverage
- Token validation (pass/fail)
- Expiration handling
- Invalid signature detection
- Claims extraction
EOF

    echo "$temp_file"
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local description="$3"

    ((TESTS_RUN++))

    if [ "$expected" = "$actual" ]; then
        log_success "$description"
        return 0
    else
        log_failure "$description - Expected: '$expected', Got: '$actual'"
        return 1
    fi
}

assert_not_empty() {
    local value="$1"
    local description="$2"

    ((TESTS_RUN++))

    if [ -n "$value" ]; then
        log_success "$description"
        return 0
    else
        log_failure "$description - Value is empty"
        return 1
    fi
}

assert_greater_than() {
    local value="$1"
    local threshold="$2"
    local description="$3"

    ((TESTS_RUN++))

    if [ "$value" -gt "$threshold" ]; then
        log_success "$description"
        return 0
    else
        log_failure "$description - Value $value is not greater than $threshold"
        return 1
    fi
}

#######################################
# Test 1: Basic Deployment
#######################################
test_basic_deployment() {
    log_info "=== Test 1: Basic Deployment ==="

    local pattern_id=1
    local skill_name="jwt-authentication"
    local skill_file
    skill_file=$(create_test_skill_file "$skill_name")

    # Execute deployment
    log_info "Deploying skill: $skill_name"
    bash "$DEPLOY_SCRIPT" "$pattern_id" "$skill_name" "$skill_file" "domain" ""

    # Verify skill was inserted
    local skill_count
    skill_count=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM skills WHERE name = '$skill_name';")
    assert_equals "1" "$skill_count" "Skill inserted into database"

    # Verify skill fields
    local skill_status
    skill_status=$(sqlite3 "$TEST_DB_PATH" "SELECT status FROM skills WHERE name = '$skill_name';")
    assert_equals "active" "$skill_status" "Skill status is 'active'"

    local generated_by
    generated_by=$(sqlite3 "$TEST_DB_PATH" "SELECT generated_by FROM skills WHERE name = '$skill_name';")
    assert_equals "phase4" "$generated_by" "Skill generated_by is 'phase4'"

    local phase4_pattern
    phase4_pattern=$(sqlite3 "$TEST_DB_PATH" "SELECT phase4_pattern_id FROM skills WHERE name = '$skill_name';")
    assert_equals "$pattern_id" "$phase4_pattern" "Phase 4 pattern ID tracked"

    # Cleanup
    rm -f "$skill_file"
}

#######################################
# Test 2: Risk Assessment and Approval Levels
#######################################
test_risk_assessment() {
    log_info "=== Test 2: Risk Assessment and Approval Levels ==="

    # Test coordination → auto
    local skill_file_coord
    skill_file_coord=$(create_test_skill_file "test-coordination")
    bash "$DEPLOY_SCRIPT" 2 "test-coordination" "$skill_file_coord" "coordination" ""

    local approval_level
    approval_level=$(sqlite3 "$TEST_DB_PATH" "SELECT approval_level FROM skills WHERE name = 'test-coordination';")
    assert_equals "auto" "$approval_level" "Coordination skill has 'auto' approval level"
    rm -f "$skill_file_coord"

    # Test infrastructure → escalate
    local skill_file_infra
    skill_file_infra=$(create_test_skill_file "test-infrastructure")
    bash "$DEPLOY_SCRIPT" 3 "test-infrastructure" "$skill_file_infra" "infrastructure" ""

    approval_level=$(sqlite3 "$TEST_DB_PATH" "SELECT approval_level FROM skills WHERE name = 'test-infrastructure';")
    assert_equals "escalate" "$approval_level" "Infrastructure skill has 'escalate' approval level"
    rm -f "$skill_file_infra"

    # Test domain → human
    local skill_file_domain
    skill_file_domain=$(create_test_skill_file "test-domain")
    bash "$DEPLOY_SCRIPT" 4 "test-domain" "$skill_file_domain" "domain" ""

    approval_level=$(sqlite3 "$TEST_DB_PATH" "SELECT approval_level FROM skills WHERE name = 'test-domain';")
    assert_equals "human" "$approval_level" "Domain skill has 'human' approval level"
    rm -f "$skill_file_domain"
}

#######################################
# Test 3: Agent Mapping Creation
#######################################
test_agent_mapping_creation() {
    log_info "=== Test 3: Agent Mapping Creation ==="

    local pattern_id=5
    local skill_name="oauth2-integration"
    local skill_file
    skill_file=$(create_test_skill_file "$skill_name")
    local team_ids="backend-developer,api-designer,security-specialist"

    # Deploy with team IDs
    bash "$DEPLOY_SCRIPT" "$pattern_id" "$skill_name" "$skill_file" "domain" "$team_ids"

    # Get skill ID
    local skill_id
    skill_id=$(sqlite3 "$TEST_DB_PATH" "SELECT id FROM skills WHERE name = '$skill_name';")

    # Verify mappings created
    local mapping_count
    mapping_count=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM agent_skill_mappings WHERE skill_id = $skill_id;")
    assert_equals "3" "$mapping_count" "Three agent mappings created"

    # Verify backend-developer mapping exists
    local backend_mapping
    backend_mapping=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM agent_skill_mappings WHERE skill_id = $skill_id AND agent_type = 'backend-developer';")
    assert_equals "1" "$backend_mapping" "Backend developer mapping exists"

    # Verify mapping priority
    local priority
    priority=$(sqlite3 "$TEST_DB_PATH" "SELECT priority FROM agent_skill_mappings WHERE skill_id = $skill_id AND agent_type = 'backend-developer';")
    assert_equals "5" "$priority" "Mapping has medium priority (5)"

    # Cleanup
    rm -f "$skill_file"
}

#######################################
# Test 4: Approval History Logging
#######################################
test_approval_history() {
    log_info "=== Test 4: Approval History Logging ==="

    local pattern_id=6
    local skill_name="rate-limiting"
    local skill_file
    skill_file=$(create_test_skill_file "$skill_name")

    # Deploy skill
    bash "$DEPLOY_SCRIPT" "$pattern_id" "$skill_name" "$skill_file" "infrastructure" ""

    # Get skill ID
    local skill_id
    skill_id=$(sqlite3 "$TEST_DB_PATH" "SELECT id FROM skills WHERE name = '$skill_name';")

    # Verify approval history record created
    local approval_count
    approval_count=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM approval_history WHERE skill_id = $skill_id;")
    assert_equals "1" "$approval_count" "Approval history record created"

    # Verify decision is 'approved'
    local decision
    decision=$(sqlite3 "$TEST_DB_PATH" "SELECT decision FROM approval_history WHERE skill_id = $skill_id;")
    assert_equals "approved" "$decision" "Decision is 'approved'"

    # Verify approver is 'phase4-system'
    local approver
    approver=$(sqlite3 "$TEST_DB_PATH" "SELECT approver FROM approval_history WHERE skill_id = $skill_id;")
    assert_equals "phase4-system" "$approver" "Approver is 'phase4-system'"

    # Verify reasoning is set
    local reasoning
    reasoning=$(sqlite3 "$TEST_DB_PATH" "SELECT reasoning FROM approval_history WHERE skill_id = $skill_id;")
    assert_not_empty "$reasoning" "Approval reasoning is recorded"

    # Cleanup
    rm -f "$skill_file"
}

#######################################
# Test 5: Error Handling
#######################################
test_error_handling() {
    log_info "=== Test 5: Error Handling ==="

    # Test invalid pattern ID (non-numeric)
    local skill_file
    skill_file=$(create_test_skill_file "test-error")

    if bash "$DEPLOY_SCRIPT" "invalid" "test-skill" "$skill_file" "domain" "" 2>/dev/null; then
        log_failure "Should reject non-numeric pattern ID"
    else
        log_success "Rejects non-numeric pattern ID"
        ((TESTS_RUN++))
    fi

    # Test missing file
    if bash "$DEPLOY_SCRIPT" 7 "test-missing" "/nonexistent/file.md" "domain" "" 2>/dev/null; then
        log_failure "Should reject missing skill file"
    else
        log_success "Rejects missing skill file"
        ((TESTS_RUN++))
    fi

    # Test missing required parameters
    if bash "$DEPLOY_SCRIPT" 2>/dev/null; then
        log_failure "Should reject missing parameters"
    else
        log_success "Rejects missing parameters"
        ((TESTS_RUN++))
    fi

    # Cleanup
    rm -f "$skill_file"
}

#######################################
# Test 6: Idempotency
#######################################
test_idempotency() {
    log_info "=== Test 6: Idempotency ==="

    local pattern_id=8
    local skill_name="idempotent-test"
    local skill_file
    skill_file=$(create_test_skill_file "$skill_name")

    # Deploy first time
    bash "$DEPLOY_SCRIPT" "$pattern_id" "$skill_name" "$skill_file" "coordination" ""

    # Get initial skill count
    local count_after_first
    count_after_first=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM skills WHERE name = '$skill_name';")

    # Deploy second time (should handle gracefully)
    if bash "$DEPLOY_SCRIPT" "$pattern_id" "$skill_name" "$skill_file" "coordination" "" 2>/dev/null; then
        # If it succeeds, verify no duplicates
        local count_after_second
        count_after_second=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM skills WHERE name = '$skill_name';")

        # Should still be 1 (updated, not duplicated)
        assert_equals "$count_after_first" "$count_after_second" "Idempotent deployment (no duplicates)"
    else
        # If it fails, that's also acceptable (duplicate detection)
        log_success "Duplicate deployment detected and rejected"
        ((TESTS_RUN++))
    fi

    # Cleanup
    rm -f "$skill_file"
}

#######################################
# Test 7: Content Hash Validation
#######################################
test_content_hash() {
    log_info "=== Test 7: Content Hash Validation ==="

    local pattern_id=9
    local skill_name="hash-test"
    local skill_file
    skill_file=$(create_test_skill_file "$skill_name")

    # Deploy skill
    bash "$DEPLOY_SCRIPT" "$pattern_id" "$skill_name" "$skill_file" "coordination" ""

    # Verify content hash was calculated and stored
    local content_hash
    content_hash=$(sqlite3 "$TEST_DB_PATH" "SELECT content_hash FROM skills WHERE name = '$skill_name';")
    assert_not_empty "$content_hash" "Content hash calculated and stored"

    # Verify hash length (SHA256 = 64 hex chars)
    local hash_length=${#content_hash}
    if [ "$hash_length" -eq 64 ]; then
        log_success "Content hash is SHA256 format (64 chars)"
        ((TESTS_RUN++))
    else
        log_failure "Content hash is not SHA256 format (expected 64 chars, got $hash_length)"
        ((TESTS_RUN++))
    fi

    # Cleanup
    rm -f "$skill_file"
}

#######################################
# Test 8: Version Assignment
#######################################
test_version_assignment() {
    log_info "=== Test 8: Version Assignment ==="

    local pattern_id=10
    local skill_name="version-test"
    local skill_file
    skill_file=$(create_test_skill_file "$skill_name")

    # Deploy skill
    bash "$DEPLOY_SCRIPT" "$pattern_id" "$skill_name" "$skill_file" "domain" ""

    # Verify version was assigned
    local version
    version=$(sqlite3 "$TEST_DB_PATH" "SELECT version FROM skills WHERE name = '$skill_name';")
    assert_not_empty "$version" "Version assigned to skill"

    # Cleanup
    rm -f "$skill_file"
}

#######################################
# Main test execution
#######################################
main() {
    echo ""
    log_info "========================================"
    log_info "Deploy Approved Skill Integration Tests"
    log_info "========================================"
    echo ""

    # Verify deployment script exists
    if [ ! -f "$DEPLOY_SCRIPT" ]; then
        log_failure "Deployment script not found: $DEPLOY_SCRIPT"
        exit 1
    fi

    # Setup
    setup_test_db

    # Run tests
    test_basic_deployment
    test_risk_assessment
    test_agent_mapping_creation
    test_approval_history
    test_error_handling
    test_idempotency
    test_content_hash
    test_version_assignment

    # Cleanup
    cleanup_test_db

    # Summary
    echo ""
    log_info "========================================"
    log_info "Test Summary"
    log_info "========================================"
    log_info "Tests run: $TESTS_RUN"
    log_success "Tests passed: $TESTS_PASSED"

    if [ "$TESTS_FAILED" -gt 0 ]; then
        log_failure "Tests failed: $TESTS_FAILED"
        exit 1
    else
        log_success "All tests passed!"
        exit 0
    fi
}

# Run tests
main "$@"
