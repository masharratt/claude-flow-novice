#!/bin/bash
# MVP Performance Benchmark Tool - Sprint 1.4
# Measures agent spawn time, IPC latency, checkpoint operations, and signal handling
# Output: JSON results with mean, median, p95, p99, min, max

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COORDINATOR="${SCRIPT_DIR}/mvp-coordinator.sh"
AGENT_SCRIPT="${SCRIPT_DIR}/mvp-agent.sh"
MESSAGE_BUS="${SCRIPT_DIR}/message-bus.sh"
CFN_SHM_BASE="/dev/shm/cfn-mvp"
RESULTS_FILE="${SCRIPT_DIR}/benchmark-results.json"

# Threshold constants (milliseconds)
THRESHOLD_SPAWN_MS=500
THRESHOLD_IPC_MS=50
THRESHOLD_CHECKPOINT_WRITE_MS=100
THRESHOLD_CHECKPOINT_RESTORE_MS=200
THRESHOLD_MESSAGE_DELIVERY_RATE=95  # percentage

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging (always output to stderr to avoid polluting return values)
log_info() { echo -e "${BLUE}[BENCHMARK]${NC} $*" >&2; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*" >&2; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }
log_error() { echo -e "${RED}[FAIL]${NC} $*" >&2; }

# Statistical functions
calculate_stats() {
    local values=("$@")
    local count=${#values[@]}

    if [[ $count -eq 0 ]]; then
        echo "0 0 0 0 0 0"
        return
    fi

    # Sort values
    IFS=$'\n' sorted=($(sort -n <<<"${values[*]}"))
    unset IFS

    # Calculate metrics
    local min="${sorted[0]}"
    local max="${sorted[$((count-1))]}"

    # Mean
    local sum=0
    for val in "${sorted[@]}"; do
        sum=$(awk "BEGIN {print $sum + $val}")
    done
    local mean=$(awk "BEGIN {print $sum / $count}")

    # Median
    local median_idx=$((count / 2))
    if [[ $((count % 2)) -eq 0 ]]; then
        local median=$(awk "BEGIN {print (${sorted[$((median_idx-1))]} + ${sorted[$median_idx]}) / 2}")
    else
        local median="${sorted[$median_idx]}"
    fi

    # P95
    local p95_idx=$(awk "BEGIN {print int($count * 0.95)}")
    local p95="${sorted[$p95_idx]}"

    # P99
    local p99_idx=$(awk "BEGIN {print int($count * 0.99)}")
    local p99="${sorted[$p99_idx]}"

    echo "$mean $median $p95 $p99 $min $max"
}

# Initialize test environment
init_benchmark() {
    log_info "Initializing benchmark environment..."

    # Cleanup existing structure
    if [[ -d "$CFN_SHM_BASE" ]]; then
        bash "$COORDINATOR" shutdown 2>/dev/null || true
        sleep 0.5
    fi

    # Initialize fresh structure
    bash "$COORDINATOR" init

    log_success "Environment initialized"
}

# Cleanup test environment
cleanup_benchmark() {
    log_info "Cleaning up benchmark environment..."

    # Kill any remaining test agents
    pkill -f "mvp-agent.sh" 2>/dev/null || true

    # Shutdown coordinator
    bash "$COORDINATOR" shutdown 2>/dev/null || true

    log_success "Cleanup complete"
}

# Benchmark 1: Agent spawn time (measure time to PID file creation)
benchmark_spawn_time() {
    log_info "=== BENCHMARK 1: Agent Spawn Time ==="

    local iterations=5
    local spawn_times=()

    for i in $(seq 1 $iterations); do
        local agent_id="spawn-test-$i"

        # Measure spawn time (start to PID file creation)
        local start_ms=$(date +%s%3N)

        bash "$COORDINATOR" spawn "$agent_id" "coder" "test task" >/dev/null 2>&1

        # Wait for PID file entry
        local pid_file="$CFN_SHM_BASE/agent-pids.txt"
        while [[ ! -f "$pid_file" ]] || ! grep -q "^${agent_id}:" "$pid_file"; do
            sleep 0.01
        done

        local end_ms=$(date +%s%3N)
        local duration=$((end_ms - start_ms))
        spawn_times+=("$duration")

        # Cleanup agent
        local agent_pid=$(grep "^${agent_id}:" "$pid_file" | cut -d: -f2)
        if [[ -n "$agent_pid" ]]; then
            kill -9 "$agent_pid" 2>/dev/null || true
        fi

        sleep 0.1
    done

    # Calculate statistics
    local stats=($(calculate_stats "${spawn_times[@]}"))

    log_info "Spawn time stats (ms): mean=${stats[0]}, median=${stats[1]}, p95=${stats[2]}, p99=${stats[3]}, min=${stats[4]}, max=${stats[5]}"

    # Check threshold
    local mean_int=$(printf "%.0f" "${stats[0]}")
    if [[ $mean_int -lt $THRESHOLD_SPAWN_MS ]]; then
        log_success "Spawn time: ${stats[0]}ms (threshold: ${THRESHOLD_SPAWN_MS}ms)"
    else
        log_error "Spawn time: ${stats[0]}ms exceeds threshold ${THRESHOLD_SPAWN_MS}ms"
    fi

    echo "${stats[@]}"
}

# Benchmark 2: IPC latency (message send → receive roundtrip)
benchmark_ipc_latency() {
    log_info "=== BENCHMARK 2: IPC Latency ==="

    local iterations=5
    local latencies=()

    # Initialize message bus
    bash "$MESSAGE_BUS" init-system >/dev/null 2>&1
    bash "$MESSAGE_BUS" init "agent-a" >/dev/null 2>&1
    bash "$MESSAGE_BUS" init "agent-b" >/dev/null 2>&1

    for i in $(seq 1 $iterations); do
        local payload="{\"iteration\": $i, \"data\": \"test\"}"

        # Measure roundtrip: send → receive
        local start_ms=$(date +%s%3N)

        bash "$MESSAGE_BUS" send "agent-a" "agent-b" "test-message" "$payload" >/dev/null 2>&1

        # Wait for message to appear in inbox
        local inbox_dir="$CFN_SHM_BASE/messages/agent-b/inbox"
        while [[ $(find "$inbox_dir" -name "*.json" 2>/dev/null | wc -l) -eq 0 ]]; do
            sleep 0.001
        done

        local end_ms=$(date +%s%3N)
        local duration=$((end_ms - start_ms))
        latencies+=("$duration")

        # Clear inbox for next iteration
        bash "$MESSAGE_BUS" clear "agent-b" >/dev/null 2>&1

        sleep 0.01
    done

    # Cleanup message bus
    bash "$MESSAGE_BUS" cleanup-system >/dev/null 2>&1

    # Calculate statistics
    local stats=($(calculate_stats "${latencies[@]}"))

    log_info "IPC latency stats (ms): mean=${stats[0]}, median=${stats[1]}, p95=${stats[2]}, p99=${stats[3]}, min=${stats[4]}, max=${stats[5]}"

    # Check threshold
    local mean_int=$(printf "%.0f" "${stats[0]}")
    if [[ $mean_int -lt $THRESHOLD_IPC_MS ]]; then
        log_success "IPC latency: ${stats[0]}ms (threshold: ${THRESHOLD_IPC_MS}ms)"
    else
        log_error "IPC latency: ${stats[0]}ms exceeds threshold ${THRESHOLD_IPC_MS}ms"
    fi

    echo "${stats[@]}"
}

# Benchmark 3: Checkpoint write time (measure flock → file write → sync)
benchmark_checkpoint_write() {
    log_info "=== BENCHMARK 3: Checkpoint Write Time ==="

    local iterations=5
    local write_times=()

    # Spawn test agent
    bash "$COORDINATOR" spawn "checkpoint-test" "coder" "test task" >/dev/null 2>&1
    sleep 0.5

    for i in $(seq 1 $iterations); do
        # Measure checkpoint write time
        local start_ms=$(date +%s%3N)

        bash "$COORDINATOR" checkpoint "checkpoint-test" >/dev/null 2>&1

        # Wait for checkpoint file to appear
        local checkpoint_dir="$CFN_SHM_BASE/checkpoints/checkpoint-test"
        local checkpoint_count=0
        while [[ $checkpoint_count -eq 0 ]]; do
            checkpoint_count=$(find "$checkpoint_dir" -name "checkpoint-*.json" 2>/dev/null | wc -l)
            sleep 0.01
        done

        local end_ms=$(date +%s%3N)
        local duration=$((end_ms - start_ms))
        write_times+=("$duration")

        # Clear checkpoint for next iteration
        rm -f "$checkpoint_dir"/checkpoint-*.json

        sleep 0.1
    done

    # Cleanup agent
    local agent_pid=$(grep "^checkpoint-test:" "$CFN_SHM_BASE/agent-pids.txt" 2>/dev/null | cut -d: -f2)
    if [[ -n "$agent_pid" ]]; then
        kill -9 "$agent_pid" 2>/dev/null || true
    fi

    # Calculate statistics
    local stats=($(calculate_stats "${write_times[@]}"))

    log_info "Checkpoint write stats (ms): mean=${stats[0]}, median=${stats[1]}, p95=${stats[2]}, p99=${stats[3]}, min=${stats[4]}, max=${stats[5]}"

    # Check threshold
    local mean_int=$(printf "%.0f" "${stats[0]}")
    if [[ $mean_int -lt $THRESHOLD_CHECKPOINT_WRITE_MS ]]; then
        log_success "Checkpoint write: ${stats[0]}ms (threshold: ${THRESHOLD_CHECKPOINT_WRITE_MS}ms)"
    else
        log_error "Checkpoint write: ${stats[0]}ms exceeds threshold ${THRESHOLD_CHECKPOINT_WRITE_MS}ms"
    fi

    echo "${stats[@]}"
}

# Benchmark 4: Checkpoint restore time (read → validation → state application)
benchmark_checkpoint_restore() {
    log_info "=== BENCHMARK 4: Checkpoint Restore Time ==="

    local iterations=5
    local restore_times=()

    # Spawn test agent and create checkpoint
    bash "$COORDINATOR" spawn "restore-test" "coder" "test task" >/dev/null 2>&1
    sleep 0.5
    bash "$COORDINATOR" checkpoint "restore-test" >/dev/null 2>&1
    sleep 0.3

    for i in $(seq 1 $iterations); do
        # Measure restore time
        local start_ms=$(date +%s%3N)

        bash "$COORDINATOR" restore "restore-test" >/dev/null 2>&1

        local end_ms=$(date +%s%3N)
        local duration=$((end_ms - start_ms))
        restore_times+=("$duration")

        sleep 0.1
    done

    # Cleanup agent
    local agent_pid=$(grep "^restore-test:" "$CFN_SHM_BASE/agent-pids.txt" 2>/dev/null | cut -d: -f2)
    if [[ -n "$agent_pid" ]]; then
        kill -9 "$agent_pid" 2>/dev/null || true
    fi

    # Calculate statistics
    local stats=($(calculate_stats "${restore_times[@]}"))

    log_info "Checkpoint restore stats (ms): mean=${stats[0]}, median=${stats[1]}, p95=${stats[2]}, p99=${stats[3]}, min=${stats[4]}, max=${stats[5]}"

    # Check threshold
    local mean_int=$(printf "%.0f" "${stats[0]}")
    if [[ $mean_int -lt $THRESHOLD_CHECKPOINT_RESTORE_MS ]]; then
        log_success "Checkpoint restore: ${stats[0]}ms (threshold: ${THRESHOLD_CHECKPOINT_RESTORE_MS}ms)"
    else
        log_error "Checkpoint restore: ${stats[0]}ms exceeds threshold ${THRESHOLD_CHECKPOINT_RESTORE_MS}ms"
    fi

    echo "${stats[@]}"
}

# Benchmark 5: Signal handling latency (SIGSTOP send → status change)
benchmark_signal_latency() {
    log_info "=== BENCHMARK 5: Signal Handling Latency ==="

    local iterations=5
    local signal_times=()

    for i in $(seq 1 $iterations); do
        local agent_id="signal-test-$i"

        # Spawn agent
        bash "$COORDINATOR" spawn "$agent_id" "coder" "test task" >/dev/null 2>&1
        sleep 0.5

        # Get agent PID
        local agent_pid=$(grep "^${agent_id}:" "$CFN_SHM_BASE/agent-pids.txt" 2>/dev/null | cut -d: -f2)

        if [[ -z "$agent_pid" ]]; then
            log_warn "Failed to get PID for $agent_id"
            continue
        fi

        # Measure signal handling time (SIGSTOP → state change to 'T')
        local start_ms=$(date +%s%3N)

        bash "$COORDINATOR" pause "$agent_id" >/dev/null 2>&1

        # Wait for process state to change to 'T' (stopped)
        while true; do
            local state=$(ps -o state= -p "$agent_pid" 2>/dev/null | tr -d ' ')
            if [[ "$state" == "T" ]]; then
                break
            fi
            sleep 0.001
        done

        local end_ms=$(date +%s%3N)
        local duration=$((end_ms - start_ms))
        signal_times+=("$duration")

        # Cleanup agent
        kill -9 "$agent_pid" 2>/dev/null || true

        sleep 0.1
    done

    # Calculate statistics
    local stats=($(calculate_stats "${signal_times[@]}"))

    log_info "Signal latency stats (ms): mean=${stats[0]}, median=${stats[1]}, p95=${stats[2]}, p99=${stats[3]}, min=${stats[4]}, max=${stats[5]}"

    # No threshold for signal latency (informational)
    log_success "Signal handling: ${stats[0]}ms average"

    echo "${stats[@]}"
}

# Benchmark Scenario 1: Single agent lifecycle
scenario_single_agent() {
    log_info "=== SCENARIO 1: Single Agent Lifecycle ==="

    local agent_id="lifecycle-test"
    local total_start=$(date +%s%3N)

    # Spawn
    local spawn_start=$(date +%s%3N)
    bash "$COORDINATOR" spawn "$agent_id" "coder" "test task" >/dev/null 2>&1
    sleep 0.5
    local spawn_time=$(($(date +%s%3N) - spawn_start))

    # Checkpoint
    local checkpoint_start=$(date +%s%3N)
    bash "$COORDINATOR" checkpoint "$agent_id" >/dev/null 2>&1
    sleep 0.3
    local checkpoint_time=$(($(date +%s%3N) - checkpoint_start))

    # Shutdown
    local shutdown_start=$(date +%s%3N)
    local agent_pid=$(grep "^${agent_id}:" "$CFN_SHM_BASE/agent-pids.txt" 2>/dev/null | cut -d: -f2)
    kill -9 "$agent_pid" 2>/dev/null || true
    local shutdown_time=$(($(date +%s%3N) - shutdown_start))

    local total_time=$(($(date +%s%3N) - total_start))

    log_info "Single agent lifecycle: spawn=${spawn_time}ms, checkpoint=${checkpoint_time}ms, shutdown=${shutdown_time}ms, total=${total_time}ms"
    log_success "Scenario 1 complete"

    echo "$spawn_time $checkpoint_time $shutdown_time $total_time"
}

# Benchmark Scenario 2: 2-agent messaging (10 messages roundtrip)
scenario_two_agent_messaging() {
    log_info "=== SCENARIO 2: 2-Agent Messaging (10 messages) ==="

    local message_count=10
    local total_start=$(date +%s%3N)

    # Initialize message bus
    bash "$MESSAGE_BUS" init-system >/dev/null 2>&1
    bash "$MESSAGE_BUS" init "agent-x" >/dev/null 2>&1
    bash "$MESSAGE_BUS" init "agent-y" >/dev/null 2>&1

    # Send messages
    for i in $(seq 1 $message_count); do
        local payload="{\"msg\": $i}"
        bash "$MESSAGE_BUS" send "agent-x" "agent-y" "test" "$payload" >/dev/null 2>&1
    done

    # Verify delivery
    local delivered=$(bash "$MESSAGE_BUS" count "agent-y" "inbox" 2>/dev/null)

    local total_time=$(($(date +%s%3N) - total_start))
    local avg_time=$(awk "BEGIN {print $total_time / $message_count}")

    # Cleanup
    bash "$MESSAGE_BUS" cleanup-system >/dev/null 2>&1

    log_info "2-agent messaging: ${delivered}/${message_count} delivered, avg=${avg_time}ms/msg, total=${total_time}ms"

    if [[ $delivered -eq $message_count ]]; then
        log_success "Scenario 2 complete: 100% delivery"
    else
        log_error "Scenario 2: ${delivered}/${message_count} delivered"
    fi

    echo "$message_count $delivered $avg_time $total_time"
}

# Benchmark Scenario 3: Concurrent operations (3 agents spawned simultaneously)
scenario_concurrent_spawn() {
    log_info "=== SCENARIO 3: Concurrent Spawn (3 agents) ==="

    local total_start=$(date +%s%3N)

    # Spawn 3 agents concurrently
    bash "$COORDINATOR" spawn "concurrent-1" "coder" "task 1" >/dev/null 2>&1 &
    bash "$COORDINATOR" spawn "concurrent-2" "tester" "task 2" >/dev/null 2>&1 &
    bash "$COORDINATOR" spawn "concurrent-3" "reviewer" "task 3" >/dev/null 2>&1 &

    # Wait for all spawns to complete
    wait

    # Verify all agents spawned
    sleep 0.5
    local spawned_count=$(grep -c "^concurrent-" "$CFN_SHM_BASE/agent-pids.txt" 2>/dev/null || echo 0)

    local total_time=$(($(date +%s%3N) - total_start))

    log_info "Concurrent spawn: ${spawned_count}/3 agents, total=${total_time}ms"

    # Cleanup agents
    for id in concurrent-1 concurrent-2 concurrent-3; do
        local pid=$(grep "^${id}:" "$CFN_SHM_BASE/agent-pids.txt" 2>/dev/null | cut -d: -f2)
        if [[ -n "$pid" ]]; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done

    if [[ $spawned_count -eq 3 ]]; then
        log_success "Scenario 3 complete: 3/3 agents spawned"
    else
        log_error "Scenario 3: only ${spawned_count}/3 agents spawned"
    fi

    echo "3 $spawned_count $total_time"
}

# Benchmark Scenario 4: Stress test (50 messages burst)
scenario_stress_test() {
    log_info "=== SCENARIO 4: Stress Test (50 messages burst) ==="

    local message_count=50
    local total_start=$(date +%s%3N)

    # Initialize message bus
    bash "$MESSAGE_BUS" init-system >/dev/null 2>&1
    bash "$MESSAGE_BUS" init "stress-sender" >/dev/null 2>&1
    bash "$MESSAGE_BUS" init "stress-receiver" >/dev/null 2>&1

    # Send burst of messages
    for i in $(seq 1 $message_count); do
        local payload="{\"burst\": $i}"
        bash "$MESSAGE_BUS" send "stress-sender" "stress-receiver" "burst" "$payload" >/dev/null 2>&1
    done

    # Wait briefly for delivery
    sleep 0.5

    # Verify delivery
    local delivered=$(bash "$MESSAGE_BUS" count "stress-receiver" "inbox" 2>/dev/null)
    local delivery_rate=$(awk "BEGIN {print ($delivered / $message_count) * 100}")

    local total_time=$(($(date +%s%3N) - total_start))

    # Cleanup
    bash "$MESSAGE_BUS" cleanup-system >/dev/null 2>&1

    log_info "Stress test: ${delivered}/${message_count} delivered (${delivery_rate}%), total=${total_time}ms"

    local rate_int=$(printf "%.0f" "$delivery_rate")
    if [[ $rate_int -ge $THRESHOLD_MESSAGE_DELIVERY_RATE ]]; then
        log_success "Scenario 4 complete: ${delivery_rate}% delivery rate (threshold: ${THRESHOLD_MESSAGE_DELIVERY_RATE}%)"
    else
        log_error "Scenario 4: ${delivery_rate}% delivery rate below threshold ${THRESHOLD_MESSAGE_DELIVERY_RATE}%"
    fi

    echo "$message_count $delivered $delivery_rate $total_time"
}

# Generate JSON output
generate_json_output() {
    local spawn_stats=($1)
    local ipc_stats=($2)
    local checkpoint_write_stats=($3)
    local checkpoint_restore_stats=($4)
    local signal_stats=($5)
    local scenario1_stats=($6)
    local scenario2_stats=($7)
    local scenario3_stats=($8)
    local scenario4_stats=($9)

    cat > "$RESULTS_FILE" <<EOF
{
  "benchmark_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "thresholds": {
    "spawn_time_ms": $THRESHOLD_SPAWN_MS,
    "ipc_latency_ms": $THRESHOLD_IPC_MS,
    "checkpoint_write_ms": $THRESHOLD_CHECKPOINT_WRITE_MS,
    "checkpoint_restore_ms": $THRESHOLD_CHECKPOINT_RESTORE_MS,
    "message_delivery_rate_pct": $THRESHOLD_MESSAGE_DELIVERY_RATE
  },
  "metrics": {
    "spawn_time_ms": {
      "mean": ${spawn_stats[0]},
      "median": ${spawn_stats[1]},
      "p95": ${spawn_stats[2]},
      "p99": ${spawn_stats[3]},
      "min": ${spawn_stats[4]},
      "max": ${spawn_stats[5]},
      "pass": $(awk "BEGIN {print (${spawn_stats[0]} < $THRESHOLD_SPAWN_MS) ? \"true\" : \"false\"}")
    },
    "ipc_latency_ms": {
      "mean": ${ipc_stats[0]},
      "median": ${ipc_stats[1]},
      "p95": ${ipc_stats[2]},
      "p99": ${ipc_stats[3]},
      "min": ${ipc_stats[4]},
      "max": ${ipc_stats[5]},
      "pass": $(awk "BEGIN {print (${ipc_stats[0]} < $THRESHOLD_IPC_MS) ? \"true\" : \"false\"}")
    },
    "checkpoint_write_ms": {
      "mean": ${checkpoint_write_stats[0]},
      "median": ${checkpoint_write_stats[1]},
      "p95": ${checkpoint_write_stats[2]},
      "p99": ${checkpoint_write_stats[3]},
      "min": ${checkpoint_write_stats[4]},
      "max": ${checkpoint_write_stats[5]},
      "pass": $(awk "BEGIN {print (${checkpoint_write_stats[0]} < $THRESHOLD_CHECKPOINT_WRITE_MS) ? \"true\" : \"false\"}")
    },
    "checkpoint_restore_ms": {
      "mean": ${checkpoint_restore_stats[0]},
      "median": ${checkpoint_restore_stats[1]},
      "p95": ${checkpoint_restore_stats[2]},
      "p99": ${checkpoint_restore_stats[3]},
      "min": ${checkpoint_restore_stats[4]},
      "max": ${checkpoint_restore_stats[5]},
      "pass": $(awk "BEGIN {print (${checkpoint_restore_stats[0]} < $THRESHOLD_CHECKPOINT_RESTORE_MS) ? \"true\" : \"false\"}")
    },
    "signal_handling_ms": {
      "mean": ${signal_stats[0]},
      "median": ${signal_stats[1]},
      "p95": ${signal_stats[2]},
      "p99": ${signal_stats[3]},
      "min": ${signal_stats[4]},
      "max": ${signal_stats[5]},
      "pass": true
    }
  },
  "scenarios": {
    "single_agent_lifecycle": {
      "spawn_ms": ${scenario1_stats[0]},
      "checkpoint_ms": ${scenario1_stats[1]},
      "shutdown_ms": ${scenario1_stats[2]},
      "total_ms": ${scenario1_stats[3]}
    },
    "two_agent_messaging": {
      "total_messages": ${scenario2_stats[0]},
      "delivered_messages": ${scenario2_stats[1]},
      "avg_latency_ms": ${scenario2_stats[2]},
      "total_time_ms": ${scenario2_stats[3]},
      "delivery_rate_pct": $(awk "BEGIN {print (${scenario2_stats[1]} / ${scenario2_stats[0]}) * 100}")
    },
    "concurrent_spawn": {
      "target_agents": ${scenario3_stats[0]},
      "spawned_agents": ${scenario3_stats[1]},
      "total_time_ms": ${scenario3_stats[2]}
    },
    "stress_test": {
      "total_messages": ${scenario4_stats[0]},
      "delivered_messages": ${scenario4_stats[1]},
      "delivery_rate_pct": ${scenario4_stats[2]},
      "total_time_ms": ${scenario4_stats[3]},
      "pass": $(awk "BEGIN {print (${scenario4_stats[2]} >= $THRESHOLD_MESSAGE_DELIVERY_RATE) ? \"true\" : \"false\"}")
    }
  },
  "overall_pass": $(awk "BEGIN {
    spawn_pass = (${spawn_stats[0]} < $THRESHOLD_SPAWN_MS) ? 1 : 0;
    ipc_pass = (${ipc_stats[0]} < $THRESHOLD_IPC_MS) ? 1 : 0;
    ckpt_write_pass = (${checkpoint_write_stats[0]} < $THRESHOLD_CHECKPOINT_WRITE_MS) ? 1 : 0;
    ckpt_restore_pass = (${checkpoint_restore_stats[0]} < $THRESHOLD_CHECKPOINT_RESTORE_MS) ? 1 : 0;
    stress_pass = (${scenario4_stats[2]} >= $THRESHOLD_MESSAGE_DELIVERY_RATE) ? 1 : 0;

    total_pass = spawn_pass + ipc_pass + ckpt_write_pass + ckpt_restore_pass + stress_pass;
    print (total_pass == 5) ? \"true\" : \"false\";
  }")
}
EOF

    log_success "Results saved to: $RESULTS_FILE"
}

# Main benchmark execution
main() {
    log_info "Starting CLI Coordination MVP Performance Benchmark"
    echo ""

    # Initialize environment
    init_benchmark
    echo ""

    # Run benchmarks
    local spawn_stats=($(benchmark_spawn_time))
    echo ""

    local ipc_stats=($(benchmark_ipc_latency))
    echo ""

    local checkpoint_write_stats=($(benchmark_checkpoint_write))
    echo ""

    local checkpoint_restore_stats=($(benchmark_checkpoint_restore))
    echo ""

    local signal_stats=($(benchmark_signal_latency))
    echo ""

    # Run scenarios
    local scenario1_stats=($(scenario_single_agent))
    echo ""

    local scenario2_stats=($(scenario_two_agent_messaging))
    echo ""

    local scenario3_stats=($(scenario_concurrent_spawn))
    echo ""

    local scenario4_stats=($(scenario_stress_test))
    echo ""

    # Generate JSON output
    generate_json_output \
        "${spawn_stats[*]}" \
        "${ipc_stats[*]}" \
        "${checkpoint_write_stats[*]}" \
        "${checkpoint_restore_stats[*]}" \
        "${signal_stats[*]}" \
        "${scenario1_stats[*]}" \
        "${scenario2_stats[*]}" \
        "${scenario3_stats[*]}" \
        "${scenario4_stats[*]}"

    echo ""

    # Cleanup
    cleanup_benchmark

    echo ""
    log_success "Benchmark complete. Results: $RESULTS_FILE"

    # Display summary
    echo ""
    log_info "=== BENCHMARK SUMMARY ==="
    cat "$RESULTS_FILE" | grep -E '"(mean|pass|delivery_rate_pct)"' | head -20
}

# Run benchmark
main "$@"
