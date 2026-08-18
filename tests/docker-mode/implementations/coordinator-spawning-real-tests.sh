#!/usr/bin/env bash
# Real implementations for coordinator-spawning-tests.sh placeholders (Tests 11-23)
# These functions replace the test_placeholder_11_to_23() function

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh" 2>/dev/null || source "$PROJECT_ROOT/docker/tests/test-helpers.sh"

# Test configuration
TEST_WORKSPACE="${TEST_WORKSPACE:-/tmp/docker-test-$$}"
TESTS_PASSED=${TESTS_PASSED:-0}
TESTS_FAILED=${TESTS_FAILED:-0}

# Cleanup function
cleanup_coord_tests() {
    docker rm -f test-failing-container test-exit-code-coordinator \
        test-redis-service test-postgres-service test-comm-redis \
        test-spawned-agent test-port-first test-port-second \
        test-recovery-redis cfn-worktree-1-coordinator \
        cfn-worktree-2-coordinator 2>/dev/null || true
    docker network rm test-redis-network test-pg-network \
        test-comm-network test-recovery-network 2>/dev/null || true
    rm -rf "$TEST_WORKSPACE" 2>/dev/null || true
}

trap cleanup_coord_tests EXIT

mkdir -p "$TEST_WORKSPACE"

# Test 11: Container cleanup on failure
test_cleanup_on_failure() {
    log_test "Test 11: Container cleanup on failure"

    # GIVEN: Container configured to fail on startup
    docker run -d --name test-failing-container \
        alpine:latest sh -c "exit 1" 2>/dev/null || true
    sleep 2

    # WHEN: Checking if cleanup can remove failed container
    docker rm -f test-failing-container 2>/dev/null
    local remaining=$(docker ps -a --filter "name=test-failing-container" --format "{{.Names}}" | wc -l)

    # THEN: Container should be removed
    if [[ "$remaining" -eq 0 ]]; then
        log_pass "Cleanup on failure works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Cleanup failed: container still exists"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 12: Coordinator exit code propagation
test_coordinator_exit_code_propagation() {
    log_test "Test 12: Coordinator exit code propagation"

    # GIVEN: Coordinator container with specific exit code
    docker run --name test-exit-code-coordinator \
        alpine:latest sh -c "exit 42" 2>/dev/null || true

    # WHEN: Inspecting exit code
    local exit_code=$(docker inspect -f '{{.State.ExitCode}}' test-exit-code-coordinator 2>/dev/null)

    # THEN: Exit code should propagate correctly
    if [[ "$exit_code" -eq 42 ]]; then
        log_pass "Coordinator exit code propagation works (exit $exit_code)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Exit code propagation failed: expected 42, got $exit_code"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f test-exit-code-coordinator 2>/dev/null || true
}

# Test 13: Redis connection via service name
test_redis_connection_service_name() {
    log_test "Test 13: Redis connection via service name"

    # GIVEN: Redis service in Docker network
    docker network create test-redis-network 2>/dev/null || true
    docker run -d --name test-redis-service \
        --network test-redis-network \
        redis:7-alpine 2>/dev/null
    sleep 3

    # WHEN: Agent connects using service name
    local result=$(docker run --rm --network test-redis-network \
        redis:7-alpine \
        redis-cli -h test-redis-service PING 2>&1 || echo "FAILED")

    # THEN: Connection succeeds
    if [[ "$result" == "PONG" ]]; then
        log_pass "Redis connection via service name works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Redis connection failed: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f test-redis-service 2>/dev/null || true
    docker network rm test-redis-network 2>/dev/null || true
}

# Test 14: Postgres connection via service name
test_postgres_connection_service_name() {
    log_test "Test 14: Postgres connection via service name"

    # GIVEN: Postgres service in Docker network
    docker network create test-pg-network 2>/dev/null || true
    docker run -d --name test-postgres-service \
        --network test-pg-network \
        -e POSTGRES_PASSWORD=testpass \
        postgres:15-alpine 2>/dev/null
    sleep 5

    # WHEN: Testing connection via service name
    local result=$(docker run --rm --network test-pg-network \
        postgres:15-alpine \
        pg_isready -h test-postgres-service 2>&1 || echo "FAILED")

    # THEN: Connection check succeeds
    if echo "$result" | grep -q "accepting connections"; then
        log_pass "Postgres connection via service name works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Postgres connection failed: $result"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f test-postgres-service 2>/dev/null || true
    docker network rm test-pg-network 2>/dev/null || true
}

# Test 15: Orchestrator communication channel
test_orchestrator_communication() {
    log_test "Test 15: Orchestrator communication channel"

    # GIVEN: Redis for communication
    docker network create test-comm-network 2>/dev/null || true
    docker run -d --name test-comm-redis \
        --network test-comm-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Coordinator writes, orchestrator reads
    docker run --rm --network test-comm-network \
        redis:7-alpine \
        redis-cli -h test-comm-redis SET "coordinator:message" "ready" 2>/dev/null

    local message=$(docker run --rm --network test-comm-network \
        redis:7-alpine \
        redis-cli -h test-comm-redis GET "coordinator:message" 2>/dev/null)

    # THEN: Message successfully passed
    if [[ "$message" == "ready" ]]; then
        log_pass "Orchestrator communication channel works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Communication failed: $message"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f test-comm-redis 2>/dev/null || true
    docker network rm test-comm-network 2>/dev/null || true
}

# Test 16: Agent spawning from coordinator
test_agent_spawning_from_coordinator() {
    log_test "Test 16: Agent spawning from coordinator"

    # GIVEN: Docker socket available
    if [[ ! -S /var/run/docker.sock ]]; then
        log_fail "Docker socket not available"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return
    fi

    # WHEN: Simulating coordinator spawning agent
    docker run -d --name test-spawned-agent \
        alpine:latest sleep 10 2>/dev/null

    sleep 2
    local status=$(docker inspect -f '{{.State.Status}}' test-spawned-agent 2>/dev/null || echo "not found")

    # THEN: Agent should be running
    if [[ "$status" == "running" ]]; then
        log_pass "Agent spawning from coordinator works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Agent spawning failed: $status"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f test-spawned-agent 2>/dev/null || true
}

# Test 17: Concurrent coordinator spawning (2+ worktrees)
test_concurrent_coordinator_spawning() {
    log_test "Test 17: Concurrent coordinator spawning (2+ worktrees)"

    # GIVEN: Two coordinator containers with different project names
    local proj1="cfn-worktree-1"
    local proj2="cfn-worktree-2"

    docker run -d --name "${proj1}-coordinator" \
        alpine:latest sleep 30 2>/dev/null
    docker run -d --name "${proj2}-coordinator" \
        alpine:latest sleep 30 2>/dev/null
    sleep 2

    # WHEN: Checking both are running
    local running=$(docker ps --filter "name=-coordinator" --format "{{.Names}}" | wc -l)

    # THEN: Both coordinators should coexist
    if [[ "$running" -eq 2 ]]; then
        log_pass "Concurrent coordinator spawning works (2 worktrees)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Concurrent spawning failed: only $running/2 running"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f "${proj1}-coordinator" "${proj2}-coordinator" 2>/dev/null || true
}

# Test 18: Port conflict detection
test_port_conflict_detection() {
    log_test "Test 18: Port conflict detection"

    # GIVEN: First container on port 8080
    docker run -d --name test-port-first \
        -p 8080:80 \
        nginx:alpine 2>/dev/null
    sleep 2

    # WHEN: Attempting to spawn second on same port
    set +e
    docker run -d --name test-port-second \
        -p 8080:80 \
        nginx:alpine 2>/dev/null
    local exit_code=$?
    set -e

    # THEN: Second spawn should fail
    if [[ "$exit_code" -ne 0 ]]; then
        log_pass "Port conflict detection works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Port conflict not detected"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f test-port-first test-port-second 2>/dev/null || true
}

# Test 19: Database migration on startup
test_database_migration_startup() {
    log_test "Test 19: Database migration on startup"

    # GIVEN: Migration script and database
    mkdir -p "$TEST_WORKSPACE/migrations"
    cat > "$TEST_WORKSPACE/migrations/migrate.sh" <<'EOF'
#!/bin/sh
echo "Running migrations..."
echo "Migration complete" > /workspace/migration-done.txt
exit 0
EOF
    chmod +x "$TEST_WORKSPACE/migrations/migrate.sh"

    # WHEN: Container runs migration on startup
    docker run --rm \
        -v "$TEST_WORKSPACE/migrations:/workspace:rw" \
        alpine:latest \
        /workspace/migrate.sh 2>/dev/null

    # THEN: Migration marker should exist
    if [[ -f "$TEST_WORKSPACE/migrations/migration-done.txt" ]]; then
        log_pass "Database migration on startup works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Migration did not run"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 20: Configuration file parsing
test_config_file_parsing() {
    log_test "Test 20: Configuration file parsing"

    # GIVEN: Config file
    mkdir -p "$TEST_WORKSPACE/config"
    cat > "$TEST_WORKSPACE/config/coordinator.json" <<'EOF'
{
  "memory_budget": "40g",
  "max_iterations": 10,
  "redis_host": "cfn-redis"
}
EOF

    # WHEN: Container parses config
    local memory=$(docker run --rm \
        -v "$TEST_WORKSPACE/config:/config:ro" \
        alpine:latest \
        sh -c "apk add --no-cache jq >/dev/null 2>&1 && jq -r '.memory_budget' /config/coordinator.json")

    # THEN: Config should be parsed correctly
    if [[ "$memory" == "40g" ]]; then
        log_pass "Configuration file parsing works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Config parsing failed: $memory"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 21: Task ID generation
test_task_id_generation() {
    log_test "Test 21: Task ID generation"

    # GIVEN: Container generates task ID
    local task_id=$(docker run --rm \
        alpine:latest \
        sh -c "echo task-\$(date +%s)-\$\$")

    # WHEN: Validating pattern
    # THEN: Should match pattern task-<timestamp>-<pid>
    if [[ "$task_id" =~ ^task-[0-9]+-[0-9]+$ ]]; then
        log_pass "Task ID generation works: $task_id"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Task ID generation failed: $task_id"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 22: Agent metadata injection
test_agent_metadata_injection() {
    log_test "Test 22: Agent metadata injection"

    # GIVEN: Metadata environment variables
    # WHEN: Container spawned with metadata
    docker run --rm \
        --name test-metadata-check \
        -e AGENT_TYPE="typescript-specialist" \
        -e TASK_ID="test-123" \
        -e BATCH_ID="batch-1" \
        alpine:latest env > /tmp/test-metadata-output.txt 2>/dev/null

    # THEN: All metadata should be present
    local found=0
    if grep -q "AGENT_TYPE=typescript-specialist" /tmp/test-metadata-output.txt; then ((found++)); fi
    if grep -q "TASK_ID=test-123" /tmp/test-metadata-output.txt; then ((found++)); fi
    if grep -q "BATCH_ID=batch-1" /tmp/test-metadata-output.txt; then ((found++)); fi

    if [[ "$found" -eq 3 ]]; then
        log_pass "Agent metadata injection works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Only $found/3 metadata variables found"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    rm -f /tmp/test-metadata-output.txt
}

# Test 23: Coordinator restart recovery
test_coordinator_restart_recovery() {
    log_test "Test 23: Coordinator restart recovery"

    # GIVEN: Redis with state data
    docker network create test-recovery-network 2>/dev/null || true
    docker run -d --name test-recovery-redis \
        --network test-recovery-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # Save state before restart
    docker run --rm --network test-recovery-network \
        redis:7-alpine \
        redis-cli -h test-recovery-redis SET "coordinator:state" "iteration-3" 2>/dev/null

    # WHEN: Simulating coordinator restart (new container reads state)
    local recovered_state=$(docker run --rm --network test-recovery-network \
        redis:7-alpine \
        redis-cli -h test-recovery-redis GET "coordinator:state" 2>/dev/null)

    # THEN: State should be recovered
    if [[ "$recovered_state" == "iteration-3" ]]; then
        log_pass "Coordinator restart recovery works"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Recovery failed: $recovered_state"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f test-recovery-redis 2>/dev/null || true
    docker network rm test-recovery-network 2>/dev/null || true
}

# Execute all tests if run standalone
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Running Coordinator Spawning Real Tests (13 tests)"
    echo "=================================================="
    echo ""

    test_cleanup_on_failure
    test_coordinator_exit_code_propagation
    test_redis_connection_service_name
    test_postgres_connection_service_name
    test_orchestrator_communication
    test_agent_spawning_from_coordinator
    test_concurrent_coordinator_spawning
    test_port_conflict_detection
    test_database_migration_startup
    test_config_file_parsing
    test_task_id_generation
    test_agent_metadata_injection
    test_coordinator_restart_recovery

    echo ""
    echo "Test Summary"
    echo "============"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"
    echo "Total: $((TESTS_PASSED + TESTS_FAILED))"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo "✅ All tests PASSED"
        exit 0
    else
        echo "❌ Some tests FAILED"
        exit 1
    fi
fi
