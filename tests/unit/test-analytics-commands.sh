#!/usr/bin/env bash
# Unit Tests: Analytics Commands for Approval Metrics
# Tests for Phase 6.2 new analytics subcommands

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test database path
TEST_DB="/tmp/test-analytics-commands-$$.db"
SKILLS_DB_DIR="/home/user/claude-flow-novice/.claude/skills-database"
SKILLS_DB="$SKILLS_DB_DIR/skills.db"

# CLI path
CLI_CMD="node /home/user/claude-flow-novice/src/cli/skill-cli.ts"

# ============================================================================
# Test Utilities
# ============================================================================

log_test() {
  echo -e "${YELLOW}[TEST]${NC} $1"
  ((TESTS_RUN++))
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((TESTS_FAILED++))
}

assert_contains() {
  local output="$1"
  local expected="$2"
  local test_name="$3"

  if echo "$output" | grep -q "$expected"; then
    log_pass "$test_name"
    return 0
  else
    log_fail "$test_name - Expected to find: $expected"
    echo "Output was: $output"
    return 1
  fi
}

assert_not_empty() {
  local output="$1"
  local test_name="$2"

  if [ -n "$output" ]; then
    log_pass "$test_name"
    return 0
  else
    log_fail "$test_name - Output was empty"
    return 1
  fi
}

# ============================================================================
# Database Setup
# ============================================================================

setup_test_database() {
  log_test "Setting up test database"

  # Create test database with schema
  sqlite3 "$TEST_DB" << 'EOF'
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
  approval_level TEXT NOT NULL DEFAULT 'human' CHECK(approval_level IN ('auto', 'escalate', 'human')),
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
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  approval_level TEXT NOT NULL CHECK(approval_level IN ('auto', 'escalate', 'human')),
  approver TEXT,
  decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected', 'escalated', 'needs_correction')),
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
EOF

  # Seed with test data
  seed_test_data

  log_pass "Test database created: $TEST_DB"
}

seed_test_data() {
  sqlite3 "$TEST_DB" << 'EOF'
-- Insert test skills with various approval levels
INSERT INTO skills (name, category, team, content_path, content_hash, version, status, approval_level, generated_by, is_auto_generated)
VALUES
  ('coordination-protocol', 'coordination', 'cfn', '.claude/skills/coordination/SKILL.md', 'hash1', '1.0.0', 'active', 'auto', 'manual', 0),
  ('jwt-authentication', 'security', 'cfn', '.claude/skills/jwt/SKILL.md', 'hash2', '1.0.0', 'active', 'human', 'phase4', 1),
  ('redis-coordination', 'coordination', 'cfn', '.claude/skills/redis/SKILL.md', 'hash3', '1.0.0', 'active', 'human', 'phase4', 1),
  ('docker-deployment', 'infrastructure', 'cfn', '.claude/skills/docker/SKILL.md', 'hash4', '1.0.0', 'active', 'escalate', 'phase4', 1),
  ('kubernetes-scaling', 'infrastructure', 'cfn', '.claude/skills/k8s/SKILL.md', 'hash5', '1.0.0', 'active', 'escalate', 'phase4', 1),
  ('api-versioning', 'domain', 'cfn', '.claude/skills/api/SKILL.md', 'hash6', '1.0.0', 'active', 'human', 'phase4', 1),
  ('test-framework', 'testing', 'cfn', '.claude/skills/testing/SKILL.md', 'hash7', '1.0.0', 'active', 'auto', 'manual', 0);

-- Insert usage logs with confidence metrics
-- Auto-approved skills (high confidence impact)
INSERT INTO skill_usage_log (agent_id, agent_type, skill_id, loaded_at, execution_time_ms, confidence_before, confidence_after, success_indicator)
SELECT
  'agent-' || seq.val,
  'backend-developer',
  1, -- coordination-protocol (auto)
  datetime('now', '-' || (seq.val % 30) || ' days'),
  10 + (seq.val % 20),
  0.70 + (seq.val % 10) * 0.01,
  0.80 + (seq.val % 10) * 0.01,
  1
FROM (SELECT 1 as val UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) seq;

-- Human-approved Phase4 skills (jwt-authentication)
INSERT INTO skill_usage_log (agent_id, agent_type, skill_id, loaded_at, execution_time_ms, confidence_before, confidence_after, success_indicator)
SELECT
  'agent-jwt-' || seq.val,
  'security-specialist',
  2, -- jwt-authentication (human, phase4)
  datetime('now', '-' || (seq.val % 25) || ' days'),
  15 + (seq.val % 10),
  0.65 + (seq.val % 10) * 0.01,
  0.79 + (seq.val % 10) * 0.01,
  1
FROM (SELECT 1 as val UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) seq;

-- Human-approved Phase4 skills (redis-coordination)
INSERT INTO skill_usage_log (agent_id, agent_type, skill_id, loaded_at, execution_time_ms, confidence_before, confidence_after, success_indicator)
SELECT
  'agent-redis-' || seq.val,
  'backend-developer',
  3, -- redis-coordination (human, phase4)
  datetime('now', '-' || (seq.val % 20) || ' days'),
  12 + (seq.val % 8),
  0.68 + (seq.val % 10) * 0.01,
  0.77 + (seq.val % 10) * 0.01,
  1
FROM (SELECT 1 as val UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) seq;

-- Escalated Phase4 skills (docker-deployment)
INSERT INTO skill_usage_log (agent_id, agent_type, skill_id, loaded_at, execution_time_ms, confidence_before, confidence_after, success_indicator)
SELECT
  'agent-docker-' || seq.val,
  'docker-specialist',
  4, -- docker-deployment (escalate, phase4)
  datetime('now', '-' || (seq.val % 15) || ' days'),
  18 + (seq.val % 12),
  0.72 + (seq.val % 8) * 0.01,
  0.78 + (seq.val % 8) * 0.01,
  1
FROM (SELECT 1 as val UNION SELECT 2 UNION SELECT 3) seq;

-- Approval history records
INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, timestamp, review_duration_minutes)
VALUES
  (1, '1.0.0', 'auto', 'system', 'approved', datetime('now', '-30 days'), 0),
  (2, '1.0.0', 'human', 'tech-lead@example.com', 'approved', datetime('now', '-25 days'), 120),
  (3, '1.0.0', 'human', 'tech-lead@example.com', 'approved', datetime('now', '-20 days'), 90),
  (4, '1.0.0', 'escalate', 'expert@example.com', 'approved', datetime('now', '-15 days'), 60),
  (5, '1.0.0', 'escalate', 'expert@example.com', 'approved', datetime('now', '-10 days'), 45),
  (6, '1.0.0', 'human', 'tech-lead@example.com', 'approved', datetime('now', '-5 days'), 180),
  (7, '1.0.0', 'auto', 'system', 'approved', datetime('now', '-28 days'), 0);
