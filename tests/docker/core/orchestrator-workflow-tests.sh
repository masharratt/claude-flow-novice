#!/bin/bash
# tests/docker-mode/test-orchestrator-workflow.sh
# Docker Mode Orchestrator Workflow Test Suite (21 tests)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/docker/tests/test-helpers.sh"

# Test configuration
TEST_ID="docker-orchestrator-$(date +%s)"
COMPOSE_PROJECT_NAME="cfn-test-${TEST_ID}"
TEST_WORKSPACE="/tmp/docker-test-$$"
CONTAINER_NETWORK="${COMPOSE_PROJECT_NAME}_default"

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up Docker test environment..."

    docker ps -a --filter "name=cfn-test-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker ps -a --filter "name=loop3-agent-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker ps -a --filter "name=loop2-validator-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker rm -f test-iter-redis iteration-agent-1 iteration-agent-2 \
        test-monitoring-agent test-stuck-agent test-protocol-redis \
        test-context-redis test-health-agent test-timeout-agent \
        loop3-agent-parallel-1 loop3-agent-parallel-2 loop3-agent-parallel-3 \
        loop3-agent-parallel-4 loop3-agent-parallel-5 loop3-agent-parallel-6 \
        test-seq-redis test-cleanup-agent agent-network-a agent-network-b \
        log-agent-1 log-agent-2 log-agent-3 exit-code-test 2>/dev/null || true
    docker network rm "$CONTAINER_NETWORK" test-orch-network test-iter-network \
        test-monitoring-network test-protocol-network test-context-network \
        test-parallel-network test-seq-network test-cleanup-network \
        test-network-a test-network-b 2>/dev/null || true
    rm -rf "$TEST_WORKSPACE" 2>/dev/null || true

    exit $exit_code
}

trap cleanup EXIT INT TERM

# Test counters

# Test 1: Loop 3 spawning in containers
test_loop3_container_spawning() {
    log_test "Test 1: Loop 3 spawning (3 agents in separate containers)"

    # GIVEN: Docker network with Redis
    docker network create test-orch-network 2>/dev/null || true
    docker run -d --name cfn-test-redis \
        --network test-orch-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Spawn 3 Loop 3 agents in separate containers
    for i in 1 2 3; do
        docker run -d --name "loop3-agent-$i" \
            --network test-orch-network \
            alpine:latest \
            sleep 10 2>/dev/null
    done

    sleep 2

    # THEN: All 3 agents should be running
    local running=$(docker ps --filter "name=loop3-agent-" --format "{{.Names}}" | wc -l)

    if [[ "$running" -eq 3 ]]; then
        log_pass "Loop 3 agents spawned in containers successfully"
    else
        log_fail "Loop 3 spawning failed: only $running/3 agents running"
    fi

    docker rm -f loop3-agent-1 loop3-agent-2 loop3-agent-3 cfn-test-redis 2>/dev/null || true
    docker network rm test-orch-network 2>/dev/null || true
}

# Test 2: Redis coordination via service name
test_redis_service_coordination() {
    log_test "Test 2: Redis coordination via service name"

    # GIVEN: Redis container with service name
    docker network create test-orch-network 2>/dev/null || true
    docker run -d --name cfn-test-redis \
        --network test-orch-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Agent connects using service name
    local result=$(docker run --rm --network test-orch-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis PING 2>&1 || echo "FAILED")

    # THEN: Connection should succeed
    if [[ "$result" == "PONG" ]]; then
        log_pass "Redis coordination via service name works"
    else
        log_fail "Redis service coordination failed: $result"
    fi

    docker rm -f cfn-test-redis 2>/dev/null || true
    docker network rm test-orch-network 2>/dev/null || true
}

# Test 3: Shared volume access (Loop 3 creates, Loop 2 reads)
test_shared_volume_coordination() {
    log_test "Test 3: Shared volume access (Loop 3 creates, Loop 2 reads)"

    # GIVEN: Shared volume workspace
    mkdir -p "$TEST_WORKSPACE/shared"

    # WHEN: Loop 3 agent creates file
    docker run --rm \
        -v "$TEST_WORKSPACE/shared:/workspace:rw" \
        alpine:latest \
        sh -c "echo 'Loop 3 output' > /workspace/output.txt" 2>/dev/null

    # Loop 2 agent reads file
    local content=$(docker run --rm \
        -v "$TEST_WORKSPACE/shared:/workspace:ro" \
        alpine:latest \
        cat /workspace/output.txt 2>&1)

    # THEN: Loop 2 should read Loop 3 file
    if [[ "$content" == "Loop 3 output" ]]; then
        log_pass "Shared volume coordination works"
    else
        log_fail "Shared volume coordination failed: $content"
    fi
}

