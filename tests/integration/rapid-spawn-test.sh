#!/usr/bin/env bash

# Rapid Spawn Detection Test Script
# Tests the rapid spawn detection mechanism

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Test configuration
TEST_DIR="/tmp/rapid-spawn-test"
MONITOR_SCRIPT="${CFN_MEMORY_MONITOR:-$HOME/external-memory-monitor.sh}"
TEST_DURATION=120  # 2 minutes
SPAWN_INTERVAL=5   # Spawn a process every 5 seconds
MAX_TEST_PROCESSES=8

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

cleanup_test_processes() {
    log "🧹 Cleaning up test processes..."
    pkill -f "test-memory-load" 2>/dev/null || true
    pkill -f "rapid-spawn-test" 2>/dev/null || true
    sleep 2
}

create_test_process() {
    local process_id=$1
    local memory_mb=$2

    # Create a simple memory-eating Node.js process
    cat > "$TEST_DIR/test-memory-load-$process_id.js" << EOF
console.log('Starting memory load process $process_id');
const data = [];
const chunkSize = 100 * 1024; // 100KB chunks

// Allocate memory gradually
const allocateMemory = () => {
    for (let i = 0; i < $memory_mb / 0.1; i++) {
        data.push(new Buffer.alloc(chunkSize));
    }
    console.log('Process $process_id allocated ${memory_mb}MB');

    // Keep process alive
    setInterval(() => {
        // Prevent garbage collection
        data.push(new Buffer.alloc(1024));
        if (data.length > 10000) {
            data.shift(); // Remove old chunks
        }
    }, 5000);
};

allocateMemory();
EOF

    # Start the process with proper Node.js options
    timeout 300s node "$TEST_DIR/test-memory-load-$process_id.js" &
    local pid=$!
    echo $pid
}

run_rapid_spawn_test() {
    log "${BLUE}=== Rapid Spawn Detection Test ===${NC}"

    # Setup test directory
    mkdir -p "$TEST_DIR"

    # Cleanup any existing test processes
    cleanup_test_processes

    log "Starting rapid spawn test..."
    log "Test Configuration:"
    log "  Max Test Processes: $MAX_TEST_PROCESSES"
    log "  Spawn Interval: ${SPAWN_INTERVAL}s"
    log "  Test Duration: ${TEST_DURATION}s"
    log "  Monitor Script: $MONITOR_SCRIPT"

    # Start test processes
    local test_pids=()
    log "🚀 Spawning test processes (this should trigger rapid spawn detection)..."

    for i in $(seq 1 $MAX_TEST_PROCESSES); do
        log "Spawning test process $i..."
        local pid=$(create_test_process $i 1024)  # 1GB each
        test_pids+=("$pid")

        if [ $i -lt $MAX_TEST_PROCESSES ]; then
            log "Waiting ${SPAWN_INTERVAL}s before next spawn..."
            sleep "$SPAWN_INTERVAL"
        fi
    done

    log "✅ All $MAX_TEST_PROCESSES test processes spawned"
    log "Test PIDs: ${test_pids[*]}"

    # Let processes run and monitor should detect them
    log "⏳ Letting processes run for ${TEST_DURATION}s..."
    log "Monitor should detect rapid spawn and shut them down automatically"

    # Monitor the test
    local start_time=$(date +%s)
    local end_time=$((start_time + TEST_DURATION))

    while [ $(date +%s) -lt $end_time ]; do
        local running_count=0
        for pid in "${test_pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                running_count=$((running_count + 1))
            fi
        done

        log "📊 Test status: $running_count/${#test_pids[@]} processes still running"

        if [ "$running_count" -eq 0 ]; then
            log "🎉 All test processes have been terminated (rapid spawn detection worked!)"
            break
        fi

        sleep 10
    done

    # Final check
    local final_running_count=0
    for pid in "${test_pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            final_running_count=$((final_running_count + 1))
            log "⚠️  Process $pid still running"
        fi
    done

    # Cleanup
    cleanup_test_processes

    # Report results
    if [ "$final_running_count" -eq 0 ]; then
        log "${GREEN}✅ SUCCESS: Rapid spawn detection working correctly${NC}"
        log "All $MAX_TEST_PROCESSES processes were terminated as expected"
        return 0
    else
        log "${RED}❌ FAILURE: Rapid spawn detection not working${NC}"
        log "$final_running_count processes were still running after test"
        return 1
    fi
}

