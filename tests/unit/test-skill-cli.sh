#!/bin/bash
# Skills Database CLI Integration Test Suite
# Tests Phase 4 CLI implementation

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test database setup
TEST_DB="$SCRIPT_DIR/test-cli-skills.db"
TEST_SKILLS_DIR="$SCRIPT_DIR/test-cli-skills"
CLI_SCRIPT="$PROJECT_ROOT/src/cli/skill-cli.ts"

# Set environment variable for CLI
export CFN_SKILLS_DB_PATH="$TEST_DB"

# Cleanup function
cleanup() {
    rm -f "$TEST_DB"
    rm -rf "$TEST_SKILLS_DIR"
}

# Setup test environment
setup_test_env() {
    echo "Setting up test environment..."
    cleanup

    # Create test database with all required tables
    sqlite3 "$TEST_DB" <<'EOF'
CREATE TABLE skills (
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
  owner TEXT,
  deprecation_note TEXT,
  replacement_id INTEGER,
  phase4_pattern_id INTEGER,
  generated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (replacement_id) REFERENCES skills(id)
);

CREATE TABLE agent_skill_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL,
  skill_id INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  required BOOLEAN NOT NULL DEFAULT 0,
  conditions TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  UNIQUE(agent_type, skill_id)
);

CREATE TABLE skill_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  skill_id INTEGER NOT NULL,
  task_id TEXT,
  phase TEXT,
  loaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  confidence_before REAL,
  confidence_after REAL,
  execution_time_ms INTEGER,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  approval_level TEXT NOT NULL,
  approver TEXT,
  decision TEXT NOT NULL,
  reasoning TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE bootstrap_skills (
  skill_name TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  load_order INTEGER NOT NULL,
  description TEXT NOT NULL
);

-- Seed test skills
INSERT INTO skills (name, category, team, content_path, content_hash, tags, version, status, approval_level, owner, generated_by)
VALUES
  ('test-skill-1', 'domain', 'backend', './test.md', 'hash1', '["test"]', '1.0.0', 'active', 'auto', 'test-team', 'manual'),
  ('test-skill-2', 'coordination', 'cfn', './test2.md', 'hash2', '["test","coordination"]', '1.0.0', 'active', 'human', 'cfn-core', 'manual'),
  ('test-skill-3', 'infrastructure', 'devops', './test3.md', 'hash3', '["test","infra"]', '1.0.0', 'active', 'escalate', 'devops-team', 'manual');

-- Create agent mapping
INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required)
VALUES ('backend-developer', 1, 3, 0);

-- Add approval for auto skill
INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, reasoning)
VALUES (1, '1.0.0', 'auto', 'system', 'approved', 'Auto-approved');

-- Add usage logs
INSERT INTO skill_usage_log (agent_id, agent_type, skill_id, task_id, phase, confidence_before, confidence_after, execution_time_ms)
VALUES
  ('backend-1', 'backend-developer', 1, 'task-1', 'loop3', 0.70, 0.85, 10),
  ('backend-2', 'backend-developer', 1, 'task-2', 'loop3', 0.75, 0.88, 12);
EOF

    # Create test skill directory
    mkdir -p "$TEST_SKILLS_DIR"
    cat > "$TEST_SKILLS_DIR/new-skill.md" <<'EOF'
# New Test Skill

This is a test skill for CLI testing.
EOF

    echo "Test environment setup complete."
}

