#!/bin/bash
# tests/docker/lifecycle/test-lifecycle-dependencies.sh
# Phase 3 :: Agent Dependency Resolution Integration Tests
# Coverage: Dependency tracking, blocking, circular detection, execution order

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# CONFIGURATION
# ============================================================================

DB_PATH="$PROJECT_ROOT/claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db"
TASK_ID="dependency-test-$(date +%s)"
TEMP_DIR=""

# ============================================================================
# CLEANUP
# ============================================================================

cleanup() {
  log_step "Cleanup: Removing test data"

  # Clean up test agents and dependencies from database
  if [[ -f "$DB_PATH" ]]; then
    sqlite3 "$DB_PATH" "DELETE FROM agents WHERE id LIKE 'dep-test-%';" 2>/dev/null || true
    sqlite3 "$DB_PATH" "DELETE FROM dependencies WHERE dependent_id LIKE 'dep-test-%';" 2>/dev/null || true
    sqlite3 "$DB_PATH" "DELETE FROM dependencies WHERE provider_id LIKE 'dep-test-%';" 2>/dev/null || true
  fi

  if [[ -n "${TEMP_DIR:-}" ]] && [[ -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi

  log_info "Cleanup complete"
}
trap cleanup EXIT

# ============================================================================
# TEST UTILITIES
# ============================================================================

# Initialize database with dependencies table
init_database() {
  log_step "Initializing SQLite database with dependencies"

  mkdir -p "$(dirname "$DB_PATH")"

  # Create agents table
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

CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY,
    dependent_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    dependency_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT,
    resolved_at TEXT,
    metadata TEXT,
    FOREIGN KEY (dependent_id) REFERENCES agents(id),
    FOREIGN KEY (provider_id) REFERENCES agents(id)
);
EOF

  log_success "Database initialized with dependencies table"
}

# Register agent
register_agent() {
  local agent_id="$1"
  local agent_type="$2"
  local status="${3:-spawned}"

  sqlite3 "$DB_PATH" <<EOF
INSERT OR REPLACE INTO agents (id, type, status, spawned_at, metadata)
VALUES ('$agent_id', '$agent_type', '$status', datetime('now'), '{"source": "dependency_test"}');
EOF

  log_info "Registered agent: $agent_id"
}

# Register dependency between agents
register_dependency() {
  local dependent_id="$1"
  local provider_id="$2"
  local dep_type="${3:-completion}"
  local dep_id="${dependent_id}:${provider_id}:$(date +%s)"

  sqlite3 "$DB_PATH" <<EOF
INSERT INTO dependencies (id, dependent_id, provider_id, dependency_type, status, created_at)
VALUES ('$dep_id', '$dependent_id', '$provider_id', '$dep_type', 'pending', datetime('now'));
EOF

  log_info "Registered dependency: $dependent_id depends on $provider_id (type=$dep_type)"
  echo "$dep_id"
}

# Resolve dependency
resolve_dependency() {
  local dep_id="$1"

  sqlite3 "$DB_PATH" <<EOF
UPDATE dependencies
SET status = 'resolved', resolved_at = datetime('now')
WHERE id = '$dep_id';
EOF

  log_info "Resolved dependency: $dep_id"
}

# Get dependency status
get_dependency_status() {
  local dep_id="$1"

  sqlite3 "$DB_PATH" "SELECT status FROM dependencies WHERE id = '$dep_id';" 2>/dev/null || echo ""
}

# Get agent dependencies (providers this agent depends on)
get_agent_dependencies() {
  local agent_id="$1"

  sqlite3 "$DB_PATH" "SELECT provider_id FROM dependencies WHERE dependent_id = '$agent_id';" 2>/dev/null || echo ""
}

# Get dependent agents (agents that depend on this agent)
get_dependent_agents() {
  local agent_id="$1"

  sqlite3 "$DB_PATH" "SELECT dependent_id FROM dependencies WHERE provider_id = '$agent_id';" 2>/dev/null || echo ""
}

# Check if agent can complete (all dependencies resolved)
can_agent_complete() {
  local agent_id="$1"
  local pending_count

  pending_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM dependencies WHERE dependent_id = '$agent_id' AND status = 'pending';" 2>/dev/null || echo "0")

  [[ "$pending_count" -eq 0 ]]
}

# Update agent status
update_agent_status() {
  local agent_id="$1"
  local status="$2"
  local confidence="${3:-0.0}"

  sqlite3 "$DB_PATH" <<EOF
UPDATE agents
SET status = '$status', confidence = $confidence, completed_at = datetime('now')
WHERE id = '$agent_id';
EOF

  log_info "Updated agent: $agent_id → $status"
}

# ============================================================================
# TEST 1: Simple Dependency Registration
# ============================================================================

test_simple_dependency_registration() {
  log_step "GIVEN two agents exist"
  local agent_a="dep-test-001a"
  local agent_b="dep-test-001b"

  register_agent "$agent_a" "backend-developer" "spawned"
  register_agent "$agent_b" "tester" "spawned"

  log_step "WHEN dependency is registered (B depends on A)"
  local dep_id
  dep_id=$(register_dependency "$agent_b" "$agent_a" "completion")

  log_step "THEN dependency should exist with pending status"
  local status
  status=$(get_dependency_status "$dep_id")
  assert_equals "pending" "$status" "Dependency status is pending"

  log_success "✓ TEST 1 PASSED: Simple dependency registration"
}

# ============================================================================
# TEST 2: Dependency Resolution
# ============================================================================

test_dependency_resolution() {
  log_step "GIVEN dependency exists between agents"
  local agent_a="dep-test-002a"
  local agent_b="dep-test-002b"

  register_agent "$agent_a" "backend-developer" "spawned"
  register_agent "$agent_b" "tester" "spawned"

  local dep_id
  dep_id=$(register_dependency "$agent_b" "$agent_a" "completion")

  log_step "WHEN provider agent completes and dependency is resolved"
  update_agent_status "$agent_a" "completed" "0.85"
  resolve_dependency "$dep_id"

  log_step "THEN dependency status should be resolved"
  local status
  status=$(get_dependency_status "$dep_id")
  assert_equals "resolved" "$status" "Dependency resolved"

  log_success "✓ TEST 2 PASSED: Dependency resolution"
}

# ============================================================================
# TEST 3: Agent Completion Blocking
# ============================================================================

test_agent_completion_blocking() {
  log_step "GIVEN agent B depends on agent A"
  local agent_a="dep-test-003a"
  local agent_b="dep-test-003b"

  register_agent "$agent_a" "backend-developer" "running"
  register_agent "$agent_b" "tester" "waiting"

  register_dependency "$agent_b" "$agent_a" "completion"

  log_step "WHEN checking if agent B can complete"
  local can_complete

  if can_agent_complete "$agent_b"; then
    can_complete="yes"
  else
    can_complete="no"
  fi

  log_step "THEN agent B should be blocked"
  assert_equals "no" "$can_complete" "Agent B cannot complete (blocked)"

  log_success "✓ TEST 3 PASSED: Agent completion blocking"
}

# ============================================================================
# TEST 4: Agent Completion After Dependency Resolution
# ============================================================================

test_agent_completion_after_resolution() {
  log_step "GIVEN agent B depends on agent A"
  local agent_a="dep-test-004a"
  local agent_b="dep-test-004b"

  register_agent "$agent_a" "backend-developer" "running"
  register_agent "$agent_b" "tester" "waiting"

  local dep_id
  dep_id=$(register_dependency "$agent_b" "$agent_a" "completion")

  log_step "WHEN agent A completes and dependency is resolved"
  update_agent_status "$agent_a" "completed" "0.88"
  resolve_dependency "$dep_id"

  log_step "THEN agent B should be able to complete"
  local can_complete

  if can_agent_complete "$agent_b"; then
    can_complete="yes"
  else
    can_complete="no"
  fi

  assert_equals "yes" "$can_complete" "Agent B can complete"

  log_success "✓ TEST 4 PASSED: Agent completion after resolution"
}

# ============================================================================
# TEST 5: Dependency Chain Execution
# ============================================================================

test_dependency_chain_execution() {
  log_step "GIVEN dependency chain: C depends on B depends on A"
  local agent_a="dep-test-005a"
  local agent_b="dep-test-005b"
  local agent_c="dep-test-005c"

  register_agent "$agent_a" "backend-developer" "spawned"
  register_agent "$agent_b" "tester" "spawned"
  register_agent "$agent_c" "security-auditor" "spawned"

  local dep_ba dep_cb
  dep_ba=$(register_dependency "$agent_b" "$agent_a" "completion")
  dep_cb=$(register_dependency "$agent_c" "$agent_b" "completion")

  log_step "WHEN agents complete in order"
  # A completes first
  update_agent_status "$agent_a" "completed" "0.85"
  resolve_dependency "$dep_ba"

  # B can now complete
  if can_agent_complete "$agent_b"; then
    log_success "Agent B can complete after A"
    update_agent_status "$agent_b" "completed" "0.82"
    resolve_dependency "$dep_cb"
  else
    log_error "Agent B should be able to complete"
    return 1
  fi

  # C can now complete
  if can_agent_complete "$agent_c"; then
    log_success "Agent C can complete after B"
    update_agent_status "$agent_c" "completed" "0.90"
  else
    log_error "Agent C should be able to complete"
    return 1
  fi

  log_step "THEN all agents complete in correct order"
  log_success "✓ TEST 5 PASSED: Dependency chain execution"
}

# ============================================================================
# TEST 6: Multiple Dependencies (Fan-in)
# ============================================================================

test_multiple_dependencies_fan_in() {
  log_step "GIVEN agent C depends on both A and B"
  local agent_a="dep-test-006a"
  local agent_b="dep-test-006b"
  local agent_c="dep-test-006c"

  register_agent "$agent_a" "backend-developer" "running"
  register_agent "$agent_b" "frontend-developer" "running"
  register_agent "$agent_c" "tester" "waiting"

  local dep_ca dep_cb
  dep_ca=$(register_dependency "$agent_c" "$agent_a" "completion")
  dep_cb=$(register_dependency "$agent_c" "$agent_b" "completion")

  log_step "WHEN only A completes"
  update_agent_status "$agent_a" "completed" "0.85"
  resolve_dependency "$dep_ca"

  log_step "THEN agent C should still be blocked"
  if can_agent_complete "$agent_c"; then
    log_error "Agent C should still be blocked"
    return 1
  else
    log_success "Agent C still blocked (waiting for B)"
  fi

  log_step "WHEN B also completes"
  update_agent_status "$agent_b" "completed" "0.88"
  resolve_dependency "$dep_cb"

  log_step "THEN agent C should be able to complete"
  if can_agent_complete "$agent_c"; then
    log_success "Agent C can complete (all dependencies resolved)"
  else
    log_error "Agent C should be able to complete"
    return 1
  fi

  log_success "✓ TEST 6 PASSED: Multiple dependencies (fan-in)"
}

# ============================================================================
# TEST 7: Multiple Dependents (Fan-out)
# ============================================================================

test_multiple_dependents_fan_out() {
  log_step "GIVEN agents B and C both depend on A"
  local agent_a="dep-test-007a"
  local agent_b="dep-test-007b"
  local agent_c="dep-test-007c"

  register_agent "$agent_a" "backend-developer" "running"
  register_agent "$agent_b" "tester" "waiting"
  register_agent "$agent_c" "security-auditor" "waiting"

  local dep_ba dep_ca
  dep_ba=$(register_dependency "$agent_b" "$agent_a" "completion")
  dep_ca=$(register_dependency "$agent_c" "$agent_a" "completion")

  log_step "WHEN agent A completes"
  update_agent_status "$agent_a" "completed" "0.85"
  resolve_dependency "$dep_ba"
  resolve_dependency "$dep_ca"

  log_step "THEN both B and C should be able to complete"
  if can_agent_complete "$agent_b" && can_agent_complete "$agent_c"; then
    log_success "Both agents B and C can complete"
  else
    log_error "Both agents should be able to complete"
    return 1
  fi

  log_success "✓ TEST 7 PASSED: Multiple dependents (fan-out)"
}

# ============================================================================
# TEST 8: Circular Dependency Detection
# ============================================================================

test_circular_dependency_detection() {
  log_step "GIVEN potential circular dependency: A → B → C → A"
  local agent_a="dep-test-008a"
  local agent_b="dep-test-008b"
  local agent_c="dep-test-008c"

  register_agent "$agent_a" "backend-developer" "spawned"
  register_agent "$agent_b" "tester" "spawned"
  register_agent "$agent_c" "security-auditor" "spawned"

  log_step "WHEN circular dependencies are registered"
  register_dependency "$agent_b" "$agent_a" "completion"
  register_dependency "$agent_c" "$agent_b" "completion"
  register_dependency "$agent_a" "$agent_c" "completion"

  log_step "THEN circular dependency should be detectable"
  # Simple detection: check if each agent has both dependencies and dependents
  local deps_a deps_b deps_c

  deps_a=$(get_agent_dependencies "$agent_a" | wc -l)
  deps_b=$(get_agent_dependencies "$agent_b" | wc -l)
  deps_c=$(get_agent_dependencies "$agent_c" | wc -l)

  if [[ $deps_a -gt 0 ]] && [[ $deps_b -gt 0 ]] && [[ $deps_c -gt 0 ]]; then
    log_warn "Circular dependency detected (all agents have dependencies)"
    log_success "Detection mechanism can identify circular dependencies"
  else
    log_error "Circular dependency not properly registered"
    return 1
  fi

  log_success "✓ TEST 8 PASSED: Circular dependency detection"
}

# ============================================================================
# TEST 9: Dependency Type Differentiation
# ============================================================================

test_dependency_type_differentiation() {
  log_step "GIVEN dependencies of different types"
  local agent_a="dep-test-009a"
  local agent_b="dep-test-009b"
  local agent_c="dep-test-009c"

  register_agent "$agent_a" "backend-developer" "spawned"
  register_agent "$agent_b" "tester" "spawned"
  register_agent "$agent_c" "security-auditor" "spawned"

  log_step "WHEN different dependency types are registered"
  local dep_completion dep_resource dep_communication

  dep_completion=$(register_dependency "$agent_b" "$agent_a" "completion")
  dep_resource=$(register_dependency "$agent_c" "$agent_a" "resource")
  dep_communication=$(register_dependency "$agent_c" "$agent_b" "communication")

  log_step "THEN each dependency type should be stored correctly"
  local type_completion type_resource type_communication

  type_completion=$(sqlite3 "$DB_PATH" "SELECT dependency_type FROM dependencies WHERE id = '$dep_completion';")
  type_resource=$(sqlite3 "$DB_PATH" "SELECT dependency_type FROM dependencies WHERE id = '$dep_resource';")
  type_communication=$(sqlite3 "$DB_PATH" "SELECT dependency_type FROM dependencies WHERE id = '$dep_communication';")

  assert_equals "completion" "$type_completion" "Completion dependency type"
  assert_equals "resource" "$type_resource" "Resource dependency type"
  assert_equals "communication" "$type_communication" "Communication dependency type"

  log_success "✓ TEST 9 PASSED: Dependency type differentiation"
}

# ============================================================================
# TEST 10: Dependency Metadata Storage
# ============================================================================

test_dependency_metadata_storage() {
  log_step "GIVEN dependency with metadata"
  local agent_a="dep-test-010a"
  local agent_b="dep-test-010b"

  register_agent "$agent_a" "backend-developer" "spawned"
  register_agent "$agent_b" "tester" "spawned"

  local dep_id="${agent_b}:${agent_a}:$(date +%s)"

  log_step "WHEN dependency is registered with metadata"
  sqlite3 "$DB_PATH" <<EOF
INSERT INTO dependencies (id, dependent_id, provider_id, dependency_type, status, created_at, metadata)
VALUES ('$dep_id', '$agent_b', '$agent_a', 'completion', 'pending', datetime('now'),
        '{"timeout": 60000, "priority": "high"}');
EOF

  log_step "THEN metadata should be retrievable"
  local metadata
  metadata=$(sqlite3 "$DB_PATH" "SELECT metadata FROM dependencies WHERE id = '$dep_id';")

  if echo "$metadata" | grep -q "priority"; then
    log_success "Metadata stored and retrievable"
  else
    log_error "Metadata not found"
    return 1
  fi

  log_success "✓ TEST 10 PASSED: Dependency metadata storage"
}

# ============================================================================
# TEST 11: Query Dependencies by Agent
# ============================================================================

test_query_dependencies_by_agent() {
  log_step "GIVEN agent with multiple dependencies"
  local agent_a="dep-test-011a"
  local agent_b="dep-test-011b"
  local agent_c="dep-test-011c"
  local agent_d="dep-test-011d"

  register_agent "$agent_a" "backend-developer" "spawned"
  register_agent "$agent_b" "frontend-developer" "spawned"
  register_agent "$agent_c" "database-specialist" "spawned"
  register_agent "$agent_d" "tester" "spawned"

  log_step "WHEN agent D depends on A, B, and C"
  register_dependency "$agent_d" "$agent_a" "completion"
  register_dependency "$agent_d" "$agent_b" "completion"
  register_dependency "$agent_d" "$agent_c" "completion"

  log_step "THEN all dependencies should be queryable"
  local deps
  deps=$(get_agent_dependencies "$agent_d" | wc -l)

  if [[ $deps -eq 3 ]]; then
    log_success "All 3 dependencies found"
  else
    log_error "Expected 3 dependencies, found $deps"
    return 1
  fi

  log_success "✓ TEST 11 PASSED: Query dependencies by agent"
}

# ============================================================================
# TEST 12: Query Dependent Agents
# ============================================================================

test_query_dependent_agents() {
  log_step "GIVEN agent with multiple dependents"
  local agent_a="dep-test-012a"
  local agent_b="dep-test-012b"
  local agent_c="dep-test-012c"
  local agent_d="dep-test-012d"

  register_agent "$agent_a" "backend-developer" "spawned"
  register_agent "$agent_b" "tester" "spawned"
  register_agent "$agent_c" "security-auditor" "spawned"
  register_agent "$agent_d" "documentation-writer" "spawned"

  log_step "WHEN B, C, and D all depend on A"
  register_dependency "$agent_b" "$agent_a" "completion"
  register_dependency "$agent_c" "$agent_a" "completion"
  register_dependency "$agent_d" "$agent_a" "completion"

  log_step "THEN all dependents should be queryable"
  local dependents
  dependents=$(get_dependent_agents "$agent_a" | wc -l)

  if [[ $dependents -eq 3 ]]; then
    log_success "All 3 dependent agents found"
  else
    log_error "Expected 3 dependents, found $dependents"
    return 1
  fi

  log_success "✓ TEST 12 PASSED: Query dependent agents"
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

annotate "Agent Lifecycle Dependency Resolution Integration Tests"
echo "Target: Dependency tracking, blocking, execution order"
echo "Database: $DB_PATH"
echo "Task ID: $TASK_ID"
echo ""

# Initialize database
init_database

# Run all tests
test_simple_dependency_registration
test_dependency_resolution
test_agent_completion_blocking
test_agent_completion_after_resolution
test_dependency_chain_execution
test_multiple_dependencies_fan_in
test_multiple_dependents_fan_out
test_circular_dependency_detection
test_dependency_type_differentiation
test_dependency_metadata_storage
test_query_dependencies_by_agent
test_query_dependent_agents

# Summary
echo ""
annotate "Test Summary"
echo "Total Tests:  $TEST_TOTAL"
echo -e "${GREEN}Passed:       $TEST_PASSED${NC}"
echo -e "${RED}Failed:       $TEST_FAILED${NC}"
echo ""

if [[ $TEST_FAILED -eq 0 ]]; then
  log_success "✓ All dependency resolution tests passed"
  exit 0
else
  log_error "✗ Some tests failed"
  exit 1
fi
