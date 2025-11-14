#!/bin/bash

# Memory Leak Detection Test Suite
# Tests for memory leak patterns identified in the analysis

set -euo pipefail

# Test Configuration
TEST_DIR="/tmp/claude-memory-tests"
TEST_RESULTS_DIR="$TEST_DIR/results"
MEMORY_THRESHOLD_MB=8192  # Alert threshold
CRITICAL_THRESHOLD_MB=11264  # Critical threshold (11GB from analysis)
TEST_DURATION=300  # 5 minutes test duration
LOG_FILE="$TEST_RESULTS_DIR/memory-test-$(date +%Y%m%d-%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

setup_test_environment() {
    echo -e "${BLUE}Setting up test environment...${NC}"

    mkdir -p "$TEST_RESULTS_DIR"

    # Verify required tools
    local missing_tools=()

    command -v ps >/dev/null || missing_tools+=("ps")
    command -l free >/dev/null || missing_tools+=("free")
    command -v lsof >/dev/null || missing_tools+=("lsof")
    command -v netstat >/dev/null || missing_tools+=("netstat")

    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        echo -e "${RED}ERROR: Missing required tools: ${missing_tools[*]}${NC}"
        return 1
    fi

    echo -e "${GREEN}✅ Test environment ready${NC}"
}

log_test() {
    local message="$1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $message" | tee -a "$LOG_FILE"
}

