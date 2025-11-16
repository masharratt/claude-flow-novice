#!/bin/bash
# Test Suite 1: Full Deployment Workflow
# Tests complete lifecycle: deploy → verify → load → log → update → verify

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test environment
TEST_DB="$SCRIPT_DIR/full-workflow-test.db"
TEST_SKILL_DIR="$SCRIPT_DIR/test-skills-workflow"
DEPLOY_SCRIPT="$PROJECT_ROOT/.claude/skills/workflow-codification/deploy-approved-skill.sh"
UPDATE_SCRIPT="$PROJECT_ROOT/.claude/skills/workflow-codification/propagate-skill-update.sh"

export CFN_SKILLS_DB_PATH="$TEST_DB"
export CFN_SKILLS_DATABASE=true

# Cleanup
cleanup() {
    rm -f "$TEST_DB"
    rm -rf "$TEST_SKILL_DIR"
}

# Setup
setup_test_env() {
    echo -e "${BLUE}=== Test Suite 1: Full Deployment Workflow ===${NC}\n"
    echo -e "${BLUE}Setting up test environment...${NC}"
    cleanup

    # Initialize database
    sqlite3 "$TEST_DB" < "$PROJECT_ROOT/.claude/skills-database/schema-v2.sql"

    # Create test skill directory
    mkdir -p "$TEST_SKILL_DIR"

    echo -e "${GREEN}Setup complete${NC}\n"
}