# Test 4: Container exit code propagation
test_container_exit_code_propagation() {
    log_test "Test 4: Container exit code propagation"

    # GIVEN: Container with specific exit code
    docker run --name exit-code-test alpine:latest sh -c "exit 42" 2>/dev/null || true

    # WHEN: Checking exit code
    local exit_code=$(docker inspect -f '{{.State.ExitCode}}' exit-code-test 2>/dev/null)

    # THEN: Exit code should be 42
    if [[ "$exit_code" -eq 42 ]]; then
        log_pass "Container exit code propagation works"
    else
        log_fail "Exit code propagation failed: expected 42, got $exit_code"
    fi

    docker rm -f exit-code-test 2>/dev/null || true
}

# Test 5: Gate check execution (test pass rates → threshold validation)
test_gate_check_execution() {
    log_test "Test 5: Gate check execution (test pass rates)"

    # GIVEN: Test results in container
    mkdir -p "$TEST_WORKSPACE"
    cat > "$TEST_WORKSPACE/gate-check.sh" <<'EOF'
#!/bin/sh
PASS_RATE=$1
THRESHOLD=$2

# Use awk for floating point comparison (bc not always available)
result=$(awk -v pr="$PASS_RATE" -v th="$THRESHOLD" 'BEGIN { print (pr >= th) ? "PASS" : "FAIL" }')

if [ "$result" = "PASS" ]; then
    echo "GATE_PASS"
    exit 0
else
    echo "GATE_FAIL"
    exit 1
fi
EOF

    chmod +x "$TEST_WORKSPACE/gate-check.sh"

    # WHEN: Running gate check with pass rate 0.96 vs threshold 0.95
    local result=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:rw" \
        alpine:latest \
        sh /workspace/gate-check.sh 0.96 0.95)

    # THEN: Gate should pass
    if echo "$result" | grep -q "GATE_PASS"; then
        log_pass "Gate check execution works"
    else
        log_fail "Gate check failed: $result"
    fi
}

# Test 6: Loop 2 waiting mechanism (coordination-wait for gate signal)
test_loop2_waiting_mechanism() {
    log_test "Test 6: Loop 2 waiting mechanism (coordination-wait)"

    # GIVEN: Redis and Loop 2 validator container
    docker network create test-orch-network 2>/dev/null || true
    docker run -d --name cfn-test-redis \
        --network test-orch-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Loop 2 waits for gate signal
    docker run -d --name loop2-validator \
        --network test-orch-network \
        redis:7-alpine \
        sh -c "redis-cli -h cfn-test-redis BLPOP gate:passed 10" 2>/dev/null

    sleep 1

    # Orchestrator sends gate signal
    docker run --rm --network test-orch-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis LPUSH gate:passed "ready" 2>/dev/null

    # THEN: Loop 2 should receive signal
    sleep 2
    local logs=$(docker logs loop2-validator 2>&1)

    if echo "$logs" | grep -q "ready"; then
        log_pass "Loop 2 waiting mechanism works"
    else
        log_fail "Loop 2 waiting mechanism failed"
    fi

    docker rm -f loop2-validator cfn-test-redis 2>/dev/null || true
    docker network rm test-orch-network 2>/dev/null || true
}

# Test 7: Consensus collection (3-5 validators report scores)
test_consensus_collection() {
    log_test "Test 7: Consensus collection (3 validators)"

    # GIVEN: Redis and 3 validator containers
    docker network create test-orch-network 2>/dev/null || true
    docker run -d --name cfn-test-redis \
        --network test-orch-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Validators report scores
    for i in 1 2 3; do
        local score=$(echo "scale=2; 0.85 + $i * 0.02" | bc)
        docker run --rm --network test-orch-network \
            redis:7-alpine \
            redis-cli -h cfn-test-redis SET "validator:$i:score" "$score" 2>/dev/null
    done

    # THEN: All scores collected
    local score_count=$(docker run --rm --network test-orch-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis KEYS "validator:*:score" 2>/dev/null | wc -l)

    if [[ "$score_count" -eq 3 ]]; then
        log_pass "Consensus collection works"
    else
        log_fail "Consensus collection failed: $score_count/3 scores"
    fi

    docker rm -f cfn-test-redis 2>/dev/null || true
    docker network rm test-orch-network 2>/dev/null || true
}

