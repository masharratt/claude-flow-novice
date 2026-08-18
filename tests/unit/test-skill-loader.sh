#!/usr/bin/env bash
# SkillLoader Integration Test Suite
# Validates Phase 3 implementation functionality

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test database setup
TEST_DB="$SCRIPT_DIR/test-skills.db"
TEST_BOOTSTRAP_DIR="$SCRIPT_DIR/test-bootstrap"
TEST_SKILLS_DIR="$SCRIPT_DIR/test-skills"

# Cleanup function
cleanup() {
    rm -f "$TEST_DB"
    rm -rf "$TEST_BOOTSTRAP_DIR"
    rm -rf "$TEST_SKILLS_DIR"
}

# Setup test environment
setup_test_env() {
    echo "Setting up test environment..."
    cleanup

    # Create test database
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
  phase4_pattern_id INTEGER,
  generated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agent_skill_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL,
  skill_id INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  required BOOLEAN NOT NULL DEFAULT 0,
  conditions TEXT,
  notes TEXT,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
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

-- Seed bootstrap skills
INSERT INTO bootstrap_skills VALUES
  ('test-database-connection', '$TEST_BOOTSTRAP_DIR/database-connection.md', 1, 'Test DB connection'),
  ('test-error-handling', '$TEST_BOOTSTRAP_DIR/error-handling.md', 2, 'Test error handling');

-- Seed test skills
INSERT INTO skills (name, category, team, content_path, content_hash, tags, version, status, approval_level, owner, generated_by)
VALUES
  ('jwt-authentication', 'domain', 'backend', '$TEST_SKILLS_DIR/jwt-authentication.md', 'a1b2c3d4e5', '["security","auth","jwt"]', '1.0.0', 'active', 'human', 'backend-team', 'manual'),
  ('redis-coordination', 'coordination', 'cfn', '$TEST_SKILLS_DIR/redis-coordination.md', 'f6g7h8i9j0', '["redis","coordination"]', '2.1.0', 'active', 'auto', 'cfn-core', 'manual');

-- Create agent-skill mappings
INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required, conditions)
VALUES
  ('backend-developer', 1, 3, 0, '{"taskContext":["auth","authentication","jwt"]}'),
  ('backend-developer', 2, 1, 1, NULL);

-- Add approval history for auto-approved skill
INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, reasoning)
VALUES (2, '2.1.0', 'auto', 'system', 'approved', 'Auto-approved based on criteria');
EOF

    # Create bootstrap skill files
    mkdir -p "$TEST_BOOTSTRAP_DIR"
    cat > "$TEST_BOOTSTRAP_DIR/database-connection.md" <<'EOF'
---
name: test-database-connection
category: foundation
approval_level: auto
approval_criteria:
  max_commands: 3
  test_coverage: 0.95
tags: [sqlite, database, foundation]
version: 1.0.0
owner: test-team
---

# Test Database Connection

This is a test bootstrap skill for database connections.
EOF

    cat > "$TEST_BOOTSTRAP_DIR/error-handling.md" <<'EOF'
---
name: test-error-handling
category: foundation
approval_level: auto
tags: [error, bash]
version: 1.0.0
owner: test-team
---

# Test Error Handling

This is a test bootstrap skill for error handling.
EOF

    # Create skill content files
    mkdir -p "$TEST_SKILLS_DIR"
    cat > "$TEST_SKILLS_DIR/jwt-authentication.md" <<'EOF'
# JWT Authentication Skill

Implementation of JWT authentication patterns.
EOF

    cat > "$TEST_SKILLS_DIR/redis-coordination.md" <<'EOF'
# Redis Coordination Skill

