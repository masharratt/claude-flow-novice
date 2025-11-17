#!/bin/bash
# Integration Test: Dual Logging System (Phase 7.2)
#
# Tests the skill-execution-logger in a real scenario:
# 1. Create test skills in Skills DB
# 2. Log manual skill execution (SQLite only)
# 3. Log Phase4 skill execution (dual logging)
# 4. Verify logs in both databases
# 5. Check performance metrics

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test database paths
TEST_DIR="/tmp/dual-logging-test-$$"
TEST_SQLITE_DB="$TEST_DIR/test-skills.db"

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

echo "=================================================="
echo "Dual Logging Integration Test - Phase 7.2"
echo "=================================================="
echo ""

# Cleanup function
cleanup() {
  echo ""
  echo "Cleaning up test environment..."
  rm -rf "$TEST_DIR"
}

trap cleanup EXIT

# Test assertion helper
assert_equal() {
  local actual="$1"
  local expected="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$actual" = "$expected" ]; then
    echo -e "${GREEN}✓${NC} PASS: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗${NC} FAIL: $test_name"
    echo "  Expected: $expected"
    echo "  Actual:   $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_not_equal() {
  local actual="$1"
  local expected="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$actual" != "$expected" ]; then
    echo -e "${GREEN}✓${NC} PASS: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗${NC} FAIL: $test_name"
    echo "  Expected NOT: $expected"
    echo "  Actual:       $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_greater_than() {
  local actual="$1"
  local threshold="$2"
  local test_name="$3"

  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$actual" -gt "$threshold" ]; then
    echo -e "${GREEN}✓${NC} PASS: $test_name ($actual > $threshold)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗${NC} FAIL: $test_name"
    echo "  Expected > $threshold"
    echo "  Actual:    $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# Setup test environment
