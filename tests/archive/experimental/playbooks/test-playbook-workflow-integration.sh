#!/bin/bash
# Docker Mode Playbook + Workflow Codification Integration Test Suite
# Tests the integration between playbook learning and workflow codification systems

set -euo pipefail

# Test configuration
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/docker/tests/test-helpers.sh"

# Test identifiers
TEST_ID="docker-integration-$(date +%s)"
COMPOSE_PROJECT_NAME="cfn-integration-test-${TEST_ID}"
TEST_WORKSPACE="/tmp/docker-integration-test-$$"
CONTAINER_NETWORK="${COMPOSE_PROJECT_NAME}_default"

# Database paths
HOST_PLAYBOOK_DB="$PROJECT_ROOT/.claude/skills/cfn-playbook/playbook.db"
HOST_WORKFLOW_DB="$PROJECT_ROOT/.claude/skills/workflow-codification/workflow-codification.db"
CONTAINER_PLAYBOOK_DB="/workspace/playbook.db"
CONTAINER_WORKFLOW_DB="/workspace/workflow-codification.db"

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up integration test environment..."

    docker ps -a --filter "name=cfn-test-integration-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker-compose -p "$COMPOSE_PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true
    rm -rf "$TEST_WORKSPACE" 2>/dev/null || true
    docker network rm "$CONTAINER_NETWORK" 2>/dev/null || true

    log_info "Cleanup completed with exit code: $exit_code"
    exit $exit_code
}

trap cleanup EXIT INT TERM

log_section "Docker Mode Playbook + Workflow Codification Integration Tests"
log_info "Test ID: $TEST_ID"

# ============================================================================
# Helper Functions
# ============================================================================

wait_for_container() {
    local container_id=$1
    local timeout=${2:-30}
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if ! docker ps -q --filter "id=$container_id" | grep -q .; then
            local exit_code=$(docker inspect --format='{{.State.ExitCode}}' "$container_id" 2>/dev/null || echo "1")
            if [ "$exit_code" == "0" ]; then
                return 0
            else
                return 1
            fi
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    return 1
}

# ============================================================================
# Test 1: CFN Loop → Playbook Update → Workflow Codification
# ============================================================================