# Test helper functions
assert_equal() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    ((TESTS_RUN++))

    if [[ "$expected" == "$actual" ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
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
        echo "  Expected to contain: $needle"
        echo "  Haystack: ${haystack:0:200}..."
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    ((TESTS_RUN++))

    if [[ "$haystack" != *"$needle"* ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected NOT to contain: $needle"
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
        echo -e "${RED}✗${NC} $test_name"
        echo "  Command failed with exit code: $exit_code"
        ((TESTS_FAILED++))
        return 1
    fi
}

# ============================================================================
# Test Suite: List Command
# ============================================================================

test_list_command() {
    echo ""
    echo "=== Test Suite: List Command ==="

    # Test 1: List all skills
    local output
    output=$(npx tsx "$CLI_SCRIPT" list 2>&1)
    assert_contains "$output" "test-skill-1" "List command shows all skills"

    # Test 2: Filter by approval level
    output=$(npx tsx "$CLI_SCRIPT" list --approval=auto 2>&1)
    assert_contains "$output" "test-skill-1" "List filters by approval=auto"
    assert_not_contains "$output" "test-skill-2" "List excludes non-auto skills when filtered"

    # Test 3: Filter by category
    output=$(npx tsx "$CLI_SCRIPT" list --category=coordination 2>&1)
    assert_contains "$output" "test-skill-2" "List filters by category"

    # Test 4: Pending approvals
    output=$(npx tsx "$CLI_SCRIPT" list --pending-approval 2>&1)
    assert_contains "$output" "test-skill-2\|test-skill-3" "List shows pending approvals"
}

# ============================================================================
# Test Suite: Assign Command
# ============================================================================

test_assign_command() {
    echo ""
    echo "=== Test Suite: Assign Command ==="

    # Test 1: Assign skill to agent
    npx tsx "$CLI_SCRIPT" assign --agent=tester --skill=test-skill-2 --priority=2 > /dev/null 2>&1
    local exit_code=$?
    assert_success $exit_code "Assign command executes successfully"

    # Test 2: Verify mapping in database
    local mapping_exists
    mapping_exists=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM agent_skill_mappings WHERE agent_type='tester' AND skill_id=2;")
    assert_equal "1" "$mapping_exists" "Mapping created in database"

    # Test 3: Verify priority
    local priority
    priority=$(sqlite3 "$TEST_DB" "SELECT priority FROM agent_skill_mappings WHERE agent_type='tester' AND skill_id=2;")
    assert_equal "2" "$priority" "Priority set correctly"
}

# ============================================================================
# Test Suite: Create Command
# ============================================================================

test_create_command() {
    echo ""
    echo "=== Test Suite: Create Command ==="

    # Test 1: Create new skill
    npx tsx "$CLI_SCRIPT" create \
        --name=cli-test-skill \
        --category=testing \
        --team=test \
        --content-path="$TEST_SKILLS_DIR/new-skill.md" \
        --tags=test,cli \
        --version=1.0.0 \
        --approval-level=auto \
        --owner=test-team > /dev/null 2>&1
    local exit_code=$?
    assert_success $exit_code "Create command executes successfully"

    # Test 2: Verify skill in database
    local skill_exists
    skill_exists=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name='cli-test-skill';")
    assert_equal "1" "$skill_exists" "New skill created in database"

    # Test 3: Verify approval level
    local approval_level
    approval_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE name='cli-test-skill';")
    assert_equal "auto" "$approval_level" "Approval level set correctly"
}

# ============================================================================
# Test Suite: Update Command
# ============================================================================

test_update_command() {
    echo ""
    echo "=== Test Suite: Update Command ==="

    # Test 1: Update skill version
    npx tsx "$CLI_SCRIPT" update --skill=test-skill-1 --version=2.0.0 > /dev/null 2>&1
    local exit_code=$?
    assert_success $exit_code "Update command executes successfully"

    # Test 2: Verify version updated
    local new_version
    new_version=$(sqlite3 "$TEST_DB" "SELECT version FROM skills WHERE name='test-skill-1';")
    assert_equal "2.0.0" "$new_version" "Version updated correctly"

    # Test 3: Update tags
    npx tsx "$CLI_SCRIPT" update --skill=test-skill-1 --tags=updated,test > /dev/null 2>&1
    local tags
    tags=$(sqlite3 "$TEST_DB" "SELECT tags FROM skills WHERE name='test-skill-1';")
    assert_contains "$tags" "updated" "Tags updated correctly"
}

# ============================================================================
# Test Suite: Approve Command
# ============================================================================

test_approve_command() {
    echo ""
    echo "=== Test Suite: Approve Command ==="

    # Test 1: Approve skill
    npx tsx "$CLI_SCRIPT" approve \
        --skill=test-skill-2 \
        --decision=approved \
        --approver=expert@test.com \
        --reasoning="Test approval" > /dev/null 2>&1
    local exit_code=$?
    assert_success $exit_code "Approve command executes successfully"

    # Test 2: Verify approval history
    local approval_count
    approval_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history WHERE skill_id=2 AND decision='approved';")
    assert_equal "1" "$approval_count" "Approval recorded in history"

    # Test 3: Verify approver
    local approver
    approver=$(sqlite3 "$TEST_DB" "SELECT approver FROM approval_history WHERE skill_id=2 AND decision='approved';")
    assert_equal "expert@test.com" "$approver" "Approver recorded correctly"
}

# ============================================================================
# Test Suite: Escalate Command
# ============================================================================

test_escalate_command() {
    echo ""
    echo "=== Test Suite: Escalate Command ==="

    # Test 1: Escalate skill
    npx tsx "$CLI_SCRIPT" escalate \
        --skill=test-skill-1 \
        --reason="Security review needed" > /dev/null 2>&1
    local exit_code=$?
    assert_success $exit_code "Escalate command executes successfully"

    # Test 2: Verify approval level changed
    local new_level
    new_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE name='test-skill-1';")
    assert_equal "escalate" "$new_level" "Approval level escalated"

    # Test 3: Verify escalation recorded
    local escalation_count
    escalation_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history WHERE skill_id=1 AND decision='escalated';")
    assert_equal "1" "$escalation_count" "Escalation recorded in history"
}

# ============================================================================
# Test Suite: Pending Command
# ============================================================================

test_pending_command() {
    echo ""
    echo "=== Test Suite: Pending Command ==="

    # Test 1: List all pending
    local output
    output=$(npx tsx "$CLI_SCRIPT" pending 2>&1)
    assert_contains "$output" "Pending:\|No pending" "Pending command executes"

    # Test 2: Filter by approval level
    output=$(npx tsx "$CLI_SCRIPT" pending --approval-level=human 2>&1)
    local exit_code=$?
    assert_success $exit_code "Pending with filter executes successfully"
}

# ============================================================================
# Test Suite: Approval Status Command
# ============================================================================

test_approval_status_command() {
    echo ""
    echo "=== Test Suite: Approval Status Command ==="

    # Test 1: Check approval status
    local output
    output=$(npx tsx "$CLI_SCRIPT" approval-status --skill=test-skill-1 2>&1)
    assert_contains "$output" "Approval Status" "Approval status shows header"
    assert_contains "$output" "Approval Level" "Approval status shows level"
}

# ============================================================================
# Test Suite: Deprecate Command
# ============================================================================

test_deprecate_command() {
    echo ""
    echo "=== Test Suite: Deprecate Command ==="

    # Test 1: Deprecate skill
    npx tsx "$CLI_SCRIPT" deprecate \
        --skill=test-skill-3 \
        --replacement=test-skill-1 \
        --note="Replaced by v2" > /dev/null 2>&1
    local exit_code=$?
    assert_success $exit_code "Deprecate command executes successfully"

    # Test 2: Verify status changed
    local status
    status=$(sqlite3 "$TEST_DB" "SELECT status FROM skills WHERE name='test-skill-3';")
    assert_equal "deprecated" "$status" "Status changed to deprecated"

    # Test 3: Verify deprecation note
    local note
    note=$(sqlite3 "$TEST_DB" "SELECT deprecation_note FROM skills WHERE name='test-skill-3';")
    assert_equal "Replaced by v2" "$note" "Deprecation note recorded"
}

# ============================================================================
# Test Suite: Analytics Commands
# ============================================================================

test_analytics_commands() {
    echo ""
    echo "=== Test Suite: Analytics Commands ==="

    # Test 1: Effectiveness analytics
    local output
    output=$(npx tsx "$CLI_SCRIPT" analytics effectiveness --days=30 2>&1)
    assert_contains "$output" "Effectiveness\|AUTO\|HUMAN" "Effectiveness analytics shows data"

    # Test 2: Velocity analytics
    output=$(npx tsx "$CLI_SCRIPT" analytics velocity --days=30 2>&1)
    assert_contains "$output" "Velocity\|approved\|SLA" "Velocity analytics shows data"

    # Test 3: Bottlenecks analytics
    output=$(npx tsx "$CLI_SCRIPT" analytics bottlenecks 2>&1)
    assert_contains "$output" "Bottlenecks\|Pending\|No pending" "Bottlenecks analytics executes"

    # Test 4: By approval level
    output=$(npx tsx "$CLI_SCRIPT" analytics by-approval 2>&1)
    assert_contains "$output" "AUTO\|HUMAN\|ESCALATE" "By-approval analytics shows levels"
}

# ============================================================================
# Test Suite: Help Command
# ============================================================================

test_help_command() {
    echo ""
    echo "=== Test Suite: Help Command ==="

    # Test 1: Help output
    local output
    output=$(npx tsx "$CLI_SCRIPT" --help 2>&1)
    assert_contains "$output" "Usage:" "Help shows usage"
    assert_contains "$output" "Commands:" "Help shows commands"
    assert_contains "$output" "list" "Help shows list command"
    assert_contains "$output" "approve" "Help shows approve command"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "======================================================================"
    echo "  Skills Database CLI Integration Test Suite"
    echo "  Phase 4: CLI Tooling with Approval"
    echo "======================================================================"

    setup_test_env

    test_list_command
    test_assign_command
    test_create_command
    test_update_command
    test_approve_command
    test_escalate_command
    test_pending_command
    test_approval_status_command
    test_deprecate_command
    test_analytics_commands
    test_help_command

    cleanup

    echo ""
    echo "======================================================================"
    echo "  Test Summary"
    echo "======================================================================"
    echo "Tests run:    $TESTS_RUN"
    echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo ""
        echo -e "${GREEN}✓ All tests passed!${NC}"
        echo ""
        COVERAGE_PERCENT=$(echo "scale=2; ($TESTS_PASSED / $TESTS_RUN) * 100" | bc)
        echo "Test Coverage: ${COVERAGE_PERCENT}%"
        exit 0
    else
        echo ""
        echo -e "${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

# Run tests
main
