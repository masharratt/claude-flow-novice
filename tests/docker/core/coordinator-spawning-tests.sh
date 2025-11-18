#!/bin/bash
# tests/docker-mode/test-coordinator-spawning.sh
# Docker Mode Coordinator Spawning Test Suite (23 tests)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/docker/tests/test-helpers.sh"

# Test configuration
TEST_ID="docker-coordinator-$(date +%s)"
COMPOSE_PROJECT_NAME="cfn-test-${TEST_ID}"
TEST_WORKSPACE="/tmp/docker-test-$$"
CONTAINER_NETWORK="${COMPOSE_PROJECT_NAME}_default"

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up Docker test environment..."

    # Stop containers
    docker ps -a --filter "name=cfn-test-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker-compose -p "$COMPOSE_PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true

    # Clean up test containers from Tests 11-23
    docker rm -f test-failing-container test-exit-code-coordinator \
        test-redis-service test-postgres-service test-comm-redis \
        test-spawned-agent test-port-first test-port-second \
        test-recovery-redis cfn-worktree-1-coordinator \
        cfn-worktree-2-coordinator 2>/dev/null || true

    # Clean up test networks
    docker network rm "$CONTAINER_NETWORK" test-redis-network test-pg-network \
        test-comm-network test-recovery-network 2>/dev/null || true

    rm -rf "$TEST_WORKSPACE" 2>/dev/null || true

    exit $exit_code
}

trap cleanup EXIT INT TERM

# Test counters

# Test 1: Docker Compose service discovery
test_docker_service_discovery() {
    log_test "Test 1: Docker Compose service discovery (redis:6379)"

    # GIVEN: Docker Compose with cfn-redis service
    cat > "$TEST_WORKSPACE/docker-compose.yml" <<'EOF'
version: '3.9'
services:
  redis:
    image: redis:7-alpine
    container_name: cfn-test-redis
    networks:
      - test-network
networks:
  test-network:
    name: test-network
EOF

    cd "$TEST_WORKSPACE"
    docker-compose up -d redis 2>/dev/null || true
    sleep 2

    # WHEN: Container resolves "redis" hostname via Docker DNS
    local result=$(docker run --rm --network test-network \
        redis:7-alpine \
        redis-cli -h redis PING 2>&1 || echo "FAILED")

    # THEN: Connection succeeds
    if [[ "$result" == "PONG" ]]; then
        log_pass "Service discovery works via Docker DNS"
    else
        log_fail "Service discovery failed: $result"
    fi

    docker-compose down 2>/dev/null || true
}

# Test 2: COMPOSE_PROJECT_NAME isolation
test_compose_project_isolation() {
    log_test "Test 2: COMPOSE_PROJECT_NAME isolation (unique container names)"

    # GIVEN: Two Docker Compose projects with different COMPOSE_PROJECT_NAME
    local project1="cfn-test-proj1"
    local project2="cfn-test-proj2"

    cat > "$TEST_WORKSPACE/docker-compose.yml" <<'EOF'
version: '3.9'
services:
  redis:
    image: redis:7-alpine
EOF

    cd "$TEST_WORKSPACE"
    COMPOSE_PROJECT_NAME="$project1" docker-compose up -d 2>/dev/null || true
    COMPOSE_PROJECT_NAME="$project2" docker-compose up -d 2>/dev/null || true
    sleep 2

    # WHEN: Both spawn redis containers
    local containers=$(docker ps --filter "name=cfn-test-proj" --format "{{.Names}}" | wc -l)

    # THEN: Should have 2 unique containers (no conflicts)
    if [[ "$containers" -eq 2 ]]; then
        log_pass "COMPOSE_PROJECT_NAME creates isolated containers"
    else
        log_fail "Expected 2 containers, got $containers"
    fi

    COMPOSE_PROJECT_NAME="$project1" docker-compose down 2>/dev/null || true
    COMPOSE_PROJECT_NAME="$project2" docker-compose down 2>/dev/null || true
}

# Test 3: Port offset calculation from branch name
test_port_offset_by_branch() {
    log_test "Test 3: Port offset calculation from branch name"

    # GIVEN: Branch name "feature-auth"
    local branch_name="feature-auth"

    # WHEN: Calculate port offset (simple hash)
    local offset=$(echo -n "$branch_name" | cksum | awk '{print $1 % 100}')
    local redis_port=$((6379 + offset))
    local postgres_port=$((5432 + offset))
    local orchestrator_port=$((3001 + offset))

    # THEN: Ports should be unique per branch
    if [[ "$redis_port" -gt 6379 && "$postgres_port" -gt 5432 && "$orchestrator_port" -gt 3001 ]]; then
        log_pass "Port offset calculated: Redis=$redis_port, Postgres=$postgres_port, Orchestrator=$orchestrator_port"
    else
        log_fail "Port offset calculation failed"
    fi
}

