#!/usr/bin/env bash

# Synthetic Load Test for Memory Monitor
# Tests rapid spawn detection and cohort kill mechanisms

set -euo pipefail

# Test configuration
TEST_DIR="/tmp/synthetic-load-test"
MONITOR_LOG="${CFN_MEMORY_MONITOR_LOG:-$HOME/memory-monitor-external.log}"
KILL_LOG="${CFN_MEMORY_KILL_LOG:-$HOME/memory-kills.log}"

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
    pkill -f "synthetic-load" 2>/dev/null || true
    pkill -f "test-memory" 2>/dev/null || true
    sleep 2
}

create_memory_process() {
    local process_id=$1
    local memory_mb=$2
    local duration=$3

    cat > "$TEST_DIR/synthetic-load-$process_id.js" << EOF
console.log('Starting synthetic memory load process $process_id (${memory_mb}MB)');

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

    // Keep process alive and active
    const interval = setInterval(() => {
        // Prevent garbage collection
        if (data.length > 0) {
            data.push(new Buffer.alloc(1024));
            data.shift(); // Remove old chunks to limit growth
        }
    }, 1000);

    // Auto-terminate after duration
    setTimeout(() => {
        clearInterval(interval);
        console.log('Process $process_id terminating after ${duration}s');
        process.exit(0);
    }, ${duration} * 1000);
};

allocateMemory();
EOF

    # Start the process with proper Node.js options
    timeout "$((duration + 10))"s node "$TEST_DIR/synthetic-load-$process_id.js" &
    local pid=$!
    echo $pid
}

test_rapid_spawn_detection() {
    log "${BLUE}=== Testing Rapid Spawn Detection ===${NC}"

    # Test scenario: 6 processes in 30 seconds
    local test_processes=()
    log "🚀 Spawning 6 processes over 25 seconds (should trigger rapid spawn detection)..."

    for i in {1..6}; do
        log "Spawning process $i (2GB memory)..."
        local pid=$(create_memory_process "rapid-$i" 2048 300)
        test_processes+=("$pid")

        if [ $i -lt 6 ]; then
            log "Waiting 5s before next spawn..."
            sleep 5
        fi
    done

    log "✅ All 6 processes spawned. Monitor should detect and terminate them..."
    sleep 30  # Give monitor time to detect and act

    # Check if processes were terminated
    local surviving=0
    for pid in "${test_processes[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            surviving=$((surviving + 1))
            log "⚠️  Process $pid still alive"
        fi
    done

    if [ "$surviving" -eq 0 ]; then
        log "${GREEN}✅ Rapid spawn detection working: All 6 processes terminated${NC}"
    else
        log "${RED}❌ Rapid spawn detection failed: $surviving processes still alive${NC}"
    fi

    # Cleanup
    cleanup_test_processes
}

test_cohort_kill_high_memory() {
    log "${BLUE}=== Testing Cohort Kill (High Memory) ===${NC}"

    # Test scenario: 4 processes with 5GB each = 20GB total
    local test_processes=()
    log "🚀 Spawning 4 processes with 5GB each (should trigger cohort kill)..."

    # Spawn all processes quickly (within same age window)
    for i in {1..4}; do
        log "Spawning process $i (5GB memory)..."
        local pid=$(create_memory_process "cohort-high-$i" 5120 300)
        test_processes+=("$pid")
        sleep 2
    done

    log "✅ All 4 high-memory processes spawned. Monitor should detect cohort (20GB total)..."
    sleep 30  # Give monitor time to detect and act

    # Check if processes were terminated
    local surviving=0
    for pid in "${test_processes[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            surviving=$((surviving + 1))
            log "⚠️  Process $pid still alive"
        fi
    done

    if [ "$surviving" -eq 0 ]; then
        log "${GREEN}✅ Cohort kill working: All 4 high-memory processes terminated${NC}"
    else
        log "${RED}❌ Cohort kill failed: $surviving processes still alive${NC}"
    fi

    # Cleanup
    cleanup_test_processes
}

test_cohort_kill_node_specific() {
    log "${BLUE}=== Testing Node-Specific Cohort Kill ===${NC}"

    # Test scenario: 3 Node processes with 6GB each = 18GB total
    local test_processes=()
    log "🚀 Spawning 3 Node-style processes with 6GB each (should trigger Node cohort kill)..."

    # Spawn all processes quickly (within same age window)
    for i in {1..3}; do
        log "Spawning Node process $i (6GB memory)..."
        # Use different name to simulate Node agent processes
        local pid=$(create_memory_process "node-agent-$i" 6144 300)
        test_processes+=("$pid")
        sleep 2
    done

    log "✅ All 3 Node processes spawned. Monitor should detect Node cohort (18GB total)..."
    sleep 30  # Give monitor time to detect and act

    # Check if processes were terminated
    local surviving=0
    for pid in "${test_processes[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            surviving=$((surviving + 1))
            log "⚠️  Process $pid still alive"
        fi
    done

    if [ "$surviving" -eq 0 ]; then
        log "${GREEN}✅ Node cohort kill working: All 3 Node processes terminated${NC}"
    else
        log "${RED}❌ Node cohort kill failed: $surviving processes still alive${NC}"
    fi

    # Cleanup
    cleanup_test_processes
}

