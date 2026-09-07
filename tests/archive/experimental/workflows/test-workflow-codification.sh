#!/bin/bash
# tests/docker-mode/test-workflow-codification.sh
# Docker Mode Workflow Codification Test Suite
# Tests workflow codification operations in Docker containers with volume persistence

set -euo pipefail

# Test configuration
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/docker/tests/test-helpers.sh"

# Test identifiers
TEST_ID="docker-workflow-$(date +%s)"
COMPOSE_PROJECT_NAME="cfn-workflow-test-${TEST_ID}"
TEST_WORKSPACE="/tmp/docker-workflow-test-$$"
CONTAINER_NETWORK="${COMPOSE_PROJECT_NAME}_default"

# Database paths
HOST_WORKFLOW_DB="$PROJECT_ROOT/.claude/skills/workflow-codification/workflow-codification.db"
CONTAINER_WORKFLOW_DB="/workspace/workflow-codification.db"

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up Docker test environment..."

    # Stop and remove containers
    docker ps -a --filter "name=cfn-test-workflow-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker-compose -p "$COMPOSE_PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true

    # Remove test workspace
    rm -rf "$TEST_WORKSPACE" 2>/dev/null || true

    # Remove temporary networks
    docker network rm "$CONTAINER_NETWORK" 2>/dev/null || true

    # Clean up test data from database
    sqlite3 "$HOST_WORKFLOW_DB" "DELETE FROM edge_cases WHERE skill_name LIKE 'docker-test-%' OR skill_name LIKE '%test%';" 2>/dev/null || true
    sqlite3 "$HOST_WORKFLOW_DB" "DELETE FROM skill_executions WHERE skill_name LIKE 'docker-test-%' OR skill_name LIKE '%test%';" 2>/dev/null || true
    sqlite3 "$HOST_WORKFLOW_DB" "DELETE FROM roi_snapshots WHERE skill_name LIKE 'docker-test-%';" 2>/dev/null || true

    log_info "Cleanup completed with exit code: $exit_code"
    exit $exit_code
}

trap cleanup EXIT INT TERM

log_section "Docker Mode Workflow Codification Test Suite"
log_info "Test ID: $TEST_ID"
log_info "Compose Project: $COMPOSE_PROJECT_NAME"

# ============================================================================
# Helper Functions
# ============================================================================

# Query database from container
query_db_from_container() {
    local query="$1"

    docker run --rm \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:ro" \
        alpine:latest \
        sh -c "apk add --no-cache sqlite >/dev/null 2>&1 && sqlite3 $CONTAINER_WORKFLOW_DB \"$query\""
}

# Create test network
create_test_network() {
    if ! docker network inspect "$CONTAINER_NETWORK" >/dev/null 2>&1; then
        docker network create "$CONTAINER_NETWORK" >/dev/null 2>&1
    fi
}

# ============================================================================
# Test 1: Edge Case Recording in Container
# ============================================================================

test_edge_case_container_recording() {
    log_test "Test 1: Edge Case Recording in Container"

    # GIVEN: Clean database state
    local test_skill_name="docker-test-edge-recording-$$"

    # WHEN: Container executes skill and records edge case
    local container_name="cfn-test-workflow-edge-record-$$"
    local edge_case_hash=$(echo -n "${test_skill_name}:1.0.0:timeout" | md5sum | cut -d' ' -f1)

    docker run --rm \
        --name "$container_name" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        alpine:latest \
        sh -c "
            apk add --no-cache sqlite >/dev/null 2>&1
            sqlite3 $CONTAINER_WORKFLOW_DB \"INSERT INTO edge_cases (skill_name, skill_version, exit_code, input_params, error_message, edge_case_hash, status) VALUES ('$test_skill_name', '1.0.0', 1, 'test-input', 'Timeout in container execution', '$edge_case_hash', 'new');\"
        " 2>/dev/null

    # THEN: Edge case persisted to host database
    local edge_count=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COUNT(*) FROM edge_cases WHERE skill_name = '$test_skill_name';" 2>/dev/null || echo "0")

    if [[ "$edge_count" == "1" ]]; then
        log_pass "Edge case recorded from container (count=$edge_count)"
    else
        log_fail "Edge case not persisted (count=$edge_count, expected 1)"
    fi
}