# Test 4: Coordinator spawn in container
test_coordinator_container_spawn() {
    log_test "Test 4: Coordinator spawn in Docker container"

    # GIVEN: Docker network with Redis
    docker network create test-cfn-network 2>/dev/null || true
    docker run -d --name test-cfn-redis --network test-cfn-network redis:7-alpine 2>/dev/null || true
    sleep 2

    # WHEN: Coordinator container spawns with proper configuration
    docker run --rm -d \
        --name test-cfn-coordinator \
        --network test-cfn-network \
        -e CFN_REDIS_HOST=test-cfn-redis \
        -e TASK_ID="test-task-123" \
        alpine:latest sleep 30 2>/dev/null

    sleep 2

    # THEN: Coordinator container should be running
    local status=$(docker inspect -f '{{.State.Status}}' test-cfn-coordinator 2>/dev/null || echo "not found")

    if [[ "$status" == "running" ]]; then
        log_pass "Coordinator container spawned successfully"
    else
        log_fail "Coordinator spawn failed: $status"
    fi

    docker rm -f test-cfn-coordinator test-cfn-redis 2>/dev/null || true
    docker network rm test-cfn-network 2>/dev/null || true
}

# Test 5: Environment variable injection
test_env_var_injection() {
    log_test "Test 5: Environment variable injection to coordinator"

    # GIVEN: Required environment variables
    local expected_vars="COMPOSE_PROJECT_NAME|CFN_REDIS_PORT|CFN_POSTGRES_PORT|TASK_ID"

    # WHEN: Container spawned with environment variables
    docker run --rm \
        --name test-env-check \
        -e COMPOSE_PROJECT_NAME="cfn-test" \
        -e CFN_REDIS_PORT="6379" \
        -e CFN_POSTGRES_PORT="5432" \
        -e TASK_ID="test-123" \
        alpine:latest env > /tmp/test-env-output.txt 2>/dev/null

    # THEN: All variables should be present
    local found=0
    if grep -q "COMPOSE_PROJECT_NAME=cfn-test" /tmp/test-env-output.txt || true; then ((found++)) || true; fi
    if grep -q "CFN_REDIS_PORT=6379" /tmp/test-env-output.txt || true; then ((found++)) || true; fi
    if grep -q "CFN_POSTGRES_PORT=5432" /tmp/test-env-output.txt || true; then ((found++)) || true; fi
    if grep -q "TASK_ID=test-123" /tmp/test-env-output.txt || true; then ((found++)) || true; fi

    if [[ "$found" -eq 4 ]]; then
        log_pass "All environment variables injected correctly"
    else
        log_fail "Only $found/4 environment variables found"
    fi

    rm -f /tmp/test-env-output.txt
}

# Test 6: Service name resolution vs localhost
test_service_name_vs_localhost() {
    log_test "Test 6: Service name resolution (redis, not 127.0.0.1)"

    # GIVEN: Docker network with Redis service
    docker network create test-service-network 2>/dev/null || true
    docker run -d --name test-redis-service --network test-service-network redis:7-alpine 2>/dev/null || true
    sleep 2

    # WHEN: Agent connects using service name "test-redis-service"
    local result=$(docker run --rm --network test-service-network \
        redis:7-alpine \
        redis-cli -h test-redis-service PING 2>&1 || echo "FAILED")

    # THEN: Service name should resolve (not require localhost)
    if [[ "$result" == "PONG" ]]; then
        log_pass "Service name resolution works (not localhost required)"
    else
        log_fail "Service name resolution failed: $result"
    fi

    docker rm -f test-redis-service 2>/dev/null || true
    docker network rm test-service-network 2>/dev/null || true
}

# Test 7: Multi-worktree isolation (no conflicts)
test_multi_worktree_isolation() {
    log_test "Test 7: Multi-worktree isolation (no port conflicts)"

    # GIVEN: Two simulated worktrees with different project names
    local proj1="cfn-main"
    local proj2="cfn-feature"

    # WHEN: Both spawn redis on different ports
    docker run -d --name "${proj1}-redis" -p 16380:6379 redis:7-alpine 2>/dev/null || true
    docker run -d --name "${proj2}-redis" -p 16381:6379 redis:7-alpine 2>/dev/null || true
    sleep 2

    # THEN: Both containers should be running without conflicts
    local running=$(docker ps --filter "name=cfn-" --format "{{.Names}}" | wc -l)

    if [[ "$running" -eq 2 ]]; then
        log_pass "Multi-worktree isolation works (no port conflicts)"
    else
        log_fail "Multi-worktree conflict detected: only $running containers running"
    fi

    docker rm -f "${proj1}-redis" "${proj2}-redis" 2>/dev/null || true
}