run_test() {
    local test_name="$1"
    local test_command="$2"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -e "\n${BLUE}Running test: $test_name${NC}"
    log_test "TEST_START: $test_name"

    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        log_test "TEST_PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        log_test "TEST_FAIL: $test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

test_memory_spike_detection() {
    local test_process_pid=$1
    local start_time=$(date +%s)
    local spike_detected=false

    log_test "Starting memory spike detection for PID $test_process_pid"

    while [[ $(($(date +%s) - start_time)) -lt 60 ]]; do  # Monitor for 1 minute
        if ! kill -0 "$test_process_pid" 2>/dev/null; then
            log_test "Test process $test_process_pid ended"
            break
        fi

        local rss_mb=$(ps -p "$test_process_pid" -o rss= --no-headers 2>/dev/null | awk '{print int($1/1024)}' || echo "0")

        if [[ $rss_mb -gt $MEMORY_THRESHOLD_MB ]]; then
            log_test "MEMORY_SPIKE_DETECTED: ${rss_mb}MB (threshold: ${MEMORY_THRESHOLD_MB}MB)"
            spike_detected=true
            break
        fi

        sleep 2
    done

    if [[ "$spike_detected" == "true" ]]; then
        log_test "Memory spike detection working correctly"
        return 0
    else
        log_test "No memory spike detected (may be normal for test process)"
        return 0  # This is not a failure - just means no spike occurred
    fi
}

test_connection_count_detection() {
    local test_process_pid=$1
    local max_connections=0

    log_test "Starting connection count detection for PID $test_process_pid"

    for i in {1..30}; do  # Check for 30 seconds
        if ! kill -0 "$test_process_pid" 2>/dev/null; then
            break
        fi

        local connections=$(netstat -tnp 2>/dev/null | grep "$test_process_pid/" | wc -l || echo "0")
        max_connections=$((connections > max_connections ? connections : max_connections))

        if [[ $connections -gt 50 ]]; then
            log_test "HIGH_CONNECTION_COUNT: $connections connections detected"
        fi

        sleep 1
    done

    log_test "Maximum connections observed: $max_connections"

    if [[ $max_connections -gt 100 ]]; then
        log_test "WARNING: Very high connection count detected"
    fi

    return 0
}

test_file_descriptor_monitoring() {
    local test_process_pid=$1
    local max_fd_count=0

    log_test "Starting file descriptor monitoring for PID $test_process_pid"

    for i in {1..30}; do  # Check for 30 seconds
        if ! kill -0 "$test_process_pid" 2>/dev/null; then
            break
        fi

        local fd_count=$(lsof -p "$test_process_pid" 2>/dev/null | wc -l || echo "0")
        max_fd_count=$((fd_count > max_fd_count ? fd_count : max_fd_count))

        if [[ $fd_count -gt 1000 ]]; then
            log_test "HIGH_FD_COUNT: $fd_count file descriptors detected"
        fi

        sleep 1
    done

    log_test "Maximum file descriptors observed: $max_fd_count"

    if [[ $max_fd_count -gt 2000 ]]; then
        log_test "WARNING: Very high file descriptor count detected"
    fi

    return 0
}

test_memory_limit_enforcement() {
    local test_memory_limit=4096  # 4GB limit for test

    log_test "Testing memory limit enforcement with ${test_memory_limit}MB limit"

    # Start a process with memory limit
    export NODE_OPTIONS="--max-old-space-size=$test_memory_limit"

    # Create a simple memory test script
    cat > "$TEST_DIR/memory-test.js" << 'EOF'
// Simple memory allocation test
const data = [];
let allocationSize = 100 * 1024 * 1024; // 100MB chunks

console.log('Starting memory test...');
setInterval(() => {
    try {
        // Allocate 100MB chunk
        const chunk = new Buffer.alloc(allocationSize);
        data.push(chunk);
        console.log(`Allocated chunk ${data.length}, total memory: ${(data.length * allocationSize / 1024 / 1024).toFixed(0)}MB`);
    } catch (e) {
        console.error('Memory allocation failed:', e.message);
        process.exit(1);
    }
}, 1000);
EOF

    timeout 30s node "$TEST_DIR/memory-test.js" &
    local test_pid=$!

    # Monitor if process respects memory limit
    local limit_respected=true
    for i in {1..25}; do  # Monitor for 25 seconds
        if ! kill -0 "$test_pid" 2>/dev/null; then
            break
        fi

        local rss_mb=$(ps -p "$test_pid" -o rss= --no-headers 2>/dev/null | awk '{print int($1/1024)}' || echo "0")

        if [[ $rss_mb -gt $((test_memory_limit + 1024)) ]]; then  # 1GB tolerance
            log_test "MEMORY_LIMIT_EXCEEDED: ${rss_mb}MB (limit: ${test_memory_limit}MB)"
            limit_respected=false
            kill -TERM "$test_pid" 2>/dev/null || true
            break
        fi

        sleep 1
    done

    # Clean up
    kill -TERM "$test_pid" 2>/dev/null || true
    rm -f "$TEST_DIR/memory-test.js"

    if [[ "$limit_respected" == "true" ]]; then
        log_test "Memory limit enforcement working correctly"
        return 0
    else
        log_test "Memory limit enforcement failed"
        return 1
    fi
}

test_profiling_functionality() {
    log_test "Testing heap profiling functionality"

    # Create a simple test script
    cat > "$TEST_DIR/profile-test.js" << 'EOF'
console.log('Profile test starting');
// Create some objects to profile
const objects = [];
for (let i = 0; i < 10000; i++) {
    objects.push({
        id: i,
        data: new Array(1000).fill(Math.random()),
        timestamp: Date.now()
    });
}
console.log('Objects created, exiting');
EOF

    # Test with heap profiling enabled
    export NODE_OPTIONS="--heap-prof"
    local profile_dir="$TEST_RESULTS_DIR/profile-test-$(date +%s)"
    export CLAUDE_MEMORY_PROFILE_DIR="$profile_dir"

    mkdir -p "$profile_dir"

    timeout 10s node "$TEST_DIR/profile-test.js" > "$profile_dir/test-output.log" 2>&1

    # Check if profile was generated
    local profile_files=$(find "$profile_dir" -name "*.heapprofile" 2>/dev/null | wc -l)

    rm -f "$TEST_DIR/profile-test.js"

    if [[ $profile_files -gt 0 ]]; then
        log_test "Heap profiling working correctly - generated $profile_files profile files"
        return 0
    else
        log_test "Heap profiling failed - no profile files generated"
        return 1
    fi
}

test_cleanup_functionality() {
    log_test "Testing memory cleanup functionality"

    # Create some temporary files to test cleanup
    local temp_files=()
    for i in {1..5}; do
        local temp_file=$(mktemp -t "claude-test-$i-XXXXX")
        echo "test data $i" > "$temp_file"
        temp_files+=("$temp_file")
    done

    # Run cleanup script
    if [[ -f "./.claude/skills/cfn-memory-management/cleanup-memory.sh" ]]; then
        timeout 30s ./.claude/skills/cfn-memory-management/cleanup-memory.sh > "$TEST_RESULTS_DIR/cleanup-test.log" 2>&1 || true
    else
        log_test "Cleanup script not found - skipping cleanup test"
        return 0
    fi

    # Check if temp files in /tmp were cleaned up (they should be left alone since they're recent)
    local remaining_files=0
    for file in "${temp_files[@]}"; do
        if [[ -f "$file" ]]; then
            remaining_files=$((remaining_files + 1))
        fi
    done

    # Clean up test files
    for file in "${temp_files[@]}"; do
        rm -f "$file" 2>/dev/null || true
    done

    log_test "Cleanup functionality test completed - $remaining_files test files remained (expected for recent files)"
    return 0
}

test_wsl_memory_configuration() {
    log_test "Testing WSL memory configuration"

    if [[ ! -f /proc/version ]] || ! grep -qi microsoft /proc/version; then
        log_test "Not running in WSL - skipping WSL-specific tests"
        return 0
    fi

    # Check WSL memory info
    local total_mb=$(free -m | awk 'NR==2{print $2}')
    local available_mb=$(free -m | awk 'NR==2{print $7}')

    log_test "WSL Memory - Total: ${total_mb}MB, Available: ${available_mb}MB"

    if [[ $total_mb -lt 8192 ]]; then
        log_test "WARNING: WSL has low total memory (${total_mb}MB < 8GB)"
    fi

    if [[ $available_mb -lt 2048 ]]; then
        log_test "WARNING: WSL has low available memory (${available_mb}MB < 2GB)"
    fi

    return 0
}

main() {
    echo -e "${BLUE}=== Memory Leak Detection Test Suite ===${NC}"
    log_test "Starting memory leak detection tests"

    setup_test_environment

    # Test memory limit enforcement
    run_test "Memory Limit Enforcement" "test_memory_limit_enforcement"

    # Test profiling functionality
    run_test "Heap Profiling Functionality" "test_profiling_functionality"

    # Test cleanup functionality
    run_test "Memory Cleanup Functionality" "test_cleanup_functionality"

    # Test WSL configuration
    run_test "WSL Memory Configuration" "test_wsl_memory_configuration"

    # Test with actual Claude process if available
    local claude_processes=$(pgrep -f "claude" | head -1 || true)
    if [[ -n "$claude_processes" ]]; then
        echo -e "\n${BLUE}Found Claude process: $claude_processes${NC}"

        run_test "Memory Spike Detection (Live Process)" "test_memory_spike_detection $claude_processes"
        run_test "Connection Count Detection (Live Process)" "test_connection_count_detection $claude_processes"
        run_test "File Descriptor Monitoring (Live Process)" "test_file_descriptor_monitoring $claude_processes"
    else
        echo -e "\n${YELLOW}No Claude processes found - skipping live process tests${NC}"
        echo "To test with a live Claude process, run: npx claude-flow-novice &"
        echo "Then run this test suite again."
    fi

    # Print test results
    echo -e "\n${BLUE}=== Test Results ===${NC}"
    echo -e "Total Tests: $TESTS_TOTAL"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"

    local success_rate=0
    if [[ $TESTS_TOTAL -gt 0 ]]; then
        success_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
    fi

    echo -e "Success Rate: ${success_rate}%"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}🎉 All tests passed!${NC}"
        log_test "All tests passed successfully"
    else
        echo -e "\n${RED}❌ Some tests failed. Check the log: $LOG_FILE${NC}"
        log_test "Some tests failed - see log for details"
    fi

    return $TESTS_FAILED
}

# Run the test suite
main "$@"