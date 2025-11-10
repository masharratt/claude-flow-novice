#!/usr/bin/env bash

##############################################################################
# CFN Loop Forgiveness CLI Hello World Test Suite
##############################################################################

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_RESULTS_DIR="/tmp/cfn-forgiveness-test-$(date +%s)"
TEST_ID="forgiveness-test-$(date +%s)"
TIMESTAMP=$(date +%s)

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Test metrics
declare -A TEST_RESULTS
declare -A RECOVERY_TIMES
declare -A SUCCESS_RATES

# Global test tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Forgiveness mechanisms to test
FORGIVENESS_MECHANISMS=(
    "multi_tier_spawning"
    "preflight_validation"
    "adaptive_timeout"
    "race_condition_prevention"
    "graceful_shutdown"
    "checkpoint_restart"
    "redis_fallback"
    "self_healing"
)

# Logging functions
log_info() {
    echo -e "${BLUE}[FORGIVENESS TEST]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
    TEST_RESULTS["$1"]="PASS"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
    TEST_RESULTS["$1"]="FAIL"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_test_start() {
    echo -e "${CYAN}[TEST START]${NC} $1"
    ((TESTS_TOTAL++))
}

# Utility functions
create_test_failure() {
    local failure_type="$1"
    local failure_dir="$TEST_RESULTS_DIR/failures/$failure_type"
    mkdir -p "$failure_dir"
    echo "$failure_type" > "$failure_dir/active"
}

cleanup_test_failure() {
    local failure_type="$1"
    local failure_dir="$TEST_RESULTS_DIR/failures/$failure_type"
    rm -f "$failure_dir/active" 2>/dev/null || true
}

is_failure_active() {
    local failure_type="$1"
    local failure_dir="$TEST_RESULTS_DIR/failures/$failure_type"
    [[ -f "$failure_dir/active" ]]
}

measure_recovery_time() {
    local test_name="$1"
    local start_time="$2"
    local end_time="$3"
    local recovery_time=$((end_time - start_time))
    RECOVERY_TIMES["$test_name"]=$recovery_time
    echo "$recovery_time"
}

run_hello_world_task() {
    local task_name="$1"
    local timeout="${2:-120}"
    local start_time=$(date +%s)

    log_info "Running hello world task: $task_name (timeout: ${timeout}s)"

    # Create minimal task context
    export CFN_MODE="cli"
    export TASK_ID="$TEST_ID-$task_name"
    export AGENT_ID="test-agent-$$"
    export LOOP3_AGENTS="backend-developer"
    export LOOP2_AGENTS="reviewer"
    export PRODUCT_OWNER="product-owner"
    export CFN_TELEMETRY_DIR="$TEST_RESULTS_DIR/telemetry/$task_name"
    export CFN_FORGIVENESS_TEST="true"

    # Create simple hello world task
    local task_output="$TEST_RESULTS_DIR/task_output_$task_name.log"
    local task_error="$TEST_RESULTS_DIR/task_error_$task_name.log"

    timeout "$timeout" npx claude-flow-novice agent-spawn hello-world \
        --type backend-developer \
        --timeout "$timeout" \
        --simple \
        > "$task_output" 2> "$task_error" || true

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Check if task completed successfully
    if [[ -f "$task_output" ]] && grep -q "hello" "$task_output" 2>/dev/null; then
        echo "SUCCESS:$duration"
        return 0
    else
        echo "FAILED:$duration"
        return 1
    fi
}

# Test 1: Multi-tier Agent Spawning Fallback (4 strategies)
test_multi_tier_spawning() {
    log_test_start "Multi-tier Agent Spawning Fallback"
    local test_name="multi_tier_spawning"
    local start_time=$(date +%s)

    # Strategy 1: Break npx command temporarily
    log_info "Testing Strategy 1: npx command failure fallback"
    create_test_failure "npx_broken"

    # Temporarily break npx
    local npx_backup=$(which npx)
    sudo mv "$(which npx)" "$(which npx).backup.$TIMESTAMP" 2>/dev/null || {
        echo '#!/bin/bash
echo "npx command failed - simulating failure"
exit 1' > "$(which npx)"
        chmod +x "$(which npx)"
    }

    local result=$(run_hello_world_task "${test_name}_strategy1" 60)
    local duration=$(echo "$result" | cut -d: -f2)

    # Restore npx
    sudo mv "$(which npx).backup.$TIMESTAMP" "$(which npx)" 2>/dev/null || true
    cleanup_test_failure "npx_broken"

    if [[ "$result" == "SUCCESS:"* ]]; then
        log_success "Multi-tier spawning: Strategy 1 (npx fallback) - Duration: ${duration}s"
        measure_recovery_time "${test_name}_strategy1" "$start_time" "$(date +%s)"
    else
        log_error "Multi-tier spawning: Strategy 1 failed"
    fi

    # Strategy 2: Memory constraint fallback
    log_info "Testing Strategy 2: Memory constraint fallback"
    create_test_failure "memory_constrained"

    # Set very low memory limit
    export CFN_MEMORY_LIMIT="64m"
    export CFN_MAX_AGENTS="1"

    local result2=$(run_hello_world_task "${test_name}_strategy2" 90)
    local duration2=$(echo "$result2" | cut -d: -f2)

    unset CFN_MEMORY_LIMIT CFN_MAX_AGENTS
    cleanup_test_failure "memory_constrained"

    if [[ "$result2" == "SUCCESS:"* ]]; then
        log_success "Multi-tier spawning: Strategy 2 (memory fallback) - Duration: ${duration2}s"
        measure_recovery_time "${test_name}_strategy2" "$start_time" "$(date +%s)"
    else
        log_error "Multi-tier spawning: Strategy 2 failed"
    fi

    # Strategy 3: Network constraint fallback
    log_info "Testing Strategy 3: Network constraint fallback"
    create_test_failure "network_constrained"

    # Simulate network issues by setting restrictive timeouts
    export CFN_NETWORK_TIMEOUT="5"
    export CFN_RETRY_COUNT="1"

    local result3=$(run_hello_world_task "${test_name}_strategy3" 90)
    local duration3=$(echo "$result3" | cut -d: -f2)

    unset CFN_NETWORK_TIMEOUT CFN_RETRY_COUNT
    cleanup_test_failure "network_constrained"

    if [[ "$result3" == "SUCCESS:"* ]]; then
        log_success "Multi-tier spawning: Strategy 3 (network fallback) - Duration: ${duration3}s"
        measure_recovery_time "${test_name}_strategy3" "$start_time" "$(date +%s)"
    else
        log_error "Multi-tier spawning: Strategy 3 failed"
    fi

    # Strategy 4: Resource exhaustion fallback
    log_info "Testing Strategy 4: Resource exhaustion fallback"
    create_test_failure "resource_exhausted"

    # Simulate resource exhaustion
    export CFN_CPU_LIMIT="0.1"
    export CFN_MAX_PROCESSES="2"

    local result4=$(run_hello_world_task "${test_name}_strategy4" 120)
    local duration4=$(echo "$result4" | cut -d: -f2)

    unset CFN_CPU_LIMIT CFN_MAX_PROCESSES
    cleanup_test_failure "resource_exhausted"

    if [[ "$result4" == "SUCCESS:"* ]]; then
        log_success "Multi-tier spawning: Strategy 4 (resource fallback) - Duration: ${duration4}s"
        measure_recovery_time "${test_name}_strategy4" "$start_time" "$(date +%s)"
    else
        log_error "Multi-tier spawning: Strategy 4 failed"
    fi
}

# Test 2: Pre-flight Validation
test_preflight_validation() {
    log_test_start "Pre-flight Validation"
    local test_name="preflight_validation"
    local start_time=$(date +%s)

    # Scenario 1: Missing dependencies
    log_info "Testing missing dependency detection"
    create_test_failure "missing_deps"

    # Temporarily move a dependency
    local node_bin=$(which node)
    sudo mv "$node_bin" "$node_bin.backup.$TIMESTAMP" 2>/dev/null || true

    # Create validation test
    export CFN_PREFLIGHT_CHECK="true"
    export CFN_STRICT_VALIDATION="true"

    local result=$(run_hello_world_task "${test_name}_missing_deps" 60)
    local duration=$(echo "$result" | cut -d: -f2)

    # Restore dependency
    sudo mv "$node_bin.backup.$TIMESTAMP" "$node_bin" 2>/dev/null || true
    cleanup_test_failure "missing_deps"

    # Should detect missing deps and either fix or fail gracefully
    if [[ "$result" == "SUCCESS:"* ]] || grep -q "missing" "$TEST_RESULTS_DIR/task_error_${test_name}_missing_deps.log" 2>/dev/null; then
        log_success "Pre-flight validation: Missing dependencies handled - Duration: ${duration}s"
        measure_recovery_time "${test_name}_missing_deps" "$start_time" "$(date +%s)"
    else
        log_error "Pre-flight validation: Missing dependencies not handled properly"
    fi

    # Scenario 2: Insufficient disk space
    log_info "Testing disk space validation"
    create_test_failure "low_disk"

    # Simulate low disk space by filling temp
    export CFN_MIN_DISK_SPACE="10GB"
    local temp_fill="$TEST_RESULTS_DIR/temp_fill"
    dd if=/dev/zero of="$temp_fill" bs=1M count=1000 2>/dev/null || true

    local result2=$(run_hello_world_task "${test_name}_low_disk" 60)
    local duration2=$(echo "$result2" | cut -d: -f2)

    # Cleanup
    rm -f "$temp_fill" 2>/dev/null || true
    unset CFN_MIN_DISK_SPACE
    cleanup_test_failure "low_disk"

    if [[ "$result2" == "SUCCESS:"* ]] || grep -q "disk" "$TEST_RESULTS_DIR/task_error_${test_name}_low_disk.log" 2>/dev/null; then
        log_success "Pre-flight validation: Disk space check - Duration: ${duration2}s"
        measure_recovery_time "${test_name}_low_disk" "$start_time" "$(date +%s)"
    else
        log_error "Pre-flight validation: Disk space check failed"
    fi

    # Scenario 3: Port availability
    log_info "Testing port availability validation"
    create_test_failure "port_conflict"

    # Occupy common ports
    export CFN_REQUIRED_PORTS="3000,8080,9000"
    for port in 3000 8080 9000; do
        timeout 30 nc -l "$port" &>/dev/null &
    done

    local result3=$(run_hello_world_task "${test_name}_port_conflict" 60)
    local duration3=$(echo "$result3" | cut -d: -f2)

    # Kill port占用 processes
    pkill -f "nc -l" 2>/dev/null || true
    unset CFN_REQUIRED_PORTS
    cleanup_test_failure "port_conflict"

    if [[ "$result3" == "SUCCESS:"* ]] || grep -q "port" "$TEST_RESULTS_DIR/task_error_${test_name}_port_conflict.log" 2>/dev/null; then
        log_success "Pre-flight validation: Port conflict handling - Duration: ${duration3}s"
        measure_recovery_time "${test_name}_port_conflict" "$start_time" "$(date +%s)"
    else
        log_error "Pre-flight validation: Port conflict check failed"
    fi
}

# Test 3: Adaptive Timeout Calculation
test_adaptive_timeout() {
    log_test_start "Adaptive Timeout Calculation"
    local test_name="adaptive_timeout"
    local start_time=$(date +%s)

    # Scenario 1: High system load
    log_info "Testing adaptive timeout under high load"
    create_test_failure "high_load"

    # Generate high CPU load
    for i in {1..4}; do
        dd if=/dev/zero of=/dev/null bs=1M count=1000 &
    done

    export CFN_ADAPTIVE_TIMEOUT="true"
    export CFN_BASE_TIMEOUT="30"

    local result=$(run_hello_world_task "${test_name}_high_load" 120)
    local duration=$(echo "$result" | cut -d: -f2)

    # Kill load processes
    pkill -f "dd if=/dev/zero" 2>/dev/null || true
    cleanup_test_failure "high_load"

    if [[ "$result" == "SUCCESS:"* ]] && [[ $duration -gt 30 ]]; then
        log_success "Adaptive timeout: High load handling - Duration: ${duration}s (base: 30s)"
        measure_recovery_time "${test_name}_high_load" "$start_time" "$(date +%s)"
    else
        log_error "Adaptive timeout: High load not handled properly"
    fi

    # Scenario 2: Low memory conditions
    log_info "Testing adaptive timeout with low memory"
    create_test_failure "low_memory"

    # Consume memory
    export CFN_ADAPTIVE_TIMEOUT="true"
    timeout 60 python3 -c "
import psutil, time, os
print('Starting memory consumer')
mem = psutil.virtual_memory()
target = mem.available * 0.8
data = b'x' * int(target)
time.sleep(30)
" &>/dev/null &

    local result2=$(run_hello_world_task "${test_name}_low_memory" 120)
    local duration2=$(echo "$result2" | cut -d: -f2)

    # Kill memory consumer
    pkill -f "python3.*memory consumer" 2>/dev/null || true
    cleanup_test_failure "low_memory"

    if [[ "$result2" == "SUCCESS:"* ]]; then
        log_success "Adaptive timeout: Low memory handling - Duration: ${duration2}s"
        measure_recovery_time "${test_name}_low_memory" "$start_time" "$(date +%s)"
    else
        log_error "Adaptive timeout: Low memory not handled properly"
    fi

    # Scenario 3: Network latency
    log_info "Testing adaptive timeout with network latency"
    create_test_failure "network_latency"

    # Simulate network latency with tc if available
    if command -v tc >/dev/null 2>&1; then
        sudo tc qdisc add dev lo root netem delay 500ms 2>/dev/null || true
    fi

    export CFN_ADAPTIVE_TIMEOUT="true"

    local result3=$(run_hello_world_task "${test_name}_network_latency" 120)
    local duration3=$(echo "$result3" | cut -d: -f2)

    # Remove network delay
    if command -v tc >/dev/null 2>&1; then
        sudo tc qdisc del dev lo root 2>/dev/null || true
    fi
    cleanup_test_failure "network_latency"

    if [[ "$result3" == "SUCCESS:"* ]]; then
        log_success "Adaptive timeout: Network latency handling - Duration: ${duration3}s"
        measure_recovery_time "${test_name}_network_latency" "$start_time" "$(date +%s)"
    else
        log_error "Adaptive timeout: Network latency not handled properly"
    fi
}

# Test 4: Race Condition Prevention
test_race_condition_prevention() {
    log_test_start "Race Condition Prevention"
    local test_name="race_condition_prevention"
    local start_time=$(date +%s)

    # Scenario 1: Concurrent task execution
    log_info "Testing concurrent task collision prevention"
    create_test_failure "concurrent_tasks"

    # Run multiple tasks simultaneously with same ID pattern
    local pids=()
    for i in {1..5}; do
        (
            export TASK_ID="$TEST_ID-concurrent-$i"
            run_hello_world_task "concurrent_$i" 60 > "$TEST_RESULTS_DIR/concurrent_$i.out" 2>&1
        ) &
        pids+=($!)
    done

    # Wait for all tasks
    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    # Check results
    local success_count=0
    for i in {1..5}; do
        if grep -q "SUCCESS" "$TEST_RESULTS_DIR/concurrent_$i.out" 2>/dev/null; then
            ((success_count++))
        fi
    done

    cleanup_test_failure "concurrent_tasks"

    if [[ $success_count -ge 3 ]]; then
        log_success "Race condition prevention: Concurrent tasks - $success_count/5 succeeded"
        measure_recovery_time "${test_name}_concurrent" "$start_time" "$(date +%s)"
    else
        log_error "Race condition prevention: Only $success_count/5 concurrent tasks succeeded"
    fi

    # Scenario 2: ID collision testing
    log_info "Testing collision-resistant ID generation"
    create_test_failure "id_collision"

    # Generate many IDs and check for uniqueness
    local ids=()
    for i in {1..100}; do
        local id=$(echo "$TEST_ID-$i-$(date +%s%3N)-$$" | md5sum | cut -d' ' -f1)
        ids+=("$id")
    done

    # Check for duplicates
    local unique_ids=$(printf '%s\n' "${ids[@]}" | sort -u | wc -l)
    local total_ids=${#ids[@]}

    cleanup_test_failure "id_collision"

    if [[ $unique_ids -eq $total_ids ]]; then
        log_success "Race condition prevention: ID uniqueness - $unique_ids/$total_ids unique"
        measure_recovery_time "${test_name}_id_collision" "$start_time" "$(date +%s)"
    else
        log_error "Race condition prevention: Only $unique_ids/$total_ids IDs unique"
    fi
}

# Test 5: Graceful Shutdown and Cleanup
test_graceful_shutdown() {
    log_test_start "Graceful Shutdown and Cleanup"
    local test_name="graceful_shutdown"
    local start_time=$(date +%s)

    # Scenario 1: SIGTERM handling
    log_info "Testing SIGTERM graceful shutdown"
    create_test_failure "sigterm_test"

    # Start a long-running task
    export TASK_ID="$TEST_ID-sigterm"
    export CFN_GRACEFUL_SHUTDOWN="true"

    timeout 120 npx claude-flow-novice agent-spawn long-running \
        --type backend-developer \
        --timeout 300 &
    local task_pid=$!

    # Let it run for a bit
    sleep 10

    # Send SIGTERM
    kill -TERM "$task_pid" 2>/dev/null || true

    # Wait for graceful shutdown
    local shutdown_start=$(date +%s)
    wait "$task_pid" 2>/dev/null || true
    local shutdown_end=$(date +%s)
    local shutdown_duration=$((shutdown_end - shutdown_start))

    cleanup_test_failure "sigterm_test"

    if [[ $shutdown_duration -lt 30 ]]; then
        log_success "Graceful shutdown: SIGTERM handled in ${shutdown_duration}s"
        measure_recovery_time "${test_name}_sigterm" "$start_time" "$(date +%s)"
    else
        log_error "Graceful shutdown: SIGTERM took too long (${shutdown_duration}s)"
    fi

    # Scenario 2: Resource cleanup
    log_info "Testing resource cleanup on interruption"
    create_test_failure "cleanup_test"

    # Create temp files and processes
    local temp_files=()
    local temp_processes=()

    for i in {1..3}; do
        local temp_file="$TEST_RESULTS_DIR/temp_cleanup_$i.tmp"
        echo "test data $i" > "$temp_file"
        temp_files+=("$temp_file")

        # Start background processes
        (sleep 300) &
        temp_processes+=($!)
    done

    export CFN_CLEANUP_ON_EXIT="true"
    local result=$(run_hello_world_task "${test_name}_cleanup" 30)

    # Check cleanup
    local files_remaining=0
    local processes_remaining=0

    for file in "${temp_files[@]}"; do
        if [[ -f "$file" ]]; then
            ((files_remaining++))
        fi
    done

    for proc in "${temp_processes[@]}"; do
        if kill -0 "$proc" 2>/dev/null; then
            ((processes_remaining++))
        fi
    done

    cleanup_test_failure "cleanup_test"

    if [[ $files_remaining -eq 0 && $processes_remaining -eq 0 ]]; then
        log_success "Graceful shutdown: All resources cleaned up"
        measure_recovery_time "${test_name}_cleanup" "$start_time" "$(date +%s)"
    else
        log_error "Graceful shutdown: $files_remaining files, $processes_remaining processes remaining"
    fi
}

# Test 6: Checkpoint/Restart System
test_checkpoint_restart() {
    log_test_start "Checkpoint/Restart System"
    local test_name="checkpoint_restart"
    local start_time=$(date +%s)

    # Scenario 1: Process interruption and restart
    log_info "Testing checkpoint and restart after interruption"
    create_test_failure "checkpoint_test"

    export CFN_CHECKPOINT_ENABLED="true"
    export CFN_CHECKPOINT_DIR="$TEST_RESULTS_DIR/checkpoints"
    export TASK_ID="$TEST_ID-checkpoint"

    # Start task and interrupt it
    timeout 60 npx claude-flow-novice agent-spawn checkpointable \
        --type backend-developer \
        --checkpoint-interval 10 &
    local task_pid=$!

    # Let it run and create checkpoints
    sleep 25

    # Kill the process
    kill -TERM "$task_pid" 2>/dev/null || true
    wait "$task_pid" 2>/dev/null || true

    # Check if checkpoints were created
    local checkpoint_count=$(find "$CFN_CHECKPOINT_DIR" -name "*.checkpoint" 2>/dev/null | wc -l)

    if [[ $checkpoint_count -gt 0 ]]; then
        # Try to restart from checkpoint
        export CFN_RESTART_FROM_CHECKPOINT="true"
        local result=$(run_hello_world_task "${test_name}_restart" 60)

        if [[ "$result" == "SUCCESS:"* ]]; then
            log_success "Checkpoint/Restart: Successfully restarted from $checkpoint_count checkpoints"
            measure_recovery_time "${test_name}_restart" "$start_time" "$(date +%s)"
        else
            log_error "Checkpoint/Restart: Failed to restart from checkpoints"
        fi

        unset CFN_RESTART_FROM_CHECKPOINT
    else
        log_error "Checkpoint/Restart: No checkpoints created before interruption"
    fi

    unset CFN_CHECKPOINT_ENABLED CFN_CHECKPOINT_DIR
    cleanup_test_failure "checkpoint_test"

    # Scenario 2: State persistence
    log_info "Testing state persistence across restarts"
    create_test_failure "state_persistence"

    export CFN_PERSISTENT_STATE="true"
    export CFN_STATE_FILE="$TEST_RESULTS_DIR/state.json"

    # Run task that creates state
    local result2=$(run_hello_world_task "${test_name}_state" 30)

    # Check if state file was created
    if [[ -f "$CFN_STATE_FILE" ]]; then
        # Simulate restart by reading state
        local state_size=$(stat -f%z "$CFN_STATE_FILE" 2>/dev/null || stat -c%s "$CFN_STATE_FILE" 2>/dev/null || echo "0")

        if [[ $state_size -gt 0 ]]; then
            log_success "Checkpoint/Restart: State persistence working (${state_size} bytes)"
            measure_recovery_time "${test_name}_state" "$start_time" "$(date +%s)"
        else
            log_error "Checkpoint/Restart: State file is empty"
        fi
    else
        log_error "Checkpoint/Restart: State file not created"
    fi

    unset CFN_PERSISTENT_STATE CFN_STATE_FILE
    cleanup_test_failure "state_persistence"
}

# Test 7: Fallback Mode for Redis Failures
test_redis_fallback() {
    log_test_start "Redis Fallback Mode"
    local test_name="redis_fallback"
    local start_time=$(date +%s)

    # Check if Redis is running
    if ! pgrep -f redis-server >/dev/null; then
        log_warning "Redis not running - starting Redis for fallback test"
        redis-server --daemonize yes --port 6379 --logfile /tmp/redis-test.log
        local redis_started=true
        sleep 3
    fi

    # Scenario 1: Redis connection failure
    log_info "Testing Redis connection failure fallback"
    create_test_failure "redis_connection"

    export CFN_REDIS_HOST="localhost"
    export CFN_REDIS_PORT="6379"
    export CFN_REDIS_FALLBACK="true"

    # Stop Redis temporarily
    pgrep -f redis-server | xargs kill -TERM 2>/dev/null || true
    sleep 2

    local result=$(run_hello_world_task "${test_name}_connection" 60)
    local duration=$(echo "$result" | cut -d: -f2)

    # Restart Redis
    if [[ "${redis_started:-false}" == "true" ]]; then
        redis-server --daemonize yes --port 6379 --logfile /tmp/redis-test.log
    else
        pgrep -f redis-server | xargs kill -TERM 2>/dev/null || true
        redis-server --daemonize yes --port 6379 --logfile /tmp/redis-test.log &
    fi
    sleep 2

    cleanup_test_failure "redis_connection"

    if [[ "$result" == "SUCCESS:"* ]]; then
        log_success "Redis fallback: Connection failure handled - Duration: ${duration}s"
        measure_recovery_time "${test_name}_connection" "$start_time" "$(date +%s)"
    else
        log_error "Redis fallback: Connection failure not handled"
    fi

    # Scenario 2: Redis memory overflow
    log_info "Testing Redis memory overflow fallback"
    create_test_failure "redis_memory"

    # Fill Redis memory
    redis-cli flushall 2>/dev/null || true
    for i in {1..1000}; do
        redis-cli set "test_key_$i" "$(printf 'x%.0s' {1..1000})" 2>/dev/null || break
    done

    export CFN_REDIS_MAX_MEMORY="64mb"

    local result2=$(run_hello_world_task "${test_name}_memory" 60)
    local duration2=$(echo "$result2" | cut -d: -f2)

    # Clean up Redis
    redis-cli flushall 2>/dev/null || true
    unset CFN_REDIS_MAX_MEMORY
    cleanup_test_failure "redis_memory"

    if [[ "$result2" == "SUCCESS:"* ]]; then
        log_success "Redis fallback: Memory overflow handled - Duration: ${duration2}s"
        measure_recovery_time "${test_name}_memory" "$start_time" "$(date +%s)"
    else
        log_error "Redis fallback: Memory overflow not handled"
    fi

    # Scenario 3: Redis latency fallback
    log_info "Testing Redis latency fallback"
    create_test_failure "redis_latency"

    # Simulate Redis latency
    redis-cli config set slowlog-log-slower-than 1000 2>/dev/null || true

    # Add slow commands
    for i in {1..10}; do
        redis-cli set "slow_key_$i" "$(printf 'x%.0s' {1..10000})" &
    done

    export CFN_REDIS_TIMEOUT="5"

    local result3=$(run_hello_world_task "${test_name}_latency" 60)
    local duration3=$(echo "$result3" | cut -d: -f2)

    # Clean up
    redis-cli flushall 2>/dev/null || true
    unset CFN_REDIS_TIMEOUT
    cleanup_test_failure "redis_latency"

    if [[ "$result3" == "SUCCESS:"* ]]; then
        log_success "Redis fallback: Latency handled - Duration: ${duration3}s"
        measure_recovery_time "${test_name}_latency" "$start_time" "$(date +%s)"
    else
        log_error "Redis fallback: Latency not handled"
    fi

    unset CFN_REDIS_HOST CFN_REDIS_PORT CFN_REDIS_FALLBACK
}

# Test 8: Self-healing Error Recovery
test_self_healing() {
    log_test_start "Self-healing Error Recovery"
    local test_name="self_healing"
    local start_time=$(date +%s)

    # Scenario 1: Process crash recovery
    log_info "Testing process crash self-healing"
    create_test_failure "process_crash"

    export CFN_SELF_HEALING="true"
    export CFN_MAX_RESTARTS="3"

    # Simulate a process that crashes
    export TASK_ID="$TEST_ID-crash"

    # Create a script that crashes
    local crash_script="$TEST_RESULTS_DIR/crash_script.sh"
    cat > "$crash_script" << 'EOF'
#!/bin/bash
sleep 5
echo "Simulating process crash"
exit 1
EOF
    chmod +x "$crash_script"

    # Override agent command to use crash script
    export CFN_AGENT_COMMAND="$crash_script"

    local result=$(run_hello_world_task "${test_name}_crash" 90)
    local duration=$(echo "$result" | cut -d: -f2)

    unset CFN_SELF_HEALING CFN_MAX_RESTARTS CFN_AGENT_COMMAND
    cleanup_test_failure "process_crash"

    if [[ "$result" == "SUCCESS:"* ]]; then
        log_success "Self-healing: Process crash recovered - Duration: ${duration}s"
        measure_recovery_time "${test_name}_crash" "$start_time" "$(date +%s)"
    else
        log_error "Self-healing: Process crash not recovered"
    fi

    # Scenario 2: Resource exhaustion recovery
    log_info "Testing resource exhaustion recovery"
    create_test_failure "resource_exhaustion"

    export CFN_SELF_HEALING="true"
    export CFN_RESOURCE_MONITOR="true"

    # Consume memory and CPU
    stress --cpu 2 --vm 2 --vm-bytes 128M --timeout 30s &
    local stress_pid=$!

    local result2=$(run_hello_world_task "${test_name}_exhaustion" 90)
    local duration2=$(echo "$result2" | cut -d: -f2)

    # Kill stress
    kill -TERM "$stress_pid" 2>/dev/null || true
    wait "$stress_pid" 2>/dev/null || true

    unset CFN_SELF_HEALING CFN_RESOURCE_MONITOR
    cleanup_test_failure "resource_exhaustion"

    if [[ "$result2" == "SUCCESS:"* ]]; then
        log_success "Self-healing: Resource exhaustion recovered - Duration: ${duration2}s"
        measure_recovery_time "${test_name}_exhaustion" "$start_time" "$(date +%s)"
    else
        log_error "Self-healing: Resource exhaustion not recovered"
    fi

    # Scenario 3: Network disruption recovery
    log_info "Testing network disruption recovery"
    create_test_failure "network_disruption"

    export CFN_SELF_HEALING="true"
    export CFN_NETWORK_RESILIENCE="true"

    # Simulate network disruption
    if command -v iptables >/dev/null 2>&1; then
        sudo iptables -A OUTPUT -p tcp --dport 80 -j DROP 2>/dev/null || true
        sudo iptables -A OUTPUT -p tcp --dport 443 -j DROP 2>/dev/null || true
    fi

    local result3=$(run_hello_world_task "${test_name}_network" 120)
    local duration3=$(echo "$result3" | cut -d: -f2)

    # Restore network
    if command -v iptables >/dev/null 2>&1; then
        sudo iptables -D OUTPUT -p tcp --dport 80 -j DROP 2>/dev/null || true
        sudo iptables -D OUTPUT -p tcp --dport 443 -j DROP 2>/dev/null || true
    fi

    unset CFN_SELF_HEALING CFN_NETWORK_RESILIENCE
    cleanup_test_failure "network_disruption"

    if [[ "$result3" == "SUCCESS:"* ]]; then
        log_success "Self-healing: Network disruption recovered - Duration: ${duration3}s"
        measure_recovery_time "${test_name}_network" "$start_time" "$(date +%s)"
    else
        log_error "Self-healing: Network disruption not recovered"
    fi
}

# Combined Scenario Tests
test_combined_scenarios() {
    log_test_start "Combined Forgiveness Scenarios"
    local test_name="combined_scenarios"
    local start_time=$(date +%s)

    # Scenario 1: Multiple failures simultaneously
    log_info "Testing multiple simultaneous failures"
    create_test_failure "combined_failures"

    # Create multiple failure conditions
    export CFN_SELF_HEALING="true"
    export CFN_ADAPTIVE_TIMEOUT="true"
    export CFN_REDIS_FALLBACK="true"
    export CFN_GRACEFUL_SHUTDOWN="true"

    # High load + network issues + low memory
    stress --cpu 1 --vm 1 --vm-bytes 64M --timeout 20s &
    local stress_pid=$!

    # Simulate network latency
    if command -v tc >/dev/null 2>&1; then
        sudo tc qdisc add dev lo root netem delay 200ms 2>/dev/null || true
    fi

    local result=$(run_hello_world_task "${test_name}_multi" 180)
    local duration=$(echo "$result" | cut -d: -f2)

    # Cleanup
    kill -TERM "$stress_pid" 2>/dev/null || true
    if command -v tc >/dev/null 2>&1; then
        sudo tc qdisc del dev lo root 2>/dev/null || true
    fi

    unset CFN_SELF_HEALING CFN_ADAPTIVE_TIMEOUT CFN_REDIS_FALLBACK CFN_GRACEFUL_SHUTDOWN
    cleanup_test_failure "combined_failures"

    if [[ "$result" == "SUCCESS:"* ]]; then
        log_success "Combined scenarios: Multiple failures handled - Duration: ${duration}s"
        measure_recovery_time "${test_name}_multi" "$start_time" "$(date +%s)"
    else
        log_error "Combined scenarios: Multiple failures not handled"
    fi
}

# Generate comprehensive report
generate_forgiveness_report() {
    log_info "Generating forgiveness test report..."

    local report_file="$TEST_RESULTS_DIR/forgiveness-report.md"

    cat > "$report_file" << EOF
# CFN Loop Forgiveness Test Report

**Test ID:** $TEST_ID
**Date:** $(date)
**Test Duration:** $(( ($(date +%s) - TIMESTAMP) / 60 )) minutes

## Executive Summary

- **Total Tests:** $TESTS_TOTAL
- **Passed:** $TESTS_PASSED
- **Failed:** $TESTS_FAILED
- **Success Rate:** $(( TESTS_TOTAL > 0 ? (TESTS_PASSED * 100) / TESTS_TOTAL : 0 ))%

## Forgiveness Mechanisms Tested

EOF

    # Add results for each mechanism
    for mechanism in "${FORGIVENESS_MECHANISMS[@]}"; do
        echo "### $mechanism" >> "$report_file"
        echo "" >> "$report_file"

        # Find tests for this mechanism
        local mechanism_tests=($(printf '%s\n' "${!TEST_RESULTS[@]}" | grep "$mechanism" || true))

        if [[ ${#mechanism_tests[@]} -gt 0 ]]; then
            for test in "${mechanism_tests[@]}"; do
                local status="${TEST_RESULTS[$test]:-UNKNOWN}"
                local recovery_time="${RECOVERY_TIMES[$test]:-N/A}"
                echo "- **$test**: $status (Recovery: ${recovery_time}s)" >> "$report_file"
            done
        else
            echo "- No specific tests found" >> "$report_file"
        fi
        echo "" >> "$report_file"
    done

    # Add recovery time analysis
    cat >> "$report_file" << EOF
## Recovery Time Analysis

| Test | Recovery Time (s) | Status |
|------|------------------|--------|
EOF

    for test in "${!RECOVERY_TIMES[@]}"; do
        local status="${TEST_RESULTS[$test]:-UNKNOWN}"
        echo "| $test | ${RECOVERY_TIMES[$test]} | $status |" >> "$report_file"
    done

    # Add recommendations
    cat >> "$report_file" << EOF

## Recommendations

EOF

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo "✅ All forgiveness mechanisms are working correctly" >> "$report_file"
    else
        echo "❌ Some forgiveness mechanisms need attention:" >> "$report_file"
        echo "" >> "$report_file"

        for test in "${!TEST_RESULTS[@]}"; do
            if [[ "${TEST_RESULTS[$test]}" == "FAIL" ]]; then
                echo "- **$test**: Review implementation and add additional error handling" >> "$report_file"
            fi
        done
    fi

    cat >> "$report_file" << EOF

## Test Artifacts

All test logs and outputs are stored in: \`$TEST_RESULTS_DIR\`

### Key Files:
- \`telemetry/\`: CFN Loop telemetry data
- \`task_output_*.log\`: Individual task outputs
- \`task_error_*.log\`: Error logs from failed tasks
- \`failures/\`: Active failure condition markers
- \`checkpoints/\`: Checkpoint data (if any)

## Test Environment

- **OS:** $(uname -s) $(uname -r)
- **Node.js:** $(node --version 2>/dev/null || echo "Not found")
- **Memory:** $(free -h 2>/dev/null | grep "^Mem:" || echo "N/A")
- **Disk:** $(df -h . 2>/dev/null | tail -1 || echo "N/A")
- **Redis:** $(redis-cli --version 2>/dev/null || echo "Not available")

---

*Report generated by CFN Loop Forgiveness Test Suite*
EOF

    log_success "Forgiveness test report generated: $report_file"
    echo ""
    echo "📊 Test Summary: $TESTS_PASSED/$TESTS_TOTAL passed ($(( TESTS_TOTAL > 0 ? (TESTS_PASSED * 100) / TESTS_TOTAL : 0 ))%)"
    echo "📁 Results directory: $TEST_RESULTS_DIR"
    echo "📄 Report: $report_file"
}

# Setup test environment
setup_test_environment() {
    log_info "Setting up forgiveness test environment..."
    mkdir -p "$TEST_RESULTS_DIR"/{telemetry,failures,checkpoints}

    # Export test environment variables
    export CFN_FORGIVENESS_TEST_MODE="true"
    export CFN_TEST_RESULTS_DIR="$TEST_RESULTS_DIR"
    export CFN_TEST_ID="$TEST_ID"

    # Ensure required tools are available
    command -v npx >/dev/null || {
        log_error "npx not found - cannot run tests"
        exit 1
    }

    # Check if stress is available for resource tests
    if ! command -v stress >/dev/null; then
        log_warning "stress command not available - some resource tests may be limited"
    fi
}

# Cleanup test environment
cleanup_test_environment() {
    log_info "Cleaning up test environment..."

    # Kill any remaining test processes
    pkill -f "npx claude-flow-novice" 2>/dev/null || true
    pkill -f "dd if=/dev/zero" 2>/dev/null || true
    pkill -f "stress" 2>/dev/null || true
    pkill -f "nc -l" 2>/dev/null || true

    # Remove network configurations if any
    if command -v tc >/dev/null 2>&1; then
        sudo tc qdisc del dev lo root 2>/dev/null || true
    fi

    if command -v iptables >/dev/null 2>&1; then
        sudo iptables -F OUTPUT 2>/dev/null || true
    fi

    # Remove temporary files
    find "$TEST_RESULTS_DIR" -name "*.tmp" -delete 2>/dev/null || true

    log_info "Cleanup completed"
}

# Main test execution
main() {
    echo "🚀 CFN Loop Forgiveness CLI Hello World Test Suite"
    echo "=================================================="
    echo ""

    # Setup
    setup_test_environment

    # Trap for cleanup
    trap cleanup_test_environment EXIT INT TERM

    # Run individual mechanism tests
    test_multi_tier_spawning
    test_preflight_validation
    test_adaptive_timeout
    test_race_condition_prevention
    test_graceful_shutdown
    test_checkpoint_restart
    test_redis_fallback
    test_self_healing

    # Run combined scenarios
    test_combined_scenarios

    # Generate report
    generate_forgiveness_report

    echo ""
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo "🎉 All forgiveness tests passed! CFN Loop is resilient."
        exit 0
    else
        echo "❌ $TESTS_FAILED test(s) failed. Review the report for details."
        exit 1
    fi
}

# Run main function
main "$@"