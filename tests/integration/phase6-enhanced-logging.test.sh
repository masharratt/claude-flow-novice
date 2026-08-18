#!/usr/bin/env bash
# Phase 6.1: Enhanced Usage Logging Integration Test
# Tests approval metadata tracking in skill usage logs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test database
TEST_DB="$SCRIPT_DIR/test-phase6-enhanced.db"

# Cleanup
cleanup() {
    rm -f "$TEST_DB"
}

trap cleanup EXIT

# Test helper
run_test() {
    local test_name="$1"
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "${YELLOW}Test $TESTS_RUN: $test_name${NC}"
}

pass_test() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✓ PASS${NC}\n"
}

fail_test() {
    local reason="$1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}✗ FAIL: $reason${NC}\n"
}

# Setup test database
setup_database() {
    echo "Setting up test database..."

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
  approval_level TEXT NOT NULL DEFAULT 'auto',
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
  priority INTEGER DEFAULT 50,
  required BOOLEAN DEFAULT 0,
  conditions TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  execution_time_ms INTEGER,
  confidence_before REAL,
  confidence_after REAL,
  success_indicator BOOLEAN,
  test_suite_executed BOOLEAN,
  test_pass_rate REAL,
  notes TEXT,
  approval_level TEXT,
  phase4_generated INTEGER DEFAULT 0,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_approval_level ON skill_usage_log(approval_level);
CREATE INDEX idx_usage_phase4_generated ON skill_usage_log(phase4_generated);

-- Insert test skills
INSERT INTO skills (name, category, team, content_path, content_hash, version, approval_level, owner, phase4_pattern_id, generated_by)
VALUES
  ('test-skill-auto', 'coordination', 'cfn-dev-team', '/tmp/test1.md', 'hash1', '1.0.0', 'auto', 'system', NULL, NULL),
  ('test-skill-human', 'testing', 'cfn-dev-team', '/tmp/test2.md', 'hash2', '1.0.0', 'human', 'system', 42, 'phase4-cli'),
  ('test-skill-escalate', 'infrastructure', 'cfn-dev-team', '/tmp/test3.md', 'hash3', '1.0.0', 'escalate', 'system', NULL, NULL);
EOF

    echo -e "${GREEN}Database setup complete${NC}\n"
}

# ============================================================================
# Tests
# ============================================================================

test_schema_columns_exist() {
    run_test "Schema has approval_level and phase4_generated columns"

    local schema=$(sqlite3 "$TEST_DB" "PRAGMA table_info(skill_usage_log);")

    if echo "$schema" | grep -q "approval_level"; then
        if echo "$schema" | grep -q "phase4_generated"; then
            pass_test
        else
            fail_test "phase4_generated column missing"
        fi
    else
        fail_test "approval_level column missing"
    fi
}

test_insert_with_approval_metadata() {
    run_test "Insert usage log with approval metadata"

    sqlite3 "$TEST_DB" <<'EOF'
INSERT INTO skill_usage_log (
  agent_id, agent_type, skill_id, task_id, phase,
  loaded_at, confidence_before, confidence_after, execution_time_ms,
  approval_level, phase4_generated
) VALUES
  ('agent-001', 'backend-developer', 1, 'task-123', 'loop3', datetime('now'), 0.70, 0.85, 1500, 'auto', 0),
  ('agent-001', 'backend-developer', 2, 'task-123', 'loop3', datetime('now'), 0.70, 0.85, 1500, 'human', 1),
  ('agent-001', 'backend-developer', 3, 'task-123', 'loop3', datetime('now'), 0.70, 0.85, 1500, 'escalate', 0);
EOF

    local count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE agent_id = 'agent-001';")

    if [ "$count" = "3" ]; then
        pass_test
    else
        fail_test "Expected 3 rows, got $count"
    fi
}

test_approval_level_values() {
    run_test "Verify approval level values are correct"

    local auto=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skill_usage_log WHERE skill_id = 1;")
    local human=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skill_usage_log WHERE skill_id = 2;")
    local escalate=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skill_usage_log WHERE skill_id = 3;")

    if [ "$auto" = "auto" ] && [ "$human" = "human" ] && [ "$escalate" = "escalate" ]; then
        pass_test
    else
        fail_test "Approval levels incorrect: auto=$auto, human=$human, escalate=$escalate"
    fi
}