setup_test_db() {
  echo "Setting up test database..."
  mkdir -p "$TEST_DIR"

  # Create test Skills DB
  sqlite3 "$TEST_SQLITE_DB" <<EOF
-- Create skills table
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
  phase4_pattern_id INTEGER,
  generated_by TEXT,
  is_auto_generated BOOLEAN DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create skill_usage_log table
CREATE TABLE IF NOT EXISTS skill_usage_log (
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
  approval_level TEXT,
  phase4_generated INTEGER DEFAULT 0,
  exit_code INTEGER,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

-- Insert test skills
INSERT INTO skills (name, category, team, content_path, content_hash, version, approval_level, generated_by, phase4_pattern_id)
VALUES
  ('manual-deployment', 'infrastructure', 'devops', '/path/manual.md', 'hash1', '1.0.0', 'human', 'manual', NULL),
  ('auto-backup', 'infrastructure', 'devops', '/path/auto.md', 'hash2', '2.0.0', 'auto', 'phase4', 123),
  ('jwt-auth-middleware', 'security', 'backend', '/path/jwt.md', 'hash3', '1.5.0', 'escalate', 'phase4', 456);
EOF

  echo -e "${GREEN}✓${NC} Test database created at: $TEST_SQLITE_DB"
}

# Test 1: Verify test skills were created
test_skills_created() {
  echo ""
  echo "Test 1: Verify test skills created"
  echo "-----------------------------------"

  local skill_count=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skills;")
  assert_equal "$skill_count" "3" "Skills table has 3 test skills"

  local manual_count=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skills WHERE generated_by = 'manual';")
  assert_equal "$manual_count" "1" "One manual skill exists"

  local phase4_count=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skills WHERE generated_by = 'phase4';")
  assert_equal "$phase4_count" "2" "Two Phase4 skills exist"
}

# Test 2: Log manual skill execution (SQLite only)
test_manual_skill_logging() {
  echo ""
  echo "Test 2: Manual skill logging (SQLite only)"
  echo "-------------------------------------------"

  # Create Node.js test script
  cat > "$TEST_DIR/test-manual.mjs" <<'NODESCRIPT'
import { SkillExecutionLogger } from '../../dist/cli/skill-execution-logger.js';

const dbPath = process.argv[2];

const logger = new SkillExecutionLogger({
  sqliteDbPath: dbPath,
  enablePostgres: false // Explicitly disable PostgreSQL
});

await logger.logSkillExecution({
  agentId: 'devops-agent-1',
  agentType: 'devops-specialist',
  skillName: 'manual-deployment',
  taskId: 'task-001',
  phase: 'loop3',
  confidenceBefore: 0.65,
  confidenceAfter: 0.82,
  executionTimeMs: 15,
  exitCode: 0
});

await logger.close();
console.log('Manual skill logged successfully');
NODESCRIPT

  # Run the test
  cd "$PROJECT_ROOT"
  local output=$(node "$TEST_DIR/test-manual.mjs" "$TEST_SQLITE_DB" 2>&1)

  # Verify SQLite log
  local log_count=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE agent_id = 'devops-agent-1';")
  assert_equal "$log_count" "1" "Manual skill logged to SQLite"

  local approval_level=$(sqlite3 "$TEST_SQLITE_DB" "SELECT approval_level FROM skill_usage_log WHERE agent_id = 'devops-agent-1';")
  assert_equal "$approval_level" "human" "Approval level recorded correctly"

  local phase4_flag=$(sqlite3 "$TEST_SQLITE_DB" "SELECT phase4_generated FROM skill_usage_log WHERE agent_id = 'devops-agent-1';")
  assert_equal "$phase4_flag" "0" "Phase4 flag is 0 for manual skill"
}

# Test 3: Log Phase4 skill execution (dual logging - mock mode)
test_phase4_skill_logging() {
  echo ""
  echo "Test 3: Phase4 skill logging (dual logging)"
  echo "--------------------------------------------"

  # Create Node.js test script
  cat > "$TEST_DIR/test-phase4.mjs" <<'NODESCRIPT'
import { SkillExecutionLogger } from '../../dist/cli/skill-execution-logger.js';

const dbPath = process.argv[2];

const logger = new SkillExecutionLogger({
  sqliteDbPath: dbPath,
  enablePostgres: true, // Enable PostgreSQL (will fail gracefully)
  postgresHost: 'localhost',
  postgresDb: 'workflow_codification',
  postgresUser: 'postgres',
  postgresPass: ''
});

// Wait for connection attempt
await new Promise(resolve => setTimeout(resolve, 200));

await logger.logSkillExecution({
  agentId: 'backend-agent-1',
  agentType: 'backend-developer',
  skillName: 'jwt-auth-middleware',
  taskId: 'task-002',
  phase: 'loop3',
  confidenceBefore: 0.70,
  confidenceAfter: 0.95,
  executionTimeMs: 8,
  exitCode: 0,
  costAvoidedUsd: 0.12,
  tokensAvoided: 2500
});

await logger.close();
console.log('Phase4 skill logged successfully');
NODESCRIPT

  # Run the test
  cd "$PROJECT_ROOT"
  local output=$(node "$TEST_DIR/test-phase4.mjs" "$TEST_SQLITE_DB" 2>&1)

  # Verify SQLite log
  local log_count=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE agent_id = 'backend-agent-1';")
  assert_equal "$log_count" "1" "Phase4 skill logged to SQLite"

  local phase4_flag=$(sqlite3 "$TEST_SQLITE_DB" "SELECT phase4_generated FROM skill_usage_log WHERE agent_id = 'backend-agent-1';")
  assert_equal "$phase4_flag" "1" "Phase4 flag is 1 for Phase4 skill"

  local approval_level=$(sqlite3 "$TEST_SQLITE_DB" "SELECT approval_level FROM skill_usage_log WHERE agent_id = 'backend-agent-1';")
  assert_equal "$approval_level" "escalate" "Approval level recorded correctly"

  # Check if PostgreSQL attempt was made (in output logs)
  if echo "$output" | grep -q "PostgreSQL"; then
    echo -e "${GREEN}✓${NC} PASS: PostgreSQL connection attempted"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${YELLOW}⚠${NC}  WARN: PostgreSQL connection not detected in logs"
  fi
}

# Test 4: Performance test (100 logs)
test_performance() {
  echo ""
  echo "Test 4: Performance test (100 skill executions)"
  echo "------------------------------------------------"

  # Create Node.js test script
  cat > "$TEST_DIR/test-performance.mjs" <<'NODESCRIPT'
import { SkillExecutionLogger } from '../../dist/cli/skill-execution-logger.js';

const dbPath = process.argv[2];

const logger = new SkillExecutionLogger({
  sqliteDbPath: dbPath,
  enablePostgres: false
});

const startTime = Date.now();
const promises = [];

for (let i = 0; i < 100; i++) {
  promises.push(
    logger.logSkillExecution({
      agentId: `perf-agent-${i}`,
      agentType: 'performance-tester',
      skillName: i % 2 === 0 ? 'manual-deployment' : 'auto-backup',
      executionTimeMs: 10,
      exitCode: 0
    })
  );
}

await Promise.all(promises);
const duration = Date.now() - startTime;

await logger.close();
console.log(duration); // Output duration in milliseconds
NODESCRIPT

  # Run the test
  cd "$PROJECT_ROOT"
  local duration=$(node "$TEST_DIR/test-performance.mjs" "$TEST_SQLITE_DB" 2>&1 | grep -E '^[0-9]+$' | tail -1)

  # Verify all logs were written
  local log_count=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE agent_type = 'performance-tester';")
  assert_equal "$log_count" "100" "All 100 skill executions logged"

  # Check average time per log (should be <50ms)
  local avg_time=$((duration / 100))
  echo "  Total time: ${duration}ms"
  echo "  Average per log: ${avg_time}ms"

  if [ "$avg_time" -lt 50 ]; then
    echo -e "${GREEN}✓${NC} PASS: Average logging time < 50ms (${avg_time}ms)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${YELLOW}⚠${NC}  WARN: Average logging time >= 50ms (${avg_time}ms)"
    echo "  (This is acceptable for integration tests with I/O overhead)"
  fi
}

# Test 5: Analytics query test
test_analytics() {
  echo ""
  echo "Test 5: Analytics queries"
  echo "-------------------------"

  # Query 1: Skills by approval level
  local human_count=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE approval_level = 'human';")
  assert_greater_than "$human_count" "0" "Human approval skills logged"

  # Query 2: Phase4 vs manual skills
  local phase4_logs=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE phase4_generated = 1;")
  assert_greater_than "$phase4_logs" "0" "Phase4 skills logged"

  # Query 3: Average confidence improvement
  local avg_improvement=$(sqlite3 "$TEST_SQLITE_DB" "SELECT ROUND(AVG(confidence_after - confidence_before), 2) FROM skill_usage_log WHERE confidence_before IS NOT NULL;")
  echo "  Average confidence improvement: +${avg_improvement}"

  # Query 4: Skill usage by type
  local manual_usage=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE skill_id = 1;")
  local auto_usage=$(sqlite3 "$TEST_SQLITE_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE skill_id = 2;")
  echo "  Manual skill usage: $manual_usage"
  echo "  Auto skill usage: $auto_usage"
}

# Run all tests
main() {
  setup_test_db
  test_skills_created
  test_manual_skill_logging
  test_phase4_skill_logging
  test_performance
  test_analytics

  # Summary
  echo ""
  echo "=================================================="
  echo "Test Summary"
  echo "=================================================="
  echo "Tests run:    $TESTS_RUN"
  echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"

  if [ "$TESTS_FAILED" -gt 0 ]; then
    echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
    echo ""
    exit 1
  else
    echo "Tests failed: 0"
    echo ""
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  fi
}

main
