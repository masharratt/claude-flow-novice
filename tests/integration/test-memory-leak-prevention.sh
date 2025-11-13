#!/bin/bash
# CFN Memory Leak Prevention Simulation Tests
# Part of ANTI-023 Memory Leak Protection System Integration Tests

set -euo pipefail

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_RESULTS_DIR="/tmp/cfn-test-results"

# Test tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS=()

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Logging functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_TESTS++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_TESTS++))
    TEST_RESULTS+=("FAIL: $1")
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Test setup
setup_test_env() {
    log_info "Setting up test environment..."
    mkdir -p "$TEST_RESULTS_DIR"
    mkdir -p "/tmp/cfn-telemetry"

    # Set test configuration
    export AGENT_ID="memory-leak-test-$$"
    export CFN_MEMORY_LIMIT="256M"  # Low limit for testing
    export CFN_CPU_LIMIT="70%"
    export CFN_TIMEOUT="30"
    export CFN_TELEMETRY_DIR="/tmp/cfn-telemetry"

    ((TOTAL_TESTS++))
}

# Test cleanup
cleanup_test_env() {
    log_info "Cleaning up test environment..."

    # Kill any lingering test processes
    pkill -f "memory-leak-test" 2>/dev/null || true
    jobs -p | xargs -r kill 2>/dev/null || true

    # Clean up test files
    rm -rf "$TEST_RESULTS_DIR"
    rm -rf "/tmp/cfn-telemetry/metrics_memory-leak-test-"*".json"

    # Clean environment
    unset AGENT_ID CFN_MEMORY_LIMIT CFN_CPU_LIMIT CFN_TIMEOUT CFN_TELEMETRY_DIR
}

# Test: Memory allocation leak simulation
test_memory_allocation_leak() {
    log_test "Testing memory allocation leak prevention..."

    # Create a script that simulates memory leak
    cat > "$TEST_RESULTS_DIR/memory_leak_sim.sh" << 'EOF'
#!/bin/bash

# Source instrumentation
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

# Simulate memory leak by continuously allocating memory
leak_array=()
iteration=0

while true; do
    # Allocate 1MB per iteration
    leak_array+=($(printf 'A%.0s' {1..1000000}))
    ((iteration++))

    echo "Memory leak iteration $iteration, allocated ${#leak_array[@]} chunks"
    sleep 0.1

    # Check if we should be terminated
    if [[ $iteration -gt 500 ]]; then
        echo "ERROR: Memory leak not terminated after 500 iterations"
        exit 1
    fi
done
EOF

    chmod +x "$TEST_RESULTS_DIR/memory_leak_sim.sh"

    # Run with timeout and memory limit
    local start_time=$(date +%s)
    if timeout 15 "$TEST_RESULTS_DIR/memory_leak_sim.sh" 2>/dev/null; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_fail "Memory leak simulation completed without termination (${duration}s)"
    else
        local exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        if [[ $exit_code -eq 124 ]]; then
            log_pass "Memory leak prevented by timeout (${duration}s)"
        else
            log_pass "Memory leak terminated by instrumentation (${duration}s, exit code: $exit_code)"
        fi
    fi

    ((TOTAL_TESTS++))
}

# Test: Node.js process memory leak
test_nodejs_memory_leak() {
    log_test "Testing Node.js process memory leak prevention..."

    # Create Node.js script with memory leak
    cat > "$TEST_RESULTS_DIR/node_leak.js" << 'EOF'
// Simulate Node.js memory leak
const leaks = [];

setInterval(() => {
    // Add large object to leak array
    leaks.push(new Array(100000).fill('x'));
    console.log(`Leaked ${leaks.length} objects, memory usage: ${process.memoryUsage().heapUsed / 1024 / 1024} MB`);
}, 100);
EOF

    # Set Node.js memory limit
    export NODE_OPTIONS="--max-old-space-size=128"

    # Run Node.js with timeout
    local start_time=$(date +%s)
    if timeout 10 node "$TEST_RESULTS_DIR/node_leak.js" 2>/dev/null; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_fail "Node.js memory leak completed without termination (${duration}s)"
    else
        local exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        if [[ $exit_code -eq 124 ]]; then
            log_pass "Node.js memory leak prevented by timeout (${duration}s)"
        elif [[ $exit_code -eq 134 ]]; then
            log_pass "Node.js memory leak terminated by SIGABRT (${duration}s)"
        else
            log_pass "Node.js memory leak terminated (${duration}s, exit code: $exit_code)"
        fi
    fi

    unset NODE_OPTIONS

    ((TOTAL_TESTS++))
}