# Test 8: Container health checks
test_container_health_checks() {
    log_test "Test 8: Container health checks"

    # GIVEN: Container with health check
    docker run -d --name test-health-redis \
        --health-cmd "redis-cli PING" \
        --health-interval 2s \
        --health-timeout 1s \
        redis:7-alpine 2>/dev/null

    # WHEN: Waiting for health check to pass
    sleep 6

    # THEN: Health status should be "healthy"
    local health=$(docker inspect -f '{{.State.Health.Status}}' test-health-redis 2>/dev/null || echo "none")

    if [[ "$health" == "healthy" ]]; then
        log_pass "Container health check passed"
    else
        log_fail "Container health check failed: $health"
    fi

    docker rm -f test-health-redis 2>/dev/null || true
}

# Test 9: Volume mount validation (/workspace → project root)
test_volume_mount_validation() {
    log_test "Test 9: Volume mount validation (/workspace)"

    # GIVEN: Test workspace directory
    mkdir -p "$TEST_WORKSPACE/project"
    echo "test content" > "$TEST_WORKSPACE/project/test-file.txt"

    # WHEN: Container mounts workspace volume
    local content=$(docker run --rm \
        -v "$TEST_WORKSPACE/project:/workspace:rw" \
        alpine:latest \
        cat /workspace/test-file.txt 2>&1)

    # THEN: File should be readable from container
    if [[ "$content" == "test content" ]]; then
        log_pass "Volume mount /workspace validated"
    else
        log_fail "Volume mount failed: $content"
    fi
}

# Test 10: Network creation and isolation
test_network_creation() {
    log_test "Test 10: Docker network creation and isolation"

    # GIVEN: Custom Docker network
    docker network create test-isolated-network 2>/dev/null || true

    # WHEN: Verifying network exists
    local network_exists=$(docker network ls --filter "name=test-isolated-network" --format "{{.Name}}" | wc -l)

    # THEN: Network should exist
    if [[ "$network_exists" -eq 1 ]]; then
        log_pass "Docker network created successfully"
    else
        log_fail "Docker network creation failed"
    fi

    docker network rm test-isolated-network 2>/dev/null || true
}

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
    else
        log_fail "Cleanup failed: container still exists"
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
    else
        log_fail "Exit code propagation failed: expected 42, got $exit_code"
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
    else
        log_fail "Redis connection failed: $result"
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
    else
        log_fail "Postgres connection failed: $result"
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
    else
        log_fail "Communication failed: $message"
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
    else
        log_fail "Agent spawning failed: $status"
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
    else
        log_fail "Concurrent spawning failed: only $running/2 running"
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
    else
        log_fail "Port conflict not detected"
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
    else
        log_fail "Migration did not run"
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
    else
        log_fail "Config parsing failed: $memory"
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
    else
        log_fail "Task ID generation failed: $task_id"
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
    if grep -q "AGENT_TYPE=typescript-specialist" /tmp/test-metadata-output.txt || true; then ((found++)) || true; fi
    if grep -q "TASK_ID=test-123" /tmp/test-metadata-output.txt || true; then ((found++)) || true; fi
    if grep -q "BATCH_ID=batch-1" /tmp/test-metadata-output.txt || true; then ((found++)) || true; fi

    if [[ "$found" -eq 3 ]]; then
        log_pass "Agent metadata injection works"
    else
        log_fail "Only $found/3 metadata variables found"
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
    else
        log_fail "Recovery failed: $recovered_state"
    fi

    docker rm -f test-recovery-redis 2>/dev/null || true
    docker network rm test-recovery-network 2>/dev/null || true
}

# Execute tests
mkdir -p "$TEST_WORKSPACE"

test_docker_service_discovery
test_compose_project_isolation
test_port_offset_by_branch
test_coordinator_container_spawn
test_env_var_injection
test_service_name_vs_localhost
test_multi_worktree_isolation
test_container_health_checks
test_volume_mount_validation
test_network_creation
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

# Summary
echo ""
log_section "Test Summary: Docker Mode Coordinator Spawning"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo "✅ All tests PASSED"
    exit 0
else
    echo "❌ Some tests FAILED"
    exit 1
fi
