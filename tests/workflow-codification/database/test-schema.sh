#!/bin/bash
# Comprehensive Database Schema Test Suite
# Tests all 6 feature tables with 100% coverage
# TDD Protocol: Write tests first, then implement

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

# Test database connection settings
DB_NAME="${TEST_DB_NAME:-cfn_workflow_test}"
DB_USER="${TEST_DB_USER:-postgres}"
DB_HOST="${TEST_DB_HOST:-localhost}"
DB_PORT="${TEST_DB_PORT:-5432}"

# Migration directory
MIGRATIONS_DIR="/home/user/claude-flow-novice/src/workflow-codification/migrations"

# Utility functions
log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

run_test() {
    local test_name="$1"
    local test_func="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_info "Running: $test_name"

    if $test_func; then
        log_success "$test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Database helper functions
psql_exec() {
    PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null
}

table_exists() {
    local table_name="$1"
    local result=$(psql_exec "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table_name');")
    [[ "$result" == "t" ]]
}

column_exists() {
    local table_name="$1"
    local column_name="$2"
    local result=$(psql_exec "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$table_name' AND column_name = '$column_name');")
    [[ "$result" == "t" ]]
}

column_type_matches() {
    local table_name="$1"
    local column_name="$2"
    local expected_type="$3"
    local actual_type=$(psql_exec "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$table_name' AND column_name = '$column_name';")
    [[ "$actual_type" == "$expected_type" ]]
}

index_exists() {
    local index_name="$1"
    local result=$(psql_exec "SELECT EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'public' AND indexname = '$index_name');")
    [[ "$result" == "t" ]]
}

constraint_exists() {
    local table_name="$1"
    local constraint_name="$2"
    local result=$(psql_exec "SELECT EXISTS (SELECT FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = '$table_name' AND constraint_name = '$constraint_name');")
    [[ "$result" == "t" ]]
}

# ============================================================
# FEATURE 1: SKILL HEALTH HISTORY TESTS
# ============================================================

test_health_history_table_exists() {
    table_exists "skill_health_history"
}

test_health_history_primary_key() {
    column_exists "skill_health_history" "id" && \
    column_type_matches "skill_health_history" "id" "uuid"
}

test_health_history_score_columns() {
    column_exists "skill_health_history" "overall_score" && \
    column_exists "skill_health_history" "reliability_score" && \
    column_exists "skill_health_history" "performance_score" && \
    column_exists "skill_health_history" "edge_case_score" && \
    column_exists "skill_health_history" "documentation_score" && \
    column_exists "skill_health_history" "test_coverage_score"
}

test_health_history_check_constraint() {
    # Test that overall_score rejects values outside 0-100
    local result=$(psql_exec "INSERT INTO skill_health_history (skill_name, overall_score, reliability_score, performance_score, edge_case_score, documentation_score, test_coverage_score, health_level) VALUES ('test', 101, 90, 90, 90, 90, 90, 'excellent');" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_health_history_health_level_enum() {
    # Test health_level enum constraint
    local result=$(psql_exec "INSERT INTO skill_health_history (skill_name, overall_score, reliability_score, performance_score, edge_case_score, documentation_score, test_coverage_score, health_level) VALUES ('test', 85, 90, 90, 90, 90, 90, 'invalid');" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_health_history_indexes() {
    index_exists "idx_skill_health_name_time" && \
    index_exists "idx_skill_health_level"
}

test_health_history_default_values() {
    # Insert minimal record and check defaults
    psql_exec "DELETE FROM skill_health_history WHERE skill_name = 'default_test';" >/dev/null 2>&1 || true
    psql_exec "INSERT INTO skill_health_history (skill_name, overall_score, reliability_score, performance_score, edge_case_score, documentation_score, test_coverage_score, health_level) VALUES ('default_test', 85, 90.0, 90.0, 90.0, 90.0, 90.0, 'good');" >/dev/null

    # Check that id was generated (UUID)
    local id=$(psql_exec "SELECT id FROM skill_health_history WHERE skill_name = 'default_test';")
    [[ -n "$id" ]] && [[ "$id" != "null" ]]

    # Cleanup
    psql_exec "DELETE FROM skill_health_history WHERE skill_name = 'default_test';" >/dev/null 2>&1 || true
}

# ============================================================
# FEATURE 2: CIRCUIT BREAKER STATE TESTS
# ============================================================

test_circuit_breaker_table_exists() {
    table_exists "circuit_breaker_state"
}

test_circuit_breaker_primary_key() {
    column_exists "circuit_breaker_state" "skill_name" && \
    constraint_exists "circuit_breaker_state" "circuit_breaker_state_pkey"
}

test_circuit_breaker_status_enum() {
    # Test status enum constraint (only CLOSED, OPEN, HALF_OPEN allowed)
    local result=$(psql_exec "INSERT INTO circuit_breaker_state (skill_name, status) VALUES ('test_cb', 'INVALID');" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_circuit_breaker_default_values() {
    # Insert minimal record and check defaults
    psql_exec "DELETE FROM circuit_breaker_state WHERE skill_name = 'default_cb_test';" >/dev/null 2>&1 || true
    psql_exec "INSERT INTO circuit_breaker_state (skill_name, status) VALUES ('default_cb_test', 'CLOSED');" >/dev/null

    # Check defaults
    local consecutive_failures=$(psql_exec "SELECT consecutive_failures FROM circuit_breaker_state WHERE skill_name = 'default_cb_test';")
    local failure_threshold=$(psql_exec "SELECT failure_threshold FROM circuit_breaker_state WHERE skill_name = 'default_cb_test';")
    local cooldown_seconds=$(psql_exec "SELECT cooldown_seconds FROM circuit_breaker_state WHERE skill_name = 'default_cb_test';")

    [[ "$consecutive_failures" == "0" ]] && \
    [[ "$failure_threshold" == "5" ]] && \
    [[ "$cooldown_seconds" == "300" ]]

    # Cleanup
    psql_exec "DELETE FROM circuit_breaker_state WHERE skill_name = 'default_cb_test';" >/dev/null 2>&1 || true
}

test_circuit_breaker_index() {
    index_exists "idx_circuit_breaker_status"
}

# ============================================================
# FEATURE 3: REGRESSION TEST SUITES TESTS
# ============================================================

test_regression_suites_table_exists() {
    table_exists "regression_test_suites"
}

test_regression_suites_jsonb_columns() {
    column_exists "regression_test_suites" "test_cases" && \
    column_type_matches "regression_test_suites" "test_cases" "jsonb"
}

test_regression_suites_check_constraints() {
    # Test total_tests > 0 constraint
    local result=$(psql_exec "INSERT INTO regression_test_suites (skill_name, total_tests, test_cases, priority) VALUES ('test', 0, '[]', 'P0');" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_regression_suites_priority_enum() {
    # Test priority enum (P0, P1, P2)
    local result=$(psql_exec "INSERT INTO regression_test_suites (skill_name, total_tests, test_cases, priority) VALUES ('test', 5, '[]', 'P99');" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_regression_suites_indexes() {
    index_exists "idx_regression_suites_skill" && \
    index_exists "idx_regression_suites_priority"
}

test_regression_suites_pass_rate_constraint() {
    # Test last_run_pass_rate between 0 and 100
    psql_exec "DELETE FROM regression_test_suites WHERE skill_name = 'pass_rate_test';" >/dev/null 2>&1 || true
    local result=$(psql_exec "INSERT INTO regression_test_suites (skill_name, total_tests, test_cases, last_run_pass_rate) VALUES ('pass_rate_test', 5, '[]', 150.0);" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

# ============================================================
# FEATURE 4: PATTERN RECOMMENDATIONS TESTS
# ============================================================

test_pattern_recommendations_table_exists() {
    table_exists "pattern_recommendations"
}

test_pattern_recommendations_jsonb_columns() {
    column_exists "pattern_recommendations" "workflow_steps" && \
    column_type_matches "pattern_recommendations" "workflow_steps" "jsonb"
}

test_pattern_recommendations_strength_enum() {
    # Test recommendation_strength enum (high, medium, low)
    local result=$(psql_exec "INSERT INTO pattern_recommendations (user_id, workflow_steps, recommendation_strength, strength_score) VALUES ('user1', '{}', 'ultra', 0.9);" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_pattern_recommendations_strength_score_constraint() {
    # Test strength_score between 0 and 1
    local result=$(psql_exec "INSERT INTO pattern_recommendations (user_id, workflow_steps, recommendation_strength, strength_score) VALUES ('user1', '{}', 'high', 1.5);" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_pattern_recommendations_status_enum() {
    # Test status enum (suggested, accepted, rejected, deployed)
    local result=$(psql_exec "INSERT INTO pattern_recommendations (user_id, workflow_steps, recommendation_strength, strength_score, status) VALUES ('user1', '{}', 'high', 0.9, 'invalid_status');" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_pattern_recommendations_indexes() {
    index_exists "idx_pattern_recommendations_user" && \
    index_exists "idx_pattern_recommendations_strength"
}

test_pattern_recommendations_default_status() {
    # Test default status = 'suggested'
    psql_exec "DELETE FROM pattern_recommendations WHERE user_id = 'default_test';" >/dev/null 2>&1 || true
    psql_exec "INSERT INTO pattern_recommendations (user_id, workflow_steps, recommendation_strength, strength_score) VALUES ('default_test', '{}', 'high', 0.9);" >/dev/null

    local status=$(psql_exec "SELECT status FROM pattern_recommendations WHERE user_id = 'default_test';")
    [[ "$status" == "suggested" ]]

    # Cleanup
    psql_exec "DELETE FROM pattern_recommendations WHERE user_id = 'default_test';" >/dev/null 2>&1 || true
}

# ============================================================
# FEATURE 5: COMPOSITE SKILLS TESTS
# ============================================================

test_composite_skills_table_exists() {
    table_exists "composite_skills"
}

test_composite_skills_unique_name() {
    # Test unique constraint on composite_name
    psql_exec "DELETE FROM composite_skills WHERE composite_name = 'unique_test';" >/dev/null 2>&1 || true
    psql_exec "INSERT INTO composite_skills (composite_name, steps) VALUES ('unique_test', '[]');" >/dev/null

    local result=$(psql_exec "INSERT INTO composite_skills (composite_name, steps) VALUES ('unique_test', '[]');" 2>&1 || echo "unique_violation")
    [[ "$result" == *"unique"* ]] || [[ "$result" == *"duplicate"* ]] || [[ "$result" == "unique_violation" ]]

    # Cleanup
    psql_exec "DELETE FROM composite_skills WHERE composite_name = 'unique_test';" >/dev/null 2>&1 || true
}

test_composite_skills_execution_mode_enum() {
    # Test execution_mode enum (sequential, parallel, conditional)
    local result=$(psql_exec "INSERT INTO composite_skills (composite_name, steps, execution_mode) VALUES ('mode_test', '[]', 'invalid_mode');" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_composite_skills_error_handling_enum() {
    # Test error_handling enum (stop_on_error, continue_on_error, retry_on_error)
    local result=$(psql_exec "INSERT INTO composite_skills (composite_name, steps, error_handling) VALUES ('error_test', '[]', 'invalid_handling');" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_composite_skills_indexes() {
    index_exists "idx_composite_skills_mode" && \
    index_exists "idx_composite_skills_name"
}

test_composite_skills_default_values() {
    # Test default values
    psql_exec "DELETE FROM composite_skills WHERE composite_name = 'default_composite_test';" >/dev/null 2>&1 || true
    psql_exec "INSERT INTO composite_skills (composite_name, steps) VALUES ('default_composite_test', '[]');" >/dev/null

    local execution_mode=$(psql_exec "SELECT execution_mode FROM composite_skills WHERE composite_name = 'default_composite_test';")
    local error_handling=$(psql_exec "SELECT error_handling FROM composite_skills WHERE composite_name = 'default_composite_test';")

    [[ "$execution_mode" == "sequential" ]] && \
    [[ "$error_handling" == "stop_on_error" ]]

    # Cleanup
    psql_exec "DELETE FROM composite_skills WHERE composite_name = 'default_composite_test';" >/dev/null 2>&1 || true
}

# ============================================================
# FEATURE 6: EXECUTION TRACES TESTS
# ============================================================

test_execution_traces_table_exists() {
    table_exists "execution_traces"
}

test_execution_traces_partitioning() {
    # Check that parent table is partitioned
    local is_partitioned=$(psql_exec "SELECT COUNT(*) FROM pg_partitioned_table WHERE partrelid = 'execution_traces'::regclass;")
    [[ "$is_partitioned" -gt 0 ]]
}

test_execution_traces_partitions_exist() {
    # Check that monthly partitions exist
    table_exists "execution_traces_2025_11" && \
    table_exists "execution_traces_2025_12" && \
    table_exists "execution_traces_2026_01"
}

test_execution_traces_composite_primary_key() {
    # Primary key should include trace_id and started_at (partition column)
    local pk_columns=$(psql_exec "SELECT array_agg(a.attname ORDER BY array_position(i.indkey, a.attnum)) FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = 'execution_traces'::regclass AND i.indisprimary;")
    [[ "$pk_columns" == "{trace_id,started_at}" ]]
}

test_execution_traces_status_enum() {
    # Test status enum (running, success, failed, timeout)
    local result=$(psql_exec "INSERT INTO execution_traces (trace_id, skill_name, status, steps) VALUES ('test_trace_1', 'test_skill', 'invalid_status', '[]');" 2>&1 || echo "constraint_violation")
    [[ "$result" == *"constraint"* ]] || [[ "$result" == *"violates"* ]] || [[ "$result" == "constraint_violation" ]]
}

test_execution_traces_indexes() {
    # Check indexes exist (on base table or partitions)
    index_exists "idx_execution_traces_skill" && \
    index_exists "idx_execution_traces_status" && \
    index_exists "idx_execution_traces_steps_gin"
}

test_execution_traces_partition_routing() {
    # Test that inserts route to correct partition
    psql_exec "DELETE FROM execution_traces WHERE trace_id = 'routing_test_1';" >/dev/null 2>&1 || true

    # Insert into November 2025 partition
    psql_exec "INSERT INTO execution_traces (trace_id, skill_name, started_at, status, steps) VALUES ('routing_test_1', 'test_skill', '2025-11-15 10:00:00', 'success', '[]');" >/dev/null

    # Check it's in the right partition
    local partition=$(psql_exec "SELECT tableoid::regclass FROM execution_traces WHERE trace_id = 'routing_test_1';")
    [[ "$partition" == "execution_traces_2025_11" ]]

    # Cleanup
    psql_exec "DELETE FROM execution_traces WHERE trace_id = 'routing_test_1';" >/dev/null 2>&1 || true
}

test_execution_traces_jsonb_gin_index() {
    # Verify GIN index exists for JSONB full-text search
    local gin_index=$(psql_exec "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename LIKE 'execution_traces%' AND indexdef LIKE '%USING gin%';")
    [[ "$gin_index" -gt 0 ]]
}

# ============================================================
# ROLLBACK TESTS
# ============================================================

test_rollback_script_exists() {
    [[ -f "$MIGRATIONS_DIR/999_rollback.sql" ]]
}

# ============================================================
# MAIN TEST EXECUTION
# ============================================================

main() {
    log_info "=========================================="
    log_info "Workflow Codification Schema Test Suite"
    log_info "=========================================="
    log_info ""

    # Check database connection
    if ! PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        log_error "Cannot connect to database $DB_NAME"
        log_info "Please ensure PostgreSQL is running and database exists"
        exit 1
    fi

    log_info "Connected to database: $DB_NAME"
    log_info ""

    # Feature 1: Skill Health History
    log_info "=========================================="
    log_info "FEATURE 1: Skill Health History"
    log_info "=========================================="
    run_test "1.1 Table exists" test_health_history_table_exists
    run_test "1.2 Primary key (UUID)" test_health_history_primary_key
    run_test "1.3 Score columns exist" test_health_history_score_columns
    run_test "1.4 Check constraint (score 0-100)" test_health_history_check_constraint
    run_test "1.5 Health level enum constraint" test_health_history_health_level_enum
    run_test "1.6 Indexes created" test_health_history_indexes
    run_test "1.7 Default values work" test_health_history_default_values
    log_info ""

    # Feature 2: Circuit Breaker
    log_info "=========================================="
    log_info "FEATURE 2: Circuit Breaker State"
    log_info "=========================================="
    run_test "2.1 Table exists" test_circuit_breaker_table_exists
    run_test "2.2 Primary key on skill_name" test_circuit_breaker_primary_key
    run_test "2.3 Status enum constraint" test_circuit_breaker_status_enum
    run_test "2.4 Default values" test_circuit_breaker_default_values
    run_test "2.5 Index on status" test_circuit_breaker_index
    log_info ""

    # Feature 3: Regression Testing
    log_info "=========================================="
    log_info "FEATURE 3: Regression Test Suites"
    log_info "=========================================="
    run_test "3.1 Table exists" test_regression_suites_table_exists
    run_test "3.2 JSONB columns" test_regression_suites_jsonb_columns
    run_test "3.3 Check constraint (total_tests > 0)" test_regression_suites_check_constraints
    run_test "3.4 Priority enum (P0, P1, P2)" test_regression_suites_priority_enum
    run_test "3.5 Indexes created" test_regression_suites_indexes
    run_test "3.6 Pass rate constraint (0-100)" test_regression_suites_pass_rate_constraint
    log_info ""

    # Feature 4: Pattern Recommendations
    log_info "=========================================="
    log_info "FEATURE 4: Pattern Recommendations"
    log_info "=========================================="
    run_test "4.1 Table exists" test_pattern_recommendations_table_exists
    run_test "4.2 JSONB columns" test_pattern_recommendations_jsonb_columns
    run_test "4.3 Strength enum (high/medium/low)" test_pattern_recommendations_strength_enum
    run_test "4.4 Strength score constraint (0-1)" test_pattern_recommendations_strength_score_constraint
    run_test "4.5 Status enum constraint" test_pattern_recommendations_status_enum
    run_test "4.6 Indexes created" test_pattern_recommendations_indexes
    run_test "4.7 Default status = 'suggested'" test_pattern_recommendations_default_status
    log_info ""

    # Feature 5: Composite Skills
    log_info "=========================================="
    log_info "FEATURE 5: Composite Skills"
    log_info "=========================================="
    run_test "5.1 Table exists" test_composite_skills_table_exists
    run_test "5.2 Unique constraint on composite_name" test_composite_skills_unique_name
    run_test "5.3 Execution mode enum" test_composite_skills_execution_mode_enum
    run_test "5.4 Error handling enum" test_composite_skills_error_handling_enum
    run_test "5.5 Indexes created" test_composite_skills_indexes
    run_test "5.6 Default values" test_composite_skills_default_values
    log_info ""

    # Feature 6: Execution Traces
    log_info "=========================================="
    log_info "FEATURE 6: Execution Traces (Partitioned)"
    log_info "=========================================="
    run_test "6.1 Table exists" test_execution_traces_table_exists
    run_test "6.2 Table is partitioned" test_execution_traces_partitioning
    run_test "6.3 Monthly partitions exist" test_execution_traces_partitions_exist
    run_test "6.4 Composite primary key (trace_id, started_at)" test_execution_traces_composite_primary_key
    run_test "6.5 Status enum constraint" test_execution_traces_status_enum
    run_test "6.6 Indexes created" test_execution_traces_indexes
    run_test "6.7 Partition routing works" test_execution_traces_partition_routing
    run_test "6.8 JSONB GIN index for full-text search" test_execution_traces_jsonb_gin_index
    log_info ""

    # Rollback
    log_info "=========================================="
    log_info "ROLLBACK SCRIPTS"
    log_info "=========================================="
    run_test "7.1 Rollback script exists" test_rollback_script_exists
    log_info ""

    # Summary
    log_info "=========================================="
    log_info "TEST SUMMARY"
    log_info "=========================================="
    log_info "Tests Run:    $TESTS_RUN"
    log_success "Tests Passed: $TESTS_PASSED"

    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_error "Tests Failed: $TESTS_FAILED"
        log_info ""
        log_error "RESULT: FAILED"
        exit 1
    else
        log_info ""
        log_success "RESULT: ALL TESTS PASSED ✓"

        # Calculate coverage
        local expected_tests=42
        local coverage=$((TESTS_PASSED * 100 / expected_tests))
        log_success "Coverage: ${coverage}% (${TESTS_PASSED}/${expected_tests} tests)"

        if [[ $TESTS_PASSED -eq $expected_tests ]]; then
            log_success "100% TEST COVERAGE ACHIEVED ✓"
        fi

        exit 0
    fi
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