check_monitor_script() {
    if [ ! -f "$MONITOR_SCRIPT" ]; then
        log "${RED}❌ ERROR: Monitor script not found: $MONITOR_SCRIPT${NC}"
        return 1
    fi

    if [ ! -x "$MONITOR_SCRIPT" ]; then
        log "${YELLOW}⚠️  Monitor script not executable, making it executable...${NC}"
        chmod +x "$MONITOR_SCRIPT"
    fi

    log "${GREEN}✅ Monitor script found and accessible${NC}"
    return 0
}

validate_configuration() {
    log "🔍 Validating rapid spawn configuration..."

    # Check if rapid spawn settings are present in monitor script
    if grep -q "RAPID_SPAWN_ENABLED=true" "$MONITOR_SCRIPT"; then
        log "${GREEN}✅ RAPID_SPAWN_ENABLED=true found${NC}"
    else
        log "${RED}❌ RAPID_SPAWN_ENABLED setting not found${NC}"
        return 1
    fi

    if grep -q "RAPID_SPAWN_MAX_NODES=6" "$MONITOR_SCRIPT"; then
        log "${GREEN}✅ RAPID_SPAWN_MAX_NODES=6 found${NC}"
    else
        log "${RED}❌ RAPID_SPAWN_MAX_NODES setting not found${NC}"
        return 1
    fi

    if grep -q "RAPID_SPAWN_TIME_WINDOW=30" "$MONITOR_SCRIPT"; then
        log "${GREEN}✅ RAPID_SPAWN_TIME_WINDOW=30 found${NC}"
    else
        log "${RED}❌ RAPID_SPAWN_TIME_WINDOW setting not found${NC}"
        return 1
    fi

    log "${GREEN}✅ All rapid spawn configuration found${NC}"
    return 0
}

main() {
    log "${BLUE}Starting Rapid Spawn Detection Test Suite${NC}"

    # Validate environment
    if ! check_monitor_script; then
        exit 1
    fi

    if ! validate_configuration; then
        exit 1
    fi

    # Check if Node.js is available
    if ! command -v node >/dev/null 2>&1; then
        log "${RED}❌ ERROR: Node.js not found - required for test processes${NC}"
        exit 1
    fi

    log "${GREEN}✅ Environment validation passed${NC}"

    # Check if monitor is already running
    if pgrep -f "external-memory-monitor" >/dev/null; then
        log "${YELLOW}⚠️  Memory monitor already running - this is good for testing${NC}"
    else
        log "${YELLOW}⚠️  Memory monitor not running - start it before running this test${NC}"
        log "Run: $MONITOR_SCRIPT"
        log "Then run this test again"
        exit 1
    fi

    # Run the actual test
    if run_rapid_spawn_test; then
        log "${GREEN}🎉 All tests passed!${NC}"
        log ""
        log "To verify the logs:"
        log "  tail -f ${CFN_MEMORY_MONITOR_LOG:-$HOME/memory-monitor-external.log}"
        log "  grep 'RAPID SPAWN' ${CFN_MEMORY_KILL_LOG:-$HOME/memory-kills.log}"
        exit 0
    else
        log "${RED}❌ Tests failed!${NC}"
        log ""
        log "Troubleshooting:"
        log "  1. Ensure memory monitor is running: $MONITOR_SCRIPT"
        log "  2. Check monitor logs: tail -f ${CFN_MEMORY_MONITOR_LOG:-$HOME/memory-monitor-external.log}"
        log "  3. Verify configuration settings in the monitor script"
        exit 1
    fi
}

# Cleanup on script exit
trap cleanup_test_processes EXIT

# Run main function
main "$@"