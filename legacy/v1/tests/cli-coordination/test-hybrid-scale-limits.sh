#!/bin/bash
# test-hybrid-scale-limits.sh - Find upper limit of hybrid topology
#
# Tests: 7 coordinators with varying workers per team

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/message-bus.sh"

COORDINATORS=7
WORKERS_PER_TEAM_TESTS=(20 30 50 75 100)

echo "========================================================================"
echo "HYBRID TOPOLOGY SCALE LIMITS"
echo "Testing 7 coordinators with varying team sizes: ${WORKERS_PER_TEAM_TESTS[*]}"
echo "========================================================================"
echo ""

test_config() {
    local workers_per_team=$1
    local total_workers=$((COORDINATORS * workers_per_team))
    local total_agents=$((1 + COORDINATORS + total_workers))

    echo "[7 coordinators × $workers_per_team workers = $total_agents agents]"

    export MESSAGE_BASE_DIR="/dev/shm/cfn-hybrid-scale-${workers_per_team}-$$"
    init_message_bus_system >/dev/null 2>&1

    # Initialize all agents
    init_message_bus "master" >/dev/null 2>&1

    for team in $(seq 1 $COORDINATORS); do
        team_letter=$(printf "\\$(printf '%03o' $((64 + team)))")
        init_message_bus "coord-$team_letter" >/dev/null 2>&1
    done

    for team in $(seq 1 $COORDINATORS); do
        team_letter=$(printf "\\$(printf '%03o' $((64 + team)))")
        for worker in $(seq 1 $workers_per_team); do
            init_message_bus "worker-$team_letter-$worker" >/dev/null 2>&1
        done
    done

    # Master → Coordinators
    local start=$(date +%s)
    for team in $(seq 1 $COORDINATORS); do
        team_letter=$(printf "\\$(printf '%03o' $((64 + team)))")
        send_message "master" "coord-$team_letter" "task" "{\"team\": \"$team_letter\"}" >/dev/null 2>&1
    done

    # Coordinators → Workers
    for team in $(seq 1 $COORDINATORS); do
        team_letter=$(printf "\\$(printf '%03o' $((64 + team)))")
        for worker in $(seq 1 $workers_per_team); do
            send_message "coord-$team_letter" "worker-$team_letter-$worker" "work" "{}" >/dev/null 2>&1
        done
    done

    # Spawn all agents
    local pids=()
    for team in $(seq 1 $COORDINATORS); do
        team_letter=$(printf "\\$(printf '%03o' $((64 + team)))")
        (bash "$SCRIPT_DIR/test-agent-simple.sh" "coord-$team_letter" >/dev/null 2>&1) &
        pids+=($!)
    done

    for team in $(seq 1 $COORDINATORS); do
        team_letter=$(printf "\\$(printf '%03o' $((64 + team)))")
        for worker in $(seq 1 $workers_per_team); do
            (bash "$SCRIPT_DIR/test-agent-simple.sh" "worker-$team_letter-$worker" >/dev/null 2>&1) &
            pids+=($!)
        done
    done

    # Wait with timeout
    local max_wait=30
    local start_wait=$(date +%s)
    local all_done=false

    while [[ $(($(date +%s) - start_wait)) -lt $max_wait ]]; do
        local running=0
        for pid in "${pids[@]}"; do
            kill -0 "$pid" 2>/dev/null && ((running++)) || true
        done

        [[ $running -eq 0 ]] && { all_done=true; break; }
        sleep 0.3
    done

    for pid in "${pids[@]}"; do
        kill -9 "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true

    sleep 2

    local end=$(date +%s)
    local duration=$((end - start))

    # Measure results
    local master_responses=$(message_count "master" "inbox")
    local coord_total=0

    for team in $(seq 1 $COORDINATORS); do
        team_letter=$(printf "\\$(printf '%03o' $((64 + team)))")
        local coord_inbox=$(message_count "coord-$team_letter" "inbox")
        ((coord_total += coord_inbox)) || true
    done

    local mesh_rate=$(echo "scale=1; ($master_responses * 100) / $COORDINATORS" | bc)
    local hier_rate=$(echo "scale=1; ($coord_total * 100) / $total_workers" | bc)
    local overall_rate=$(echo "scale=1; (($master_responses + $coord_total) * 100) / ($COORDINATORS + $total_workers)" | bc)

    cleanup_message_bus_system

    echo "  Duration: ${duration}s"
    echo "  Mesh delivery: $master_responses/$COORDINATORS (${mesh_rate}%)"
    echo "  Hierarchical delivery: $coord_total/$total_workers (${hier_rate}%)"
    echo "  Overall: $((master_responses + coord_total))/$((COORDINATORS + total_workers)) (${overall_rate}%)"

    if [[ "$all_done" == "true" ]] && (( $(echo "$overall_rate >= 85" | bc -l) )); then
        echo "  Status: ✓ PASS"
        return 0
    else
        echo "  Status: ✗ FAIL"
        return 1
    fi

    echo ""
}

# Run tests
last_pass=""
for workers in "${WORKERS_PER_TEAM_TESTS[@]}"; do
    if test_config "$workers"; then
        last_pass=$workers
    else
        echo ""
        echo "Breaking point: 7 × $workers workers"
        break
    fi
    echo ""
done

echo "========================================================================"
echo "RESULT: Hybrid topology effective limit"
echo ""
echo "  Proven capacity: 7 coordinators × $last_pass workers = $((7 * last_pass)) workers"
echo "  Total agents: $((1 + 7 + 7 * last_pass))"
echo ""
echo "Topology summary:"
echo "  - Master: 1 (mesh hub)"
echo "  - Coordinators: 7 (mesh peers, hierarchical leaders)"
echo "  - Workers: $((7 * last_pass)) (hierarchical teams)"
echo ""
echo "This proves CLI coordination scales to $((1 + 7 + 7 * last_pass))+ agents!"
echo "========================================================================"