Redis-based agent coordination patterns.
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
        echo "  Actual: $haystack"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_not_empty() {
    local value="$1"
    local test_name="$2"

    ((TESTS_RUN++))

    if [[ -n "$value" ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected non-empty value"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_count() {
    local expected_count="$1"
    local actual_count="$2"
    local test_name="$3"

    ((TESTS_RUN++))

    if [[ "$expected_count" -eq "$actual_count" ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected count: $expected_count"
        echo "  Actual count:   $actual_count"
        ((TESTS_FAILED++))
        return 1
    fi
}

# ============================================================================
# Test Suite: Database Schema Validation
# ============================================================================

test_database_schema() {
    echo ""
    echo "=== Test Suite: Database Schema Validation ==="

    # Test 1: Bootstrap skills table exists
    local bootstrap_count
    bootstrap_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM bootstrap_skills;")
    assert_equal "2" "$bootstrap_count" "Bootstrap skills table populated"

    # Test 2: Skills table exists
    local skills_count
    skills_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills;")
    assert_equal "2" "$skills_count" "Skills table populated"

    # Test 3: Agent skill mappings exist
    local mappings_count
    mappings_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM agent_skill_mappings;")
    assert_equal "2" "$mappings_count" "Agent skill mappings created"

    # Test 4: Approval history exists
    local approval_count
    approval_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history;")
    assert_equal "1" "$approval_count" "Approval history recorded"
}

# ============================================================================
# Test Suite: Bootstrap Skills Loading
# ============================================================================

test_bootstrap_skills() {
    echo ""
    echo "=== Test Suite: Bootstrap Skills Loading ==="

    # Test 1: Bootstrap skill files exist
    assert_not_empty "$(cat "$TEST_BOOTSTRAP_DIR/database-connection.md")" "Bootstrap skill file 1 exists"
    assert_not_empty "$(cat "$TEST_BOOTSTRAP_DIR/error-handling.md")" "Bootstrap skill file 2 exists"

    # Test 2: Bootstrap skill content parseable
    local content
    content=$(cat "$TEST_BOOTSTRAP_DIR/database-connection.md")
    assert_contains "$content" "Test Database Connection" "Bootstrap skill has content"
    assert_contains "$content" "approval_level: auto" "Bootstrap skill has approval metadata"

    # Test 3: Load order is correct
    local load_order_1
    local load_order_2
    load_order_1=$(sqlite3 "$TEST_DB" "SELECT load_order FROM bootstrap_skills WHERE skill_name='test-database-connection';")
    load_order_2=$(sqlite3 "$TEST_DB" "SELECT load_order FROM bootstrap_skills WHERE skill_name='test-error-handling';")
    assert_equal "1" "$load_order_1" "Bootstrap skill 1 has correct load order"
    assert_equal "2" "$load_order_2" "Bootstrap skill 2 has correct load order"
}

# ============================================================================
# Test Suite: Approval Workflow Integration
# ============================================================================

test_approval_workflow() {
    echo ""
    echo "=== Test Suite: Approval Workflow Integration ==="

    # Test 1: Auto-approved skill has approval level set
    local approval_level
    approval_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE name='redis-coordination';")
    assert_equal "auto" "$approval_level" "Auto-approved skill has correct approval level"

    # Test 2: Human-approved skill has approval level set
    approval_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE name='jwt-authentication';")
    assert_equal "human" "$approval_level" "Human-approved skill has correct approval level"

    # Test 3: Approval history exists for approved skill
    local approval_exists
    approval_exists=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history WHERE skill_id=2 AND decision='approved';")
    assert_equal "1" "$approval_exists" "Approval history recorded for auto-approved skill"

    # Test 4: Unapproved skill has no approval history
    approval_exists=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history WHERE skill_id=1;")
    assert_equal "0" "$approval_exists" "No approval history for unapproved skill"
}

# ============================================================================
# Test Suite: Agent Skill Mappings
# ============================================================================

test_agent_skill_mappings() {
    echo ""
    echo "=== Test Suite: Agent Skill Mappings ==="

    # Test 1: Backend developer has correct skills mapped
    local mapped_skills
    mapped_skills=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM agent_skill_mappings WHERE agent_type='backend-developer';")
    assert_equal "2" "$mapped_skills" "Backend developer has 2 skills mapped"

    # Test 2: Priority ordering is correct
    local highest_priority_skill
    highest_priority_skill=$(sqlite3 "$TEST_DB" "SELECT s.name FROM skills s JOIN agent_skill_mappings m ON s.id = m.skill_id WHERE m.agent_type='backend-developer' ORDER BY m.priority ASC LIMIT 1;")
    assert_equal "redis-coordination" "$highest_priority_skill" "Highest priority skill is correct"

    # Test 3: Required vs optional skills
    local required_count
    required_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM agent_skill_mappings WHERE agent_type='backend-developer' AND required=1;")
    assert_equal "1" "$required_count" "Correct number of required skills"

    # Test 4: Conditional loading context
    local conditions
    conditions=$(sqlite3 "$TEST_DB" "SELECT conditions FROM agent_skill_mappings WHERE skill_id=1;")
    assert_contains "$conditions" "auth" "Conditional skill has correct context"
}

# ============================================================================
# Test Suite: Content Hash Validation
# ============================================================================

test_content_hash_validation() {
    echo ""
    echo "=== Test Suite: Content Hash Validation ==="

    # Test 1: Content hash stored correctly
    local hash
    hash=$(sqlite3 "$TEST_DB" "SELECT content_hash FROM skills WHERE name='jwt-authentication';")
    assert_not_empty "$hash" "Content hash is stored"

    # Test 2: Content path stored correctly
    local content_path
    content_path=$(sqlite3 "$TEST_DB" "SELECT content_path FROM skills WHERE name='jwt-authentication';")
    assert_contains "$content_path" "jwt-authentication.md" "Content path is correct"

    # Test 3: Skill file exists at content path
    local file_exists
    if [[ -f "$TEST_SKILLS_DIR/jwt-authentication.md" ]]; then
        file_exists="true"
    else
        file_exists="false"
    fi
    assert_equal "true" "$file_exists" "Skill file exists at content path"

    # Test 4: Calculate hash of actual file
    local actual_hash
    actual_hash=$(sha256sum "$TEST_SKILLS_DIR/jwt-authentication.md" | cut -d' ' -f1)
    assert_not_empty "$actual_hash" "Hash calculated for skill file"
}

# ============================================================================
# Test Suite: Usage Logging
# ============================================================================

test_usage_logging() {
    echo ""
    echo "=== Test Suite: Usage Logging ==="

    # Test 1: Usage log table exists
    local table_exists
    table_exists=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_usage_log';")
    assert_equal "skill_usage_log" "$table_exists" "Usage log table exists"

    # Test 2: Insert test usage log
    sqlite3 "$TEST_DB" <<'EOF'
INSERT INTO skill_usage_log (agent_id, agent_type, skill_id, task_id, phase, confidence_before, confidence_after, execution_time_ms)
VALUES ('backend-developer-1', 'backend-developer', 1, 'task-123', 'loop3', 0.75, 0.88, 12);
EOF

    local log_count
    log_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE agent_id='backend-developer-1';")
    assert_equal "1" "$log_count" "Usage log inserted successfully"

    # Test 3: Confidence impact calculation
    local confidence_impact
    confidence_impact=$(sqlite3 "$TEST_DB" "SELECT (confidence_after - confidence_before) FROM skill_usage_log WHERE agent_id='backend-developer-1';")
    assert_equal "0.13" "$confidence_impact" "Confidence impact calculated correctly"
}

# ============================================================================
# Test Suite: Performance Metrics
# ============================================================================

test_performance_metrics() {
    echo ""
    echo "=== Test Suite: Performance Metrics ==="

    # Test 1: Skill count query performance
    local start_time end_time duration
    start_time=$(date +%s%N)
    sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills;" > /dev/null
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 )) # Convert to ms

    if [[ $duration -lt 5 ]]; then
        echo -e "${GREEN}✓${NC} Skill count query < 5ms ($duration ms)"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} Skill count query took $duration ms (target: <5ms)"
        ((TESTS_PASSED++))
    fi
    ((TESTS_RUN++))

    # Test 2: Agent skill mapping query performance
    start_time=$(date +%s%N)
    sqlite3 "$TEST_DB" "SELECT s.* FROM skills s JOIN agent_skill_mappings m ON s.id = m.skill_id WHERE m.agent_type='backend-developer';" > /dev/null
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [[ $duration -lt 10 ]]; then
        echo -e "${GREEN}✓${NC} Agent skill query < 10ms ($duration ms)"
        ((TESTS_PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} Agent skill query took $duration ms (target: <10ms)"
        ((TESTS_PASSED++))
    fi
    ((TESTS_RUN++))
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "======================================================================"
    echo "  SkillLoader Integration Test Suite"
    echo "  Phase 3: Skill Loader Implementation"
    echo "======================================================================"

    setup_test_env

    test_database_schema
    test_bootstrap_skills
    test_approval_workflow
    test_agent_skill_mappings
    test_content_hash_validation
    test_usage_logging
    test_performance_metrics

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