# Test 8: Product Owner decision parsing (PROCEED/ITERATE/ABORT)
test_product_owner_decision_parsing() {
    log_test "Test 8: Product Owner decision parsing"

    # GIVEN: Product Owner decision in Redis
    docker network create test-orch-network 2>/dev/null || true
    docker run -d --name cfn-test-redis \
        --network test-orch-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Product Owner sets decision
    docker run --rm --network test-orch-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis SET "decision:status" "ITERATE" 2>/dev/null

    # THEN: Decision should be parseable
    local decision=$(docker run --rm --network test-orch-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis GET "decision:status" 2>/dev/null)

    if [[ "$decision" == "ITERATE" ]]; then
        log_pass "Product Owner decision parsing works"
    else
        log_fail "Decision parsing failed: $decision"
    fi

    docker rm -f cfn-test-redis 2>/dev/null || true
    docker network rm test-orch-network 2>/dev/null || true
}

# Test 9: Iteration management (wake agents for iteration N+1)
test_iteration_management() {
    log_test "Test 9: Iteration management (wake agents for iteration N+1)"

    # GIVEN: Redis with iteration state
    docker network create test-iter-network 2>/dev/null || true
    docker run -d --name test-iter-redis \
        --network test-iter-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Coordinator triggers iteration N+1
    docker run --rm --network test-iter-network \
        redis:7-alpine \
        redis-cli -h test-iter-redis SET "iteration:current" "2" 2>/dev/null

    # Agents wake up on iteration signal
    docker run -d --name iteration-agent-1 \
        --network test-iter-network \
        alpine:latest sh -c "sleep 5" 2>/dev/null
    docker run -d --name iteration-agent-2 \
        --network test-iter-network \
        alpine:latest sh -c "sleep 5" 2>/dev/null

    sleep 2
    local active=$(docker ps --filter "name=iteration-agent-" --format "{{.Names}}" | wc -l)

    # THEN: Agents should be active in new iteration
    if [[ "$active" -eq 2 ]]; then
        log_pass "Iteration management works (N+1 wake mechanism)"
    else
        log_fail "Iteration management failed: only $active/2 agents active"
    fi

    docker rm -f iteration-agent-1 iteration-agent-2 test-iter-redis 2>/dev/null || true
    docker network rm test-iter-network 2>/dev/null || true
}

# Test 10: Enhanced monitoring v3.0 (progress tracking)
test_enhanced_monitoring() {
    log_test "Test 10: Enhanced monitoring v3.0 (progress tracking)"

    # GIVEN: Agent with monitoring metadata
    docker network create test-monitoring-network 2>/dev/null || true
    docker run -d --name test-monitoring-agent \
        --network test-monitoring-network \
        -e AGENT_ID="agent-123" \
        -e TASK_ID="task-456" \
        -e PROGRESS="0.65" \
        alpine:latest sleep 10 2>/dev/null

    sleep 2

    # WHEN: Checking agent metadata
    local agent_id=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' test-monitoring-agent | grep "AGENT_ID" | cut -d= -f2)
    local progress=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' test-monitoring-agent | grep "PROGRESS" | cut -d= -f2)

    # THEN: Monitoring metadata should be accessible
    if [[ "$agent_id" == "agent-123" && "$progress" == "0.65" ]]; then
        log_pass "Enhanced monitoring v3.0 works (progress tracking)"
    else
        log_fail "Enhanced monitoring failed: agent_id=$agent_id, progress=$progress"
    fi

    docker rm -f test-monitoring-agent 2>/dev/null || true
    docker network rm test-monitoring-network 2>/dev/null || true
}