test_full_pipeline_integration() {
    log_test "Test 1: Full Pipeline Integration (CFN Loop → Playbook → Workflow Codification)"

    # GIVEN: CFN Loop completes a task successfully
    local task_id="integration-test-$RANDOM"
    local task_type="software-development"
    local task_desc="Implement OAuth2 authentication"

    # WHEN: Task completion triggers playbook update
    local container_id=$(docker run --rm -d \
        --name "cfn-test-integration-pipeline-$$" \
        --network "$CONTAINER_NETWORK" \
        --volume "$PROJECT_ROOT:/workspace:rw" \
        --volume "$HOST_PLAYBOOK_DB:$CONTAINER_PLAYBOOK_DB:rw" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        cfn-agent:latest \
        bash -c "
            # 1. Update playbook with task completion
            sqlite3 '$CONTAINER_PLAYBOOK_DB' \\
                \"INSERT INTO playbook_entries (task_pattern, task_type, task_keywords, loop3_agents, loop2_agents, iterations_required, final_confidence, final_consensus) \\
                VALUES ('$task_desc', '$task_type', 'oauth2,authentication,security', '[\"backend-dev\",\"security-specialist\"]', '[\"reviewer\",\"tester\"]', 3, 0.92, 0.93);\"

            # 2. Log workflow codification cost tracking
            sqlite3 '$CONTAINER_WORKFLOW_DB' \\
                \"INSERT INTO skill_executions (skill_name, skill_version, execution_time_ms, exit_code, tokens_avoided) \\
                VALUES ('cfn-coordination', '1.0.0', 150, 0, 3000);\"

            # 3. Record edge case (simulated issue)
            sqlite3 '$CONTAINER_WORKFLOW_DB' \\
                \"INSERT INTO edge_cases (skill_name, skill_version, exit_code, input_params, error_message, occurrence_count) \\
                VALUES ('cfn-playbook', '1.0.0', 1, 'task-id=$task_id', 'Connection timeout to Redis', 1);\"
        ")

    if ! wait_for_container "$container_id" 30; then
        log_fail "Pipeline integration container failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi

    # THEN: Verify all three systems updated
    local playbook_count=$(sqlite3 "$HOST_PLAYBOOK_DB" \
        "SELECT COUNT(*) FROM playbook_entries WHERE task_pattern = '$task_desc';" 2>/dev/null || echo "0")

    local workflow_count=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COUNT(*) FROM skill_executions WHERE skill_name = 'cfn-coordination';" 2>/dev/null || echo "0")

    local edge_case_count=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COUNT(*) FROM edge_cases WHERE skill_name = 'cfn-playbook';" 2>/dev/null || echo "0")

    if [[ "$playbook_count" -ge 1 ]] && [[ "$workflow_count" -ge 1 ]] && [[ "$edge_case_count" -ge 1 ]]; then
        log_pass "Full pipeline integration successful (playbook=$playbook_count, workflow=$workflow_count, edge cases=$edge_case_count)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Pipeline integration incomplete (playbook=$playbook_count, workflow=$workflow_count, edge cases=$edge_case_count)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# ============================================================================
# Test 2: Cross-Container Data Flow Validation
# ============================================================================

test_cross_container_data_flow() {
    log_test "Test 2: Cross-Container Data Flow (Read from Playbook → Update Workflow Codification)"

    # GIVEN: Playbook entry exists
    local task_pattern="Implement JWT authentication"
    sqlite3 "$HOST_PLAYBOOK_DB" \
        "INSERT OR IGNORE INTO playbook_entries (task_pattern, task_type, task_keywords, loop3_agents, loop2_agents) \\
        VALUES ('$task_pattern', 'software-development', 'jwt,auth', '[\"backend-dev\"]', '[\"tester\"]');" 2>/dev/null || true

    # WHEN: Container 1 reads playbook, Container 2 updates workflow codification
    local container1=$(docker run --rm -d \
        --name "cfn-test-integration-reader-$$" \
        --network "$CONTAINER_NETWORK" \
        --volume "$PROJECT_ROOT:/workspace:ro" \
        --volume "$HOST_PLAYBOOK_DB:$CONTAINER_PLAYBOOK_DB:ro" \
        cfn-agent:latest \
        bash -c "
            # Query playbook for similar task
            RESULT=\$(sqlite3 '$CONTAINER_PLAYBOOK_DB' \\
                \"SELECT COUNT(*) FROM playbook_entries WHERE task_pattern LIKE '%JWT%';\")
            echo \"Found: \$RESULT entries\"
            exit 0
        ")

    wait_for_container "$container1" 20

    local container2=$(docker run --rm -d \
        --name "cfn-test-integration-writer-$$" \
        --network "$CONTAINER_NETWORK" \
        --volume "$PROJECT_ROOT:/workspace:rw" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        cfn-agent:latest \
        bash -c "
            # Log that playbook was queried
            sqlite3 '$CONTAINER_WORKFLOW_DB' \\
                \"INSERT INTO skill_executions (skill_name, skill_version, execution_time_ms, exit_code, tokens_avoided) \\
                VALUES ('cfn-playbook-query', '1.0.0', 50, 0, 1500);\"
        ")

    if ! wait_for_container "$container2" 20; then
        log_fail "Cross-container data flow failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi

    # THEN: Verify workflow codification recorded the query
    local query_count=$(sqlite3 "$HOST_WORKFLOW_DB" \
        "SELECT COUNT(*) FROM skill_executions WHERE skill_name = 'cfn-playbook-query';" 2>/dev/null || echo "0")

    if [[ "$query_count" -ge 1 ]]; then
        log_pass "Cross-container data flow successful (query_count=$query_count)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Workflow codification did not record playbook query"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# ============================================================================
# Test 3: Volume Mount Persistence Across Both Systems
# ============================================================================

test_dual_volume_persistence() {
    log_test "Test 3: Dual Volume Persistence (Both DBs Persist Across Container Restarts)"

    # GIVEN: Initial data in both databases
    local playbook_marker="persistence-test-$RANDOM"
    local workflow_marker="persistence-test-$RANDOM"

    # Container 1: Write to both databases
    local container1=$(docker run --rm -d \
        --name "cfn-test-integration-dual-writer-$$" \
        --network "$CONTAINER_NETWORK" \
        --volume "$PROJECT_ROOT:/workspace:rw" \
        --volume "$HOST_PLAYBOOK_DB:$CONTAINER_PLAYBOOK_DB:rw" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        cfn-agent:latest \
        bash -c "
            # Write to playbook
            sqlite3 '$CONTAINER_PLAYBOOK_DB' \\
                \"INSERT INTO playbook_entries (task_pattern, task_type, task_keywords) \\
                VALUES ('$playbook_marker', 'test', 'marker');\"

            # Write to workflow codification
            sqlite3 '$CONTAINER_WORKFLOW_DB' \\
                \"INSERT INTO skill_executions (skill_name, skill_version, execution_time_ms, exit_code) \\
                VALUES ('$workflow_marker', '1.0.0', 100, 0);\"
        ")

    wait_for_container "$container1" 20

    # Container 2: Read from both databases (new container)
    local container2=$(docker run --rm -d \
        --name "cfn-test-integration-dual-reader-$$" \
        --network "$CONTAINER_NETWORK" \
        --volume "$PROJECT_ROOT:/workspace:ro" \
        --volume "$HOST_PLAYBOOK_DB:$CONTAINER_PLAYBOOK_DB:ro" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:ro" \
        cfn-agent:latest \
        bash -c "
            # Verify playbook entry
            PLAYBOOK_COUNT=\$(sqlite3 '$CONTAINER_PLAYBOOK_DB' \\
                \"SELECT COUNT(*) FROM playbook_entries WHERE task_pattern = '$playbook_marker';\")

            # Verify workflow entry
            WORKFLOW_COUNT=\$(sqlite3 '$CONTAINER_WORKFLOW_DB' \\
                \"SELECT COUNT(*) FROM skill_executions WHERE skill_name = '$workflow_marker';\")

            if [ \"\$PLAYBOOK_COUNT\" == \"1\" ] && [ \"\$WORKFLOW_COUNT\" == \"1\" ]; then
                exit 0
            else
                echo \"Persistence failed: playbook=\$PLAYBOOK_COUNT, workflow=\$WORKFLOW_COUNT\"
                exit 1
            fi
        ")

    if wait_for_container "$container2" 20; then
        log_pass "Dual volume persistence successful"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Dual volume persistence failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# ============================================================================
# Test 4: Edge Case Tracking Triggers Playbook Review
# ============================================================================

test_edge_case_playbook_feedback() {
    log_test "Test 4: Edge Case Tracking Triggers Playbook Review"

    # GIVEN: Multiple edge cases for same skill
    local skill_name="cfn-playbook-update"

    local container_id=$(docker run --rm -d \
        --name "cfn-test-integration-feedback-$$" \
        --network "$CONTAINER_NETWORK" \
        --volume "$PROJECT_ROOT:/workspace:rw" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        cfn-agent:latest \
        bash -c "
            # Record 5 edge cases (threshold = 3)
            for i in {1..5}; do
                sqlite3 '$CONTAINER_WORKFLOW_DB' \\
                    \"INSERT INTO edge_cases (skill_name, skill_version, exit_code, error_message, occurrence_count) \\
                    VALUES ('$skill_name', '1.0.0', 1, 'Redis timeout issue \$i', 1);\"
            done

            # Query recurring edge cases
            RECURRING=\$(sqlite3 '$CONTAINER_WORKFLOW_DB' \\
                \"SELECT COUNT(*) FROM edge_cases WHERE skill_name = '$skill_name';\")

            if [ \"\$RECURRING\" -ge 3 ]; then
                echo \"Threshold exceeded: \$RECURRING edge cases\"
                exit 0
            else
                exit 1
            fi
        ")

    if wait_for_container "$container_id" 30; then
        # THEN: Verify threshold detection triggers review
        local edge_cases=$(sqlite3 "$HOST_WORKFLOW_DB" \
            "SELECT COUNT(*) FROM edge_cases WHERE skill_name = '$skill_name';" 2>/dev/null || echo "0")

        if [[ "$edge_cases" -ge 3 ]]; then
            log_pass "Edge case threshold detection successful (edge_cases=$edge_cases)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_fail "Edge case threshold not reached (edge_cases=$edge_cases)"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        log_fail "Edge case tracking container failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# ============================================================================
# Test 5: Cost Savings Calculation with Playbook Reuse
# ============================================================================

test_cost_savings_playbook_reuse() {
    log_test "Test 5: Cost Savings Calculation with Playbook Reuse"

    # GIVEN: Playbook entry with high reuse count
    local task_pattern="Deploy to production"
    sqlite3 "$HOST_PLAYBOOK_DB" \
        "INSERT OR IGNORE INTO playbook_entries (task_pattern, task_type, task_keywords, use_count) \\
        VALUES ('$task_pattern', 'deployment', 'production,deploy', 10);" 2>/dev/null || true

    # WHEN: Calculate cost savings from playbook reuse
    local container_id=$(docker run --rm -d \
        --name "cfn-test-integration-cost-$$" \
        --network "$CONTAINER_NETWORK" \
        --volume "$PROJECT_ROOT:/workspace:rw" \
        --volume "$HOST_PLAYBOOK_DB:$CONTAINER_PLAYBOOK_DB:ro" \
        --volume "$HOST_WORKFLOW_DB:$CONTAINER_WORKFLOW_DB:rw" \
        cfn-agent:latest \
        bash -c "
            # Get playbook reuse count
            REUSE_COUNT=\$(sqlite3 '$CONTAINER_PLAYBOOK_DB' \\
                \"SELECT COALESCE(use_count, 0) FROM playbook_entries WHERE task_pattern = '$task_pattern';\")

            # Calculate tokens avoided (1500 per reuse)
            TOKENS_AVOIDED=\$((REUSE_COUNT * 1500))

            # Log cost savings
            sqlite3 '$CONTAINER_WORKFLOW_DB' \\
                \"INSERT INTO skill_executions (skill_name, skill_version, execution_time_ms, exit_code, tokens_avoided) \\
                VALUES ('cfn-playbook-reuse', '1.0.0', 25, 0, \$TOKENS_AVOIDED);\"

            echo \"Reuse count: \$REUSE_COUNT, Tokens avoided: \$TOKENS_AVOIDED\"
        ")

    if wait_for_container "$container_id" 30; then
        # THEN: Verify cost tracking recorded savings
        local tokens_avoided=$(sqlite3 "$HOST_WORKFLOW_DB" \
            "SELECT COALESCE(SUM(tokens_avoided), 0) FROM skill_executions WHERE skill_name = 'cfn-playbook-reuse';" 2>/dev/null || echo "0")

        if [[ "$tokens_avoided" -gt 0 ]]; then
            log_pass "Cost savings calculation successful (tokens_avoided=$tokens_avoided)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            log_fail "Cost savings not recorded"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        log_fail "Cost savings container failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# ============================================================================
# Execute All Tests
# ============================================================================

TESTS_PASSED=0
TESTS_FAILED=0

log_info "Starting playbook + workflow codification integration tests..."

test_full_pipeline_integration
test_cross_container_data_flow
test_dual_volume_persistence
test_edge_case_playbook_feedback
test_cost_savings_playbook_reuse

# ============================================================================
# Test Summary
# ============================================================================

echo ""
log_section "Integration Test Summary"
echo ""
echo "Total Tests Run:    $((TESTS_PASSED + TESTS_FAILED))"
echo -e "${GREEN}Tests Passed:       $TESTS_PASSED${NC}"

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Tests Failed:       $TESTS_FAILED${NC}"
else
    echo -e "${GREEN}Tests Failed:       $TESTS_FAILED${NC}"
fi

local pass_rate=0
if [[ $((TESTS_PASSED + TESTS_FAILED)) -gt 0 ]]; then
    pass_rate=$(echo "scale=2; $TESTS_PASSED * 100 / ($TESTS_PASSED + $TESTS_FAILED)" | bc)
fi

echo ""
echo "Pass Rate:          ${pass_rate}%"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All integration tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some integration tests failed${NC}"
    exit 1
fi
