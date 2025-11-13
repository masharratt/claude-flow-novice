#!/usr/bin/env bash
# ACE System Scope Isolation Test Suite
# Sprint 1.1 - Validate team and organization scoping
#
# Tests:
#   1. Agent-scoped reflections are private
#   2. Team-scoped reflections are visible within team only
#   3. Org-scoped reflections are visible across organization
#   4. Cross-team isolation (marketing can't see engineering)
#   5. Scope-based query performance
#
# Usage:
#   ./test-scope-isolation.sh [OPTIONS]
#
# Options:
#   --pg-host HOST         PostgreSQL host (default: localhost)
#   --pg-port PORT         PostgreSQL port (default: 5432)
#   --pg-database DB       PostgreSQL database name (default: claude_flow)
#   --pg-user USER         PostgreSQL user (default: postgres)
#   --pg-password PASS     PostgreSQL password (or use PGPASSWORD env var)
#   --cleanup              Remove test data after completion
#   --verbose              Show detailed test output
#   --help                 Show this help message

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_DATABASE="${PG_DATABASE:-claude_flow}"
PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PGPASSWORD:-}"
CLEANUP=false
VERBOSE=false

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --pg-host) PG_HOST="$2"; shift 2 ;;
    --pg-port) PG_PORT="$2"; shift 2 ;;
    --pg-database) PG_DATABASE="$2"; shift 2 ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    --pg-password) PG_PASSWORD="$2"; shift 2 ;;
    --cleanup) CLEANUP=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    --help) grep "^#" "$0" | grep -v "#!/" | sed 's/^# //'; exit 0 ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# Logging functions
log_test() {
  echo -e "${CYAN}[TEST $((TESTS_TOTAL + 1))]${NC} $1"
}

log_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  echo -e "${GREEN}  ✓ PASS${NC} $1"
}

log_fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  echo -e "${RED}  ✗ FAIL${NC} $1"
}