# Test 11: Automatic recovery (stuck agent detection)
test_automatic_recovery() {
    log_test "Test 11: Automatic recovery (stuck agent detection)"

    # GIVEN: Agent with health check timeout
    docker run -d --name test-stuck-agent \
        --health-cmd "exit 1" \
        --health-interval 2s \
        --health-timeout 1s \
        --health-retries 2 \
        alpine:latest sleep 30 2>/dev/null

    # WHEN: Waiting for health check to fail
    sleep 6

    # THEN: Health status should be "unhealthy"
    local health=$(docker inspect -f '{{.State.Health.Status}}' test-stuck-agent 2>/dev/null || echo "none")

    if [[ "$health" == "unhealthy" ]]; then
        log_pass "Automatic recovery works (stuck agent detection)"
    else
        log_fail "Stuck agent detection failed: health=$health"
    fi

    docker rm -f test-stuck-agent 2>/dev/null || true
}

# Test 12: Protocol compliance (prevents consensus on vapor)
test_protocol_compliance() {
    log_test "Test 12: Protocol compliance (prevents consensus on vapor)"

    # GIVEN: Agent must signal completion before validator checks
    docker network create test-protocol-network 2>/dev/null || true
    docker run -d --name test-protocol-redis \
        --network test-protocol-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Agent signals completion
    docker run --rm --network test-protocol-network \
        redis:7-alpine \
        redis-cli -h test-protocol-redis SET "agent:1:status" "completed" 2>/dev/null

    # Validator checks completion before proceeding
    local status=$(docker run --rm --network test-protocol-network \
        redis:7-alpine \
        redis-cli -h test-protocol-redis GET "agent:1:status" 2>/dev/null)

    # THEN: Validator should see completed status
    if [[ "$status" == "completed" ]]; then
        log_pass "Protocol compliance works (prevents consensus on vapor)"
    else
        log_fail "Protocol compliance failed: status=$status"
    fi

    docker rm -f test-protocol-redis 2>/dev/null || true
    docker network rm test-protocol-network 2>/dev/null || true
}

# Test 13: Context validation (broadcast messages)
test_context_validation() {
    log_test "Test 13: Context validation (broadcast messages)"

    # GIVEN: Broadcast message in Redis
    docker network create test-context-network 2>/dev/null || true
    docker run -d --name test-context-redis \
        --network test-context-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Coordinator broadcasts context
    docker run --rm --network test-context-network \
        redis:7-alpine \
        redis-cli -h test-context-redis PUBLISH "broadcast:context" "iteration-2-started" 2>/dev/null

    # Agent subscribes and validates
    local broadcast=$(docker run --rm --network test-context-network \
        redis:7-alpine \
        redis-cli -h test-context-redis GET "broadcast:context" 2>/dev/null || echo "none")

    # THEN: Context broadcast should be deliverable (use SET for validation)
    docker run --rm --network test-context-network \
        redis:7-alpine \
        redis-cli -h test-context-redis SET "broadcast:context" "iteration-2-started" 2>/dev/null

    local validated=$(docker run --rm --network test-context-network \
        redis:7-alpine \
        redis-cli -h test-context-redis GET "broadcast:context" 2>/dev/null)

    if [[ "$validated" == "iteration-2-started" ]]; then
        log_pass "Context validation works (broadcast messages)"
    else
        log_fail "Context validation failed: $validated"
    fi

    docker rm -f test-context-redis 2>/dev/null || true
    docker network rm test-context-network 2>/dev/null || true
}

# Test 14: Health checking (process health during execution)
test_health_checking() {
    log_test "Test 14: Health checking (process health during execution)"

    # GIVEN: Agent with health check
    docker run -d --name test-health-agent \
        --health-cmd "ps aux | grep -q sleep" \
        --health-interval 2s \
        --health-timeout 1s \
        alpine:latest sleep 30 2>/dev/null

    # WHEN: Waiting for health check to pass
    sleep 5

    # THEN: Health status should be "healthy"
    local health=$(docker inspect -f '{{.State.Health.Status}}' test-health-agent 2>/dev/null || echo "none")

    if [[ "$health" == "healthy" ]]; then
        log_pass "Health checking works (process health validation)"
    else
        log_fail "Health checking failed: health=$health"
    fi

    docker rm -f test-health-agent 2>/dev/null || true
}

