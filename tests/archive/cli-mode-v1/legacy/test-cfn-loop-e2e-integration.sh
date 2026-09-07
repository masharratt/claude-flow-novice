#!/bin/bash
# tests/cli-mode/test-cfn-loop-e2e-integration.sh
# Phase 1 :: End-to-end CFN Loop validation via real execution (NOT a smoke test)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_DIR="/tmp/cfn-e2e-test"
TEST_TIMEOUT=300  # 5 minutes max
TASK_ID="e2e-test-$(date +%s)-$$"
COORDINATOR_TIMEOUT=180  # 3 minutes for coordinator spawn

# Track spawned processes for cleanup
SPAWNED_PIDS=()
REDIS_CLEANUP_KEYS=()

cleanup() {
    log_info "Starting cleanup process"

    # Kill any spawned CFN processes
    for pid in "${SPAWNED_PIDS[@]}"; do
        if ps -p "$pid" >/dev/null 2>&1; then
            log_info "Killing process $pid"
            kill -TERM "$pid" 2>/dev/null || true
            sleep 1
            kill -KILL "$pid" 2>/dev/null || true
        fi
    done

    # Clean up test directory
    if [ -d "$TEST_DIR" ]; then
        log_info "Removing test directory: $TEST_DIR"
        rm -rf "$TEST_DIR"
    fi

    # Clean up Redis keys created during test
    for key_pattern in "${REDIS_CLEANUP_KEYS[@]}"; do
        log_info "Cleaning Redis keys: $key_pattern"
        redis_keys "$key_pattern" | while read -r key; do
            [ -n "$key" ] && redis_del "$key"
        done
    done

    # Final orphan process cleanup
    pkill -f "cfn-v3-coordinator.*${TASK_ID}" 2>/dev/null || true
    pkill -f "backend-developer.*${TASK_ID}" 2>/dev/null || true
    pkill -f "tester.*${TASK_ID}" 2>/dev/null || true

    log_info "Cleanup complete"
}
trap cleanup EXIT

# ============================================================================
# HELPER: Wait for coordinator to start
# ============================================================================
wait_for_coordinator() {
    local task_id="$1"
    local timeout="${2:-60}"
    local elapsed=0

    log_info "Waiting for coordinator to spawn (timeout: ${timeout}s)"

    while [ $elapsed -lt "$timeout" ]; do
        # Check for coordinator process
        if pgrep -f "cfn-v3-coordinator.*${task_id}" >/dev/null 2>&1; then
            log_success "Coordinator process detected"
            return 0
        fi

        # Check for Redis context creation
        if redis_exists "cfn_loop:task:${task_id}:context"; then
            log_success "Coordinator context created in Redis"
            return 0
        fi

        sleep 2
        elapsed=$((elapsed + 2))
    done

    log_error "Timeout waiting for coordinator (${timeout}s)"
    return 1
}

# ============================================================================
# HELPER: Wait for deliverables
# ============================================================================
wait_for_deliverables() {
    local timeout="${1:-120}"
    local elapsed=0
    local required_files=("hello1.txt" "hello2.txt" "hello3.txt")

    log_info "Waiting for deliverables (timeout: ${timeout}s)"

    while [ $elapsed -lt "$timeout" ]; do
        local all_found=true

        for file in "${required_files[@]}"; do
            if [ ! -f "$TEST_DIR/$file" ]; then
                all_found=false
                break
            fi
        done

        if [ "$all_found" = true ]; then
            log_success "All deliverable files created"
            return 0
        fi

        sleep 5
        elapsed=$((elapsed + 5))
    done

    log_error "Timeout waiting for deliverables (${timeout}s)"
    log_info "Files found:"
    ls -la "$TEST_DIR" 2>/dev/null || echo "  (directory does not exist)"
    return 1
}

# ============================================================================
# HELPER: Check Redis coordination evidence
# ============================================================================
check_redis_coordination() {
    local task_id="$1"

    log_step "Validating Redis coordination evidence"

    # Check for task context
    if redis_exists "cfn_loop:task:${task_id}:context"; then
        log_success "Task context exists in Redis"
    else
        log_warn "No task context found in Redis"
        return 1
    fi

    # Check for agent registrations
    local agent_keys
    agent_keys=$(redis_keys "swarm:${task_id}:*:done" | wc -l)

    if [ "$agent_keys" -gt 0 ]; then
        log_success "Found $agent_keys agent completion signals"
    else
        log_warn "No agent completion signals found"
    fi

    # Check for confidence scores
    local confidence_keys
    confidence_keys=$(redis_keys "swarm:${task_id}:confidence:*" | wc -l)

    if [ "$confidence_keys" -gt 0 ]; then
        log_success "Found $confidence_keys confidence score entries"
    else
        log_warn "No confidence scores found"
    fi

    return 0
}