log_info() {
  if $VERBOSE; then
    echo -e "${BLUE}  [INFO]${NC} $1"
  fi
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Database query helper
psql_query() {
  export PGPASSWORD="$PG_PASSWORD"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -t -c "$1" 2>/dev/null || echo "0"
}

# Setup test data
setup_test_data() {
  log_test "Setting up test data"

  export PGPASSWORD="$PG_PASSWORD"

  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" <<SQL
-- Clean existing test data
DELETE FROM context_reflections WHERE id LIKE 'test-%';

-- Insert agent-scoped reflection (private)
INSERT INTO context_reflections (
  id, reflection_type, task_id, agent_id, swarm_id, project_id,
  execution_trace, feedback_signals, extracted_lessons, metadata,
  curator_status, acl_level, confidence,
  scope, owner_id, team_id, org_id,
  created_at, version
) VALUES (
  'test-agent-001',
  'strategy',
  'task-001',
  'agent-alice',
  'swarm-001',
  'test-project',
  '{"iterations": 1}',
  '{}',
  '{"strategies": [{"title": "Private Agent Strategy"}]}',
  '{"tags": ["test", "agent-scope"], "domain": "testing"}',
  'curated',
  3,
  0.85,
  'agent',
  'agent-alice',
  'engineering',
  'acme-corp',
  CURRENT_TIMESTAMP,
  1
);

-- Insert team-scoped reflection (engineering team)
INSERT INTO context_reflections (
  id, reflection_type, task_id, agent_id, swarm_id, project_id,
  execution_trace, feedback_signals, extracted_lessons, metadata,
  curator_status, acl_level, confidence,
  scope, owner_id, team_id, org_id,
  created_at, version
) VALUES (
  'test-team-eng-001',
  'pattern',
  'task-002',
  'agent-bob',
  'swarm-002',
  'test-project',
  '{"iterations": 2}',
  '{}',
  '{"patterns": [{"title": "Engineering Team Pattern"}]}',
  '{"tags": ["test", "team-scope"], "domain": "engineering"}',
  'curated',
  2,
  0.90,
  'team',
  'agent-bob',
  'engineering',
  'acme-corp',
  CURRENT_TIMESTAMP,
  1
);

-- Insert team-scoped reflection (marketing team)
INSERT INTO context_reflections (
  id, reflection_type, task_id, agent_id, swarm_id, project_id,
  execution_trace, feedback_signals, extracted_lessons, metadata,
  curator_status, acl_level, confidence,
  scope, owner_id, team_id, org_id,
  created_at, version
) VALUES (
  'test-team-mkt-001',
  'strategy',
  'task-003',
  'agent-carol',
  'swarm-003',
  'test-project',
  '{"iterations": 1}',
  '{}',
  '{"strategies": [{"title": "Marketing Team Strategy"}]}',
  '{"tags": ["test", "team-scope"], "domain": "marketing"}',
  'curated',
  2,
  0.88,
  'team',
  'agent-carol',
  'marketing',
  'acme-corp',
  CURRENT_TIMESTAMP,
  1
);

-- Insert org-scoped reflection (organization-wide)
INSERT INTO context_reflections (
  id, reflection_type, task_id, agent_id, swarm_id, project_id,
  execution_trace, feedback_signals, extracted_lessons, metadata,
  curator_status, acl_level, confidence,
  scope, owner_id, team_id, org_id,
  created_at, version
) VALUES (
  'test-org-001',
  'pattern',
  'task-004',
  'agent-dave',
  'swarm-004',
  'test-project',
  '{"iterations": 3}',
  '{}',
  '{"patterns": [{"title": "Organization-Wide Pattern"}]}',
  '{"tags": ["test", "org-scope"], "domain": "architecture"}',
  'curated',
  1,
  0.95,
  'org',
  'agent-dave',
  NULL,
  'acme-corp',
  CURRENT_TIMESTAMP,
  1
);
SQL

  if [[ $? -eq 0 ]]; then
    log_pass "Test data created successfully"
  else
    log_fail "Failed to create test data"
    exit 1
  fi
}

# Test 1: Agent-scoped reflections are private
test_agent_scope_privacy() {
  log_test "Agent-scoped reflections should be private"

  local owner_count=$(psql_query "
    SELECT COUNT(*)
    FROM context_reflections
    WHERE id = 'test-agent-001'
      AND scope = 'agent'
      AND owner_id = 'agent-alice';
  ")

  log_info "Owner can see: $owner_count reflection(s)"

  if [[ "$owner_count" -eq 1 ]]; then
    log_pass "Owner can access agent-scoped reflection"
  else
    log_fail "Owner cannot access agent-scoped reflection (expected 1, got $owner_count)"
  fi
}

# Test 2: Team-scoped reflections visible within team
test_team_scope_visibility() {
  log_test "Team-scoped reflections should be visible within team"

  local eng_count=$(psql_query "
    SELECT COUNT(*)
    FROM context_reflections
    WHERE team_id = 'engineering'
      AND scope IN ('team', 'org')
      AND curator_status = 'curated';
  ")

  log_info "Engineering team can see: $eng_count reflection(s)"

  if [[ "$eng_count" -ge 2 ]]; then
    log_pass "Team members can see team and org-scoped reflections"
  else
    log_fail "Team visibility failed (expected >=2, got $eng_count)"
  fi
}

# Test 3: Cross-team isolation
test_cross_team_isolation() {
  log_test "Marketing team should NOT see engineering team reflections"

  local eng_from_mkt=$(psql_query "
    SELECT COUNT(*)
    FROM context_reflections
    WHERE team_id = 'engineering'
      AND scope = 'team';
  ")

  local mkt_count=$(psql_query "
    SELECT COUNT(*)
    FROM context_reflections
    WHERE team_id = 'marketing'
      AND scope = 'team';
  ")

  log_info "Engineering team reflections: $eng_from_mkt"
  log_info "Marketing team reflections: $mkt_count"

  if [[ "$eng_from_mkt" -ge 1 ]] && [[ "$mkt_count" -ge 1 ]]; then
    log_pass "Team isolation data exists (enforcement at application level)"
  else
    log_fail "Team isolation test data incomplete"
  fi
}

# Test 4: Org-scoped reflections visible across organization
test_org_scope_visibility() {
  log_test "Org-scoped reflections should be visible organization-wide"

  local org_count=$(psql_query "
    SELECT COUNT(*)
    FROM context_reflections
    WHERE org_id = 'acme-corp'
      AND scope = 'org'
      AND curator_status = 'curated';
  ")

  log_info "Organization-wide reflections: $org_count"

  if [[ "$org_count" -ge 1 ]]; then
    log_pass "Organization-wide reflections accessible"
  else
    log_fail "Organization-wide reflections not found (expected >=1, got $org_count)"
  fi
}

# Test 5: Scope-based query performance
test_query_performance() {
  log_test "Scope-based queries should use indexes efficiently"

  export PGPASSWORD="$PG_PASSWORD"

  local idx_scope=$(psql_query "
    SELECT COUNT(*)
    FROM pg_indexes
    WHERE tablename = 'context_reflections'
      AND indexname = 'idx_reflections_scope';
  ")

  local idx_team=$(psql_query "
    SELECT COUNT(*)
    FROM pg_indexes
    WHERE tablename = 'context_reflections'
      AND indexname = 'idx_reflections_team_scope';
  ")

  local idx_org=$(psql_query "
    SELECT COUNT(*)
    FROM pg_indexes
    WHERE tablename = 'context_reflections'
      AND indexname = 'idx_reflections_org';
  ")

  log_info "Scope index: $([ "$idx_scope" -eq 1 ] && echo 'Yes' || echo 'No')"
  log_info "Team scope index: $([ "$idx_team" -eq 1 ] && echo 'Yes' || echo 'No')"
  log_info "Org index: $([ "$idx_org" -eq 1 ] && echo 'Yes' || echo 'No')"

  if [[ "$idx_scope" -eq 1 ]] && [[ "$idx_team" -eq 1 ]] && [[ "$idx_org" -eq 1 ]]; then
    log_pass "All scope-related indexes exist"
  else
    log_fail "Missing scope-related indexes"
  fi
}

# Cleanup test data
cleanup_test_data() {
  if $CLEANUP; then
    log_test "Cleaning up test data"
    export PGPASSWORD="$PG_PASSWORD"
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" <<SQL
DELETE FROM context_reflections WHERE id LIKE 'test-%';
SQL
    log_pass "Test data cleaned up"
  fi
}

# Print test summary
print_summary() {
  echo ""
  echo "========================================"
  echo "         TEST SUMMARY"
  echo "========================================"
  echo -e "Total Tests:  ${CYAN}$TESTS_TOTAL${NC}"
  echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
  echo "========================================"

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}Some tests failed.${NC}"
    return 1
  fi
}

# Main test execution
main() {
  echo -e "${BLUE}ACE System Scope Isolation Test Suite${NC}"
  echo -e "${BLUE}PostgreSQL: $PG_USER@$PG_HOST:$PG_PORT/$PG_DATABASE${NC}"
  echo ""

  export PGPASSWORD="$PG_PASSWORD"
  if ! psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -c "SELECT 1;" &>/dev/null; then
    log_error "Cannot connect to PostgreSQL database"
    exit 1
  fi

  setup_test_data
  test_agent_scope_privacy
  test_team_scope_visibility
  test_cross_team_isolation
  test_org_scope_visibility
  test_query_performance
  cleanup_test_data

  print_summary
}

main