test_phase4_generated_values() {
    run_test "Verify phase4_generated values are correct"

    local skill1=$(sqlite3 "$TEST_DB" "SELECT phase4_generated FROM skill_usage_log WHERE skill_id = 1;")
    local skill2=$(sqlite3 "$TEST_DB" "SELECT phase4_generated FROM skill_usage_log WHERE skill_id = 2;")
    local skill3=$(sqlite3 "$TEST_DB" "SELECT phase4_generated FROM skill_usage_log WHERE skill_id = 3;")

    if [ "$skill1" = "0" ] && [ "$skill2" = "1" ] && [ "$skill3" = "0" ]; then
        pass_test
    else
        fail_test "phase4_generated values incorrect: skill1=$skill1, skill2=$skill2, skill3=$skill3"
    fi
}

test_backward_compatibility() {
    run_test "Backward compatibility: insert without approval metadata"

    sqlite3 "$TEST_DB" <<'EOF'
INSERT INTO skill_usage_log (
  agent_id, agent_type, skill_id, task_id, loaded_at, execution_time_ms
) VALUES
  ('agent-002', 'backend-developer', 1, 'task-456', datetime('now'), 1000);
EOF

    local approval=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skill_usage_log WHERE agent_id = 'agent-002';")
    local phase4=$(sqlite3 "$TEST_DB" "SELECT phase4_generated FROM skill_usage_log WHERE agent_id = 'agent-002';")

    # approval_level should be NULL, phase4_generated should default to 0
    if [ -z "$approval" ] && [ "$phase4" = "0" ]; then
        pass_test
    else
        fail_test "Expected approval_level=NULL, phase4_generated=0, got approval_level='$approval', phase4_generated='$phase4'"
    fi
}

test_analytics_query_approval_counts() {
    run_test "Analytics query: count by approval level"

    local result=$(sqlite3 "$TEST_DB" <<'EOF'
SELECT approval_level, COUNT(*) as count
FROM skill_usage_log
WHERE approval_level IS NOT NULL
GROUP BY approval_level
ORDER BY approval_level;
EOF
)

    local expected="auto|1
escalate|1
human|1"

    if [ "$result" = "$expected" ]; then
        pass_test
    else
        fail_test "Unexpected approval counts:\nExpected:\n$expected\nGot:\n$result"
    fi
}

test_analytics_query_phase4_count() {
    run_test "Analytics query: count phase4 generated skills"

    local count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE phase4_generated = 1;")

    if [ "$count" = "1" ]; then
        pass_test
    else
        fail_test "Expected 1 phase4 generated skill, got $count"
    fi
}

test_analytics_query_human_phase4() {
    run_test "Analytics query: human-approved phase4-generated skills"

    local count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE approval_level = 'human' AND phase4_generated = 1;")

    if [ "$count" = "1" ]; then
        pass_test
    else
        fail_test "Expected 1 human+phase4 skill, got $count"
    fi
}

test_index_exists() {
    run_test "Verify indexes exist for approval metadata"

    local indexes=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='skill_usage_log';")

    if echo "$indexes" | grep -q "idx_usage_approval_level"; then
        if echo "$indexes" | grep -q "idx_usage_phase4_generated"; then
            pass_test
        else
            fail_test "idx_usage_phase4_generated index missing"
        fi
    else
        fail_test "idx_usage_approval_level index missing"
    fi
}

# ============================================================================
# Main Execution
# ============================================================================

echo "================================"
echo "Phase 6.1 Enhanced Logging Tests"
echo "================================"
echo ""

setup_database

# Run all tests
test_schema_columns_exist
test_insert_with_approval_metadata
test_approval_level_values
test_phase4_generated_values
test_backward_compatibility
test_analytics_query_approval_counts
test_analytics_query_phase4_count
test_analytics_query_human_phase4
test_index_exists

# Summary
echo "================================"
echo "Test Summary"
echo "================================"
echo "Total: $TESTS_RUN"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