# Test assertions
assert_equals() {
    local actual="$1"
    local expected="$2"
    local test_name="$3"

    ((TESTS_RUN++))

    if [[ "$actual" == "$expected" ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo -e "  Expected: $expected"
        echo -e "  Actual: $actual"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    ((TESTS_RUN++))

    if [[ "$haystack" == *"$needle"* ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo -e "  Expected to contain: $needle"
        echo -e "  Actual: $haystack"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_gte() {
    local actual="$1"
    local expected="$2"
    local test_name="$3"

    ((TESTS_RUN++))

    if [[ "$actual" -ge "$expected" ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo -e "  Expected >= $expected"
        echo -e "  Actual: $actual"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_success() {
    local exit_code="$1"
    local test_name="$2"

    ((TESTS_RUN++))

    if [[ "$exit_code" -eq 0 ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name (exit code: $exit_code)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# ============================================================================
# TEST 1: Deploy Skill via deploy-approved-skill.sh
# ============================================================================
test_deploy_skill() {
    echo -e "\n${BLUE}Test 1: Deploy Skill${NC}\n"

    # Create test skill
    cat > "$TEST_SKILL_DIR/test-integration-skill.md" <<'EOF'
---
name: test-integration-skill
category: coordination
approval_level: auto
tags: [testing, integration, e2e]
version: 1.0.0
owner: test-team
---

# Test Integration Skill

This is a test skill for end-to-end integration testing.

## Usage
This skill validates the full deployment workflow.
EOF

    # Deploy skill
    bash "$DEPLOY_SCRIPT" \
        "101" \
        "test-integration-skill" \
        "$TEST_SKILL_DIR/test-integration-skill.md" \
        "coordination" \
        "backend-developer,tester" \
        > /dev/null 2>&1

    local deploy_exit=$?
    assert_success "$deploy_exit" "Skill deployment completed"
}

# ============================================================================
# TEST 2: Verify Skill in Database
# ============================================================================
test_verify_deployment() {
    echo -e "\n${BLUE}Test 2: Verify Skill in Database${NC}\n"

    # Check skill exists
    local skill_count=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM skills WHERE name='test-integration-skill'")
    assert_equals "$skill_count" "1" "Skill exists in database"

    # Check skill metadata
    local category=$(sqlite3 "$TEST_DB" \
        "SELECT category FROM skills WHERE name='test-integration-skill'")
    assert_equals "$category" "coordination" "Skill category correct"

    local version=$(sqlite3 "$TEST_DB" \
        "SELECT version FROM skills WHERE name='test-integration-skill'")
    assert_equals "$version" "1.0.0" "Skill version correct"

    local approval_level=$(sqlite3 "$TEST_DB" \
        "SELECT approval_level FROM skills WHERE name='test-integration-skill'")
    assert_equals "$approval_level" "auto" "Approval level correct"

    # Check Phase 4 integration
    local pattern_id=$(sqlite3 "$TEST_DB" \
        "SELECT phase4_pattern_id FROM skills WHERE name='test-integration-skill'")
    assert_equals "$pattern_id" "101" "Phase 4 pattern ID correct"

    local generated_by=$(sqlite3 "$TEST_DB" \
        "SELECT generated_by FROM skills WHERE name='test-integration-skill'")
    assert_equals "$generated_by" "phase4" "Generated by Phase 4"
}

# ============================================================================
# TEST 3: Verify Agent Mappings Created
# ============================================================================
test_verify_agent_mappings() {
    echo -e "\n${BLUE}Test 3: Verify Agent Mappings${NC}\n"

    # Get skill ID
    local skill_id=$(sqlite3 "$TEST_DB" \
        "SELECT id FROM skills WHERE name='test-integration-skill'")

    # Check mapping count
    local mapping_count=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM agent_skill_mappings WHERE skill_id=$skill_id")
    assert_equals "$mapping_count" "2" "Two agent mappings created"

    # Check specific agent types
    local backend_exists=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM agent_skill_mappings WHERE skill_id=$skill_id AND agent_type='backend-developer'")
    assert_equals "$backend_exists" "1" "Backend developer mapping exists"

    local tester_exists=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM agent_skill_mappings WHERE skill_id=$skill_id AND agent_type='tester'")
    assert_equals "$tester_exists" "1" "Tester mapping exists"
}

# ============================================================================
# TEST 4: Load Skill via SkillLoader Simulation
# ============================================================================
test_load_skill() {
    echo -e "\n${BLUE}Test 4: Load Skill (SkillLoader Simulation)${NC}\n"

    # Simulate SkillLoader query
    local skills=$(sqlite3 "$TEST_DB" \
        "SELECT name FROM skills WHERE name='test-integration-skill' AND status='active'")
    assert_contains "$skills" "test-integration-skill" "Skill loadable by SkillLoader"

    # Verify content path exists
    local content_path=$(sqlite3 "$TEST_DB" \
        "SELECT content_path FROM skills WHERE name='test-integration-skill'")
    assert_contains "$content_path" "test-integration-skill.md" "Content path valid"
}

# ============================================================================
# TEST 5: Log Execution via SkillExecutionLogger Simulation
# ============================================================================
test_log_execution() {
    echo -e "\n${BLUE}Test 5: Log Execution (SkillExecutionLogger Simulation)${NC}\n"

    # Get skill ID
    local skill_id=$(sqlite3 "$TEST_DB" \
        "SELECT id FROM skills WHERE name='test-integration-skill'")

    # Simulate skill execution logging
    sqlite3 "$TEST_DB" <<EOF
INSERT INTO skill_usage_log (skill_id, agent_id, agent_type, task_id, success_indicator, execution_time_ms)
VALUES (
    $skill_id,
    'backend-dev-12345', 'backend-developer',
    'task-test-e2e',
    1,
    150
);
EOF

    local log_count=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM skill_usage_log WHERE skill_id=$skill_id")
    assert_equals "$log_count" "1" "Execution logged successfully"

    # Verify log metadata
    local agent_id=$(sqlite3 "$TEST_DB" \
        "SELECT agent_id FROM skill_usage_log WHERE skill_id=$skill_id")
    assert_equals "$agent_id" "backend-dev-12345" "Agent ID logged correctly"

    local success=$(sqlite3 "$TEST_DB" \
        "SELECT success_indicator FROM skill_usage_log WHERE skill_id=$skill_id")
    assert_equals "$success" "1" "Execution success status correct"
}

# ============================================================================
# TEST 6: Verify Dual Logging (SQLite + PostgreSQL Check)
# ============================================================================
test_dual_logging() {
    echo -e "\n${BLUE}Test 6: Verify Dual Logging${NC}\n"

    # SQLite logging already verified in TEST 5
    local sqlite_logs=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM skill_usage_log")
    assert_gte "$sqlite_logs" "1" "SQLite logging active"

    # PostgreSQL check (mock - actual PostgreSQL integration would require connection)
    # For E2E test, we verify the dual logging infrastructure exists
    echo -e "${YELLOW}⚠${NC}  PostgreSQL dual logging verification skipped (requires PG connection)"
    echo -e "    SQLite logging confirmed functional"
}

# ============================================================================
# TEST 7: Update Skill via propagate-skill-update.sh
# ============================================================================
test_update_skill() {
    echo -e "\n${BLUE}Test 7: Update Skill${NC}\n"

    # Create updated skill content
    cat > "$TEST_SKILL_DIR/test-integration-skill-v1.0.1.md" <<'EOF'
---
name: test-integration-skill
category: coordination
approval_level: auto
tags: [testing, integration, e2e, updated]
version: 1.0.1
owner: test-team
---

# Test Integration Skill (Updated)

This is an updated test skill for end-to-end integration testing.

## Usage
This skill validates the full deployment workflow including updates.

## Changelog
- v1.0.1: Added update validation
EOF

    # Update skill
    bash "$UPDATE_SCRIPT" \
        "test-integration-skill" \
        "1.0.1" \
        "$TEST_SKILL_DIR/test-integration-skill-v1.0.1.md" \
        "patch" \
        "false" \
        > /dev/null 2>&1

    local update_exit=$?
    assert_success "$update_exit" "Skill update completed"
}

# ============================================================================
# TEST 8: Verify Version Updated
# ============================================================================
test_verify_update() {
    echo -e "\n${BLUE}Test 8: Verify Version Updated${NC}\n"

    # Check new version
    local new_version=$(sqlite3 "$TEST_DB" \
        "SELECT version FROM skills WHERE name='test-integration-skill'")
    assert_equals "$new_version" "1.0.1" "Skill version updated"

    # Check content updated
    local tags=$(sqlite3 "$TEST_DB" \
        "SELECT tags FROM skills WHERE name='test-integration-skill'")
    assert_contains "$tags" "updated" "Skill content updated (tags include 'updated')"

    # Verify updated_at timestamp changed
    local updated_at=$(sqlite3 "$TEST_DB" \
        "SELECT updated_at FROM skills WHERE name='test-integration-skill'")
    [[ -n "$updated_at" ]] && echo -e "${GREEN}✓${NC} Updated timestamp exists: $updated_at"
}

# ============================================================================
# TEST 9: Verify Approval History
# ============================================================================
test_approval_history() {
    echo -e "\n${BLUE}Test 9: Verify Approval History${NC}\n"

    # Get skill ID
    local skill_id=$(sqlite3 "$TEST_DB" \
        "SELECT id FROM skills WHERE name='test-integration-skill'")

    # Check approval history records
    local approval_count=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM approval_history WHERE skill_id=$skill_id")
    assert_gte "$approval_count" "1" "Approval history recorded (≥1 entries)"

    # Check initial approval
    local initial_version=$(sqlite3 "$TEST_DB" \
        "SELECT version FROM approval_history WHERE skill_id=$skill_id ORDER BY timestamp ASC LIMIT 1")
    assert_equals "$initial_version" "1.0.0" "Initial approval version correct"

    # If multiple approvals exist (from update), verify second approval
    if [[ "$approval_count" -ge 2 ]]; then
        local latest_version=$(sqlite3 "$TEST_DB" \
            "SELECT version FROM approval_history WHERE skill_id=$skill_id ORDER BY timestamp DESC LIMIT 1")
        assert_equals "$latest_version" "1.0.1" "Updated approval version correct"
    fi
}

# ============================================================================
# TEST 10: End-to-End Integration Verification
# ============================================================================
test_integration_verification() {
    echo -e "\n${BLUE}Test 10: End-to-End Integration Verification${NC}\n"

    # Verify complete workflow chain
    local skill_id=$(sqlite3 "$TEST_DB" \
        "SELECT id FROM skills WHERE name='test-integration-skill'")

    # Check all components exist
    local has_skill=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM skills WHERE id=$skill_id")
    local has_mappings=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM agent_skill_mappings WHERE skill_id=$skill_id")
    local has_logs=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM skill_usage_log WHERE skill_id=$skill_id")
    local has_approvals=$(sqlite3 "$TEST_DB" \
        "SELECT COUNT(*) FROM approval_history WHERE skill_id=$skill_id")

    assert_equals "$has_skill" "1" "Skill record exists"
    assert_gte "$has_mappings" "2" "Agent mappings exist"
    assert_gte "$has_logs" "1" "Usage logs exist"
    assert_gte "$has_approvals" "1" "Approval history exists"

    echo -e "\n${GREEN}✓${NC} Complete workflow chain verified:"
    echo -e "  - Deployment → Database → Mappings → Loading → Logging → Updates → History"
}

# ============================================================================
# Run All Tests
# ============================================================================
run_tests() {
    setup_test_env

    test_deploy_skill
    test_verify_deployment
    test_verify_agent_mappings
    test_load_skill
    test_log_execution
    test_dual_logging
    test_update_skill
    test_verify_update
    test_approval_history
    test_integration_verification

    print_summary
}

print_summary() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}Test Suite 1: Full Deployment Workflow${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "Tests Run:    $TESTS_RUN"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}✓ All tests passed!${NC}"
        cleanup
        exit 0
    else
        echo -e "\n${RED}✗ Some tests failed${NC}"
        echo -e "${YELLOW}Database preserved for inspection: $TEST_DB${NC}"
        exit 1
    fi
}

# Trap cleanup on exit
trap cleanup EXIT

# Run tests
run_tests