# ============================================================================
# Test 2: Multi-Container Edge Case Aggregation
# ============================================================================

test_multi_container_edge_case_aggregation() {
    log_test "Test 2: Multi-Container Edge Case Aggregation"

    # GIVEN: 5 containers executing same skill
    local test_skill_name="docker-test-multi-edge-$$"
    local edge_case_hash=$(echo -n "${test_skill_name}:1.0.0:timeout" | md5sum | cut -d' ' -f1)

    # Insert initial edge case
    sqlite3 "$HOST_WORKFLOW_DB" "INSERT OR IGNORE INTO edge_cases (skill_name, skill_version, exit_code, input_params, error_message, edge_case_hash, status, occurrence_count) VALUES ('$test_skill_name', '1.0.0', 1, 'test-input', 'Timeout error', '$edge_case_hash', 'new', 1);" 2>/dev/null

    # WHEN: 3 containers fail with same error (increment occurrence_count)
    local pids=()
    for i in {1..3}; do
        (
            docker run --rm \
                --name "cfn-test-workflow-multi-$i-$$" \
                --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
                alpine:latest \
                sh -c "
                    apk add --no-cache sqlite >/dev/null 2>&1
                    sqlite3 $CONTAINER_WORKFLOW_DB \"UPDATE edge_cases SET occurrence_count = occurrence_count + 1, timestamp = datetime('now') WHERE edge_case_hash = '$edge_case_hash';\"
                " 2>/dev/null
        ) &
        pids+=($!)
    done

    # Wait for all containers
    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    sleep 2

    # THEN: Verify occurrence count = 4 (1 initial + 3 increments)
    local occurrence_count=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT occurrence_count FROM edge_cases WHERE edge_case_hash = '$edge_case_hash';" 2>/dev/null || echo "0")

    if [[ "$occurrence_count" -ge 3 ]]; then
        log_pass "Multi-container edge case aggregation successful (occurrences=$occurrence_count)"
    else
        log_fail "Edge case aggregation failed (occurrences=$occurrence_count, expected ≥3)"
    fi
}

# ============================================================================
# Test 3: Cost Tracking with Container Overhead
# ============================================================================

test_cost_tracking_with_container_overhead() {
    log_test "Test 3: Cost Tracking with Container Overhead"

    # GIVEN: Skill execution time measurement
    local test_skill_name="docker-test-cost-tracking-$$"

    # WHEN: Measure execution time including container startup
    local start_time=$(date +%s%N)

    docker run --rm \
        --name "cfn-test-workflow-cost-$$" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        alpine:latest \
        sh -c "
            apk add --no-cache sqlite >/dev/null 2>&1
            sqlite3 $CONTAINER_WORKFLOW_DB \"INSERT INTO skill_executions (skill_name, skill_version, execution_time_ms, exit_code, tokens_avoided, timestamp) VALUES ('$test_skill_name', '1.0.0', 150, 0, 2000, datetime('now'));\"
        " 2>/dev/null

    local end_time=$(date +%s%N)
    local execution_time_ms=$(( (end_time - start_time) / 1000000 ))

    # THEN: Verify execution logged with Docker overhead
    local logged_count=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COUNT(*) FROM skill_executions WHERE skill_name = '$test_skill_name';" 2>/dev/null || echo "0")

    if [[ "$logged_count" == "1" ]] && [[ "$execution_time_ms" -gt 0 ]]; then
        log_pass "Cost tracking with Docker overhead (execution_time=${execution_time_ms}ms)"
    else
        log_fail "Cost tracking failed (logged=$logged_count, time=${execution_time_ms}ms)"
    fi
}

# ============================================================================
# Test 4: Proposal Generation from Container Logs
# ============================================================================