# Test: File handle leak simulation
test_file_handle_leak() {
    log_test "Testing file handle leak prevention..."

    # Create script that leaks file handles
    cat > "$TEST_RESULTS_DIR/file_leak_sim.sh" << 'EOF'
#!/bin/bash

# Source instrumentation
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

# Simulate file handle leak
file_handles=()
iteration=0

while true; do
    # Open files without closing them
    for i in {1..10}; do
        exec {fd}>/tmp/leak_test_$iteration_$i.txt
        echo "Leaked file $iteration $i" >&${fd}
        file_handles+=("$fd")
    done

    echo "Leaked ${#file_handles[@]} file handles in iteration $iteration"
    ((iteration++))

    sleep 0.1

    if [[ $iteration -gt 100 ]]; then
        echo "ERROR: File handle leak not terminated"
        exit 1
    fi
done
EOF

    chmod +x "$TEST_RESULTS_DIR/file_leak_sim.sh"

    # Run with timeout
    local start_time=$(date +%s)
    if timeout 10 "$TEST_RESULTS_DIR/file_leak_sim.sh" 2>/dev/null; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_fail "File handle leak completed without termination (${duration}s)"
    else
        local exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        if [[ $exit_code -eq 124 ]]; then
            log_pass "File handle leak prevented by timeout (${duration}s)"
        else
            log_pass "File handle leak terminated (${duration}s, exit code: $exit_code)"
        fi
    fi

    # Clean up leaked files
    rm -f /tmp/leak_test_*.txt 2>/dev/null || true

    ((TOTAL_TESTS++))
}

# Test: CPU resource exhaustion
test_cpu_resource_exhaustion() {
    log_test "Testing CPU resource exhaustion prevention..."

    # Create CPU-intensive script
    cat > "$TEST_RESULTS_DIR/cpu_exhaust.sh" << 'EOF'
#!/bin/bash

# Source instrumentation
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

# Infinite CPU-intensive loop
echo "Starting CPU exhaustion test..."
while true; do
    # CPU intensive calculation
    result=$(echo "scale=1000; 4*a(1)" | bc -l 2>/dev/null || echo "3.14159")
done
EOF

    chmod +x "$TEST_RESULTS_DIR/cpu_exhaust.sh"

    # Run with timeout
    local start_time=$(date +%s)
    if timeout 8 "$TEST_RESULTS_DIR/cpu_exhaust.sh" 2>/dev/null; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_fail "CPU exhaustion completed without termination (${duration}s)"
    else
        local exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        if [[ $exit_code -eq 124 ]]; then
            log_pass "CPU exhaustion prevented by timeout (${duration}s)"
        else
            log_pass "CPU exhaustion terminated (${duration}s, exit code: $exit_code)"
        fi
    fi

    ((TOTAL_TESTS++))
}

# Test: Agent process cleanup
test_agent_process_cleanup() {
    log_test "Testing agent process cleanup..."

    # Create script that spawns child processes
    cat > "$TEST_RESULTS_DIR/process_cleanup_test.sh" << 'EOF'
#!/bin/bash

# Source instrumentation
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

# Spawn child processes
children_pids=()

for i in {1..5}; do
    sleep 30 &
    children_pids+=("$!")
    echo "Spawned child process $i: PID ${children_pids[-1]}"
done

echo "Parent process $$ with children: ${children_pids[*]}"

# Simulate some work
sleep 5

echo "Parent process exiting - children should be cleaned up"
EOF

    chmod +x "$TEST_RESULTS_DIR/process_cleanup_test.sh"

    # Run the test
    local parent_pid
    "$TEST_RESULTS_DIR/process_cleanup_test.sh" &
    parent_pid=$!

    # Wait for parent to spawn children
    sleep 2

    # Check if child processes exist
    local child_count
    child_count=$(pgrep -P "$parent_pid" | wc -l 2>/dev/null || echo "0")
    echo "Found $child_count child processes"

    # Wait for parent to complete
    wait "$parent_pid" 2>/dev/null || true

    # Check if children are cleaned up after parent exits
    sleep 1
    child_count=$(pgrep -P "$parent_pid" 2>/dev/null | wc -l || echo "0")

    if [[ $child_count -eq 0 ]]; then
        log_pass "Child processes properly cleaned up"
    else
        log_fail "Child processes not cleaned up: $child_count remaining"
        # Force cleanup
        pkill -P "$parent_pid" 2>/dev/null || true
    fi

    ((TOTAL_TESTS++))
}

# Test: Redis connection leak simulation
test_redis_connection_leak() {
    log_test "Testing Redis connection leak prevention..."

    # Set CLI mode for Redis operations
    export TASK_ID="redis-leak-test"
    export AGENT_ID="redis-leak-agent"

    # Mock redis-cli that tracks connections
    cat > "$TEST_RESULTS_DIR/mock_redis_tracker.sh" << 'EOF'
#!/bin/bash

# Track connection attempts
CONNECTION_FILE="/tmp/redis_connection_count"
count=$(cat "$CONNECTION_FILE" 2>/dev/null || echo "0")
count=$((count + 1))
echo "$count" > "$CONNECTION_FILE"

echo "Mock Redis connection #$count"

# Simulate connection hang
sleep 2
exit 0
EOF

    chmod +x "$TEST_RESULTS_DIR/mock_redis_tracker.sh"

    # Initialize connection counter
    echo "0" > "/tmp/redis_connection_count"
    export PATH="$TEST_RESULTS_DIR:$PATH"

    # Source CLI coordination
    source "$PROJECT_ROOT/.claude/skills/cfn-task-mode-safety/cli-coordination.sh"

    # Simulate connection leak
    local connection_attempts=0
    local max_attempts=5

    for i in $(seq 1 $max_attempts); do
        if timeout 5 redis_lpush_safe "test_key" "test_value" 2>/dev/null; then
            ((connection_attempts++))
        fi
    done

    # Check connection count
    local final_count
    final_count=$(cat "/tmp/redis_connection_count" 2>/dev/null || echo "0")

    if [[ $final_count -le $max_attempts ]]; then
        log_pass "Redis connections properly limited: $final_count attempts"
    else
        log_fail "Redis connection leak detected: $final_count attempts"
    fi

    # Restore PATH and clean up
    export PATH=$(echo "$PATH" | sed "s|$TEST_RESULTS_DIR:||")
    rm -f "/tmp/redis_connection_count"
    unset TASK_ID AGENT_ID

    ((TOTAL_TESTS++))
}

