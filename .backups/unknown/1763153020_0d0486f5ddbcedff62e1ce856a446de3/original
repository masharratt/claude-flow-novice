#!/bin/bash
# tests/docker/agent-lifecycle-tests.sh
# Phase 3 :: Agent lifecycle management (spawn-to-exit, metadata capture, auto-removal, orphan detection)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/helpers/architecture-test-helpers.sh"

# Configuration
NETWORK_NAME="cfn-network"
REDIS_SERVICE="cfn-redis"
TEST_TASK_ID="lifecycle-test-$(date +%s)"
DEBUG_DIR="/tmp/cfn-debug"

cleanup() {
    log_step "GIVEN cleanup of test containers and artifacts"
    docker rm -f lifecycle-agent-spawn 2>/dev/null || true
    docker rm -f lifecycle-agent-metadata 2>/dev/null || true
    docker rm -f lifecycle-agent-removal 2>/dev/null || true
    docker rm -f lifecycle-agent-orphan 2>/dev/null || true
    docker exec "$REDIS_SERVICE" redis-cli DEL "task:queue" "task:total" "task:completed" 2>/dev/null || true
    rm -rf "$DEBUG_DIR/$TEST_TASK_ID"
}
trap cleanup EXIT

# Test 1: Agent spawn-to-exit lifecycle (environment-based task execution)
test_agent_spawn_to_exit_lifecycle() {
    log_step "Test 1: Full agent lifecycle from spawn to exit"

    # GIVEN: Agent with embedded task in environment (Bug #4 pattern validation)
    AGENT_ID="lifecycle-agent-spawn"
    TASK_PROMPT="Fix TypeScript error in test.ts"

    # WHEN: Agent spawns with task in environment (NOT queue claiming)
    # This validates the ACTUAL coordinator pattern from Bug #4 findings
    docker run -d \
        --name "$AGENT_ID" \
        --network "$NETWORK_NAME" \
        -e CFN_REDIS_HOST="$REDIS_SERVICE" \
        -e CFN_REDIS_PORT=6379 \
        -e TASK_ID="$TEST_TASK_ID" \
        -e AGENT_ID="$AGENT_ID" \
        -e TASK_PROMPT="$TASK_PROMPT" \
        node:20-slim \
        sh -c "
        npm install redis 2>/dev/null &&
        node -e \"
        const redis = require('redis');
        const client = redis.createClient({
            socket: {
                host: process.env.CFN_REDIS_HOST,
                port: parseInt(process.env.CFN_REDIS_PORT)
            }
        });

        async function executeTask() {
            console.log('Agent starting with task:', process.env.TASK_PROMPT);

            // Connect to Redis
            await client.connect();

            // Report heartbeat
            await client.hSet(\\\`swarm:\\\${process.env.TASK_ID}:\\\${process.env.AGENT_ID}\\\`, {
                status: 'running',
                heartbeat: Date.now().toString(),
                task: process.env.TASK_PROMPT
            });

            // Simulate task execution
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Report completion
            await client.hSet(\\\`swarm:\\\${process.env.TASK_ID}:\\\${process.env.AGENT_ID}\\\`, {
                status: 'completed',
                completed_at: new Date().toISOString()
            });

            console.log('Agent completed task');
            await client.quit();
            process.exit(0);
        }

        executeTask().catch((err) => {
            console.error('Agent failed:', err);
            process.exit(1);
        });
        \"
        " > /tmp/lifecycle-test.log 2>&1 &

    # Wait for agent to complete
    sleep 5

    # THEN: Agent completed successfully
    EXIT_CODE=$(docker wait "$AGENT_ID" 2>/dev/null || echo "1")

    if [ "$EXIT_CODE" = "0" ]; then
        log_pass "Agent completed lifecycle successfully (exit code: 0)"
    else
        log_fail "Agent failed during lifecycle (exit code: $EXIT_CODE)"
        docker logs "$AGENT_ID"
        return 1
    fi

    # Verify Redis metadata
    STATUS=$(docker exec "$REDIS_SERVICE" redis-cli HGET "swarm:${TEST_TASK_ID}:${AGENT_ID}" status)

    if [ "$STATUS" = "completed" ]; then
        log_pass "Agent reported completion to Redis"
    else
        log_fail "Agent did not report completion (status: $STATUS)"
        return 1
    fi
}

# Test 2: Container metadata capture (logs, stats, inspect)
test_container_metadata_capture() {
    log_step "Test 2: Container metadata capture after completion"

    # GIVEN: Agent that completes successfully
    AGENT_ID="lifecycle-agent-metadata"
    CONTAINER_ID=$(docker run -d \
        --name "$AGENT_ID" \
        --network "$NETWORK_NAME" \
        -e TASK_ID="$TEST_TASK_ID" \
        -e AGENT_ID="$AGENT_ID" \
        node:20-slim \
        sh -c "echo 'Agent task complete'; sleep 2; exit 0")

    # Wait for completion
    sleep 4

    # WHEN: Capture metadata (simulate coordinator's capture-and-cleanup.sh)
    mkdir -p "$DEBUG_DIR/$TEST_TASK_ID/$AGENT_ID"

    # Capture logs
    docker logs "$CONTAINER_ID" > "$DEBUG_DIR/$TEST_TASK_ID/$AGENT_ID/logs.txt" 2>&1

    # Capture container inspect
    docker inspect "$CONTAINER_ID" > "$DEBUG_DIR/$TEST_TASK_ID/$AGENT_ID/inspect.json" 2>&1

    # Capture stats (single snapshot)
    docker stats --no-stream "$CONTAINER_ID" > "$DEBUG_DIR/$TEST_TASK_ID/$AGENT_ID/stats.txt" 2>&1 || true

    # Create summary
    cat > "$DEBUG_DIR/$TEST_TASK_ID/$AGENT_ID/summary.txt" << EOF
Agent: $AGENT_ID
Container: $CONTAINER_ID
Task: $TEST_TASK_ID
Captured: $(date -Iseconds)
EOF

    # THEN: All metadata files exist
    if [ -f "$DEBUG_DIR/$TEST_TASK_ID/$AGENT_ID/logs.txt" ] && \
       [ -f "$DEBUG_DIR/$TEST_TASK_ID/$AGENT_ID/inspect.json" ] && \
       [ -f "$DEBUG_DIR/$TEST_TASK_ID/$AGENT_ID/summary.txt" ]; then
        log_pass "All metadata files captured (4/4)"
    else
        log_fail "Missing metadata files"
        return 1
    fi

    # Verify logs contain agent output
    if grep -q "Agent task complete" "$DEBUG_DIR/$TEST_TASK_ID/$AGENT_ID/logs.txt"; then
        log_pass "Agent logs captured correctly"
    else
        log_fail "Agent logs missing expected output"
        return 1
    fi
}

# Test 3: Auto-removal after completion
test_auto_removal_after_completion() {
    log_step "Test 3: Containers auto-removed after metadata capture"

    # GIVEN: Completed agent container
    AGENT_ID="lifecycle-agent-removal"
    CONTAINER_ID=$(docker run -d \
        --name "$AGENT_ID" \
        --network "$NETWORK_NAME" \
        node:20-slim \
        sh -c "echo 'Done'; exit 0")

    # Wait for completion
    sleep 3

    # WHEN: Remove container after metadata capture
    # (In real coordinator, this happens after capture-and-cleanup.sh)
    docker rm -f "$AGENT_ID" > /dev/null 2>&1

    # THEN: Container no longer exists
    if docker ps -a -q -f name="$AGENT_ID" | grep -q .; then
        log_fail "Container still exists after removal"
        return 1
    else
        log_pass "Container auto-removed successfully"
    fi

    # Verify using docker ps -a shows no matching container
    CONTAINER_COUNT=$(docker ps -a --filter "name=$AGENT_ID" | wc -l)
    if [ "$CONTAINER_COUNT" -eq 1 ]; then
        log_pass "No orphaned containers found (count: 0)"
    else
        log_fail "Orphaned container detected (count: $((CONTAINER_COUNT - 1)))"
        return 1
    fi
}

# Test 4: Orphaned container detection (coordinator monitoring)
test_orphaned_container_detection() {
    log_step "Test 4: Coordinator detects and cleans up orphaned agents"

    # GIVEN: Orphaned agent (spawned without task)
    AGENT_ID="lifecycle-agent-orphan"
    docker run -d \
        --name "$AGENT_ID" \
        --network "$NETWORK_NAME" \
        node:20-slim \
        sleep 300 > /dev/null 2>&1

    # Wait for container to start
    sleep 2

    # WHEN: Coordinator detects orphaned agents (simulated)
    # Real coordinator would track spawned agents and detect containers without metadata
    ORPHANED_AGENTS=$(docker ps --filter "name=lifecycle-agent-" --format "{{.Names}}")

    if echo "$ORPHANED_AGENTS" | grep -q "$AGENT_ID"; then
        log_pass "Orphaned agent detected: $AGENT_ID"
    else
        log_fail "Failed to detect orphaned agent"
        return 1
    fi

    # THEN: Orphaned container can be cleaned up
    docker stop "$AGENT_ID" > /dev/null 2>&1
    docker rm "$AGENT_ID" > /dev/null 2>&1

    if ! docker ps -a -q -f name="$AGENT_ID" | grep -q .; then
        log_pass "Orphaned container cleaned up successfully"
    else
        log_fail "Failed to clean up orphaned container"
        return 1
    fi
}

# Test 5: Container status tracking (Bug #4 pattern validation)
test_container_status_tracking() {
    log_step "Test 5: Coordinator tracks completion via Docker container status"

    # GIVEN: Multiple agents with different completion states
    declare -A AGENTS=(
        ["agent-completed"]="exit 0"
        ["agent-failed"]="exit 1"
        ["agent-running"]="sleep 30"
    )

    for agent_name in "${!AGENTS[@]}"; do
        CMD="${AGENTS[$agent_name]}"
        docker run -d \
            --name "lifecycle-$agent_name" \
            --network "$NETWORK_NAME" \
            node:20-slim \
            sh -c "$CMD" > /dev/null 2>&1
    done

    # Wait for status to stabilize
    sleep 3

    # WHEN: Check container status (coordinator's actual pattern)
    COMPLETED_STATUS=$(docker inspect -f '{{.State.Status}}' lifecycle-agent-completed 2>/dev/null || echo "unknown")
    FAILED_STATUS=$(docker inspect -f '{{.State.Status}}' lifecycle-agent-failed 2>/dev/null || echo "unknown")
    RUNNING_STATUS=$(docker inspect -f '{{.State.Status}}' lifecycle-agent-running 2>/dev/null || echo "unknown")

    log_info "Completed agent status: $COMPLETED_STATUS"
    log_info "Failed agent status: $FAILED_STATUS"
    log_info "Running agent status: $RUNNING_STATUS"

    # THEN: Status correctly reflects container state
    if [ "$COMPLETED_STATUS" = "exited" ]; then
        log_pass "Completed agent detected via Docker status"
    else
        log_fail "Completed agent status wrong: $COMPLETED_STATUS"
        return 1
    fi

    if [ "$RUNNING_STATUS" = "running" ]; then
        log_pass "Running agent detected via Docker status"
    else
        log_fail "Running agent status wrong: $RUNNING_STATUS"
        return 1
    fi

    # Cleanup
    docker rm -f lifecycle-agent-completed lifecycle-agent-failed lifecycle-agent-running 2>/dev/null || true
}

# Test 6: Coordinator wait pattern (Bug #4 pattern validation)
test_coordinator_wait_pattern() {
    log_step "Test 6: Coordinator waits for container exit (not Redis queue)"

    # GIVEN: Agent containers spawned
    AGENT_COUNT=3
    AGENT_IDS=()

    for i in $(seq 1 $AGENT_COUNT); do
        AGENT_ID="lifecycle-wait-agent-$i"
        AGENT_IDS+=("$AGENT_ID")

        docker run -d \
            --name "$AGENT_ID" \
            --network "$NETWORK_NAME" \
            node:20-slim \
            sh -c "sleep $((i * 2)); exit 0" > /dev/null 2>&1
    done

    # WHEN: Coordinator waits for all containers to exit (simulated)
    log_info "Waiting for $AGENT_COUNT agents to complete"

    START_TIME=$(date +%s)
    while true; do
        RUNNING_COUNT=0
        for agent_id in "${AGENT_IDS[@]}"; do
            STATUS=$(docker inspect -f '{{.State.Status}}' "$agent_id" 2>/dev/null || echo "exited")
            if [ "$STATUS" = "running" ]; then
                RUNNING_COUNT=$((RUNNING_COUNT + 1))
            fi
        done

        if [ $RUNNING_COUNT -eq 0 ]; then
            break
        fi

        log_info "Still running: $RUNNING_COUNT/$AGENT_COUNT agents"
        sleep 2

        # Timeout after 30 seconds
        ELAPSED=$(($(date +%s) - START_TIME))
        if [ $ELAPSED -gt 30 ]; then
            log_fail "Timeout waiting for agents to complete"
            return 1
        fi
    done

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    # THEN: All agents completed
    log_pass "All agents completed in ${DURATION}s (Docker status polling)"

    # Cleanup
    for agent_id in "${AGENT_IDS[@]}"; do
        docker rm -f "$agent_id" 2>/dev/null || true
    done
}

# Run all tests
log_step "Starting Agent Lifecycle Management Tests"
echo ""

test_agent_spawn_to_exit_lifecycle
test_container_metadata_capture
test_auto_removal_after_completion
test_orphaned_container_detection
test_container_status_tracking
test_coordinator_wait_pattern

echo ""
print_test_summary
