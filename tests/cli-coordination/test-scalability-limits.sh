#!/bin/bash
# test-scalability-limits.sh - Find upper limit of effective CLI coordination
#
# Tests coordination with increasing agent counts: 2, 5, 10, 20, 50, 100, 200
# Measures: delivery success rate, latency, message loss, coordination time

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/message-bus.sh"

# Configuration
TEST_SIZES=(2 5 10 20 50 100 200)
MESSAGES_PER_AGENT=3
MAX_COORDINATION_TIME=30  # seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================================================"
echo "CLI COORDINATION SCALABILITY TEST"
echo "Testing agent counts: ${TEST_SIZES[*]}"
echo "Messages per agent: $MESSAGES_PER_AGENT"
echo "========================================================================"
echo ""

# Results storage
declare -A results_delivery_rate
declare -A results_avg_latency
declare -A results_coord_time
declare -A results_status

test_agent_count() {
    local agent_count=$1
    local test_id="scale-test-${agent_count}-$$"

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Testing ${agent_count} agents...${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Setup
    export MESSAGE_BASE_DIR="/dev/shm/cfn-scale-${agent_count}-$$"
    init_message_bus_system

    # Coordinator
    init_message_bus "coordinator"

    # Initialize all worker agents
    echo "  Initializing $agent_count worker message buses..."
    for i in $(seq 1 "$agent_count"); do
        init_message_bus "worker-$i" >/dev/null 2>&1
    done

    # Send messages from coordinator to all workers
    local start_time=$(date +%s.%N)
    echo "  Coordinator sending $((agent_count * MESSAGES_PER_AGENT)) messages..."

    for i in $(seq 1 "$agent_count"); do
        for msg_num in $(seq 1 "$MESSAGES_PER_AGENT"); do
            send_message "coordinator" "worker-$i" "task" \
                "{\"agent\": $i, \"task_id\": \"task-${i}-${msg_num}\"}" >/dev/null 2>&1
        done
    done

    local send_time=$(date +%s.%N)
    local send_duration=$(echo "$send_time - $start_time" | bc)

    # Spawn workers to process messages
    echo "  Spawning $agent_count worker processes..."
    local worker_pids=()

    for i in $(seq 1 "$agent_count"); do
        (
            cd "$SCRIPT_DIR"
            bash agent-wrapper.sh "worker-$i" "Process tasks" >/dev/null 2>&1
        ) &
        worker_pids+=($!)
    done

    # Wait for workers with timeout
    echo "  Waiting for workers to complete (timeout: ${MAX_COORDINATION_TIME}s)..."
    local wait_start=$(date +%s)
    local all_complete=false

    while [[ $(($(date +%s) - wait_start)) -lt $MAX_COORDINATION_TIME ]]; do
        local complete_count=0

        for pid in "${worker_pids[@]}"; do
            if ! kill -0 "$pid" 2>/dev/null; then
                ((complete_count++))
            fi
        done

        if [[ $complete_count -eq ${#worker_pids[@]} ]]; then
            all_complete=true
            break
        fi

        sleep 0.5
    done

    # Kill any remaining workers
    for pid in "${worker_pids[@]}"; do
        kill -9 "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true

    local end_time=$(date +%s.%N)
    local total_time=$(echo "$end_time - $start_time" | bc)

    # Measure results
    local coordinator_inbox=$(message_count "coordinator" "inbox")
    local expected_responses=$agent_count
    local delivery_rate=$(echo "scale=2; ($coordinator_inbox / $expected_responses) * 100" | bc)

    # Calculate average latency (approximate)
    local avg_latency=$(echo "scale=3; $total_time / $agent_count" | bc)

    # Status determination
    local status="PASS"
    if [[ ! "$all_complete" = true ]]; then
        status="TIMEOUT"
    elif (( $(echo "$delivery_rate < 90" | bc -l) )); then
        status="FAIL"
    fi

    # Store results
    results_delivery_rate[$agent_count]=$delivery_rate
    results_avg_latency[$agent_count]=$avg_latency
    results_coord_time[$agent_count]=$total_time
    results_status[$agent_count]=$status

    # Display results
    echo ""
    echo "  Results for $agent_count agents:"
    echo "    Delivery Rate:     $coordinator_inbox/$expected_responses (${delivery_rate}%)"
    echo "    Coordination Time: ${total_time}s"
    echo "    Avg Latency:       ${avg_latency}s per agent"
    echo "    Send Duration:     ${send_duration}s"

    if [[ "$status" == "PASS" ]]; then
        echo -e "    Status:            ${GREEN}✓ PASS${NC}"
    elif [[ "$status" == "TIMEOUT" ]]; then
        echo -e "    Status:            ${YELLOW}⏱ TIMEOUT${NC}"
    else
        echo -e "    Status:            ${RED}✗ FAIL${NC}"
    fi

    # Cleanup
    cleanup_message_bus_system

    echo ""
}

# Run tests for each agent count
for count in "${TEST_SIZES[@]}"; do
    test_agent_count "$count"
done

# Summary table
echo "========================================================================"
echo "SCALABILITY TEST SUMMARY"
echo "========================================================================"
echo ""
printf "%-12s %-18s %-18s %-18s %-10s\n" \
    "Agent Count" "Delivery Rate" "Coordination Time" "Avg Latency" "Status"
echo "------------------------------------------------------------------------"

for count in "${TEST_SIZES[@]}"; do
    local delivery="${results_delivery_rate[$count]:-N/A}%"
    local coord_time="${results_coord_time[$count]:-N/A}s"
    local latency="${results_avg_latency[$count]:-N/A}s"
    local status="${results_status[$count]:-UNKNOWN}"

    if [[ "$status" == "PASS" ]]; then
        status="${GREEN}✓ PASS${NC}"
    elif [[ "$status" == "TIMEOUT" ]]; then
        status="${YELLOW}⏱ TIMEOUT${NC}"
    else
        status="${RED}✗ FAIL${NC}"
    fi

    printf "%-12s %-18s %-18s %-18s " "$count" "$delivery" "$coord_time" "$latency"
    echo -e "$status"
done

echo ""
echo "========================================================================"

# Determine effective limit
echo "ANALYSIS:"
echo ""

# Find last PASS
last_pass=""
for count in "${TEST_SIZES[@]}"; do
    if [[ "${results_status[$count]}" == "PASS" ]]; then
        last_pass=$count
    fi
done

if [[ -n "$last_pass" ]]; then
    echo -e "  ${GREEN}Effective coordination limit: $last_pass agents${NC}"
    echo "  (Last configuration with >90% delivery rate and no timeout)"
else
    echo -e "  ${RED}No passing configurations found${NC}"
fi

# Performance degradation analysis
echo ""
echo "  Performance characteristics:"
for count in "${TEST_SIZES[@]}"; do
    local coord_time="${results_coord_time[$count]:-0}"
    local delivery="${results_delivery_rate[$count]:-0}"

    if (( $(echo "$coord_time > 10" | bc -l) )); then
        echo "    - $count agents: Coordination time >10s (${coord_time}s)"
    fi

    if (( $(echo "$delivery < 95" | bc -l) )) && (( $(echo "$delivery > 0" | bc -l) )); then
        echo "    - $count agents: Delivery rate degraded (${delivery}%)"
    fi
done

echo ""
echo "RECOMMENDATIONS:"
echo "  - Use agent counts ≤ $last_pass for reliable coordination"
echo "  - Consider hierarchical topology for larger swarms (>50 agents)"
echo "  - Implement agent pooling for >100 agents"
echo ""