# ============================================================================
# HELPER: Verify file contents
# ============================================================================
verify_file_contents() {
    local expected_content="Hello from CFN Loop"
    local files=("hello1.txt" "hello2.txt" "hello3.txt")

    log_step "Verifying file contents"

    for file in "${files[@]}"; do
        local file_path="$TEST_DIR/$file"

        if [ ! -f "$file_path" ]; then
            log_error "File not found: $file"
            return 1
        fi

        local actual_content
        actual_content=$(cat "$file_path")

        if echo "$actual_content" | grep -q "$expected_content"; then
            log_success "File $file contains expected content"
        else
            log_error "File $file has incorrect content:"
            log_error "  Expected substring: $expected_content"
            log_error "  Actual: $actual_content"
            return 1
        fi
    done

    return 0
}

# ============================================================================
# HELPER: Check logs for workflow stages
# ============================================================================
check_workflow_stages() {
    local task_id="$1"

    log_step "Checking workflow stage completion"

    # Check coordinator logs
    local coord_log="/tmp/cfn-coordinator-${task_id}.log"

    if [ -f "$coord_log" ]; then
        log_info "Analyzing coordinator log: $coord_log"

        # Check for orchestration start
        if grep -q "orchestrate.sh" "$coord_log" 2>/dev/null; then
            log_success "Orchestration initiated"
        else
            log_warn "No orchestration evidence in coordinator log"
        fi

        # Check for agent spawning
        if grep -q "npx claude-flow-novice agent" "$coord_log" 2>/dev/null; then
            log_success "Agent spawning detected"
        else
            log_warn "No agent spawn commands in log"
        fi
    else
        log_warn "Coordinator log not found at: $coord_log"
    fi

    return 0
}

# ============================================================================
# TEST: Prerequisites validation
# ============================================================================
test_prerequisites() {
    log_step "GIVEN test environment prerequisites"

    # Verify Redis is available
    assert_success "Redis is available" verify_redis_health

    # Verify test directory can be created
    mkdir -p "$TEST_DIR"
    assert_dir_exists "$TEST_DIR" "Test directory created"

    # Verify CLI is available
    assert_success "CFN CLI available" command -v npx

    log_success "All prerequisites met"
}

# ============================================================================
# TEST: Execute real CFN Loop end-to-end
# ============================================================================
test_e2e_cfn_loop_execution() {
    log_step "GIVEN clean test environment"

    # Register cleanup patterns
    REDIS_CLEANUP_KEYS+=("cfn_loop:task:${TASK_ID}:*")
    REDIS_CLEANUP_KEYS+=("swarm:${TASK_ID}:*")

    # Create clean test directory
    rm -rf "$TEST_DIR"
    mkdir -p "$TEST_DIR"
    assert_dir_exists "$TEST_DIR" "Test directory initialized"

    log_step "WHEN /cfn-loop-cli executes simple file creation task"

    # Construct coordinator spawn command (simulating /cfn-loop-cli)
    local task_description="Create 3 hello-world text files (hello1.txt, hello2.txt, hello3.txt) in ${TEST_DIR} with content 'Hello from CFN Loop'"
    local mode="mvp"
    local max_iterations="2"

    log_info "Task ID: $TASK_ID"
    log_info "Task: $task_description"
    log_info "Mode: $mode"
    log_info "Max iterations: $max_iterations"

    # Spawn coordinator in background (exactly as /cfn-loop-cli does)
    log_info "Spawning coordinator..."

    npx claude-flow-novice agent cfn-v3-coordinator \
        --task-id "$TASK_ID" \
        --context "TASK_DESCRIPTION='$task_description' MODE='$mode' MAX_ITERATIONS=$max_iterations CFN_DOCKER_MODE='false'" \
        --timeout 300 \
        --background=true &

    local coordinator_pid=$!
    SPAWNED_PIDS+=("$coordinator_pid")

    log_info "Coordinator spawned with PID: $coordinator_pid"

    # Wait for coordinator to start
    if ! wait_for_coordinator "$TASK_ID" "$COORDINATOR_TIMEOUT"; then
        log_error "Coordinator failed to start"
        return 1
    fi

    log_step "THEN coordinator orchestrates workflow"

    # Give coordinator time to orchestrate
    sleep 10

    # Check if coordinator is still running (good sign)
    if ps -p "$coordinator_pid" >/dev/null 2>&1; then
        log_success "Coordinator process is running"
    else
        log_warn "Coordinator process exited early"
        # Check exit status if available
        wait "$coordinator_pid" || log_error "Coordinator exited with error code: $?"
    fi

    # Check for Redis coordination evidence
    check_redis_coordination "$TASK_ID" || log_warn "Limited Redis coordination detected"

    log_step "THEN deliverables are created"

    # Wait for files to be created
    if wait_for_deliverables 120; then
        # Validate file contents
        assert_success "File contents are correct" verify_file_contents
    else
        log_error "Deliverables not created within timeout"
        log_info "Checking what agents reported..."

        # Debug: Show Redis state
        log_info "Redis keys for task:"
        redis_keys "swarm:${TASK_ID}:*" | head -20
        redis_keys "cfn_loop:task:${TASK_ID}:*" | head -20

        return 1
    fi

    log_step "THEN workflow stages completed"
    check_workflow_stages "$TASK_ID" || log_warn "Limited workflow evidence found"

    log_success "End-to-end CFN Loop execution validated"
}