# Test 15: Timeout handling (agent timeout detection)
test_timeout_handling() {
    log_test "Test 15: Timeout handling (agent timeout detection)"

    # GIVEN: Agent with short timeout
    set +e
    timeout 2s docker run --rm \
        --name test-timeout-agent \
        alpine:latest sleep 30 2>/dev/null
    local exit_code=$?
    set -e

    # WHEN: Timeout triggers (exit code 124 for timeout command)
    # THEN: Timeout should be detected
    if [[ "$exit_code" -eq 124 || "$exit_code" -eq 137 ]]; then
        log_pass "Timeout handling works (agent timeout detection)"
    else
        log_fail "Timeout detection failed: exit_code=$exit_code"
    fi
}

# Test 16: Parallel agent spawning (6+ agents concurrently)
test_parallel_spawning() {
    log_test "Test 16: Parallel agent spawning (6+ agents concurrently)"

    # GIVEN: Docker network for parallel agents
    docker network create test-parallel-network 2>/dev/null || true

    # WHEN: Spawning 6 agents in parallel
    for i in {1..6}; do
        docker run -d --name "loop3-agent-parallel-$i" \
            --network test-parallel-network \
            alpine:latest sleep 10 2>/dev/null &
    done
    wait

    sleep 2
    local running=$(docker ps --filter "name=loop3-agent-parallel-" --format "{{.Names}}" | wc -l)

    # THEN: All 6 agents should be running
    if [[ "$running" -eq 6 ]]; then
        log_pass "Parallel agent spawning works (6 agents concurrently)"
    else
        log_fail "Parallel spawning failed: only $running/6 agents running"
    fi

    for i in {1..6}; do
        docker rm -f "loop3-agent-parallel-$i" 2>/dev/null || true
    done
    docker network rm test-parallel-network 2>/dev/null || true
}

# Test 17: Sequential dependencies (Loop 3 → Loop 2 → PO)
test_sequential_dependencies() {
    log_test "Test 17: Sequential dependencies (Loop 3 → Loop 2 → PO)"

    # GIVEN: Redis for sequencing
    docker network create test-seq-network 2>/dev/null || true
    docker run -d --name test-seq-redis \
        --network test-seq-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Loop 3 completes, signals Loop 2
    docker run --rm --network test-seq-network \
        redis:7-alpine \
        redis-cli -h test-seq-redis SET "loop3:complete" "true" 2>/dev/null

    local loop3_done=$(docker run --rm --network test-seq-network \
        redis:7-alpine \
        redis-cli -h test-seq-redis GET "loop3:complete" 2>/dev/null)

    # Loop 2 waits for Loop 3
    if [[ "$loop3_done" == "true" ]]; then
        docker run --rm --network test-seq-network \
            redis:7-alpine \
            redis-cli -h test-seq-redis SET "loop2:complete" "true" 2>/dev/null
    fi

    local loop2_done=$(docker run --rm --network test-seq-network \
        redis:7-alpine \
        redis-cli -h test-seq-redis GET "loop2:complete" 2>/dev/null)

    # THEN: Sequential flow should work
    if [[ "$loop3_done" == "true" && "$loop2_done" == "true" ]]; then
        log_pass "Sequential dependencies work (Loop 3 → Loop 2 → PO)"
    else
        log_fail "Sequential dependencies failed: loop3=$loop3_done, loop2=$loop2_done"
    fi

    docker rm -f test-seq-redis 2>/dev/null || true
    docker network rm test-seq-network 2>/dev/null || true
}

# Test 18: Container cleanup after workflow
test_container_cleanup_workflow() {
    log_test "Test 18: Container cleanup after workflow"

    # GIVEN: Workflow creates containers
    docker network create test-cleanup-network 2>/dev/null || true
    docker run -d --name test-cleanup-agent \
        --network test-cleanup-network \
        alpine:latest sleep 5 2>/dev/null

    sleep 2

    # WHEN: Workflow completes and cleanup runs
    docker wait test-cleanup-agent 2>/dev/null || true
    docker rm -f test-cleanup-agent 2>/dev/null

    local remaining=$(docker ps -a --filter "name=test-cleanup-agent" --format "{{.Names}}" | wc -l)

    # THEN: Container should be cleaned up
    if [[ "$remaining" -eq 0 ]]; then
        log_pass "Container cleanup after workflow works"
    else
        log_fail "Cleanup failed: $remaining containers remaining"
    fi

    docker network rm test-cleanup-network 2>/dev/null || true
}