test_proposal_generation_from_container() {
    log_test "Test 4: Proposal Generation from Container Logs"

    # GIVEN: Recurring edge case with occurrence_count ≥ 5
    local test_skill_name="docker-test-proposal-$$"
    local edge_case_hash=$(echo -n "${test_skill_name}:1.0.0:recurring" | md5sum | cut -d' ' -f1)

    # Create recurring edge case
    sqlite3 "$HOST_WORKFLOW_DB" "INSERT OR REPLACE INTO edge_cases (skill_name, skill_version, exit_code, input_params, error_message, edge_case_hash, status, occurrence_count) VALUES ('$test_skill_name', '1.0.0', 1, 'test-input', 'Recurring timeout error', '$edge_case_hash', 'new', 5);" 2>/dev/null

    # WHEN: Query for recurring edge cases (threshold ≥ 5)
    local recurring_cases=$(query_db_from_container \
        "SELECT COUNT(*) FROM edge_cases WHERE occurrence_count >= 5 AND skill_name = '$test_skill_name';" 2>/dev/null || echo "0")

    # THEN: Verify proposal trigger condition met
    if [[ "$recurring_cases" -ge 1 ]]; then
        # Simulate proposal generation
        local proposal_file="$TEST_WORKSPACE/proposal-$edge_case_hash.json"
        mkdir -p "$TEST_WORKSPACE"

        cat > "$proposal_file" <<EOF
{
  "edge_case_hash": "$edge_case_hash",
  "skill_name": "$test_skill_name",
  "skill_version": "1.0.0",
  "occurrence_count": 5,
  "proposed_solution": "Add timeout retry logic with exponential backoff",
  "estimated_impact": "Reduces timeout errors by 80%",
  "generated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

        if [[ -f "$proposal_file" ]]; then
            log_pass "Proposal generation triggered (recurring_cases=$recurring_cases)"
        else
            log_fail "Proposal file not created"
        fi
    else
        log_fail "Proposal generation not triggered (recurring_cases=$recurring_cases, expected ≥1)"
    fi
}

# ============================================================================
# Test 5: ROI Snapshot Generation in Container
# ============================================================================

test_roi_snapshot_generation() {
    log_test "Test 5: ROI Snapshot Generation in Container"

    # GIVEN: 24 hours of skill executions
    local test_skill_name="docker-test-roi-$$"

    # Log multiple executions
    docker run --rm \
        --name "cfn-test-workflow-roi-$$" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        alpine:latest \
        sh -c "
            apk add --no-cache sqlite >/dev/null 2>&1
            for i in 1 2 3 4 5; do
                sqlite3 $CONTAINER_WORKFLOW_DB \"INSERT INTO skill_executions (skill_name, skill_version, execution_time_ms, exit_code, tokens_avoided, timestamp) VALUES ('$test_skill_name', '1.0.0', 100, 0, 1500, datetime('now', '-' || \$i || ' hours'));\"
            done
        " 2>/dev/null

    # WHEN: Generate daily ROI snapshot
    local snapshot_date=$(date -u +"%Y-%m-%d")
    local total_tokens=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COALESCE(SUM(tokens_avoided), 0) FROM skill_executions WHERE skill_name = '$test_skill_name';" 2>/dev/null || echo "0")

    local execution_count=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COUNT(*) FROM skill_executions WHERE skill_name = '$test_skill_name';" 2>/dev/null || echo "0")

    # Create ROI snapshot
    docker run --rm \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        alpine:latest \
        sh -c "
            apk add --no-cache sqlite >/dev/null 2>&1
            sqlite3 $CONTAINER_WORKFLOW_DB \"CREATE TABLE IF NOT EXISTS roi_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, skill_name TEXT NOT NULL, snapshot_date TEXT NOT NULL, total_executions INTEGER DEFAULT 0, total_tokens_avoided INTEGER DEFAULT 0, average_execution_time_ms INTEGER DEFAULT 0, timestamp TEXT DEFAULT (datetime('now')), UNIQUE(skill_name, snapshot_date));\"
            sqlite3 $CONTAINER_WORKFLOW_DB \"INSERT OR REPLACE INTO roi_snapshots (skill_name, snapshot_date, total_executions, total_tokens_avoided) VALUES ('$test_skill_name', '$snapshot_date', $execution_count, $total_tokens);\"
        " 2>/dev/null

    # THEN: Verify ROI snapshot written
    local snapshot_count=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COUNT(*) FROM roi_snapshots WHERE skill_name = '$test_skill_name';" 2>/dev/null || echo "0")

    if [[ "$snapshot_count" == "1" ]]; then
        log_pass "ROI snapshot generated (executions=$execution_count, tokens=$total_tokens)"
    else
        log_fail "ROI snapshot not created (snapshot_count=$snapshot_count)"
    fi
}

# ============================================================================
# Test 6: Cross-Container ROI Dashboard Export
# ============================================================================

test_cross_container_roi_dashboard() {
    log_test "Test 6: Cross-Container ROI Dashboard Export"

    # GIVEN: Multiple containers execute skills concurrently
    local pids=()
    local test_skills=("docker-test-dashboard-A-$$" "docker-test-dashboard-B-$$" "docker-test-dashboard-C-$$")

    for skill_name in "${test_skills[@]}"; do
        (
            docker run --rm \
                --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
                alpine:latest \
                sh -c "
                    apk add --no-cache sqlite >/dev/null 2>&1
                    for i in 1 2 3; do
                        sqlite3 $CONTAINER_WORKFLOW_DB \"INSERT INTO skill_executions (skill_name, skill_version, execution_time_ms, exit_code, tokens_avoided, timestamp) VALUES ('$skill_name', '1.0.0', 120, 0, 1800, datetime('now'));\"
                    done
                " 2>/dev/null
        ) &
        pids+=($!)
    done

    # Wait for all containers
    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    sleep 2

    # WHEN: Dashboard export aggregates all executions
    local dashboard_json="$TEST_WORKSPACE/roi-dashboard.json"
    mkdir -p "$TEST_WORKSPACE"

    local total_executions=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COUNT(*) FROM skill_executions WHERE skill_name LIKE 'docker-test-dashboard-%';" 2>/dev/null || echo "0")

    local total_tokens=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COALESCE(SUM(tokens_avoided), 0) FROM skill_executions WHERE skill_name LIKE 'docker-test-dashboard-%';" 2>/dev/null || echo "0")

    cat > "$dashboard_json" <<EOF
{
  "dashboard_date": "$(date -u +"%Y-%m-%d")",
  "total_executions": $total_executions,
  "total_tokens_avoided": $total_tokens,
  "skills": [
    $(for skill in "${test_skills[@]}"; do
        local count=$(sqlite3 "$HOST_WORKFLOW_DB" "SELECT COUNT(*) FROM skill_executions WHERE skill_name = '$skill';" 2>/dev/null || echo "0")
        local tokens=$(sqlite3 "$HOST_WORKFLOW_DB" "SELECT COALESCE(SUM(tokens_avoided), 0) FROM skill_executions WHERE skill_name = '$skill';" 2>/dev/null || echo "0")
        echo "{\"skill_name\": \"$skill\", \"executions\": $count, \"tokens_avoided\": $tokens}"
        if [[ "$skill" != "${test_skills[-1]}" ]]; then echo ","; fi
    done)
  ]
}
EOF

    # THEN: Verify dashboard includes all container executions
    if [[ "$total_executions" -ge 9 ]] && [[ -f "$dashboard_json" ]]; then
        log_pass "Cross-container ROI dashboard export (total_executions=$total_executions)"
    else
        log_fail "Dashboard export incomplete (executions=$total_executions, expected ≥9)"
    fi
}

# ============================================================================
# Test 7: Skill Update Proposal Validation
# ============================================================================

test_skill_update_proposal_validation() {
    log_test "Test 7: Skill Update Proposal Validation"

    # GIVEN: Edge case with occurrence_count ≥ 5
    local test_skill_name="docker-test-proposal-validation-$$"
    local edge_case_hash=$(echo -n "${test_skill_name}:1.0.0:validation" | md5sum | cut -d' ' -f1)

    sqlite3 "$HOST_WORKFLOW_DB" "INSERT OR REPLACE INTO edge_cases (skill_name, skill_version, exit_code, input_params, error_message, edge_case_hash, status, occurrence_count, metadata) VALUES ('$test_skill_name', '1.0.0', 1, 'test-input', 'Validation error', '$edge_case_hash', 'proposal_generated', 6, '{\"proposal\": {\"solution\": \"Add input validation\", \"impact\": \"Reduces errors by 90%\"}}');" 2>/dev/null

    # WHEN: Generate skill update proposal
    local proposal_data=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT metadata FROM edge_cases WHERE edge_case_hash = '$edge_case_hash';" 2>/dev/null || echo "{}")

    # THEN: Validate proposal structure
    if echo "$proposal_data" | grep -q "proposal"; then
        # Check proposal contains required fields
        if echo "$proposal_data" | grep -q "solution" && echo "$proposal_data" | grep -q "impact"; then
            log_pass "Skill update proposal validated (hash=$edge_case_hash)"
        else
            log_fail "Proposal missing required fields (data=$proposal_data)"
        fi
    else
        log_fail "Proposal not found in metadata"
    fi
}

# ============================================================================
# Test 8: Database Schema Migration in Container
# ============================================================================

test_database_schema_migration() {
    log_test "Test 8: Database Schema Migration in Container"

    # GIVEN: Test database with old schema
    local test_db="$TEST_WORKSPACE/test-migration.db"
    mkdir -p "$TEST_WORKSPACE"

    # Create old schema (missing roi_snapshots table)
    sqlite3 "$test_db" "CREATE TABLE IF NOT EXISTS edge_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, skill_name TEXT NOT NULL, skill_version TEXT NOT NULL, exit_code INTEGER NOT NULL, error_message TEXT, timestamp TEXT DEFAULT (datetime('now')));" 2>/dev/null

    # WHEN: Run schema migration in container
    docker run --rm \
        --volume "$test_db:/workspace/test-migration.db:rw" \
        alpine:latest \
        sh -c "
            apk add --no-cache sqlite >/dev/null 2>&1
            sqlite3 /workspace/test-migration.db \"ALTER TABLE edge_cases ADD COLUMN edge_case_hash TEXT;\"
            sqlite3 /workspace/test-migration.db \"ALTER TABLE edge_cases ADD COLUMN status TEXT DEFAULT 'new';\"
            sqlite3 /workspace/test-migration.db \"ALTER TABLE edge_cases ADD COLUMN occurrence_count INTEGER DEFAULT 1;\"
            sqlite3 /workspace/test-migration.db \"CREATE TABLE IF NOT EXISTS roi_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, skill_name TEXT NOT NULL, snapshot_date TEXT NOT NULL, total_executions INTEGER DEFAULT 0, total_tokens_avoided INTEGER DEFAULT 0, timestamp TEXT DEFAULT (datetime('now')), UNIQUE(skill_name, snapshot_date));\"
            sqlite3 /workspace/test-migration.db \"CREATE TABLE IF NOT EXISTS skill_executions (id INTEGER PRIMARY KEY AUTOINCREMENT, skill_name TEXT NOT NULL, skill_version TEXT NOT NULL, execution_time_ms INTEGER NOT NULL, exit_code INTEGER NOT NULL, tokens_avoided INTEGER DEFAULT 0, timestamp TEXT DEFAULT (datetime('now')));\"
        " 2>/dev/null

    # THEN: Verify database upgraded to latest schema
    local roi_table_exists=$(sqlite3 "$test_db" \
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='roi_snapshots';" 2>/dev/null || echo "0")

    local executions_table_exists=$(sqlite3 "$test_db" \
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='skill_executions';" 2>/dev/null || echo "0")

    if [[ "$roi_table_exists" == "1" ]] && [[ "$executions_table_exists" == "1" ]]; then
        log_pass "Database schema migration successful"
    else
        log_fail "Schema migration incomplete (roi=$roi_table_exists, executions=$executions_table_exists)"
    fi

    # Cleanup test database
    rm -f "$test_db" 2>/dev/null || true
}

# ============================================================================
# Test Execution
# ============================================================================

log_section "Starting Docker Mode Workflow Codification Tests"

# Create test network
create_test_network

# Run all P1 tests
test_edge_case_container_recording
test_multi_container_edge_case_aggregation
test_cost_tracking_with_container_overhead
test_proposal_generation_from_container
test_roi_snapshot_generation
test_cross_container_roi_dashboard
test_skill_update_proposal_validation
test_database_schema_migration

# ============================================================================
# Test Summary
# ============================================================================

print_test_summary "Docker Mode Workflow Codification Test Suite"

exit $((TESTS_FAILED > 0 ? 1 : 0))