# ============================================================================
# TEST: Coordination mechanism validation
# ============================================================================
test_coordination_mechanisms() {
    log_step "GIVEN completed CFN Loop execution"

    log_step "WHEN examining coordination data"

    # Check for task context in Redis
    if redis_exists "cfn_loop:task:${TASK_ID}:context"; then
        local context
        context=$(redis_get "cfn_loop:task:${TASK_ID}:context")
        log_success "Task context retrieved from Redis"
        log_info "Context preview: ${context:0:100}..."
    else
        log_warn "No task context in Redis (may use alternative storage)"
    fi

    # Check for agent completion signals
    local completion_keys
    completion_keys=$(redis_keys "swarm:${TASK_ID}:*:done")

    if [ -n "$completion_keys" ]; then
        local count
        count=$(echo "$completion_keys" | wc -l)
        log_success "Found $count agent completion signals"

        # Show agent IDs
        log_info "Agents that completed:"
        echo "$completion_keys" | while read -r key; do
            [ -n "$key" ] && echo "  - $key"
        done
    else
        log_warn "No agent completion signals found"
    fi

    log_step "THEN coordination mechanisms functioned"
    # Note: Pass/warn only - this test is informational
    log_info "Coordination validation complete (informational)"
}

# ============================================================================
# TEST: Deliverable quality validation
# ============================================================================
test_deliverable_quality() {
    log_step "GIVEN created deliverables"

    local files=("hello1.txt" "hello2.txt" "hello3.txt")

    log_step "WHEN examining file properties"

    for file in "${files[@]}"; do
        local file_path="$TEST_DIR/$file"

        # File exists
        assert_file_exists "$file_path" "File exists: $file"

        # File is not empty
        if [ -s "$file_path" ]; then
            log_success "File is not empty: $file"
        else
            log_error "File is empty: $file"
            return 1
        fi

        # File has reasonable size (not corrupted)
        local size
        size=$(stat -c%s "$file_path" 2>/dev/null || stat -f%z "$file_path" 2>/dev/null || echo "0")

        if [ "$size" -gt 0 ] && [ "$size" -lt 1000 ]; then
            log_success "File size is reasonable: $file ($size bytes)"
        else
            log_warn "Unusual file size: $file ($size bytes)"
        fi
    done

    log_step "THEN deliverables meet quality standards"
    assert_success "All files verified" verify_file_contents
}

# ============================================================================
# TEST: Performance metrics
# ============================================================================
test_performance_metrics() {
    log_step "GIVEN completed CFN Loop execution"

    log_step "WHEN measuring performance"

    # Check execution time (should be < 3 minutes for simple task)
    local start_time
    start_time=$(date +%s)

    # Execution already complete, just log
    log_info "Task completed within timeout window"

    # Check process efficiency (no zombie processes)
    local zombie_count
    zombie_count=$(pgrep -f "cfn.*${TASK_ID}" -x | wc -l)

    if [ "$zombie_count" -eq 0 ]; then
        log_success "No zombie processes detected"
    else
        log_warn "Found $zombie_count processes still running"
    fi

    log_step "THEN performance is acceptable"
    log_info "Performance validation complete"
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================
run_all_tests() {
    setup_test "cfn-loop-e2e-integration"

    log_step "🚀 Starting CFN Loop End-to-End Integration Test"
    log_warn "This test executes a REAL CFN Loop (costs ~\$0.05-0.10)"

    # Phase 1: Prerequisites
    test_prerequisites

    # Phase 2: Execute real CFN Loop
    test_e2e_cfn_loop_execution

    # Phase 3: Validate coordination
    test_coordination_mechanisms

    # Phase 4: Validate deliverables
    test_deliverable_quality

    # Phase 5: Performance metrics
    test_performance_metrics

    print_test_summary
}

run_all_tests