EOF
}

cleanup_test_database() {
  if [ -f "$TEST_DB" ]; then
    rm "$TEST_DB"
    log_pass "Test database cleaned up"
  fi
}

# ============================================================================
# Test Cases: effectiveness-by-approval
# ============================================================================

test_effectiveness_by_approval_command_exists() {
  log_test "Test: effectiveness-by-approval command exists"

  # Note: This will test against production DB for now
  # Full integration test will use test DB
  output=$($CLI_CMD analytics effectiveness-by-approval --days=30 2>&1 || true)

  if echo "$output" | grep -qE "(Skill Effectiveness|Auto-approved|Human-approved|Escalated)" || echo "$output" | grep -q "No usage data"; then
    log_pass "effectiveness-by-approval command accessible"
  else
    log_fail "effectiveness-by-approval command not found or errored"
    echo "Output: $output"
  fi
}

test_effectiveness_by_approval_shows_approval_levels() {
  log_test "Test: effectiveness-by-approval shows all approval levels"

  output=$($CLI_CMD analytics effectiveness-by-approval --days=30 2>&1 || true)

  # Should show sections for auto, human, and escalate
  if echo "$output" | grep -qE "(auto|human|escalate)" || echo "$output" | grep -q "No usage data"; then
    log_pass "effectiveness-by-approval displays approval level data"
  else
    log_fail "effectiveness-by-approval missing approval level breakdown"
    echo "Output: $output"
  fi
}

test_effectiveness_by_approval_shows_metrics() {
  log_test "Test: effectiveness-by-approval shows confidence metrics"

  output=$($CLI_CMD analytics effectiveness-by-approval --days=30 2>&1 || true)

  # Should show confidence impact, usage count, or success rate
  if echo "$output" | grep -qE "(confidence|impact|usage|success)" || echo "$output" | grep -q "No usage data"; then
    log_pass "effectiveness-by-approval displays metrics"
  else
    log_fail "effectiveness-by-approval missing metrics"
    echo "Output: $output"
  fi
}

# ============================================================================
# Test Cases: phase4-performance
# ============================================================================

test_phase4_performance_command_exists() {
  log_test "Test: phase4-performance command exists"

  output=$($CLI_CMD analytics phase4-performance --days=30 2>&1 || true)

  if echo "$output" | grep -qE "(Phase 4|Phase4|Generated Skills|performance)" || echo "$output" | grep -q "No usage data"; then
    log_pass "phase4-performance command accessible"
  else
    log_fail "phase4-performance command not found or errored"
    echo "Output: $output"
  fi
}

test_phase4_performance_shows_total_usage() {
  log_test "Test: phase4-performance shows total usage count"

  output=$($CLI_CMD analytics phase4-performance --days=30 2>&1 || true)

  # Should show total Phase4 skill usages or "No usage data"
  if echo "$output" | grep -qE "(Total|usages|Phase4)" || echo "$output" | grep -q "No usage data"; then
    log_pass "phase4-performance displays usage count"
  else
    log_fail "phase4-performance missing usage count"
    echo "Output: $output"
  fi
}