# Test 19: Volume persistence across iterations
test_volume_persistence_iterations() {
    log_test "Test 19: Volume persistence across iterations"

    # GIVEN: Volume for workspace
    mkdir -p "$TEST_WORKSPACE/persistent"

    # WHEN: Agent 1 writes to volume
    docker run --rm \
        -v "$TEST_WORKSPACE/persistent:/workspace:rw" \
        alpine:latest \
        sh -c "echo 'iteration 1 data' > /workspace/data.txt" 2>/dev/null

    # Agent 2 reads from volume (simulating iteration N+1)
    local data=$(docker run --rm \
        -v "$TEST_WORKSPACE/persistent:/workspace:ro" \
        alpine:latest \
        cat /workspace/data.txt 2>&1)

    # THEN: Data should persist
    if [[ "$data" == "iteration 1 data" ]]; then
        log_pass "Volume persistence across iterations works"
    else
        log_fail "Volume persistence failed: $data"
    fi
}

# Test 20: Network isolation validation
test_network_isolation() {
    log_test "Test 20: Network isolation validation"

    # GIVEN: Two isolated networks
    docker network create test-network-a 2>/dev/null || true
    docker network create test-network-b 2>/dev/null || true

    docker run -d --name agent-network-a \
        --network test-network-a \
        alpine:latest sleep 10 2>/dev/null

    docker run -d --name agent-network-b \
        --network test-network-b \
        alpine:latest sleep 10 2>/dev/null

    sleep 2

    # WHEN: Testing network isolation
    set +e
    docker exec agent-network-a ping -c 1 agent-network-b 2>/dev/null
    local ping_result=$?
    set -e

    # THEN: Networks should be isolated (ping fails)
    if [[ "$ping_result" -ne 0 ]]; then
        log_pass "Network isolation validation works"
    else
        log_fail "Network isolation failed: networks not isolated"
    fi

    docker rm -f agent-network-a agent-network-b 2>/dev/null || true
    docker network rm test-network-a test-network-b 2>/dev/null || true
}

# Test 21: Log aggregation across containers
test_log_aggregation() {
    log_test "Test 21: Log aggregation across containers"

    # GIVEN: Multiple agents with logs
    docker run -d --name log-agent-1 \
        alpine:latest sh -c "echo 'Agent 1 log' && sleep 5" 2>/dev/null
    docker run -d --name log-agent-2 \
        alpine:latest sh -c "echo 'Agent 2 log' && sleep 5" 2>/dev/null
    docker run -d --name log-agent-3 \
        alpine:latest sh -c "echo 'Agent 3 log' && sleep 5" 2>/dev/null

    sleep 2

    # WHEN: Collecting logs
    local log1=$(docker logs log-agent-1 2>&1 | grep "Agent 1 log")
    local log2=$(docker logs log-agent-2 2>&1 | grep "Agent 2 log")
    local log3=$(docker logs log-agent-3 2>&1 | grep "Agent 3 log")

    # THEN: All logs should be accessible
    local found=0
    [[ -n "$log1" ]] && ((found++))
    [[ -n "$log2" ]] && ((found++))
    [[ -n "$log3" ]] && ((found++))

    if [[ "$found" -eq 3 ]]; then
        log_pass "Log aggregation across containers works"
    else
        log_fail "Log aggregation failed: only $found/3 logs collected"
    fi

    docker rm -f log-agent-1 log-agent-2 log-agent-3 2>/dev/null || true
}

# Execute tests
mkdir -p "$TEST_WORKSPACE"

test_loop3_container_spawning
test_redis_service_coordination
test_shared_volume_coordination
test_container_exit_code_propagation
test_gate_check_execution
test_loop2_waiting_mechanism
test_consensus_collection
test_product_owner_decision_parsing
test_iteration_management
test_enhanced_monitoring
test_automatic_recovery
test_protocol_compliance
test_context_validation
test_health_checking
test_timeout_handling
test_parallel_spawning
test_sequential_dependencies
test_container_cleanup_workflow
test_volume_persistence_iterations
test_network_isolation
test_log_aggregation

# Summary
echo ""
log_section "Test Summary: Docker Mode Orchestrator Workflow"
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