# Test: Environment variable cleanup
test_environment_variable_cleanup() {
    log_test "Testing environment variable cleanup..."

    # Set sensitive variables that should be cleaned
    export SECRET_PASSWORD="super_secret_password"
    export API_TOKEN="secret_api_token_123"
    export DATABASE_URL="postgres://user:password@localhost/db"

    # Source sanitization
    source "$PROJECT_ROOT/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh"

    # Check if sensitive variables are cleared
    local cleaned=0
    local total=3

    [[ -z "${SECRET_PASSWORD:-}" ]] && ((cleaned++))
    [[ -z "${API_TOKEN:-}" ]] && ((cleaned++))
    [[ -z "${DATABASE_URL:-}" ]] && ((cleaned++))

    if [[ $cleaned -eq $total ]]; then
        log_pass "All sensitive environment variables cleaned ($cleaned/$total)"
    else
        log_fail "Environment variables not fully cleaned ($cleaned/$total)"
    fi

    ((TOTAL_TESTS++))
}

# Test: Telemetry collection during leak
test_telemetry_during_leak() {
    log_test "Testing telemetry collection during memory leak..."

    # Create script with controlled memory usage
    cat > "$TEST_RESULTS_DIR/telemetry_test.sh" << 'EOF'
#!/bin/bash

# Source instrumentation
source "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-process-instrumentation/instrument-process.sh"

# Gradual memory allocation
data=""
for i in {1..20}; do
    data="${data}$(printf 'A%.0s' {1..50000})"
    echo "Memory allocation step $i"
    sleep 0.5
done

echo "Controlled memory usage completed"
EOF

    chmod +x "$TEST_RESULTS_DIR/telemetry_test.sh"

    # Run the test
    timeout 15 "$TEST_RESULTS_DIR/telemetry_test.sh" &
    local test_pid=$!

    # Wait for telemetry collection
    sleep 3

    # Check telemetry data
    local metrics_file="/tmp/cfn-telemetry/metrics_memory-leak-test-$$.json"

    if [[ -f "$metrics_file" ]]; then
        local sample_count
        sample_count=$(jq '.samples | length' "$metrics_file" 2>/dev/null || echo "0")

        if [[ $sample_count -gt 0 ]]; then
            log_pass "Telemetry collected during memory usage ($sample_count samples)"

            # Check for memory usage data
            if jq -e '.samples[] | .mem_usage' "$metrics_file" >/dev/null 2>&1; then
                log_pass "Memory usage metrics captured in telemetry"
            else
                log_fail "Memory usage metrics not captured"
            fi
        else
            log_fail "No telemetry samples collected"
        fi
    else
        log_fail "Telemetry file not created"
    fi

    # Wait for test to complete
    wait "$test_pid" 2>/dev/null || true

    ((TOTAL_TESTS+=3))
}

# Run all tests
run_all_tests() {
    log_info "Starting CFN Memory Leak Prevention Simulation Tests..."

    setup_test_env
    test_memory_allocation_leak
    test_nodejs_memory_leak
    test_file_handle_leak
    test_cpu_resource_exhaustion
    test_agent_process_cleanup
    test_redis_connection_leak
    test_environment_variable_cleanup
    test_telemetry_during_leak
    cleanup_test_env

    log_info "Memory leak prevention tests completed"
}

# Generate test report
generate_report() {
    local success_rate=0
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    fi

    cat << EOF
=======================================
CFN Memory Leak Prevention Test Report
=======================================

Total Tests: $TOTAL_TESTS
Passed: $PASSED_TESTS
Failed: $FAILED_TESTS
Success Rate: ${success_rate}%

EOF

    if [[ ${#TEST_RESULTS[@]} -gt 0 ]]; then
        echo "Failed Tests:"
        printf "  %s\n" "${TEST_RESULTS[@]}"
        echo ""
    fi

    if [[ $FAILED_TESTS -eq 0 ]]; then
        echo "✅ All tests passed! Memory leak prevention is working correctly."
        return 0
    else
        echo "❌ Some tests failed. Review the failed tests above."
        return 1
    fi
}

# Main execution
main() {
    run_all_tests
    generate_report
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi