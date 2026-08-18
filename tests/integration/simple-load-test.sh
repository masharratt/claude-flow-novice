#!/usr/bin/env bash

# Simple Load Test for Memory Monitor
# Tests rapid spawn detection and cohort kill mechanisms

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Test configuration
TEST_DIR="/tmp/simple-load-test"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

cleanup_test_processes() {
    log "Cleaning up test processes..."
    pkill -f "simple-load" 2>/dev/null || true
    sleep 2
}

create_memory_process() {
    local process_id=$1
    local memory_mb=$2

    cat > "$TEST_DIR/simple-load-$process_id.js" << EOF
console.log('Starting simple memory load process $process_id (${memory_mb}MB)');

const data = [];
const targetMemory = ${memory_mb} * 1024 * 1024; // Convert MB to bytes
const chunkSize = 1024 * 1024; // 1MB chunks

let allocated = 0;

const allocateMemory = () => {
    while (allocated < targetMemory) {
        try {
            data.push(new Buffer.alloc(chunkSize));
            allocated += chunkSize;
        } catch (e) {
            console.error('Memory allocation failed:', e.message);
            break;
        }
    }
    console.log('Process $process_id allocated ${(allocated/1024/1024).toFixed(0)}MB');

    // Keep process alive
    const interval = setInterval(() => {
        if (data.length > 0) {
            data.push(new Buffer.alloc(1024));
            if (data.length > 10000) {
                data.shift(); // Limit growth
            }
        }
    }, 1000);

    // Keep running for test duration
    setTimeout(() => {
        console.log('Process $processid completed');
    }, 300000); // 5 minutes
};

allocateMemory();
EOF

    # Start the process
    timeout 300s node "$TEST_DIR/simple-load-$process_id.js" &
    echo $!
}

test_rapid_spawn() {
    log "=== Testing Rapid Spawn Detection ==="

    mkdir -p "$TEST_DIR"
    cleanup_test_processes

    log "Spawning 6 processes over 25 seconds (should trigger rapid spawn detection)..."

    local test_processes=()
    for i in {1..6}; do
        log "Spawning process $i (2GB memory)..."
        local pid=$(create_memory_process "rapid-$i" 2048)
        test_processes+=("$pid")

        if [ $i -lt 6 ]; then
            log "Waiting 5s before next spawn..."
            sleep 5
        fi
    done

    log "All 6 processes spawned. Monitor should detect and terminate them..."
    sleep 30

    # Check survivors
    local surviving=0
    for pid in "${test_processes[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            surviving=$((surviving + 1))
            log "Process $pid still alive"
        fi
    done

    if [ "$surviving" -eq 0 ]; then
        log "SUCCESS: Rapid spawn detection working - all 6 processes terminated"
    else
        log "FAILED: Rapid spawn detection not working - $surviving processes still alive"
    fi

    cleanup_test_processes
}

test_cohort_kill() {
    log "=== Testing Cohort Kill (High Memory) ==="

    log "Spawning 4 processes with 5GB each (should trigger cohort kill)..."

    local test_processes=()
    for i in {1..4}; do
        log "Spawning process $i (5GB memory)..."
        local pid=$(create_memory_process "cohort-$i" 5120)
        test_processes+=("$pid")
        sleep 2
    done

    log "All 4 high-memory processes spawned. Monitor should detect cohort (20GB total)..."
    sleep 30

    # Check survivors
    local surviving=0
    for pid in "${test_processes[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            surviving=$((surviving + 1))
            log "Process $pid still alive"
        fi
    done

    if [ "$surviving" -eq 0 ]; then
        log "SUCCESS: Cohort kill working - all 4 high-memory processes terminated"
    else
        log "FAILED: Cohort kill not working - $surviving processes still alive"
    fi

    cleanup_test_processes
}

check_prerequisites() {
    log "=== Checking Prerequisites ==="

    if ! command -v node >/dev/null 2>&1; then
        log "ERROR: Node.js not found"
        return 1
    fi
    log "Node.js found"

    if [ ! -f "${CFN_MEMORY_MONITOR:-$HOME/external-memory-monitor.sh}" ]; then
        log "ERROR: Monitor script not found"
        return 1
    fi
    log "Monitor script found"

    if pgrep -f "external-memory-monitor" >/dev/null; then
        log "Memory monitor is running"
    else
        log "ERROR: Memory monitor not running - start it first"
        return 1
    fi

    return 0
}

analyze_results() {
    log "=== Analyzing Monitor Logs ==="

    local monitor_log="${CFN_MEMORY_MONITOR_LOG:-$HOME/memory-monitor-external.log}"
    local kill_log="${CFN_MEMORY_KILL_LOG:-$HOME/memory-kills.log}"

    if [ -f "$monitor_log" ]; then
        log "Recent monitor activity:"
        tail -20 "$monitor_log" | grep -E "(RAPID SPAWN|COHORT KILL|Node cohort)" || log "No rapid spawn/cohort events found"
    else
        log "Monitor log not found: $monitor_log"
    fi

    if [ -f "$kill_log" ]; then
        log "Recent kill actions:"
        tail -10 "$kill_log"
    else
        log "Kill log not found: $kill_log"
    fi
}

main() {
    log "Starting Simple Load Test Suite"

    if ! check_prerequisites; then
        exit 1
    fi

    log "Prerequisites passed"

    test_rapid_spawn
    echo ""
    sleep 10

    test_cohort_kill
    echo ""

    analyze_results

    log "Simple load testing completed"
    log "Check logs for detailed results:"
    log "  Monitor: ${CFN_MEMORY_MONITOR_LOG:-$HOME/memory-monitor-external.log}"
    log "  Kills:   ${CFN_MEMORY_KILL_LOG:-$HOME/memory-kills.log}"
}

# Cleanup on script exit
trap cleanup_test_processes EXIT

# Run main function
main "$@"