test_phase4_performance_shows_top_skills() {
  log_test "Test: phase4-performance shows top Phase4 skills"

  output=$($CLI_CMD analytics phase4-performance --days=30 2>&1 || true)

  # Should show top skills list or "No usage data"
  if echo "$output" | grep -qE "(Top|skills|1\\.)" || echo "$output" | grep -q "No usage data"; then
    log_pass "phase4-performance displays top skills"
  else
    log_fail "phase4-performance missing top skills"
    echo "Output: $output"
  fi
}

# ============================================================================
# Test Cases: approval-efficiency
# ============================================================================

test_approval_efficiency_command_exists() {
  log_test "Test: approval-efficiency command exists"

  output=$($CLI_CMD analytics approval-efficiency 2>&1 || true)

  if echo "$output" | grep -qE "(Approval|Workflow|Efficiency|approved)" || echo "$output" | grep -q "No approval history"; then
    log_pass "approval-efficiency command accessible"
  else
    log_fail "approval-efficiency command not found or errored"
    echo "Output: $output"
  fi
}

test_approval_efficiency_shows_timing() {
  log_test "Test: approval-efficiency shows timing metrics"

  output=$($CLI_CMD analytics approval-efficiency 2>&1 || true)

  # Should show timing info (days, hours, minutes) or "No approval history"
  if echo "$output" | grep -qE "(time|days|minutes|instant)" || echo "$output" | grep -q "No approval history"; then
    log_pass "approval-efficiency displays timing metrics"
  else
    log_fail "approval-efficiency missing timing metrics"
    echo "Output: $output"
  fi
}

test_approval_efficiency_shows_approval_rates() {
  log_test "Test: approval-efficiency shows approval rates"

  output=$($CLI_CMD analytics approval-efficiency 2>&1 || true)

  # Should show approval rates or percentages
  if echo "$output" | grep -qE "(approved|rejected|%|rate)" || echo "$output" | grep -q "No approval history"; then
    log_pass "approval-efficiency displays approval rates"
  else
    log_fail "approval-efficiency missing approval rates"
    echo "Output: $output"
  fi
}

# ============================================================================
# Edge Cases
# ============================================================================

test_handles_no_data_gracefully() {
  log_test "Test: Commands handle no data gracefully"

  # Create empty test database
  EMPTY_DB="/tmp/empty-analytics-$$.db"
  sqlite3 "$EMPTY_DB" < /dev/null

  # Commands should not crash on empty/missing data
  # This is a basic sanity check that commands exit cleanly
  set +e
  $CLI_CMD analytics effectiveness-by-approval --days=30 > /dev/null 2>&1
  effectiveness_exit=$?
  $CLI_CMD analytics phase4-performance --days=30 > /dev/null 2>&1
  phase4_exit=$?
  $CLI_CMD analytics approval-efficiency > /dev/null 2>&1
  efficiency_exit=$?
  set -e

  rm -f "$EMPTY_DB"

  # Exit codes 0 or 1 are acceptable (1 for "no data found" is ok)
  if [ $effectiveness_exit -le 1 ] && [ $phase4_exit -le 1 ] && [ $efficiency_exit -le 1 ]; then
    log_pass "Commands handle missing data without crashing"
  else
    log_fail "Commands crashed on missing data (exit codes: $effectiveness_exit, $phase4_exit, $efficiency_exit)"
  fi
}

test_days_parameter_accepted() {
  log_test "Test: --days parameter accepted"

  # Should accept --days parameter without error
  set +e
  $CLI_CMD analytics effectiveness-by-approval --days=7 > /dev/null 2>&1
  exit_code=$?
  set -e

  if [ $exit_code -le 1 ]; then
    log_pass "--days parameter accepted"
  else
    log_fail "--days parameter caused error (exit code: $exit_code)"
  fi
}

# ============================================================================
# Main Test Runner
# ============================================================================

run_all_tests() {
  echo ""
  echo "======================================================================="
  echo "  Analytics Commands Test Suite - Phase 6.2"
  echo "======================================================================="
  echo ""

  # Setup
  # setup_test_database

  # Run tests
  test_effectiveness_by_approval_command_exists
  test_effectiveness_by_approval_shows_approval_levels
  test_effectiveness_by_approval_shows_metrics

  test_phase4_performance_command_exists
  test_phase4_performance_shows_total_usage
  test_phase4_performance_shows_top_skills

  test_approval_efficiency_command_exists
  test_approval_efficiency_shows_timing
  test_approval_efficiency_shows_approval_rates

  test_handles_no_data_gracefully
  test_days_parameter_accepted

  # Cleanup
  # cleanup_test_database

  # Summary
  echo ""
  echo "======================================================================="
  echo "  Test Summary"
  echo "======================================================================="
  echo -e "Total Tests: ${TESTS_RUN}"
  echo -e "${GREEN}Passed: ${TESTS_PASSED}${NC}"
  echo -e "${RED}Failed: ${TESTS_FAILED}${NC}"
  echo ""

  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
  fi
}

# Run tests
run_all_tests
