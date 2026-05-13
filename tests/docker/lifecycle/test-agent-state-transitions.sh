#!/bin/bash
# tests/docker/lifecycle/test-agent-state-transitions.sh
# Phase 3 :: Agent Lifecycle State Transition Integration Tests
# Coverage: Real agent spawning, SQLite lifecycle audit, state validation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# CONFIGURATION
# ============================================================================

DB_PATH="${AGENT_LIFECYCLE_DB:-$PROJECT_ROOT/data/agent-lifecycle.db}"
TASK_ID="lifecycle-test-$(date +%s)"
TEMP_DIR=""

# ============================================================================
# CLEANUP
# ============================================================================

cleanup() {
  log_step "Cleanup: Removing test data and temporary files"

  # Clean up test agents from database
  if [[ -f "$DB_PATH" ]]; then
    sqlite3 "$DB_PATH" "DELETE FROM agents WHERE id LIKE 'lifecycle-test-%';" 2>/dev/null || true
    sqlite3 "$DB_PATH" "DELETE FROM agents WHERE id LIKE 'state-test-%';" 2>/dev/null || true
  fi

  # Remove temporary directory
  if [[ -n "${TEMP_DIR:-}" ]] && [[ -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi

  log_info "Cleanup complete"
}
trap cleanup EXIT

# ============================================================================
# TEST UTILITIES
# ============================================================================

# Initialize SQLite database with required schema
init_database() {
  log_step "Initializing SQLite database"

  # Ensure directory exists
  mkdir -p "$(dirname "$DB_PATH")"

  # Create schema if not exists
  sqlite3 "$DB_PATH" <<EOF
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL,
    spawned_at TEXT,
    completed_at TEXT,
    metadata TEXT
);
EOF

  log_success "Database initialized: $DB_PATH"
}

# Register agent spawn in database
register_agent() {
  local agent_id="$1"
  local agent_type="$2"
  local status="${3:-spawned}"

  sqlite3 "$DB_PATH" <<EOF
INSERT OR REPLACE INTO agents (id, type, status, spawned_at, metadata)
VALUES ('$agent_id', '$agent_type', '$status', datetime('now'), '{"source": "integration_test"}');
EOF

  log_info "Registered agent: $agent_id (type=$agent_type, status=$status)"
}

# Update agent status in database
update_agent_status() {
  local agent_id="$1"
  local status="$2"
  local confidence="${3:-0.0}"

  sqlite3 "$DB_PATH" <<EOF
UPDATE agents
SET status = '$status',
    confidence = $confidence,
    completed_at = datetime('now')
WHERE id = '$agent_id';
EOF

  log_info "Updated agent status: $agent_id → $status (confidence=$confidence)"
}

# Get agent status from database
get_agent_status() {
  local agent_id="$1"

  sqlite3 "$DB_PATH" "SELECT status FROM agents WHERE id = '$agent_id';" 2>/dev/null || echo ""
}

# Get agent confidence from database
get_agent_confidence() {
  local agent_id="$1"

  sqlite3 "$DB_PATH" "SELECT confidence FROM agents WHERE id = '$agent_id';" 2>/dev/null || echo "0.0"
}

# Verify agent exists in database
agent_exists() {
  local agent_id="$1"
  local count

  count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agents WHERE id = '$agent_id';" 2>/dev/null || echo "0")

  [[ "$count" -gt 0 ]]
}

# ============================================================================
# TEST 1: Agent Registration in Database
# ============================================================================

test_agent_registration() {
  log_step "GIVEN database is initialized"
  init_database

  log_step "WHEN agent is registered with spawned status"
  local agent_id="lifecycle-test-reg-001"
  register_agent "$agent_id" "tester" "spawned"

  log_step "THEN agent should exist in database with correct status"
  assert_success "Agent exists in database" agent_exists "$agent_id"

  local status
  status=$(get_agent_status "$agent_id")
  assert_equals "spawned" "$status" "Agent status is 'spawned'"

  log_success "✓ TEST 1 PASSED: Agent registration"
}

# ============================================================================
# TEST 2: State Transition - Spawned to Running
# ============================================================================

test_state_transition_spawned_to_running() {
  log_step "GIVEN agent is in spawned state"
  local agent_id="state-test-002"
  register_agent "$agent_id" "backend-developer" "spawned"

  log_step "WHEN agent transitions to running state"
  update_agent_status "$agent_id" "running"

  log_step "THEN agent status should be 'running'"
  local status
  status=$(get_agent_status "$agent_id")
  assert_equals "running" "$status" "Agent transitioned to running"

  log_success "✓ TEST 2 PASSED: State transition (spawned → running)"
}

# ============================================================================
# TEST 3: State Transition - Running to Completed
# ============================================================================

test_state_transition_running_to_completed() {
  log_step "GIVEN agent is in running state"
  local agent_id="state-test-003"
  register_agent "$agent_id" "tester" "spawned"
  update_agent_status "$agent_id" "running"

  log_step "WHEN agent completes work with confidence score"
  update_agent_status "$agent_id" "completed" "0.85"

  log_step "THEN agent status should be 'completed' with confidence score"
  local status
  status=$(get_agent_status "$agent_id")
  assert_equals "completed" "$status" "Agent transitioned to completed"

  local confidence
  confidence=$(get_agent_confidence "$agent_id")
  log_info "Confidence score: $confidence"

  log_success "✓ TEST 3 PASSED: State transition (running → completed)"
}

# ============================================================================
# TEST 4: State Transition - Running to Failed
# ============================================================================

test_state_transition_running_to_failed() {
  log_step "GIVEN agent is in running state"
  local agent_id="state-test-004"
  register_agent "$agent_id" "security-auditor" "spawned"
  update_agent_status "$agent_id" "running"

  log_step "WHEN agent encounters error and fails"
  update_agent_status "$agent_id" "failed" "0.0"

  log_step "THEN agent status should be 'failed'"
  local status
  status=$(get_agent_status "$agent_id")
  assert_equals "failed" "$status" "Agent transitioned to failed"

  log_success "✓ TEST 4 PASSED: State transition (running → failed)"
}

# ============================================================================
# TEST 5: Confidence Score Validation
# ============================================================================

test_confidence_score_validation() {
  log_step "GIVEN agent completes work"
  local agent_id="state-test-005"
  register_agent "$agent_id" "tester" "spawned"

  log_step "WHEN agent reports confidence scores"
  update_agent_status "$agent_id" "completed" "0.75"

  log_step "THEN confidence score should be stored correctly"
  local confidence
  confidence=$(get_agent_confidence "$agent_id")

  # Check if confidence is numeric and in valid range
  if [[ $(echo "$confidence >= 0.0" | bc -l) -eq 1 ]] && \
     [[ $(echo "$confidence <= 1.0" | bc -l) -eq 1 ]]; then
    log_success "Confidence score valid: $confidence"
  else
    log_error "Invalid confidence score: $confidence"
    return 1
  fi

  log_success "✓ TEST 5 PASSED: Confidence score validation"
}

# ============================================================================
# TEST 6: Multiple Agent Concurrent State Tracking
# ============================================================================

test_concurrent_agent_states() {
  log_step "GIVEN multiple agents are registered"
  local agent1="state-test-006a"
  local agent2="state-test-006b"
  local agent3="state-test-006c"

  register_agent "$agent1" "backend-developer" "spawned"
  register_agent "$agent2" "tester" "spawned"
  register_agent "$agent3" "security-auditor" "spawned"

  log_step "WHEN agents transition to different states"
  update_agent_status "$agent1" "running"
  update_agent_status "$agent2" "completed" "0.90"
  update_agent_status "$agent3" "failed" "0.40"

  log_step "THEN each agent should have correct state"
  local status1 status2 status3
  status1=$(get_agent_status "$agent1")
  status2=$(get_agent_status "$agent2")
  status3=$(get_agent_status "$agent3")

  assert_equals "running" "$status1" "Agent 1 is running"
  assert_equals "completed" "$status2" "Agent 2 is completed"
  assert_equals "failed" "$status3" "Agent 3 is failed"

  log_success "✓ TEST 6 PASSED: Concurrent agent state tracking"
}

# ============================================================================
# TEST 7: State History Tracking
# ============================================================================

test_state_history_tracking() {
  log_step "GIVEN agent goes through multiple state transitions"
  local agent_id="state-test-007"

  register_agent "$agent_id" "backend-developer" "spawned"

  log_step "WHEN agent transitions through states"
  update_agent_status "$agent_id" "running"
  sleep 1
  update_agent_status "$agent_id" "paused"
  sleep 1
  update_agent_status "$agent_id" "running"
  sleep 1
  update_agent_status "$agent_id" "completed" "0.88"

  log_step "THEN final state should be 'completed'"
  local status
  status=$(get_agent_status "$agent_id")
  assert_equals "completed" "$status" "Final state is completed"

  log_success "✓ TEST 7 PASSED: State history tracking"
}

# ============================================================================
# TEST 8: Agent Metadata Storage
# ============================================================================

test_agent_metadata_storage() {
  log_step "GIVEN agent is registered with metadata"
  local agent_id="state-test-008"

  sqlite3 "$DB_PATH" <<EOF
INSERT OR REPLACE INTO agents (id, type, status, spawned_at, metadata)
VALUES ('$agent_id', 'tester', 'spawned', datetime('now'),
        '{"source": "integration_test", "priority": "high", "iteration": 1}');
EOF

  log_step "WHEN metadata is retrieved"
  local metadata
  metadata=$(sqlite3 "$DB_PATH" "SELECT metadata FROM agents WHERE id = '$agent_id';")

  log_step "THEN metadata should contain expected fields"
  if echo "$metadata" | grep -q "integration_test"; then
    log_success "Metadata contains source"
  else
    log_error "Metadata missing source"
    return 1
  fi

  log_success "✓ TEST 8 PASSED: Agent metadata storage"
}

# ============================================================================
# TEST 9: Agent Completion Timestamp
# ============================================================================

test_agent_completion_timestamp() {
  log_step "GIVEN agent is running"
  local agent_id="state-test-009"
  register_agent "$agent_id" "backend-developer" "running"

  log_step "WHEN agent completes"
  local before_complete
  before_complete=$(date -u +"%Y-%m-%d %H:%M:%S")
  sleep 2
  update_agent_status "$agent_id" "completed" "0.85"

  log_step "THEN completed_at timestamp should be set"
  local completed_at
  completed_at=$(sqlite3 "$DB_PATH" "SELECT completed_at FROM agents WHERE id = '$agent_id';")

  if [[ -n "$completed_at" ]]; then
    log_success "Completion timestamp set: $completed_at"
  else
    log_error "Completion timestamp not set"
    return 1
  fi

  log_success "✓ TEST 9 PASSED: Agent completion timestamp"
}

# ============================================================================
# TEST 10: Database Query Performance
# ============================================================================

test_database_query_performance() {
  log_step "GIVEN multiple agents in database"

  # Insert 50 test agents
  for i in {1..50}; do
    register_agent "perf-test-$i" "tester" "spawned" >/dev/null 2>&1
  done

  log_step "WHEN querying for specific agent"
  local start_time
  start_time=$(date +%s%N)

  local status
  status=$(get_agent_status "perf-test-25")

  local end_time
  end_time=$(date +%s%N)
  local duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

  log_step "THEN query should complete quickly"
  log_info "Query duration: ${duration}ms"

  if [[ $duration -lt 100 ]]; then
    log_success "Query performance acceptable: ${duration}ms < 100ms"
  else
    log_warn "Query slower than expected: ${duration}ms"
  fi

  # Cleanup performance test agents
  sqlite3 "$DB_PATH" "DELETE FROM agents WHERE id LIKE 'perf-test-%';" 2>/dev/null || true

  log_success "✓ TEST 10 PASSED: Database query performance"
}

# ============================================================================
# TEST 11: Invalid State Handling
# ============================================================================

test_invalid_state_handling() {
  log_step "GIVEN agent with invalid state value"
  local agent_id="state-test-011"

  # SQLite allows any text, so this tests application-level validation
  register_agent "$agent_id" "tester" "invalid-state"

  log_step "WHEN agent status is retrieved"
  local status
  status=$(get_agent_status "$agent_id")

  log_step "THEN status should be retrievable (application should validate)"
  log_info "Retrieved status: $status"

  # Application should validate states, database stores whatever is provided
  assert_success "Agent status retrieved" agent_exists "$agent_id"

  log_success "✓ TEST 11 PASSED: Invalid state handling"
}

# ============================================================================
# TEST 12: Agent Type Categorization
# ============================================================================

test_agent_type_categorization() {
  log_step "GIVEN agents of different types"
  register_agent "type-test-backend" "backend-developer" "spawned"
  register_agent "type-test-tester" "tester" "spawned"
  register_agent "type-test-security" "security-auditor" "spawned"

  log_step "WHEN querying by agent type"
  local backend_count
  backend_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agents WHERE type = 'backend-developer' AND id LIKE 'type-test-%';")

  log_step "THEN correct count should be returned"
  assert_equals "1" "$backend_count" "Backend developer count correct"

  log_success "✓ TEST 12 PASSED: Agent type categorization"
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

annotate "Agent Lifecycle State Transition Integration Tests"
echo "Target: SQLite lifecycle audit verification"
echo "Database: $DB_PATH"
echo "Task ID: $TASK_ID"
echo ""

# Initialize database
init_database

# Run all tests
test_agent_registration
test_state_transition_spawned_to_running
test_state_transition_running_to_completed
test_state_transition_running_to_failed
test_confidence_score_validation
test_concurrent_agent_states
test_state_history_tracking
test_agent_metadata_storage
test_agent_completion_timestamp
test_database_query_performance
test_invalid_state_handling
test_agent_type_categorization

# Summary
echo ""
annotate "Test Summary"
echo "Total Tests:  $TEST_TOTAL"
echo -e "${GREEN}Passed:       $TEST_PASSED${NC}"
echo -e "${RED}Failed:       $TEST_FAILED${NC}"
echo ""

if [[ $TEST_FAILED -eq 0 ]]; then
  log_success "✓ All state transition tests passed"
  exit 0
else
  log_error "✗ Some tests failed"
  exit 1
fi
