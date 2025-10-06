#!/bin/bash
# test-scalability-quick.sh - Fast scalability test with progressive agent counts
#
# Tests: 2, 5, 10, 15, 20 agents with timeout detection

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/message-bus.sh"

TEST_SIZES=(2 5 10 20 30 50 75 100 150 200)
MAX_TIME=15  # seconds per test

echo "========================================================================"
echo "QUICK CLI COORDINATION SCALABILITY TEST"
echo "Testing agent counts: ${TEST_SIZES[*]}"
echo "Max coordination time: ${MAX_TIME}s per test"
echo "========================================================================"
echo ""

test_count() {
    local count=$1
    echo "[$count agents] Testing..."

    export MESSAGE_BASE_DIR="/dev/shm/cfn-quick-${count}-$$"
    init_message_bus_system >/dev/null 2>&1

    init_message_bus "coordinator" >/dev/null 2>&1

    # Initialize workers
    for i in $(seq 1 "$count"); do
        init_message_bus "worker-$i" >/dev/null 2>&1
    done

    # Send messages
    local start=$(date +%s)
    for i in $(seq 1 "$count"); do
        send_message "coordinator" "worker-$i" "task" "{\"id\": $i}" >/dev/null 2>&1
    done

    # Spawn workers
    local pids=()
    for i in $(seq 1 "$count"); do
        (bash "$SCRIPT_DIR/test-agent-simple.sh" "worker-$i" >/dev/null 2>&1) &
        pids+=($!)
    done

    # Wait with timeout
    local start_wait=$(date +%s)
    local all_done=false
    while [[ $(($(date +%s) - start_wait)) -lt $MAX_TIME ]]; do
        local running=0
        for pid in "${pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                ((running++))
            fi
        done

        if [[ $running -eq 0 ]]; then
            all_done=true
            break
        fi

        sleep 0.2
    done

    # Give extra time for message delivery
    sleep 1

    # Cleanup
    for pid in "${pids[@]}"; do
        kill -9 "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true

    local end=$(date +%s)
    local duration=$((end - start))

    # Results
    local responses=$(message_count "coordinator" "inbox")
    local rate=$(echo "scale=1; ($responses * 100) / $count" | bc)

    cleanup_message_bus_system

    if [[ "$all_done" == "true" ]]; then
        echo "[$count agents] ✓ Completed in ${duration}s - Delivery: $responses/$count (${rate}%)"
    else
        echo "[$count agents] ⏱ Timeout at ${MAX_TIME}s - Delivery: $responses/$count (${rate}%)"
    fi

    # Return status for evaluation
    if [[ "$all_done" == "true" ]] && (( $(echo "$rate >= 90" | bc -l) )); then
        return 0
    else
        return 1
    fi
}

# Run tests
last_pass=""
for count in "${TEST_SIZES[@]}"; do
    if test_count "$count"; then
        last_pass=$count
    else
        echo ""
        echo "Performance degradation detected at $count agents"
        break
    fi
done

echo ""
echo "========================================================================"
echo "RESULT: Effective limit ≤ $last_pass agents"
echo "========================================================================"
