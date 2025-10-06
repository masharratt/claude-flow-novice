#!/bin/bash
# test-extreme-scale.sh - Find the breaking point of CLI coordination
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/message-bus.sh"

TEST_SIZES=(200 300 400 500 750 1000)
MAX_TIME=30

echo "========================================================================"
echo "EXTREME SCALE CLI COORDINATION TEST"
echo "Testing agent counts: ${TEST_SIZES[*]}"
echo "========================================================================"
echo ""

test_count() {
    local count=$1
    echo "[$count agents] Testing..."

    export MESSAGE_BASE_DIR="/dev/shm/cfn-extreme-${count}-$$"
    init_message_bus_system >/dev/null 2>&1
    init_message_bus "coordinator" >/dev/null 2>&1

    for i in $(seq 1 "$count"); do
        init_message_bus "worker-$i" >/dev/null 2>&1
    done

    local start=$(date +%s)
    for i in $(seq 1 "$count"); do
        send_message "coordinator" "worker-$i" "task" "{\"id\": $i}" >/dev/null 2>&1
    done

    local pids=()
    for i in $(seq 1 "$count"); do
        (bash "$SCRIPT_DIR/test-agent-simple.sh" "worker-$i" >/dev/null 2>&1) &
        pids+=($!)
    done

    local start_wait=$(date +%s)
    local all_done=false
    while [[ $(($(date +%s) - start_wait)) -lt $MAX_TIME ]]; do
        local running=0
        for pid in "${pids[@]}"; do
            kill -0 "$pid" 2>/dev/null && ((running++)) || true
        done

        [[ $running -eq 0 ]] && { all_done=true; break; }
        sleep 0.3
    done

    sleep 2

    for pid in "${pids[@]}"; do
        kill -9 "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true

    local end=$(date +%s)
    local duration=$((end - start))
    local responses=$(message_count "coordinator" "inbox")
    local rate=$(echo "scale=1; ($responses * 100) / $count" | bc)

    cleanup_message_bus_system

    if [[ "$all_done" == "true" ]]; then
        echo "[$count agents] ✓ Completed in ${duration}s - Delivery: $responses/$count (${rate}%)"
    else
        echo "[$count agents] ⏱ Timeout at ${MAX_TIME}s - Delivery: $responses/$count (${rate}%)"
    fi

    (( $(echo "$rate >= 85" | bc -l) )) && return 0 || return 1
}

last_pass=""
for count in "${TEST_SIZES[@]}"; do
    if test_count "$count"; then
        last_pass=$count
    else
        echo ""
        echo "Breaking point detected at $count agents (delivery rate <85%)"
        break
    fi
done

echo ""
echo "========================================================================"
echo "RESULT: Effective coordination limit ≈ $last_pass agents"
echo "========================================================================"