test_multiple_bursts() {
    log "${BLUE}=== Testing Multiple Rapid Bursts ===${NC}"

    # Test scenario: Multiple rapid bursts to test cooldown logic
    for burst in {1..3}; do
        log "🚀 Burst $burst: Spawning 4 processes rapidly..."
        local test_processes=()

        for i in {1..4}; do
            local pid=$(create_memory_process "burst${burst}-$i" 1536 300)
            test_processes+=("$pid")
            sleep 3
        done

        log "✅ Burst $burst complete. Waiting for monitor response..."
        sleep 45  # Longer wait to see cooldown behavior

        # Check survivors
        local surviving=0
        for pid in "${test_processes[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                surviving=$((surviving + 1))
            fi
        done

        log "Burst $burst result: $((4 - surviving))/4 processes terminated"

        if [ "$burst" -lt 3 ]; then
            log "⏳ Waiting 20s before next burst (testing cooldown)..."
            sleep 20
        fi

        cleanup_test_processes
    done
}

analyze_logs() {
    log "${BLUE}=== Analyzing Monitor Logs ===${NC}"

    if [ -f "$MONITOR_LOG" ]; then
        log "Recent monitor activity:"
        tail -20 "$MONITOR_LOG" | grep -E "(RAPID SPAWN|COHORT KILL|Node cohort)"

        log ""
        log "Rapid spawn events:"
        grep -c "RAPID SPAWN DETECTED" "$MONITOR_LOG" 2>/dev/null || log "No rapid spawn events found"

        log ""
        log "Cohort kill events:"
        grep -c "COHORT KILL TRIGGERED" "$MONITOR_LOG" 2>/dev/null || log "No cohort kill events found"
    else
        log "${YELLOW}⚠️  Monitor log not found: $MONITOR_LOG${NC}"
    fi

    if [ -f "$KILL_LOG" ]; then
        log ""
        log "Recent kill actions:"
        tail -10 "$KILL_LOG"
    else
        log "${YELLOW}⚠️  Kill log not found: $KILL_LOG${NC}"
    fi
}

check_prerequisites() {
    log "${BLUE}=== Checking Prerequisites ===${NC}"

    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        log "${RED}❌ ERROR: Node.js not required - required for test processes${NC}"
        return 1
    fi
    log "${GREEN}✅ Node.js found${NC}"

    # Check monitor script
    if [ ! -f "${CFN_MEMORY_MONITOR:-$HOME/external-memory-monitor.sh}" ]; then
        log "${RED}❌ ERROR: Monitor script not found${NC}"
        return 1
    fi
    log "${GREEN}✅ Monitor script found${NC}"

    # Check if monitor is running
    if pgrep -f "external-memory-monitor" >/dev/null; then
        log "${GREEN}✅ Memory monitor is running${NC}"
    else
        log "${YELLOW}⚠️  Memory monitor not running - start it before running tests${NC}"
        log "Run: ${CFN_MEMORY_MONITOR:-$HOME/external-memory-monitor.sh}"
        return 1
    fi

    return 0
}

main() {
    log "${BLUE}Starting Synthetic Load Test Suite${NC}"

    # Setup
    mkdir -p "$TEST_DIR"
    cleanup_test_processes

    # Check prerequisites
    if ! check_prerequisites; then
        exit 1
    fi

    log "${GREEN}✅ Prerequisites passed${NC}"
    log ""

    # Run tests
    test_rapid_spawn_detection
    echo ""
    sleep 10

    test_cohort_kill_high_memory
    echo ""
    sleep 10

    test_cohort_kill_node_specific
    echo ""
    sleep 10

    test_multiple_bursts
    echo ""

    # Analyze results
    analyze_logs

    log "${GREEN}🎉 Synthetic load testing completed${NC}"
    log ""
    log "Check the logs for detailed results:"
    log "  Monitor: $MONITOR_LOG"
    log "  Kills:   $KILL_LOG"
    log ""
    log "Real-time monitoring:"
    log "  tail -f $MONITOR_LOG"
}

# Cleanup on script exit
trap cleanup_test_processes EXIT

# Run main function
main "$@"